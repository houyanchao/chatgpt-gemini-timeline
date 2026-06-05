/**
 * Qwen International Smart Enter Adapter
 *
 * 千问国际版 (chat.qwen.ai) 的智能 Enter 适配器
 */

class QwenSmartEnterAdapter extends BaseSmartEnterAdapter {
    async matches() {
        return matchesSmartInputPlatform('qwen');
    }

    getInputSelector() {
        return 'textarea.message-input-textarea';
    }

    getPositionReferenceElement(inputElement) {
        return inputElement?.closest('.message-input-container') || inputElement;
    }

    getPromptButtonOffset() {
        return { top: 10, left: -2 };
    }
}
