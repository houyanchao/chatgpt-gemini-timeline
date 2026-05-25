/**
 * ChatGPT Adapter
 * 
 * Supports: 
 *   - chatgpt.com/c/xxx (普通对话)
 *   - chatgpt.com/g/xxx/c/xxx (GPT 对话)
 *   - chatgpt.com/share/e/xxx (分享页面)
 *   - chat.openai.com (旧域名)
 */

class ChatGPTAdapter extends SiteAdapter {
    constructor() {
        super();
    }

    matches(url) {
        return matchesPlatform(url, 'chatgpt');
    }

    getUserMessageSelector() {
        return '[data-turn="user"][data-turn-id]';
    }

    /**
     * 从 DOM 元素中提取 nodeId
     * 直接从元素的 data-turn-id 属性读取 ID
     * 
     * ✅ 降级方案：返回 null 时，generateTurnId 会降级使用 index（数字类型）
     * @param {Element} element - 用户消息元素
     * @returns {string|null} - nodeId（字符串），失败返回 null
     */
    _extractNodeIdFromDom(element) {
        if (!element) return null;
        
        const nodeId = element.getAttribute('data-turn-id') || null;
        return nodeId ? String(nodeId) : null;
    }

    /**
     * 生成节点的唯一标识 turnId
     * 优先使用 data-turn-id（稳定），回退到数组索引（兼容）
     */
    generateTurnId(element, index) {
        // 优先使用 data-turn-id（稳定标识），回退到数组索引
        const nodeId = this._extractNodeIdFromDom(element);
        return nodeId ? `chatgpt-${nodeId}` : `chatgpt-${index}`;
    }
    
    /**
     * 从存储的 nodeId 生成 turnId（用于收藏跳转）
     * @param {string|number} identifier - nodeId（字符串）或 index（数字）
     * @returns {string}
     */
    generateTurnIdFromIndex(identifier) {
        return `chatgpt-${identifier}`;
    }
    
