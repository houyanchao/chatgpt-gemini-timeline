class GeminiMessageActionsAdapter extends MessageActionsAdapter {
    constructor() { super('gemini'); }

    isConversationPage() {
        const path = location.pathname;
        const isChatRoute = /^\/(?:app\/[^/]+|share\/[^/]+|gem\/[^/]+\/[^/]+)(?:\/|$)/.test(path);
        const isTemporaryChat = path === '/app' && document.querySelector('chat-window.is-temporary-chat');
        return !!((isChatRoute || isTemporaryChat) && this.getRoot().querySelector('user-query, model-response'));
    }

    getRoot() {
        return document.querySelector('infinite-scroller.chat-history') || document.querySelector('#chat-history') || document;
    }

    getTurns() {
        const root = this.getRoot();
        const turns = [...root.querySelectorAll('.conversation-container')];
        if (turns.length) return turns;
        // Some share layouts omit the conversation-container class.
        return [...new Set([...root.querySelectorAll('user-query')].map(query => query.parentElement))];
    }

    getTargetId(turn) {
        return turn.id || turn.querySelector('message-content[id]')?.id || '';
    }

    getMessages() {
        if (!this.isConversationPage()) return [];
        const turns = this.getTurns();
        const messages = [];
        const generating = this.getTimelineAdapter()?.isAIGenerating?.() === true;
        turns.forEach((turn, index) => {
            const turnId = this.getTargetId(turn);
            if (!turnId) return;
            const question = turn.querySelector('user-query');
            const reply = turn.querySelector('model-response');
            const add = (element, role, id, streaming) => {
                const rect = element?.getBoundingClientRect();
                if (!rect?.width || !rect.height) return;
                messages.push({ key: `${role}:${id}`, id, role, turnId, element, generating: streaming });
            };
            add(question, 'user', turnId, false);
            const replyId = reply?.querySelector('message-content[id]')?.id || turnId;
            add(reply, 'assistant', replyId, generating && index === turns.length - 1);
        });
        return messages;
    }

    getToolbar(message) {
        const actions = message.element.querySelector('message-actions');
        return actions?.querySelector('.buttons-container-v2, .buttons-container') || actions;
    }

    getSelectionColumn(message) {
        if (message.role !== 'assistant') return null;
        // Gemini's Markdown wrapper spans the history pane. Its blocks and footer
        // are constrained to the response column, with room for wider rich content.
        const body = message.element.querySelector('message-content .markdown, .model-response-text .markdown');
        const footer = message.element.querySelector('.response-container-footer') || this.getToolbar(message);
        let left = Infinity, right = -Infinity;
        const include = element => {
            const rect = element.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return;
            left = Math.min(left, rect.left);
            right = Math.max(right, rect.right);
        };
        if (footer) include(footer);
        for (const block of body?.children || []) include(block);
        return right > left ? { left, right } : null;
    }

    getToolbarMount(toolbar) {
        const menu = toolbar.querySelector('[data-test-id="more-menu-button"], .more-menu-button-container');
        const buttons = [...toolbar.querySelectorAll('button')].filter(button => !button.closest('[data-ait-owned-ui]'));
        let before = menu || buttons.at(-1);
        if (!before) return super.getToolbarMount(toolbar);
        while (before.parentElement !== toolbar) before = before.parentElement;
        return { container: toolbar, before };
    }

    getHistoryTargets() { return this.getTurns().filter(turn => this.getTargetId(turn)); }
    isHistoryLoading() { return GeminiAdapter.isHistoryLoading(); }

    getScrollContainer() {
        const firstTurn = this.getTurns()[0];
        return GeminiAdapter.findChatScroller(firstTurn) || super.getScrollContainer();
    }

    getViewportBounds() {
        const bounds = super.getViewportBounds();
        const header = document.querySelector('.top-bar-actions')?.getBoundingClientRect();
        return { top: Math.max(0, bounds.top, header?.bottom || 0), bottom: Math.min(innerHeight, bounds.bottom) };
    }

    getDockBounds() {
        const rect = document.querySelector('input-area-v2, .input-area')?.getBoundingClientRect();
        return rect?.width > 0 && rect.height > 0 ? rect : null;
    }

    getSnapshotRules() {
        return {
            selector: 'message-actions, .response-container-footer, .luminous-actions-container, .table-footer, '
                + '[data-test-id="prompt-copy-button"], [data-test-id="prompt-edit-button"]',
            attributes: ['jslog', 'data-hveid', 'data-ved', 'decode-data-ved']
        };
    }
}
