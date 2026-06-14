/**
 * Global Input Modal Manager - 全局输入对话框管理器
 * 
 * 负责管理整个扩展的输入对话框，提供统一的用户输入交互
 * 
 * 特性：
 * - 全局单例模式
 * - 完全可配置（标题、默认值、占位符、验证）
 * - 键盘交互（ESC取消、Enter确认）
 * - 点击遮罩层取消
 * - 深色模式自适应
 * - Promise 异步返回
 * - 自动聚焦和光标定位
 * - ✨ 组件自治：URL 变化时自动关闭并清理 DOM（无需外部调用）
 * 
 * @example
 * // 基本用法
 * const result = await window.globalInputModal.show({
 *     title: '请输入标题',
 *     defaultValue: 'Hello',
 *     placeholder: '请输入...',
 *     required: true,
 *     requiredMessage: '不能为空'
 * });
 * 
 * if (result) {
 *     console.log('用户输入:', result);
 * } else {
 *     console.log('用户取消了');
 * }
 */

class GlobalInputModal {
    constructor(options = {}) {
        // 配置
        this.config = {
            debug: options.debug || false,
            defaultMaxLength: 100,
            animationDuration: 200
        };
        
        // 状态
        this.state = {
            isShowing: false,
            currentOverlay: null,
            currentResolve: null,
            currentUrl: location.href  // 记录当前 URL
        };
        
        // ✅ 监听 URL 变化，自动关闭 modal（组件自治）
        this._boundHandleUrlChange = this._handleUrlChange.bind(this);
        this._attachUrlListeners();
        
        this._log('Input modal manager initialized');
    }
    
    /**
     * 显示输入对话框
     * @param {Object} options - 配置选项
     * @param {string} options.title - 对话框标题（必填）
     * @param {string} options.defaultValue - 默认输入值
     * @param {string} options.placeholder - 输入框占位符
     * @param {boolean} options.required - 是否必填（默认 false）
     * @param {string} options.requiredMessage - 必填验证失败消息
     * @param {number} options.maxLength - 最大长度（默认 100）
     * @param {Function} options.validator - 自定义验证函数 (value) => { valid: boolean, message: string }
     * @param {string} options.confirmText - 确认按钮文本（默认从 i18n 获取）
     * @param {string} options.cancelText - 取消按钮文本（默认从 i18n 获取）
     * @returns {Promise<string|null>} 返回用户输入的值，取消则返回 null
     */
    async show(options = {}) {
        try {
            await TimelineI18n.ready();

            // 参数校验
            if (!options.title) {
                console.error('[InputModal] Missing required parameter: title');
                return null;
            }
            
            // 防止重复显示
            if (this.state.isShowing) {
                this._log('Modal already showing, ignoring');
                return null;
            }
            
            // 合并配置
            const config = {
                title: options.title,
                defaultValue: options.defaultValue || '',
                placeholder: options.placeholder || TimelineI18n.getMessage('zmxvkp'),
                required: options.required !== undefined ? options.required : false,
                requiredMessage: options.requiredMessage || TimelineI18n.getMessage('pzmkvx'),
                maxLength: options.maxLength || this.config.defaultMaxLength,
                validator: options.validator || null,
                confirmText: options.confirmText || TimelineI18n.getMessage('vkmzpx'),
                cancelText: options.cancelText || TimelineI18n.getMessage('commonCancel')
            };
            
            return await this._showModal(config);
            
        } catch (error) {
            console.error('[InputModal] Show failed:', error);
            return null;
        }
    }
    
    /**
     * 强制关闭当前显示的 modal
     */
    forceClose() {
        if (this.state.isShowing && this.state.currentResolve) {
            this._cleanup();
            this.state.currentResolve(null);
            this.state.currentResolve = null;
        }
    }
    
    /**
     * 销毁管理器
     */
    destroy() {
        this._log('Destroying input modal manager');
        this.forceClose();
        this._detachUrlListeners();  // 清理事件监听器
    }
    
    // ==================== 内部方法 ====================
    
