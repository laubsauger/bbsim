import * as THREE from 'three';

export interface HeatmapFieldConfig {
    id: string;
    group: THREE.Group;
    bounds: { minX: number; maxX: number; minY: number; maxY: number };
    cellSize?: number;
    targetCells?: number;
    y?: number;
    palette: number[];
    opacity?: number;
    dynamicRangeDecay?: number;
    dynamicRangeFloor?: number;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const colorToRgb = (color: number) => ({
    r: (color >> 16) & 0xff,
    g: (color >> 8) & 0xff,
    b: color & 0xff,
});

const sampleGradient = (colors: number[], t: number) => {
    if (t <= 0) return colorToRgb(colors[0]);
    if (t >= 1) return colorToRgb(colors[colors.length - 1]);
    const scaled = t * (colors.length - 1);
    const index = Math.floor(scaled);
    const local = scaled - index;
    const c0 = colorToRgb(colors[index]);
    const c1 = colorToRgb(colors[index + 1]);
    return {
        r: Math.round(c0.r + (c1.r - c0.r) * local),
        g: Math.round(c0.g + (c1.g - c0.g) * local),
        b: Math.round(c0.b + (c1.b - c0.b) * local),
    };
};

export class HeatmapField {
    readonly id: string;
    readonly bounds: { minX: number; maxX: number; minY: number; maxY: number };
    readonly gridWidth: number;
    readonly gridHeight: number;

    private readonly totalWidth: number;
    private readonly totalHeight: number;
    private readonly palette: number[];
    private readonly dynamicRangeDecay: number;
    private readonly dynamicRangeFloor: number;

    private readonly canvas: HTMLCanvasElement;
    private readonly ctx: CanvasRenderingContext2D;
    private readonly texture: THREE.CanvasTexture;
    private readonly material: THREE.MeshBasicMaterial;
    private readonly mesh: THREE.Mesh;
    private readonly imageData: ImageData;

    private grid: Float32Array;
    private displayMax = 0;

    constructor(config: HeatmapFieldConfig) {
        this.id = config.id;
        this.bounds = config.bounds;
        this.palette = config.palette;
        this.dynamicRangeDecay = config.dynamicRangeDecay ?? 0.95;
        this.dynamicRangeFloor = config.dynamicRangeFloor ?? 0.01;

        this.totalWidth = this.bounds.maxX - this.bounds.minX;
        this.totalHeight = this.bounds.maxY - this.bounds.minY;

        const targetCells = config.targetCells ?? 170;
        const baseCellSize = config.cellSize ?? Math.max(this.totalWidth, this.totalHeight) / targetCells;
        this.gridWidth = clamp(Math.round(this.totalWidth / baseCellSize), 64, 256);
        this.gridHeight = clamp(Math.round(this.totalHeight / baseCellSize), 64, 256);

        this.canvas = document.createElement('canvas');
        this.canvas.width = this.gridWidth;
        this.canvas.height = this.gridHeight;

        const ctx = this.canvas.getContext('2d');
        if (!ctx) throw new Error('HeatmapField: failed to get canvas context');
        this.ctx = ctx;

        this.texture = new THREE.CanvasTexture(this.canvas);
        this.texture.minFilter = THREE.LinearFilter;
        this.texture.magFilter = THREE.LinearFilter;
        this.texture.wrapS = THREE.ClampToEdgeWrapping;
        this.texture.wrapT = THREE.ClampToEdgeWrapping;

        this.material = new THREE.MeshBasicMaterial({
            map: this.texture,
            transparent: true,
            opacity: config.opacity ?? 1,
            depthTest: false,
            depthWrite: false,
        });

        const centerX = (this.bounds.minX + this.bounds.maxX) / 2;
        const centerY = (this.bounds.minY + this.bounds.maxY) / 2;

        this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(this.totalWidth, this.totalHeight), this.material);
        this.mesh.rotation.x = -Math.PI / 2;
        this.mesh.position.set(centerX, config.y ?? 6, centerY);
        this.mesh.renderOrder = 1000;
        this.mesh.visible = false;

