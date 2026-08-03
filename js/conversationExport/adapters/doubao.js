/**
 * Conversation Export - 豆包导出适配器
 *
 * 豆包一条用户消息和一条助手消息都有 data-message-id，
 * 用户行以 justify-end 对齐，可在虚拟列表内按 DOM 顺序稳定配对。
 */

class CEDoubaoExportAdapter extends CEExportAdapter {
    constructor() {
        super('doubao');
    }

    getAssistantMessageSelector() {
        return '[data-message-id]:not(.justify-end)';
    }

    _fallbackButtonInsertTarget() {
        return document.querySelector('button[data-trigger-type="hover"]');
    }

    _fallbackScrollContainer() {
        return document.querySelector('.scroller[class*="v_list_scroller"]');
    }

    /**
     * 豆包的对话列表是反向滚动：scrollTop=0 在底部，越早的历史越接近负向极值。
     * 基类固定 scrollTo(0) 只会留在底部，因此需要按当前列表高度计算历史顶部。
     */
    async _loadByScrolling({ onProgress, shouldCancel, scrollTo }) {
        const scroller = this.getScrollContainer();
        if (!scroller || scroller === window) {
            return super._loadByScrolling({ onProgress, shouldCancel, scrollTo });
        }

        const maxRounds = 800;
        let prevCount = this.getTurnContainers().length;
        let stableRounds = 0;
        onProgress?.(prevCount);

        for (let round = 0; round < maxRounds; round++) {
            if (shouldCancel?.()) break;

            // column-reverse 滚动容器的历史顶部是负的最大可滚动距离。
            const historyTop = Math.min(0, scroller.clientHeight - scroller.scrollHeight);
            scrollTo(historyTop);
            await this._wait(1000);
            await this._waitWhileLoading(2000);

            const count = this.getTurnContainers().length;
            const nextHistoryTop = Math.min(0, scroller.clientHeight - scroller.scrollHeight);
            const reachedHistoryTop = Math.abs(scroller.scrollTop - nextHistoryTop) <= 1;
            const historyRangeChanged = Math.abs(nextHistoryTop - historyTop) > 1;
            onProgress?.(count);

            if (this.isLoadingMore()) {
                stableRounds = 0;
                continue;
            }

            if (count === prevCount && reachedHistoryTop && !historyRangeChanged) {
                stableRounds++;
                if (stableRounds >= 2) break;
            } else {
                stableRounds = 0;
            }
            prevCount = count;
        }
    }

    getTurnContainers() {
        const messages = Array.from(document.querySelectorAll('[data-message-id]'));
        return this._pairFlatTurns(messages, element => (
            element.classList.contains('justify-end') ? 'user' : 'assistant'
        ));
    }

    extractTurn(pair) {
        if (!pair?.userEl) return null;
        const user = this._extractUserFrom(pair.userEl, [
            '[data-plugin-identifier="Symbol(infra:send-message-box:text)"]',
            '[data-plugin-identifier="block_type:10000"] .md-box-root',
            '[data-plugin-identifier]',
        ]);
        const assistant = this._extractAssistantFrom(pair.assistantEl, [
            '.flow-markdown-body',
            '[data-plugin-identifier="block_type:10000"] .md-box-root',
            '.md-box-root',
            '[data-container-type^="block"]',
        ]);
        if (!user.text && !user.images.length && !assistant.text && !assistant.images.length) return null;

        const elementId = this._resolveElementId(pair.userEl);
        return {
            id: elementId ? `doubao-${elementId}` : null,
            user,
            assistant,
        };
    }
}
