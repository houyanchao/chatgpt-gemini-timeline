/**
 * Global Tooltip Manager - 全局 Tooltip 统一管理器
 * 
 * 负责管理整个扩展的所有 tooltip，解决以下问题：
 * 1. Tooltip 不消失的 bug
 * 2. 多个 tooltip 同时显示
 * 3. 事件丢失导致的残留
 * 4. 滚动时没有隐藏
 * 
 * 特性：
 * - 全局单例模式
 * - 统一生命周期管理
 * - 保险定时器（强制消失）
 * - 全局安全网（滚动/点击/ESC 强制隐藏）
 * - DOM 复用（性能优化）
 * - ✨ 组件自治：URL 变化时自动清理所有 Tooltip（无需外部管理）
 */

class GlobalTooltipManager {
    constructor(options = {}) {
        // 状态管理
        this.state = {
            currentId: null,
            currentType: null,
            currentTarget: null,
            isVisible: false,
            isPinned: false,  // 鼠标是否在 tooltip 上
            currentUrl: location.href  // 记录当前 URL
        };
        
        // DOM 实例池（按类型复用）
        this.instances = new Map();
        
        // 二级悬浮 tooltip（不影响主 tooltip 生命周期）
        this._overlayEl = null;
        this._overlayTimer = null;
        
        // 定时器管理
        this.timers = {
            showDebounce: null,
            hideDelay: null,
            cleanupAnimation: null
        };
        
        // 观察器
        this.targetObserver = null;  // 监听目标元素被删除
        this.intersectionObserver = null;  // 监听目标元素离开视口
        
        // 配置
        this.config = {
            debug: options.debug || false,
            types: {
                node: {
                    maxWidth: 288,
                    showDelay: 80,
                    hideDelay: 100,
                    allowHover: true,
                    className: 'timeline-tooltip',
                    placement: 'auto',
                    gap: 12,  // ✅ 修复：与CSS变量一致 (4+6+2=12)
                    // ✅ 支持浅色/深色模式的颜色配置
                    color: {
                        light: {
                            backgroundColor: '#f8fafc',  // 浅色模式：柔和浅灰背景
                            textColor: '#334155',        // 浅色模式：深灰文字
                            borderColor: '#e2e8f0'       // 浅色模式：浅灰边框
                        },
                        dark: {
                            backgroundColor: '#27272a',  // 深色模式：柔和深灰背景
                            textColor: '#e5e7eb',        // 深色模式：浅灰文字
                            borderColor: '#3f3f46'       // 深色模式：深灰边框
                        }
                    }
                },
                button: {
                    maxWidth: 200,
                    showDelay: 0,
                    hideDelay: 100,  // 增加延迟，避免tooltip闪烁消失
                    allowHover: false,
                    className: 'timeline-tooltip-base',  // 只使用基础类，颜色由color配置控制
                    placement: 'bottom',
                    gap: 12,
                    color: {
                        light: {
                            backgroundColor: '#f8fafc',  // 浅色模式：柔和浅灰背景
                            textColor: '#334155',        // 浅色模式：深灰文字
                            borderColor: '#e2e8f0'       // 浅色模式：浅灰边框
                        },
                        dark: {
                            backgroundColor: '#27272a',  // 深色模式：柔和深灰背景
                            textColor: '#e5e7eb',        // 深色模式：浅灰文字
                            borderColor: '#3f3f46'       // 深色模式：深灰边框
                        }
                    }
                },
                formula: {
                    maxWidth: 300,
                    showDelay: 0,
                    hideDelay: 200,
                    allowHover: true,
                    className: 'formula-tooltip timeline-tooltip-base',  // 只使用基础类，颜色由color配置控制
                    placement: 'top',
                    gap: 12,
                    color: {
                        light: {
                            backgroundColor: '#f8fafc',  // 浅色模式：柔和浅灰背景
                            textColor: '#334155',        // 浅色模式：深灰文字
                            borderColor: '#e2e8f0'       // 浅色模式：浅灰边框
                        },
                        dark: {
                            backgroundColor: '#27272a',  // 深色模式：柔和深灰背景
                            textColor: '#e5e7eb',        // 深色模式：浅灰文字
                            borderColor: '#3f3f46'       // 深色模式：深灰边框
                        }
                    }
                }
            }
        };
        
        // 绑定方法（确保 this 正确）
        this._onGlobalScroll = this._onGlobalScroll.bind(this);
        this._onGlobalClick = this._onGlobalClick.bind(this);
        this._onGlobalKeydown = this._onGlobalKeydown.bind(this);
        this._onWindowBlur = this._onWindowBlur.bind(this);
        this._onTooltipEnter = this._onTooltipEnter.bind(this);
        this._onTooltipLeave = this._onTooltipLeave.bind(this);
        this._boundHandleUrlChange = this._handleUrlChange.bind(this);
        
        // 初始化
        this._setupGlobalListeners();
        this._attachUrlListeners();  // ✅ 监听 URL 变化（组件自治）
    }
    
