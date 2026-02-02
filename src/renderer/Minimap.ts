import { World } from "../world/World";
import { Agent } from "../entities/Agent";
import { LotState } from "../types";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import * as THREE from 'three';

// Minimap colors - darker versions matching WorldRenderer
const MINIMAP_COLORS = {
    background: '#1A1612',
    road: '#4A4A4A',         // Asphalt grey (matching WorldRenderer)
    // Lot ownership status (darker versions)
    occupied: '#2D3D32',     // Dark green
    abandoned: '#4D3838',    // Muted dusty rose
    forSale: '#2D353D',      // Dark blue
    empty: '#3A3A3A',        // Dark gray
    // Border/presence
    borderPresent: '#3A9A6A',
    borderAway: '#555555',
    // UI
    viewportStroke: '#FFE4B5',
    northArrow: '#CC3333',
    // Grid mode
    gridLine: '#333333',
    gridLot: '#222222',
};

export type MinimapMode = 'overlay' | 'grid';

export class Minimap {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;

    world: World | null = null;
    width: number = 300;
    height: number = 300;

    scale: number = 0.1;
    offsetX: number = 0;
    offsetY: number = 0;

    controls: OrbitControls;
    camera: THREE.Camera;

    private isDragging = false;
    private cachedBackground: ImageData | null = null;
    private mode: MinimapMode = 'overlay';
    private modeToggle: HTMLButtonElement | null = null;
    private baseBottom = 56;

    constructor(controls: OrbitControls, camera: THREE.Camera) {
        this.controls = controls;
        this.camera = camera;

        this.canvas = document.createElement('canvas');
        this.canvas.width = this.width;
        this.canvas.height = this.height;
        this.canvas.style.position = 'absolute';
        this.canvas.style.bottom = `${this.baseBottom}px`;
        this.canvas.style.left = '12px';
        this.canvas.style.border = '1px solid #3D3530';
        this.canvas.style.backgroundColor = MINIMAP_COLORS.background;
        this.canvas.style.borderRadius = '6px';
        this.canvas.style.cursor = 'crosshair';
        this.canvas.style.boxShadow = '0 2px 8px rgba(0,0,0,0.4)';

        document.body.appendChild(this.canvas);

        const context = this.canvas.getContext('2d', { willReadFrequently: true });
        if (!context) throw new Error("Could not get 2D context");
        this.ctx = context;

        this.createModeToggle();
        this.initEvents();
    }

    private createModeToggle() {
        this.modeToggle = document.createElement('button');
        this.modeToggle.textContent = '◐';
        this.modeToggle.title = 'Toggle minimap mode (overlay/grid)';
        this.modeToggle.style.cssText = `
            position: absolute;
            bottom: ${this.baseBottom + this.height - 26}px;
            left: ${12 + this.width - 26}px;
            width: 22px;
            height: 22px;
            border: 1px solid #3D3530;
            border-radius: 4px;
            background: rgba(30, 25, 20, 0.9);
            color: #AAA;
            font-size: 12px;
            cursor: pointer;
            z-index: 101;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 0;
        `;

        this.modeToggle.addEventListener('click', () => {
            this.mode = this.mode === 'overlay' ? 'grid' : 'overlay';
            this.modeToggle!.textContent = this.mode === 'overlay' ? '◐' : '▦';
            this.renderStaticBackground();
        });

        document.body.appendChild(this.modeToggle);
    }

    setWorld(world: World) {
        this.world = world;

        const w = world.bounds.maxX - world.bounds.minX;
        const h = world.bounds.maxY - world.bounds.minY;

        const scaleX = this.width / w;
        const scaleY = this.height / h;
        this.scale = Math.min(scaleX, scaleY) * 0.99; // Maximize map area

        // Center offset (minimal padding for north arrow)
        this.offsetX = (this.width - w * this.scale) / 2;
        this.offsetY = (this.height - h * this.scale) / 2; // Small shift for north arrow

        this.renderStaticBackground();
    }

    setVisible(visible: boolean) {
        const display = visible ? 'block' : 'none';
        this.canvas.style.display = display;
        if (this.modeToggle) {
            this.modeToggle.style.display = display;
        }
    }

    private renderStaticBackground() {
        if (!this.world) return;

        // Clear
        this.ctx.fillStyle = MINIMAP_COLORS.background;
        this.ctx.fillRect(0, 0, this.width, this.height);

        // Draw north indicator at top
        this.drawNorthIndicator();

        if (this.mode === 'grid') {
            this.renderGridMode();
        } else {
            this.renderOverlayMode();
        }

        this.cachedBackground = this.ctx.getImageData(0, 0, this.width, this.height);
    }

