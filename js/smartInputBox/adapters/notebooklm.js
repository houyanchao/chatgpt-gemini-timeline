/**
 * NotebookLM Smart Enter Adapter
 * 
 * Google NotebookLM 平台的智能 Enter 适配器
 */

class NotebookLMSmartEnterAdapter extends BaseSmartEnterAdapter {
    /**
     * 检测是否为 NotebookLM 页面
     */
    async matches() {
        return matchesSmartInputPlatform('notebooklm');
    }
    
    /**
     * 获取输入框选择器
     * NotebookLM 使用 .message-container 下的 textarea
     */
    getInputSelector() {
        return '.message-container textarea';
    }
    
    /**
     * 获取定位参考元素
     * 使用 .message-container 作为定位参考
     * @param {HTMLElement} inputElement - 输入框元素
     */
    getPositionReferenceElement(inputElement) {
        return inputElement?.closest('.message-container') || inputElement;
    }
    
    /**
     * 获取提示词按钮位置偏移量
     */
    getPromptButtonOffset() {
        return { top: 10, left: -15 };
    }
}
