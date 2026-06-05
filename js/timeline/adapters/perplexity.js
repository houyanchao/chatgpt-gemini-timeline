/**
 * Perplexity Adapter
 * 
 * Supports: 
 *   - perplexity.ai/search/xxx (搜索对话)
 *   - perplexity.ai/thread/xxx (对话线程)
 * Features: 用户消息包含在 span.select-text 中
 */

class PerplexityAdapter extends SiteAdapter {
    constructor() {
        super();
    }

    async matches(url) {
        return matchesPlatform(url, 'perplexity');
    }

    getUserMessageSelector() {
        // 用户消息：包含 span.select-text 的容器
        // Perplexity 的用户消息文本在 span.select-text 中
        return 'span.select-text';
    }

    generateTurnId(element, index) {
        return `perplexity-${index}`;
    }

    extractText(element) {
        // 直接从 span.select-text 提取文本
        const text = (element.textContent || '').trim();
        return text || '[图片或文件]';
    }

    isConversationRoute(pathname) {
        // Perplexity 对话 URL: /search/xxx 或 /thread/xxx
        return pathname.includes('/search/') || pathname.includes('/thread/');
    }

    extractConversationId(pathname) {
        try {
            // 提取对话 ID: /search/xxx 或 /thread/xxx
            const match = pathname.match(/\/(search|thread)\/([^\/\?]+)/);
            if (match) return match[2];
            
            return null;
        } catch {
            return null;
        }
    }

    findConversationContainer(firstMessage) {
        /**
         * 查找对话容器
         * 使用 LCA（最近共同祖先）算法查找所有对话记录的最近父容器
         */
        return ContainerFinder.findConversationContainer(firstMessage, {
            messageSelector: this.getUserMessageSelector()
        });
    }

    getTimelinePosition() {
        // Perplexity 时间轴位置配置
        return {
            top: '120px',
            right: '22px',
            bottom: '120px',
        };
    }
    
    getStarChatButtonTarget() {
        // Perplexity 暂不支持收藏按钮位置
        return null;
    }
    
    getDefaultChatTheme() {
        // Perplexity 使用页面标题作为默认主题，去掉后缀
        const title = document.title || '';
        return title.replace(/\s*-\s*Perplexity\s*$/i, '').trim();
    }
    
    /**
     * 检测 AI 是否正在生成回答
     * Perplexity: 当存在 aria-label="Stop" 的元素时，表示正在生成
     * @returns {boolean}
     */
    isAIGenerating() {
        const stopBtn = document.querySelector('[aria-label="Stop"]');
        return !!stopBtn;
    }
}

