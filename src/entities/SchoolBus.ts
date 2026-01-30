import { Agent, AgentConfig } from "./Agent";
import { AgentType, VehicleType } from '../types';
import * as THREE from 'three';

// School bus yellow
const BUS_COLOR = 0xFFB800;
const BUS_TRIM_COLOR = 0x1A1A1A;

export class SchoolBus extends Agent {
    vehicleType: VehicleType = VehicleType.SCHOOL_BUS;
    driver: Agent | null = null;
    passengers: Agent[] = [];
    maxPassengers: number = 12; // Can carry up to 12 kids
    busGroup: THREE.Group;
    driverSeat: THREE.Mesh | null = null;
    passengerSeats: THREE.Mesh[] = [];

    // Bus-specific properties
    stopLocations: THREE.Vector3[] = []; // Residential pickup/dropoff points
    currentStopIndex: number = 0;
    isPickingUp: boolean = false; // true = picking up kids, false = dropping off

    constructor(config: AgentConfig) {
        super({ ...config, speed: config.speed * 1.5 }); // Buses are slower than cars

        this.rotationSpeed = 1.5; // Slower turning

        // Create bus group
        this.busGroup = new THREE.Group();

        // Remove default mesh
        this.mesh.geometry.dispose();

        // Bus body dimensions (much larger than cars)
        const bodyWidth = 10;
        const bodyHeight = 8;
        const bodyLength = 30;

        // Main body
        const bodyGeo = new THREE.BoxGeometry(bodyWidth, bodyHeight, bodyLength);
        const bodyMat = new THREE.MeshStandardMaterial({ color: BUS_COLOR });
        const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
        bodyMesh.position.y = bodyHeight / 2;
        bodyMesh.castShadow = true;
        this.busGroup.add(bodyMesh);

        // Black stripe at bottom
        const stripeGeo = new THREE.BoxGeometry(bodyWidth + 0.1, 1.5, bodyLength + 0.1);
        const stripeMat = new THREE.MeshStandardMaterial({ color: BUS_TRIM_COLOR });
        const stripeMesh = new THREE.Mesh(stripeGeo, stripeMat);
        stripeMesh.position.y = 0.75;
        this.busGroup.add(stripeMesh);

        // Roof
        const roofGeo = new THREE.BoxGeometry(bodyWidth - 1, 1, bodyLength - 2);
        const roofMesh = new THREE.Mesh(roofGeo, bodyMat);
        roofMesh.position.y = bodyHeight + 0.5;
        roofMesh.castShadow = true;
        this.busGroup.add(roofMesh);

        // Windows (dark rectangles along sides)
        const windowMat = new THREE.MeshStandardMaterial({ color: 0x2A4A6A });
        const windowsPerSide = 6;
        const windowWidth = 0.3;
        const windowHeight = 2.5;
        const windowLength = 3.5;
        const windowSpacing = bodyLength / (windowsPerSide + 1);

        for (let i = 0; i < windowsPerSide; i++) {
            const zPos = -bodyLength / 2 + windowSpacing * (i + 1);

            // Left side windows
            const leftWindow = new THREE.Mesh(
                new THREE.BoxGeometry(windowWidth, windowHeight, windowLength),
                windowMat
            );
            leftWindow.position.set(-bodyWidth / 2, bodyHeight - 1.5, zPos);
            this.busGroup.add(leftWindow);

            // Right side windows
            const rightWindow = new THREE.Mesh(
                new THREE.BoxGeometry(windowWidth, windowHeight, windowLength),
                windowMat
            );
            rightWindow.position.set(bodyWidth / 2, bodyHeight - 1.5, zPos);
            this.busGroup.add(rightWindow);
        }

        // Front windshield
        const windshieldGeo = new THREE.BoxGeometry(bodyWidth - 2, 3, 0.3);
        const windshieldMesh = new THREE.Mesh(windshieldGeo, windowMat);
        windshieldMesh.position.set(0, bodyHeight - 2, bodyLength / 2);
        this.busGroup.add(windshieldMesh);

        // STOP sign on side (red square)
        const stopSignGeo = new THREE.BoxGeometry(0.2, 2, 2);
        const stopSignMat = new THREE.MeshStandardMaterial({ color: 0xCC0000 });
        const stopSign = new THREE.Mesh(stopSignGeo, stopSignMat);
        stopSign.position.set(-bodyWidth / 2 - 0.1, bodyHeight / 2, 6);
        this.busGroup.add(stopSign);

        // Driver seat visualization
        const occupantGeo = new THREE.CylinderGeometry(1.2, 1.2, 3, 8);
        const driverMat = new THREE.MeshStandardMaterial({ color: 0x333366 }); // Dark blue uniform
        this.driverSeat = new THREE.Mesh(occupantGeo, driverMat);
        this.driverSeat.position.set(2, bodyHeight + 1, bodyLength / 2 - 3);
        this.driverSeat.visible = true; // Driver always visible
        this.busGroup.add(this.driverSeat);

        // Passenger seat positions (3 rows of 4)
        const passengerMat = new THREE.MeshStandardMaterial({ color: 0x4488AA }); // Light blue for kids
        const passengerGeo = new THREE.CylinderGeometry(0.8, 0.8, 2, 6);
        const rows = 3;
        const seatsPerRow = 4;
        for (let row = 0; row < rows; row++) {
            for (let seat = 0; seat < seatsPerRow; seat++) {
                const seatMesh = new THREE.Mesh(passengerGeo.clone(), passengerMat.clone());
                const xPos = -3 + seat * 2;
                const zPos = bodyLength / 2 - 8 - row * 5;
                seatMesh.position.set(xPos, bodyHeight + 0.5, zPos);
                seatMesh.visible = false;
                this.passengerSeats.push(seatMesh);
                this.busGroup.add(seatMesh);
            }
        }

        // Use group as main reference
        this.mesh = bodyMesh;
        this.meshHeight = bodyHeight;

        this.mesh.userData = { type: 'vehicle', vehicleType: 'school_bus', data: this };
        this.mesh.name = `School Bus ${this.id}`;

        this.updateMesh();
    }