    /**
     * 从 turnId 中提取 nodeId/index
     * @param {string} turnId - 格式为 chatgpt-{nodeId} 或 chatgpt-{index}
     * @returns {string|number|null} - nodeId（字符串）或 index（数字）
     */
    extractIndexFromTurnId(turnId) {
        if (!turnId) return null;
        if (turnId.startsWith('chatgpt-')) {
            const part = turnId.substring(8); // 'chatgpt-'.length = 8
            // ✅ 尝试解析为数字（降级到 index 时的数据）
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
     * @param {Array} markers - marker 数组
     * @param {Map} markerMap - markerMap
     * @returns {Object|null} - 匹配的 marker
     */
    findMarkerByStoredIndex(storedKey, markers, markerMap) {
        if (storedKey === null || storedKey === undefined) return null;
        
        // 1. 先尝试用 nodeId/index 构建 turnId 查找
        const turnId = `chatgpt-${storedKey}`;
        const marker = markerMap.get(turnId);
        if (marker) return marker;
        
        // 2. Fallback：如果是数字，尝试用数组索引（兼容旧数据）
        if (typeof storedKey === 'number' && storedKey >= 0 && storedKey < markers.length) {
            return markers[storedKey];
        }
        
        return null;
    }

    extractText(element) {
        const textElement = element.querySelector('.whitespace-pre-wrap');
        const text = (textElement?.textContent || '').replace(/\s+/g, ' ').trim();
        return text || '[图片或文件]';
    }

    /**
     * 通过 MAIN world 的 fiber bridge 同步提取所有用户消息文本
     * 用于补充/覆盖 DOM 提取（解决虚拟滚动导致的文本丢失问题）
     *
     * 通信依赖 DOM 自定义事件在同栈完成（同步往返）：
     * 1. 注册一次性 `timeline-fiber-result` 监听
     * 2. 派发 `timeline-extract-fiber` 触发 MAIN-world 桥
     * 3. dispatchEvent 返回时 cache 已被填充
     *
     * 如果桥脚本未就绪（document_idle 未到达 / CSP 拦截 / 非 ChatGPT 域），
     * 监听不会触发，cache 为空 → 调用方自动回退到 DOM 提取。
     * 首次检测到桥不可用时打印一条 warn，便于定位「桥根本没接通」。
     * @returns {Map<string, string>} - data-turn-id → 消息文本
     */
    extractFiberTexts() {
        const cache = new Map();
        let received = false;
        const handler = (e) => {
            received = true;
            if (e.detail) {
                Object.entries(e.detail).forEach(([id, txt]) => cache.set(id, txt));
            }
        };
        document.addEventListener('timeline-fiber-result', handler, { once: true });
        document.dispatchEvent(new CustomEvent('timeline-extract-fiber'));
        if (!received) {
            // 同步往返失败 → 桥脚本不可用，移除挂起监听避免内存泄漏
            document.removeEventListener('timeline-fiber-result', handler);
            if (!ChatGPTAdapter._bridgeWarned) {
                ChatGPTAdapter._bridgeWarned = true;
                console.warn('[ChatGPTAdapter] fiber bridge unavailable, falling back to DOM extraction. Check that fiber-bridge-chatgpt.js is loaded in MAIN world.');
            }
        }
        return cache;
    }
    
    /**
     * 获取时间标签的渲染目标元素
     * ChatGPT: 使用 [data-message-id] 子元素
     */
    getTimeLabelTarget(element) {
        return element.querySelector('[data-message-id]') || null;
    }

    isConversationRoute(pathname) {
        const segs = pathname.split('/').filter(Boolean);
        
        // 检查普通对话路径: /c/{id}
        const cIndex = segs.indexOf('c');
        if (cIndex !== -1) {
            const slug = segs[cIndex + 1];
            if (typeof slug === 'string' && slug.length > 0 && /^[A-Za-z0-9_-]+$/.test(slug)) {
                return true;
            }
        }
        
        // 检查 GPT 对话路径: /g/{gpt_id}/c/{conversation_id}
        const gIndex = segs.indexOf('g');
        if (gIndex !== -1 && segs[gIndex + 2] === 'c') {
            const gptId = segs[gIndex + 1];
            const conversationId = segs[gIndex + 3];
            if (gptId && conversationId && 
                /^[A-Za-z0-9_-]+$/.test(gptId) && 
                /^[A-Za-z0-9_-]+$/.test(conversationId)) {
                return true;
            }
        }
        
        // 检查分享页面路径: /share/e/{id}
        const shareIndex = segs.indexOf('share');
        if (shareIndex !== -1 && segs[shareIndex + 1] === 'e') {
            const shareId = segs[shareIndex + 2];
            if (typeof shareId === 'string' && shareId.length > 0 && /^[A-Za-z0-9_-]+$/.test(shareId)) {
                return true;
            }
        }
        
        return false;
    }

    extractConversationId(pathname) {
        try {
            const segs = pathname.split('/').filter(Boolean);
            
            // 尝试提取 GPT 对话 ID: /g/{gpt_id}/c/{conversation_id}
            const gIndex = segs.indexOf('g');
            if (gIndex !== -1 && segs[gIndex + 2] === 'c') {
                const conversationId = segs[gIndex + 3];
                if (conversationId && /^[A-Za-z0-9_-]+$/.test(conversationId)) return conversationId;
            }
            
            // 尝试提取普通对话 ID: /c/{id}
            const cIndex = segs.indexOf('c');
            if (cIndex !== -1) {
                const slug = segs[cIndex + 1];
                if (slug && /^[A-Za-z0-9_-]+$/.test(slug)) return slug;
            }
            
            // 尝试提取分享页面 ID: /share/e/{id}
            const shareIndex = segs.indexOf('share');
            if (shareIndex !== -1 && segs[shareIndex + 1] === 'e') {
                const shareId = segs[shareIndex + 2];
                if (shareId && /^[A-Za-z0-9_-]+$/.test(shareId)) return shareId;
            }
            
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
        return ContainerFinder.findConversationContainer(firstMessage, {
            messageSelector: this.getUserMessageSelector()
        });
    }

    getTimelinePosition() {
        // ChatGPT 默认位置
        return {
            top: '120px',      // 避开顶部导航栏
            right: '22px',    // 右侧边距
            bottom: '120px',   // 避开底部输入框
        };
    }
    
    /**
     * 获取时间标签位置配置
     * ChatGPT: 底部显示
     */
    getTimeLabelPosition() {
        // 相对于消息元素定位
        return {
            top: '-16px',
            right: '10px'
        };
    }
    
    getStarChatButtonTarget() {
        // 返回分享按钮，收藏按钮将插入到它前面
        return document.querySelector('[data-testid="share-chat-button"]');
    }
    
    getDefaultChatTheme() {
        // ChatGPT 使用页面标题作为默认主题
        return document.title || '';
    }
    
    /**
     * 检测是否应该隐藏时间轴
     * ChatGPT: 当页面存在 .text-token-primary 元素时隐藏
     * @returns {boolean}
     */
    shouldHideTimeline() {
        return document.querySelector('.text-token-primary') !== null ||
               document.querySelector('[data-stage-thread-flyout="true"][data-testid="stage-thread-flyout"]') !== null;
    }

    getTimelineVisibilitySelectors() {
        return [
            '.text-token-primary',
            '[data-stage-thread-flyout="true"][data-testid="stage-thread-flyout"]'
        ];
    }
    
    /**
     * 获取滚动偏移量
     * 用户消息节点本身上方留白较多，仅需小幅补偿即可避免被顶部 UI 遮挡
     * @returns {number} - 滚动偏移量（像素）
     */
    getScrollOffset() {
        return 20;
    }
    
    /**
     * 检测 AI 是否正在生成回答
     * ChatGPT: 当 #composer-submit-button 元素的 data-testid="stop-button" 时，表示正在生成
     * @returns {boolean}
     */
    isAIGenerating() {
        const submitButton = document.getElementById('composer-submit-button');
        // ✅ 必须返回 boolean，找不到按钮视为 false（未生成），而不是 null（未实现）
        return !!(submitButton && submitButton.getAttribute('data-testid') === 'stop-button');
    }
}
