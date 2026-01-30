import { RoadSegment, Point } from "../types";

interface GraphNode {
    id: string; // "x,y"
    x: number;
    y: number;
    connections: string[]; // IDs of connected nodes
}

export class RoadGraph {
    nodes: Map<string, GraphNode> = new Map();

    constructor(roads: RoadSegment[]) {
        this.buildGraph(roads);
    }

    private buildGraph(roads: RoadSegment[]) {
        const nodeSpacing = 50; // Add nodes every 50 units along roads

        // For each road, create nodes along its centerline
        roads.forEach(road => {
            const nodesOnRoad: Point[] = [];

            if (road.type === 'vertical') {
                const cx = road.x + road.width / 2;
                const startY = road.y;
                const endY = road.y + road.height;
                const length = endY - startY;
                const numSegments = Math.max(1, Math.ceil(length / nodeSpacing));

                for (let i = 0; i <= numSegments; i++) {
                    const y = startY + (length * i / numSegments);
                    nodesOnRoad.push({ x: cx, y });
                }
            } else {
                const cy = road.y + road.height / 2;
                const startX = road.x;
                const endX = road.x + road.width;
                const length = endX - startX;
                const numSegments = Math.max(1, Math.ceil(length / nodeSpacing));

                for (let i = 0; i <= numSegments; i++) {
                    const x = startX + (length * i / numSegments);
                    nodesOnRoad.push({ x, y: cy });
                }
            }

            // Add nodes and connect them sequentially
            nodesOnRoad.forEach(p => this.addNode(p));
            for (let i = 0; i < nodesOnRoad.length - 1; i++) {
                this.addEdge(this.getNodeId(nodesOnRoad[i]), this.getNodeId(nodesOnRoad[i + 1]));
            }
        });

        // Find intersections between roads and connect them
        for (let i = 0; i < roads.length; i++) {
            for (let j = i + 1; j < roads.length; j++) {
                const r1 = roads[i];
                const r2 = roads[j];

                if (r1.type !== r2.type) {
                    const vert = r1.type === 'vertical' ? r1 : r2;
                    const horiz = r1.type === 'horizontal' ? r1 : r2;

                    const vertX = vert.x + vert.width / 2;
                    const horizY = horiz.y + horiz.height / 2;

                    const inVertRange = horizY >= vert.y && horizY <= vert.y + vert.height;
                    const inHorizRange = vertX >= horiz.x && vertX <= horiz.x + horiz.width;

                    if (inVertRange && inHorizRange) {
                        const intersection: Point = { x: vertX, y: horizY };
                        this.addNode(intersection);
                        const intersectionId = this.getNodeId(intersection);

                        // Connect to nearest nodes on both roads
                        this.connectToNearestOnRoad(intersectionId, vert);
                        this.connectToNearestOnRoad(intersectionId, horiz);
                    }
                }
            }
        }

        // Connect nodes that are very close (road junctions)
        const snapDistance = 30;
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

    private connectToNearestOnRoad(nodeId: string, road: RoadSegment) {
        const node = this.nodes.get(nodeId);
        if (!node) return;

        // Find the two closest nodes that are on this road's centerline
        let closest1: GraphNode | null = null;
        let closest2: GraphNode | null = null;
        let dist1 = Infinity;
        let dist2 = Infinity;

        const cx = road.type === 'vertical' ? road.x + road.width / 2 : null;
        const cy = road.type === 'horizontal' ? road.y + road.height / 2 : null;

        for (const n of this.nodes.values()) {
            if (n.id === nodeId) continue;

            // Check if node is on this road's centerline
            const onRoad = road.type === 'vertical'
                ? Math.abs(n.x - cx!) < 5 && n.y >= road.y && n.y <= road.y + road.height
                : Math.abs(n.y - cy!) < 5 && n.x >= road.x && n.x <= road.x + road.width;

            if (onRoad) {
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
}
