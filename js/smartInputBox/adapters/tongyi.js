/**
 * Tongyi Smart Enter Adapter
 * 
 * 通义千问平台的智能 Enter 适配器
 */

class TongyiSmartEnterAdapter extends BaseSmartEnterAdapter {
    /**
     * 检测是否为通义千问页面
     */
    async matches() {
        return matchesSmartInputPlatform('tongyi');
    }
    
    /**
     * 获取输入框选择器
     * 通义千问使用 class 包含 textareaWrap 的元素下的 textarea
     */
    getInputSelector() {
        return '[class*="textareaWrap"] [data-slate-editor="true"][contenteditable="true"]';
    }

    /**
     * 获取定位参考元素
     * 使用 class 包含 inputContainer 的祖先元素作为定位参考
     * @param {HTMLElement} inputElement - 输入框元素
     */
    getPositionReferenceElement(inputElement) {
        return inputElement?.closest('[class*="inputContainer"]') || inputElement;
    }
    
    /**
     * 获取提示词按钮位置偏移量
     */
    getPromptButtonOffset() {
        return { top: 10, left: -2 };
    }

    insertText(inputElement, text) {
        if (!inputElement) return;
        inputElement.focus();

        const existingText = inputElement.innerText || '';
        const hasContent = existingText.trim().length > 0;

        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(inputElement);
        if (hasContent) {
            range.collapse(false);
        }
        sel.removeAllRanges();
        sel.addRange(range);

        const appendText = hasContent ? ('\n' + text + '\n') : text + '\n';

        const dt = new DataTransfer();
        dt.setData('text/plain', appendText);
        inputElement.dispatchEvent(new ClipboardEvent('paste', {
            clipboardData: dt, bubbles: true, cancelable: true
        }));

        setTimeout(() => {
            inputElement.focus();
            const s = window.getSelection();
            const r = document.createRange();
            r.selectNodeContents(inputElement);
            r.collapse(false);
            s.removeAllRanges();
            s.addRange(r);
            inputElement.scrollTop = inputElement.scrollHeight;
        }, 50);
    }
}
