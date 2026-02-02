export type FocusMode = 'jump' | 'follow' | 'both';

export interface TopbarConfig {
    onToggleOverlay?: (visible: boolean) => void;
    onToggleMinimap?: (visible: boolean) => void;
    onToggleLegend?: (visible: boolean) => void;
    onToggleExplorer?: (visible: boolean) => void;
    onToggleEventLog?: (visible: boolean) => void;
    onToggleHighlights?: (enabled: boolean) => void;
    onSpeedChange?: (speed: number) => void;
    onFocusModeChange?: (mode: FocusMode) => void;
    onTrespassChange?: (chances: { resident: number; tourist: number; other: number }) => void;
    onSidewalkOffsetChange?: (offset: number) => void;
}

export class Topbar {
    container: HTMLDivElement;
    private timeValue: HTMLSpanElement;
    private speedValue: HTMLSpanElement;
    private speedInput: HTMLInputElement;
    private overlayToggle: HTMLButtonElement;
    private minimapToggle: HTMLButtonElement;
    private legendToggle: HTMLButtonElement;
    private explorerToggle: HTMLButtonElement;
    private eventLogToggle: HTMLButtonElement;
    private highlightToggle: HTMLButtonElement;
    private settingsToggle: HTMLButtonElement;
    private focusButtons: Map<FocusMode, HTMLButtonElement> = new Map();
    private settingsPanel: HTMLDivElement;
    private trespassInputs: Record<'resident' | 'tourist' | 'other', HTMLInputElement>;
    private trespassValues: Record<'resident' | 'tourist' | 'other', HTMLSpanElement>;
    private sidewalkInput: HTMLInputElement;
    private sidewalkValue: HTMLSpanElement;
    private state = {
        overlayVisible: true,
        minimapVisible: true,
        legendVisible: true,
        explorerVisible: true,
        eventLogVisible: true,
        highlightsEnabled: true,
        focusMode: 'both' as FocusMode,
        speed: 60,
        trespass: { resident: 2, tourist: 1, other: 5 },
        sidewalkOffset: 12,
    };

    private onToggleOverlay?: (visible: boolean) => void;
    private onToggleMinimap?: (visible: boolean) => void;
    private onToggleLegend?: (visible: boolean) => void;
    private onToggleExplorer?: (visible: boolean) => void;
    private onToggleEventLog?: (visible: boolean) => void;
    private onToggleHighlights?: (enabled: boolean) => void;
    private onSpeedChange?: (speed: number) => void;
    private onFocusModeChange?: (mode: FocusMode) => void;
    private onTrespassChange?: (chances: { resident: number; tourist: number; other: number }) => void;
    private onSidewalkOffsetChange?: (offset: number) => void;

