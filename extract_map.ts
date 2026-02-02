import * as fs from 'fs';
import * as path from 'path';

const mapDir = path.join(process.cwd(), 'docs', 'map');
const lotsSvgPath = path.join(mapDir, 'lots_BB_map.svg');
const roadsSvgPath = path.join(mapDir, 'roads_BB_map.svg');
const housesSvgPath = path.join(mapDir, 'houses_BB_map.svg');
const outputPath = path.join(process.cwd(), 'docs', 'map_data.json');

const lotsSvgContent = fs.readFileSync(lotsSvgPath, 'utf8');
const roadsSvgContent = fs.readFileSync(roadsSvgPath, 'utf8');
const housesSvgContent = fs.readFileSync(housesSvgPath, 'utf8');

// --- Types ---
interface Point {
    x: number;
    y: number;
}

interface LotRaw {
    type: 'rect' | 'polyline' | 'path';
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    transform?: string;
    points?: Point[];
    geometry: Point[];
}

interface Lot {
    id: number;
    points: Point[];
}

interface Building {
    id: number;
    points: Point[];
}

interface RoadSegment {
    id: string;
    type: 'vertical' | 'horizontal';
    x: number;
    y: number;
    width: number;
    height: number;
}

interface MapMetadata {
    total_lots: number;
    total_roads: number;
    description: string;
    viewBox?: { x: number; y: number; width: number; height: number };
}

interface MapData {
    metadata: MapMetadata;
    road_network: { d: string | null };
    road_segments: RoadSegment[];
    lots: Lot[];
    buildings: Building[];
}

interface Bounds {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

// --- Parsing Logic ---

const lots: LotRaw[] = [];
const buildings: LotRaw[] = [];
const roadNetwork: string | null = null;
let viewBox: { x: number; y: number; width: number; height: number } | null = null;

// Helper to parse numbers
const parseNum = (str: string | null): number => str ? parseFloat(str) : 0;

const parseViewBox = (svg: string) => {
    const match = svg.match(/viewBox="([^"]+)"/);
    if (!match) return null;
    const parts = match[1].trim().split(/[\s,]+/).map(parseFloat);
    if (parts.length !== 4 || parts.some(Number.isNaN)) return null;
    return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
};

type TransformOp = { type: 'translate' | 'rotate' | 'scale'; values: number[] };

const parseTransformList = (str: string | null): TransformOp[] => {
    if (!str) return [];
    const ops: TransformOp[] = [];
    const regex = /([a-zA-Z]+)\(([^)]+)\)/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(str)) !== null) {
        const type = match[1];
        const values = match[2].trim().split(/[\s,]+/).map(parseFloat);
        if (type === 'translate' || type === 'rotate' || type === 'scale') {
            ops.push({ type, values });
        }
    }
    return ops;
};

const applyTransforms = (points: Point[], transformStr: string | null): Point[] => {
    const ops = parseTransformList(transformStr);
    if (!ops.length) return points;
    return points.map((p) => {
        let x = p.x;
        let y = p.y;
        for (let i = ops.length - 1; i >= 0; i--) {
            const op = ops[i];
            if (op.type === 'translate') {
                const tx = op.values[0] ?? 0;
                const ty = op.values[1] ?? 0;
                x += tx;
                y += ty;
            } else if (op.type === 'rotate') {
                const angle = (op.values[0] ?? 0) * (Math.PI / 180);
                const cx = op.values[1] ?? 0;
                const cy = op.values[2] ?? 0;
                const cos = Math.cos(angle);
                const sin = Math.sin(angle);
                const dx = x - cx;
                const dy = y - cy;
                x = cx + dx * cos - dy * sin;
                y = cy + dx * sin + dy * cos;
            } else if (op.type === 'scale') {
                const sx = op.values[0] ?? 1;
                const sy = op.values[1] ?? sx;
                x *= sx;
                y *= sy;
            }
        }
        return { x, y };
    });
};

// 1. Extract Lots (Rects)
viewBox = parseViewBox(lotsSvgContent) || parseViewBox(roadsSvgContent);

const rectRegex = /<rect\b[^>]*>/g;
const rects = lotsSvgContent.match(rectRegex) || [];

rects.forEach(rectStr => {
    const getAttr = (name: string): string | null => {
        const match = rectStr.match(new RegExp(`${name}="([^"]+)"`));
        return match ? match[1] : null;
    };

    const x = parseNum(getAttr('x'));
    const y = parseNum(getAttr('y'));
    const width = parseNum(getAttr('width'));
    const height = parseNum(getAttr('height'));
    const transformStr = getAttr('transform');
    lots.push({
        type: 'rect',
        x, y, width, height,
        transform: transformStr || undefined,
        geometry: applyTransforms(computeRectPolygon(x, y, width, height), transformStr)
    });
});

