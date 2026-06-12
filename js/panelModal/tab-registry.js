/**
 * Tab Registry - 统一的 Tab 注册管理
 * 
 * ✨ 设计理念：所有 tabs 按数组顺序依次注册，互相独立
 */

/**
 * 获取 Tab 类的辅助函数
 */
function getTabClass(name) {
    switch (name) {
        case 'StarredTab': return typeof StarredTab !== 'undefined' ? StarredTab : null;
        default: return null;
    }
}

/**
 * Tab 配置数组（按显示顺序排列）
 * - id: tab 的唯一标识
 * - className: 对应的类名（字符串）
 */
const TAB_CONFIG = [
    { id: 'starred', className: 'StarredTab' },
];

/**
 * 注册所有可用的 tabs（按配置数组顺序）
 */
function registerAllTabs() {
    if (!window.panelModal) {
        console.error('[TabRegistry] PanelModal not initialized');
        return;
    }
    
    const pm = window.panelModal;
    
    // 按顺序注册每个 tab
    for (const config of TAB_CONFIG) {
        // 跳过已注册的
        if (pm.tabs.has(config.id)) {
            continue;
        }
        
        // 获取 Tab 类
        const TabClass = getTabClass(config.className);
        if (!TabClass) {
            continue;
        }
        
        const tabInstance = new TabClass();
        if (typeof tabInstance.shouldShow === 'function' && !tabInstance.shouldShow()) {
            continue;
        }
        pm.registerTab(tabInstance);
        }
}

/**
 * TimelineManager 初始化时调用（保持兼容）
 */
function registerTimelineTabs() {
    registerAllTabs();
}

/**
 * @deprecated 使用 registerTimelineTabs 代替
 */
function initializePanelModalTabs() {
    registerAllTabs();
}
