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
                        <div class="setting-label">${chrome.i18n.getMessage('preventAutoScrollLabel') || '阻止发送后跳到底部'}</div>
                        <div class="setting-hint">${chrome.i18n.getMessage('preventAutoScrollHint') || '向上查看历史时发送消息，页面保持在当前阅读位置，不跳到底部'}</div>
                    </div>
                    <label class="ait-toggle-switch">
                        <input type="checkbox" id="prevent-auto-scroll-toggle">
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
            void this._showPlatformManageModal()
                .catch(e => console.error('[TimelineSettingsTab] Failed to show platform modal:', e));
        });

        this.addEventListener(scrollArea.querySelector('.timeline-theme-color-manage-btn'), 'click', () => {
            void this._showThemeColorModal()
                .catch(e => console.error('[TimelineSettingsTab] Failed to show theme color modal:', e));
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

        // 处理「阻止发送后跳到底部」开关（默认开启）
        const preventAutoScrollCheckbox = document.getElementById('prevent-auto-scroll-toggle');
        if (preventAutoScrollCheckbox) {
            try {
                const result = await chrome.storage.local.get('preventAutoScrollEnabled');
                preventAutoScrollCheckbox.checked = result.preventAutoScrollEnabled !== false;
            } catch (e) {
                console.error('[TimelineSettingsTab] Failed to load prevent-auto-scroll state:', e);
                preventAutoScrollCheckbox.checked = true;
            }

            this.addEventListener(preventAutoScrollCheckbox, 'change', async (e) => {
                try {
                    const enabled = e.target.checked;
                    await chrome.storage.local.set({ preventAutoScrollEnabled: enabled });
                } catch (e) {
                    console.error('[TimelineSettingsTab] Failed to save prevent-auto-scroll state:', e);
                    preventAutoScrollCheckbox.checked = !preventAutoScrollCheckbox.checked;
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
        const platforms = await getPlatformsByFeature('timeline');
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
        const platforms = await getPlatformsByFeature('timeline');
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

    unmounted() {
        super.unmounted();
    }
}
