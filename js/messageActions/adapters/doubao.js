class DoubaoMessageActionsAdapter extends MessageActionsAdapter {
    static MESSAGE = '[data-message-id]';
    static SCROLLER = '.scroller[class*="v_list_scroller"]';
    static ACTIONS = '[class*="message-action-bar-"]';

    constructor() {
        super('doubao');
        this.virtualHistory = true;
        this.replyTurns = new Map();
        this.url = '';
    }

    isConversationPage() {
        return (/^\/chat\/[^/]+/.test(location.pathname) || /^\/share(?:\/|$)/.test(location.pathname))
            && !!document.querySelector(DoubaoMessageActionsAdapter.MESSAGE);
    }

    getMessages() {
        if (!this.isConversationPage()) return [];
        if (this.url !== location.href) {
            this.url = location.href;
            this.replyTurns.clear();
        }
        const { MESSAGE, SCROLLER } = DoubaoMessageActionsAdapter;
        const root = document.querySelector(SCROLLER) || document;
        const elements = [...root.querySelectorAll(MESSAGE)].filter(element => {
            const rect = element.getBoundingClientRect();
            return !!element.getAttribute('data-message-id') && rect.width > 0 && rect.height > 0
                && !element.parentElement?.closest(MESSAGE);
        });
        const generating = this.getTimelineAdapter()?.isAIGenerating?.() === true;
        let questionId = '';
        return elements.map((element, index) => {
            const role = element.classList.contains('justify-end') ? 'user' : 'assistant';
            const id = element.getAttribute('data-message-id');
            if (role === 'user') questionId = id;
            else if (questionId) this.replyTurns.set(id, questionId);
            return { key: `${role}:${id}`, id, role, element, turnId: questionId || this.replyTurns.get(id) || id,
                generating: role === 'assistant' && generating && index === elements.length - 1 };
        });
    }

    getScrollContainer() {
        return document.querySelector(DoubaoMessageActionsAdapter.SCROLLER) || super.getScrollContainer();
    }

    getToolbar(message) {
        const { ACTIONS, MESSAGE } = DoubaoMessageActionsAdapter;
        let actions = message.element.querySelector(ACTIONS);
        const parent = message.element.parentElement;
        if (!actions && parent?.querySelectorAll(`:scope > ${MESSAGE}`).length === 1) {
            actions = parent.querySelector(ACTIONS);
        }
        return actions?.querySelector('.bp5-overflow-list') || actions;
    }

    getToolbarMount(toolbar) {
        const tail = toolbar.querySelector(':scope > [class*="message-action-tail-"], :scope > .bp5-overflow-list-spacer');
        const controls = [...toolbar.children].filter(child => !child.hasAttribute('data-ait-owned-ui'));
        return { container: toolbar, before: tail || controls.at(-1) || null };
    }

    isHistoryLoading() {
        const root = document.querySelector(DoubaoMessageActionsAdapter.SCROLLER);
        return [...(root?.querySelectorAll('[role="progressbar"]') || [])]
            .some(node => !node.closest(DoubaoMessageActionsAdapter.MESSAGE) && node.getClientRects().length > 0);
    }

    getDockBounds() {
        const rect = document.querySelector('[class*="input-content-container-"], textarea.semi-input-textarea')?.getBoundingClientRect();
        return rect?.width > 0 && rect.height > 0 ? rect : null;
    }

    getSnapshotRules() {
        return { selector: DoubaoMessageActionsAdapter.ACTIONS,
            attributes: ['data-message-id', 'data-testid'] };
    }
}
