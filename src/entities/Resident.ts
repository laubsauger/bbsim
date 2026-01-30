import * as THREE from 'three';
import { Agent, AgentConfig } from './Agent';
import { Vehicle } from './Vehicle';
import { AgentType, Lot } from '../types';

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

export class Resident extends Agent {
    data: ResidentData;
    isHome: boolean = true;
    isInCar: boolean = false;

    constructor(config: AgentConfig, data: ResidentData) {
        super(config);
        this.data = data;

        // Update mesh userData
        this.mesh.userData = { type: 'resident', data: this };
        this.mesh.name = `${data.firstName} ${data.lastName}`;
    }

    get fullName(): string {
        return `${this.data.firstName} ${this.data.lastName}`;
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
