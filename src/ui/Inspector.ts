import { LotState, AgentType } from '../types';
import { ResidentState } from '../entities/Resident';

// Consistent colors matching InteractionSystem tooltip
const LOT_STATE_COLORS = {
    occupied: '#5A8A6A',    // Green
    abandoned: '#8A6A6A',   // Dusty rose
    forSale: '#5A6A8A',     // Blue-gray
    empty: '#6A6A6A',       // Gray
    away: '#7A9A7A',        // Lighter green
};

const CAR_COLORS = {
    resident: '#CC3333',    // Red
    tourist: '#4ECDC4',     // Teal
    police: '#5B8DEE',      // Blue
};

export class Inspector {
    container: HTMLElement;
    visible: boolean = false;

    constructor() {
        this.container = document.createElement('div');
        this.container.style.position = 'absolute';
        this.container.style.top = '280px';  // Below lil-gui controls
        this.container.style.right = '20px';
        this.container.style.width = '300px';
        this.container.style.backgroundColor = 'rgba(30,30,30,0.9)';
        this.container.style.color = '#eee';
        this.container.style.padding = '15px';
        this.container.style.borderRadius = '8px';
        this.container.style.fontFamily = 'monospace';
        this.container.style.display = 'none';
        this.container.style.border = '1px solid #555';
        this.container.style.boxShadow = '0 4px 6px rgba(0,0,0,0.3)';
        document.body.appendChild(this.container);
    }

    show(data: any) {
        this.visible = true;
        this.container.style.display = 'block';
        this.updateContent(data);
    }

    hide() {
        this.visible = false;
        this.container.style.display = 'none';
    }

