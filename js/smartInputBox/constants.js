/**
 * Smart Enter - 配置常量
 * 
 * 定义智能 Enter 功能的配置参数
 */

const SMART_ENTER_MODES = {
    DOUBLE_ENTER: 'doubleEnter',
    CTRL_ENTER: 'ctrlEnter',
    SHIFT_ENTER: 'shiftEnter'
};

const SMART_ENTER_CONFIG = {
    // 双击 Enter 的检测间隔（毫秒）
    // 300ms：快速双击才会发送，单击后稍等即换行
    DOUBLE_CLICK_INTERVAL: 300,
    
    // DOM 变化检测防抖延迟（毫秒）
    // 避免频繁触发附加逻辑
    DEBOUNCE_DELAY: 200,
    
    // 调试模式（使用全局配置）
    get DEBUG() {
        return typeof GLOBAL_DEBUG !== 'undefined' ? GLOBAL_DEBUG : false;
    },
    
    // MutationObserver 配置
    OBSERVER_CONFIG: {
        childList: true,
        subtree: true,
        attributes: false
    }
};

// ==================== 工具函数（别名） ====================
// ✅ 平台信息已迁移到 js/global/constants.js 中的 SITE_INFO
// ✅ 使用 features.promptButton / features.smartEnter 控制智能输入子功能
// ✅ 使用 matchesCurrentPlatform(platformId) 检查当前页面是否匹配平台
// ✅ 使用 getCurrentPlatform() 获取当前页面的平台信息

/**
 * 检查当前页面是否匹配某个平台（别名函数，保持向后兼容）
 * @param {string} platformId - 平台 ID
 * @returns {boolean}
 */
const matchesSmartInputPlatform = matchesCurrentPlatform;

/**
 * 获取当前页面匹配的平台（别名函数，保持向后兼容）
 * @returns {Object|null} 平台信息
 */
const getCurrentSmartInputPlatform = getCurrentPlatform;

