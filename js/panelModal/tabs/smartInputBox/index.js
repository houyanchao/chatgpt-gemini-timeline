/**
 * Smart Input Box Settings Tab - 智能输入框设置
 * 
 * 功能：
 * - Enter 换行 + 多种发送模式（通过内联 Dropdown 选择）
 * - 控制各平台的智能输入功能
 */

class SmartInputBoxTab extends BaseTab {
    constructor() {
        super();
        this.id = 'smartInputBox';
        this.name = chrome.i18n.getMessage('xmvkpz');
        this.icon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>`;
        
        this._isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
        this._ctrlLabel = this._isMac ? '⌘' : 'Ctrl';
    }
    
    /**
     * 获取模式的显示文字（用于 Dropdown trigger 和选项）
     */
    _getModeLabel(mode) {
        switch (mode) {
            case 'ctrlEnter': return `${this._ctrlLabel} + Enter`;
            case 'shiftEnter': return 'Shift + Enter';
            case 'doubleEnter':
            default: return chrome.i18n.getMessage('smartEnterModeDoubleEnter');
        }
    }
    
    /**
     * 渲染设置内容
     */
    render() {
        const container = document.createElement('div');
        container.className = 'smart-input-box-settings';
        
        // ==================== 追问功能模块 ====================
        const quickAskSection = `
            <div class="setting-section">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">${chrome.i18n.getMessage('quickAskTitle') || '追问功能'}</div>
                        <div class="setting-hint">${chrome.i18n.getMessage('quickAskHint') || '选中页面上的文字后，显示追问按钮，点击可快速引用到对话框中'}</div>
                    </div>
                    <label class="ait-toggle-switch">
                        <input type="checkbox" id="quick-ask-toggle">
                        <span class="ait-toggle-slider"></span>
                    </label>
                </div>
            </div>
        `;
        
        // ==================== 返回底部模块 ====================
        const scrollToBottomSection = `
            <div class="setting-section">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">${chrome.i18n.getMessage('scrollToBottomTitle') || '返回底部'}</div>
                        <div class="setting-hint">${chrome.i18n.getMessage('scrollToBottomHint') || '显示返回底部的快捷按钮，方便回到最新消息'}</div>
                    </div>
                    <label class="ait-toggle-switch">
                        <input type="checkbox" id="scroll-to-bottom-toggle">
                        <span class="ait-toggle-slider"></span>
                    </label>
                </div>
            </div>
        `;
        
        const divider = '<div class="divider"></div>';
        
        // ==================== Enter 换行控制模块 ====================
        // 提示文字中嵌入 Dropdown trigger
        const hintTemplate = chrome.i18n.getMessage('mkpxvz');
        const defaultLabel = this._getModeLabel('doubleEnter');
        const triggerHtml = `<span class="smart-enter-mode-trigger" id="smart-enter-mode-trigger">${defaultLabel}<svg viewBox="0 0 12 12" width="10" height="10"><path d="M3 4.5L6 7.5L9 4.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`;
        const hintHtml = hintTemplate.includes('{mode}')
            ? hintTemplate.replace('{mode}', triggerHtml)
            : hintTemplate;
        
        const enterKeySection = `
            <div class="platform-list">
                <div class="platform-list-title">${chrome.i18n.getMessage('kvzmxp')}</div>
                <div class="platform-list-hint">${hintHtml}</div>
                
                <div class="platform-list-container"></div>
            </div>
        `;
        
        container.innerHTML = quickAskSection + scrollToBottomSection + divider + enterKeySection;
        
        return container;
    }
    
    /**
     * Tab 激活时加载状态
     */
    async mounted() {
        super.mounted();
        
        await this.loadQuickAskSettings();
        await this.loadScrollToBottomSettings();
        await this.loadEnterModeSettings();
        await this.renderPlatformList();
        await this.loadPlatformSettings();
    }

    /**
     * 异步渲染平台列表
     */
    async renderPlatformList() {
        try {
            const siteInfoList = typeof getSiteInfoList === 'function'
                ? await getSiteInfoList()
                : [];
            // 平台列表（过滤掉 Claude，因其 Enter 键行为无法被拦截）
            const smartInputPlatforms = siteInfoList
                .filter(p => p.features?.promptButton === true || p.features?.smartEnter === true)
                .filter(p => p.id !== 'claude');

            const listContainer = document.querySelector('.smart-input-box-settings .platform-list-container');
            if (!listContainer) return;

            listContainer.innerHTML = smartInputPlatforms.map(platform => `
                <div class="platform-item">
                    <div class="platform-info-left">
                        <span class="platform-name">${platform.name}</span>
                    </div>
                    <label class="ait-toggle-switch">
                        <input type="checkbox" class="platform-toggle" data-platform-id="${platform.id}">
                        <span class="ait-toggle-slider"></span>
                    </label>
                </div>
            `).join('');
        } catch (e) {
            console.error('[SmartInputBoxTab] Failed to render platform list:', e);
        }
    }
    
