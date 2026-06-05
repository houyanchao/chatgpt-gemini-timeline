/**
 * Scroll To Bottom Manager
 * 
 * 回到底部按钮管理器
 * 在输入框上方居中显示一个 fixed 定位的"回到底部"按钮
 * 
 * 显示逻辑：监听时间轴的 activeChange 事件
 * - 当激活节点不是最后一个时显示按钮
 * - 当激活节点是最后一个时隐藏按钮
 */

class ScrollToBottomManager {
    constructor(adapter) {
        if (!adapter) {
            throw new Error('ScrollToBottomManager requires an adapter');
        }
        
        this.adapter = adapter;
        this.buttonElement = null;
        this.inputElement = null;
        this.isEnabled = false;
        this.isDestroyed = false;
        this.isVisible = false;
        this.globalEnabled = true;  // 全局开关状态（默认开启）
        this.platformSettings = {};
        this.storageListener = null;
        this._unsubscribeObserver = null;
        this._currentPlatform = null;
        
        // 事件处理器引用
        this._onResize = null;
        this._onActiveChange = null;
        this._onNodesChange = null;
        this._rafPending = false;
        
        // 配置
        this.config = {
            gap: 8  // 按钮与输入框的间距
        };
    }
    
    /**
     * 初始化
     */
    async init() {
        // ✅ 预加载平台信息（平台配置现在异步获取，缓存供同步方法使用）
        this._currentPlatform = await getCurrentPlatform();

        // 1. 加载平台设置
        await this._loadPlatformSettings();
        
        // 2. 监听 Storage 变化
        this._attachStorageListener();
        
        // 3. 创建按钮
        this._createButton();
        
        // 4. 检查是否启用
        if (this._isPlatformEnabled()) {
            this._enable();
        }
    }
    
    /**
     * 启用功能
     */
    _enable() {
        if (this.isEnabled) return;
        this.isEnabled = true;
        
        // 绑定事件（监听时间轴的激活变化事件）
        this._bindEvents();
        
        // 启动输入框检测（用于定位按钮位置）
        this._startInputDetection();
        
        // 尝试立即查找输入框
        this._findInputAndShow();
    }
    
    /**
     * 禁用功能
     */
    _disable() {
        if (!this.isEnabled) return;
        this.isEnabled = false;
        
        // 解绑事件
        this._unbindEvents();
        
        // 停止检测
        this._stopInputDetection();
        
        // 隐藏按钮
        this._hideButton();
        
        // 清空引用
        this.inputElement = null;
    }
    
    /**
     * 加载平台设置
     */
    async _loadPlatformSettings() {
        try {
            const result = await chrome.storage.local.get(['scrollToBottomPlatformSettings', 'scrollToBottomEnabled']);
            this.platformSettings = result.scrollToBottomPlatformSettings || {};
            // 全局开关，默认开启
            this.globalEnabled = result.scrollToBottomEnabled !== false;
        } catch (e) {
            this.platformSettings = {};
            this.globalEnabled = true;
        }
    }
    
    /**
     * 检查当前平台是否启用
     */
    _isPlatformEnabled() {
        try {
            // 先检查全局开关
            if (!this.globalEnabled) return false;
            
            const platform = this._currentPlatform;
            if (!platform) return false;
            if (platform.features?.scrollToBottom !== true) return false;
            return this.platformSettings[platform.id] !== false;
        } catch (e) {
            return true;
        }
    }
    
    /**
     * 监听 Storage 变化
     */
    _attachStorageListener() {
        this.storageListener = (changes, areaName) => {
            if (this.isDestroyed) return;
            
            if (areaName === 'local') {
                let needsUpdate = false;
                
                // 监听全局开关变化
                if (changes.scrollToBottomEnabled) {
                    this.globalEnabled = changes.scrollToBottomEnabled.newValue !== false;
                    needsUpdate = true;
                }
                
                // 监听平台设置变化
                if (changes.scrollToBottomPlatformSettings) {
                    this.platformSettings = changes.scrollToBottomPlatformSettings.newValue || {};
                    needsUpdate = true;
                }
                
                if (needsUpdate) {
                    const shouldEnable = this._isPlatformEnabled();
                    
                    if (shouldEnable && !this.isEnabled) {
                        this._enable();
                    } else if (!shouldEnable && this.isEnabled) {
                        this._disable();
                    }
                }
            }
        };
        chrome.storage.onChanged.addListener(this.storageListener);
    }
    
