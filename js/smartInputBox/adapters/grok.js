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
    
    /** Grok 的对话编辑器使用 ProseMirror，首页也可能使用 textarea。 */
    getInputSelector() {
        return '.ProseMirror[contenteditable="true"], form[data-composer] [data-composer-field] textarea';
    }

    getSendButtonSelector() {
        return 'form[data-composer] button[data-composer-action="send"]';
    }
 
    /** 使用输入框的外框定位提示词按钮和动画。 */
    getPositionReferenceElement(inputElement) {
        return inputElement?.closest('form[data-composer]')
            || inputElement?.closest('.query-bar')
            || inputElement;
    }
    
    getPromptButtonOffset(inputElement) {
        const composer = inputElement?.closest('form[data-composer]');
        if (!composer) return { top: 12, left: -2 };

        const composerRect = composer.getBoundingClientRect();
        const attachRect = composer.querySelector('[data-testid="attach-button"]')?.getBoundingClientRect();
        const center = attachRect?.height
            ? attachRect.top - composerRect.top + attachRect.height / 2
            : composerRect.height / 2;
        const buttonHeight = 32; // 与 .smart-input-prompt-btn 的高度一致
        return { top: Math.max(0, center - buttonHeight / 2), left: 0 };
    }
}
