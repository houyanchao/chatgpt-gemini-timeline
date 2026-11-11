class ChatGPTMessageActionsAdapter extends MessageActionsAdapter {
    static MESSAGE_SELECTOR = '[data-turn][data-turn-id], [data-chatgpt-search-unit-key][data-chatgpt-search-message-ids]';
    constructor() { super('chatgpt'); }
    isConversationPage() {
        return /^\/(?:c|share)\/[^/]+/.test(location.pathname) || /^\/g\/[^/]+\/c\/[^/]+/.test(location.pathname);
    }
    getRole(element) {
        return element.getAttribute('data-turn') || element.getAttribute('data-chatgpt-search-unit-key')?.split(':').pop();
    }
    getId(element) {
        return element.getAttribute('data-turn-id') || element.getAttribute('data-chatgpt-search-message-ids')?.trim().split(/\s+/)[0] || '';
    }
    getRoot() { return document.querySelector('[data-thread-find-target="conversation"]') || document.querySelector('main'); }
    getConversationState() {
        return this.branchSource?.getConversationBranch?.() || this.getTimelineAdapter()?.getConversationBranch?.() || null;
    }
    subscribeConversationChanges(callback) {
        // Timeline can initialize with a different adapter after message actions have subscribed.
        const source = this.getTimelineAdapter();
        this.branchSource = source;
        const unsubscribe = source?.subscribeCapturedChatsDataUpdated?.(callback);
        return () => { unsubscribe?.(); this.branchSource = null; };
    }
    getMessages() {
        if (!this.isConversationPage()) return [];
        const selector = ChatGPTMessageActionsAdapter.MESSAGE_SELECTOR;
        const elements = [...(this.getRoot()?.querySelectorAll(selector) || [])].filter(element => {
            const rect = element.getBoundingClientRect();
            return ['user', 'assistant'].includes(this.getRole(element)) && this.getId(element) && rect.width > 0 && rect.height > 0
                && !element.parentElement?.closest(selector) && !element.closest('[data-ait-owned-ui]');
        });
        let questionId = '';
        return elements.map((element, index) => {
            const role = this.getRole(element), id = this.getId(element);
            if (role === 'user') questionId = id;
            const state = element.closest('[data-talvt-turn-state]')?.getAttribute('data-talvt-turn-state');
            const streaming = !!element.querySelector('[data-is-streaming="true"], .result-streaming') || element.matches('[data-is-streaming="true"]');
            const lastGenerating = !state && index === elements.length - 1 && !!window.AIStateMonitor?.getInstance().isGenerating;
            return { key: `${role}:${id}`, id, role, element,
                turnId: element.closest('[data-turn-key]')?.getAttribute('data-turn-key') || questionId || id,
                generating: role === 'assistant' && (streaming || (state ? state !== 'complete' : lastGenerating)) };
        });
    }
    getToolbar(message) {
        const reply = message.element;
        const turn = reply.closest('[data-turn-key]') || reply.closest('article') || reply;
        const rows = [...turn.querySelectorAll('.turn-action-controls')].filter(row =>
            !row.closest('[data-chatgpt-search-unit-key$=":user"], [data-turn="user"]'));
        const row = rows.find(row => row.closest('[data-turn="assistant"]')
            || row.querySelector('[data-testid="copy-turn-action-button"], [data-testid="good-response-turn-action-button"]')) || rows.at(-1);
        if (row) return row;
        const copy = turn.querySelector('[data-testid="copy-turn-action-button"]');
        for (let parent = copy?.parentElement, depth = 0; parent && depth < 4; parent = parent.parentElement, depth++) {
            if (parent.querySelectorAll('[data-testid$="turn-action-button"]').length >= 2) return parent;
            if (parent === turn) break;
        }
        return null;
    }
    getToolbarMount(toolbar) {
        const nativeButtons = [...toolbar.querySelectorAll('button')].filter(button =>
            !button.closest('[data-ait-owned-ui]'));
        const last = nativeButtons.at(-1);
        if (!last) return super.getToolbarMount(toolbar);
        // A single button may have its own tooltip wrapper; keep our entries in the action row.
        let container = last.parentElement;
        while (container !== toolbar && nativeButtons.filter(button => container.contains(button)).length < 2) {
            container = container.parentElement;
        }
        let before = last;
        while (before.parentElement !== container) before = before.parentElement;
        return { container, before };
    }
    getHistoryTargets() {
        return [...(this.getRoot()?.querySelectorAll('[data-turn-id-container], [data-turn-key]') || [])];
    }
    getTargetId(element) { return element.getAttribute('data-turn-id-container') || element.getAttribute('data-turn-key'); }
    isHistoryLoading() {
        return this.getTimelineAdapter()?.isTimelineHistoryLoading?.() === true
            || !!this.getRoot()?.querySelector('[role="progressbar"], [data-testid="conversation-loading-spinner"]');
    }
    getScrollContainer() {
        return window.timelineManager?.scrollContainer || document.querySelector('.thread-scroll-container') || super.getScrollContainer();
    }
    getDockBounds() {
        for (const element of document.querySelectorAll('[class*="ComposerLayoutFooter-"], #prompt-textarea')) {
            const rect = element.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) return rect;
        }
        return null;
    }
    getSnapshotRules() {
        return {
            selector: '.turn-action-controls, [data-testid="message-actions"], [data-conversation-role], .sr-only',
            attributes: ['data-turn', 'data-turn-id', 'data-turn-key', 'data-turn-id-container', 'data-chatgpt-search-unit-key',
                'data-chatgpt-search-message-ids', 'data-content-search-unit-key', 'data-message-author-role', 'data-message-id', 'data-testid', 'data-ait-turn']
        };
    }
    getViewportBounds() {
        const bounds = super.getViewportBounds();
        const header = document.querySelector('header')?.getBoundingClientRect();
        return { top: Math.max(0, bounds.top, header?.bottom || 0), bottom: Math.min(innerHeight, bounds.bottom) };
    }
}
