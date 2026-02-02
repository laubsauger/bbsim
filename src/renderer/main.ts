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
import { AddressSystem } from '../systems/AddressSystem';
import { Vehicle } from '../entities/Vehicle';
import { Agent } from '../entities/Agent';
import { Resident } from '../entities/Resident';
import { MapData, AgentType } from '../types';
import { Minimap } from './Minimap';
import { InteractionSystem } from '../systems/InteractionSystem';
import { OverlayMenu, OverlayType } from '../ui/OverlayMenu';
import { EntityExplorer } from '../ui/EntityExplorer';
import { SelectionHighlighter } from '../ui/SelectionHighlighter';
import { Topbar, FocusMode } from '../ui/Topbar';
import { TouristSystem } from '../systems/TouristSystem';
import { ResidentScheduleSystem } from '../systems/ResidentScheduleSystem';
import { EventSystem } from '../systems/EventSystem';
import { SchoolBusSystem } from '../systems/SchoolBusSystem';
import { SheriffSystem } from '../systems/SheriffSystem';
import { EventLog } from '../ui/EventLog';
import { SchoolBus } from '../entities/SchoolBus';

async function init() {
    // --- 1. Systems Setup ---
    const timeSystem = new TimeSystem();
    const world = new World();
    const agents: Agent[] = []; // Unified list
    let pathSystem: PathfindingSystem;
    let touristSystem: TouristSystem | null = null;
    let residentScheduleSystem: ResidentScheduleSystem | null = null;
    let addressSystem: AddressSystem;
    let eventSystem: EventSystem;
    let schoolBusSystem: SchoolBusSystem | null = null;
    let sheriffSystem: SheriffSystem | null = null;
    let eventLog: EventLog;

    // --- 2. Graphics Setup ---
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000); // Black background
    scene.fog = new THREE.Fog(0x111111, 5000, 15000); // Dark fog

    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 50, 20000);
    // Position camera south of the world, looking north (World is 0-2000 in Z)
    // Center is roughly (1000, 0, 1000)
    camera.position.set(1000, 2000, 3500);  // South of the map (Z > 2000)
    camera.lookAt(1000, 0, 1000);  // Look at map center

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
    controls.screenSpacePanning = false; // Pan in XZ plane (better for maps)
    controls.maxDistance = 6000;
    controls.minDistance = 15; // Allow very close zoom
    controls.maxPolarAngle = Math.PI / 2 - 0.05; // Don't go below ground
    controls.target.set(1000, 0, 1000);  // Match the camera lookAt target

    // Camera follow system
    let followTarget: THREE.Object3D | null = null;
    let followLastPos: THREE.Vector3 | null = null;
    let followActive = false;
    let pendingFollowTarget: THREE.Object3D | null = null;
    let worldBounds: { minX: number; maxX: number; minZ: number; maxZ: number } | null = null;
    const followOffsets = {
        resident: { distance: 90, height: 38, side: 14 },
        vehicle: { distance: 120, height: 50, side: 20 },
        agent: { distance: 95, height: 40, side: 14 },
    };

    const cameraJump = {
        active: false,
        startPos: new THREE.Vector3(),
        endPos: new THREE.Vector3(),
        startTarget: new THREE.Vector3(),
        endTarget: new THREE.Vector3(),
        elapsed: 0,
        duration: 0.45,
        onComplete: null as null | (() => void),
        controlsWasEnabled: true,
    };

    const followTransition = {
        active: false,
        startPos: new THREE.Vector3(),
        endPos: new THREE.Vector3(),
        startTarget: new THREE.Vector3(),
        endTarget: new THREE.Vector3(),
        elapsed: 0,
        duration: 0.35,
    };

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
    sunLight.shadow.mapSize.width = 8192;
    sunLight.shadow.mapSize.height = 8192;
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
    const selectionHighlighter = new SelectionHighlighter(worldRenderer.group);
    const spawnDebugGroup = new THREE.Group();
    spawnDebugGroup.name = 'SpawnDebug';
    worldRenderer.group.add(spawnDebugGroup);

    const formatBounds = (bounds: { minX: number; maxX: number; minY: number; maxY: number } | null) => {
        if (!bounds) return 'null';
        return `x:[${bounds.minX.toFixed(1)}, ${bounds.maxX.toFixed(1)}] y:[${bounds.minY.toFixed(1)}, ${bounds.maxY.toFixed(1)}]`;
    };

    const computeAgentBounds = (items: { position: THREE.Vector3 }[]) => {
        if (items.length === 0) return null;
        let minX = Infinity;
        let maxX = -Infinity;
        let minZ = Infinity;
        let maxZ = -Infinity;
        items.forEach(item => {
            const p = item.position;
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.z < minZ) minZ = p.z;
            if (p.z > maxZ) maxZ = p.z;
        });
        return { minX, maxX, minZ, maxZ };
    };

    const logDiagnostics = (label: string, data: {
        worldBounds?: { minX: number; maxX: number; minY: number; maxY: number };
        groupPos?: THREE.Vector3;
        roadBounds?: { minX: number; maxX: number; minY: number; maxY: number } | null;
        pedBounds?: { minX: number; maxX: number; minY: number; maxY: number } | null;
        agentBounds?: { minX: number; maxX: number; minZ: number; maxZ: number } | null;
        worldBoundsCentered?: { minX: number; maxX: number; minZ: number; maxZ: number } | null;
        sampleAgents?: { id: string; x: number; z: number; svgX: number; svgY: number; inBounds: boolean }[];
    }) => {
        console.warn(`[Diagnostics] ${label}`);
        if (data.worldBounds) {
            console.warn(`  world(svg): ${formatBounds(data.worldBounds)}`);
        }
        if (data.groupPos) {
            console.warn(`  world group position: x=${data.groupPos.x.toFixed(1)} y=${data.groupPos.y.toFixed(1)} z=${data.groupPos.z.toFixed(1)}`);
        }
        if (data.worldBoundsCentered) {
            console.warn(`  world(centered): x:[${data.worldBoundsCentered.minX.toFixed(1)}, ${data.worldBoundsCentered.maxX.toFixed(1)}] z:[${data.worldBoundsCentered.minZ.toFixed(1)}, ${data.worldBoundsCentered.maxZ.toFixed(1)}]`);
        }
        if (data.roadBounds) {
            console.warn(`  road graph(svg): ${formatBounds(data.roadBounds)}`);
        }
        if (data.pedBounds) {
            console.warn(`  ped graph(svg): ${formatBounds(data.pedBounds)}`);
        }
        if (data.agentBounds) {
            console.warn(`  agents(world): x:[${data.agentBounds.minX.toFixed(1)}, ${data.agentBounds.maxX.toFixed(1)}] z:[${data.agentBounds.minZ.toFixed(1)}, ${data.agentBounds.maxZ.toFixed(1)}]`);
        }
        if (data.sampleAgents && data.sampleAgents.length > 0) {
            data.sampleAgents.forEach(agent => {
                console.warn(`  agent ${agent.id}: world(x=${agent.x.toFixed(1)}, z=${agent.z.toFixed(1)}) svg(x=${agent.svgX.toFixed(1)}, y=${agent.svgY.toFixed(1)}) inBounds=${agent.inBounds}`);
            });
        }
    };

    // Minimap
    const minimap = new Minimap(controls, camera);

    // Legend - positioned above minimap (minimap is 300px + 12px from bottom)
    const legend = document.createElement('div');
    legend.style.cssText = `
        position: absolute;
        bottom: 320px;
        left: 12px;
        background: rgba(30, 25, 20, 0.9);
        color: #CCC;
        padding: 8px 12px;
        border-radius: 6px;
        font-family: system-ui, sans-serif;
        font-size: 10px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.4);
    `;
    legend.innerHTML = `
        <div style="margin-bottom: 6px;">
            <div style="color: #777; font-size: 9px; text-transform: uppercase; margin-bottom: 3px;">Status</div>
            <div style="display: flex; gap: 8px; flex-wrap: nowrap;">
                <span><span style="color: #5A8A6A">■</span> Occupied</span>
                <span><span style="color: #8A6A6A">■</span> Abandoned</span>
                <span><span style="color: #5A6A8A">■</span> ForSale</span>
                <span><span style="color: #6A6A6A">■</span> Empty</span>
            </div>
        </div>
        <div style="margin-bottom: 6px;">
            <div style="color: #777; font-size: 9px; text-transform: uppercase; margin-bottom: 3px;">Zoning</div>
            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                <span><span style="color: #4A7A4A">■</span> Residential</span>
                <span><span style="color: #7A5A3A">■</span> Commercial</span>
                <span><span style="color: #5A5A7A">■</span> Public</span>
                <span><span style="color: #6A4A6A">■</span> Lodging</span>
                <span><span style="color: #CD853F">■</span> Bar</span>
                <span><span style="color: #8A7A9A">■</span> Church</span>
                <span><span style="color: #3A3A3A">■</span> Parking</span>
                <span><span style="color: #5A5A5A">■</span> Vacant</span>
            </div>
        </div>
        <div>
            <div style="color: #777; font-size: 9px; text-transform: uppercase; margin-bottom: 3px;">Entities</div>
            <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                <span><span style="color: #22CC66">●</span> Resident</span>
                <span><span style="color: #FFAA33">●</span> Tourist</span>
                <span><span style="color: #CD853F">●</span> Dog</span>
                <span><span style="color: #E8E8E8">●</span> Cat</span>
                <span><span style="color: #CC3333">■</span> Car</span>
                <span><span style="color: #4ECDC4">■</span> Rental</span>
                <span><span style="color: #5B8DEE">■</span> Sheriff</span>
                <span><span style="color: #FFB800">■</span> Bus</span>
            </div>
        </div>
    `;
    document.body.appendChild(legend);

    // Interaction
    const interactionSystem = new InteractionSystem(camera, scene);

    // Entity Explorer
    let focusMode: FocusMode = 'both';
    const entityExplorer = new EntityExplorer({
        onSelect: (entity) => {
            const shouldJump = focusMode === 'jump' || focusMode === 'both';
            const shouldFollow = focusMode === 'follow' || focusMode === 'both';
            if (entity && shouldJump) {
                jumpToEntity(entity);
            }
            interactionSystem.selectEntity(entity, { emitSelect: false, emitFollow: shouldFollow });
        }
    });

    // Subscribe to follow events
    let followEntityType: 'resident' | 'vehicle' | 'agent' | null = null;
    interactionSystem.onFollow((target, entity) => {
        if (!target) {
            followTarget = null;
            followLastPos = null;
            followActive = false;
            pendingFollowTarget = null;
            followEntityType = null;
            return;
        }

        if (followTarget !== target) {
            followTarget = target;
            followLastPos = null;
            followActive = true;
            followEntityType = (entity?.type as 'resident' | 'vehicle' | 'agent') || 'agent';
            if (cameraJump.active) {
                pendingFollowTarget = target;
            } else {
                startFollowTransition(target);
            }
        }
    });

    interactionSystem.onSelect((entity) => {
        entityExplorer.setSelected(entity);
        selectionHighlighter.setSelection(entity);
    });

    // Escape key to unfollow
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && followTarget) {
            followTarget = null;
            followLastPos = null;
            followActive = false;
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

    // Zoning overlay colors (used as subtle emissive tint)
    const zoningColors: Record<string, number> = {
        residential: 0x4A7A4A,
        commercial: 0x7A5A3A,
        public: 0x5A5A7A,
        lodging: 0x6A4A6A,
        bar: 0xCD853F,
        church: 0x8A7A9A,
        parking: 0x3A3A3A,
        vacant: 0x5A5A5A,
    };

    const applyLotMaterials = () => {
        worldRenderer.group.children.forEach(child => {
            if (!(child instanceof THREE.Mesh) || child.userData?.type !== 'lot') return;
            const lot = child.userData.data;
            const baseMaterial = overlayMenu.state.status
                ? worldRenderer.getLotMaterialPublic(lot)
                : neutralLotMaterial;

            if (child.userData?.customMaterial) {
                child.material.dispose();
                child.userData.customMaterial = false;
            }

            if (overlayMenu.state.zoning) {
                const usage = lot.usage || 'vacant';
                const tint = zoningColors[usage] || zoningColors.vacant;
                const mat = baseMaterial.clone();
                mat.color = baseMaterial.color.clone().lerp(new THREE.Color(tint), 0.15);
                mat.emissive = new THREE.Color(tint);
                mat.emissiveIntensity = 0.28;
                child.material = mat;
                child.userData.customMaterial = true;
            } else {
                child.material = baseMaterial;
            }
        });
    };

    const state = {
        paused: false,
        timeSpeed: 60
    };

    // Overlay Menu
    const overlayMenu = new OverlayMenu({
        onChange: (overlay: OverlayType, enabled: boolean) => {
            console.log(`Overlay ${overlay}: ${enabled ? 'ON' : 'OFF'}`);
            // Status overlay controls lot coloring (colored vs grey)
            if (overlay === 'status') {
                applyLotMaterials();
                // Toggle minimap mode: overlay when enabled, grid when disabled
                minimap.setMode(enabled ? 'overlay' : 'grid');
            }
            // Addresses overlay controls street name labels
            if (overlay === 'addresses') {
                if (enabled && addressSystem) {
                    const labels = addressSystem.createStreetLabels();
                    // Add to worldRenderer.group so labels align with the centered world
                    worldRenderer.group.add(labels);
                } else if (addressSystem) {
                    addressSystem.removeStreetLabels();
                }
            }
            // Zoning overlay colors lots by usage type
            if (overlay === 'zoning') {
                applyLotMaterials();
            }
        }
    });

    // Event Log
    eventLog = new EventLog();

    // Event System
    eventSystem = new EventSystem();
    eventSystem.onAny((event, day) => {
        eventLog.addTownEvent(event, day, timeSystem.time.totalSeconds);
    });

    const topbar = new Topbar({
        onToggleOverlay: (visible) => {
            overlayMenu.container.style.display = visible ? 'flex' : 'none';
        },
        onToggleMinimap: (visible) => {
            minimap.setVisible(visible);
            legend.style.display = visible ? 'block' : 'none';
        },
        onToggleExplorer: (visible) => {
            entityExplorer.setVisible(visible);
        },
        onToggleEventLog: (visible) => {
            eventLog.setVisible(visible);
        },
        onToggleHighlights: (enabled) => {
            selectionHighlighter.setEnabled(enabled);
        },
        onSpeedChange: (speed) => {
            timeSystem.time.speed = speed;
            state.timeSpeed = speed;
        },
        onFocusModeChange: (mode) => {
            focusMode = mode;
        },
        onTrespassChange: (chances) => {
            if (pathSystem) {
                pathSystem.setTrespassChances(chances);
            }
        },
        onSidewalkOffsetChange: (offset) => {
            if (pathSystem) {
                pathSystem.setSidewalkOffset(offset);
            }
        },
    });

    // --- 3. UI Setup ---
    const gui = new GUI();

    const timeFolder = gui.addFolder('Time');
    timeFolder.add(state, 'timeSpeed', 0, 36000).name('Time Speed').onChange((v: number) => {
        timeSystem.time.speed = v;
        topbar.setSpeed(v);
    });
    timeFolder.add(state, 'paused').name('Pause Simulation');

    const timeDisplay = { str: 'Day 1 08:00' };
    timeFolder.add(timeDisplay, 'str').name('Clock').disable().listen();
    topbar.setTimeLabel(timeDisplay.str);
    topbar.setSpeed(state.timeSpeed);

    const simFolder = gui.addFolder('Simulation');
    const simConfig = { residentCount: 250, touristCount: 30 };
    simFolder.add(simConfig, 'residentCount', 0, 500).name('Residents').onFinishChange(spawnPopulation);
    simFolder.add(simConfig, 'touristCount', 0, 100).name('Tourists').onFinishChange(spawnPopulation);

    // Debug folder
    const debugFolder = gui.addFolder('Debug');
    const debugConfig = { showRoadGraph: false, showPedGraph: false, showSpawnPoints: false };
    debugFolder.add(debugConfig, 'showRoadGraph').name('Show Road Graph').onChange((show: boolean) => {
        if (show && pathSystem) {
            const debugVis = pathSystem.getDebugVisualization();
            worldRenderer.group.add(debugVis);
            console.log('[Debug] Road graph visualization enabled');
        } else if (pathSystem) {
            pathSystem.removeDebugVisualization();
            console.log('[Debug] Road graph visualization disabled');
        }
    });
    debugFolder.add(debugConfig, 'showPedGraph').name('Show Ped Graph').onChange((show: boolean) => {
        if (show && pathSystem) {
            const debugVis = pathSystem.getPedestrianDebugVisualization();
            worldRenderer.group.add(debugVis);
            console.log('[Debug] Pedestrian graph visualization enabled');
        } else if (pathSystem) {
            pathSystem.removePedestrianDebugVisualization();
            console.log('[Debug] Pedestrian graph visualization disabled');
        }
    });
    debugFolder.add(debugConfig, 'showSpawnPoints').name('Show Spawn Points').onChange((show: boolean) => {
        spawnDebugGroup.visible = show;
    });

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
            addSpawnMarker(r.position, 0x22CC66);
        });

        // Add vehicles to scene
        pop.vehicles.forEach(v => {
            // Only reposition tourist cars to roads - resident cars stay at their lot parking spots
            if (v.isTouristCar) {
                v.position.copy(pathSystem.getRandomPointOnRoad());
                v.updateMesh();
            }
            agents.push(v);
            worldRenderer.group.add(v.carGroup);
            addSpawnMarker(v.position, v.isTouristCar ? 0x4ECDC4 : 0xCC3333);
        });

        // Add pets (dogs/cats)
        pop.pets.forEach(pet => {
            agents.push(pet);
            worldRenderer.group.add(pet.mesh);
            addSpawnMarker(pet.position, pet.type === AgentType.DOG ? 0xCD853F : 0xE8E8E8);
        });

        entityExplorer.setData({
            residents: pop.residents,
            vehicles: pop.vehicles,
            lots: world.lots,
            tourists: pop.tourists,
        });

        selectionHighlighter.setData(pop.residents, pop.vehicles, world.lots);

        if (touristSystem) {
            touristSystem.clear();
            touristSystem.setTargetCount(simConfig.touristCount);
        }

        const agentBounds = computeAgentBounds(agents);
        const sampleAgents = agents.slice(0, 5).map(agent => {
            const svgX = agent.position.x;
            const svgY = agent.position.z;
            const inBounds = svgX >= world.bounds.minX && svgX <= world.bounds.maxX && svgY >= world.bounds.minY && svgY <= world.bounds.maxY;
            return { id: agent.id, x: agent.position.x, z: agent.position.z, svgX, svgY, inBounds };
        });
        logDiagnostics('Post-spawn bounds', { agentBounds, sampleAgents });
    }

    try {
        const response = await fetch('/docs/map_data.json');
        if (!response.ok) throw new Error('Failed to load map data');
        const mapData: MapData = await response.json();

        world.load(mapData);
        worldRenderer.render(world);
        minimap.setWorld(world);
        worldBounds = {
            minX: world.bounds.minX + worldRenderer.group.position.x,
            maxX: world.bounds.maxX + worldRenderer.group.position.x,
            minZ: world.bounds.minY + worldRenderer.group.position.z,
            maxZ: world.bounds.maxY + worldRenderer.group.position.z,
        };

        // Apply initial clean state (respect overlays)
        applyLotMaterials();
        minimap.setMode('grid');

        pathSystem = new PathfindingSystem(world.roads);
        pathSystem.computeAccessPoints(world.lots);
        const centeredBounds = {
            minX: world.bounds.minX + worldRenderer.group.position.x,
            maxX: world.bounds.maxX + worldRenderer.group.position.x,
            minZ: world.bounds.minY + worldRenderer.group.position.z,
            maxZ: world.bounds.maxY + worldRenderer.group.position.z,
        };
        logDiagnostics('World + graphs', {
            worldBounds: world.bounds,
            groupPos: worldRenderer.group.position,
            worldBoundsCentered: centeredBounds,
            roadBounds: pathSystem.graph.getBounds(),
            pedBounds: pathSystem.pedestrianGraph.getBounds(),
        });

        // Initialize address system
        addressSystem = new AddressSystem(world.roads);
        addressSystem.assignAddressesToLots(world.lots);

        // Initialize population system
        populationSystem = new PopulationSystem(world.lots, pathSystem);
        spawnPopulation();

        touristSystem = new TouristSystem({
            lots: world.lots,
            pathSystem,
            worldBounds: world.bounds,
            onAddAgent: (agent) => {
                agents.push(agent as any);
                if (agent instanceof Vehicle) {
                    worldRenderer.group.add(agent.carGroup);
                    addSpawnMarker(agent.position, agent.isTouristCar ? 0x4ECDC4 : 0xCC3333);
                } else {
                    worldRenderer.group.add((agent as any).mesh);
                    const color = (agent as any).type === AgentType.TOURIST ? 0xFFAA33 : 0x22CC66;
                    addSpawnMarker((agent as any).position, color);
                }
            },
            onRemoveAgent: (agent) => {
                const idx = agents.indexOf(agent as any);
                if (idx >= 0) agents.splice(idx, 1);
                if (agent instanceof Vehicle) {
                    worldRenderer.group.remove(agent.carGroup);
                } else {
                    worldRenderer.group.remove((agent as any).mesh);
                }
            }
        });

        residentScheduleSystem = new ResidentScheduleSystem({
            lots: world.lots,
            pathSystem,
            worldBounds: world.bounds,
        });

        // School Bus System
        schoolBusSystem = new SchoolBusSystem({
            lots: world.lots,
            pathSystem,
            eventSystem,
            worldBounds: world.bounds,
            onAddAgent: (agent) => {
                agents.push(agent as any);
                if (agent instanceof SchoolBus) {
                    worldRenderer.group.add(agent.busGroup);
                    eventLog.addArrival('school_bus', 'School Bus', timeSystem.time.day, timeSystem.time.totalSeconds);
                } else {
                    worldRenderer.group.add((agent as any).mesh);
                }
            },
            onRemoveAgent: (agent) => {
                const idx = agents.indexOf(agent as any);
                if (idx >= 0) agents.splice(idx, 1);
                if (agent instanceof SchoolBus) {
                    worldRenderer.group.remove(agent.busGroup);
                    eventLog.addDeparture('school_bus', 'School Bus', timeSystem.time.day, timeSystem.time.totalSeconds);
                } else {
                    worldRenderer.group.remove((agent as any).mesh);
                }
            }
        });

        // Sheriff System
        sheriffSystem = new SheriffSystem({
            lots: world.lots,
            pathSystem,
            eventSystem,
            worldBounds: world.bounds,
            onAddAgent: (agent) => {
                agents.push(agent as any);
                if (agent instanceof Vehicle) {
                    worldRenderer.group.add(agent.carGroup);
                    eventLog.addArrival('sheriff', 'Sheriff', timeSystem.time.day, timeSystem.time.totalSeconds);
                } else {
                    worldRenderer.group.add((agent as any).mesh);
                }
            },
            onRemoveAgent: (agent) => {
                const idx = agents.indexOf(agent as any);
                if (idx >= 0) agents.splice(idx, 1);
                if (agent instanceof Vehicle) {
                    worldRenderer.group.remove(agent.carGroup);
                    eventLog.addDeparture('sheriff', 'Sheriff', timeSystem.time.day, timeSystem.time.totalSeconds);
                } else {
                    worldRenderer.group.remove((agent as any).mesh);
                }
            }
        });

        if (touristSystem) {
            touristSystem.setTargetCount(simConfig.touristCount);
        }

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
            topbar.setTimeLabel(timeDisplay.str);

            if (pathSystem) {
                // Scale movement by Time Speed
                // If speed = 60, scale = 1. If speed = 120, scale = 2.
                const timeScale = state.timeSpeed / 60;

                pathSystem.updateTraffic(agents, delta * timeScale);
                agents.forEach(a => a.update(delta * timeScale));

                if (touristSystem) {
                    touristSystem.update(timeSystem.time.totalSeconds, delta * timeScale, timeSystem.time.hour);
                }
                if (residentScheduleSystem) {
                    // Set day of week (0=Sunday, 1=Monday, etc.) based on game day
                    residentScheduleSystem.setDayOfWeek(timeSystem.time.day % 7);
                    residentScheduleSystem.update(timeSystem.time.totalSeconds, timeSystem.time.hour, populationSystem.residents, timeSystem.time.day);
                }
                if (pathSystem) {
                    pathSystem.setCurrentHour(timeSystem.time.hour);
                }

                // Update event system and scheduled systems
                eventSystem.update(
                    timeSystem.time.totalSeconds,
                    timeSystem.time.day,
                    timeSystem.time.hour,
                    timeSystem.time.minute
                );
                if (schoolBusSystem) {
                    schoolBusSystem.update(timeSystem.time.totalSeconds, delta * timeScale);
                }
                if (sheriffSystem) {
                    sheriffSystem.update(timeSystem.time.totalSeconds, delta * timeScale);
                }
            }
        }

        // Camera follow logic
        if (cameraJump.active) {
            cameraJump.elapsed += delta;
            const t = Math.min(1, cameraJump.elapsed / cameraJump.duration);
            const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
            camera.position.lerpVectors(cameraJump.startPos, cameraJump.endPos, eased);
            controls.target.lerpVectors(cameraJump.startTarget, cameraJump.endTarget, eased);
            if (t >= 1) {
                cameraJump.active = false;
                controls.enabled = cameraJump.controlsWasEnabled;
                if (pendingFollowTarget) {
                    startFollowTransition(pendingFollowTarget);
                    pendingFollowTarget = null;
                }
                if (cameraJump.onComplete) cameraJump.onComplete();
            }
        }

        if (followTransition.active) {
            followTransition.elapsed += delta;
            const t = Math.min(1, followTransition.elapsed / followTransition.duration);
            const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
            camera.position.lerpVectors(followTransition.startPos, followTransition.endPos, eased);
            controls.target.lerpVectors(followTransition.startTarget, followTransition.endTarget, eased);
            if (t >= 1) {
                followTransition.active = false;
            }
        }

        if (followTarget && followActive && !cameraJump.active && !followTransition.active) {
            followIndicator.style.display = 'block';
            const targetPos = new THREE.Vector3();
            followTarget.getWorldPosition(targetPos);
            if (!followLastPos) {
                followLastPos = targetPos.clone();
            } else {
                const deltaMove = targetPos.clone().sub(followLastPos);
                camera.position.add(deltaMove);
                followLastPos.copy(targetPos);
            }
            controls.target.lerp(targetPos, 0.35);
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

        // Selection highlight
        selectionHighlighter.update(delta);
    }

    // Use setAnimationLoop for WebGPU/XR
    renderer.setAnimationLoop(animate);

    function addSpawnMarker(position: THREE.Vector3, color: number) {
        const geometry = new THREE.SphereGeometry(6, 10, 10);
        const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.copy(position);
        mesh.position.y = 6;
        spawnDebugGroup.add(mesh);
        spawnDebugGroup.visible = debugConfig.showSpawnPoints;
    }

    function getShoulderPose(target: THREE.Object3D): { pos: THREE.Vector3; target: THREE.Vector3 } {
        const targetPos = new THREE.Vector3();
        target.getWorldPosition(targetPos);
        const targetQuat = new THREE.Quaternion();
        target.getWorldQuaternion(targetQuat);
        const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(targetQuat);
        forward.y = 0;
        if (forward.lengthSq() < 0.0001) {
            forward.set(0, 0, 1);
        }
        forward.normalize();
        const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
        const offsets = followEntityType ? followOffsets[followEntityType] : followOffsets.agent;
        const offset = forward.clone().multiplyScalar(-offsets.distance)
            .add(new THREE.Vector3(0, offsets.height, 0))
            .add(right.multiplyScalar(offsets.side));
        return {
            pos: clampCameraPosition(targetPos.clone().add(offset)),
            target: targetPos.clone()
        };
    }

    function setShoulderCamera(target: THREE.Object3D) {
        const pose = getShoulderPose(target);
        camera.position.copy(pose.pos);
        controls.target.copy(pose.target);
        followLastPos = pose.target.clone();
    }

    function startFollowTransition(target: THREE.Object3D) {
        const pose = getShoulderPose(target);
        followTransition.active = true;
        followTransition.elapsed = 0;
        followTransition.startPos.copy(camera.position);
        followTransition.endPos.copy(pose.pos);
        followTransition.startTarget.copy(controls.target);
        followTransition.endTarget.copy(pose.target);
        followLastPos = pose.target.clone();
    }

    function jumpToEntity(entity: { type: string; data: any }) {
        const targetPos = getEntityFocusPosition(entity);
        const targetLook = targetPos.clone();
        const cameraPos = clampCameraPosition(getEntityCameraPosition(entity, targetPos));

        cameraJump.active = true;
        cameraJump.elapsed = 0;
        cameraJump.duration = 0.45;
        cameraJump.startPos.copy(camera.position);
        cameraJump.endPos.copy(cameraPos);
        cameraJump.startTarget.copy(controls.target);
        cameraJump.endTarget.copy(targetLook);
        cameraJump.onComplete = null;
        cameraJump.controlsWasEnabled = controls.enabled;
        controls.enabled = false;
    }

    function getEntityFocusPosition(entity: { type: string; data: any }): THREE.Vector3 {
        if (entity.type === 'lot') {
            const lot = entity.data;
            const centerX = lot.points.reduce((s: number, p: any) => s + p.x, 0) / lot.points.length;
            const centerY = lot.points.reduce((s: number, p: any) => s + p.y, 0) / lot.points.length;
            return new THREE.Vector3(centerX, 2, centerY).add(worldRenderer.group.position);
        }
        if (entity.type === 'vehicle') {
            const pos = new THREE.Vector3();
            entity.data.carGroup.getWorldPosition(pos);
            return pos;
        }
        if (entity.type === 'resident' || entity.type === 'agent') {
            const pos = new THREE.Vector3();
            entity.data.mesh.getWorldPosition(pos);
            return pos;
        }
        return new THREE.Vector3();
    }

    function getEntityCameraPosition(entity: { type: string; data: any }, targetPos: THREE.Vector3): THREE.Vector3 {
        if (entity.type === 'lot') {
            const lot = entity.data;
            const radius = lot.points.reduce((max: number, point: any) => {
                const dx = point.x - (targetPos.x - worldRenderer.group.position.x);
                const dz = point.y - (targetPos.z - worldRenderer.group.position.z);
                const dist = Math.sqrt(dx * dx + dz * dz);
                return Math.max(max, dist);
            }, 0);
            const distance = 180 + radius * 0.6;
            return targetPos.clone().add(new THREE.Vector3(0, 140 + radius * 0.18, distance));
        }
        const targetQuat = new THREE.Quaternion();
        if (entity.data.mesh) {
            entity.data.mesh.getWorldQuaternion(targetQuat);
        } else if (entity.data.carGroup) {
            entity.data.carGroup.getWorldQuaternion(targetQuat);
        }
        const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(targetQuat);
        forward.y = 0;
        if (forward.lengthSq() < 0.0001) {
            forward.set(0, 0, 1);
        }
        forward.normalize();
        const offsets = followEntityType ? followOffsets[followEntityType] : followOffsets.agent;
        return targetPos.clone()
            .add(forward.clone().multiplyScalar(-offsets.distance))
            .add(new THREE.Vector3(0, offsets.height, 0));
    }

    function clampCameraPosition(position: THREE.Vector3): THREE.Vector3 {
        if (!worldBounds) return position;
        const padding = 250;
        position.x = Math.max(worldBounds.minX - padding, Math.min(worldBounds.maxX + padding, position.x));
        position.z = Math.max(worldBounds.minZ - padding, Math.min(worldBounds.maxZ + padding, position.z));
        position.y = Math.max(20, position.y);
        return position;
    }
}

init();