    constructor(config: TopbarConfig = {}) {
        this.onToggleOverlay = config.onToggleOverlay;
        this.onToggleMinimap = config.onToggleMinimap;
        this.onToggleLegend = config.onToggleLegend;
        this.onToggleExplorer = config.onToggleExplorer;
        this.onToggleEventLog = config.onToggleEventLog;
        this.onToggleHighlights = config.onToggleHighlights;
        this.onSpeedChange = config.onSpeedChange;
        this.onFocusModeChange = config.onFocusModeChange;
        this.onTrespassChange = config.onTrespassChange;
        this.onSidewalkOffsetChange = config.onSidewalkOffsetChange;

        this.container = document.createElement('div');
        this.container.className = 'topbar';
        this.applyStyles();

        this.container.innerHTML = `
            <div class="topbar__group">
                <button class="topbar__btn" data-action="overlay">Overlays</button>
                <button class="topbar__btn" data-action="minimap">Minimap</button>
                <button class="topbar__btn" data-action="legend">Legend</button>
                <button class="topbar__btn" data-action="explorer">Explorer</button>
                <button class="topbar__btn" data-action="events">Events</button>
            </div>
            <div class="topbar__group topbar__group--center">
                <div class="topbar__time">Time <span class="topbar__time-value">Day 1 08:00</span></div>
                <div class="topbar__speed">
                    Speed <span class="topbar__speed-value">60</span>
                    <input class="topbar__speed-input" type="range" min="0" max="1000" value="118" />
                </div>
            </div>
            <div class="topbar__group">
                <button class="topbar__btn" data-action="highlights">Highlights</button>
                <button class="topbar__btn" data-action="settings">Nav</button>
                <div class="topbar__segmented" data-action="focus">
                    <button class="topbar__seg-btn" data-mode="jump">Jump</button>
                    <button class="topbar__seg-btn" data-mode="follow">Follow</button>
                    <button class="topbar__seg-btn" data-mode="both">Both</button>
                </div>
            </div>
            <div class="topbar__panel">
                <div class="topbar__panel-row">
                    <span class="topbar__panel-label">Trespass (Res)</span>
                    <input class="topbar__panel-input" data-trespass="resident" type="range" min="0" max="20" value="2" />
                    <span class="topbar__panel-value" data-trespass-value="resident">2%</span>
                </div>
                <div class="topbar__panel-row">
                    <span class="topbar__panel-label">Trespass (Tour)</span>
                    <input class="topbar__panel-input" data-trespass="tourist" type="range" min="0" max="20" value="1" />
                    <span class="topbar__panel-value" data-trespass-value="tourist">1%</span>
                </div>
                <div class="topbar__panel-row">
                    <span class="topbar__panel-label">Trespass (Other)</span>
                    <input class="topbar__panel-input" data-trespass="other" type="range" min="0" max="20" value="5" />
                    <span class="topbar__panel-value" data-trespass-value="other">5%</span>
                </div>
                <div class="topbar__panel-row">
                    <span class="topbar__panel-label">Sidewalk Offset</span>
                    <input class="topbar__panel-input" data-sidewalk="offset" type="range" min="6" max="24" value="12" />
                    <span class="topbar__panel-value" data-sidewalk-value="offset">12</span>
                </div>
            </div>
        `;

        document.body.appendChild(this.container);

        this.timeValue = this.container.querySelector('.topbar__time-value') as HTMLSpanElement;
        this.speedValue = this.container.querySelector('.topbar__speed-value') as HTMLSpanElement;
        this.speedInput = this.container.querySelector('.topbar__speed-input') as HTMLInputElement;
        this.overlayToggle = this.container.querySelector('[data-action="overlay"]') as HTMLButtonElement;
        this.minimapToggle = this.container.querySelector('[data-action="minimap"]') as HTMLButtonElement;
        this.legendToggle = this.container.querySelector('[data-action="legend"]') as HTMLButtonElement;
        this.explorerToggle = this.container.querySelector('[data-action="explorer"]') as HTMLButtonElement;
        this.eventLogToggle = this.container.querySelector('[data-action="events"]') as HTMLButtonElement;
        this.highlightToggle = this.container.querySelector('[data-action="highlights"]') as HTMLButtonElement;
        this.settingsToggle = this.container.querySelector('[data-action="settings"]') as HTMLButtonElement;
        this.settingsPanel = this.container.querySelector('.topbar__panel') as HTMLDivElement;
        this.trespassInputs = {
            resident: this.container.querySelector('[data-trespass="resident"]') as HTMLInputElement,
            tourist: this.container.querySelector('[data-trespass="tourist"]') as HTMLInputElement,
            other: this.container.querySelector('[data-trespass="other"]') as HTMLInputElement,
        };
        this.trespassValues = {
            resident: this.container.querySelector('[data-trespass-value="resident"]') as HTMLSpanElement,
            tourist: this.container.querySelector('[data-trespass-value="tourist"]') as HTMLSpanElement,
            other: this.container.querySelector('[data-trespass-value="other"]') as HTMLSpanElement,
        };
        this.sidewalkInput = this.container.querySelector('[data-sidewalk="offset"]') as HTMLInputElement;
        this.sidewalkValue = this.container.querySelector('[data-sidewalk-value="offset"]') as HTMLSpanElement;

        const focusButtons = Array.from(this.container.querySelectorAll('.topbar__seg-btn')) as HTMLButtonElement[];
        focusButtons.forEach(btn => {
            const mode = (btn.dataset.mode || 'both') as FocusMode;
            this.focusButtons.set(mode, btn);
            btn.addEventListener('click', () => this.setFocusMode(mode, true));
        });

        this.overlayToggle.addEventListener('click', () => this.setOverlayVisible(!this.state.overlayVisible, true));
        this.minimapToggle.addEventListener('click', () => this.setMinimapVisible(!this.state.minimapVisible, true));
        this.legendToggle.addEventListener('click', () => this.setLegendVisible(!this.state.legendVisible, true));
        this.explorerToggle.addEventListener('click', () => this.setExplorerVisible(!this.state.explorerVisible, true));
        this.eventLogToggle.addEventListener('click', () => this.setEventLogVisible(!this.state.eventLogVisible, true));
        this.highlightToggle.addEventListener('click', () => this.setHighlightsEnabled(!this.state.highlightsEnabled, true));
        this.settingsToggle.addEventListener('click', () => this.toggleSettingsPanel());

        this.speedInput.addEventListener('input', () => {
            const sliderVal = Number(this.speedInput.value);
            // Cubic scaling: speed = max * (slider/max)^3
            // Maps 0-1000 slider to 0-36000 speed with fine control at low end
            const t = sliderVal / 1000;
            const speed = Math.round(36000 * t * t * t);
            this.setSpeed(speed, true, false); // Don't update slider while dragging
        });

        Object.entries(this.trespassInputs).forEach(([key, input]) => {
            input.addEventListener('input', () => {
                const value = Number(input.value);
                this.state.trespass[key as 'resident' | 'tourist' | 'other'] = value;
                this.trespassValues[key as 'resident' | 'tourist' | 'other'].textContent = `${value}%`;
                if (this.onTrespassChange) {
                    this.onTrespassChange({
                        resident: this.state.trespass.resident / 100,
                        tourist: this.state.trespass.tourist / 100,
                        other: this.state.trespass.other / 100,
                    });
                }
            });
        });

        this.sidewalkInput.addEventListener('input', () => {
            const value = Number(this.sidewalkInput.value);
            this.state.sidewalkOffset = value;
            this.sidewalkValue.textContent = String(value);
            if (this.onSidewalkOffsetChange) {
                this.onSidewalkOffsetChange(value);
            }
        });

        this.syncButtons();
    }