// 2. Extract Lots (Polylines)
const polylineRegex = /<polyline\b[^>]*>/g;
const polylines = lotsSvgContent.match(polylineRegex) || [];

polylines.forEach(polyStr => {
    const getAttr = (name: string): string | null => {
        const match = polyStr.match(new RegExp(`${name}="([^"]+)"`));
        return match ? match[1] : null;
    };

    const pointsStr = getAttr('points');
    if (pointsStr) {
        const coords = pointsStr.trim().split(/[\s,]+/).map(s => parseFloat(s));
        const points: Point[] = [];
        for (let i = 0; i < coords.length; i += 2) {
            points.push({ x: coords[i], y: coords[i + 1] });
        }

        const transformStr = getAttr('transform');
        lots.push({
            type: 'polyline',
            points: points,
            geometry: applyTransforms(points, transformStr)
        });
    }
});

// 3. Extract Lots (Paths)
const pathRegex = /<path\b[^>]*>/g;
const paths = lotsSvgContent.match(pathRegex) || [];

paths.forEach(pathStr => {
    const getAttr = (name: string): string | null => {
        const match = pathStr.match(new RegExp(`${name}="([^"]+)"`));
        return match ? match[1] : null;
    };
    const d = getAttr('d');
    if (!d) return;
    const transformStr = getAttr('transform');
    const points = parsePathToPoints(d);
    if (!points.length) return;
    lots.push({
        type: 'path',
        points,
        transform: transformStr || undefined,
        geometry: applyTransforms(points, transformStr)
    });
});

// 4. Extract Buildings (Houses SVG)
const houseRects = housesSvgContent.match(rectRegex) || [];
houseRects.forEach(rectStr => {
    const getAttr = (name: string): string | null => {
        const match = rectStr.match(new RegExp(`${name}="([^"]+)"`));
        return match ? match[1] : null;
    };

    const x = parseNum(getAttr('x'));
    const y = parseNum(getAttr('y'));
    const width = parseNum(getAttr('width'));
    const height = parseNum(getAttr('height'));
    const transformStr = getAttr('transform');

    buildings.push({
        type: 'rect',
        x, y, width, height,
        transform: transformStr || undefined,
        geometry: applyTransforms(computeRectPolygon(x, y, width, height), transformStr)
    });
});

const housePolylines = housesSvgContent.match(polylineRegex) || [];
housePolylines.forEach(polyStr => {
    const getAttr = (name: string): string | null => {
        const match = polyStr.match(new RegExp(`${name}="([^"]+)"`));
        return match ? match[1] : null;
    };

    const pointsStr = getAttr('points');
    if (pointsStr) {
        const coords = pointsStr.trim().split(/[\s,]+/).map(s => parseFloat(s));
        const points: Point[] = [];
        for (let i = 0; i < coords.length; i += 2) {
            points.push({ x: coords[i], y: coords[i + 1] });
        }

        const transformStr = getAttr('transform');
        buildings.push({
            type: 'polyline',
            points,
            geometry: applyTransforms(points, transformStr)
        });
    }
});

const housePolygons = housesSvgContent.match(/<polygon\b[^>]*>/g) || [];
housePolygons.forEach(polyStr => {
    const getAttr = (name: string): string | null => {
        const match = polyStr.match(new RegExp(`${name}="([^"]+)"`));
        return match ? match[1] : null;
    };

    const pointsStr = getAttr('points');
    if (pointsStr) {
        const coords = pointsStr.trim().split(/[\s,]+/).map(s => parseFloat(s));
        const points: Point[] = [];
        for (let i = 0; i < coords.length; i += 2) {
            points.push({ x: coords[i], y: coords[i + 1] });
        }

        const transformStr = getAttr('transform');
        buildings.push({
            type: 'polyline',
            points,
            geometry: applyTransforms(points, transformStr)
        });
    }
});

const housePaths = housesSvgContent.match(pathRegex) || [];
housePaths.forEach(pathStr => {
    const getAttr = (name: string): string | null => {
        const match = pathStr.match(new RegExp(`${name}="([^"]+)"`));
        return match ? match[1] : null;
    };
    const d = getAttr('d');
    if (!d) return;
    const transformStr = getAttr('transform');
    const points = parsePathToPoints(d);
    if (!points.length) return;
    buildings.push({
        type: 'path',
        points,
        transform: transformStr || undefined,
        geometry: applyTransforms(points, transformStr)
    });
});
// --- Geometry Helpers ---

function computeRectPolygon(x: number, y: number, w: number, h: number): Point[] {
    let corners: Point[] = [
        { x: x, y: y },
        { x: x + w, y: y },
        { x: x + w, y: y + h },
        { x: x, y: y + h }
    ];
    return corners;
}

