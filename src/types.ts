export interface Point {
    x: number;
    y: number;
}

export interface ParkingSpot {
    x: number;
    y: number;
    rotation: number;
    occupiedBy: string | null; // Vehicle ID or null if free
}

export enum LotUsage {
    VACANT = 'vacant',
    RESIDENTIAL = 'residential',
    COMMERCIAL = 'commercial',
    LODGING = 'lodging',
    PUBLIC = 'public',
    PARKING = 'parking',
    // Specialized in-town buildings
    BAR = 'bar',
    CHURCH = 'church'
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
    CAT = 'cat',
    CHILD = 'child',
    SCHOOL_BUS_DRIVER = 'school_bus_driver'
}

export enum VehicleType {
    CAR = 'car',
    POLICE_CAR = 'police_car',
    SCHOOL_BUS = 'school_bus',
    PICKUP_TRUCK = 'pickup_truck'
}

export interface Address {
    streetNumber: number;
    streetName: string;      // e.g., "1st St"
    crossStreet: string;     // e.g., "Ave A"
    fullAddress: string;     // e.g., "1st St / Ave A"
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
    parkingSpots?: ParkingSpot[]; // Multiple parking spots with occupancy tracking

    // Legacy single spot (deprecated, use parkingSpots)
    parkingSpot?: Point;
    parkingRotation?: number;

    // Address
    address?: Address;
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

// Town Events System
export enum TownEventType {
    // School events
    SCHOOL_BUS_ARRIVES = 'school_bus_arrives',
    SCHOOL_BUS_DEPARTS = 'school_bus_departs',
    SCHOOL_STARTS = 'school_starts',
    SCHOOL_ENDS = 'school_ends',

    // Law enforcement
    SHERIFF_PATROL = 'sheriff_patrol',
    SHERIFF_ARRIVES = 'sheriff_arrives',

    // Social events
    BAR_OPENS = 'bar_opens',
    BAR_HAPPY_HOUR = 'bar_happy_hour',
    BAR_CLOSES = 'bar_closes',
    CHURCH_SERVICE = 'church_service',

    // General
    SUNRISE = 'sunrise',
    SUNSET = 'sunset',
    NOON = 'noon',
    MIDNIGHT = 'midnight'
}

export interface TownEvent {
    type: TownEventType;
    hour: number;           // Hour of day (0-23)
    minute?: number;        // Optional minute (default 0)
    daysOfWeek?: number[];  // 0=Sunday, 6=Saturday. If undefined, every day
    data?: any;             // Additional event data
}
