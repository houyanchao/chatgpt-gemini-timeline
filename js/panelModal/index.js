/**
 * Panel Modal - 右侧弹出的面板模态框
 * 
 * 功能：
 * - 从右侧滑入/滑出
 * - 支持多个 tab 切换
 * - tab 只显示 icon，悬停显示 tooltip
 * - 点击遮罩层或关闭按钮关闭
 * 
 * ✨ 组件自治：
 * - 脚本加载时自动初始化
 * - 独立管理生命周期
 * - 其他模块通过 window.panelModal 调用
 * 
 * 使用方式：
 * window.panelModal.show('starred'); // 打开并显示 starred tab
 * window.panelModal.hide();          // 关闭
 * window.panelModal.registerTab(tab); // 注册新 tab
 */

class PanelModal {
    constructor() {
        this.container = null;
        this.overlay = null;
        this.content = null;
        this.tabsContainer = null;
        this.closeBtn = null;
        this.shareBtn = null;
        
        this.tabs = new Map(); // tabId -> tab instance
        this.currentTabId = null;
        this.isVisible = false;
        
        // URL 变化监听器
        this._currentUrl = location.href;
        this._boundHandleUrlChange = this._handleUrlChange.bind(this);
        
        this.init();
    }
    
    init() {
        // 创建 DOM 结构
        this.createDOM();
        
        // 绑定事件
        this.bindEvents();
        
        // 监听 URL 变化（自动关闭）
        this._attachUrlListeners();
        
        console.log('[PanelModal] Initialized successfully');
    }
    
    createDOM() {
        // 主容器
        this.container = document.createElement('div');
        this.container.className = 'ait-panel-modal';
        
        // 遮罩层
        this.overlay = document.createElement('div');
        this.overlay.className = 'ait-panel-modal-overlay';
        
        // 内容容器（居中弹窗）
        const wrapper = document.createElement('div');
        wrapper.className = 'ait-panel-modal-wrapper';
        
        // ========== 左侧边栏 ==========
        const sidebar = document.createElement('div');
        sidebar.className = 'ait-panel-modal-sidebar';
        
        // 顶部区域（关闭按钮 + 标题）
        const sidebarHeader = document.createElement('div');
        sidebarHeader.className = 'ait-panel-modal-sidebar-header';
        
        // 关闭按钮（左侧顶部）
        this.closeBtn = document.createElement('button');
        this.closeBtn.className = 'ait-panel-modal-close';
        this.closeBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
        `;
        
        // 标题（关闭按钮右侧）
        const sidebarTitle = document.createElement('span');
        sidebarTitle.className = 'ait-panel-modal-sidebar-title';
        sidebarTitle.textContent = 'Timeline';
        
        sidebarHeader.appendChild(this.closeBtn);
        sidebarHeader.appendChild(sidebarTitle);
        
        // Tab 栏（可滚动区域）
        this.tabsContainer = document.createElement('div');
        this.tabsContainer.className = 'ait-panel-modal-tabs';
        
        // Footer 底部信息区域
        const footer = document.createElement('div');
        footer.className = 'ait-panel-modal-footer';
        
        let version = '';
        try {
            version = chrome.runtime.getManifest().version;
        } catch (e) {
            version = '';
        }
        footer.innerHTML = `
            <div class="ait-panel-modal-footer-item ait-panel-modal-footer-version">v${version}</div>
        `;

        if (typeof CHANGELOG_DATA !== 'undefined' && CHANGELOG_DATA.id) {
            const versionEl = footer.querySelector('.ait-panel-modal-footer-version');
            versionEl.style.cursor = 'pointer';
            versionEl.addEventListener('click', () => {
                if (window.changelogModal) {
                    window.changelogModal.show();
                }
            });
        }
        
        sidebar.appendChild(sidebarHeader);
        sidebar.appendChild(this.tabsContainer);
        sidebar.appendChild(footer);
        
        // ========== 右侧主区域 ==========
        const main = document.createElement('div');
        main.className = 'ait-panel-modal-main';
        
        // 标题栏（右侧顶部）
        const header = document.createElement('div');
        header.className = 'ait-panel-modal-header';
        
        this.titleElement = document.createElement('h2');
        this.titleElement.className = 'ait-panel-modal-title';
        this.titleElement.textContent = 'Panel'; // 默认标题，会在切换 tab 时更新

        this.shareBtn = document.createElement('button');
        this.shareBtn.className = 'ait-panel-modal-share';
        this.shareBtn.setAttribute('aria-label', chrome.i18n.getMessage('shareExtension') || '分享插件');
        this.shareBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="18" cy="5" r="3"/>
                <circle cx="6" cy="12" r="3"/>
                <circle cx="18" cy="19" r="3"/>
                <path d="M8.59 13.51 15.42 17.49"/>
                <path d="M15.41 6.51 8.59 10.49"/>
            </svg>
        `;
        
        header.appendChild(this.titleElement);
        header.appendChild(this.shareBtn);
        
        // 内容区（可滚动）
        this.content = document.createElement('div');
        this.content.className = 'ait-panel-modal-content';
        
        main.appendChild(header);
        main.appendChild(this.content);
        
        // 组装
        wrapper.appendChild(sidebar);
        wrapper.appendChild(main);
        
        this.container.appendChild(this.overlay);
        this.container.appendChild(wrapper);
        
        // 添加到 body
        document.body.appendChild(this.container);
    }
    
