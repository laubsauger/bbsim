# Task Tracking

## Current Sprint: Visual Polish & Simulation

### In Progress
- [ ] **TASK-041**: Implement sun position based on time (day/night cycle)
- [ ] **TASK-020**: Define building type enum and data structure

### Up Next
- [ ] **TASK-042**: Create day/night lighting transitions
- [ ] **TASK-021**: Create simple box building generator
- [ ] **TASK-032**: Create A* pathfinding (strict road following)
- [ ] **TASK-044**: Implement dust particle system

### Backlog

#### Rendering
- [ ] **TASK-010**: Implement TSL desert ground shader
- [ ] **TASK-014**: Create skybox/gradient background
- [ ] **TASK-043**: Add heat shimmer post-processing effect

#### Buildings
- [ ] **TASK-022**: Add building placement logic per lot
- [ ] **TASK-023**: Implement building instancing for performance
- [ ] **TASK-024**: Add building detail props (doors, windows)

#### NPCs
- [ ] **TASK-034**: Create NPC state machine
- [ ] **TASK-035**: Implement daily schedule integration with behaviors

#### Ambient
- [ ] **TASK-050**: Birds (flying, perching)
- [ ] **TASK-051**: Tumbleweeds
- [ ] **TASK-052**: Dust devils

---

## Completed

### Setup (001-009)
- [x] **TASK-000**: Extract map data from SVG
- [x] **TASK-001**: Set up project scaffolding (Vite + TypeScript + Three.js)
- [x] **TASK-002**: Configure WebGPU renderer
- [x] **TASK-003**: Implement camera with OrbitControls
- [x] **TASK-004**: Create MapLoader to parse map_data.json
- [x] **TASK-005**: Render ground plane with desert material
- [x] **TASK-006**: Render road network as geometry
- [x] **TASK-007**: Render lot boundaries

### Rendering (010-019)
- [x] **TASK-011**: Create road material (asphalt)
- [x] **TASK-012**: Create desert color palette materials
- [x] **TASK-013**: Implement shadow system (DirectionalLight)
- [x] **TASK-015**: Fix z-fighting artifacts
- [x] **TASK-016**: Implement ACES tone mapping
- [x] **TASK-017**: Add hemisphere lighting for outdoor feel

### NPCs (030-039)
- [x] **TASK-030**: Create NPC data model (Agent class)
- [x] **TASK-031**: Implement random pathfinding on roads
- [x] **TASK-033**: Implement basic NPC/Vehicle movement

### Time/Weather (040-049)
- [x] **TASK-040**: Create time system with speed controls

### UI (060-069)
- [x] **TASK-060**: Implement minimap with click-to-navigate
- [x] **TASK-061**: Add GUI controls (lil-gui)
- [x] **TASK-062**: Create legend overlay
- [x] **TASK-063**: Optimize minimap with cached background

---

## Notes

### Conventions
- Task IDs: TASK-XXX
- Prefixes by area:
  - 001-009: Setup
  - 010-019: Rendering
  - 020-029: Buildings
  - 030-039: NPCs
  - 040-049: Time/Weather
  - 050-059: Ambient life
  - 060-069: UI
  - 070+: Phase 2 (Interactive)

### Priority Guide
- **P0**: Blocking other work
- **P1**: Core functionality
- **P2**: Important but not blocking
- **P3**: Nice to have