function getPolygonBounds(points: Point[]): Bounds {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    points.forEach(p => {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
    });
    return { minX, minY, maxX, maxY };
}

function arePolysIdentical(polyA: Point[], polyB: Point[]): boolean {
    if (polyA.length !== polyB.length) return false;
    const bA = getPolygonBounds(polyA);
    const bB = getPolygonBounds(polyB);

    if (Math.abs(bA.minX - bB.minX) > 0.01) return false;
    if (Math.abs(bA.maxX - bB.maxX) > 0.01) return false;
    if (Math.abs(bA.minY - bB.minY) > 0.01) return false;
    if (Math.abs(bA.maxY - bB.maxY) > 0.01) return false;
    return true;
}

function parsePathToPoints(d: string): Point[] {
    const tokens = d.match(/([a-zA-Z])|([-+]?[0-9]*\.?[0-9]+(?:e[-+]?\d+)?)/g);
    if (!tokens) return [];

    const points: Point[] = [];
    let cx = 0;
    let cy = 0;
    let i = 0;

    const pushPoint = (x: number, y: number) => {
        const last = points[points.length - 1];
        if (!last || last.x !== x || last.y !== y) {
            points.push({ x, y });
        }
    };

    while (i < tokens.length) {
        const token = tokens[i++];
        if (!token) continue;

        if (/[a-zA-Z]/.test(token)) {
            const op = token;
            switch (op) {
                case 'M':
                    cx = parseFloat(tokens[i++]);
                    cy = parseFloat(tokens[i++]);
                    pushPoint(cx, cy);
                    break;
                case 'm':
                    cx += parseFloat(tokens[i++]);
                    cy += parseFloat(tokens[i++]);
                    pushPoint(cx, cy);
                    break;
                case 'H':
                    cx = parseFloat(tokens[i++]);
                    pushPoint(cx, cy);
                    break;
                case 'h':
                    cx += parseFloat(tokens[i++]);
                    pushPoint(cx, cy);
                    break;
                case 'V':
                    cy = parseFloat(tokens[i++]);
                    pushPoint(cx, cy);
                    break;
                case 'v':
                    cy += parseFloat(tokens[i++]);
                    pushPoint(cx, cy);
                    break;
                case 'C': {
                    const x1 = parseFloat(tokens[i++]);
                    const y1 = parseFloat(tokens[i++]);
                    const x2 = parseFloat(tokens[i++]);
                    const y2 = parseFloat(tokens[i++]);
                    const x = parseFloat(tokens[i++]);
                    const y = parseFloat(tokens[i++]);
                    cx = x;
                    cy = y;
                    pushPoint(cx, cy);
                    // Avoid unused vars; x1/y1/x2/y2 are kept for clarity.
                    void (x1 + y1 + x2 + y2);
                    break;
                }
                case 'c': {
                    const dx1 = parseFloat(tokens[i++]);
                    const dy1 = parseFloat(tokens[i++]);
                    const dx2 = parseFloat(tokens[i++]);
                    const dy2 = parseFloat(tokens[i++]);
                    const dx = parseFloat(tokens[i++]);
                    const dy = parseFloat(tokens[i++]);
                    cx += dx;
                    cy += dy;
                    pushPoint(cx, cy);
                    void (dx1 + dy1 + dx2 + dy2);
                    break;
                }
                case 'Z':
                case 'z':
                    break;
                default:
                    break;
            }
        } else {
            // If we encounter a number without a command, skip it.
        }
    }

    return points;
}

const roadSegments: RoadSegment[] = [];

const roadRects = roadsSvgContent.match(rectRegex) || [];

roadRects.forEach(rectStr => {
    const getAttr = (name: string): string | null => {
        const match = rectStr.match(new RegExp(`${name}="([^"]+)"`));
        return match ? match[1] : null;
    };

    const x = parseNum(getAttr('x'));
    const y = parseNum(getAttr('y'));
    const width = parseNum(getAttr('width'));
    const height = parseNum(getAttr('height'));
    const transformStr = getAttr('transform');

    const poly = applyTransforms(computeRectPolygon(x, y, width, height), transformStr);
    const bounds = getPolygonBounds(poly);
    const segWidth = bounds.maxX - bounds.minX;
    const segHeight = bounds.maxY - bounds.minY;

    const type: RoadSegment['type'] = segWidth >= segHeight ? 'horizontal' : 'vertical';
    roadSegments.push({
        id: '',
        type,
        x: Number(bounds.minX.toFixed(2)),
        y: Number(bounds.minY.toFixed(2)),
        width: Number(segWidth.toFixed(2)),
        height: Number(segHeight.toFixed(2))
    });
});

