import * as THREE from 'three';
import { SchoolBus } from '../entities/SchoolBus';
import { Agent } from '../entities/Agent';
import { Lot, LotUsage, AgentType, TownEventType } from '../types';
import { PathfindingSystem } from './PathfindingSystem';
import { EventSystem } from './EventSystem';

export enum SchoolBusState {
    INACTIVE = 'inactive',
    ENTERING_TOWN = 'entering_town',
    PICKING_UP = 'picking_up',
    AT_STOP = 'at_stop',
    DROPPING_OFF = 'dropping_off',
    LEAVING_TOWN = 'leaving_town'
}

export interface SchoolBusSystemConfig {
    lots: Lot[];
    pathSystem: PathfindingSystem;
    eventSystem: EventSystem;
    worldBounds: { minX: number; maxX: number; minY: number; maxY: number };
    onAddAgent?: (agent: Agent | SchoolBus) => void;
    onRemoveAgent?: (agent: Agent | SchoolBus) => void;
}

export class SchoolBusSystem {
    private bus: SchoolBus | null = null;
    private state: SchoolBusState = SchoolBusState.INACTIVE;
    private lots: Lot[];
    private pathSystem: PathfindingSystem;
    private eventSystem: EventSystem;
    private bounds: SchoolBusSystemConfig['worldBounds'];
    private onAddAgent?: (agent: Agent | SchoolBus) => void;
    private onRemoveAgent?: (agent: Agent | SchoolBus) => void;

    private residentialStops: THREE.Vector3[] = [];
    private stopWaitTime: number = 0;
    private stopWaitDuration: number = 30; // seconds at each stop

    // Children waiting for bus or on bus
    private waitingChildren: Map<number, Agent[]> = new Map(); // lotIndex -> children at that stop
    private childrenOnBus: Agent[] = [];

    constructor(config: SchoolBusSystemConfig) {
        this.lots = config.lots;
        this.pathSystem = config.pathSystem;
        this.eventSystem = config.eventSystem;
        this.bounds = config.worldBounds;
        this.onAddAgent = config.onAddAgent;
        this.onRemoveAgent = config.onRemoveAgent;

        // Calculate residential stops
        this.calculateStops();

        // Subscribe to school bus events
        this.eventSystem.on(TownEventType.SCHOOL_BUS_ARRIVES, (event) => {
            if (this.state === SchoolBusState.INACTIVE) {
                const purpose = event.data?.purpose || 'dropoff';
                this.spawnBus(purpose === 'pickup');
            }
        });
    }

    private calculateStops() {
        // Get residential lots and create stops along roads near them
        const residentialLots = this.lots.filter(lot =>
            lot.usage === LotUsage.RESIDENTIAL && lot.roadAccessPoint
        );

        // Group nearby lots into stops (don't stop at every single house)
        const stops: THREE.Vector3[] = [];
        const usedLots = new Set<number>();

        for (const lot of residentialLots) {
            if (usedLots.has(lot.id)) continue;

            const accessPoint = lot.roadAccessPoint!;
            const stop = new THREE.Vector3(accessPoint.x, 1, -accessPoint.y);

            // Mark nearby lots as covered by this stop
            for (const otherLot of residentialLots) {
                if (otherLot.roadAccessPoint) {
                    const dist = Math.sqrt(
                        Math.pow(accessPoint.x - otherLot.roadAccessPoint.x, 2) +
                        Math.pow(accessPoint.y - otherLot.roadAccessPoint.y, 2)
                    );
                    if (dist < 150) { // Within 150 units = same stop
                        usedLots.add(otherLot.id);
                    }
                }
            }

            stops.push(stop);
        }

        // Sort stops by distance from entry point (northwest)
        const entryPoint = this.getEntryPoint();
        stops.sort((a, b) => {
            const distA = a.distanceTo(new THREE.Vector3(entryPoint.x, 1, -entryPoint.y));
            const distB = b.distanceTo(new THREE.Vector3(entryPoint.x, 1, -entryPoint.y));
            return distA - distB;
        });

        // Limit to reasonable number of stops
        this.residentialStops = stops.slice(0, 8);
    }

    private getEntryPoint(): { x: number; y: number } {
        return {
            x: this.bounds.minX + 50,
            y: this.bounds.minY + 50
        };
    }

    private getExitPoint(): { x: number; y: number } {
        return this.getEntryPoint();
    }

