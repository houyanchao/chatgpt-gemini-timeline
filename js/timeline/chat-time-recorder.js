/**
 * ChatTimeRecorder - 提问时间记录器
 * 
 * 完全独立的模块，负责：
 * 1. 监听 ai:stateChange 事件（由 AIStateMonitor 派发）
 * 2. AI 开始生成时：检测新增节点并记录时间
 * 3. AI 生成结束时：兜底渲染时间标签
 * 
 * 与 TimelineManager 解耦，通过 AIStateMonitor 事件驱动
 * 
 * 简化设计：不使用内存缓存，每次直接从 storage 读取
 */
class ChatTimeRecorder {
    constructor() {
        // 状态
        this.enabled = false;
        this._pendingRecord = null;
        this._labelVisible = true;    // 时间标签是否显示（默认显示）
        
        // _renderTimeLabels 并发控制：避免短时间多次调用造成重复 storage 读
        this._renderInFlight = false;
        this._renderQueued = false;
        this._platformFeatures = {};
        
        // 事件处理函数（绑定 this）
        this._boundOnAIStateChange = this._onAIStateChange.bind(this);
    }

    /**
     * 获取适配器
     * @returns {Object|null}
     */
    _getAdapter() {
        const adapter = window.timelineManager?.adapter || null;
        if (adapter && typeof adapter.getUserMessageSelector !== 'function') {
            return null;
        }
        return adapter;
    }

    /**
     * 获取用户消息元素列表
     * @param {Object} adapter
     * @returns {NodeList|Array}
     */
    _getUserTurnElements(adapter) {
        if (!adapter) return [];
        const selector = adapter.getUserMessageSelector();
        if (!selector) return [];
        const container = window.timelineManager?.conversationContainer || document;
        return container.querySelectorAll(selector);
    }

    /**
     * 获取平台特性
     * @returns {Object}
     */
    _getPlatformFeatures() {
        return this._platformFeatures || {};
    }

    /**
     * 初始化，设置事件监听
     */
    async init() {
        // 预取并缓存当前平台 features（getCurrentPlatform 现为异步）
        this._platformFeatures = (await getCurrentPlatform())?.features || {};

        // 检查当前平台是否启用 chatTimes 功能
        const features = this._getPlatformFeatures();
        this.enabled = features?.chatTimes === true;
        
        if (!this.enabled) {
            return;
        }
        
        const conversationKey = this.getConversationKey();
        if (!conversationKey) return;
        
        try {
            // 读取时间标签显示设置（默认开启）
            const result = await chrome.storage.local.get('chatTimeLabelEnabled');
            this._labelVisible = result.chatTimeLabelEnabled !== false;
            
            // 更新 lastVisit
            await ChatTimeStorageManager.updateLastVisit(conversationKey);
            
            // useStableNodeId=true 的平台，清理临时 ID（如 gemini-0）
            if (features?.useStableNodeId === true) {
                await ChatTimeStorageManager.cleanupTempIds(conversationKey);
            }
        } catch (e) {
            // 上下文失效时静默处理
            if (!e.message?.includes('Extension context invalidated')) {
                console.error('[ChatTimeRecorder] Failed to update lastVisit:', e);
            }
        }
        
        // 监听 AI 状态变化（由 AIStateMonitor 派发）
        window.addEventListener('ai:stateChange', this._boundOnAIStateChange);
        
        // 初始渲染（页面已有节点时）
        this._renderTimeLabels();
    }

    /**
     * 检查功能是否启用
     */
    isEnabled() {
        return this.enabled;
    }

