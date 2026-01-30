import * as THREE from 'three';
import { Lot, LotState, AgentType } from '../types';
import { ExplorerEntityRef } from '../ui/EntityExplorer';

export type FollowCallback = (target: THREE.Object3D | null, entity: ExplorerEntityRef | null) => void;
export type SelectCallback = (entity: ExplorerEntityRef | null) => void;

// Consistent colors matching WorldRenderer
const LOT_STATE_COLORS = {
    occupied: '#5A8A6A',    // Green - matches WorldRenderer occupied
    abandoned: '#8A6A6A',   // Dusty rose - matches WorldRenderer abandoned
    forSale: '#5A6A8A',     // Blue-gray - matches WorldRenderer forSale
    empty: '#6A6A6A',       // Gray - matches WorldRenderer empty
    away: '#7A9A7A',        // Lighter green for away
};

// Car colors for tooltip display
const CAR_COLORS = {
    resident: '#CC3333',    // Red - resident cars
    tourist: '#4ECDC4',     // Teal - tourist cars
    police: '#5B8DEE',      // Blue - police cars
};

export class InteractionSystem {
    raycaster: THREE.Raycaster;
    pointer: THREE.Vector2;
    camera: THREE.Camera;

    scene: THREE.Scene;
    pathLine?: THREE.Line;
    pathLines: THREE.Line[] = [];
    tooltip: HTMLDivElement;

    private onFollowCallbacks: FollowCallback[] = [];
    private onSelectCallbacks: SelectCallback[] = [];
    private isOverUI: boolean = false;

