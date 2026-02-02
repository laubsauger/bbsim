import SunCalc from 'suncalc';
import { GameTime } from "../types";

// Bombay Beach coordinates
const LAT = 33.3528;
const LNG = -115.7339;

export class TimeSystem {
    public time: GameTime;
    public sunPosition: { azimuth: number; altitude: number } = { azimuth: 0, altitude: 0 };
    public moonPosition: { azimuth: number; altitude: number } = { azimuth: 0, altitude: 0 };
    public phase: number = 0; // Moon phase

    constructor() {
        this.time = {
            totalSeconds: 8 * 3600, // Start at 8 AM
            day: 1,
            hour: 8,
            minute: 0,
            speed: 60 // 1 real sec = 1 game minute
        };
        this.updateSunPosition();
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

        this.updateSunPosition();
    }

    private updateSunPosition() {
        // Map GameTime to a mock Date object for SunCalc
        // We assume Day 1 is June 21, 2026 (Summer Solstice) for interesting light
        const baseDate = new Date('2026-06-21T00:00:00');
        const msInDay = this.time.totalSeconds * 1000;
        const currentMs = baseDate.getTime() + (this.time.day - 1) * 86400000 + msInDay;
        const date = new Date(currentMs);

        const sunPos = SunCalc.getPosition(date, LAT, LNG);
        const moonPos = SunCalc.getMoonPosition(date, LAT, LNG);
        const moonIllum = SunCalc.getMoonIllumination(date);

        this.sunPosition = { azimuth: sunPos.azimuth, altitude: sunPos.altitude };
        this.moonPosition = { azimuth: moonPos.azimuth, altitude: moonPos.altitude };
        this.phase = moonIllum.phase;
    }

    getTimeString(): string {
        const h = this.time.hour.toString().padStart(2, '0');
        const m = this.time.minute.toString().padStart(2, '0');
        return `Day ${this.time.day} - ${h}:${m}`;
    }
}
