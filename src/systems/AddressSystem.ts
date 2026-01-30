import * as THREE from 'three';
import { RoadSegment, Lot, Point } from '../types';

// Street names based on Bombay Beach layout
const AVENUE_NAMES = [
    'Avenue A',
    'Avenue B',
    'Avenue C',
    'Avenue D',
    'Avenue E',
    'Avenue F',
    'Avenue G',
    'Avenue H',
    'Aisle of Palms'
];

const STREET_NAMES = [
    '1st St',
    '2nd St',
    '3rd St',
    '4th St',
    '5th St',
    '6th St'
];

export interface StreetInfo {
    id: string;
    name: string;
    type: 'avenue' | 'street';
    segment: RoadSegment;
    labelPosition: Point; // Where to show the label
}

export interface Address {
    streetNumber: number;
    streetName: string;      // e.g., "1st St"
    crossStreet: string;     // e.g., "Ave A"
    fullAddress: string;     // e.g., "1st St / Ave A"
}

export class AddressSystem {
    streets: Map<string, StreetInfo> = new Map();
    lotAddresses: Map<number, Address> = new Map();
    private labelGroup: THREE.Group | null = null;

    constructor(roads: RoadSegment[]) {
        this.assignStreetNames(roads);
    }

    private assignStreetNames(roads: RoadSegment[]) {
        // Sort vertical roads by x position (west to east)
        const verticalRoads = roads
            .filter(r => r.type === 'vertical')
            .sort((a, b) => a.x - b.x);

        // Sort horizontal roads by y position (north to south)
        const horizontalRoads = roads
            .filter(r => r.type === 'horizontal')
            .sort((a, b) => a.y - b.y);

        // Assign avenue names to vertical roads
        verticalRoads.forEach((road, index) => {
            const name = index < AVENUE_NAMES.length ? AVENUE_NAMES[index] : `Avenue ${index + 1}`;
            const midY = road.y + road.height / 2;

            this.streets.set(road.id, {
                id: road.id,
                name,
                type: 'avenue',
                segment: road,
                labelPosition: { x: road.x + road.width / 2, y: midY }
            });
        });

        // Assign street names to horizontal roads
        horizontalRoads.forEach((road, index) => {
            const name = index < STREET_NAMES.length ? STREET_NAMES[index] : `${index + 1}th St`;
            const midX = road.x + road.width / 2;

            this.streets.set(road.id, {
                id: road.id,
                name,
                type: 'street',
                segment: road,
                labelPosition: { x: midX, y: road.y + road.height / 2 }
            });
        });

        console.log(`[AddressSystem] Assigned names to ${this.streets.size} streets`);
    }

    assignAddressesToLots(lots: Lot[]) {
        lots.forEach(lot => {
            const address = this.computeLotAddress(lot);
            if (address) {
                this.lotAddresses.set(lot.id, address);
                (lot as any).address = address; // Attach to lot object
            }
        });

        console.log(`[AddressSystem] Assigned addresses to ${this.lotAddresses.size} lots`);
    }

    private computeLotAddress(lot: Lot): Address | null {
        if (lot.points.length === 0) return null;

        // Find lot center
        const centerX = lot.points.reduce((s, p) => s + p.x, 0) / lot.points.length;
        const centerY = lot.points.reduce((s, p) => s + p.y, 0) / lot.points.length;

        // Find the closest street (horizontal road) - this determines the street name
        let closestStreet: StreetInfo | null = null;
        let closestStreetDist = Infinity;

        // Find the closest avenue (vertical road) - this helps determine block position
        let closestAvenue: StreetInfo | null = null;
        let closestAvenueDist = Infinity;

        for (const street of this.streets.values()) {
            const seg = street.segment;

            if (street.type === 'street') {
                // Distance to horizontal road
                const dist = Math.abs(centerY - (seg.y + seg.height / 2));
                if (dist < closestStreetDist) {
                    closestStreetDist = dist;
                    closestStreet = street;
                }
            } else {
                // Distance to vertical road
                const dist = Math.abs(centerX - (seg.x + seg.width / 2));
                if (dist < closestAvenueDist) {
                    closestAvenueDist = dist;
                    closestAvenue = street;
                }
            }
        }

        if (!closestStreet || !closestAvenue) return null;

        // Compute street number based on position along the avenue
        const avenueX = closestAvenue.segment.x;
        const relativeX = centerX - avenueX;

        // Determine which side of the avenue (odd = west, even = east)
        const isWestSide = relativeX < closestAvenue.segment.width / 2;

        // Use Y position to determine the number
        const streetY = closestStreet.segment.y;
        const blockIndex = Math.floor(streetY / 500);
        const baseNumber = (blockIndex + 1) * 100;

        // Position within block
        const positionInBlock = Math.floor((centerY % 500) / 50) + 1;
        let streetNumber = baseNumber + positionInBlock * 2;

        // Odd numbers on west side, even on east
        if (isWestSide) {
            streetNumber = streetNumber - 1;
        }

        // Short avenue name for cross-street (e.g., "Avenue A" -> "Ave A")
        const shortAvenue = closestAvenue.name.replace('Avenue ', 'Ave ').replace('Aisle of Palms', 'Aisle');

        return {
            streetNumber,
            streetName: closestStreet.name,
            crossStreet: shortAvenue,
            fullAddress: `${closestStreet.name} / ${shortAvenue}`
        };
    }

