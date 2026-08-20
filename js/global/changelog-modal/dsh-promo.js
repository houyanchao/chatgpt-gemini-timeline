/**
 * 【临时-DSH宣传】DeepSeek Harness 版推广卡片
 *
 * 在更新弹窗内容区展示 dsh-timeline 原生插件的介绍，样式自包含（随组件注入）。
 *
 * ⚠️ 完整下线清单（全局搜索「临时-DSH宣传」可找到所有改动点）：
 * 1. 删除本文件（dsh-promo.js）
 * 2. manifest.json：移除 "js/global/changelog-modal/dsh-promo.js" 这一行
 *    （该行位于 js/panelModal/base-tab.js 之后，因为本文件的 DshPromoTab 依赖 BaseTab）
 * 3. changelog-modal/index.js（共 5 处，均有「临时-DSH宣传」注释）：
 *    - show() 中 hasContent 判断：去掉 window.createDshPromoSection 那一行
 *    - hasUpdate() 中 hasContent 判断：去掉 window.createDshPromoSection 那一行
 *    - _render() 中推广卡片挂载：删除整段 if
 *    - _render() 中评分引导条隐藏：删除 ratingBar.style.display = 'none' 那一行（恢复评分条）
 *    - _render() 中 footer 按钮：删除 docsLink/githubLink 的两行 display='none'（恢复原按钮），
 *      并删除整段 dshGithubLink（dsh-timeline GitHub 按钮）
 * 4. changelog.js：删除 features 上方的临时说明注释，按正常流程填写下一期更新内容
 * 5. panelModal/tab-registry.js（共 2 处，均有「临时-DSH宣传」注释）：
 *    - TAB_CONFIG 中删除 { id: 'dsh-promo', ... } 条目
 *    - getTabClass() 中删除 'DshPromoTab' 分支
 */

