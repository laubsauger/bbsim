import * as THREE from 'three';
import { TimeSystem } from '../systems/TimeSystem';

// World center for calculating light positions
const WORLD_CENTER = new THREE.Vector3(1000, 0, 1000);
const LIGHT_DISTANCE = 4000;

// Color palettes for different times of day
const SKY_COLORS = {
    night: new THREE.Color(0x0a0a18),
    dawn: new THREE.Color(0xff7744),
    day: new THREE.Color(0x87CEEB),
    dusk: new THREE.Color(0xff6633),
};

const FOG_COLORS = {
    night: new THREE.Color(0x080810),
    dawn: new THREE.Color(0x664433),
    day: new THREE.Color(0x888888),
    dusk: new THREE.Color(0x553322),
};

const SUN_COLORS = {
    low: new THREE.Color(0xff6622),  // Near horizon
    mid: new THREE.Color(0xffcc88),  // Morning/evening
    high: new THREE.Color(0xfff0d0), // Midday
};

export class DayNightCycle {
    private scene: THREE.Scene;
    private sunLight: THREE.DirectionalLight;
    private moonLight: THREE.DirectionalLight;
    private ambientLight: THREE.AmbientLight;
    private hemiLight: THREE.HemisphereLight;
    private fog: THREE.Fog;

    // Optional visible sun/moon meshes
    private sunMesh: THREE.Mesh | null = null;
    private moonMesh: THREE.Mesh | null = null;

    // Street lamps
    private streetLamps: THREE.PointLight[] = [];
    private lampMeshes: THREE.Mesh[] = [];
    private lampGroup: THREE.Group;

    public enabled: boolean = true;

    // Custom time override
    public useCustomTime: boolean = false;
    public customHour: number = 12; // 0-24

    constructor(
        scene: THREE.Scene,
        sunLight: THREE.DirectionalLight,
        ambientLight: THREE.AmbientLight,
        hemiLight: THREE.HemisphereLight
    ) {
        this.scene = scene;
        this.sunLight = sunLight;
        this.ambientLight = ambientLight;
        this.hemiLight = hemiLight;
        this.fog = scene.fog as THREE.Fog;

        // Create moon light (dimmer, blue-ish)
        this.moonLight = new THREE.DirectionalLight(0x6688cc, 0.15);
        this.moonLight.castShadow = true;
        this.moonLight.shadow.mapSize.width = 4096;
        this.moonLight.shadow.mapSize.height = 4096;
        this.moonLight.shadow.camera.near = 100;
        this.moonLight.shadow.camera.far = 8000;
        this.moonLight.shadow.camera.left = -3000;
        this.moonLight.shadow.camera.right = 3000;
        this.moonLight.shadow.camera.top = 3000;
        this.moonLight.shadow.camera.bottom = -3000;
        this.moonLight.shadow.bias = -0.0005;
        scene.add(this.moonLight);

        // Create visible sun mesh
        const sunGeo = new THREE.SphereGeometry(80, 16, 16);
        const sunMat = new THREE.MeshBasicMaterial({ color: 0xffdd66 });
        this.sunMesh = new THREE.Mesh(sunGeo, sunMat);
        this.sunMesh.name = 'Sun';
        scene.add(this.sunMesh);

        // Create visible moon mesh
        const moonGeo = new THREE.SphereGeometry(50, 16, 16);
        const moonMat = new THREE.MeshBasicMaterial({ color: 0xccccdd });
        this.moonMesh = new THREE.Mesh(moonGeo, moonMat);
        this.moonMesh.name = 'Moon';
        scene.add(this.moonMesh);

        // Street lamp group
        this.lampGroup = new THREE.Group();
        this.lampGroup.name = 'StreetLamps';
        scene.add(this.lampGroup);
    }

