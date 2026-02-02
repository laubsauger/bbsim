import * as THREE from 'three';
import { Vehicle } from '../entities/Vehicle';
import { Agent } from '../entities/Agent';
import { Lot, LotUsage, AgentType, TownEventType } from '../types';
import { PathfindingSystem } from './PathfindingSystem';
import { EventSystem } from './EventSystem';

export enum SheriffState {
    OFF_DUTY = 'off_duty',
    ENTERING_TOWN = 'entering_town',
    PATROLLING = 'patrolling',
    AT_STOP = 'at_stop',
    LEAVING_TOWN = 'leaving_town'
}

export interface SheriffSystemConfig {
    lots: Lot[];
    pathSystem: PathfindingSystem;
    eventSystem: EventSystem;
    worldBounds: { minX: number; maxX: number; minY: number; maxY: number };
    onAddAgent?: (agent: Agent | Vehicle) => void;
    onRemoveAgent?: (agent: Agent | Vehicle) => void;
}

export class SheriffSystem {
    private sheriffCar: Vehicle | null = null;
    private sheriff: Agent | null = null;
    private state: SheriffState = SheriffState.OFF_DUTY;
    private lots: Lot[];
    private pathSystem: PathfindingSystem;
    private eventSystem: EventSystem;
    private bounds: SheriffSystemConfig['worldBounds'];
    private onAddAgent?: (agent: Agent | Vehicle) => void;
    private onRemoveAgent?: (agent: Agent | Vehicle) => void;

    private patrolPoints: THREE.Vector3[] = [];
    private currentPatrolIndex: number = 0;
    private stopWaitTime: number = 0;
    private stopWaitDuration: number = 60; // 1 minute at each patrol point

    constructor(config: SheriffSystemConfig) {
        this.lots = config.lots;
        this.pathSystem = config.pathSystem;
        this.eventSystem = config.eventSystem;
        this.bounds = config.worldBounds;
        this.onAddAgent = config.onAddAgent;
        this.onRemoveAgent = config.onRemoveAgent;

        // Calculate patrol points
        this.calculatePatrolRoute();

        // Subscribe to sheriff events
        this.eventSystem.on(TownEventType.SHERIFF_ARRIVES, () => {
            if (this.state === SheriffState.OFF_DUTY) {
                this.spawnSheriff();
            }
        });

        this.eventSystem.on(TownEventType.SHERIFF_PATROL, () => {
            if (this.state === SheriffState.OFF_DUTY) {
                this.spawnSheriff();
            }
        });
    }

    private calculatePatrolRoute() {
        // Create patrol route visiting key areas: bars, commercial, public spaces
        const interestingLots = this.lots.filter(lot =>
            (lot.usage === LotUsage.BAR ||
             lot.usage === LotUsage.COMMERCIAL ||
             lot.usage === LotUsage.PUBLIC) &&
            lot.roadAccessPoint
        );

        // Pick up to 5 patrol points
        const shuffled = [...interestingLots].sort(() => Math.random() - 0.5);
        const selectedLots = shuffled.slice(0, 5);

        this.patrolPoints = selectedLots.map(lot => {
            const access = lot.roadAccessPoint!;
            return new THREE.Vector3(access.x, 1, access.y);
        });

        // Add some random road points if we don't have enough interesting lots
        while (this.patrolPoints.length < 4) {
            const randomPoint = this.pathSystem.getRandomPointOnRoad();
            this.patrolPoints.push(randomPoint);
        }
    }

    private getEntryPoint(): { x: number; y: number } {
        return {
            x: this.bounds.minX + 50,
            y: this.bounds.minY + 50
        };
    }

    private spawnSheriff() {
        const entry = this.getEntryPoint();
        const nearestRoad = this.pathSystem.getNearestRoadPoint(entry.x, entry.y);
        const pos = new THREE.Vector3(nearestRoad.x, 1, nearestRoad.y);

        // Create sheriff (cop agent)
        this.sheriff = new Agent({
            id: `sheriff_${Date.now()}`,
            type: AgentType.COP,
            position: pos.clone(),
            speed: 8
        });

        // Create police car
        this.sheriffCar = new Vehicle({
            id: `sheriff_car_${Date.now()}`,
            type: AgentType.COP,
            position: pos.clone(),
            speed: 40
        }, false);

        this.sheriffCar.setDriver(this.sheriff);

        this.state = SheriffState.ENTERING_TOWN;
        this.currentPatrolIndex = 0;

        this.onAddAgent?.(this.sheriff);
        this.onAddAgent?.(this.sheriffCar);

        // Shuffle patrol points for variety
        this.patrolPoints.sort(() => Math.random() - 0.5);

        // Start driving to first patrol point
        this.driveToNextPatrolPoint();

        console.log(`[Sheriff] Arrived in town with ${this.patrolPoints.length} patrol points`);
    }

