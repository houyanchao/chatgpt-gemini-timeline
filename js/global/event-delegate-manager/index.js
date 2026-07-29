/**
 * Global Event Delegate Manager - 全局事件委托管理器
 * 
 * 解决问题：
 * - 页面长时间停留后，绑定在元素上的事件监听器可能失效
 * - 通过事件委托，在 document 上统一监听，确保事件始终能被捕获
 * 
 * 使用方式：
 * window.eventDelegateManager.on('click', '.my-button', (e, target) => {
 *     log('Button clicked:', target);
 * });
 */

class EventDelegateManager {
    constructor() {
        // 事件处理器映射：{ eventType: Map<selector, handler> }
        this.handlers = {};
        
        // 已绑定的事件类型
        this.boundEvents = new Set();
        
    }
    
    /**
     * 注册事件处理器（简化 API）
     * @param {string} eventType - 事件类型（click, mouseenter 等）
     * @param {string} selector - CSS 选择器
     * @param {Function} handler - 处理函数，接收 (event, matchedElement) 参数
     */
    on(eventType, selector, handler) {
        // 初始化该事件类型的处理器 Map
        if (!this.handlers[eventType]) {
            this.handlers[eventType] = new Map();
        }
        
        // 存储处理器（相同选择器会覆盖）
        this.handlers[eventType].set(selector, handler);
        
        // 确保该事件类型已在 document 上绑定
        this._bindEventType(eventType);
        
    }
    
    /**
     * 移除事件处理器
     * @param {string} eventType - 事件类型
     * @param {string} selector - CSS 选择器
     */
    off(eventType, selector) {
        if (this.handlers[eventType]) {
            this.handlers[eventType].delete(selector);
        }
    }
    
    /**
     * 在 document 上绑定事件类型
     */
    _bindEventType(eventType) {
        if (this.boundEvents.has(eventType)) return;
        
        // 使用冒泡阶段，让原有的事件监听器先执行
        // 如果原有监听器失效，委托的监听器会兜底
        document.addEventListener(eventType, (e) => {
            this._handleEvent(eventType, e);
        }, false);
        
        this.boundEvents.add(eventType);
    }
    
    /**
     * 处理事件
     */
    _handleEvent(eventType, e) {
        const handlersMap = this.handlers[eventType];
        if (!handlersMap || handlersMap.size === 0) return;
        
        // 遍历所有注册的选择器
        for (const [selector, handler] of handlersMap) {
            // 查找匹配的元素（从点击目标向上查找）
            const matchedElement = e.target.closest(selector);
            
            if (matchedElement) {
                
                try {
                    handler(e, matchedElement);
                } catch (error) {
                }
            }
        }
    }
    
}

// ==================== 全局单例 ====================

if (typeof window.eventDelegateManager === 'undefined') {
    window.eventDelegateManager = new EventDelegateManager();
}
