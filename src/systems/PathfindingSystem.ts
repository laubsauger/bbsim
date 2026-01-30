import * as THREE from 'three';
import { RoadSegment, Lot, Point, LotUsage } from "../types";
import { RoadGraph } from "./RoadGraph";
import { Resident, ResidentState } from '../entities/Resident';
import { PedestrianGraph } from './PedestrianGraph';
import { Vehicle } from '../entities/Vehicle';

export class PathfindingSystem {
    roads: RoadSegment[];
    lots: Lot[] = [];

    graph: RoadGraph;
    pedestrianGraph: PedestrianGraph;
    private sidewalkOffset = 12;
    private trespassChances = {
        resident: 0.02,
        tourist: 0.01,
        other: 0.05,
    };
    private debugGroup: THREE.Group | null = null;
    private parkingLegGroup: THREE.Group | null = null;
    private parkingLegMaterial: THREE.LineBasicMaterial | null = null;

    constructor(roads: RoadSegment[]) {
        this.roads = roads;
        this.graph = new RoadGraph(roads);
        this.pedestrianGraph = new PedestrianGraph(roads, this.sidewalkOffset);
    }

    setTrespassChances(chances: { resident?: number; tourist?: number; other?: number }) {
        this.trespassChances = {
            resident: chances.resident ?? this.trespassChances.resident,
            tourist: chances.tourist ?? this.trespassChances.tourist,
            other: chances.other ?? this.trespassChances.other,
        };
    }

    setSidewalkOffset(offset: number) {
        const clamped = Math.max(6, Math.min(30, offset));
        if (clamped === this.sidewalkOffset) return;
        this.sidewalkOffset = clamped;
        this.pedestrianGraph = new PedestrianGraph(this.roads, this.sidewalkOffset);
    }

    getRandomPointOnRoad(): THREE.Vector3 {
        if (this.roads.length === 0) return new THREE.Vector3();
        const road = this.roads[Math.floor(Math.random() * this.roads.length)];
        const localX = road.x + Math.random() * road.width;
        const localY = road.y + Math.random() * road.height;
        // Coordinate transform: SVG (x, y) → 3D (x, height, y)
        return new THREE.Vector3(localX, 1, localY);
    }

    getRandomPointOnSidewalk(): THREE.Vector3 {
        if (this.roads.length === 0) return new THREE.Vector3();
        const road = this.roads[Math.floor(Math.random() * this.roads.length)];
        if (road.type === 'vertical') {
            const useLeft = Math.random() < 0.5;
            const x = useLeft ? road.x - this.sidewalkOffset : road.x + road.width + this.sidewalkOffset;
            const y = road.y + Math.random() * road.height;
            return new THREE.Vector3(x, 1, y);
        }
        const useTop = Math.random() < 0.5;
        const y = useTop ? road.y - this.sidewalkOffset : road.y + road.height + this.sidewalkOffset;
        const x = road.x + Math.random() * road.width;
        return new THREE.Vector3(x, 1, y);
    }

