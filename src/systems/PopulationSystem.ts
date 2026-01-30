import * as THREE from 'three';
import { Lot, LotState, AgentType, LotUsage } from '../types';
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
    pets: Agent[] = [];
    lots: Lot[];

    constructor(lots: Lot[]) {
        this.lots = lots;
    }

    populate(config: PopulationConfig): { residents: Resident[], tourists: Agent[], vehicles: Vehicle[], pets: Agent[] } {
        this.residents = [];
        this.vehicles = [];
        this.pets = [];

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
                    const parkingSpot = this.reserveParkingSpot(lot, `car_${residentId}`);
                    if (parkingSpot) {
                        const carPos = new THREE.Vector3(parkingSpot.x, 1, parkingSpot.y);

                        const car = new Vehicle({
                            id: `car_${residentId}`,
                            type: AgentType.RESIDENT,
                            position: carPos,
                            speed: 40 + Math.random() * 20,
                        }, false);

                        car.targetRotation = parkingSpot.rotation;
                        car.updateMesh();
                        resident.data.car = car;
                        this.vehicles.push(car);
                    } else {
                        // Revoke car if no off-street parking available
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

        this.spawnPets();

        console.log(`Population: ${this.residents.length} residents, ${this.vehicles.length} vehicles, ${this.pets.length} pets`);

        return {
            residents: this.residents,
            tourists: [],
            vehicles: this.vehicles,
            pets: this.pets
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

    private spawnPets() {
        const homeLots = this.lots.filter(lot => lot.usage === LotUsage.RESIDENTIAL);
        if (homeLots.length === 0) return;

        const dogCount = Math.floor(this.residents.length * 0.08);
        const catCount = Math.floor(this.residents.length * 0.12);
        let petId = 0;

        const spawnPet = (type: AgentType) => {
            const lot = homeLots[Math.floor(Math.random() * homeLots.length)];
            const lotCenter = this.getLotCenter(lot);
            const pos = new THREE.Vector3(
                lotCenter.x + (Math.random() - 0.5) * 16,
                2,
                lotCenter.z + (Math.random() - 0.5) * 16
            );

            const pet = new Agent({
                id: `${type}_${petId++}`,
                type,
                position: pos,
                speed: type === AgentType.DOG ? 7 + Math.random() * 3 : 6 + Math.random() * 2,
            });
            (pet as any).data = { homeLot: lot };
            this.pets.push(pet);
        };

        for (let i = 0; i < dogCount; i++) {
            spawnPet(AgentType.DOG);
        }
        for (let i = 0; i < catCount; i++) {
            spawnPet(AgentType.CAT);
        }
    }

    getResidentByLot(lot: Lot): Resident[] {
        return this.residents.filter(r => r.data.homeLot.id === lot.id);
    }

    getVehicleByOwner(resident: Resident): Vehicle | undefined {
        return resident.data.car;
    }

    /**
     * Reserve an available parking spot on a lot
     */
    private reserveParkingSpot(lot: Lot, vehicleId: string): { x: number; y: number; rotation: number } | null {
        if (lot.parkingSpots && lot.parkingSpots.length > 0) {
            const availableSpot = lot.parkingSpots.find(spot => spot.occupiedBy === null);
            if (availableSpot) {
                availableSpot.occupiedBy = vehicleId;
                return {
                    x: availableSpot.x,
                    y: availableSpot.y,
                    rotation: availableSpot.rotation
                };
            }
            return null;
        }

        // Fallback to legacy single spot
        if (lot.parkingSpot) {
            return {
                x: lot.parkingSpot.x,
                y: lot.parkingSpot.y,
                rotation: lot.parkingRotation || 0
            };
        }

        return null;
    }

    /**
     * Release a parking spot when a vehicle leaves
     */
    releaseParkingSpot(lot: Lot, vehicleId: string): void {
        if (!lot.parkingSpots) return;
        const spot = lot.parkingSpots.find(s => s.occupiedBy === vehicleId);
        if (spot) {
            spot.occupiedBy = null;
        }
    }
}
