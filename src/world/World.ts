import { MapData, Lot, RoadSegment, LotUsage, LotState } from "../types";

export class World {
    lots: Lot[] = [];
    roads: RoadSegment[] = [];
    width: number = 0;
    height: number = 0;

    constructor() { }

    load(data: MapData) {
        this.roads = data.road_segments;

        // Hydrate Lots with Simulation State
        this.lots = data.lots.map(raw => {
            // Procedurally assign usage based on ID or random for now
            const rand = Math.random();
            let usage = LotUsage.RESIDENTIAL;
            let state = LotState.ABANDONED; // Start with many abandoned for Bombay Beach vibe

            if (rand > 0.96) usage = LotUsage.LODGING;
            else if (rand > 0.9) usage = LotUsage.COMMERCIAL;
            else if (rand > 0.85) usage = LotUsage.PUBLIC;

            // State distribution
            const stateRand = Math.random();

            // Special rules for businesses
            if (usage === LotUsage.LODGING || usage === LotUsage.COMMERCIAL) {
                state = LotState.OCCUPIED;
            } else if (stateRand < 0.4) {
                state = LotState.ABANDONED;
            } else if (stateRand < 0.7) {
                state = LotState.OCCUPIED;
            } else if (stateRand < 0.9) {
                state = LotState.AWAY;
            } else {
                state = LotState.FOR_SALE;
            }

            return {
                ...raw,
                usage,
                state
            };
        });

        // Calculate bounds dynamically
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

        const updateBounds = (x: number, y: number) => {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        };

        this.roads.forEach(r => {
            updateBounds(r.x, r.y);
            updateBounds(r.x + r.width, r.y + r.height);
        });

        this.lots.forEach(l => {
            l.points.forEach(p => updateBounds(p.x, p.y));
        });

        // Add padding
        const padding = 100;
        this.width = (maxX - minX) + padding * 2;
        this.height = (maxY - minY) + padding * 2;

        // Offset for renderer if needed, but for now just size.
        // Actually, WorldRenderer assumes 0,0 based?
        // Let's store the bounds so Renderer can use them correct.
        this.bounds = { minX: minX - padding, maxX: maxX + padding, minY: minY - padding, maxY: maxY + padding };
    }

    bounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 };

    // Helper to find lot by ID
    getLot(id: number) {
        return this.lots.find(l => l.id === id);
    }
}