    /**
     * 显示 tooltip
     * @param {string} id - 唯一标识
     * @param {string} type - 类型：node/button/formula
     * @param {HTMLElement} target - 触发元素
     * @param {Object} content - 内容配置
     * @param {Object} options - 可选配置（覆盖默认）
     * @param {Object} options.color - 颜色配置对象 {light: {backgroundColor, textColor, borderColor}, dark: {...}}
     * @param {number} options.maxWidth - 最大宽度
     * @param {number} options.showDelay - 显示延迟
     * @param {number} options.hideDelay - 隐藏延迟
     * @param {boolean} options.allowHover - 是否允许鼠标悬停
     * @param {string} options.placement - 位置：auto/top/bottom/left/right
     * @param {number} options.gap - 与目标元素的距离
     * @param {string} options.style - 样式风格：'mini' 使用紧凑样式（小号字、无箭头）
     */
    show(id, type, target, content, options = {}) {
        try {
            // 参数校验
            if (!this._validateParams(id, type, target, content)) {
                return;
            }
            
            // 去重：如果是同一个 tooltip，忽略
            if (this.state.currentId === id && this.state.isVisible) {
                this._log('Same tooltip already visible, ignoring');
                return;
            }
            
            // ✅ 关键修复：清理所有之前的定时器，防止残留
            // 清理之前的 showDebounce（防止多个 show 定时器同时存在）
            this.timers.showDebounce = this._clearTimer(this.timers.showDebounce);
            // 清理之前的 hideDelay（防止旧的 hide 定时器把新的 tooltip 隐藏）
            this.timers.hideDelay = this._clearTimer(this.timers.hideDelay);
            
            // 获取配置
            const typeConfig = { ...this.config.types[type], ...options };
            
            // 防抖延迟
            this.timers.showDebounce = setTimeout(() => {
                this.timers.showDebounce = null;
                this._showImmediate(id, type, target, content, typeConfig);
            }, typeConfig.showDelay);
            
        } catch (error) {
            console.error('[TooltipManager] Show failed:', error);
            this.forceHideAll();
        }
    }
    
    /**
     * 隐藏 tooltip
     * @param {boolean} immediate - 是否立即隐藏
     */
    hide(immediate = false) {
        try {
            // ✅ 关键修复：清理 showDebounce 定时器，防止 hide 后又被 show 出来
            this.timers.showDebounce = this._clearTimer(this.timers.showDebounce);
            
            // 如果鼠标在 tooltip 上（pinned），忽略
            if (this.state.isPinned && !immediate) {
                this._log('Tooltip pinned, ignoring hide');
                return;
            }
            
            if (immediate) {
                // 立即隐藏时，也清理 hideDelay 定时器
                this.timers.hideDelay = this._clearTimer(this.timers.hideDelay);
                this._hideImmediate();
            } else {
                // 延迟隐藏
                const typeConfig = this.config.types[this.state.currentType] || {};
                const delay = typeConfig.hideDelay || 100;
                
                this.timers.hideDelay = this._clearTimer(this.timers.hideDelay);
                this.timers.hideDelay = setTimeout(() => {
                    this.timers.hideDelay = null;
                    this._hideImmediate();
                }, delay);
            }
        } catch (error) {
            console.error('[TooltipManager] Hide failed:', error);
            this._hideImmediate();
        }
    }
    
