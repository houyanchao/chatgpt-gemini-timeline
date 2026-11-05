/** Discover all-site formula/highlight usage without loading AI platform features. */
(async function () {
    'use strict';
    const loader = window.AITContentLoader;
    if (!loader) return;
    // Supported sites load common through core's dependency list.
    try { if (await loader.isSupported()) return; } catch {}

    const formulaSelector = globalThis.AITContentConfig.pageFeatureSelectors.formula;
    let latexEnabled = true;
    let mathmlEnabled = false;
    let highlightEnabled = true;
    let stopped = false;
    let loading = false;
    let observer = null;
    let scanTimer = null;
    const pendingRoots = new Map();

    function cleanup() {
        observer?.disconnect();
        observer = null;
        clearTimeout(scanTimer);
        scanTimer = null;
        pendingRoots.clear();
        document.removeEventListener('mouseup', onSelection);
        document.removeEventListener('keyup', onSelection);
        chrome.storage.onChanged.removeListener(onStorageChanged);
    }

    function loadCommon() {
        if (stopped || loading) return;
        loading = true;
        loader.load('common').then(() => {
            stopped = true;
            cleanup();
        }).catch(() => {
            // A later interaction or formula mutation can retry a failed load.
            loading = false;
        });
    }

    function onSelection(event) {
        if (stopped || loading || !highlightEnabled) return;
        if (event?.type === 'keyup' && !event.shiftKey) return;
        const selection = window.getSelection();
        if (!selection?.rangeCount || !selection.toString().trim()) return;
        const node = selection.getRangeAt(0).commonAncestorContainer;
        const element = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
        if (!element || element.isContentEditable
            || element.closest('input, textarea, select, [contenteditable="true"], .ait-panel-modal, .floating-runner-container')) return;
        loadCommon();
    }

    function hasOriginHighlights(data) {
        // Load on an annotated origin even if its current path has no notes yet:
        // common's URL monitor will then restore notes after SPA navigation.
        return Object.entries(data || {}).some(([url, highlights]) => {
            if (!Array.isArray(highlights) || !highlights.length) return false;
            try { return new URL(url).origin === location.origin; } catch { return false; }
        });
    }

    async function checkSavedHighlights() {
        if (stopped || loading || !highlightEnabled) return;
        try {
            const result = await chrome.storage.local.get('highlightData');
            if (highlightEnabled && hasOriginHighlights(result.highlightData)) loadCommon();
        } catch {}
    }

    function scanRoots() {
        scanTimer = null;
        const roots = [...pendingRoots];
        pendingRoots.clear();
        if (stopped || loading || (!latexEnabled && !mathmlEnabled)) return;
        for (const [root, descendants] of roots) {
            if (!root.isConnected) continue;
            if (root.matches?.(formulaSelector) || (descendants && root.querySelector?.(formulaSelector))) {
                loadCommon();
                break;
            }
        }
    }

    function updateFormulaDiscovery() {
        observer?.disconnect();
        observer = null;
        clearTimeout(scanTimer);
        scanTimer = null;
        pendingRoots.clear();
        if (stopped || (!latexEnabled && !mathmlEnabled)) return;

        observer = new MutationObserver(mutations => {
            if (stopped || loading) return;
            for (const mutation of mutations) {
                if (mutation.type === 'attributes') {
                    const root = mutation.target;
                    if (!pendingRoots.has(root)) pendingRoots.set(root, false);
                } else {
                    for (const node of mutation.addedNodes) {
                        if (node.nodeType === Node.ELEMENT_NODE) pendingRoots.set(node, true);
                    }
                }
            }
            // Only query changed subtrees. Continuous unrelated updates do not
            // postpone the scheduled scan or cause a full-document rescan.
            if (pendingRoots.size && scanTimer === null) scanTimer = setTimeout(scanRoots, 150);
        });
        observer.observe(document.body || document.documentElement, {
            childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-mathml']
        });
        if (document.querySelector(formulaSelector)) loadCommon();
    }

    function onStorageChanged(changes, area) {
        if (area !== 'local' || stopped) return;
        if (changes.highlightEnabled) {
            highlightEnabled = changes.highlightEnabled.newValue !== false;
            if (highlightEnabled) void checkSavedHighlights();
        }
        if (changes.highlightData && highlightEnabled && hasOriginHighlights(changes.highlightData.newValue)) loadCommon();
        if (changes.formulaLatexEnabled || changes.formulaMathMLEnabled) {
            if (changes.formulaLatexEnabled) latexEnabled = changes.formulaLatexEnabled.newValue !== false;
            if (changes.formulaMathMLEnabled) mathmlEnabled = changes.formulaMathMLEnabled.newValue === true;
            updateFormulaDiscovery();
        }
        if (changes.mirrorSiteSourceDomain) {
            loader.isSupported().then(supported => { if (supported) loadCommon(); }).catch(() => {});
        }
    }

    try {
        const settings = await chrome.storage.local.get(['formulaLatexEnabled', 'formulaMathMLEnabled', 'highlightEnabled']);
        latexEnabled = settings.formulaLatexEnabled !== false;
        mathmlEnabled = settings.formulaMathMLEnabled === true;
        highlightEnabled = settings.highlightEnabled !== false;
    } catch {}

    chrome.storage.onChanged.addListener(onStorageChanged);
    document.addEventListener('mouseup', onSelection);
    document.addEventListener('keyup', onSelection);
    if (loader.isLoaded('common')) loadCommon();
    updateFormulaDiscovery();
    void checkSavedHighlights();
    // Preserve a selection made while the settings read was in progress.
    onSelection();
})();
