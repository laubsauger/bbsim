import * as THREE from 'three';
import { World } from '../world/World';
import { Lot, RoadSegment, LotState, LotUsage, Building } from '../types';

// Terrain colors
const TERRAIN_COLORS = {
    sand: 0xC9A66B,
    asphalt: 0x4A4A4A,  // Lighter asphalt grey
};

// Lot colors - darker base colors for better entity visibility
// Color indicates OWNERSHIP STATUS (occupied, abandoned, for_sale, empty)
const LOT_BASE_COLORS = {
    occupied: 0x3D5C47,    // Dark green - someone lives here
    abandoned: 0x6B4D4D,   // Muted dusty rose - neglected
    forSale: 0x3D4D5C,     // Dark blue-gray - on market
    empty: 0x4A4A4A,       // Dark gray - vacant lot
};

// Border colors indicate PRESENCE STATUS (home vs away)
const LOT_BORDER_COLORS = {
    present: 0x3A9A6A,     // Muted green - owner is home
    away: 0x666666,        // Medium gray - owner is away
    vacant: 0x444444,      // Dim gray - no owner
};

export class WorldRenderer {
    scene: THREE.Scene;
    group: THREE.Group;
    worldCenterOffset: THREE.Vector3 = new THREE.Vector3();
    buildingGroup?: THREE.Group;

    // Materials
    materials: Record<string, THREE.MeshStandardMaterial> = {};
    borderMaterials: Record<string, THREE.LineBasicMaterial> = {};

    constructor(scene: THREE.Scene) {
        this.scene = scene;
        this.group = new THREE.Group();
        this.scene.add(this.group);

        this.initMaterials();
    }

    private initMaterials() {
        // Road material
        this.materials.road = new THREE.MeshStandardMaterial({
            color: TERRAIN_COLORS.asphalt,
            roughness: 0.95,
            metalness: 0.0,
        });

        // Lot base materials (ownership status)
        this.materials['lot_occupied'] = new THREE.MeshStandardMaterial({
            color: LOT_BASE_COLORS.occupied,
            roughness: 0.8,
            metalness: 0.0,
        });
        this.materials['lot_abandoned'] = new THREE.MeshStandardMaterial({
            color: LOT_BASE_COLORS.abandoned,
            roughness: 0.9,
            metalness: 0.0,
        });
        this.materials['lot_forSale'] = new THREE.MeshStandardMaterial({
            color: LOT_BASE_COLORS.forSale,
            roughness: 0.7,
            metalness: 0.0,
        });
        this.materials['lot_empty'] = new THREE.MeshStandardMaterial({
            color: LOT_BASE_COLORS.empty,
            roughness: 0.9,
            metalness: 0.0,
        });

        // Border materials (presence status)
        this.borderMaterials['present'] = new THREE.LineBasicMaterial({
            color: LOT_BORDER_COLORS.present,
            linewidth: 2,
        });
        this.borderMaterials['away'] = new THREE.LineBasicMaterial({
            color: LOT_BORDER_COLORS.away,
            linewidth: 1,
        });
        this.borderMaterials['vacant'] = new THREE.LineBasicMaterial({
            color: LOT_BORDER_COLORS.vacant,
            linewidth: 1,
        });

        this.materials['building'] = new THREE.MeshStandardMaterial({
            color: 0xE6E0D4, // Almond/Bone
            roughness: 0.8,
            metalness: 0.0,
        });
    }

    public getLotMaterialPublic(lot: Lot): THREE.MeshStandardMaterial {
        return this.getLotMaterial(lot);
    }

    private getLotMaterial(lot: Lot): THREE.MeshStandardMaterial {
        // Determine base color from ownership status
        switch (lot.state) {
            case LotState.OCCUPIED:
            case LotState.AWAY:
                return this.materials['lot_occupied'];
            case LotState.ABANDONED:
                return this.materials['lot_abandoned'];
            case LotState.FOR_SALE:
                return this.materials['lot_forSale'];
            default:
                return this.materials['lot_empty'];
        }
    }

    private getLotBorderMaterial(lot: Lot): THREE.LineBasicMaterial {
        // Determine border color from presence status
        switch (lot.state) {
            case LotState.OCCUPIED:
                return this.borderMaterials['present'];
            case LotState.AWAY:
                return this.borderMaterials['away'];
            default:
                return this.borderMaterials['vacant'];
        }
    }