    private renderGridMode() {
        if (!this.world) return;

        // Draw roads as light gray
        this.world.roads.forEach(road => {
            const sx = this.worldToScreenX(road.x);
            const sy = this.worldToScreenY(road.y);
            const sw = road.width * this.scale;
            const sh = road.height * this.scale;

            this.ctx.fillStyle = '#555555';
            this.ctx.fillRect(sx, sy, sw, sh);
        });

        // Draw all lots as simple dark rectangles with white borders
        this.world.lots.forEach(lot => {
            if (lot.points.length === 0) return;

            const xs = lot.points.map(p => this.worldToScreenX(p.x));
            const ys = lot.points.map(p => this.worldToScreenY(p.y));
            const minX = Math.min(...xs);
            const maxX = Math.max(...xs);
            const minY = Math.min(...ys);
            const maxY = Math.max(...ys);

            this.ctx.fillStyle = MINIMAP_COLORS.gridLot;
            this.ctx.fillRect(minX, minY, maxX - minX, maxY - minY);

            this.ctx.strokeStyle = MINIMAP_COLORS.gridLine;
            this.ctx.lineWidth = 1;
            this.ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
        });
    }

    private renderOverlayMode() {
        if (!this.world) return;

        // Draw roads
        this.world.roads.forEach(road => {
            const sx = this.worldToScreenX(road.x);
            const sy = this.worldToScreenY(road.y);
            const sw = road.width * this.scale;
            const sh = road.height * this.scale;

            this.ctx.fillStyle = MINIMAP_COLORS.road;
            this.ctx.fillRect(sx, sy, sw, sh);
        });

        // Draw lots with borders
        this.world.lots.forEach(lot => {
            if (lot.points.length === 0) return;

            const xs = lot.points.map(p => this.worldToScreenX(p.x));
            const ys = lot.points.map(p => this.worldToScreenY(p.y));
            const minX = Math.min(...xs);
            const maxX = Math.max(...xs);
            const minY = Math.min(...ys);
            const maxY = Math.max(...ys);

            // Fill color based on ownership status
            switch (lot.state) {
                case LotState.OCCUPIED:
                case LotState.AWAY:
                    this.ctx.fillStyle = MINIMAP_COLORS.occupied;
                    break;
                case LotState.ABANDONED:
                    this.ctx.fillStyle = MINIMAP_COLORS.abandoned;
                    break;
                case LotState.FOR_SALE:
                    this.ctx.fillStyle = MINIMAP_COLORS.forSale;
                    break;
                default:
                    this.ctx.fillStyle = MINIMAP_COLORS.empty;
            }
            this.ctx.fillRect(minX, minY, maxX - minX, maxY - minY);

            // Border color based on presence
            if (lot.state === LotState.OCCUPIED) {
                this.ctx.strokeStyle = MINIMAP_COLORS.borderPresent;
                this.ctx.lineWidth = 1.5;
            } else if (lot.state === LotState.AWAY) {
                this.ctx.strokeStyle = MINIMAP_COLORS.borderAway;
                this.ctx.lineWidth = 1;
            } else {
                this.ctx.strokeStyle = '#444444';
                this.ctx.lineWidth = 0.5;
            }
            this.ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
        });
    }

    private drawNorthIndicator() {
        const cx = this.width / 2;
        const cy = 8;

        // Arrow pointing up (compact)
        this.ctx.fillStyle = MINIMAP_COLORS.northArrow;
        this.ctx.beginPath();
        this.ctx.moveTo(cx, cy - 5);
        this.ctx.lineTo(cx - 4, cy + 3);
        this.ctx.lineTo(cx, cy);
        this.ctx.lineTo(cx + 4, cy + 3);
        this.ctx.closePath();
        this.ctx.fill();

        // "N" label (smaller, closer)
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.font = 'bold 7px sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('N', cx, cy + 10);
    }

    initEvents() {
        this.canvas.addEventListener('mousedown', (e) => {
            this.isDragging = true;
            this.updateCameraFromInput(e);
        });
        window.addEventListener('mousemove', (e) => {
            if (this.isDragging) this.updateCameraFromInput(e);
        });
        window.addEventListener('mouseup', () => {
            this.isDragging = false;
        });
    }

