import * as THREE from 'three';
import { HeatmapField } from './HeatmapField';

interface WifiOverlayConfig {
    group: THREE.Group;
    bounds: { minX: number; maxX: number; minY: number; maxY: number };
    cellSize?: number;
}

type WifiTower = {
    x: number;
    y: number;
    strength: number;
    radius: number;
};

const WIFI_PALETTE = [0x071c2b, 0x0f7fd6, 0x5de2ff, 0xfff7b2];

export class WifiOverlay {
    private field: HeatmapField;
    private towers: WifiTower[] = [];

    constructor(config: WifiOverlayConfig) {
        this.field = new HeatmapField({
            id: 'wifi',
            group: config.group,
            bounds: config.bounds,
            cellSize: config.cellSize,
            y: 6.2,
            palette: WIFI_PALETTE,
            dynamicRangeDecay: 0.98,
        });

        this.createDummyTowers(config.bounds);
        this.rebuildField();
    }

    setVisible(visible: boolean) {
        this.field.setVisible(visible);
    }

    rebuildField() {
        this.field.clear();
        for (const tower of this.towers) {
            this.field.addRadialSample(tower.x, tower.y, tower.radius, tower.strength);
        }
        this.field.render();
    }

    private createDummyTowers(bounds: WifiOverlayConfig['bounds']) {
        const w = bounds.maxX - bounds.minX;
        const h = bounds.maxY - bounds.minY;

        const points = [
            { x: 0.2, y: 0.25, strength: 1.4, radius: 240 },
            { x: 0.45, y: 0.45, strength: 1.0, radius: 200 },
            { x: 0.65, y: 0.3, strength: 1.2, radius: 220 },
            { x: 0.35, y: 0.7, strength: 0.9, radius: 180 },
            { x: 0.8, y: 0.7, strength: 1.5, radius: 260 },
        ];

        this.towers = points.map(point => ({
            x: bounds.minX + w * point.x,
            y: bounds.minY + h * point.y,
            strength: point.strength,
            radius: point.radius,
        }));
    }
}
