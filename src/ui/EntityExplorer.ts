import { Resident } from '../entities/Resident';
import { Vehicle } from '../entities/Vehicle';
import { Lot, LotState } from '../types';
import { Agent } from '../entities/Agent';

export type ExplorerEntityType = 'resident' | 'vehicle' | 'lot' | 'agent';

export interface ExplorerEntityRef {
    type: ExplorerEntityType;
    data: any;
}

export interface ExplorerData {
    residents: Resident[];
    vehicles: Vehicle[];
    lots: Lot[];
    tourists?: Agent[];
}

export interface EntityExplorerConfig {
    onSelect?: (entity: ExplorerEntityRef | null) => void;
}

type ExplorerFilter = 'all' | 'resident' | 'vehicle' | 'lot';

interface EntityIndexItem {
    type: ExplorerEntityType;
    id: string;
    label: string;
    subLabel: string;
    searchText: string;
    data: any;
}

const LOT_STATE_LABELS: Record<LotState, string> = {
    [LotState.EMPTY]: 'Empty',
    [LotState.OCCUPIED]: 'Occupied',
    [LotState.AWAY]: 'Away',
    [LotState.ABANDONED]: 'Abandoned',
    [LotState.FOR_SALE]: 'For Sale',
};

export class EntityExplorer {
    container: HTMLDivElement;
    private headerCount: HTMLSpanElement;
    private searchInput: HTMLInputElement;
    private results: HTMLDivElement;
    private details: HTMLDivElement;
    private filterButtons: Map<ExplorerFilter, HTMLButtonElement> = new Map();
    private filter: ExplorerFilter = 'all';
    private query: string = '';
    private data: ExplorerData = { residents: [], vehicles: [], lots: [] };
    private index: EntityIndexItem[] = [];
    private residentById: Map<string, Resident> = new Map();
    private vehicleById: Map<string, Vehicle> = new Map();
    private lotById: Map<string, Lot> = new Map();
    private selected: ExplorerEntityRef | null = null;
    private onSelect?: (entity: ExplorerEntityRef | null) => void;
    private collapsed: boolean = false;

    constructor(config: EntityExplorerConfig = {}) {
        this.onSelect = config.onSelect;

        this.container = document.createElement('div');
        this.container.className = 'entity-explorer';
        this.applyStyles();

        this.container.innerHTML = `
            <div class="entity-explorer__header">
                <div>
                    <div class="entity-explorer__title">Entity Explorer</div>
                    <div class="entity-explorer__meta"><span class="entity-explorer__count">0</span> entities</div>
                </div>
                <button class="entity-explorer__collapse" title="Collapse">▾</button>
            </div>
            <div class="entity-explorer__search">
                <input class="entity-explorer__input" type="search" placeholder="Search residents, houses, cars..." />
            </div>
            <div class="entity-explorer__filters">
                <button class="entity-explorer__filter" data-filter="all">All</button>
                <button class="entity-explorer__filter" data-filter="resident">Residents</button>
                <button class="entity-explorer__filter" data-filter="lot">Houses</button>
                <button class="entity-explorer__filter" data-filter="vehicle">Cars</button>
            </div>
            <div class="entity-explorer__results"></div>
            <div class="entity-explorer__details">
                <div class="entity-explorer__placeholder">Select a resident, house, or car to view relationships.</div>
            </div>
        `;

        document.body.appendChild(this.container);

        this.headerCount = this.container.querySelector('.entity-explorer__count') as HTMLSpanElement;
        this.searchInput = this.container.querySelector('.entity-explorer__input') as HTMLInputElement;
        this.results = this.container.querySelector('.entity-explorer__results') as HTMLDivElement;
        this.details = this.container.querySelector('.entity-explorer__details') as HTMLDivElement;
        const collapseBtn = this.container.querySelector('.entity-explorer__collapse') as HTMLButtonElement;

        const filterButtons = Array.from(this.container.querySelectorAll('.entity-explorer__filter')) as HTMLButtonElement[];
        filterButtons.forEach(btn => {
            const filter = (btn.dataset.filter || 'all') as ExplorerFilter;
            this.filterButtons.set(filter, btn);
            btn.addEventListener('click', () => this.setFilter(filter));
        });
        this.setFilter('all');

        this.searchInput.addEventListener('input', () => {
            this.query = this.searchInput.value.trim().toLowerCase();
            this.renderResults();
        });

        collapseBtn.addEventListener('click', () => {
            this.setCollapsed(!this.collapsed);
        });

        this.results.addEventListener('click', (event) => {
            const target = event.target as HTMLElement;
            const item = target.closest<HTMLButtonElement>('.entity-explorer__item');
            if (!item) return;
            const type = (item.dataset.type || 'resident') as ExplorerEntityType;
            const id = item.dataset.id || '';
            const entity = this.getEntityById(type, id);
            if (entity) {
                this.select({ type, data: entity });
            }
        });

        this.details.addEventListener('click', (event) => {
            const target = event.target as HTMLElement;
            const link = target.closest<HTMLButtonElement>('.entity-link');
            if (!link) return;
            const type = (link.dataset.type || 'resident') as ExplorerEntityType;
            const id = link.dataset.id || '';
            const entity = this.getEntityById(type, id);
            if (entity) {
                this.select({ type, data: entity });
            }
        });
    }