    setTimeLabel(text: string) {
        this.timeValue.textContent = text;
    }

    setSpeed(speed: number, emit: boolean = false, updateSlider: boolean = true) {
        this.state.speed = speed;

        if (updateSlider) {
            // Inverse cubic: slider = max * (speed/max)^(1/3)
            const t = Math.pow(Math.max(0, speed) / 36000, 1 / 3);
            this.speedInput.value = String(Math.round(t * 1000));
        }

        this.speedValue.textContent = String(speed);
        if (emit && this.onSpeedChange) this.onSpeedChange(speed);
    }

    setOverlayVisible(visible: boolean, emit: boolean = false) {
        this.state.overlayVisible = visible;
        this.overlayToggle.classList.toggle('active', visible);
        if (emit && this.onToggleOverlay) this.onToggleOverlay(visible);
    }

    setMinimapVisible(visible: boolean, emit: boolean = false) {
        this.state.minimapVisible = visible;
        this.minimapToggle.classList.toggle('active', visible);
        if (emit && this.onToggleMinimap) this.onToggleMinimap(visible);
    }

    setLegendVisible(visible: boolean, emit: boolean = false) {
        this.state.legendVisible = visible;
        this.legendToggle.classList.toggle('active', visible);
        if (emit && this.onToggleLegend) this.onToggleLegend(visible);
    }

    setExplorerVisible(visible: boolean, emit: boolean = false) {
        this.state.explorerVisible = visible;
        this.explorerToggle.classList.toggle('active', visible);
        if (emit && this.onToggleExplorer) this.onToggleExplorer(visible);
    }

    setEventLogVisible(visible: boolean, emit: boolean = false) {
        this.state.eventLogVisible = visible;
        this.eventLogToggle.classList.toggle('active', visible);
        if (emit && this.onToggleEventLog) this.onToggleEventLog(visible);
    }

    setHighlightsEnabled(enabled: boolean, emit: boolean = false) {
        this.state.highlightsEnabled = enabled;
        this.highlightToggle.classList.toggle('active', enabled);
        if (emit && this.onToggleHighlights) this.onToggleHighlights(enabled);
    }

    setFocusMode(mode: FocusMode, emit: boolean = false) {
        this.state.focusMode = mode;
        this.focusButtons.forEach((btn, key) => btn.classList.toggle('active', key === mode));
        if (emit && this.onFocusModeChange) this.onFocusModeChange(mode);
    }

    getFocusMode(): FocusMode {
        return this.state.focusMode;
    }

    private syncButtons() {
        this.setOverlayVisible(this.state.overlayVisible);
        this.setMinimapVisible(this.state.minimapVisible);
        this.setLegendVisible(this.state.legendVisible);
        this.setExplorerVisible(this.state.explorerVisible);
        this.setEventLogVisible(this.state.eventLogVisible);
        this.setHighlightsEnabled(this.state.highlightsEnabled);
        this.setFocusMode(this.state.focusMode);
        this.setSpeed(this.state.speed);
        this.trespassValues.resident.textContent = `${this.state.trespass.resident}%`;
        this.trespassValues.tourist.textContent = `${this.state.trespass.tourist}%`;
        this.trespassValues.other.textContent = `${this.state.trespass.other}%`;
        this.sidewalkValue.textContent = String(this.state.sidewalkOffset);
    }

