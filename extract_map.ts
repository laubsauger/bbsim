import * as fs from 'fs';
import * as path from 'path';

const svgPath = path.join(process.cwd(), 'docs', 'bombay_map.svg');
const outputPath = path.join(process.cwd(), 'docs', 'map_data.json');

const svgContent = fs.readFileSync(svgPath, 'utf8');

// --- Types ---
interface Point {
    x: number;
    y: number;
}

interface Transform {
    x: number;
    y: number;
    rotate: number;
}

interface LotRaw {
    type: 'rect' | 'polyline';
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
}

interface MapData {
    metadata: MapMetadata;
    road_network: { d: string | null };
    road_segments: RoadSegment[];
    lots: Lot[];
}

interface Gap {
    start: number;
    end: number;
    size: number;
}

interface Bounds {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

// --- Parsing Logic ---

const lots: LotRaw[] = [];
let roadNetwork: string | null = null;

// Helper to parse numbers
const parseNum = (str: string | null): number => str ? parseFloat(str) : 0;

// Helper to get transform
const getTransform = (str: string | null): Transform => {
    if (!str) return { x: 0, y: 0, rotate: 0 };
    let x = 0, y = 0, rotate = 0;

    // transform="translate(289.66 2356.22) rotate(-90)"
    const translateMatch2 = str.match(/translate\(([^)]+)\)/);
    if (translateMatch2) {
        const parts = translateMatch2[1].trim().split(/[\s,]+/);
        if (parts.length >= 2) {
            x = parseFloat(parts[0]);
            y = parseFloat(parts[1]);
        }
    }

    const rotateMatch = str.match(/rotate\(([^)]+)\)/);
    if (rotateMatch) {
        rotate = parseNum(rotateMatch[1]);
    }

    return { x, y, rotate };
};

// 1. Extract Lots (Rects)
const rectRegex = /<rect[^>]+class="cls-1"[^>]*>/g;
const rects = svgContent.match(rectRegex) || [];

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
    const transform = getTransform(transformStr);

    lots.push({
        type: 'rect',
        x, y, width, height,
        transform: transformStr || undefined,
        geometry: computeRectPolygon(x, y, width, height, transform)
    });
});

// 2. Extract Lots (Polylines)
const polylineRegex = /<polyline[^>]+class="cls-1"[^>]*>/g;
const polylines = svgContent.match(polylineRegex) || [];

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

        lots.push({
            type: 'polyline',
            points: points,
            geometry: points
        });
    }
});

// 3. Extract Road Network (Path)
const pathRegex = /<path[^>]+class="cls-2"[^>]*>/g;
const pathToMatch = svgContent.match(pathRegex);

if (pathToMatch && pathToMatch[0]) {
    const match = pathToMatch[0].match(/d="([^"]+)"/);
    if (match) {
        roadNetwork = match[1];
    }
}

// --- Geometry Helpers ---

function computeRectPolygon(x: number, y: number, w: number, h: number, transform: Transform): Point[] {
    let corners: Point[] = [
        { x: x, y: y },
        { x: x + w, y: y },
        { x: x + w, y: y + h },
        { x: x, y: y + h }
    ];

    const { x: tx, y: ty, rotate: deg } = transform;
    const rad = deg * (Math.PI / 180);
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    return corners.map(p => {
        let rx = p.x * cos - p.y * sin;
        let ry = p.x * sin + p.y * cos;
        return { x: rx + tx, y: ry + ty };
    });
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

function isPointInPolygon(p: Point, polygon: Point[]): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].x, yi = polygon[i].y;
        const xj = polygon[j].x, yj = polygon[j].y;

        const intersect = ((yi > p.y) !== (yj > p.y)) &&
            (p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

function isPolyInsidePoly(polyA: Point[], polyB: Point[]): boolean {
    return polyA.every(p => isPointInPolygon(p, polyB));
}

function arePolysIdentical(polyA: Point[], polyB: Point[]): boolean {
    if (polyA.length !== polyB.length) return false;
    const bA = getPolygonBounds(polyA);
    const bB = getPolygonBounds(polyB);

    if (Math.abs(bA.minX - bB.minX) > 0.1) return false;
    if (Math.abs(bA.maxX - bB.maxX) > 0.1) return false;
    if (Math.abs(bA.minY - bB.minY) > 0.1) return false;
    if (Math.abs(bA.maxY - bB.maxY) > 0.1) return false;
    return true;
}

// --- Road Segmentation Logic ---

function parsePathToPolygons(d: string): Point[][] {
    const commands = d.split(/(?=[Mm])/);
    const polygons: Point[][] = [];

    commands.forEach(cmd => {
        if (!cmd.trim()) return;

        const points: Point[] = [];
        let cx = 0, cy = 0;

        const tokens = cmd.match(/([a-zA-Z])|([-+]?[0-9]*\.?[0-9]+)/g);

        if (!tokens) return;

        let i = 0;
        while (i < tokens.length) {
            const token = tokens[i];

            if (/[a-zA-Z]/.test(token)) {
                const op = token;
                i++;

                switch (op) {
                    case 'M':
                        cx = parseFloat(tokens[i++]);
                        cy = parseFloat(tokens[i++]);
                        points.push({ x: cx, y: cy });
                        break;
                    case 'L':
                        cx = parseFloat(tokens[i++]);
                        cy = parseFloat(tokens[i++]);
                        points.push({ x: cx, y: cy });
                        break;
                    case 'h':
                        cx += parseFloat(tokens[i++]);
                        points.push({ x: cx, y: cy });
                        break;
                    case 'H':
                        cx = parseFloat(tokens[i++]);
                        points.push({ x: cx, y: cy });
                        break;
                    case 'v':
                        cy += parseFloat(tokens[i++]);
                        points.push({ x: cx, y: cy });
                        break;
                    case 'V':
                        cy = parseFloat(tokens[i++]);
                        points.push({ x: cx, y: cy });
                        break;
                    case 'Z':
                    case 'z':
                        break;
                }
            } else {
                i++;
            }
        }

        polygons.push(points);
    });

    return polygons;
}

const roadPolys = roadNetwork ? parsePathToPolygons(roadNetwork) : [];
const blocks: Bounds[] = [];
let mapBounds: Bounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 };