    private spawnBus(isPickingUp: boolean) {
        const entry = this.getEntryPoint();
        const nearestRoad = this.pathSystem.getNearestRoadPoint(entry.x, entry.y);
        const pos = new THREE.Vector3(nearestRoad.x, 1, -nearestRoad.y);

        this.bus = new SchoolBus({
            id: `school_bus_${Date.now()}`,
            type: AgentType.SCHOOL_BUS_DRIVER,
            position: pos.clone(),
            speed: 25
        });

        this.bus.isPickingUp = isPickingUp;
        this.bus.setStops([...this.residentialStops]);

        this.state = SchoolBusState.ENTERING_TOWN;
        this.onAddAgent?.(this.bus);

        // Set path to first stop
        this.driveToNextStop();

        console.log(`[SchoolBus] Spawned for ${isPickingUp ? 'pickup' : 'dropoff'} with ${this.residentialStops.length} stops`);
    }

    private driveToNextStop() {
        if (!this.bus) return;

        const nextStop = this.bus.getNextStop();
        if (nextStop) {
            const path = this.pathSystem.getPathTo(this.bus.position, nextStop);
            if (path.length > 0) {
                this.bus.path = path;
            } else {
                this.bus.target = nextStop.clone();
            }
            this.state = this.bus.isPickingUp ? SchoolBusState.PICKING_UP : SchoolBusState.DROPPING_OFF;
        } else {
            // No more stops, leave town
            this.leaveDown();
        }
    }

    private leaveDown() {
        if (!this.bus) return;

        const exit = this.getExitPoint();
        const exitTarget = new THREE.Vector3(exit.x, 1, -exit.y);
        const path = this.pathSystem.getPathTo(this.bus.position, exitTarget);

        if (path.length > 0) {
            this.bus.path = path;
        } else {
            this.bus.target = exitTarget;
        }

        this.state = SchoolBusState.LEAVING_TOWN;
    }

    update(timeSeconds: number, delta: number) {
        if (!this.bus || this.state === SchoolBusState.INACTIVE) return;

        // Update bus movement
        if (this.bus.path && this.bus.path.length > 0) {
            this.bus.target = this.bus.path[0];
            if (this.bus.position.distanceTo(this.bus.target) < 8) {
                this.bus.path.shift();
            }
        }

        this.bus.update(delta);

        // State machine
        switch (this.state) {
            case SchoolBusState.ENTERING_TOWN:
            case SchoolBusState.PICKING_UP:
            case SchoolBusState.DROPPING_OFF:
                // Check if we've reached the current stop
                const nextStop = this.bus.getNextStop();
                if (nextStop && this.bus.position.distanceTo(nextStop) < 15) {
                    this.state = SchoolBusState.AT_STOP;
                    this.stopWaitTime = 0;
                    this.bus.target = null;
                    this.bus.path = [];

                    if (this.bus.isPickingUp) {
                        // Simulate picking up children
                        const childrenToAdd = Math.floor(Math.random() * 3) + 1;
                        for (let i = 0; i < childrenToAdd && this.bus.hasRoom(); i++) {
                            // Create invisible child agent (just for counting)
                            const child = new Agent({
                                id: `child_${Date.now()}_${i}`,
                                type: AgentType.CHILD,
                                position: this.bus.position.clone(),
                                speed: 5
                            });
                            this.bus.addPassenger(child);
                        }
                    } else {
                        // Drop off children
                        const toDrop = Math.min(this.bus.getPassengerCount(), Math.floor(Math.random() * 3) + 1);
                        for (let i = 0; i < toDrop; i++) {
                            const passengers = this.bus.removeAllPassengers();
                            // Children walk away (simplified - just remove them)
                        }
                    }
                }
                break;

            case SchoolBusState.AT_STOP:
                this.stopWaitTime += delta;
                if (this.stopWaitTime >= this.stopWaitDuration) {
                    this.bus.advanceToNextStop();
                    this.driveToNextStop();
                }
                break;

            case SchoolBusState.LEAVING_TOWN:
                // Check if bus has left the map
                const exitPoint = this.getExitPoint();
                const exitDist = this.bus.position.distanceTo(new THREE.Vector3(exitPoint.x, 1, -exitPoint.y));
                if (exitDist < 30 && (!this.bus.target && (!this.bus.path || this.bus.path.length === 0))) {
                    this.despawnBus();
                }
                break;
        }
    }

    private despawnBus() {
        if (this.bus) {
            this.onRemoveAgent?.(this.bus);
            this.eventSystem.clearActiveEvent(TownEventType.SCHOOL_BUS_ARRIVES);
            this.bus = null;
            this.state = SchoolBusState.INACTIVE;
            console.log('[SchoolBus] Left town');
        }
    }

    getBus(): SchoolBus | null {
        return this.bus;
    }

    getState(): SchoolBusState {
        return this.state;
    }

    // For testing - manually trigger bus
    triggerBus(isPickingUp: boolean = true) {
        if (this.state === SchoolBusState.INACTIVE) {
            this.spawnBus(isPickingUp);
        }
    }
}
