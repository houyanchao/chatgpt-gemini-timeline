/**
 * Timeline Settings Tab - 时间轴设置
 * 
 * 功能：
 * - 提供开关控制上下键跳转对话节点功能
 * - 按↑↓方向键快速浏览对话历史
 * - 控制各平台的箭头键导航功能
 */

class TimelineSettingsTab extends BaseTab {
    constructor() {
        super();
        this.id = 'timeline';
        this.name = chrome.i18n.getMessage('pxkmvz');
        this.icon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <circle cx="12" cy="12" r="9"/>
        </svg>`;
    }
    
    /**
     * 渲染设置内容
     */
    render() {
        const container = document.createElement('div');
        container.className = 'timeline-settings';

        const divider = `<div class="divider"></div>`;

        // ==================== 滚动区域 ====================
        const scrollArea = document.createElement('div');
        scrollArea.className = 'timeline-settings-scroll';
        scrollArea.innerHTML = `
            <div class="setting-section">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">${chrome.i18n.getMessage('chatTimeLabelTitle')}</div>
                        <div class="setting-hint">${chrome.i18n.getMessage('chatTimeLabelHint')}</div>
                    </div>
                    <label class="ait-toggle-switch">
                        <input type="checkbox" id="chat-time-label-toggle">
                        <span class="ait-toggle-slider"></span>
                    </label>
                </div>
            </div>
            ${divider}
            <div class="setting-section">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">${chrome.i18n.getMessage('timelineThemeColorLabel') || '时间轴主题色'}</div>
                        <div class="setting-hint">${chrome.i18n.getMessage('timelineThemeColorHint') || '为不同平台设置时间轴激活节点的主题色'}</div>
                    </div>
                    <button class="starred-manage-btn timeline-theme-color-manage-btn">${chrome.i18n.getMessage('timelineThemeColorManageButton') || '设置'}</button>
                </div>
            </div>
            ${divider}
            <div class="setting-section">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">${chrome.i18n.getMessage('timelineAICompleteToastTitle') || '回复完成提醒'}</div>
                        <div class="setting-hint">${chrome.i18n.getMessage('timelineAICompleteToastHint') || 'AI 回复完成且当前不在最新位置时显示提醒'}</div>
                    </div>
                    <label class="ait-toggle-switch">
                        <input type="checkbox" id="ai-complete-toast-toggle">
                        <span class="ait-toggle-slider"></span>
                    </label>
                </div>
            </div>
            ${divider}
            <div class="setting-section">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label"><svg class="setting-label-icon setting-label-icon-pin" viewBox="0 0 24 24" fill="rgb(255, 125, 3)" stroke="rgb(255, 125, 3)" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 1 1 0 0 0 1-1V4a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1 1 1 0 0 1 1 1z"/></svg>${chrome.i18n.getMessage('pxmzkv')}</div>
                        <div class="setting-hint">${chrome.i18n.getMessage('kzxvpm')}</div>
                    </div>
                    <label class="ait-toggle-switch">
                        <input type="checkbox" id="long-press-mark-toggle">
                        <span class="ait-toggle-slider"></span>
                    </label>
                </div>
            </div>
            ${divider}
            <div class="setting-section">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">${chrome.i18n.getMessage('notepadTitle')}</div>
                        <div class="setting-hint">${chrome.i18n.getMessage('notepadToggleHint')}</div>
                    </div>
                    <label class="ait-toggle-switch">
                        <input type="checkbox" id="notepad-toggle">
                        <span class="ait-toggle-slider"></span>
                    </label>
                </div>
            </div>
            ${divider}
            <div class="setting-section">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">${chrome.i18n.getMessage('vkpmzx')}</div>
                        <div class="setting-hint">${chrome.i18n.getMessage('xpvmkz')}</div>
                    </div>
                    <label class="ait-toggle-switch">
                        <input type="checkbox" id="arrow-keys-nav-toggle">
                        <span class="ait-toggle-slider"></span>
                    </label>
                </div>
            </div>
        ${divider}
            <div class="setting-section">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label"><svg class="setting-label-icon" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;"><path d="M12 20h9"/><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z"/></svg>${chrome.i18n.getMessage('customPlatformTitle') || '自定义平台'}</div>
                        <div class="setting-hint">${chrome.i18n.getMessage('customPlatformHint') || '为其他 AI 网站添加自定义时间轴支持'}</div>
                    </div>
                    <button class="starred-manage-btn custom-platform-manage-btn">${chrome.i18n.getMessage('customPlatformManageButton') || '管理'}</button>
                </div>
            </div>
        `;
        container.appendChild(scrollArea);

        // ==================== 底部悬浮区域 ====================
        const bottomDivider = document.createElement('div');
        bottomDivider.className = 'timeline-settings-bottom-divider';
        container.appendChild(bottomDivider);

        const bottomSection = document.createElement('div');
        bottomSection.className = 'timeline-settings-bottom';
        bottomSection.innerHTML = `
            <div class="setting-item">
                <div class="setting-info">
                    <div class="setting-label">${chrome.i18n.getMessage('timelineDisplayLabel') || '显示时间轴'}</div>
                    <div class="setting-hint">${chrome.i18n.getMessage('mzkvxp')}</div>
                </div>
                <button class="starred-manage-btn">${chrome.i18n.getMessage('promptBtnSwitch') || '开关'}</button>
            </div>
        `;
        container.appendChild(bottomSection);

        this.addEventListener(bottomSection.querySelector('.starred-manage-btn'), 'click', () => {
            this._showPlatformManageModal();
        });

        this.addEventListener(scrollArea.querySelector('.timeline-theme-color-manage-btn'), 'click', () => {
            this._showThemeColorModal();
        });

        this.addEventListener(scrollArea.querySelector('.custom-platform-manage-btn'), 'click', () => {
            this._showCustomPlatformManageModal();
        });

        return container;
    }
    
    /**
     * Tab 激活时加载状态
     */
    async mounted() {
        super.mounted();
        
        // 0. 处理显示对话时间开关（默认开启）
        const chatTimeLabelCheckbox = document.getElementById('chat-time-label-toggle');
        if (chatTimeLabelCheckbox) {
            // 读取当前状态（默认开启）
            try {
                const result = await chrome.storage.local.get('chatTimeLabelEnabled');
                // 默认值为 true（开启）
                chatTimeLabelCheckbox.checked = result.chatTimeLabelEnabled !== false;
            } catch (e) {
                console.error('[TimelineSettingsTab] Failed to load chat time label state:', e);
                chatTimeLabelCheckbox.checked = true;
            }
            
            // 监听开关变化
            this.addEventListener(chatTimeLabelCheckbox, 'change', async (e) => {
                try {
                    const enabled = e.target.checked;
                    
                    // 保存到 Storage
                    await chrome.storage.local.set({ chatTimeLabelEnabled: enabled });
                    
                    // 立即更新当前页面的时间标签显示
                    if (window.chatTimeRecorder) {
                        window.chatTimeRecorder.updateLabelVisibility(enabled);
                    }
                } catch (e) {
                    console.error('[TimelineSettingsTab] Failed to save chat time label state:', e);
                    chatTimeLabelCheckbox.checked = !chatTimeLabelCheckbox.checked;
                }
            });
        }
        
        // 1. 处理 AI 回复完成提醒开关（默认开启）
        const aiCompleteToastCheckbox = document.getElementById('ai-complete-toast-toggle');
        if (aiCompleteToastCheckbox) {
            try {
                const result = await chrome.storage.local.get('timelineAICompleteToastEnabled');
                aiCompleteToastCheckbox.checked = result.timelineAICompleteToastEnabled !== false;
            } catch (e) {
                console.error('[TimelineSettingsTab] Failed to load AI complete toast state:', e);
                aiCompleteToastCheckbox.checked = true;
            }

            this.addEventListener(aiCompleteToastCheckbox, 'change', async (e) => {
                try {
                    const enabled = e.target.checked;
                    await chrome.storage.local.set({ timelineAICompleteToastEnabled: enabled });
                } catch (e) {
                    console.error('[TimelineSettingsTab] Failed to save AI complete toast state:', e);
                    aiCompleteToastCheckbox.checked = !aiCompleteToastCheckbox.checked;
                }
            });
        }

        // 1. 处理闪记开关（默认开启）
        const notepadCheckbox = document.getElementById('notepad-toggle');
        if (notepadCheckbox) {
            try {
                const result = await chrome.storage.local.get('aitNotepadEnabled');
                notepadCheckbox.checked = result.aitNotepadEnabled !== false;
            } catch (e) {
                notepadCheckbox.checked = true;
            }
            
            this.addEventListener(notepadCheckbox, 'change', async (e) => {
                try {
                    const enabled = e.target.checked;
                    await chrome.storage.local.set({ aitNotepadEnabled: enabled });
                    
                    // 立即更新时间轴上闪记按钮的显隐
                    const notepadBtn = document.querySelector('.ait-notepad-btn');
                    if (notepadBtn) {
                        notepadBtn.style.display = enabled ? 'flex' : 'none';
                    }
                    // 关闭时同时收起面板
                    if (!enabled && window.notepadManager && window.notepadManager.isOpen) {
                        window.notepadManager.close();
                    }
                } catch (e) {
                    notepadCheckbox.checked = !notepadCheckbox.checked;
                }
            });
        }
        
        // 2. 处理长按标记重点对话开关（默认开启，无法关闭）
        const longPressCheckbox = document.getElementById('long-press-mark-toggle');
        if (longPressCheckbox) {
            // 设置为默认开启
            longPressCheckbox.checked = true;
            
            // 监听点击事件，阻止关闭并显示提示
            this.addEventListener(longPressCheckbox, 'change', (e) => {
                // 阻止关闭，保持开启状态
                e.target.checked = true;
                
                // 显示 toast 提示
                if (window.globalToastManager) {
                    const message = chrome.i18n.getMessage('qoytxz');
                    window.globalToastManager.info(message, e.target, {
                        duration: 2200,
                        icon: '',  // 不显示图标
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
                        }
                    });
                }
            });
        }
        
        // 2. 处理全局箭头键导航开关
        const checkbox = document.getElementById('arrow-keys-nav-toggle');
        if (checkbox) {
            // 读取当前状态（默认开启）
            try {
                const result = await chrome.storage.local.get('arrowKeysNavigationEnabled');
                // 默认值为 true（开启）
                checkbox.checked = result.arrowKeysNavigationEnabled !== false;
            } catch (e) {
                console.error('[TimelineSettingsTab] Failed to load state:', e);
                // 读取失败，默认开启
                checkbox.checked = true;
            }
            
            // 监听开关变化
            this.addEventListener(checkbox, 'change', async (e) => {
                try {
                    const enabled = e.target.checked;
                    
                    // 保存到 Storage
                    await chrome.storage.local.set({ arrowKeysNavigationEnabled: enabled });
                } catch (e) {
                    console.error('[TimelineSettingsTab] Failed to save state:', e);
                    
                    // 保存失败，恢复checkbox状态
                    checkbox.checked = !checkbox.checked;
                }
            });
        }
        
        
    }

    async _showPlatformManageModal() {
        const platforms = getPlatformsByFeature('timeline');
        const result = await chrome.storage.local.get('timelinePlatformSettings');
        const settings = result.timelinePlatformSettings || {};

        const overlay = document.createElement('div');
        overlay.className = 'starred-platform-modal-overlay';

        const items = platforms.map(p => {
            const logoHtml = p.logoPath
                ? `<img src="${chrome.runtime.getURL(p.logoPath)}" alt="${p.name}">`
                : `<span>${p.name.charAt(0)}</span>`;
            return `
                <div class="starred-platform-item">
                    <div class="starred-platform-info">
                        <div class="starred-platform-logo">${logoHtml}</div>
                        <span class="starred-platform-name">${p.name}</span>
                    </div>
                    <label class="ait-toggle-switch">
                        <input type="checkbox" data-platform-id="${p.id}" ${settings[p.id] !== false ? 'checked' : ''}>
                        <span class="ait-toggle-slider"></span>
                    </label>
                </div>`;
        }).join('');

        overlay.innerHTML = `
            <div class="starred-platform-modal">
                <div class="starred-platform-modal-header">
                    <span>${chrome.i18n.getMessage('mkvzpx')}</span>
                    <button class="starred-platform-modal-close">✕</button>
                </div>
                <div class="starred-platform-modal-body">${items}</div>
            </div>`;

        document.body.appendChild(overlay);

        const close = () => overlay.remove();
        overlay.querySelector('.starred-platform-modal-close').addEventListener('click', close);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

        overlay.querySelectorAll('input[data-platform-id]').forEach(cb => {
            cb.addEventListener('change', async () => {
                const cur = (await chrome.storage.local.get('timelinePlatformSettings')).timelinePlatformSettings || {};
                cur[cb.dataset.platformId] = cb.checked;
                await chrome.storage.local.set({ timelinePlatformSettings: cur });

                if (cb.dataset.platformId === 'grok' && !cb.checked) {
                    try {
                        const el = document.querySelector('.group\\/timeline');
                        if (el) el.style.display = '';
                    } catch {}
                }
            });
        });
    }

    async _showThemeColorModal() {
        const platforms = getPlatformsByFeature('timeline');
        const result = await chrome.storage.local.get('timelineActiveColorByPlatform');
        const activeColorByPlatform = result.timelineActiveColorByPlatform || {};
        const activeColorOptions = getTimelineActiveColorOptions();
        const themeColorLabel = chrome.i18n.getMessage('timelineThemeColorLabel') || '时间轴主题色';

        const overlay = document.createElement('div');
        overlay.className = 'starred-platform-modal-overlay';

        const items = platforms.map(p => {
            const logoHtml = p.logoPath
                ? `<img src="${chrome.runtime.getURL(p.logoPath)}" alt="${p.name}">`
                : `<span>${p.name.charAt(0)}</span>`;
            const selectedColorId = resolveTimelineActiveColorId(p.id, activeColorByPlatform);
            const colorItems = activeColorOptions.map(option => `
                <button
                    type="button"
                    class="timeline-active-color-btn ${option.id === selectedColorId ? 'selected' : ''}"
                    data-platform-id="${p.id}"
                    data-color-id="${option.id}"
                    style="--timeline-color-option: ${option.color};"
                    aria-label="${themeColorLabel} ${option.color}"
                    aria-pressed="${option.id === selectedColorId ? 'true' : 'false'}"
                ></button>
            `).join('');

            return `
                <div class="timeline-theme-color-item">
                    <div class="starred-platform-info timeline-theme-color-platform">
                        <div class="starred-platform-logo">${logoHtml}</div>
                        <span class="starred-platform-name">${p.name}</span>
                    </div>
                    <div class="timeline-active-color-options" aria-label="${themeColorLabel}">
                        ${colorItems}
                    </div>
                </div>`;
        }).join('');

        overlay.innerHTML = `
            <div class="starred-platform-modal timeline-theme-color-modal">
                <div class="starred-platform-modal-header">
                    <span>${themeColorLabel}</span>
                    <button class="starred-platform-modal-close">✕</button>
                </div>
                <div class="starred-platform-modal-body">${items}</div>
            </div>`;

        document.body.appendChild(overlay);

        const close = () => overlay.remove();
        overlay.querySelector('.starred-platform-modal-close').addEventListener('click', close);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

        const setSelectedColor = (platformId, colorId) => {
            overlay.querySelectorAll(`.timeline-active-color-btn[data-platform-id="${platformId}"]`).forEach(btn => {
                const selected = btn.dataset.colorId === colorId;
                btn.classList.toggle('selected', selected);
                btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
            });
        };

        overlay.querySelectorAll('.timeline-active-color-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const platformId = btn.dataset.platformId;
                const colorId = btn.dataset.colorId;
                if (!isTimelineActiveColorId(colorId)) return;

                try {
                    const result = await chrome.storage.local.get('timelineActiveColorByPlatform');
                    const cur = result.timelineActiveColorByPlatform || {};
                    if (colorId === getDefaultTimelineActiveColorId(platformId)) {
                        delete cur[platformId];
                    } else {
                        cur[platformId] = colorId;
                    }
                    await chrome.storage.local.set({ timelineActiveColorByPlatform: cur });
                    setSelectedColor(platformId, colorId);
                } catch (e) {
                    console.error('[TimelineSettingsTab] Failed to save active color:', e);
                }
            });
        });
    }

    // ==================== 自定义平台管理 ====================

    /**
     * 存储 key
     */
    _customStorageKey = 'customTimelineAdapters';

    /**
     * 生成唯一 ID
     * @returns {string}
     */
    _generateId() {
        return 'custom_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);
    }

    /**
     * 打开自定义平台管理弹窗
     */
    async _showCustomPlatformManageModal() {
        const configs = await this._loadCustomConfigs();

        const overlay = document.createElement('div');
        overlay.className = 'starred-platform-modal-overlay';

        const itemList = configs.length === 0
            ? `<div class="custom-platform-empty">${chrome.i18n.getMessage('customPlatformEmpty') || '暂无自定义平台，点击下方按钮添加'}</div>`
            : configs.map(cfg => {
                const hostnameStr = this._escapeHtml(cfg.hostname || '');
                const selectorStr = this._escapeHtml(cfg.userMessageSelector || '');
                return `
                <div class="custom-platform-item" data-id="${this._escapeHtml(cfg.id)}">
                    <div class="custom-platform-info">
                        <div class="custom-platform-name">${this._escapeHtml(cfg.name || cfg.id)}</div>
                        <div class="custom-platform-detail">
                            <span class="custom-platform-hostname">🌐 ${hostnameStr}</span>
                            <span class="custom-platform-selector">🔍 ${selectorStr}</span>
                        </div>
                    </div>
                    <div class="custom-platform-actions">
                        <button class="custom-platform-edit-btn" data-id="${this._escapeHtml(cfg.id)}" title="${chrome.i18n.getMessage('edit') || '编辑'}">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button class="custom-platform-delete-btn" data-id="${this._escapeHtml(cfg.id)}" title="${chrome.i18n.getMessage('delete') || '删除'}">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        </button>
                    </div>
                </div>`;
            }).join('');

        overlay.innerHTML = `
            <div class="starred-platform-modal custom-platform-modal">
                <div class="starred-platform-modal-header">
                    <span>${chrome.i18n.getMessage('customPlatformTitle') || '自定义平台管理'}</span>
                    <button class="starred-platform-modal-close">✕</button>
                </div>
                <div class="starred-platform-modal-body custom-platform-body">
                    ${itemList}
                </div>
                <div class="custom-platform-footer">
                    <button class="starred-manage-btn custom-platform-add-btn">${chrome.i18n.getMessage('customPlatformAddButton') || '+ 添加新平台'}</button>
                </div>
            </div>`;

        document.body.appendChild(overlay);

        const close = () => overlay.remove();
        overlay.querySelector('.starred-platform-modal-close').addEventListener('click', close);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

        /**
         * 打开编辑弹窗时，隐藏管理弹窗（避免两个弹窗叠加遮挡）
         * 编辑弹窗关闭后刷新管理列表
         */
        const openEdit = async (cfg) => {
            overlay.style.display = 'none'; // 先隐藏管理弹窗
            await this._showCustomPlatformEditModal(cfg);
            // 编辑弹窗关闭后，销毁管理弹窗并重新打开（刷新列表）
            close();
            this._showCustomPlatformManageModal();
        };

        // 添加按钮
        overlay.querySelector('.custom-platform-add-btn').addEventListener('click', () => {
            openEdit(null);
        });

        // 编辑按钮
        overlay.querySelectorAll('.custom-platform-edit-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                const cfg = configs.find(c => c.id === id);
                if (cfg) {
                    openEdit(cfg);
                }
            });
        });

        // 删除按钮
        overlay.querySelectorAll('.custom-platform-delete-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                if (confirm(chrome.i18n.getMessage('customPlatformDeleteConfirm') || '确定要删除这个自定义平台吗？')) {
                    const updated = configs.filter(c => c.id !== id);
                    await chrome.storage.local.set({ [this._customStorageKey]: updated });
                    // 通知 registry 重新加载
                    close();
                    this._showCustomPlatformManageModal();
                }
            });
        });
    }

    /**
     * 打开自定义平台编辑弹窗（添加/编辑）
     * 返回 Promise，弹窗关闭后 resolve，确保调用方 await 能正确等待
     * @param {Object|null} config - 编辑时传入现有配置，新建时传 null
     * @returns {Promise<void>}
     */
    _showCustomPlatformEditModal(config) {
        return new Promise((resolve) => { this._showCustomPlatformEditModalImpl(config, resolve); });
    }

    /**
     * 编辑弹窗实现（内部方法）
     * @param {Object|null} config
     * @param {Function} onClose - 弹窗关闭时调用
     */
    async _showCustomPlatformEditModalImpl(config, onClose) {
        const isEdit = !!config;
        const defaults = {
            id: '',
            name: '',
            hostname: '',
            turnIdPrefix: '',
            userMessageSelector: '',
            textSelector: '',
            conversationRoute: '',
            conversationIdRegex: '',
            timeLabelTargetSelector: '',
            timeLabelPosition: null,
            timelinePosition: null,
            scrollOffset: 30,
            aiGeneratingSelector: '',
            aiGeneratingCheck: 'exists',
            starChatButtonSelector: '',
            defaultChatThemeSelector: ''
        };

        const cfg = config ? { ...defaults, ...config } : defaults;

        const overlay = document.createElement('div');
        overlay.className = 'starred-platform-modal-overlay';

        // 时间标签位置 JSON 字符串
        const timeLabelPosStr = cfg.timeLabelPosition
            ? JSON.stringify(cfg.timeLabelPosition)
            : '';
        const timelinePosStr = cfg.timelinePosition
            ? JSON.stringify(cfg.timelinePosition)
            : '';

        const title = isEdit
            ? (chrome.i18n.getMessage('customPlatformEditTitle') || '编辑自定义平台')
            : (chrome.i18n.getMessage('customPlatformAddTitle') || '添加自定义平台');

        overlay.innerHTML = `
            <div class="starred-platform-modal custom-platform-edit-modal">
                <div class="starred-platform-modal-header">
                    <span>${title}</span>
                    <button class="starred-platform-modal-close">✕</button>
                </div>
                <div class="starred-platform-modal-body custom-platform-edit-body">
                    <div class="custom-platform-form">
                        <div class="custom-platform-form-section">
                            <div class="custom-platform-form-section-title">${chrome.i18n.getMessage('customPlatformBasicConfig') || '基本信息'}</div>
                            <div class="custom-platform-form-group">
                                <label>${chrome.i18n.getMessage('customPlatformNameLabel') || '平台名称'}</label>
                                <input type="text" class="custom-platform-input" data-field="name" value="${this._escapeHtml(cfg.name)}" placeholder="${chrome.i18n.getMessage('customPlatformNamePlaceholder') || '例如：我的 AI 助手'}">
                            </div>
                            <div class="custom-platform-form-group">
                                <label>${chrome.i18n.getMessage('customPlatformHostnameLabel') || '域名匹配'}</label>
                                <input type="text" class="custom-platform-input" data-field="hostname" value="${this._escapeHtml(cfg.hostname)}" placeholder="${chrome.i18n.getMessage('customPlatformHostnamePlaceholder') || '例如：my-ai.example.com'}">
                                <div class="custom-platform-form-hint">${chrome.i18n.getMessage('customPlatformHostnameHint') || 'URL 包含此字符串即匹配该平台'}</div>
                            </div>
                        </div>
                        <div class="custom-platform-form-section">
                            <div class="custom-platform-form-section-title">${chrome.i18n.getMessage('customPlatformCoreConfig') || '核心配置（必填）'}</div>
                            <div class="custom-platform-form-group">
                                <label>${chrome.i18n.getMessage('customPlatformSelectorLabel') || '用户消息 CSS 选择器'}<span class="required">*</span></label>
                                <input type="text" class="custom-platform-input" data-field="userMessageSelector" value="${this._escapeHtml(cfg.userMessageSelector)}" placeholder="${chrome.i18n.getMessage('customPlatformSelectorPlaceholder') || '例如：.user-message, [data-role=\"user\"]'}">
                            </div>
                            <div class="custom-platform-form-group">
                                <label>${chrome.i18n.getMessage('customPlatformTextSelectorLabel') || '文本提取子选择器（可选）'}</label>
                                <input type="text" class="custom-platform-input" data-field="textSelector" value="${this._escapeHtml(cfg.textSelector)}" placeholder="${chrome.i18n.getMessage('customPlatformTextSelectorPlaceholder') || '例如：.message-content, 留空则提取全部文本'}">
                            </div>
                            <div class="custom-platform-form-group">
                                <label>${chrome.i18n.getMessage('customPlatformRouteLabel') || '对话路由匹配'}<span class="required">*</span></label>
                                <input type="text" class="custom-platform-input" data-field="conversationRoute" value="${this._escapeHtml(cfg.conversationRoute)}" placeholder="${chrome.i18n.getMessage('customPlatformRoutePlaceholder') || '例如：/chat/'}">
                                <div class="custom-platform-form-hint">${chrome.i18n.getMessage('customPlatformRouteHint') || 'URL pathname 包含此字符串时为对话页面'}</div>
                            </div>
                            <div class="custom-platform-form-group">
                                <label>${chrome.i18n.getMessage('customPlatformIdRegexLabel') || '会话 ID 提取正则（可选）'}</label>
                                <input type="text" class="custom-platform-input" data-field="conversationIdRegex" value="${this._escapeHtml(cfg.conversationIdRegex)}" placeholder="${chrome.i18n.getMessage('customPlatformIdRegexPlaceholder') || '例如：/chat/([^/]+)，留空则以完整 URL 作为存储键'}">
                                <div class="custom-platform-form-hint">${chrome.i18n.getMessage('customPlatformIdRegexHint') || '用括号捕获会话 ID，如 /chat/(xxx) 中捕获 xxx'}</div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="custom-platform-footer">
                    <button class="starred-manage-btn custom-platform-save-btn">${chrome.i18n.getMessage('save') || '保存'}</button>
                    <button class="starred-manage-btn custom-platform-cancel-btn" style="background:transparent;color:var(--ait-text-secondary);border:1px solid var(--ait-border-color);">${chrome.i18n.getMessage('cancel') || '取消'}</button>
                </div>
            </div>`;

        document.body.appendChild(overlay);

        // 关闭时同时触发 onClose 回调，让 Promise resolve，管理弹窗才能正确等待
        // 用 mousedown 而非 click 标记拖拽起点，防止在弹窗内选择文字后鼠标拖出导致误关闭
        let mouseDownInsideModal = false;
        const modal = overlay.querySelector('.starred-platform-modal');
        overlay.addEventListener('mousedown', (e) => {
            mouseDownInsideModal = modal.contains(e.target);
        });
        const close = () => { overlay.remove(); onClose?.(); };
        overlay.querySelector('.starred-platform-modal-close').addEventListener('click', close);
        overlay.querySelector('.custom-platform-cancel-btn').addEventListener('click', close);
        overlay.addEventListener('click', (e) => {
            // 只有 mousedown 也在弹窗外时才关闭（防止拖拽选字后鼠标松开在遮罩上触发关闭）
            if (e.target === overlay && !mouseDownInsideModal) close();
        });

        // 保存按钮
        overlay.querySelector('.custom-platform-save-btn').addEventListener('click', async () => {
            const newCfg = {
                id: cfg.id || this._generateId(),
                name: overlay.querySelector('[data-field="name"]')?.value?.trim() || '',
                hostname: overlay.querySelector('[data-field="hostname"]')?.value?.trim() || '',
                turnIdPrefix: overlay.querySelector('[data-field="turnIdPrefix"]')?.value?.trim() || '',
                userMessageSelector: overlay.querySelector('[data-field="userMessageSelector"]')?.value?.trim() || '',
                textSelector: overlay.querySelector('[data-field="textSelector"]')?.value?.trim() || '',
                conversationRoute: overlay.querySelector('[data-field="conversationRoute"]')?.value?.trim() || '',
                conversationIdRegex: overlay.querySelector('[data-field="conversationIdRegex"]')?.value?.trim() || '',
                timeLabelTargetSelector: overlay.querySelector('[data-field="timeLabelTargetSelector"]')?.value?.trim() || '',
                scrollOffset: parseInt(overlay.querySelector('[data-field="scrollOffset"]')?.value) || 30,
                aiGeneratingSelector: overlay.querySelector('[data-field="aiGeneratingSelector"]')?.value?.trim() || '',
                aiGeneratingCheck: overlay.querySelector('[data-field="aiGeneratingCheck"]')?.value || 'exists',
                starChatButtonSelector: overlay.querySelector('[data-field="starChatButtonSelector"]')?.value?.trim() || '',
                defaultChatThemeSelector: overlay.querySelector('[data-field="defaultChatThemeSelector"]')?.value?.trim() || ''
            };

            // 验证必填字段
            if (!newCfg.name) {
                alert(chrome.i18n.getMessage('customPlatformNameRequired') || '请输入平台名称');
                return;
            }
            if (!newCfg.hostname) {
                alert(chrome.i18n.getMessage('customPlatformHostnameRequired') || '请输入域名匹配');
                return;
            }
            if (!newCfg.userMessageSelector) {
                alert(chrome.i18n.getMessage('customPlatformSelectorRequired') || '请输入用户消息 CSS 选择器');
                return;
            }
            if (!newCfg.conversationRoute) {
                alert(chrome.i18n.getMessage('customPlatformRouteRequired') || '请输入对话路由匹配');
                return;
            }
            // 解析 JSON 字段
            try {
                const timeLabelPosRaw = overlay.querySelector('[data-field="timeLabelPosition"]')?.value?.trim();
                if (timeLabelPosRaw) {
                    newCfg.timeLabelPosition = JSON.parse(timeLabelPosRaw);
                }
            } catch (e) { /* 解析失败则忽略 */ }

            try {
                const timelinePosRaw = overlay.querySelector('[data-field="timelinePosition"]')?.value?.trim();
                if (timelinePosRaw) {
                    newCfg.timelinePosition = JSON.parse(timelinePosRaw);
                }
            } catch (e) { /* 解析失败则忽略 */ }

            // 保存到 storage
            const configs = await this._loadCustomConfigs();
            if (isEdit) {
                const idx = configs.findIndex(c => c.id === cfg.id);
                if (idx >= 0) {
                    configs[idx] = newCfg;
                }
            } else {
                configs.push(newCfg);
            }
            await chrome.storage.local.set({ [this._customStorageKey]: configs });

            close();
        });
    }

    /**
     * 从 storage 加载自定义平台配置
     * @returns {Promise<Array>}
     */
    async _loadCustomConfigs() {
        try {
            const result = await chrome.storage.local.get(this._customStorageKey);
            return Array.isArray(result[this._customStorageKey]) ? result[this._customStorageKey] : [];
        } catch (e) {
            return [];
        }
    }

    /**
     * HTML 转义
     * @param {string} str
     * @returns {string}
     */
    _escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    unmounted() {
        super.unmounted();
    }
}
