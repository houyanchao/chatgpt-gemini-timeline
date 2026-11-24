/**
 * About Tab - 关于插件
 */
class AboutTab extends BaseTab {
    constructor() {
        super();
        this.id = 'about';
        this.name = TimelineI18n.getMessage('aboutTabName') || '关于插件';
        this.icon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="8" stroke-width="3" stroke-linecap="round"/>
            <line x1="12" y1="12" x2="12" y2="16" stroke-linecap="round"/>
        </svg>`;
    }

    render() {
        const page = document.createElement('article');
        page.className = 'about-tab';

        const chromeStore = 'https://chromewebstore.google.com/detail/fgebdnlceacaiaeikopldglhffljjlhh?utm_source=item-share-cb';
        const repository = 'https://github.com/houyanchao/chatgpt-gemini-timeline';
        const externalArrow = '<span class="about-arrow" aria-hidden="true">↗</span>';
        page.innerHTML = `
            <header class="about-intro">
                <div class="about-masthead">
                    <img class="about-logo" src="${chrome.runtime.getURL('images/logo.png')}" width="52" height="52" alt="">
                    <h2>Timeline</h2>
                    <span class="about-ruler" aria-hidden="true"></span>
                </div>
                <p data-message="aboutPluginContent">Timeline 是一款浏览器扩展，帮助你浏览和整理 AI 对话。它提供时间轴、文件夹、文本高亮、LaTeX 公式复制和自定义提示词等功能。支持 ChatGPT、Gemini、Claude、DeepSeek、Kimi、豆包、千问等主流 AI 平台。</p>
                <div class="about-actions">
                    <a class="about-primary" href="https://timeline4ai.com/#/guide?section=timeline" target="_blank" rel="noopener noreferrer">
                        <span data-message="aboutBtnDocs">功能文档</span><span class="about-arrow" aria-hidden="true">→</span>
                    </a>
                    <a class="about-link" href="${repository}" target="_blank" rel="noopener noreferrer">
                        <span data-message="aboutBtnGithub">GitHub 开源</span>${externalArrow}
                    </a>
                    <a class="about-link" href="${chromeStore}" target="_blank" rel="noopener noreferrer">
                        <span data-message="aboutBtnChrome">Chrome 安装</span>${externalArrow}
                    </a>
                    <a class="about-link" href="https://microsoftedge.microsoft.com/addons/detail/ai-timeline%EF%BC%9Agemini%E3%80%81chatgp/ekednjjojnhlajfobalaaihkibbdcbab" target="_blank" rel="noopener noreferrer">
                        <span data-message="aboutBtnEdge">Edge 安装</span>${externalArrow}
                    </a>
                    <a class="about-link" href="https://addons.mozilla.org/en-US/firefox/addon/ai-timeline/" target="_blank" rel="noopener noreferrer">
                        <span data-message="aboutBtnFirefox">Firefox 安装</span>${externalArrow}
                    </a>
                </div>
            </header>

            <section class="about-row">
                <h3 data-message="aboutDataSecurityTitle">数据安全</h3>
                <p data-message="aboutDataSecurityContent">你的所有数据都存储在浏览器本地或你的 Google Drive 中，插件不会收集、上传或分享你的任何对话内容和个人信息，本项目已在 GitHub 开源，可随时审查代码。</p>
            </section>

            <section class="about-row">
                <h3 data-message="aboutDeveloperTitle">提需求</h3>
                <div>
                    <p data-message="aboutDeveloperContent">我和 Claude fabel 5.2 一起维护 Timeline，每周发布 1 至 2 个版本。欢迎通过下方渠道提出功能建议或报告问题。我看到后会回复。</p>
                    <div class="about-links">
                        <a class="about-link" href="${chromeStore}" target="_blank" rel="noopener noreferrer">
                            <span data-message="aboutFeedbackStore">Chrome 商店评价区</span>${externalArrow}
                        </a>
                        <a class="about-link" href="${repository}/issues" target="_blank" rel="noopener noreferrer">
                            <span data-message="aboutFeedbackGithub">GitHub Issues</span>${externalArrow}
                        </a>
                    </div>
                    <button type="button" class="about-link about-feedback-email" data-email="houyanchao@outlook.com">
                        <span>houyanchao@outlook.com</span><span class="about-copy-icon" aria-hidden="true"></span>
                    </button>
                </div>
            </section>

            <section class="about-row">
                <h3 data-message="aboutShareTitle">推荐给朋友</h3>
                <p data-message="aboutShareContent">如果 Timeline 对你有帮助，欢迎在小红书、B 站、X、Reddit、YouTube 等平台分享，让更多人发现它。谢谢你的推荐。</p>
            </section>
        `;

        for (const label of page.querySelectorAll('[data-message]')) {
            const text = TimelineI18n.getMessage(label.dataset.message);
            if (text) label.textContent = text;
        }
        const email = page.querySelector('.about-feedback-email');
        const copyLabel = (TimelineI18n.getMessage('mvkxpz') || '复制') + ' ' + email.dataset.email;
        email.setAttribute('aria-label', copyLabel);
        email.title = copyLabel;
        this.setDomRef('email', email);
        return page;
    }

    mounted() {
        super.mounted();
        const email = this.getDomRef('email');
        this.addEventListener(email, 'click', async () => {
            try {
                await navigator.clipboard.writeText(email.dataset.email);
                window.globalToastManager?.success(TimelineI18n.getMessage('xpzmvk') || '复制成功');
            } catch {
                window.globalToastManager?.error(TimelineI18n.getMessage('kpzmvx') || '复制失败');
            }
        });
    }
}