    constructor(camera: THREE.Camera, scene: THREE.Scene) {
        this.camera = camera;
        this.scene = scene;
        this.raycaster = new THREE.Raycaster();
        this.pointer = new THREE.Vector2();

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
            // Check if mouse is over a UI element (not the canvas or body)
            const target = event.target as HTMLElement;
            const canvas = document.querySelector('canvas');
            this.isOverUI = target !== canvas && target !== document.body;

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
                    this.selectEntity(hit.userData);
                } else {
                    this.selectEntity(null);
                }
            } else {
                this.selectEntity(null);
            }
        });
    }

    lastObjects: THREE.Object3D[] = [];

    update(objects: THREE.Object3D[]) {
        this.lastObjects = objects;

        // Hide tooltip if mouse is over UI panels
        if (this.isOverUI) {
            this.tooltip.style.display = 'none';
            return;
        }

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
                        const addressStr = lot.address ? lot.address.fullAddress : `Lot #${lot.id}`;
                        hits.push(`
                            <div style="margin-bottom: 4px; border-bottom: 1px solid #444; padding-bottom: 2px;">
                                <strong style="color: #4db8ff">📍 ${addressStr}</strong><br>
                                State: <span style="color: ${this.getStateColor(lot.state)}">${lot.state}</span><br>
                                Usage: ${lot.usage || 'N/A'}
                            </div>
                        `);
                    } else if (data.type === 'vehicle') {
                        const vehicle = data.data;
                        const isPoliceCar = vehicle.isPoliceCar;
                        const isTourist = vehicle.isTouristCar;
                        const hasDriver = vehicle.driver !== null;
                        let carColor: string;
                        let carLabel: string;
                        if (isPoliceCar) {
                            carColor = CAR_COLORS.police;
                            carLabel = '🚔 POLICE CAR';
                        } else if (isTourist) {
                            carColor = CAR_COLORS.tourist;
                            carLabel = '🚗 TOURIST CAR';
                        } else {
                            carColor = CAR_COLORS.resident;
                            carLabel = '🚗 RESIDENT CAR';
                        }
                        hits.push(`
                            <div style="margin-bottom: 4px; border-bottom: 1px solid #444; padding-bottom: 2px;">
                                <strong style="color: ${carColor}">${carLabel}</strong><br>
                                ${hasDriver ? `Driver: ${vehicle.driver.fullName || vehicle.driver.id}` : 'Parked'}<br>
                                Speed: ${Math.round(vehicle.currentSpeed || 0)}/${Math.round(vehicle.speed)}
                            </div>
                        `);
                    } else if (data.type === 'resident') {
                        const resident = data.data;
                        hits.push(`
                            <div style="margin-bottom: 4px; border-bottom: 1px solid #444; padding-bottom: 2px;">
                                <strong style="color: #50C878">🏠 ${resident.fullName}</strong><br>
                                Age: ${resident.data.age} | ${resident.data.occupation}<br>
                                <span style="color: #aaa">📍 ${resident.address}</span><br>
                                ${resident.data.hasCar ? '🚗 Has car' : '🚶 No car'} | ${resident.isHome ? 'At home' : 'Out'}
                            </div>
                        `);
                    } else if (data.type === 'tourist') {
                        const tourist = data.data;
                        hits.push(`
                            <div style="margin-bottom: 4px; border-bottom: 1px solid #444; padding-bottom: 2px;">
                                <strong style="color: #FFB347">📷 TOURIST</strong><br>
                                ID: ${tourist.id}<br>
                                ${tourist.data?.lodgingLot ? '🏨 Lodging guest' : '🚶 Day visitor'}
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

        const start = agent.carGroup ? agent.carGroup.position.clone() : agent.mesh.position.clone();
        const mainPath = agent.path && agent.path.length > 0 ? [start, ...agent.path] : null;
        const prePath = agent.prePath && agent.prePath.length > 0 ? [start, ...agent.prePath] : null;
        const parkingLeg = agent.parkingLeg && agent.parkingLeg.length > 0 ? [agent.parkingLeg[0], ...agent.parkingLeg] : null;
        const targetPath = !mainPath && agent.target ? [start, agent.target] : null;

        const lines: Array<{ points: THREE.Vector3[]; color: number }> = [];
        if (prePath && prePath.length > 1) lines.push({ points: prePath, color: 0x55d6ff });
        if (mainPath && mainPath.length > 1) lines.push({ points: mainPath, color: 0xffd76a });
        if (parkingLeg && parkingLeg.length > 1) lines.push({ points: parkingLeg, color: 0x44ff88 });
        if (targetPath && targetPath.length > 1) lines.push({ points: targetPath, color: 0xffffff });

        lines.forEach(line => {
            const geometry = new THREE.BufferGeometry().setFromPoints(line.points);
            const material = new THREE.LineBasicMaterial({ color: line.color });
            const mesh = new THREE.Line(geometry, material);
            mesh.position.y = 1.5;
            this.scene.add(mesh);
            this.pathLines.push(mesh);
        });
    }

    clearPath() {
        if (this.pathLine) {
            this.scene.remove(this.pathLine);
            this.pathLine.geometry.dispose();
            this.pathLine = undefined;
        }
        if (this.pathLines.length > 0) {
            this.pathLines.forEach(line => {
                this.scene.remove(line);
                line.geometry.dispose();
                (line.material as THREE.Material).dispose();
            });
            this.pathLines = [];
        }
    }

    // Helper methods using consistent colors
    getStateColor(state: LotState): string {
        switch (state) {
            case LotState.OCCUPIED: return LOT_STATE_COLORS.occupied;
            case LotState.AWAY: return LOT_STATE_COLORS.away;
            case LotState.ABANDONED: return LOT_STATE_COLORS.abandoned;
            case LotState.FOR_SALE: return LOT_STATE_COLORS.forSale;
            default: return LOT_STATE_COLORS.empty;
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

    onFollow(callback: FollowCallback) {
        this.onFollowCallbacks.push(callback);
    }

    private emitFollow(target: THREE.Object3D | null, entity: ExplorerEntityRef | null) {
        this.onFollowCallbacks.forEach(cb => cb(target, entity));
    }

    onSelect(callback: SelectCallback) {
        this.onSelectCallbacks.push(callback);
    }

    private emitSelect(entity: ExplorerEntityRef | null) {
        this.onSelectCallbacks.forEach(cb => cb(entity));
    }

    selectEntity(entity: ExplorerEntityRef | null, options: { emitSelect?: boolean; emitFollow?: boolean } = {}) {
        const emitSelect = options.emitSelect !== false;
        const emitFollow = options.emitFollow !== false;

        if (entity) {
            if (entity.type === 'agent' || entity.type === 'vehicle' || entity.type === 'resident' || entity.type === 'tourist') {
                this.showAgentPath(entity.data);
                const targetMesh = entity.type === 'vehicle' ? entity.data.carGroup : entity.data.mesh;
                if (emitFollow) {
                    this.emitFollow(targetMesh, entity);
                } else {
                    this.emitFollow(null, null);
                }
            } else {
                this.clearPath();
                this.emitFollow(null, null);
            }
        } else {
            this.clearPath();
            this.emitFollow(null, null);
        }

        if (emitSelect) {
            this.emitSelect(entity);
        }
    }
}
