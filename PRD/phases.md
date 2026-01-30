# Development Phases

## Phase 0: Foundation (Current)

### 0.1 Project Setup
- [x] Extract map data from SVG
- [x] Create visualization prototype
- [x] Set up TypeScript + Vite project
- [x] Configure Three.js with WebGPU renderer
- [x] Implement basic isometric camera

### 0.2 Map Rendering
- [x] Load and parse map_data.json
- [x] Render ground plane with desert texture
- [x] Draw road network
- [x] Draw lot boundaries
- [x] Basic camera controls (pan, zoom)

### 0.3 Visual Foundation
- [ ] Implement day/night lighting system
- [x] Create desert color palette materials (warm Sonoran palette)
- [ ] Add basic atmosphere (dust particles)
- [x] Implement shadows
- [x] Improved lighting (hemisphere + directional sun)
- [x] ACES filmic tone mapping
- [x] Fixed z-fighting artifacts
- [x] Cleaner minimap with cached rendering

---

## Phase 1: Passive Simulation

### 1.1 Buildings
- [ ] Define building types (residential, commercial, art installations)
- [ ] Create procedural building generator
- [x] Place buildings on lots (Base Geometry)
- [ ] Add building details (windows, doors, signs)

### 1.2 NPC System
- [x] Create NPC data structure (Agent class)
- [ ] Implement basic pathfinding on road network (Strict)
- [x] Create daily schedule system (TimeSystem)
- [ ] Implement state machine for NPC behaviors

### 1.3 NPC Behaviors
- [ ] Wake up / go to sleep routines
- [ ] Walking between locations
- [ ] Work activities
- [ ] Social interactions (talking, gathering)
- [ ] Random idle behaviors

### 1.4 Vehicles
- [x] Car models (Base Geometry)
- [x] Vehicle pathfinding on roads (Random)
- [ ] Parking behavior
- [ ] Occasional through-traffic

### 1.5 Ambient Life
- [ ] Birds (flying, perching)
- [ ] Tumbleweeds
- [ ] Dust devils
- [ ] Wind effects on objects

### 1.6 Time & Weather
- [ ] Complete day/night cycle
- [ ] Sunrise/sunset colors
- [ ] Temperature simulation (heat shimmer)
- [ ] Occasional dust storms
- [ ] Rare rain events

### 1.7 Audio (Optional)
- [ ] Ambient desert sounds
- [ ] Distant highway noise
- [ ] NPC chatter (mumbles)
- [ ] Vehicle sounds

---

## Phase 2: Interactive Mode

### 2.1 Player Avatar
- [ ] Create player character
- [ ] Implement WASD movement
- [ ] Camera follow behavior
- [ ] Collision detection with buildings/NPCs

### 2.2 Interaction System
- [ ] Click/tap to interact
- [ ] NPC dialogue system
- [ ] Building entry (interior views?)
- [ ] Object interaction (pick up, examine)

### 2.3 Player Activities
- [ ] Photography mode
- [ ] Map/journal system
- [ ] Discovery system (find all locations)
- [ ] Simple quests/objectives

### 2.4 Social Features
- [ ] NPC relationships
- [ ] Reputation system
- [ ] Town events (gatherings, art shows)

---

## Phase 3: Polish & Content

### 3.1 Art & Assets
- [ ] Unique building designs for key locations
- [ ] NPC character variations
- [ ] Vehicle variety
- [ ] Prop library (cacti, signs, art, debris)

### 3.2 Locations of Interest
- [ ] Bombay Beach Ruins
- [ ] The Ski Inn (bar)
- [ ] Art installations
- [ ] Salton Sea shoreline
- [ ] Drive-in theater ruins

### 3.3 Performance
- [ ] LOD system optimization
- [ ] Culling improvements
- [ ] Memory management
- [ ] Mobile optimization (Phase 3+)

### 3.4 UI/UX
- [ ] Main menu
- [ ] Settings
- [x] Time controls (lil-gui)
- [x] Mini-map (with click-to-navigate)
- [x] Legend
- [ ] Save/load system

---

## Milestones

| Milestone | Target | Description |
|-----------|--------|-------------|
| M0 | Week 2 | Map renders with roads and lots |
| M1 | Week 4 | Buildings placed, day/night works |
| M2 | Week 6 | NPCs walking around |
| M3 | Week 8 | Full daily simulation loop |
| M4 | Week 10 | Player can walk around |
| M5 | Week 12 | Interactions working |
| M6 | Week 16 | Polished demo |

---

## Risk Areas

1. **WebGPU Compatibility**: May need WebGL2 fallback
2. **Performance**: Many NPCs + buildings could strain rendering
3. **Art Assets**: Need consistent style across all elements
4. **NPC AI**: Making behaviors feel natural is hard
5. **Scope Creep**: Easy to add features, hard to finish
