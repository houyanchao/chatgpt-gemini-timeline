class KimiMessageActionsAdapter extends MessageActionsAdapter {
    static USER = '.chat-content-item-user, .chat-content-item:has(.user-content)';
    static REPLY = '.chat-content-item-assistant';
    static SCROLLER = '.chat-detail-main';
    static ACTIONS = '.segment-assistant-actions';

    constructor() {
        super('kimi');
        this.elementIds = new WeakMap();
        this.nextId = 0;
    }

    isConversationPage() {
        return /^\/(?:chat|share)\/[^/]+/.test(location.pathname)
            && !!document.querySelector(`${KimiMessageActionsAdapter.USER}, ${KimiMessageActionsAdapter.REPLY}`);
    }

    getMessageId(element) {
        const id = element.getAttribute('data-message-id') || element.id;
        if (id) return id;
        if (!this.elementIds.has(element)) this.elementIds.set(element, `dom:${++this.nextId}`);
        return this.elementIds.get(element);
    }

    getMessages() {
        if (!this.isConversationPage()) return [];
        const { USER, REPLY, SCROLLER } = KimiMessageActionsAdapter;
        const selector = `${USER}, ${REPLY}`;
        const root = document.querySelector(SCROLLER) || document;
        const elements = [...root.querySelectorAll(selector)].filter(element => {
            const rect = element.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && !element.parentElement?.closest(selector);
        });
        const generating = this.getTimelineAdapter()?.isAIGenerating?.() === true;
        let questionId = '';
        return elements.map((element, index) => {
            const role = element.matches(REPLY) ? 'assistant' : 'user';
            const id = this.getMessageId(element);
            if (role === 'user') questionId = id;
            return { key: `${role}:${id}`, id, role, element, turnId: questionId || id,
                generating: role === 'assistant' && generating && index === elements.length - 1 };
        });
    }

    getScrollContainer() {
        return document.querySelector(KimiMessageActionsAdapter.SCROLLER) || super.getScrollContainer();
    }

    getToolbar(message) {
        const actions = message.element.querySelector(KimiMessageActionsAdapter.ACTIONS);
        return actions?.querySelector('.segment-assistant-actions-content') || actions;
    }

    getToolbarMount(toolbar) {
        const controls = [...toolbar.children].filter(child => !child.hasAttribute('data-ait-owned-ui'));
        return { container: toolbar, before: controls.at(-1) || null };
    }

    getDockBounds() {
        const rect = document.querySelector('.chat-editor, .chat-input-editor[contenteditable="true"]')?.getBoundingClientRect();
        return rect?.width > 0 && rect.height > 0 ? rect : null;
    }

    getSnapshotRules() {
        return { selector: `${KimiMessageActionsAdapter.ACTIONS}, .segment-user-action-row`, attributes: ['data-message-id'] };
    }
}
