import { TownEventType, TownEvent } from '../types';

export interface LogEntry {
    id: string;
    type: 'event' | 'arrival' | 'departure' | 'info';
    category: 'school' | 'sheriff' | 'bar' | 'tourist' | 'resident' | 'system';
    message: string;
    timestamp: number; // Game time in seconds
    day: number;
    icon: string;
    location?: LogLocation;
}

export interface LogLocation {
    x: number;
    z: number;
    label?: string;
}

export interface EventLogConfig {
    maxEntries?: number;
    onLocationClick?: (location: LogLocation) => void;
}

const EVENT_ICONS: Partial<Record<TownEventType, string>> = {
    [TownEventType.SCHOOL_BUS_ARRIVES]: '🚌',
    [TownEventType.SCHOOL_BUS_DEPARTS]: '🚌',
    [TownEventType.SCHOOL_STARTS]: '🏫',
    [TownEventType.SCHOOL_ENDS]: '🏫',
    [TownEventType.SHERIFF_ARRIVES]: '🚔',
    [TownEventType.SHERIFF_PATROL]: '🚔',
    [TownEventType.BAR_OPENS]: '🍺',
    [TownEventType.BAR_HAPPY_HOUR]: '🍻',
    [TownEventType.BAR_CLOSES]: '🍺',
    [TownEventType.CHURCH_SERVICE]: '⛪',
    [TownEventType.SUNRISE]: '🌅',
    [TownEventType.SUNSET]: '🌇',
    [TownEventType.NOON]: '☀️',
    [TownEventType.MIDNIGHT]: '🌙',
};

const EVENT_MESSAGES: Partial<Record<TownEventType, string>> = {
    [TownEventType.SCHOOL_BUS_ARRIVES]: 'School bus arrives in town',
    [TownEventType.SCHOOL_BUS_DEPARTS]: 'School bus leaves town',
    [TownEventType.SCHOOL_STARTS]: 'School is now in session',
    [TownEventType.SCHOOL_ENDS]: 'School is out for the day',
    [TownEventType.SHERIFF_ARRIVES]: 'Sheriff arrives for patrol',
    [TownEventType.SHERIFF_PATROL]: 'Sheriff begins patrol',
    [TownEventType.BAR_OPENS]: 'The bar is now open',
    [TownEventType.BAR_HAPPY_HOUR]: 'Happy hour at the bar!',
    [TownEventType.BAR_CLOSES]: 'The bar is closing',
    [TownEventType.CHURCH_SERVICE]: 'Church service begins',
    [TownEventType.SUNRISE]: 'The sun rises over Bombay Beach',
    [TownEventType.SUNSET]: 'The sun sets over the Salton Sea',
    [TownEventType.NOON]: 'High noon in Bombay Beach',
    [TownEventType.MIDNIGHT]: 'Midnight in the desert',
};

const CATEGORY_COLORS = {
    school: '#FFB800',
    sheriff: '#5B8DEE',
    bar: '#CD853F',
    tourist: '#4ECDC4',
    resident: '#22CC66',
    system: '#888888',
};

export class EventLog {
    container: HTMLDivElement;
    private entries: LogEntry[] = [];
    private maxEntries: number;
    private visible: boolean = true;
    private entriesContainer: HTMLDivElement;
    private filterButtons: Map<string, HTMLButtonElement> = new Map();
    private activeFilters: Set<string> = new Set(['school', 'sheriff', 'bar', 'tourist', 'resident', 'system']);
    private currentDay: number = 1;
    private currentTime: string = '08:00';
    private onLocationClick?: (location: LogLocation) => void;

    constructor(config: EventLogConfig = {}) {
        this.maxEntries = config.maxEntries || 100;
        this.onLocationClick = config.onLocationClick;

        this.container = document.createElement('div');
        this.container.className = 'event-log';
        this.applyStyles();

        this.container.innerHTML = `
            <div class="event-log__header">
                <span class="event-log__title">Town Events</span>
                <div class="event-log__filters"></div>
            </div>
            <div class="event-log__entries"></div>
        `;

        document.body.appendChild(this.container);

        this.entriesContainer = this.container.querySelector('.event-log__entries') as HTMLDivElement;
        const filtersContainer = this.container.querySelector('.event-log__filters') as HTMLDivElement;

        // Create filter buttons
        const categories = ['school', 'sheriff', 'bar', 'tourist', 'resident'];
        categories.forEach(cat => {
            const btn = document.createElement('button');
            btn.className = 'event-log__filter active';
            btn.dataset.category = cat;
            btn.style.color = CATEGORY_COLORS[cat as keyof typeof CATEGORY_COLORS];
            btn.textContent = cat.charAt(0).toUpperCase() + cat.slice(1);
            btn.addEventListener('click', () => this.toggleFilter(cat));
            this.filterButtons.set(cat, btn);
            filtersContainer.appendChild(btn);
        });
    }

