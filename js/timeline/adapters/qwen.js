/**
 * Qwen International (千问国际版) Adapter
 *
 * Supports: chat.qwen.ai
 *
 * DOM 结构：
 *   .qwen-chat-message-user         — 用户消息容器（id 含 uuid）
 *   .user-message-content           — 用户消息文本
 *   #chat-message-container         — 对话消息容器
 *   #chat-messages-scroll-container — 滚动容器
 *   button.stop-button              — AI 生成中的停止按钮
 *   #qwen-chat-header-right         — 标题栏右侧操作区
 */

class QwenAdapter extends SiteAdapter {
    constructor() {
        super();
    }

    async matches(url) {
        return matchesPlatform(url, 'qwen');
    }

    getUserMessageSelector() {
        return '.qwen-chat-message-user';
    }

    generateTurnId(element, index) {
        const id = element.id;
        if (id && id !== 'qwen-chat-message-user-undefined' && id.length > 24) {
            return `qwen-${id}`;
        }
        return `qwen-${index}`;
    }

    extractIndexFromTurnId(turnId) {
        if (!turnId) return null;
        if (turnId.startsWith('qwen-')) {
            const part = turnId.substring(5);
            const parsed = parseInt(part, 10);
            return (String(parsed) === part) ? parsed : part;
        }
        return null;
    }

    generateTurnIdFromIndex(identifier) {
        return `qwen-${identifier}`;
    }

    findMarkerByStoredIndex(storedKey, markers, markerMap) {
        if (storedKey === null || storedKey === undefined) return null;
        const turnId = `qwen-${storedKey}`;
        const marker = markerMap?.get(turnId);
        if (marker) return marker;
        if (typeof storedKey === 'number' && storedKey >= 0 && storedKey < markers.length) {
            return markers[storedKey];
        }
        return null;
    }

    extractText(element) {
        const content = element.querySelector('.user-message-content');
        const text = (content?.textContent || element.textContent || '').trim();
        return text || '[图片或文件]';
    }

    getTimeLabelTarget(element) {
        return element.querySelector('.chat-user-message') || element;
    }

    isConversationRoute(pathname) {
        return pathname.startsWith('/c/');
    }

    extractConversationId(pathname) {
        if (pathname.startsWith('/c/')) {
            return pathname.replace('/c/', '').split('/')[0] || null;
        }
        return null;
    }

    findConversationContainer(firstMessage) {
        const container = document.querySelector('#chat-message-container');
        if (container) return container;
        return ContainerFinder.findConversationContainer(firstMessage, {
            messageSelector: this.getUserMessageSelector()
        });
    }

    getTimeLabelPosition() {
        return { top: '0px', right: '30px', paddingTop: '18px' };
    }

    getTimelinePosition() {
        return {
            top: '120px',
            right: '22px',
            bottom: '120px',
        };
    }

    getStarChatButtonTarget() {
        const headerRight = document.querySelector('#qwen-chat-header-right');
        if (headerRight) {
            const modal = headerRight.querySelector('.chat-extension-modal');
            if (modal) return modal;
        }
        return null;
    }

    getDefaultChatTheme() {
        try {
            const active = document.querySelector('.chat-item-drag-active .chat-item-drag-link-content-tip-text');
            if (active?.textContent?.trim()) return active.textContent.trim();
            return '';
        } catch { return ''; }
    }

    isAIGenerating() {
        return !!document.querySelector('button.stop-button');
    }
}
