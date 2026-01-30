import * as THREE from 'three';
import { Agent, AgentConfig } from './Agent';
import { Vehicle } from './Vehicle';
import { AgentType, Lot } from '../types';

// Behavior states for residents
export enum ResidentState {
    IDLE_HOME = 'idle_home',
    WALKING_TO_CAR = 'walking_to_car',
    DRIVING = 'driving',
    WALKING_HOME = 'walking_home',
    WALKING_AROUND = 'walking_around',
}

// Name pools for generation
const FIRST_NAMES = [
    'James', 'Mary', 'John', 'Patricia', 'Robert', 'Jennifer', 'Michael', 'Linda',
    'William', 'Barbara', 'David', 'Elizabeth', 'Richard', 'Susan', 'Joseph', 'Jessica',
    'Thomas', 'Sarah', 'Charles', 'Karen', 'Daniel', 'Nancy', 'Matthew', 'Lisa',
    'Anthony', 'Betty', 'Mark', 'Margaret', 'Donald', 'Sandra', 'Steven', 'Ashley',
    'Paul', 'Kimberly', 'Andrew', 'Emily', 'Joshua', 'Donna', 'Kenneth', 'Michelle',
    'Carlos', 'Maria', 'Jose', 'Rosa', 'Luis', 'Carmen', 'Miguel', 'Sofia',
    'Diego', 'Isabella', 'Alejandro', 'Valentina', 'Pedro', 'Camila', 'Juan', 'Luna'
];

const LAST_NAMES = [
    'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
    'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson',
    'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson',
    'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson', 'Walker',
    'Young', 'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores'
];

const OCCUPATIONS = [
    'Retired', 'Artist', 'Writer', 'Musician', 'Fisherman', 'Mechanic', 'Cook',
    'Bartender', 'Store Owner', 'Handyman', 'Photographer', 'Sculptor', 'Potter',
    'Tour Guide', 'Boat Captain', 'Unemployed', 'Remote Worker', 'Caretaker'
];

export interface ResidentData {
    id: string;
    firstName: string;
    lastName: string;
    age: number;
    occupation: string;
    homeLot: Lot;
    hasCar: boolean;
    car?: Vehicle;
    // Personality traits (0-1)
    sociability: number;  // How often they go out
    adventurous: number;  // How far they roam
}

// Helper to get address string
export function getResidentAddress(resident: Resident): string {
    if (resident.data.homeLot.address) {
        return resident.data.homeLot.address.fullAddress;
    }
    return `Lot #${resident.data.homeLot.id}`;
}

export class Resident extends Agent {
    data: ResidentData;
    isHome: boolean = true;
    isInCar: boolean = false;

    // Behavior state machine
    behaviorState: ResidentState = ResidentState.IDLE_HOME;
    private idleTimer: number = 0;
    private tripDuration: number = 0;
    private maxTripDuration: number = 0;

    constructor(config: AgentConfig, data: ResidentData) {
        super(config);
        this.data = data;

        // Update mesh userData
        this.mesh.userData = { type: 'resident', data: this };
        this.mesh.name = `${data.firstName} ${data.lastName}`;

        // Randomize initial idle timer so not everyone leaves at once
        this.idleTimer = Math.random() * 30; // 0-30 seconds before first decision
    }

    // Check if resident is currently at their home lot
    updateHomeStatus() {
        const lot = this.data.homeLot;
        if (!lot || lot.points.length < 3) {
            this.isHome = false;
            return;
        }

        // Convert 3D position to SVG coordinates
        // 3D (x, y, z) → SVG (x, y): svgX = position.x, svgY = -position.z
        const svgX = this.position.x;
        const svgY = -this.position.z;

        // Check if point is inside the lot polygon using ray casting
        this.isHome = this.isPointInLot(svgX, svgY, lot.points);
    }

