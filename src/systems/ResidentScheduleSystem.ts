import * as THREE from 'three';
import { Resident, ResidentState } from '../entities/Resident';
import { Lot, LotUsage } from '../types';
import { PathfindingSystem } from './PathfindingSystem';

type ScheduleSlot = 'night' | 'morning' | 'day' | 'evening';

interface ScheduleData {
    slot: ScheduleSlot;
    destinationLot?: Lot;
    nextWanderTime: number;
    outOfTownUntil?: number;
    leavingTown: boolean;
}

export interface ResidentScheduleConfig {
    lots: Lot[];
    pathSystem: PathfindingSystem;
    worldBounds: { minX: number; maxX: number; minY: number; maxY: number };
}

export class ResidentScheduleSystem {
    private lots: Lot[];
    private pathSystem: PathfindingSystem;
    private bounds: ResidentScheduleConfig['worldBounds'];
    private schedules: Map<string, ScheduleData> = new Map();

    constructor(config: ResidentScheduleConfig) {
        this.lots = config.lots;
        this.pathSystem = config.pathSystem;
        this.bounds = config.worldBounds;
    }

    update(timeSeconds: number, hour: number, residents: Resident[]) {
        residents.forEach(resident => {
            const data = this.getSchedule(resident, hour);
            resident.scheduleOverride = true;

            if (data.outOfTownUntil && timeSeconds < data.outOfTownUntil) {
                return;
            }

            if (data.outOfTownUntil && timeSeconds >= data.outOfTownUntil) {
                this.returnFromTown(resident);
                data.outOfTownUntil = undefined;
                data.leavingTown = false;
            }

            if (data.leavingTown && resident.isInCar && resident.data.car) {
                if (!resident.data.car.target && resident.data.car.path.length === 0) {
                    resident.data.car.setDriver(null);
                    resident.isInCar = false;
                    resident.mesh.visible = false;
                    resident.data.car.carGroup.visible = false;
                    data.outOfTownUntil = timeSeconds + (2 + Math.random() * 6) * 3600;
                }
                return;
            }

            if (resident.isInCar && resident.data.car && !resident.data.car.target && resident.data.car.path.length === 0 && data.destinationLot) {
                resident.exitCar();
                const point = this.getRandomPointInLot(data.destinationLot);
                resident.setTargetPosition(new THREE.Vector3(point.x, 2, point.y));
                resident.behaviorState = ResidentState.WALKING_AROUND;
                data.nextWanderTime = timeSeconds + (10 + Math.random() * 20) * 60;
            }

            if (!resident.target && resident.path.length === 0 && timeSeconds >= data.nextWanderTime) {
                const lot = data.destinationLot || resident.data.homeLot;
                const point = this.getRandomPointInLot(lot);
                resident.setTargetPosition(new THREE.Vector3(point.x, 2, point.y));
                resident.behaviorState = ResidentState.WALKING_AROUND;
                data.nextWanderTime = timeSeconds + (10 + Math.random() * 20) * 60;
            }
        });
    }

