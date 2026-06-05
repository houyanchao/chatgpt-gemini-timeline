/**
 * Grok Adapter
 * 
 * Supports: 
 *   - grok.com/c/xxx (普通对话)
 *   - grok.com/share/xxx (分享页面)
 * Features: Uses element id attribute, KaTeX formula support
 */

class GrokAdapter extends SiteAdapter {
    constructor() {
        super();
    }

    async matches(url) {
        return matchesPlatform(url, 'grok');
    }

    getUserMessageSelector() {
        // 用户消息：有 items-end class 且有 id 属性的元素
        return '.items-end[id]';
    }

    generateTurnId(element, index) {
        // 使用 index 作为唯一标识，与其他 AI 平台保持一致
        return `grok-${index}`;
    }

    extractText(element) {
        // 从 p.break-words 元素中提取文本内容
        const textElement = element.querySelector('p.break-words');
        const text = (textElement?.textContent || '').trim();
        return text || '[图片或文件]';
    }
    
    getTimeLabelTarget(element) {
        return element.querySelector('p.break-words') || element;
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

    findConversationContainer(firstMessage) {
        /**
         * 查找对话容器
         * 
         * 使用 LCA（最近共同祖先）算法查找所有对话记录的最近父容器。
         * 传递 messageSelector 参数，让 ContainerFinder 能够：
         * 1. 查询所有用户消息元素
         * 2. 找到它们的最近共同祖先
         * 3. 确保容器是直接包裹所有对话的最小容器
         * 
         * 优势：比传统的向上遍历更精确，避免找到过于外层的容器
         */
        
        // ✅ 隐藏 Grok 自带的时间轴元素，避免与本插件冲突
        this.hideNativeTimeline();
        
        return ContainerFinder.findConversationContainer(firstMessage, {
            messageSelector: this.getUserMessageSelector()
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
        // 返回"更多"按钮，收藏按钮将插入到它前面
        return document.querySelector('button[aria-label="更多"]');
    }
    
    getDefaultChatTheme() {
        // Grok 使用页面标题作为默认主题，去掉后缀 " - Grok"
        const title = document.title || '';
        return title.replace(/\s*-\s*Grok\s*$/i, '').trim();
    }
    
    /**
     * 检测 AI 是否正在生成回答
     * Grok: 当存在停止按钮的 SVG path 时，表示正在生成
     * @returns {boolean}
     */
    isAIGenerating() {
        const stopPath = document.querySelector('path[d="M4 9.2v5.6c0 1.116 0 1.673.11 2.134a4 4 0 0 0 2.956 2.956c.46.11 1.018.11 2.134.11h5.6c1.116 0 1.673 0 2.134-.11a4 4 0 0 0 2.956-2.956c.11-.46.11-1.018.11-2.134V9.2c0-1.116 0-1.673-.11-2.134a4 4 0 0 0-2.956-2.955C16.474 4 15.916 4 14.8 4H9.2c-1.116 0-1.673 0-2.134.11a4 4 0 0 0-2.955 2.956C4 7.526 4 8.084 4 9.2Z"]');
        return !!stopPath;
    }
    
}
