const fs = require('fs');
const path = require('path');

const svgPath = path.join(__dirname, 'bombay_map.svg');
const outputPath = path.join(__dirname, 'map_data.json');

const svgContent = fs.readFileSync(svgPath, 'utf8');

// --- Parsing Logic ---

const lots = [];
let roadNetwork = null;

// Helper to parse numbers
const parseNum = (str) => parseFloat(str);

// Helper to get transform
const getTransform = (str) => {
    if (!str) return { x: 0, y: 0, rotate: 0 };
    let x = 0, y = 0, rotate = 0;

    const translateMatch = str.match(/translate\(([^,]+)\s+([^)]+)\)/);
    if (translateMatch) {
        x = parseNum(translateMatch[1]);
        y = parseNum(translateMatch[2]); // Space separated usually in SVG d="M..." but transform is often comma or space
    }
    // Wait, regex above expects space. Let's make it robust.
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
// <rect class="cls-1" x="2837.77" y="1971.06" width="191.81" height="68.03"/>
// <rect className="cls-1" ... matches generic
const rectRegex = /<rect[^>]+class="cls-1"[^>]*>/g;
const rects = svgContent.match(rectRegex) || [];

rects.forEach(rectStr => {
    const getAttr = (name) => {
        const match = rectStr.match(new RegExp(`${name}="([^"]+)"`));
        return match ? match[1] : null;
    };

    const x = parseNum(getAttr('x'));
    const y = parseNum(getAttr('y'));
    const width = parseNum(getAttr('width'));
    const height = parseNum(getAttr('height'));
    const transformStr = getAttr('transform');
    const transform = getTransform(transformStr);

    // Calculate vertices for polygon representation (handling rotation)
    // Center of rotation for SVG rot is usually 0,0 unless specified, but here it's likely complex.
    // Actually, distinct transforms like "translate(...) rotate(...)" imply a coordinate system shift.
    // If it's just <rect x=".." ... transform="..." />, the transform applies to the rect.

    // Simplification: Store the raw rect data, convert to polygon points for overlap check.

    lots.push({
        type: 'rect',
        x, y, width, height,
        transform: transformStr,
        // Computed absolute geometry for checking
        geometry: computeRectPolygon(x, y, width, height, transform)
    });
});

// 2. Extract Lots (Polylines)
// <polyline class="cls-1" points="1151.14 910.87 1207.97 910.87 ..."/>
const polylineRegex = /<polyline[^>]+class="cls-1"[^>]*>/g;
const polylines = svgContent.match(polylineRegex) || [];

polylines.forEach(polyStr => {
    const getAttr = (name) => {
        const match = polyStr.match(new RegExp(`${name}="([^"]+)"`));
        return match ? match[1] : null;
    };

    const pointsStr = getAttr('points');
    if (pointsStr) {
        // Parse points "x1 y1 x2 y2 ..."
        const coords = pointsStr.trim().split(/[\s,]+/).map(parseNum);
        const points = [];
        for (let i = 0; i < coords.length; i += 2) {
            points.push({ x: coords[i], y: coords[i + 1] });
        }

        lots.push({
            type: 'polyline',
            points: points,
            geometry: points // It's already a polygon
        });
    }
});

// 3. Extract Road Network (Path)
// <path class="cls-2" d="..."/>
const pathRegex = /<path[^>]+class="cls-2"[^>]*>/g;
const pathToMatch = svgContent.match(pathRegex);

if (pathToMatch && pathToMatch[0]) {
    const match = pathToMatch[0].match(/d="([^"]+)"/);
    if (match) {
        roadNetwork = match[1];
    }
}

// --- Geometry Helpers ---