    setDriver(driver: Agent | null) {
        this.driver = driver;
        if (this.driverSeat) {
            this.driverSeat.visible = driver !== null;
        }
    }

    addPassenger(passenger: Agent): boolean {
        if (this.passengers.length >= this.maxPassengers) return false;

        this.passengers.push(passenger);
        // Show the next available seat
        if (this.passengers.length <= this.passengerSeats.length) {
            this.passengerSeats[this.passengers.length - 1].visible = true;
        }
        return true;
    }

    removePassenger(passenger: Agent): boolean {
        const idx = this.passengers.indexOf(passenger);
        if (idx >= 0) {
            this.passengers.splice(idx, 1);
            // Update visible seats
            this.passengerSeats.forEach((seat, i) => {
                seat.visible = i < this.passengers.length;
            });
            return true;
        }
        return false;
    }

    removeAllPassengers(): Agent[] {
        const removed = [...this.passengers];
        this.passengers = [];
        this.passengerSeats.forEach(seat => seat.visible = false);
        return removed;
    }

    getPassengerCount(): number {
        return this.passengers.length;
    }

    hasRoom(): boolean {
        return this.passengers.length < this.maxPassengers;
    }

    // Set bus route stops
    setStops(stops: THREE.Vector3[]) {
        this.stopLocations = stops;
        this.currentStopIndex = 0;
    }

    getNextStop(): THREE.Vector3 | null {
        if (this.currentStopIndex < this.stopLocations.length) {
            return this.stopLocations[this.currentStopIndex];
        }
        return null;
    }

    advanceToNextStop() {
        this.currentStopIndex++;
    }

    resetStops() {
        this.currentStopIndex = 0;
    }

    update(delta: number) {
        if (this.target) {
            // Track history
            if (this.recentPath.length === 0 || this.position.distanceTo(this.recentPath[this.recentPath.length - 1]) > 10) {
                this.recentPath.push(this.position.clone());
                if (this.recentPath.length > 50) this.recentPath.shift();
            }

            const direction = new THREE.Vector3().subVectors(this.target, this.position);
            direction.y = 0;
            const dist = direction.length();

            if (dist < 5) { // Larger stopping distance for bus
                this.position.copy(this.target);
                this.target = null;
                this.currentSpeed = Math.max(0, this.currentSpeed - this.speed * 1.5 * delta);
            } else {
                this.targetRotation = Math.atan2(direction.x, direction.z);
                this.currentSpeed = Math.min(this.speed, this.currentSpeed + this.speed * 1.2 * delta);
                direction.normalize();
                this.position.add(direction.multiplyScalar(this.currentSpeed * delta));
            }
        } else {
            this.currentSpeed = Math.max(0, this.currentSpeed - this.speed * 2 * delta);
        }

        this.updateMesh(delta);
    }

    updateMesh(delta?: number) {
        if (!this.busGroup) return;

        this.busGroup.position.set(
            this.position.x,
            this.position.y,
            this.position.z
        );

        if (delta !== undefined && delta > 0) {
            let rotationDiff = this.targetRotation - this.busGroup.rotation.y;
            while (rotationDiff > Math.PI) rotationDiff -= Math.PI * 2;
            while (rotationDiff < -Math.PI) rotationDiff += Math.PI * 2;
            this.busGroup.rotation.y += rotationDiff * Math.min(1, this.rotationSpeed * delta);
        } else {
            this.busGroup.rotation.y = this.targetRotation;
        }
    }
}
