class ChatGPTMessageActionsAdapter extends MessageActionsAdapter {
    // Generated images can have a response body directly after the assistant heading, without a search unit.
    static REPLY_BODY = '[data-conversation-role="assistant"] + [data-response-body][data-chatgpt-search-message-ids]';
    static MESSAGE_SELECTOR = '[data-turn][data-turn-id], [data-chatgpt-search-unit-key][data-chatgpt-search-message-ids], '
        + ChatGPTMessageActionsAdapter.REPLY_BODY;
    constructor() {
        super('chatgpt');
        this.virtualHistory = true;
        this.replyTurns = new Map();
    }
    isConversationPage() {
        return /^\/(?:c|share)\/[^/]+/.test(location.pathname) || /^\/g\/[^/]+\/c\/[^/]+/.test(location.pathname);
    }
    getRole(element) {
        const role = element.getAttribute('data-turn') || element.getAttribute('data-chatgpt-search-unit-key')?.split(':').pop();
        if (role) return role;
        if (element.matches(ChatGPTMessageActionsAdapter.REPLY_BODY) && (element.querySelector('img') || element.textContent.trim())) return 'assistant';
    }
    getId(element) {
        return element.getAttribute('data-turn-id') || element.getAttribute('data-chatgpt-search-message-ids')?.trim().split(/\s+/)[0] || '';
    }
    getRoot() { return document.querySelector('[data-thread-find-target="conversation"]') || document.querySelector('main'); }
    getConversationState({ refresh = false, messages = [] } = {}) {
        const source = this.branchSource || this.getTimelineAdapter();
        if (refresh) source?.syncCapturedChatsData?.({ force: true });
        let branch = source?.getConversationBranch?.() || null;
        if (branch && messages.length) {
            const questions = new Set(branch.turnIds);
            const lastQuestion = branch.turnIds.at(-1);
            // A mismatch on open may be an edit made before opening the panel.
            // Wait for the current branch before adopting any cached IDs as its baseline.
            if (messages.some(message => message.role === 'user' && !questions.has(message.id))) branch = null;
            else if (branch.lastQuestionAnswered === false
                && messages.some(message => message.role === 'assistant' && message.turnId === lastQuestion)) {
                branch = { ...branch, messageTotal: undefined };
            }
        }
        // Reopening an unchanged conversation only reads the shared snapshot.
        if (refresh && !Number.isInteger(branch?.messageTotal)) source?.syncCapturedChatsData?.({ force: true, refreshLatest: true });
        return branch;
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
        if (this.path !== location.pathname) {
            this.path = location.pathname;
            this.replyTurns.clear();
        }
        const selector = ChatGPTMessageActionsAdapter.MESSAGE_SELECTOR;
        const messages = new Map();
        let shellId = '', previousShellId = '', previousUser = '';
        for (const element of this.getRoot()?.querySelectorAll(selector + ', [data-turn-id-container]') || []) {
            if (element.closest('[data-ait-owned-ui]')) continue;
            // Legacy virtual turns keep one shell per role, even when only the pinned final reply has content.
            const containerId = element.getAttribute('data-turn-id-container');
            if (containerId) {
                if (containerId !== shellId) {
                    previousShellId = shellId;
                    shellId = containerId;
                }
                if (!element.matches(selector)) continue;
            }
            if (element.parentElement?.closest(selector)) continue;
            const rect = element.getBoundingClientRect();
            const role = this.getRole(element), id = this.getId(element);
            if (!['user', 'assistant'].includes(role) || !id || rect.width <= 0 || rect.height <= 0) continue;
            const key = `${role}:${id}`;
            if (messages.has(key)) continue;
            let turnId = element.closest('[data-turn-key]')?.getAttribute('data-turn-key');
            if (role === 'assistant') {
                if (!turnId && shellId === id) turnId = previousShellId;
                turnId ||= this.replyTurns.get(id);
                if (!turnId && shellId !== id) turnId = previousUser;
                if (turnId) this.replyTurns.set(id, turnId);
            }
            messages.set(key, { key, role, id, element, turnId: turnId || id });
            previousUser = role === 'user' ? id : '';
        }
        return Array.from(messages.values(), (message, index) => {
            const { element, role } = message;
            const state = element.closest('[data-talvt-turn-state]')?.getAttribute('data-talvt-turn-state');
            const streaming = !!element.querySelector('[data-is-streaming="true"], .result-streaming') || element.matches('[data-is-streaming="true"]');
            const lastGenerating = !state && index === messages.size - 1 && !!window.AIStateMonitor?.getInstance().isGenerating;
            return { ...message,
                generating: role === 'assistant' && (streaming || (state ? state !== 'complete' : lastGenerating)) };
        });
    }
    getToolbar(message) {
        const reply = message.element;
        const turn = reply.closest('[data-turn-key]') || reply.closest('article') || reply;
        const user = '[data-chatgpt-search-unit-key$=":user"], [data-turn="user"]';
        const rows = [...turn.querySelectorAll('.turn-action-controls')].filter(row =>
            !row.closest(user));
        const row = rows.find(row => row.closest('[data-turn="assistant"]')
            || row.querySelector('[data-testid="copy-turn-action-button"], [data-testid="good-response-turn-action-button"]')) || rows.at(-1);
        if (row) return row;
        const copy = [...turn.querySelectorAll('[data-testid="copy-turn-action-button"]')].find(button => !button.closest(user));
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

    createGeneratedImageCache(signal) {
        // ChatGPT may revoke a gallery's blob URL when it unloads the reply. Keep the original image bytes
        // for this collector only, including when the same preview is mounted again during traversal.
        const sources = new Map();
        signal?.addEventListener('abort', () => sources.clear(), { once: true });
        const read = async src => {
            const response = await fetch(src, { signal });
            if (!response.ok) throw new Error('ImageFailed');
            const blob = await response.blob();
            if (!blob.size || !blob.type.startsWith('image/')) throw new Error('ImageFailed');
            const data = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = () => reject(new Error('ImageFailed'));
                reader.readAsDataURL(blob);
            });
            signal?.throwIfAborted();
            return data;
        };
        return element => {
            const pending = [];
            for (const img of element.querySelectorAll('[class~="group/generated-image-preview"] > button > img')) {
                const src = img.currentSrc || img.src;
                if (!src.startsWith('blob:')) continue;
                if (!sources.has(src)) {
                    sources.set(src, read(src).then(data => [src, data], error => {
                        sources.delete(src);
                        signal?.throwIfAborted();
                        if (error?.name === 'AbortError') throw error;
                        // Leave this URL in the output for the renderer's normal image fallback.
                        return null;
                    }));
                }
                pending.push(sources.get(src));
            }
            if (!pending.length) return null;
            return Promise.all(pending).then(entries => {
                signal?.throwIfAborted();
                return new Map(entries.filter(Boolean));
            });
        };
    }
    getViewportBounds() {
        const bounds = super.getViewportBounds();
        const header = document.querySelector('header')?.getBoundingClientRect();
        return { top: Math.max(0, bounds.top, header?.bottom || 0), bottom: Math.min(innerHeight, bounds.bottom) };
    }
}
