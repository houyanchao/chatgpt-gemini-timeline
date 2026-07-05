/**
 * AI State Monitor - AI 输出状态监控器
 * 
 * 通过搭便车在 DOMObserverManager 的 body 订阅上，
 * 检测 AI 是否正在生成回复，状态变化时派发全局事件。
 * 
 * 解决问题：
 * - 多个模块各自用 setInterval 轮询 isAIGenerating()
 * - 导致重复检测、定时器管理复杂
 * 
 * 解决方案：
 * - 单一监控，状态变化时派发 ai:stateChange 事件
 * - 消费方通过 window.addEventListener 订阅
 * 
 * 使用示例：
 * ```javascript
 * // 启动监控（传入当前适配器）
 * AIStateMonitor.getInstance().start(adapter);
 * 
 * // 监听状态变化
 * window.addEventListener('ai:stateChange', (e) => {
 *     if (e.detail.generating) {
 *         log('AI 开始输出');
 *     } else {
 *         log('AI 输出结束');
 *     }
 * });
 * 
 * // 同步查询当前状态
 * AIStateMonitor.getInstance().isGenerating; // true / false
 * ```
 */

class AIStateMonitor {
    static _instance = null;

    static getInstance() {
        if (!AIStateMonitor._instance) {
            AIStateMonitor._instance = new AIStateMonitor();
        }
        return AIStateMonitor._instance;
    }

    constructor() {
        if (AIStateMonitor._instance) {
            throw new Error('Use AIStateMonitor.getInstance() instead');
        }
        this._generating = false;
        this._adapter = null;
        this._unsubscribe = null;
    }

    /**
     * 当前是否正在生成
     * @returns {boolean}
     */
    get isGenerating() {
        return this._generating;
    }

    /**
     * 启动监控
     * @param {Object} adapter - 平台适配器（需实现 isAIGenerating 方法）
     */
    start(adapter) {
        if (!adapter || typeof adapter.isAIGenerating !== 'function') return;
        
        // 如果已在运行，先停止
        this.stop();
        
        this._adapter = adapter;
        this._generating = false;
        
        // 搭便车在 body observer 上：停止按钮的出现/消失是 DOM 节点变化，
        // body observer 天然能捕获到，不需要额外的 setInterval
        if (window.DOMObserverManager) {
            this._unsubscribe = window.DOMObserverManager.getInstance().subscribeBody('ai-state-monitor', {
                callback: () => this._checkState(),
                filter: { hasAddedNodes: true },
                debounce: 300
            });
        }
    }

    /**
     * 停止监控
     */
    stop() {
        if (this._unsubscribe) {
            this._unsubscribe();
            this._unsubscribe = null;
        }
        
        // 如果停止时还在生成状态，派发一次结束事件
        if (this._generating) {
            this._generating = false;
            this._dispatch(false);
        }
        
        this._adapter = null;
    }

    /**
     * 检查状态并在变化时派发事件
     * @private
     */
    _checkState() {
        if (!this._adapter) return;
        
        const newState = !!this._adapter.isAIGenerating();
        
        if (newState !== this._generating) {
            this._generating = newState;
            this._dispatch(newState);
        }
    }

    /**
     * 派发状态变化事件
     * @private
     */
    _dispatch(generating) {
        try {
            window.dispatchEvent(new CustomEvent('ai:stateChange', {
                detail: { generating }
            }));
        } catch (e) {
            // 静默处理
        }
    }
}

// 暴露到全局
if (typeof window !== 'undefined') {
    window.AIStateMonitor = AIStateMonitor;
}
