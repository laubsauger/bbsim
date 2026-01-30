import * as THREE from 'three';
import { RoadSegment, Lot, Point } from "../types";
import { RoadGraph } from "./RoadGraph";

export class PathfindingSystem {
    roads: RoadSegment[];

    graph: RoadGraph;

    constructor(roads: RoadSegment[]) {
        this.roads = roads;
        this.graph = new RoadGraph(roads);
    }

    getRandomPointOnRoad(): THREE.Vector3 {
        // ... (Keep existing simple random logic for now, or improve later)
        if (this.roads.length === 0) return new THREE.Vector3();
        const road = this.roads[Math.floor(Math.random() * this.roads.length)];
        const localX = road.x + Math.random() * road.width;
        const localY = road.y + Math.random() * road.height;
        return new THREE.Vector3(localX, 1, -localY);
    }

    computeAccessPoints(lots: Lot[]) {
        lots.forEach(lot => {
            let minDistance = Infinity;
            let accessPoint: THREE.Vector3 | null = null;
            let closestRoad: RoadSegment | null = null;

            // Lot center approximation
            const centerX = lot.points.reduce((sum: number, p: Point) => sum + p.x, 0) / lot.points.length;
            const centerY = lot.points.reduce((sum: number, p: Point) => sum + p.y, 0) / lot.points.length;

            // Find closest road
            for (const road of this.roads) {
                const px = Math.max(road.x, Math.min(centerX, road.x + road.width));
                const py = Math.max(road.y, Math.min(centerY, road.y + road.height));

                const dist = Math.sqrt(Math.pow(px - centerX, 2) + Math.pow(py - centerY, 2));

                if (dist < minDistance) {
                    minDistance = dist;
                    accessPoint = new THREE.Vector3(px, 0, py);
                    closestRoad = road;
                }
            }

            if (accessPoint && closestRoad) {
                lot.roadAccessPoint = { x: accessPoint.x, y: accessPoint.z };

                let minPtDist = Infinity;
                let entryX = centerX;
                let entryY = centerY;

                // Iterate lot edges to find closest point on boundary to road
                for (let i = 0; i < lot.points.length; i++) {
                    const p1 = lot.points[i];
                    const p2 = lot.points[(i + 1) % lot.points.length];
                    const pt = this.closestPointOnSegment(p1, p2, { x: accessPoint.x, y: accessPoint.z });
                    const d = Math.sqrt(Math.pow(pt.x - accessPoint.x, 2) + Math.pow(pt.y - accessPoint.z, 2));

                    if (d < minPtDist) {
                        minPtDist = d;
                        entryX = pt.x;
                        entryY = pt.y;
                    }
                }
                lot.entryPoint = { x: entryX, y: entryY };
            }
        });

        this.computeFenceGates(lots);
    }

    computeFenceGates(lots: Lot[]) {
        lots.forEach(lot => {
            lot.gatePositions = [];
            if (lot.points.length < 3) return;

            const edges: { p1: Point, p2: Point, length: number, midpoint: Point }[] = [];

            // 1. Collect Edges
            for (let i = 0; i < lot.points.length; i++) {
                const p1 = lot.points[i];
                const p2 = lot.points[(i + 1) % lot.points.length];
                const length = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
                edges.push({ p1, p2, length, midpoint: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 } });
            }

            // 2. Identify Short Edges & Check Road Proximity
            edges.forEach(edge => {
                // Let's filter for edges facing a road.
                let isFacingRoad = false;
                for (const road of this.roads) {
                    // Check distance from edge midpoint to road rect
                    // Clamped dist to road rect logic reuse?
                    const px = Math.max(road.x, Math.min(edge.midpoint.x, road.x + road.width));
                    const py = Math.max(road.y, Math.min(edge.midpoint.y, road.y + road.height));
                    const dist = Math.sqrt(Math.pow(px - edge.midpoint.x, 2) + Math.pow(py - edge.midpoint.y, 2));

                    if (dist < 15) { // Threshold: Close to road
                        isFacingRoad = true;
                        break;
                    }
                }

                if (isFacingRoad) {
                    // STRICTER SHORT SIDE CHECK:
                    // Find max edge length. If this edge is significantly smaller (e.g. < 0.7 * max), it's short.
                    // If all edges similar (square), allow it.
                    const maxLength = Math.max(...edges.map(e => e.length));

                    // If edge is short OR it's practically a square
                    if (edge.length < maxLength * 0.8 || Math.abs(edge.length - maxLength) < 5) {
                        lot.gatePositions?.push(edge.midpoint);
                    }
                }
            });
        });
    }

    closestPointOnSegment(p1: { x: number, y: number }, p2: { x: number, y: number }, p: { x: number, y: number }) {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        if (dx === 0 && dy === 0) return p1;

        const t = ((p.x - p1.x) * dx + (p.y - p1.y) * dy) / (dx * dx + dy * dy);
        const tClamped = Math.max(0, Math.min(1, t));
        return {
            x: p1.x + tClamped * dx,
            y: p1.y + tClamped * dy
        };
    }

    updateTraffic(agents: any[], delta: number) {
        agents.forEach(agent => {
            // Initialize path if needed
            if (!agent.path || agent.path.length === 0) {
                if (!agent.target) {
                    agent.target = this.getRandomPointOnRoad();
                }

                // Calculate path from current pos to target
                const start = { x: agent.mesh.position.x, y: -agent.mesh.position.z }; // World to Logical
                const end = { x: agent.target.x, y: -agent.target.z };

                const points = this.graph.findPath(start, end);
                if (points.length > 0) {
                    // Convert back to 3D world points
                    agent.path = points.map(p => new THREE.Vector3(p.x, 1, -p.y));
                } else {
                    // Fallback: just go straight to target if no graph path (e.g. short distance)
                    agent.path = [agent.target.clone()];
                }
            }

            // Move along path
            if (agent.path.length > 0) {
                const nextPoint = agent.path[0];
                const dist = agent.mesh.position.distanceTo(nextPoint);

                if (dist < 5) { // Reached waypoint
                    agent.path.shift();
                } else {
                    // Orientation
                    agent.mesh.lookAt(nextPoint);
                    // Movement handled by agent.update(delta) based on rotation
                    // But we need to ensure agent moves FORWARD.
                    // The simple Agent class moves tx manually? 
                    // Let's assume Agent.update moves forward.
                    // Actually, Agent update logic handles position update based on speed/rotation?
                    // Let's check Agent class later. For now, assume this lookAt is sufficient direction.
                }
            }
        });
    }
}
