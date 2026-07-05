/**
 * Gemini Adapter
 * 
 * Supports: 
 *   - gemini.google.com/app/xxx
 *   - gemini.google.com/share/xxx
 *   - gemini.google.com/gem/xxx/xxx
 * Features: Angular custom element, index-based ID, filters Angular comment nodes
 */

class GeminiAdapter extends SiteAdapter {
    constructor() {
        super();
    }
    
    async matches(url) {
        return matchesPlatform(url, 'gemini');
    }

    getUserMessageSelector() {
        return 'user-query';
    }

    getAssistantMessageSelector() {
        return 'model-response';
    }

    /**
     * 从 DOM 元素中提取稳定的 nodeId
     * Gemini 的虚拟滚动会隐藏/重建节点，导致数组索引不可靠
     * 使用 user-query 父元素的 id 作为稳定标识
     * 
     * ✅ 降级方案：返回 null 时，generateTurnId 会降级使用 index（数字类型）
     * @param {Element} element - user-query 元素
     * @returns {string|null} - 父元素的 id（字符串），失败返回 null
     */
    _extractNodeIdFromDom(element) {
        if (!element) return null;
        
        const parent = element.parentElement;
        const nodeId = (parent && parent.id) ? parent.id : null;
        return nodeId ? String(nodeId) : null;
    }
    
    /**
     * 生成节点的唯一标识 turnId
     * 优先使用父元素 id（稳定），回退到数组索引（兼容）
     */
    generateTurnId(element, index) {
        // 优先使用父元素 id（稳定标识），回退到数组索引
        const nodeId = this._extractNodeIdFromDom(element);
        return nodeId ? `gemini-${nodeId}` : `gemini-${index}`;
    }
    
    /**
     * 从存储的 nodeId 生成 turnId（用于收藏跳转）
     * @param {string|number} identifier - nodeId（字符串）或 index（数字）
     * @returns {string}
     */
    generateTurnIdFromIndex(identifier) {
        return `gemini-${identifier}`;
    }
    
    /**
     * 从 turnId 中提取 nodeId/index
     * @param {string} turnId - 格式为 gemini-{nodeId} 或 gemini-{index}
     * @returns {string|number|null} - nodeId（字符串）或 index（数字）
     */
    extractIndexFromTurnId(turnId) {
        if (!turnId) return null;
        if (turnId.startsWith('gemini-')) {
            const part = turnId.substring(7); // 'gemini-'.length = 7
            // 尝试解析为数字（旧数据兼容）
            const parsed = parseInt(part, 10);
            // 如果是纯数字字符串，返回数字；否则返回字符串
            return (String(parsed) === part) ? parsed : part;
        }
        return null;
    }
    
    /**
     * 根据存储的 nodeId/index 查找 marker
     * 支持新数据（nodeId 字符串）和旧数据（index 数字）
     * @param {string|number} storedKey - 存储的 nodeId 或 index
     * @param {Array} markers - markers 数组
     * @param {Map} markerMap - markerMap
     * @returns {Object|null}
     */
    findMarkerByStoredIndex(storedKey, markers, markerMap) {
        if (storedKey === null || storedKey === undefined) return null;
        
        // 1. 先尝试用 nodeId/index 构建 turnId 查找
        const turnId = `gemini-${storedKey}`;
        const marker = markerMap.get(turnId);
        if (marker) return marker;
        
        // 2. Fallback：如果是数字，尝试用数组索引（兼容旧数据）
        if (typeof storedKey === 'number' && storedKey >= 0 && storedKey < markers.length) {
            return markers[storedKey];
        }
        
        return null;
    }

    extractText(element) {
        // Extract from .query-text-line elements
        const lines = element.querySelectorAll('.query-text-line');
        const texts = Array.from(lines).map(line => {
            // Filter out Angular comment nodes and get text
            return Array.from(line.childNodes)
                .filter(node => node.nodeType === Node.TEXT_NODE)
                .map(node => node.textContent)
                .join('');
        });
        const text = texts.join(' ').replace(/\s+/g, ' ').trim();
        return text || '[图片或文件]';
    }
    
