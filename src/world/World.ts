import { MapData, Lot, RoadSegment, LotUsage, LotState, Building, MapMetadata } from "../types";

export class World {
    lots: Lot[] = [];
    buildings: Building[] = [];
    roads: RoadSegment[] = [];
    width: number = 0;
    height: number = 0;
    metadata?: MapMetadata;

    constructor() { }

    load(data: MapData) {
        this.roads = data.road_segments;
        this.buildings = data.buildings || [];

        // Specific lot assignments for key buildings
        // Map data is regenerated from SVGs, so avoid hardcoded lot IDs.
        const mergedLots = this.mergeChurchLots(data.lots);
        const specialLots = this.pickSpecialLots(mergedLots);

        // Hydrate Lots with Simulation State
        this.lots = mergedLots.map(raw => {
            // Check for special lot assignments first
            const special = specialLots.get(raw.id);
            if (special) {
                return { ...raw, usage: special.usage, state: special.state };
            }

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

        this.metadata = data.metadata;

        // Use strict ViewBox from metadata if available for perfect alignment
        if (data.metadata.viewBox) {
            const vb = data.metadata.viewBox;
            // Note: SVG Y is inverted in renderer? No, renderer does simple projection.
            // SVG origin is top-left.
            this.bounds = {
                minX: vb.x,
                maxX: vb.x + vb.width,
                minY: vb.y,
                maxY: vb.y + vb.height
            };
            this.width = vb.width;
            this.height = vb.height;
            return; // Skip dynamic calculation
        }

        // Calculate bounds dynamically as fallback
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

    private mergeChurchLots(lots: Omit<Lot, 'usage' | 'state'>[]): Omit<Lot, 'usage' | 'state'>[] {
        const mainId = 556;
        const mergeId = 195;
        const main = lots.find(l => l.id === mainId);
        const merge = lots.find(l => l.id === mergeId);
        if (!main || !merge) return lots;

        const xs = [...main.points, ...merge.points].map(p => p.x);
        const ys = [...main.points, ...merge.points].map(p => p.y);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);

        const merged = {
            ...main,
            points: [
                { x: minX, y: minY },
                { x: maxX, y: minY },
                { x: maxX, y: maxY },
                { x: minX, y: maxY }
            ]
        };

        return lots.filter(l => l.id !== mergeId && l.id !== mainId).concat(merged);
    }

    private pickSpecialLots(lots: { id: number; points: { x: number; y: number }[] }[]): Map<number, { usage: LotUsage; state: LotState }> {
        const special = new Map<number, { usage: LotUsage; state: LotState }>();
        if (lots.length === 0) return special;

        // Explicit assignments (stable across map regen)
        const barLotId = 618;
        const churchLotId = 556;
        if (lots.some(lot => lot.id === barLotId)) {
            special.set(barLotId, { usage: LotUsage.BAR, state: LotState.OCCUPIED });
        }
        if (lots.some(lot => lot.id === churchLotId)) {
            special.set(churchLotId, { usage: LotUsage.CHURCH, state: LotState.OCCUPIED });
        }

        const lotCenters = lots.map(lot => {
            const xs = lot.points.map(p => p.x);
            const ys = lot.points.map(p => p.y);
            const minX = Math.min(...xs);
            const maxX = Math.max(...xs);
            const minY = Math.min(...ys);
            const maxY = Math.max(...ys);
            return {
                id: lot.id,
                cx: (minX + maxX) / 2,
                cy: (minY + maxY) / 2,
                area: Math.max(1, (maxX - minX) * (maxY - minY))
            };
        });

        // Pick bar lot near the northwest corner of the map (lowest y, then lowest x)
        const barCandidate = lotCenters.slice().sort((a, b) => (a.cy - b.cy) || (a.cx - b.cx))[0];
        if (barCandidate && !special.has(barCandidate.id)) {
            special.set(barCandidate.id, { usage: LotUsage.BAR, state: LotState.OCCUPIED });

            // Pick a few nearby lots as parking
            const nearest = lotCenters
                .filter(l => l.id !== barCandidate.id)
                .map(l => ({
                    id: l.id,
                    dist: Math.hypot(l.cx - barCandidate.cx, l.cy - barCandidate.cy),
                    area: l.area
                }))
                .sort((a, b) => a.dist - b.dist)
                .slice(0, 3);

            nearest.forEach(n => {
                if (!special.has(n.id)) {
                    special.set(n.id, { usage: LotUsage.PARKING, state: LotState.EMPTY });
                }
            });
        }

        return special;
    }
}
