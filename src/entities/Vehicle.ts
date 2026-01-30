import { Agent, AgentConfig } from "./Agent";
import * as THREE from 'three';

// Vehicle colors for variety
const VEHICLE_COLORS = [
    0xCC3333, // Red
    0x3366CC, // Blue
    0x339933, // Green
    0xFFFFFF, // White
    0x333333, // Black
    0xCC9933, // Gold/tan
    0x666666, // Gray
];

const TOURIST_CAR_COLORS = [
    0xFF6B6B, // Coral red
    0x4ECDC4, // Teal
    0xFFE66D, // Yellow
    0x95E1D3, // Mint
];

export class Vehicle extends Agent {
    isTouristCar: boolean = false;
    driver: Agent | null = null;
    passengers: Agent[] = [];
    carGroup: THREE.Group;
    driverSeat: THREE.Mesh | null = null;
    passengerSeats: THREE.Mesh[] = [];

    constructor(config: AgentConfig, isTourist: boolean = false) {
        super({ ...config, speed: config.speed * 2 }); // Cars are faster

        this.isTouristCar = isTourist;
        this.rotationSpeed = 2.5;

        // Create car group
        this.carGroup = new THREE.Group();

        // Remove default mesh from scene management - we'll use the group
        this.mesh.geometry.dispose();

        // Car body dimensions
        const bodyWidth = 7;
        const bodyHeight = 4;
        const bodyLength = 14;

        // Car body (lower part)
        const bodyColor = isTourist
            ? TOURIST_CAR_COLORS[Math.floor(Math.random() * TOURIST_CAR_COLORS.length)]
            : (config.color || VEHICLE_COLORS[Math.floor(Math.random() * VEHICLE_COLORS.length)]);

        const bodyGeo = new THREE.BoxGeometry(bodyWidth, bodyHeight, bodyLength);
        const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor });
        const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
        bodyMesh.position.y = bodyHeight / 2;
        bodyMesh.castShadow = true;
        this.carGroup.add(bodyMesh);

        // Interior (darker, visible from above)
        const interiorGeo = new THREE.BoxGeometry(bodyWidth - 1, 1, bodyLength - 2);
        const interiorMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
        const interiorMesh = new THREE.Mesh(interiorGeo, interiorMat);
        interiorMesh.position.y = bodyHeight - 0.5;
        this.carGroup.add(interiorMesh);

        // Driver seat position (visible person)
        const seatGeo = new THREE.CylinderGeometry(1.2, 1.2, 3, 8);
        const driverColor = isTourist ? 0xFFAA33 : 0x22CC66; // Orange for tourist, green for resident
        const seatMat = new THREE.MeshStandardMaterial({ color: driverColor });
        this.driverSeat = new THREE.Mesh(seatGeo, seatMat);
        this.driverSeat.position.set(1.5, bodyHeight + 1.5, 2);
        this.driverSeat.visible = false; // Hidden until driver enters
        this.carGroup.add(this.driverSeat);

        // Passenger seat
        const passengerSeat = new THREE.Mesh(seatGeo.clone(), seatMat.clone());
        passengerSeat.position.set(-1.5, bodyHeight + 1.5, 2);
        passengerSeat.visible = false;
        this.passengerSeats.push(passengerSeat);
        this.carGroup.add(passengerSeat);

        // Back seats
        const backSeat1 = new THREE.Mesh(seatGeo.clone(), seatMat.clone());
        backSeat1.position.set(1.5, bodyHeight + 1.5, -3);
        backSeat1.visible = false;
        this.passengerSeats.push(backSeat1);
        this.carGroup.add(backSeat1);

        const backSeat2 = new THREE.Mesh(seatGeo.clone(), seatMat.clone());
        backSeat2.position.set(-1.5, bodyHeight + 1.5, -3);
        backSeat2.visible = false;
        this.passengerSeats.push(backSeat2);
        this.carGroup.add(backSeat2);

        // Use group as the main mesh for positioning
        this.mesh = bodyMesh; // Keep reference for raycasting
        this.meshHeight = bodyHeight;

        // Override userData
        this.mesh.userData = { type: 'vehicle', data: this };
        this.mesh.name = `${isTourist ? 'Tourist' : 'Resident'} Vehicle ${this.id}`;

        this.updateMesh();
    }

    setDriver(driver: Agent | null) {
        this.driver = driver;
        if (this.driverSeat) {
            this.driverSeat.visible = driver !== null;
        }
    }

    addPassenger(passenger: Agent): boolean {
        for (let i = 0; i < this.passengerSeats.length; i++) {
            if (!this.passengerSeats[i].visible) {
                this.passengers.push(passenger);
                this.passengerSeats[i].visible = true;
                return true;
            }
        }
        return false; // No room
    }

    removePassenger(passenger: Agent) {
        const idx = this.passengers.indexOf(passenger);
        if (idx >= 0) {
            this.passengers.splice(idx, 1);
            if (this.passengerSeats[idx]) {
                this.passengerSeats[idx].visible = false;
            }
        }
    }

    updateMesh() {
        // Position the car group
        this.carGroup.position.set(
            this.position.x,
            this.position.y,
            this.position.z
        );
        this.carGroup.rotation.y = this.mesh.rotation.y;
    }
}
