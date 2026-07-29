/**
 * Global Popconfirm Manager - 全局确认弹窗管理器
 * 
 * 简洁的确认弹窗，支持 title + content + 两个按钮
 */

class GlobalPopconfirmManager {
    constructor() {
        this.state = {
            isVisible: false,
            resolver: null,
            currentUrl: location.href
        };
        
        this.popconfirm = null;
        
        // 绑定方法
        this._boundHandleClickOutside = this._handleClickOutside.bind(this);
        this._boundHandleEscape = this._handleEscape.bind(this);
        this._boundHandleUrlChange = this._handleUrlChange.bind(this);
        
        // 监听 URL 变化
        this._attachUrlListeners();
        
    }
    
    /**
     * 显示确认弹窗
     * @param {Object} options - 配置选项
     * @param {string} options.title - 标题
     * @param {string} options.content - 内容
     * @param {string} options.confirmText - 确认按钮文本（默认"确定"）
     * @param {string} options.cancelText - 取消按钮文本（默认"取消"）
     * @param {string} options.confirmTextType - 确认按钮类型：'danger'(红色,默认), 'primary'(蓝色), 'success'(绿色), 'default'(黑色)
     * @param {boolean} options.showCancel - 是否显示取消按钮（默认true）
     * @returns {Promise<boolean>} 用户选择：true=确认，false=取消
     */
    show(options = {}) {
        return TimelineI18n.ready().then(() => new Promise((resolve) => {
            // 如果已经有一个弹窗，先关闭
            if (this.state.isVisible) {
                this.hide(false);
            }
            
            // 参数校验
            if (!options.title && !options.content) {
                resolve(false);
                return;
            }
            
            // 合并配置
            const finalConfig = {
                title: options.title || '',
                content: options.content || '',
                confirmText: options.confirmText || TimelineI18n.getMessage('vkmzpx'),
                cancelText: options.cancelText || TimelineI18n.getMessage('commonCancel'),
                confirmTextType: options.confirmTextType || 'danger', // 默认红色（危险操作）
                showCancel: options.showCancel !== false // 默认显示取消按钮
            };
            
            // 保存状态
            this.state.isVisible = true;
            this.state.resolver = resolve;
            
            // 创建弹窗
            this._createPopconfirm(finalConfig);
            
            // 添加全局监听
            setTimeout(() => {
                document.addEventListener('click', this._boundHandleClickOutside);
                document.addEventListener('keydown', this._boundHandleEscape);
            }, 100);
            
        }));
    }
    
    /**
     * 隐藏弹窗
     * @param {boolean} result - 用户选择结果
     */
    hide(result = false) {
        if (!this.state.isVisible) return;
        
        // 移除 DOM
        if (this.popconfirm) {
            this.popconfirm.classList.remove('visible');
            
            setTimeout(() => {
                if (this.popconfirm && this.popconfirm.parentNode) {
                    this.popconfirm.parentNode.removeChild(this.popconfirm);
                }
                this.popconfirm = null;
            }, 200);
        }
        
        // 移除全局监听
        document.removeEventListener('click', this._boundHandleClickOutside);
        document.removeEventListener('keydown', this._boundHandleEscape);
        
        // 解析 Promise
        if (this.state.resolver) {
            this.state.resolver(result);
            this.state.resolver = null;
        }
        
        // 重置状态
        this.state.isVisible = false;
        
    }
    
    /**
     * 创建弹窗元素
     */
    _createPopconfirm(config) {
        // 创建遮罩层
        const overlay = document.createElement('div');
        overlay.className = 'global-popconfirm-overlay';
        
        // 创建弹窗容器
        const container = document.createElement('div');
        container.className = 'global-popconfirm';
        
        // 创建内容区
        const content = document.createElement('div');
        content.className = 'popconfirm-content';
        
        // 标题
        if (config.title) {
            const title = document.createElement('div');
            title.className = 'popconfirm-title';
            title.textContent = config.title;
            content.appendChild(title);
        }
        
        // 内容
        if (config.content) {
            const text = document.createElement('div');
            text.className = 'popconfirm-text';
            text.textContent = config.content;
            content.appendChild(text);
        }
        
        // 按钮组
        const actions = document.createElement('div');
        actions.className = 'popconfirm-actions';
        
        // 取消按钮（可选）
        if (config.showCancel) {
            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'popconfirm-btn popconfirm-btn-cancel';
            cancelBtn.textContent = config.cancelText;
            cancelBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.hide(false);
            });
            actions.appendChild(cancelBtn);
        }
        
        // 确认按钮
        const confirmBtn = document.createElement('button');
        confirmBtn.className = `popconfirm-btn popconfirm-btn-confirm popconfirm-btn-${config.confirmTextType}`;
        confirmBtn.textContent = config.confirmText;
        confirmBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.hide(true);
        });
        actions.appendChild(confirmBtn);
        
        content.appendChild(actions);
        container.appendChild(content);
        overlay.appendChild(container);
        
        // 添加到页面
        document.body.appendChild(overlay);
        
        // 触发动画
        requestAnimationFrame(() => {
            overlay.classList.add('visible');
        });
        
        this.popconfirm = overlay;
    }
    
    /**
     * 处理点击外部
     */
    _handleClickOutside(e) {
        if (!this.popconfirm) return;
        
        const container = this.popconfirm.querySelector('.global-popconfirm');
        if (container && !container.contains(e.target)) {
            this.hide(false);
        }
    }
    
    /**
     * 处理 ESC 键
     */
    _handleEscape(e) {
        if (e.key === 'Escape') {
            this.hide(false);
        }
    }
    
    /**
     * 监听 URL 变化
     */
    _attachUrlListeners() {
        window.addEventListener('url:change', this._boundHandleUrlChange);
    }
    
    /**
     * 处理 URL 变化
     */
    _handleUrlChange() {
        if (location.href !== this.state.currentUrl) {
            this.state.currentUrl = location.href;
            if (this.state.isVisible) {
                this.hide(false);
            }
        }
    }
    
    /**
     * 销毁管理器
     */
    destroy() {
        this.hide(false);
        window.removeEventListener('url:change', this._boundHandleUrlChange);
    }
}

// ==================== 全局单例 ====================

if (!window.globalPopconfirmManager) {
    window.globalPopconfirmManager = new GlobalPopconfirmManager();
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = GlobalPopconfirmManager;
}
