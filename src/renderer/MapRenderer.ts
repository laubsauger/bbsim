import * as THREE from 'three';
import { MapData, Lot, RoadSegment } from '../types';

export class MapRenderer {
    scene: THREE.Scene;
    mapGroup: THREE.Group;

    private lotMaterial: THREE.Material;
    private roadMaterial: THREE.Material;

    constructor(scene: THREE.Scene) {
        this.scene = scene;
        this.mapGroup = new THREE.Group();
        this.scene.add(this.mapGroup);

        this.lotMaterial = new THREE.MeshStandardMaterial({
            color: 0xcccccc,
            roughness: 0.8,
            metalness: 0.1,
            side: THREE.DoubleSide
        });

        this.roadMaterial = new THREE.MeshStandardMaterial({
            color: 0x222222,
            roughness: 0.9,
            metalness: 0.0,
            side: THREE.DoubleSide
        });
    }

    public render(data: MapData) {
        this.clear();
        this.renderLots(data.lots);
        this.renderRoads(data.road_segments);

        // Center the map
        const box = new THREE.Box3().setFromObject(this.mapGroup);
        const center = box.getCenter(new THREE.Vector3());
        this.mapGroup.position.x = -center.x;
        this.mapGroup.position.z = -center.y; // Adjustment for Y->Z mapping

        // Ensure Group Scale Z = -1 is respected by Bounding Box centering logic?
        // Box3 handles world transforms if setFromObject is used. 
        // But mapGroup hasn't been rendered yet.
        // It's safer to center primarily.
    }

    private clear() {
        while (this.mapGroup.children.length > 0) {
            const child = this.mapGroup.children[0];
            this.mapGroup.remove(child);
            if ((child as THREE.Mesh).geometry) (child as THREE.Mesh).geometry.dispose();
        }
    }

    private renderLots(lots: Lot[]) {
        lots.forEach(lot => {
            const shape = new THREE.Shape();
            if (lot.points.length > 0) {
                shape.moveTo(lot.points[0].x, lot.points[0].y);
                for (let i = 1; i < lot.points.length; i++) {
                    shape.lineTo(lot.points[i].x, lot.points[i].y);
                }
                shape.closePath();

                const height = 10 + Math.random() * 20;
                const geometry = new THREE.ExtrudeGeometry(shape, {
                    depth: height,
                    bevelEnabled: false
                });

                const mesh = new THREE.Mesh(geometry, this.lotMaterial);

                // Align Base to Y=0.
                mesh.rotation.x = -Math.PI / 2;

                this.mapGroup.add(mesh);
            }
        });
        // Flip Z scale to match SVG coordinate system orientation
        this.mapGroup.scale.z = -1;
    }

    private renderRoads(segments: RoadSegment[]) {
        segments.forEach(seg => {
            // Use PlaneGeometry for flat roads at Y=0
            const geometry = new THREE.PlaneGeometry(seg.width, seg.height);
            const mesh = new THREE.Mesh(geometry, this.roadMaterial);

            mesh.rotation.x = -Math.PI / 2;

            // Position manually to match transposed coordinates
            // Z needs to be negative because we flip the group scale Z (?)
            // Actually, if Group.scale.z = -1.
            // And we want Road at Logical (x, y_svg).
            // Logic Lot: (x, 0, -y_svg). Group -> (x, 0, y_svg).
            // Logic Road need: (x, 0, y_svg).
            // So Road Mesh Position should be (x, 0, -y_svg).
            // Yes.

            mesh.position.set(seg.x + seg.width / 2, 0.05, -(seg.y + seg.height / 2));

            this.mapGroup.add(mesh);
        });
    }
}