    setVisible(visible: boolean) {
        this.container.style.display = visible ? 'grid' : 'none';
    }

    setCollapsed(collapsed: boolean) {
        this.collapsed = collapsed;
        this.container.classList.toggle('collapsed', collapsed);
        const btn = this.container.querySelector('.entity-explorer__collapse') as HTMLButtonElement;
        if (btn) btn.textContent = collapsed ? '▸' : '▾';
    }

    isCollapsed(): boolean {
        return this.collapsed;
    }

    setData(data: ExplorerData) {
        this.data = data;
        this.residentById.clear();
        this.vehicleById.clear();
        this.lotById.clear();

        data.residents.forEach(r => this.residentById.set(r.data.id, r));
        data.vehicles.forEach(v => this.vehicleById.set(v.id, v));
        data.lots.forEach(lot => this.lotById.set(String(lot.id), lot));

        this.buildIndex();
        this.renderResults();
        this.renderDetails(this.selected);
    }

    setSelected(entity: ExplorerEntityRef | null) {
        this.selected = entity;
        this.renderDetails(entity);
    }

    private select(entity: ExplorerEntityRef | null) {
        this.selected = entity;
        this.renderDetails(entity);
        if (this.onSelect) {
            this.onSelect(entity);
        }
    }

    private buildIndex() {
        const index: EntityIndexItem[] = [];

        this.data.residents.forEach(resident => {
            const label = resident.fullName;
            const subLabel = resident.address;
            const id = resident.data.id;
            index.push({
                type: 'resident',
                id,
                label,
                subLabel,
                searchText: `${id} ${label} ${subLabel}`.toLowerCase(),
                data: resident,
            });
        });

        this.data.lots.forEach(lot => {
            const address = lot.address ? lot.address.fullAddress : `Lot #${lot.id}`;
            const subLabel = `${LOT_STATE_LABELS[lot.state] || lot.state} • ${lot.usage}`;
            const id = String(lot.id);
            index.push({
                type: 'lot',
                id,
                label: address,
                subLabel,
                searchText: `${id} ${address} ${subLabel}`.toLowerCase(),
                data: lot,
            });
        });

        this.data.vehicles.forEach(vehicle => {
            const owner = this.getOwnerForVehicle(vehicle);
            const label = vehicle.isTouristCar ? `Tourist Car ${vehicle.id}` : `Car ${vehicle.id}`;
            const subLabel = owner ? `Owner: ${owner.fullName}` : vehicle.isTouristCar ? 'Rental / Visitor' : 'Unassigned';
            const id = vehicle.id;
            index.push({
                type: 'vehicle',
                id,
                label,
                subLabel,
                searchText: `${id} ${label} ${subLabel}`.toLowerCase(),
                data: vehicle,
            });
        });

        this.index = index;
        this.headerCount.textContent = String(index.length);
    }

