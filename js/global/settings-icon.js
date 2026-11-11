/** Shared gear for links that open the extension settings. */
function createAITSettingsIcon() {
    const ns = 'http://www.w3.org/2000/svg';
    const icon = document.createElementNS(ns, 'svg');
    for (const [name, value] of Object.entries({
        viewBox: '0 0 24 24', 'aria-hidden': 'true', fill: 'none', stroke: 'currentColor',
        'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round'
    })) icon.setAttribute(name, value);
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', 'M9.67 4.14a2.34 2.34 0 0 1 4.66 0 2.34 2.34 0 0 0 3.32 1.91 2.34 2.34 0 0 1 2.33 4.04 2.34 2.34 0 0 0 0 3.82 2.34 2.34 0 0 1-2.33 4.04 2.34 2.34 0 0 0-3.32 1.91 2.34 2.34 0 0 1-4.66 0 2.34 2.34 0 0 0-3.32-1.91 2.34 2.34 0 0 1-2.33-4.04 2.34 2.34 0 0 0 0-3.82 2.34 2.34 0 0 1 2.33-4.04 2.34 2.34 0 0 0 3.32-1.91Z');
    const center = document.createElementNS(ns, 'circle');
    center.setAttribute('cx', '12');
    center.setAttribute('cy', '12');
    center.setAttribute('r', '3');
    icon.append(path, center);
    return icon;
}
