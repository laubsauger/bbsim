# Agent System Specification

This document outlines the behavior types, constraint rules, and simulation logic for Agents in the Bombay Beach Simulator.

## Core Concepts

### 1. Distinction: Agents vs Vehicles
"Agents" (Pedestrians) and "Vehicles" (Cars) are distinct entities with different movement rules, but they are conceptually linked.
- **Agents (Pedestrians)**: Individual simulated humans (Residents, Tourists).
- **Vehicles (Cars)**: Machines that can be *occupied* by Agents. They do not drive themselves.

### 2. Constraint Rules

To maintain realism, movement is strictly constrained by the town's physical structure.

#### Vehicles
- **Restricted Domain**: Can **ONLY** exist on:
    1.  **Road Network**: Driving along defined lanes.
    2.  **Lots**: Parked at a specific "Parking Spot" coordinate within a Lot.
- **Illegal States**:
    - Driving off-road (sand/terrain).
    - Clipping through fences or buildings.
    - Stopping in the middle of a road (unless blocked by traffic).

#### Pedestrians
- **Restricted Domain**: Can walk on:
    1.  **Sidewalks/Road Shoulders**: Following the road network but offset from traffic.
    2.  **Lots**: Walking within Lot boundaries.
- **Illegal States**:
    - Walking through Fences or Walls.
    - Walking through closed physics boundaries of a Lot.

### 3. Entry & Exit Logic

Transitions between the **Road Network** and **Private Lots** must occur at specific "Gateways".

- **The "Roadside" Rule**:
    - Every Lot defines a "Frontage" side—typically the shorter edge facing the nearest road.
    - Entry/Exit paths must connect the Road's edge to the Lot's "Gateway" point.
- **Driveways & Gates**:
    - Vehicles use "Drive-in" points (offset from parking spot) to enter smoothly.
    - Pedestrians use "Gates" (fence openings) or "Sidewalk" access points.

### 4. Pathfinding Strategy

The Pathfinding System (`PathfindingSystem.ts`) manages all movement.

#### Structure
- **Road Graph**: A* navigation graph for Vehicles. Nodes at intersections and along road segments.
- **Pedestrian Graph**: Separate graph for sidewalks. Ensures pedestrians stay safe from traffic.
- **Local Navigation**: 
    - Inside Lots: Agents use direct movement or "Wander" logic (with boundary checks).
    - **Bounce Prevention**: Agents on public paths (Sidewalks/Roads) are allowed to traverse edge-cases where lot boundaries might overlap the public right-of-way.

#### Movement Flow (Example: "Going Home")
1.  **Start**: Agent is at Work (Lot A).
2.  **Exit Lot**: Walk from Building Door -> Lot A Gateway -> Roadside A.
3.  **Transit**:
    - *If Driving*: Enter Car -> Drive Road A -> Road B -> Roadside Home.
    - *If Walking*: Walk Sidewalk A -> Sidewalk B -> Roadside Home.
4.  **Enter Lot**: Roadside Home -> Gateway Home -> Park Car -> Walk to Door.

## Simulation Data

### Resident
- **Home Lot**: ID of the lot they own/rent.
- **Vehicle**: Optional ID of a vehicle they own.
- **Schedule**: Daily routine (Work, Sleep, Socialize).
- **Pets**: May own a Cat or Dog.

### Tourist
- **Temporary State**: Visits for a duration, then leaves map via Highway.
- **Behavior**: Wanders between "Attraction" lots (Art Installations, Ruins, Bar).
- **Lodging**: May stay at a Lodging lot (Motel/Campground).

### Service Agents
- **Sheriff**: Patrols the town roads, occasionally stopping at key locations.
- **School Bus**: Follows a fixed route to pick up/drop off children (Implementation in progress).

### Pets (Ambient)
- **Cats**: Roam freely, can enter any lot (ignoring fences). Tend to wander near home.
- **Dogs**: Roam inside lots, occasionally venture out. Constrained by fences unless with owner (future).

## Implementation Status (Current)

- **Graphs**: Fully implemented (Road & Pedestrian).
- **Schedules**: Residents have 24h routines.
- **Tourists**: Spawning and visiting attractions.
- **Pets**: Basic wandering behavior implemented.
- **Vehicles**: Parking logic, collision avoidance (separation), and road adhesion logic implemented.
