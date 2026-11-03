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

    getSendButtonSelector() {
        return 'button[data-testid="chat-input-send"]';
    }

    getKeydownEventTarget() {
        // Claude 在编辑器祖先的捕获阶段处理 Enter，需要更早拦截。
        return window;
    }

    sendMessage(inputElement) {
        if (!this.canSend(inputElement)) return;

        const button = document.querySelector(this.getSendButtonSelector());
        if (!button || button.disabled || button.getAttribute('aria-disabled') === 'true') return;
        button.click();
    }

    /**
     * 获取定位参考元素
     * 新版使用输入框外框定位，避免文字区的内边距让按钮压住边框。
     * @param {HTMLElement} inputElement - 输入框元素
     */
    getPositionReferenceElement(inputElement) {
        return inputElement?.closest('.rounded-composer')
            || inputElement?.closest('[data-testid="chat-input-grid-area"]')
            || inputElement;
    }
    
    /**
     * 获取提示词按钮位置偏移量
     */
    getPromptButtonOffset(inputElement) {
        const composer = inputElement?.closest('.rounded-composer');
        if (composer) {
            const buttonHeight = 32; // 与 .smart-input-prompt-btn 的高度一致
            return {
                top: Math.max(0, (composer.getBoundingClientRect().height - buttonHeight) / 2),
                left: 0
            };
        }

        return { top: 10, left: -2 };
    }
}