    private toggleSettingsPanel() {
        const isOpen = this.settingsPanel.classList.toggle('open');
        this.settingsToggle.classList.toggle('active', isOpen);
    }

    private applyStyles() {
        if (!document.getElementById('topbar-styles')) {
            const style = document.createElement('style');
            style.id = 'topbar-styles';
            style.textContent = `
                .topbar {
                    position: absolute;
                    top: 16px;
                    left: 50%;
                    transform: translateX(-50%);
                    display: flex;
                    align-items: center;
                    gap: 16px;
                    flex-wrap: nowrap;
                    padding: 10px 16px;
                    border-radius: 14px;
                    background: rgba(18, 16, 13, 0.92);
                    border: 1px solid rgba(100, 85, 65, 0.8);
                    color: #F2E9DA;
                    font-family: "Avenir Next", "Gill Sans", "Trebuchet MS", sans-serif;
                    font-size: 12px;
                    z-index: 120;
                    box-shadow: 0 12px 26px rgba(0, 0, 0, 0.4);
                    max-width: calc(100% - 32px);
                }

                .topbar__group {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }

                .topbar__group--center {
                    gap: 12px;
                    padding: 0 8px;
                    white-space: nowrap;
                }

                .topbar__btn {
                    border: 1px solid rgba(90, 75, 60, 0.7);
                    background: rgba(28, 25, 21, 0.8);
                    color: rgba(242, 233, 218, 0.8);
                    padding: 6px 10px;
                    border-radius: 10px;
                    cursor: pointer;
                    font-size: 11px;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }

                .topbar__btn.active {
                    background: rgba(90, 110, 80, 0.9);
                    border-color: rgba(160, 190, 140, 0.8);
                    color: #F7F0DA;
                }

                .topbar__time,
                .topbar__speed {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    text-transform: uppercase;
                    letter-spacing: 0.4px;
                    color: rgba(242, 233, 218, 0.7);
                    white-space: nowrap;
                }

                .topbar__time-value {
                    color: #F7E6C4;
                    font-weight: 600;
                    white-space: nowrap;
                }

                .topbar__speed-value {
                    color: #F7E6C4;
                    font-weight: 600;
                    white-space: nowrap;
                    display: inline-block;
                    min-width: 42px; /* Fixed width to prevent jumping */
                    text-align: right;
                }

                .topbar__speed-input {
                    width: 120px;
                    accent-color: #C7B089;
                }

                .topbar__segmented {
                    display: inline-flex;
                    border-radius: 10px;
                    overflow: hidden;
                    border: 1px solid rgba(90, 75, 60, 0.7);
                }

                .topbar__seg-btn {
                    border: none;
                    background: rgba(28, 25, 21, 0.85);
                    color: rgba(242, 233, 218, 0.7);
                    padding: 6px 10px;
                    cursor: pointer;
                    font-size: 11px;
                    text-transform: uppercase;
                    letter-spacing: 0.4px;
                }

                .topbar__seg-btn.active {
                    background: rgba(70, 90, 120, 0.9);
                    color: #F2E9DA;
                }

                .topbar__panel {
                    position: absolute;
                    top: 54px;
                    right: 16px;
                    width: 260px;
                    background: rgba(18, 16, 13, 0.95);
                    border: 1px solid rgba(100, 85, 65, 0.8);
                    border-radius: 12px;
                    padding: 10px 12px;
                    display: none;
                    flex-direction: column;
                    gap: 8px;
                    z-index: 121;
                    box-shadow: 0 12px 26px rgba(0, 0, 0, 0.45);
                }

                .topbar__panel.open {
                    display: flex;
                }

                .topbar__panel-row {
                    display: grid;
                    grid-template-columns: 110px 1fr 40px;
                    gap: 8px;
                    align-items: center;
                    font-size: 10px;
                    text-transform: uppercase;
                    letter-spacing: 0.4px;
                    color: rgba(242, 233, 218, 0.7);
                }

                .topbar__panel-input {
                    width: 100%;
                    accent-color: #C7B089;
                }

                .topbar__panel-value {
                    text-align: right;
                    color: #F7E6C4;
                    font-weight: 600;
                }
            `;
            document.head.appendChild(style);
        }
    }
}
