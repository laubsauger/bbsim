import * as THREE from 'three';
import { RoadSegment, Point } from "../types";

interface GraphNode {
    id: string;
    x: number;
    y: number;
    connections: string[];
}

interface SidewalkLine {
    id: string;
    type: 'vertical' | 'horizontal';
    x: number;
    y: number;
    length: number;
}

export class PedestrianGraph {
    nodes: Map<string, GraphNode> = new Map();
    debugGroup: THREE.Group | null = null;
    private offset: number;

    constructor(roads: RoadSegment[], offset: number = 12) {
        this.offset = offset;
        this.buildGraph(roads);
        console.log(`[PedestrianGraph] Built graph with ${this.nodes.size} nodes`);
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
        const nodeSpacing = 150; // Increased from 50 to reduce density
        const sidewalkLines: SidewalkLine[] = [];

        roads.forEach((road, index) => {
            if (road.type === 'vertical') {
                const leftX = road.x - this.offset;
                const rightX = road.x + road.width + this.offset;
                sidewalkLines.push({
                    id: `v${index}-left`,
                    type: 'vertical',
                    x: leftX,
                    y: road.y,
                    length: road.height
                });
                sidewalkLines.push({
                    id: `v${index}-right`,
                    type: 'vertical',
                    x: rightX,
                    y: road.y,
                    length: road.height
                });
            } else {
                const topY = road.y - this.offset;
                const bottomY = road.y + road.height + this.offset;
                sidewalkLines.push({
                    id: `h${index}-top`,
                    type: 'horizontal',
                    x: road.x,
                    y: topY,
                    length: road.width
                });
                sidewalkLines.push({
                    id: `h${index}-bottom`,
                    type: 'horizontal',
                    x: road.x,
                    y: bottomY,
                    length: road.width
                });
            }
        });

        // Build nodes along each sidewalk line
        sidewalkLines.forEach(line => {
            const nodesOnLine: Point[] = [];
            if (line.type === 'vertical') {
                const startY = line.y;
                const endY = line.y + line.length;
                const len = endY - startY;
                const numSegments = Math.max(1, Math.ceil(len / nodeSpacing));
                for (let i = 0; i <= numSegments; i++) {
                    const y = startY + (len * i / numSegments);
                    nodesOnLine.push({ x: line.x, y });
                }
            } else {
                const startX = line.x;
                const endX = line.x + line.length;
                const len = endX - startX;
                const numSegments = Math.max(1, Math.ceil(len / nodeSpacing));
                for (let i = 0; i <= numSegments; i++) {
                    const x = startX + (len * i / numSegments);
                    nodesOnLine.push({ x, y: line.y });
                }
            }

            nodesOnLine.forEach(p => this.addNode(p));
            for (let i = 0; i < nodesOnLine.length - 1; i++) {
                this.addEdge(this.getNodeId(nodesOnLine[i]), this.getNodeId(nodesOnLine[i + 1]));
            }
        });

        // Add intersection nodes between vertical and horizontal sidewalk lines
        const verticalLines = sidewalkLines.filter(line => line.type === 'vertical');
        const horizontalLines = sidewalkLines.filter(line => line.type === 'horizontal');

        verticalLines.forEach(vLine => {
            horizontalLines.forEach(hLine => {
                const ix = vLine.x;
                const iy = hLine.y;
                const vInRange = iy >= vLine.y && iy <= vLine.y + vLine.length;
                const hInRange = ix >= hLine.x && ix <= hLine.x + hLine.length;
                if (vInRange && hInRange) {
                    const intersection: Point = { x: ix, y: iy };
                    this.addNode(intersection);
                    const intersectionId = this.getNodeId(intersection);
                    this.connectToNearestOnLine(intersectionId, vLine);
                    this.connectToNearestOnLine(intersectionId, hLine);
                }
            });
        });

        // Add crosswalk connections at road intersections
        this.addCrosswalks(roads);

        // Snap-close nodes for connectivity
        const snapDistance = 28;
        const nodeArray = Array.from(this.nodes.values());
        for (let i = 0; i < nodeArray.length; i++) {
            for (let j = i + 1; j < nodeArray.length; j++) {
                const n1 = nodeArray[i];
                const n2 = nodeArray[j];
                const dist = Math.sqrt((n1.x - n2.x) ** 2 + (n1.y - n2.y) ** 2);
                if (dist < snapDistance && dist > 0) {
                    this.addEdge(n1.id, n2.id);
                }
            }
        }
    }

