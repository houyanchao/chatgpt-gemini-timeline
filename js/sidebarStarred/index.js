/** Mount folders when the host sidebar is ready, even if it opens much later. */
window.AITPlatformFeatures.register('sidebar-starred', async () => {
    const platform = await getCurrentPlatform();
    if (platform?.features?.sidebarStarred !== true) return;
    const adapter = await window.sidebarStarredAdapterRegistry?.getAdapter();
    const session = window.AITContentSession;
    if (!adapter || session?.active === false) return;

    let enabled;
    let manager = null;
    let stopWaiting = null;
    const settingsKey = 'sidebarStarredPlatformSettings';

    function waitForSidebar() {
        if (stopWaiting) return;
        const unsubscribe = DOMObserverManager.getInstance().subscribeBody('sidebar-starred-mount', {
            callback: tryMount, filter: { hasAddedNodes: true }, debounce: 200
        });
        // Also catch anchors that become eligible through attributes alone.
        const timer = setInterval(tryMount, SidebarStarredManager.REINJECT_INTERVAL);
        stopWaiting = () => {
            unsubscribe();
            clearInterval(timer);
            stopWaiting = null;
        };
    }

    async function tryMount() {
        if (session?.active === false || window.AITExtensionContext?.invalidated) {
            stopWaiting?.();
            return;
        }
        if (!enabled || manager) return;

        let candidate = null;
        try {
            // The host can render the sidebar while collapsed, fixed, or inside display: contents.
            if (adapter.findInsertionPoint()?.parent?.isConnected) {
                stopWaiting?.();
                candidate = new SidebarStarredManager(adapter);
                manager = candidate;
                if (await candidate.init()) return;
            }
        } catch (error) {
            window.AITExtensionContext?.handleInvalidation(error);
        }

        // A setting change or session stop may have already destroyed this attempt.
        if (manager !== candidate) return;
        manager?.destroy();
        manager = null;
        if (enabled && session?.active !== false && !window.AITExtensionContext?.invalidated) waitForSidebar();
    }

    function setEnabled(value) {
        if (enabled === value) return;
        enabled = value;
        if (enabled) return tryMount();
        stopWaiting?.();
        manager?.destroy();
        manager = null;
    }

    function onSettingsChanged(changes, area) {
        if (area === 'local' && changes[settingsKey]) {
            void setEnabled(changes[settingsKey].newValue?.[platform.id] !== false);
        }
    }

    StorageAdapter.addChangeListener(onSettingsChanged);
    session?.onStop(() => {
        StorageAdapter.removeChangeListener(onSettingsChanged);
        try { setEnabled(false); } finally { adapter.restoreNativeList(); }
    });

    const settings = await StorageAdapter.get(settingsKey);
    // A newer storage event takes precedence over the initial read.
    if (enabled === undefined) await setEnabled(settings?.[platform.id] !== false);
});