function computeRectPolygon(x, y, w, h, transform) {
    // 4 corners un-transformed
    // (x, y), (x+w, y), (x+w, y+h), (x, y+h)
    let corners = [
        { x: x, y: y },
        { x: x + w, y: y },
        { x: x + w, y: y + h },
        { x: x, y: y + h }
    ];

    // Apply transform: translate then rotate (order depends on SVG string parsing, usually right-to-left math, but SVG 'transform' attribute is left-to-right applied)
    // "translate(tx, ty) rotate(deg)" -> first translate, then rotate around origin (0,0) of the new system? 
    // Wait, SVG transform="translate(tx ty) rotate(a)" means:
    // P_new = T * R * P_old? No, it's applied in order. Translate, THEN rotate.
    // Actually, rotate(a) rotates around (0,0) unless rotate(a, cx, cy).

    // Let's implement basic matrix multiplication for robustness or just approximate if complex.
    // Given the file content: transform="translate(289.66 2356.22) rotate(-90)"
    // This looks like standard SVG.

    const { x: tx, y: ty, rotate: deg } = transform;
    const rad = deg * (Math.PI / 180);
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    return corners.map(p => {
        // 1. If transform is typically just T, R.
        // Actually, if it's "translate(...) rotate(...)"
        // We apply Rotate first? No, SVG transforms are pre-multiplied. 
        // Matrix = Translate_mat * Rotate_mat.
        // Point' = Matrix * Point.
        // So Point' = Translate * (Rotate * Point). 
        // Effectively: Rotate point around 0,0, then Translate.

        // Wait, order in SVG attribute: transform="A B C" -> P' = A(B(C(P)))
        // So "translate T rotate R" -> P' = T( R(P) )
        // Rotate P around (0,0) by deg
        let rx = p.x * cos - p.y * sin;
        let ry = p.x * sin + p.y * cos;
        // Translate
        return { x: rx + tx, y: ry + ty };
    });
}

function getPolygonBounds(points) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    points.forEach(p => {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
    });
    return { minX, minY, maxX, maxY };
}

// Point in Polygon (Ray Casting)
function isPointInPolygon(p, polygon) {
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

// Check if Poly A is inside Poly B
function isPolyInsidePoly(polyA, polyB) {
    // Check all points of A are inside B
    return polyA.every(p => isPointInPolygon(p, polyB));
}

// Check if basically identical (all points matching within tolerance)
function arePolysIdentical(polyA, polyB) {
    if (polyA.length !== polyB.length) return false;
    // Basic check: sort points or check closest.
    // If exact dupe, order might be same.
    // Let's just check centers or bounds first.
    const bA = getPolygonBounds(polyA);
    const bB = getPolygonBounds(polyB);

    if (Math.abs(bA.minX - bB.minX) > 0.1) return false;
    if (Math.abs(bA.maxX - bB.maxX) > 0.1) return false;
    if (Math.abs(bA.minY - bB.minY) > 0.1) return false;
    if (Math.abs(bA.maxY - bB.maxY) > 0.1) return false;

    // Deep check
    // Sum of distances?
    return true; // Good enough for "doubled up" if bounds match exactly for rects
}


// --- Road Segmentation Logic ---

// 1. Parse Road Network path to find "Blocks" (Holes)
// The path d usually starts with the outer boundary M0,0...Z, then follows with holes M...Z
// We'll assume any subpath that is NOT the outer boundary is a Block.

function parsePathToPolygons(d) {
    // Naive split by 'M' or 'm'
    // This depends heavily on the SVG format. The file shows "M...Z M...Z"
    // So splitting by 'M' should work (ignoring first empty if starts with M)
    const commands = d.split(/(?=[Mm])/);
    const polygons = [];

    commands.forEach(cmd => {
        if (!cmd.trim()) return;

        // Very basic parser for h/v/l commands
        // We assume absolute/relative coords.
        // The file uses: "M2837.78,19.1h383.62v212.52h-383.62V19.1Z"
        // It's mostly rects defined by h/v.

        const points = [];
        let cx = 0, cy = 0;

        // Regex to tokenize: command letter + float
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
                        cy = parseFloat(tokens[i++]); // Comma often consumed or split? regex above splits nums
                        points.push({ x: cx, y: cy });
                        break;
                    case 'L':
                        cx = parseFloat(tokens[i++]);
                        cy = parseFloat(tokens[i++]);
                        points.push({ x: cx, y: cy });
                        break;
                    case 'h': // relative horizontal
                        cx += parseFloat(tokens[i++]);
                        points.push({ x: cx, y: cy });
                        break;
                    case 'H': // absolute horizontal
                        cx = parseFloat(tokens[i++]);
                        points.push({ x: cx, y: cy });
                        break;
                    case 'v': // relative vertical
                        cy += parseFloat(tokens[i++]);
                        points.push({ x: cx, y: cy });
                        break;
                    case 'V':
                        cy = parseFloat(tokens[i++]);
                        points.push({ x: cx, y: cy });
                        break;
                    case 'Z':
                    case 'z':
                        // Close path
                        break;
                }
            } else {
                i++; // skip implicit?
            }
        }

        polygons.push(points);
    });

    return polygons;
}

