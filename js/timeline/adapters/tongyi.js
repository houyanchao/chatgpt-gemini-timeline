/**
 * Tongyi (通义千问) Adapter
 * 
 * Supports: qianwen.com
 * Features: 使用 class 前缀识别用户消息和文本内容
 */

class TongyiAdapter extends SiteAdapter {
    constructor() {
        super();
    }

    async matches(url) {
        return matchesPlatform(url, 'tongyi');
    }

    getUserMessageSelector() {
        // 基于 class 前缀 "questionItem" 识别用户消息容器
        return '[class*="questionItem"]';
    }

    generateTurnId(element, index) {
        const msgId = element.getAttribute('data-msgid');
        if (msgId) return `tongyi-${msgId}`;
        return `tongyi-${index}`;
    }

    extractIndexFromTurnId(turnId) {
        if (!turnId) return null;
        if (turnId.startsWith('tongyi-')) {
            const part = turnId.substring(7);
            const parsed = parseInt(part, 10);
            return (String(parsed) === part) ? parsed : part;
        }
        return null;
    }

    generateTurnIdFromIndex(identifier) {
        return `tongyi-${identifier}`;
    }

    findMarkerByStoredIndex(storedKey, markers, markerMap) {
        if (storedKey === null || storedKey === undefined) return null;
        const turnId = `tongyi-${storedKey}`;
        const marker = markerMap?.get(turnId);
        if (marker) return marker;
        if (typeof storedKey === 'number' && storedKey >= 0 && storedKey < markers.length) {
            return markers[storedKey];
        }
        return null;
    }

    extractText(element) {
        // 文本在 bubble-- 开头的 class 中
        const bubble = element.querySelector('[class*="bubble"]');
        const text = (bubble?.textContent || element.textContent || '').trim();
        return text || '[图片或文件]';
    }
    
    getTimeLabelTarget(element) {
        return element.querySelector('[class*="bubble"]') || element;
    }

    isConversationRoute(pathname) {
        // 通义千问对话 URL:
        // 对话: /chat/{id}
        // 分享: /share?shareId={id}
        return pathname.startsWith('/chat/') || 
               (pathname.startsWith('/share') && location.search.includes('shareId='));
    }

    extractConversationId(pathname) {
        try {
            // 对话 URL: /chat/{id}
            if (pathname.startsWith('/chat/')) {
                const id = pathname.replace('/chat/', '').split('/')[0];
                if (id) return id;
            }
            // 分享 URL: /share?shareId={id}
            if (pathname.startsWith('/share')) {
                const params = new URLSearchParams(location.search);
                return params.get('shareId');
            }
            return null;
        } catch {
            return null;
        }
    }

    findConversationContainer(firstMessage) {
        // 查找对话容器 - 使用 LCA（最近共同祖先）算法
        return ContainerFinder.findConversationContainer(firstMessage, {
            messageSelector: this.getUserMessageSelector()
        });
    }

    getTimeLabelPosition() {
        return { top: '0px', right: '0px', paddingTop: '4px' };
    }

    getTimelinePosition() {
        // 通义千问位置配置
        return {
            top: '120px',       // 避开顶部导航栏
            right: '22px',     // 右侧边距
            bottom: '120px',    // 避开底部输入框
        };
    }
    
    getStarChatButtonTarget() {
        const shareLink = document.querySelector('use[*|href="#qwpcicon-transmission"]') ||
            document.querySelector('[data-icon-type="qwpcicon-transmission"]');
        if (shareLink) {
            const button = shareLink.closest('button');
            return button;
        }
        return null;
    }
    
    getDefaultChatTheme() {
        // 从 text-primary text-title-attachment 元素中获取对话标题
        try {
            const titleElement = document.querySelector('.text-primary.text-title-attachment');
            if (titleElement) {
                const title = titleElement.textContent?.trim() || '';
                return title;
            }
            return '';
        } catch {
            return '';
        }
    }
    
    /**
     * 检测 AI 是否正在生成回答
     * 通义千问: 当存在 class 包含 "stop-" 的元素时，表示正在生成
     * @returns {boolean}
     */
    isAIGenerating() {
        const stopElement = document.querySelector('[class*="stop-"]');
        return !!stopElement;
    }
    
}
