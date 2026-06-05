/**
 * Grok Smart Enter Adapter
 * 
 * Grok 平台的智能 Enter 适配器
 */

class GrokSmartEnterAdapter extends BaseSmartEnterAdapter {
    /**
     * 检测是否为 Grok 页面
     */
    async matches() {
        return matchesSmartInputPlatform('grok');
    }
    
    /**
     * 获取输入框选择器
     * Grok 使用 class="ProseMirror" 且 contenteditable="true" 的 div
     */
    getInputSelector() {
        return '.ProseMirror[contenteditable="true"]';
    }
 
    /**
     * 获取定位参考元素
     * 使用 .query-bar 祖先元素作为定位参考
     * @param {HTMLElement} inputElement - 输入框元素
     */
    getPositionReferenceElement(inputElement) {
        return inputElement?.closest('.query-bar') || inputElement;
    }
    
    /**
     * 获取提示词按钮位置偏移量
     */
    getPromptButtonOffset() {
        return { top: 12, left: -2 };
    }
}
