/**
 * Claude Smart Enter Adapter
 * 
 * Claude 平台的智能输入适配器
 */

class ClaudeSmartEnterAdapter extends BaseSmartEnterAdapter {
    /**
     * 检测是否为 Claude 页面
     */
    async matches() {
        return matchesSmartInputPlatform('claude');
    }
    
    /**
     * 获取输入框选择器
     * Claude 使用 ProseMirror 编辑器，contenteditable="true"
     */
    getInputSelector() {
        return '.ProseMirror[contenteditable="true"]';
    }

    /**
     * 获取定位参考元素
     * 使用 data-testid="chat-input-grid-area" 作为定位参考
     * @param {HTMLElement} inputElement - 输入框元素
     */
    getPositionReferenceElement(inputElement) {
        return inputElement?.closest('[data-testid="chat-input-grid-area"]') || inputElement;
    }
    
    /**
     * 获取提示词按钮位置偏移量
     */
    getPromptButtonOffset() {
        return { top: 10, left: -2 };
    }
}