    /**
     * 强制隐藏所有 tooltip（紧急情况）
     */
    forceHideAll() {
        this._log('Force hide all tooltips');
        this._clearAllTimers();
        this._hideImmediate();
        this.hideOverlay();
        
        // ✅ 清理所有实例池中的tooltip DOM
        this.instances.forEach((tooltip, type) => {
            if (tooltip && tooltip.parentNode) {
                tooltip.parentNode.removeChild(tooltip);
            }
        });
        this.instances.clear();
        
        // 额外清理：移除页面上所有可能残留的 tooltip
        this._cleanupOrphanTooltips();
    }
    
    /**
     * 更新内容（不改变位置）
     */
    updateContent(content) {
        if (!this.state.isVisible || !this.state.currentType) return;
        
        const tooltip = this.instances.get(this.state.currentType);
        if (!tooltip) return;
        
        this._setContent(tooltip, content);
    }
    
    /**
     * 检查是否正在显示某个 tooltip
     */
    isShowing(id) {
        return this.state.isVisible && this.state.currentId === id;
    }
    
    /**
     * 显示二级悬浮 tooltip（不销毁主 tooltip）
     * 用于主 tooltip 内部元素（如 pin/star 图标）的 hover 提示
     * @param {HTMLElement} target - 触发元素
     * @param {string} text - 提示文字
     * @param {Object} options - 可选配置 { placement: 'top' }
     */
    showOverlay(target, text, options = {}) {
        this.hideOverlay();
        
        if (!target || !target.isConnected) return;
        
        const el = document.createElement('div');
        el.className = 'timeline-tooltip-overlay';
        el.textContent = text;
        el.style.position = 'fixed';
        el.style.zIndex = '2147483649';
        el.style.pointerEvents = 'none';
        
        // 自动检测主 tooltip 主题并反转
        let theme = options.theme;
        if (!theme) {
            const parentTooltip = target.closest('[data-tooltip-theme]');
            if (parentTooltip) {
                theme = parentTooltip.getAttribute('data-tooltip-theme') === 'dark' ? 'dark' : 'light';
            }
        }
        if (theme) el.setAttribute('data-theme', theme);
        
        document.body.appendChild(el);
        
        const targetRect = target.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        const gap = 6;
        
        let top, left;
        const placement = options.placement || 'top';
        
        if (placement === 'top') {
            top = targetRect.top - elRect.height - gap;
            left = targetRect.left + (targetRect.width - elRect.width) / 2;
        } else {
            top = targetRect.bottom + gap;
            left = targetRect.left + (targetRect.width - elRect.width) / 2;
        }
        
        if (left < 4) left = 4;
        if (left + elRect.width > window.innerWidth - 4) {
            left = window.innerWidth - elRect.width - 4;
        }
        if (top < 4) {
            top = targetRect.bottom + gap;
        }
        
        el.style.top = `${top}px`;
        el.style.left = `${left}px`;
        
        requestAnimationFrame(() => { el.classList.add('visible'); });
        
        this._overlayEl = el;
    }
    
    /**
     * 隐藏二级悬浮 tooltip
     */
    hideOverlay() {
        if (this._overlayTimer) {
            clearTimeout(this._overlayTimer);
            this._overlayTimer = null;
        }
        if (this._overlayEl) {
            this._overlayEl.remove();
            this._overlayEl = null;
        }
    }
    
    /**
     * 销毁管理器
     */
    destroy() {
        this._log('Destroying tooltip manager');
        
        // 清理所有定时器
        this._clearAllTimers();
        this.hideOverlay();
        
        // 移除全局事件监听
        this._removeGlobalListeners();
        this._detachUrlListeners();  // 清理 URL 监听器
        
        // 停止观察
        if (this.targetObserver) {
            this.targetObserver.disconnect();
            this.targetObserver = null;
        }
        if (this.intersectionObserver) {
            this.intersectionObserver.disconnect();
            this.intersectionObserver = null;
        }
        
        // 移除所有 tooltip DOM
        this.instances.forEach(tooltip => {
            if (tooltip.parentNode) {
                tooltip.parentNode.removeChild(tooltip);
            }
        });
        this.instances.clear();
        
        // 重置状态
        this.state = {
            currentId: null,
            currentType: null,
            currentTarget: null,
            isVisible: false,
            isPinned: false,
            currentUrl: location.href
        };
    }
    