    /**
     * 获取时间标签的渲染目标元素
     * Gemini: 使用 user-query 元素本身，避免上移后被文本行容器裁剪
     */
    getTimeLabelTarget(element) {
        const oldTarget = element.querySelector('.query-text-line[data-ait-time]');
        if (oldTarget) {
            oldTarget.removeAttribute('data-ait-time');
            oldTarget.style.removeProperty('--ait-time-top');
            oldTarget.style.removeProperty('--ait-time-right');
            oldTarget.style.removeProperty('--ait-time-left');
            oldTarget.style.removeProperty('--ait-time-bottom');
        }
        return element;
    }
    
    /**
     * 获取时间标签位置配置
     * Gemini: 相对于 user-query 元素定位
     */
    getTimeLabelPosition() {
        return {
            top: '-20px',
            right: '12px'
        };
    }

    isConversationRoute(pathname) {
        // Gemini conversation URLs: /app/xxx, /share/xxx, /gem/xxx/xxx
        return pathname.includes('/app/') || pathname.includes('/share/') || pathname.includes('/gem/');
    }

    extractConversationId(pathname) {
        try {
            // Extract conversation ID from /app/xxx pattern
            const appMatch = pathname.match(/\/app\/([A-Za-z0-9_-]+)/);
            if (appMatch) return appMatch[1];
            
            // Extract conversation ID from /share/xxx pattern
            const shareMatch = pathname.match(/\/share\/([A-Za-z0-9_-]+)/);
            if (shareMatch) return shareMatch[1];
            
            // Extract conversation ID from /gem/xxx/xxx pattern
            const gemMatch = pathname.match(/\/gem\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)/);
            if (gemMatch) return `${gemMatch[1]}-${gemMatch[2]}`; // 拼接两部分作为唯一ID
            
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

    getTimelinePosition() {
        // Gemini 需要更大的边距，避开顶部工具栏
        return {
            top: '120px',      // 避开顶部导航栏
            right: '22px',    // 右侧边距
            bottom: '120px',   // 避开底部输入框
        };
    }
    
    getStarChatButtonTarget() {
        // 查找 .top-bar-actions 下的 .right-section，插入到第一个元素的左边
        const topBarActions = document.querySelector('.top-bar-actions');
        if (!topBarActions) return null;
        
        const rightSection = topBarActions.querySelector('.right-section');
        if (!rightSection) return null;
        
        // 返回 right-section 的第一个子元素，收藏按钮将插入到它前面
        return rightSection.firstElementChild;
    }
    
    getDefaultChatTheme() {
        // Gemini 使用页面标题作为默认主题（与 ChatGPT 保持一致）
        // 剔除尾部的 " - Google Gemini" 后缀
        return (document.title || '').replace(/\s*-\s*Google Gemini\s*$/, '').trim();
    }
    
    /**
     * 检测是否应该隐藏时间轴
     * Gemini: 当存在沉浸式面板或生成式UI框架时隐藏
     * @returns {boolean}
     */
    shouldHideTimeline() {
        return document.querySelector('.ng-trigger-immersivePanelTransitions') !== null ||
               document.querySelector('generative-ui-frame') !== null ||
               this._isElementVisible(document.querySelector('context-sidebar'));
    }

    _isElementVisible(element) {
        if (!element) return false;
        if (element.hidden || element.getAttribute('aria-hidden') === 'true') return false;
        const style = window.getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    }

    getTimelineVisibilitySelectors() {
        return [
            '.ng-trigger-immersivePanelTransitions',
            'generative-ui-frame',
            'context-sidebar'
        ];
    }

    getTimelineVisibilityAttributeSelectors() {
        return [
            '.ng-trigger-immersivePanelTransitions',
            'context-sidebar'
        ];
    }
    
    /**
     * 检测 AI 是否正在生成回答
     * Gemini: 当 .send-button 元素存在且包含 stop class 时，表示正在生成
     * @returns {boolean}
     */
    isAIGenerating() {
        const sendButton = document.querySelector('.send-button');
        // ✅ 必须返回 boolean，找不到按钮视为 false（未生成），而不是 null（未实现）
        return !!(sendButton && sendButton.classList.contains('stop'));
    }
    
}
