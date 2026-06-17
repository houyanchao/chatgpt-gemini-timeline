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
     * ChatGPT 使用 id="prompt-textarea" 的 contenteditable div
     */
    getInputSelector() {
        return '#prompt-textarea';
    }
    
    /**
     * 获取发送按钮选择器
     */
    getSendButtonSelector() {
        return '#composer-submit-button';
    }
    
    /**
     * 获取定位参考元素
     * 使用输入框最近的 form 祖先元素作为定位参考
     * @param {HTMLElement} inputElement - 输入框元素
     */
    getPositionReferenceElement(inputElement) {
        return inputElement?.closest('form') || inputElement;
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
