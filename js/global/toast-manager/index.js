/**
 * Global Toast Manager - 全局 Toast 统一管理器
 * 
 * 负责管理整个扩展的所有 toast 提示，提供统一的用户反馈
 * 
 * 特性：
 * - 全局单例模式
 * - 支持多种类型（success/error/info/warning）
 * - 队列管理（多个 toast 优雅堆叠）
 * - 完全可配置（颜色、位置、时长、图标）
 * - 自动清理（定时消失）
 * - 相对定位或固定定位
 * - ✨ 组件自治：URL 变化时自动清理所有 Toast（无需外部管理）
 */

class GlobalToastManager {
    constructor() {
        // 当前显示的 toast 队列
        this.queue = [];
        
        // 配置
        this.config = {
            maxVisible: 3,       // 最多同时显示3个
            stackGap: 10,        // 堆叠间距
            centerGap: 60,       // 屏幕中央堆叠的起始位置
            types: {
                success: {
                    color: {
                        light: {
                            backgroundColor: '#ffffff',  // 浅色模式：白色背景
                            textColor: '#1f2937',        // 浅色模式：深灰色文字
                            borderColor: '#e5e7eb'       // 浅色模式：浅灰色边框
                        },
                        dark: {
                            backgroundColor: '#ffffff',  // 深色模式：白色背景
                            textColor: '#1f2937',        // 深色模式：深灰色文字
                            borderColor: '#e5e7eb'       // 深色模式：浅灰色边框
                        }
                    },
                    icon: '✓',
                    duration: 1000,
                    position: 'top',  // 相对元素：top/bottom/center
                    gap: 10           // 与目标元素的距离
                },
                error: {
                    color: {
                        light: {
                            backgroundColor: '#0d0d0d',  // 浅色模式：黑色背景
                            textColor: '#ffffff',        // 浅色模式：白色文字
                            borderColor: '#0d0d0d'       // 浅色模式：黑色边框
                        },
                        dark: {
                            backgroundColor: '#ffffff',  // 深色模式：白色背景
                            textColor: '#1f2937',        // 深色模式：深灰色文字
                            borderColor: '#e5e7eb'       // 深色模式：浅灰色边框
                        }
                    },
                    icon: '⚠',
                    duration: 1500,
                    position: 'top',
                    gap: 10
                },
                info: {
                    color: {
                        light: {
                            backgroundColor: '#ffffff',  // 浅色模式：白色背景
                            textColor: '#1f2937',        // 浅色模式：深灰色文字
                            borderColor: '#e5e7eb'       // 浅色模式：浅灰色边框
                        },
                        dark: {
                            backgroundColor: '#ffffff',  // 深色模式：白色背景
                            textColor: '#1f2937',        // 深色模式：深灰色文字
                            borderColor: '#e5e7eb'       // 深色模式：浅灰色边框
                        }
                    },
                    icon: '✓',
                    duration: 2000,
                    position: 'top',
                    gap: 10
                },
                warning: {
                    color: {
                        light: {
                            backgroundColor: '#0d0d0d',  // 浅色模式：黑色背景
                            textColor: '#ffffff',        // 浅色模式：白色文字
                            borderColor: '#0d0d0d'       // 浅色模式：黑色边框
                        },
                        dark: {
                            backgroundColor: '#ffffff',  // 深色模式：白色背景
                            textColor: '#1f2937',        // 深色模式：深灰色文字
                            borderColor: '#e5e7eb'       // 深色模式：浅灰色边框
                        }
                    },
                    icon: '⚡',
                    duration: 2000,
                    position: 'top',
                    gap: 10
                }
            }
        };
        
        // 状态管理
        this.state = {
            currentUrl: location.href  // 记录当前 URL
        };
        
        // ✅ 监听 URL 变化，自动清理所有 toast（组件自治）
        this._boundHandleUrlChange = this._handleUrlChange.bind(this);
        this._attachUrlListeners();
        
    }
    
