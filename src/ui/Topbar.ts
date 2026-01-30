export type FocusMode = 'jump' | 'follow' | 'both';

export interface TopbarConfig {
    onToggleOverlay?: (visible: boolean) => void;
    onToggleMinimap?: (visible: boolean) => void;
    onToggleExplorer?: (visible: boolean) => void;
    onToggleHighlights?: (enabled: boolean) => void;
    onSpeedChange?: (speed: number) => void;
    onFocusModeChange?: (mode: FocusMode) => void;
}

export class Topbar {
    container: HTMLDivElement;
    private timeValue: HTMLSpanElement;
    private speedValue: HTMLSpanElement;
    private speedInput: HTMLInputElement;
    private overlayToggle: HTMLButtonElement;
    private minimapToggle: HTMLButtonElement;
    private explorerToggle: HTMLButtonElement;
    private highlightToggle: HTMLButtonElement;
    private focusButtons: Map<FocusMode, HTMLButtonElement> = new Map();
    private state = {
        overlayVisible: true,
        minimapVisible: true,
        explorerVisible: true,
        highlightsEnabled: true,
        focusMode: 'both' as FocusMode,
        speed: 60,
    };

    private onToggleOverlay?: (visible: boolean) => void;
    private onToggleMinimap?: (visible: boolean) => void;
    private onToggleExplorer?: (visible: boolean) => void;
    private onToggleHighlights?: (enabled: boolean) => void;
    private onSpeedChange?: (speed: number) => void;
    private onFocusModeChange?: (mode: FocusMode) => void;

    constructor(config: TopbarConfig = {}) {
        this.onToggleOverlay = config.onToggleOverlay;
        this.onToggleMinimap = config.onToggleMinimap;
        this.onToggleExplorer = config.onToggleExplorer;
        this.onToggleHighlights = config.onToggleHighlights;
        this.onSpeedChange = config.onSpeedChange;
        this.onFocusModeChange = config.onFocusModeChange;

        this.container = document.createElement('div');
        this.container.className = 'topbar';
        this.applyStyles();

        this.container.innerHTML = `
            <div class="topbar__group">
                <button class="topbar__btn" data-action="overlay">Overlays</button>
                <button class="topbar__btn" data-action="minimap">Minimap</button>
                <button class="topbar__btn" data-action="explorer">Explorer</button>
            </div>
            <div class="topbar__group topbar__group--center">
                <div class="topbar__time">Time <span class="topbar__time-value">Day 1 08:00</span></div>
                <div class="topbar__speed">
                    Speed <span class="topbar__speed-value">60</span>
                    <input class="topbar__speed-input" type="range" min="0" max="3600" value="60" />
                </div>
            </div>
            <div class="topbar__group">
                <button class="topbar__btn" data-action="highlights">Highlights</button>
                <div class="topbar__segmented" data-action="focus">
                    <button class="topbar__seg-btn" data-mode="jump">Jump</button>
                    <button class="topbar__seg-btn" data-mode="follow">Follow</button>
                    <button class="topbar__seg-btn" data-mode="both">Both</button>
                </div>
            </div>
        `;

        document.body.appendChild(this.container);

        this.timeValue = this.container.querySelector('.topbar__time-value') as HTMLSpanElement;
        this.speedValue = this.container.querySelector('.topbar__speed-value') as HTMLSpanElement;
        this.speedInput = this.container.querySelector('.topbar__speed-input') as HTMLInputElement;
        this.overlayToggle = this.container.querySelector('[data-action="overlay"]') as HTMLButtonElement;
        this.minimapToggle = this.container.querySelector('[data-action="minimap"]') as HTMLButtonElement;
        this.explorerToggle = this.container.querySelector('[data-action="explorer"]') as HTMLButtonElement;
        this.highlightToggle = this.container.querySelector('[data-action="highlights"]') as HTMLButtonElement;

        const focusButtons = Array.from(this.container.querySelectorAll('.topbar__seg-btn')) as HTMLButtonElement[];
        focusButtons.forEach(btn => {
            const mode = (btn.dataset.mode || 'both') as FocusMode;
            this.focusButtons.set(mode, btn);
            btn.addEventListener('click', () => this.setFocusMode(mode, true));
        });

        this.overlayToggle.addEventListener('click', () => this.setOverlayVisible(!this.state.overlayVisible, true));
        this.minimapToggle.addEventListener('click', () => this.setMinimapVisible(!this.state.minimapVisible, true));
        this.explorerToggle.addEventListener('click', () => this.setExplorerVisible(!this.state.explorerVisible, true));
        this.highlightToggle.addEventListener('click', () => this.setHighlightsEnabled(!this.state.highlightsEnabled, true));

        this.speedInput.addEventListener('input', () => {
            const value = Number(this.speedInput.value);
            this.setSpeed(value, true);
        });

        this.syncButtons();
    }

    setTimeLabel(text: string) {
        this.timeValue.textContent = text;
    }

    setSpeed(speed: number, emit: boolean = false) {
        this.state.speed = speed;
        this.speedInput.value = String(speed);
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

    setExplorerVisible(visible: boolean, emit: boolean = false) {
        this.state.explorerVisible = visible;
        this.explorerToggle.classList.toggle('active', visible);
        if (emit && this.onToggleExplorer) this.onToggleExplorer(visible);
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
        this.setExplorerVisible(this.state.explorerVisible);
        this.setHighlightsEnabled(this.state.highlightsEnabled);
        this.setFocusMode(this.state.focusMode);
        this.setSpeed(this.state.speed);
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
                    padding: 10px 16px;
                    border-radius: 14px;
                    background: rgba(18, 16, 13, 0.92);
                    border: 1px solid rgba(100, 85, 65, 0.8);
                    color: #F2E9DA;
                    font-family: "Avenir Next", "Gill Sans", "Trebuchet MS", sans-serif;
                    font-size: 12px;
                    z-index: 120;
                    box-shadow: 0 12px 26px rgba(0, 0, 0, 0.4);
                }

                .topbar__group {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }

                .topbar__group--center {
                    gap: 12px;
                    padding: 0 8px;
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
                }

                .topbar__time-value,
                .topbar__speed-value {
                    color: #F7E6C4;
                    font-weight: 600;
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
            `;
            document.head.appendChild(style);
        }
    }
}