    setVisible(visible: boolean) {
        this.visible = visible;
        this.container.style.display = visible ? 'flex' : 'none';
    }

    isVisible(): boolean {
        return this.visible;
    }

    private toggleFilter(category: string) {
        if (this.activeFilters.has(category)) {
            this.activeFilters.delete(category);
            this.filterButtons.get(category)?.classList.remove('active');
        } else {
            this.activeFilters.add(category);
            this.filterButtons.get(category)?.classList.add('active');
        }
        this.renderEntries();
    }

    // Add a town event
    addTownEvent(event: TownEvent, day: number, gameTimeSeconds: number, location?: LogLocation) {
        const category = this.getCategoryForEvent(event.type);
        const entry: LogEntry = {
            id: `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: 'event',
            category,
            message: EVENT_MESSAGES[event.type] || event.type,
            timestamp: gameTimeSeconds,
            day,
            icon: EVENT_ICONS[event.type] || '📢',
            location,
        };
        this.addEntry(entry);
    }

    // Add arrival event
    addArrival(entityType: 'tourist' | 'resident' | 'sheriff' | 'school_bus', name: string, day: number, gameTimeSeconds: number, location?: LogLocation) {
        const icons = { tourist: '📷', resident: '🏠', sheriff: '🚔', school_bus: '🚌' };
        const category = entityType === 'school_bus' ? 'school' : entityType;
        const entry: LogEntry = {
            id: `arrival_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: 'arrival',
            category: category as LogEntry['category'],
            message: `${name} arrives in town`,
            timestamp: gameTimeSeconds,
            day,
            icon: icons[entityType] || '👤',
            location,
        };
        this.addEntry(entry);
    }

    // Add departure event
    addDeparture(entityType: 'tourist' | 'resident' | 'sheriff' | 'school_bus', name: string, day: number, gameTimeSeconds: number, location?: LogLocation) {
        const icons = { tourist: '📷', resident: '🏠', sheriff: '🚔', school_bus: '🚌' };
        const category = entityType === 'school_bus' ? 'school' : entityType;
        const entry: LogEntry = {
            id: `departure_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: 'departure',
            category: category as LogEntry['category'],
            message: `${name} leaves town`,
            timestamp: gameTimeSeconds,
            day,
            icon: icons[entityType] || '👤',
            location,
        };
        this.addEntry(entry);
    }

    // Add general info message
    addInfo(message: string, category: LogEntry['category'], icon: string, day: number, gameTimeSeconds: number, location?: LogLocation) {
        const entry: LogEntry = {
            id: `info_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: 'info',
            category,
            message,
            timestamp: gameTimeSeconds,
            day,
            icon,
            location,
        };
        this.addEntry(entry);
    }

    private addEntry(entry: LogEntry) {
        this.entries.unshift(entry); // Add to beginning
        if (this.entries.length > this.maxEntries) {
            this.entries.pop();
        }
        this.renderEntries();
    }

    private renderEntries() {
        const filtered = this.entries.filter(e => this.activeFilters.has(e.category));
        const toShow = filtered.slice(0, 20); // Show last 20 matching

        this.entriesContainer.innerHTML = '';

        if (toShow.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'event-log__empty';
            empty.textContent = 'No events yet...';
            this.entriesContainer.appendChild(empty);
            return;
        }

        toShow.forEach(entry => {
            const el = document.createElement('div');
            el.className = `event-log__entry event-log__entry--${entry.type}`;

            const timeStr = this.formatTime(entry.timestamp);
            const color = CATEGORY_COLORS[entry.category];

            const iconEl = document.createElement('span');
            iconEl.className = 'event-log__entry-icon';
            iconEl.textContent = entry.icon;

            const timeEl = document.createElement('span');
            timeEl.className = 'event-log__entry-time';
            timeEl.textContent = `Day ${entry.day} ${timeStr}`;

            const messageEl = document.createElement('span');
            messageEl.className = 'event-log__entry-message';
            messageEl.style.color = color;
            messageEl.textContent = entry.message;

            if (entry.location?.label) {
                const addrEl = document.createElement('span');
                addrEl.className = 'event-log__entry-address';
                addrEl.textContent = entry.location.label;
                messageEl.append(' ');
                messageEl.appendChild(addrEl);
            }

            el.appendChild(iconEl);
            el.appendChild(timeEl);
            el.appendChild(messageEl);

            if (entry.location && this.onLocationClick) {
                const targetBtn = document.createElement('button');
                targetBtn.className = 'event-log__entry-target';
                targetBtn.type = 'button';
                targetBtn.title = 'Jump to location';
                targetBtn.textContent = '🎯';
                targetBtn.addEventListener('click', (evt) => {
                    evt.stopPropagation();
                    this.onLocationClick?.(entry.location as LogLocation);
                });
                el.appendChild(targetBtn);
            }

            this.entriesContainer.appendChild(el);
        });
    }