    private getLotBorderMeshMaterial(lot: Lot): THREE.MeshBasicMaterial {
        // Determine border color from presence status - using MeshBasicMaterial for visibility
        switch (lot.state) {
            case LotState.OCCUPIED:
                return new THREE.MeshBasicMaterial({ color: LOT_BORDER_COLORS.present });
            case LotState.AWAY:
                return new THREE.MeshBasicMaterial({ color: LOT_BORDER_COLORS.away });
            default:
                return new THREE.MeshBasicMaterial({ color: LOT_BORDER_COLORS.vacant });
        }
    }

    public render(world: World) {
        this.clear();

        this.renderGround(world);

        // Calculate minimal bounds (tight fit) for map texture projection
        // This MUST match the bounds used for the map texture itself
        // Use the World bounds (which are now ViewBox-accurate) for texture projection.
        // This ensures the texture (which covers the whole ViewBox) maps 1:1.
        const mapBounds = { ...world.bounds };

        this.renderRoads(world.roads, mapBounds);
        this.renderLots(world.lots, mapBounds);
        this.renderBuildings(world.buildings || [], mapBounds);
        this.renderNorthIndicator(world);

        // Center the group - compute center from the bounding box
        const box = new THREE.Box3().setFromObject(this.group);
        const center = box.getCenter(new THREE.Vector3());
        this.group.position.x = -center.x;
        this.group.position.z = -center.z;

        // Store the world center offset for entity positioning
        this.worldCenterOffset = new THREE.Vector3(center.x, 0, center.z);
    }

    private renderGround(world: World) {
        const groundMaterial = new THREE.MeshStandardMaterial({
            color: TERRAIN_COLORS.sand,
            roughness: 1.0,
            metalness: 0.0,
        });

        const w = world.bounds.maxX - world.bounds.minX;
        const h = world.bounds.maxY - world.bounds.minY;
        const centerX = (world.bounds.minX + world.bounds.maxX) / 2;
        const centerY = (world.bounds.minY + world.bounds.maxY) / 2;

        const padding = 500;
        const groundSize = Math.max(w, h) + padding;
        const ground = new THREE.PlaneGeometry(groundSize, groundSize);
        const groundMesh = new THREE.Mesh(ground, groundMaterial);

        groundMesh.rotation.x = -Math.PI / 2;
        // Coordinate transform: SVG (x, y) → 3D (x, height, y) - Matches SVG coordinates
        groundMesh.position.set(centerX, -5, centerY);
        groundMesh.receiveShadow = true;

        this.group.add(groundMesh);
    }

    private renderNorthIndicator(world: World) {
        // Add a north arrow at the north edge of the map
        const arrowLength = 100;
        const arrowWidth = 30;

        // Position at north edge of map (low Y in SVG = north)
        const northX = (world.bounds.minX + world.bounds.maxX) / 2;
        const northY = world.bounds.minY - 50;

        // Arrow shape pointing north (away from camera in 3D, which is -Z direction)
        const arrowShape = new THREE.Shape();
        arrowShape.moveTo(0, arrowLength / 2);
        arrowShape.lineTo(-arrowWidth / 2, -arrowLength / 2);
        arrowShape.lineTo(0, -arrowLength / 4);
        arrowShape.lineTo(arrowWidth / 2, -arrowLength / 2);
        arrowShape.closePath();

        const arrowGeo = new THREE.ShapeGeometry(arrowShape);
        const arrowMat = new THREE.MeshBasicMaterial({ color: 0xCC3333, side: THREE.DoubleSide });
        const arrowMesh = new THREE.Mesh(arrowGeo, arrowMat);

        arrowMesh.rotation.x = -Math.PI / 2;
        // Coordinate transform: SVG (x, y) → 3D (x, height, y)
        arrowMesh.position.set(northX, 5, northY);

        this.group.add(arrowMesh);

        // "N" label
        const labelGeo = new THREE.BoxGeometry(20, 2, 30);
        const labelMat = new THREE.MeshBasicMaterial({ color: 0xCC3333 });
        const labelMesh = new THREE.Mesh(labelGeo, labelMat);
        // Position label north of arrow (lower Y/Z value)
        labelMesh.position.set(northX, 6, northY - 80);
        this.group.add(labelMesh);
    }

    private clear() {
        while (this.group.children.length > 0) {
            const child = this.group.children[0];
            this.group.remove(child);
            if ((child as THREE.Mesh).geometry) (child as THREE.Mesh).geometry.dispose();
        }
    }

