export interface Point {
    x: number;
    y: number;
}

export enum LotUsage {
    VACANT = 'vacant',
    RESIDENTIAL = 'residential',
    COMMERCIAL = 'commercial',
    PUBLIC = 'public'
}

export enum LotState {
    EMPTY = 'empty',
    OCCUPIED = 'occupied', // Owner is home
    AWAY = 'away',         // Owner is out
    ABANDONED = 'abandoned',
    FOR_SALE = 'for_sale'
}

export enum AgentType {
    RESIDENT = 'resident',
    TOURIST = 'tourist',
    COP = 'cop',
    DOG = 'dog',
    CAT = 'cat'
}

export interface Lot {
    id: number;
    points: Point[];
    // Simulation Props
    usage: LotUsage;
    state: LotState;
    color?: number; // Visual override

    // Navigation
    entryPoint?: Point; // Point just inside the lot boundary
    roadAccessPoint?: Point; // Point on the road graph nearest to entry
    gatePositions?: Point[]; // Fence gate positions on short road-facing sides
}

export interface RoadSegment {
    id: string;
    type: 'vertical' | 'horizontal';
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface MapMetadata {
    total_lots: number;
    total_roads: number;
    description: string;
}

export interface MapData {
    metadata: MapMetadata;
    road_network: { d: string | null };
    road_segments: RoadSegment[];
    lots: Omit<Lot, 'usage' | 'state'>[]; // Raw data doesn't have usage/state yet
}

export interface GameTime {
    totalSeconds: number;
    day: number;
    hour: number;
    minute: number;
    speed: number;
}
