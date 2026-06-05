/**
 * Perplexity Smart Enter Adapter
 * 
 * Perplexity AI 平台的智能 Enter 适配器
 */

class PerplexitySmartEnterAdapter extends BaseSmartEnterAdapter {
    /**
     * 检测是否为 Perplexity 页面
     */
    async matches() {
        return matchesSmartInputPlatform('perplexity');
    }
    
    /**
     * 获取输入框选择器
     * Perplexity 使用 id="ask-input" 的 contenteditable div
     */
    getInputSelector() {
        return '#ask-input[contenteditable="true"]';
    }
    
    /**
     * 获取定位参考元素
     * 使用 .bg-raised 祖先元素作为定位参考
     * @param {HTMLElement} inputElement - 输入框元素
     */
    getPositionReferenceElement(inputElement) {
        return inputElement?.closest('.bg-raised') || inputElement;
    }
    
    /**
     * 获取提示词按钮位置偏移量
     */
    getPromptButtonOffset() {
        return { top: 8, left: -2 };
    }
}
