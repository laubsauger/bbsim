import * as THREE from 'three';
import { Resident, ResidentState, WorkSchedule, Lifestyle, Chronotype } from '../entities/Resident';
import { Lot, LotUsage } from '../types';
import { PathfindingSystem } from './PathfindingSystem';

interface IndividualSchedule {
    // Current activity tracking
    currentActivity: ResidentState;
    activityStartTime: number;
    activityEndTime: number;
    destinationLot?: Lot;

    // Daily plan (regenerated each day)
    dayPlan: ScheduledActivity[];
    currentPlanIndex: number;
    lastPlanDay: number;

    // Out of town tracking
    outOfTownUntil?: number;
    leavingTown: boolean;
}

interface ScheduledActivity {
    activity: ResidentState;
    startHour: number;  // Hour of day (0-24)
    endHour: number;
    targetLot?: Lot;
    priority: number;   // Higher = more important, won't be skipped
}

export interface ResidentScheduleConfig {
    lots: Lot[];
    pathSystem: PathfindingSystem;
    worldBounds: { minX: number; maxX: number; minY: number; maxY: number };
    dayOfWeek?: number; // 0-6, Sunday = 0
}

export class ResidentScheduleSystem {
    private lots: Lot[];
    private pathSystem: PathfindingSystem;
    private bounds: ResidentScheduleConfig['worldBounds'];
    private schedules: Map<string, IndividualSchedule> = new Map();
    private currentDay: number = 1;
    private dayOfWeek: number = 0;

    constructor(config: ResidentScheduleConfig) {
        this.lots = config.lots;
        this.pathSystem = config.pathSystem;
        this.bounds = config.worldBounds;
        this.dayOfWeek = config.dayOfWeek ?? 0;
    }

    setDayOfWeek(dow: number) {
        this.dayOfWeek = dow;
    }

    private updateLogCount = 0;

    update(timeSeconds: number, hour: number, residents: Resident[], day: number) {
        this.currentDay = day;

        // Log once to confirm system is running
        if (this.updateLogCount === 0) {
            console.log(`[ResidentSchedule] System active with ${residents.length} residents, day ${day}, hour ${hour.toFixed(1)}`);
            const barLot = this.lots.find(l => l.usage === LotUsage.BAR);
            const churchLot = this.lots.find(l => l.usage === LotUsage.CHURCH);
            console.log(`[ResidentSchedule] Bar lot: ${barLot?.id || 'NOT FOUND'}, Church lot: ${churchLot?.id || 'NOT FOUND'}`);
            this.updateLogCount++;
        }

        residents.forEach(resident => {
            // If home and the car is abandoned elsewhere, snap it back home
            if (resident.data.car &&
                resident.behaviorState === ResidentState.IDLE_HOME &&
                !resident.isInCar &&
                !resident.data.car.driver) {
                this.ensureCarAtHome(resident);
            }
            const schedule = this.getOrCreateSchedule(resident, day);
            resident.scheduleOverride = true;

            // Handle out of town
            if (schedule.outOfTownUntil && timeSeconds < schedule.outOfTownUntil) {
                return;
            }
            if (schedule.outOfTownUntil && timeSeconds >= schedule.outOfTownUntil) {
                this.returnFromTown(resident);
                schedule.outOfTownUntil = undefined;
                schedule.leavingTown = false;
            }

            // Handle leaving town (driving to exit)
            if (schedule.leavingTown && resident.isInCar && resident.data.car) {
                if (!resident.data.car.target && resident.data.car.path.length === 0) {
                    resident.data.car.setDriver(null);
                    resident.isInCar = false;
                    resident.mesh.visible = false;
                    resident.data.car.carGroup.visible = false;
                    schedule.outOfTownUntil = timeSeconds + (2 + Math.random() * 6) * 3600;
                }
                return;
            }

            // Handle car arrival at destination
            if (resident.isInCar && resident.data.car &&
                !resident.data.car.target && resident.data.car.path.length === 0 &&
                schedule.destinationLot) {
                // Snap car to proper roadside parking before driver exits
                this.pathSystem.snapToRoadsideParking(resident.data.car);
                resident.exitCar();
                const point = this.getRandomPointInLot(schedule.destinationLot);
                resident.setTargetPosition(new THREE.Vector3(point.x, 2, point.y));
            }

            // Check if we need to transition to next activity
            this.updateActivity(resident, schedule, hour, timeSeconds);
        });
    }

