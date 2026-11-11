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
        return DeepSeekAdapter.getHeaderActionTarget();
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
        const user = this._extractUser(pair.userEl);
        const assistant = this._extractAssistant(pair.assistantEl);
        if (!user.text && !user.images.length && !assistant.text && !assistant.images.length) return null;

        const elementId = this._resolveElementId(pair.userEl);
        return {
            id: elementId ? `deepseek-${elementId}` : null,
            user,
            assistant,
        };
    }

    _extractUser(element) { return this._extractUserFrom(element, [':scope > div']); }

    getSelectedAskTimeKey(message) {
        // Existing DeepSeek timestamps are stored by the timeline's question index.
        const timeline = window.timelineManager;
        if (timeline?.adapter?.platformId !== this.platformId) return null;
        return timeline.markers?.find(marker => marker.element === message.element)?.id || null;
    }

    _extractAssistant(element) {
        return this._extractAssistantFrom(element, ['.ds-assistant-message-main-content', '.ds-markdown']);
    }

    isLoadingMore() {
        return DeepSeekAdapter.isHistoryLoading();
    }
}
