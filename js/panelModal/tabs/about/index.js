/**
 * About Tab - 关于插件
 */

class AboutTab extends BaseTab {
    constructor() {
        super();
        this.id = 'about';
        this.name = chrome.i18n.getMessage('aboutTabName') || '关于插件';
        const isEdge = /Edg/i.test(navigator.userAgent);
        this._storeUrl = isEdge
            ? 'https://microsoftedge.microsoft.com/addons/detail/ai-timeline%EF%BC%9Agemini%E3%80%81chatgp/ekednjjojnhlajfobalaaihkibbdcbab'
            : 'https://chromewebstore.google.com/detail/fgebdnlceacaiaeikopldglhffljjlhh?utm_source=item-share-cb';
        this.icon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="8" stroke-width="3" stroke-linecap="round"/>
            <line x1="12" y1="12" x2="12" y2="16" stroke-linecap="round"/>
        </svg>`;
    }

    render() {
        const container = document.createElement('div');
        container.className = 'about-tab';

        container.innerHTML = `
            <div class="about-share-actions">
                <a href="https://timeline4ai.com/#/guide?section=timeline" target="_blank" class="about-share-action-btn">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg>
                    ${chrome.i18n.getMessage('aboutBtnDocs') || '功能文档'}
                </a>
                <a href="https://chromewebstore.google.com/detail/fgebdnlceacaiaeikopldglhffljjlhh?utm_source=item-share-cb" target="_blank" class="about-share-action-btn">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><line x1="21.17" y1="8" x2="12" y2="8"/><line x1="3.95" y1="6.06" x2="8.54" y2="14"/><line x1="10.88" y1="21.94" x2="15.46" y2="14"/></svg>
                    ${chrome.i18n.getMessage('aboutBtnChrome') || 'Chrome 安装'}
                </a>
                <a href="https://microsoftedge.microsoft.com/addons/detail/ai-timeline%EF%BC%9Agemini%E3%80%81chatgp/ekednjjojnhlajfobalaaihkibbdcbab" target="_blank" class="about-share-action-btn">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><circle cx="12" cy="12" r="10"/><path d="M16.24 7.76a6 6 0 010 8.49m-8.48-.01a6 6 0 010-8.49"/></svg>
                    ${chrome.i18n.getMessage('aboutBtnEdge') || 'Edge 安装'}
                </a>
                <a href="https://addons.mozilla.org/en-US/firefox/addon/ai-timeline/" target="_blank" class="about-share-action-btn">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><circle cx="12" cy="12" r="10"/><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zM17.9 17.39c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41C18.93 5.77 22 8.65 22 12c0 2.08-.8 3.97-2.1 5.39z"/></svg>
                    ${chrome.i18n.getMessage('aboutBtnFirefox') || 'Firefox 安装'}
                </a>
                <a href="https://github.com/houyanchao/chatgpt-gemini-timeline" target="_blank" class="about-share-action-btn">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 00-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0020 4.77 5.07 5.07 0 0019.91 1S18.73.65 16 2.48a13.38 13.38 0 00-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 005 4.77a5.44 5.44 0 00-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 009 18.13V22"/></svg>
                    ${chrome.i18n.getMessage('aboutBtnGithub') || 'GitHub 开源'}
                </a>
            </div>

            <div class="about-section">
                <div class="about-section-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                        <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/>
                        <polyline points="13,2 13,9 20,9"/>
                    </svg>
                </div>
                <div class="about-section-body">
                    <div class="about-section-title">${chrome.i18n.getMessage('aboutPluginTitle') || '插件简介'}</div>
                    <div class="about-section-content">${chrome.i18n.getMessage('aboutPluginContent') || 'Timeline 是专为浏览器端 AI 对话开发的提效插件，拥有 时间轴、文件夹、文本高亮、复制 LaTeX 公式、自定义提示词等超多功能，把效率拉爆。支持 ChatGPT、Gemini、Claude、DeepSeek、Kimi、豆包、千问等所有主流 AI 平台。'}</div>
                </div>
            </div>

            <div class="about-section">
                <div class="about-section-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                    </svg>
                </div>
                <div class="about-section-body">
                    <div class="about-section-title">${chrome.i18n.getMessage('aboutDataSecurityTitle') || '数据安全'}</div>
                    <div class="about-section-content">${chrome.i18n.getMessage('aboutDataSecurityContent') || '你的所有数据都存储在浏览器本地或你的 Google Drive 中，插件不会收集、上传或分享你的任何对话内容和个人信息，本项目已在 GitHub 开源，可随时审查代码。'}</div>
                </div>
            </div>

            <div class="about-section">
                <div class="about-section-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
                        <circle cx="12" cy="7" r="4"/>
                    </svg>
                </div>
                <div class="about-section-body">
                    <div class="about-section-title">${chrome.i18n.getMessage('aboutDeveloperTitle') || '开发者'}</div>
                    <div class="about-section-content">
                        ${chrome.i18n.getMessage('aboutDeveloperContent') || '本项目由我和 Claude Opus 4.6 共同维护，每周 1~2 新版本的更新节奏。如果想提需求或反馈 bug，可通过以下渠道进行反馈（我看到一定会回复）：'}
                        <div class="about-feedback-blocks">
                            <a href="https://chromewebstore.google.com/detail/fgebdnlceacaiaeikopldglhffljjlhh?utm_source=item-share-cb" target="_blank" class="about-feedback-block">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20"/></svg>
                                <span>${chrome.i18n.getMessage('aboutFeedbackStore') || 'Chrome 商店评价区'}</span>
                            </a>
                            <a href="https://github.com/houyanchao/chatgpt-gemini-timeline/issues" target="_blank" class="about-feedback-block">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 00-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0020 4.77 5.07 5.07 0 0019.91 1S18.73.65 16 2.48a13.38 13.38 0 00-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 005 4.77a5.44 5.44 0 00-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 009 18.13V22"/></svg>
                                <span>${chrome.i18n.getMessage('aboutFeedbackGithub') || 'GitHub Issues'}</span>
                            </a>
                            <div class="about-feedback-block about-feedback-email" data-email="houyanchao@outlook.com">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                                <span>${chrome.i18n.getMessage('aboutFeedbackEmail') || '邮件联系'}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="about-section about-section-highlight">
                <div class="about-section-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                        <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
                    </svg>
                </div>
                <div class="about-section-body">
                    <div class="about-section-title">${chrome.i18n.getMessage('aboutShareTitle') || '推荐给朋友'}</div>
                    <div class="about-section-content">
                        ${chrome.i18n.getMessage('aboutShareContent') || '如果 Timeline 插件好用，欢迎在 小红书、B站、X、Reddit、YouTube 等平台发帖推荐，也欢迎分享给朋友、同学，让更多人用上它。谢谢。❤️'}
                    </div>
                </div>
            </div>

        `;

        return container;
    }

    mounted() {
        super.mounted();
        const emailItem = document.querySelector('.about-feedback-email');
        if (emailItem) {
            this.addEventListener(emailItem, 'click', () => {
                const email = emailItem.dataset.email;
                navigator.clipboard.writeText(email).then(() => {
                    if (window.globalToastManager) {
                        window.globalToastManager.success(chrome.i18n.getMessage('xpzmvk') || '复制成功');
                    }
                });
            });
        }
    }

    unmounted() {
        super.unmounted();
    }
}
