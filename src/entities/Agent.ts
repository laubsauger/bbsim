import * as THREE from 'three';

import { AgentType } from '../types';

// Terrain heights (must match WorldRenderer)
export const TERRAIN_HEIGHT = {
    ROAD: 1,
    LOT: 2,
};

export interface AgentConfig {
    id: string;
    type: AgentType;
    position: THREE.Vector3;
    speed: number;
    color?: number; // Optional override
}

export class Agent {
    id: string;
    type: AgentType;
    position: THREE.Vector3;
    target: THREE.Vector3 | null = null;
    speed: number;
    currentSpeed: number = 0; // Actual current speed (for acceleration)
    speedModifier: number = 1; // Dynamic speed scaling (collision avoidance, etc.)
    mesh: THREE.Mesh;
    meshHeight: number; // Store height for Y offset calculation
    recentPath: THREE.Vector3[] = []; // Buffer for recent movement history
    path: THREE.Vector3[] = []; // Future path from pathfinding
    targetRotation: number = 0; // Target Y rotation
    rotationSpeed: number = 5; // How fast to turn (radians per second)

    constructor(config: AgentConfig) {
        this.id = config.id;
        this.type = config.type;
        this.position = config.position.clone();
        this.speed = config.speed;

        // Visuals based on Type - scaled to fit roads (~19 units wide)
        let width = 4, height = 10, depth = 4;
        let color = config.color || 0x00ff00;

        switch (this.type) {
            case AgentType.RESIDENT:
                color = config.color || 0x22CC66; // Brighter green
                break;
            case AgentType.TOURIST:
                color = config.color || 0xFFAA33; // Orange
                break;
            case AgentType.COP:
                color = config.color || 0x3366FF; // Bright blue
                break;
            case AgentType.DOG:
                width = 3; height = 4; depth = 5;
                color = config.color || 0xA0522D; // Sienna brown
                break;
            case AgentType.CAT:
                width = 2; height = 3; depth = 3;
                color = config.color || 0xF5F5F5; // Off-white
                break;
        }

        this.meshHeight = height;

        const geometry = new THREE.BoxGeometry(width, height, depth);
        const material = new THREE.MeshStandardMaterial({ color });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.castShadow = true;

        // DATA FOR RAYCASTER
        // Pass 'this' as data to access recentPath, etc.
        this.mesh.userData = { type: 'agent', data: this };
        this.mesh.name = `${this.type} ${this.id}`;

        this.updateMesh();
    }

    update(delta: number) {
        if (this.target) {
            // Track history periodically
            if (this.recentPath.length === 0 || this.position.distanceTo(this.recentPath[this.recentPath.length - 1]) > 5) {
                this.recentPath.push(this.position.clone());
                if (this.recentPath.length > 50) this.recentPath.shift();
            }

            const direction = new THREE.Vector3().subVectors(this.target, this.position);
            direction.y = 0; // Keep movement horizontal
            const dist = direction.length();

            if (dist < 2) {
                this.position.copy(this.target);
                this.target = null;
                this.currentSpeed = Math.max(0, this.currentSpeed - this.speed * 2 * delta); // Decelerate
            } else {
                // Calculate target rotation based on movement direction
                this.targetRotation = Math.atan2(direction.x, direction.z);

                // Smoothly interpolate rotation
                let rotationDiff = this.targetRotation - this.mesh.rotation.y;
                // Normalize to -PI to PI
                while (rotationDiff > Math.PI) rotationDiff -= Math.PI * 2;
                while (rotationDiff < -Math.PI) rotationDiff += Math.PI * 2;

                this.mesh.rotation.y += rotationDiff * Math.min(1, this.rotationSpeed * delta);

                const targetSpeed = this.speed * this.speedModifier;
                // Accelerate toward target speed
                this.currentSpeed = Math.min(targetSpeed, this.currentSpeed + this.speed * 2 * delta * this.speedModifier);

                // Move forward
                direction.normalize();
                this.position.add(direction.multiplyScalar(this.currentSpeed * delta));
            }
            this.updateMesh();
        } else {
            // No target - decelerate
            this.currentSpeed = Math.max(0, this.currentSpeed - this.speed * 3 * delta);
        }

        // Reset per-frame modifier (systems can reapply each tick)
        this.speedModifier = 1;
    }

    updateMesh() {
        // Position mesh so bottom sits on terrain (position.y is terrain height)
        this.mesh.position.set(
            this.position.x,
            this.position.y + this.meshHeight / 2, // Offset by half height so bottom is at terrain
            this.position.z
        );
    }
}