    private driveToNextPatrolPoint() {
        if (!this.sheriffCar) return;

        if (this.currentPatrolIndex < this.patrolPoints.length) {
            const target = this.patrolPoints[this.currentPatrolIndex];
            const path = this.pathSystem.getPathTo(this.sheriffCar.position, target);

            if (path.length > 0) {
                this.sheriffCar.path = path;
            } else {
                this.sheriffCar.target = target.clone();
            }

            this.state = SheriffState.PATROLLING;
        } else {
            // Done patrolling, leave town
            this.leaveTown();
        }
    }

    private leaveTown() {
        if (!this.sheriffCar) return;

        const exit = this.getEntryPoint();
        const exitTarget = new THREE.Vector3(exit.x, 1, exit.y);
        const path = this.pathSystem.getPathTo(this.sheriffCar.position, exitTarget);

        if (path.length > 0) {
            this.sheriffCar.path = path;
        } else {
            this.sheriffCar.target = exitTarget;
        }

        this.state = SheriffState.LEAVING_TOWN;
    }

    update(timeSeconds: number, delta: number) {
        if (!this.sheriffCar || this.state === SheriffState.OFF_DUTY) return;

        // Update car movement
        if (this.sheriffCar.path && this.sheriffCar.path.length > 0) {
            this.sheriffCar.target = this.sheriffCar.path[0];
            if (this.sheriffCar.position.distanceTo(this.sheriffCar.target) < 5) {
                this.sheriffCar.path.shift();
            }
        }

        this.sheriffCar.update(delta);

        // Keep sheriff position synced with car
        if (this.sheriff) {
            this.sheriff.position.copy(this.sheriffCar.position);
            this.sheriff.mesh.visible = false; // Hide while in car
        }

        // State machine
        switch (this.state) {
            case SheriffState.ENTERING_TOWN:
            case SheriffState.PATROLLING:
                if (this.currentPatrolIndex < this.patrolPoints.length) {
                    const target = this.patrolPoints[this.currentPatrolIndex];
                    if (this.sheriffCar.position.distanceTo(target) < 15) {
                        this.state = SheriffState.AT_STOP;
                        this.stopWaitTime = 0;
                        this.sheriffCar.target = null;
                        this.sheriffCar.path = [];
                    }
                }
                break;

            case SheriffState.AT_STOP:
                this.stopWaitTime += delta;
                if (this.stopWaitTime >= this.stopWaitDuration) {
                    this.currentPatrolIndex++;
                    this.driveToNextPatrolPoint();
                }
                break;

            case SheriffState.LEAVING_TOWN:
                const exitPoint = this.getEntryPoint();
                const exitDist = this.sheriffCar.position.distanceTo(
                    new THREE.Vector3(exitPoint.x, 1, exitPoint.y)
                );
                if (exitDist < 30 && !this.sheriffCar.target && (!this.sheriffCar.path || this.sheriffCar.path.length === 0)) {
                    this.despawnSheriff();
                }
                break;
        }
    }

    private despawnSheriff() {
        if (this.sheriffCar) {
            this.onRemoveAgent?.(this.sheriffCar);
        }
        if (this.sheriff) {
            this.onRemoveAgent?.(this.sheriff);
        }

        this.eventSystem.clearActiveEvent(TownEventType.SHERIFF_ARRIVES);
        this.eventSystem.clearActiveEvent(TownEventType.SHERIFF_PATROL);

        this.sheriffCar = null;
        this.sheriff = null;
        this.state = SheriffState.OFF_DUTY;

        console.log('[Sheriff] Left town');
    }

    getSheriffCar(): Vehicle | null {
        return this.sheriffCar;
    }

    getSheriff(): Agent | null {
        return this.sheriff;
    }

    getState(): SheriffState {
        return this.state;
    }

    // For testing - manually trigger sheriff
    triggerPatrol() {
        if (this.state === SheriffState.OFF_DUTY) {
            this.spawnSheriff();
        }
    }
}
