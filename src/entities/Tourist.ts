import * as THREE from 'three';
import { Agent, AgentConfig } from './Agent';
import { Vehicle } from './Vehicle';
import { AgentType, Lot } from '../types';

export enum TouristState {
    ARRIVING = 'arriving',
    WALKING = 'walking',
    STAYING = 'staying',
    RETURNING_TO_CAR = 'returning_to_car',
    LEAVING = 'leaving',
    EXITED = 'exited',
}

export interface TouristData {
    id: string;
    hasCar: boolean;
    car?: Vehicle;
    lodgingLot?: Lot;
    parkingSpot?: { x: number; y: number };
    arrivalTime: number;
    departTime: number;
    nextWanderTime: number;
}

export class Tourist extends Agent {
    data: TouristData;
    state: TouristState = TouristState.ARRIVING;
    isInCar: boolean = true;

    constructor(config: AgentConfig, data: TouristData) {
        super(config);
        this.data = data;
        this.mesh.userData = { type: 'tourist', data: this };
        this.mesh.name = `Tourist ${data.id}`;
    }

    enterCar() {
        if (this.data.car && !this.isInCar) {
            this.isInCar = true;
            this.mesh.visible = false;
            this.data.car.setDriver(this);
        }
    }

    exitCar() {
        if (this.isInCar && this.data.car) {
            this.isInCar = false;
            this.mesh.visible = true;
            this.position.copy(this.data.car.position);
            this.updateMesh();
            this.data.car.setDriver(null);
        }
    }

    update(delta: number) {
        if (this.isInCar && this.data.car) {
            this.position.copy(this.data.car.position);
        } else {
            super.update(delta);
        }
    }
}
