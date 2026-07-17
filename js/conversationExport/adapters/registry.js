/**
 * Conversation Export - 适配器注册表
 *
 * 按当前平台返回可用的导出适配器；不支持则返回 null。
 * ✨ 新增平台：实现一个 CEExportAdapter 子类，在下方 CE_EXPORT_ADAPTERS 加一行即可
 *   （platformId 需与 SITE_INFO / 时间轴 registry 的 id 一致）。
 * 当前支持：Gemini、ChatGPT。
 */

/**
 * platformId → 导出适配器构造函数（表驱动，避免每加一个平台改分支逻辑）。
 * @type {Object<string, new () => CEExportAdapter>}
 */
const CE_EXPORT_ADAPTERS = {
    gemini: CEGeminiExportAdapter,
    chatgpt: CEChatGPTExportAdapter,
};

/**
 * @returns {CEExportAdapter|null}
 */
function getConversationExportAdapter() {
    for (const [platformId, AdapterClass] of Object.entries(CE_EXPORT_ADAPTERS)) {
        if (matchesCurrentPlatformSync(platformId) && _isExportFeatureEnabled(platformId)) {
            return new AdapterClass();
        }
    }
    return null;
}

/**
 * 平台能力开关：SITE_INFO.features.conversationExport 是否开启（缺省视为开启）。
 * 依赖 constants.js 的同步平台列表；不可用时降级为开启，避免误伤已注册适配器的平台。
 * @param {string} platformId
 * @returns {boolean}
 */
function _isExportFeatureEnabled(platformId) {
    try {
        if (typeof getSiteInfoListSync !== 'function') return true;
        const platform = getSiteInfoListSync().find(p => p.id === platformId);
        return platform ? platform.features?.conversationExport !== false : true;
    } catch {
        return true;
    }
}
