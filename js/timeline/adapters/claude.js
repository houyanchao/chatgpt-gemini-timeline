/**
 * Claude Adapter
 * 
 * Supports: claude.ai/chat/{conversation_id}
 * 用户消息选择器: [data-test-render-count] 元素（包含 [data-testid="user-message"] 的）
 * 文本位置: p 标签内
 */

class ClaudeAdapter extends SiteAdapter {
    constructor() {
        super();
    }

    async matches(url) {
        return matchesPlatform(url, 'claude');
    }

    getUserMessageSelector() {
        // 选中包含 [data-testid="user-message"] 的最近 [data-test-render-count] 祖先元素
        return '[data-test-render-count]:has([data-testid="user-message"])';
    }

    generateTurnId(element, index) {
        return `claude-${index}`;
    }

    extractText(element) {
        // 从 p 标签中提取文本内容
        const pElement = element.querySelector('p');
        const text = (pElement?.textContent || element.textContent || '').trim();
        return text || '[图片或文件]';
    }
    
    /**
     * 获取时间标签的渲染目标元素
     * Claude: 使用 p 标签
     */
    getTimeLabelTarget(element) {
        const pElement = element.querySelector('p');
        return pElement || element;
    }

    isConversationRoute(pathname) {
        // Claude 对话 URL: /chat/{uuid} 或分享页面 /share/{uuid}
        // UUID 格式: 78721a47-289d-46ad-b497-a47ec784247c
        return /^\/(chat|share)\/[a-f0-9-]+$/i.test(pathname);
    }

    extractConversationId(pathname) {
        try {
            // 从 /chat/{uuid} 或 /share/{uuid} 提取对话 ID
            const match = pathname.match(/^\/(chat|share)\/([a-f0-9-]+)$/i);
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
        // Claude 位置配置
        return {
            top: '120px',       // 避开顶部导航栏
            right: '22px',      // 右侧边距
            bottom: '120px',    // 避开底部输入框
        };
    }
    
    getStarChatButtonTarget() {
        // 收藏按钮插入到 chat-actions 的左边
        return document.querySelector('[data-testid="chat-actions"]');
    }
    
    getDefaultChatTheme() {
        // Claude 使用页面标题作为默认主题，并过滤尾部的 " - Claude"
        const title = document.title || '';
        return title.replace(/\s*[-–]\s*Claude\s*$/i, '').trim();
    }
    
    /**
     * 检测是否应该隐藏时间轴
     * @returns {boolean}
     */
    shouldHideTimeline() {
        return false; // 默认不隐藏
    }
    
    /**
     * 检测 AI 是否正在生成回答
     * Claude: 当存在停止按钮的 SVG path（圆形停止图标）时，表示正在生成
     * @returns {boolean}
     */
    isAIGenerating() {
        const stopPath = document.querySelector('path[d="M128,20A108,108,0,1,0,236,128,108.12,108.12,0,0,0,128,20Zm0,192a84,84,0,1,1,84-84A84.09,84.09,0,0,1,128,212Zm40-112v56a12,12,0,0,1-12,12H100a12,12,0,0,1-12-12V100a12,12,0,0,1,12-12h56A12,12,0,0,1,168,100Z"]');
        return !!stopPath;
    }
}
