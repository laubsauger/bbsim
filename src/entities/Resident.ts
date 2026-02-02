import * as THREE from 'three';
import { Agent, AgentConfig } from './Agent';
import { Vehicle } from './Vehicle';
import { AgentType, Lot } from '../types';

// Behavior states for residents
export enum ResidentState {
    SLEEPING = 'sleeping',
    WAKING_UP = 'waking_up',
    IDLE_HOME = 'idle_home',
    EATING = 'eating',
    WALKING_TO_CAR = 'walking_to_car',
    DRIVING = 'driving',
    WALKING_HOME = 'walking_home',
    WALKING_AROUND = 'walking_around',
    WORKING = 'working',
    SHOPPING = 'shopping',
    AT_BAR = 'at_bar',
    SOCIALIZING = 'socializing',
    AT_CHURCH = 'at_church',
}

// When does this person prefer to wake/sleep
export enum Chronotype {
    EARLY_BIRD = 'early_bird',     // 5-6am wake, 9-10pm sleep
    NORMAL = 'normal',             // 7-8am wake, 10-11pm sleep
    NIGHT_OWL = 'night_owl',       // 9-10am wake, midnight-1am sleep
}

// What kind of work schedule do they have
export enum WorkSchedule {
    UNEMPLOYED = 'unemployed',
    RETIRED = 'retired',
    DAY_SHIFT = 'day_shift',       // 8am-5pm
    LATE_SHIFT = 'late_shift',     // 2pm-10pm
    NIGHT_SHIFT = 'night_shift',   // 10pm-6am
    FREELANCE = 'freelance',       // Random hours
    PART_TIME = 'part_time',       // Few hours here and there
}

// General lifestyle preferences
export enum Lifestyle {
    HOMEBODY = 'homebody',         // Rarely leaves home
    BALANCED = 'balanced',         // Normal mix
    SOCIAL_BUTTERFLY = 'social_butterfly', // Always out and about
    WORKAHOLIC = 'workaholic',     // Work-focused
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

    // Core personality traits (0-1)
    sociability: number;      // How often they seek social interaction
    adventurous: number;      // How far they roam, try new things
    religiosity: number;      // How likely to attend church
    drinkingHabit: number;    // How often they visit the bar (0 = never, 1 = daily)

    // Schedule personality
    chronotype: Chronotype;
    workSchedule: WorkSchedule;
    lifestyle: Lifestyle;

    // Timing variation (0-1) - how much their schedule varies day to day
    routineVariation: number;

    // Derived schedule times (in hours, with decimals for minutes)
    wakeTime: number;         // e.g., 7.5 = 7:30am
    sleepTime: number;        // e.g., 22.5 = 10:30pm
    workStartTime?: number;   // If employed
    workEndTime?: number;
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
    scheduleOverride: boolean = false;
    allowedLots: number[] = [];

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
        // 3D (x, y, z) → SVG (x, y): svgX = position.x, svgY = position.z
        const svgX = this.position.x;
        const svgY = this.position.z;

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
        // If in car, sync position with car
        if (this.isInCar && this.data.car) {
            this.position.copy(this.data.car.position);
        } else {
            super.update(delta);
        }

        // Update home status based on current position
        this.updateHomeStatus();