    private renderLots(lots: Lot[], mapBounds: { minX: number, maxX: number, minY: number, maxY: number }) {
        // First pass: render lot fills
        lots.forEach(lot => {
            if (lot.points.length === 0) return;

            const minX = Math.min(...lot.points.map(p => p.x));
            const maxX = Math.max(...lot.points.map(p => p.x));
            const minY = Math.min(...lot.points.map(p => p.y));
            const maxY = Math.max(...lot.points.map(p => p.y));
            const width = maxX - minX;
            const height = maxY - minY;
            const centerX = minX + width / 2;
            const centerY = minY + height / 2;

            // Create shape centered at origin (Standard orientation)
            const shape = new THREE.Shape();
            shape.moveTo(lot.points[0].x - minX - width / 2, lot.points[0].y - minY - height / 2);
            for (let i = 1; i < lot.points.length; i++) {
                shape.lineTo(lot.points[i].x - minX - width / 2, lot.points[i].y - minY - height / 2);
            }
            shape.closePath();

            // Extrude for 3D effect
            const geometry = new THREE.ExtrudeGeometry(shape, {
                steps: 1,
                depth: 1,
                bevelEnabled: false,
            });

            this.applyMapUVs(geometry, centerX, centerY, mapBounds);

            const material = this.getLotMaterial(lot);
            const mesh = new THREE.Mesh(geometry, material);

            mesh.userData = { type: 'lot', data: lot };
            mesh.name = `Lot ${lot.id}`;

            mesh.rotation.x = -Math.PI / 2;
            // Coordinate transform: SVG (x, y) → 3D (x, height, y)
            mesh.position.set(centerX, 1, centerY);
            mesh.receiveShadow = true;
            mesh.castShadow = true;

            this.group.add(mesh);

            // Render Gates
            if (lot.gatePositions) {
                const gateGeo = new THREE.BoxGeometry(1.5, 6, 1.5); // Thin pillars
                const gateMat = new THREE.MeshStandardMaterial({ color: 0x5D4037 }); // Dark brown

                lot.gatePositions.forEach(gate => {
                    // Render a simple arch or two pillars
                    // Since we don't know orientation easily without edge data, just place markers
                    const p1 = new THREE.Mesh(gateGeo, gateMat);
                    p1.position.set(gate.x - 2, 3, gate.y);
                    p1.castShadow = true;
                    this.group.add(p1);

                    const p2 = new THREE.Mesh(gateGeo, gateMat);
                    p2.position.set(gate.x + 2, 3, gate.y);
                    p2.castShadow = true;
                    this.group.add(p2);
                });
            }
        });

        // Second pass: render unique lot borders (collapsed/deduplicated)
        this.renderAllLotBorders(lots);
    }

    private renderAllLotBorders(lots: Lot[]) {
        // Collect all unique edges from all lots
        const edgeSet = new Set<string>();
        const edges: { x1: number; y1: number; x2: number; y2: number }[] = [];

        // Helper to create normalized edge key
        const edgeKey = (x1: number, y1: number, x2: number, y2: number) => {
            // Round to avoid floating point issues
            const rx1 = Math.round(x1);
            const ry1 = Math.round(y1);
            const rx2 = Math.round(x2);
            const ry2 = Math.round(y2);
            // Normalize so smaller point comes first
            if (rx1 < rx2 || (rx1 === rx2 && ry1 < ry2)) {
                return `${rx1},${ry1}-${rx2},${ry2}`;
            }
            return `${rx2},${ry2}-${rx1},${ry1}`;
        };

        // Collect unique edges
        lots.forEach(lot => {
            if (lot.points.length < 2) return;
            for (let i = 0; i < lot.points.length; i++) {
                const p1 = lot.points[i];
                const p2 = lot.points[(i + 1) % lot.points.length];
                const key = edgeKey(p1.x, p1.y, p2.x, p2.y);
                if (!edgeSet.has(key)) {
                    edgeSet.add(key);
                    edges.push({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y });
                }
            }
        });

        // Create line geometry for all edges
        const linePoints: THREE.Vector3[] = [];
        edges.forEach(edge => {
            // Convert SVG coords to 3D world coords: SVG (x, y) → 3D (x, height, y)
            linePoints.push(new THREE.Vector3(edge.x1, 3, edge.y1));
            linePoints.push(new THREE.Vector3(edge.x2, 3, edge.y2));
        });

        // Use LineSegments for efficient rendering of disconnected lines
        const geometry = new THREE.BufferGeometry().setFromPoints(linePoints);
        const material = new THREE.LineBasicMaterial({
            color: 0x555555,
            linewidth: 1,
        });
        const borderLines = new THREE.LineSegments(geometry, material);
        borderLines.userData = { type: 'lot-borders' };
        this.group.add(borderLines);
    }

