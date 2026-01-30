# Technical Specification

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                     Browser (WebGPU)                     │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │
│  │   Three.js  │  │  TSL/WGSL   │  │   Game Logic    │  │
│  │   r170+     │  │  Shaders    │  │   (TypeScript)  │  │
│  └─────────────┘  └─────────────┘  └─────────────────┘  │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │
│  │  Map Grid   │  │ NPC System  │  │  Time/Weather   │  │
│  │  Renderer   │  │  & AI       │  │  System         │  │
│  └─────────────┘  └─────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## Rendering Stack

### Three.js + WebGPU (2026 Modern Approach)

```typescript
import * as THREE from 'three';
import { WebGPURenderer } from 'three/webgpu';
import { tslFn, vec3, float } from 'three/tsl';

// WebGPU Renderer initialization
const renderer = new WebGPURenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
await renderer.init();
```

### TSL (Three.js Shading Language)

Using TSL for all custom shaders - the modern replacement for GLSL in Three.js:

```typescript
// Example: Desert heat shimmer effect
const heatShimmer = tslFn(({ uv, time }) => {
  const distortion = sin(uv.y.mul(50).add(time.mul(2))).mul(0.002);
  return uv.add(vec2(distortion, 0));
});
```

### Isometric Camera Setup

```typescript
// Isometric projection (true isometric: 35.264° rotation)
const camera = new THREE.OrthographicCamera(
  -viewWidth / 2, viewWidth / 2,
  viewHeight / 2, -viewHeight / 2,
  0.1, 1000
);

// Classic isometric angles
camera.rotation.order = 'YXZ';
camera.rotation.y = Math.PI / 4;      // 45° horizontal
camera.rotation.x = Math.atan(1 / Math.sqrt(2)); // ~35.264° down
```

## Map Grid System

### Coordinate System

- **Source Data**: SVG coordinates (3240.49 x 3010.69 units)
- **Game World**: 1 SVG unit = 1 game unit
- **Grid Cells**: ~400 units wide (road spacing)

### Data Structures

```typescript
interface Lot {
  id: string;
  bounds: { x: number; y: number; width: number; height: number };
  type: 'residential' | 'commercial' | 'vacant' | 'special';
  building?: Building;
  occupants?: NPC[];
}

interface Road {
  id: string;
  type: 'vertical' | 'horizontal';
  bounds: { x: number; y: number; width: number; height: number };
}

interface MapData {
  lots: Lot[];
  roads: Road[];
  bounds: { width: number; height: number };
}
```

## Rendering Layers

1. **Ground Layer** (z=0)
   - Desert terrain texture
   - Road surfaces
   - Lot boundaries (subtle)

2. **Shadow Layer** (z=0.1)
   - Dynamic shadows from buildings/NPCs
   - Pre-baked ambient occlusion

3. **Building Layer** (z=1-10)
   - Instanced mesh rendering for performance
   - LOD system for distant buildings

4. **Entity Layer** (z=1-5)
   - NPCs, vehicles, props
   - Sprite-based or low-poly 3D

5. **Atmosphere Layer** (z=100+)
   - Dust particles
   - Heat shimmer (post-process)
   - Day/night overlay

## NPC System

### Behavior State Machine

```typescript
enum NPCState {
  SLEEPING,
  WAKING,
  AT_HOME,
  WALKING,
  WORKING,
  SOCIALIZING,
  SHOPPING,
  IDLE
}

interface NPC {
  id: string;
  name: string;
  home: Lot;
  workplace?: Lot;
  schedule: DailySchedule;
  currentState: NPCState;
  position: Vector3;
  path?: PathNode[];
}
```

### Pathfinding

- A* on road network graph
- NPCs stay on roads/sidewalks
- Shortcuts through vacant lots (optional)

## Time System

```typescript
interface GameTime {
  hour: number;      // 0-23
  minute: number;    // 0-59
  dayOfWeek: number; // 0-6
  speed: number;     // 1 = real-time, 60 = 1 min = 1 sec
}

// Default: 1 game day = 24 real minutes (60x speed)
```

## Performance Targets

- **Resolution**: 1920x1080 minimum, 4K support
- **Frame Rate**: Solid 60fps on mid-range 2024+ hardware
- **Draw Calls**: < 100 per frame (instancing)
- **Texture Memory**: < 512MB
- **Load Time**: < 3 seconds initial load

## File Structure

```
bbsim/
├── docs/                    # Reference materials
│   ├── bombay_map.svg
│   ├── map_data.json
│   └── ...
├── PRD/                     # Requirements & planning
│   ├── overview.md
│   ├── technical-spec.md
│   ├── phases.md
│   └── tasks.md
├── src/
│   ├── main.ts             # Entry point
│   ├── renderer/
│   │   ├── WebGPUSetup.ts
│   │   ├── IsometricCamera.ts
│   │   ├── MapRenderer.ts
│   │   └── shaders/
│   │       ├── ground.tsl.ts
│   │       ├── building.tsl.ts
│   │       └── atmosphere.tsl.ts
│   ├── world/
│   │   ├── Map.ts
│   │   ├── Lot.ts
│   │   ├── Road.ts
│   │   └── Building.ts
│   ├── entities/
│   │   ├── NPC.ts
│   │   ├── Vehicle.ts
│   │   └── Player.ts (Phase 2)
│   ├── systems/
│   │   ├── TimeSystem.ts
│   │   ├── WeatherSystem.ts
│   │   ├── PathfindingSystem.ts
│   │   └── AISystem.ts
│   └── utils/
│       └── MapLoader.ts
├── assets/
│   ├── textures/
│   ├── models/
│   └── audio/
├── public/
│   └── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## Dependencies

```json
{
  "dependencies": {
    "three": "^0.170.0"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "vite": "^6.0.0",
    "@types/three": "^0.170.0"
  }
}
```

## Browser Requirements

- Chrome 113+ / Edge 113+ (WebGPU)
- Firefox 130+ (WebGPU, experimental)
- Safari 18+ (WebGPU)
- Fallback to WebGL2 for older browsers (degraded visuals)
