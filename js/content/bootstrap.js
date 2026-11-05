/** Lightweight all-site entry. Feature code stays in the isolated world. */
(function () {
    'use strict';
    if (window.AITContentLoader) return;
    // Firefox's content-script globalThis and window are distinct objects.
    // Generated configuration and custom sites are stored on globalThis.
    const config = globalThis.AITContentConfig;
    const session = window.AITContentSession;
    const promises = new Map();
    const stylePromises = new Map();
    const styleSourcePromises = new Map();
    const adoptedSheets = new Set();
    const stylesheetLinks = new Map();
    let panelRequestId = 0;
    let activationTask = null;

    function checkSession() {
        if (session?.active === false) throw new Error('Content session retired');
    }

    session?.onStop(() => {
        panelRequestId++;
        for (const [link, reject] of stylesheetLinks) {
            link.remove();
            reject(new Error('Content session retired'));
        }
        stylesheetLinks.clear();
        if (adoptedSheets.size) {
            document.adoptedStyleSheets = document.adoptedStyleSheets.filter(sheet => !adoptedSheets.has(sheet));
            adoptedSheets.clear();
        }
    });

    let supportsConstructedStyles = false;
    try {
        supportsConstructedStyles = 'adoptedStyleSheets' in document && typeof CSSStyleSheet === 'function';
        // Older Firefox exposes the property but its Xray wrapper denies access.
        if (supportsConstructedStyles) [...document.adoptedStyleSheets];
    } catch {
        supportsConstructedStyles = false;
    }

    function readStyle(file) {
        if (!styleSourcePromises.has(file)) {
            const url = chrome.runtime.getURL(file);
            const promise = (async () => {
                const response = await fetch(url);
                if (!response.ok) throw new Error(`Cannot load stylesheet: ${file}`);
                return (await response.text()).replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (match, quote, value) => {
                    if (/^(?:data:|#)/i.test(value)) return match;
                    return `url("${new URL(value.trim(), url).href}")`;
                });
            })().catch(error => { styleSourcePromises.delete(file); throw error; });
            styleSourcePromises.set(file, promise);
        }
        return styleSourcePromises.get(file);
    }

    async function loadStyles(files) {
        // Fetch concurrently, then apply in configured order so the cascade stays stable.
        // Wait for every read before applying styles or executing feature JavaScript.
        if (supportsConstructedStyles) {
            await Promise.all(files.filter(file => !stylePromises.has(file)).map(readStyle));
        }
        for (const file of files) await loadStyle(file);
    }

    function loadStyle(file) {
        if (!stylePromises.has(file)) {
            const url = chrome.runtime.getURL(file);
            const promise = (async () => {
                // Constructed stylesheets avoid page style-src restrictions and
                // keep feature styles out of ordinary pages until needed.
                if (supportsConstructedStyles) {
                    const css = await readStyle(file);
                    checkSession();
                    try {
                        const sheet = new CSSStyleSheet();
                        sheet.replaceSync(css);
                        document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
                        if (session) adoptedSheets.add(sheet);
                        styleSourcePromises.delete(file);
                        return;
                    } catch {
                        // Access can also fail when assigning the sheets. Fall back
                        // for this stylesheet and all subsequent styles on the page.
                        supportsConstructedStyles = false;
                    }
                }
                checkSession();
                await new Promise((resolve, reject) => {
                    const link = document.createElement('link');
                    link.rel = 'stylesheet'; link.href = url;
                    link.onload = resolve;
                    link.onerror = () => {
                        stylesheetLinks.delete(link);
                        link.remove();
                        reject(new Error(`Cannot load stylesheet: ${file}`));
                    };
                    if (session) stylesheetLinks.set(link, reject);
                    (document.head || document.documentElement).appendChild(link);
                });
                styleSourcePromises.delete(file);
            })().catch(error => { stylePromises.delete(file); throw error; });
            stylePromises.set(file, promise);
        }
        return stylePromises.get(file);
    }

    function load(name) {
        // UI shared with core features must also keep its styles in core.
        // The prompt dropdown, for example, can open before the settings panel.
        if (!promises.has(name)) {
            const bundle = config.bundles[name];
            if (!bundle) return Promise.reject(new Error(`Unknown content bundle: ${name}`));
            const promise = (async () => {
                checkSession();
                const dependencies = bundle.dependencies || (name === 'core' ? [] : ['core']);
                for (const dependency of dependencies) await load(dependency);
                await loadStyles(bundle.styles);
                checkSession();
                await import(chrome.runtime.getURL(bundle.script));
            })().catch(error => { promises.delete(name); throw error; });
            promises.set(name, promise);
        }
        return promises.get(name);
    }

    window.AITContentLoader = Object.freeze({ load, loadStyle, activate, isSupported, isLoaded: name => promises.has(name) });

    function matchesDomain(domain) {
        const host = location.hostname.toLowerCase();
        const normalized = String(domain || '').trim().toLowerCase();
        return !!normalized && (host === normalized || host.endsWith('.' + normalized));
    }

    async function isSupported() {
        const platforms = await getSiteInfoList();
        if (platforms.some(platform => platform.sites.some(matchesDomain))) return true;
        return (globalThis.CUSTOM_SITE_INFO || []).some(site => site.enabled !== false && site.sites?.some(matchesDomain));
    }

    async function startPlatformFeatures() {
        if (!(await isSupported()) || session?.active === false) return false;
        await load('core');
        if (session?.active === false) return false;
        // Core may already be cached because a generic settings panel needed it.
        // Importing code and starting platform features have separate lifecycles.
        return window.AITPlatformFeatures.start();
    }

    function activate() {
        if (!session) return startPlatformFeatures();
        activationTask ||= startPlatformFeatures().then(started => {
            if (!started) activationTask = null;
            return started;
        }, error => {
            activationTask = null;
            throw error;
        });
        return activationTask;
    }

    async function loadDetector(state) {
        if (session?.active === false || !state?.domain || !state.url || !Number.isFinite(state.startedAt)
            || Date.now() - state.startedAt > 30000) return;
        try {
            if (new URL(state.url).hostname !== location.hostname) return;
            await load('panel'); // PageDetector initializes itself from the stored request.
        } catch {}
    }

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request?.type === 'AIT_CONTENT_SESSION_PING') {
            if (session?.active) {
                // The isolated world may be healthy even if a feature failed to start.
                void activate().catch(() => {});
                sendResponse({ active: true });
            }
            return;
        }
        if (request?.type !== 'OPEN_PANEL_MODAL') return;
        const id = ++panelRequestId;
        const url = location.href;
        const cancel = () => { if (id === panelRequestId) panelRequestId++; };
        window.addEventListener('url:change', cancel);
        load('panel').then(async () => {
            // Loading UI code can outlive navigation or a more recent open request.
            if (id !== panelRequestId || url !== location.href) return false;
            await window.panelModal.show(request.tabId || null);
            return id === panelRequestId && url === location.href;
        })
            .then(success => sendResponse({ success }))
            .catch(() => sendResponse({ success: false }))
            .finally(() => window.removeEventListener('url:change', cancel));
        return true;
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes.mirrorSiteSourceDomain) void activate().catch(() => {});
        if (changes[config.detectorStorageKey]) void loadDetector(changes[config.detectorStorageKey].newValue);
    });

    void activate().catch(() => {});
    chrome.storage.local.get(config.detectorStorageKey)
        .then(result => loadDetector(result[config.detectorStorageKey])).catch(() => {});
})();