    /**
     * 显示 toast（通用方法）
     * @param {string} type - 类型：success/error/info/warning
     * @param {string} message - 消息文本
     * @param {Object} options - 可选配置
     * @param {HTMLElement} options.target - 目标元素（相对定位）
     * @param {number} options.duration - 显示时长（覆盖默认）
     * @param {string} options.position - 位置（覆盖默认）
     * @param {Object|false} options.color - 颜色配置对象；传 false 时跳过内联配色
     * @param {string} options.icon - 图标
     * @param {number} options.gap - 与目标元素的距离
     * @param {string} options.className - 额外 CSS 类名
     * @param {string} options.iconType - 内置图标类型（如 check，优先于 icon）
     * @param {boolean} options.useClassStyles - 是否跳过默认视觉样式，由 CSS 类接管
     */
    show(type, message, options = {}) {
        try {
            // 参数校验
            if (!type || !this.config.types[type]) {
                return;
            }
            
            if (!message) {
                return;
            }
            
            // 合并配置
            const typeConfig = this.config.types[type];
            const finalConfig = { ...typeConfig, ...options };
            
            // 创建 toast 实例
            const toastInstance = this._createToast(message, finalConfig);
            
            // 添加到队列
            this.queue.push(toastInstance);
            
            // 更新所有 toast 位置
            this._updatePositions();
            
            // 限制队列长度
            if (this.queue.length > this.config.maxVisible) {
                const removed = this.queue.shift();
                this._hideToast(removed, true);
            }
            
            // 显示动画
            requestAnimationFrame(() => {
                toastInstance.element.classList.add('visible');
            });
            
            // 自动隐藏
            toastInstance.timer = setTimeout(() => {
                this._removeFromQueue(toastInstance);
            }, finalConfig.duration);
            
            
        } catch (error) {
        }
    }
    
    /**
     * 快捷方法：成功提示
     */
    success(message, target = null, options = {}) {
        this.show('success', message, { target, ...options });
    }
    
    /**
     * 快捷方法：错误提示
     */
    error(message, target = null, options = {}) {
        this.show('error', message, { target, ...options });
    }
    
    /**
     * 快捷方法：信息提示
     */
    info(message, target = null, options = {}) {
        this.show('info', message, { target, ...options });
    }
    
    /**
     * 快捷方法：警告提示
     */
    warning(message, target = null, options = {}) {
        this.show('warning', message, { target, ...options });
    }
    
    /**
     * 强制隐藏所有 toast
     */
    forceHideAll() {
        
        // 复制队列（避免在遍历时修改）
        const toasts = [...this.queue];
        
        toasts.forEach(toast => {
            this._removeFromQueue(toast, true);
        });
    }
    
    /**
     * 销毁管理器
     */
    destroy() {
        this.forceHideAll();
        this._detachUrlListeners();  // 清理事件监听器
    }
    
    // ==================== 内部方法 ====================
    