const verticalRoads = roadSegments.filter(r => r.type === 'vertical').sort((a, b) => a.x - b.x);
const horizontalRoads = roadSegments.filter(r => r.type === 'horizontal').sort((a, b) => a.y - b.y);
verticalRoads.forEach((r, idx) => { r.id = `v-road-${idx}`; });
horizontalRoads.forEach((r, idx) => { r.id = `h-road-${idx}`; });

roadSegments.length = 0;
roadSegments.push(...verticalRoads, ...horizontalRoads);

console.log(`Identified ${roadSegments.length} road segments.`);

// --- Cleaning & Deduping ---
console.log(`Initial Lot Count: ${lots.length}`);

const uniqueLots: Lot[] = [];
const discardedIndices = new Set<number>();

function clampLotBoundsToRoads(bounds: Bounds) {
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;

    let leftRoadEdge: number | null = null;
    let rightRoadEdge: number | null = null;
    let topRoadEdge: number | null = null;
    let bottomRoadEdge: number | null = null;

    for (const road of roadSegments) {
        if (road.type === 'vertical') {
            const leftEdge = road.x + road.width;
            const rightEdge = road.x;
            if (leftEdge <= centerX && (leftRoadEdge === null || leftEdge > leftRoadEdge)) {
                leftRoadEdge = leftEdge;
            }
            if (rightEdge >= centerX && (rightRoadEdge === null || rightEdge < rightRoadEdge)) {
                rightRoadEdge = rightEdge;
            }
        } else {
            const topEdge = road.y + road.height;
            const bottomEdge = road.y;
            if (topEdge <= centerY && (topRoadEdge === null || topEdge > topRoadEdge)) {
                topRoadEdge = topEdge;
            }
            if (bottomEdge >= centerY && (bottomRoadEdge === null || bottomEdge < bottomRoadEdge)) {
                bottomRoadEdge = bottomEdge;
            }
        }
    }

    const minX = leftRoadEdge !== null ? leftRoadEdge : (viewBox ? viewBox.x : bounds.minX);
    const maxX = rightRoadEdge !== null ? rightRoadEdge : (viewBox ? viewBox.x + viewBox.width : bounds.maxX);
    const minY = topRoadEdge !== null ? topRoadEdge : (viewBox ? viewBox.y : bounds.minY);
    const maxY = bottomRoadEdge !== null ? bottomRoadEdge : (viewBox ? viewBox.y + viewBox.height : bounds.maxY);

    const inset = 1;
    const clamped = {
        minX: Math.min(Math.max(minX + inset, bounds.minX), maxX - inset),
        maxX: Math.max(Math.min(maxX - inset, bounds.maxX), minX + inset),
        minY: Math.min(Math.max(minY + inset, bounds.minY), maxY - inset),
        maxY: Math.max(Math.min(maxY - inset, bounds.maxY), minY + inset),
    };

    if (clamped.maxX <= clamped.minX || clamped.maxY <= clamped.minY) {
        return bounds;
    }
    return clamped;
}

for (let i = 0; i < lots.length; i++) {
    if (discardedIndices.has(i)) continue;

    for (let j = i + 1; j < lots.length; j++) {
        if (discardedIndices.has(j)) continue;

        const polyA = lots[i].geometry;
        const polyB = lots[j].geometry;

        if (arePolysIdentical(polyA, polyB)) {
            discardedIndices.add(j);
            continue;
        }

        // Skip containment checks to avoid removing valid adjacent lots.
    }
}

lots.forEach((lot, index) => {
    if (!discardedIndices.has(index)) {
        const bounds = clampLotBoundsToRoads(getPolygonBounds(lot.geometry));
        const rectPoints = [
            { x: bounds.minX, y: bounds.minY },
            { x: bounds.maxX, y: bounds.minY },
            { x: bounds.maxX, y: bounds.maxY },
            { x: bounds.minX, y: bounds.maxY },
        ];
        uniqueLots.push({
            id: index,
            points: rectPoints.map(p => ({ x: Number(p.x.toFixed(2)), y: Number(p.y.toFixed(2)) }))
        });
    }
});

console.log(`Final Lot Count: ${uniqueLots.length}`);

const uniqueBuildings: Building[] = buildings.map((b, index) => ({
    id: index,
    points: b.geometry.map(p => ({ x: Number(p.x.toFixed(2)), y: Number(p.y.toFixed(2)) }))
}));

const output: MapData = {
    metadata: {
        total_lots: uniqueLots.length,
        total_roads: roadSegments.length,
        description: "Map data extracted from lots_BB_map.svg and roads_BB_map.svg",
        viewBox: viewBox || undefined
    },
    road_network: {
        d: roadNetwork
    },
    road_segments: roadSegments,
    lots: uniqueLots,
    buildings: uniqueBuildings
};

fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
console.log(`Data written to ${outputPath}`);
