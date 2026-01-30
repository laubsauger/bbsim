import * as THREE from 'three';
import { Resident } from '../entities/Resident';
import { Vehicle } from '../entities/Vehicle';
import { Lot } from '../types';

type HighlightKind = 'primary' | 'related';

interface HighlightSpec {
    key: string;
    kind: HighlightKind;
    object?: THREE.Object3D | null;
    position?: THREE.Vector3;
    radius: number;
}

export class SelectionHighlighter {
    private group: THREE.Group;
    private visualsByKey: Map<string, THREE.Group> = new Map();
    private specs: HighlightSpec[] = [];
    private residents: Resident[] = [];
    private vehicles: Vehicle[] = [];
    private lots: Lot[] = [];
    private enabled: boolean = true;
    private lastSelection: { type: string; data: any } | null = null;
    private glowTextures: Map<HighlightKind, THREE.Texture> = new Map();

    constructor(parent: THREE.Group) {
        this.group = new THREE.Group();
        this.group.name = 'SelectionHighlighter';
        parent.add(this.group);
        this.glowTextures.set('primary', this.createGlowTexture('rgba(255, 215, 106, 0.9)'));
        this.glowTextures.set('related', this.createGlowTexture('rgba(95, 214, 255, 0.8)'));
    }

    setData(residents: Resident[], vehicles: Vehicle[], lots: Lot[]) {
        this.residents = residents;
        this.vehicles = vehicles;
        this.lots = lots;
    }

    setEnabled(enabled: boolean) {
        this.enabled = enabled;
        if (enabled) {
            this.setSelection(this.lastSelection);
        } else {
            this.clear();
        }
    }

    clear() {
        this.specs = [];
        this.syncRings();
    }

    setSelection(entity: { type: string; data: any } | null) {
        this.lastSelection = entity;
        if (!this.enabled || !entity) {
            this.clear();
            return;
        }

        const specs: HighlightSpec[] = [];

        if (entity.type === 'resident') {
            const resident = entity.data as Resident;
            specs.push(this.specForResident(resident, 'primary'));
            specs.push(...this.specsForResidentRelations(resident));
        } else if (entity.type === 'vehicle') {
            const vehicle = entity.data as Vehicle;
            specs.push(this.specForVehicle(vehicle, 'primary'));
            specs.push(...this.specsForVehicleRelations(vehicle));
        } else if (entity.type === 'lot') {
            const lot = entity.data as Lot;
            specs.push(this.specForLot(lot, 'primary'));
            specs.push(...this.specsForLotRelations(lot));
        }

        this.specs = specs.filter(Boolean);
        this.syncRings();
    }

    update(delta: number) {
        if (this.specs.length === 0) return;

        const pulse = 0.06 + Math.sin(Date.now() * 0.004) * 0.06;
        const glow = 0.55 + Math.sin(Date.now() * 0.005) * 0.15;

        this.specs.forEach(spec => {
            const visual = this.visualsByKey.get(spec.key);
            if (!visual) return;
            if (spec.object) {
                visual.position.copy(spec.object.position);
            } else if (spec.position) {
                visual.position.copy(spec.position);
            }
            // Lift above lots (y=2) to prevent z-fighting
            visual.position.y = 2.5;
            visual.scale.set(1 + pulse, 1 + pulse, 1 + pulse);
            visual.traverse(obj => {
                if (obj instanceof THREE.Sprite && obj.material instanceof THREE.SpriteMaterial) {
                    obj.material.opacity = glow;
                }
            });
        });
    }

    private syncRings() {
        const nextKeys = new Set(this.specs.map(spec => spec.key));

        Array.from(this.visualsByKey.entries()).forEach(([key, visual]) => {
            if (!nextKeys.has(key)) {
                this.group.remove(visual);
                visual.traverse(obj => {
                    if (obj instanceof THREE.Mesh) {
                        obj.geometry.dispose();
                        (obj.material as THREE.Material).dispose();
                    }
                    if (obj instanceof THREE.Sprite) {
                        (obj.material as THREE.Material).dispose();
                    }
                });
                this.visualsByKey.delete(key);
            }
        });

        this.specs.forEach(spec => {
            if (!this.visualsByKey.has(spec.key)) {
                const visual = this.createVisual(spec.radius, spec.kind);
                this.visualsByKey.set(spec.key, visual);
                this.group.add(visual);
            }
        });
    }

    private createVisual(radius: number, kind: HighlightKind): THREE.Group {
        const group = new THREE.Group();
        const ring = this.createRing(radius, kind);
        const outer = this.createRing(radius * 1.2, kind, 0.35);
        const sprite = this.createGlowSprite(kind, radius * 2.2);
        const beacon = this.createBeacon(kind, radius * 0.6);
        sprite.position.y = 6;
        beacon.position.y = 2;
        group.add(ring, outer, sprite, beacon);
        return group;
    }