    private formatTime(totalSeconds: number): string {
        const hours = Math.floor(totalSeconds / 3600) % 24;
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }

    private getCategoryForEvent(eventType: TownEventType): LogEntry['category'] {
        if (eventType.includes('SCHOOL') || eventType.includes('BUS')) return 'school';
        if (eventType.includes('SHERIFF')) return 'sheriff';
        if (eventType.includes('BAR')) return 'bar';
        if (eventType.includes('CHURCH')) return 'system';
        return 'system';
    }

    updateTime(day: number, timeStr: string) {
        this.currentDay = day;
        this.currentTime = timeStr;
    }

    clear() {
        this.entries = [];
        this.renderEntries();
    }

    private applyStyles() {
        if (!document.getElementById('event-log-styles')) {
            const style = document.createElement('style');
            style.id = 'event-log-styles';
            style.textContent = `
                .event-log {
                    position: fixed;
                    bottom: 12px;
                    left: 50%;
                    transform: translateX(-50%);
                    width: min(560px, 85vw);
                    max-height: 200px;
                    display: flex;
                    flex-direction: column;
                    background: linear-gradient(180deg, rgba(24, 22, 18, 0.95), rgba(16, 14, 12, 0.95));
                    border: 1px solid rgba(110, 90, 70, 0.7);
                    border-radius: 12px;
                    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
                    color: #F2E9DA;
                    font-family: "Avenir Next", "Gill Sans", sans-serif;
                    z-index: 130;
                    overflow: hidden;
                }

                .event-log__header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 10px 14px;
                    border-bottom: 1px solid rgba(90, 75, 60, 0.6);
                    flex-shrink: 0;
                }

                .event-log__title {
                    font-size: 12px;
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    color: #F7E6C4;
                }

                .event-log__filters {
                    display: flex;
                    gap: 6px;
                }

                .event-log__filter {
                    padding: 3px 8px;
                    border-radius: 10px;
                    border: 1px solid rgba(90, 75, 60, 0.6);
                    background: transparent;
                    font-size: 9px;
                    text-transform: uppercase;
                    cursor: pointer;
                    opacity: 0.5;
                    transition: all 0.15s ease;
                }

                .event-log__filter.active {
                    opacity: 1;
                    background: rgba(255, 255, 255, 0.1);
                }

                .event-log__filter:hover {
                    opacity: 0.8;
                }

                .event-log__entries {
                    flex: 1;
                    overflow-y: auto;
                    padding: 8px 10px;
                }

                .event-log__entry {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 6px 8px;
                    margin-bottom: 4px;
                    border-radius: 6px;
                    background: rgba(255, 255, 255, 0.03);
                    font-size: 11px;
                    animation: eventSlideIn 0.2s ease-out;
                }

                @keyframes eventSlideIn {
                    from {
                        opacity: 0;
                        transform: translateY(-10px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }

                .event-log__entry--event {
                    border-left: 2px solid #FFB800;
                }

                .event-log__entry--arrival {
                    border-left: 2px solid #22CC66;
                }

                .event-log__entry--departure {
                    border-left: 2px solid #CC6666;
                }

                .event-log__entry--info {
                    border-left: 2px solid #888888;
                }

                .event-log__entry-icon {
                    font-size: 14px;
                    width: 20px;
                    text-align: center;
                }

                .event-log__entry-time {
                    font-size: 9px;
                    color: rgba(242, 233, 218, 0.5);
                    font-family: monospace;
                    min-width: 80px;
                }

                .event-log__entry-message {
                    flex: 1;
                }

                .event-log__entry-address {
                    font-size: 9px;
                    color: rgba(242, 233, 218, 0.65);
                    margin-left: 6px;
                }

                .event-log__entry-target {
                    border: none;
                    background: transparent;
                    cursor: pointer;
                    padding: 2px 4px;
                    font-size: 12px;
                    opacity: 0.85;
                }

                .event-log__entry-target:hover {
                    opacity: 1;
                }

                .event-log__empty {
                    text-align: center;
                    color: rgba(242, 233, 218, 0.4);
                    font-size: 11px;
                    padding: 20px;
                }
            `;
            document.head.appendChild(style);
        }
    }
}
