import * as THREE from 'three';
import { World } from '../world/World';
import { Lot, RoadSegment, LotState, LotUsage } from '../types';

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
    present: 0x44FF88,     // Bright neon green - owner is home
    away: 0x888888,        // Medium gray - owner is away
    vacant: 0x555555,      // Dim gray - no owner
};

export class WorldRenderer {
    scene: THREE.Scene;
    group: THREE.Group;

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
        this.renderRoads(world.roads);
        this.renderLots(world.lots);
        this.renderNorthIndicator(world);

        // Center the group
        const box = new THREE.Box3().setFromObject(this.group);
        const center = box.getCenter(new THREE.Vector3());
        this.group.position.x = -center.x;
        this.group.position.z = -center.y;
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
        groundMesh.position.set(centerX, -5, -centerY);
        groundMesh.receiveShadow = true;

        this.group.add(groundMesh);
    }

    private renderNorthIndicator(world: World) {
        // Add a north arrow at the top of the map
        const arrowLength = 100;
        const arrowWidth = 30;

        // Position at north edge of map
        const northX = (world.bounds.minX + world.bounds.maxX) / 2;
        const northY = world.bounds.minY - 50; // Above the map (remember Y is inverted)

        // Arrow shape pointing up (north in SVG coords)
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
        arrowMesh.position.set(northX, 5, -northY);

        this.group.add(arrowMesh);

        // "N" label
        // Using a simple box as placeholder (proper text would need font loading)
        const labelGeo = new THREE.BoxGeometry(20, 2, 30);
        const labelMat = new THREE.MeshBasicMaterial({ color: 0xCC3333 });
        const labelMesh = new THREE.Mesh(labelGeo, labelMat);
        labelMesh.position.set(northX, 6, -northY + 80);
        this.group.add(labelMesh);
    }

    private clear() {
        while (this.group.children.length > 0) {
            const child = this.group.children[0];
            this.group.remove(child);
            if ((child as THREE.Mesh).geometry) (child as THREE.Mesh).geometry.dispose();
        }
    }

    private renderLots(lots: Lot[]) {
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

            // Create shape centered at origin
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

            const material = this.getLotMaterial(lot);
            const mesh = new THREE.Mesh(geometry, material);

            mesh.userData = { type: 'lot', data: lot };
            mesh.name = `Lot ${lot.id}`;

            mesh.rotation.x = -Math.PI / 2;
            mesh.position.set(centerX, 1, -centerY);
            mesh.receiveShadow = true;
            mesh.castShadow = true;

            this.group.add(mesh);

            // Add border outline
            this.renderLotBorder(lot, centerX, centerY, width, height);
        });
    }

    private renderLotBorder(lot: Lot, centerX: number, centerY: number, width: number, height: number) {
        const minX = Math.min(...lot.points.map(p => p.x));
        const minY = Math.min(...lot.points.map(p => p.y));

        // Create border using thin extruded boxes for visibility
        const borderHeight = 5;  // Visible height
        const borderThickness = 1;
        const inset = 6;  // Inset from lot edge to prevent overlap with neighbors

        // Inset the points towards the center
        const centroidX = lot.points.reduce((s, p) => s + p.x, 0) / lot.points.length;
        const centroidY = lot.points.reduce((s, p) => s + p.y, 0) / lot.points.length;

        const points = lot.points.map(p => {
            // Direction from point to centroid
            const dx = centroidX - p.x;
            const dy = centroidY - p.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const nx = dx / dist;
            const ny = dy / dist;

            return {
                x: (p.x + nx * inset) - minX - width / 2,
                z: -((p.y + ny * inset) - minY - height / 2)
            };
        });

        const material = this.getLotBorderMeshMaterial(lot);

        // Create segments between each pair of points
        for (let i = 0; i < points.length; i++) {
            const p1 = points[i];
            const p2 = points[(i + 1) % points.length];

            const dx = p2.x - p1.x;
            const dz = p2.z - p1.z;
            const length = Math.sqrt(dx * dx + dz * dz);
            const angle = Math.atan2(dz, dx);

            const segmentGeo = new THREE.BoxGeometry(length, borderHeight, borderThickness);
            const segment = new THREE.Mesh(segmentGeo, material);

            // Position at midpoint of segment
            segment.position.set(
                centerX + (p1.x + p2.x) / 2,
                2 + borderHeight / 2,  // Raised above lot surface
                -centerY + (p1.z + p2.z) / 2
            );

            // Rotate to align with segment direction
            segment.rotation.y = -angle;

            this.group.add(segment);
        }
    }

    private renderRoads(segments: RoadSegment[]) {
        segments.forEach(seg => {
            const geometry = new THREE.PlaneGeometry(seg.width, seg.height);
            const mesh = new THREE.Mesh(geometry, this.materials.road);
            mesh.rotation.x = -Math.PI / 2;
            mesh.position.set(seg.x + seg.width / 2, 0.5, -(seg.y + seg.height / 2));
            mesh.receiveShadow = true;
            this.group.add(mesh);
        });
    }
}
