/**
 * Conversation Export - 适配器注册表
 *
 * 按当前平台返回可用的导出适配器；不支持则返回 null。
 * 新增平台：实现一个 CEExportAdapter 子类，并在此登记。
 * 当前支持：Gemini、ChatGPT。
 */

/**
 * @returns {CEExportAdapter|null}
 */
function getConversationExportAdapter() {
    if (matchesCurrentPlatformSync('gemini')) {
        return new CEGeminiExportAdapter();
    }
    if (matchesCurrentPlatformSync('chatgpt')) {
        return new CEChatGPTExportAdapter();
    }
    return null;
}
