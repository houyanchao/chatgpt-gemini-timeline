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
        // 时间轴 adapter 不可用时的兜底选择器
        this.defaultUserMessageSelector = 'user-query';
        this.defaultAssistantMessageSelector = 'model-response';
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
        let node = firstContainer;
        while (node && node !== document.body) {
            const style = window.getComputedStyle(node);
            if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
                return node;
            }
            node = node.parentElement;
        }
        return null;
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
        try {
            const bars = document.querySelectorAll(
                'mat-progress-bar[mode="indeterminate"], .mdc-linear-progress--indeterminate'
            );
            for (const bar of bars) {
                const rect = bar.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) return true;
            }
        } catch { /* ignore */ }
        return false;
    }

    _resolveTurnId(container, userEl) {
        if (container.id) return `gemini-${container.id}`;
        const parentId = userEl?.parentElement?.id;
        if (parentId) return `gemini-${parentId}`;
        if (userEl?.id) return `gemini-${userEl.id}`;
        return null;
    }

    _extractUser(userEl) {
        if (!userEl) return { text: '', images: [] };

        // 文本：优先 .query-text-line（保留换行），回退整体文本
        const lines = userEl.querySelectorAll('.query-text-line');
        let text = '';
        if (lines.length) {
            text = Array.from(lines)
                .map(line => (line.textContent || '').trim())
                .filter(Boolean)
                .join('\n');
        } else {
            const queryText = userEl.querySelector('.query-text') || userEl;
            text = (queryText.textContent || '').replace(/\s+/g, ' ').trim();
        }

        const images = this._collectImagesFrom(userEl, 'user');
        return { text, images };
    }

    _extractAssistant(modelEl) {
        if (!modelEl) {
            return { markdown: '', text: '', images: [] };
        }
        return this._domMarkdownFrom(modelEl, ['.markdown', 'message-content', '.model-response-text']);
    }
}
