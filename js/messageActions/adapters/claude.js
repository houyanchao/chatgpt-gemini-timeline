class ClaudeMessageActionsAdapter extends MessageActionsAdapter {
    static USER = '[data-testid="user-message"]';
    static REPLY = '[data-testid="assistant-message"], .font-claude-response';
    static ROW = '[data-testid="transcript-row"][data-index]';
    static ROOT = '[data-testid="transcript-list"]';

    constructor() { super('claude'); this.virtualHistory = true; }

    isConversationPage() {
        return /^\/(chat|share)\/[a-f0-9-]+\/?$/i.test(location.pathname)
            && !!document.querySelector(`${ClaudeMessageActionsAdapter.USER}, ${ClaudeMessageActionsAdapter.REPLY}`);
    }

    subscribeConversationChanges(callback) {
        const source = this.branchSource = this.getTimelineAdapter();
        source?.syncCapturedChatsData?.();
        return source?.subscribeCapturedChatsDataUpdated?.(() => {
            source.syncCapturedChatsData();
            callback();
        });
    }

    getConversationState() {
        return (this.branchSource || this.getTimelineAdapter())?.getConversationBranch?.() || null;
    }

    getMessages() {
        if (!this.isConversationPage()) return [];
        const { USER, REPLY, ROW, ROOT } = ClaudeMessageActionsAdapter;
        const selector = `${USER}, ${REPLY}`;
        const root = document.querySelector(ROOT) || document;
        const elements = [...root.querySelectorAll(selector)].filter(element => {
            const rect = element.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && !element.parentElement?.closest(selector);
        });
        const questions = this.getConversationState()?.questions || [];
        const generating = this.getTimelineAdapter()?.isAIGenerating?.() === true;
        let questionId = '';
        return elements.map((element, index) => {
            const role = element.matches(USER) ? 'user' : 'assistant';
            const row = element.closest(ROW);
            const position = row ? Number(row.getAttribute('data-index')) : undefined;
            const id = ClaudeAdapter.getMessageId(element) || (row ? `row-${position}` : `legacy-${index}`);
            if (role === 'user') questionId = id;
            const previous = Number.isInteger(position) ? questions.findLast(question => question.rowIndex <= position) : null;
            return { key: `${role}:${id}`, id, role, element, position,
                slot: Number.isInteger(position) ? `row:${position}` : undefined,
                turnId: role === 'user' ? id : questionId || previous?.id || id,
                generating: role === 'assistant' && generating && index === elements.length - 1 };
        });
    }

    getToolbar(message) {
        return message.element.querySelector('[data-testid="message-actions"]')
            || message.element.closest(ClaudeMessageActionsAdapter.ROW)?.querySelector('[data-testid="message-actions"]');
    }

    getToolbarMount(toolbar) {
        const nativeButtons = [...toolbar.children].filter(child => child.matches('button:not([data-ait-owned-ui])'));
        // Leave collapsed toolbars' reveal buttons first in the tab order.
        const before = nativeButtons.length > 1 ? nativeButtons.at(-1) : toolbar.querySelector(':scope > time');
        return { container: toolbar, before };
    }

    getScrollContainer() {
        return ClaudeAdapter.findChatScroller(document.querySelector(ClaudeMessageActionsAdapter.ROOT)
            || document.querySelector(ClaudeMessageActionsAdapter.USER)) || super.getScrollContainer();
    }

    beforeHistoryScroll() { window.__aitPreventAutoScroll?.notifyUserNavigation?.({ durationMs: 1000 }); }

    getHistoryGap(records) {
        const scope = document.querySelector('[data-testid="transcript-sizer"]');
        if (!scope) return null;
        const total = Number(scope.querySelector('[aria-setsize]')?.getAttribute('aria-setsize'));
        const seen = new Set([...records.messages.values()].map(message => message.position).filter(Number.isInteger));
        if (total && seen.size >= total) return null;
        const gap = ClaudeAdapter.findTranscriptGap(scope, index => seen.has(index), total);
        if (!gap) return total > seen.size ? {} : null;
        const height = gap.spacer.getBoundingClientRect().height;
        return { element: gap.spacer, offset: height * gap.fraction + Math.min(height / 2, this.getScrollContainer().clientHeight / 2) };
    }

    getDockBounds() {
        const rect = document.querySelector('[data-testid="chat-input"], [data-chat-input-container]')?.getBoundingClientRect();
        return rect?.width > 0 ? rect : null;
    }

    getSnapshotElement(message) {
        if (message.role !== 'user') return message.element;
        return message.element.closest('[data-cds="UserMessage"]') || message.element;
    }

    getSnapshotRules() {
        return { selector: '[data-testid="message-actions"], [data-testid="growth-inline-line"], [data-find-omitted], '
            + '[data-testid="code-block-copy"], [data-cds="MessageActions"], button[aria-label^="Show message actions"]',
            attributes: ['data-testid', 'data-turn-key', 'data-index', 'data-perf-row', 'data-find-omitted'] };
    }
}
