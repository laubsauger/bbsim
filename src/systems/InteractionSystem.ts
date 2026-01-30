import * as THREE from 'three';
import { Lot, LotState, AgentType } from '../types';
import { Inspector } from '../ui/Inspector';

export class InteractionSystem {
    raycaster: THREE.Raycaster;
    pointer: THREE.Vector2;
    camera: THREE.Camera;

    inspector: Inspector;
    scene: THREE.Scene;
    pathLine?: THREE.Line;
    tooltip: HTMLDivElement;

    constructor(camera: THREE.Camera, scene: THREE.Scene) {
        this.camera = camera;
        this.scene = scene;
        this.raycaster = new THREE.Raycaster();
        this.pointer = new THREE.Vector2();
        this.inspector = new Inspector();

        // Create Tooltip
        this.tooltip = document.createElement('div');
        this.tooltip.style.position = 'absolute';
        this.tooltip.style.padding = '8px 12px';
        this.tooltip.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        this.tooltip.style.color = '#fff';
        this.tooltip.style.borderRadius = '4px';
        this.tooltip.style.fontFamily = 'monospace';
        this.tooltip.style.fontSize = '12px';
        this.tooltip.style.pointerEvents = 'none'; // Click through
        this.tooltip.style.display = 'none';
        this.tooltip.style.zIndex = '1000';
        this.tooltip.style.maxWidth = '200px';
        this.tooltip.style.border = '1px solid #444';
        document.body.appendChild(this.tooltip);

        this.initEvents();
    }

    initEvents() {
        window.addEventListener('mousemove', (event) => {
            // Update pointer
            this.pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
            this.pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;

            // Update tooltip position
            const x = event.clientX + 15;
            const y = event.clientY + 15;

            this.tooltip.style.left = x + 'px';
            this.tooltip.style.top = y + 'px';
        });

        window.addEventListener('click', (event) => {
            if (event.target !== document.body && event.target !== document.querySelector('canvas')) return;

            const intersects = this.raycaster.intersectObjects(this.lastObjects, true);
            if (intersects.length > 0) {
                // Find first meaningful object
                let hit = null;
                for (const i of intersects) {
                    let obj = i.object;
                    while (obj && (!obj.userData || !obj.userData.type) && obj.parent) {
                        obj = obj.parent;
                    }
                    if (obj && obj.userData && obj.userData.type) {
                        hit = obj;
                        break;
                    }
                }

                if (hit) {
                    this.inspector.show(hit.userData);
                    // Visualize Path if agent
                    if (hit.userData.type === 'agent' || hit.userData.type === 'vehicle') {
                        this.showAgentPath(hit.userData.data);
                    } else {
                        this.clearPath();
                    }
                } else {
                    this.inspector.hide();
                    this.clearPath();
                }
            } else {
                this.inspector.hide();
                this.clearPath();
            }
        });
    }

    lastObjects: THREE.Object3D[] = [];

    update(objects: THREE.Object3D[]) {
        this.lastObjects = objects;
        this.raycaster.setFromCamera(this.pointer, this.camera);

        const intersects = this.raycaster.intersectObjects(objects, true); // Recursive

        if (intersects.length > 0) {
            // Existing tooltip logic...
            // Simplify for brevity or keep existing?
            // Keeping existing logic mostly but just show hover info.
            const hits: string[] = [];
            const seen = new Set<string>();

            // Collect unique meaningful hits
            for (const intersect of intersects) {
                let obj = intersect.object;

                // Traverse up to find userData if not on leaf
                while (obj && (!obj.userData || !obj.userData.type) && obj.parent) {
                    obj = obj.parent;
                }

                if (obj && obj.userData && obj.userData.type) {
                    const id = obj.uuid;
                    if (seen.has(id)) continue;
                    seen.add(id);

                    const data = obj.userData;
                    if (data.type === 'lot') {
                        const lot = data.data as Lot;
                        hits.push(`
                            <div style="margin-bottom: 4px; border-bottom: 1px solid #444; padding-bottom: 2px;">
                                <strong style="color: #4db8ff">LOT #${lot.id}</strong><br>
                                State: <span style="color: ${this.getStateColor(lot.state)}">${lot.state}</span><br>
                                Usage: ${lot.usage || 'N/A'}
                            </div>
                        `);
                    } else if (data.type === 'vehicle') {
                        const vehicle = data.data;
                        hits.push(`
                            <div style="margin-bottom: 4px; border-bottom: 1px solid #444; padding-bottom: 2px;">
                                <strong style="color: #E85050">🚗 VEHICLE</strong><br>
                                ID: ${vehicle.id}<br>
                                Speed: ${Math.round(vehicle.speed)}
                            </div>
                        `);
                    } else if (data.type === 'agent') {
                        const agent = data.data;
                        const typeInfo = this.getAgentTypeInfo(agent.type);
                        hits.push(`
                            <div style="margin-bottom: 4px; border-bottom: 1px solid #444; padding-bottom: 2px;">
                                <strong style="color: ${typeInfo.color}">${typeInfo.label}</strong><br>
                                ID: ${agent.id}<br>
                                Speed: ${Math.round(agent.speed)}
                            </div>
                        `);
                    }
                }
                if (hits.length >= 3) break; // Limit stack depth
            }

            if (hits.length > 0) {
                this.tooltip.innerHTML = hits[0];
                this.tooltip.style.display = 'block';
            } else {
                this.tooltip.style.display = 'none';
            }
        } else {
            this.tooltip.style.display = 'none';
        }

        // update path line if visible
        // (Optional: update line positions if agent moves)
    }

    showAgentPath(agent: any) {
        this.clearPath();
        if (!agent.path || agent.path.length === 0) return;

        const points = [agent.mesh.position.clone(), ...agent.path];
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({ color: 0xffff00 });
        this.pathLine = new THREE.Line(geometry, material);
        // Lift slightly above ground/road
        this.pathLine.position.y = 1.5;
        this.scene.add(this.pathLine);
    }

    clearPath() {
        if (this.pathLine) {
            this.scene.remove(this.pathLine);
            this.pathLine.geometry.dispose();
            this.pathLine = undefined;
        }
    }

    // ... helper methods
    getStateColor(state: LotState): string {
        switch (state) {
            case LotState.OCCUPIED: return '#88cc88';
            case LotState.ABANDONED: return '#cc8888';
            case LotState.FOR_SALE: return '#8888cc';
            default: return '#cccccc';
        }
    }

    getAgentTypeInfo(type: AgentType): { label: string; color: string } {
        switch (type) {
            case AgentType.RESIDENT:
                return { label: '🏠 RESIDENT', color: '#50C878' };
            case AgentType.TOURIST:
                return { label: '📷 TOURIST', color: '#FFB347' };
            case AgentType.COP:
                return { label: '👮 POLICE', color: '#5B8DEE' };
            case AgentType.DOG:
                return { label: '🐕 DOG', color: '#CD853F' };
            case AgentType.CAT:
                return { label: '🐈 CAT', color: '#E8E8E8' };
            default:
                return { label: 'UNKNOWN', color: '#888888' };
        }
    }
}

