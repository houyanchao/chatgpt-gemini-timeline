/**
 * Changelog Modal - 版本更新弹窗
 * 
 * 负责渲染更新内容弹窗，关闭时标记已读。
 * 由 PromptButtonManager 的 Logo 按钮触发调用。
 * 
 * 使用 chrome.storage.local 存储已读版本，跨所有 AI 站点共享状态。
 */

class ChangelogModal {
    constructor() {
        this.STORAGE_KEY = 'ait-changelog-read-version';
        this.overlay = null;
        this._boundHandleEscape = this._handleEscape.bind(this);
    }

    /**
     * 无条件弹出更新弹窗（供外部调用，如 Logo 按钮点击）
     */
    async show() {
        await TimelineI18n.ready();

        const hasContent = CHANGELOG_DATA.features?.length || CHANGELOG_DATA.improvements?.length
            || typeof window.createDshPromoSection === 'function'; // 【临时-DSH宣传】推广卡片计入内容（下线时去掉本行的这个条件）
        if (!CHANGELOG_DATA.id || !hasContent) return;
        this._render();
    }

    /**
     * 检查是否有未读更新
     * @returns {Promise<boolean>}
     */
    async hasUpdate() {
        try {
            const id = CHANGELOG_DATA.id;
            const hasContent = CHANGELOG_DATA.features?.length || CHANGELOG_DATA.improvements?.length
                || typeof window.createDshPromoSection === 'function'; // 【临时-DSH宣传】推广卡片计入内容（下线时去掉本行的这个条件）
            if (!id || !hasContent) return false;

            const readId = await this._getReadVersion();
            return readId !== id;
        } catch {
            return false;
        }
    }

    /**
     * 获取已读版本号
     */
    _getReadVersion() {
        return new Promise(resolve => {
            try {
                chrome.storage.local.get(this.STORAGE_KEY, result => {
                    resolve(result?.[this.STORAGE_KEY] || null);
                });
            } catch {
                resolve(null);
            }
        });
    }

    /**
     * 标记当前版本为已读
     */
    _markAsRead() {
        try {
            chrome.storage.local.set({
                [this.STORAGE_KEY]: CHANGELOG_DATA.id
            });
        } catch (e) {
            // warn('[ChangelogModal] markAsRead error:', e);
        }
    }

    /**
     * 获取当前语言环境（zh 或 en）
     */
    _getLang() {
        try {
            const uiLang = TimelineI18n.getUILanguage() || navigator.language || 'en';
            return uiLang.startsWith('zh') ? 'zh' : 'en';
        } catch {
            return 'en';
        }
    }

    /**
     * 渲染一个分组区域（标题 + 列表）
     */
    _renderSection(container, titleText, emoji, items, lang) {
        if (!items?.length) return;

        const section = document.createElement('div');
        section.className = 'changelog-section';

        const header = document.createElement('div');
        header.className = 'changelog-section-header';
        header.innerHTML = `<span class="changelog-section-emoji">${emoji}</span><span class="changelog-section-title">${titleText}</span>`;

        const list = document.createElement('ul');
        list.className = 'changelog-modal-list';

        for (const item of items) {
            const li = document.createElement('li');
            li.className = 'changelog-modal-item';

            const dot = document.createElement('span');
            dot.className = 'changelog-item-dot';

            const text = document.createElement('span');
            text.className = 'changelog-item-text';
            text.textContent = item[lang] || item.en || item.zh || '';

            li.appendChild(dot);
            li.appendChild(text);
            list.appendChild(li);
        }

        section.appendChild(header);
        section.appendChild(list);
        container.appendChild(section);
    }

