import * as THREE from 'three';
import { Lot, LotState, AgentType } from '../types';
import { Resident } from '../entities/Resident';
import { Vehicle } from '../entities/Vehicle';
import { Agent } from '../entities/Agent';

export interface PopulationConfig {
    residentCount: number;
    touristCount: number;
}

export class PopulationSystem {
    residents: Resident[] = [];
    tourists: Agent[] = [];
    vehicles: Vehicle[] = [];
    lots: Lot[];

    constructor(lots: Lot[]) {
        this.lots = lots;
    }

    populate(config: PopulationConfig): { residents: Resident[], tourists: Agent[], vehicles: Vehicle[] } {
        this.residents = [];
        this.tourists = [];
        this.vehicles = [];

        // Get lots that can have residents (not empty/for_sale)
        const habitableLots = this.lots.filter(lot =>
            lot.state === LotState.OCCUPIED ||
            lot.state === LotState.AWAY ||
            lot.state === LotState.ABANDONED
        );

        if (habitableLots.length === 0) {
            console.warn('No habitable lots found');
            return { residents: [], tourists: [], vehicles: [] };
        }

        // Distribute residents among lots
        // Some lots get more residents (households of 1-4)
        let residentId = 0;
        let residentsToPlace = config.residentCount;

        while (residentsToPlace > 0 && habitableLots.length > 0) {
            // Pick a random lot
            const lot = habitableLots[Math.floor(Math.random() * habitableLots.length)];

            // Random household size (1-4)
            const householdSize = Math.min(residentsToPlace, 1 + Math.floor(Math.random() * 4));

            // Get lot center for positioning
            const lotCenter = this.getLotCenter(lot);

            for (let i = 0; i < householdSize; i++) {
                // Position slightly randomized within lot
                const pos = new THREE.Vector3(
                    lotCenter.x + (Math.random() - 0.5) * 20,
                    2, // Lot height
                    lotCenter.z + (Math.random() - 0.5) * 20
                );

                const resident = Resident.generateRandom(`res_${residentId}`, lot, pos);
                this.residents.push(resident);

                // Create car if resident has one
                if (resident.data.hasCar) {
                    const carPos = this.getNearestRoadPoint(lot);
                    const car = new Vehicle({
                        id: `car_${residentId}`,
                        type: AgentType.RESIDENT,
                        position: carPos,
                        speed: 40 + Math.random() * 20,
                    }, false);
                    resident.data.car = car;
                    this.vehicles.push(car);
                }

                residentId++;
                residentsToPlace--;
            }
        }

        // Create tourists (they're visitors, spawn on roads)
        for (let i = 0; i < config.touristCount; i++) {
            // Random position on a road would be set by PathfindingSystem
            const pos = new THREE.Vector3(0, 1, 0);

            const tourist = new Agent({
                id: `tourist_${i}`,
                type: AgentType.TOURIST,
                position: pos,
                speed: 6 + Math.random() * 4,
            });
            this.tourists.push(tourist);

            // Some tourists have rental cars
            if (Math.random() < 0.4) {
                const car = new Vehicle({
                    id: `tourist_car_${i}`,
                    type: AgentType.TOURIST,
                    position: pos.clone(),
                    speed: 35 + Math.random() * 15,
                }, true); // isTourist = true
                this.vehicles.push(car);
            }
        }

        console.log(`Population: ${this.residents.length} residents, ${this.tourists.length} tourists, ${this.vehicles.length} vehicles`);

        return {
            residents: this.residents,
            tourists: this.tourists,
            vehicles: this.vehicles
        };
    }

    private getLotCenter(lot: Lot): THREE.Vector3 {
        if (lot.points.length === 0) return new THREE.Vector3();

        const centerX = lot.points.reduce((s, p) => s + p.x, 0) / lot.points.length;
        const centerY = lot.points.reduce((s, p) => s + p.y, 0) / lot.points.length;

        // Coordinate transform: SVG (x, y) → 3D (x, height, y)
        return new THREE.Vector3(centerX, 2, centerY);
    }

    private getNearestRoadPoint(lot: Lot): THREE.Vector3 {
        if (lot.roadAccessPoint) {
            // Coordinate transform: SVG (x, y) → 3D (x, height, y)
            return new THREE.Vector3(lot.roadAccessPoint.x, 1, lot.roadAccessPoint.y);
        }
        // Fallback to lot center
        return this.getLotCenter(lot);
    }

    getResidentByLot(lot: Lot): Resident[] {
        return this.residents.filter(r => r.data.homeLot.id === lot.id);
    }

    getVehicleByOwner(resident: Resident): Vehicle | undefined {
        return resident.data.car;
    }
}
