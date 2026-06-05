/**
 * Kimi Smart Enter Adapter
 * 
 * Kimi 平台的智能 Enter 适配器
 */

class KimiSmartEnterAdapter extends BaseSmartEnterAdapter {
    /**
     * 检测是否为 Kimi 页面
     */
    async matches() {
        return matchesSmartInputPlatform('kimi');
    }
    
    /**
     * 获取输入框选择器
     * Kimi 使用 class="chat-input-editor" 的 contenteditable div
     */
    getInputSelector() {
        return '.chat-input-editor[contenteditable="true"]';
    }

    /**
     * 获取发送按钮选择器
     * Kimi 的发送按钮容器为 .send-button-container（生成时带 .stop class）
     */
    getSendButtonSelector() {
        return '.send-button-container';
    }

    /**
     * 获取定位参考元素
     * 使用 .chat-editor 祖先元素作为定位参考
     * @param {HTMLElement} inputElement - 输入框元素
     */
    getPositionReferenceElement(inputElement) {
        return inputElement?.closest('.chat-editor') || inputElement;
    }
    
    /**
     * 获取提示词按钮位置偏移量
     */
    getPromptButtonOffset() {
        return { top: 5, left: -2 };
    }
}
