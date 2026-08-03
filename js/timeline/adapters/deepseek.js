/**
 * DeepSeek Adapter
 * 
 * Supports: chat.deepseek.com, chat.deepseek.com/share/*
 * Features: 通过第一个 .ds-message 的父元素 class 识别用户消息容器
 */

class DeepSeekAdapter extends SiteAdapter {
    constructor() {
        super();
        this._userMessageParentClass = null; // 动态检测的用户消息父容器 class
    }

    async matches(url) {
        return matchesPlatform(url, 'deepseek');
    }

    getUserMessageSelector() {
        /**
         * 动态检测用户消息父容器的 class
         * 
         * DeepSeek 中每条消息（.ds-message）被包裹在一个带有动态哈希 class 的父容器中，
         * 用户消息和 AI 回复的父容器 class 不同。
         * 第一个 .ds-message 一定是用户消息，通过其父元素的 class 来识别所有用户消息。
         */
        if (!this._userMessageParentClass) {
            const firstMessage = document.querySelector('.ds-message');
            if (firstMessage?.parentElement) {
                const parentClass = firstMessage.parentElement.classList[0];
                if (parentClass) {
                    this._userMessageParentClass = parentClass;
                }
            }
        }
        
        if (this._userMessageParentClass) {
            return `.${this._userMessageParentClass} > .ds-message`;
        }
        
        // 备用：如果检测失败，返回所有 ds-message（会包含 AI 回复，但至少能工作）
        return '.ds-message';
    }

    getAssistantMessageSelector() {
        return '.ds-message:has(.ds-assistant-message-main-content)';
    }

    getConflictingTimelineSelectors() {
        return ['[style*="--scroll-nav-page-padding"]'];
    }

    generateTurnId(element, index) {
        return `deepseek-${index}`;
    }

    extractText(element) {
        // 从第一个子 div 提取文本
        const firstDiv = element.querySelector('div');
        const text = (firstDiv?.textContent || '').trim();
        return text || '[图片或文件]';
    }
    
    getTimeLabelTarget(element) {
        return element.querySelector('div') || element;
    }

    isConversationRoute(pathname) {
        // DeepSeek 对话 URL: /a/chat/s/{id} 或分享页面 /share/{id}
        return pathname.includes('/a/chat/s/') || pathname.includes('/share/');
    }

    extractConversationId(pathname) {
        try {
            // 从 /a/chat/s/fb39afdf-... 或 /share/xxx 提取对话 ID
            const chatMatch = pathname.match(/\/a\/chat\/s\/([^\/]+)/);
            if (chatMatch) return chatMatch[1];
            
            const shareMatch = pathname.match(/\/share\/([^\/]+)/);
            if (shareMatch) return shareMatch[1];
            
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
        // DeepSeek 位置配置
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
        // 相对于 .ds-message 元素定位
        return {
            top: '-18px',
            right: '15px'
        };
    }
    
    getStarChatButtonTarget() {
        // DeepSeek: 通过 SVG path 查找图标，然后找父容器
        // 这个图标通常在顶部工具栏中（分享按钮）
        // 只匹配 path 的前几个字符（更稳定，不依赖完整 SVG 路径）
        // 注意：页面可能有多个匹配的 path，querySelector 会自动返回第一个（通常就是顶部工具栏的）
        const path = document.querySelector('path[d^="M15.7484 11.1004"]');
        if (!path) return null;
        
        // 往上找到 .ds-icon-button 按钮容器
        const iconButton = path.closest('.ds-icon-button');
        return iconButton; // 收藏按钮将插入到这个按钮的左边
    }
    
    getDefaultChatTheme() {
        // DeepSeek 使用页面标题作为默认主题，并过滤尾部的 " - DeepSeek"
        const title = document.title || '';
        return title.replace(/\s*-\s*DeepSeek\s*$/i, '').trim();
    }
    
    /**
     * 检测 AI 是否正在生成回答
     * DeepSeek: 以下情况表示正在生成：
     * 1. 存在停止按钮的 SVG path
     * 2. 存在 ds-loading 元素（加载动画）
     * @returns {boolean}
     */
    isAIGenerating() {
        // 检测停止按钮
        const stopPath = document.querySelector('path[d="M2 4.88C2 3.68009 2 3.08013 2.30557 2.65954C2.40426 2.52371 2.52371 2.40426 2.65954 2.30557C3.08013 2 3.68009 2 4.88 2H11.12C12.3199 2 12.9199 2 13.3405 2.30557C13.4763 2.40426 13.5957 2.52371 13.6944 2.65954C14 3.08013 14 3.68009 14 4.88V11.12C14 12.3199 14 12.9199 13.6944 13.3405C13.5957 13.4763 13.4763 13.5957 13.3405 13.6944C12.9199 14 12.3199 14 11.12 14H4.88C3.68009 14 3.08013 14 2.65954 13.6944C2.52371 13.5957 2.40426 13.4763 2.30557 13.3405C2 12.9199 2 12.3199 2 11.12V4.88Z"]');
        // 检测加载动画
        const loadingEl = document.querySelector('.ds-loading');
        return !!stopPath || !!loadingEl;
    }
    
}