    /**
     * 显示 Modal（内部实现）
     */
    async _showModal(config) {
        return new Promise((resolve) => {
            // 创建遮罩层
            const overlay = document.createElement('div');
            overlay.className = 'global-input-modal-overlay';
            
            // 创建对话框
            const dialog = document.createElement('div');
            dialog.className = 'global-input-modal';
            
            // 转义 HTML
            const escapeHTML = (str) => {
                const div = document.createElement('div');
                div.textContent = str;
                return div.innerHTML;
            };
            
            dialog.innerHTML = `
                <div class="global-input-modal-header">
                    <h3>${escapeHTML(config.title)}</h3>
                </div>
                <div class="global-input-modal-body">
                    <input 
                        type="text" 
                        class="global-input-modal-input" 
                        placeholder="${escapeHTML(config.placeholder)}" 
                        value="${escapeHTML(config.defaultValue)}" 
                        maxlength="${config.maxLength}"
                        autocomplete="off"
                    />
                </div>
                <div class="global-input-modal-footer">
                    <button class="global-input-modal-cancel">${escapeHTML(config.cancelText)}</button>
                    <button class="global-input-modal-confirm">${escapeHTML(config.confirmText)}</button>
                </div>
            `;
            
            overlay.appendChild(dialog);
            document.body.appendChild(overlay);
            
            // 获取元素
            const input = dialog.querySelector('.global-input-modal-input');
            const confirmBtn = dialog.querySelector('.global-input-modal-confirm');
            const cancelBtn = dialog.querySelector('.global-input-modal-cancel');
            
            // 更新状态
            this.state.isShowing = true;
            this.state.currentOverlay = overlay;
            this.state.currentResolve = resolve;
            
            // 显示对话框（带动画）
            requestAnimationFrame(() => {
                overlay.classList.add('visible');
                input.focus();
                
                // 如果有默认值，将光标定位到末尾
                if (config.defaultValue) {
                    setTimeout(() => {
                        const length = input.value.length;
                        input.setSelectionRange(length, length);
                    }, 0);
                }
            });
            
            // 验证输入
            const validateInput = () => {
                const value = input.value.trim();
                
                // 必填验证
                if (config.required && !value) {
                    return {
                        valid: false,
                        message: config.requiredMessage
                    };
                }
                
                // 自定义验证
                if (config.validator && value) {
                    return config.validator(value);
                }
                
                return { valid: true };
            };
            
            // 提交输入
            const submitInput = () => {
                const validation = validateInput();
                
                if (!validation.valid) {
                    // 显示错误提示（使用全局 toast 管理器）
                    if (window.globalToastManager) {
                        window.globalToastManager.error(validation.message, input);
                    }
                    return;
                }
                
                const value = input.value.trim();
                this._cleanup();
                resolve(value || null);
            };
            
            // 取消输入
            const cancelInput = () => {
                this._cleanup();
                resolve(null);
            };
            
            // 确定按钮
            confirmBtn.addEventListener('click', submitInput);
            
            // 取消按钮
            cancelBtn.addEventListener('click', cancelInput);
            
            // 点击遮罩层取消
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    cancelInput();
                }
            });
            
            this._log('Modal shown:', config);
        });
    }
    
    /**
     * 清理 DOM 和状态
     */
    _cleanup() {
        if (!this.state.currentOverlay) return;
        
        const overlay = this.state.currentOverlay;
        
        // 隐藏动画
        overlay.classList.remove('visible');
        
        // 等待动画完成后移除 DOM
        setTimeout(() => {
            if (overlay.parentNode) {
                overlay.parentNode.removeChild(overlay);
            }
        }, this.config.animationDuration);
        
        // 重置状态
        this.state.isShowing = false;
        this.state.currentOverlay = null;
        this.state.currentResolve = null;
        
        this._log('Modal cleaned up');
    }
    
    /**
     * 调试日志
     */
    _log(...args) {
        if (this.config.debug) {
            console.log('[InputModal]', ...args);
        }
    }
    
    // ==================== URL 变化监听（组件自治）====================
    
    /**
     * 附加 URL 变化监听器
     * 当 URL 变化时自动关闭 modal，无需外部调用
     */
    _attachUrlListeners() {
        try {
            window.addEventListener('url:change', this._boundHandleUrlChange);
            this._log('URL listeners attached');
        } catch (error) {
            console.error('[InputModal] Failed to attach URL listeners:', error);
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
            console.error('[InputModal] Failed to detach URL listeners:', error);
        }
    }
    
    /**
     * 处理 URL 变化
     * ✅ 组件自治：URL 变化时自动关闭 modal
     */
    _handleUrlChange() {
        const newUrl = location.href;
        
        // URL 变化了，自动关闭 modal
        if (newUrl !== this.state.currentUrl) {
            this._log('URL changed, auto-closing modal:', this.state.currentUrl, '->', newUrl);
            this.state.currentUrl = newUrl;
            
            // 如果 modal 正在显示，自动关闭
            if (this.state.isShowing) {
                this.forceClose();
            }
        }
    }
}

// ==================== 全局单例初始化 ====================

// 创建全局实例（只在第一次加载时）
if (typeof window.globalInputModal === 'undefined') {
    window.globalInputModal = new GlobalInputModal({
        debug: false  // 生产环境关闭，调试时可设为 true
    });
}