    private isPointInLot(x: number, y: number, points: { x: number; y: number }[]): boolean {
        // Ray casting algorithm for point-in-polygon
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

    update(delta: number) {
        // If in car, don't update resident movement (car handles it)
        if (!this.isInCar) {
            super.update(delta);
        }

        // Update home status based on current position
        this.updateHomeStatus();

        // Behavior state machine
        this.updateBehavior(delta);
    }

    private updateBehavior(delta: number) {
        switch (this.behaviorState) {
            case ResidentState.IDLE_HOME:
                this.idleTimer -= delta;
                if (this.idleTimer <= 0) {
                    // Decide whether to go out based on sociability
                    if (Math.random() < this.data.sociability * 0.3) {
                        this.startTrip();
                    } else {
                        // Wait another random period
                        this.idleTimer = 10 + Math.random() * 40;
                    }
                }
                break;

            case ResidentState.WALKING_TO_CAR:
                // Check if reached the car
                if (this.data.car && !this.target && this.path.length === 0) {
                    const carDist = this.position.distanceTo(this.data.car.position);
                    if (carDist < 15) {
                        this.enterCar();
                        this.behaviorState = ResidentState.DRIVING;
                        this.tripDuration = 0;
                        this.maxTripDuration = 20 + Math.random() * 60 * this.data.adventurous;
                    }
                }
                break;

            case ResidentState.DRIVING:
                this.tripDuration += delta;
                // Check if trip is done
                if (this.tripDuration >= this.maxTripDuration) {
                    this.startReturnHome();
                }
                break;

            case ResidentState.WALKING_HOME:
                // Check if arrived home
                if (!this.target && this.path.length === 0 && this.isHome) {
                    this.behaviorState = ResidentState.IDLE_HOME;
                    this.idleTimer = 20 + Math.random() * 60;
                }
                break;

            case ResidentState.WALKING_AROUND:
                this.tripDuration += delta;
                if (this.tripDuration >= this.maxTripDuration) {
                    this.startReturnHome();
                }
                break;
        }
    }

    startTrip() {
        if (this.data.hasCar && this.data.car) {
            // Walk to car first
            this.behaviorState = ResidentState.WALKING_TO_CAR;
            // Set target to car position (pathfinding will handle it)
            this.setTargetPosition(this.data.car.position.clone());
        } else {
            // Just walk around
            this.behaviorState = ResidentState.WALKING_AROUND;
            this.tripDuration = 0;
            this.maxTripDuration = 15 + Math.random() * 45 * this.data.adventurous;
            // Path will be set by PathfindingSystem
        }
    }

    startReturnHome() {
        if (this.isInCar && this.data.car) {
            // Park near home and exit
            this.exitCar();
        }
        this.behaviorState = ResidentState.WALKING_HOME;
        // Set target to home lot center
        const lot = this.data.homeLot;
        if (lot && lot.points.length > 0) {
            const centerX = lot.points.reduce((s, p) => s + p.x, 0) / lot.points.length;
            const centerY = lot.points.reduce((s, p) => s + p.y, 0) / lot.points.length;
            // SVG → 3D: (x, height, -y)
            this.setTargetPosition(new THREE.Vector3(centerX, 2, -centerY));
        }
    }

    setTargetPosition(pos: THREE.Vector3) {
        // Clear existing path and set new target
        this.path = [];
        this.target = pos;
    }

    get fullName(): string {
        return `${this.data.firstName} ${this.data.lastName}`;
    }

    get address(): string {
        if (this.data.homeLot.address) {
            return this.data.homeLot.address.fullAddress;
        }
        return `Lot #${this.data.homeLot.id}`;
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
            // Position near car
            this.position.copy(this.data.car.position);
            this.position.x += 10;
            this.updateMesh();
            this.data.car.setDriver(null);
        }
    }

    static generateRandom(id: string, homeLot: Lot, position: THREE.Vector3): Resident {
        const firstName = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
        const lastName = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
        const age = 18 + Math.floor(Math.random() * 70); // 18-87
        const occupation = OCCUPATIONS[Math.floor(Math.random() * OCCUPATIONS.length)];
        const hasCar = Math.random() < 0.6; // 60% have cars

        const data: ResidentData = {
            id,
            firstName,
            lastName,
            age,
            occupation,
            homeLot,
            hasCar,
            sociability: Math.random(),
            adventurous: Math.random(),
        };

        const config: AgentConfig = {
            id,
            type: AgentType.RESIDENT,
            position,
            speed: 8 + Math.random() * 4, // Walking speed varies by person
        };

        return new Resident(config, data);
    }
}