    /**
     * 获取会话标识键
     * @returns {string}
     */
    getConversationKey() {
        const url = location.href;
        return url.replace(/^https?:\/\//, '').split('?')[0].split('#')[0];
    }

    /**
     * AI 状态变化事件处理（由 AIStateMonitor 派发）
     * @private
     */
    async _onAIStateChange(event) {
        if (!this.enabled) return;
        
        if (event.detail?.generating) {
            // AI 开始生成 = 用户刚发送了消息，记录新节点时间
            await this._recordNewNodeTime();
        } else {
            // AI 生成结束，兜底渲染时间标签
            // （生成过程中 DOM 可能重排/重建，导致已渲染的标签丢失）
            this._renderTimeLabels();
        }
    }

    /**
     * 记录新节点的时间（AI 开始生成时调用）
     * @private
     */
    async _recordNewNodeTime() {
        const adapter = this._getAdapter();
        if (!adapter) return;
        
        const userTurnElements = this._getUserTurnElements(adapter);
        if (!userTurnElements || userTurnElements.length === 0) return;
        
        // 检查最后一个节点是否未被记录过
        const lastIndex = userTurnElements.length - 1;
        const lastElement = userTurnElements[lastIndex];
        if (!lastElement) return;
        
        const lastNodeId = adapter.generateTurnId(lastElement, lastIndex);
        
        // 从 storage 读取判断是否已记录
        const conversationKey = this.getConversationKey();
        if (!conversationKey) return;
        
        try {
            const data = await ChatTimeStorageManager.getByConversation(conversationKey);
            const recordedNodes = data.nodes || {};
            
            if (recordedNodes[String(lastNodeId)]) {
                // 节点已被记录过，只渲染
                this._renderTimeLabels();
                return;
            }
        } catch (e) {
            if (!e.message?.includes('Extension context invalidated')) {
                console.error('[ChatTimeRecorder] Failed to check recorded nodes:', e);
            }
            return;
        }
        
        // 判断是否为新对话（只有一个节点）
        const isNewConversation = (userTurnElements.length === 1);
        
        // 检查平台是否使用稳定的节点 ID
        const features = this._getPlatformFeatures();
        const usesStableId = features?.useStableNodeId === true;
        const isTempId = lastNodeId.endsWith(`-${lastIndex}`);
        
        // 直接用当前 ID（可能是临时 ID）记录时间
        const timestamp = Date.now();
        const newNode = { nodeId: lastNodeId, index: lastIndex };
        this._recordNodes([newNode], timestamp, isNewConversation);
        
        if (usesStableId && isTempId) {
            // 使用稳定 ID 的平台，但还没有真正的 ID
            // 保存待处理记录，等待 ID 变化后迁移
            this._pendingRecord = {
                index: lastIndex,
                tempId: lastNodeId
            };
            // 设置轮询检查 ID 变化
            this._pollForRealId(adapter, lastIndex);
        }
    }

    /**
     * 轮询检查真实 ID（用于 Gemini 等平台的延迟 ID 分配）
     * @private
     */
    _pollForRealId(adapter, expectedIndex, retryCount = 0) {
        if (!this._pendingRecord || retryCount > 10) {
            this._pendingRecord = null;
            return;
        }
        
        setTimeout(() => {
            if (!this._pendingRecord) return;
            
            const userTurnElements = this._getUserTurnElements(adapter);
            const lastElement = userTurnElements?.[expectedIndex];
            if (!lastElement) {
                this._pendingRecord = null;
                return;
            }
            
            const nodeId = adapter.generateTurnId(lastElement, expectedIndex);
            const hasRealId = !nodeId.endsWith(`-${expectedIndex}`);
            
            if (hasRealId) {
                // 获取到真正的 ID，迁移数据
                const pending = this._pendingRecord;
                this._migrateNodeId(pending.tempId, nodeId);
                this._pendingRecord = null;
            } else {
                // 继续轮询
                this._pollForRealId(adapter, expectedIndex, retryCount + 1);
            }
        }, 500);
    }
    
    /**
     * 迁移节点 ID（从临时 ID 迁移到真实 ID）
     * @private
     */
    async _migrateNodeId(tempId, realId) {
        const conversationKey = this.getConversationKey();
        if (!conversationKey) return;
        
        try {
            const migrated = await ChatTimeStorageManager.migrateNodeId(conversationKey, tempId, realId);
            if (migrated) {
                // 重新渲染时间标签
                this._renderTimeLabels();
            }
        } catch (e) {
            if (!e.message?.includes('Extension context invalidated')) {
                console.error('[ChatTimeRecorder] Failed to migrate node ID:', e);
            }
        }
    }

    /**
     * 记录节点时间
     * @private
     */
    async _recordNodes(newNodes, customTimestamp, isNewConversation = false) {
        if (!this.enabled || !newNodes || newNodes.length === 0) return;
        
        const conversationKey = this.getConversationKey();
        if (!conversationKey) return;
        
        try {
            // 新对话时，先设置 createTime
            if (isNewConversation) {
                await ChatTimeStorageManager.setCreateTime(conversationKey);
            }
            
            const timestamp = customTimestamp || Date.now();
            const nodesToRecord = newNodes.map(n => ({ nodeId: String(n.nodeId), timestamp }));
            
            if (nodesToRecord.length === 0) return;
            
            // batchSetNodeTimes 内部会跳过已存在的节点
            const addedCount = await ChatTimeStorageManager.batchSetNodeTimes(conversationKey, nodesToRecord);
            if (addedCount > 0) {
                // 立即渲染时间标签
                this._renderTimeLabels();
            }
        } catch (e) {
            if (!e.message?.includes('Extension context invalidated')) {
                console.error('[ChatTimeRecorder] Failed to record node times:', e);
            }
        }
    }

    /**
     * 渲染所有节点的时间标签
     * 
     * 使用 data-ait-time 属性 + CSS ::before 伪元素方案：
     * - 不插入 DOM 节点，避免干扰平台原有 DOM 结构
     * - 通过 CSS 变量传递位置配置
     *
     * 并发控制：MutationObserver 抖动可能在短时间内多次触发本方法，
     * 通过 in-flight + 单 trailing 回放，把 N 次并发调用合并为最多 2 次 storage 读。
     * @private
     */
    async _renderTimeLabels() {
        if (!this.enabled || !this._labelVisible) return;
        
        // 已有渲染在执行 → 标记为「需要再跑一次」，让那个执行结束后回放
        if (this._renderInFlight) {
            this._renderQueued = true;
            return;
        }
        
        this._renderInFlight = true;
        try {
            do {
                this._renderQueued = false;
                await this._doRenderTimeLabels();
            } while (this._renderQueued);
        } finally {
            this._renderInFlight = false;
        }
    }
    
    /**
     * 实际的时间标签渲染逻辑（被 _renderTimeLabels 通过去重包装调用）
     * @private
     */
    async _doRenderTimeLabels() {
        if (!this.enabled || !this._labelVisible) return;
        
        const adapter = this._getAdapter();
        if (!adapter) return;
        
        const userTurnElements = this._getUserTurnElements(adapter);
        if (!userTurnElements || userTurnElements.length === 0) return;
        
        // 从 storage 读取时间数据
        const conversationKey = this.getConversationKey();
        if (!conversationKey) return;
        
        let nodeTimestamps = {};
        try {
            const data = await ChatTimeStorageManager.getByConversation(conversationKey);
            nodeTimestamps = data.nodes || {};
        } catch (e) {
            if (!e.message?.includes('Extension context invalidated')) {
                console.error('[ChatTimeRecorder] Failed to load node times:', e);
            }
            return;
        }
        
        // 获取平台自定义位置（所有节点位置一致，只需读取一次）
        const position = adapter.getTimeLabelPosition();
        
        userTurnElements.forEach((element, index) => {
            const nodeId = adapter.generateTurnId(element, index);
            const timestamp = nodeTimestamps[String(nodeId)];
            
            if (!timestamp) return;
            
            const formattedTime = this.formatNodeTime(timestamp);
            try {
                const marker = window.timelineManager?.markerMap?.get?.(String(nodeId));
                if (marker) marker.timeLabel = formattedTime;
            } catch {}
            
            // 获取时间标签的实际渲染目标元素
            const target = adapter.getTimeLabelTarget(element);
            if (!target) return;
            
            if (position.paddingTop) {
                target.style.paddingTop = position.paddingTop;
            }
            
            // 检查是否已有时间标签且内容相同（避免不必要的 DOM 操作）
            if (target.getAttribute('data-ait-time') === formattedTime) return;
            
            // 确保 target 有相对定位（::before 相对于 target 定位）
            const computedStyle = window.getComputedStyle(target);
            if (computedStyle.position === 'static') {
                target.style.position = 'relative';
            }
            
            // 设置时间数据属性（CSS ::before 通过 attr() 读取内容）
            target.setAttribute('data-ait-time', formattedTime);
            
            // 通过 CSS 变量传递位置配置
            if (position.top) target.style.setProperty('--ait-time-top', position.top);
            if (position.right) target.style.setProperty('--ait-time-right', position.right);
            if (position.left) target.style.setProperty('--ait-time-left', position.left);
            if (position.bottom) target.style.setProperty('--ait-time-bottom', position.bottom);
        });
    }

    /**
     * 格式化时间显示
     * @param {number} timestamp
     * @returns {string}
     */
    formatNodeTime(timestamp) {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        const now = new Date();
        const isToday = date.toDateString() === now.toDateString();
        const isThisYear = date.getFullYear() === now.getFullYear();
        
        if (isToday) {
            return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        }
        
        if (isThisYear) {
            return date.toLocaleDateString('zh-CN', { 
                month: 'short', 
                day: 'numeric', 
                hour: '2-digit', 
                minute: '2-digit' 
            });
        }
        
        return date.toLocaleDateString('zh-CN', { 
            year: 'numeric',
            month: 'short', 
            day: 'numeric', 
            hour: '2-digit', 
            minute: '2-digit' 
        });
    }

    /**
     * 重置状态（会话切换时调用）
     */
    async reset() {
        this._pendingRecord = null;
        
        // 更新新会话的 lastVisit
        if (this.enabled) {
            const conversationKey = this.getConversationKey();
            if (conversationKey) {
                try {
                    await ChatTimeStorageManager.updateLastVisit(conversationKey);
                } catch (e) {
                    if (!e.message?.includes('Extension context invalidated')) {
                        console.error('[ChatTimeRecorder] Failed to update lastVisit:', e);
                    }
                }
            }
        }
    }

    /**
     * 更新时间标签显示状态
     * @param {boolean} visible - 是否显示时间标签
     */
    updateLabelVisibility(visible) {
        this._labelVisible = visible;
        
        if (visible) {
            // 显示：重新渲染时间标签
            this._renderTimeLabels();
        } else {
            // 隐藏：移除所有时间标签（清除 data 属性即可，::before 自动消失）
            document.querySelectorAll('[data-ait-time]').forEach(el => {
                el.removeAttribute('data-ait-time');
            });
            try {
                window.timelineManager?.markers?.forEach(marker => {
                    marker.timeLabel = null;
                });
            } catch {}
        }
    }

    /**
     * 销毁，清理状态和事件监听
     */
    destroy() {
        // 移除事件监听
        window.removeEventListener('ai:stateChange', this._boundOnAIStateChange);
        
        // 清理状态
        this._pendingRecord = null;
        this.enabled = false;
    }
}

// 创建全局单例
window.chatTimeRecorder = null;

/**
 * 初始化 ChatTimeRecorder（由 TimelineManager 调用）
 */
function initChatTimeRecorder() {
    if (window.chatTimeRecorder) {
        window.chatTimeRecorder.destroy();
    }
    window.chatTimeRecorder = new ChatTimeRecorder();
    window.chatTimeRecorder.init();
}

/**
 * 销毁 ChatTimeRecorder（由 TimelineManager 调用）
 */
function destroyChatTimeRecorder() {
    if (window.chatTimeRecorder) {
        window.chatTimeRecorder.destroy();
        window.chatTimeRecorder = null;
    }
}

/**
 * 重置 ChatTimeRecorder（会话切换时调用）
 */
function resetChatTimeRecorder() {
    if (window.chatTimeRecorder) {
        window.chatTimeRecorder.reset();
    }
}

// 导出到全局
window.ChatTimeRecorder = ChatTimeRecorder;
window.initChatTimeRecorder = initChatTimeRecorder;
window.destroyChatTimeRecorder = destroyChatTimeRecorder;
window.resetChatTimeRecorder = resetChatTimeRecorder;
