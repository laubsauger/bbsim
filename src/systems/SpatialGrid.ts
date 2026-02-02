/**
 * Spatial hash grid for efficient nearby-entity queries.
 * Reduces O(n²) collision detection to O(n) by only checking agents in nearby cells.
 */
export class SpatialGrid<T extends { position: { x: number; z: number } }> {
    private cellSize: number;
    private cells: Map<string, T[]> = new Map();

    constructor(cellSize: number = 50) {
        this.cellSize = cellSize;
    }

    /**
     * Clear all cells - call at start of each frame
     */
    clear(): void {
        this.cells.clear();
    }

    /**
     * Insert an entity into the grid based on its position
     */
    insert(entity: T): void {
        const key = this.getKey(entity.position.x, entity.position.z);
        let cell = this.cells.get(key);
        if (!cell) {
            cell = [];
            this.cells.set(key, cell);
        }
        cell.push(entity);
    }

    /**
     * Populate the grid with all entities - call once per frame
     */
    populate(entities: T[]): void {
        this.clear();
        for (let i = 0; i < entities.length; i++) {
            this.insert(entities[i]);
        }
    }

    /**
     * Get all entities within a radius of a point.
     * Returns entities from the cell containing the point plus all adjacent cells.
     */
    getNearby(x: number, z: number, radius: number): T[] {
        const result: T[] = [];

        // Calculate how many cells the radius spans
        const cellsToCheck = Math.ceil(radius / this.cellSize);

        const centerCellX = Math.floor(x / this.cellSize);
        const centerCellZ = Math.floor(z / this.cellSize);

        // Check center cell and adjacent cells
        for (let dx = -cellsToCheck; dx <= cellsToCheck; dx++) {
            for (let dz = -cellsToCheck; dz <= cellsToCheck; dz++) {
                const key = `${centerCellX + dx},${centerCellZ + dz}`;
                const cell = this.cells.get(key);
                if (cell) {
                    for (let i = 0; i < cell.length; i++) {
                        result.push(cell[i]);
                    }
                }
            }
        }

        return result;
    }

    /**
     * Get all entities in the same cell as the given position (faster, less accurate)
     */
    getSameCell(x: number, z: number): T[] {
        const key = this.getKey(x, z);
        return this.cells.get(key) || [];
    }

    private getKey(x: number, z: number): string {
        const cellX = Math.floor(x / this.cellSize);
        const cellZ = Math.floor(z / this.cellSize);
        return `${cellX},${cellZ}`;
    }
}
