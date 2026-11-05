/** The background can replace an invalidated isolated world in the same document. */
(() => {
    'use strict';
    if (!chrome.scripting?.executeScript) return;

    const manifest = chrome.runtime.getManifest();
    const sites = manifest.host_permissions;
    const entry = manifest.content_scripts?.find(script => script.js?.includes('js/content/session.js'));
    if (!sites?.length || !entry) return;
    const recovering = new Map();

    function prepareTakeover() {
        const root = document.documentElement;
        const marker = 'data-ait-content-session';
        // A legacy instance has no disposal protocol. Do not create a second copy over it.
        if (!root?.hasAttribute(marker) || window.AITContentSession?.active) return false;
        document.dispatchEvent(new Event('ait:retire-content-session'));
        return root.getAttribute(marker) === 'retired';
    }

    async function recover(tab) {
        if (tab.id == null || tab.discarded || tab.frozen || tab.status !== 'complete') return;
        if (recovering.has(tab.id)) return recovering.get(tab.id);
        const task = (async () => {
            try {
                const response = await chrome.tabs.sendMessage(tab.id, { type: 'AIT_CONTENT_SESSION_PING' }, { frameId: 0 });
                if (response?.active) return;
            } catch {}

            const [inspection] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: prepareTakeover });
            if (!inspection?.result || !inspection.documentId) return;
            // If the user navigated since inspection, Chrome rejects this instead of touching the new page.
            await chrome.scripting.executeScript({
                target: { tabId: tab.id, documentIds: [inspection.documentId] },
                files: entry.js
            });
        })().catch(() => {}).finally(() => recovering.delete(tab.id));
        recovering.set(tab.id, task);
        return task;
    }

    async function recoverTabs() {
        const tabs = await chrome.tabs.query({ url: sites, status: 'complete', discarded: false });
        // Keep the update's work bounded on a browser with many open conversations.
        for (const tab of tabs) await recover(tab);
    }

    async function recoverActive(windowId) {
        if (windowId < 0) return;
        try {
            const [tab] = await chrome.tabs.query({ windowId, active: true, url: sites, status: 'complete' });
            if (tab) await recover(tab);
        } catch {}
    }

    chrome.runtime.onInstalled.addListener(() => { void recoverTabs().catch(() => {}); });
    chrome.tabs.onActivated.addListener(({ windowId }) => { void recoverActive(windowId); });
    chrome.windows.onFocusChanged.addListener(windowId => { void recoverActive(windowId); });
})();