    // ==================== 内部方法 ====================
    
    /**
     * 立即显示（内部）
     */
    _showImmediate(id, type, target, content, config) {
        this._log('Showing:', { id, type, target, content });
        
        // 再次检查元素是否在 DOM 中
        if (!target.isConnected) {
            this._log('Target disconnected, abort show');
            return;
        }
        
        // ✅ 销毁所有其他tooltip（确保同一时间只存在一个tooltip）
        this._clearAllTimers();  // 清理所有定时器
        this.instances.forEach((existingTooltip, existingType) => {
            if (existingTooltip && existingTooltip.parentNode) {
                existingTooltip.parentNode.removeChild(existingTooltip);
            }
        });
        this.instances.clear();
        
        // ✅ 创建新的tooltip DOM
        const tooltip = this._createTooltip(type, config);
        this.instances.set(type, tooltip);
        
        // 填充内容
        this._setContent(tooltip, content);
        
        // 临时显示（opacity 0）以获取尺寸
        tooltip.style.visibility = 'hidden';
        tooltip.style.opacity = '0';
        tooltip.classList.add('visible');
        
        // 计算位置（传入配置）
        const position = this._calculatePosition(target, tooltip, config.placement, config);
        
        const isMini = config.style === 'mini';
        
        // 应用位置（根据placement使用对应的定位属性）
        tooltip.setAttribute('data-placement', position.placement);
        
        // ✅ 应用箭头偏移量（mini 样式无箭头，跳过）
        if (!isMini && position.arrowOffset) {
            tooltip.style.setProperty('--arrow-offset', position.arrowOffset);
        }
        
        // ✅ 关键修复：根据箭头方向使用正确的定位属性
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        
        if (position.placement === 'left') {
            tooltip.style.left = '';
            const rightValue = vw - (position.left + position.width);
            tooltip.style.right = `${rightValue}px`;
            tooltip.style.top = `${position.top}px`;
            tooltip.style.bottom = '';
        } else if (position.placement === 'right') {
            tooltip.style.right = '';
            tooltip.style.left = `${position.left}px`;
            tooltip.style.top = `${position.top}px`;
            tooltip.style.bottom = '';
        } else if (position.placement === 'top') {
            tooltip.style.top = '';
            const bottomValue = vh - (position.top + position.height);
            tooltip.style.bottom = `${bottomValue}px`;
            tooltip.style.left = `${position.left}px`;
            tooltip.style.right = '';
        } else {
            tooltip.style.bottom = '';
            tooltip.style.top = `${position.top}px`;
            tooltip.style.left = `${position.left}px`;
            tooltip.style.right = '';
        }
        
        // ✅ 应用自定义颜色（根据当前主题模式）
        if (config.color) {
            // 检测当前是浅色还是深色模式
            // 使用全面的检测方法，兼容各平台的 dark 模式标记
            const isDarkMode = this._detectDarkMode();
            const themeColors = isDarkMode ? config.color.dark : config.color.light;
            
            // ✅ 添加data属性标记tooltip主题（用于CSS选择器）
            tooltip.setAttribute('data-tooltip-theme', isDarkMode ? 'dark' : 'light');
            
            if (themeColors.backgroundColor) {
                // 同时设置内联样式和CSS变量（CSS变量用于伪元素）
                tooltip.style.backgroundColor = themeColors.backgroundColor;
                tooltip.style.setProperty('--timeline-tooltip-bg', themeColors.backgroundColor);
            }
            if (themeColors.textColor) {
                tooltip.style.color = themeColors.textColor;
                tooltip.style.setProperty('--timeline-tooltip-text', themeColors.textColor);
            }
            if (themeColors.borderColor) {
                tooltip.style.borderColor = themeColors.borderColor;
                tooltip.style.setProperty('--timeline-tooltip-border', themeColors.borderColor);
            }
        }
        
        // 显示动画
        requestAnimationFrame(() => {
            tooltip.style.visibility = '';
            tooltip.style.opacity = '';
            tooltip.setAttribute('aria-hidden', 'false');
        });
        
        // 如果允许 hover，添加 tooltip 事件监听
        if (config.allowHover) {
            tooltip.addEventListener('mouseenter', this._onTooltipEnter);
            tooltip.addEventListener('mouseleave', this._onTooltipLeave);
        }
        
        // 更新状态
        this.state.currentId = id;
        this.state.currentType = type;
        this.state.currentTarget = target;
        this.state.isVisible = true;
        this.state.isPinned = false;
        
        // 监听目标元素被删除
        this._observeTarget(target);
    }
    
