Coordinate Mapping (SVG ↔ 3D)
================================

We store roads/lots in SVG coordinates (x,y). The 3D scene uses:

    3D.x = SVG.x
    3D.z = -SVG.y

All agents/pathing are kept in SVG coordinates. WorldRenderer recenters the whole
world by shifting its group; do NOT bake that offset into pathfinding math.

This matches WorldRenderer, which places roads/lots at z = -y.

Keep this consistent everywhere:
- PathfindingSystem (toSvg / toWorld)
- Minimap (agent dots and camera target)
- RoadGraph / PedestrianGraph debug visuals
- Any spawn/target positions derived from SVG

If this flips, entities, nav graphs, and minimap will drift or mirror.
