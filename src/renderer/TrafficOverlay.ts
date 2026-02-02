import * as THREE from 'three';
import { Agent } from '../entities/Agent';
import { Vehicle } from '../entities/Vehicle';
import { SchoolBus } from '../entities/SchoolBus';
import { AgentType } from '../types';
import { HeatmapField } from './HeatmapField';

export type TrafficOverlayLayer = 'traffic_cars' | 'traffic_peds' | 'traffic_combined';

interface TrafficOverlayConfig {
    group: THREE.Group;
    bounds: { minX: number; maxX: number; minY: number; maxY: number };
    cellSize?: number;
    windowSeconds?: number;
}

const LAYER_PALETTES: Record<TrafficOverlayLayer, number[]> = {
    traffic_cars: [0x0b1d4d, 0x1a66ff, 0xffc13a, 0xff3b1a],
    traffic_peds: [0x0f2a2a, 0x1ab7a6, 0x9bff6a, 0xfff2a6],
    traffic_combined: [0x2b134d, 0x7f2cff, 0xff2e88, 0xfff0c8],
};

export class TrafficOverlay {
    private windowSeconds: number;
    private layers: Record<TrafficOverlayLayer, HeatmapField>;
    private timeSinceRender = 0;
    private renderInterval = 0.1;

    constructor(config: TrafficOverlayConfig) {
        this.windowSeconds = config.windowSeconds ?? 720;

        this.layers = {
            traffic_cars: new HeatmapField({
                id: 'traffic_cars',
                group: config.group,
                bounds: config.bounds,
                cellSize: config.cellSize,
                y: 6.0,
                palette: LAYER_PALETTES.traffic_cars,
            }),
            traffic_peds: new HeatmapField({
                id: 'traffic_peds',
                group: config.group,
                bounds: config.bounds,
                cellSize: config.cellSize,
                y: 6.05,
                palette: LAYER_PALETTES.traffic_peds,
            }),
            traffic_combined: new HeatmapField({
                id: 'traffic_combined',
                group: config.group,
                bounds: config.bounds,
                cellSize: config.cellSize,
                y: 6.1,
                palette: LAYER_PALETTES.traffic_combined,
            }),
        };
    }

    setVisible(layer: TrafficOverlayLayer, visible: boolean) {
        const state = this.layers[layer];
        if (!state) return;
        state.setVisible(visible);
    }

    update(agents: Agent[], delta: number) {
        if (delta <= 0) return;

        const decay = Math.exp(-delta / this.windowSeconds);
        for (const layer of Object.values(this.layers)) {
            layer.decay(decay);
        }

        for (const agent of agents) {
            const category = this.classifyAgent(agent);
            if (!category) continue;

            const svgX = agent.position.x;
            const svgY = agent.position.z;
            const contribution = delta;

            if (category === 'car') {
                this.layers.traffic_cars.addSample(svgX, svgY, contribution);
            } else {
                this.layers.traffic_peds.addSample(svgX, svgY, contribution);
            }
            this.layers.traffic_combined.addSample(svgX, svgY, contribution);
        }

        this.timeSinceRender += delta;
        if (this.timeSinceRender < this.renderInterval) return;
        this.timeSinceRender = 0;

        for (const layer of Object.values(this.layers)) {
            layer.render();
        }
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
