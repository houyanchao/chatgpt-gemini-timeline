/** Lifetime of the isolated content scripts on sites eligible for silent recovery. */
(() => {
    'use strict';
    if (window.AITContentSession) return;

    const manifest = chrome.runtime.getManifest();
    if (!manifest.permissions?.includes('scripting')) return;
    const covered = manifest.host_permissions?.some(pattern => {
        const [, scheme, domain] = pattern.match(/^(https?):\/\/([^/]+)\/\*$/) || [];
        if (`${scheme}:` !== location.protocol || !domain) return false;
        const host = location.hostname;
        if (!domain.startsWith('*.')) return host === domain;
        const base = domain.slice(2);
        return host === base || host.endsWith(`.${base}`);
    });
    if (!covered) return;

    const marker = 'data-ait-content-session';
    const root = document.documentElement;
    const listeners = new AbortController();
    const disposers = [];
    const observers = new Set();
    const timers = new Map();
    const frames = new Map();
    const idleTasks = new Map();
    const owned = new WeakSet();
    let active = true;
    const nativeAdd = EventTarget.prototype.addEventListener;
    const nativeRemove = EventTarget.prototype.removeEventListener;

    // These wrappers exist only in Timeline's isolated world. The host and MAIN hooks keep their APIs.
    EventTarget.prototype.addEventListener = function (type, listener, options) {
        if (!active) return;
        const settings = typeof options === 'boolean' ? { capture: options } : { ...options };
        if (settings.signal && !AbortSignal.any) {
            nativeAdd.call(listeners.signal, 'abort', () => nativeRemove.call(this, type, listener, settings), { once: true });
        } else {
            settings.signal = settings.signal ? AbortSignal.any([settings.signal, listeners.signal]) : listeners.signal;
        }
        nativeAdd.call(this, type, listener, settings);
    };

    function trackTasks(schedule, cancel, pending, recurring = false) {
        const start = window[schedule];
        const end = window[cancel];
        if (!start || !end) return;
        window[schedule] = function (callback, ...args) {
            if (!active) return 0;
            const id = start.call(window, function (...values) {
                if (!recurring) pending.delete(id);
                if (active) return callback.apply(this, values);
            }, ...args);
            pending.set(id, end);
            return id;
        };
        window[cancel] = function (id) {
            pending.delete(id);
            end.call(window, id);
        };
    }
    trackTasks('setTimeout', 'clearTimeout', timers);
    trackTasks('setInterval', 'clearInterval', timers, true);
    trackTasks('requestAnimationFrame', 'cancelAnimationFrame', frames);
    trackTasks('requestIdleCallback', 'cancelIdleCallback', idleTasks);

    for (const name of ['MutationObserver', 'ResizeObserver', 'IntersectionObserver']) {
        const NativeObserver = window[name];
        if (!NativeObserver) continue;
        window[name] = class extends NativeObserver {
            constructor(callback, options) {
                super(function (...args) { if (active) callback.apply(this, args); }, options);
            }
            observe(...args) {
                if (!active) return;
                super.observe(...args);
                observers.add(this);
            }
            disconnect() {
                observers.delete(this);
                super.disconnect();
            }
        };
    }

    for (const [prototype, methods] of [[Document.prototype, ['createElement', 'createElementNS']], [Node.prototype, ['cloneNode']]]) {
        for (const name of methods) {
            const original = prototype[name];
            prototype[name] = function (...args) {
                const element = original.apply(this, args);
                owned.add(element);
                return element;
            };
        }
    }

    function onStop(cleanup) {
        if (active) disposers.push(cleanup);
        else cleanup();
    }

    function retire() {
        if (!active) return;
        // A website can dispatch DOM events. Only a browser-invalidated instance may retire.
        try { if (chrome.runtime?.id && chrome.runtime.getManifest()) return; } catch {}

        active = false;
        listeners.abort();
        for (const pending of [timers, frames, idleTasks]) {
            for (const [id, cancel] of pending) cancel.call(window, id);
            pending.clear();
        }
        for (const observer of observers) observer.disconnect();

        // Module disposers release state and undo changes to native DOM before owned roots are removed.
        for (const cleanup of disposers.splice(0).reverse()) {
            try { cleanup(); } catch {}
        }
        for (const element of document.querySelectorAll('style, iframe')) {
            if (owned.has(element)) element.remove();
        }
        root.setAttribute(marker, 'retired');
    }

    window.AITContentSession = Object.freeze({ onStop, owns: element => owned.has(element), get active() { return active; } });
    root.setAttribute(marker, 'active');
    document.addEventListener('ait:retire-content-session', retire);
})();