(function () {
    const STYLE_ID = 'changelog-dsh-promo-style';
    const DSH_GITHUB_URL = 'https://github.com/houyanchao/dsh-timeline';
    const DSH_GITHUB_HOST_PATH = 'github.com/houyanchao/dsh-timeline';

    const CSS = `
.changelog-dsh-promo {
    margin: 6px 0 4px;
    padding: 14px 16px;
    border-radius: 12px;
    background: linear-gradient(135deg, #f8f7ff 0%, #f0f4ff 100%);
    border: 1px solid rgba(97, 40, 255, 0.08);
}

.changelog-dsh-promo-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
}

.changelog-dsh-promo-badge {
    flex-shrink: 0;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: #ffffff;
    background: linear-gradient(135deg, #6128ff, #8b5cf6);
    padding: 2px 7px;
    border-radius: 999px;
}

.changelog-dsh-promo-title {
    font-size: 13.5px;
    font-weight: 650;
    color: #1f2937;
    line-height: 1.4;
}
.changelog-dsh-promo-desc {
    font-size: 12.5px;
    color: #4b5563;
    line-height: 1.6;
    margin-bottom: 10px;
}

.changelog-dsh-promo-desc code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 11.5px;
    color: #6128ff;
    background: rgba(97, 40, 255, 0.07);
    padding: 1px 5px;
    border-radius: 5px;
}

.changelog-dsh-promo-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}

.changelog-dsh-promo-chip {
    font-size: 11px;
    color: #5b21b6;
    background: rgba(139, 92, 246, 0.09);
    border: 1px solid rgba(139, 92, 246, 0.12);
    padding: 2px 9px;
    border-radius: 999px;
    line-height: 1.6;
}

.changelog-dsh-promo-install {
    margin-top: 12px;
    padding-top: 10px;
    border-top: 1px dashed rgba(97, 40, 255, 0.12);
}

.changelog-dsh-promo-install-box {
    background: #ffffff;
    border: 1px solid rgba(97, 40, 255, 0.06);
    border-radius: 10px;
    padding: 12px 14px;
    box-shadow: 0 2px 12px rgba(31, 26, 61, 0.08), 0 1px 3px rgba(31, 26, 61, 0.05);
}

.changelog-dsh-promo-install-item {
    display: flex;
    align-items: baseline;
    gap: 7px;
    font-size: 12px;
    color: #4b5563;
    line-height: 1.7;
}

.changelog-dsh-promo-install-item + .changelog-dsh-promo-install-item {
    margin-top: 10px;
}

.changelog-dsh-promo-install-num {
    flex-shrink: 0;
    color: #8b5cf6;
    font-weight: 650;
}

.changelog-dsh-promo-install-item-body {
    flex: 1;
    min-width: 0;
}

.changelog-dsh-promo-install-item code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 11px;
    color: #6128ff;
    background: rgba(97, 40, 255, 0.07);
    padding: 1px 6px;
    border-radius: 5px;
    word-break: break-all;
}

.changelog-dsh-promo-install-code {
    display: block;
    margin: 8px 0 0;
    padding: 10px 12px;
    background: #232136;
    border-radius: 8px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 11px;
    line-height: 1.75;
    color: #d6d3e8;
    white-space: pre;
    overflow-x: auto;
}

.changelog-dsh-promo-install-code .cmt {
    color: #817e9c;
}

.dsh-promo-github {
    margin-top: 10px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    background: #ffffff;
    border: 1px solid rgba(97, 40, 255, 0.06);
    border-radius: 10px;
    text-decoration: none;
    color: inherit;
    box-shadow: 0 2px 12px rgba(31, 26, 61, 0.08), 0 1px 3px rgba(31, 26, 61, 0.05);
    transition: background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
    cursor: pointer;
}

.dsh-promo-github:hover {
    background: #faf8ff;
    border-color: rgba(97, 40, 255, 0.22);
    box-shadow: 0 4px 16px rgba(97, 40, 255, 0.1), 0 1px 3px rgba(31, 26, 61, 0.05);
}

.dsh-promo-github:focus-visible {
    outline: 2px solid #8b5cf6;
    outline-offset: 2px;
}

.dsh-promo-github-icon {
    flex-shrink: 0;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #ffffff;
    background: linear-gradient(135deg, #24292f, #3d4450);
}

.dsh-promo-github-icon svg {
    width: 16px;
    height: 16px;
}

.dsh-promo-github-texts {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
}

.dsh-promo-github-label {
    font-size: 12px;
    font-weight: 650;
    color: #1f2937;
    line-height: 1.4;
}

.dsh-promo-github-url {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 11px;
    color: #6128ff;
    line-height: 1.5;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.dsh-promo-github-arrow {
    flex-shrink: 0;
    color: #9ca3af;
    transition: color 0.15s ease, transform 0.15s ease;
}

.dsh-promo-github:hover .dsh-promo-github-arrow {
    color: #6128ff;
    transform: translate(1px, -1px);
}

html[data-timeline-theme="dark"] .changelog-dsh-promo {
    background: linear-gradient(135deg, rgba(97, 40, 255, 0.08), rgba(139, 92, 246, 0.06));
    border-color: rgba(139, 92, 246, 0.14);
}

html[data-timeline-theme="dark"] .changelog-dsh-promo-title {
    color: #e5e2f0;
}
html[data-timeline-theme="dark"] .changelog-dsh-promo-desc {
    color: #b6b2c8;
}

html[data-timeline-theme="dark"] .changelog-dsh-promo-desc code {
    color: #b39aff;
    background: rgba(139, 92, 246, 0.14);
}

html[data-timeline-theme="dark"] .changelog-dsh-promo-chip {
    color: #c4b0ff;
    background: rgba(139, 92, 246, 0.12);
    border-color: rgba(139, 92, 246, 0.2);
}

html[data-timeline-theme="dark"] .changelog-dsh-promo-install {
    border-top-color: rgba(139, 92, 246, 0.18);
}

html[data-timeline-theme="dark"] .changelog-dsh-promo-install-box {
    background: #24223a;
    border-color: rgba(139, 92, 246, 0.14);
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.3), 0 1px 3px rgba(0, 0, 0, 0.2);
}

html[data-timeline-theme="dark"] .changelog-dsh-promo-install-item {
    color: #b6b2c8;
}

html[data-timeline-theme="dark"] .changelog-dsh-promo-install-item code {
    color: #b39aff;
    background: rgba(139, 92, 246, 0.14);
}

html[data-timeline-theme="dark"] .changelog-dsh-promo-install-code {
    background: #171526;
}

html[data-timeline-theme="dark"] .dsh-promo-github {
    background: #24223a;
    border-color: rgba(139, 92, 246, 0.14);
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.3), 0 1px 3px rgba(0, 0, 0, 0.2);
}

html[data-timeline-theme="dark"] .dsh-promo-github:hover {
    background: #2c2948;
    border-color: rgba(139, 92, 246, 0.32);
}

html[data-timeline-theme="dark"] .dsh-promo-github-icon {
    background: linear-gradient(135deg, #0d1117, #30363d);
}

html[data-timeline-theme="dark"] .dsh-promo-github-label {
    color: #e5e2f0;
}

html[data-timeline-theme="dark"] .dsh-promo-github-url {
    color: #b39aff;
}

html[data-timeline-theme="dark"] .dsh-promo-github-arrow {
    color: #6b6780;
}

html[data-timeline-theme="dark"] .dsh-promo-github:hover .dsh-promo-github-arrow {
    color: #b39aff;
}
`;

    function ensureStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = CSS;
        document.head.appendChild(style);
    }

    /**
     * 创建推广卡片
     * @param {string} lang - 'zh' 或 'en'
     * @returns {HTMLElement}
     */
    window.createDshPromoSection = function (lang) {
        ensureStyles();

        const isZh = lang === 'zh';

        const title = isZh
            ? 'Timeline 有 DeepSeek Harness 版了！'
            : 'Timeline is now on DeepSeek Harness!';

        const desc = isZh
            ? '如果你在用 DeepSeek Harness，现在可以装上原生插件 <code>dsh-timeline</code> 你熟悉的功能一个不少，并且主题跟随、开箱即用。'
            : 'If you use DeepSeek Harness, install the native <code>dsh-timeline</code> plugin — everything you know is here, with theme syncing and zero setup.';

        const chips = isZh
            ? ['时间轴', '收藏文件夹', '提示词库', '对话导出', '公式复制']
            : ['Timeline', 'Starred Folders', 'Prompt Library', 'Conversation Export', 'Formula Copy'];

        const installLabel1 = isZh ? '安装方式1：' : 'Option 1: ';
        const installLabel2 = isZh ? '安装方式2：' : 'Option 2: ';

        const cliLabel = isZh ? '命令行安装' : 'Install via CLI';
        const cliCode = isZh
            ? '<span class="cmt"># 安装 dsh-timeline 插件</span>\ndsh plugin --profile web add dsh-timeline\n\n<span class="cmt"># 启动 DeepSeek Harness</span>\ndsh web'
            : '<span class="cmt"># Install the dsh-timeline plugin</span>\ndsh plugin --profile web add dsh-timeline\n\n<span class="cmt"># Start DeepSeek Harness</span>\ndsh web';

        const storeItem = isZh
            ? '如果你的 DeepSeek Harness 安装过插件市场，在插件市场里搜 <code>dsh-timeline</code>'
            : 'If your DeepSeek Harness has the plugin marketplace installed, search <code>dsh-timeline</code> there';

        const card = document.createElement('div');
        card.className = 'changelog-dsh-promo';

        const header = document.createElement('div');
        header.className = 'changelog-dsh-promo-header';

        const badge = document.createElement('span');
        badge.className = 'changelog-dsh-promo-badge';
        badge.textContent = 'NEW';

        const titleEl = document.createElement('span');
        titleEl.className = 'changelog-dsh-promo-title';
        titleEl.textContent = title;

        header.appendChild(badge);
        header.appendChild(titleEl);

        const descEl = document.createElement('div');
        descEl.className = 'changelog-dsh-promo-desc';
        descEl.innerHTML = desc;

        const chipsEl = document.createElement('div');
        chipsEl.className = 'changelog-dsh-promo-chips';
        for (const chipText of chips) {
            const chip = document.createElement('span');
            chip.className = 'changelog-dsh-promo-chip';
            chip.textContent = chipText;
            chipsEl.appendChild(chip);
        }

        card.appendChild(header);
        card.appendChild(descEl);
        card.appendChild(chipsEl);

        const installEl = document.createElement('div');
        installEl.className = 'changelog-dsh-promo-install';

        // 带阴影的安装方式块
        const box = document.createElement('div');
        box.className = 'changelog-dsh-promo-install-box';

        // 安装方式2：命令行安装（含命令块）
        const cliItem = document.createElement('div');
        cliItem.className = 'changelog-dsh-promo-install-item';

        const cliNum = document.createElement('span');
        cliNum.className = 'changelog-dsh-promo-install-num';
        cliNum.textContent = installLabel2;

        const cliBody = document.createElement('span');
        cliBody.className = 'changelog-dsh-promo-install-item-body';

        const cliLabelEl = document.createElement('span');
        cliLabelEl.textContent = cliLabel;

        cliBody.appendChild(cliLabelEl);
        cliItem.appendChild(cliNum);
        cliItem.appendChild(cliBody);

        // 命令块独立成行，与阴影块左缘对齐（不随标签缩进）
        const cliCodeEl = document.createElement('pre');
        cliCodeEl.className = 'changelog-dsh-promo-install-code';
        cliCodeEl.innerHTML = cliCode;

        // 安装方式1：插件市场搜索
        const storeItemEl = document.createElement('div');
        storeItemEl.className = 'changelog-dsh-promo-install-item';

        const storeNum = document.createElement('span');
        storeNum.className = 'changelog-dsh-promo-install-num';
        storeNum.textContent = installLabel1;

        const storeBody = document.createElement('span');
        storeBody.className = 'changelog-dsh-promo-install-item-body';
        storeBody.innerHTML = storeItem;

        storeItemEl.appendChild(storeNum);
        storeItemEl.appendChild(storeBody);

        box.appendChild(storeItemEl);
        box.appendChild(cliItem);
        box.appendChild(cliCodeEl);
        installEl.appendChild(box);

        card.appendChild(installEl);

        return card;
    };

    /**
     * 【临时-DSH宣传】设置面板中的"DSH 插件"tab
     * 依赖 BaseTab（manifest 中本文件已安排在 js/panelModal/base-tab.js 之后加载）
     * 在 tab-registry.js 中注册（TAB_CONFIG + getTabClass，各 1 处）
     */
    if (typeof BaseTab !== 'undefined') {
        window.DshPromoTab = class DshPromoTab extends BaseTab {
            constructor() {
                super();
                this.id = 'dsh-promo';
                const isZh = (TimelineI18n.getUILanguage?.() || 'en').startsWith('zh');
                this.name = isZh ? 'DSH插件' : 'DSH Plugin';
                this.badge = 'NEW';
                this.icon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 22v-3"/>
                    <path d="M9 8V2"/>
                    <path d="M15 8V2"/>
                    <path d="M18 8v5a4 4 0 01-4 4h-4a4 4 0 01-4-4V8z"/>
                </svg>`;
            }

            render() {
                const container = document.createElement('div');
                container.className = 'dsh-promo-tab';

                const isZh = (TimelineI18n.getUILanguage?.() || 'en').startsWith('zh');
                const card = window.createDshPromoSection(isZh ? 'zh' : 'en');
                card.appendChild(this._createGithubRow(isZh));
                container.appendChild(card);

                return container;
            }

            _createGithubRow(isZh) {
                const link = document.createElement('a');
                link.className = 'dsh-promo-github';
                link.href = DSH_GITHUB_URL;
                link.target = '_blank';
                link.rel = 'noopener noreferrer';

                const icon = document.createElement('span');
                icon.className = 'dsh-promo-github-icon';
                icon.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.342-3.369-1.342-.454-1.155-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z"/></svg>';

                const texts = document.createElement('span');
                texts.className = 'dsh-promo-github-texts';

                const label = document.createElement('span');
                label.className = 'dsh-promo-github-label';
                label.textContent = isZh ? 'GitHub 开源' : 'View on GitHub';

                const urlEl = document.createElement('span');
                urlEl.className = 'dsh-promo-github-url';
                urlEl.textContent = DSH_GITHUB_HOST_PATH;

                texts.appendChild(label);
                texts.appendChild(urlEl);

                const arrow = document.createElement('span');
                arrow.className = 'dsh-promo-github-arrow';
                arrow.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" aria-hidden="true"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';

                link.appendChild(icon);
                link.appendChild(texts);
                link.appendChild(arrow);
                return link;
            }
        };
    }
})();