    /**
     * 创建按钮元素
     */
    _createButton() {
        if (this.buttonElement) return;
        
        const button = document.createElement('div');
        button.className = 'ait-scroll-to-bottom-btn';
        // 向下箭头图标 ↓
        button.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <polyline points="6 13 12 19 18 13"/>
            </svg>
        `;
        
        // 使用事件委托
        window.eventDelegateManager?.on('click', '.ait-scroll-to-bottom-btn', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this._scrollToBottom();
        });
        
        document.body.appendChild(button);
        this.buttonElement = button;
    }
    
    /**
     * 绑定事件
     */
    _bindEvents() {
        // resize 事件
        const scheduleUpdate = () => {
            if (this._rafPending) return;
            this._rafPending = true;
            
            requestAnimationFrame(() => {
                this._rafPending = false;
                this._updatePosition();
            });
        };
        
        this._onResize = scheduleUpdate;
        window.addEventListener('resize', this._onResize);
        
        // 监听时间轴的激活节点变化事件
        this._onActiveChange = (e) => {
            const { totalCount, isLast } = e.detail || {};
            
            // 如果激活的是最后一个节点，说明用户在底部，隐藏按钮
            // 如果不是最后一个节点，显示按钮
            if (isLast) {
                this._hideButton();
            } else if (totalCount > 1) {
                this._showButton();
            }
        };
        window.addEventListener('timeline:activeChange', this._onActiveChange);
        
        // 监听节点数量变化事件（新消息添加时激活状态会通过 activeChange 事件通知）
        this._onNodesChange = () => {};
        window.addEventListener('timeline:nodesChange', this._onNodesChange);
    }
    
    /**
     * 解绑事件
     */
    _unbindEvents() {
        this._rafPending = false;
        
        if (this._onResize) {
            window.removeEventListener('resize', this._onResize);
            this._onResize = null;
        }
        
        if (this._onActiveChange) {
            window.removeEventListener('timeline:activeChange', this._onActiveChange);
            this._onActiveChange = null;
        }
        
        if (this._onNodesChange) {
            window.removeEventListener('timeline:nodesChange', this._onNodesChange);
            this._onNodesChange = null;
        }
    }
    
    /**
     * 启动输入框检测
     */
    _startInputDetection() {
        if (this._unsubscribeObserver) return;
        
        if (window.DOMObserverManager) {
            this._unsubscribeObserver = window.DOMObserverManager.getInstance().subscribeBody('scroll-to-bottom', {
                callback: () => {
                    if (!this.isEnabled || this.isDestroyed) return;
                    
                    if (!this.inputElement) {
                        this._findInputAndShow();
                    } else if (!document.body.contains(this.inputElement)) {
                        this.inputElement = null;
                        this._hideButton();
                        this._findInputAndShow();
                    } else if (this.isVisible) {
                        // 只有在按钮可见时才更新位置
                        this._updatePosition();
                    }
                },
                filter: { hasAddedNodes: true },
                debounce: 300
            });
        }
    }
    
    /**
     * 停止输入框检测
     */
    _stopInputDetection() {
        if (this._unsubscribeObserver) {
            this._unsubscribeObserver();
            this._unsubscribeObserver = null;
        }
    }
    
    /**
     * 查找输入框并更新位置
     */
    _findInputAndShow() {
        if (!this.isEnabled || this.isDestroyed) return;
        
        try {
            const selector = this.adapter.getInputSelector();
            const input = document.querySelector(selector);
            
            if (input) {
                this.inputElement = input;
                // 按钮显示/隐藏由 timeline:activeChange 事件控制
                // 这里只更新位置
                this._updatePosition();
            }
        } catch (e) {
            // 忽略
        }
    }
    
    /**
     * 更新按钮位置
     */
    _updatePosition() {
        if (!this.buttonElement || !this.inputElement || this.isDestroyed || !this.isEnabled) {
            return;
        }
        
        try {
            // 获取定位参考元素
            const referenceElement = this.adapter.getPositionReferenceElement?.(this.inputElement) || this.inputElement;
            const rect = referenceElement.getBoundingClientRect();
            
            // 参考元素不可见
            if (rect.width === 0 || rect.height === 0) {
                return;
            }
            
            // 获取按钮尺寸
            const buttonRect = this.buttonElement.getBoundingClientRect();
            const buttonWidth = buttonRect.width || 38;
            
            // 获取平台偏移量
            const offset = this.adapter.getScrollToBottomOffset?.() || { top: 0 };
            
            // 计算位置：对话框水平居中，垂直位置在输入框上方
            const top = rect.top + offset.top - buttonWidth - this.config.gap;
            const left = rect.left + (rect.width - buttonWidth) / 2;  // 水平居中
            
            // 边界检查
            const safeTop = Math.max(8, Math.min(top, window.innerHeight - buttonWidth - 8));
            const safeLeft = Math.max(8, Math.min(left, window.innerWidth - buttonWidth - 8));
            
            // 设置位置
            this.buttonElement.style.top = `${safeTop}px`;
            this.buttonElement.style.left = `${safeLeft}px`;
            this.buttonElement.style.right = 'auto';
        } catch (e) {
            // 忽略
        }
    }
    
    /**
     * 显示按钮
     */
    _showButton() {
        if (!this.buttonElement || this.isVisible) return;
        
        this.isVisible = true;
        this._updatePosition();
        this.buttonElement.classList.add('visible');
    }
    
    /**
     * 隐藏按钮
     */
    _hideButton() {
        if (!this.buttonElement || !this.isVisible) return;
        
        this.isVisible = false;
        this.buttonElement.classList.remove('visible');
    }
    
    /**
     * 滚动到底部
     * 优先使用时间轴的 API（支持虚拟滚动）
     */
    _scrollToBottom() {
        // 优先使用时间轴的对外 API（正确处理虚拟滚动）
        if (window.timelineManager?.scrollToLast) {
            const success = window.timelineManager.scrollToLast();
            if (success) return;
        }
        
        // fallback: 使用原生滚动（不支持时间轴的平台）
        const scrollContainer = this._detectScrollContainer();
        if (!scrollContainer) return;
        
        try {
            if (scrollContainer === window) {
                window.scrollTo({
                    top: document.documentElement.scrollHeight,
                    behavior: 'smooth'
                });
            } else {
                scrollContainer.scrollTo({
                    top: scrollContainer.scrollHeight,
                    behavior: 'smooth'
                });
            }
        } catch (e) {
            if (scrollContainer === window) {
                window.scrollTo(0, document.documentElement.scrollHeight);
            } else {
                scrollContainer.scrollTop = scrollContainer.scrollHeight;
            }
        }
    }
    
    /**
     * 自动检测滚动容器（复用时间轴逻辑）
     */
    _detectScrollContainer() {
        // 优先使用适配器指定的滚动容器
        const adapterContainer = this.adapter.getScrollContainer?.();
        if (adapterContainer && adapterContainer !== window) {
            return adapterContainer;
        }
        
        // 从输入框向上遍历查找滚动容器
        let parent = this.inputElement?.parentElement;
        while (parent && parent !== document.body) {
            const style = window.getComputedStyle(parent);
            if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
                return parent;
            }
            parent = parent.parentElement;
        }
        
        // 备用：使用 document.scrollingElement
        return document.scrollingElement || document.documentElement || window;
    }
    
    /**
     * 销毁
     */
    destroy() {
        this.isDestroyed = true;
        this._disable();
        
        // 移除 Storage 监听
        if (this.storageListener) {
            chrome.storage.onChanged.removeListener(this.storageListener);
            this.storageListener = null;
        }
        
        // 移除按钮
        if (this.buttonElement && this.buttonElement.parentNode) {
            this.buttonElement.parentNode.removeChild(this.buttonElement);
            this.buttonElement = null;
        }
    }
}

// ==================== 初始化入口 ====================

(function() {
    'use strict';
    
    let scrollToBottomManager = null;
    let initInFlight = false;
    
    async function isPlatformSupported() {
        const platform = typeof getCurrentPlatform === 'function' ? await getCurrentPlatform() : null;
        return platform?.features?.scrollToBottom === true;
    }
    
    async function getAdapter() {
        // 使用全局已有的 registry 实例
        if (window.smartEnterAdapterRegistry) {
            return await window.smartEnterAdapterRegistry.getAdapter();
        }
        return null;
    }
    
    async function init() {
        if (scrollToBottomManager || initInFlight) return;
        initInFlight = true;
        try {
            if (!(await isPlatformSupported())) return;

            const adapter = await getAdapter();
            if (!adapter) return;

            scrollToBottomManager = new ScrollToBottomManager(adapter);
            await scrollToBottomManager.init();
        } catch (e) {
            console.error('[ScrollToBottom] Failed to initialize:', e);
            scrollToBottomManager = null;
        } finally {
            initInFlight = false;
        }
    }
    
    function cleanup() {
        if (scrollToBottomManager) {
            scrollToBottomManager.destroy();
            scrollToBottomManager = null;
        }
    }
    
    window.addEventListener('beforeunload', cleanup);
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(init, 500));
    } else {
        setTimeout(init, 500);
    }
})();
