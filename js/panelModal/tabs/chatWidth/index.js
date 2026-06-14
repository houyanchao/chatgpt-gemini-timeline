/**
 * ChatWidthTab - 对话宽度调节
 *
 * 提供可视化滑块让用户调大对话区域宽度，
 * 充分利用屏幕空间。
 */

class ChatWidthTab extends BaseTab {
    constructor() {
        super();
        this.id = 'chat-width';
        this.name = TimelineI18n.getMessage('chatWidthTitle') || '对话宽度';
        this.icon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 3H3v18h18V3z"/><path d="M9 3v18"/><path d="M15 3v18"/>
        </svg>`;
    }

    async shouldShow() {
        const platform = typeof getCurrentPlatform === 'function'
            ? await getCurrentPlatform()
            : null;
        return !!platform?.features?.chatWidth;
    }

    render() {
        const container = document.createElement('div');
        container.className = 'chat-width-settings';

        const mgr = window.ChatWidthManager?.getInstance();
        const currentScale = mgr?.getScale() || 100;

        container.innerHTML = `
            <div class="setting-section">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">${TimelineI18n.getMessage('chatWidthTitle') || '对话宽度'}</div>
                        <div class="setting-hint">${TimelineI18n.getMessage('chatWidthHint') || '调大对话区域宽度，充分利用屏幕空间'}</div>
                    </div>
                    <button class="starred-manage-btn" id="chat-width-adjust-btn">${TimelineI18n.getMessage('chatWidthAdjust') || '调节'}</button>
                </div>
            </div>
            <div class="cw-preview-section">
                <div class="cw-preview-label">${TimelineI18n.getMessage('chatWidthCurrent') || '当前宽度'}</div>
                <div class="cw-preview-value" id="cw-current-value">${currentScale}%</div>
            </div>
        `;
        return container;
    }

    mounted() {
        super.mounted();

        const widthBtn = document.getElementById('chat-width-adjust-btn');
        if (widthBtn && window.ChatWidthManager) {
            this.addEventListener(widthBtn, 'click', () => {
                if (window.panelModal) window.panelModal.hide();
                setTimeout(() => ChatWidthManager.getInstance().showFloatingSlider(), 250);
            });
        }
    }
}
