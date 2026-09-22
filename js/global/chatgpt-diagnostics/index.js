/** Temporary ChatGPT diagnostics. Only fixed labels, types, counts and booleans. */
(() => {
    'use strict';
    if (!['chatgpt.com', 'chat.openai.com'].includes(location.hostname) || window.AITGPTDiagnostics) return;
    const started = performance.now();
    const world = typeof chrome !== 'undefined' && chrome.runtime?.id ? 'ISOLATED' : 'MAIN';
    const entries = new Map();
    const repeats = new Map();
    const type = value => value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
    function log(event, data = {}) {
        try {
            const encoded = JSON.stringify(data);
            const previous = entries.get(event);
            const now = performance.now();
            if (previous?.data === encoded && now - previous.at < 5000) return;
            const count = (repeats.get(event) || 0) + 1;
            if (count > 100) return;
            repeats.set(event, count);
            entries.set(event, { data: encoded, at: now });
            console.info('[AIT-GPT-DIAG] ' + JSON.stringify({ world, ms: Math.round(now - started), event, ...data }));
        } catch { /* Diagnostics must never break the extension. */ }
    }
    function error(stage, err) {
        const names = ['Error', 'TypeError', 'SyntaxError', 'ReferenceError', 'RangeError', 'AbortError', 'SecurityError'];
        log('error', { stage, type: names.includes(err?.name) ? err.name : 'unknown' });
    }
    function shape(json) {
        // No arbitrary key names, scalar values, IDs, titles, URLs or error messages.
        const fields = ['mapping', 'current_node', 'messages', 'nodes', 'turns', 'items', 'data', 'conversation', 'result'];
        const describe = value => {
            const result = { type: type(value) };
            if (Array.isArray(value)) result.length = value.length;
            else if (value && typeof value === 'object') {
                result.keyCount = Object.keys(value).length;
                for (const field of fields) {
                    if (Object.prototype.hasOwnProperty.call(value, field)) {
                        const child = value[field];
                        result[field] = { type: type(child), count: child && typeof child === 'object' ? Object.keys(child).length : undefined };
                    }
                }
            }
            return result;
        };
        const result = { root: describe(json) };
        for (const field of ['data', 'conversation', 'result']) {
            if (json && typeof json === 'object' && Object.prototype.hasOwnProperty.call(json, field)) result[field] = describe(json[field]);
        }
        return result;
    }
    function domSnapshot(stage) {
        try {
            const count = selector => document.querySelectorAll(selector).length;
            const timeline = document.querySelector('.ait-chat-timeline-wrapper');
            log('dom-snapshot', {
                stage, ready: document.readyState,
                route: location.pathname.includes('/c/') ? 'conversation' : location.pathname.includes('/share/') ? 'share' : 'other',
                nativeUser: count('[data-turn="user"][data-turn-id]'),
                virtualContainers: count('[data-turn-id-container]'),
                markedUser: count('[data-turn-id-container][data-ait-turn="user"]'),
                authorUser: count('[data-message-author-role="user"]'),
                timelinePresent: !!timeline,
                timelineDisplay: timeline ? getComputedStyle(timeline).display : 'absent',
                hiddenByPrimary: !!document.querySelector('.text-token-primary'),
                hiddenByFlyout: !!document.querySelector('[data-stage-thread-flyout="true"][data-testid="stage-thread-flyout"]')
            });
        } catch (err) { error('dom-snapshot', err); }
    }
    window.AITGPTDiagnostics = { log, error, type, shape, domSnapshot };
    log('diagnostics-start', { revision: 1, ready: document.readyState });
    if (world === 'ISOLATED') {
        try { log('extension-version', { version: chrome.runtime.getManifest().version }); } catch {}
        for (const delay of [0, 5000, 15000, 30000]) setTimeout(() => domSnapshot(`load-${delay}`), delay);
        window.addEventListener('url:change', () => domSnapshot('route-change'));
    }
})();
