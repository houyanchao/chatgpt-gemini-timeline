/**
 * DOM Observer Manager - 统一的 DOM 变化监听管理器
 * 
 * 解决问题：
 * - 多个模块各自创建 MutationObserver 监听 document.body
 * - 导致重复监听、性能浪费
 * 
 * 解决方案：
 * - 单一 Observer 监听，多个订阅者共享
 * - 统一的防抖/节流处理
 * - 按需过滤，减少无效回调
 * 
 * ===== 两种执行策略 =====
 * 
 * 1. 防抖 (debounce): DOM 停止变化后才执行
 *    - 每次变化重置计时器
 *    - 适用于：等 AI 输出完成后再处理
 *    - 例如：runner 等代码块完整后添加按钮
 * 
 * 2. 节流 (throttle): DOM 持续变化时，每隔一段时间执行一次
 *    - 保证每 N 秒至少执行一次
 *    - 适用于：AI 输出过程中也需要实时处理
 *    - 例如：formula 实时渲染公式
 * 
 * 3. 节流+防抖: 两者结合
 *    - 持续变化时每 N 秒执行一次
 *    - 变化结束后再兜底执行一次
 * 
 * 使用示例：
 * ```javascript
 * const manager = DOMObserverManager.getInstance();
 * 
 * // 示例1: 防抖模式 - 等 DOM 稳定后执行
 * manager.subscribeBody('runner', {
 *     callback: () => scanCodeBlocks(),
 *     filter: { hasAddedNodes: true },
 *     debounce: 1000  // 1秒无变化后执行
 * });
 * 
 * // 示例2: 节流模式 - 持续变化时定时执行
 * manager.subscribeBody('formula', {
 *     callback: () => scanFormulas(),
 *     filter: { hasAddedNodes: true },
 *     throttle: 2000  // 每2秒执行一次
 * });
 * 
 * // 示例3: 节流+防抖 - 实时处理 + 结束兜底
 * manager.subscribeBody('formula', {
 *     callback: () => scanFormulas(),
 *     filter: { hasAddedNodes: true },
 *     throttle: 2000,  // 持续变化时每2秒执行
 *     debounce: 2000   // 变化结束后2秒再执行一次
 * });
 * ```
 */

class DOMObserverManager {
    static _instance = null;

    /**
     * 获取单例实例
     * @returns {DOMObserverManager}
     */
    static getInstance() {
        if (!DOMObserverManager._instance) {
            DOMObserverManager._instance = new DOMObserverManager();
        }
        return DOMObserverManager._instance;
    }

    constructor() {
        // 防止直接 new
        if (DOMObserverManager._instance) {
            throw new Error('Use DOMObserverManager.getInstance() instead');
        }

        // ===== Body Observer（节点变化）=====
        this._bodySubscribers = new Map();  // id -> { callback, filter, debounce, throttle, debounceTimer, lastThrottleTime, target }
        this._bodyObserver = null;
        this._bodyObserverHasCharacterData = false;  // 当前 observer 是否监听 characterData

        // ===== Theme Observer（属性变化）=====
        this._themeSubscribers = new Map();  // id -> { callback }
        this._themeObserver = null;  // 合并监听 html + body

        // ===== Container Observers（特定容器）=====
        this._containerObservers = new Map();  // containerId -> { observer, subscribers, element }

        // ===== 批量处理优化 =====
        this._pendingMutations = [];
        this._rafId = null;

    }

    // ==================== Body Observer ====================

