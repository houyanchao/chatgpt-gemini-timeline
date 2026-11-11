const MESSAGE_ACTION_PAGE_ADAPTERS = {
    chatgpt: ChatGPTMessageActionsAdapter, gemini: GeminiMessageActionsAdapter,
    claude: ClaudeMessageActionsAdapter, deepseek: DeepSeekMessageActionsAdapter,
    kimi: KimiMessageActionsAdapter, doubao: DoubaoMessageActionsAdapter
};
function getMessageActionsAdapter() {
    for (const [platformId, Adapter] of Object.entries(MESSAGE_ACTION_PAGE_ADAPTERS)) {
        if (matchesCurrentPlatformSync(platformId)) return new Adapter();
    }
    return null;
}
