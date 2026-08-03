/**
 * Conversation Export - DeepSeek 导出适配器
 *
 * DeepSeek 使用虚拟列表；滚到顶部后历史消息会物化到 DOM，
 * 因此复用基类 SCROLL 策略即可收集完整会话。
 */

class CEDeepSeekExportAdapter extends CEExportAdapter {
    constructor() {
        super('deepseek');
    }

    getUserMessageSelector() {
        return '.ds-message:not(:has(.ds-assistant-message-main-content))';
    }

    getAssistantMessageSelector() {
        return '.ds-message:has(.ds-assistant-message-main-content)';
    }

    _fallbackButtonInsertTarget() {
        const path = document.querySelector('path[d^="M15.7484 11.1004"]');
        return path?.closest('.ds-icon-button') || null;
    }

    _fallbackScrollContainer() {
        return document.querySelector('.ds-virtual-list--printable');
    }

    getTurnContainers() {
        const messages = Array.from(document.querySelectorAll('.ds-message'));
        return this._pairFlatTurns(messages, element => (
            element.querySelector('.ds-assistant-message-main-content') ? 'assistant' : 'user'
        ));
    }

    extractTurn(pair) {
        if (!pair?.userEl) return null;
        const user = this._extractUserFrom(pair.userEl, [':scope > div']);
        const assistant = this._extractAssistantFrom(pair.assistantEl, [
            '.ds-assistant-message-main-content',
            '.ds-markdown',
        ]);
        if (!user.text && !user.images.length && !assistant.text && !assistant.images.length) return null;

        const elementId = this._resolveElementId(pair.userEl);
        return {
            id: elementId ? `deepseek-${elementId}` : null,
            user,
            assistant,
        };
    }

    isLoadingMore() {
        const loading = document.querySelector('.ds-loading');
        if (!loading) return false;
        const rect = loading.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    }
}
