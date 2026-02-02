import * as THREE from 'three';
import { RoadSegment, Lot, Point, LotUsage, AgentType } from "../types";
import { RoadGraph } from "./RoadGraph";
import { Resident, ResidentState } from '../entities/Resident';
import { PedestrianGraph } from './PedestrianGraph';
import { Vehicle } from '../entities/Vehicle';
import { SpatialGrid } from './SpatialGrid';

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
    private businessHours = { open: 9, close: 20 };
    private currentHour: number = 12;
    private debugGroup: THREE.Group | null = null;
    private parkingLegGroup: THREE.Group | null = null;
    private parkingLegMaterial: THREE.LineBasicMaterial | null = null;
    private parkingLegDebugEnabled = false;
    private intersectionRects: Array<{ minX: number; minY: number; maxX: number; maxY: number }> = [];
    private spatialGrid: SpatialGrid<any> = new SpatialGrid(50); // 50 units per cell

    constructor(roads: RoadSegment[]) {
        this.roads = roads;
        this.graph = new RoadGraph(roads);
        this.pedestrianGraph = new PedestrianGraph(roads, this.sidewalkOffset);
        this.intersectionRects = this.buildIntersectionRects(roads);
    }


    // Coordinate system: SVG (x, y) maps to 3D (x, height, y).
    // All agents/pathing are in SVG coordinates; WorldRenderer applies centering.
    private toSvg(point: THREE.Vector3): Point {
        return { x: point.x, y: point.z };
    }

    private toWorld(point: Point, height: number = 1): THREE.Vector3 {
        return new THREE.Vector3(point.x, height, point.y);
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

    setCurrentHour(hour: number) {
        this.currentHour = hour;
    }

    setBusinessHours(open: number, close: number) {
        this.businessHours = { open, close };
    }

    private isCommercialOpen(): boolean {
        const { open, close } = this.businessHours;
        return this.currentHour >= open && this.currentHour < close;
    }

    private isBarOpen(): boolean {
        // 11am to 1am
        return this.currentHour >= 11 || this.currentHour < 1;
    }

    private buildIntersectionRects(roads: RoadSegment[]) {
        const rects: Array<{ minX: number; minY: number; maxX: number; maxY: number }> = [];
        const vertical = roads.filter(r => r.type === 'vertical');
        const horizontal = roads.filter(r => r.type === 'horizontal');

        for (const v of vertical) {
            for (const h of horizontal) {
                const overlapX = v.x <= h.x + h.width && v.x + v.width >= h.x;
                const overlapY = h.y <= v.y + v.height && h.y + h.height >= v.y;
                if (overlapX && overlapY) {
                    rects.push({
                        minX: Math.max(v.x, h.x),
                        maxX: Math.min(v.x + v.width, h.x + h.width),
                        minY: Math.max(v.y, h.y),
                        maxY: Math.min(v.y + v.height, h.y + h.height),
                    });
                }
            }
        }
        return rects;
    }

    /**
     * Get center points of all intersections (for street lamp placement, etc.)
     */
    getIntersectionCenters(): { x: number; y: number }[] {
        return this.intersectionRects.map(rect => ({
            x: (rect.minX + rect.maxX) / 2,
            y: (rect.minY + rect.maxY) / 2
        }));
    }

    private isNearIntersection(x: number, y: number, clearance: number): boolean {
        for (const rect of this.intersectionRects) {
            if (x >= rect.minX - clearance && x <= rect.maxX + clearance &&
                y >= rect.minY - clearance && y <= rect.maxY + clearance) {
                return true;
            }
        }
        return false;
    }

    private adjustPointAwayFromIntersection(road: RoadSegment, point: Point, clearance: number): Point {
        for (const rect of this.intersectionRects) {
            const overlapsX = point.x >= rect.minX - clearance && point.x <= rect.maxX + clearance;
            const overlapsY = point.y >= rect.minY - clearance && point.y <= rect.maxY + clearance;
            if (!overlapsX || !overlapsY) continue;

            if (road.type === 'vertical') {
                const up = rect.minY - clearance;
                const down = rect.maxY + clearance;
                const preferUp = Math.abs(point.y - up) < Math.abs(point.y - down);
                const clampedY = preferUp ? Math.max(road.y, up) : Math.min(road.y + road.height, down);
                return { x: point.x, y: clampedY };
            }

            const left = rect.minX - clearance;
            const right = rect.maxX + clearance;
            const preferLeft = Math.abs(point.x - left) < Math.abs(point.x - right);
            const clampedX = preferLeft ? Math.max(road.x, left) : Math.min(road.x + road.width, right);
            return { x: clampedX, y: point.y };
        }
        return point;
    }

    private adjustPointIfInIntersection(point: Point, clearance: number): Point {
        if (!this.isNearIntersection(point.x, point.y, clearance)) return point;
        const road = this.getNearestRoadSegment(point.x, point.y);
        if (!road) return point;
        return this.adjustPointAwayFromIntersection(road, point, clearance);
    }

    getCurbsidePointNearRoad(point: Point): { point: Point; rotation: number } | null {
        const road = this.getRoadAt(point.x, point.y) || this.getNearestRoadSegment(point.x, point.y);
        if (!road) return null;
        const curbInset = Math.max(2, Math.min(6, road.type === 'vertical' ? road.width * 0.15 : road.height * 0.15));

        if (road.type === 'vertical') {
            const centerX = road.x + road.width / 2;
            const left = road.x + curbInset;
            const right = road.x + road.width - curbInset;
            const useLeft = point.x <= centerX;
            let x = useLeft ? left : right;
            let y = Math.max(road.y + 10, Math.min(point.y, road.y + road.height - 10));
            const adjusted = this.adjustPointAwayFromIntersection(road, { x, y }, 14);
            return { point: adjusted, rotation: 0 };
        }

        const centerY = road.y + road.height / 2;
        const top = road.y + curbInset;
        const bottom = road.y + road.height - curbInset;
        const useTop = point.y <= centerY;
        let y = useTop ? top : bottom;
        let x = Math.max(road.x + 10, Math.min(point.x, road.x + road.width - 10));
        const adjusted = this.adjustPointAwayFromIntersection(road, { x, y }, 14);
        return { point: adjusted, rotation: Math.PI / 2 };
    }

    getRandomPointOnRoad(): THREE.Vector3 {
        if (this.roads.length === 0) return new THREE.Vector3();
        const road = this.roads[Math.floor(Math.random() * this.roads.length)];
        const localX = road.x + Math.random() * road.width;
        const localY = road.y + Math.random() * road.height;
        // Coordinate transform: SVG (x, y) → 3D (x, height, y)
        return this.toWorld({ x: localX, y: localY }, 1);
    }

    getRandomPointOnSidewalk(): THREE.Vector3 {
        if (this.roads.length === 0) return new THREE.Vector3();
        const road = this.roads[Math.floor(Math.random() * this.roads.length)];
        if (road.type === 'vertical') {
            const useLeft = Math.random() < 0.5;
            const x = useLeft ? road.x - this.sidewalkOffset : road.x + road.width + this.sidewalkOffset;
            const y = road.y + Math.random() * road.height;
            return this.toWorld({ x, y }, 1);
        }
        const useTop = Math.random() < 0.5;
        const y = useTop ? road.y - this.sidewalkOffset : road.y + road.height + this.sidewalkOffset;
        const x = road.x + Math.random() * road.width;
        return this.toWorld({ x, y }, 1);
    }

    // Get a path from current position to a specific 3D destination (road graph)
    getPathTo(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3[] {
        const fromSvg = this.toSvg(from);
        const toSvg = this.toSvg(to);

        const pathPoints = this.graph.findPath(fromSvg, toSvg);

        if (pathPoints.length > 1) {
            // Convert SVG path to 3D: (x, height, y)
            return pathPoints.slice(1).map(p => this.toWorld(p, 1));
        }
        if (this.isOnRoad(fromSvg.x, fromSvg.y) && this.isOnRoad(toSvg.x, toSvg.y)) {
            return [this.toWorld(toSvg, 1)];
        }
        return [];
    }

    // Pedestrian path using sidewalk graph with gate transitions
    getPedestrianPathTo(from: THREE.Vector3, to: THREE.Vector3, lots: Lot[], agent?: any): THREE.Vector3[] {
        const fromSvg = this.toSvg(from);
        const toSvg = this.toSvg(to);

        const prePath: THREE.Vector3[] = [];
        const postPath: THREE.Vector3[] = [];
        if (agent) {
            agent.prePath = [];
            agent.lastGate = null;
        }

        const fromLot = this.findLotContainingPoint(fromSvg, lots);
        let toLot = this.findLotContainingPoint(toSvg, lots);

        if (fromLot && toLot && fromLot.id === toLot.id) {
            return [this.toWorld(toSvg, 2)];
        }

        let startPoint = { ...fromSvg };

        if (fromLot) {
            const gate = this.getNearestGate(fromLot, fromSvg);
            if (gate) {
                prePath.push(this.toWorld(gate, 1));
                startPoint = gate;
                if (agent) agent.lastGate = gate;
            } else if (this.debugPedExitCount < 20) {
                console.warn(`[PedestrianExit] No gate for lot ${fromLot.id} at (${fromSvg.x.toFixed(1)}, ${fromSvg.y.toFixed(1)})`);
                this.debugPedExitCount++;
                return [];
            }
        }

        if (!this.isOnSidewalk(startPoint.x, startPoint.y)) {
            const nearestSidewalk = this.getNearestSidewalkPoint(startPoint.x, startPoint.y);
            prePath.push(this.toWorld(nearestSidewalk, 1));
            startPoint = nearestSidewalk;
            if (this.debugPedExitCount < 20) {
                const dx = nearestSidewalk.x - (agent?.lastGate?.x ?? fromSvg.x);
                const dy = nearestSidewalk.y - (agent?.lastGate?.y ?? fromSvg.y);
                const dist = Math.sqrt(dx * dx + dy * dy);
                console.warn(`[PedestrianExit] Snap to sidewalk dist=${dist.toFixed(1)} from (${fromSvg.x.toFixed(1)}, ${fromSvg.y.toFixed(1)})`);
                this.debugPedExitCount++;
            }
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
                    postPath.push(this.toWorld(gate, 1));
                }
                postPath.push(this.toWorld(toSvg, 2));
            } else if (this.debugPedExitCount < 20) {
                console.warn(`[PedestrianExit] No gate to enter lot ${toLot.id} at (${toSvg.x.toFixed(1)}, ${toSvg.y.toFixed(1)})`);
                this.debugPedExitCount++;
                return [];
            }
        } else if (toLot) {
            // Destination lot not allowed: stay on sidewalk at the closest point
            const nearestSidewalk = this.getNearestSidewalkPoint(toSvg.x, toSvg.y);
            endPoint = nearestSidewalk;
        } else if (!this.isOnSidewalk(toSvg.x, toSvg.y)) {
            const nearestSidewalk = this.getNearestSidewalkPoint(toSvg.x, toSvg.y);
            endPoint = nearestSidewalk;
            postPath.push(this.toWorld(toSvg, 1));
        }

        const pathPoints = this.pedestrianGraph.findPath(startPoint, endPoint);
        const graphPath = pathPoints.length > 1
            ? pathPoints.slice(1).map(p => {
                const adjusted = this.adjustPointIfInIntersection(p, 10);
                return this.toWorld(adjusted, 1);
            })
            : [];

        if (agent) {
            agent.prePath = [...prePath];
        }

        if (graphPath.length === 0 &&
            this.isOnSidewalk(startPoint.x, startPoint.y) &&
            this.isOnSidewalk(endPoint.x, endPoint.y)) {
            if (this.debugPathFailCount < 30) {
                console.warn(`[PedestrianGraph] No sidewalk path from (${startPoint.x.toFixed(1)},${startPoint.y.toFixed(1)}) to (${endPoint.x.toFixed(1)},${endPoint.y.toFixed(1)})`);
                this.debugPathFailCount++;
            }
            return [...prePath];
        }

        return [...prePath, ...graphPath, ...postPath];
    }

    // Vehicle path: road graph to lot access point, then into parking spot
    getVehiclePathTo(from: THREE.Vector3, to: THREE.Vector3, lots: Lot[], vehicle?: Vehicle): THREE.Vector3[] {
        const fromSvg = this.toSvg(from);
        const toSvg = this.toSvg(to);
        const destinationLot = this.findLotContainingPoint(toSvg, lots);

        // If destination is on a road and not inside a lot, keep vehicles on the road network
        if (this.isOnRoad(toSvg.x, toSvg.y) && !destinationLot) {
            if (vehicle) {
                (vehicle as any).parkingLeg = [];
            }
            return this.getPathTo(from, to);
        }

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
            prePath.push(this.toWorld(nearestRoad, 1));
            startPoint = nearestRoad;
        }

        // Optimization: If on the same road segment, drive directly logic (prevents U-turns on simple graph)
        const startRoad = this.getRoadAt(startPoint.x, startPoint.y);
        const endRoad = this.getRoadAt(accessPoint.x, accessPoint.y);

        let graphPath: THREE.Vector3[] = [];


        if (startRoad && endRoad && startRoad === endRoad) {
            // On same road - allow direct travel along the road
            graphPath = [this.toWorld(accessPoint, 1)];
        } else {
            const startNode = startRoad ? this.graph.getClosestNodeOnRoad(startPoint, startRoad) : null;
            const endNode = endRoad ? this.graph.getClosestNodeOnRoad(accessPoint, endRoad) : null;
            const graphStart = startNode ? { x: startNode.x, y: startNode.y } : startPoint;
            const graphEnd = endNode ? { x: endNode.x, y: endNode.y } : accessPoint;

            if (startRoad && startNode) {
                prePath.push(this.toWorld(graphStart, 1));
            }

            const sameGraphNode = Math.abs(graphStart.x - graphEnd.x) < 0.5 && Math.abs(graphStart.y - graphEnd.y) < 0.5;
            if (sameGraphNode) {
                graphPath = [];
            }

            const pathPoints = sameGraphNode ? [] : this.graph.findPath(graphStart, graphEnd);
            if (!sameGraphNode && pathPoints.length <= 1) {
                // Throttled logging
                if (Math.random() < 0.05) {
                    console.warn(`[Pathfinding] No graph path found from (${graphStart.x.toFixed(0)},${graphStart.y.toFixed(0)}) to (${graphEnd.x.toFixed(0)},${graphEnd.y.toFixed(0)}) (Sampled Log)`);
                }
            }
            graphPath = pathPoints.length > 1
                ? pathPoints.slice(1).map(p => this.toWorld(p, 1))
                : [];

            if (endRoad && endNode && (graphEnd.x !== accessPoint.x || graphEnd.y !== accessPoint.y)) {
                const adjustedAccess = this.adjustPointIfInIntersection(accessPoint, 10);
                graphPath.push(this.toWorld(adjustedAccess, 1));
            }
        }

        const finalLeg: THREE.Vector3[] = [];
        if (destinationLot && destinationLot.roadAccessPoint) {
            const nearRoad = this.toWorld(accessPoint, 1);
            const parkPoint = this.toWorld(parkingSpot, 1);
            const gate = this.getNearestGate(destinationLot, accessPoint);
            const entry = gate ?? destinationLot.entryPoint ?? parkingSpot;
            const driveIn = this.getDriveInPoint(destinationLot, entry, 8);
            // Vehicles enter via Gate -> Drive-In point -> Park
            const adjustedNear = this.adjustPointIfInIntersection(accessPoint, 10);
            const adjustedEntry = this.adjustPointIfInIntersection(entry, 10);
            finalLeg.push(
                this.toWorld(adjustedNear, 1),
                this.toWorld(adjustedEntry, 1),
                this.toWorld(driveIn, 1),
                parkPoint
            );
        } else {
            // If no explicit access, stay on the road network
            const adjustedAccess = this.adjustPointIfInIntersection(accessPoint, 10);
            finalLeg.push(this.toWorld(adjustedAccess, 1));
        }

        if (vehicle) {
            (vehicle as any).parkingLeg = finalLeg.map(p => p.clone());
            (vehicle as any).prePath = [...prePath];
        }

        return [...prePath, ...graphPath, ...finalLeg];
    }

    computeAccessPoints(lots: Lot[]) {
        this.lots = lots;
        this.lotBoundsCache.clear();
        lots.forEach(lot => {
            const bounds = this.getLotBounds(lot);
            let minDistance = Infinity;
            let accessPoint: THREE.Vector3 | null = null;
            let closestRoad: RoadSegment | null = null;

            // Lot center approximation
            const centerX = (bounds.minX + bounds.maxX) / 2;
            const centerY = (bounds.minY + bounds.maxY) / 2;

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
                const adjusted = this.adjustPointAwayFromIntersection(
                    closestRoad,
                    { x: accessPoint.x, y: accessPoint.z },
                    12
                );
                lot.roadAccessPoint = { x: adjusted.x, y: adjusted.y };

                let minPtDist = Infinity;
                let entryX = centerX;
                let entryY = centerY;

                // Iterate lot edges to find closest point on boundary to road
                for (let i = 0; i < lot.points.length; i++) {
                    const p1 = lot.points[i];
                    const p2 = lot.points[(i + 1) % lot.points.length];
                    const pt = this.closestPointOnSegment(p1, p2, { x: adjusted.x, y: adjusted.y });
                    const d = Math.sqrt(Math.pow(pt.x - adjusted.x, 2) + Math.pow(pt.y - adjusted.y, 2));

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

            // Initialize parking spots array
            lot.parkingSpots = [];
            const intersectionClear = 16;
            let hasCustomParking = false;

            if (lot.id === 618) {
                const minX = Math.min(...lot.points.map(p => p.x));
                const maxX = Math.max(...lot.points.map(p => p.x));
                const minY = Math.min(...lot.points.map(p => p.y));
                const maxY = Math.max(...lot.points.map(p => p.y));
                const width = maxX - minX;
                const height = maxY - minY;

                const insetX = Math.min(18, width * 0.18);
                const insetY = Math.min(18, height * 0.12);
                const usableHeight = Math.max(0, height - insetY * 2);
                const rows = 6;
                const cols = 2;
                const rowSpacing = rows > 1 ? usableHeight / (rows - 1) : 0;
                const colSpacing = Math.min(14, width * 0.12);
                const baseX = minX + insetX;
                const baseY = minY + insetY;
                const rotation = Math.PI / 2; // face east toward building

                for (let r = 0; r < rows; r++) {
                    for (let c = 0; c < cols; c++) {
                        lot.parkingSpots!.push({
                            x: baseX + c * colSpacing,
                            y: baseY + r * rowSpacing,
                            rotation,
                            occupiedBy: null,
                        });
                    }
                }

                if (lot.parkingSpots.length > 0) {
                    lot.parkingSpot = {
                        x: lot.parkingSpots[0].x,
                        y: lot.parkingSpots[0].y,
                    };
                    lot.parkingRotation = lot.parkingSpots[0].rotation;
                }
                hasCustomParking = true;
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
                        if (!this.isNearIntersection(edge.midpoint.x, edge.midpoint.y, intersectionClear)) {
                            lot.gatePositions?.push(edge.midpoint);
                        }

                        // Compute parking spots along road-facing edge
                        const dx = cx - edge.midpoint.x;
                        const dy = cy - edge.midpoint.y;
                        const len = Math.sqrt(dx * dx + dy * dy);

                        if (!hasCustomParking && len > 0 && lot.parkingSpots!.length < 2) {
                            const rotation = Math.atan2(-dx, -dy);
                            const perpX = -dy / len;
                            const perpY = dx / len;
                            const spacing = 10;

                            // Create 2 parking spots side by side
                            for (let i = -1; i <= 1; i += 2) {
                                const px = edge.midpoint.x + (dx / len) * 20 + perpX * spacing * i;
                                const py = edge.midpoint.y + (dy / len) * 20 + perpY * spacing * i;
                                if (!this.isNearIntersection(px, py, intersectionClear)) {
                                    lot.parkingSpots!.push({
                                        x: px,
                                        y: py,
                                        rotation,
                                        occupiedBy: null,
                                    });
                                }
                            }

                            // Legacy single spot for backwards compatibility
                            if (!lot.parkingSpot) {
                                const px = edge.midpoint.x + (dx / len) * 20;
                                const py = edge.midpoint.y + (dy / len) * 20;
                                if (!this.isNearIntersection(px, py, intersectionClear)) {
                                    lot.parkingSpot = { x: px, y: py };
                                    lot.parkingRotation = rotation;
                                }
                            }
                        }
                    }
                }
            });

            // Ensure at least one gate for pedestrian/vehicle transitions
            if (lot.gatePositions!.length === 0) {
                if (lot.entryPoint) {
                    lot.gatePositions!.push(lot.entryPoint);
                } else if (lot.roadAccessPoint) {
                    lot.gatePositions!.push(lot.roadAccessPoint);
                }
            }

            // Fallback: if no parking spots found, create two near center facing closest road
            if (!hasCustomParking && lot.parkingSpots!.length === 0 && closestRoadPoint) {
                const dx = closestRoadPoint.x - cx;
                const dy = closestRoadPoint.y - cy;
                const len = Math.sqrt(dx * dx + dy * dy);
                if (len > 0) {
                    const rotation = Math.atan2(dx, dy);
                    const perpX = -dy / len;
                    const perpY = dx / len;
                    const spacing = 10;

                    for (let i = -1; i <= 1; i += 2) {
                        const px = cx + (dx / len) * 10 + perpX * spacing * i;
                        const py = cy + (dy / len) * 10 + perpY * spacing * i;
                        if (!this.isNearIntersection(px, py, intersectionClear)) {
                            lot.parkingSpots!.push({
                                x: px,
                                y: py,
                                rotation,
                                occupiedBy: null,
                            });
                        }
                    }

                    // Legacy single spot
                    const px = cx + (dx / len) * 10;
                    const py = cy + (dy / len) * 10;
                    if (!this.isNearIntersection(px, py, intersectionClear)) {
                        lot.parkingSpot = { x: px, y: py };
                        lot.parkingRotation = rotation;
                    }
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
    private debugPedExitCount = 0;
    private debugVehicleOffroadCount = 0;
    private debugPathFailCount = 0;
    private simTimeSeconds = 0;
    private streetParking: Map<string, string> = new Map();
    private lotBoundsCache: Map<number, { minX: number; minY: number; maxX: number; maxY: number }> = new Map();
    private vehicleStuck: Map<string, { x: number; y: number; t: number; lastReroute: number }> = new Map();
    private vehicleLane: Map<string, number> = new Map();
    private vehicleLaneUntil: Map<string, number> = new Map();

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

    // Check if a road is a main road (not an alley)
    isMainRoad(road: RoadSegment): boolean {
        // Alleys have "alley" in their ID and are narrower (~35 vs ~67 for main roads)
        if (road.id.toLowerCase().includes('alley')) return false;
        const roadWidth = road.type === 'vertical' ? road.width : road.height;
        return roadWidth >= 50;
    }

    // Check if a point is on a main road (not an alley)
    isOnMainRoad(x: number, y: number): boolean {
        const road = this.getRoadAt(x, y);
        if (!road) return false;
        return this.isMainRoad(road);
    }

    // Get nearest point on a main road (for large vehicles like school bus)
    getNearestMainRoadPoint(x: number, y: number): Point {
        let nearest: Point = { x, y };
        let minDist = Infinity;

        for (const road of this.roads) {
            if (!this.isMainRoad(road)) continue;

            const px = Math.max(road.x, Math.min(x, road.x + road.width));
            const py = Math.max(road.y, Math.min(y, road.y + road.height));
            const dist = Math.sqrt((px - x) ** 2 + (py - y) ** 2);
            if (dist < minDist) {
                minDist = dist;
                nearest = { x: px, y: py };
            }
        }

        return nearest;
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

    private getRoadAt(x: number, y: number): RoadSegment | null {
        const padding = 2; // Strict check
        for (const road of this.roads) {
            if (road.type === 'vertical') {
                const inX = x >= road.x - padding && x <= road.x + road.width + padding;
                const inY = y >= road.y - padding && y <= road.y + road.height + padding;
                if (inX && inY) return road;
            } else {
                const inX = x >= road.x - padding && x <= road.x + road.width + padding;
                const inY = y >= road.y - padding && y <= road.y + road.height + padding;
                if (inX && inY) return road;
            }
        }
        return null;
    }

    private getNearestRoadSegment(x: number, y: number): RoadSegment | null {
        let nearest: RoadSegment | null = null;
        let minDist = Infinity;

        for (const road of this.roads) {
            const px = Math.max(road.x, Math.min(x, road.x + road.width));
            const py = Math.max(road.y, Math.min(y, road.y + road.height));
            const dist = Math.sqrt((px - x) ** 2 + (py - y) ** 2);
            if (dist < minDist) {
                minDist = dist;
                nearest = road;
            }
        }

        return nearest;
    }

    private avoidIntersectionOnRoad(road: RoadSegment, x: number, y: number, minDist: number): number {
        const tol = 1.5;
        const nodes = Array.from(this.graph.nodes.values()).filter(n => n.connections.length >= 3);

        let nearest: { value: number; dist: number } | null = null;
        for (const node of nodes) {
            if (road.type === 'vertical') {
                const cx = road.x + road.width / 2;
                if (Math.abs(node.x - cx) > tol) continue;
                const dist = Math.abs(node.y - y);
                if (nearest === null || dist < nearest.dist) {
                    nearest = { value: node.y, dist };
                }
            } else {
                const cy = road.y + road.height / 2;
                if (Math.abs(node.y - cy) > tol) continue;
                const dist = Math.abs(node.x - x);
                if (nearest === null || dist < nearest.dist) {
                    nearest = { value: node.x, dist };
                }
            }
        }

        if (!nearest || nearest.dist >= minDist) {
            return road.type === 'vertical' ? y : x;
        }

        if (road.type === 'vertical') {
            if (y < nearest.value) {
                return Math.max(road.y + minDist, nearest.value - minDist);
            }
            return Math.min(road.y + road.height - minDist, nearest.value + minDist);
        }

        if (x < nearest.value) {
            return Math.max(road.x + minDist, nearest.value - minDist);
        }
        return Math.min(road.x + road.width - minDist, nearest.value + minDist);
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

    private getLotBounds(lot: Lot) {
        const cached = this.lotBoundsCache.get(lot.id);
        if (cached) return cached;
        const xs = lot.points.map(p => p.x);
        const ys = lot.points.map(p => p.y);
        const bounds = {
            minX: Math.min(...xs),
            minY: Math.min(...ys),
            maxX: Math.max(...xs),
            maxY: Math.max(...ys),
        };
        this.lotBoundsCache.set(lot.id, bounds);
        return bounds;
    }

    getStreetParkingSpot(lot: Lot, vehicleId?: string): { x: number; y: number; rotation: number; id: string } | null {
        const access = lot.roadAccessPoint || lot.entryPoint;
        if (!access) return null;
        return this.getStreetParkingSpotForPoint(access, vehicleId);
    }

    getStreetParkingSpotForPoint(point: Point, vehicleId?: string): { x: number; y: number; rotation: number; id: string } | null {
        const road = this.getRoadAt(point.x, point.y) || this.getNearestRoadSegment(point.x, point.y);
        if (!road) return null;

        const edgeMargin = 28;
        const intersectionClear = 50;
        const offsets = [0, 12, -12, 24, -24, 36, -36];
        const curbInset = Math.max(2, Math.min(6, road.type === 'vertical' ? road.width * 0.15 : road.height * 0.15));

        for (const offset of offsets) {
            let x = point.x;
            let y = point.y;
            let rotation = 0;

            if (road.type === 'vertical') {
                x = road.x + curbInset;
                y = Math.max(road.y + edgeMargin, Math.min(point.y + offset, road.y + road.height - edgeMargin));
                rotation = 0;
                // Force check against intersections
                if (this.isNearIntersection(x, y, 8)) {
                    const adjusted = this.adjustPointIfInIntersection({ x, y }, 12);
                    y = adjusted.y;
                }
            } else {
                y = road.y + curbInset;
                x = Math.max(road.x + edgeMargin, Math.min(point.x + offset, road.x + road.width - edgeMargin));
                rotation = Math.PI / 2;
                // Force check against intersections
                if (this.isNearIntersection(x, y, 8)) {
                    const adjusted = this.adjustPointIfInIntersection({ x, y }, 12);
                    x = adjusted.x;
                }
            }

            // Double check final pos
            if (this.isNearIntersection(x, y, 50)) {
                continue;
            }

            const id = this.getStreetParkingId(x, y);
            if (!vehicleId || this.reserveStreetParking(id, vehicleId)) {
                return { x, y, rotation, id };
            }
        }

        return null;
    }

    releaseStreetParking(id: string, vehicleId: string): void {
        const owner = this.streetParking.get(id);
        if (owner && owner === vehicleId) {
            this.streetParking.delete(id);
        }
    }

    private reserveStreetParking(id: string, vehicleId: string): boolean {
        const owner = this.streetParking.get(id);
        if (owner && owner !== vehicleId) return false;
        this.streetParking.set(id, vehicleId);
        return true;
    }

    private getStreetParkingId(x: number, y: number): string {
        return `${Math.round(x)}:${Math.round(y)}`;
    }

    private isLotAllowedForPedestrian(agent: any, lot: Lot): boolean {
        if (!agent) return lot.usage !== LotUsage.RESIDENTIAL;
        if (agent instanceof Vehicle) return true; // Vehicles (cars) are allowed on lots (parking)
        if (agent.type === AgentType.CAT || agent.type === AgentType.DOG) return true;
        if (Array.isArray(agent.allowedLots) && agent.allowedLots.includes(lot.id)) return true;
        const isResident = agent.data?.homeLot;
        if (isResident && agent.data.homeLot.id === lot.id) return true;
        if (lot.usage === LotUsage.PUBLIC) return true;
        if (lot.usage === LotUsage.COMMERCIAL) return this.isCommercialOpen();
        if (lot.usage === LotUsage.BAR) return this.isBarOpen();
        if (lot.usage === LotUsage.CHURCH) return true;
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

    private getRandomPointInLot(lot: Lot, options: { margin?: number; bias?: Point; radius?: number; attempts?: number } = {}): Point {
        if (lot.points.length === 0) return { x: 0, y: 0 };
        const minX = Math.min(...lot.points.map(p => p.x));
        const maxX = Math.max(...lot.points.map(p => p.x));
        const minY = Math.min(...lot.points.map(p => p.y));
        const maxY = Math.max(...lot.points.map(p => p.y));
        const margin = options.margin ?? 8;
        const attempts = options.attempts ?? 24;
        const insetMinX = minX + margin;
        const insetMaxX = maxX - margin;
        const insetMinY = minY + margin;
        const insetMaxY = maxY - margin;
        const useInset = insetMinX < insetMaxX && insetMinY < insetMaxY;

        const tryPoint = (x: number, y: number) => {
            if (this.isPointInLot(x, y, lot.points)) {
                return { x, y };
            }
            return null;
        };

        if (options.bias) {
            const radius = options.radius ?? 60;
            for (let i = 0; i < Math.min(12, attempts); i++) {
                const angle = Math.random() * Math.PI * 2;
                const r = Math.sqrt(Math.random()) * radius;
                const x = options.bias.x + Math.cos(angle) * r;
                const y = options.bias.y + Math.sin(angle) * r;
                if (useInset && (x < insetMinX || x > insetMaxX || y < insetMinY || y > insetMaxY)) continue;
                const hit = tryPoint(x, y);
                if (hit) return hit;
            }
        }

        for (let i = 0; i < attempts; i++) {
            const x = (useInset ? insetMinX : minX) + Math.random() * ((useInset ? insetMaxX : maxX) - (useInset ? insetMinX : minX));
            const y = (useInset ? insetMinY : minY) + Math.random() * ((useInset ? insetMaxY : maxY) - (useInset ? insetMinY : minY));
            const hit = tryPoint(x, y);
            if (hit) return hit;
        }
        return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
    }

    private getRandomPedestrianDestination(agent: any): THREE.Vector3 {
        const currentSvg = this.toSvg(agent.position);
        const currentLot = this.findLotContainingPoint(currentSvg, this.lots);
        const homeLot = agent.data?.homeLot;
        if (agent.type === AgentType.CAT && homeLot && Math.random() < 0.65) {
            const point = this.getHomeWanderPoint(agent, homeLot, currentSvg);
            return this.toWorld(point, 2);
        }
        if (homeLot && Math.random() < 0.82) {
            const point = this.getHomeWanderPoint(agent, homeLot, currentSvg);
            return this.toWorld(point, 2);
        }

        const allowedLots = this.lots.filter(lot => this.isLotAllowedForPedestrian(agent, lot));
        if (allowedLots.length > 0 && Math.random() < (agent.type === AgentType.CAT ? 0.35 : 0.25)) {
            const lot = allowedLots[Math.floor(Math.random() * allowedLots.length)];
            const point = this.getRandomPointInLot(lot, { margin: 8 });
            return this.toWorld(point, 2);
        }

        if (currentLot && homeLot && currentLot.id === homeLot.id) {
            const nextExit = agent.nextExitTime as number | undefined;
            if (nextExit && this.simTimeSeconds < nextExit) {
                const point = this.getHomeWanderPoint(agent, homeLot, currentSvg);
                return this.toWorld(point, 2);
            }
            agent.nextExitTime = this.simTimeSeconds + 90 + Math.random() * 90;
        }

        if (this.debugPedExitCount < 30) {
            console.warn(`[PedestrianExit] ${agent.id} leaving lot via sidewalk`);
            this.debugPedExitCount++;
        }
        return this.getRandomPointOnSidewalk();
    }

    private getHomeWanderPoint(agent: any, homeLot: Lot, currentSvg: Point): Point {
        const gate = this.getNearestGate(homeLot, currentSvg);
        const center = {
            x: homeLot.points.reduce((s, p) => s + p.x, 0) / homeLot.points.length,
            y: homeLot.points.reduce((s, p) => s + p.y, 0) / homeLot.points.length,
        };
        if (gate) {
            const dx = center.x - gate.x;
            const dy = center.y - gate.y;
            const len = Math.sqrt(dx * dx + dy * dy) || 1;
            // Bias towards the "front yard" (between gate and house center)
            const bias = { x: center.x + (dx / len) * 18, y: center.y + (dy / len) * 18 };
            // Allow larger radius for front yard
            return this.getRandomPointInLot(homeLot, { margin: 10, bias, radius: 120 });
        }

        // Randomly pick a spot in the entire lot (no bias to current position)
        // This prevents agents from getting stuck in a local loop
        return this.getRandomPointInLot(homeLot, { margin: 10 });
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

    private getDriveInPoint(lot: Lot, from: Point, distance: number): Point {
        const center = {
            x: lot.points.reduce((s, p) => s + p.x, 0) / lot.points.length,
            y: lot.points.reduce((s, p) => s + p.y, 0) / lot.points.length,
        };
        const dx = center.x - from.x;
        const dy = center.y - from.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const candidate = { x: from.x + (dx / len) * distance, y: from.y + (dy / len) * distance };
        if (this.isPointInLot(candidate.x, candidate.y, lot.points)) {
            return candidate;
        }
        return from;
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
        this.ensureLotAccess(lot);
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

    private ensureLotAccess(lot: Lot) {
        if (lot.roadAccessPoint && lot.entryPoint) return;
        if (lot.points.length < 3) return;

        let minDistance = Infinity;
        let accessPoint: THREE.Vector3 | null = null;
        let closestRoad: RoadSegment | null = null;

        const centerX = lot.points.reduce((sum: number, p: Point) => sum + p.x, 0) / lot.points.length;
        const centerY = lot.points.reduce((sum: number, p: Point) => sum + p.y, 0) / lot.points.length;

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
    }

    updateTraffic(agents: any[], delta: number) {
        this.simTimeSeconds += delta;
        if (this.parkingLegGroup) {
            this.updateParkingLegDebug(agents);
        }

        // Populate spatial grid for efficient nearby queries (O(n) instead of O(n²))
        this.spatialGrid.populate(agents);

        agents.forEach(agent => {
            const isPedestrian = this.isPedestrian(agent);
            const lotBefore = isPedestrian ? this.findLotContainingPoint(this.toSvg(agent.position), this.lots) : null;
            // For parked vehicles (no driver), check if blocking and snap to curb
            if (agent instanceof Vehicle && !agent.driver) {
                const svg = this.toSvg(agent.position);
                const lot = this.findLotContainingPoint(svg, this.lots);
                // Only check road-parked cars, not lot-parked
                if (!lot && this.isBlockingTraffic(svg.x, svg.y)) {
                    this.snapToRoadsideParking(agent);
                }
                return;
            }

            // Vehicles should not be affected by pedestrian separation forces
            if (agent instanceof Vehicle) {
                const currentSvg = this.toSvg(agent.position);
                const currentLot = this.findLotContainingPoint(currentSvg, this.lots);
                const nearest = this.getNearestRoadPoint(currentSvg.x, currentSvg.y);
                const dx = nearest.x - currentSvg.x;
                const dy = nearest.y - currentSvg.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (!currentLot && dist > 18) {
                    // Hard-correct cars that drift off the road
                    agent.position.x = nearest.x;
                    agent.position.z = nearest.y;
                    agent.target = null;
                    agent.path = [];
                }
                // Don't allow vehicles to stop in intersections; nudge them through.
                if (this.isNearIntersection(currentSvg.x, currentSvg.y, 6) && agent.currentSpeed < 3) {
                    const road = this.getNearestRoadSegment(currentSvg.x, currentSvg.y);
                    if (road) {
                        if (road.type === 'vertical') {
                            const forward = agent.target ? Math.sign(agent.target.z - agent.position.z) || 1 : 1;
                            agent.position.z += forward * 6;
                        } else {
                            const forward = agent.target ? Math.sign(agent.target.x - agent.position.x) || 1 : 1;
                            agent.position.x += forward * 6;
                        }
                    }
                }
                // If our next target is inside an intersection, shift it out.
                if (agent.target) {
                    const targetSvg = this.toSvg(agent.target);
                    if (this.isNearIntersection(targetSvg.x, targetSvg.y, 6)) {
                        const adjusted = this.adjustPointIfInIntersection(targetSvg, 10);
                        agent.target.x = adjusted.x;
                        agent.target.z = adjusted.y;
                    }
                }
                if (!currentLot && !this.isOnRoad(currentSvg.x, currentSvg.y) && this.debugVehicleOffroadCount < 20) {
                    console.warn(`[VehicleRoad] ${agent.id} off-road by ${dist.toFixed(1)} at (${currentSvg.x.toFixed(1)}, ${currentSvg.y.toFixed(1)})`);
                    this.debugVehicleOffroadCount++;
                }

                // Vehicle collision avoidance: slow down when too close to others
                const avoidRadius = 24;
                const minDist = 10;
                let speedFactor = 1;
                let lateralPush = new THREE.Vector3();
                const forward = agent.target
                    ? new THREE.Vector3().subVectors(agent.target, agent.position)
                    : new THREE.Vector3(0, 0, 1);
                forward.y = 0;
                if (forward.lengthSq() < 0.0001) {
                    forward.set(0, 0, 1);
                }
                forward.normalize();
                const lateral = new THREE.Vector3(-forward.z, 0, forward.x);
                let blocking = false;
                let blockedByParked = false;
                // Use spatial grid for O(1) nearby lookup instead of O(n)
                const nearbyAgents = this.spatialGrid.getNearby(agent.position.x, agent.position.z, avoidRadius);
                for (const other of nearbyAgents) {
                    if (agent === other) continue;
                    const distSq = agent.position.distanceToSquared(other.position);
                    if (distSq < avoidRadius * avoidRadius && distSq > 0.01) {
                        const d = Math.sqrt(distSq);
                        const parked = other instanceof Vehicle && !other.driver;
                        if (d < minDist) {
                            const push = new THREE.Vector3().subVectors(agent.position, other.position).normalize();
                            push.multiplyScalar((minDist - d) * 0.6);
                            agent.position.add(push);
                            blocking = true;
                            if (parked) blockedByParked = true;
                        }
                        const factor = d <= minDist ? 0 : (d - minDist) / (avoidRadius - minDist);
                        const floor = parked ? 0.4 : 0;
                        speedFactor = Math.min(speedFactor, Math.max(floor, Math.min(1, factor)));

                        // Lateral avoidance: nudge to the side away from the other agent
                        const toOther = new THREE.Vector3().subVectors(other.position, agent.position);
                        toOther.y = 0;
                        const sideSign = Math.sign(toOther.dot(lateral)) || 1;
                        const strength = (avoidRadius - d) / avoidRadius * (parked ? 1.6 : 1);
                        lateralPush.add(lateral.clone().multiplyScalar(-sideSign * strength));
                    }
                }
                agent.speedModifier = speedFactor;
                const desiredSteer = new THREE.Vector3();
                if (lateralPush.lengthSq() > 0.0001) {
                    const pushScale = blocking ? 0.6 : 0.4;
                    lateralPush.multiplyScalar(pushScale);
                    desiredSteer.add(lateralPush);
                }

                // Lane keeping + pass-around when blocked (on-road only)
                if (!currentLot) {
                    const road = this.getNearestRoadSegment(currentSvg.x, currentSvg.y);
                    if (road) {
                        let laneSign = this.vehicleLane.get(agent.id);
                        if (!laneSign) {
                            laneSign = Math.random() < 0.5 ? -1 : 1;
                            this.vehicleLane.set(agent.id, laneSign);
                        }
                        const laneCooldown = this.vehicleLaneUntil.get(agent.id) ?? 0;
                        const blockedTimer = (agent as any).__blockedTimer || 0;
                        (agent as any).__blockedTimer = blocking ? blockedTimer + delta : 0;
                        if (blocking && (agent as any).__blockedTimer > 0.6 && (this.simTimeSeconds > laneCooldown)) {
                            const targetLane = -laneSign;
                            const laneOffset = (road.type === 'vertical' ? road.width : road.height) * 0.22;
                            const laneCoord = road.type === 'vertical'
                                ? road.x + road.width / 2 + targetLane * laneOffset
                                : road.y + road.height / 2 + targetLane * laneOffset;

                            let laneClear = true;
                            const aheadDist = 40;
                            const behindDist = 18;
                            // Use spatial grid for lane checking
                            const nearbyForLane = this.spatialGrid.getNearby(agent.position.x, agent.position.z, aheadDist);
                            for (const other of nearbyForLane) {
                                if (other === agent) continue;
                                if (!(other instanceof Vehicle)) continue;
                                if (!other.driver) continue;
                                const oSvg = this.toSvg(other.position);
                                const onSameRoad = this.getNearestRoadSegment(oSvg.x, oSvg.y);
                                if (!onSameRoad || onSameRoad.id !== road.id) continue;

                                if (road.type === 'vertical') {
                                    if (Math.abs(oSvg.x - laneCoord) > laneOffset * 0.9) continue;
                                    const dy = oSvg.y - currentSvg.y;
                                    if (dy > -behindDist && dy < aheadDist) {
                                        laneClear = false;
                                        break;
                                    }
                                } else {
                                    if (Math.abs(oSvg.y - laneCoord) > laneOffset * 0.9) continue;
                                    const dx = oSvg.x - currentSvg.x;
                                    if (dx > -behindDist && dx < aheadDist) {
                                        laneClear = false;
                                        break;
                                    }
                                }
                            }

                            if (laneClear) {
                                laneSign = targetLane;
                                this.vehicleLane.set(agent.id, laneSign);
                                this.vehicleLaneUntil.set(agent.id, this.simTimeSeconds + 3);
                            } else {
                                agent.speedModifier = Math.min(agent.speedModifier, 0.6);
                            }
                        }

                        const laneOffset = (road.type === 'vertical' ? road.width : road.height) * 0.22;
                        const laneStrength = blockedByParked ? 4 : 2.5;
                        if (road.type === 'vertical') {
                            const desiredX = road.x + road.width / 2 + laneSign * laneOffset;
                            const shift = desiredX - currentSvg.x;
                            const smooth = Math.max(-laneStrength, Math.min(laneStrength, shift));
                            desiredSteer.x += smooth;
                        } else {
                            const desiredY = road.y + road.height / 2 + laneSign * laneOffset;
                            const shift = desiredY - currentSvg.y;
                            const smooth = Math.max(-laneStrength, Math.min(laneStrength, shift));
                            desiredSteer.z += smooth;
                        }
                    }
                }

                const steer = (agent as any).__steerOffset as THREE.Vector3 | undefined;
                if (!steer) {
                    (agent as any).__steerOffset = desiredSteer;
                } else {
                    steer.lerp(desiredSteer, 0.12);
                }
                const applied = (agent as any).__steerOffset as THREE.Vector3;
                if (agent.target) {
                    const base = (agent as any).__baseTarget as THREE.Vector3 | undefined;
                    if (!base || base.distanceToSquared(agent.target) > 1) {
                        (agent as any).__baseTarget = agent.target.clone();
                    }
                    const baseTarget = (agent as any).__baseTarget as THREE.Vector3;
                    agent.target.x = baseTarget.x + applied.x;
                    agent.target.z = baseTarget.z + applied.z;
                }

                // Stuck detector: reroute if we haven't moved for a while
                const record = this.vehicleStuck.get(agent.id) || {
                    x: currentSvg.x,
                    y: currentSvg.y,
                    t: 0,
                    lastReroute: -Infinity,
                };
                const moved = Math.hypot(currentSvg.x - record.x, currentSvg.y - record.y);
                const isSlow = agent.currentSpeed < 2;
                if (moved < 0.4 && isSlow) {
                    record.t += delta;
                } else {
                    record.t = 0;
                }
                record.x = currentSvg.x;
                record.y = currentSvg.y;

                const rerouteCooldown = 5;
                if (record.t > 3 && (this.simTimeSeconds - record.lastReroute) > rerouteCooldown) {
                    if (record.t > 12) {
                        // Extreme stuck (12s+): Teleport to random road point to clear jam
                        const rescue = this.getRandomPointOnRoad();
                        agent.position.copy(rescue);
                        agent.target = null;
                        agent.path = [];
                        record.t = 0;
                        if (this.debugVehicleOffroadCount < 20) {
                            console.warn(`[Traffic] Rescued permanently stuck vehicle ${agent.id}`);
                            this.debugVehicleOffroadCount++;
                        }
                    } else {
                        // Standard stuck (3s+): Try to reroute
                        let dest: THREE.Vector3 | null = null;
                        if (agent.path && agent.path.length > 0) {
                            dest = agent.path[agent.path.length - 1];
                        } else if (agent.target) {
                            dest = agent.target;
                        } else {
                            const parkingLeg = (agent as any).parkingLeg as THREE.Vector3[] | undefined;
                            if (parkingLeg && parkingLeg.length > 0) {
                                dest = parkingLeg[parkingLeg.length - 1];
                            }
                        }
                        if (!dest) dest = this.getRandomPointOnRoad();

                        const newPath = this.getVehiclePathTo(agent.position, dest, this.lots, agent);
                        if (newPath.length > 0) {
                            agent.path = newPath;
                            agent.target = null;
                        }
                        record.lastReroute = this.simTimeSeconds;
                    }
                }

                this.vehicleStuck.set(agent.id, record);
            }

            // COLLISION AVOIDANCE / SEPARATION
            // Apply a repulsion force from nearby agents to prevent bunching
            const isResident = agent instanceof Resident;
            // Skip for drivers/passengers (isInCar)
            if (!(agent instanceof Vehicle) &&
                agent.behaviorState !== ResidentState.DRIVING &&
                !(isResident && agent.isInCar)) {

                const separationRadius = 12; // Separation distance
                const separationForce = new THREE.Vector3();
                let nearbyCount = 0;

                // Use spatial grid for O(1) nearby lookup instead of O(n)
                const nearbyForSeparation = this.spatialGrid.getNearby(agent.position.x, agent.position.z, separationRadius);
                for (const other of nearbyForSeparation) {
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
                        let strength = (separationRadius - dist) / separationRadius;

                        // EXTRA repulsion from moving vehicles to prevent sticking
                        if (other instanceof Vehicle && other.driver) {
                            strength *= 5.0; // 5x force away from cars
                        }

                        push.multiplyScalar(strength);
                        separationForce.add(push);
                        nearbyCount++;
                    }
                }

                if (nearbyCount > 0) {
                    // Scale force by delta time and a strength factor
                    separationForce.multiplyScalar(delta * 4.0); // Increased base strength from 3.0
                    separationForce.y = 0; // Keep horizontal
                    agent.position.add(separationForce);
                }
            }

            if (isPedestrian) {
                const svg = this.toSvg(agent.position);
                const onPublicPath = this.isOnSidewalk(svg.x, svg.y) || this.isOnRoad(svg.x, svg.y);
                if (!onPublicPath) {
                    const lotAfter = this.findLotContainingPoint(svg, this.lots);
                    const clampLot = lotAfter || lotBefore;
                    if (clampLot) {
                        const bounds = this.getLotBounds(clampLot);
                        const margin = 2;
                        const clampedX = Math.min(bounds.maxX - margin, Math.max(bounds.minX + margin, svg.x));
                        const clampedY = Math.min(bounds.maxY - margin, Math.max(bounds.minY + margin, svg.y));
                        agent.position.x = clampedX;
                        agent.position.z = clampedY;
                    } else {
                        const nearest = this.getNearestSidewalkPoint(svg.x, svg.y);
                        agent.position.x = nearest.x;
                        agent.position.z = nearest.y;
                    }
                }
            }

            // Skip residents who are at home idle or have intentional destinations
            if (agent.behaviorState !== undefined) {
                const state = agent.behaviorState as ResidentState;

                // Agents in cars (Drivers/Passengers) follow the Vehicle, not their own pathing
                if (state === ResidentState.DRIVING || (agent as Resident).isInCar) {
                    return;
                }

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
                        } else {
                            if (this.debugPathFailCount < 20) {
                                const fromSvg = this.toSvg(agent.position);
                                const toSvg = this.toSvg(agent.target);
                                console.error(`[Pathfinding] No path for ${agent.id} from (${fromSvg.x.toFixed(1)},${fromSvg.y.toFixed(1)}) to (${toSvg.x.toFixed(1)},${toSvg.y.toFixed(1)})`);
                                this.debugPathFailCount++;
                            }
                            agent.target = null;
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
                } else {
                    if (!this.isPedestrian(agent) && this.debugPathFailCount < 20) {
                        const fromSvg = this.toSvg(agent.position);
                        const toSvg = this.toSvg(agent.target);
                        console.error(`[Pathfinding] No path for ${agent.id} from (${fromSvg.x.toFixed(1)},${fromSvg.y.toFixed(1)}) to (${toSvg.x.toFixed(1)},${toSvg.y.toFixed(1)})`);
                        this.debugPathFailCount++;
                    }
                    agent.target = null;
                    if (this.isPedestrian(agent)) {
                        const currentLot = this.findLotContainingPoint(this.toSvg(agent.position), this.lots);
                        if (currentLot) {
                            const stay = this.getRandomPointInLot(currentLot, { margin: 10 });
                            agent.path = [this.toWorld(stay, 2)];
                        }
                    }
                }
            }

            // If no path and no target, pick a new destination (pedestrians only)
            if (this.isPedestrian(agent) && (!agent.path || agent.path.length === 0) && !agent.target) {
                // Get current position in SVG coordinates
                // 3D (x, y, z) → SVG (x, y): svgX = position.x, svgY = position.z
                const currentSvgX = agent.position.x;
                const currentSvgY = agent.position.z;

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
                        prePath.push(this.toWorld(gatePoint, 1));
                        startPoint = gatePoint;
                    }

                    const nearest = isPedestrian
                        ? this.getNearestSidewalkPoint(startPoint.x, startPoint.y)
                        : this.getNearestRoadPoint(startPoint.x, startPoint.y);
                    prePath.push(this.toWorld(nearest, 1));
                    startPoint = nearest;
                }

                // Pick a random destination on the appropriate network
                const destination = isPedestrian ? this.getRandomPedestrianDestination(agent) : this.getRandomPointOnRoad();

                if (isPedestrian) {
                    const path = this.getPedestrianPathTo(agent.position, destination, this.lots, agent);
                    if (path.length > 0) {
                        agent.path = path;
                    } else if (this.debugPathFailCount < 20) {
                        const destinationSvg = this.toSvg(destination);
                        console.error(`[Pathfinding] No path found for ${agent.id} (start=(${startPoint.x.toFixed(1)},${startPoint.y.toFixed(1)}), dest=(${destinationSvg.x.toFixed(1)},${destinationSvg.y.toFixed(1)}))`);
                        this.debugPathFailCount++;
                    }
                    return;
                }

                // Find path using road graph from road point to destination
                // destination is in 3D coords, convert back to SVG for pathfinding: svgY = z
                const destinationSvg = this.toSvg(destination);
                const pathPoints = this.graph.findPath(startPoint, destinationSvg);

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
                    const graphPath = pathPoints.slice(1).map(p => this.toWorld(p, 1));
                    agent.path = [...prePath, ...graphPath];
                } else if (prePath.length > 0) {
                    // At least go to the road
                    agent.path = prePath;
                } else if (this.debugPathFailCount < 20) {
                    console.error(`[Pathfinding] No path found for ${agent.id} (start=(${startPoint.x.toFixed(1)},${startPoint.y.toFixed(1)}), dest=(${destinationSvg.x.toFixed(1)},${destinationSvg.y.toFixed(1)}))`);
                    this.debugPathFailCount++;
                }
            }

            // Process path - set next waypoint as target
            if (agent.path && agent.path.length > 0 && !agent.target) {
                const next = agent.path.shift();
                if (next && this.isPedestrian(agent)) {
                    let isPrePathPoint = false;
                    if (agent.prePath && agent.prePath.length > 0) {
                        const prePoint = agent.prePath[0];
                        if (prePoint && prePoint.distanceTo(next) < 2) {
                            isPrePathPoint = true;
                            agent.prePath.shift();
                        }
                    }
                    if (!isPrePathPoint) {
                        const nextSvg = this.toSvg(next);

                        const nextLot = this.findLotContainingPoint(nextSvg, this.lots);
                        const currentSvg = this.toSvg(agent.position);
                        const currentLot = this.findLotContainingPoint(currentSvg, this.lots);
                        const gateNearby = currentLot?.gatePositions?.some(g => {
                            const dx = g.x - nextSvg.x;
                            const dy = g.y - nextSvg.y;
                            return Math.sqrt(dx * dx + dy * dy) < 8;
                        }) ?? false;

                        const onPublicPath = this.isOnSidewalk(nextSvg.x, nextSvg.y) || this.isOnRoad(nextSvg.x, nextSvg.y);

                        if (!onPublicPath && currentLot && nextLot && currentLot.id !== nextLot.id && !gateNearby) {
                            if (this.debugPedExitCount < 40) {
                                console.warn(`[PedestrianExit] Blocked ${agent.id} crossing lots currentLot=${currentLot.id} nextLot=${nextLot.id} next=(${nextSvg.x.toFixed(1)},${nextSvg.y.toFixed(1)})`);
                                this.debugPedExitCount++;
                            }
                            agent.path = [];
                            agent.target = null;
                            return;
                        }

                        if (!onPublicPath && currentLot && !nextLot && !gateNearby) {
                            if (this.debugPedExitCount < 40) {
                                console.warn(`[PedestrianExit] Blocked ${agent.id} leaving lot ${currentLot.id} without gate next=(${nextSvg.x.toFixed(1)},${nextSvg.y.toFixed(1)})`);
                                this.debugPedExitCount++;
                            }
                            agent.path = [];
                            agent.target = null;
                            return;
                        }

                        if (!onPublicPath && nextLot && !currentLot && !this.isLotAllowedForPedestrian(agent, nextLot)) {
                            if (this.debugPedExitCount < 40) {
                                console.warn(`[PedestrianExit] Blocked ${agent.id} entering lot ${nextLot.id} next=(${nextSvg.x.toFixed(1)},${nextSvg.y.toFixed(1)})`);
                                this.debugPedExitCount++;
                            }
                            agent.path = [];
                            agent.target = null;
                            return;
                        }
                    }
                }
                agent.target = next || null;
            }
        });
    }

    enforcePedestrianBounds(agents: any[]) {
        for (const agent of agents) {
            if (!this.isPedestrian(agent)) continue;
            const svg = this.toSvg(agent.position);
            const onPublicPath = this.isOnSidewalk(svg.x, svg.y) || this.isOnRoad(svg.x, svg.y);
            if (onPublicPath) continue;

            const lot = this.findLotContainingPoint(svg, this.lots);
            if (lot && this.isLotAllowedForPedestrian(agent, lot)) {
                const bounds = this.getLotBounds(lot);
                const margin = 2;
                const clampedX = Math.min(bounds.maxX - margin, Math.max(bounds.minX + margin, svg.x));
                const clampedY = Math.min(bounds.maxY - margin, Math.max(bounds.minY + margin, svg.y));
                agent.position.x = clampedX;
                agent.position.z = clampedY;
                continue;
            }

            const nearest = this.getNearestSidewalkPoint(svg.x, svg.y);
            agent.position.x = nearest.x;
            agent.position.z = nearest.y;
        }
    }

    getDebugVisualization(): THREE.Group {
        if (this.debugGroup) return this.debugGroup;

        this.debugGroup = new THREE.Group();
        this.debugGroup.name = 'PathfindingDebug';

        const roadDebug = this.graph.createDebugVisualization();
        this.debugGroup.add(roadDebug);

        return this.debugGroup;
    }

    setParkingLegDebugEnabled(enabled: boolean) {
        this.parkingLegDebugEnabled = enabled;
        if (!this.debugGroup) return;
        if (enabled) {
            if (!this.parkingLegGroup) {
                this.parkingLegGroup = new THREE.Group();
                this.parkingLegGroup.name = 'ParkingLegs';
                this.debugGroup.add(this.parkingLegGroup);
                this.parkingLegMaterial = new THREE.LineBasicMaterial({ color: 0x55d6ff });
            }
        } else {
            if (this.parkingLegGroup && this.parkingLegGroup.parent) {
                this.parkingLegGroup.parent.remove(this.parkingLegGroup);
            }
            this.parkingLegGroup = null;
            if (this.parkingLegMaterial) {
                this.parkingLegMaterial.dispose();
                this.parkingLegMaterial = null;
            }
        }
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

    getPedestrianDebugVisualization(): THREE.Group {
        return this.pedestrianGraph.createDebugVisualization();
    }

    removePedestrianDebugVisualization() {
        this.pedestrianGraph.removeDebugVisualization();
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

    // Parking spot management

    /**
     * Find and reserve an available parking spot on a lot
     * Returns the spot and its position, or null if none available
     */
    reserveParkingSpot(lot: Lot, vehicleId: string): { x: number; y: number; rotation: number } | null {
        if (!lot.parkingSpots || lot.parkingSpots.length === 0) {
            // Fallback to legacy single spot
            if (lot.parkingSpot) {
                return {
                    x: lot.parkingSpot.x,
                    y: lot.parkingSpot.y,
                    rotation: lot.parkingRotation || 0
                };
            }
            return null;
        }

        // Find first available spot
        const availableSpot = lot.parkingSpots.find(spot => spot.occupiedBy === null);
        if (availableSpot) {
            availableSpot.occupiedBy = vehicleId;
            return {
                x: availableSpot.x,
                y: availableSpot.y,
                rotation: availableSpot.rotation
            };
        }

        return null; // All spots occupied
    }

    /**
     * Release a parking spot when a vehicle leaves
     */
    releaseParkingSpot(lot: Lot, vehicleId: string): void {
        if (!lot.parkingSpots) return;

        const spot = lot.parkingSpots.find(s => s.occupiedBy === vehicleId);
        if (spot) {
            spot.occupiedBy = null;
        }
    }

    /**
     * Check if a lot has any available parking spots
     */
    hasAvailableParking(lot: Lot): boolean {
        if (!lot.parkingSpots || lot.parkingSpots.length === 0) {
            return lot.parkingSpot !== undefined;
        }
        return lot.parkingSpots.some(spot => spot.occupiedBy === null);
    }

    /**
     * Get the number of available parking spots on a lot
     */
    getAvailableParkingCount(lot: Lot): number {
        if (!lot.parkingSpots || lot.parkingSpots.length === 0) {
            return lot.parkingSpot ? 1 : 0;
        }
        return lot.parkingSpots.filter(spot => spot.occupiedBy === null).length;
    }

    /**
     * Snap a vehicle to a proper roadside parking position.
     * Call this when a driver exits to prevent cars blocking the road.
     * Returns true if the vehicle was moved to a proper spot.
     */
    snapToRoadsideParking(vehicle: Vehicle): boolean {
        const svg = this.toSvg(vehicle.position);

        // Check if vehicle is in a lot (proper parking) - if so, leave it alone
        const lot = this.findLotContainingPoint(svg, this.lots);
        if (lot) {
            return true; // Already parked in a lot
        }

        // Check if on road - if so, need to move to curb
        const road = this.getRoadAt(svg.x, svg.y);
        if (!road) {
            // Not on road, not in lot - might be on sidewalk or edge, leave it
            return true;
        }

        // Vehicle is on a road - check if it's blocking (in middle vs curb)
        const curbInset = Math.max(2, Math.min(6, road.type === 'vertical' ? road.width * 0.15 : road.height * 0.15));
        const isNearCurb = road.type === 'vertical'
            ? (svg.x <= road.x + curbInset + 4 || svg.x >= road.x + road.width - curbInset - 4)
            : (svg.y <= road.y + curbInset + 4 || svg.y >= road.y + road.height - curbInset - 4);

        // Also check if near intersection - always need to move away
        const nearIntersection = this.isNearIntersection(svg.x, svg.y, 30);

        if (isNearCurb && !nearIntersection) {
            // Already parked at curb and not blocking intersection
            // Just ensure rotation is aligned with road
            vehicle.targetRotation = road.type === 'vertical' ? 0 : Math.PI / 2;
            if (vehicle.carGroup) {
                vehicle.carGroup.rotation.y = vehicle.targetRotation;
            }
            return true;
        }

        // Need to snap to proper curb position
        const curbSpot = this.getCurbsidePointNearRoad(svg);
        if (!curbSpot) {
            return false;
        }

        // Move vehicle to curb position
        const worldPos = this.toWorld(curbSpot.point, 1);
        vehicle.position.copy(worldPos);
        vehicle.targetRotation = curbSpot.rotation;
        if (vehicle.carGroup) {
            vehicle.carGroup.position.copy(worldPos);
            vehicle.carGroup.rotation.y = curbSpot.rotation;
        }
        vehicle.target = null;
        vehicle.path = [];

        return true;
    }

    /**
     * Check if a point is blocking traffic (in middle of road or near intersection).
     * Used to validate parking positions.
     */
    isBlockingTraffic(x: number, y: number): boolean {
        const road = this.getRoadAt(x, y);
        if (!road) return false; // Not on road

        // Check if near intersection
        if (this.isNearIntersection(x, y, 25)) {
            return true;
        }

        // Check if in middle of road (not at curb)
        const laneWidth = road.type === 'vertical' ? road.width : road.height;
        const centerThreshold = laneWidth * 0.3; // Within 30% of center = blocking

        if (road.type === 'vertical') {
            const center = road.x + road.width / 2;
            return Math.abs(x - center) < centerThreshold;
        } else {
            const center = road.y + road.height / 2;
            return Math.abs(y - center) < centerThreshold;
        }
    }

}
