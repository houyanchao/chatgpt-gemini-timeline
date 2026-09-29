/**
 * ChatGPT Smart Enter Adapter
 * 
 * ChatGPT 平台的智能 Enter 适配器
 */

class ChatGPTSmartEnterAdapter extends BaseSmartEnterAdapter {
    /**
     * 检测是否为 ChatGPT 页面
     */
    async matches() {
        return matchesSmartInputPlatform('chatgpt');
    }
    
    /**
     * 获取输入框选择器
     * 保留旧版 ID；新版只匹配 Composer 输入区，避免选中正文写作编辑器。
     */
    getInputSelector() {
        return '#prompt-textarea, [class*="ComposerLayoutInput-"] [contenteditable="true"][role="textbox"]';
    }
    
    /**
     * 获取发送按钮选择器
     */
    getSendButtonSelector() {
        return '#composer-submit-button, '
            + '[data-composer-body] button:has(svg.icon-primary-action), '
            + '[class*="ComposerLayoutFooter-"] button:has(svg.icon-primary-action)';
    }
    
    /**
     * 获取定位参考元素
     * 新版使用包含左右操作按钮的 Composer 底栏，旧版使用 form。
     * @param {HTMLElement} inputElement - 输入框元素
     */
    getPositionReferenceElement(inputElement) {
        return inputElement?.closest('[class*="ComposerLayoutFooter-"]')
            || inputElement?.closest('form')
            || inputElement;
    }
    
    /**
     * 获取提示词按钮位置偏移量
     */
    getPromptButtonOffset() {
        return { top: 10, left: -2 };
    }
    
    /**
     * 获取回到底部按钮位置偏移量
     */
    getScrollToBottomOffset() {
        return { top: -3, right: 8 };
    }
}
