/**
 * 【临时-DSH宣传】设置面板中的 DSH 插件安装说明。
 * 依赖 BaseTab，由 tab-registry.js 注册。
 */
(function () {
    if (typeof BaseTab === 'undefined') return;

    const STYLE_ID = 'changelog-dsh-promo-style';
    const GITHUB_URL = 'https://github.com/houyanchao/dsh-timeline';
    const DESKTOP_DOWNLOAD_URL = 'https://www.deepseek.com/harness/';
    const DESKTOP_SCREENSHOT_URL = 'https://image.bushishier.com/dsh_install.png';
    const PLUGIN = 'dsh-timeline';
    const CLI_COMMANDS = `dsh plugin --profile web add ${PLUGIN}\ndsh web`;

    const COPY = {
        zh: {
            tab: 'DSH 插件',
            title: 'Timeline 支持 DeepSeek Harness 啦！',
            features: '时间轴、收藏文件夹、提示词库、对话导出、消息截图与公式复制。',
            github: 'GitHub 仓库',
            install: '3种安装方式（任选其一）',
            desktop: 'DSH 官方客户端',
            desktopDownload: '下载客户端',
            desktopInstructions: `「插件」→「添加插件」，输入 <code>${PLUGIN}</code>，点「安装」，再点「立即启用」。`,
            screenshot: 'DeepSeek Harness 的添加插件窗口，包名已填入 dsh-timeline',
            openScreenshot: '查看大图',
            screenshotFallback: '查看安装截图',
            marketplace: '第三方插件商店',
            marketplaceInstructions: `如果已安装第三方插件商店，在商店里搜索 <code>${PLUGIN}</code> 并安装。`,
            cli: '命令行',
            cliInstructions: '在终端依次运行以下命令，安装插件并启动 DSH Web 版。',
            copy: '复制命令',
            copied: '已复制命令',
            copyError: '复制失败，请手动选中命令复制。',
        },
        en: {
            tab: 'DSH Plugin',
            title: 'Timeline now supports DeepSeek Harness!',
            features: 'Timeline, starred folders, prompt library, conversation export, message screenshots, and formula copying.',
            github: 'GitHub repository',
            install: '3 installation options (choose one)',
            desktop: 'Official DSH desktop app',
            desktopDownload: 'Download desktop app',
            desktopInstructions: `Open Plugins in the sidebar, choose Add plugin, enter <code>${PLUGIN}</code>, and click Install. Then select Enable now.`,
            screenshot: 'The DeepSeek Harness Add plugin dialog with dsh-timeline entered',
            openScreenshot: 'View full size',
            screenshotFallback: 'View installation screenshot',
            marketplace: 'Third-party plugin store',
            marketplaceInstructions: `If you already have a third-party plugin store, search for <code>${PLUGIN}</code> and install it there.`,
            cli: 'Command line',
            cliInstructions: 'Run these commands in your terminal to install the plugin and start DSH Web.',
            copy: 'Copy commands',
            copied: 'Commands copied',
            copyError: 'Could not copy. Select the commands to copy them manually.',
        },
    };

    const CSS = `
.dsh-promo-tab {
    --dsh-text: #252137;
    --dsh-muted: #56516a;
    --dsh-accent: #5633a7;
    --dsh-line: #e6e0ef;
    --dsh-surface: #ffffff;
    --dsh-tint: #f6f2ff;
    --dsh-tint-hover: #eee6ff;
    --dsh-hero: linear-gradient(110deg, #f3edff, #faf8ff);
    --dsh-dash: #cfc1ec;
    color: var(--dsh-text);
    font-size: 13px;
    line-height: 1.5;
}

html[data-timeline-theme="dark"] .dsh-promo-tab {
    --dsh-text: #f1ecff;
    --dsh-muted: #c1b8d3;
    --dsh-accent: #d6c2ff;
    --dsh-line: #413657;
    --dsh-surface: #252033;
    --dsh-tint: #302547;
    --dsh-tint-hover: #3b2c58;
    --dsh-hero: linear-gradient(110deg, #33264c, #29223a);
    --dsh-dash: #695488;
}

.dsh-promo-tab .dsh-promo-hero {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 10px 16px;
    padding: 14px 16px;
    background: var(--dsh-hero);
    border: 1px solid var(--dsh-line);
    border-radius: 12px;
}

.dsh-promo-tab .dsh-promo-title,
.dsh-promo-tab .dsh-promo-install-heading,
.dsh-promo-tab .dsh-promo-method-title {
    margin: 0;
    color: var(--dsh-text);
    font-weight: 650;
    letter-spacing: 0;
    line-height: 1.35;
}

.dsh-promo-tab .dsh-promo-title {
    font-size: 20px;
}

.dsh-promo-tab .dsh-promo-install-heading {
    margin: 16px 0 9px;
    color: #252137;
    font-size: 15px;
}

.dsh-promo-tab .dsh-promo-method-title {
    font-size: 14px;
}

.dsh-promo-tab .dsh-promo-description {
    margin: 4px 0 0;
    color: var(--dsh-muted);
    font-size: 12.5px;
    line-height: 1.55;
}

.dsh-promo-tab .dsh-promo-hero > div {
    flex: 1 1 290px;
    min-width: 0;
}

.dsh-promo-tab .dsh-promo-action {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    width: auto;
    min-height: 28px;
    padding: 4px 8px;
    box-sizing: border-box;
    border: 1px solid var(--dsh-line);
    border-radius: 6px;
    background: var(--dsh-surface);
    color: var(--dsh-accent);
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    line-height: 1.3;
    text-decoration: none;
    white-space: nowrap;
    cursor: pointer;
}

.dsh-promo-tab .dsh-promo-action:hover {
    background: var(--dsh-tint-hover);
}

.dsh-promo-tab .dsh-promo-action:focus-visible,
.dsh-promo-tab .dsh-promo-screenshot:focus-visible {
    outline: 2px solid var(--dsh-accent);
    outline-offset: 2px;
}

.dsh-promo-tab .dsh-promo-methods {
    display: grid;
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
}

.dsh-promo-tab .dsh-promo-method {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: start;
    gap: 10px;
    margin: 0;
    padding: 10px 12px;
    border: 1px solid var(--dsh-line);
    border-radius: 10px;
    background: var(--dsh-surface);
}

.dsh-promo-tab .dsh-promo-method:first-child {
    border-color: var(--dsh-dash);
}

.dsh-promo-tab .dsh-promo-number {
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: 6px;
    background: var(--dsh-tint);
    color: var(--dsh-accent);
    font-size: 12px;
    font-weight: 650;
}

.dsh-promo-tab .dsh-promo-method-title {
    padding-top: 2px;
}

.dsh-promo-tab .dsh-promo-method .dsh-promo-description {
    font-size: 13.5px;
    line-height: 1.6;
}

.dsh-promo-tab .dsh-promo-method .dsh-promo-description code {
    padding: 1px 4px;
    border-radius: 4px;
    background: var(--dsh-tint);
    color: var(--dsh-accent);
    font: 12.5px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    overflow-wrap: anywhere;
}

.dsh-promo-tab .dsh-promo-screenshot {
    position: relative;
    display: inline-block;
    vertical-align: top;
    max-width: 100%;
    box-sizing: border-box;
    margin-top: 8px;
    border: 1px solid var(--dsh-line);
    border-radius: 7px;
    overflow: hidden;
    text-decoration: none;
}

.dsh-promo-tab .dsh-promo-screenshot img {
    display: block;
    width: auto;
    height: auto;
    max-width: 100%;
    max-height: 170px;
}

.dsh-promo-tab .dsh-promo-screenshot-label {
    position: absolute;
    right: 6px;
    bottom: 6px;
    padding: 2px 6px;
    border: 1px solid var(--dsh-line);
    border-radius: 5px;
    background: var(--dsh-surface);
    color: var(--dsh-accent);
    font-size: 12px;
    font-weight: 600;
}

.dsh-promo-tab .dsh-promo-screenshot:hover .dsh-promo-screenshot-label {
    background: var(--dsh-tint-hover);
}

.dsh-promo-tab .dsh-promo-screenshot-fallback .dsh-promo-screenshot-label {
    position: static;
    display: block;
    padding: 6px 10px;
}

.dsh-promo-tab .dsh-promo-method-header {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: 6px 12px;
}

.dsh-promo-tab .dsh-promo-download {
    min-width: 0;
    max-width: 100%;
    white-space: normal;
    overflow-wrap: anywhere;
}

.dsh-promo-tab .dsh-promo-copy {
    font-size: 13px;
}

.dsh-promo-tab .dsh-promo-commands {
    margin: 8px 0 0;
    padding: 8px 10px;
    border-radius: 7px;
    background: #211b31;
    color: #f1ebff;
    font: 13px/1.6 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    user-select: text;
}

.dsh-promo-tab .dsh-promo-commands code {
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
}
`;

    function ensureStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = CSS;
        document.head.appendChild(style);
    }

    function getCopy() {
        return TimelineI18n.getUILanguage().startsWith('zh') ? COPY.zh : COPY.en;
    }

    window.DshPromoTab = class DshPromoTab extends BaseTab {
        constructor() {
            super();
            this.id = 'dsh-promo';
            this.name = getCopy().tab;
            this.icon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 22v-3"/>
                <path d="M9 8V2"/>
                <path d="M15 8V2"/>
                <path d="M18 8v5a4 4 0 01-4 4h-4a4 4 0 01-4-4V8z"/>
            </svg>`;
        }

        render() {
            ensureStyles();

            const copy = getCopy();
            const container = document.createElement('div');
            container.className = 'dsh-promo-tab';
            container.innerHTML = `
                <div class="dsh-promo-hero">
                    <div>
                        <h3 class="dsh-promo-title">${copy.title}</h3>
                        <p class="dsh-promo-description">${copy.features}</p>
                    </div>
                    <a class="dsh-promo-action" href="${GITHUB_URL}" target="_blank" rel="noopener noreferrer">
                        ${copy.github} <span aria-hidden="true">↗</span>
                    </a>
                </div>
                <h3 class="dsh-promo-install-heading">${copy.install}</h3>
                <ol class="dsh-promo-methods" role="list">
                    <li class="dsh-promo-method">
                        <span class="dsh-promo-number" aria-hidden="true">1</span>
                        <div>
                            <div class="dsh-promo-method-header">
                                <h4 class="dsh-promo-method-title">${copy.desktop}</h4>
                                <a class="dsh-promo-action dsh-promo-download" href="${DESKTOP_DOWNLOAD_URL}" target="_blank" rel="noopener noreferrer">
                                    ${copy.desktopDownload} <span aria-hidden="true">↗</span>
                                </a>
                            </div>
                            <p class="dsh-promo-description">${copy.desktopInstructions}</p>
                            <a class="dsh-promo-screenshot" href="${DESKTOP_SCREENSHOT_URL}" target="_blank" rel="noopener noreferrer">
                                <img alt="${copy.screenshot}" width="2342" height="1322" referrerpolicy="no-referrer">
                                <span class="dsh-promo-screenshot-label">${copy.openScreenshot} <span aria-hidden="true">↗</span></span>
                            </a>
                        </div>
                    </li>
                    <li class="dsh-promo-method">
                        <span class="dsh-promo-number" aria-hidden="true">2</span>
                        <div>
                            <h4 class="dsh-promo-method-title">${copy.marketplace}</h4>
                            <p class="dsh-promo-description">${copy.marketplaceInstructions}</p>
                        </div>
                    </li>
                    <li class="dsh-promo-method">
                        <span class="dsh-promo-number" aria-hidden="true">3</span>
                        <div>
                            <div class="dsh-promo-method-header">
                                <div>
                                    <h4 class="dsh-promo-method-title">${copy.cli}</h4>
                                    <p class="dsh-promo-description">${copy.cliInstructions}</p>
                                </div>
                                <button type="button" class="dsh-promo-action dsh-promo-copy">${copy.copy}</button>
                            </div>
                            <pre class="dsh-promo-commands"><code>${CLI_COMMANDS}</code></pre>
                        </div>
                    </li>
                </ol>
            `;

            const screenshotLink = container.querySelector('.dsh-promo-screenshot');
            const screenshotImage = screenshotLink.querySelector('img');
            this.addEventListener(screenshotImage, 'error', () => {
                screenshotImage.remove();
                screenshotLink.classList.add('dsh-promo-screenshot-fallback');
                screenshotLink.querySelector('.dsh-promo-screenshot-label').textContent = copy.screenshotFallback;
            }, { once: true });
            screenshotImage.src = DESKTOP_SCREENSHOT_URL;

            const button = container.querySelector('.dsh-promo-copy');
            this.addEventListener(button, 'click', async () => {
                try {
                    await navigator.clipboard.writeText(CLI_COMMANDS);
                    if (button.isConnected) window.globalToastManager?.success(copy.copied, button);
                } catch {
                    if (button.isConnected) window.globalToastManager?.error(copy.copyError, button);
                }
            });

            return container;
        }
    };
})();
