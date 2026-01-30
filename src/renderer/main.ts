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
import { Vehicle } from '../entities/Vehicle';
import { Agent } from '../entities/Agent';
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
    // Desert sky - pale blue with warm horizon tint
    const skyColor = 0xB8D4E8; // Pale desert sky
    const horizonColor = 0xE8D4C0; // Warm sandy horizon for fog

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(skyColor);
    scene.fog = new THREE.Fog(horizonColor, 3000, 12000); // Distant fog for desert haze

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
    controls.minDistance = 200;

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

    // Legend - positioned below minimap with compact layout
    const legend = document.createElement('div');
    legend.style.cssText = `
        position: absolute;
        bottom: 250px;
        left: 20px;
        width: 180px;
        background: rgba(30, 25, 20, 0.85);
        color: #E8DFD0;
        padding: 10px 12px;
        border-radius: 8px;
        font-family: system-ui, sans-serif;
        font-size: 10px;
        line-height: 1.4;
        box-shadow: 0 2px 8px rgba(0,0,0,0.4);
    `;
    legend.innerHTML = `
        <div style="font-weight: 600; margin-bottom: 4px; color: #AAA; font-size: 9px; text-transform: uppercase;">Ownership</div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1px 6px; margin-bottom: 6px;">
            <div style="white-space: nowrap;"><span style="color: #3D5C47">■</span> Occupied</div>
            <div style="white-space: nowrap;"><span style="color: #6B4D4D">■</span> Abandoned</div>
            <div style="white-space: nowrap;"><span style="color: #3D4D5C">■</span> For Sale</div>
            <div style="white-space: nowrap;"><span style="color: #4A4A4A">■</span> Empty</div>
        </div>
        <div style="border-top: 1px solid #333; margin: 5px 0;"></div>
        <div style="font-weight: 600; margin-bottom: 4px; color: #AAA; font-size: 9px; text-transform: uppercase;">Entities</div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1px 6px;">
            <div style="white-space: nowrap;"><span style="color: #22CC66">●</span> Resident</div>
            <div style="white-space: nowrap;"><span style="color: #FFAA33">●</span> Tourist</div>
            <div style="white-space: nowrap;"><span style="color: #3366FF">●</span> Police</div>
            <div style="white-space: nowrap;"><span style="color: #CC3333">●</span> Vehicle</div>
        </div>
    `;
    document.body.appendChild(legend);

    // Interaction
    const interactionSystem = new InteractionSystem(camera, scene);

    // Overlay Menu
    const overlayMenu = new OverlayMenu({
        onChange: (overlay: OverlayType, enabled: boolean) => {
            console.log(`Overlay ${overlay}: ${enabled ? 'ON' : 'OFF'}`);
            // Status overlay controls lot visibility (fill + borders)
            if (overlay === 'status') {
                worldRenderer.group.children.forEach(child => {
                    // Check if this is a lot mesh (has userData.type === 'lot')
                    if (child instanceof THREE.Mesh && child.userData?.type === 'lot') {
                        child.visible = enabled;
                    }
                    // Also toggle the border boxes (check for BoxGeometry border segments)
                    if (child instanceof THREE.Mesh && child.geometry instanceof THREE.BoxGeometry) {
                        // Border segments have small height (~5) and thin depth (~1)
                        const params = child.geometry.parameters;
                        if (params && params.height === 5 && params.depth === 1) {
                            child.visible = enabled;
                        }
                    }
                });
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
    const simConfig = { carCount: 30, peopleCount: 20 };
    simFolder.add(simConfig, 'carCount', 0, 100).name('Cars').onFinishChange(spawnEntities);
    simFolder.add(simConfig, 'peopleCount', 0, 100).name('People').onFinishChange(spawnEntities);

    // --- 4. Logic ---
    function spawnEntities() {
        // Clear existing
        agents.forEach(a => worldRenderer.group.remove(a.mesh));
        agents.length = 0;

        spawnVehicles(simConfig.carCount);
        spawnPedestrians(simConfig.peopleCount);
    }

    function spawnVehicles(count: number) {
        for (let i = 0; i < count; i++) {
            const pos = pathSystem.getRandomPointOnRoad();
            const v = new Vehicle({
                id: `car_${i}`,
                type: AgentType.RESIDENT, // Placeholder
                position: pos,
                speed: 50 + Math.random() * 50,
                color: Math.random() < 0.5 ? 0xff0000 : 0xcc0000 // Redish cars
            });
            agents.push(v);
            worldRenderer.group.add(v.mesh);
        }
    }

    function spawnPedestrians(count: number) {
        for (let i = 0; i < count; i++) {
            const pos = pathSystem.getRandomPointOnRoad(); // Walk on roads for now
            // Random Type
            const rand = Math.random();
            let type = AgentType.RESIDENT;
            if (rand > 0.6) type = AgentType.TOURIST;
            if (rand > 0.9) type = AgentType.COP;
            if (rand > 0.95) type = AgentType.DOG;
            if (rand > 0.98) type = AgentType.CAT;

            const agent = new Agent({
                id: `ped_${i}`,
                type: type,
                position: pos,
                speed: 10 + Math.random() * 5, // Slower
            });
            agents.push(agent);
            worldRenderer.group.add(agent.mesh);
        }
    }

    try {
        const response = await fetch('/docs/map_data.json');
        if (!response.ok) throw new Error('Failed to load map data');
        const mapData: MapData = await response.json();

        world.load(mapData);
        worldRenderer.render(world);
        minimap.setWorld(world);

        pathSystem = new PathfindingSystem(world.roads);
        pathSystem.computeAccessPoints(world.lots);
        spawnEntities();

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