roadPolys.forEach((poly, idx) => {
    const bounds = getPolygonBounds(poly);
    if (idx === 0) {
        mapBounds = bounds;
    } else {
        blocks.push(bounds);
    }
});

console.log(`Found ${blocks.length} blocks.`);

const roadSegments: RoadSegment[] = [];

function findGaps<T>(items: T[], min: number, max: number, itemStartProp: keyof T, itemEndProp: keyof T, gapMinSize: number = 10): Gap[] {
    let coords = new Set([min, max]);
    items.forEach(item => {
        const start = item[itemStartProp];
        const end = item[itemEndProp];
        if (typeof start === 'number' && typeof end === 'number') {
            coords.add(start);
            coords.add(end);
        }
    });
    const sortedCoords = Array.from(coords).sort((a, b) => a - b);

    const gaps: Gap[] = [];

    for (let i = 0; i < sortedCoords.length - 1; i++) {
        const start = sortedCoords[i];
        const end = sortedCoords[i + 1];
        const mid = (start + end) / 2;
        const width = end - start;

        if (width < gapMinSize) continue;

        const isCovered = items.some(item => {
            const s = item[itemStartProp] as number;
            const e = item[itemEndProp] as number;
            return mid > s && mid < e;
        });

        if (!isCovered) {
            gaps.push({ start, end, size: width });
        }
    }
    return gaps;
}

const vGaps = findGaps(blocks, mapBounds.minX, mapBounds.maxX, 'minX', 'maxX');
vGaps.forEach((gap, idx) => {
    roadSegments.push({
        id: `v-road-${idx}`,
        type: 'vertical',
        x: gap.start,
        y: mapBounds.minY,
        width: gap.size,
        height: mapBounds.maxY - mapBounds.minY
    });
});

const hGaps = findGaps(blocks, mapBounds.minY, mapBounds.maxY, 'minY', 'maxY');
hGaps.forEach((gap, idx) => {
    roadSegments.push({
        id: `h-road-${idx}`,
        type: 'horizontal',
        x: mapBounds.minX,
        y: gap.start,
        width: mapBounds.maxX - mapBounds.minX,
        height: gap.size
    });
});

console.log(`Identified ${roadSegments.length} road segments.`);

// --- Cleaning & Deduping ---
console.log(`Initial Lot Count: ${lots.length}`);

const uniqueLots: Lot[] = [];
const discardedIndices = new Set<number>();

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

        if (isPolyInsidePoly(polyA, polyB)) {
            discardedIndices.add(i);
            break;
        }

        if (isPolyInsidePoly(polyB, polyA)) {
            discardedIndices.add(j);
        }
    }
}

lots.forEach((lot, index) => {
    if (!discardedIndices.has(index)) {
        uniqueLots.push({
            id: index,
            points: lot.geometry.map(p => ({ x: Number(p.x.toFixed(2)), y: Number(p.y.toFixed(2)) }))
        });
    }
});

console.log(`Final Lot Count: ${uniqueLots.length}`);

const output: MapData = {
    metadata: {
        total_lots: uniqueLots.length,
        total_roads: roadSegments.length,
        description: "Map data extracted from bombay_map.svg"
    },
    road_network: {
        d: roadNetwork
    },
    road_segments: roadSegments,
    lots: uniqueLots
};

fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
console.log(`Data written to ${outputPath}`);
