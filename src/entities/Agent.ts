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

    // Pre-allocated vectors for update() to avoid GC pressure
    protected _direction: THREE.Vector3 = new THREE.Vector3();

    constructor(config: AgentConfig) {
        this.id = config.id;
        this.type = config.type;
        this.position = config.position.clone();
        this.speed = config.speed;

        // Visuals based on Type - scaled to fit roads (~67 units wide)
        let width = 4, height = 10, depth = 4;
        let color = config.color || 0x00ff00;
        const agentScale = 1.25;

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

        width *= agentScale;
        height *= agentScale;
        depth *= agentScale;

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

            this._direction.subVectors(this.target, this.position);
            this._direction.y = 0; // Keep movement horizontal
            const dist = this._direction.length();

            if (dist < 1.0) { // Tighter acceptance radius to hit nodes precisely
                this.position.copy(this.target);
                this.target = null;
                this.currentSpeed = 0; // Stop on arrival to allow next-target turn
            } else {
                // Calculate target rotation based on movement direction
                this.targetRotation = Math.atan2(this._direction.x, this._direction.z);

                // Smoothly interpolate rotation
                let rotationDiff = this.targetRotation - this.mesh.rotation.y;
                // Normalize to -PI to PI
                while (rotationDiff > Math.PI) rotationDiff -= Math.PI * 2;
                while (rotationDiff < -Math.PI) rotationDiff += Math.PI * 2;

                const turnStep = rotationDiff * Math.min(1, this.rotationSpeed * delta);
                this.mesh.rotation.y += turnStep;

                // --- ROTATE THEN MOVE LOGIC ---
                // Only move if we are roughly facing the target (within ~30 degrees)
                // This forces the agent to turn in place (or very slowly) at corners
                const isFacing = Math.abs(rotationDiff) < 0.5;

                const targetSpeed = isFacing ? this.speed * this.speedModifier : this.speed * 0.1;

                // Accelerate toward target speed
                const acc = this.speed * 4 * delta;
                if (this.currentSpeed < targetSpeed) {
                    this.currentSpeed = Math.min(targetSpeed, this.currentSpeed + acc);
                } else {
                    this.currentSpeed = Math.max(targetSpeed, this.currentSpeed - acc);
                }

                // Move forward only if we have speed
                if (this.currentSpeed > 0.01) {
                    this._direction.normalize();
                    this.position.add(this._direction.multiplyScalar(this.currentSpeed * delta));
                }
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