    private ensureCarAtHome(resident: Resident) {
        const car = resident.data.car;
        const homeLot = resident.data.homeLot;
        if (!car || !homeLot) return;

        const xs = homeLot.points.map(p => p.x);
        const ys = homeLot.points.map(p => p.y);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);

        const carX = car.position.x;
        const carY = car.position.z;
        const inHomeLot = carX >= minX && carX <= maxX && carY >= minY && carY <= maxY;
        if (inHomeLot) return;

        // Release any previously held spot
        this.lots.forEach(lot => {
            if (!lot.parkingSpots) return;
            lot.parkingSpots.forEach(spot => {
                if (spot.occupiedBy === car.id) spot.occupiedBy = null;
            });
        });

        const reserved = this.pathSystem.reserveParkingSpot(homeLot, car.id);
        const street = reserved ? null : this.pathSystem.getStreetParkingSpot(homeLot, car.id);
        const homeSpot = reserved || street || homeLot.parkingSpot || homeLot.entryPoint || this.getLotCenter(homeLot);

        car.position.set(homeSpot.x, 1, homeSpot.y);
        if (typeof (homeSpot as any).rotation === 'number') {
            car.targetRotation = (homeSpot as any).rotation;
        }
        car.updateMesh();
    }

    private getOrCreateSchedule(resident: Resident, day: number): IndividualSchedule {
        let schedule = this.schedules.get(resident.id);

        if (!schedule) {
            schedule = {
                currentActivity: ResidentState.SLEEPING,
                activityStartTime: 0,
                activityEndTime: 0,
                dayPlan: [],
                currentPlanIndex: -1,
                lastPlanDay: -1,
                leavingTown: false,
            };
            this.schedules.set(resident.id, schedule);
        }

        // Generate new daily plan if day changed
        if (schedule.lastPlanDay !== day) {
            this.generateDayPlan(resident, schedule, day);
            schedule.lastPlanDay = day;
            // Log first few schedule generations
            if (this.schedules.size <= 3) {
                const barActivities = schedule.dayPlan.filter(a => a.activity === ResidentState.AT_BAR);
                const churchActivities = schedule.dayPlan.filter(a => a.activity === ResidentState.AT_CHURCH);
                console.log(`[Schedule] Generated plan for ${resident.fullName} (day ${day}): ${schedule.dayPlan.length} activities, ${barActivities.length} bar visits, ${churchActivities.length} church`);
            }
        }

        return schedule;
    }

    private generateDayPlan(resident: Resident, schedule: IndividualSchedule, day: number) {
        const data = resident.data;
        const plan: ScheduledActivity[] = [];

        // Add daily variation
        const dailyOffset = (Math.random() - 0.5) * data.routineVariation * 2; // +/- routine variation hours

        // Sleep until wake time
        const wakeTime = Math.max(0, data.wakeTime + dailyOffset);
        plan.push({
            activity: ResidentState.SLEEPING,
            startHour: 0,
            endHour: wakeTime,
            targetLot: data.homeLot,
            priority: 10,
        });

        // Morning routine at home
        const morningEnd = wakeTime + 0.5 + Math.random() * 0.5;
        plan.push({
            activity: ResidentState.IDLE_HOME,
            startHour: wakeTime,
            endHour: morningEnd,
            targetLot: data.homeLot,
            priority: 5,
        });

        // Work schedule (if applicable)
        if (data.workStartTime !== undefined && data.workEndTime !== undefined) {
            const workStart = data.workStartTime + dailyOffset * 0.5;
            const workEnd = data.workEndTime + dailyOffset * 0.5;

            // Travel to work location (find a commercial lot)
            const workLot = this.findWorkLot(resident);
            if (workLot) {
                plan.push({
                    activity: ResidentState.WORKING,
                    startHour: workStart,
                    endHour: workEnd,
                    targetLot: workLot,
                    priority: 8,
                });
            }
        }

        // Add lifestyle-based activities
        this.addLifestyleActivities(resident, plan, dailyOffset);

        // Church on Sunday
        if (this.dayOfWeek === 0 && data.religiosity > 0.4 && Math.random() < data.religiosity) {
            const churchLot = this.lots.find(l => l.usage === LotUsage.CHURCH);
            if (churchLot) {
                plan.push({
                    activity: ResidentState.AT_CHURCH,
                    startHour: 10,
                    endHour: 11.5,
                    targetLot: churchLot,
                    priority: 7,
                });
            }
        }

        // Bar/restaurant visit - open 11am to 1am
        const barLot = this.lots.find(l => l.usage === LotUsage.BAR);
        if (barLot) {
            // Lunch visit (based on sociability - eating out)
            if (data.sociability > 0.4 && Math.random() < data.sociability * 0.3) {
                const lunchStart = 11.5 + Math.random() * 1.5; // 11:30am-1pm
                plan.push({
                    activity: ResidentState.EATING,
                    startHour: lunchStart,
                    endHour: lunchStart + 0.5 + Math.random() * 0.5,
                    targetLot: barLot,
                    priority: 4,
                });
            }

            // Evening bar visit (based on drinking habit + sociability)
            const barChance = Math.max(0.15, data.drinkingHabit * (0.6 + data.sociability * 0.4));
            const roll = Math.random();
            if (roll < barChance) {
                const barStart = 18 + Math.random() * 4; // 6pm-10pm
                const barDuration = 1 + Math.random() * 2 * data.drinkingHabit;
                plan.push({
                    activity: ResidentState.AT_BAR,
                    startHour: barStart,
                    endHour: Math.min(barStart + barDuration, 25), // Cap at 1am
                    targetLot: barLot,
                    priority: 4,
                });
                console.log(`[Schedule] ${resident.fullName} scheduled for bar at ${barStart.toFixed(1)}h (chance: ${(barChance*100).toFixed(0)}%, roll: ${(roll*100).toFixed(0)}%)`);
            }
        } else {
            console.warn('[Schedule] No bar lot found!');
        }

        // Evening wind down at home
        const sleepTime = Math.min(24, data.sleepTime + dailyOffset);
        plan.push({
            activity: ResidentState.IDLE_HOME,
            startHour: sleepTime - 1,
            endHour: sleepTime,
            targetLot: data.homeLot,
            priority: 6,
        });

        // Sleep
        plan.push({
            activity: ResidentState.SLEEPING,
            startHour: sleepTime,
            endHour: 24,
            targetLot: data.homeLot,
            priority: 10,
        });

        // Sort by start time and resolve conflicts
        plan.sort((a, b) => a.startHour - b.startHour);
        schedule.dayPlan = this.resolveScheduleConflicts(plan);
        schedule.currentPlanIndex = -1;
    }

    private addLifestyleActivities(resident: Resident, plan: ScheduledActivity[], dailyOffset: number) {
        const data = resident.data;

        switch (data.lifestyle) {
            case Lifestyle.SOCIAL_BUTTERFLY:
                // Visit friends
                if (Math.random() < 0.6) {
                    const friendLot = this.pickFriendLot(resident);
                    const visitStart = 14 + Math.random() * 4;
                    plan.push({
                        activity: ResidentState.SOCIALIZING,
                        startHour: visitStart,
                        endHour: visitStart + 1 + Math.random() * 2,
                        targetLot: friendLot,
                        priority: 5,
                    });
                }
                // Wander in public spaces
                if (Math.random() < 0.5) {
                    const publicLot = this.pickPublicLot();
                    if (publicLot) {
                        const wanderStart = 10 + Math.random() * 6;
                        plan.push({
                            activity: ResidentState.WALKING_AROUND,
                            startHour: wanderStart,
                            endHour: wanderStart + 0.5 + Math.random(),
                            targetLot: publicLot,
                            priority: 3,
                        });
                    }
                }
                break;

            case Lifestyle.HOMEBODY:
                // Mostly stays home, occasional short outings
                if (Math.random() < 0.3) {
                    const nearbyLot = this.pickNearbyLot(resident);
                    if (nearbyLot) {
                        const outingStart = 11 + Math.random() * 4;
                        plan.push({
                            activity: ResidentState.WALKING_AROUND,
                            startHour: outingStart,
                            endHour: outingStart + 0.5,
                            targetLot: nearbyLot,
                            priority: 2,
                        });
                    }
                }
                break;

            case Lifestyle.BALANCED:
                // Mix of activities
                if (Math.random() < 0.4) {
                    const commercialLot = this.pickCommercialLot();
                    if (commercialLot) {
                        const shopStart = 10 + Math.random() * 6;
                        plan.push({
                            activity: ResidentState.SHOPPING,
                            startHour: shopStart,
                            endHour: shopStart + 0.5 + Math.random(),
                            targetLot: commercialLot,
                            priority: 4,
                        });
                    }
                }
                if (Math.random() < 0.3) {
                    const publicLot = this.pickPublicLot();
                    if (publicLot) {
                        const walkStart = 16 + Math.random() * 3;
                        plan.push({
                            activity: ResidentState.WALKING_AROUND,
                            startHour: walkStart,
                            endHour: walkStart + 0.5 + Math.random() * 0.5,
                            targetLot: publicLot,
                            priority: 3,
                        });
                    }
                }
                break;

            case Lifestyle.WORKAHOLIC:
                // Extra work time or work-related outings
                if (Math.random() < 0.5 && data.workStartTime !== undefined) {
                    const workLot = this.findWorkLot(resident);
                    if (workLot) {
                        // Work longer or come back in evening
                        plan.push({
                            activity: ResidentState.WORKING,
                            startHour: 19,
                            endHour: 21,
                            targetLot: workLot,
                            priority: 6,
                        });
                    }
                }
                break;
        }

        // Random chance to leave town (if has car)
        if (data.hasCar && Math.random() < 0.1) {
            // Will be handled separately
        }
    }

    private resolveScheduleConflicts(plan: ScheduledActivity[]): ScheduledActivity[] {
        const resolved: ScheduledActivity[] = [];

        for (const activity of plan) {
            let overlaps = false;
            for (const existing of resolved) {
                if (activity.startHour < existing.endHour && activity.endHour > existing.startHour) {
                    // Overlap - keep higher priority
                    if (activity.priority > existing.priority) {
                        // Remove existing, adjust times
                        const idx = resolved.indexOf(existing);
                        if (idx !== -1) {
                            // Trim existing around new activity
                            if (existing.startHour < activity.startHour) {
                                resolved[idx] = { ...existing, endHour: activity.startHour };
                            } else {
                                resolved.splice(idx, 1);
                            }
                        }
                    } else {
                        overlaps = true;
                    }
                }
            }
            if (!overlaps) {
                resolved.push(activity);
            }
        }

        return resolved.sort((a, b) => a.startHour - b.startHour);
    }

    private updateActivity(resident: Resident, schedule: IndividualSchedule, hour: number, timeSeconds: number) {
        // Find current activity in day plan
        const currentPlan = schedule.dayPlan.find(a =>
            hour >= a.startHour && hour < a.endHour
        );

        if (!currentPlan) {
            // Fill gap with idle at home
            if (schedule.currentActivity !== ResidentState.IDLE_HOME &&
                schedule.currentActivity !== ResidentState.WALKING_HOME) {
                this.transitionTo(resident, schedule, ResidentState.IDLE_HOME, resident.data.homeLot, timeSeconds);
            }
            return;
        }

        // Check if activity changed
        if (schedule.currentActivity !== currentPlan.activity ||
            schedule.destinationLot?.id !== currentPlan.targetLot?.id) {
            // Debug log for bar/church transitions
            if (currentPlan.activity === ResidentState.AT_BAR || currentPlan.activity === ResidentState.AT_CHURCH) {
                console.log(`[Schedule] ${resident.fullName} transitioning to ${currentPlan.activity} at lot ${currentPlan.targetLot?.id}`);
            }
            this.transitionTo(resident, schedule, currentPlan.activity, currentPlan.targetLot, timeSeconds);
        }

        // Handle idle movement within current location
        if (!resident.isInCar && !resident.target && resident.path.length === 0) {
            if (schedule.currentActivity === ResidentState.WALKING_AROUND ||
                schedule.currentActivity === ResidentState.IDLE_HOME ||
                schedule.currentActivity === ResidentState.SOCIALIZING) {
                // Occasionally wander within the lot
                if (Math.random() < 0.02) { // ~2% chance per update
                    const lot = schedule.destinationLot || resident.data.homeLot;
                    const point = this.getRandomPointInLot(lot);
                    resident.setTargetPosition(new THREE.Vector3(point.x, 2, point.y));
                }
            }
        }
    }

    private transitionTo(resident: Resident, schedule: IndividualSchedule, activity: ResidentState, targetLot: Lot | undefined, timeSeconds: number) {
        schedule.currentActivity = activity;
        schedule.destinationLot = targetLot;
        schedule.activityStartTime = timeSeconds;
        resident.behaviorState = activity;

        // Set allowed lots for socializing
        if (activity === ResidentState.SOCIALIZING && targetLot) {
            resident.allowedLots = [targetLot.id];
        } else {
            resident.allowedLots = [];
        }

        // Handle travel to destination
        if (targetLot && targetLot.id !== resident.data.homeLot.id) {
            const currentLot = this.getCurrentLot(resident);
            const needsTravel = !currentLot || currentLot.id !== targetLot.id;

            if (needsTravel) {
                if (resident.data.hasCar && resident.data.car && this.shouldUseCar(resident, targetLot)) {
                    // Drive there
                    resident.enterCar();
                    resident.behaviorState = ResidentState.DRIVING;
                    const target = this.getParkingTarget(targetLot);
                    const targetPos = new THREE.Vector3(target.x, 1, target.y);
                    // Use proper road-based pathfinding instead of direct target
                    const carPath = this.pathSystem.getVehiclePathTo(
                        resident.data.car.position,
                        targetPos,
                        this.lots,
                        resident.data.car
                    );
                    if (carPath.length > 0) {
                        resident.data.car.path = carPath;
                        resident.data.car.target = null; // Path system will set targets
                    } else {
                        // Fallback to direct target if no path found
                        resident.data.car.target = targetPos;
                    }
                } else {
                    // Walk there
                    const point = this.getRandomPointInLot(targetLot);
                    resident.setTargetPosition(new THREE.Vector3(point.x, 2, point.y));
                }
            }
        } else if (activity === ResidentState.SLEEPING || activity === ResidentState.IDLE_HOME) {
            // Go home if not there
            if (!resident.isHome) {
                resident.startReturnHome();
            }
        }
    }

    private shouldUseCar(resident: Resident, targetLot: Lot): boolean {
        // Calculate distance to target
        const targetCenter = this.getLotCenter(targetLot);
        const dist = Math.sqrt(
            Math.pow(resident.position.x - targetCenter.x, 2) +
            Math.pow(resident.position.z - targetCenter.y, 2)
        );

        // Base walking threshold based on adventurous trait
        const walkingThreshold = 100 + resident.data.adventurous * 200;

        // Short distances: always walk
        if (dist < walkingThreshold * 0.5) return false;

        // Medium distances: 60% chance to drive
        if (dist < walkingThreshold) return Math.random() < 0.6;

        // Long distances: 85% chance to drive (some people still walk)
        return Math.random() < 0.85;
    }

    private getCurrentLot(resident: Resident): Lot | undefined {
        const x = resident.position.x;
        const y = resident.position.z;
        return this.lots.find(lot => this.isPointInLot(x, y, lot.points));
    }

    private findWorkLot(resident: Resident): Lot | undefined {
        // Find a commercial lot that could be their "workplace"
        const commercialLots = this.lots.filter(l =>
            l.usage === LotUsage.COMMERCIAL || l.usage === LotUsage.PUBLIC
        );
        if (commercialLots.length === 0) return undefined;

        // Consistent workplace per resident (seeded by id)
        const hash = resident.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
        return commercialLots[hash % commercialLots.length];
    }

    private pickFriendLot(resident: Resident): Lot {
        const candidates = this.lots.filter(lot =>
            lot.usage === LotUsage.RESIDENTIAL && lot.id !== resident.data.homeLot.id
        );
        if (candidates.length === 0) return resident.data.homeLot;
        return candidates[Math.floor(Math.random() * candidates.length)];
    }

    private pickPublicLot(): Lot | undefined {
        const candidates = this.lots.filter(lot => lot.usage === LotUsage.PUBLIC);
        if (candidates.length === 0) return undefined;
        return candidates[Math.floor(Math.random() * candidates.length)];
    }

    private pickCommercialLot(): Lot | undefined {
        const candidates = this.lots.filter(lot => lot.usage === LotUsage.COMMERCIAL);
        if (candidates.length === 0) return undefined;
        return candidates[Math.floor(Math.random() * candidates.length)];
    }

    private pickNearbyLot(resident: Resident): Lot | undefined {
        const homeCenter = this.getLotCenter(resident.data.homeLot);
        const candidates = this.lots.filter(lot => {
            if (lot.id === resident.data.homeLot.id) return false;
            const center = this.getLotCenter(lot);
            const dist = Math.sqrt(Math.pow(center.x - homeCenter.x, 2) + Math.pow(center.y - homeCenter.y, 2));
            return dist < 200; // Within 200 units
        });
        if (candidates.length === 0) return undefined;
        return candidates[Math.floor(Math.random() * candidates.length)];
    }

    private returnFromTown(resident: Resident) {
        const entry = this.getHighwayEntryPoint();
        if (resident.data.car) {
            resident.data.car.position.set(entry.x, 1, entry.y);
            resident.data.car.updateMesh();
            resident.data.car.carGroup.visible = true;
            // Snap to proper roadside parking before leaving car
            this.pathSystem.snapToRoadsideParking(resident.data.car);
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

    private getLotCenter(lot: Lot): { x: number; y: number } {
        return {
            x: lot.points.reduce((s, p) => s + p.x, 0) / lot.points.length,
            y: lot.points.reduce((s, p) => s + p.y, 0) / lot.points.length,
        };
    }

    private getParkingTarget(lot: Lot): { x: number; y: number } {
        // If lot has its own parking, use it
        if (lot.parkingSpot) return lot.parkingSpot;
        if (lot.entryPoint) return lot.entryPoint;

        // For special lots (bar, church), look for nearby parking lots
        if (lot.usage === LotUsage.BAR || lot.usage === LotUsage.CHURCH) {
            const nearbyParking = this.findNearbyParkingLot(lot);
            if (nearbyParking) {
                return this.getLotCenter(nearbyParking);
            }
        }

        return this.getLotCenter(lot);
    }

    private findNearbyParkingLot(targetLot: Lot): Lot | undefined {
        const targetCenter = this.getLotCenter(targetLot);
        const parkingLots = this.lots.filter(l => l.usage === LotUsage.PARKING);

        if (parkingLots.length === 0) return undefined;

        // Find closest parking lot
        let closest: Lot | undefined;
        let closestDist = Infinity;

        for (const parking of parkingLots) {
            const center = this.getLotCenter(parking);
            const dist = Math.sqrt(
                Math.pow(center.x - targetCenter.x, 2) +
                Math.pow(center.y - targetCenter.y, 2)
            );
            if (dist < closestDist) {
                closestDist = dist;
                closest = parking;
            }
        }

        return closest;
    }

    private getRandomPointInLot(lot: Lot): { x: number; y: number } {
        const minX = Math.min(...lot.points.map(p => p.x));
        const maxX = Math.max(...lot.points.map(p => p.x));
        const minY = Math.min(...lot.points.map(p => p.y));
        const maxY = Math.max(...lot.points.map(p => p.y));
        const margin = 8;
        const insetMinX = minX + margin;
        const insetMaxX = maxX - margin;
        const insetMinY = minY + margin;
        const insetMaxY = maxY - margin;
        const useInset = insetMinX < insetMaxX && insetMinY < insetMaxY;

        for (let i = 0; i < 24; i++) {
            const x = (useInset ? insetMinX : minX) + Math.random() * ((useInset ? insetMaxX : maxX) - (useInset ? insetMinX : minX));
            const y = (useInset ? insetMinY : minY) + Math.random() * ((useInset ? insetMaxY : maxY) - (useInset ? insetMinY : minY));
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
}