    /**
     * 渲染弹窗
     */
    _render() {
        if (this.overlay) return;

        const lang = this._getLang();
        const { features, improvements } = CHANGELOG_DATA;
        const version = chrome.runtime.getManifest?.()?.version || '';

        const overlay = document.createElement('div');
        overlay.className = 'changelog-modal-overlay';
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) this._close();
        });

        const modal = document.createElement('div');
        modal.className = 'changelog-modal';

        // Header
        const header = document.createElement('div');
        header.className = 'changelog-modal-header';

        const headerIcon = document.createElement('div');
        headerIcon.className = 'changelog-modal-icon';
        const logoImg = document.createElement('img');
        logoImg.src = chrome.runtime.getURL('icons/icon128.png');
        logoImg.className = 'changelog-modal-logo';
        headerIcon.appendChild(logoImg);

        const headerContent = document.createElement('div');
        headerContent.className = 'changelog-modal-header-content';

        const title = document.createElement('div');
        title.className = 'changelog-modal-title';
        const titleText = TimelineI18n.getMessage('changelogTitle') || 'Timeline 更新啦！';
        title.innerHTML = `${titleText} <span class="changelog-version-badge">v${version}</span>`;

        const subtitle = document.createElement('div');
        subtitle.className = 'changelog-modal-subtitle';
        const userCount = '37,000+';
        subtitle.textContent = TimelineI18n.getMessage('changelogSubtitle', [userCount]) || `${userCount} 用户在用，新版本体验再升级。`;

        headerContent.appendChild(title);
        headerContent.appendChild(subtitle);

        header.appendChild(headerIcon);
        header.appendChild(headerContent);

        // Body - grouped sections
        const body = document.createElement('div');
        body.className = 'changelog-modal-body';

        const featTitle = TimelineI18n.getMessage('changelogFeatures') || '新功能';
        const improveTitle = TimelineI18n.getMessage('changelogImprovements') || '功能优化';

        this._renderSection(body, featTitle, '✨', features, lang);
        this._renderSection(body, improveTitle, '🔧', improvements, lang);

        // 【临时-DSH宣传】DeepSeek Harness 推广卡片（下线时删除 dsh-promo.js 并移除此段，完整下线清单见 dsh-promo.js 文件头）
        if (typeof window.createDshPromoSection === 'function') {
            body.appendChild(window.createDshPromoSection(lang));
        }

        // Rating prompt
        const ratingBar = document.createElement('div');
        ratingBar.className = 'changelog-rating-bar';

        const isEdge = /Edg/i.test(navigator.userAgent);
        const storeName = isEdge ? 'Edge' : 'Chrome';

        const ratingText = document.createElement('span');
        ratingText.className = 'changelog-rating-text';
        ratingText.textContent = lang === 'zh'
            ? `如果 Timeline 帮到了你，求在 ${storeName} 插件商店给个 5 星好评，能帮助更多人发现它！`
            : `If Timeline helped you, a 5-star review on the ${storeName} Web Store helps more people discover it!`;
        const storeUrl = isEdge
            ? 'https://microsoftedge.microsoft.com/addons/detail/ai-timeline%EF%BC%9Agemini%E3%80%81chatgp/ekednjjojnhlajfobalaaihkibbdcbab'
            : 'https://chromewebstore.google.com/detail/timeline-chatgpt-gemini-c/fgebdnlceacaiaeikopldglhffljjlhh/reviews?utm_source=item-share-cb';

        const ratingBtn = document.createElement('a');
        ratingBtn.className = 'changelog-rating-btn';
        ratingBtn.href = storeUrl;
        ratingBtn.target = '_blank';
        ratingBtn.textContent = lang === 'zh' ? '⭐ 前往评分' : '⭐ Rate it';

        ratingBar.appendChild(ratingText);
        ratingBar.appendChild(ratingBtn);

        // 【临时-DSH宣传】隐藏评分引导条（下线时删除这一行即可恢复）
        ratingBar.style.display = 'none';

        // Footer
        const footer = document.createElement('div');
        footer.className = 'changelog-modal-footer';

        const footerLinks = document.createElement('div');
        footerLinks.className = 'changelog-footer-links';

        const docsLink = document.createElement('a');
        docsLink.href = 'https://timeline4ai.com/#/guide?section=timeline';
        docsLink.target = '_blank';
        docsLink.className = 'changelog-footer-icon';
        docsLink.title = TimelineI18n.getMessage('aboutBtnDocs') || '功能文档';
        docsLink.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="18" height="18"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg>';

        const githubLink = document.createElement('a');
        githubLink.href = 'https://github.com/houyanchao/chatgpt-gemini-timeline';
        githubLink.target = '_blank';
        githubLink.className = 'changelog-footer-icon';
        githubLink.title = TimelineI18n.getMessage('aboutBtnGithub') || 'GitHub 开源';
        githubLink.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="18" height="18"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 00-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0020 4.77 5.07 5.07 0 0019.91 1S18.73.65 16 2.48a13.38 13.38 0 00-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 005 4.77a5.44 5.44 0 00-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 009 18.13V22"/></svg>';

        const tooltipOpts = { style: 'mini', placement: 'top' };
        const docsTooltipText = TimelineI18n.getMessage('aboutBtnDocs') || '功能文档';
        const githubTooltipText = TimelineI18n.getMessage('aboutBtnGithub') || 'GitHub 开源';

        docsLink.addEventListener('mouseenter', () => {
            window.globalTooltipManager?.show('changelog-docs', 'button', docsLink, docsTooltipText, tooltipOpts);
        });
        docsLink.addEventListener('mouseleave', () => {
            window.globalTooltipManager?.hide();
        });
        githubLink.addEventListener('mouseenter', () => {
            window.globalTooltipManager?.show('changelog-github', 'button', githubLink, githubTooltipText, tooltipOpts);
        });
        githubLink.addEventListener('mouseleave', () => {
            window.globalTooltipManager?.hide();
        });

        footerLinks.appendChild(docsLink);
        footerLinks.appendChild(githubLink);

        // 【临时-DSH宣传】隐藏"功能文档"、"GitHub 开源"两个按钮（下线时删除下面两行即可恢复）
        docsLink.style.display = 'none';
        githubLink.style.display = 'none';

        // 【临时-DSH宣传】dsh-timeline GitHub 按钮（占用原 GitHub 按钮的位置，下线时删除本段，并恢复上面隐藏的两个按钮）
        const dshGithubLink = document.createElement('a');
        dshGithubLink.href = 'https://github.com/houyanchao/dsh-timeline';
        dshGithubLink.target = '_blank';
        dshGithubLink.rel = 'noopener noreferrer';
        dshGithubLink.className = 'changelog-footer-icon';
        dshGithubLink.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="18" height="18"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 00-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0020 4.77 5.07 5.07 0 0019.91 1S18.73.65 16 2.48a13.38 13.38 0 00-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 005 4.77a5.44 5.44 0 00-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 009 18.13V22"/></svg>';
        const dshGithubTooltipText = lang === 'zh' ? 'dsh-timeline 开源地址' : 'dsh-timeline on GitHub';
        dshGithubLink.title = dshGithubTooltipText;
        dshGithubLink.addEventListener('mouseenter', () => {
            window.globalTooltipManager?.show('changelog-dsh-github', 'button', dshGithubLink, dshGithubTooltipText, tooltipOpts);
        });
        dshGithubLink.addEventListener('mouseleave', () => {
            window.globalTooltipManager?.hide();
        });
        footerLinks.appendChild(dshGithubLink);

        const confirmBtn = document.createElement('button');
        confirmBtn.className = 'changelog-modal-btn';
        confirmBtn.textContent = lang === 'zh' ? '我知道了' : 'Got it';
        confirmBtn.addEventListener('click', () => this._close());

        footer.appendChild(footerLinks);
        footer.appendChild(confirmBtn);

        modal.appendChild(header);
        modal.appendChild(body);
        modal.appendChild(ratingBar);
        modal.appendChild(footer);
        overlay.appendChild(modal);

        document.body.appendChild(overlay);

        requestAnimationFrame(() => {
            overlay.classList.add('visible');
        });

        this.overlay = overlay;
        document.addEventListener('keydown', this._boundHandleEscape);
    }

    /**
     * 关闭弹窗并标记已读
     */
    _close() {
        if (!this.overlay) return;

        this.overlay.classList.remove('visible');
        document.removeEventListener('keydown', this._boundHandleEscape);

        setTimeout(() => {
            if (this.overlay?.parentNode) {
                this.overlay.parentNode.removeChild(this.overlay);
            }
            this.overlay = null;
        }, 200);

        this._markAsRead();
    }

    _handleEscape(e) {
        if (e.key === 'Escape') {
            this._close();
        }
    }
}

// ==================== 全局单例 ====================

if (!window.changelogModal) {
    window.changelogModal = new ChangelogModal();
    
    // popup 模式：自动弹窗（延迟 3 秒，避免干扰页面加载）
    if (CHANGELOG_DATA.displayMode === 'popup') {
        setTimeout(async () => {
            const hasUpdate = await window.changelogModal.hasUpdate();
            if (hasUpdate) window.changelogModal.show();
        }, 3000);
    }
}
