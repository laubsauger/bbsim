# Task Tracking

## Current Sprint: Visual Polish & Simulation

### In Progress
- [ ] **TASK-021**: Create simple box building generator (Procedural buildings)
- [ ] **TASK-042**: Create day/night lighting transitions (Refinement)
- [ ] **TASK-044**: Implement dust particle system

### Up Next
- [ ] **TASK-050**: Birds (flying, perching)
- [ ] **TASK-051**: Tumbleweeds
- [ ] **TASK-024**: Add building detail props (doors, windows)

### Backlog

#### Rendering
- [ ] **TASK-010**: Implement TSL desert ground shader
- [ ] **TASK-014**: Create skybox/gradient background
- [ ] **TASK-043**: Add heat shimmer post-processing effect

#### Buildings
- [ ] **TASK-022**: Add building placement logic per lot
- [ ] **TASK-023**: Implement building instancing for performance

#### Ambient
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
- [x] **TASK-041**: Implement sun position based on time (day/night cycle)

### NPCs & Simulation (030-039)
- [x] **TASK-030**: Create NPC data model (Agent class)
- [x] **TASK-020**: Define building type enum and data structure
- [x] **TASK-032**: Create A* pathfinding (RoadGraph & PedestrianGraph)
- [x] **TASK-031**: Implement random pathfinding on roads
- [x] **TASK-033**: Implement basic NPC/Vehicle movement
- [x] **TASK-034**: Create NPC state machine (Resident behaviors)
- [x] **TASK-035**: Implement daily schedule integration (ResidentScheduleSystem)
- [x] **TASK-036**: Implement Tourist system (Spawning, Visiting, Leaving)
- [x] **TASK-037**: Implement Service Vehicles (School Bus, Sheriff)
- [x] **TASK-038**: Implement Address system

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
