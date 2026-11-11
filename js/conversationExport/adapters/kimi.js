/**
 * Conversation Export - Kimi 导出适配器
 */

class CEKimiExportAdapter extends CEExportAdapter {
    constructor() {
        super('kimi');
    }

    getAssistantMessageSelector() {
        return '.chat-content-item-assistant';
    }

    _fallbackButtonInsertTarget() {
        return document.querySelector('.chat-header-actions .icon');
    }

    _fallbackScrollContainer() {
        return document.querySelector('.chat-detail-main');
    }

    getTurnContainers() {
        const messages = Array.from(document.querySelectorAll(
            '.chat-content-item-user, .chat-content-item-assistant'
        ));
        return this._pairFlatTurns(messages, element => {
            if (element.classList.contains('chat-content-item-user')) return 'user';
            if (element.classList.contains('chat-content-item-assistant')) return 'assistant';
            return '';
        });
    }

    extractTurn(pair) {
        if (!pair?.userEl) return null;
        const user = this._extractUser(pair.userEl);
        const assistant = this._extractAssistant(pair.assistantEl);
        if (!user.text && !user.images.length && !assistant.text && !assistant.images.length) return null;

        const elementId = this._resolveElementId(pair.userEl);
        return {
            id: elementId ? `kimi-${elementId}` : null,
            user,
            assistant,
        };
    }

    _extractUser(element) { return this._extractUserFrom(element, ['.user-content']); }

    _extractAssistant(element) { return this._extractAssistantFrom(element, ['.markdown-container', '.markdown']); }

    getSelectedAskTimeKey(message) {
        const index = [...document.querySelectorAll(this.getUserMessageSelector())].indexOf(message.element);
        return index < 0 ? null : `kimi-${index}`;
    }
}
