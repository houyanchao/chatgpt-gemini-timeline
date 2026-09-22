/** Temporary ChatGPT diagnostics. Only fixed labels, types, counts and booleans. */
(() => {
    'use strict';
    if (!['chatgpt.com', 'chat.openai.com'].includes(location.hostname) || window.AITGPTDiagnostics) return;
    const started = performance.now();
    const world = typeof chrome !== 'undefined' && chrome.runtime?.id ? 'ISOLATED' : 'MAIN';
    const entries = new Map();
    const repeats = new Map();
    const records = [];
    let dropped = 0;
    function remember(record) {
        if (records.length >= 2000) { dropped++; return; }
        records.push(record);
    }
    const type = value => value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
    function log(event, data = {}) {
        try {
            const encoded = JSON.stringify(data);
            const previous = entries.get(event);
            const now = performance.now();
            if (previous?.data === encoded && now - previous.at < 5000) return;
            const count = (repeats.get(event) || 0) + 1;
            if (count > 500) { dropped++; return; }
            repeats.set(event, count);
            entries.set(event, { data: encoded, at: now });
            const record = { world, ms: Math.round(now - started), event, ...data };
            remember(record);
            console.info('[AIT-GPT-DIAG] ' + JSON.stringify(record));
            if (world === 'ISOLATED') document.dispatchEvent(new CustomEvent('ait-gpt-diag-record', { detail: JSON.stringify(record) }));
        } catch { /* Diagnostics must never break the extension. */ }
    }
    function error(stage, err) {
        const names = ['Error', 'TypeError', 'SyntaxError', 'ReferenceError', 'RangeError', 'AbortError', 'SecurityError'];
        log('error', { stage, type: names.includes(err?.name) ? err.name : 'unknown' });
    }
    function shape(json) {
        // No arbitrary key names, scalar values, IDs, titles, URLs or error messages.
        const fields = ['mapping', 'current_node', 'messages', 'nodes', 'turns', 'items', 'data', 'conversation', 'result', 'id', 'title', 'create_time', 'update_time', 'message', 'author', 'role', 'content', 'content_type', 'parts', 'parent', 'children', 'conversation_id', 'conversationId', 'turn_id', 'turnId', 'message_id', 'messageId', 'uuid', 'metadata', 'text', 'body', 'payload', 'response', 'value', 'operation', 'op', 'path', 'blocks', 'entries', 'edges', 'node', 'cursor', 'has_more', 'next_cursor', 'status', 'is_complete'];
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
        // Distinguish conversation lists from message/turn lists without exposing item values.
        result.arrayItemSchemas = {};
        for (const field of ['items', 'messages', 'nodes', 'turns', 'data']) {
            if (Array.isArray(json?.[field])) result.arrayItemSchemas[field] = json[field].slice(0, 3).map(describe);
        }
        let budget = 180;
        let truncated = false;
        function tree(value, depth = 0, field = '') {
            if (--budget < 0) { truncated = true; return { truncated: true }; }
            const out = { type: type(value) };
            if (field === 'role' && ['user', 'assistant', 'system', 'tool'].includes(value)) out.role = value;
            if (!value || typeof value !== 'object') return out;
            out.count = Object.keys(value).length;
            if (depth >= 5) { out.depthLimit = true; return out; }
            if (Array.isArray(value)) out.samples = value.slice(0, 3).map(v => tree(v, depth + 1));
            else {
                out.fields = {};
                let unknown = 0;
                for (const key of Object.keys(value).sort((a, b) => Number(fields.includes(b)) - Number(fields.includes(a))).slice(0, 30)) {
                    if (budget <= 0) { truncated = true; break; }
                    // Unknown field names may be IDs. Emit only local ordinal aliases.
                    const label = fields.includes(key) ? key : `unknownField${++unknown}`;
                    out.fields[label] = tree(value[key], depth + 1, fields.includes(key) ? key : '');
                }
                if (out.count > 30) out.fieldsTruncated = true;
            }
            return out;
        }
        result.schemaTree = tree(json);
        result.schemaTreeTruncated = truncated;
        return result;
    }
    function domSnapshot(stage) {
        try {
            const count = selector => document.querySelectorAll(selector).length;
            const timeline = document.querySelector('.ait-chat-timeline-wrapper');
            const headingRoles = { user: 0, assistant: 0, unknown: 0 };
            for (const heading of document.querySelectorAll('main h4.sr-only')) {
                const text = (heading.textContent || '').trim().replace(/[:：]$/, '').trim().toLowerCase();
                if (['你说', '你說', 'you said', 'you'].includes(text)) headingRoles.user++;
                else if (['chatgpt 说', 'chatgpt 說', 'chatgpt said', 'chatgpt', 'assistant'].includes(text)) headingRoles.assistant++;
                else headingRoles.unknown++;
            }
            const manager = window.timelineManager;
            const input = document.querySelector('main [role="textbox"][contenteditable="true"]');
            const parentLayout = [];
            for (let el = input?.parentElement, depth = 0; el && depth < 8; el = el.parentElement, depth++) {
                const css = getComputedStyle(el);
                parentLayout.push({ display: css.display, overflowY: css.overflowY, height: Math.round(el.getBoundingClientRect().height), scrollHeight: el.scrollHeight });
            }
            log('dom-snapshot', {
                stage, ready: document.readyState, visible: document.visibilityState === 'visible', online: navigator.onLine,
                headingRoles, inputParentLayout: parentLayout,
                dependencies: { i18n: !!window.TimelineI18n, domObserver: !!window.DOMObserverManager, aiMonitor: !!window.AIStateMonitor },
                manager: { present: !!manager, destroyed: !!manager?._destroyed, markers: manager?.markers?.length || 0,
                    containerConnected: !!manager?.conversationContainer?.isConnected, scrollConnected: !!manager?.scrollContainer?.isConnected },
                route: location.pathname.includes('/c/') ? 'conversation' : location.pathname.includes('/share/') ? 'share' : 'other',
                main: count('main'), forms: count('form'), input: count('#prompt-textarea'),
                editableInput: count('main [role="textbox"][contenteditable="true"]'),
                sidebarHistory: count('#history'), promptButton: count('.smart-input-prompt-btn'),
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
    async function readResponseSample(response, stream = false, meta = {}) {
        if (!response.body?.getReader) {
            // Test/legacy response objects; never read an unsupported event stream.
            return stream ? undefined : response.clone().json();
        }
        const reader = response.clone().body.getReader();
        const decoder = new TextDecoder();
        let bytes = 0, text = '', reason = 'complete', timer;
        const timeout = new Promise(resolve => { timer = setTimeout(() => resolve({ timeout: true }), 5000); });
        const limit = stream ? 32768 : 2097152;
        try {
            while (true) {
                const part = await Promise.race([reader.read(), timeout]);
                if (part.timeout) { reason = 'timeout'; break; }
                if (part.done) { text += decoder.decode(); break; }
                bytes += part.value.byteLength;
                if (bytes > limit) { reason = 'byte-limit'; break; }
                text += decoder.decode(part.value, { stream: true });
                if (stream && (text.match(/\n\n/g) || []).length >= 10) { reason = 'event-limit'; break; }
            }
            if (stream) {
                const schemas = [];
                let jsonEvents = 0, nonJsonEvents = 0;
                for (const frame of text.replace(/\r\n/g, '\n').split('\n\n').slice(0, 10)) {
                    const data = frame.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
                    if (!data || data === '[DONE]') continue;
                    try { const value = JSON.parse(data); jsonEvents++; if (schemas.length < 3) schemas.push(shape(value)); }
                    catch { nonJsonEvents++; }
                }
                log('network.stream-sample', { ...meta, bytes, reason, jsonEvents, nonJsonEvents, schemas });
                return undefined;
            }
            if (reason !== 'complete') { log('network.json-sample-skipped', { ...meta, reason, bytes }); return undefined; }
            return JSON.parse(text);
        } finally {
            clearTimeout(timer);
            // Never await cancel on a tee branch: it can wait for the page's reader.
            reader.cancel().catch(() => {});
        }
    }
    function safeEndpoint(raw) {
        try {
            const url = new URL(raw, location.href);
            if (url.origin !== location.origin || !/^\/(backend-api|api|graphql)(?:\/|$)/.test(url.pathname)) return null;
            const words = new Set(['backend-api', 'api', 'graphql', 'conversation', 'conversations', 'thread', 'threads', 'message', 'messages', 'turn', 'turns', 'v1', 'v2', 'history', 'list', 'get', 'fetch', 'init', 'initialize', 'bootstrap', 'stream', 'resume', 'prepare', 'latest', 'recent', 'shared', 'sync', 'delta', 'batch', 'read', 'read-state']);
            return '/' + url.pathname.split('/').filter(Boolean).map(s => words.has(s) ? s : ':redacted').join('/');
        } catch { return null; }
    }
    function observeOtherTransports() {
        try {
            const seen = new Set();
            const resources = list => {
                for (const entry of list) {
                    const endpointShape = safeEndpoint(entry.name);
                    if (!endpointShape) continue;
                    const key = entry.name + ':' + entry.startTime;
                    if (seen.has(key) || seen.size >= 300) continue;
                    seen.add(key);
                    log('network.resource', { endpointShape,
                        transport: ['fetch', 'xmlhttprequest'].includes(entry.initiatorType) ? entry.initiatorType : 'other',
                        durationMs: Math.round(entry.duration), status: entry.responseStatus || 0 });
                }
            };
            resources(performance.getEntriesByType?.('resource') || []);
            if (typeof PerformanceObserver !== 'undefined') {
                const observer = new PerformanceObserver(list => resources(list.getEntries()));
                observer.observe({ type: 'resource', buffered: true });
                setTimeout(() => observer.disconnect(), 180000);
            }
        } catch (err) { error('resource-observer', err); }
        try {
            const originalOpen = XMLHttpRequest.prototype.open;
            let sequence = 0, samples = 0;
            const pending = new WeakMap();
            XMLHttpRequest.prototype.open = function(method, url, ...rest) {
                const previous = pending.get(this);
                if (previous) this.removeEventListener('loadend', previous);
                pending.delete(this);
                const result = originalOpen.call(this, method, url, ...rest);
                const endpointShape = safeEndpoint(url);
                if (endpointShape) {
                    const xhrRequest = ++sequence;
                    log('network.xhr-start', { xhrRequest, endpointShape, method: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(String(method).toUpperCase()) ? String(method).toUpperCase() : 'other' });
                    const onEnd = () => {
                        pending.delete(this);
                        try {
                            const json = (this.getResponseHeader('content-type') || '').includes('json');
                            log('network.xhr-end', { xhrRequest, endpointShape, status: this.status, json });
                            if (!json || samples >= 20) return;
                            samples++;
                            let payload;
                            if (this.responseType === 'json') payload = this.response;
                            else if (this.responseType === '' || this.responseType === 'text') {
                                if (this.responseText.length > 2097152) { log('network.xhr-sample-skipped', { xhrRequest, reason: 'size-limit' }); return; }
                                payload = JSON.parse(this.responseText);
                            } else return;
                            log('network.xhr-shape', { xhrRequest, endpointShape, ...shape(payload) });
                        } catch (err) { error('xhr-shape', err); }
                    };
                    pending.set(this, onEnd);
                    this.addEventListener('loadend', onEnd, { once: true });
                }
                return result;
            };
            log('network.xhr-observer-installed');
        } catch (err) { error('xhr-observer-install', err); }
    }
    function exportReport() {
        document.dispatchEvent(new CustomEvent('ait-gpt-diag-snapshot-request'));
        domSnapshot('export');
        return '[AIT-GPT-DIAG-REPORT]\n' + JSON.stringify({ revision: 3, dropped, records }, null, 2);
    }
    // The default MAIN Console context can export both worlds in one copy() call.
    if (world === 'MAIN') document.addEventListener('ait-gpt-diag-record', event => {
        try {
            if (typeof event.detail !== 'string' || event.detail.length > 100000) return;
            const record = JSON.parse(event.detail);
            if (record.world === 'ISOLATED' && typeof record.event === 'string') remember(record);
        } catch {}
    });
    window.AITGPTDiagnostics = { log, error, type, shape, domSnapshot, readResponseSample, export: exportReport };
    log('diagnostics-start', { revision: 3, ready: document.readyState });
    if (world === 'MAIN') observeOtherTransports();
    window.addEventListener('error', e => error('uncaught-' + world, e.error));
    window.addEventListener('unhandledrejection', e => error('unhandled-promise-' + world, e.reason));
    if (world === 'ISOLATED') {
        document.addEventListener('ait-gpt-diag-snapshot-request', () => domSnapshot('export-isolated'));
        try { log('extension-version', { version: chrome.runtime.getManifest().version }); } catch {}
        for (const delay of [0, 5000, 15000, 30000, 60000, 120000]) setTimeout(() => domSnapshot(`load-${delay}`), delay);
        window.addEventListener('url:change', () => domSnapshot('route-change'));
    }
})();