    /**
     * 创建 toast 实例
     */
    _createToast(message, config) {
        // 创建 DOM
        const element = document.createElement('div');
        element.className = 'ait-global-toast';
        const useClassStyles = config.useClassStyles === true;
        if (config.className) {
            config.className.split(/\s+/).filter(Boolean).forEach(cls => element.classList.add(cls));
        }
        if (useClassStyles) {
            element.classList.add('ait-global-toast-class-styled');
        }

        const layoutStyles = `
            position: fixed;
            display: flex;
            align-items: center;
            gap: 8px;
            z-index: 2147483647;
            pointer-events: none;
            white-space: nowrap;
            max-width: 400px;
        `;
        const defaultVisualStyles = `
            padding: 10px 16px;
            border-radius: 12px;
            font-size: 13px;
            font-weight: 500;
            box-shadow: 0 4px 14px rgba(0, 0, 0, 0.15), 0 1px 2px rgba(0, 0, 0, 0.06);
            opacity: 0;
            transition: opacity 0.15s ease, transform 0.15s ease;
            transform: translateY(-10px);
        `;

        element.style.cssText = useClassStyles
            ? layoutStyles
            : `${layoutStyles}${defaultVisualStyles}`;
        
        // 应用配置的颜色（根据当前主题模式）
        if (config.color) {
            // 检测当前是浅色还是深色模式
            const isDarkMode = document.documentElement.classList.contains('dark');
            const themeColors = isDarkMode ? config.color.dark : config.color.light;
            
            if (themeColors.backgroundColor) {
                element.style.backgroundColor = themeColors.backgroundColor;
            }
            if (themeColors.textColor) {
                element.style.color = themeColors.textColor;
            }
            if (themeColors.borderColor) {
                element.style.border = `1px solid ${themeColors.borderColor}`;
            }
        }
        
        // 添加图标（如果有）
        if (config.iconType) {
            const iconSpan = this._createIconElement(config.iconType);
            if (iconSpan) element.appendChild(iconSpan);
        } else if (config.icon) {
            const iconSpan = document.createElement('span');
            iconSpan.className = 'ait-global-toast-icon';
            iconSpan.style.fontSize = '16px';
            iconSpan.textContent = config.icon;
            element.appendChild(iconSpan);
        }
        
        // 添加消息文本
        const textSpan = document.createElement('span');
        textSpan.textContent = message;
        element.appendChild(textSpan);
        
        // 添加到 body
        document.body.appendChild(element);
        
        // 返回实例对象
        return {
            element: element,
            config: config,
            timer: null,
            id: Date.now() + Math.random()
        };
    }

    /**
     * 创建内置图标元素，避免通过 HTML 字符串注入图标
     */
    _createIconElement(iconType) {
        if (iconType !== 'check') return null;

        const iconSpan = document.createElement('span');
        iconSpan.className = 'ait-global-toast-icon';

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', '14');
        svg.setAttribute('height', '14');
        svg.setAttribute('viewBox', '0 0 14 14');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('aria-hidden', 'true');

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', 'M2.75 7.25L5.75 10.25L11.25 3.75');
        path.setAttribute('stroke', 'currentColor');
        path.setAttribute('stroke-width', '1.75');
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('stroke-linejoin', 'round');

        svg.appendChild(path);
        iconSpan.appendChild(svg);
        return iconSpan;
    }
    
    /**
     * 更新所有 toast 的位置
     */
    _updatePositions() {
        const centerToasts = this.queue.filter(t => !t.config.target);
        const relativeToasts = this.queue.filter(t => t.config.target);
        
        // 处理屏幕中央的 toast（堆叠）
        centerToasts.forEach((toast, index) => {
            const element = toast.element;
            const rect = element.getBoundingClientRect();
            
            // 从上往下堆叠
            const top = this.config.centerGap + index * (rect.height + this.config.stackGap);
            const left = (window.innerWidth - rect.width) / 2;
            
            element.style.left = `${left}px`;
            element.style.top = `${top}px`;
        });
        
        // 处理相对元素定位的 toast
        relativeToasts.forEach((toast) => {
            const target = toast.config.target;
            
            // 检查元素是否还在 DOM 中
            if (!target || !target.isConnected) {
                this._removeFromQueue(toast, true);
                return;
            }
            
            const element = toast.element;
            const targetRect = target.getBoundingClientRect();
            const toastRect = element.getBoundingClientRect();
            const gap = toast.config.gap || 10;
            
            let x, y;
            
            switch (toast.config.position) {
                case 'top':
                    x = targetRect.left + (targetRect.width - toastRect.width) / 2;
                    y = targetRect.top - toastRect.height - gap;
                    break;
                case 'bottom':
                    x = targetRect.left + (targetRect.width - toastRect.width) / 2;
                    y = targetRect.bottom + gap;
                    break;
                case 'left':
                    x = targetRect.left - toastRect.width - gap;
                    y = targetRect.top + (targetRect.height - toastRect.height) / 2;
                    break;
                case 'right':
                    x = targetRect.right + gap;
                    y = targetRect.top + (targetRect.height - toastRect.height) / 2;
                    break;
                default:
                    x = targetRect.left + (targetRect.width - toastRect.width) / 2;
                    y = targetRect.top - toastRect.height - gap;
            }
            
            // 边界检测
            const padding = 8;
            x = Math.max(padding, Math.min(x, window.innerWidth - toastRect.width - padding));
            y = Math.max(padding, Math.min(y, window.innerHeight - toastRect.height - padding));
            
            element.style.left = `${x}px`;
            element.style.top = `${y}px`;
        });
    }
    