        // Behavior state machine
        this.updateBehavior(delta);
    }

    private updateBehavior(delta: number) {
        if (this.scheduleOverride) {
            return;
        }
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
            // SVG → 3D: (x, height, y)
            this.setTargetPosition(new THREE.Vector3(centerX, 2, centerY));
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

        // Generate chronotype with age bias (older = earlier riser)
        const chronotypeRoll = Math.random() + (age > 60 ? 0.3 : 0) - (age < 30 ? 0.2 : 0);
        const chronotype = chronotypeRoll > 0.7 ? Chronotype.EARLY_BIRD :
                          chronotypeRoll < 0.3 ? Chronotype.NIGHT_OWL : Chronotype.NORMAL;

        // Generate work schedule based on occupation and age
        let workSchedule: WorkSchedule;
        if (age >= 65 || occupation === 'Retired') {
            workSchedule = WorkSchedule.RETIRED;
        } else if (occupation === 'Unemployed') {
            workSchedule = WorkSchedule.UNEMPLOYED;
        } else if (occupation === 'Bartender') {
            workSchedule = WorkSchedule.LATE_SHIFT;
        } else if (occupation === 'Remote Worker' || occupation === 'Artist' || occupation === 'Writer') {
            workSchedule = WorkSchedule.FREELANCE;
        } else if (Math.random() < 0.15) {
            workSchedule = WorkSchedule.PART_TIME;
        } else {
            workSchedule = WorkSchedule.DAY_SHIFT;
        }

        // Generate lifestyle
        const lifestyleRoll = Math.random();
        const lifestyle = lifestyleRoll < 0.25 ? Lifestyle.HOMEBODY :
                         lifestyleRoll < 0.5 ? Lifestyle.SOCIAL_BUTTERFLY :
                         lifestyleRoll < 0.65 ? Lifestyle.WORKAHOLIC : Lifestyle.BALANCED;

        // Calculate wake/sleep times based on chronotype with individual variation
        const variation = () => (Math.random() - 0.5) * 1.5; // +/- 45 minutes
        let wakeTime: number, sleepTime: number;
        switch (chronotype) {
            case Chronotype.EARLY_BIRD:
                wakeTime = 5.5 + variation();
                sleepTime = 21 + variation();
                break;
            case Chronotype.NIGHT_OWL:
                wakeTime = 9.5 + variation();
                sleepTime = 24.5 + variation(); // 12:30am
                break;
            default: // NORMAL
                wakeTime = 7 + variation();
                sleepTime = 22.5 + variation();
        }

        // Calculate work times based on schedule
        let workStartTime: number | undefined;
        let workEndTime: number | undefined;
        switch (workSchedule) {
            case WorkSchedule.DAY_SHIFT:
                workStartTime = 8 + variation() * 0.5;
                workEndTime = 17 + variation() * 0.5;
                break;
            case WorkSchedule.LATE_SHIFT:
                workStartTime = 14 + variation() * 0.5;
                workEndTime = 22 + variation() * 0.5;
                break;
            case WorkSchedule.NIGHT_SHIFT:
                workStartTime = 22 + variation() * 0.5;
                workEndTime = 6 + variation() * 0.5;
                break;
            case WorkSchedule.FREELANCE:
                // Random work blocks
                workStartTime = 10 + Math.random() * 4;
                workEndTime = workStartTime + 3 + Math.random() * 4;
                break;
            case WorkSchedule.PART_TIME:
                workStartTime = 9 + Math.random() * 6;
                workEndTime = workStartTime + 3 + Math.random() * 2;
                break;
        }

        // Drinking habit based on age and lifestyle
        let drinkingHabit = Math.random() * 0.5;
        if (lifestyle === Lifestyle.SOCIAL_BUTTERFLY) drinkingHabit += 0.3;
        if (age < 25) drinkingHabit += 0.2;
        if (age > 70) drinkingHabit -= 0.2;
        drinkingHabit = Math.max(0, Math.min(1, drinkingHabit));

        // Religiosity (higher for older, lower for young)
        let religiosity = Math.random() * 0.6;
        if (age > 55) religiosity += 0.25;
        if (age < 30) religiosity -= 0.15;
        religiosity = Math.max(0, Math.min(1, religiosity));

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
            religiosity,
            drinkingHabit,
            chronotype,
            workSchedule,
            lifestyle,
            routineVariation: 0.1 + Math.random() * 0.4, // 10-50% daily variation
            wakeTime,
            sleepTime,
            workStartTime,
            workEndTime,
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
