/**
 * Kimi Adapter
 * 
 * Supports: kimi.com, kimi.com/share/*
 * Features: 固定 class 名 user-content
 */

class KimiAdapter extends SiteAdapter {
    constructor() {
        super();
    }

    async matches(url) {
        return matchesPlatform(url, 'kimi');
    }

    getUserMessageSelector() {
        // Kimi 使用消息项级别的选择器，匹配包含 .user-content 的消息项
        // 这样选择器匹配的元素就是消息项本身，与其他平台一致
        return '.chat-content-item:has(.user-content)';
    }

    generateTurnId(element, index) {
        return `kimi-${index}`;
    }

    extractText(element) {
        // 从消息项中查找 .user-content 元素获取文本
        const userContent = element.querySelector('.user-content');
        const text = (userContent?.textContent || element.textContent || '').trim();
        return text || '[图片或文件]';
    }
    
    getTimeLabelTarget(element) {
        return element.querySelector('.user-content') || element;
    }

    isConversationRoute(pathname) {
        // Kimi 对话 URL: /chat/{id} 或分享页面 /share/{id}
        return pathname.includes('/chat/') || pathname.includes('/share/');
    }

    extractConversationId(pathname) {
        try {
            // 从 /chat/cuq3h25m2citjh45prb0 或 /share/xxx 提取对话 ID
            const chatMatch = pathname.match(/\/chat\/([^\/]+)/);
            if (chatMatch) return chatMatch[1];
            
            const shareMatch = pathname.match(/\/share\/([^\/]+)/);
            if (shareMatch) return shareMatch[1];
            
            return null;
        } catch {
            return null;
        }
    }

    findConversationContainer(firstMessage) {
        // 选择器现在匹配的是消息项 .chat-content-item，使用标准 LCA 算法即可
        return ContainerFinder.findConversationContainer(firstMessage, {
            messageSelector: this.getUserMessageSelector()
        });
    }

    getTimelinePosition() {
        // Kimi 位置配置
        return {
            top: '120px',       // 避开顶部导航栏
            right: '22px',     // 右侧边距
            bottom: '120px',    // 避开底部输入框
        };
    }
    
    /**
     * 获取时间标签位置配置
     */
    getTimeLabelPosition() {
        // 相对于消息元素定位
        return {
            top: '-18px',
            right: '5px'
        };
    }
    
    getStarChatButtonTarget() {
        // 返回 chat-header-actions 下的 icon 元素，收藏按钮将插入到它前面
        const headerActions = document.querySelector('.chat-header-actions');
        if (!headerActions) return null;
        return headerActions.querySelector('.icon');
    }
    
    getDefaultChatTheme() {
        // Kimi 使用页面标题作为默认主题，并过滤尾部的 " - Kimi"
        const title = document.title || '';
        return title.replace(/\s*-\s*Kimi\s*$/i, '').trim();
    }
    
    /**
     * 检测 AI 是否正在生成回答
     * Kimi: 当 .send-button-container 元素包含 stop class 时，表示正在生成
     * @returns {boolean}
     */
    isAIGenerating() {
        const sendButtonContainer = document.querySelector('.send-button-container');
        // ✅ 必须返回 boolean
        return !!(sendButtonContainer && sendButtonContainer.classList.contains('stop'));
    }
}
