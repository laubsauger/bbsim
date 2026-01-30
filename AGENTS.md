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
    - Agents cannot hop over back fences or cross from Lot A directly to adjacent Lot B (unless there is a shared path, initially Assume No).

### 4. Pathfinding Strategy

The Pathfinding System must provide valid paths that respect these constraints.

#### Structure
- **Global Graph**: A navigation graph derived from Road Segments.
    - Nodes: Intersections, Lot Entry Points.
    - Edges: Road Lanes (Vehicle), Sidewalks (Pedestrian).
- **Local Navigation**: Inside a Lot, agents move directly to specific points of interest (Door, Bed, Chair) or randomly wander within bounds.

#### Movement Flow (Example: "Going Home")
1.  **Start**: Agent is at Work (Lot A).
2.  **Exit Lot**: Walk from Building Door -> Lot A Gateway -> Roadside A.
3.  **Transit**:
    - *If Driving*: Enter Car -> Drive Road A -> Road B -> Road C -> Roadside Home.
    - *If Walking*: Walk Sidewalk A -> Sidewalk B -> Sidewalk C -> Roadside Home.
4.  **Enter Lot**: Roadside Home -> Gateway Home -> Park Car (if driving) -> Walk to Door.

## Simulation Data

### Resident
- **Home Lot**: ID of the lot they own/rent.
- **Vehicle**: Optional ID of a vehicle they own.
- **Schedule**: Daily routine (Work, Sleep, Socialize).

### Tourist
- **Temporary State**: Visits for a duration, then leaves map via Highway.
- **Behavior**: Wanders between "Attraction" lots (Art Installations, Ruins, Bar).

## Implementation Roadmap

1.  **Data Refinements**:
    - Compute "Frontage" edge for every Lot.
    - Generate "Gateway" points for every Lot.
    - Generate Navigation Graph (Nodes/Edges).
2.  **Movement Logic**:
    - Implement precise "Lane Following" (not just random points).
    - Implement "Gate Traversal" (Road <-> Lot).
3.  **Agent Logic**:
    - State Machine: `IDLE` -> `WALKING_TO_CAR` -> `DRIVING` -> `PARKING` -> `WALKING_TO_DOOR`.
