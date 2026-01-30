# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Bombay Beach Simulator - an isometric life simulator of Bombay Beach, California (a desert town on the Salton Sea). Currently in Phase 0/1 (Foundation + early simulation). The goal is a Three.js/WebGPU renderer with NPCs living daily routines (Phase 1) and interactive player mode (Phase 2).

## Commands

```bash
npm run dev      # Start Vite dev server
npm run build    # Production build
npm run extract  # Re-extract map data from SVG (ts-node extract_map.ts)
npm run inject   # Inject data into application (ts-node inject_data.ts)
```

No test or lint commands are configured yet.

## Architecture

### Entry Point
`src/renderer/main.ts` - Initializes Three.js scene, creates World/TimeSystem/PathfindingSystem, loads map data from `/docs/map_data.json`, runs the game loop.

### Core Systems

**World Model** (`src/world/World.ts`)
- Holds simulation state: lots with `LotUsage` (VACANT/RESIDENTIAL/COMMERCIAL/PUBLIC) and `LotState` (EMPTY/OCCUPIED/AWAY/ABANDONED/FOR_SALE)
- Hydrates raw map data with procedurally assigned usage/state
- Acts as single source of truth for simulation logic

**Time System** (`src/systems/TimeSystem.ts`)
- Manages game clock: day, hour, minute at configurable speed (default 60x: 1 real sec = 1 game minute)
- Starts at 8 AM Day 1

**Pathfinding** (`src/systems/PathfindingSystem.ts`)
- Generates random points on road network for vehicle/agent movement
- Coordinate transform: Road (x,y) → World (x, -y) due to group scale

### Rendering

**WorldRenderer** (`src/renderer/WorldRenderer.ts`) - Main renderer replacing MapRenderer
- Renders lots as extruded shapes with state-based materials (dusty brown for abandoned, light blue for sale, etc.)
- Renders roads as planes at y=0.05
- Centers entire map via Box3 bounds
- **Important**: `group.scale.z = -1` flips Z axis - all child positions use negative Y for Z

**MapRenderer** (`src/renderer/MapRenderer.ts`) - Legacy/simple renderer, may be deprecated

### Entities

**Agent** (`src/entities/Agent.ts`) - Base class for NPCs
- Has position, target, speed
- Visual: tall box mesh (10x20x10)
- `update(delta)` moves toward target

**Vehicle** (`src/entities/Vehicle.ts`) - Cars on roads
- Similar pattern to Agent with mesh and target-based movement

### Types
`src/types.ts` - All shared interfaces: `MapData`, `Lot`, `RoadSegment`, `Point`, `GameTime`, `LotUsage`, `LotState`

### Map Data
- Source: `docs/bombay_map.svg` (vector map)
- Extracted: `docs/map_data.json` (643 lots, 16 roads, 3240x3010 units)
- Reference: `docs/map-data-reference.md`

### Project Planning
- `PRD/overview.md` - Vision, color palette (Sonoran Desert), features
- `PRD/technical-spec.md` - Target architecture (WebGPU, TSL shaders, isometric camera)
- `PRD/phases.md` - Development phases and milestones
- `PRD/tasks.md` - Task tracking (TASK-XXX numbering)

## Coordinate System

SVG map uses top-left origin with Y pointing down. Three.js uses Y-up.

Transform: SVG (x, y) → Three.js (x, 0, -y)

The WorldRenderer group has `scale.z = -1`, so positions within the group use (x, 0, y) but render correctly. Be careful when adding objects to the group vs scene directly.

## Key Technical Notes

- Currently using WebGLRenderer; WebGPU migration planned
- Map is centered at origin after loading via Box3 bounds calculation
- Strict TypeScript: no unused locals/parameters, no implicit returns
- Lots have simulation state (`LotState`) separate from raw map data

## Constraints

- **Never commit to git** - user handles all git operations
- **No excessive fallbacks** - fix issues at source rather than adding brittle fallbacks
- **Use shadcn CLI** for any UI component installation (not manual)
