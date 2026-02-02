import { Agent, AgentConfig } from "./Agent";
import { AgentType } from '../types';
import * as THREE from 'three';

// Consistent car colors by owner type
const CAR_COLORS = {
    resident: 0xCC3333,  // Red - resident cars
    tourist: 0x4ECDC4,   // Teal - tourist cars
    police: 0x5B8DEE,    // Blue - police cars
};
const VEHICLE_SCALE = 1.6;

export class Vehicle extends Agent {
    isTouristCar: boolean = false;
    isPoliceCar: boolean = false;
    driver: Agent | null = null;
    passengers: Agent[] = [];
    carGroup: THREE.Group;
    driverSeat: THREE.Mesh | null = null;
    passengerSeats: THREE.Mesh[] = [];
    speedModifier: number = 1;

    // Vehicle visualization state
    headlights: THREE.Mesh[] = [];
    taillights: THREE.Mesh[] = [];
    isBraking: boolean = false;

    // Global night state
    static isNight: boolean = false;

    constructor(config: AgentConfig, isTourist: boolean = false) {
        super({ ...config, speed: config.speed * 2 }); // Cars are faster

        this.isTouristCar = isTourist;
        this.isPoliceCar = config.type === AgentType.COP;
        this.rotationSpeed = 2.5;

        // Create car group
        this.carGroup = new THREE.Group();

        // Remove default mesh from scene management - we'll use the group
        this.mesh.geometry.dispose();

        // Car body dimensions
        const bodyWidth = 7 * VEHICLE_SCALE;
        const bodyHeight = 4 * VEHICLE_SCALE;
        const bodyLength = 14 * VEHICLE_SCALE;
        const halfLength = bodyLength / 2;
        const halfWidth = bodyWidth / 2;

        // Car body color based on owner type - consistent colors
        let bodyColor: number;
        if (this.isPoliceCar) {
            bodyColor = CAR_COLORS.police;
        } else if (isTourist) {
            bodyColor = CAR_COLORS.tourist;
        } else {
            bodyColor = CAR_COLORS.resident;
        }

        const bodyGeo = new THREE.BoxGeometry(bodyWidth, bodyHeight, bodyLength);
        const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor });
        const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
        bodyMesh.position.y = bodyHeight / 2;
        bodyMesh.castShadow = true;
        this.carGroup.add(bodyMesh);

        // --- LIGHTS ---

        // Headlights (Front is +Z based on seat setup)
        const hlGeo = new THREE.BoxGeometry(1 * VEHICLE_SCALE, 1 * VEHICLE_SCALE, 0.5 * VEHICLE_SCALE);
        const hlMat = new THREE.MeshStandardMaterial({
            color: 0xffffcc,
            emissive: 0xffffcc,
            emissiveIntensity: 0 // Off by default
        });

        const hlLeft = new THREE.Mesh(hlGeo, hlMat.clone());
        hlLeft.position.set(-halfWidth + 1.5, bodyHeight / 2, halfLength);
        this.carGroup.add(hlLeft);
        this.headlights.push(hlLeft);

        const hlRight = new THREE.Mesh(hlGeo, hlMat.clone());
        hlRight.position.set(halfWidth - 1.5, bodyHeight / 2, halfLength);
        this.carGroup.add(hlRight);
        this.headlights.push(hlRight);

        // Taillights (Rear is -Z)
        const tlGeo = new THREE.BoxGeometry(1 * VEHICLE_SCALE, 1 * VEHICLE_SCALE, 0.5 * VEHICLE_SCALE);
        const tlMat = new THREE.MeshStandardMaterial({
            color: 0x330000, // Dark red when off
            emissive: 0xff0000,
            emissiveIntensity: 0 // Off by default
        });

        const tlLeft = new THREE.Mesh(tlGeo, tlMat.clone());
        tlLeft.position.set(-halfWidth + 1.5, bodyHeight / 2, -halfLength);
        this.carGroup.add(tlLeft);
        this.taillights.push(tlLeft);

        const tlRight = new THREE.Mesh(tlGeo, tlMat.clone());
        tlRight.position.set(halfWidth - 1.5, bodyHeight / 2, -halfLength);
        this.carGroup.add(tlRight);
        this.taillights.push(tlRight);



        // Seat positions (2 front, 2 back) - visible from above as dark cutouts
        const seatPositions = [
            { x: 1.5 * VEHICLE_SCALE, z: 2.5 * VEHICLE_SCALE },    // Driver (front right)
            { x: -1.5 * VEHICLE_SCALE, z: 2.5 * VEHICLE_SCALE },   // Front passenger (front left)
            { x: 1.5 * VEHICLE_SCALE, z: -2 * VEHICLE_SCALE },     // Back right
            { x: -1.5 * VEHICLE_SCALE, z: -2 * VEHICLE_SCALE },    // Back left
        ];

        // Create seat cutouts (dark circles visible from above - empty seats)
        const seatCutoutGeo = new THREE.CylinderGeometry(1.3 * VEHICLE_SCALE, 1.3 * VEHICLE_SCALE, 1 * VEHICLE_SCALE, 12);
        const seatCutoutMat = new THREE.MeshStandardMaterial({
            color: 0x1a1a1a,
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -1
        });

        seatPositions.forEach(pos => {
            const cutout = new THREE.Mesh(seatCutoutGeo, seatCutoutMat);
            cutout.position.set(pos.x, bodyHeight - 0.3, pos.z);
            this.carGroup.add(cutout);
        });

        // Occupant meshes (cylinders representing people sitting in seats)
        const occupantGeo = new THREE.CylinderGeometry(1.1 * VEHICLE_SCALE, 1.1 * VEHICLE_SCALE, 3 * VEHICLE_SCALE, 8);
        // Occupant color matches car type
        let occupantColor: number;
        if (this.isPoliceCar) {
            occupantColor = 0x3366FF; // Blue uniform for police
        } else if (isTourist) {
            occupantColor = 0xFFAA33; // Orange for tourist
        } else {
            occupantColor = 0x22CC66; // Green for resident
        }
        const occupantMat = new THREE.MeshStandardMaterial({ color: occupantColor });

        // Driver seat (position 0)
        this.driverSeat = new THREE.Mesh(occupantGeo, occupantMat);
        this.driverSeat.position.set(seatPositions[0].x, bodyHeight + 1.2 * VEHICLE_SCALE, seatPositions[0].z);
        this.driverSeat.visible = false;
        this.carGroup.add(this.driverSeat);

        // Passenger seats (positions 1, 2, 3)
        for (let i = 1; i < seatPositions.length; i++) {
            const seat = new THREE.Mesh(occupantGeo.clone(), occupantMat.clone());
            seat.position.set(seatPositions[i].x, bodyHeight + 1.2 * VEHICLE_SCALE, seatPositions[i].z);
            seat.visible = false;
            this.passengerSeats.push(seat);
            this.carGroup.add(seat);
        }

        // Use group as the main mesh for positioning
        this.mesh = bodyMesh; // Keep reference for raycasting
        this.meshHeight = bodyHeight;

        // Render Order Logic:
        // Map/Buildings = 0 (Default)
        // TrafficOverlay = 1000 (Transparent, No Depth)
        // Vehicles = 2000 (To draw ON TOP of overlay)
        this.mesh.renderOrder = 2000;
        this.carGroup.renderOrder = 2000;
        // Propagate renderOrder to children
        this.carGroup.traverse((child) => {
            child.renderOrder = 2000;
        });

        // Override userData
        this.mesh.userData = { type: 'vehicle', data: this };
        const ownerType = this.isPoliceCar ? 'Police' : (isTourist ? 'Tourist' : 'Resident');
        this.mesh.name = `${ownerType} Vehicle ${this.id}`;

        this.updateMesh();
    }

    setDriver(driver: Agent | null) {
        this.driver = driver;
        this.updateLightState(); // Update lights when driver enters/leaves
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

    // Update light visibility/intensity based on state
    updateLightState() {
        const lightsOn = Vehicle.isNight && this.driver !== null; // Only on if driven at night

        // Headlights
        const hlIntensity = lightsOn ? 1.0 : 0.0;
        this.headlights.forEach(hl => {
            if (hl.material instanceof THREE.MeshStandardMaterial) {
                hl.material.emissiveIntensity = hlIntensity;
            }
        });



        // Taillights / Brakelights
        // Braking logic: isBraking flag driven by update loop
        // If braking: Bright red (2.0 intensity)
        // If driving but not braking: Dim red (0.5 intensity)
        // If lights off (day/nopark): Off (0 intensity)
        let tlIntensity = 0;
        if (lightsOn) {
            tlIntensity = this.isBraking ? 4.0 : 0.5;
        } else if (this.isBraking && this.driver !== null) {
            // Even in daytime, brakelights show when braking (brighter than off)
            tlIntensity = 2.0;
        }

        this.taillights.forEach(tl => {
            if (tl.material instanceof THREE.MeshStandardMaterial) {
                tl.material.emissiveIntensity = tlIntensity;
            }
        });
    }

    update(delta: number) {
        // Track braking state for visuals
        const prevSpeed = this.currentSpeed;

        if (this.target) {
            // Track history periodically
            if (this.recentPath.length === 0 || this.position.distanceTo(this.recentPath[this.recentPath.length - 1]) > 5) {
                this.recentPath.push(this.position.clone());
                if (this.recentPath.length > 50) this.recentPath.shift();
            }

            // Use inherited pre-allocated vector to avoid GC pressure
            this._direction.subVectors(this.target, this.position);
            this._direction.y = 0; // Keep movement horizontal
            const dist = this._direction.length();

            if (dist < 3) {
                this.position.copy(this.target);
                this.target = null;
                // Braking logic happens here implicitly (speed reduction)
                this.currentSpeed = Math.max(0, this.currentSpeed - this.speed * 2 * delta);
            } else {
                // Calculate target rotation based on movement direction
                this.targetRotation = Math.atan2(this._direction.x, this._direction.z);

                // Accelerate toward target speed (with dynamic modifier)
                const desiredSpeed = this.speed * Math.max(0, Math.min(1, this.speedModifier));
                this.currentSpeed = Math.min(desiredSpeed, this.currentSpeed + this.speed * 2 * delta);

                // Move forward without overshooting the target
                this._direction.normalize();
                const step = Math.min(dist, this.currentSpeed * delta);
                this.position.add(this._direction.multiplyScalar(step));
            }
        } else {
            // No target - decelerate
            this.currentSpeed = Math.max(0, this.currentSpeed - this.speed * 3 * delta);
        }

        // Determine isBraking: true if speed decreased or trying to stop
        this.isBraking = this.currentSpeed < prevSpeed - 0.01; // Tiny threshold

        // Update lights every frame (to catch braking changes and global day/night)
        // Optimization: only if changed? But isNight is global.
        this.updateLightState();

        // Always update mesh (including smooth rotation)
        this.updateMesh(delta);

        // Reset per-frame modifier (PathfindingSystem will reapply)
        this.speedModifier = 1;
    }

    updateMesh(delta?: number) {
        // Guard: carGroup may not exist when super() calls this during construction
        if (!this.carGroup) return;

        // Position the car group - this moves the entire vehicle including body and interior
        this.carGroup.position.set(
            this.position.x,
            this.position.y,
            this.position.z
        );

        // Smoothly interpolate rotation toward target (velocity direction)
        if (delta !== undefined && delta > 0) {
            let rotationDiff = this.targetRotation - this.carGroup.rotation.y;
            // Normalize to -PI to PI
            while (rotationDiff > Math.PI) rotationDiff -= Math.PI * 2;
            while (rotationDiff < -Math.PI) rotationDiff += Math.PI * 2;

            this.carGroup.rotation.y += rotationDiff * Math.min(1, this.rotationSpeed * delta);
        } else {
            // No delta provided (initial setup) - set rotation directly
            this.carGroup.rotation.y = this.targetRotation;
        }

        // Note: Don't modify this.mesh.position separately as it's a CHILD of carGroup
        // The mesh already has its local position set in the constructor (bodyHeight/2)
    }
}
