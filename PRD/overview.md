# Bombay Beach Simulator - Project Overview

## Vision

An isometric life simulator set in Bombay Beach, California - a small desert community on the shores of the Salton Sea. The game presents a charming, detailed view of daily life in this unique town, rendered in a style more intimate and detailed than classic SimCity.

## Core Concept

- **Location**: Bombay Beach, Salton Sea, Sonoran Desert
- **Style**: Isometric 2.5D, warm desert palette, detailed pixel-art inspired aesthetics
- **Gameplay**: Watch NPCs live their daily lives (Phase 1) / Walk among them as a player (Phase 2)

## Key Features

### Phase 1: Passive Simulation
- Accurate grid-based map of Bombay Beach (643 lots, 16 roads)
- NPC residents with daily routines (wake, work, socialize, sleep)
- Day/night cycle with desert lighting
- Ambient life: cars, birds, dust devils, etc.

### Phase 2: Interactive Mode
- Player avatar can walk around the town
- Interact with NPCs and locations
- First-person exploration of buildings
- Photo mode for capturing scenes

## Visual Identity

### Color Palette (Sonoran Desert / Salton Sea)
- **Sky**: Pale blue (#87CEEB) transitioning to dusty pink (#E8B4B8) at sunset
- **Sand/Ground**: Warm beige (#D4B896), tan (#C9A66B), burnt sienna (#A0522D)
- **Salton Sea**: Murky teal (#4A7C6F), with salt-white (#F5F5DC) shoreline
- **Vegetation**: Sage green (#9CAF88), dusty olive (#6B7B4C)
- **Buildings**: Weathered pastels, rust, corrugated metal grays
- **Accents**: Turquoise (#40E0D0), coral (#FF7F50) - art installations

### Atmosphere
- Heat shimmer effects
- Dust particles in air
- Long shadows (desert sun)
- Occasional tumbleweeds
- Distant mountains/horizon

## Technical Foundation

- **Renderer**: Three.js with WebGPU (TSL/WGSL shaders)
- **Map Data**: SVG-extracted grid (3240x3010 units, ~643 lots)
- **Target**: Modern browsers with WebGPU support (2026)

## Success Metrics

1. Accurate representation of Bombay Beach layout
2. Smooth 60fps rendering on target hardware
3. Believable NPC behaviors
4. Evocative desert atmosphere
5. Engaging player experience (Phase 2)

## References

- Bombay Beach, CA on Google Maps
- Salton Sea documentary imagery
- SimCity (1989-2013) series
- Townscaper aesthetic
- A Short Hike visual style
