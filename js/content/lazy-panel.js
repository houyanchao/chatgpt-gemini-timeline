/** Keep the panel API available without constructing settings UI on page load. */
(function () {
    let requestId = 0;
    const facade = {
        tabs: new Map(), isVisible: false, currentTabId: null,
        async show(tabId = null, { signal } = {}) {
            if (signal?.aborted) return;
            const id = ++requestId;
            const url = location.href;
            const isCurrent = () => !signal?.aborted && id === requestId && url === location.href;
            const cancel = () => { if (id === requestId) requestId++; };
            window.addEventListener('url:change', cancel);
            try {
                await window.AITContentLoader.load('panel');
                if (!isCurrent()) return;
                return await window.panelModal.show(tabId, { signal });
            } catch (error) {
                if (window.AITContentSession?.active === false || window.AITExtensionContext?.handleInvalidation(error)) return;
                if (isCurrent()) {
                    window.globalToastManager?.error(TimelineI18n.getMessage('settingsLoadFailed') || 'Unable to open settings. Please refresh the page and try again.');
                }
            } finally {
                window.removeEventListener('url:change', cancel);
            }
        },
        hide() { requestId++; },
        destroy() { requestId++; }
    };
    window.panelModal = facade;
    // Timeline initialization must not force the settings bundle to load.
    window.registerTimelineTabs = () => Promise.resolve();
    window.initializePanelModalTabs = window.registerTimelineTabs;
})();