    // Get a path from current position to a specific 3D destination (road graph)
    getPathTo(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3[] {
        // Convert 3D to SVG: svgX = x, svgY = z
        const fromSvg = { x: from.x, y: from.z };
        const toSvg = { x: to.x, y: to.z };

        const pathPoints = this.graph.findPath(fromSvg, toSvg);

        if (pathPoints.length > 1) {
            // Convert SVG path to 3D: (x, height, y)
            return pathPoints.slice(1).map(p => new THREE.Vector3(p.x, 1, p.y));
        }
        return [];
    }

    // Pedestrian path using sidewalk graph with gate transitions
    getPedestrianPathTo(from: THREE.Vector3, to: THREE.Vector3, lots: Lot[], agent?: any): THREE.Vector3[] {
        const fromSvg = { x: from.x, y: from.z };
        const toSvg = { x: to.x, y: to.z };

        const prePath: THREE.Vector3[] = [];
        const postPath: THREE.Vector3[] = [];

        const fromLot = this.findLotContainingPoint(fromSvg, lots);
        let toLot = this.findLotContainingPoint(toSvg, lots);

        let startPoint = { ...fromSvg };

        if (fromLot) {
            const gate = this.getNearestGate(fromLot, fromSvg);
            if (gate) {
                prePath.push(new THREE.Vector3(gate.x, 1, gate.y));
                startPoint = gate;
            }
        }

        if (!this.isOnSidewalk(startPoint.x, startPoint.y)) {
            const nearestSidewalk = this.getNearestSidewalkPoint(startPoint.x, startPoint.y);
            prePath.push(new THREE.Vector3(nearestSidewalk.x, 1, nearestSidewalk.y));
            startPoint = nearestSidewalk;
        }

        let endPoint = { ...toSvg };
        if (toLot && this.isLotAllowedForPedestrian(agent, toLot)) {
            const gate = this.getNearestGate(toLot, toSvg);
            if (gate) {
                const gateSidewalk = this.isOnSidewalk(gate.x, gate.y)
                    ? gate
                    : this.getNearestSidewalkPoint(gate.x, gate.y);
                endPoint = gateSidewalk;
                if (gateSidewalk.x !== gate.x || gateSidewalk.y !== gate.y) {
                    postPath.push(new THREE.Vector3(gate.x, 1, gate.y));
                }
                postPath.push(new THREE.Vector3(toSvg.x, 2, toSvg.y));
            }
        } else if (toLot) {
            // Destination lot not allowed: stay on sidewalk at the closest point
            const nearestSidewalk = this.getNearestSidewalkPoint(toSvg.x, toSvg.y);
            endPoint = nearestSidewalk;
        } else if (!this.isOnSidewalk(toSvg.x, toSvg.y)) {
            const nearestSidewalk = this.getNearestSidewalkPoint(toSvg.x, toSvg.y);
            endPoint = nearestSidewalk;
            postPath.push(new THREE.Vector3(toSvg.x, 1, toSvg.y));
        }

        const pathPoints = this.pedestrianGraph.findPath(startPoint, endPoint);
        const graphPath = pathPoints.length > 1
            ? pathPoints.slice(1).map(p => new THREE.Vector3(p.x, 1, p.y))
            : [];

        return [...prePath, ...graphPath, ...postPath];
    }

    // Vehicle path: road graph to lot access point, then into parking spot
    getVehiclePathTo(from: THREE.Vector3, to: THREE.Vector3, lots: Lot[], vehicle?: Vehicle): THREE.Vector3[] {
        const fromSvg = { x: from.x, y: from.z };
        const toSvg = { x: to.x, y: to.z };
        const destinationLot = this.findLotContainingPoint(toSvg, lots);

        if (!destinationLot) {
            if (vehicle) {
                (vehicle as any).parkingLeg = [];
            }
            return this.getPathTo(from, to);
        }

        const lotCenter = {
            x: destinationLot.points.reduce((s, p) => s + p.x, 0) / destinationLot.points.length,
            y: destinationLot.points.reduce((s, p) => s + p.y, 0) / destinationLot.points.length,
        };

        const accessPoint = destinationLot.roadAccessPoint || this.getNearestRoadPoint(lotCenter.x, lotCenter.y);
        const parkingSpot = destinationLot.parkingSpot || destinationLot.entryPoint || lotCenter;

        const prePath: THREE.Vector3[] = [];
        let startPoint = { ...fromSvg };

        if (!this.isOnRoad(startPoint.x, startPoint.y)) {
            const nearestRoad = this.getNearestRoadPoint(startPoint.x, startPoint.y);
            prePath.push(new THREE.Vector3(nearestRoad.x, 1, nearestRoad.y));
            startPoint = nearestRoad;
        }

        const pathPoints = this.graph.findPath(startPoint, accessPoint);
        const graphPath = pathPoints.length > 1
            ? pathPoints.slice(1).map(p => new THREE.Vector3(p.x, 1, p.y))
            : [];

        const finalLeg: THREE.Vector3[] = [
            new THREE.Vector3(accessPoint.x, 1, accessPoint.y),
            new THREE.Vector3(parkingSpot.x, 1, parkingSpot.y),
            new THREE.Vector3(toSvg.x, 1, toSvg.y),
        ];

        if (vehicle) {
            (vehicle as any).parkingLeg = finalLeg.map(p => p.clone());
        }

        return [...prePath, ...graphPath, ...finalLeg];
    }

    computeAccessPoints(lots: Lot[]) {
        this.lots = lots;
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
            const cx = lot.points.reduce((s, p) => s + p.x, 0) / lot.points.length;
            const cy = lot.points.reduce((s, p) => s + p.y, 0) / lot.points.length;

            // 1. Collect Edges
            for (let i = 0; i < lot.points.length; i++) {
                const p1 = lot.points[i];
                const p2 = lot.points[(i + 1) % lot.points.length];
                const length = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
                edges.push({ p1, p2, length, midpoint: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 } });
            }

            // Find closest road to lot center for fallback parking
            let closestRoadPoint: Point | null = null;
            let closestRoadDist = Infinity;
            for (const road of this.roads) {
                const px = Math.max(road.x, Math.min(cx, road.x + road.width));
                const py = Math.max(road.y, Math.min(cy, road.y + road.height));
                const dist = Math.sqrt(Math.pow(px - cx, 2) + Math.pow(py - cy, 2));
                if (dist < closestRoadDist) {
                    closestRoadDist = dist;
                    closestRoadPoint = { x: px, y: py };
                }
            }

            // 2. Identify Short Edges & Check Road Proximity
            edges.forEach(edge => {
                // Check if edge faces a road
                let isFacingRoad = false;
                for (const road of this.roads) {
                    const px = Math.max(road.x, Math.min(edge.midpoint.x, road.x + road.width));
                    const py = Math.max(road.y, Math.min(edge.midpoint.y, road.y + road.height));
                    const dist = Math.sqrt(Math.pow(px - edge.midpoint.x, 2) + Math.pow(py - edge.midpoint.y, 2));

                    if (dist < 15) {
                        isFacingRoad = true;
                        break;
                    }
                }

                if (isFacingRoad) {
                    const maxLength = Math.max(...edges.map(e => e.length));

                    // If edge is short OR it's practically a square
                    if (edge.length < maxLength * 0.8 || Math.abs(edge.length - maxLength) < 5) {
                        lot.gatePositions?.push(edge.midpoint);

                        // Compute parking spot if not set
                        if (!lot.parkingSpot) {
                            const dx = cx - edge.midpoint.x;
                            const dy = cy - edge.midpoint.y;
                            const len = Math.sqrt(dx * dx + dy * dy);

                            if (len > 0) {
                                // Position car inside lot, facing the road
                                lot.parkingSpot = {
                                    x: edge.midpoint.x + (dx / len) * 20,
                                    y: edge.midpoint.y + (dy / len) * 20
                                };
                                // Rotation: car faces outward toward road (opposite of inward direction)
                                // In 3D: rotation.y = atan2(dx, dy) for SVG->3D where z=y
                                lot.parkingRotation = Math.atan2(-dx, -dy);
                            }
                        }
                    }
                }
            });

            // Fallback: if no parking spot found, create one near center facing closest road
            if (!lot.parkingSpot && closestRoadPoint) {
                const dx = closestRoadPoint.x - cx;
                const dy = closestRoadPoint.y - cy;
                const len = Math.sqrt(dx * dx + dy * dy);
                if (len > 0) {
                    // Park near center, slightly toward road
                    lot.parkingSpot = {
                        x: cx + (dx / len) * 10,
                        y: cy + (dy / len) * 10
                    };
                    // Face toward road
                    lot.parkingRotation = Math.atan2(dx, dy);
                }
            }
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

    isOnSidewalk(x: number, y: number): boolean {
        const padding = 4;
        for (const road of this.roads) {
            if (road.type === 'vertical') {
                const leftX = road.x - this.sidewalkOffset;
                const rightX = road.x + road.width + this.sidewalkOffset;
                const inY = y >= road.y - padding && y <= road.y + road.height + padding;
                if (inY && (Math.abs(x - leftX) <= padding || Math.abs(x - rightX) <= padding)) {
                    return true;
                }
            } else {
                const topY = road.y - this.sidewalkOffset;
                const bottomY = road.y + road.height + this.sidewalkOffset;
                const inX = x >= road.x - padding && x <= road.x + road.width + padding;
                if (inX && (Math.abs(y - topY) <= padding || Math.abs(y - bottomY) <= padding)) {
                    return true;
                }
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

    getNearestSidewalkPoint(x: number, y: number): { x: number, y: number } {
        let nearest = { x, y };
        let minDist = Infinity;

        for (const road of this.roads) {
            if (road.type === 'vertical') {
                const leftX = road.x - this.sidewalkOffset;
                const rightX = road.x + road.width + this.sidewalkOffset;
                const py = Math.max(road.y, Math.min(y, road.y + road.height));

                const leftDist = Math.sqrt((leftX - x) ** 2 + (py - y) ** 2);
                if (leftDist < minDist) {
                    minDist = leftDist;
                    nearest = { x: leftX, y: py };
                }

                const rightDist = Math.sqrt((rightX - x) ** 2 + (py - y) ** 2);
                if (rightDist < minDist) {
                    minDist = rightDist;
                    nearest = { x: rightX, y: py };
                }
            } else {
                const topY = road.y - this.sidewalkOffset;
                const bottomY = road.y + road.height + this.sidewalkOffset;
                const px = Math.max(road.x, Math.min(x, road.x + road.width));

                const topDist = Math.sqrt((px - x) ** 2 + (topY - y) ** 2);
                if (topDist < minDist) {
                    minDist = topDist;
                    nearest = { x: px, y: topY };
                }

                const bottomDist = Math.sqrt((px - x) ** 2 + (bottomY - y) ** 2);
                if (bottomDist < minDist) {
                    minDist = bottomDist;
                    nearest = { x: px, y: bottomY };
                }
            }
        }
        return nearest;
    }

    private isPedestrian(agent: any): boolean {
        return !(agent instanceof Vehicle);
    }

    private isLotAllowedForPedestrian(agent: any, lot: Lot): boolean {
        if (!agent) return lot.usage !== LotUsage.RESIDENTIAL;
        if (Array.isArray(agent.allowedLots) && agent.allowedLots.includes(lot.id)) return true;
        const isResident = agent.data?.homeLot;
        if (isResident && agent.data.homeLot.id === lot.id) return true;
        if (lot.usage === LotUsage.PUBLIC || lot.usage === LotUsage.COMMERCIAL) return true;
        if (lot.usage === LotUsage.LODGING && agent.data?.lodgingLot?.id === lot.id) return true;
        const type = agent.type || '';
        const baseTrespass = type === 'resident'
            ? this.trespassChances.resident
            : type === 'tourist'
                ? this.trespassChances.tourist
                : this.trespassChances.other;
        const overrideTrespass = typeof agent.trespassChance === 'number' ? agent.trespassChance : null;
        const chance = overrideTrespass !== null ? overrideTrespass : baseTrespass;
        return Math.random() < chance;
    }

    private getRandomPointInLot(lot: Lot): Point {
        if (lot.points.length === 0) return { x: 0, y: 0 };
        const minX = Math.min(...lot.points.map(p => p.x));
        const maxX = Math.max(...lot.points.map(p => p.x));
        const minY = Math.min(...lot.points.map(p => p.y));
        const maxY = Math.max(...lot.points.map(p => p.y));

        for (let i = 0; i < 20; i++) {
            const x = minX + Math.random() * (maxX - minX);
            const y = minY + Math.random() * (maxY - minY);
            if (this.isPointInLot(x, y, lot.points)) {
                return { x, y };
            }
        }
        return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
    }

    private getRandomPedestrianDestination(agent: any): THREE.Vector3 {
        const homeLot = agent.data?.homeLot;
        if (homeLot && Math.random() < 0.6) {
            const point = this.getRandomPointInLot(homeLot);
            return new THREE.Vector3(point.x, 2, point.y);
        }

        const allowedLots = this.lots.filter(lot => this.isLotAllowedForPedestrian(agent, lot));
        if (allowedLots.length > 0 && Math.random() < 0.25) {
            const lot = allowedLots[Math.floor(Math.random() * allowedLots.length)];
            const point = this.getRandomPointInLot(lot);
            return new THREE.Vector3(point.x, 2, point.y);
        }

        return this.getRandomPointOnSidewalk();
    }

    private findLotContainingPoint(point: Point, lots: Lot[]): Lot | null {
        for (const lot of lots) {
            if (lot.points.length < 3) continue;
            if (this.isPointInLot(point.x, point.y, lot.points)) {
                return lot;
            }
        }
        return null;
    }

    private isPointInLot(x: number, y: number, points: Point[]): boolean {
        let inside = false;
        for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
            const xi = points[i].x, yi = points[i].y;
            const xj = points[j].x, yj = points[j].y;

            if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
                inside = !inside;
            }
        }
        return inside;
    }

    private getNearestGate(lot: Lot, point: Point): Point | null {
        const gates = lot.gatePositions && lot.gatePositions.length > 0 ? lot.gatePositions : null;
        if (gates) {
            let nearest: Point | null = null;
            let minDist = Infinity;
            for (const gate of gates) {
                const d = Math.sqrt((gate.x - point.x) ** 2 + (gate.y - point.y) ** 2);
                if (d < minDist) {
                    minDist = d;
                    nearest = gate;
                }
            }
            return nearest;
        }

        if (lot.entryPoint) return lot.entryPoint;
        if (lot.roadAccessPoint) return lot.roadAccessPoint;
        return null;
    }

    updateTraffic(agents: any[], delta: number) {
        if (this.parkingLegGroup) {
            this.updateParkingLegDebug(agents);
        }
        agents.forEach(agent => {
            // Skip vehicles that are parked (no driver)
            if (agent instanceof Vehicle && !agent.driver) {
                return;
            }

            // COLLISION AVOIDANCE / SEPARATION
            // Apply a repulsion force from nearby agents to prevent bunching
            const isResident = agent instanceof Resident;
            // Skip for drivers/passengers (isInCar)
            if (agent.behaviorState !== ResidentState.DRIVING &&
                !(isResident && agent.isInCar)) {

                const separationRadius = 10; // Separation distance
                const separationForce = new THREE.Vector3();
                let nearbyCount = 0;

                for (const other of agents) {
                    if (agent === other) continue;
                    // Ignore parked cars for separation
                    if (other instanceof Vehicle && !other.driver) continue;

                    // Ignore others in cars (invisible)
                    if (other instanceof Resident && other.isInCar) continue;
                    if (other.behaviorState === ResidentState.DRIVING) continue;

                    const distSq = agent.position.distanceToSquared(other.position);
                    if (distSq < separationRadius * separationRadius && distSq > 0.1) {
                        const dist = Math.sqrt(distSq);
                        const push = new THREE.Vector3().subVectors(agent.position, other.position).normalize();
                        // Stronger push when closer
                        push.multiplyScalar((separationRadius - dist) / separationRadius);
                        separationForce.add(push);
                        nearbyCount++;
                    }
                }

                if (nearbyCount > 0) {
                    // Scale force by delta time and a strength factor
                    separationForce.multiplyScalar(delta * 2.5);
                    separationForce.y = 0; // Keep horizontal
                    agent.position.add(separationForce);
                }
            }

            // Skip residents who are at home idle or have intentional destinations
            if (agent.behaviorState !== undefined) {
                const state = agent.behaviorState as ResidentState;
                // Don't assign random paths to residents at home or with specific destinations
                if (state === ResidentState.IDLE_HOME) {
                    return;
                }
                // Residents walking to car or home have their own targets set
                if (state === ResidentState.WALKING_TO_CAR || state === ResidentState.WALKING_HOME) {
                    // Only process path to target if they have a target but no path
                    if (agent.target && (!agent.path || agent.path.length === 0)) {
                        const path = this.isPedestrian(agent)
                            ? this.getPedestrianPathTo(agent.position, agent.target, this.lots, agent)
                            : this.getVehiclePathTo(agent.position, agent.target, this.lots, agent);
                        if (path.length > 0) {
                            agent.path = path;
                            agent.target = null; // Path will lead to target
                        }
                    }
                    return;
                }
            }

            if (agent.target && (!agent.path || agent.path.length === 0)) {
                const path = this.isPedestrian(agent)
                    ? this.getPedestrianPathTo(agent.position, agent.target, this.lots, agent)
                    : this.getVehiclePathTo(agent.position, agent.target, this.lots, agent);
                if (path.length > 0) {
                    agent.path = path;
                    agent.target = null;
                }
            }

            // If no path and no target, pick a new destination
            if ((!agent.path || agent.path.length === 0) && !agent.target) {
                // Get current position in SVG coordinates
                // 3D (x, y, z) → SVG (x, y): svgX = position.x, svgY = position.z
                const currentSvgX = agent.position.x;
                const currentSvgY = agent.position.z;

                const isPedestrian = this.isPedestrian(agent);
                const onNetwork = isPedestrian
                    ? this.isOnSidewalk(currentSvgX, currentSvgY)
                    : this.isOnRoad(currentSvgX, currentSvgY);

                let startPoint = { x: currentSvgX, y: currentSvgY };
                const prePath: THREE.Vector3[] = [];

                // If not on road/sidewalk, move through gate or to nearest network point
                if (!onNetwork) {
                    const currentLot = this.findLotContainingPoint({ x: currentSvgX, y: currentSvgY }, this.lots);
                    const gatePoint = currentLot ? this.getNearestGate(currentLot, { x: currentSvgX, y: currentSvgY }) : null;

                    if (gatePoint) {
                        prePath.push(new THREE.Vector3(gatePoint.x, 1, gatePoint.y));
                        startPoint = gatePoint;
                    }

                    const nearest = isPedestrian
                        ? this.getNearestSidewalkPoint(startPoint.x, startPoint.y)
                        : this.getNearestRoadPoint(startPoint.x, startPoint.y);
                    prePath.push(new THREE.Vector3(nearest.x, 1, nearest.y));
                    startPoint = nearest;
                }

                // Pick a random destination on the appropriate network
                const destination = isPedestrian ? this.getRandomPedestrianDestination(agent) : this.getRandomPointOnRoad();

                // Find path using road graph from road point to destination
                // destination is in 3D coords, convert back to SVG for pathfinding: svgY = z
                const pathPoints = isPedestrian
                    ? this.pedestrianGraph.findPath(startPoint, { x: destination.x, y: destination.z })
                    : this.graph.findPath(startPoint, { x: destination.x, y: destination.z });

                // Debug logging (first 5 agents)
                if (this.debugLogCount < 5) {
                    console.log(`[Pathfinding] Agent ${agent.id}:`, {
                        onNetwork,
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
                    const fallback = isPedestrian ? this.getRandomPointOnSidewalk() : this.getRandomPointOnRoad();
                    agent.path = [fallback];
                    if (this.debugLogCount < 5) {
                        console.warn(`[Pathfinding] No path found for ${agent.id}, using fallback`);
                        this.debugLogCount++;
                    }
                }
            }

            // Process path - set next waypoint as target
            if (agent.path && agent.path.length > 0 && !agent.target) {
                const next = agent.path.shift();
                if (next && this.isPedestrian(agent)) {
                    const nextLot = this.findLotContainingPoint({ x: next.x, y: next.z }, this.lots);
                    if (nextLot && !this.isLotAllowedForPedestrian(agent, nextLot)) {
                        agent.path = [];
                        agent.target = null;
                        return;
                    }
                }
                agent.target = next || null;
            }
        });
    }

    getDebugVisualization(): THREE.Group {
        if (this.debugGroup) return this.debugGroup;

        this.debugGroup = new THREE.Group();
        this.debugGroup.name = 'PathfindingDebug';

        const roadDebug = this.graph.createDebugVisualization();
        this.debugGroup.add(roadDebug);

        this.parkingLegGroup = new THREE.Group();
        this.parkingLegGroup.name = 'ParkingLegs';
        this.debugGroup.add(this.parkingLegGroup);
        this.parkingLegMaterial = new THREE.LineBasicMaterial({ color: 0x55d6ff });

        return this.debugGroup;
    }

    removeDebugVisualization() {
        this.graph.removeDebugVisualization();
        if (this.debugGroup && this.debugGroup.parent) {
            this.debugGroup.parent.remove(this.debugGroup);
        }
        this.debugGroup = null;
        this.parkingLegGroup = null;
        if (this.parkingLegMaterial) {
            this.parkingLegMaterial.dispose();
        }
        this.parkingLegMaterial = null;
    }

    private updateParkingLegDebug(agents: any[]) {
        if (!this.parkingLegGroup) return;
        while (this.parkingLegGroup.children.length > 0) {
            const child = this.parkingLegGroup.children[0] as THREE.Line;
            this.parkingLegGroup.remove(child);
            if ((child.geometry as THREE.BufferGeometry).dispose) child.geometry.dispose();
        }

        const material = this.parkingLegMaterial;
        if (!material) return;

        agents.forEach(agent => {
            if (!(agent instanceof Vehicle)) return;
            const leg = (agent as any).parkingLeg as THREE.Vector3[] | undefined;
            if (!leg || leg.length < 2) return;
            const points = leg.map(p => new THREE.Vector3(p.x, 2, p.z));
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const line = new THREE.Line(geometry, material);
            this.parkingLegGroup!.add(line);
        });
    }
}