    bindEvents() {
        // 点击遮罩层关闭
        this.overlay.addEventListener('click', () => {
            this.hide();
        });
        
        // 点击关闭按钮
        this.closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.hide();
        });

        this.shareBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            window.open(this._getStoreDetailUrl(), '_blank', 'noopener,noreferrer');
        });

        this.shareBtn.addEventListener('mouseenter', () => {
            window.globalTooltipManager?.show(
                'panel-modal-share-extension',
                'button',
                this.shareBtn,
                chrome.i18n.getMessage('shareExtension') || '分享插件',
                { style: 'mini', placement: 'bottom' }
            );
        });

        this.shareBtn.addEventListener('mouseleave', () => {
            window.globalTooltipManager?.hide();
        });
    }

    _getStoreDetailUrl() {
        const ua = navigator.userAgent || '';
        if (/Firefox/i.test(ua)) {
            return 'https://addons.mozilla.org/en-US/firefox/addon/ai-timeline/';
        }
        if (/Edg/i.test(ua)) {
            return 'https://microsoftedge.microsoft.com/addons/detail/ai-timeline%EF%BC%9Agemini%E3%80%81chatgp/ekednjjojnhlajfobalaaihkibbdcbab';
        }
        return 'https://chromewebstore.google.com/detail/timeline-ai-chat/fgebdnlceacaiaeikopldglhffljjlhh?utm_source=item-share-cb';
    }
    
    /**
     * 监听 URL 变化（自动关闭）
     */
    _attachUrlListeners() {
        try {
            window.addEventListener('url:change', this._boundHandleUrlChange);
        } catch (error) {
            console.error('[PanelModal] Failed to attach URL listeners:', error);
        }
    }
    
    /**
     * 移除 URL 监听
     */
    _detachUrlListeners() {
        try {
            window.removeEventListener('url:change', this._boundHandleUrlChange);
        } catch (error) {
            console.error('[PanelModal] Failed to detach URL listeners:', error);
        }
    }
    
    /**
     * URL 变化处理：自动关闭面板
     */
    _handleUrlChange() {
        const newUrl = location.href;
        if (newUrl !== this._currentUrl) {
            this._currentUrl = newUrl;
            
            // URL 变化时自动关闭面板
            if (this.isVisible) {
                this.hide();
            }
        }
    }
    
    /**
     * 注册 tab
     * @param {BaseTab} tab - tab 实例
     */
    registerTab(tab) {
        if (!tab || !tab.id) {
            console.error('[PanelModal] Invalid tab:', tab);
            return;
        }
        
        if (this.tabs.has(tab.id)) {
            return; // 已注册，静默跳过
        }
        
        // 保存 tab
        this.tabs.set(tab.id, tab);
        
        // 创建 tab 按钮
        const tabButton = document.createElement('button');
        tabButton.className = 'panel-tab';
        tabButton.setAttribute('data-tab-id', tab.id);
        tabButton.setAttribute('aria-label', tab.name);
        
        // Tab 图标
        const icon = document.createElement('span');
        icon.className = 'tab-icon';
        
        // 支持 SVG 图标或 emoji
        if (typeof tab.icon === 'string' && tab.icon.trim().startsWith('<')) {
            icon.innerHTML = tab.icon;
        } else {
            icon.textContent = tab.icon;
        }
        
        tabButton.appendChild(icon);
        
        // Tab 文字标签
        const label = document.createElement('span');
        label.className = 'tab-label';
        label.textContent = tab.name;
        if (tab.badge) {
            const badge = document.createElement('span');
            badge.className = 'tab-badge';
            badge.textContent = tab.badge;
            label.appendChild(badge);
        }
        tabButton.appendChild(label);
        
        // 点击切换 tab
        tabButton.addEventListener('click', () => {
            void this.switchTab(tab.id);
        });
        
        // 添加到 tab 栏
        this.tabsContainer.appendChild(tabButton);
    }
    
    /**
     * 显示面板
     * @param {string} tabId - 要显示的 tab ID（可选）
     */
    async show(tabId = null) {
        try {
            // ✅ 确保所有可用的 tabs 已注册（按固定顺序）
            if (typeof registerAllTabs === 'function') {
                await registerAllTabs();
            }

            // 确定要显示的 tab（带 fallback）
            let targetTabId = tabId;

            // 如果指定的 tab 不存在，fallback 到当前 tab 或第一个可用的 tab
            if (targetTabId && !this.tabs.has(targetTabId)) {
                console.warn(`[PanelModal] Tab "${targetTabId}" not available, falling back`);
                targetTabId = null;
            }

            if (!targetTabId) {
                targetTabId = this.currentTabId && this.tabs.has(this.currentTabId)
                    ? this.currentTabId
                    : this.tabs.keys().next().value;
            }

            if (!targetTabId) {
                console.warn('[PanelModal] No tabs registered');
                return;
            }

            // 先显示面板外壳：tab 的同步渲染会立即出现，异步 mounted 之后再填充，
            // 避免等待 mounted 完成导致面板延迟显示。
            this.container.classList.add('visible');
            this.isVisible = true;

            // 禁用 body 滚动
            document.body.style.overflow = 'hidden';

            // 切换到指定 tab（等待其 mounted 完成）。
            // 若切换失败（unmounted()/render() 抛错或返回 false），回滚可见状态，
            // 避免面板卡在空内容、且 body 滚动被锁死的状态。
            const switched = await this.switchTab(targetTabId);
            if (!switched) {
                this.hide();
            }
        } catch (error) {
            console.error('[PanelModal] Failed to show panel:', error);
            this.hide();
        }
    }
    
    /**
     * 切换 tab
     * @param {string} tabId - tab ID
     */
    async switchTab(tabId) {
        const tab = this.tabs.get(tabId);
        if (!tab) {
            console.error(`[PanelModal] Tab "${tabId}" not found`);
            return false;
        }
        
        // 如果已经是当前 tab，不重复切换
        if (this.currentTabId === tabId) {
            return true;
        }
        
        // 卸载当前 tab。unmounted() 是清理钩子，抛错不应阻断切换流程，
        // 否则异常会冒泡到 show() 的 catch 并触发对同一旧 tab 的二次卸载。
        if (this.currentTabId) {
            const currentTab = this.tabs.get(this.currentTabId);
            if (currentTab && currentTab.unmounted) {
                try {
                    currentTab.unmounted();
                } catch (error) {
                    console.error(`[PanelModal] Failed to unmount tab "${this.currentTabId}":`, error);
                }
            }
            
            // 移除当前 tab 按钮的 active 状态
            const currentButton = this.tabsContainer.querySelector(`[data-tab-id="${this.currentTabId}"]`);
            if (currentButton) {
                currentButton.classList.remove('active');
            }
        }

        // 旧 tab 已卸载、新 tab 尚未挂载：先置空，避免后续 render() 抛错时
        // 回滚的 hide() 对同一个旧 tab 重复调用 unmounted()。
        this.currentTabId = null;

        // 渲染新 tab 内容
        this.content.innerHTML = '';
        const tabContent = tab.render();
        if (tabContent) {
            this.content.appendChild(tabContent);
        }
        
        // 更新标题
        this.titleElement.textContent = tab.name;
        
        // 更新当前 tab
        this.currentTabId = tabId;
        
        // 添加新 tab 按钮的 active 状态
        const newButton = this.tabsContainer.querySelector(`[data-tab-id="${tabId}"]`);
        if (newButton) {
            newButton.classList.add('active');
        }
        
        // 调用 tab 的 mounted 钩子（可能为异步）
        if (tab.mounted) {
            try {
                await tab.mounted();
            } catch (error) {
                console.error(`[PanelModal] Failed to mount tab "${tabId}":`, error);
            }
        }

        return true;
    }
    
    /**
     * 隐藏面板
     */
    hide() {
        this.container.classList.remove('visible');
        this.isVisible = false;
        
        // 恢复 body 滚动
        document.body.style.overflow = '';
        
        // 隐藏 tooltip
        if (window.globalTooltipManager) {
            window.globalTooltipManager.forceHideAll();
        }
        
        // 卸载当前 tab。unmounted() 抛错不应阻断后续的内容清空与状态复位，
        // 因此独立隔离；overflow 已在上方先行恢复。
        if (this.currentTabId) {
            const tab = this.tabs.get(this.currentTabId);
            if (tab && tab.unmounted) {
                try {
                    tab.unmounted();
                } catch (error) {
                    console.error(`[PanelModal] Failed to unmount tab "${this.currentTabId}":`, error);
                }
            }
            
            // 移除 tab 按钮的 active 状态
            const currentButton = this.tabsContainer.querySelector(`[data-tab-id="${this.currentTabId}"]`);
            if (currentButton) {
                currentButton.classList.remove('active');
            }
        }
        
        // ✨ 彻底销毁：清空内容和状态
        this.content.innerHTML = '';
        this.currentTabId = null;
        
        console.log('[PanelModal] Panel hidden and destroyed');
    }
    
    /**
     * 销毁
     */
    destroy() {
        // 移除 URL 监听
        this._detachUrlListeners();
        
        // 移除 DOM
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
        
        // 清理引用
        this.tabs.clear();
        this.container = null;
        this.overlay = null;
        this.content = null;
        this.tabsContainer = null;
        this.closeBtn = null;
        this.shareBtn = null;
        
        console.log('[PanelModal] Destroyed');
    }
}

// ✅ 自动初始化：创建全局单例
// 脚本加载时立即创建，其他模块可直接使用 window.panelModal
if (typeof window !== 'undefined') {
    window.panelModal = new PanelModal();
    
    // ✅ 注意：所有 Tabs 在 Timeline 初始化后统一注册，确保顺序正确
    // 见 tab-registry.js 中的 registerTimelineTabs()

    // 监听来自 background 的消息（点击扩展图标时触发）
    chrome.runtime.onMessage.addListener((request) => {
        if (request.type === 'OPEN_PANEL_MODAL' && window.panelModal) {
            void window.panelModal.show();
        }
    });
}