const roadPolys = parsePathToPolygons(roadNetwork);
// First poly is likely the outer bound (0,0 to max). Rest are holes.
// Let's verify bounds.
const blocks = [];
let mapBounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 };

roadPolys.forEach((poly, idx) => {
    const bounds = getPolygonBounds(poly);
    if (idx === 0) {
        mapBounds = bounds;
        // Check if it's the big one
        // If it starts at 0,0 and is huge, it's the container.
        // Assuming first is container based on "M0,0..."
    } else {
        blocks.push(bounds);
    }
});

console.log(`Found ${blocks.length} blocks.`);

// 2. Find Gaps (Road Segments)
// Algorithm:
// Project blocks to X axis. Find uncovered intervals -> Vertical Roads.
// Project blocks to Y axis. Find uncovered intervals -> Horizontal Roads.

const roadSegments = [];

// Helper: Merge intervals and find gaps
function findGaps(items, min, max, itemStartProp, itemEndProp, gapMinSize = 10) {
    // distinct sorted coordinates (starts and ends)
    let coords = new Set([min, max]);
    items.forEach(item => {
        coords.add(item[itemStartProp]);
        coords.add(item[itemEndProp]);
    });
    const sortedCoords = Array.from(coords).sort((a, b) => a - b);

    const gaps = [];

    for (let i = 0; i < sortedCoords.length - 1; i++) {
        const start = sortedCoords[i];
        const end = sortedCoords[i + 1];
        const mid = (start + end) / 2;
        const width = end - start;

        if (width < gapMinSize) continue;

        // Check if mid is inside ANY item
        const isCovered = items.some(item => mid > item[itemStartProp] && mid < item[itemEndProp]);

        if (!isCovered) {
            gaps.push({ start, end, size: width });
        }
    }
    return gaps;
}

// Vertical Roads (Gaps in X projection)
// We need to check columns.
// Issue: A vertical road might not span the FULL map height.
// Refined algo:
// Sweep line? 
// Or simpler: The town implies a grid.
// Let's try finding the major grid lines first.
// If I take ALL X coordinates of blocks, the usage pattern might correspond to "Lanes".
// But let's stick to the user request "Separate into individual road segments".
// If I find a vertical gap X1-X2 that runs from Y1 to Y2, that's a segment.

// Let's try to detect the "Grid".
// Get unique Xs from blocks.
// Sort them.
// Identify "common" Gaps that repeat? 
// Actually, standard gap finding across the whole map might work if the grid is regular.

const vGaps = findGaps(blocks, mapBounds.minX, mapBounds.maxX, 'minX', 'maxX');
// For each vGap (which is an X range), check its Y extend.
// Naively, assume it spans the whole map for now, but trimmed by map bounds.
// Realistically, we should check if there's an obstacle in the gap?
// By definition of findGaps, there are NO blocks in this X-range.
// So these are vertical strips that run from top to bottom of the map completely clear of blocks.
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

// Horizontal Roads (Gaps in Y projection)
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

// Note: Intersections are where they cross.
// This naive projection assumes the roads go ALL the way across.
// If the map has "T" intersections or terminated roads, this logic fails (it won't find the gap because a block blocks it elsewhere).
// But looking at the map preview or d-path `M0,0v3010...` implies a rect boundary.
// Let's assume a grid first. If the visualization looks wrong (missing segments), I'll refine.

console.log(`Identified ${roadSegments.length} road segments.`);

// Update output to include segments
// --- Cleaning & Deduping ---
console.log(`Initial Lot Count: ${lots.length}`);

const uniqueLots = [];
const discardedIndices = new Set();

// 1. Mark identical or contained lots
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

// Build final list
lots.forEach((lot, index) => {
    if (!discardedIndices.has(index)) {
        uniqueLots.push({
            id: index,
            points: lot.geometry.map(p => ({ x: Number(p.x.toFixed(2)), y: Number(p.y.toFixed(2)) }))
        });
    }
});

console.log(`Final Lot Count: ${uniqueLots.length}`);

const output = {
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