    private renderRoads(segments: RoadSegment[], mapBounds: { minX: number, maxX: number, minY: number, maxY: number }) {
        // Add slight padding to roads to close micro-gaps with lot boundaries
        const roadPadding = 2; // Extra padding on each side

        segments.forEach(seg => {
            // Expand road dimensions to overlap with lot boundaries
            const paddedWidth = seg.width + roadPadding * 2;
            const paddedHeight = seg.height + roadPadding * 2;

            const geometry = new THREE.PlaneGeometry(paddedWidth, paddedHeight);

            // Apply World UVs
            const centerX = seg.x + seg.width / 2;
            const centerY = seg.y + seg.height / 2;
            this.applyMapUVs(geometry, centerX, centerY, mapBounds);

            const mesh = new THREE.Mesh(geometry, this.materials.road);
            mesh.rotation.x = -Math.PI / 2;
            // Coordinate transform: SVG (x, y) → 3D (x, height, y)
            mesh.position.set(
                seg.x + seg.width / 2,
                0.5 + (seg.type === 'vertical' ? 0.05 : 0), // Slight offset for vertical roads to avoid Z-fighting
                seg.y + seg.height / 2
            );
            mesh.receiveShadow = true;
            mesh.userData = { type: 'road', data: seg };
            mesh.name = `Road ${seg.x},${seg.y}`;
            this.group.add(mesh);
        });
    }
    private renderBuildings(buildings: Building[], mapBounds: { minX: number, maxX: number, minY: number, maxY: number }) {
        const buildingGroup = new THREE.Group();
        buildingGroup.name = 'Buildings';
        buildingGroup.visible = true;

        buildings.forEach(building => {
            if (building.points.length < 3) return;

            const minX = Math.min(...building.points.map(p => p.x));
            const maxX = Math.max(...building.points.map(p => p.x));
            const minY = Math.min(...building.points.map(p => p.y));
            const maxY = Math.max(...building.points.map(p => p.y));
            const width = maxX - minX;
            const height = maxY - minY;
            const centerX = minX + width / 2;
            const centerY = minY + height / 2;

            const shape = new THREE.Shape();
            // User requested West-East flip relative to the 180-rotated state.
            // Current state was (-x, -y). Flipping X gives (x, -y).
            shape.moveTo((building.points[0].x - centerX), -(building.points[0].y - centerY));
            for (let i = 1; i < building.points.length; i++) {
                shape.lineTo((building.points[i].x - centerX), -(building.points[i].y - centerY));
            }
            shape.closePath();

            // Height calculation with variance
            // Seed based on ID for stability
            const seed = building.id * 12.345;
            const r = Math.abs(Math.sin(seed));

            // 95% single story (18-24 units), 5% double story (40-45 units)
            // Mobile homes are often low
            let buildingHeight = 18 + r * 6;
            if (r > 0.95) buildingHeight = 40 + (r - 0.95) * 100;

            const geometry = new THREE.ExtrudeGeometry(shape, {
                steps: 1,
                depth: buildingHeight,
                bevelEnabled: false,
            });

            // Apply Map UVs for texture projection (roofs will pick this up)
            this.applyMapUVs(geometry, centerX, centerY, mapBounds);

            const mesh = new THREE.Mesh(geometry, this.materials['building']);
            mesh.name = `Building ${building.id}`;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.userData = { type: 'building', data: building };

            // Positioning
            mesh.rotation.x = -Math.PI / 2;
            // Place on top of lots (y=2)
            mesh.position.set(centerX, 2, centerY);

            buildingGroup.add(mesh);
        });

        this.group.add(buildingGroup);
        this.buildingGroup = buildingGroup;
    }

    public setBuildingsVisible(visible: boolean) {
        if (this.buildingGroup) {
            this.buildingGroup.visible = visible;
        }
    }

    private applyMapUVs(geometry: THREE.BufferGeometry, cx: number, cy: number, bounds: { minX: number, maxX: number, minY: number, maxY: number }) {
        const pos = geometry.attributes.position;
        const uvs = new Float32Array(pos.count * 2);
        const width = bounds.maxX - bounds.minX;
        const height = bounds.maxY - bounds.minY;

        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i);
            const y = pos.getY(i);

            // Geometry is rotated -90 X later.
            // Local X -> World X relative to center
            // Local Y -> World Z relative to center
            const worldX = cx + x;
            const worldZ = cy + y;

            // Map U: (worldX - minX) / width
            // Map V: 1 - (worldZ - minY) / height (Flipped Y)
            const u = (worldX - bounds.minX) / width;
            const v = 1 - (worldZ - bounds.minY) / height;

            uvs[i * 2] = u;
            uvs[i * 2 + 1] = v;
        }
        geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    }
}