    /**
     * 立即隐藏（内部）
     */
    _hideImmediate() {
        if (!this.state.isVisible) return;
        
        this._log('Hiding immediately');
        
        // ✅ 修复：先保存 currentType，因为后面会重置状态
        const currentType = this.state.currentType;
        const tooltip = this.instances.get(currentType);
        
        if (tooltip) {
            // 移除事件监听
            tooltip.removeEventListener('mouseenter', this._onTooltipEnter);
            tooltip.removeEventListener('mouseleave', this._onTooltipLeave);
            
            // ✅ 添加隐藏动画，然后销毁DOM
            tooltip.classList.remove('visible');
            tooltip.setAttribute('aria-hidden', 'true');
            
            // ✅ 清理之前的 cleanupAnimation 定时器
            this.timers.cleanupAnimation = this._clearTimer(this.timers.cleanupAnimation);
            
            // 等待动画完成后销毁DOM
            this.timers.cleanupAnimation = setTimeout(() => {
                this.timers.cleanupAnimation = null;
                if (tooltip && tooltip.parentNode) {
                    tooltip.parentNode.removeChild(tooltip);
                }
                // ✅ 修复：使用保存的 currentType
                this.instances.delete(currentType);
            }, 200);
        }
        
        // 停止观察目标元素
        if (this.targetObserver) {
            this.targetObserver.disconnect();
            this.targetObserver = null;
        }
        if (this.intersectionObserver) {
            this.intersectionObserver.disconnect();
            this.intersectionObserver = null;
        }
        
        // 重置状态
        this.state.currentId = null;
        this.state.currentType = null;
        this.state.currentTarget = null;
        this.state.isVisible = false;
        this.state.isPinned = false;
    }
    
    /**
     * 创建 tooltip DOM
     */
    _createTooltip(type, config) {
        const tooltip = document.createElement('div');
        
        if (config.style === 'mini') {
            tooltip.className = 'timeline-tooltip-overlay';
        } else {
            tooltip.className = config.className;
        }
        
        tooltip.setAttribute('role', 'tooltip');
        tooltip.setAttribute('aria-hidden', 'true');
        tooltip.id = `global-tooltip-${type}`;
        
        // 通用样式
        tooltip.style.position = 'fixed';
        tooltip.style.zIndex = '2147483648';
        tooltip.style.pointerEvents = config.allowHover ? 'auto' : 'none';
        
        document.body.appendChild(tooltip);
        
        this._log('Created tooltip DOM for type:', type);
        return tooltip;
    }
    
    /**
     * 设置内容
     */
    _setContent(tooltip, content) {
        // 清空现有内容（重要：先清空，避免事件监听器残留）
        tooltip.innerHTML = '';
        
        if (typeof content === 'string') {
            tooltip.textContent = content;
        } else if (content.html) {
            tooltip.innerHTML = content.html;
        } else if (content.element && content.element instanceof HTMLElement) {
            // ✅ 支持 DOM 元素（保留事件监听器）
            tooltip.appendChild(content.element);
        } else {
            // 默认当作文本
            tooltip.textContent = String(content);
        }
    }
    
    /**
     * 计算位置
     */
    _calculatePosition(target, tooltip, preferredPlacement, config) {
        const targetRect = target.getBoundingClientRect();
        const tooltipRect = tooltip.getBoundingClientRect();
        const viewport = {
            width: window.innerWidth,
            height: window.innerHeight
        };
        
        // 如果是 auto，智能选择位置
        let placement = preferredPlacement;
        if (placement === 'auto') {
            placement = this._chooseBestPlacement(targetRect, tooltipRect, viewport);
        }
        
        // 计算基础位置（传入配置）
        let position = this._computePositionForPlacement(targetRect, tooltipRect, placement, config);
        
        // 保存原始位置（用于计算箭头偏移）
        const originalPosition = { ...position };
        
        // 边界修正
        position = this._clampToBounds(position, tooltipRect, viewport);
        
        // 计算箭头偏移量（当 tooltip 被边界修正后，箭头需要调整位置指向目标元素）
        const arrowOffset = this._calculateArrowOffset(targetRect, tooltipRect, position, originalPosition, placement);
        
        return {
            left: position.left,
            top: position.top,
            placement: placement,
            width: tooltipRect.width,   // ✅ 返回tooltip尺寸
            height: tooltipRect.height, // ✅ 返回tooltip尺寸
            arrowOffset: arrowOffset    // ✅ 箭头偏移量
        };
    }
    