    /**
     * Create sodium street lamps at intersection positions
     */
    createStreetLamps(intersections: { x: number; y: number }[]) {
        // Clear existing lamps
        this.streetLamps.forEach(lamp => this.lampGroup.remove(lamp));
        this.lampMeshes.forEach(mesh => this.lampGroup.remove(mesh));
        this.streetLamps = [];
        this.lampMeshes = [];

        // Sodium vapor color (warm orange-yellow)
        const sodiumColor = 0xffa033;
        const lampHeight = 25;
        const poleRadius = 1.5;

        intersections.forEach((pos, i) => {
            // Only place lamp at every other intersection to avoid overcrowding
            if (i % 2 !== 0) return;

            // Create pole mesh
            const poleGeo = new THREE.CylinderGeometry(poleRadius, poleRadius * 1.2, lampHeight, 8);
            const poleMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.6, roughness: 0.4 });
            const pole = new THREE.Mesh(poleGeo, poleMat);
            pole.position.set(pos.x, lampHeight / 2, pos.y);
            pole.castShadow = true;
            this.lampGroup.add(pole);
            this.lampMeshes.push(pole);

            // Create lamp head (small glowing sphere)
            const headGeo = new THREE.SphereGeometry(3, 8, 8);
            const headMat = new THREE.MeshBasicMaterial({ color: sodiumColor });
            const head = new THREE.Mesh(headGeo, headMat);
            head.position.set(pos.x, lampHeight + 2, pos.y);
            this.lampGroup.add(head);
            this.lampMeshes.push(head);

            // Create point light
            const light = new THREE.PointLight(sodiumColor, 0, 120, 2);
            light.position.set(pos.x, lampHeight + 2, pos.y);
            light.castShadow = false; // Too many shadow casters would kill performance
            this.lampGroup.add(light);
            this.streetLamps.push(light);
        });

        console.log(`[DayNightCycle] Created ${this.streetLamps.length} street lamps`);
    }

    update(timeSystem: TimeSystem) {
        if (!this.enabled) return;

        // Use custom time or simulation time
        const effectiveHour = this.useCustomTime ? this.customHour : (timeSystem.time.hour + timeSystem.time.minute / 60);

        // Get sun/moon positions - either from TimeSystem or calculate for custom hour
        let sun: { azimuth: number; altitude: number };
        let moon: { azimuth: number; altitude: number };
        let moonPhase: number;

        if (this.useCustomTime) {
            // Calculate positions for custom hour
            sun = this.getSunPositionForHour(effectiveHour);
            moon = this.getMoonPositionForHour(effectiveHour);
            moonPhase = 0.5; // Assume half moon for custom time
        } else {
            sun = timeSystem.sunPosition;
            moon = timeSystem.moonPosition;
            moonPhase = timeSystem.phase;
        }

        // Convert spherical (azimuth, altitude) to Cartesian
        const sunPos = this.sphericalToCartesian(sun.azimuth, sun.altitude, LIGHT_DISTANCE);
        const moonPos = this.sphericalToCartesian(moon.azimuth, moon.altitude, LIGHT_DISTANCE);

        // Update sun light position
        this.sunLight.position.copy(sunPos).add(WORLD_CENTER);
        this.sunLight.target.position.copy(WORLD_CENTER);
        this.sunLight.target.updateMatrixWorld();

        // Update moon light position
        this.moonLight.position.copy(moonPos).add(WORLD_CENTER);
        this.moonLight.target.position.copy(WORLD_CENTER);
        this.moonLight.target.updateMatrixWorld();

        // Update visible meshes
        if (this.sunMesh) {
            this.sunMesh.position.copy(sunPos).add(WORLD_CENTER);
            this.sunMesh.visible = sun.altitude > -0.15;
        }
        if (this.moonMesh) {
            this.moonMesh.position.copy(moonPos).add(WORLD_CENTER);
            this.moonMesh.visible = moon.altitude > -0.15;
        }

        // --- SMOOTH INTERPOLATION BASED ON SUN ALTITUDE ---
        // Key altitude thresholds (in radians):
        // -0.3 = deep night, -0.1 = twilight start, 0 = horizon, 0.2 = golden hour end, 0.5+ = full day
        const sunAlt = sun.altitude;
        const moonAlt = moon.altitude;

        // Normalize sun altitude to useful ranges
        // dayFactor: 0 = night, 1 = full day (smoothly transitions)
        const dayFactor = this.smoothStep(-0.15, 0.3, sunAlt);

        // twilightFactor: peaks during twilight (dawn/dusk), 0 at night and day
        const twilightFactor = this.bellCurve(-0.1, 0.15, sunAlt);

        // horizonFactor: 1 when sun is at or near horizon (for color warmth)
        const horizonFactor = 1 - this.smoothStep(0, 0.4, sunAlt);

        // --- SUN LIGHT ---
        // Intensity: 0 when below horizon, ramps up smoothly
        const sunIntensityFactor = this.smoothStep(-0.05, 0.5, sunAlt);
        this.sunLight.intensity = sunIntensityFactor * 1.6;

        // Color: orange at horizon, white at zenith
        const sunColor = new THREE.Color();
        sunColor.copy(SUN_COLORS.low).lerp(SUN_COLORS.high, 1 - horizonFactor);
        this.sunLight.color.copy(sunColor);

        // --- MOON LIGHT ---
        const moonBrightness = Math.sin(moonPhase * Math.PI); // 0 at new, 1 at full
        const moonIntensityFactor = this.smoothStep(-0.05, 0.3, moonAlt);
        // Moon is brighter when sun is down
        const nightBoost = 1 - dayFactor;
        this.moonLight.intensity = moonIntensityFactor * (0.05 + moonBrightness * 0.25) * (0.3 + nightBoost * 0.7);

        // --- AMBIENT LIGHT ---
        // Smoothly transition intensity and color
        const ambientIntensity = 0.08 + dayFactor * 0.22;
        this.ambientLight.intensity = ambientIntensity;

        const ambientNight = new THREE.Color(0x222244);
        const ambientTwilight = new THREE.Color(0xffaa77);
        const ambientDay = new THREE.Color(0xffffff);

        const ambientColor = new THREE.Color();
        ambientColor.copy(ambientNight).lerp(ambientDay, dayFactor);
        // Blend in twilight warmth
        if (twilightFactor > 0.01) {
            ambientColor.lerp(ambientTwilight, twilightFactor * 0.6);
        }
        this.ambientLight.color.copy(ambientColor);

        // --- HEMISPHERE LIGHT ---
        const hemiIntensity = 0.15 + dayFactor * 0.35;
        this.hemiLight.intensity = hemiIntensity;

        const hemiSkyNight = new THREE.Color(0x223355);
        const hemiSkyTwilight = new THREE.Color(0xff8855);
        const hemiSkyDay = new THREE.Color(0x87CEEB);
        const hemiGroundNight = new THREE.Color(0x111122);
        const hemiGroundTwilight = new THREE.Color(0x443322);
        const hemiGroundDay = new THREE.Color(0xC9A66B);

        const hemiSky = new THREE.Color().copy(hemiSkyNight).lerp(hemiSkyDay, dayFactor);
        const hemiGround = new THREE.Color().copy(hemiGroundNight).lerp(hemiGroundDay, dayFactor);

        // Blend twilight colors
        if (twilightFactor > 0.01) {
            hemiSky.lerp(hemiSkyTwilight, twilightFactor * 0.7);
            hemiGround.lerp(hemiGroundTwilight, twilightFactor * 0.5);
        }
        this.hemiLight.color.copy(hemiSky);
        this.hemiLight.groundColor.copy(hemiGround);

        // --- FOG AND SKY ---
        if (this.fog) {
            const fogColor = new THREE.Color().copy(FOG_COLORS.night).lerp(FOG_COLORS.day, dayFactor);
            const skyColor = new THREE.Color().copy(SKY_COLORS.night).lerp(SKY_COLORS.day, dayFactor);

            // Blend twilight colors
            if (twilightFactor > 0.01) {
                fogColor.lerp(FOG_COLORS.dawn, twilightFactor * 0.6);
                skyColor.lerp(SKY_COLORS.dawn, twilightFactor * 0.8);
            }

            this.fog.color.copy(fogColor);
            if (this.scene.background instanceof THREE.Color) {
                this.scene.background.copy(skyColor);
            }
        }

        // --- STREET LAMPS ---
        // Turn on at dusk/night, off during day
        const lampIntensity = (1 - dayFactor) * 1.5; // 0 during day, 1.5 at night
        this.streetLamps.forEach(lamp => {
            lamp.intensity = lampIntensity;
        });
        // Update lamp head glow color based on on/off state
        const lampHeadColor = lampIntensity > 0.1 ? 0xffa033 : 0x332211;
        this.lampMeshes.forEach((mesh, i) => {
            // Every other mesh is a lamp head (odd indices)
            if (i % 2 === 1 && mesh.material instanceof THREE.MeshBasicMaterial) {
                mesh.material.color.setHex(lampHeadColor);
            }
        });
    }

    /**
     * Get sun position for a specific hour (for custom time mode)
     */
    getSunPositionForHour(hour: number): { azimuth: number; altitude: number } {
        const SunCalc = require('suncalc');
        const baseDate = new Date('2026-06-21T00:00:00');
        const msInDay = hour * 3600 * 1000;
        const date = new Date(baseDate.getTime() + msInDay);
        const pos = SunCalc.getPosition(date, 33.3528, -115.7339);
        return { azimuth: pos.azimuth, altitude: pos.altitude };
    }

    /**
     * Get moon position for a specific hour (for custom time mode)
     */
    getMoonPositionForHour(hour: number): { azimuth: number; altitude: number } {
        const SunCalc = require('suncalc');
        const baseDate = new Date('2026-06-21T00:00:00');
        const msInDay = hour * 3600 * 1000;
        const date = new Date(baseDate.getTime() + msInDay);
        const pos = SunCalc.getMoonPosition(date, 33.3528, -115.7339);
        return { azimuth: pos.azimuth, altitude: pos.altitude };
    }

    /**
     * Attempt smooth step approximation: returns 0 below edge0, 1 above edge1, smooth in between
     */
    private smoothStep(edge0: number, edge1: number, x: number): number {
        const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
        return t * t * (3 - 2 * t);
    }

    /**
     * Bell curve that peaks at (edge0 + edge1) / 2, returns 0 outside the range
     */
    private bellCurve(edge0: number, edge1: number, x: number): number {
        if (x <= edge0 || x >= edge1) return 0;
        const mid = (edge0 + edge1) / 2;
        const halfWidth = (edge1 - edge0) / 2;
        const normalized = (x - mid) / halfWidth; // -1 to 1
        return 1 - normalized * normalized; // parabola peaking at 1
    }

    private sphericalToCartesian(azimuth: number, altitude: number, distance: number): THREE.Vector3 {
        // SunCalc azimuth: 0 = South, positive = West (clockwise from south looking down)
        // Three.js world: +X = East, +Z = South
        // We need to NEGATE azimuth to flip east/west so sun rises in east, sets in west
        const az = -azimuth;
        const x = distance * Math.cos(altitude) * Math.sin(az);
        const y = distance * Math.sin(altitude);
        const z = distance * Math.cos(altitude) * Math.cos(az);
        return new THREE.Vector3(x, y, z);
    }

    setEnabled(enabled: boolean) {
        this.enabled = enabled;

        // Hide celestial bodies when disabled
        if (this.sunMesh) this.sunMesh.visible = enabled;
        if (this.moonMesh) this.moonMesh.visible = enabled;

        // Reset to default daytime lighting when disabled
        if (!enabled) {
            this.sunLight.position.set(2000, 3000, 1500);
            this.sunLight.intensity = 1.5;
            this.sunLight.color.setHex(0xFFF0D0);

            this.moonLight.intensity = 0;

            this.ambientLight.intensity = 0.3;
            this.ambientLight.color.setHex(0xffffff);

            this.hemiLight.intensity = 0.5;
            this.hemiLight.color.setHex(0x87CEEB);
            this.hemiLight.groundColor.setHex(0xC9A66B);

            if (this.fog) {
                this.fog.color.setHex(0x111111);
            }
            (this.scene.background as THREE.Color)?.setHex(0x000000);
        }
    }
}
