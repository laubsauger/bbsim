# Map Data Reference

## Source Files

- **bombay_map.svg**: Original vector map of Bombay Beach grid
- **map_data.json**: Extracted structured data
- **extract_map.js**: Node script that parses SVG to JSON
- **visualize_map.html**: Browser preview of extracted data

## Map Dimensions

- **Width**: 3240.49 units
- **Height**: 3010.69 units
- **Total Lots**: 643
- **Total Roads**: 16 (9 vertical, 7 horizontal)

## Coordinate System

- Origin (0,0) is at top-left
- X increases to the right (East)
- Y increases downward (South)
- All measurements in SVG units (approximately 1 unit ≈ 1 foot in real scale)

## Road Network

### Vertical Roads (North-South)
| ID | X Position | Width | Notes |
|----|------------|-------|-------|
| v-road-0 | 0 | ~19 | Western boundary |
| v-road-1 | 402.61 | ~19 | |
| v-road-2 | 805.30 | ~19 | |
| v-road-3 | 1207.98 | ~19 | |
| v-road-4 | 1610.67 | ~19 | |
| v-road-5 | 2013.80 | ~19 | |
| v-road-6 | 2416.00 | ~19 | |
| v-road-7 | 2818.68 | ~19 | |
| v-road-8 | 3221.40 | ~19 | Eastern boundary |

### Horizontal Roads (East-West)
| ID | Y Position | Height | Notes |
|----|------------|--------|-------|
| h-road-0 | 0 | ~19 | Northern boundary |
| h-road-1 | 231.68 | ~10 | |
| h-road-2 | ~456 | ~20 | |
| h-road-3 | ~706 | ~20 | |
| h-road-4 | ~911 | ~20 | |
| h-road-5 | ~1951 | ~20 | |
| h-road-6 | ~2991 | ~19 | Southern boundary |

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

### Lot Grid

The town is organized in a grid pattern:
- **Columns**: 8 (between 9 vertical roads)
- **Rows**: 6 (between 7 horizontal roads)
- **Not all grid cells have lots** (some areas are irregular)

### Typical Lot Sizes

| Size Category | Dimensions | Count |
|---------------|------------|-------|
| Standard | ~383 x 212 | Most common |
| Large | ~383 x 1020 | Southern blocks |
| Small | ~383 x 193 | Some irregular |

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
  const centerX = 3240.49 / 2;
  const centerY = 3010.69 / 2;
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
