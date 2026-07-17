/**
 * Conversation Export - 入口
 *
 * 检测当前平台是否开启对话导出（需同时满足：平台具备导出适配器、用户未在设置里关闭），
 * 满足则初始化导出管理器。管理器自身监听 DOM 与路由变化，负责按钮的注入与重建。
 *
 * 用户开关存储于 chrome.storage.local 的 conversationExportPlatformSettings，
 * 结构 { chatgpt: true, gemini: false }，缺省视为开启（!== false）。
 * 监听该项变化以便开/关时实时注入或移除导出按钮，无需刷新页面。
 */

const CE_PLATFORM_SETTINGS_KEY = 'conversationExportPlatformSettings';

/**
 * 读取指定平台的对话导出开关（默认开启）。
 * @param {string} platformId
 * @returns {Promise<boolean>}
 */
async function isConversationExportEnabled(platformId) {
    if (!platformId) return false;
    try {
        const result = await chrome.storage.local.get(CE_PLATFORM_SETTINGS_KEY);
        const settings = result?.[CE_PLATFORM_SETTINGS_KEY] || {};
        return settings[platformId] !== false;
    } catch {
        return true;
    }
}

(function initConversationExport() {
    'use strict';

    let manager = null;
    let initInFlight = false;

    async function ensureManager() {
        if (manager || initInFlight) return;
        initInFlight = true;
        try {
            if (typeof TimelineI18n !== 'undefined' && TimelineI18n.ready) {
                await TimelineI18n.ready();
            }

            const adapter = getConversationExportAdapter();
            if (!adapter) return; // 当前平台未开启导出

            if (!await isConversationExportEnabled(adapter.platformId)) {
                return; // 用户在设置里关闭了当前平台的导出
            }

            manager = new CEExportManager(adapter);
            manager.init();
        } catch (error) {
            manager = null;
        } finally {
            initInFlight = false;
        }
    }

    function cleanup() {
        if (manager) {
            manager.destroy();
            manager = null;
        }
    }

    /**
     * 依据当前平台与用户开关，决定初始化还是销毁管理器（供开关实时切换调用）。
     */
    async function reevaluate() {
        const adapter = getConversationExportAdapter();
        const platformId = adapter?.platformId || null;
        const enabled = platformId ? await isConversationExportEnabled(platformId) : false;

        if (enabled && !adapter) return;
        if (enabled) {
            await ensureManager();
        } else {
            cleanup();
        }
    }

    if (chrome?.storage?.onChanged) {
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== 'local' || !changes[CE_PLATFORM_SETTINGS_KEY]) return;
            reevaluate().catch(() => {});
        });
    }

    window.addEventListener('beforeunload', cleanup);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(() => ensureManager(), 600));
    } else {
        setTimeout(() => ensureManager(), 600);
    }
})();
