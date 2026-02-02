import { Resident, ResidentState, Chronotype, WorkSchedule, Lifestyle } from '../entities/Resident';
import { Vehicle } from '../entities/Vehicle';
import { Lot, LotState, AgentType } from '../types';
import { Agent } from '../entities/Agent';
import { Tourist, TouristState } from '../entities/Tourist';

export type ExplorerEntityType = 'resident' | 'vehicle' | 'lot' | 'agent' | 'tourist';

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

type ExplorerFilter = 'all' | 'resident' | 'vehicle' | 'lot' | 'tourist';

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

const BEHAVIOR_LABELS: Record<ResidentState, { label: string; color: string }> = {
    [ResidentState.SLEEPING]: { label: 'Sleeping', color: '#6B5B95' },
    [ResidentState.WAKING_UP]: { label: 'Waking up', color: '#8B7B9F' },
    [ResidentState.IDLE_HOME]: { label: 'At home', color: '#50C878' },
    [ResidentState.EATING]: { label: 'Eating', color: '#F7DC6F' },
    [ResidentState.WALKING_TO_CAR]: { label: 'Walking to car', color: '#FFB347' },
    [ResidentState.DRIVING]: { label: 'Driving', color: '#4ECDC4' },
    [ResidentState.WALKING_HOME]: { label: 'Heading home', color: '#88AAFF' },
    [ResidentState.WALKING_AROUND]: { label: 'Walking around', color: '#FFB347' },
    [ResidentState.WORKING]: { label: 'Working', color: '#5DADE2' },
    [ResidentState.SHOPPING]: { label: 'Shopping', color: '#F39C12' },
    [ResidentState.AT_BAR]: { label: 'At the bar', color: '#CD853F' },
    [ResidentState.SOCIALIZING]: { label: 'Visiting friends', color: '#E74C3C' },
    [ResidentState.AT_CHURCH]: { label: 'At church', color: '#8A7A9A' },
};

const TOURIST_STATE_LABELS: Record<TouristState, string> = {
    [TouristState.ARRIVING]: 'Arriving',
    [TouristState.WALKING]: 'Exploring',
    [TouristState.STAYING]: 'At lodging',
    [TouristState.RETURNING_TO_CAR]: 'Returning to car',
    [TouristState.LEAVING]: 'Leaving',
    [TouristState.EXITED]: 'Left',
};

const CHRONOTYPE_LABELS: Record<Chronotype, string> = {
    [Chronotype.EARLY_BIRD]: '🌅 Early Bird',
    [Chronotype.NORMAL]: '☀️ Normal',
    [Chronotype.NIGHT_OWL]: '🌙 Night Owl',
};

const WORK_SCHEDULE_LABELS: Record<WorkSchedule, string> = {
    [WorkSchedule.UNEMPLOYED]: 'Unemployed',
    [WorkSchedule.RETIRED]: 'Retired',
    [WorkSchedule.DAY_SHIFT]: 'Day Shift',
    [WorkSchedule.LATE_SHIFT]: 'Late Shift',
    [WorkSchedule.NIGHT_SHIFT]: 'Night Shift',
    [WorkSchedule.FREELANCE]: 'Freelance',
    [WorkSchedule.PART_TIME]: 'Part-Time',
};

