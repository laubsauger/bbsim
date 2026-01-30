import { TownEvent, TownEventType } from '../types';

export type EventCallback = (event: TownEvent, day: number) => void;

// Default town event schedule
const DEFAULT_EVENTS: TownEvent[] = [
    // School bus schedule (weekdays only: Mon-Fri = 1-5)
    { type: TownEventType.SCHOOL_BUS_ARRIVES, hour: 7, minute: 30, daysOfWeek: [1, 2, 3, 4, 5], data: { purpose: 'dropoff' } },
    { type: TownEventType.SCHOOL_STARTS, hour: 8, minute: 0, daysOfWeek: [1, 2, 3, 4, 5] },
    { type: TownEventType.SCHOOL_ENDS, hour: 15, minute: 0, daysOfWeek: [1, 2, 3, 4, 5] },
    { type: TownEventType.SCHOOL_BUS_ARRIVES, hour: 15, minute: 30, daysOfWeek: [1, 2, 3, 4, 5], data: { purpose: 'pickup' } },

    // Sheriff patrols (daily)
    { type: TownEventType.SHERIFF_ARRIVES, hour: 10, minute: 0 },
    { type: TownEventType.SHERIFF_PATROL, hour: 14, minute: 0 },
    { type: TownEventType.SHERIFF_ARRIVES, hour: 20, minute: 0 },

    // Bar schedule
    { type: TownEventType.BAR_OPENS, hour: 16, minute: 0 },
    { type: TownEventType.BAR_HAPPY_HOUR, hour: 17, minute: 0 },
    { type: TownEventType.BAR_CLOSES, hour: 2, minute: 0 },

    // Church service (Sunday = 0)
    { type: TownEventType.CHURCH_SERVICE, hour: 10, minute: 0, daysOfWeek: [0] },

    // Daily events
    { type: TownEventType.SUNRISE, hour: 6, minute: 0 },
    { type: TownEventType.NOON, hour: 12, minute: 0 },
    { type: TownEventType.SUNSET, hour: 19, minute: 0 },
    { type: TownEventType.MIDNIGHT, hour: 0, minute: 0 },
];

export class EventSystem {
    private events: TownEvent[] = [];
    private callbacks: Map<TownEventType, EventCallback[]> = new Map();
    private globalCallbacks: EventCallback[] = [];
    private lastCheckedMinute: number = -1;
    private lastCheckedDay: number = -1;
    private activeEvents: Map<TownEventType, { startTime: number; data?: any }> = new Map();

    // Event log for UI display
    private eventLog: Array<{ event: TownEvent; day: number; timestamp: number }> = [];
    private maxLogSize = 50;

    constructor(customEvents?: TownEvent[]) {
        this.events = customEvents || [...DEFAULT_EVENTS];
    }

    // Subscribe to specific event type
    on(eventType: TownEventType, callback: EventCallback) {
        if (!this.callbacks.has(eventType)) {
            this.callbacks.set(eventType, []);
        }
        this.callbacks.get(eventType)!.push(callback);
    }

    // Subscribe to all events
    onAny(callback: EventCallback) {
        this.globalCallbacks.push(callback);
    }

    // Remove subscription
    off(eventType: TownEventType, callback: EventCallback) {
        const callbacks = this.callbacks.get(eventType);
        if (callbacks) {
            const idx = callbacks.indexOf(callback);
            if (idx >= 0) callbacks.splice(idx, 1);
        }
    }

    // Add a custom event
    addEvent(event: TownEvent) {
        this.events.push(event);
    }

    // Check and emit events based on current time
    update(totalSeconds: number, day: number, hour: number, minute: number) {
        // Only check once per minute change
        const currentMinute = hour * 60 + minute;
        if (currentMinute === this.lastCheckedMinute && day === this.lastCheckedDay) {
            return;
        }
        this.lastCheckedMinute = currentMinute;
        this.lastCheckedDay = day;

        // Get day of week (0 = Sunday, starting from day 1 = Monday)
        const dayOfWeek = day % 7;

        // Check each event
        for (const event of this.events) {
            const eventMinute = event.hour * 60 + (event.minute || 0);
            if (eventMinute !== currentMinute) continue;

            // Check day of week filter
            if (event.daysOfWeek && !event.daysOfWeek.includes(dayOfWeek)) continue;

            // Emit the event
            this.emit(event, day);
        }
    }

    private emit(event: TownEvent, day: number) {
        // Log the event
        this.eventLog.push({ event, day, timestamp: Date.now() });
        if (this.eventLog.length > this.maxLogSize) {
            this.eventLog.shift();
        }

        // Track active event
        this.activeEvents.set(event.type, { startTime: Date.now(), data: event.data });

        // Call specific callbacks
        const callbacks = this.callbacks.get(event.type);
        if (callbacks) {
            callbacks.forEach(cb => cb(event, day));
        }

        // Call global callbacks
        this.globalCallbacks.forEach(cb => cb(event, day));

        console.log(`[Event] ${event.type} at Day ${day} ${event.hour}:${String(event.minute || 0).padStart(2, '0')}`);
    }

    // Get recent events for UI
    getRecentEvents(count: number = 10): Array<{ event: TownEvent; day: number; timestamp: number }> {
        return this.eventLog.slice(-count);
    }

    // Check if an event is currently active
    isEventActive(eventType: TownEventType): boolean {
        return this.activeEvents.has(eventType);
    }

    // Clear active event (called when event completes)
    clearActiveEvent(eventType: TownEventType) {
        this.activeEvents.delete(eventType);
    }

    // Get all active events
    getActiveEvents(): TownEventType[] {
        return Array.from(this.activeEvents.keys());
    }

    // Manual trigger (for testing or special circumstances)
    trigger(eventType: TownEventType, day: number, data?: any) {
        const event: TownEvent = {
            type: eventType,
            hour: 0,
            data
        };
        this.emit(event, day);
    }
}
