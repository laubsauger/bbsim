import * as THREE from 'three';
import { RoadSegment, Point } from "../types";

interface GraphNode {
    id: string; // "x,y"
    x: number;
    y: number;
    connections: string[]; // IDs of connected nodes
}

export class RoadGraph {
    nodes: Map<string, GraphNode> = new Map();
    debugGroup: THREE.Group | null = null;

    constructor(roads: RoadSegment[]) {
        this.buildGraph(roads);
        console.log(`[RoadGraph] Built simpler graph with ${this.nodes.size} nodes (Intersections only)`);
        this.verifyConnectivity();
    }

    private verifyConnectivity() {
        if (this.nodes.size === 0) return;
        const startNode = this.nodes.values().next().value;
        if (!startNode) return;

        const visited = new Set<string>();
        const stack = [startNode.id];

        while (stack.length > 0) {
            const id = stack.pop()!;
            if (visited.has(id)) continue;
            visited.add(id);
            const node = this.nodes.get(id);
            if (node) {
                node.connections.forEach(cid => {
                    if (!visited.has(cid)) stack.push(cid);
                });
            }
        }

        if (visited.size !== this.nodes.size) {
            console.error(`[RoadGraph] GRAPH DISCONNECTED! Reachable: ${visited.size}, Total: ${this.nodes.size}. Vehicles will fail to cross gaps.`);
            const unreached = Array.from(this.nodes.keys()).filter(id => !visited.has(id));
            console.warn(`[RoadGraph] First 5 unreachable nodes: ${unreached.slice(0, 5).join(', ')}`);
        } else {
            console.log(`[RoadGraph] Connectivity Verified: All ${this.nodes.size} nodes are fully connected.`);
        }
    }

    getBounds(): { minX: number; maxX: number; minY: number; maxY: number } | null {
        if (this.nodes.size === 0) return null;
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        for (const node of this.nodes.values()) {
            if (node.x < minX) minX = node.x;
            if (node.x > maxX) maxX = node.x;
            if (node.y < minY) minY = node.y;
            if (node.y > maxY) maxY = node.y;
        }
        return { minX, maxX, minY, maxY };
    }

    private buildGraph(roads: RoadSegment[]) {
        // Collect all strict intersection points first
        const intersectionPoints: Point[] = [];

        // Compare every Vertical road vs Horizontal road for intersections
        const vRoads = roads.filter(r => r.type === 'vertical');
        const hRoads = roads.filter(r => r.type === 'horizontal');

        vRoads.forEach(v => {
            const vx = v.x + v.width / 2;
            hRoads.forEach(h => {
                const hy = h.y + h.height / 2;

                // Check strict mathematical intersection with small tolerance
                // Use a small epsilon for floating point safety
                const vYStart = v.y;
                const vYEnd = v.y + v.height;
                const hXStart = h.x;
                const hXEnd = h.x + h.width;

                const tol = 2.0;
                // If the horizontal line (hy) is within the vertical range
                const inVRange = hy >= vYStart - tol && hy <= vYEnd + tol;
                // If the vertical line (vx) is within the horizontal range
                const inHRange = vx >= hXStart - tol && vx <= hXEnd + tol;

                if (inVRange && inHRange) {
                    intersectionPoints.push({ x: vx, y: hy });
                }
            });
        });

        // Now traverse each road, find which points lie on it, sort them, and link them
        roads.forEach(road => {
            const pointsOnRoad: Point[] = [];

            // Add Endpoints
            if (road.type === 'vertical') {
                const cx = road.x + road.width / 2;
                pointsOnRoad.push({ x: cx, y: road.y });
                pointsOnRoad.push({ x: cx, y: road.y + road.height });
            } else {
                const cy = road.y + road.height / 2;
                pointsOnRoad.push({ x: road.x, y: cy });
                pointsOnRoad.push({ x: road.x + road.width, y: cy });
            }

            // Add Intersections that fall on this road
            intersectionPoints.forEach(p => {
                if (road.type === 'vertical') {
                    const cx = road.x + road.width / 2;
                    // Check Logic: Close to X centerline, and within Y range
                    if (Math.abs(p.x - cx) < 1 && p.y >= road.y && p.y <= road.y + road.height) {
                        // Avoid dupe endpoints
                        // Actually Map Set handles dupes by ID, but let's push it anyway
                        pointsOnRoad.push(p);
                    }
                } else {
                    const cy = road.y + road.height / 2;
                    if (Math.abs(p.y - cy) < 1 && p.x >= road.x && p.x <= road.x + road.width) {
                        pointsOnRoad.push(p);
                    }
                }
            });

            // Sort points linearly
            if (road.type === 'vertical') {
                pointsOnRoad.sort((a, b) => a.y - b.y);
            } else {
                pointsOnRoad.sort((a, b) => a.x - b.x);
            }

            // Create Nodes and Filter duplicates (Points very close to each other)
            const uniqueNodes: string[] = [];
            let lastId = '';

            pointsOnRoad.forEach(p => {
                this.addNode(p);
                const id = this.getNodeId(p);
                if (id !== lastId) {
                    uniqueNodes.push(id);
                    lastId = id;
                }
            });

            // Connect sequential nodes
            for (let i = 0; i < uniqueNodes.length - 1; i++) {
                this.addEdge(uniqueNodes[i], uniqueNodes[i + 1]);
            }
        });
    }

