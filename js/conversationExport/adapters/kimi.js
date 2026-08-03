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
        const user = this._extractUserFrom(pair.userEl, ['.user-content']);
        const assistant = this._extractAssistantFrom(pair.assistantEl, [
            '.markdown-container',
            '.markdown',
        ]);
        if (!user.text && !user.images.length && !assistant.text && !assistant.images.length) return null;

        const elementId = this._resolveElementId(pair.userEl);
        return {
            id: elementId ? `kimi-${elementId}` : null,
            user,
            assistant,
        };
    }
}
