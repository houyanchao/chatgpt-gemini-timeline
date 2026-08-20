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
        case 'TimelineSettingsTab': return typeof TimelineSettingsTab !== 'undefined' ? TimelineSettingsTab : null;
        case 'PromptTab': return typeof PromptTab !== 'undefined' ? PromptTab : null;
        case 'SmartInputBoxTab': return typeof SmartInputBoxTab !== 'undefined' ? SmartInputBoxTab : null;
        case 'FormulaTab': return typeof FormulaTab !== 'undefined' ? FormulaTab : null;
        case 'AnimationTab': return typeof AnimationTab !== 'undefined' ? AnimationTab : null;
        case 'RunnerTab': return typeof RunnerTab !== 'undefined' ? RunnerTab : null;
        case 'ConversationExportTab': return typeof ConversationExportTab !== 'undefined' ? ConversationExportTab : null;
        case 'DataSyncTab': return typeof DataSyncTab !== 'undefined' ? DataSyncTab : null;
        case 'AboutTab': return typeof AboutTab !== 'undefined' ? AboutTab : null;
        case 'HighlightTab': return typeof HighlightTab !== 'undefined' ? HighlightTab : null;
        case 'ChatWidthTab': return typeof ChatWidthTab !== 'undefined' ? ChatWidthTab : null;
        case 'MirrorSiteTab': return typeof MirrorSiteTab !== 'undefined' ? MirrorSiteTab : null;
        // 【临时-DSH宣传】DSH 插件 tab（类定义在 changelog-modal/dsh-promo.js，下线时删除本行）
        case 'DshPromoTab': return typeof window.DshPromoTab !== 'undefined' ? window.DshPromoTab : null;
        default: return null;
    }
}

/**
 * Tab 配置数组（按显示顺序排列）
 * - id: tab 的唯一标识
 * - className: 对应的类名（字符串）
 */
const TAB_CONFIG = [
    { id: 'about', className: 'AboutTab' },
    // 【临时-DSH宣传】DSH 插件 tab（位于"关于插件"下方，下线时删除本行）
    { id: 'dsh-promo', className: 'DshPromoTab' },
    { id: 'timeline-settings', className: 'TimelineSettingsTab' },
    { id: 'starred', className: 'StarredTab' },
    { id: 'prompt', className: 'PromptTab' },
    { id: 'smart-input-box', className: 'SmartInputBoxTab' },
    { id: 'formula', className: 'FormulaTab' },
    { id: 'highlight', className: 'HighlightTab' },
    { id: 'chat-width', className: 'ChatWidthTab' },
    { id: 'animation', className: 'AnimationTab' },
    { id: 'runner', className: 'RunnerTab' },
    { id: 'conversation-export', className: 'ConversationExportTab' },
    { id: 'mirror-site', className: 'MirrorSiteTab' },
    { id: 'data-sync', className: 'DataSyncTab' }
];

/**
 * 注册所有可用的 tabs（按配置数组顺序）
 */
async function registerAllTabs() {
    await TimelineI18n.ready();

    if (!window.panelModal) {
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
        const shouldShow = typeof tabInstance.shouldShow === 'function'
            ? await tabInstance.shouldShow()
            : true;
        if (!shouldShow) {
            continue;
        }
        pm.registerTab(tabInstance);
    }
}

/**
 * TimelineManager 初始化时调用（保持兼容）
 */
function registerTimelineTabs() {
    return registerAllTabs();
}

/**
 * @deprecated 使用 registerTimelineTabs 代替
 */
function initializePanelModalTabs() {
    return registerAllTabs();
}