    /**
     * 加载追问功能设置
     */
    async loadQuickAskSettings() {
        const quickAskToggle = document.getElementById('quick-ask-toggle');
        if (!quickAskToggle) return;
        
        try {
            const result = await chrome.storage.local.get('quickAskEnabled');
            quickAskToggle.checked = result.quickAskEnabled !== false;
        } catch (e) {
            quickAskToggle.checked = true;
        }
        
        this.addEventListener(quickAskToggle, 'change', async (e) => {
            try {
                const enabled = e.target.checked;
                await chrome.storage.local.set({ quickAskEnabled: enabled });
                
                if (window.AIChatTimelineQuickAsk) {
                    if (enabled) {
                        await window.AIChatTimelineQuickAsk.enable();
                    } else {
                        window.AIChatTimelineQuickAsk.disable();
                    }
                }
            } catch (e) {
                console.error('[SmartInputBoxTab] Failed to save quick ask setting:', e);
                quickAskToggle.checked = !quickAskToggle.checked;
            }
        });
    }
    
    /**
     * 加载返回底部设置
     */
    async loadScrollToBottomSettings() {
        const scrollToBottomToggle = document.getElementById('scroll-to-bottom-toggle');
        if (!scrollToBottomToggle) return;
        
        try {
            const result = await chrome.storage.local.get('scrollToBottomEnabled');
            scrollToBottomToggle.checked = result.scrollToBottomEnabled !== false;
        } catch (e) {
            scrollToBottomToggle.checked = true;
        }
        
        this.addEventListener(scrollToBottomToggle, 'change', async (e) => {
            try {
                const enabled = e.target.checked;
                await chrome.storage.local.set({ scrollToBottomEnabled: enabled });
            } catch (e) {
                console.error('[SmartInputBoxTab] Failed to save scroll to bottom setting:', e);
                scrollToBottomToggle.checked = !scrollToBottomToggle.checked;
            }
        });
    }
    
    /**
     * 加载 Enter 发送模式设置 + 绑定 Dropdown
     */
    async loadEnterModeSettings() {
        const trigger = document.getElementById('smart-enter-mode-trigger');
        if (!trigger) return;
        
        // 加载当前模式并更新 trigger 文字
        try {
            const result = await chrome.storage.local.get('smartEnterMode');
            const currentMode = result.smartEnterMode || 'doubleEnter';
            this._updateTriggerText(trigger, currentMode);
        } catch (e) { /* 保持默认 */ }
        
        // 绑定点击事件，显示 Dropdown
        this.addEventListener(trigger, 'click', (e) => {
            const DropdownManager = window.globalDropdownManager;
            if (!DropdownManager) return;
            
            const setMode = async (mode) => {
                try {
                    await chrome.storage.local.set({ smartEnterMode: mode, smartEnterToastCount: 0 });
                    this._updateTriggerText(trigger, mode);
                } catch (err) {
                    console.error('[SmartInputBoxTab] Failed to save enter mode:', err);
                }
            };
            
            DropdownManager.show({
                trigger: e.target.closest('.smart-enter-mode-trigger'),
                items: [
                    { label: this._getModeLabel('doubleEnter'), value: 'doubleEnter', onClick: () => setMode('doubleEnter') },
                    { label: this._getModeLabel('ctrlEnter'), value: 'ctrlEnter', onClick: () => setMode('ctrlEnter') },
                    { label: this._getModeLabel('shiftEnter'), value: 'shiftEnter', onClick: () => setMode('shiftEnter') }
                ],
                width: 180,
                position: 'bottom-left'
            });
        });
    }
    
    /**
     * 更新 trigger 显示文字
     */
    _updateTriggerText(trigger, mode) {
        const label = this._getModeLabel(mode);
        trigger.innerHTML = `${label}<svg viewBox="0 0 12 12" width="10" height="10"><path d="M3 4.5L6 7.5L9 4.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    }
    
    /**
     * 加载并初始化平台设置
     */
    async loadPlatformSettings() {
        try {
            const result = await chrome.storage.local.get('smartInputPlatformSettings');
            const platformSettings = result.smartInputPlatformSettings || {};
            
            const platformToggles = document.querySelectorAll('.platform-toggle');
            platformToggles.forEach(toggle => {
                const platformId = toggle.getAttribute('data-platform-id');
                
                toggle.checked = platformSettings[platformId] === true;
                
                this.addEventListener(toggle, 'change', async (e) => {
                    try {
                        const enabled = e.target.checked;
                        const result = await chrome.storage.local.get('smartInputPlatformSettings');
                        const settings = result.smartInputPlatformSettings || {};
                        settings[platformId] = enabled;
                        await chrome.storage.local.set({ smartInputPlatformSettings: settings });
                    } catch (e) {
                        console.error('[SmartInputBoxTab] Failed to save platform setting:', e);
                        toggle.checked = !toggle.checked;
                    }
                });
            });
        } catch (e) {
            console.error('[SmartInputBoxTab] Failed to load platform settings:', e);
        }
    }
    
    /**
     * Tab 卸载时清理
     */
    unmounted() {
        super.unmounted();
    }
}
