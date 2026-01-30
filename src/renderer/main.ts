import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
// @ts-ignore
import { WebGPURenderer } from 'three/webgpu';
import Stats from 'stats.js';
import GUI from 'lil-gui';

import { World } from '../world/World';
import { WorldRenderer } from './WorldRenderer';
import { TimeSystem } from '../systems/TimeSystem';
import { PathfindingSystem } from '../systems/PathfindingSystem';
import { PopulationSystem } from '../systems/PopulationSystem';
import { Vehicle } from '../entities/Vehicle';
import { Agent } from '../entities/Agent';
import { Resident } from '../entities/Resident';
import { MapData, AgentType } from '../types';
import { Minimap } from './Minimap';
import { InteractionSystem } from '../systems/InteractionSystem';
import { OverlayMenu, OverlayType } from '../ui/OverlayMenu';

async function init() {
    // --- 1. Systems Setup ---
    const timeSystem = new TimeSystem();
    const world = new World();
    const agents: Agent[] = []; // Unified list
    let pathSystem: PathfindingSystem;

    // --- 2. Graphics Setup ---
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000); // Black background
    scene.fog = new THREE.Fog(0x111111, 5000, 15000); // Dark fog

    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 50, 20000);
    camera.position.set(0, 2000, 2000);
    camera.lookAt(0, 0, 0);

    // WebGPU Renderer
    const renderer = new WebGPURenderer({
        antialias: true,
        forceWebGL: false
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(renderer.domElement);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxDistance = 10000;
    controls.minDistance = 50; // Allow closer zoom

    // Camera follow system
    let followTarget: THREE.Object3D | null = null;
    let followOffset = new THREE.Vector3(0, 150, 150); // Offset from target

    // Lights - warm desert sun with proper shadows
    // Ambient: low fill to prevent pure black shadows
    const ambientLight = new THREE.AmbientLight(0xFFFFFF, 0.3);
    scene.add(ambientLight);

    // Hemisphere light for nice sky/ground color blending
    const hemiLight = new THREE.HemisphereLight(
        0x87CEEB, // Sky color (sky blue)
        0xC9A66B, // Ground color (sand/tan)
        0.5
    );
    scene.add(hemiLight);

    // Main directional sun - warm afternoon light with shadows
    const sunLight = new THREE.DirectionalLight(0xFFF0D0, 1.5); // Warm sunlight
    sunLight.position.set(2000, 3000, 1500);
    sunLight.castShadow = true;

    // Shadow configuration for quality
    sunLight.shadow.mapSize.width = 4096;
    sunLight.shadow.mapSize.height = 4096;
    sunLight.shadow.camera.near = 100;
    sunLight.shadow.camera.far = 8000;
    sunLight.shadow.camera.left = -3000;
    sunLight.shadow.camera.right = 3000;
    sunLight.shadow.camera.top = 3000;
    sunLight.shadow.camera.bottom = -3000;
    sunLight.shadow.bias = -0.0005;
    sunLight.shadow.normalBias = 0.02;

    scene.add(sunLight);

    // Secondary fill light from opposite side (softer, no shadows)
    const fillLight = new THREE.DirectionalLight(0xE8F0FF, 0.4); // Cool fill
    fillLight.position.set(-1500, 2000, -1000);
    scene.add(fillLight);

    const stats = new Stats();
    document.body.appendChild(stats.dom);

    const worldRenderer = new WorldRenderer(scene);

    // Minimap
    const minimap = new Minimap(controls, camera);

    // Legend - positioned above minimap
    const legend = document.createElement('div');
    legend.style.cssText = `
        position: absolute;
        bottom: 252px;
        left: 20px;
        background: rgba(30, 25, 20, 0.9);
        color: #CCC;
        padding: 10px 14px;
        border-radius: 8px;
        font-family: system-ui, sans-serif;
        font-size: 11px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.4);
    `;
    legend.innerHTML = `
        <div style="margin-bottom: 8px;">
            <div style="color: #777; font-size: 9px; text-transform: uppercase; margin-bottom: 4px;">Lots</div>
            <div style="display: flex; gap: 10px; flex-wrap: nowrap;">
                <span><span style="color: #5A8A6A">■</span> Occupied</span>
                <span><span style="color: #8A6A6A">■</span> Abandoned</span>
                <span><span style="color: #5A6A8A">■</span> ForSale</span>
                <span><span style="color: #6A6A6A">■</span> Empty</span>
            </div>
        </div>
        <div>
            <div style="color: #777; font-size: 9px; text-transform: uppercase; margin-bottom: 4px;">People & Cars</div>
            <div style="display: flex; gap: 8px; flex-wrap: nowrap;">
                <span><span style="color: #22CC66">●</span> Resident</span>
                <span><span style="color: #FFAA33">●</span> Tourist</span>
                <span><span style="color: #CC3333">■</span> Local Car</span>
                <span><span style="color: #4ECDC4">■</span> Tourist Car</span>
            </div>
        </div>
    `;
    document.body.appendChild(legend);

    // Interaction
    const interactionSystem = new InteractionSystem(camera, scene);

    // Subscribe to follow events
    interactionSystem.onFollow((target) => {
        followTarget = target;
        if (target) {
            // Store current camera offset from target
            followOffset.copy(camera.position).sub(target.position);
            followOffset.y = Math.max(50, followOffset.y); // Keep camera above
        }
    });

    // Escape key to unfollow
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && followTarget) {
            followTarget = null;
            console.log('Camera unfollowed');
        }
    });

    // Follow indicator UI
    const followIndicator = document.createElement('div');
    followIndicator.style.cssText = `
        position: absolute;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0,0,0,0.8);
        color: #4db8ff;
        padding: 8px 16px;
        border-radius: 20px;
        font-family: system-ui, sans-serif;
        font-size: 12px;
        display: none;
        z-index: 100;
    `;
    followIndicator.innerHTML = '📍 Following - Press <kbd style="background:#333;padding:2px 6px;border-radius:3px;">ESC</kbd> to stop';
    document.body.appendChild(followIndicator);

    // Neutral grey material for when status overlay is off
    const neutralLotMaterial = new THREE.MeshStandardMaterial({
        color: 0x606060,
        roughness: 0.8,
        metalness: 0.0,
    });

    // Overlay Menu
    const overlayMenu = new OverlayMenu({
        onChange: (overlay: OverlayType, enabled: boolean) => {
            console.log(`Overlay ${overlay}: ${enabled ? 'ON' : 'OFF'}`);
            // Status overlay controls lot coloring (colored vs grey)
            if (overlay === 'status') {
                worldRenderer.group.children.forEach(child => {
                    // Check if this is a lot mesh (has userData.type === 'lot')
                    if (child instanceof THREE.Mesh && child.userData?.type === 'lot') {
                        if (enabled) {
                            // Restore original material based on lot state
                            const lot = child.userData.data;
                            child.material = worldRenderer.getLotMaterialPublic(lot);
                        } else {
                            // Use neutral grey
                            child.material = neutralLotMaterial;
                        }
                    }
                });
                // Toggle minimap mode: overlay when enabled, grid when disabled
                minimap.setMode(enabled ? 'overlay' : 'grid');
            }
        }
    });

    // --- 3. UI Setup ---
    const gui = new GUI();
    const state = {
        paused: false,
        timeSpeed: 60
    };

    const timeFolder = gui.addFolder('Time');
    timeFolder.add(state, 'timeSpeed', 0, 3600).name('Time Speed').onChange((v: number) => {
        timeSystem.time.speed = v;
    });
    timeFolder.add(state, 'paused').name('Pause Simulation');

    const timeDisplay = { str: 'Day 1 08:00' };
    timeFolder.add(timeDisplay, 'str').name('Clock').disable().listen();

    const simFolder = gui.addFolder('Simulation');
    const simConfig = { residentCount: 250, touristCount: 30 };
    simFolder.add(simConfig, 'residentCount', 0, 500).name('Residents').onFinishChange(spawnPopulation);
    simFolder.add(simConfig, 'touristCount', 0, 100).name('Tourists').onFinishChange(spawnPopulation);

    // --- 4. Logic ---
    let populationSystem: PopulationSystem;

    function spawnPopulation() {
        if (!populationSystem) return;

        // Clear existing
        agents.forEach(a => {
            worldRenderer.group.remove(a.mesh);
            if (a instanceof Vehicle && a.carGroup) {
                worldRenderer.group.remove(a.carGroup);
            }
        });
        agents.length = 0;

        const pop = populationSystem.populate({
            residentCount: simConfig.residentCount,
            touristCount: simConfig.touristCount
        });

        // Add residents to scene
        pop.residents.forEach(r => {
            agents.push(r);
            worldRenderer.group.add(r.mesh);
        });

        // Add tourists to scene (position them on roads)
        pop.tourists.forEach(t => {
            t.position.copy(pathSystem.getRandomPointOnRoad());
            t.updateMesh();
            agents.push(t);
            worldRenderer.group.add(t.mesh);
        });

        // Add vehicles to scene
        pop.vehicles.forEach(v => {
            v.position.copy(pathSystem.getRandomPointOnRoad());
            v.updateMesh();
            agents.push(v);
            worldRenderer.group.add(v.carGroup);
        });
    }

    try {
        const response = await fetch('/docs/map_data.json');
        if (!response.ok) throw new Error('Failed to load map data');
        const mapData: MapData = await response.json();

        world.load(mapData);
        worldRenderer.render(world);
        minimap.setWorld(world);

        // Apply initial clean state (no overlays active)
        worldRenderer.group.children.forEach(child => {
            if (child instanceof THREE.Mesh && child.userData?.type === 'lot') {
                child.material = neutralLotMaterial;
            }
        });
        minimap.setMode('grid');

        pathSystem = new PathfindingSystem(world.roads);
        pathSystem.computeAccessPoints(world.lots);

        // Initialize population system
        populationSystem = new PopulationSystem(world.lots);
        spawnPopulation();

    } catch (error) {
        console.error('Error loading map:', error);
    }

    // Resize
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    const clock = new THREE.Clock();

    // Animation Loop
    function animate() {
        const delta = clock.getDelta();

        if (!state.paused) {
            timeSystem.update(delta);
            timeDisplay.str = timeSystem.getTimeString();

            if (pathSystem) {
                // Scale movement by Time Speed
                // If speed = 60, scale = 1. If speed = 120, scale = 2.
                const timeScale = state.timeSpeed / 60;

                pathSystem.updateTraffic(agents, delta * timeScale);
                agents.forEach(a => a.update(delta * timeScale));
            }
        }

        // Camera follow logic
        if (followTarget) {
            followIndicator.style.display = 'block';
            // Smoothly move camera to follow target
            const targetPos = followTarget.position.clone().add(followOffset);
            camera.position.lerp(targetPos, 0.05);
            controls.target.lerp(followTarget.position, 0.05);
        } else {
            followIndicator.style.display = 'none';
        }

        controls.update();
        stats.update();

        // Render 3D
        renderer.render(scene, camera);

        // Render Minimap
        minimap.update(agents);

        // Interaction
        interactionSystem.update([worldRenderer.group, ...agents.map(a => a.mesh)]);
    }

    // Use setAnimationLoop for WebGPU/XR
    renderer.setAnimationLoop(animate);
}

init();
