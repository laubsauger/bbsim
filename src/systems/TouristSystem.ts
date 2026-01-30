import * as THREE from 'three';
import { Tourist, TouristState } from '../entities/Tourist';
import { Vehicle } from '../entities/Vehicle';
import { AgentType, Lot, LotUsage } from '../types';
import { PathfindingSystem } from './PathfindingSystem';

export interface TouristSystemConfig {
    lots: Lot[];
    pathSystem: PathfindingSystem;
    worldBounds: { minX: number; maxX: number; minY: number; maxY: number };
    onAddAgent?: (agent: Tourist | Vehicle) => void;
    onRemoveAgent?: (agent: Tourist | Vehicle) => void;
}

export class TouristSystem {
    tourists: Tourist[] = [];
    vehicles: Vehicle[] = [];
    targetCount: number = 0;
    private lots: Lot[];
    private pathSystem: PathfindingSystem;
    private bounds: TouristSystemConfig['worldBounds'];
    private onAddAgent?: (agent: Tourist | Vehicle) => void;
    private onRemoveAgent?: (agent: Tourist | Vehicle) => void;
    private nextArrivalTime: number = 0;

    constructor(config: TouristSystemConfig) {
        this.lots = config.lots;
        this.pathSystem = config.pathSystem;
        this.bounds = config.worldBounds;
        this.onAddAgent = config.onAddAgent;
        this.onRemoveAgent = config.onRemoveAgent;
    }

    setTargetCount(count: number) {
        this.targetCount = count;
    }

    clear() {
        this.tourists.forEach(t => this.onRemoveAgent?.(t));
        this.vehicles.forEach(v => this.onRemoveAgent?.(v));
        this.tourists = [];
        this.vehicles = [];
    }

    update(timeSeconds: number, delta: number) {
        if (this.tourists.length < this.targetCount && timeSeconds >= this.nextArrivalTime) {
            this.spawnTourist(timeSeconds);
            this.nextArrivalTime = timeSeconds + (5 + Math.random() * 10) * 60;
        }

        this.tourists.forEach(tourist => {
            this.updateTourist(tourist, timeSeconds);
        });

        this.tourists = this.tourists.filter(t => t.state !== TouristState.EXITED);
        this.vehicles = this.vehicles.filter(v => v.position.y > -10000);
    }

