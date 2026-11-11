class DeepSeekMessageActionsAdapter extends MessageActionsAdapter {
    static SCROLLER = '.ds-virtual-list--printable';
    static ITEM = '[data-virtual-list-item-key]';
    static REPLY = '.ds-assistant-message-main-content';

    constructor() {
        super('deepseek');
        this.virtualHistory = true;
        this.replyTurns = new Map();
        this.path = '';
    }

    isConversationPage() {
        return /^\/(?:a\/chat\/s|share)\/[^/]+/.test(location.pathname) && !!document.querySelector('.ds-message');
    }

    getMessages() {
        if (!this.isConversationPage()) return [];
        if (this.path !== location.pathname) {
            this.path = location.pathname;
            this.replyTurns.clear();
        }
        const { SCROLLER, ITEM, REPLY } = DeepSeekMessageActionsAdapter;
        const root = document.querySelector(SCROLLER) || document;
        const elements = [...root.querySelectorAll('.ds-message')].filter(element => {
            const rect = element.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && !element.parentElement?.closest('.ds-message');
        });
        const generating = this.getTimelineAdapter()?.isAIGenerating?.() === true;
        let questionId = '';
        return elements.map((element, index) => {
            const role = element.querySelector(REPLY) ? 'assistant' : 'user';
            const itemId = element.closest(ITEM)?.getAttribute('data-virtual-list-item-key');
            const id = itemId || element.getAttribute('data-message-id') || element.id || `legacy-${index}`;
            if (role === 'user') questionId = id;
            else if (questionId) this.replyTurns.set(id, questionId);
            return { key: `${role}:${id}`, id, role, element, turnId: questionId || this.replyTurns.get(id) || id,
                generating: role === 'assistant' && generating && index === elements.length - 1 };
        });
    }

    getToolbar(message) {
        // DeepSeek mounts its native controls alongside the .ds-message inside the same row.
        const row = message.element.closest(DeepSeekMessageActionsAdapter.ITEM) || message.element.parentElement;
        const controls = [...(row?.children || [])].find(child => child !== message.element && !child.contains(message.element)
            && child.querySelector('.ds-button[role="button"], .ds-icon-button'));
        return controls?.querySelector('.ds-button[role="button"], .ds-icon-button')?.parentElement || null;
    }

    getToolbarMount(toolbar) {
        const buttons = [...toolbar.children].filter(child => child.matches('.ds-button[role="button"], .ds-icon-button'));
        return { container: toolbar, before: buttons.at(-1) || null };
    }

    isHistoryLoading() { return DeepSeekAdapter.isHistoryLoading(); }

    getScrollContainer() {
        return document.querySelector(DeepSeekMessageActionsAdapter.SCROLLER) || super.getScrollContainer();
    }

    getDockBounds() {
        const rect = document.querySelector('textarea:not([data-ait-owned-ui] *)')?.getBoundingClientRect();
        return rect?.width > 0 ? rect : null;
    }

    getSnapshotRules() {
        return { selector: '.ds-icon-button, .ds-button--icon, .ds-loading', attributes: ['data-message-id', 'data-virtual-list-item-key'] };
    }
}
