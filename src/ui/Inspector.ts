
export class Inspector {
    container: HTMLElement;
    visible: boolean = false;

    constructor() {
        this.container = document.createElement('div');
        this.container.style.position = 'absolute';
        this.container.style.top = '280px';  // Below lil-gui controls
        this.container.style.right = '20px';
        this.container.style.width = '300px';
        this.container.style.backgroundColor = 'rgba(30,30,30,0.9)';
        this.container.style.color = '#eee';
        this.container.style.padding = '15px';
        this.container.style.borderRadius = '8px';
        this.container.style.fontFamily = 'monospace';
        this.container.style.display = 'none';
        this.container.style.border = '1px solid #555';
        this.container.style.boxShadow = '0 4px 6px rgba(0,0,0,0.3)';
        document.body.appendChild(this.container);
    }

    show(data: any) {
        this.visible = true;
        this.container.style.display = 'block';
        this.updateContent(data);
    }

    hide() {
        this.visible = false;
        this.container.style.display = 'none';
    }

    updateContent(data: any) {
        if (!data) return;

        let html = `<h3 style="margin-top:0; border-bottom:1px solid #555;">Inspector</h3>`;

        if (data.type === 'lot') {
            const lot = data.data;
            html += `
                <div><strong>Type:</strong> Lot</div>
                <div><strong>ID:</strong> ${lot.id}</div>
                <div><strong>State:</strong> ${lot.state}</div>
                <div><strong>Usage:</strong> ${lot.usage}</div>
                <div><strong>Points:</strong> ${lot.points.length}</div>
            `;
        } else if (data.type === 'agent') {
            const agent = data.data;
            html += `
                <div><strong>Type:</strong> ${agent.type}</div>
                <div><strong>ID:</strong> ${agent.id}</div>
                <div><strong>Speed:</strong> ${agent.speed.toFixed(1)}</div>
                <div><strong>Pos:</strong> ${agent.mesh.position.x.toFixed(0)}, ${agent.mesh.position.z.toFixed(0)}</div>
            `;
            if (agent.target) {
                html += `<div><strong>Target:</strong> ${agent.target.x.toFixed(0)}, ${agent.target.z.toFixed(0)}</div>`;
            }
        } else if (data.type === 'vehicle') {
            const vehicle = data.data;
            html += `
                <div><strong>Type:</strong> Vehicle</div>
                <div><strong>ID:</strong> ${vehicle.id}</div>
                <div><strong>Speed:</strong> ${vehicle.speed.toFixed(1)}</div>
                <div><strong>Pos:</strong> ${vehicle.mesh.position.x.toFixed(0)}, ${vehicle.mesh.position.z.toFixed(0)}</div>
            `;
            if (vehicle.target) {
                html += `<div><strong>Target:</strong> ${vehicle.target.x.toFixed(0)}, ${vehicle.target.z.toFixed(0)}</div>`;
            }
        } else if (data.type === 'road') {
            const seg = data.data;
            html += `
                <div><strong>Type:</strong> Road</div>
                <div><strong>Position:</strong> ${seg.x.toFixed(0)}, ${seg.y.toFixed(0)}</div>
                <div><strong>Size:</strong> ${seg.width.toFixed(0)} x ${seg.height.toFixed(0)}</div>
            `;
        }

        this.container.innerHTML = html;
    }
}
