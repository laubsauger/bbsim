export type OverlayType =
    | 'status'
    | 'zoning'
    | 'addresses'
    | 'prices'
    | 'noise'
    | 'pollution'
    | 'traffic_cars'
    | 'traffic_peds'
    | 'traffic_combined'
    | 'wifi';

export interface OverlayState {
    status: boolean;
    zoning: boolean;
    addresses: boolean;
    prices: boolean;
    noise: boolean;
    pollution: boolean;
    traffic_cars: boolean;
    traffic_peds: boolean;
    traffic_combined: boolean;
    wifi: boolean;
}

export interface OverlayMenuConfig {
    onChange?: (overlay: OverlayType, enabled: boolean) => void;
}

const OVERLAY_CONFIG: Record<OverlayType, { label: string; icon: string; description: string }> = {
    status: { label: 'Status', icon: '🏠', description: 'Lot occupation status' },
    zoning: { label: 'Zoning', icon: '🏗️', description: 'Land use zoning' },
    addresses: { label: 'Streets', icon: '🗺️', description: 'Street names and addresses' },
    prices: { label: 'Prices', icon: '💰', description: 'Property values' },
    noise: { label: 'Noise', icon: '🔊', description: 'Noise pollution levels' },
    pollution: { label: 'Pollution', icon: '☁️', description: 'Air quality' },
    traffic_cars: { label: 'Traffic Cars', icon: '🚗', description: 'Vehicle traffic density' },
    traffic_peds: { label: 'Traffic Peds', icon: '🚶', description: 'Pedestrian traffic density' },
    traffic_combined: { label: 'Traffic All', icon: '🔥', description: 'Combined traffic density' },
    wifi: { label: 'WiFi', icon: '📶', description: 'Wireless signal strength' },
};

export class OverlayMenu {
    container: HTMLDivElement;
    state: OverlayState;
    private onChange?: (overlay: OverlayType, enabled: boolean) => void;
    private buttons: Map<OverlayType, HTMLButtonElement> = new Map();

    constructor(config: OverlayMenuConfig = {}) {
        this.onChange = config.onChange;
        this.state = {
            status: false,  // Default off for clean view
            zoning: false,  // Default off for clean view
            addresses: false,
            prices: false,
            noise: false,
            pollution: false,
            traffic_cars: false,
            traffic_peds: false,
            traffic_combined: false,
            wifi: false,
        };

        this.container = document.createElement('div');
        this.container.className = 'overlay-menu';
        this.applyStyles();
        this.render();

        document.body.appendChild(this.container);
    }

    private applyStyles() {
        // Inject CSS if not already present
        if (!document.getElementById('overlay-menu-styles')) {
            const style = document.createElement('style');
            style.id = 'overlay-menu-styles';
            style.textContent = `
                .overlay-menu {
                    position: absolute;
                    top: 64px;
                    left: 12px;
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                    z-index: 100;
                }

                .overlay-btn {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 10px 14px;
                    background: rgba(30, 25, 20, 0.85);
                    border: 2px solid #3D3530;
                    border-radius: 8px;
                    color: #8A8580;
                    font-family: system-ui, sans-serif;
                    font-size: 13px;
                    cursor: pointer;
                    transition: all 0.15s ease;
                    min-width: 120px;
                    text-align: left;
                }

                .overlay-btn:hover {
                    background: rgba(50, 45, 40, 0.9);
                    border-color: #5D5550;
                    color: #C0B8A8;
                }

                .overlay-btn.active {
                    background: rgba(60, 80, 60, 0.9);
                    border-color: #88DD88;
                    color: #FFFFFF;
                }

                .overlay-btn.active:hover {
                    background: rgba(70, 100, 70, 0.95);
                }

                .overlay-btn-icon {
                    font-size: 16px;
                    width: 20px;
                    text-align: center;
                }

                .overlay-btn-label {
                    flex: 1;
                    font-weight: 500;
                }

                .overlay-btn-indicator {
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    background: #444;
                    transition: background 0.15s ease;
                }

                .overlay-btn.active .overlay-btn-indicator {
                    background: #88DD88;
                    box-shadow: 0 0 6px #88DD88;
                }

                .overlay-menu-header {
                    color: #E8DFD0;
                    font-family: system-ui, sans-serif;
                    font-size: 11px;
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    padding: 4px 8px;
                    margin-bottom: 4px;
                }
            `;
            document.head.appendChild(style);
        }

        this.container.style.cssText = `
            position: absolute;
            top: 64px;
            left: 12px;
            display: flex;
            flex-direction: column;
            gap: 8px;
            z-index: 100;
        `;
    }

    private render() {
        this.container.innerHTML = '';

        // Header
        const header = document.createElement('div');
        header.className = 'overlay-menu-header';
        header.textContent = 'Overlays';
        this.container.appendChild(header);

        // Buttons for each overlay
        (Object.keys(OVERLAY_CONFIG) as OverlayType[]).forEach(type => {
            const config = OVERLAY_CONFIG[type];
            const btn = this.createButton(type, config);
            this.buttons.set(type, btn);
            this.container.appendChild(btn);
        });
    }

    private createButton(type: OverlayType, config: { label: string; icon: string; description: string }): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.className = 'overlay-btn';
        btn.title = config.description;

        if (this.state[type]) {
            btn.classList.add('active');
        }

        btn.innerHTML = `
            <span class="overlay-btn-icon">${config.icon}</span>
            <span class="overlay-btn-label">${config.label}</span>
            <span class="overlay-btn-indicator"></span>
        `;

        btn.addEventListener('click', () => this.toggle(type));

        return btn;
    }

    toggle(overlay: OverlayType) {
        this.state[overlay] = !this.state[overlay];

        const btn = this.buttons.get(overlay);
        if (btn) {
            btn.classList.toggle('active', this.state[overlay]);
        }

        if (this.onChange) {
            this.onChange(overlay, this.state[overlay]);
        }
    }

    setOverlay(overlay: OverlayType, enabled: boolean) {
        if (this.state[overlay] !== enabled) {
            this.state[overlay] = enabled;
            const btn = this.buttons.get(overlay);
            if (btn) {
                btn.classList.toggle('active', enabled);
            }
        }
    }

    getState(): OverlayState {
        return { ...this.state };
    }

    dispose() {
        this.container.remove();
    }
}
