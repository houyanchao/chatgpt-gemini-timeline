/**
 * Quick Ask - 主入口
 * 
 * 引用回复功能初始化
 * 选中文字后显示"引用回复"按钮，点击后将选中文字以引用格式插入输入框
 * 
 * 支持平台：
 * - 所有 features.quickAsk === true 的平台
 * 
 * 限制条件：
 * - 仅在对话页面生效，首页等非对话页面不显示
 */

(function() {
    'use strict';

    let manager = null;
    let isSupported = false;
    let adapterRegistry = null;
    let currentAdapter = null;
    let currentUrl = location.href;
    let initInFlight = false;
    let urlListenerAttached = false;
    let settingsListenerAttached = false;
    
    // 检查当前平台是否支持引用回复功能
    async function isQuickAskSupported() {
        try {
            if (typeof getCurrentPlatform === 'undefined') return false;
            const platform = await getCurrentPlatform();
            if (!platform) return false;
            
            return platform.features?.quickAsk === true;
        } catch (e) {
            return false;
        }
    }
    
    // 检查是否在对话页面
    async function isConversationPage() {
        try {
            if (!adapterRegistry) {
                if (typeof SiteAdapterRegistry === 'undefined') return false;
                adapterRegistry = new SiteAdapterRegistry();
            }
            
            if (!currentAdapter) {
                currentAdapter = await adapterRegistry.detectAdapter();
            }
            
            if (!currentAdapter) return false;
            
            return currentAdapter.isConversationRoute(location.pathname);
        } catch (e) {
            return false;
        }
    }
    
    // 检查功能是否启用（默认开启）
    async function isQuickAskEnabled() {
        try {
            const result = await chrome.storage.local.get('quickAskEnabled');
            return result.quickAskEnabled !== false;
        } catch (e) {
            return true;
        }
    }
    
    // 根据页面状态启用/禁用功能
    async function updateQuickAskState() {
        if (!manager || !isSupported) return;
        
        const enabled = await isQuickAskEnabled();
        const onConversationPage = await isConversationPage();
        
        if (enabled && onConversationPage) {
            if (!manager.isEnabled) {
                await manager.enable();
            }
        } else {
            if (manager.isEnabled) {
                manager.disable();
            }
        }
    }
    
    // 处理 URL 变化
    function handleUrlChange() {
        // 检测 URL 是否真的变化了
        if (location.href === currentUrl) return;
        currentUrl = location.href;
        void updateQuickAskState()
            .catch(error => console.error('[QuickAsk] Failed to update state after URL change:', error));
    }
    
    // 监听 URL 变化（SPA 路由切换，由 UrlChangeMonitor 统一管理）
    function setupUrlChangeListener() {
        if (urlListenerAttached) return;
        urlListenerAttached = true;
        window.addEventListener('url:change', handleUrlChange);
    }
    
    // 初始化
    const initQuickAsk = async () => {
        if (initInFlight) return;
        initInFlight = true;
        try {
            await TimelineI18n.ready();

            // 检查平台是否支持
            isSupported = await isQuickAskSupported();
            if (!isSupported) {
                return;
            }

            if (manager) {
                await updateQuickAskState();
                return;
            }
            
            // 检查依赖
            if (typeof QuickAskManager === 'undefined') {
                console.error('[QuickAsk] QuickAskManager not loaded');
                return;
            }
            
            // 创建管理器（但不立即启用）
            manager = new QuickAskManager();
            
            // 设置 URL 变化监听
            setupUrlChangeListener();
            
            // 根据当前页面状态决定是否启用
            await updateQuickAskState();
            
            // 保存到全局
            window.quickAskManager = manager;
            
            // 监听设置变化
            if (!settingsListenerAttached) {
                settingsListenerAttached = true;
                chrome.storage.onChanged.addListener((changes, areaName) => {
                    if (areaName === 'local' && changes.quickAskEnabled !== undefined) {
                        void updateQuickAskState()
                            .catch(error => console.error('[QuickAsk] Failed to update state after settings change:', error));
                    }
                });
            }
            
            // 暴露控制接口
            window.AIChatTimelineQuickAsk = {
                enable: async () => {
                    if (manager && isSupported && await isConversationPage()) {
                        await manager.enable();
                    }
                },
                disable: () => {
                    if (manager) {
                        manager.disable();
                    }
                },
                isEnabled: () => manager?.isEnabled ?? false,
                updateState: updateQuickAskState
            };
            
        } catch (error) {
            console.error('[QuickAsk] Initialization failed:', error);
        } finally {
            initInFlight = false;
        }
    };
    
    // DOM 加载完成后初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initQuickAsk);
    } else {
        initQuickAsk();
    }
    
})();