    private renderResults() {
        const filtered = this.index.filter(item => {
            if (this.filter !== 'all' && item.type !== this.filter) return false;
            if (!this.query) return true;
            return item.searchText.includes(this.query);
        });

        const grouped: Record<ExplorerEntityType, EntityIndexItem[]> = {
            resident: [],
            lot: [],
            vehicle: [],
            agent: [],
        };
        filtered.forEach(item => grouped[item.type].push(item));

        const sections: Array<{ type: ExplorerEntityType; title: string }> = [
            { type: 'resident', title: `Residents (${grouped.resident.length})` },
            { type: 'lot', title: `Houses (${grouped.lot.length})` },
            { type: 'vehicle', title: `Cars (${grouped.vehicle.length})` },
        ];

        this.results.innerHTML = '';
        sections.forEach(section => {
            const items = grouped[section.type];
            if (items.length === 0) return;

            const header = document.createElement('div');
            header.className = 'entity-explorer__section';
            header.textContent = section.title;
            this.results.appendChild(header);

            items.slice(0, 150).forEach(item => {
                const button = document.createElement('button');
                button.className = 'entity-explorer__item';
                button.dataset.type = item.type;
                button.dataset.id = item.id;
                button.innerHTML = `
                    <div class="entity-explorer__item-title">${item.label}</div>
                    <div class="entity-explorer__item-sub">${item.subLabel}</div>
                `;
                if (this.selected && this.selected.type === item.type && this.getEntityId(this.selected) === item.id) {
                    button.classList.add('active');
                }
                this.results.appendChild(button);
            });
        });

        if (filtered.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'entity-explorer__empty';
            empty.textContent = 'No matches. Try a name, lot address, or car id.';
            this.results.appendChild(empty);
        }
    }

