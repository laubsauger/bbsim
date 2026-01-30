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
        // Weighted household size: mostly singles/couples, rare larger households
        let residentId = 0;
        let residentsToPlace = config.residentCount;
        const lotOccupancy = new Map<number, number>();
        const maxOccupantsPerLot = 3; // Lower max for smaller households

        // Weighted household size - heavily favor singles and couples
        const pickHouseholdSize = (remaining: number) => {
            const roll = Math.random();
            let size = 1;
            if (roll < 0.55) size = 1;       // 55% singles
            else if (roll < 0.88) size = 2;  // 33% couples
            else if (roll < 0.97) size = 3;  // 9% small families
            else size = 4;                    // 3% larger families
            return Math.min(remaining, size);
        };

        // Track available lots (not yet at capacity)
        const availableLots = [...habitableLots];
        let failedAttempts = 0;
        const maxFailedAttempts = 50;

        while (residentsToPlace > 0 && availableLots.length > 0 && failedAttempts < maxFailedAttempts) {
            // Pick a truly random lot each time
            const randomIndex = Math.floor(Math.random() * availableLots.length);
            const lot = availableLots[randomIndex];
            const current = lotOccupancy.get(lot.id) || 0;

            if (current >= maxOccupantsPerLot) {
                // Remove full lot from available list
                availableLots.splice(randomIndex, 1);
                failedAttempts++;
                continue;
            }

            // Abandoned lots have 90% chance to be skipped (rare squatters only)
            if (lot.state === LotState.ABANDONED && Math.random() < 0.9) {
                failedAttempts++;
                continue;
            }

            failedAttempts = 0; // Reset on successful placement

            const householdSize = Math.min(
                pickHouseholdSize(residentsToPlace),
                maxOccupantsPerLot - current
            );

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

                // Create car if resident has one AND there is a parking spot
                if (resident.data.hasCar) {
                    if (lot.parkingSpot) {
                        const carPos = new THREE.Vector3(lot.parkingSpot.x, 1, lot.parkingSpot.y);
                        // Default rotation for now

                        const car = new Vehicle({
                            id: `car_${residentId}`,
                            type: AgentType.RESIDENT,
                            position: carPos,
                            speed: 40 + Math.random() * 20,
                        }, false);

                        car.updateMesh();
                        resident.data.car = car;
                        this.vehicles.push(car);
                    } else {
                        // Revoke car if no off-street parking
                        resident.data.hasCar = false;
                    }
                }

                residentId++;
                residentsToPlace--;
            }

            const newOccupancy = current + householdSize;
            lotOccupancy.set(lot.id, newOccupancy);

            // Remove lot from available list if now full
            if (newOccupancy >= maxOccupantsPerLot) {
                const idx = availableLots.indexOf(lot);
                if (idx >= 0) availableLots.splice(idx, 1);
            }
        }

        console.log(`Population: ${this.residents.length} residents, ${this.vehicles.length} vehicles`);

        return {
            residents: this.residents,
            tourists: [],
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