        config.group.add(this.mesh);

        this.grid = new Float32Array(this.gridWidth * this.gridHeight);
        this.imageData = this.ctx.createImageData(this.gridWidth, this.gridHeight);
    }

    setVisible(visible: boolean) {
        this.mesh.visible = visible;
    }

    clear() {
        this.grid.fill(0);
        this.displayMax = 0;
        this.render();
    }

    decay(factor: number) {
        for (let i = 0; i < this.grid.length; i++) {
            this.grid[i] *= factor;
        }
    }

    addSample(svgX: number, svgY: number, value: number) {
        const idx = this.getIndex(svgX, svgY);
        if (idx === null) return;
        this.grid[idx] += value;
    }

    addRadialSample(svgX: number, svgY: number, radius: number, value: number) {
        const center = this.getCell(svgX, svgY);
        if (!center) return;

        const radiusCellsX = Math.ceil((radius / this.totalWidth) * this.gridWidth);
        const radiusCellsY = Math.ceil((radius / this.totalHeight) * this.gridHeight);

        for (let dy = -radiusCellsY; dy <= radiusCellsY; dy++) {
            const row = center.row + dy;
            if (row < 0 || row >= this.gridHeight) continue;
            for (let dx = -radiusCellsX; dx <= radiusCellsX; dx++) {
                const col = center.col + dx;
                if (col < 0 || col >= this.gridWidth) continue;

                const cellX = this.bounds.minX + (col + 0.5) * (this.totalWidth / this.gridWidth);
                const cellY = this.bounds.minY + (row + 0.5) * (this.totalHeight / this.gridHeight);
                const dist = Math.hypot(cellX - svgX, cellY - svgY);
                if (dist > radius) continue;

                const falloff = 1 - dist / radius;
                const index = row * this.gridWidth + col;
                this.grid[index] += value * falloff;
            }
        }
    }

    render() {
        let maxValue = 0;
        for (let i = 0; i < this.grid.length; i++) {
            if (this.grid[i] > maxValue) maxValue = this.grid[i];
        }

        if (maxValue > 0) {
            this.displayMax = Math.max(maxValue, this.displayMax * this.dynamicRangeDecay);
        } else {
            this.displayMax = this.displayMax * this.dynamicRangeDecay;
        }

        if (this.displayMax < this.dynamicRangeFloor) {
            this.displayMax = 0;
        }

        const data = this.imageData.data;
        for (let i = 0; i < this.grid.length; i++) {
            const offset = i * 4;
            if (this.displayMax <= 0) {
                data[offset] = 0;
                data[offset + 1] = 0;
                data[offset + 2] = 0;
                data[offset + 3] = 0;
                continue;
            }

            const raw = this.grid[i] / this.displayMax;
            const t = raw <= 0 ? 0 : Math.min(1, Math.pow(raw, 0.6));
            const heat = sampleGradient(this.palette, t);
            const alpha = clamp(t * 0.9, 0, 1);

            data[offset] = heat.r;
            data[offset + 1] = heat.g;
            data[offset + 2] = heat.b;
            data[offset + 3] = Math.round(alpha * 255);
        }

        this.ctx.putImageData(this.imageData, 0, 0);
        this.texture.needsUpdate = true;
    }

    private getIndex(svgX: number, svgY: number) {
        const cell = this.getCell(svgX, svgY);
        if (!cell) return null;
        return cell.row * this.gridWidth + cell.col;
    }

    private getCell(svgX: number, svgY: number) {
        if (svgX < this.bounds.minX || svgX > this.bounds.maxX || svgY < this.bounds.minY || svgY > this.bounds.maxY) {
            return null;
        }

        const col = Math.floor(((svgX - this.bounds.minX) / this.totalWidth) * this.gridWidth);
        const row = Math.floor(((svgY - this.bounds.minY) / this.totalHeight) * this.gridHeight);
        if (col < 0 || col >= this.gridWidth || row < 0 || row >= this.gridHeight) return null;
        return { col, row };
    }
}
