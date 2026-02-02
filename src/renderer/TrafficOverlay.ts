import * as THREE from 'three';
import { Agent } from '../entities/Agent';
import { Vehicle } from '../entities/Vehicle';
import { SchoolBus } from '../entities/SchoolBus';
import { AgentType } from '../types';

export type TrafficOverlayLayer = 'traffic_cars' | 'traffic_peds' | 'traffic_combined';

interface TrafficOverlayConfig {
    group: THREE.Group;
    bounds: { minX: number; maxX: number; minY: number; maxY: number };
    cellSize?: number;
    windowSeconds?: number;
}

type LayerState = {
    id: TrafficOverlayLayer;
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    texture: THREE.CanvasTexture;
    material: THREE.MeshBasicMaterial;
    mesh: THREE.Mesh;
    grid: Float32Array;
    imageData: ImageData;
    displayMax: number;
    visible: boolean;
    palette: number[];
};

const LAYER_PALETTES: Record<TrafficOverlayLayer, number[]> = {
    traffic_cars: [0x0b1d4d, 0x1a66ff, 0xffc13a, 0xff3b1a],
    traffic_peds: [0x0f2a2a, 0x1ab7a6, 0x9bff6a, 0xfff2a6],
    traffic_combined: [0x2b134d, 0x7f2cff, 0xff2e88, 0xfff0c8],
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const colorToRgb = (color: number) => ({
    r: (color >> 16) & 0xff,
    g: (color >> 8) & 0xff,
    b: color & 0xff,
});

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const sampleGradient = (colors: number[], t: number) => {
    if (t <= 0) return colorToRgb(colors[0]);
    if (t >= 1) return colorToRgb(colors[colors.length - 1]);
    const scaled = t * (colors.length - 1);
    const index = Math.floor(scaled);
    const local = scaled - index;
    const c0 = colorToRgb(colors[index]);
    const c1 = colorToRgb(colors[index + 1]);
    return {
        r: Math.round(lerp(c0.r, c1.r, local)),
        g: Math.round(lerp(c0.g, c1.g, local)),
        b: Math.round(lerp(c0.b, c1.b, local)),
    };
};

export class TrafficOverlay {
    private group: THREE.Group;
    private bounds: { minX: number; maxX: number; minY: number; maxY: number };
    private gridWidth: number;
    private gridHeight: number;
    private windowSeconds: number;
    private layers: Record<TrafficOverlayLayer, LayerState>;
    private timeSinceTextureUpdate = 0;
    private textureUpdateInterval = 0.1;
    private totalWidth: number;
    private totalHeight: number;

    constructor(config: TrafficOverlayConfig) {
        this.group = config.group;
        this.bounds = config.bounds;
        this.windowSeconds = config.windowSeconds ?? 90;

        this.totalWidth = this.bounds.maxX - this.bounds.minX;
        this.totalHeight = this.bounds.maxY - this.bounds.minY;

        const targetCells = 170;
        const baseCellSize = config.cellSize ?? Math.max(this.totalWidth, this.totalHeight) / targetCells;
        this.gridWidth = clamp(Math.round(this.totalWidth / baseCellSize), 64, 256);
        this.gridHeight = clamp(Math.round(this.totalHeight / baseCellSize), 64, 256);

        const centerX = (this.bounds.minX + this.bounds.maxX) / 2;
        const centerY = (this.bounds.minY + this.bounds.maxY) / 2;

        this.layers = {
            traffic_cars: this.createLayer('traffic_cars', centerX, centerY, 6.0),
            traffic_peds: this.createLayer('traffic_peds', centerX, centerY, 6.05),
            traffic_combined: this.createLayer('traffic_combined', centerX, centerY, 6.1),
        };
    }

    setVisible(layer: TrafficOverlayLayer, visible: boolean) {
        const state = this.layers[layer];
        if (!state) return;
        state.visible = visible;
        state.mesh.visible = visible;
    }

    update(agents: Agent[], delta: number) {
        if (delta <= 0) return;

        const decay = Math.exp(-delta / this.windowSeconds);
        const layerKeys = Object.keys(this.layers) as TrafficOverlayLayer[];
        for (const layer of layerKeys) {
            const grid = this.layers[layer].grid;
            for (let i = 0; i < grid.length; i++) {
                grid[i] *= decay;
            }
        }

        for (const agent of agents) {
            const category = this.classifyAgent(agent);
            if (!category) continue;

            const svgX = agent.position.x;
            const svgY = agent.position.z;
            if (svgX < this.bounds.minX || svgX > this.bounds.maxX || svgY < this.bounds.minY || svgY > this.bounds.maxY) {
                continue;
            }

            const col = Math.floor(((svgX - this.bounds.minX) / this.totalWidth) * this.gridWidth);
            const row = Math.floor(((svgY - this.bounds.minY) / this.totalHeight) * this.gridHeight);
            if (col < 0 || col >= this.gridWidth || row < 0 || row >= this.gridHeight) continue;

            const index = row * this.gridWidth + col;
            const contribution = delta;

            if (category === 'car') {
                this.layers.traffic_cars.grid[index] += contribution;
            } else {
                this.layers.traffic_peds.grid[index] += contribution;
            }
            this.layers.traffic_combined.grid[index] += contribution;
        }

        this.timeSinceTextureUpdate += delta;
        if (this.timeSinceTextureUpdate < this.textureUpdateInterval) return;
        this.timeSinceTextureUpdate = 0;

        for (const layer of layerKeys) {
            this.updateLayerTexture(this.layers[layer], decay);
        }
    }

    private createLayer(layer: TrafficOverlayLayer, centerX: number, centerY: number, y: number): LayerState {
        const canvas = document.createElement('canvas');
        canvas.width = this.gridWidth;
        canvas.height = this.gridHeight;

        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('TrafficOverlay: failed to get canvas context');

        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;

        const material = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            opacity: 1,
            depthTest: false,
            depthWrite: false,
        });

        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(this.totalWidth, this.totalHeight), material);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(centerX, y, centerY);
        mesh.renderOrder = 1000;
        mesh.visible = false;

        this.group.add(mesh);

        const imageData = ctx.createImageData(this.gridWidth, this.gridHeight);

        return {
            id: layer,
            canvas,
            ctx,
            texture,
            material,
            mesh,
            grid: new Float32Array(this.gridWidth * this.gridHeight),
            imageData,
            displayMax: 0,
            visible: false,
            palette: LAYER_PALETTES[layer],
        };
    }

    private updateLayerTexture(layer: LayerState, decay: number) {
        const grid = layer.grid;
        let maxValue = 0;
        for (let i = 0; i < grid.length; i++) {
            if (grid[i] > maxValue) maxValue = grid[i];
        }

        layer.displayMax = Math.max(maxValue, layer.displayMax * decay);
        if (layer.displayMax <= 0.0001) {
            layer.displayMax = 0;
            layer.ctx.clearRect(0, 0, this.gridWidth, this.gridHeight);
            layer.texture.needsUpdate = true;
            return;
        }

        const data = layer.imageData.data;
        for (let i = 0; i < grid.length; i++) {
            const raw = grid[i] / layer.displayMax;
            const t = raw <= 0 ? 0 : Math.min(1, Math.pow(raw, 0.6));
            const alpha = Math.min(1, t * 0.9);
            const { r, g, b } = sampleGradient(layer.palette, t);
            const offset = i * 4;
            data[offset] = r;
            data[offset + 1] = g;
            data[offset + 2] = b;
            data[offset + 3] = Math.round(alpha * 255);
        }

        layer.ctx.putImageData(layer.imageData, 0, 0);
        layer.texture.needsUpdate = true;
    }

    private classifyAgent(agent: Agent): 'car' | 'ped' | null {
        if (agent instanceof Vehicle) {
            if (!agent.driver) return null;
            if (agent.currentSpeed <= 0.05 && !agent.target) return null;
            return 'car';
        }

        if (agent instanceof SchoolBus) {
            if (agent.currentSpeed <= 0.05 && !agent.target) return null;
            return 'car';
        }

        if (agent.type === AgentType.DOG || agent.type === AgentType.CAT) {
            return null;
        }

        if (agent.currentSpeed <= 0.05 && !agent.target) return null;
        return 'ped';
    }
}
