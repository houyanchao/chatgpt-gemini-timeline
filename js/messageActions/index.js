/** Registered actions share interaction infrastructure, not output implementations. */
(function initializeMessageActions() {
    const actions = new Map();
    let manager = null, stopped = false;
    function registerAction(action) {
        if (!/^[a-z][a-z0-9-]*$/.test(action.id) || actions.has(action.id)) throw new Error('Invalid or duplicate message action');
        actions.set(action.id, action);
        if (manager) void manager.refresh().catch(() => {});
        return () => { actions.delete(action.id); if (manager) void manager.refresh().catch(() => {}); };
    }
    const storageListener = (changes, area) => {
        if (area === 'local' && [...actions.values()].some(action => changes[action.settingsKey])) void manager?.refresh().catch(() => {});
    };
    window.AITMessageActions = Object.freeze({ registerAction, supportsCurrentPlatform: () => !!getMessageActionsAdapter() });
    window.AITPlatformFeatures.register('message-actions', async () => {
        await TimelineI18n.ready();
        const adapter = getMessageActionsAdapter();
        if (!adapter || stopped || manager) return;
        const instance = new MessageActionManager(adapter, actions);
        manager = instance;
        try {
            await instance.init();
            if (stopped) { instance.destroy(); return; }
            chrome.storage.onChanged.addListener(storageListener);
        }
        catch (error) { instance.destroy(); manager = null; throw error; }
    });
    window.AITContentSession?.onStop(() => {
        stopped = true; manager?.destroy(); manager = null; actions.clear();
        try { chrome.storage.onChanged.removeListener(storageListener); } catch {}
    });
})();
