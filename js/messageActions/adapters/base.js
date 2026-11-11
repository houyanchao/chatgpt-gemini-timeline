/** Shared page facts. Output formats and image rendering do not belong here. */
class MessageActionsAdapter {
    constructor(platformId) { this.platformId = platformId; }
    isConversationPage() { return false; }
    getMessages() { return []; }
    getToolbar(message) { return null; }
    getToolbarMount(toolbar) { return { container: toolbar, before: null }; }
    getHistoryTargets() { return []; }
    getTargetId(element) { return element.id; }
    isHistoryLoading() { return false; }
    getConversationState() { return null; }
    subscribeConversationChanges(callback) { return () => {}; }
    getDockBounds() { return null; }
    getSnapshotRules() { return { selector: '', attributes: [] }; }
    getScrollContainer() { return document.scrollingElement || document.documentElement; }
    getViewportBounds() {
        return this.getScrollContainer()?.getBoundingClientRect?.() || { top: 0, bottom: innerHeight };
    }
    getTimelineAdapter() {
        return window.timelineManager?.adapter?.platformId === this.platformId
            ? window.timelineManager.adapter
            : window.siteAdapterRegistry?.getAllAdapters().find(adapter => adapter.platformId === this.platformId);
    }
}