    updateContent(data: any) {
        if (!data) return;

        let html = `<h3 style="margin-top:0; border-bottom:1px solid #555; padding-bottom: 8px;">Inspector</h3>`;

        if (data.type === 'lot') {
            const lot = data.data;
            const addressStr = lot.address ? lot.address.fullAddress : `Lot #${lot.id}`;
            const stateColor = this.getStateColor(lot.state);
            html += `
                <div style="margin-bottom: 8px;">
                    <strong style="color: #4db8ff; font-size: 14px;">📍 ${addressStr}</strong>
                </div>
                <div style="margin-bottom: 4px;">
                    <span style="color: #888;">State:</span>
                    <span style="color: ${stateColor}; font-weight: bold;">${lot.state}</span>
                </div>
                <div style="margin-bottom: 4px;">
                    <span style="color: #888;">Usage:</span> ${lot.usage || 'N/A'}
                </div>
                <div style="margin-bottom: 4px;">
                    <span style="color: #888;">ID:</span> ${lot.id}
                </div>
            `;
        } else if (data.type === 'resident') {
            const resident = data.data;
            const behaviorState = resident.behaviorState || 'unknown';
            const behaviorDisplay = this.getBehaviorDisplay(behaviorState);
            html += `
                <div style="margin-bottom: 8px;">
                    <strong style="color: #50C878; font-size: 14px;">🏠 ${resident.fullName}</strong>
                </div>
                <div style="margin-bottom: 4px;">
                    <span style="color: #888;">Age:</span> ${resident.data.age} |
                    <span style="color: #888;">Job:</span> ${resident.data.occupation}
                </div>
                <div style="margin-bottom: 4px;">
                    <span style="color: #aaa;">📍 ${resident.address}</span>
                </div>
                <div style="margin-bottom: 4px;">
                    ${resident.data.hasCar ? '🚗 Has car' : '🚶 No car'} |
                    ${resident.isHome ? '<span style="color: #50C878;">At home</span>' : '<span style="color: #FFB347;">Out</span>'}
                </div>
                <div style="margin-bottom: 4px;">
                    <span style="color: #888;">Activity:</span>
                    <span style="color: ${behaviorDisplay.color};">${behaviorDisplay.label}</span>
                </div>
            `;
        } else if (data.type === 'agent') {
            const agent = data.data;
            const typeInfo = this.getAgentTypeInfo(agent.type);
            html += `
                <div style="margin-bottom: 8px;">
                    <strong style="color: ${typeInfo.color}; font-size: 14px;">${typeInfo.label}</strong>
                </div>
                <div style="margin-bottom: 4px;">
                    <span style="color: #888;">ID:</span> ${agent.id}
                </div>
                <div style="margin-bottom: 4px;">
                    <span style="color: #888;">Speed:</span> ${agent.speed.toFixed(1)}
                </div>
                <div style="margin-bottom: 4px;">
                    <span style="color: #888;">Position:</span> ${agent.mesh.position.x.toFixed(0)}, ${agent.mesh.position.z.toFixed(0)}
                </div>
            `;
            if (agent.target) {
                html += `<div style="margin-bottom: 4px;"><span style="color: #888;">Target:</span> ${agent.target.x.toFixed(0)}, ${agent.target.z.toFixed(0)}</div>`;
            }
            if (agent.path && agent.path.length > 0) {
                html += `<div style="margin-bottom: 4px;"><span style="color: #888;">Path:</span> ${agent.path.length} waypoints</div>`;
            }
        } else if (data.type === 'tourist') {
            const tourist = data.data;
            html += `
                <div style="margin-bottom: 8px;">
                    <strong style="color: #FFB347; font-size: 14px;">📷 TOURIST</strong>
                </div>
                <div style="margin-bottom: 4px;">
                    <span style="color: #888;">ID:</span> ${tourist.id}
                </div>
                <div style="margin-bottom: 4px;">
                    <span style="color: #888;">State:</span> ${tourist.state}
                </div>
                <div style="margin-bottom: 4px;">
                    <span style="color: #888;">Position:</span> ${tourist.mesh.position.x.toFixed(0)}, ${tourist.mesh.position.z.toFixed(0)}
                </div>
                <div style="margin-bottom: 4px;">
                    <span style="color: #888;">Lodging:</span> ${tourist.data?.lodgingLot ? `Lot #${tourist.data.lodgingLot.id}` : 'None'}
                </div>
            `;
            if (tourist.target) {
                html += `<div style="margin-bottom: 4px;"><span style="color: #888;">Target:</span> ${tourist.target.x.toFixed(0)}, ${tourist.target.z.toFixed(0)}</div>`;
            }
        } else if (data.type === 'vehicle') {
            const vehicle = data.data;
            const isPoliceCar = vehicle.isPoliceCar;
            const isTourist = vehicle.isTouristCar;
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
            const hasDriver = vehicle.driver !== null;
            html += `
                <div style="margin-bottom: 8px;">
                    <strong style="color: ${carColor}; font-size: 14px;">${carLabel}</strong>
                </div>
                <div style="margin-bottom: 4px;">
                    <span style="color: #888;">ID:</span> ${vehicle.id}
                </div>
                <div style="margin-bottom: 4px;">
                    <span style="color: #888;">Driver:</span> ${hasDriver ? (vehicle.driver.fullName || vehicle.driver.id) : '<span style="color: #666;">Parked</span>'}
                </div>
                <div style="margin-bottom: 4px;">
                    <span style="color: #888;">Speed:</span> ${Math.round(vehicle.currentSpeed || 0)} / ${Math.round(vehicle.speed)}
                </div>
                <div style="margin-bottom: 4px;">
                    <span style="color: #888;">Position:</span> ${vehicle.mesh.position.x.toFixed(0)}, ${vehicle.mesh.position.z.toFixed(0)}
                </div>
            `;
            if (vehicle.target) {
                html += `<div style="margin-bottom: 4px;"><span style="color: #888;">Target:</span> ${vehicle.target.x.toFixed(0)}, ${vehicle.target.z.toFixed(0)}</div>`;
            }
        } else if (data.type === 'road') {
            const seg = data.data;
            html += `
                <div style="margin-bottom: 8px;">
                    <strong style="color: #888; font-size: 14px;">🛣️ Road Segment</strong>
                </div>
                <div style="margin-bottom: 4px;">
                    <span style="color: #888;">Type:</span> ${seg.type || 'road'}
                </div>
                <div style="margin-bottom: 4px;">
                    <span style="color: #888;">Position:</span> ${seg.x.toFixed(0)}, ${seg.y.toFixed(0)}
                </div>
                <div style="margin-bottom: 4px;">
                    <span style="color: #888;">Size:</span> ${seg.width.toFixed(0)} x ${seg.height.toFixed(0)}
                </div>
            `;
        }

        this.container.innerHTML = html;
    }

    private getStateColor(state: LotState): string {
        switch (state) {
            case LotState.OCCUPIED: return LOT_STATE_COLORS.occupied;
            case LotState.AWAY: return LOT_STATE_COLORS.away;
            case LotState.ABANDONED: return LOT_STATE_COLORS.abandoned;
            case LotState.FOR_SALE: return LOT_STATE_COLORS.forSale;
            default: return LOT_STATE_COLORS.empty;
        }
    }

    private getAgentTypeInfo(type: AgentType): { label: string; color: string } {
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

    private getBehaviorDisplay(state: ResidentState): { label: string; color: string } {
        switch (state) {
            case ResidentState.IDLE_HOME:
                return { label: '🏠 Relaxing at home', color: '#50C878' };
            case ResidentState.WALKING_TO_CAR:
                return { label: '🚶 Walking to car', color: '#FFB347' };
            case ResidentState.DRIVING:
                return { label: '🚗 Driving', color: '#4ECDC4' };
            case ResidentState.WALKING_HOME:
                return { label: '🏠 Heading home', color: '#88AAFF' };
            case ResidentState.WALKING_AROUND:
                return { label: '🚶 Walking around', color: '#FFB347' };
            default:
                return { label: 'Unknown', color: '#888888' };
        }
    }
}