    private createRing(radius: number, kind: HighlightKind, opacity: number = 0.85): THREE.Mesh {
        const inner = Math.max(2, radius * 0.78);
        const outer = Math.max(inner + 2, radius);
        const geometry = new THREE.RingGeometry(inner, outer, 48);
        const color = kind === 'primary' ? 0xffd76a : 0x5fd6ff;
        const material = new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: kind === 'primary' ? opacity : opacity * 0.8,
            side: THREE.DoubleSide,
            depthWrite: false,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.rotation.x = -Math.PI / 2;
        return mesh;
    }

    private createGlowSprite(kind: HighlightKind, size: number): THREE.Sprite {
        const texture = this.glowTextures.get(kind);
        const material = new THREE.SpriteMaterial({
            map: texture || null,
            color: 0xffffff,
            transparent: true,
            opacity: 0.65,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });
        const sprite = new THREE.Sprite(material);
        sprite.scale.set(size, size, 1);
        return sprite;
    }

    private createBeacon(kind: HighlightKind, radius: number): THREE.Mesh {
        const geometry = new THREE.CylinderGeometry(radius, radius * 0.6, 10, 18, 1, true);
        const color = kind === 'primary' ? 0xffd76a : 0x5fd6ff;
        const material = new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.35,
            side: THREE.DoubleSide,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });
        const mesh = new THREE.Mesh(geometry, material);
        return mesh;
    }

    private createGlowTexture(color: string): THREE.Texture {
        const size = 128;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return new THREE.Texture();

        const gradient = ctx.createRadialGradient(size / 2, size / 2, 6, size / 2, size / 2, size / 2);
        gradient.addColorStop(0, color);
        gradient.addColorStop(0.55, 'rgba(255,255,255,0.08)');
        gradient.addColorStop(1, 'rgba(255,255,255,0)');

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, size, size);

        const texture = new THREE.Texture(canvas);
        texture.needsUpdate = true;
        return texture;
    }

    private specForResident(resident: Resident, kind: HighlightKind): HighlightSpec {
        return {
            key: `resident:${resident.data.id}:${kind}`,
            kind,
            object: resident.mesh,
            radius: 12,
        };
    }

    private specForVehicle(vehicle: Vehicle, kind: HighlightKind): HighlightSpec {
        return {
            key: `vehicle:${vehicle.id}:${kind}`,
            kind,
            object: vehicle.carGroup,
            radius: 18,
        };
    }

    private specForLot(lot: Lot, kind: HighlightKind): HighlightSpec {
        const center = this.getLotCenter(lot);
        const radius = this.getLotRadius(lot, center);
        return {
            key: `lot:${lot.id}:${kind}`,
            kind,
            position: center,
            radius: Math.max(20, radius + 10),
        };
    }

    private specsForResidentRelations(resident: Resident): HighlightSpec[] {
        const specs: HighlightSpec[] = [];
        specs.push(this.specForLot(resident.data.homeLot, 'related'));
        if (resident.data.car) {
            specs.push(this.specForVehicle(resident.data.car, 'related'));
        }
        const household = this.getResidentsByLot(resident.data.homeLot).filter(r => r.data.id !== resident.data.id);
        household.forEach(member => specs.push(this.specForResident(member, 'related')));
        return specs;
    }

    private specsForLotRelations(lot: Lot): HighlightSpec[] {
        const specs: HighlightSpec[] = [];
        const residents = this.getResidentsByLot(lot);
        residents.forEach(resident => specs.push(this.specForResident(resident, 'related')));
        return specs;
    }

    private specsForVehicleRelations(vehicle: Vehicle): HighlightSpec[] {
        const specs: HighlightSpec[] = [];
        const owner = this.getOwnerForVehicle(vehicle);
        if (owner) {
            specs.push(this.specForResident(owner, 'related'));
            specs.push(this.specForLot(owner.data.homeLot, 'related'));
            const potential = this.getResidentsByLot(owner.data.homeLot).filter(r => r.data.id !== owner.data.id);
            potential.forEach(resident => specs.push(this.specForResident(resident, 'related')));
        }
        return specs;
    }

    private getOwnerForVehicle(vehicle: Vehicle): Resident | undefined {
        return this.residents.find(r => r.data.car === vehicle);
    }

    private getResidentsByLot(lot: Lot): Resident[] {
        return this.residents.filter(r => r.data.homeLot.id === lot.id);
    }

    private getLotCenter(lot: Lot): THREE.Vector3 {
        if (lot.points.length === 0) return new THREE.Vector3();
        const centerX = lot.points.reduce((s, p) => s + p.x, 0) / lot.points.length;
        const centerY = lot.points.reduce((s, p) => s + p.y, 0) / lot.points.length;
        return new THREE.Vector3(centerX, 2, -centerY);
    }

    private getLotRadius(lot: Lot, center: THREE.Vector3): number {
        let max = 0;
        lot.points.forEach(point => {
            const dx = point.x - center.x;
            const dz = -point.y - center.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            if (dist > max) max = dist;
        });
        return max;
    }
}