    private spawnTourist(timeSeconds: number) {
        const entry = this.getHighwayEntryPoint();
        const nearestRoad = this.pathSystem.getNearestRoadPoint(entry.x, entry.y);
        const pos = new THREE.Vector3(nearestRoad.x, 1, nearestRoad.y);
        const id = `tourist_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        const hasLodging = Math.random() < 0.35;
        const lodgingLot = hasLodging ? this.pickLodgingLot() : null;
        const stayMinutes = hasLodging ? 8 * 60 + Math.random() * 6 * 60 : 60 + Math.random() * 180;
        const departTime = timeSeconds + stayMinutes * 60;

        const tourist = new Tourist({
            id,
            type: AgentType.TOURIST,
            position: pos.clone(),
            speed: 6 + Math.random() * 3,
        }, {
            id,
            hasCar: true,
            arrivalTime: timeSeconds,
            departTime,
            nextWanderTime: timeSeconds + 60,
            lodgingLot: lodgingLot || undefined,
        });

        const car = new Vehicle({
            id: `tourist_car_${id}`,
            type: AgentType.TOURIST,
            position: pos.clone(),
            speed: 35 + Math.random() * 15,
        }, true);

        tourist.data.car = car;
        tourist.isInCar = true;
        car.setDriver(tourist);

        const parkingTarget = lodgingLot ? this.getParkingTarget(lodgingLot) : this.getCurbsideParkingForAttraction();
        tourist.data.parkingSpot = { x: parkingTarget.x, y: parkingTarget.z };

        // Use pathfinding to get road-based path to parking target
        const carPath = this.pathSystem.getPathTo(pos, parkingTarget);
        if (carPath.length > 0) {
            car.path = carPath;
        } else {
            // Fallback: direct target (shouldn't happen often)
            car.target = parkingTarget.clone();
        }

        this.tourists.push(tourist);
        this.vehicles.push(car);
        this.onAddAgent?.(tourist);
        this.onAddAgent?.(car);
    }

    private updateTourist(tourist: Tourist, timeSeconds: number) {
        if (tourist.state === TouristState.EXITED) return;

        const car = tourist.data.car;

        if (tourist.state === TouristState.ARRIVING) {
            if (car && !car.target && (!car.path || car.path.length === 0)) {
                tourist.exitCar();
                if (tourist.data.lodgingLot) {
                    tourist.state = TouristState.STAYING;
                    const lodgingPoint = this.getRandomPointInLot(tourist.data.lodgingLot);
                    tourist.target = new THREE.Vector3(lodgingPoint.x, 2, lodgingPoint.y);
                } else {
                    tourist.state = TouristState.WALKING;
                }
            }
        }

        if (tourist.state === TouristState.WALKING) {
            if (timeSeconds >= tourist.data.departTime) {
                tourist.state = TouristState.RETURNING_TO_CAR;
                if (tourist.data.parkingSpot) {
                    tourist.target = new THREE.Vector3(tourist.data.parkingSpot.x, 1, tourist.data.parkingSpot.y);
                }
                return;
            }

            if (!tourist.target && (!tourist.path || tourist.path.length === 0) && timeSeconds >= tourist.data.nextWanderTime) {
                const target = this.getAttractionTarget();
                tourist.target = target;
                tourist.data.nextWanderTime = timeSeconds + (10 + Math.random() * 20) * 60;
            }
        }

        if (tourist.state === TouristState.STAYING) {
            if (timeSeconds >= tourist.data.departTime) {
                tourist.state = TouristState.RETURNING_TO_CAR;
                if (tourist.data.parkingSpot) {
                    tourist.target = new THREE.Vector3(tourist.data.parkingSpot.x, 1, tourist.data.parkingSpot.y);
                }
            } else if (!tourist.target && (!tourist.path || tourist.path.length === 0) && timeSeconds >= tourist.data.nextWanderTime) {
                const lodg = tourist.data.lodgingLot;
                if (lodg) {
                    const point = this.getRandomPointInLot(lodg);
                    tourist.target = new THREE.Vector3(point.x, 2, point.y);
                }
                tourist.data.nextWanderTime = timeSeconds + (15 + Math.random() * 25) * 60;
            }
        }

        if (tourist.state === TouristState.RETURNING_TO_CAR) {
            if (car && tourist.data.parkingSpot) {
                const dist = tourist.position.distanceTo(new THREE.Vector3(tourist.data.parkingSpot.x, 1, tourist.data.parkingSpot.y));
                if (dist < 12) {
                    tourist.enterCar();
                    tourist.state = TouristState.LEAVING;
                    const exitPoint = this.getHighwayExitPoint();
                    const exitTarget = new THREE.Vector3(exitPoint.x, 1, exitPoint.y);
                    // Use pathfinding to exit via roads
                    const exitPath = this.pathSystem.getPathTo(car.position, exitTarget);
                    if (exitPath.length > 0) {
                        car.path = exitPath;
                    } else {
                        car.target = exitTarget;
                    }
                }
            }
        }

        if (tourist.state === TouristState.LEAVING) {
            if (car && !car.target && (!car.path || car.path.length === 0)) {
                tourist.state = TouristState.EXITED;
                this.onRemoveAgent?.(tourist);
                this.onRemoveAgent?.(car);
            }
        }
    }

    private pickLodgingLot(): Lot | null {
        const lodgingLots = this.lots.filter(lot => lot.usage === LotUsage.LODGING);
        if (lodgingLots.length === 0) return null;
        return lodgingLots[Math.floor(Math.random() * lodgingLots.length)];
    }

    private getAttractionTarget(): THREE.Vector3 {
        const candidates = this.lots.filter(lot => lot.usage === LotUsage.PUBLIC || lot.usage === LotUsage.COMMERCIAL);
        if (candidates.length === 0) {
            return this.pathSystem.getRandomPointOnSidewalk();
        }
        const lot = candidates[Math.floor(Math.random() * candidates.length)];
        const point = this.getRandomPointInLot(lot);
        return new THREE.Vector3(point.x, 2, point.y);
    }

    private getParkingTarget(lot: Lot): THREE.Vector3 {
        if (lot.parkingSpot) return new THREE.Vector3(lot.parkingSpot.x, 1, lot.parkingSpot.y);
        if (lot.entryPoint) return new THREE.Vector3(lot.entryPoint.x, 1, lot.entryPoint.y);
        const x = lot.points.reduce((s, p) => s + p.x, 0) / lot.points.length;
        const y = lot.points.reduce((s, p) => s + p.y, 0) / lot.points.length;
        return new THREE.Vector3(x, 1, y);
    }

    private getCurbsideParkingForAttraction(): THREE.Vector3 {
        const target = this.getAttractionTarget();
        const nearest = this.pathSystem.getNearestRoadPoint(target.x, target.z);
        return new THREE.Vector3(nearest.x, 1, nearest.y);
    }

    private getRandomPointInLot(lot: Lot): { x: number; y: number } {
        const minX = Math.min(...lot.points.map(p => p.x));
        const maxX = Math.max(...lot.points.map(p => p.x));
        const minY = Math.min(...lot.points.map(p => p.y));
        const maxY = Math.max(...lot.points.map(p => p.y));

        for (let i = 0; i < 20; i++) {
            const x = minX + Math.random() * (maxX - minX);
            const y = minY + Math.random() * (maxY - minY);
            if (this.isPointInLot(x, y, lot.points)) {
                return { x, y };
            }
        }
        return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
    }

    private isPointInLot(x: number, y: number, points: { x: number; y: number }[]): boolean {
        let inside = false;
        for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
            const xi = points[i].x, yi = points[i].y;
            const xj = points[j].x, yj = points[j].y;
            if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
                inside = !inside;
            }
        }
        return inside;
    }

    private getHighwayEntryPoint(): { x: number; y: number } {
        // Tourists enter from northwest corner (1st St / Ave A intersection)
        // In SVG coords: low X = west, low Y = north
        return {
            x: this.bounds.minX + 50, // Slightly inside the boundary
            y: this.bounds.minY + 50,
        };
    }

    private getHighwayExitPoint(): { x: number; y: number } {
        // Tourists exit via the same northwest corner
        return {
            x: this.bounds.minX + 50,
            y: this.bounds.minY + 50,
        };
    }
}