    private getNodeId(p: Point): string {
        // Use precision to ensure intersection matches
        return `${Math.round(p.x)},${Math.round(p.y)}`;
    }

    private addNode(p: Point) {
        const id = this.getNodeId(p);
        if (!this.nodes.has(id)) {
            this.nodes.set(id, {
                id,
                x: p.x,
                y: p.y,
                connections: []
            });
        }
    }

    private addEdge(id1: string, id2: string) {
        const n1 = this.nodes.get(id1);
        const n2 = this.nodes.get(id2);

        if (n1 && !n1.connections.includes(id2)) n1.connections.push(id2);
        if (n2 && !n2.connections.includes(id1)) n2.connections.push(id1);
    }

    // Identify the closest graph node to a given position
    getClosestNode(p: Point): GraphNode | null {
        let minDist = Infinity;
        let closest: GraphNode | null = null;

        for (const node of this.nodes.values()) {
            const dx = node.x - p.x;
            const dy = node.y - p.y;
            const dist = dx * dx + dy * dy;

            if (dist < minDist) {
                minDist = dist;
                closest = node;
            }
        }
        return closest;
    }

    // A* Pathfinding
    findPath(start: Point, end: Point): Point[] {
        const startNode = this.getClosestNode(start);
        const endNode = this.getClosestNode(end);

        if (!startNode || !endNode) return [];

        const openSet = new Set<string>([startNode.id]);
        const cameFrom = new Map<string, string>();

        const gScore = new Map<string, number>();
        gScore.set(startNode.id, 0);

        const fScore = new Map<string, number>();
        fScore.set(startNode.id, this.heuristic(startNode, endNode));

        while (openSet.size > 0) {
            let currentId = this.getLowestFScore(openSet, fScore);
            if (!currentId) break;

            if (currentId === endNode.id) {
                return this.reconstructPath(cameFrom, currentId);
            }

            openSet.delete(currentId);
            const current = this.nodes.get(currentId)!;

            for (const neighborId of current.connections) {
                const neighbor = this.nodes.get(neighborId)!;
                const tentativeG = (gScore.get(currentId) || Infinity) + this.dist(current, neighbor);

                if (tentativeG < (gScore.get(neighborId) || Infinity)) {
                    cameFrom.set(neighborId, currentId);
                    gScore.set(neighborId, tentativeG);
                    fScore.set(neighborId, tentativeG + this.heuristic(neighbor, endNode));

                    if (!openSet.has(neighborId)) {
                        openSet.add(neighborId);
                    }
                }
            }
        }

        return []; // No path found
    }

    private getLowestFScore(openSet: Set<string>, fScore: Map<string, number>): string | null {
        let lowestId: string | null = null;
        let lowestScore = Infinity;

        openSet.forEach(id => {
            const score = fScore.get(id) || Infinity;
            if (score < lowestScore) {
                lowestScore = score;
                lowestId = id;
            }
        });

        return lowestId;
    }

    private reconstructPath(cameFrom: Map<string, string>, currentId: string): Point[] {
        const totalPath: Point[] = [];
        let curr: string | undefined = currentId;

        while (curr) {
            const node = this.nodes.get(curr)!;
            totalPath.unshift({ x: node.x, y: node.y });
            curr = cameFrom.get(curr);
        }
        return totalPath;
    }

    private heuristic(n1: GraphNode, n2: GraphNode): number {
        return Math.sqrt((n1.x - n2.x) ** 2 + (n1.y - n2.y) ** 2);
    }

    private dist(n1: GraphNode, n2: GraphNode): number {
        return Math.sqrt((n1.x - n2.x) ** 2 + (n1.y - n2.y) ** 2);
    }

    // Debug visualization
    createDebugVisualization(): THREE.Group {
        if (this.debugGroup) {
            return this.debugGroup;
        }

        this.debugGroup = new THREE.Group();
        this.debugGroup.name = 'RoadGraphDebug';

        // Create spheres for nodes
        const nodeMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        const nodeGeometry = new THREE.SphereGeometry(8, 8, 8); // Slightly bigger for visibility

        // Create lines for edges
        const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x00ff00, linewidth: 2 });
        const drawnEdges = new Set<string>();

        for (const node of this.nodes.values()) {
            // Node sphere - convert SVG coords to 3D: (x, height, y)
            const sphere = new THREE.Mesh(nodeGeometry, nodeMaterial);
            sphere.position.set(node.x, 2, node.y); // Lower height (2) to align with roads/cars
            this.debugGroup.add(sphere);

            // Edges
            for (const connId of node.connections) {
                const edgeKey = [node.id, connId].sort().join('|');
                if (drawnEdges.has(edgeKey)) continue;
                drawnEdges.add(edgeKey);

                const conn = this.nodes.get(connId);
                if (!conn) continue;

                const points = [
                    new THREE.Vector3(node.x, 2, node.y),
                    new THREE.Vector3(conn.x, 2, conn.y)
                ];
                const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
                const line = new THREE.Line(lineGeo, edgeMaterial);
                this.debugGroup.add(line);
            }
        }

        console.log(`[RoadGraph Debug] Created visualization: ${this.nodes.size} nodes, ${drawnEdges.size} edges`);
        return this.debugGroup;
    }

    removeDebugVisualization() {
        if (this.debugGroup && this.debugGroup.parent) {
            this.debugGroup.parent.remove(this.debugGroup);
        }
        this.debugGroup = null;
    }
}