    /**
     * 订阅 document.body 的 DOM 变化
     * @param {string} id - 订阅者唯一标识
     * @param {Object} options - 配置选项
     * @param {Function} options.callback - 回调函数 (data: { addedNodes, removedNodes, mutations }) => void
     * @param {Object} [options.filter] - 过滤条件
     * @param {boolean} [options.filter.hasAddedNodes] - 只在有新增节点时触发
     * @param {boolean} [options.filter.hasRemovedNodes] - 只在有删除节点时触发
     * @param {boolean} [options.filter.hasCharacterData] - 只在有文本变化时触发
     * @param {string} [options.target] - CSS 选择器，只关心匹配的元素
     * @param {number} [options.debounce] - 防抖时间（毫秒）- DOM 停止变化后才执行
     * @param {number} [options.throttle] - 节流时间（毫秒）- DOM 持续变化时每隔一段时间执行
     * @param {boolean} [options.characterData] - 是否监听文本变化（默认 false）
     * @returns {Function} 取消订阅函数
     * 
     * 执行策略说明：
     * - 只设置 debounce: 等 DOM 稳定后执行（适合等输出完成后处理）
     * - 只设置 throttle: 持续变化时定时执行（适合实时处理）
     * - 同时设置: 持续变化时定时执行 + 变化结束后兜底执行
     */
    subscribeBody(id, options) {
        const { callback, filter = {}, target, debounce = 0, throttle = 0, characterData = false } = options;

        if (!callback || typeof callback !== 'function') {
            throw new Error('callback is required and must be a function');
        }

        // 如果已存在相同 id，先取消之前的订阅
        if (this._bodySubscribers.has(id)) {
            this.unsubscribeBody(id);
        }

        this._bodySubscribers.set(id, {
            callback,
            filter,
            target,
            debounce,
            throttle,
            debounceTimer: null,
            lastThrottleTime: 0,  // 上次节流执行时间
            characterData
        });

        // 确保 observer 已启动
        this._ensureBodyObserver();

        // 返回取消订阅函数
        return () => this.unsubscribeBody(id);
    }

    /**
     * 取消 body 订阅
     * @param {string} id - 订阅者标识
     */
    unsubscribeBody(id) {
        const subscriber = this._bodySubscribers.get(id);
        if (subscriber) {
            // 清理防抖定时器
            if (subscriber.debounceTimer) {
                clearTimeout(subscriber.debounceTimer);
            }
            this._bodySubscribers.delete(id);
        }

        // 如果没有订阅者了，停止 observer
        if (this._bodySubscribers.size === 0) {
            this._stopBodyObserver();
        }
    }

    /**
     * 确保 body observer 已启动（或更新配置）
     */
    _ensureBodyObserver() {
        // 检查是否有订阅者需要 characterData
        const needsCharacterData = Array.from(this._bodySubscribers.values())
            .some(s => s.characterData);

        // 如果 observer 已存在，检查是否需要更新配置
        if (this._bodyObserver) {
            // 如果新订阅者需要 characterData 但当前没开启，需要重启
            if (needsCharacterData && !this._bodyObserverHasCharacterData) {
                this._stopBodyObserver();
            } else {
                return;  // 配置无需更新
            }
        }

        this._bodyObserver = new MutationObserver((mutations) => {
            this._handleBodyMutations(mutations);
        });

        try {
            this._bodyObserver.observe(document.body, {
                childList: true,
                subtree: true,
                characterData: needsCharacterData
            });
            this._bodyObserverHasCharacterData = needsCharacterData;
        } catch (e) {
        }
    }

    /**
     * 停止 body observer
     */
    _stopBodyObserver() {
        if (this._bodyObserver) {
            this._bodyObserver.disconnect();
            this._bodyObserver = null;
        }
    }

    /**
     * 处理 body mutations
     */
    _handleBodyMutations(mutations) {
        // 收集到待处理队列
        this._pendingMutations.push(...mutations);

        // 使用 requestAnimationFrame 批量处理
        if (!this._rafId) {
            this._rafId = requestAnimationFrame(() => {
                this._processPendingMutations();
            });
        }
    }