    /**
     * 计算箭头偏移量
     * 当 tooltip 被边界修正移动后，箭头需要调整位置来指向目标元素
     */
    _calculateArrowOffset(targetRect, tooltipRect, position, originalPosition, placement) {
        // 目标元素中心点
        const targetCenterX = targetRect.left + targetRect.width / 2;
        const targetCenterY = targetRect.top + targetRect.height / 2;
        
        let arrowOffset = '50%';  // 默认居中
        
        if (placement === 'top' || placement === 'bottom') {
            // 水平方向的箭头偏移
            // 计算目标中心相对于 tooltip 左边缘的位置
            const offsetPx = targetCenterX - position.left;
            // 限制在 tooltip 范围内（留出边距）
            const minOffset = 12;
            const maxOffset = tooltipRect.width - 12;
            const clampedOffset = Math.max(minOffset, Math.min(maxOffset, offsetPx));
            arrowOffset = `${clampedOffset}px`;
        } else if (placement === 'left' || placement === 'right') {
            // 垂直方向的箭头偏移
            // 计算目标中心相对于 tooltip 顶部的位置
            const offsetPx = targetCenterY - position.top;
            // 限制在 tooltip 范围内（留出边距）
            const minOffset = 12;
            const maxOffset = tooltipRect.height - 12;
            const clampedOffset = Math.max(minOffset, Math.min(maxOffset, offsetPx));
            arrowOffset = `${clampedOffset}px`;
        }
        
        return arrowOffset;
    }
    
    /**
     * 智能选择最佳位置
     */
    _chooseBestPlacement(targetRect, tooltipRect, viewport) {
        const space = {
            left: targetRect.left,
            right: viewport.width - targetRect.right,
            top: targetRect.top,
            bottom: viewport.height - targetRect.bottom
        };
        
        const padding = 20;
        
        // 优先级：左 > 右 > 上 > 下
        if (space.left >= tooltipRect.width + padding) return 'left';
        if (space.right >= tooltipRect.width + padding) return 'right';
        if (space.top >= tooltipRect.height + padding) return 'top';
        return 'bottom';
    }
    
    /**
     * 根据位置计算坐标
     */
    _computePositionForPlacement(targetRect, tooltipRect, placement, config) {
        // ✅ 从配置中获取间距，默认 12px
        const gap = config.gap || 12;
        
        let left, top;
        
        switch (placement) {
            case 'left':
                left = targetRect.left - tooltipRect.width - gap;
                top = targetRect.top + (targetRect.height - tooltipRect.height) / 2;
                break;
            case 'right':
                left = targetRect.right + gap;
                top = targetRect.top + (targetRect.height - tooltipRect.height) / 2;
                break;
            case 'top':
                left = targetRect.left + (targetRect.width - tooltipRect.width) / 2;
                top = targetRect.top - tooltipRect.height - gap;
                break;
            case 'bottom':
                left = targetRect.left + (targetRect.width - tooltipRect.width) / 2;
                top = targetRect.bottom + gap;
                break;
            default:
                left = targetRect.right + gap;
                top = targetRect.top;
        }
        
        return { left: Math.round(left), top: Math.round(top) };
    }
    
    /**
     * 边界修正
     */
    _clampToBounds(position, tooltipRect, viewport) {
        const padding = 8;
        
        // 左右边界
        if (position.left < padding) {
            position.left = padding;
        } else if (position.left + tooltipRect.width > viewport.width - padding) {
            position.left = viewport.width - tooltipRect.width - padding;
        }
        
        // 上下边界
        if (position.top < padding) {
            position.top = padding;
        } else if (position.top + tooltipRect.height > viewport.height - padding) {
            position.top = viewport.height - tooltipRect.height - padding;
        }
        
        return position;
    }
    
