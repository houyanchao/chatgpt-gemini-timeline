/**
 * Conversation Export Tab - 导出与截图设置
 *
 * 功能：
 * - 管理各平台「对话导出」功能的开关（仅列出具备导出适配器的平台）
 * - 默认开启，存储于 chrome.storage.local.conversationExportPlatformSettings
 * - 关闭后由 conversationExport 模块实时移除导出按钮
 */

class ConversationExportTab extends BaseTab {
    static STORAGE_KEY = 'conversationExportPlatformSettings';

    constructor() {
        super();
        this.id = 'conversation-export';
        this.name = TimelineI18n.getMessage('conversationExportTabName') || '导出与截图';
        this.icon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>`;
    }

    getInitialState() {
        return { transient: {}, persistent: {} };
    }

    render() {
        const container = document.createElement('div');
        container.className = 'conversation-export-settings-tab';
        container.innerHTML = `
            <div class="platform-list">
                <div class="platform-list-title">${this._esc(TimelineI18n.getMessage('conversationExportSettingsTitle') || '对话导出')}</div>
                <div class="platform-list-hint">${this._esc(TimelineI18n.getMessage('conversationExportSettingsHint') || '开启后，支持的平台对话页顶部会显示「导出对话」按钮')}</div>
                <div class="platform-list-container" id="conversation-export-platform-list"></div>
            </div>
            <div class="platform-list">
                <div class="platform-list-title">${this._esc(TimelineI18n.getMessage('messageScreenshotSettingsTitle'))}</div>
                <div class="platform-list-hint">${this._esc(TimelineI18n.getMessage('messageScreenshotSettingsHint'))}</div>
                <div class="platform-list-container" id="message-screenshot-platform-list"></div>
            </div>
        `;
        return container;
    }

    async mounted() {
        super.mounted();
        await this._renderList();
        await this._renderList({ feature: 'messageScreenshot', storageKey: 'messageScreenshotPlatformSettings', containerId: 'message-screenshot-platform-list' });
    }

    unmounted() {
        super.unmounted();
    }

    async _renderList({ feature = 'conversationExport', storageKey = ConversationExportTab.STORAGE_KEY, containerId = 'conversation-export-platform-list' } = {}) {
        const list = document.getElementById(containerId);
        if (!list) return;

        let platforms = [];
        try {
            platforms = typeof getPlatformsByFeature === 'function'
                ? await getPlatformsByFeature(feature)
                : [];
        } catch {
            platforms = [];
        }

        if (!platforms.length) {
            list.innerHTML = `<div class="conversation-export-empty">${this._esc(TimelineI18n.getMessage('conversationExportSettingsEmpty') || '暂无支持导出的平台')}</div>`;
            return;
        }

        let settings = {};
        try {
            const result = await chrome.storage.local.get(storageKey);
            settings = result?.[storageKey] || {};
        } catch {
            settings = {};
        }

        list.innerHTML = platforms.map(p => {
            const logoHtml = p.logoPath
                ? `<img class="conversation-export-platform-logo" src="${this._esc(chrome.runtime.getURL(p.logoPath))}" alt="${this._esc(p.name)}">`
                : `<span class="conversation-export-platform-logo conversation-export-platform-logo-fallback">${this._esc((p.name || '?').charAt(0))}</span>`;
            const checked = settings[p.id] !== false ? 'checked' : '';
            return `
                <div class="platform-item" data-platform-id="${this._esc(p.id)}">
                    <div class="platform-info-left">
                        ${logoHtml}
                        <span class="platform-name">${this._esc(p.name || p.id)}</span>
                    </div>
                    <label class="ait-toggle-switch">
                        <input type="checkbox" data-platform-id="${this._esc(p.id)}" ${checked}>
                        <span class="ait-toggle-slider"></span>
                    </label>
                </div>`;
        }).join('');

        list.querySelectorAll('input[data-platform-id]').forEach(cb => {
            this.addEventListener(cb, 'change', async () => {
                await this._handleToggleChange(cb.dataset.platformId, cb.checked, cb, storageKey);
            });
        });
    }

    async _handleToggleChange(platformId, enabled, toggle, storageKey = ConversationExportTab.STORAGE_KEY) {
        try {
            const result = await chrome.storage.local.get(storageKey);
            const settings = result?.[storageKey] || {};
            settings[platformId] = enabled;
            await chrome.storage.local.set({ [storageKey]: settings });
        } catch (e) {
            // 保存失败，回滚开关状态
            if (toggle) toggle.checked = !toggle.checked;
        }
    }

    _esc(text) {
        const div = document.createElement('div');
        div.textContent = String(text ?? '');
        return div.innerHTML;
    }
}

if (typeof window !== 'undefined') {
    window.ConversationExportTab = ConversationExportTab;
}