    private getSchedule(resident: Resident, hour: number): ScheduleData {
        const slot = this.getSlot(hour);
        const existing = this.schedules.get(resident.id);
        if (existing && existing.slot === slot) {
            return existing;
        }

        const schedule = existing || { slot, nextWanderTime: 0, leavingTown: false };
        schedule.slot = slot;
        schedule.destinationLot = undefined;
        schedule.leavingTown = false;
        schedule.nextWanderTime = 0;
        resident.allowedLots = [];

        if (slot === 'night') {
            resident.startReturnHome();
            schedule.destinationLot = resident.data.homeLot;
        } else if (slot === 'morning') {
            schedule.destinationLot = resident.data.homeLot;
        } else if (slot === 'day') {
            const leaveTown = resident.data.hasCar && Math.random() < 0.1;
            if (leaveTown && resident.data.car) {
                resident.enterCar();
                resident.behaviorState = ResidentState.DRIVING;
                const exitPoint = this.getHighwayExitPoint();
                resident.data.car.target = new THREE.Vector3(exitPoint.x, 1, exitPoint.y);
                schedule.leavingTown = true;
            } else {
                const dest = this.pickDestinationLot(resident);
                schedule.destinationLot = dest;
                if (resident.data.hasCar && resident.data.car) {
                    resident.enterCar();
                    resident.behaviorState = ResidentState.DRIVING;
                    const target = this.getParkingTarget(dest);
                    resident.data.car.target = new THREE.Vector3(target.x, 1, target.y);
                } else {
                    const point = this.getRandomPointInLot(dest);
                    resident.setTargetPosition(new THREE.Vector3(point.x, 2, point.y));
                    resident.behaviorState = ResidentState.WALKING_AROUND;
                }
            }
        } else if (slot === 'evening') {
            const visitFriend = Math.random() < 0.4;
            const dest = visitFriend ? this.pickFriendLot(resident) : this.pickDestinationLot(resident);
            schedule.destinationLot = dest;
            if (visitFriend) {
                resident.allowedLots = [dest.id];
            }
            if (resident.data.hasCar && resident.data.car) {
                resident.enterCar();
                resident.behaviorState = ResidentState.DRIVING;
                const target = this.getParkingTarget(dest);
                resident.data.car.target = new THREE.Vector3(target.x, 1, target.y);
            } else {
                const point = this.getRandomPointInLot(dest);
                resident.setTargetPosition(new THREE.Vector3(point.x, 2, point.y));
                resident.behaviorState = ResidentState.WALKING_AROUND;
            }
        }

        this.schedules.set(resident.id, schedule);
        return schedule;
    }

    private getSlot(hour: number): ScheduleSlot {
        if (hour >= 21 || hour < 6) return 'night';
        if (hour >= 6 && hour < 9) return 'morning';
        if (hour >= 9 && hour < 17) return 'day';
        return 'evening';
    }

    private pickDestinationLot(resident: Resident): Lot {
        const candidates = this.lots.filter(lot => lot.usage === LotUsage.COMMERCIAL || lot.usage === LotUsage.PUBLIC);
        if (candidates.length === 0) return resident.data.homeLot;
        return candidates[Math.floor(Math.random() * candidates.length)];
    }

    private pickFriendLot(resident: Resident): Lot {
        const candidates = this.lots.filter(lot => lot.usage === LotUsage.RESIDENTIAL && lot.id !== resident.data.homeLot.id);
        if (candidates.length === 0) return resident.data.homeLot;
        return candidates[Math.floor(Math.random() * candidates.length)];
    }

    private getLotCenter(lot: Lot): { x: number; y: number } {
        return {
            x: lot.points.reduce((s, p) => s + p.x, 0) / lot.points.length,
            y: lot.points.reduce((s, p) => s + p.y, 0) / lot.points.length,
        };
    }

    private getParkingTarget(lot: Lot): { x: number; y: number } {
        return lot.parkingSpot || lot.entryPoint || this.getLotCenter(lot);
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

    private returnFromTown(resident: Resident) {
        const entry = this.getHighwayEntryPoint();
        if (resident.data.car) {
            resident.data.car.position.set(entry.x, 1, entry.y);
            resident.data.car.updateMesh();
            resident.data.car.carGroup.visible = true;
            resident.data.car.setDriver(null);
        }
        resident.position.set(entry.x, 1, entry.y);
        resident.mesh.visible = true;
        resident.isInCar = false;
        resident.behaviorState = ResidentState.WALKING_HOME;
        resident.startReturnHome();
    }

    private getHighwayEntryPoint(): { x: number; y: number } {
        const useNorth = Math.random() < 0.5;
        if (useNorth) {
            return {
                x: this.bounds.minX + Math.random() * (this.bounds.maxX - this.bounds.minX),
                y: this.bounds.minY,
            };
        }
        return {
            x: this.bounds.maxX,
            y: this.bounds.minY + Math.random() * (this.bounds.maxY - this.bounds.minY),
        };
    }

    private getHighwayExitPoint(): { x: number; y: number } {
        return this.getHighwayEntryPoint();
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
}
