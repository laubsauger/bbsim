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

export class Vehicle extends Agent {
    constructor(config: AgentConfig) {
        super({ ...config, speed: config.speed * 2 }); // Cars are faster

        // Car visual - sized to fit 2 cars on ~19 unit wide roads
        const vehicleHeight = 6;
        this.mesh.geometry.dispose();
        this.mesh.geometry = new THREE.BoxGeometry(7, vehicleHeight, 14);
        this.meshHeight = vehicleHeight; // Update height for proper Y positioning

        // Random color if not specified
        const color = config.color || VEHICLE_COLORS[Math.floor(Math.random() * VEHICLE_COLORS.length)];
        (this.mesh.material as THREE.MeshStandardMaterial).color.setHex(color);

        // Override userData to identify as vehicle
        this.mesh.userData = { type: 'vehicle', data: { ...config, speed: config.speed * 2 } };
        this.mesh.name = `Vehicle ${this.id}`;

        // Re-update mesh position with correct height
        this.updateMesh();
    }
}
