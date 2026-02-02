# Map Data Reference

## Source Files

- **map/lots_BB_map.svg**: Vector lots map (lot boundaries)
- **map/roads_BB_map.svg**: Vector roads map (road rectangles)
- **map/houses_BB_map.svg**: Vector houses map (building footprints)
- **map/image_BB_map.png**: Texture overlay aligned to the SVG viewBox
- **map_data.json**: Extracted structured data
- **extract_map.js**: Node script that parses SVGs to JSON
- **visualize_map.html**: Browser preview of extracted data

## Map Dimensions

- **Width**: 7967.36 units
- **Height**: 6847.15 units
- **Total Lots**: 636
- **Total Roads**: 14 (9 vertical, 5 horizontal)

## Coordinate System

- Origin (0,0) is at top-left
- X increases to the right (East)
- Y increases downward (South)
- All measurements in SVG units (approximately 1 unit ≈ 1 foot in real scale)

## Road Network

### Vertical Roads (North-South)
| ID | X Position | Width | Notes |
|----|------------|-------|-------|
| v-road-0 | 883.66 | ~67 | |
| v-road-1 | 1635.86 | ~67 | |
| v-road-2 | 2388.07 | ~67 | |
| v-road-3 | 3140.27 | ~67 | |
| v-road-4 | 3892.47 | ~67 | |
| v-road-5 | 4644.12 | ~67 | |
| v-road-6 | 5397.60 | ~67 | |
| v-road-7 | 6148.98 | ~67 | |
| v-road-8 | 6902.33 | ~67 | |

### Horizontal Roads (East-West)
| ID | Y Position | Height | Notes |
|----|------------|--------|-------|
| h-road-0 | 1230.65 | ~67 | |
| h-road-1 | 1985.69 | ~67 | |
| h-road-2 | 2716.95 | ~67 | |
| h-road-3 | 4234.66 | ~67 | |
| h-road-4 | 5720.16 | ~67 | |

## Lot Structure

Each lot in `map_data.json` follows this structure:

```json
{
  "id": "lot-42",
  "x": 421.67,
  "y": 19.1,
  "width": 383.63,
  "height": 212.58,
  "row": 0,
  "col": 1
}
```

### Building Structure

Each building in `map_data.json` follows this structure:

```json
{
  "id": 0,
  "points": [{ "x": 5487.47, "y": 2175.55 }]
}
```

### Lot Layout

Lots are represented as axis-aligned rectangles (bounding boxes) derived from the
lots SVG. This removes irregular lot shapes and keeps the grid consistent for
navigation/pathfinding.

## Real-World Mapping

Bombay Beach actual layout:
- Streets run roughly N-S and E-W
- Main drag is approximately along one of the central vertical roads
- Salton Sea is to the West
- Desert/mountains to the East

### Known Locations (to be mapped to lots)

| Location | Approximate Grid Position |
|----------|---------------------------|
| The Ski Inn | TBD |
| Bombay Beach Ruins | TBD |
| Drive-in Theater | TBD |
| Art installations | Throughout |

## Usage in Game

### Loading Map Data

```typescript
import mapData from './map_data.json';

// Access roads
const roads = mapData.road_segments;

// Access lots
const lots = mapData.lots;

// Get bounding box
const bounds = {
  width: 3240.49,
  height: 3010.69
};
```

### Converting to Game Coordinates

```typescript
// SVG coordinates to game world (centered at origin)
function svgToWorld(x: number, y: number): [number, number] {
  const centerX = 7967.36 / 2;
  const centerY = 6847.15 / 2;
  return [x - centerX, centerY - y]; // Flip Y for standard 3D coords
}
```

### Isometric Projection

```typescript
// World coordinates to screen (isometric)
function worldToScreen(x: number, y: number, z: number): [number, number] {
  const isoX = (x - y) * Math.cos(Math.PI / 6);
  const isoY = (x + y) * Math.sin(Math.PI / 6) - z;
  return [isoX, isoY];
}
```

## Visualization

Open `visualize_map.html` in a browser to see an interactive preview of the map data. This shows:
- All lot boundaries
- Road network
- Lot IDs on hover
- Scale reference