    private addCrosswalks(roads: RoadSegment[]) {
        // Connect nodes on opposite sides of the road directly
        const nodes = Array.from(this.nodes.values());

        roads.forEach(road => {
            const tolerance = 5; // Alignment tolerance

            if (road.type === 'vertical') {
                const leftX = road.x - this.offset;
                const rightX = road.x + road.width + this.offset;

                // Find all nodes on the left sidewalk
                const leftNodes = nodes.filter(n => Math.abs(n.x - leftX) < 1 && n.y >= road.y && n.y <= road.y + road.height);

                leftNodes.forEach(ln => {
                    // Find matching node on the right sidewalk (same Y)
                    const matches = nodes.filter(rn =>
                        Math.abs(rn.x - rightX) < 1 &&
                        Math.abs(rn.y - ln.y) < tolerance
                    );
                    matches.forEach(rn => {
                        this.addEdge(ln.id, rn.id);
                    });
                });

            } else {
                const topY = road.y - this.offset;
                const bottomY = road.y + road.height + this.offset;

                // Find all nodes on the top sidewalk
                const topNodes = nodes.filter(n => Math.abs(n.y - topY) < 1 && n.x >= road.x && n.x <= road.x + road.width);

                topNodes.forEach(tn => {
                    // Find matching node on the bottom sidewalk (same X)
                    const matches = nodes.filter(bn =>
                        Math.abs(bn.y - bottomY) < 1 &&
                        Math.abs(bn.x - tn.x) < tolerance
                    );
                    matches.forEach(bn => {
                        this.addEdge(tn.id, bn.id);
                    });
                });
            }
        });
    }

    private connectToNearestOnLine(nodeId: string, line: SidewalkLine) {
        const node = this.nodes.get(nodeId);
        if (!node) return;

        let closest1: GraphNode | null = null;
        let closest2: GraphNode | null = null;
        let dist1 = Infinity;
        let dist2 = Infinity;

        for (const n of this.nodes.values()) {
            if (n.id === nodeId) continue;

            const onLine = line.type === 'vertical'
                ? Math.abs(n.x - line.x) < 5 && n.y >= line.y && n.y <= line.y + line.length
                : Math.abs(n.y - line.y) < 5 && n.x >= line.x && n.x <= line.x + line.length;

            if (onLine) {
                const d = Math.sqrt((n.x - node.x) ** 2 + (n.y - node.y) ** 2);
                if (d < dist1) {
                    dist2 = dist1;
                    closest2 = closest1;
                    dist1 = d;
                    closest1 = n;
                } else if (d < dist2) {
                    dist2 = d;
                    closest2 = n;
                }
            }
        }

        if (closest1) this.addEdge(nodeId, closest1.id);
        if (closest2) this.addEdge(nodeId, closest2.id);
    }

    private getNodeId(p: Point): string {
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
                const tentativeG = (gScore.get(currentId) ?? Infinity) + this.dist(current, neighbor);

                if (tentativeG < (gScore.get(neighborId) ?? Infinity)) {
                    cameFrom.set(neighborId, currentId);
                    gScore.set(neighborId, tentativeG);
                    fScore.set(neighborId, tentativeG + this.heuristic(neighbor, endNode));

                    if (!openSet.has(neighborId)) {
                        openSet.add(neighborId);
                    }
                }
            }
        }

        return [];
    }

    private getLowestFScore(openSet: Set<string>, fScore: Map<string, number>): string | null {
        let lowestId: string | null = null;
        let lowestScore = Infinity;

        openSet.forEach(id => {
            const score = fScore.get(id) ?? Infinity;
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

    createDebugVisualization(): THREE.Group {
        if (this.debugGroup) {
            return this.debugGroup;
        }

        this.debugGroup = new THREE.Group();
        this.debugGroup.name = 'PedestrianGraphDebug';

        const nodeMaterial = new THREE.MeshBasicMaterial({ color: 0x55d6ff });
        const nodeGeometry = new THREE.SphereGeometry(4, 8, 8);
        const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x7fffd4 });
        const drawnEdges = new Set<string>();

        for (const node of this.nodes.values()) {
            const sphere = new THREE.Mesh(nodeGeometry, nodeMaterial);
            sphere.position.set(node.x, 8, node.y);
            this.debugGroup.add(sphere);

            for (const connId of node.connections) {
                const edgeKey = [node.id, connId].sort().join('|');
                if (drawnEdges.has(edgeKey)) continue;
                drawnEdges.add(edgeKey);

                const conn = this.nodes.get(connId);
                if (!conn) continue;
                const points = [
                    new THREE.Vector3(node.x, 8, node.y),
                    new THREE.Vector3(conn.x, 8, conn.y)
                ];
                const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
                const line = new THREE.Line(lineGeo, edgeMaterial);
                this.debugGroup.add(line);
            }
        }

        console.log(`[PedestrianGraph Debug] Created visualization: ${this.nodes.size} nodes, ${drawnEdges.size} edges`);
        return this.debugGroup;
    }

    removeDebugVisualization() {
        if (this.debugGroup && this.debugGroup.parent) {
            this.debugGroup.parent.remove(this.debugGroup);
        }
        this.debugGroup = null;
    }
}