    private renderDetails(entity: ExplorerEntityRef | null) {
        if (!entity) {
            this.details.innerHTML = `<div class="entity-explorer__placeholder">Select a resident, house, or car to view relationships.</div>`;
            this.renderResults();
            return;
        }

        if (entity.type === 'resident') {
            const resident = entity.data as Resident;
            const homeLot = resident.data.homeLot;
            const car = resident.data.car;
            const household = this.getResidentsByLot(homeLot).filter(r => r.data.id !== resident.data.id);
            const householdLinks = household.length
                ? household.map(r => this.buildEntityLink('resident', r.data.id, r.fullName)).join('')
                : `<span class="entity-explorer__muted">None</span>`;

            const carLink = car
                ? this.buildEntityLink('vehicle', car.id, `Car ${car.id}`)
                : `<span class="entity-explorer__muted">No car</span>`;

            const lotLink = this.buildEntityLink('lot', String(homeLot.id), homeLot.address ? homeLot.address.fullAddress : `Lot #${homeLot.id}`);

            this.details.innerHTML = `
                <div class="entity-explorer__detail-title">${resident.fullName}</div>
                <div class="entity-explorer__detail-meta">Resident • ${resident.data.age} • ${resident.data.occupation}</div>
                <div class="entity-explorer__detail-block">
                    <div class="entity-explorer__detail-label">Home</div>
                    <div class="entity-explorer__detail-value">${lotLink}</div>
                </div>
                <div class="entity-explorer__detail-block">
                    <div class="entity-explorer__detail-label">Car</div>
                    <div class="entity-explorer__detail-value">${carLink}</div>
                </div>
                <div class="entity-explorer__detail-block">
                    <div class="entity-explorer__detail-label">Household</div>
                    <div class="entity-explorer__detail-links">${householdLinks}</div>
                </div>
            `;
        } else if (entity.type === 'lot') {
            const lot = entity.data as Lot;
            const residents = this.getResidentsByLot(lot);
            const owner = residents[0];
            const ownerLink = owner
                ? this.buildEntityLink('resident', owner.data.id, owner.fullName)
                : `<span class="entity-explorer__muted">No owner</span>`;

            const occupants = residents.length
                ? residents.map(r => this.buildEntityLink('resident', r.data.id, r.fullName)).join('')
                : `<span class="entity-explorer__muted">None</span>`;

            this.details.innerHTML = `
                <div class="entity-explorer__detail-title">${lot.address ? lot.address.fullAddress : `Lot #${lot.id}`}</div>
                <div class="entity-explorer__detail-meta">House • ${LOT_STATE_LABELS[lot.state] || lot.state} • ${lot.usage}</div>
                <div class="entity-explorer__detail-block">
                    <div class="entity-explorer__detail-label">Owner</div>
                    <div class="entity-explorer__detail-value">${ownerLink}</div>
                </div>
                <div class="entity-explorer__detail-block">
                    <div class="entity-explorer__detail-label">Occupants</div>
                    <div class="entity-explorer__detail-links">${occupants}</div>
                </div>
            `;
        } else if (entity.type === 'vehicle') {
            const vehicle = entity.data as Vehicle;
            const owner = this.getOwnerForVehicle(vehicle);
            const ownerLink = owner
                ? this.buildEntityLink('resident', owner.data.id, owner.fullName)
                : `<span class="entity-explorer__muted">${vehicle.isTouristCar ? 'Visitor rental' : 'No owner'}</span>`;

            const potential = owner ? this.getResidentsByLot(owner.data.homeLot).filter(r => r.data.id !== owner.data.id) : [];
            const potentialLinks = potential.length
                ? potential.map(r => this.buildEntityLink('resident', r.data.id, r.fullName)).join('')
                : `<span class="entity-explorer__muted">${owner ? 'None' : 'Any visitor could ride'}</span>`;

            const homeLink = owner
                ? this.buildEntityLink('lot', String(owner.data.homeLot.id), owner.address)
                : `<span class="entity-explorer__muted">—</span>`;

            this.details.innerHTML = `
                <div class="entity-explorer__detail-title">${vehicle.isTouristCar ? 'Tourist Car' : 'Car'} ${vehicle.id}</div>
                <div class="entity-explorer__detail-meta">Vehicle • ${vehicle.isTouristCar ? 'Tourist' : 'Resident'} car</div>
                <div class="entity-explorer__detail-block">
                    <div class="entity-explorer__detail-label">Owner</div>
                    <div class="entity-explorer__detail-value">${ownerLink}</div>
                </div>
                <div class="entity-explorer__detail-block">
                    <div class="entity-explorer__detail-label">Home</div>
                    <div class="entity-explorer__detail-value">${homeLink}</div>
                </div>
                <div class="entity-explorer__detail-block">
                    <div class="entity-explorer__detail-label">Potential passengers</div>
                    <div class="entity-explorer__detail-links">${potentialLinks}</div>
                </div>
            `;
        } else {
            this.details.innerHTML = `
                <div class="entity-explorer__detail-title">Entity</div>
                <div class="entity-explorer__detail-meta">${entity.type}</div>
            `;
        }

        this.renderResults();
    }

    private buildEntityLink(type: ExplorerEntityType, id: string, label: string): string {
        return `<button class="entity-link" data-type="${type}" data-id="${id}">${label}</button>`;
    }

    private getEntityById(type: ExplorerEntityType, id: string): any | null {
        if (type === 'resident') return this.residentById.get(id) || null;
        if (type === 'vehicle') return this.vehicleById.get(id) || null;
        if (type === 'lot') return this.lotById.get(id) || null;
        return null;
    }

    private getEntityId(entity: ExplorerEntityRef): string {
        if (entity.type === 'resident') return entity.data.data.id;
        if (entity.type === 'vehicle') return entity.data.id;
        if (entity.type === 'lot') return String(entity.data.id);
        return '';
    }

    private setFilter(filter: ExplorerFilter) {
        this.filter = filter;
        this.filterButtons.forEach((btn, key) => {
            btn.classList.toggle('active', key === filter);
        });
        this.renderResults();
    }

    private getOwnerForVehicle(vehicle: Vehicle): Resident | undefined {
        return this.data.residents.find(r => r.data.car === vehicle);
    }

    private getResidentsByLot(lot: Lot): Resident[] {
        return this.data.residents.filter(r => r.data.homeLot.id === lot.id);
    }

    private applyStyles() {
        if (!document.getElementById('entity-explorer-styles')) {
            const style = document.createElement('style');
            style.id = 'entity-explorer-styles';
            style.textContent = `
                .entity-explorer {
                    position: absolute;
                    right: 20px;
                    bottom: 20px;
                    width: 360px;
                    height: 520px;
                    display: grid;
                    grid-template-rows: auto auto auto 1fr auto;
                    gap: 10px;
                    padding: 14px;
                    background: linear-gradient(180deg, rgba(24, 22, 18, 0.95), rgba(16, 14, 12, 0.95));
                    border: 1px solid rgba(110, 90, 70, 0.7);
                    border-radius: 14px;
                    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.45);
                    color: #F2E9DA;
                    font-family: "Avenir Next", "Gill Sans", "Trebuchet MS", sans-serif;
                    z-index: 110;
                }

                .entity-explorer__header {
                    display: flex;
                    justify-content: space-between;
                    align-items: baseline;
                }

                .entity-explorer__title {
                    font-size: 16px;
                    font-weight: 700;
                    letter-spacing: 0.3px;
                    color: #F7E6C4;
                }

                .entity-explorer__meta {
                    font-size: 11px;
                    color: rgba(242, 233, 218, 0.7);
                    text-transform: uppercase;
                    letter-spacing: 0.6px;
                }

                .entity-explorer__collapse {
                    border: 1px solid rgba(90, 75, 60, 0.7);
                    background: rgba(28, 25, 21, 0.8);
                    color: rgba(242, 233, 218, 0.85);
                    border-radius: 8px;
                    width: 28px;
                    height: 26px;
                    cursor: pointer;
                }

                .entity-explorer__search {
                    display: flex;
                    gap: 8px;
                }

                .entity-explorer__input {
                    width: 100%;
                    padding: 8px 10px;
                    border-radius: 10px;
                    border: 1px solid rgba(115, 100, 80, 0.8);
                    background: rgba(18, 16, 13, 0.9);
                    color: #F2E9DA;
                    font-size: 12px;
                    outline: none;
                }

                .entity-explorer__input::placeholder {
                    color: rgba(242, 233, 218, 0.45);
                }

                .entity-explorer__filters {
                    display: grid;
                    grid-template-columns: repeat(4, 1fr);
                    gap: 6px;
                }

                .entity-explorer__filter {
                    padding: 6px 8px;
                    border-radius: 8px;
                    border: 1px solid rgba(90, 75, 60, 0.7);
                    background: rgba(28, 25, 21, 0.8);
                    color: rgba(242, 233, 218, 0.7);
                    font-size: 10px;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    cursor: pointer;
                    transition: all 0.15s ease;
                }

                .entity-explorer__filter.active {
                    background: rgba(90, 110, 80, 0.9);
                    border-color: rgba(160, 190, 140, 0.8);
                    color: #F7F0DA;
                }

                .entity-explorer__results {
                    overflow: auto;
                    padding-right: 4px;
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                }

                .entity-explorer__section {
                    font-size: 10px;
                    text-transform: uppercase;
                    letter-spacing: 0.6px;
                    color: rgba(242, 233, 218, 0.6);
                    margin-top: 4px;
                }

                .entity-explorer__item {
                    text-align: left;
                    padding: 8px 10px;
                    border-radius: 10px;
                    border: 1px solid rgba(70, 60, 50, 0.8);
                    background: rgba(26, 22, 18, 0.85);
                    color: #F2E9DA;
                    cursor: pointer;
                    transition: all 0.15s ease;
                }

                .entity-explorer__item:hover {
                    border-color: rgba(150, 130, 100, 0.9);
                    background: rgba(40, 34, 28, 0.9);
                }

                .entity-explorer__item.active {
                    border-color: rgba(150, 190, 130, 0.9);
                    background: rgba(46, 58, 38, 0.9);
                }

                .entity-explorer__item-title {
                    font-size: 12px;
                    font-weight: 600;
                }

                .entity-explorer__item-sub {
                    font-size: 10px;
                    color: rgba(242, 233, 218, 0.65);
                }

                .entity-explorer__details {
                    border-top: 1px solid rgba(90, 75, 60, 0.7);
                    padding-top: 10px;
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                    font-size: 12px;
                }

                .entity-explorer__detail-title {
                    font-size: 14px;
                    font-weight: 700;
                }

                .entity-explorer__detail-meta {
                    font-size: 11px;
                    color: rgba(242, 233, 218, 0.6);
                }

                .entity-explorer__detail-block {
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                }

                .entity-explorer__detail-label {
                    font-size: 10px;
                    text-transform: uppercase;
                    letter-spacing: 0.6px;
                    color: rgba(242, 233, 218, 0.6);
                }

                .entity-explorer__detail-links {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 6px;
                }

                .entity-link {
                    padding: 4px 8px;
                    border-radius: 999px;
                    border: 1px solid rgba(120, 110, 90, 0.8);
                    background: rgba(32, 28, 24, 0.9);
                    color: #F2E9DA;
                    font-size: 11px;
                    cursor: pointer;
                    transition: all 0.15s ease;
                }

                .entity-link:hover {
                    border-color: rgba(170, 150, 120, 0.9);
                    background: rgba(48, 42, 34, 0.95);
                }

                .entity-explorer__muted {
                    color: rgba(242, 233, 218, 0.5);
                }

                .entity-explorer__empty,
                .entity-explorer__placeholder {
                    font-size: 11px;
                    color: rgba(242, 233, 218, 0.55);
                }

                .entity-explorer.collapsed {
                    height: auto;
                    grid-template-rows: auto;
                }

                .entity-explorer.collapsed .entity-explorer__search,
                .entity-explorer.collapsed .entity-explorer__filters,
                .entity-explorer.collapsed .entity-explorer__results,
                .entity-explorer.collapsed .entity-explorer__details {
                    display: none;
                }
            `;
            document.head.appendChild(style);
        }
    }
}