    updateCameraFromInput(e: MouseEvent) {
        if (!this.world) return;

        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Pixel -> SVG coordinates (inverse of worldToScreen)
        // worldToScreenX: screenX = offsetX + (svgX - minX) * scale
        // Solving for svgX: svgX = minX + (screenX - offsetX) / scale
        const svgX = this.world.bounds.minX + (x - this.offsetX) / this.scale;
        // worldToScreenY: screenY = offsetY + (svgY - minY) * scale
        // Solving for svgY: svgY = minY + (screenY - offsetY) / scale
        const svgY = this.world.bounds.minY + (y - this.offsetY) / this.scale;

        // Convert SVG to 3D world coordinates (centered)
        // SVG (x, y) → 3D (x, height, y), then centered: worldX = svgX - centerX, worldZ = svgY - centerY
        const centerX = (this.world.bounds.minX + this.world.bounds.maxX) / 2;
        const centerY = (this.world.bounds.minY + this.world.bounds.maxY) / 2;
        const worldX = svgX - centerX;
        const worldZ = svgY - centerY;

        // Move camera and target
        const currentTarget = this.controls.target;
        const deltaX = worldX - currentTarget.x;
        const deltaZ = worldZ - currentTarget.z;

        this.camera.position.x += deltaX;
        this.camera.position.z += deltaZ;
        this.controls.target.set(worldX, 0, worldZ);
        this.controls.update();
    }

    update(agents: Agent[]) {
        if (!this.world) return;

        if (this.cachedBackground) {
            this.ctx.putImageData(this.cachedBackground, 0, 0);
        }

        // Draw agents
        agents.forEach(agent => {
        // Convert from 3D local coords to minimap
        // Agent position is in local coords (SVG space): SVG (x, y) → 3D (x, height, y)
        // So: SVG.x = position.x, SVG.y = position.z
        const svgX = agent.position.x;
        const svgY = agent.position.z;

            const sx = this.worldToScreenX(svgX);
            const sy = this.worldToScreenY(svgY);

            // Get agent color
            const mat = agent.mesh.material as THREE.MeshStandardMaterial;
            const hex = '#' + mat.color.getHexString();

            // Draw dot (smaller for less crowding)
            this.ctx.beginPath();
            this.ctx.arc(sx, sy, 2, 0, Math.PI * 2);
            this.ctx.fillStyle = hex;
            this.ctx.fill();
        });

        // Draw camera viewport
        // Camera target is in centered 3D space (world is centered around 0,0,0)
        // SVG (x, y) → 3D (x, height, y), then centered: worldX = svgX - centerX, worldZ = svgY - centerY
        // So: svgX = centerX + worldX, svgY = centerY + worldZ
        const centerX = (this.world.bounds.minX + this.world.bounds.maxX) / 2;
        const centerY = (this.world.bounds.minY + this.world.bounds.maxY) / 2;

        const camSvgX = centerX + this.controls.target.x;
        const camSvgY = centerY + this.controls.target.z;

        const tx = this.worldToScreenX(camSvgX);
        const ty = this.worldToScreenY(camSvgY);

        this.ctx.strokeStyle = MINIMAP_COLORS.viewportStroke;
        this.ctx.lineWidth = 1.5;

        // Crosshair
        const size = 10;
        this.ctx.beginPath();
        this.ctx.moveTo(tx - size, ty);
        this.ctx.lineTo(tx + size, ty);
        this.ctx.moveTo(tx, ty - size);
        this.ctx.lineTo(tx, ty + size);
        this.ctx.stroke();

        // Viewport box (larger for the bigger minimap)
        this.ctx.strokeStyle = 'rgba(255, 228, 181, 0.5)';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(tx - 30, ty - 30, 60, 60);
    }

    worldToScreenX(svgX: number): number {
        if (!this.world) return 0;
        // Direct mapping: lower X on left, higher X on right
        return this.offsetX + (svgX - this.world.bounds.minX) * this.scale;
    }

    worldToScreenY(svgY: number): number {
        if (!this.world) return 0;
        // Direct mapping: lower Y at top (north), higher Y at bottom (south)
        return this.offsetY + (svgY - this.world.bounds.minY) * this.scale;
    }

    setMode(mode: MinimapMode) {
        if (this.mode !== mode) {
            this.mode = mode;
            if (this.modeToggle) {
                this.modeToggle.textContent = mode === 'overlay' ? '◐' : '▦';
            }
            this.renderStaticBackground();
        }
    }

    getMode(): MinimapMode {
        return this.mode;
    }
}
