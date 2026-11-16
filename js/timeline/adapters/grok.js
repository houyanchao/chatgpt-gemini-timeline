/**
 * Grok Adapter
 * 
 * Supports: 
 *   - grok.com/c/xxx (普通对话)
 *   - grok.com/share/xxx (分享页面)
 * Features: Supports current and legacy message markup, KaTeX formula support
 */

class GrokAdapter extends SiteAdapter {
    static STOP_TEST_ID = 'composer-stop';
    static STOP_BUTTON_SELECTOR = `button[data-testid="${this.STOP_TEST_ID}"]`;
    static LEGACY_STOP_PATH = 'M4 9.2v5.6c0 1.116 0 1.673.11 2.134a4 4 0 0 0 2.956 2.956c.46.11 1.018.11 2.134.11h5.6c1.116 0 1.673 0 2.134-.11a4 4 0 0 0 2.956-2.956c.11-.46.11-1.018.11-2.134V9.2c0-1.116 0-1.673-.11-2.134a4 4 0 0 0-2.956-2.955C16.474 4 15.916 4 14.8 4H9.2c-1.116 0-1.673 0-2.134.11a4 4 0 0 0-2.955 2.956C4 7.526 4 8.084 4 9.2Z';
    static LEGACY_STOP_SELECTOR = `path[d="${this.LEGACY_STOP_PATH}"]`;

    constructor() {
        super();
    }

    async matches(url) {
        return matchesPlatform(url, 'grok');
    }

    getUserMessageSelector() {
        return '[data-user-message-row], .items-end[id]:not([data-user-message-row] *)';
    }

    generateTurnId(element, index) {
        // 使用 index 作为唯一标识，与其他 AI 平台保持一致
        return `grok-${index}`;
    }

    getMessageTextElement(element) {
        return element.querySelector('[data-bubble-text]') || element.querySelector('p.break-words');
    }

    extractText(element) {
        const textElement = this.getMessageTextElement(element);
        const text = (textElement?.textContent || '').trim();
        return text || '[图片或文件]';
    }
    
    getTimeLabelTarget(element) {
        return this.getMessageTextElement(element) || element;
    }

    isConversationRoute(pathname) {
        // Grok 对话 URL: /c/xxx 或分享页面 /share/xxx
        return pathname.includes('/c/') || pathname.includes('/share/');
    }

    extractConversationId(pathname) {
        try {
            // 提取对话 ID: /c/xxx 或 /share/xxx
            const match = pathname.match(/\/(c|share)\/([^\/]+)/);
            if (match) return match[2];
            
            return null;
        } catch {
            return null;
        }
    }

    findConversationContainer(firstMessage, { userTurnElements } = {}) {
        this.hideNativeTimeline();

        const transcriptScroller = firstMessage?.closest('[data-testid="chat-transcript-scroller"]');
        return transcriptScroller || ContainerFinder.findConversationContainer(firstMessage, {
            messageSelector: this.getUserMessageSelector(),
            messages: userTurnElements
        });
    }
    
    /**
     * ✅ 隐藏 Grok 自带的时间轴元素
     */
    hideNativeTimeline() {
        try {
            const nativeTimeline = document.querySelector('.group\\/timeline');
            if (nativeTimeline) {
                nativeTimeline.style.display = 'none';
            }
        } catch {}
    }
    
    /**
     * ✅ 恢复显示 Grok 自带的时间轴元素
     */
    showNativeTimeline() {
        try {
            const nativeTimeline = document.querySelector('.group\\/timeline');
            if (nativeTimeline) {
                nativeTimeline.style.display = '';
            }
        } catch {}
    }

    getTimelinePosition() {
        // Grok 时间轴位置配置
        return {
            top: '120px',      // 避开顶部导航栏
            right: '22px',     // 右侧边距
            bottom: '120px',   // 避开底部输入框
        };
    }
    
    getStarChatButtonTarget() {
        return document.querySelector('button[data-testid="conversation-actions-trigger"]')
            || document.querySelector('button[aria-label="更多"]');
    }
    
    getDefaultChatTheme() {
        // Grok 使用页面标题作为默认主题，去掉后缀 " - Grok"
        const title = document.title || '';
        return title.replace(/\s*-\s*Grok\s*$/i, '').trim();
    }
    
    /**
     * 检测 AI 是否正在生成回答
     * 新版使用输入框停止按钮，旧版使用停止图标。
     * @returns {boolean}
     */
    isAIGenerating() {
        return !!document.querySelector(
            `form[data-composer] ${GrokAdapter.STOP_BUTTON_SELECTOR}, ${GrokAdapter.LEGACY_STOP_SELECTOR}`
        );
    }

    // 同时处理停止按钮被替换、移除和原地更新的情况。
    observeAIGeneration(onChange) {
        const selector = `${GrokAdapter.STOP_BUTTON_SELECTOR}, ${GrokAdapter.LEGACY_STOP_SELECTOR}`;
        const containsStopControl = node => node.nodeType === Node.ELEMENT_NODE
            && (node.matches(selector) || node.querySelector(selector));
        const observer = new MutationObserver(mutations => {
            const changed = mutations.some(mutation => {
                if (mutation.type === 'childList') {
                    return [...mutation.addedNodes, ...mutation.removedNodes].some(containsStopControl);
                }
                if (mutation.attributeName === 'data-testid') {
                    return mutation.oldValue === GrokAdapter.STOP_TEST_ID
                        || mutation.target.matches(GrokAdapter.STOP_BUTTON_SELECTOR);
                }
                return mutation.oldValue === GrokAdapter.LEGACY_STOP_PATH
                    || mutation.target.matches(GrokAdapter.LEGACY_STOP_SELECTOR);
            });
            if (changed) onChange();
        });
        observer.observe(document.body, {
            childList: true, subtree: true, attributes: true,
            attributeFilter: ['data-testid', 'd'], attributeOldValue: true
        });
        return () => observer.disconnect();
    }
    
}