    /**
     * 处理待处理的 mutations
     */
    _processPendingMutations() {
        const mutations = this._pendingMutations;
        this._pendingMutations = [];
        this._rafId = null;

        if (mutations.length === 0) return;

        // 预处理：提取关键信息
        const addedNodes = [];
        const removedNodes = [];
        const characterDataNodes = [];  // 文本变化的父元素
        let hasCharacterData = false;

        for (const mutation of mutations) {
            if (mutation.type === 'childList') {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        addedNodes.push(node);
                    }
                }
                for (const node of mutation.removedNodes) {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        removedNodes.push(node);
                    }
                }
            } else if (mutation.type === 'characterData') {
                hasCharacterData = true;
                // 收集文本变化的父元素
                const parentEl = mutation.target?.parentElement;
                if (parentEl) {
                    characterDataNodes.push(parentEl);
                }
            }
        }

        const mutationData = {
            mutations,
            addedNodes,
            removedNodes,
            characterDataNodes: [...new Set(characterDataNodes)],  // 去重
            hasAddedNodes: addedNodes.length > 0,
            hasRemovedNodes: removedNodes.length > 0,
            hasCharacterData
        };

        // 分发给各订阅者
        for (const [id, subscriber] of this._bodySubscribers) {
            this._notifySubscriber(id, subscriber, mutationData);
        }
    }

    /**
     * 通知单个订阅者
     * 
     * 执行策略：
     * 1. 只有 debounce: 每次变化重置计时器，等稳定后执行
     * 2. 只有 throttle: 检查距上次执行时间，超过间隔则立即执行
     * 3. debounce + throttle: 
     *    - 节流：持续变化时每隔 throttle 时间执行一次
     *    - 防抖：变化结束后 debounce 时间再执行一次（兜底）
     */
    _notifySubscriber(id, subscriber, mutationData) {
        const { callback, filter, target, debounce, throttle } = subscriber;

        // 应用过滤条件
        if (filter.hasAddedNodes && !mutationData.hasAddedNodes) return;
        if (filter.hasRemovedNodes && !mutationData.hasRemovedNodes) return;
        if (filter.hasCharacterData && !mutationData.hasCharacterData) return;

        // 目标选择器过滤
        let relevantData = mutationData;
        if (target && mutationData.hasAddedNodes) {
            const relevantNodes = mutationData.addedNodes.filter(node => 
                node.matches?.(target) || node.querySelector?.(target)
            );
            if (relevantNodes.length === 0) return;
            relevantData = { ...mutationData, addedNodes: relevantNodes };
        }

        // 安全执行回调
        const safeCallback = () => {
            try {
                callback(relevantData);
            } catch (e) {
            }
        };

        const now = Date.now();

        // ===== 策略1: 只有节流 =====
        if (throttle > 0 && debounce === 0) {
            const timeSinceLastThrottle = now - subscriber.lastThrottleTime;
            if (timeSinceLastThrottle >= throttle) {
                subscriber.lastThrottleTime = now;
                safeCallback();
            }
            return;
        }

        // ===== 策略2: 只有防抖 =====
        if (debounce > 0 && throttle === 0) {
            if (subscriber.debounceTimer) {
                clearTimeout(subscriber.debounceTimer);
            }
            subscriber.debounceTimer = setTimeout(() => {
                subscriber.debounceTimer = null;
                safeCallback();
            }, debounce);
            return;
        }

        // ===== 策略3: 节流 + 防抖（实时处理 + 结束兜底）=====
        if (throttle > 0 && debounce > 0) {
            // 节流部分：持续变化时每 throttle 时间执行一次
            const timeSinceLastThrottle = now - subscriber.lastThrottleTime;
            if (timeSinceLastThrottle >= throttle) {
                subscriber.lastThrottleTime = now;
                safeCallback();
            }

            // 防抖部分：变化结束后 debounce 时间再兜底执行一次
            if (subscriber.debounceTimer) {
                clearTimeout(subscriber.debounceTimer);
            }
            subscriber.debounceTimer = setTimeout(() => {
                subscriber.debounceTimer = null;
                // 防抖触发意味着 DOM 已稳定，作为最后一次更新，无视节流限制直接执行
                // 但要更新 lastThrottleTime，避免后续节流立即触发
                subscriber.lastThrottleTime = Date.now();
                safeCallback();
            }, debounce);
            return;
        }

        // ===== 策略4: 无节流无防抖，立即执行 =====
        safeCallback();
    }

    // ==================== Theme Observer ====================

    /**
     * 订阅主题变化（html/body 属性变化）
     * @param {string} id - 订阅者唯一标识
     * @param {Function} callback - 回调函数
     * @returns {Function} 取消订阅函数
     */
    subscribeTheme(id, callback) {
        if (!callback || typeof callback !== 'function') {
            throw new Error('callback is required and must be a function');
        }

        this._themeSubscribers.set(id, { callback });

        this._ensureThemeObservers();

        return () => this.unsubscribeTheme(id);
    }

    /**
     * 取消主题订阅
     */
    unsubscribeTheme(id) {
        this._themeSubscribers.delete(id);

        if (this._themeSubscribers.size === 0) {
            this._stopThemeObservers();
        }
    }

    /**
     * 确保主题 observer 已启动
     * 使用 1 个 Observer 同时监听 html 和 body 的属性变化
     */
    _ensureThemeObservers() {
        if (this._themeObserver) return;

        const notifyThemeChange = () => {
            for (const [id, subscriber] of this._themeSubscribers) {
                try {
                    subscriber.callback();
                } catch (e) {
                }
            }
        };

        // 创建 1 个 Observer，监听 html + body
        this._themeObserver = new MutationObserver((mutations) => {
            const hasThemeChange = mutations.some(m => 
                m.type === 'attributes' && 
                ['class', 'data-theme', 'style', 'yb-theme-mode'].includes(m.attributeName)
            );
            if (hasThemeChange) notifyThemeChange();
        });

        try {
            // 同一个 Observer 监听两个目标
            this._themeObserver.observe(document.documentElement, {
                attributes: true,
                attributeFilter: ['class', 'data-theme', 'style', 'yb-theme-mode']
            });
            this._themeObserver.observe(document.body, {
                attributes: true,
                attributeFilter: ['class', 'yb-theme-mode']
            });
        } catch (e) {
        }
    }

    /**
     * 停止主题 observer
     */
    _stopThemeObservers() {
        if (this._themeObserver) {
            this._themeObserver.disconnect();  // 一次 disconnect 停止所有监听
            this._themeObserver = null;
        }
    }

    // ==================== Container Observer ====================

    /**
     * 订阅特定容器的 DOM 变化
     * @param {string} id - 订阅者唯一标识
     * @param {HTMLElement} container - 要监听的容器元素
     * @param {Object} options - 配置选项
     * @param {Function} options.callback - 回调函数
     * @param {number} [options.debounce] - 防抖时间（毫秒）- DOM 停止变化后才执行
     * @param {number} [options.throttle] - 节流时间（毫秒）- DOM 持续变化时每隔一段时间执行
     * @param {Object} [options.observerOptions] - MutationObserver 配置
     * @returns {Function} 取消订阅函数
     */
    subscribeContainer(id, container, options) {
        const { callback, debounce = 0, throttle = 0, observerOptions = { childList: true, subtree: true } } = options;

        if (!container || !(container instanceof HTMLElement)) {
            throw new Error('container must be a valid HTMLElement');
        }
        if (!callback || typeof callback !== 'function') {
            throw new Error('callback is required and must be a function');
        }

        // 生成容器 ID
        const containerId = this._getContainerId(container);

        // 获取或创建容器 observer 数据
        let containerData = this._containerObservers.get(containerId);
        if (!containerData) {
            const observer = new MutationObserver((mutations) => {
                this._handleContainerMutations(containerId, mutations);
            });

            try {
                observer.observe(container, observerOptions);
            } catch (e) {
                return () => {};
            }

            containerData = {
                observer,
                element: container,
                subscribers: new Map()
            };
            this._containerObservers.set(containerId, containerData);
        }

        // 添加订阅者
        containerData.subscribers.set(id, {
            callback,
            debounce,
            throttle,
            debounceTimer: null,
            lastThrottleTime: 0
        });


        // 使用闭包保存 containerId，确保取消订阅时正确
        const savedContainerId = containerId;
        return () => this.unsubscribeContainer(id, savedContainerId);
    }

    /**
     * 取消容器订阅
     */
    unsubscribeContainer(id, containerId) {
        const containerData = this._containerObservers.get(containerId);
        if (!containerData) return;

        const subscriber = containerData.subscribers.get(id);
        if (subscriber) {
            if (subscriber.debounceTimer) {
                clearTimeout(subscriber.debounceTimer);
            }
            containerData.subscribers.delete(id);
        }

        // 如果没有订阅者了，清理 observer
        if (containerData.subscribers.size === 0) {
            containerData.observer.disconnect();
            this._containerObservers.delete(containerId);
        }
    }

    /**
     * 处理容器 mutations
     */
    _handleContainerMutations(containerId, mutations) {
        const containerData = this._containerObservers.get(containerId);
        if (!containerData) return;

        const mutationData = { mutations };

        for (const [id, subscriber] of containerData.subscribers) {
            const { callback, debounce, throttle } = subscriber;

            // 安全执行回调
            const safeCallback = () => {
                try {
                    callback(mutationData);
                } catch (e) {
                }
            };

            const now = Date.now();

            // ===== 策略1: 只有节流 =====
            if (throttle > 0 && debounce === 0) {
                const timeSinceLastThrottle = now - subscriber.lastThrottleTime;
                if (timeSinceLastThrottle >= throttle) {
                    subscriber.lastThrottleTime = now;
                    safeCallback();
                }
                continue;
            }

            // ===== 策略2: 只有防抖 =====
            if (debounce > 0 && throttle === 0) {
                if (subscriber.debounceTimer) {
                    clearTimeout(subscriber.debounceTimer);
                }
                subscriber.debounceTimer = setTimeout(() => {
                    subscriber.debounceTimer = null;
                    safeCallback();
                }, debounce);
                continue;
            }

            // ===== 策略3: 节流 + 防抖 =====
            if (throttle > 0 && debounce > 0) {
                const timeSinceLastThrottle = now - subscriber.lastThrottleTime;
                if (timeSinceLastThrottle >= throttle) {
                    subscriber.lastThrottleTime = now;
                    safeCallback();
                }

                if (subscriber.debounceTimer) {
                    clearTimeout(subscriber.debounceTimer);
                }
                subscriber.debounceTimer = setTimeout(() => {
                    subscriber.debounceTimer = null;
                    // 防抖触发意味着 DOM 已稳定，作为最后一次更新，无视节流限制直接执行
                    // 但要更新 lastThrottleTime，避免后续节流立即触发
                    subscriber.lastThrottleTime = Date.now();
                    safeCallback();
                }, debounce);
                continue;
            }

            // ===== 策略4: 立即执行 =====
            safeCallback();
        }
    }

    /**
     * 获取容器的唯一 ID
     */
    _getContainerId(element) {
        if (!element._domObserverId) {
            element._domObserverId = `container_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        }
        return element._domObserverId;
    }

    // ==================== 工具方法 ====================

    /**
     * 获取统计信息
     */
    getStats() {
        return {
            bodySubscribers: this._bodySubscribers.size,
            themeSubscribers: this._themeSubscribers.size,
            containerObservers: this._containerObservers.size,
            bodyObserverActive: !!this._bodyObserver,
            themeObserverActive: !!this._themeObserver
        };
    }

    /**
     * 获取所有订阅者 ID
     */
    getSubscriberIds() {
        return {
            body: Array.from(this._bodySubscribers.keys()),
            theme: Array.from(this._themeSubscribers.keys()),
            containers: Array.from(this._containerObservers.entries()).map(([containerId, data]) => ({
                containerId,
                subscribers: Array.from(data.subscribers.keys())
            }))
        };
    }

    /**
     * 清理所有资源
     */
    destroy() {
        // 清理 body observer
        for (const [id, subscriber] of this._bodySubscribers) {
            if (subscriber.debounceTimer) {
                clearTimeout(subscriber.debounceTimer);
            }
        }
        this._bodySubscribers.clear();
        this._stopBodyObserver();

        // 清理 theme observers
        this._themeSubscribers.clear();
        this._stopThemeObservers();

        // 清理 container observers
        for (const [containerId, data] of this._containerObservers) {
            for (const [id, subscriber] of data.subscribers) {
                if (subscriber.debounceTimer) {
                    clearTimeout(subscriber.debounceTimer);
                }
            }
            data.observer.disconnect();
        }
        this._containerObservers.clear();

        // 清理 RAF
        if (this._rafId) {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }

    }

}

// 暴露到全局
if (typeof window !== 'undefined') {
    window.DOMObserverManager = DOMObserverManager;
}
