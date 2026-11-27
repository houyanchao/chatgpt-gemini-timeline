/**
 * Conversation Export - Gemini 导出适配器
 *
 * DOM 采集范式（SCROLL 策略）：对话轮定位、用户/助手内容抽取、加载指示器。
 * 页面可导出判断、按钮锚点、标题、滚动容器等「平台事实」由基类优先委托
 * 时间轴 adapter，本类只提供时间轴不可用时的兜底。
 */

class CEGeminiExportAdapter extends CEExportAdapter {
    constructor() {
        super('gemini');
    }

    /** 兜底：与时间轴 getStarChatButtonTarget 相同的顶栏锚点 */
    _fallbackButtonInsertTarget() {
        const topBarActions = document.querySelector('.top-bar-actions');
        if (!topBarActions) return null;
        const rightSection = topBarActions.querySelector('.right-section');
        if (!rightSection) return null;
        return rightSection.firstElementChild;
    }

    /** 兜底：从对话容器向上查找可滚动祖先（与时间轴 resolveScrollContainer 一致） */
    _fallbackScrollContainer() {
        const selector = this.getUserMessageSelector();
        const firstContainer = document.querySelector('.conversation-container') ||
            (selector ? document.querySelector(selector) : null);
        return GeminiAdapter.findChatScroller(firstContainer);
    }

    getTurnContainers() {
        const containers = Array.from(document.querySelectorAll('.conversation-container'));
        if (containers.length) return containers;

        // 退化：直接用用户消息元素的最近容器
        const selector = this.getUserMessageSelector();
        if (!selector) return [];
        const userQueries = Array.from(document.querySelectorAll(selector));
        const seen = new Set();
        const result = [];
        userQueries.forEach(uq => {
            const container = uq.closest('.conversation-container') || uq.parentElement || uq;
            if (container && !seen.has(container)) {
                seen.add(container);
                result.push(container);
            }
        });
        return result;
    }

    extractTurn(container) {
        if (!container) return null;

        const selector = this.getUserMessageSelector();
        const userEl = selector ? container.querySelector(selector) : null;
        const assistantSelector = this.getAssistantMessageSelector();
        const modelEl = assistantSelector ? container.querySelector(assistantSelector) : null;

        // 既无用户也无助手内容，跳过
        if (!userEl && !modelEl) return null;

        const id = this._resolveTurnId(container, userEl);
        const user = this._extractUser(userEl);
        const assistant = this._extractAssistant(modelEl);

        return { id, user, assistant };
    }

    /**
     * 加载指示器：Gemini 加载上方未渲染节点时，页面顶部出现可见的
     * indeterminate mat-progress-bar（class 含 mdc-linear-progress--indeterminate）。
     * @returns {boolean}
     */
    isLoadingMore() {
        return GeminiAdapter.isHistoryLoading();
    }

    _resolveTurnId(container, userEl) {
        if (container.id) return `gemini-${container.id}`;
        const parentId = userEl?.parentElement?.id;
        if (parentId) return `gemini-${parentId}`;
        if (userEl?.id) return `gemini-${userEl.id}`;
        return null;
    }

    _extractUser(userEl) {
        if (!userEl) return { text: '', images: [], time: null };

        // 文本：优先 .query-text-line（保留换行），回退整体文本
        const queryText = userEl.querySelector('.query-text') || userEl;
        const lines = queryText.querySelectorAll('.query-text-line');
        let text = '';
        if (lines.length) {
            text = Array.from(lines)
                .map(line => this.domToMarkdown.literalText(line))
                .join('\n');
        } else {
            text = this.domToMarkdown.literalText(queryText);
        }

        const images = this._collectImagesFrom(userEl, 'user', queryText);
        return { text, images, time: this._getAskTime(userEl) };
    }

    _extractAssistant(modelEl) {
        // 可点击的生成图片有时在 Markdown 正文之外，由整行的附件扫描补收。
        return this._extractAssistantFrom(modelEl, ['.markdown', 'message-content', '.model-response-text']);
    }
}