    getAddress(lotId: number): Address | null {
        return this.lotAddresses.get(lotId) || null;
    }

    getStreetName(roadId: string): string | null {
        const street = this.streets.get(roadId);
        return street ? street.name : null;
    }

    // Create 3D labels for street names
    createStreetLabels(): THREE.Group {
        if (this.labelGroup) {
            return this.labelGroup;
        }

        this.labelGroup = new THREE.Group();
        this.labelGroup.name = 'StreetLabels';

        // Create canvas-based text sprites for each street
        for (const street of this.streets.values()) {
            const sprite = this.createTextSprite(street.name, street.type === 'avenue');

            // Position in 3D world: SVG (x, y) → 3D (x, 0, y)
            sprite.position.set(
                street.labelPosition.x,
                20, // Height above ground
                street.labelPosition.y
            );

            // Rotate avenue labels to be vertical
            if (street.type === 'avenue') {
                sprite.material.rotation = Math.PI / 2;
            }

            this.labelGroup.add(sprite);

            // Add additional labels along long roads
            if (street.type === 'avenue') {
                // Add labels at intervals along the avenue
                const seg = street.segment;
                const interval = 600;
                for (let y = seg.y + interval; y < seg.y + seg.height - interval; y += interval) {
                    const extraSprite = this.createTextSprite(street.name, true);
                    // SVG (x, y) → 3D (x, 0, y)
                    extraSprite.position.set(seg.x + seg.width / 2, 20, y);
                    extraSprite.material.rotation = Math.PI / 2;
                    this.labelGroup.add(extraSprite);
                }
            } else {
                // Add labels at intervals along the street
                const seg = street.segment;
                const interval = 800;
                for (let x = seg.x + interval; x < seg.x + seg.width - interval; x += interval) {
                    const extraSprite = this.createTextSprite(street.name, false);
                    // SVG (x, y) → 3D (x, 0, y)
                    extraSprite.position.set(x, 20, seg.y + seg.height / 2);
                    this.labelGroup.add(extraSprite);
                }
            }
        }

        return this.labelGroup;
    }

    private createTextSprite(text: string, isAvenue: boolean): THREE.Sprite {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d')!;

        canvas.width = 256;
        canvas.height = 64;

        // Background
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.roundRect(0, 0, canvas.width, canvas.height, 8);
        ctx.fill();

        // Border
        ctx.strokeStyle = '#666';
        ctx.lineWidth = 2;
        ctx.roundRect(0, 0, canvas.width, canvas.height, 8);
        ctx.stroke();

        // Text
        ctx.fillStyle = '#333';
        ctx.font = 'bold 24px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, canvas.width / 2, canvas.height / 2);

        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            depthTest: false
        });

        const sprite = new THREE.Sprite(material);
        sprite.scale.set(100, 25, 1);

        return sprite;
    }

    removeStreetLabels() {
        if (this.labelGroup && this.labelGroup.parent) {
            this.labelGroup.parent.remove(this.labelGroup);
        }
        this.labelGroup = null;
    }
}
