import { GameTime } from "../types";

export class TimeSystem {
    public time: GameTime;

    constructor() {
        this.time = {
            totalSeconds: 8 * 3600, // Start at 8 AM
            day: 1,
            hour: 8,
            minute: 0,
            speed: 60 // 1 real sec = 1 game minute
        };
    }

    update(delta: number) {
        // Delta is in seconds
        this.time.totalSeconds += delta * this.time.speed;

        const secondsInDay = 86400;
        if (this.time.totalSeconds >= secondsInDay) {
            this.time.totalSeconds -= secondsInDay;
            this.time.day++;
        }

        this.time.hour = Math.floor(this.time.totalSeconds / 3600);
        this.time.minute = Math.floor((this.time.totalSeconds % 3600) / 60);
    }

    getTimeString(): string {
        const h = this.time.hour.toString().padStart(2, '0');
        const m = this.time.minute.toString().padStart(2, '0');
        return `Day ${this.time.day} - ${h}:${m}`;
    }
}