    /**
     * 从队列中移除 toast
     */
    _removeFromQueue(toastInstance, immediate = false) {
        const index = this.queue.indexOf(toastInstance);
        if (index === -1) return;
        
        // 清除定时器
        if (toastInstance.timer) {
            clearTimeout(toastInstance.timer);
            toastInstance.timer = null;
        }
        
        // 从队列移除
        this.queue.splice(index, 1);
        
        // 隐藏
        this._hideToast(toastInstance, immediate);
        
        // 更新其他 toast 位置
        this._updatePositions();
        
    }
    
    /**
     * 隐藏 toast
     */
    _hideToast(toastInstance, immediate = false) {
        const element = toastInstance.element;
        
        if (immediate) {
            // 立即移除
            if (element.parentNode) {
                element.parentNode.removeChild(element);
            }
        } else {
            // 隐藏动画
            element.classList.remove('visible');
            if (toastInstance.config.useClassStyles !== true) {
                element.style.opacity = '0';
                element.style.transform = 'translateY(-10px)';
            }
            
            // 等待动画完成后移除
            setTimeout(() => {
                if (element.parentNode) {
                    element.parentNode.removeChild(element);
                }
            }, toastInstance.config.useClassStyles === true ? 320 : 200);
        }
    }
    
    // ==================== URL 变化监听（组件自治）====================
    
    /**
     * 附加 URL 变化监听器
     * 当 URL 变化时自动清理所有 toast，无需外部调用
     */
    _attachUrlListeners() {
        try {
            window.addEventListener('url:change', this._boundHandleUrlChange);
        } catch (error) {
        }
    }
    
    /**
     * 移除 URL 变化监听器
     */
    _detachUrlListeners() {
        try {
            window.removeEventListener('url:change', this._boundHandleUrlChange);
        } catch (error) {
        }
    }
    
    /**
     * 处理 URL 变化
     * ✅ 组件自治：URL 变化时自动清理所有 toast
     */
    _handleUrlChange() {
        const newUrl = location.href;
        
        // URL 变化了，自动清理所有 toast
        if (newUrl !== this.state.currentUrl) {
            this.state.currentUrl = newUrl;
            
            // 如果有 toast 正在显示，自动清理
            if (this.queue.length > 0) {
                this.forceHideAll();
            }
        }
    }
}

// ==================== CSS 样式注入 ====================

// 动态注入 toast 样式（避免污染全局 CSS）
if (!document.getElementById('ait-global-toast-styles')) {
    const style = document.createElement('style');
    style.id = 'ait-global-toast-styles';
    style.textContent = `
        .ait-global-toast {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        }
        
        .ait-global-toast.visible {
            opacity: 1 !important;
        }

        .ait-global-toast.visible:not(.ait-global-toast-class-styled) {
            transform: translateY(0) !important;
        }
    `;
    document.head.appendChild(style);
}

// ==================== 全局单例初始化 ====================

// 创建全局实例（只在第一次加载时）
if (typeof window.globalToastManager === 'undefined') {
    window.globalToastManager = new GlobalToastManager();
}