    /**
     * 监听目标元素被删除或离开视口
     */
    _observeTarget(target) {
        // 1. MutationObserver - 监听目标元素被删除
        if (this.targetObserver) {
            this.targetObserver.disconnect();
        }
        
        this.targetObserver = new MutationObserver((mutations) => {
            // 检查目标元素是否还在 DOM 中
            if (!target.isConnected) {
                this._log('Target removed from DOM, hiding tooltip');
                this.forceHideAll();
            }
        });
        
        // 监听目标元素的父节点
        if (target.parentNode) {
            this.targetObserver.observe(target.parentNode, {
                childList: true,
                subtree: false
            });
        }
        
        // 2. IntersectionObserver - 监听目标元素离开视口（解决内部容器滚动问题）
        if (this.intersectionObserver) {
            this.intersectionObserver.disconnect();
        }
        
        this.intersectionObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                // 当目标元素不再可见时（离开视口），隐藏 tooltip
                if (!entry.isIntersecting && this.state.isVisible) {
                    this._log('Target scrolled out of view, hiding tooltip');
                    this.forceHideAll();
                }
            });
        }, {
            threshold: 0  // 只要有一点离开就触发
        });
        
        this.intersectionObserver.observe(target);
    }
    
    /**
     * 参数校验
     */
    _validateParams(id, type, target, content) {
        if (!id) {
            console.error('[TooltipManager] Missing id');
            return false;
        }
        
        if (!type || !this.config.types[type]) {
            console.error('[TooltipManager] Invalid type:', type);
            return false;
        }
        
        if (!target || !(target instanceof HTMLElement)) {
            console.error('[TooltipManager] Invalid target');
            return false;
        }
        
        if (!target.isConnected) {
            console.warn('[TooltipManager] Target not in DOM');
            return false;
        }
        
        if (!content) {
            console.error('[TooltipManager] Missing content');
            return false;
        }
        
        return true;
    }
    
    /**
     * 清理所有定时器
     */
    _clearAllTimers() {
        Object.keys(this.timers).forEach(key => {
            this.timers[key] = this._clearTimer(this.timers[key]);
        });
    }
    
    /**
     * 清理单个定时器
     */
    _clearTimer(timer) {
        if (timer !== null && timer !== undefined) {
            clearTimeout(timer);
        }
        return null;
    }
    
    /**
     * 清理孤儿 tooltip（DOM 中残留的）
     */
    _cleanupOrphanTooltips() {
        try {
            // 清理旧版本可能残留的 tooltip
            const selectors = [
                '.timeline-starred-btn-tooltip',
                '.timeline-tooltip:not([id^="global-tooltip"])',
                '.formula-tooltip:not([id^="global-tooltip"])'
            ];
            
            selectors.forEach(selector => {
                document.querySelectorAll(selector).forEach(el => {
                    if (el.parentNode) {
                        el.parentNode.removeChild(el);
                    }
                });
            });
        } catch (error) {
            console.error('[TooltipManager] Cleanup orphans failed:', error);
        }
    }
    
    // ==================== 全局事件处理 ====================
    
    /**
     * 设置全局监听器
     */
    _setupGlobalListeners() {
        // 滚动时强制隐藏（capture 阶段，捕获所有滚动）
        document.addEventListener('scroll', this._onGlobalScroll, true);
        
        // 点击时隐藏（除非点击的是 tooltip 相关元素）
        document.addEventListener('click', this._onGlobalClick, true);
        
        // ESC 键隐藏
        document.addEventListener('keydown', this._onGlobalKeydown);
        
        // 窗口失焦时隐藏
        window.addEventListener('blur', this._onWindowBlur);
        
        this._log('Global listeners setup complete');
    }
    
    /**
     * 移除全局监听器
     */
    _removeGlobalListeners() {
        document.removeEventListener('scroll', this._onGlobalScroll, true);
        document.removeEventListener('click', this._onGlobalClick, true);
        document.removeEventListener('keydown', this._onGlobalKeydown);
        window.removeEventListener('blur', this._onWindowBlur);
    }
    
    /**
     * 全局滚动事件
     */
    _onGlobalScroll() {
        if (this.state.isVisible) {
            this._log('Global scroll detected, hiding tooltip');
            this.forceHideAll();
        }
    }
    
    /**
     * 全局点击事件
     */
    _onGlobalClick(e) {
        if (!this.state.isVisible) return;
        
        // 检查是否点击的是 tooltip 或触发元素
        const clickedTooltip = e.target.closest('[id^="global-tooltip"]');
        const clickedTarget = this.state.currentTarget && 
                              (e.target === this.state.currentTarget || 
                               this.state.currentTarget.contains(e.target));
        
        if (!clickedTooltip && !clickedTarget) {
            this._log('Click outside tooltip, hiding');
            this.hide(true);
        }
    }
    
    /**
     * 全局键盘事件
     */
    _onGlobalKeydown(e) {
        if (e.key === 'Escape' && this.state.isVisible) {
            this._log('ESC pressed, hiding tooltip');
            this.forceHideAll();
        }
    }
    
    /**
     * 窗口失焦事件
     */
    _onWindowBlur() {
        if (this.state.isVisible) {
            this._log('Window blur, hiding tooltip');
            this.forceHideAll();
        }
    }
    
    /**
     * Tooltip 自身鼠标进入
     */
    _onTooltipEnter() {
        this._log('Mouse entered tooltip, pinning');
        this.state.isPinned = true;
        
        // 取消隐藏定时器
        this.timers.hideDelay = this._clearTimer(this.timers.hideDelay);
    }
    
    /**
     * Tooltip 自身鼠标离开
     */
    _onTooltipLeave(e) {
        this._log('Mouse left tooltip');
        this.state.isPinned = false;
        
        // 检查是否移回触发元素
        const movedToTarget = this.state.currentTarget && 
                              (e.relatedTarget === this.state.currentTarget ||
                               this.state.currentTarget.contains(e.relatedTarget));
        
        if (!movedToTarget) {
            this.hide();
        }
    }
    
    /**
     * 调试日志
     */
    _log(...args) {
        if (this.config.debug) {
            console.log('[TooltipManager]', ...args);
        }
    }
    
    /**
     * ✅ 检测当前是否为深色模式
     * 使用全局 detectDarkMode 函数（定义在 constants.js）
     */
    _detectDarkMode() {
        // 调用全局函数，如果不存在则返回 false
        return typeof detectDarkMode === 'function' ? detectDarkMode() : false;
    }
    
    // ==================== URL 变化监听（组件自治）====================
    
    /**
     * 附加 URL 变化监听器
     * 当 URL 变化时自动清理所有 tooltip，无需外部调用
     */
    _attachUrlListeners() {
        try {
            window.addEventListener('url:change', this._boundHandleUrlChange);
            this._log('URL listeners attached');
        } catch (error) {
            console.error('[TooltipManager] Failed to attach URL listeners:', error);
        }
    }
    
    /**
     * 移除 URL 变化监听器
     */
    _detachUrlListeners() {
        try {
            window.removeEventListener('url:change', this._boundHandleUrlChange);
            this._log('URL listeners detached');
        } catch (error) {
            console.error('[TooltipManager] Failed to detach URL listeners:', error);
        }
    }
    
    /**
     * 处理 URL 变化
     * ✅ 组件自治：URL 变化时自动清理所有 tooltip
     */
    _handleUrlChange() {
        const newUrl = location.href;
        
        // URL 变化了，自动清理所有 tooltip
        if (newUrl !== this.state.currentUrl) {
            this._log('URL changed, auto-hiding all tooltips:', this.state.currentUrl, '->', newUrl);
            this.state.currentUrl = newUrl;
            
            // 如果有 tooltip 正在显示，自动清理
            if (this.state.isVisible) {
                this.forceHideAll();
            }
        }
    }
}

// ==================== 全局单例初始化 ====================

// 创建全局实例（只在第一次加载时）
if (typeof window.globalTooltipManager === 'undefined') {
    window.globalTooltipManager = new GlobalTooltipManager({
        debug: false  // 生产环境关闭，调试时可设为 true
    });
}
