import * as THREE from 'three';
import SunCalc from 'suncalc';
import { TimeSystem } from '../systems/TimeSystem';

// Bombay Beach coordinates
const LAT = 33.3528;
const LNG = -115.7339;

// World center for calculating light positions
const WORLD_CENTER = new THREE.Vector3(1000, 0, 1000);
const LIGHT_DISTANCE = 15000; // Far enough that sun/moon are well above the city

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

    // Street lamps (SpotLights for downward cone)
    // Street lamps (SpotLights for downward cone)
    private streetLamps: THREE.SpotLight[] = [];
    private lampGroup: THREE.Group;
    private bulbMaterial: THREE.MeshStandardMaterial | null = null;

    public enabled: boolean = true;
    public isNight: boolean = false;

    // Custom time override
    public useCustomTime: boolean = false;
    public customHour: number = 18; // 0-24, default 6 PM

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

        // Create moon light (dimmer, blue-ish, desaturated)
        this.moonLight = new THREE.DirectionalLight(0xaaccff, 0.4);
        this.moonLight.castShadow = true;
        this.moonLight.shadow.mapSize.width = 8192;
        this.moonLight.shadow.mapSize.height = 8192;
        this.moonLight.shadow.camera.near = 100;
        this.moonLight.shadow.camera.far = 20000;
        this.moonLight.shadow.camera.left = -3000;
        this.moonLight.shadow.camera.right = 3000;
        this.moonLight.shadow.camera.top = 3000;
        this.moonLight.shadow.camera.bottom = -3000;
        this.moonLight.shadow.bias = -0.0005;
        scene.add(this.moonLight);
        scene.add(this.moonLight.target); // Target must be in scene for shadow direction

        // Create visible sun mesh (large and distant for proper sky effect)
        const sunGeo = new THREE.SphereGeometry(400, 32, 32);
        const sunMat = new THREE.MeshBasicMaterial({ color: 0xffdd66, fog: false });
        this.sunMesh = new THREE.Mesh(sunGeo, sunMat);
        this.sunMesh.name = 'Sun';
        this.sunMesh.frustumCulled = false; // Always render, even when far
        scene.add(this.sunMesh);

        // Create visible moon mesh (slightly smaller than sun)
        const moonGeo = new THREE.SphereGeometry(250, 32, 32);
        const moonMat = new THREE.MeshBasicMaterial({ color: 0xeeeeff, fog: false });
        this.moonMesh = new THREE.Mesh(moonGeo, moonMat);
        this.moonMesh.name = 'Moon';
        this.moonMesh.frustumCulled = false; // Always render, even when far
        scene.add(this.moonMesh);

        // Street lamp group - will be parented to world group later
        this.lampGroup = new THREE.Group();
        this.lampGroup.name = 'StreetLamps';
        // Don't add to scene here - will be added to world group in createStreetLamps
    }

    /**
     * Create sodium street lamps at intersection corners
     * @param intersections - Array of intersection center positions
     * @param parentGroup - The group to add lamps to (usually worldRenderer.group)
     */
    createStreetLamps(intersections: { x: number; y: number }[], parentGroup: THREE.Group) {
        // Remove from previous parent if any
        if (this.lampGroup.parent) {
            this.lampGroup.parent.remove(this.lampGroup);
        }

        // Add to the correct parent (world group)
        parentGroup.add(this.lampGroup);

        // Clear existing content
        while (this.lampGroup.children.length > 0) {
            this.lampGroup.remove(this.lampGroup.children[0]);
        }
        this.streetLamps = [];

        // Filter to every other intersection, place on corners
        const lampPositions: { x: number; y: number; corner: number }[] = [];
        const cornerOffset = 35; // Moved further out from center (was 20)

        let lampCounter = 0;
        intersections.forEach((center, i) => {
            if (i % 4 !== 0) return;

            // Rotate which corner based on lamp counter for variety
            const corner = lampCounter % 4;
            const dx = (corner === 0 || corner === 3) ? -cornerOffset : cornerOffset;
            const dy = (corner === 0 || corner === 1) ? -cornerOffset : cornerOffset;

            lampPositions.push({
                x: center.x + dx,
                y: center.y + dy,
                corner
            });
            lampCounter++;
        });

        const count = lampPositions.length;
        if (count === 0) return;

        // Sodium vapor color (warm orange-yellow)
        const sodiumColor = 0xffa033;
        const poleHeight = 35;
        const armLength = 8;
        const armHeight = poleHeight - 2;
        const fixtureHeight = armHeight - 3;
        const poleRadius = 1.2;

        // Create shared geometries
        const poleGeo = new THREE.CylinderGeometry(poleRadius, poleRadius * 1.3, poleHeight, 8);
        const armGeo = new THREE.CylinderGeometry(poleRadius * 0.6, poleRadius * 0.6, armLength, 6);
        const fixtureGeo = new THREE.ConeGeometry(2.5, 4, 8); // Smaller cone
        const bulbGeo = new THREE.SphereGeometry(1.5, 8, 8); // Smaller bulb

        // Create shared materials
        const poleMat = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.7, roughness: 0.3 });
        const fixtureMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.5, roughness: 0.5 });
        // Use emissive material for bulb so it can be turned on/off
        const bulbMat = new THREE.MeshStandardMaterial({
            color: 0x333333, // Dark when off
            emissive: sodiumColor,
            emissiveIntensity: 0 // Off by default, updated in update()
        });
        this.bulbMaterial = bulbMat; // Store for intensity control

        // Create instanced meshes for poles
        const poleInstanced = new THREE.InstancedMesh(poleGeo, poleMat, count);
        poleInstanced.castShadow = true;
        poleInstanced.receiveShadow = false;

        // Create instanced meshes for arms (horizontal)
        const armInstanced = new THREE.InstancedMesh(armGeo, poleMat, count);
        armInstanced.castShadow = true;
        armInstanced.receiveShadow = false;

        // Create instanced meshes for fixtures
        const fixtureInstanced = new THREE.InstancedMesh(fixtureGeo, fixtureMat, count);
        fixtureInstanced.castShadow = false;
        fixtureInstanced.receiveShadow = false;

        // Create instanced meshes for glowing bulbs
        const bulbInstanced = new THREE.InstancedMesh(bulbGeo, bulbMat, count);
        bulbInstanced.castShadow = false;
        bulbInstanced.receiveShadow = false;

        // Dummy object for matrix calculations
        const dummy = new THREE.Object3D();

        // Set instance matrices and create spot lights
        lampPositions.forEach((pos, i) => {
            // Direction the arm points (toward intersection center)
            const armAngle = (pos.corner * Math.PI / 2) + Math.PI / 4;
            const armDx = Math.sin(armAngle) * (armLength / 2);
            const armDy = Math.cos(armAngle) * (armLength / 2);

            // Pole position (vertical)
            dummy.position.set(pos.x, poleHeight / 2, pos.y);
            dummy.rotation.set(0, 0, 0);
            dummy.scale.set(1, 1, 1);
            dummy.updateMatrix();
            poleInstanced.setMatrixAt(i, dummy.matrix);

            // Arm position (horizontal, pointing inward)
            dummy.position.set(pos.x + armDx, armHeight, pos.y + armDy);
            dummy.rotation.set(0, 0, Math.PI / 2);
            dummy.rotation.y = -armAngle;
            dummy.updateMatrix();
            armInstanced.setMatrixAt(i, dummy.matrix);

            // Fixture position (at end of arm, pointing down)
            const fixX = pos.x + armDx * 2;
            const fixZ = pos.y + armDy * 2;
            dummy.position.set(fixX, fixtureHeight, fixZ);
            dummy.rotation.set(Math.PI, 0, 0); // Cone pointing down
            dummy.updateMatrix();
            fixtureInstanced.setMatrixAt(i, dummy.matrix);

            // Bulb position (inside fixture)
            dummy.position.set(fixX, fixtureHeight - 4, fixZ);
            dummy.rotation.set(0, 0, 0);
            dummy.updateMatrix();
            bulbInstanced.setMatrixAt(i, dummy.matrix);

            // Create spot light pointing down from fixture
            // High intensity, moderate decay for visible pool
            const light = new THREE.SpotLight(sodiumColor, 0, 120, Math.PI / 3, 0.4, 1.2);
            light.position.set(fixX, fixtureHeight - 2, fixZ);
            light.target.position.set(fixX, 0, fixZ);
            light.castShadow = false;
            this.lampGroup.add(light);
            this.lampGroup.add(light.target);
            this.streetLamps.push(light);
        });

        // Update instance matrices
        poleInstanced.instanceMatrix.needsUpdate = true;
        armInstanced.instanceMatrix.needsUpdate = true;
        fixtureInstanced.instanceMatrix.needsUpdate = true;
        bulbInstanced.instanceMatrix.needsUpdate = true;

        // Add instanced meshes to group
        this.lampGroup.add(poleInstanced);
        this.lampGroup.add(armInstanced);
        this.lampGroup.add(fixtureInstanced);
        this.lampGroup.add(bulbInstanced);

        console.log(`[DayNightCycle] Created ${count} street lamps at intersection corners`);
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
        this.sunLight.shadow.camera.updateProjectionMatrix();

        // Update moon light position
        this.moonLight.position.copy(moonPos).add(WORLD_CENTER);
        this.moonLight.target.position.copy(WORLD_CENTER);
        this.moonLight.target.updateMatrixWorld();
        this.moonLight.shadow.camera.updateProjectionMatrix(); // Update moon shadow proj

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

        // Update public isNight flag (sun below horizon with buffer)
        this.isNight = sunAlt < -0.05;

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
        // Smoothly transition intensity and color - Darker at night for better shadows
        const ambientIntensity = 0.04 + dayFactor * 0.26;
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
        const lampIntensity = (1 - dayFactor) * 300.0; // High intensity for visible ground illumination
        this.streetLamps.forEach(lamp => {
            lamp.intensity = lampIntensity;
        });

        // Efficiently update shared bulb material
        if (this.bulbMaterial) {
            this.bulbMaterial.emissiveIntensity = lampIntensity;
        }
    }

    /**
     * Get sun position for a specific hour (for custom time mode)
     */
    getSunPositionForHour(hour: number): { azimuth: number; altitude: number } {
        const baseDate = new Date('2026-06-21T00:00:00');
        const msInDay = hour * 3600 * 1000;
        const date = new Date(baseDate.getTime() + msInDay);
        const pos = SunCalc.getPosition(date, LAT, LNG);
        return { azimuth: pos.azimuth, altitude: pos.altitude };
    }

    /**
     * Get moon position for a specific hour (for custom time mode)
     */
    getMoonPositionForHour(hour: number): { azimuth: number; altitude: number } {
        const baseDate = new Date('2026-06-21T00:00:00');
        const msInDay = hour * 3600 * 1000;
        const date = new Date(baseDate.getTime() + msInDay);
        const pos = SunCalc.getMoonPosition(date, LAT, LNG);
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
