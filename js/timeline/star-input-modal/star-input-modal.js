/**
 * Star Input Modal - 收藏输入对话框（带文件夹选择器）
 * 
 * 专门用于时间轴收藏功能的输入对话框
 * 
 * 特性：
 * - 输入收藏标题
 * - 选择文件夹（支持一级+二级文件夹）
 * - 键盘交互（ESC取消、Enter确认）
 * - 点击遮罩层取消
 * - 深色模式自适应
 * - Promise 异步返回
 * - 自动聚焦和光标定位
 * - ✨ 组件自治：URL 变化时自动关闭并清理 DOM
 * 
 * @example
 * const result = await window.starInputModal.show({
 *     title: '请输入收藏标题',
 *     defaultValue: '默认标题',
 *     folderManager: folderManagerInstance,
 *     defaultFolderId: null
 * });
 * 
 * if (result) {
 *     console.log('标题:', result.value);
 *     console.log('文件夹:', result.folderId);
 * }
 */

class StarInputModal {
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
            currentUrl: location.href
        };
        
        // ✅ 监听 URL 变化，自动关闭 modal
        this._boundHandleUrlChange = this._handleUrlChange.bind(this);
        this._attachUrlListeners();
        
        this._log('Star input modal initialized');
    }
    
    /**
     * 显示收藏输入对话框
     * @param {Object} options - 配置选项
     * @param {string} options.title - 对话框标题（必填）
     * @param {string} options.defaultValue - 默认输入值
     * @param {string} options.placeholder - 输入框占位符
     * @param {boolean} options.required - 是否必填（默认 true）
     * @param {string} options.requiredMessage - 必填验证失败消息
     * @param {number} options.maxLength - 最大长度（默认 100）
     * @param {string} options.confirmText - 确认按钮文本
     * @param {string} options.cancelText - 取消按钮文本
     * @param {Object} options.folderManager - FolderManager 实例（必需）
     * @param {string|null} options.defaultFolderId - 默认选中的文件夹 ID
     * @returns {Promise<Object|null>} 返回 { value: string, folderId: string|null } 或 null
     */
    async show(options = {}) {
        try {
            await TimelineI18n.ready();

            // 参数校验
            if (!options.title) {
                console.error('[StarInputModal] Missing required parameter: title');
                return null;
            }
            
            if (!options.folderManager) {
                console.error('[StarInputModal] Missing required parameter: folderManager');
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
                required: options.required !== undefined ? options.required : true,
                requiredMessage: options.requiredMessage || TimelineI18n.getMessage('mzpxvk'),
                maxLength: options.maxLength || this.config.defaultMaxLength,
                confirmText: options.confirmText || TimelineI18n.getMessage('vkmzpx'),
                cancelText: options.cancelText || TimelineI18n.getMessage('commonCancel'),
                folderManager: options.folderManager,
                defaultFolderId: options.defaultFolderId || null
            };
            
            return await this._showModal(config);
            
        } catch (error) {
            console.error('[StarInputModal] Show failed:', error);
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
        this._log('Destroying star input modal');
        this.forceClose();
        this._detachUrlListeners();
    }
    
    // ==================== 内部方法 ====================
    
    /**
     * 显示 Modal（内部实现）
     */
    async _showModal(config) {
        return new Promise(async (resolve) => {
            // 创建遮罩层
            const overlay = document.createElement('div');
            overlay.className = 'star-input-modal-overlay';
            
            // 创建对话框
            const dialog = document.createElement('div');
            dialog.className = 'star-input-modal';
            
            // 转义 HTML
            const escapeHTML = (str) => {
                const div = document.createElement('div');
                div.textContent = str;
                return div.innerHTML;
            };
            
            // 构建对话框 HTML
            dialog.innerHTML = `
                <div class="star-input-modal-header">
                    <h3>${escapeHTML(config.title)}</h3>
                </div>
                <div class="star-input-modal-body">
                    <div class="star-input-modal-row">
                        <label class="star-input-modal-label">
                            ${TimelineI18n.getMessage('pkmvxz')}<span class="star-input-modal-required">*</span>
                        </label>
                        <input 
                            type="text"
                            class="star-input-modal-input" 
                            placeholder="${escapeHTML(config.placeholder)}" 
                            maxlength="${config.maxLength}"
                            autocomplete="off"
                            value="${escapeHTML(config.defaultValue)}"
                        />
                    </div>
                    <div class="star-input-modal-row">
                        <label class="star-input-modal-label">
                            ${TimelineI18n.getMessage('kxzpmv')}<span class="star-input-modal-required">*</span>
                        </label>
                        <div class="star-input-modal-folder-selector">
                            <span class="star-input-modal-folder-text placeholder">${TimelineI18n.getMessage('folderRequired') || 'Please select a folder'}</span>
                            <svg class="star-input-modal-folder-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                                <polyline points="6 9 12 15 18 9"></polyline>
                            </svg>
                        </div>
                    </div>
                </div>
                <div class="star-input-modal-footer">
                    <button class="star-input-modal-cancel">${escapeHTML(config.cancelText)}</button>
                    <button class="star-input-modal-confirm">${escapeHTML(config.confirmText)}</button>
                </div>
            `;
            
            overlay.appendChild(dialog);
            document.body.appendChild(overlay);
            
            // 获取元素
            const input = dialog.querySelector('.star-input-modal-input');
            const confirmBtn = dialog.querySelector('.star-input-modal-confirm');
            const cancelBtn = dialog.querySelector('.star-input-modal-cancel');
            const folderSelector = dialog.querySelector('.star-input-modal-folder-selector');
            const folderText = dialog.querySelector('.star-input-modal-folder-text');
            
            // 文件夹选择器相关
            let selectedFolderId = config.defaultFolderId || null;
            let selectedFolderPath = '';
            
            // 如果有默认文件夹，显示其路径
            if (selectedFolderId && config.folderManager) {
                selectedFolderPath = await config.folderManager.getFolderPath(selectedFolderId);
                if (selectedFolderPath) {
                    folderText.textContent = selectedFolderPath;
                    folderText.classList.remove('placeholder');
                }
            }
            
            // 点击文件夹选择器显示下拉菜单
            folderSelector.addEventListener('click', async (e) => {
                e.stopPropagation();
                
                if (!window.globalDropdownManager || !config.folderManager) {
                    return;
                }
                
                // 构建文件夹菜单
                const folders = await config.folderManager.getFolders();
                const items = [];
                
                // 构建文件夹树（一级 + 二级）
                const rootFolders = folders.filter(f => !f.parentId).sort((a, b) => a.order - b.order);
                
                for (const rootFolder of rootFolders) {
                    const childFolders = folders
                        .filter(f => f.parentId === rootFolder.id)
                        .sort((a, b) => a.order - b.order);
                    
                    const folderItem = {
                        label: rootFolder.name,
                        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                        </svg>`,
                        onClick: () => {
                            selectedFolderId = rootFolder.id;
                            selectedFolderPath = rootFolder.name;
                            folderText.textContent = rootFolder.name;
                            folderText.classList.remove('placeholder');
                        }
                    };
                    
                    // 构建子菜单
                    const subItems = [];
                    
                    // 添加子文件夹
                    childFolders.forEach(childFolder => {
                        subItems.push({
                            label: childFolder.name,
                            icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                            </svg>`,
                            onClick: () => {
                                selectedFolderId = childFolder.id;
                                selectedFolderPath = `${rootFolder.name} / ${childFolder.name}`;
                                folderText.textContent = selectedFolderPath;
                                folderText.classList.remove('placeholder');
                            }
                        });
                    });
                    
                    // 添加"新建子文件夹"选项
                    // 只有当有子文件夹时才添加分隔线
                    if (childFolders.length > 0) {
                        subItems.push({ type: 'divider' });
                    }
                    subItems.push({
                        label: TimelineI18n.getMessage('vpmzkx'),
                        className: 'create-action',
                        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                            <line x1="12" y1="11" x2="12" y2="17"/>
                            <line x1="9" y1="14" x2="15" y2="14"/>
                        </svg>`,
                        onClick: async () => {
                            const newFolder = await this._createFolder(rootFolder.id, config.folderManager);
                            if (newFolder) {
                                selectedFolderId = newFolder.id;
                                selectedFolderPath = `${rootFolder.name} / ${newFolder.name}`;
                                folderText.textContent = selectedFolderPath;
                                folderText.classList.remove('placeholder');
                            }
                        }
                    });
                    
                    // 添加子菜单
                    folderItem.children = subItems;
                    
                    items.push(folderItem);
                }
                
                // 添加"新建一级文件夹"选项
                items.push({ type: 'divider' });
                items.push({
                    label: TimelineI18n.getMessage('kxvpmz'),
                    className: 'create-action',
                    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                        <line x1="12" y1="11" x2="12" y2="17"/>
                        <line x1="9" y1="14" x2="15" y2="14"/>
                    </svg>`,
                    onClick: async () => {
                        const newFolder = await this._createFolder(null, config.folderManager);
                        if (newFolder) {
                            selectedFolderId = newFolder.id;
                            selectedFolderPath = newFolder.name;
                            folderText.textContent = newFolder.name;
                            folderText.classList.remove('placeholder');
                        }
                    }
                });
                
                // 显示下拉菜单
                window.globalDropdownManager.show({
                    trigger: folderSelector,
                    items: items,
                    position: 'bottom-left',
                    width: 200
                });
            });
            
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
                
                // 文件夹必选
                if (!selectedFolderId) {
                    return {
                        valid: false,
                        message: TimelineI18n.getMessage('folderRequired') || 'Please select a folder'
                    };
                }
                
                return { valid: true };
            };
            
            // 提交输入
            const submitInput = () => {
                const validation = validateInput();
                
                if (!validation.valid) {
                    // 显示错误提示
                    if (window.globalToastManager) {
                        window.globalToastManager.error(validation.message, input);
                    }
                    return;
                }
                
                const value = input.value.trim();
                this._cleanup();
                
                // 返回标题和文件夹ID
                resolve(value ? { value, folderId: selectedFolderId } : null);
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
            
            // ESC 键取消，Ctrl/Cmd+Enter 键确认
            const handleKeyDown = (e) => {
                if (e.key === 'Escape') {
                    cancelInput();
                    document.removeEventListener('keydown', handleKeyDown);
                } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && document.activeElement === input) {
                    // Ctrl+Enter 或 Cmd+Enter 提交
                    e.preventDefault();
                    submitInput();
                }
            };
            document.addEventListener('keydown', handleKeyDown);
            
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
            console.log('[StarInputModal]', ...args);
        }
    }
    
    // ==================== URL 变化监听（组件自治）====================
    
    /**
     * 附加 URL 变化监听器
     */
    _attachUrlListeners() {
        try {
            window.addEventListener('url:change', this._boundHandleUrlChange);
            this._log('URL listeners attached');
        } catch (error) {
            console.error('[StarInputModal] Failed to attach URL listeners:', error);
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
            console.error('[StarInputModal] Failed to detach URL listeners:', error);
        }
    }
    
    /**
     * 处理 URL 变化
     */
    _handleUrlChange() {
        const newUrl = location.href;
        
        if (newUrl !== this.state.currentUrl) {
            this._log('URL changed, auto-closing modal:', this.state.currentUrl, '->', newUrl);
            this.state.currentUrl = newUrl;
            
            if (this.state.isShowing) {
                this.forceClose();
            }
        }
    }
    
    /**
     * 创建文件夹（一级或二级）
     * @param {string|null} parentId - 父文件夹 ID（null = 一级文件夹）
     * @param {Object} folderManager - FolderManager 实例
     * @returns {Promise<Object|null>} 新创建的文件夹对象，失败返回 null
     */
    async _createFolder(parentId, folderManager) {
        try {
            if (!window.folderEditModal || !folderManager) return null;

            const parentPath = parentId ? await folderManager.getFolderPath(parentId) : '';
            const title = parentId
                ? (TimelineI18n.getMessage('xmkvpz') || 'New subfolder in {folderName}').replace('{folderName}', parentPath)
                : TimelineI18n.getMessage('kxvpmz') || 'New Folder';

            const result = await window.folderEditModal.show({
                mode: 'create', title,
                placeholder: TimelineI18n.getMessage('vzkpmx') || 'Folder name',
                requiredMessage: TimelineI18n.getMessage('kmxpvz') || 'Name is required',
                maxLength: 10
            });
            if (!result) return null;

            const exists = await folderManager.isFolderNameExists(result.name, parentId);
            if (exists) {
                window.globalToastManager?.error(TimelineI18n.getMessage('kpvzmx') || 'Name already exists');
                return null;
            }

            const newFolder = await folderManager.createFolder(result.name, parentId, result.icon);
            window.globalToastManager?.success(TimelineI18n.getMessage('xzvkpm') || 'Created');
            return newFolder;
        } catch (error) {
            console.error('[StarInputModal] Failed to create folder:', error);
            if (error.message) window.globalToastManager?.error(error.message);
            return null;
        }
    }
}

// ==================== 全局单例初始化 ====================

// 创建全局实例
if (typeof window.starInputModal === 'undefined') {
    window.starInputModal = new StarInputModal({
        debug: false
    });
}