const LIFESTYLE_LABELS: Record<Lifestyle, string> = {
    [Lifestyle.HOMEBODY]: '🏠 Homebody',
    [Lifestyle.BALANCED]: '⚖️ Balanced',
    [Lifestyle.SOCIAL_BUTTERFLY]: '🦋 Social Butterfly',
    [Lifestyle.WORKAHOLIC]: '💼 Workaholic',
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
    private touristById: Map<string, Tourist> = new Map();
    private selected: ExplorerEntityRef | null = null;
    private onSelect?: (entity: ExplorerEntityRef | null) => void;
    private collapsed: boolean = true;

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
                <button class="entity-explorer__filter" data-filter="tourist">Tourists</button>
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

        // Apply initial collapsed state
        this.setCollapsed(this.collapsed);

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
        this.touristById.clear();

        data.residents.forEach(r => this.residentById.set(r.data.id, r));
        data.vehicles.forEach(v => this.vehicleById.set(v.id, v));
        data.lots.forEach(lot => this.lotById.set(String(lot.id), lot));
        (data.tourists || []).forEach(t => this.touristById.set((t as Tourist).data?.id || t.id, t as Tourist));

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

        (this.data.tourists || []).forEach(agent => {
            const tourist = agent as Tourist;
            const id = tourist.data?.id || tourist.id;
            const state = TOURIST_STATE_LABELS[tourist.state] || tourist.state;
            const hasLodging = !!tourist.data?.lodgingLot;
            const subLabel = `${state} • ${hasLodging ? 'Lodging guest' : 'Day visitor'}`;
            index.push({
                type: 'tourist',
                id,
                label: `Tourist ${id.replace('tourist_', '').substring(0, 8)}`,
                subLabel,
                searchText: `${id} tourist ${subLabel}`.toLowerCase(),
                data: tourist,
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
            tourist: [],
        };
        filtered.forEach(item => grouped[item.type].push(item));

        const sections: Array<{ type: ExplorerEntityType; title: string }> = [
            { type: 'resident', title: `Residents (${grouped.resident.length})` },
            { type: 'lot', title: `Houses (${grouped.lot.length})` },
            { type: 'vehicle', title: `Cars (${grouped.vehicle.length})` },
            { type: 'tourist', title: `Tourists (${grouped.tourist.length})` },
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

            // Real-time data
            const behaviorState = resident.behaviorState || ResidentState.IDLE_HOME;
            const behavior = BEHAVIOR_LABELS[behaviorState] || { label: 'Unknown', color: '#888' };
            const pos = resident.mesh?.position;
            const posStr = pos ? `${pos.x.toFixed(0)}, ${pos.z.toFixed(0)}` : '—';
            const pathLen = resident.path?.length || 0;

            // Personality labels
            const chronotypeLabel = CHRONOTYPE_LABELS[resident.data.chronotype] || 'Unknown';
            const workLabel = WORK_SCHEDULE_LABELS[resident.data.workSchedule] || 'Unknown';
            const lifestyleLabel = LIFESTYLE_LABELS[resident.data.lifestyle] || 'Unknown';

            // Format wake/sleep times
            const formatTime = (h: number) => {
                const hours = Math.floor(h) % 24;
                const mins = Math.round((h % 1) * 60);
                return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
            };
            const scheduleStr = `${formatTime(resident.data.wakeTime)} - ${formatTime(resident.data.sleepTime)}`;

            // Work hours if employed
            const hasWork = resident.data.workStartTime !== undefined && resident.data.workEndTime !== undefined;
            const workHoursStr = hasWork
                ? `${formatTime(resident.data.workStartTime!)} - ${formatTime(resident.data.workEndTime!)}`
                : null;

            // Format trait as percentage bar
            const traitBar = (value: number, label: string, color: string) => {
                const pct = Math.round(value * 100);
                return `<div class="entity-explorer__trait">
                    <span class="entity-explorer__trait-label">${label}</span>
                    <div class="entity-explorer__trait-bar">
                        <div class="entity-explorer__trait-fill" style="width: ${pct}%; background: ${color};"></div>
                    </div>
                    <span class="entity-explorer__trait-value">${pct}%</span>
                </div>`;
            };

            this.details.innerHTML = `
                <div class="entity-explorer__detail-title">${resident.fullName}</div>
                <div class="entity-explorer__detail-meta">Resident • ${resident.data.age} yrs • ${resident.data.occupation}</div>
                <div class="entity-explorer__detail-row">
                    <span class="entity-explorer__detail-pill" style="background: ${behavior.color}20; color: ${behavior.color};">${behavior.label}</span>
                    <span class="entity-explorer__detail-pill">${resident.isHome ? 'At home' : 'Out'}</span>
                    ${resident.isInCar ? '<span class="entity-explorer__detail-pill">In car</span>' : ''}
                </div>
                <div class="entity-explorer__detail-block">
                    <div class="entity-explorer__detail-label">Personality</div>
                    <div class="entity-explorer__detail-value">${chronotypeLabel} • ${lifestyleLabel}</div>
                </div>
                <div class="entity-explorer__detail-block">
                    <div class="entity-explorer__detail-label">Schedule</div>
                    <div class="entity-explorer__detail-value">${workLabel}${workHoursStr ? ` (${workHoursStr})` : ''}</div>
                    <div class="entity-explorer__detail-value" style="font-size: 10px; opacity: 0.7;">Sleep: ${scheduleStr}</div>
                </div>
                <div class="entity-explorer__detail-block">
                    <div class="entity-explorer__detail-label">Traits</div>
                    <div class="entity-explorer__traits">
                        ${traitBar(resident.data.sociability, 'Social', '#E74C3C')}
                        ${traitBar(resident.data.adventurous, 'Adventurous', '#3498DB')}
                        ${traitBar(resident.data.religiosity, 'Religious', '#9B59B6')}
                        ${traitBar(resident.data.drinkingHabit, 'Drinks', '#CD853F')}
                        ${traitBar(resident.data.routineVariation, 'Spontaneous', '#2ECC71')}
                    </div>
                </div>
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
                <div class="entity-explorer__detail-runtime">
                    <span>Position: ${posStr}</span>
                    ${pathLen > 0 ? `<span>Path: ${pathLen} waypoints</span>` : ''}
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

            // Real-time data
            const hasDriver = vehicle.driver !== null;
            const driverName = hasDriver ? (vehicle.driver.fullName || vehicle.driver.id) : null;
            const pos = vehicle.carGroup?.position || vehicle.mesh?.position;
            const posStr = pos ? `${pos.x.toFixed(0)}, ${pos.z.toFixed(0)}` : '—';
            const speedStr = `${Math.round(vehicle.currentSpeed || 0)}/${Math.round(vehicle.speed)}`;
            const pathLen = vehicle.path?.length || 0;
            const carType = vehicle.isPoliceCar ? 'Police' : vehicle.isTouristCar ? 'Tourist' : 'Resident';
            const carColor = vehicle.isPoliceCar ? '#5B8DEE' : vehicle.isTouristCar ? '#4ECDC4' : '#CC3333';

            this.details.innerHTML = `
                <div class="entity-explorer__detail-title">${vehicle.isPoliceCar ? 'Police Car' : vehicle.isTouristCar ? 'Tourist Car' : 'Car'} ${vehicle.id}</div>
                <div class="entity-explorer__detail-meta">Vehicle • <span style="color: ${carColor}">${carType}</span></div>
                <div class="entity-explorer__detail-row">
                    <span class="entity-explorer__detail-pill" style="background: ${hasDriver ? '#4ECDC420' : '#88888820'}; color: ${hasDriver ? '#4ECDC4' : '#888'};">${hasDriver ? `Driver: ${driverName}` : 'Parked'}</span>
                    <span class="entity-explorer__detail-pill">Speed: ${speedStr}</span>
                </div>
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
                <div class="entity-explorer__detail-runtime">
                    <span>Position: ${posStr}</span>
                    ${pathLen > 0 ? `<span>Path: ${pathLen} waypoints</span>` : ''}
                </div>
            `;
        } else if (entity.type === 'tourist') {
            const tourist = entity.data as Tourist;
            const state = TOURIST_STATE_LABELS[tourist.state] || tourist.state;
            const hasLodging = !!tourist.data?.lodgingLot;
            const lodgingLot = tourist.data?.lodgingLot;
            const lodgingLink = lodgingLot
                ? this.buildEntityLink('lot', String(lodgingLot.id), lodgingLot.address ? lodgingLot.address.fullAddress : `Lot #${lodgingLot.id}`)
                : `<span class="entity-explorer__muted">Day visitor</span>`;

            const car = tourist.data?.car;
            const carLink = car
                ? this.buildEntityLink('vehicle', car.id, `Car ${car.id}`)
                : `<span class="entity-explorer__muted">No car</span>`;

            // Real-time data
            const pos = tourist.mesh?.position;
            const posStr = pos ? `${pos.x.toFixed(0)}, ${pos.z.toFixed(0)}` : '—';
            const pathLen = tourist.path?.length || 0;
            const inCar = tourist.isInCar;

            this.details.innerHTML = `
                <div class="entity-explorer__detail-title">Tourist</div>
                <div class="entity-explorer__detail-meta">Visitor • ${hasLodging ? 'Overnight stay' : 'Day trip'}</div>
                <div class="entity-explorer__detail-row">
                    <span class="entity-explorer__detail-pill" style="background: #FFB34720; color: #FFB347;">${state}</span>
                    <span class="entity-explorer__detail-pill">${inCar ? 'In car' : 'On foot'}</span>
                </div>
                <div class="entity-explorer__detail-block">
                    <div class="entity-explorer__detail-label">Lodging</div>
                    <div class="entity-explorer__detail-value">${lodgingLink}</div>
                </div>
                <div class="entity-explorer__detail-block">
                    <div class="entity-explorer__detail-label">Car</div>
                    <div class="entity-explorer__detail-value">${carLink}</div>
                </div>
                <div class="entity-explorer__detail-runtime">
                    <span>Position: ${posStr}</span>
                    ${pathLen > 0 ? `<span>Path: ${pathLen} waypoints</span>` : ''}
                </div>
            `;
        } else if (entity.type === 'agent') {
            const agent = entity.data as Agent;
            const pos = agent.mesh?.position;
            const posStr = pos ? `${pos.x.toFixed(0)}, ${pos.z.toFixed(0)}` : '—';
            const pathLen = agent.path?.length || 0;
            const typeLabels: Record<string, { label: string; color: string }> = {
                [AgentType.DOG]: { label: 'Dog', color: '#CD853F' },
                [AgentType.CAT]: { label: 'Cat', color: '#E8E8E8' },
                [AgentType.COP]: { label: 'Police', color: '#5B8DEE' },
            };
            const typeInfo = typeLabels[agent.type] || { label: 'Agent', color: '#888' };

            this.details.innerHTML = `
                <div class="entity-explorer__detail-title">${typeInfo.label}</div>
                <div class="entity-explorer__detail-meta" style="color: ${typeInfo.color}">ID: ${agent.id}</div>
                <div class="entity-explorer__detail-row">
                    <span class="entity-explorer__detail-pill">Speed: ${Math.round(agent.speed)}</span>
                </div>
                <div class="entity-explorer__detail-runtime">
                    <span>Position: ${posStr}</span>
                    ${pathLen > 0 ? `<span>Path: ${pathLen} waypoints</span>` : ''}
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
        if (type === 'tourist') return this.touristById.get(id) || null;
        return null;
    }

    private getEntityId(entity: ExplorerEntityRef): string {
        if (entity.type === 'resident') return entity.data.data.id;
        if (entity.type === 'vehicle') return entity.data.id;
        if (entity.type === 'lot') return String(entity.data.id);
        if (entity.type === 'tourist') return entity.data.data?.id || entity.data.id;
        if (entity.type === 'agent') return entity.data.id;
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
                    grid-template-columns: repeat(5, 1fr);
                    gap: 4px;
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

                .entity-explorer__detail-row {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 6px;
                    margin-bottom: 8px;
                }

                .entity-explorer__detail-pill {
                    padding: 3px 8px;
                    border-radius: 12px;
                    font-size: 10px;
                    background: rgba(100, 100, 100, 0.3);
                    color: rgba(242, 233, 218, 0.85);
                }

                .entity-explorer__detail-runtime {
                    margin-top: 8px;
                    padding-top: 8px;
                    border-top: 1px solid rgba(90, 75, 60, 0.5);
                    display: flex;
                    flex-wrap: wrap;
                    gap: 12px;
                    font-size: 10px;
                    color: rgba(242, 233, 218, 0.5);
                    font-family: monospace;
                }

                .entity-explorer__traits {
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                }

                .entity-explorer__trait {
                    display: grid;
                    grid-template-columns: 80px 1fr 32px;
                    align-items: center;
                    gap: 8px;
                    font-size: 10px;
                }

                .entity-explorer__trait-label {
                    color: rgba(242, 233, 218, 0.7);
                }

                .entity-explorer__trait-bar {
                    height: 6px;
                    background: rgba(60, 50, 40, 0.8);
                    border-radius: 3px;
                    overflow: hidden;
                }

                .entity-explorer__trait-fill {
                    height: 100%;
                    border-radius: 3px;
                    transition: width 0.3s ease;
                }

                .entity-explorer__trait-value {
                    text-align: right;
                    color: rgba(242, 233, 218, 0.5);
                    font-family: monospace;
                    font-size: 9px;
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
