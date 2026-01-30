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
        if (this.roads.length === 0) return new THREE.Vector3();
        const road = this.roads[Math.floor(Math.random() * this.roads.length)];
        const localX = road.x + Math.random() * road.width;
        const localY = road.y + Math.random() * road.height;
        // Coordinate transform: SVG (x, y) → 3D (x, height, y)
        return new THREE.Vector3(localX, 1, localY);
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

    private debugLogCount = 0;

    // Check if a point is on any road
    isOnRoad(x: number, y: number): boolean {
        const padding = 5; // Small tolerance
        for (const road of this.roads) {
            if (x >= road.x - padding && x <= road.x + road.width + padding &&
                y >= road.y - padding && y <= road.y + road.height + padding) {
                return true;
            }
        }
        return false;
    }

    // Get nearest point on any road
    getNearestRoadPoint(x: number, y: number): { x: number, y: number } {
        let nearest = { x, y };
        let minDist = Infinity;

        for (const road of this.roads) {
            // Clamp point to road bounds
            const roadCenterX = road.x + road.width / 2;
            const roadCenterY = road.y + road.height / 2;

            let px: number, py: number;
            if (road.type === 'vertical') {
                px = roadCenterX;
                py = Math.max(road.y, Math.min(y, road.y + road.height));
            } else {
                px = Math.max(road.x, Math.min(x, road.x + road.width));
                py = roadCenterY;
            }

            const dist = Math.sqrt((px - x) ** 2 + (py - y) ** 2);
            if (dist < minDist) {
                minDist = dist;
                nearest = { x: px, y: py };
            }
        }
        return nearest;
    }

    updateTraffic(agents: any[], delta: number) {
        agents.forEach(agent => {
            // Skip vehicles that are parked (no driver)
            if (agent.constructor.name === 'Vehicle' && !agent.driver) {
                return;
            }

            // If no path and no target, pick a new destination
            if ((!agent.path || agent.path.length === 0) && !agent.target) {
                // Get current position in SVG coordinates
                // 3D (x, y, z) → SVG (x, y): svgX = position.x, svgY = position.z
                const currentSvgX = agent.position.x;
                const currentSvgY = agent.position.z;

                // Check if agent is currently on a road
                const onRoad = this.isOnRoad(currentSvgX, currentSvgY);

                let startPoint = { x: currentSvgX, y: currentSvgY };
                const prePath: THREE.Vector3[] = [];

                // If not on road, first go to nearest road point (or gate for residents)
                if (!onRoad) {
                    // Check if this is a resident with a home lot and gate
                    const isResident = agent.data?.homeLot;
                    let gatePoint: { x: number, y: number } | null = null;

                    if (isResident && agent.data.homeLot.gatePositions?.length > 0) {
                        // Find the closest gate on the resident's lot
                        let minDist = Infinity;
                        for (const gate of agent.data.homeLot.gatePositions) {
                            const d = Math.sqrt(
                                Math.pow(gate.x - currentSvgX, 2) +
                                Math.pow(gate.y - currentSvgY, 2)
                            );
                            if (d < minDist) {
                                minDist = d;
                                gatePoint = gate;
                            }
                        }
                    }

                    if (gatePoint) {
                        // Resident goes through their gate - SVG → 3D: (x, height, y)
                        prePath.push(new THREE.Vector3(gatePoint.x, 1, gatePoint.y));
                        startPoint = gatePoint;

                        if (this.debugLogCount < 5) {
                            console.log(`[Pathfinding] Resident ${agent.id} using gate at (${gatePoint.x.toFixed(0)}, ${gatePoint.y.toFixed(0)})`);
                        }
                    } else {
                        // Non-resident or no gate: go to nearest road point
                        const nearestRoad = this.getNearestRoadPoint(currentSvgX, currentSvgY);
                        prePath.push(new THREE.Vector3(nearestRoad.x, 1, nearestRoad.y));
                        startPoint = nearestRoad;

                        if (this.debugLogCount < 5) {
                            console.log(`[Pathfinding] Agent ${agent.id} not on road, going to nearest: (${nearestRoad.x.toFixed(0)}, ${nearestRoad.y.toFixed(0)})`);
                        }
                    }
                }

                // Pick a random destination on the road network
                const destination = this.getRandomPointOnRoad();

                // Find path using road graph from road point to destination
                // destination is in 3D coords (x, y, z=svgY), convert back to SVG for pathfinding
                const pathPoints = this.graph.findPath(
                    startPoint,
                    { x: destination.x, y: destination.z }
                );

                // Debug logging (first 5 agents)
                if (this.debugLogCount < 5) {
                    console.log(`[Pathfinding] Agent ${agent.id}:`, {
                        onRoad,
                        from: { x: startPoint.x.toFixed(1), y: startPoint.y.toFixed(1) },
                        to: { x: destination.x.toFixed(1), z: destination.z.toFixed(1) },
                        pathLength: pathPoints.length,
                        path: pathPoints.slice(0, 5).map(p => `(${p.x.toFixed(0)},${p.y.toFixed(0)})`)
                    });
                    this.debugLogCount++;
                }

                if (pathPoints.length > 1) {
                    // Combine pre-path (to road) with graph path
                    // SVG → 3D: (x, 1, y)
                    const graphPath = pathPoints.slice(1).map(p => new THREE.Vector3(p.x, 1, p.y));
                    agent.path = [...prePath, ...graphPath];
                } else if (prePath.length > 0) {
                    // At least go to the road
                    agent.path = prePath;
                } else {
                    // No path found - assign a random road point as fallback
                    const fallback = this.getRandomPointOnRoad();
                    agent.path = [fallback];
                    if (this.debugLogCount < 5) {
                        console.warn(`[Pathfinding] No path found for ${agent.id}, using fallback`);
                        this.debugLogCount++;
                    }
                }
            }

            // Process path - set next waypoint as target
            if (agent.path && agent.path.length > 0 && !agent.target) {
                agent.target = agent.path.shift();
            }
        });
    }

    getDebugVisualization(): THREE.Group {
        return this.graph.createDebugVisualization();
    }

    removeDebugVisualization() {
        this.graph.removeDebugVisualization();
    }
}
