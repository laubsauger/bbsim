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
    private ringByKey: Map<string, THREE.Mesh> = new Map();
    private specs: HighlightSpec[] = [];
    private residents: Resident[] = [];
    private vehicles: Vehicle[] = [];
    private lots: Lot[] = [];
    private enabled: boolean = true;
    private lastSelection: { type: string; data: any } | null = null;

    constructor(parent: THREE.Group) {
        this.group = new THREE.Group();
        this.group.name = 'SelectionHighlighter';
        parent.add(this.group);
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

        this.specs.forEach(spec => {
            const ring = this.ringByKey.get(spec.key);
            if (!ring) return;
            if (spec.object) {
                ring.position.copy(spec.object.position);
            } else if (spec.position) {
                ring.position.copy(spec.position);
            }
            ring.position.y = 1.5;
            ring.scale.set(1 + pulse, 1 + pulse, 1 + pulse);
        });
    }

    private syncRings() {
        const nextKeys = new Set(this.specs.map(spec => spec.key));

        Array.from(this.ringByKey.entries()).forEach(([key, ring]) => {
            if (!nextKeys.has(key)) {
                this.group.remove(ring);
                ring.geometry.dispose();
                (ring.material as THREE.Material).dispose();
                this.ringByKey.delete(key);
            }
        });

        this.specs.forEach(spec => {
            if (!this.ringByKey.has(spec.key)) {
                const ring = this.createRing(spec.radius, spec.kind);
                this.ringByKey.set(spec.key, ring);
                this.group.add(ring);
            }
        });
    }

    private createRing(radius: number, kind: HighlightKind): THREE.Mesh {
        const inner = Math.max(2, radius * 0.78);
        const outer = Math.max(inner + 2, radius);
        const geometry = new THREE.RingGeometry(inner, outer, 48);
        const color = kind === 'primary' ? 0xffd76a : 0x5fd6ff;
        const material = new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: kind === 'primary' ? 0.85 : 0.65,
            side: THREE.DoubleSide,
            depthWrite: false,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.rotation.x = -Math.PI / 2;
        return mesh;
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
