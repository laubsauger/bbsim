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
        roads.forEach(road => {
            // Derive centerline endpoints based on orientation
            let start: Point;
            let end: Point;

            if (road.type === 'vertical') {
                // Vertical: Center X, Bottom Y to Top Y
                const cx = road.x + road.width / 2;
                start = { x: cx, y: road.y };
                end = { x: cx, y: road.y + road.height };
            } else {
                // Horizontal: Left X to Right X, Center Y
                const cy = road.y + road.height / 2;
                start = { x: road.x, y: cy };
                end = { x: road.x + road.width, y: cy };
            }

            const startId = this.getNodeId(start);
            const endId = this.getNodeId(end);

            this.addNode(start);
            this.addNode(end);

            this.addEdge(startId, endId);
        });
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
