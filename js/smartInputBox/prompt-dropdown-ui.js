/**
 * Prompt Dropdown UI - 共享的提示词下拉菜单渲染
 *
 * 供 PromptButtonManager（插入模式）和 CustomSiteFloatButton（复制模式）共用，
 * 统一渲染逻辑，调用方只需提供行为回调。
 *
 * @param {Object} options
 * @param {Array}    options.prompts        - 提示词列表（已过滤）
 * @param {Function} options.onItemClick    - (prompt, itemElement) => void
 * @param {Function} options.onManageClick  - () => void  点击添加提示词入口
 * @param {boolean}  [options.showCommonSettings=false] - 是否显示"常用设置"Tab
 * @param {Function} [options.onChatWidthClick] - () => void 点击对话宽度设置按钮
 * @param {Function} [options.onSmartInputSettingsClick] - () => void 点击换行与发送消息设置按钮
 * @param {Function} [options.onMirrorSiteClick] - () => void 点击适配新平台按钮
 * @param {Function} [options.onSettingsClick] - () => void 点击设置按钮
 * @param {string}   [options.tooltipPlacement='right'] - tooltip 方向
 * @returns {HTMLElement} prompt-dropdown-container 元素（未添加到 DOM）
 */
function createPromptDropdownUI({
    prompts,
    onItemClick,
    onManageClick,
    showCommonSettings = false,
    onChatWidthClick,
    onSmartInputSettingsClick,
    onMirrorSiteClick,
    onSettingsClick,
    showStoreDetailButton = true,
    tooltipPlacement = 'right'
}) {
    const container = document.createElement('div');
    container.className = 'prompt-dropdown-container';

    if (showCommonSettings) {
        const tabs = document.createElement('div');
        tabs.className = 'prompt-dropdown-tabs';
        tabs.innerHTML = `
            <div class="prompt-dropdown-tab-group">
                <button type="button" class="prompt-dropdown-tab active" data-prompt-tab="prompts">
                    <span class="prompt-dropdown-tab-text">${chrome.i18n.getMessage('hosegod') || '提示词'}</span>
                    <span class="prompt-dropdown-tab-icon prompt-dropdown-add-tab-action" aria-label="${chrome.i18n.getMessage('byaskjndg') || '添加提示词'}">
                        <svg width="12" height="12" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M7 1V13M1 7H13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                        </svg>
                    </span>
                </button>
                <button type="button" class="prompt-dropdown-tab" data-prompt-tab="common-settings">
                    <span class="prompt-dropdown-tab-text">${chrome.i18n.getMessage('promptCommonSettingsTab') || '常用设置'}</span>
                    <span class="prompt-dropdown-tab-icon prompt-dropdown-settings-tab-action" aria-label="${chrome.i18n.getMessage('promptAllSettingsTooltip') || '全部设置'}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M9.67 4.14a2.34 2.34 0 0 1 4.66 0 2.34 2.34 0 0 0 3.32 1.91 2.34 2.34 0 0 1 2.33 4.04 2.34 2.34 0 0 0 0 3.82 2.34 2.34 0 0 1-2.33 4.04 2.34 2.34 0 0 0-3.32 1.91 2.34 2.34 0 0 1-4.66 0 2.34 2.34 0 0 0-3.32-1.91 2.34 2.34 0 0 1-2.33-4.04 2.34 2.34 0 0 0 0-3.82 2.34 2.34 0 0 1 2.33-4.04 2.34 2.34 0 0 0 3.32-1.91Z"/>
                            <circle cx="12" cy="12" r="3"/>
                        </svg>
                    </span>
                </button>
            </div>
            ${showStoreDetailButton ? `<button type="button" class="prompt-dropdown-share-btn prompt-dropdown-store-detail-btn" aria-label="${chrome.i18n.getMessage('shareExtension') || '分享插件'}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="18" cy="5" r="3"/>
                    <circle cx="6" cy="12" r="3"/>
                    <circle cx="18" cy="19" r="3"/>
                    <path d="M8.59 13.51 15.42 17.49"/>
                    <path d="M15.41 6.51 8.59 10.49"/>
                </svg>
            </button>` : ''}
        `;
        const addBtn = tabs.querySelector('.prompt-dropdown-add-tab-action');
        const addTooltip = chrome.i18n.getMessage('byaskjndg') || '添加提示词';
        addBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (onManageClick) onManageClick();
        });
        addBtn.addEventListener('mouseenter', () => {
            window.globalTooltipManager?.show(
                'prompt-dropdown-add-prompt',
                'button',
                addBtn,
                addTooltip,
                { style: 'mini', placement: 'top' }
            );
        });
        addBtn.addEventListener('mouseleave', () => {
            window.globalTooltipManager?.hide();
        });

        const settingsBtn = tabs.querySelector('.prompt-dropdown-settings-tab-action');
        const settingsTooltip = chrome.i18n.getMessage('promptAllSettingsTooltip') || '全部设置';
        settingsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (onSettingsClick) onSettingsClick();
        });
        settingsBtn.addEventListener('mouseenter', () => {
            window.globalTooltipManager?.show(
                'prompt-dropdown-all-settings',
                'button',
                settingsBtn,
                settingsTooltip,
                { style: 'mini', placement: 'top' }
            );
        });
        settingsBtn.addEventListener('mouseleave', () => {
            window.globalTooltipManager?.hide();
        });

        _promptDropdownBindStoreDetailButton(tabs.querySelector('.prompt-dropdown-store-detail-btn'));
        container.appendChild(tabs);
    } else {
        // ===== Header =====
        const header = document.createElement('div');
        header.className = 'prompt-dropdown-header';
        header.innerHTML = `
            <div class="prompt-dropdown-title-wrapper">
                <svg class="prompt-dropdown-title-icon" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                </svg>
                <span class="prompt-dropdown-title">${chrome.i18n.getMessage('hosegod')}</span>
            </div>
            <div class="prompt-dropdown-actions">
                ${showStoreDetailButton ? `<button type="button" class="prompt-dropdown-action-btn prompt-dropdown-store-detail-btn" aria-label="${chrome.i18n.getMessage('shareExtension') || '分享插件'}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="18" cy="5" r="3"/>
                        <circle cx="6" cy="12" r="3"/>
                        <circle cx="18" cy="19" r="3"/>
                        <path d="M8.59 13.51 15.42 17.49"/>
                        <path d="M15.41 6.51 8.59 10.49"/>
                    </svg>
                </button>` : ''}
                <button type="button" class="prompt-dropdown-action-btn prompt-dropdown-manage-btn">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:14px!important;height:14px!important">
                        <path d="M7 1V13M1 7H13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                </button>
            </div>
        `;
        header.querySelector('.prompt-dropdown-manage-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            if (onManageClick) onManageClick();
        });
        _promptDropdownBindStoreDetailButton(header.querySelector('.prompt-dropdown-store-detail-btn'));
        container.appendChild(header);
    }

    const promptsPanel = document.createElement('div');
    promptsPanel.className = 'prompt-dropdown-panel prompt-dropdown-prompts-panel active';
    promptsPanel.dataset.promptPanel = 'prompts';

    // ===== Sort =====
    const sortedPrompts = [...prompts].sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return 0;
    });

    // ===== Search =====
    if (sortedPrompts.length >= 5) {
        const searchWrap = document.createElement('div');
        searchWrap.className = 'prompt-dropdown-search';
        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.className = 'prompt-dropdown-search-input';
        searchInput.placeholder = chrome.i18n.getMessage('searchPrompt') || '搜索提示词...';
        searchInput.autocomplete = 'off';
        searchInput.addEventListener('input', () => {
            _promptDropdownFilter(container, searchInput.value.trim().toLowerCase());
        });
        searchWrap.appendChild(searchInput);
        promptsPanel.appendChild(searchWrap);
    }

    // ===== Body =====
    const body = document.createElement('div');
    body.className = 'prompt-dropdown-body';

    if (sortedPrompts.length > 0) {
        sortedPrompts.forEach(prompt => {
            body.appendChild(_promptDropdownCreateItem(prompt, onItemClick, tooltipPlacement));
        });
    } else {
        const empty = document.createElement('div');
        empty.className = 'prompt-dropdown-empty';
        empty.innerHTML = `
            <span class="prompt-dropdown-empty-hint">${chrome.i18n.getMessage('promptEmptyHint') || '保存常用提示词，用的时候点一下就能插入输入框。'}</span>
            <button type="button" class="prompt-dropdown-empty-action">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M7 1V13M1 7H13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>
                <span>${chrome.i18n.getMessage('byaskjndg') || '添加提示词'}</span>
            </button>
        `;
        empty.querySelector('.prompt-dropdown-empty-action')?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (onManageClick) onManageClick();
        });
        body.appendChild(empty);
    }

    promptsPanel.appendChild(body);
    container.appendChild(promptsPanel);

    if (showCommonSettings) {
        container.appendChild(_promptDropdownCreateCommonSettings({
            onChatWidthClick,
            onSmartInputSettingsClick,
            onMirrorSiteClick
        }));
        _promptDropdownBindTabs(container);
    }

    return container;
}

function _promptDropdownBindTabs(container) {
    const tabs = container.querySelectorAll('.prompt-dropdown-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.getAttribute('data-prompt-tab');
            tabs.forEach(item => item.classList.toggle('active', item === tab));
            container.querySelectorAll('.prompt-dropdown-panel').forEach(panel => {
                panel.classList.toggle('active', panel.dataset.promptPanel === target);
            });
        });
    });
}

function _promptDropdownCreateCommonSettings({
    onChatWidthClick,
    onSmartInputSettingsClick,
    onMirrorSiteClick
}) {
    const panel = document.createElement('div');
    panel.className = 'prompt-dropdown-panel prompt-common-settings-panel';
    panel.dataset.promptPanel = 'common-settings';

    const manager = window.ChatWidthManager?.getInstance?.();
    const supported = !!manager?.isSupported?.();
    const currentScale = manager?.getScale?.() || 100;
    const currentText = currentScale <= 100
        ? (chrome.i18n.getMessage('chatWidthNormal') || '正常')
        : `${currentScale}%`;
    const storeReviewUrl = _promptDropdownGetStoreReviewUrl();
    const geminiWatermarkSetting = _promptDropdownIsGeminiPlatform() ? `
            <div class="prompt-common-setting-item">
                <div class="prompt-common-setting-info">
                    <div class="prompt-common-setting-title-row">
                        <div class="prompt-common-setting-label">${chrome.i18n.getMessage('geminiWatermarkTitle') || 'Nano Banana 去水印'}</div>
                    </div>
                    <div class="prompt-common-setting-hint">${chrome.i18n.getMessage('geminiWatermarkHint') || '在 Gemini 生成的图片上显示去水印下载选项，可下载原图或去除右下角水印后的图片。'}</div>
                </div>
                <label class="ait-toggle-switch">
                    <input type="checkbox" class="prompt-common-gemini-watermark-toggle">
                    <span class="ait-toggle-slider"></span>
                </label>
            </div>
    ` : '';

    panel.innerHTML = `
        <div class="prompt-common-settings">
            <div class="prompt-common-setting-item">
                <div class="prompt-common-setting-info">
                    <div class="prompt-common-setting-title-row">
                        <div class="prompt-common-setting-label">${chrome.i18n.getMessage('promptCommonFeedbackTitle') || '反馈问题、提需求'}</div>
                    </div>
                    <div class="prompt-common-setting-hint">${chrome.i18n.getMessage('promptCommonFeedbackHint') || '遇到 bug 或有功能想法，欢迎到插件商店评价区留言。'}</div>
                </div>
                <button class="prompt-common-setting-btn prompt-common-store-review-btn">
                    ${chrome.i18n.getMessage('promptCommonFeedbackButton') || '去反馈'}
                </button>
            </div>
            <div class="prompt-common-setting-item">
                <div class="prompt-common-setting-info">
                    <div class="prompt-common-setting-title-row">
                        <div class="prompt-common-setting-label">${chrome.i18n.getMessage('promptCommonGithubStarTitle') || '给一颗 🌟 支持'}</div>
                    </div>
                    <div class="prompt-common-setting-hint">${chrome.i18n.getMessage('promptCommonGithubStarHint') || '如果 Timeline 对你有帮助，欢迎在 GitHub 点 Star 支持。'}</div>
                </div>
                <button class="prompt-common-setting-btn prompt-common-github-star-btn">
                    ${chrome.i18n.getMessage('promptCommonGithubStarButton') || '去 GitHub'}
                </button>
            </div>
            <div class="prompt-common-setting-item">
                <div class="prompt-common-setting-info">
                    <div class="prompt-common-setting-title-row">
                        <div class="prompt-common-setting-label">${chrome.i18n.getMessage('mirrorSiteTabName') || '适配新平台'}</div>
                    </div>
                    <div class="prompt-common-setting-hint">${chrome.i18n.getMessage('promptCommonMirrorSiteHint') || '添加新的 AI 对话网站，解锁时间轴、提示词等功能。'}</div>
                </div>
                <button class="prompt-common-setting-btn prompt-common-mirror-site-btn">
                    ${chrome.i18n.getMessage('mirrorSiteAdapterStartButton') || '开始配置'}
                </button>
            </div>
            <div class="prompt-common-setting-item">
                <div class="prompt-common-setting-info">
                    <div class="prompt-common-setting-title-row">
                        <div class="prompt-common-setting-label">${chrome.i18n.getMessage('timelineAICompleteToastTitle') || '回复完成提醒'}</div>
                    </div>
                    <div class="prompt-common-setting-hint">${chrome.i18n.getMessage('timelineAICompleteToastHint') || 'AI 回复完成且当前不在最新位置时显示提醒'}</div>
                </div>
                <label class="ait-toggle-switch">
                    <input type="checkbox" class="prompt-common-ai-complete-toast-toggle">
                    <span class="ait-toggle-slider"></span>
                </label>
            </div>
            <div class="prompt-common-setting-item">
                <div class="prompt-common-setting-info">
                    <div class="prompt-common-setting-title-row">
                        <div class="prompt-common-setting-label">${chrome.i18n.getMessage('preventAutoScrollLabel') || '阻止发送后跳到底部'}</div>
                    </div>
                    <div class="prompt-common-setting-hint">${chrome.i18n.getMessage('preventAutoScrollHint') || '向上查看历史时发送消息，页面保持在当前阅读位置，不跳到底部'}</div>
                </div>
                <label class="ait-toggle-switch">
                    <input type="checkbox" class="prompt-common-prevent-auto-scroll-toggle">
                    <span class="ait-toggle-slider"></span>
                </label>
            </div>
            ${geminiWatermarkSetting}
            <div class="prompt-common-setting-item ${supported ? '' : 'disabled'}">
                <div class="prompt-common-setting-info">
                    <div class="prompt-common-setting-title-row">
                        <div class="prompt-common-setting-label">${chrome.i18n.getMessage('chatWidthTitle') || '对话宽度'}</div>
                        <span class="prompt-common-setting-value">${currentText}</span>
                    </div>
                    <div class="prompt-common-setting-hint">${supported
                        ? (chrome.i18n.getMessage('chatWidthHint') || '调大对话区域宽度，充分利用屏幕空间')
                        : (chrome.i18n.getMessage('chatWidthUnsupported') || '当前平台暂不支持调节对话宽度')
                    }</div>
                </div>
                <button class="prompt-common-setting-btn" ${supported ? '' : 'disabled'}>
                    ${chrome.i18n.getMessage('sidebarStarredManage') || '设置'}
                </button>
            </div>
            <div class="prompt-common-setting-item">
                <div class="prompt-common-setting-info">
                    <div class="prompt-common-setting-title-row">
                        <div class="prompt-common-setting-label">${chrome.i18n.getMessage('kvzmxp') || '换行与发送消息'}</div>
                    </div>
                    <div class="prompt-common-setting-hint">${chrome.i18n.getMessage('promptCommonSmartInputHint') || '对话框，设置 Enter 键控制「换行」和「发送消息」'}</div>
                </div>
                <button class="prompt-common-setting-btn prompt-common-smart-input-btn">
                    ${chrome.i18n.getMessage('sidebarStarredManage') || '设置'}
                </button>
            </div>
        </div>
    `;

    const chatWidthBtn = panel.querySelector('.prompt-common-setting-btn');
    chatWidthBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (chatWidthBtn.disabled) return;
        if (onChatWidthClick) onChatWidthClick();
    });

    const aiCompleteToggle = panel.querySelector('.prompt-common-ai-complete-toast-toggle');
    if (aiCompleteToggle) {
        chrome.storage.local.get('timelineAICompleteToastEnabled').then(result => {
            aiCompleteToggle.checked = result.timelineAICompleteToastEnabled !== false;
        }).catch(() => {
            aiCompleteToggle.checked = true;
        });
        aiCompleteToggle.addEventListener('change', async (e) => {
            try {
                await chrome.storage.local.set({
                    timelineAICompleteToastEnabled: e.target.checked
                });
            } catch (error) {
                console.error('[PromptDropdown] Failed to save AI complete toast setting:', error);
                aiCompleteToggle.checked = !aiCompleteToggle.checked;
            }
        });
    }

    const preventAutoScrollToggle = panel.querySelector('.prompt-common-prevent-auto-scroll-toggle');
    if (preventAutoScrollToggle) {
        chrome.storage.local.get('preventAutoScrollEnabled').then(result => {
            preventAutoScrollToggle.checked = result.preventAutoScrollEnabled !== false;
        }).catch(() => {
            preventAutoScrollToggle.checked = true;
        });
        preventAutoScrollToggle.addEventListener('change', async (e) => {
            try {
                await chrome.storage.local.set({
                    preventAutoScrollEnabled: e.target.checked
                });
            } catch (error) {
                console.error('[PromptDropdown] Failed to save prevent-auto-scroll setting:', error);
                preventAutoScrollToggle.checked = !preventAutoScrollToggle.checked;
            }
        });
    }

    const geminiWatermarkToggle = panel.querySelector('.prompt-common-gemini-watermark-toggle');
    if (geminiWatermarkToggle) {
        chrome.storage.local.get('geminiWatermarkRemoverEnabled').then(result => {
            geminiWatermarkToggle.checked = result.geminiWatermarkRemoverEnabled !== false;
        }).catch(() => {
            geminiWatermarkToggle.checked = true;
        });
        geminiWatermarkToggle.addEventListener('change', async (e) => {
            try {
                await chrome.storage.local.set({
                    geminiWatermarkRemoverEnabled: e.target.checked
                });
            } catch (error) {
                console.error('[PromptDropdown] Failed to save Gemini watermark remover setting:', error);
                geminiWatermarkToggle.checked = !geminiWatermarkToggle.checked;
            }
        });
    }

    const smartInputBtn = panel.querySelector('.prompt-common-smart-input-btn');
    smartInputBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (onSmartInputSettingsClick) onSmartInputSettingsClick();
    });

    const storeReviewBtn = panel.querySelector('.prompt-common-store-review-btn');
    storeReviewBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        _promptDropdownOpenExternalUrl(storeReviewUrl);
    });

    const githubStarBtn = panel.querySelector('.prompt-common-github-star-btn');
    githubStarBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        _promptDropdownOpenExternalUrl('https://github.com/houyanchao/chatgpt-gemini-timeline');
    });

    const mirrorSiteBtn = panel.querySelector('.prompt-common-mirror-site-btn');
    mirrorSiteBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (onMirrorSiteClick) onMirrorSiteClick();
    });

    return panel;
}

function _promptDropdownIsGeminiPlatform() {
    // 优先用含镜像域名的同步判断（依赖 constants.js 的内存缓存），
    // 这样 Gemini 镜像站也能显示「去水印」开关，与 watermark-manager 的判断保持一致。
    if (typeof matchesCurrentPlatformSync === 'function') {
        return matchesCurrentPlatformSync('gemini');
    }

    // 退化：constants.js 未加载时仅按内置域名判断。
    const hostname = location.hostname;
    const geminiPlatform = typeof SITE_INFO !== 'undefined' && Array.isArray(SITE_INFO)
        ? SITE_INFO.find(site => site.id === 'gemini')
        : null;
    const geminiSites = Array.isArray(geminiPlatform?.sites)
        ? geminiPlatform.sites
        : ['gemini.google.com'];

    return geminiSites.some(site => (
        hostname === site ||
        hostname.endsWith(`.${site}`)
    ));
}

function _promptDropdownGetStoreReviewUrl() {
    const isEdge = /Edg/i.test(navigator.userAgent);
    return isEdge
        ? 'https://microsoftedge.microsoft.com/addons/detail/ai-timeline%EF%BC%9Agemini%E3%80%81chatgp/ekednjjojnhlajfobalaaihkibbdcbab'
        : 'https://chromewebstore.google.com/detail/timeline-chatgpt-gemini-c/fgebdnlceacaiaeikopldglhffljjlhh/reviews?utm_source=item-share-cb';
}

function _promptDropdownGetStoreDetailUrl() {
    const ua = navigator.userAgent || '';
    if (/Firefox/i.test(ua)) {
        return 'https://addons.mozilla.org/en-US/firefox/addon/ai-timeline/';
    }
    if (/Edg/i.test(ua)) {
        return 'https://microsoftedge.microsoft.com/addons/detail/ai-timeline%EF%BC%9Agemini%E3%80%81chatgp/ekednjjojnhlajfobalaaihkibbdcbab';
    }
    return 'https://chromewebstore.google.com/detail/timeline-ai-chat/fgebdnlceacaiaeikopldglhffljjlhh?utm_source=item-share-cb';
}

function _promptDropdownBindStoreDetailButton(button) {
    if (!button) return;
    const tooltip = chrome.i18n.getMessage('shareExtension') || '分享插件';
    button.addEventListener('click', (e) => {
        e.stopPropagation();
        _promptDropdownOpenExternalUrl(_promptDropdownGetStoreDetailUrl());
    });
    button.addEventListener('mouseenter', () => {
        window.globalTooltipManager?.show(
            'prompt-dropdown-share-extension',
            'button',
            button,
            tooltip,
            { style: 'mini', placement: 'top' }
        );
    });
    button.addEventListener('mouseleave', () => {
        window.globalTooltipManager?.hide();
    });
}

function _promptDropdownOpenExternalUrl(url) {
    window.open(url, '_blank', 'noopener,noreferrer');
}

function _promptDropdownCreateItem(prompt, onItemClick, tooltipPlacement) {
    const item = document.createElement('div');
    item.className = 'prompt-dropdown-item';

    const name = prompt.name || '';
    const text = prompt.content || '';

    const pinHtml = prompt.pinned ? `
        <span class="prompt-dropdown-item-icon pinned-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="#facc15" stroke-width="2.5">
                <line x1="5" y1="3" x2="19" y2="3"/>
                <line x1="12" y1="7" x2="12" y2="21"/>
                <polyline points="8 11 12 7 16 11"/>
            </svg>
        </span>
    ` : '';

    const escaped = (t) => { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; };

    item.innerHTML = `
        <div class="prompt-dropdown-item-main">
            ${pinHtml}<span class="prompt-dropdown-item-name">${escaped(name)}</span>
        </div>
        <div class="prompt-dropdown-item-content">${escaped(text)}</div>
    `;

    item.addEventListener('click', () => {
        if (onItemClick) onItemClick(prompt, item);
    });

    const tooltipId = `prompt-dd-${prompt.id}`;
    item.addEventListener('mouseenter', () => {
        if (!window.globalTooltipManager || !prompt.content) return;
        const contentEl = item.querySelector('.prompt-dropdown-item-content');
        if (!contentEl || contentEl.scrollWidth <= contentEl.clientWidth) return;
        window.globalTooltipManager.show(tooltipId, 'button', item, prompt.content, {
            placement: tooltipPlacement,
            maxWidth: 300,
            showDelay: 300,
            gap: 14,
            color: {
                light: { backgroundColor: '#f8fafc', textColor: '#334155', borderColor: '#e2e8f0' },
                dark: { backgroundColor: '#27272a', textColor: '#e5e7eb', borderColor: '#3f3f46' }
            }
        });
    });
    item.addEventListener('mouseleave', () => {
        if (window.globalTooltipManager) window.globalTooltipManager.hide();
    });

    return item;
}

function _promptDropdownFilter(container, query) {
    const body = container.querySelector('.prompt-dropdown-body');
    if (!body) return;
    const items = body.querySelectorAll('.prompt-dropdown-item');
    let visible = 0;
    items.forEach(item => {
        const n = item.querySelector('.prompt-dropdown-item-name')?.textContent || '';
        const c = item.querySelector('.prompt-dropdown-item-content')?.textContent || '';
        const ok = !query || n.toLowerCase().includes(query) || c.toLowerCase().includes(query);
        item.style.display = ok ? '' : 'none';
        if (ok) visible++;
    });
    let tip = body.querySelector('.prompt-dropdown-search-empty');
    if (visible === 0 && query) {
        if (!tip) {
            tip = document.createElement('div');
            tip.className = 'prompt-dropdown-search-empty';
            tip.textContent = chrome.i18n.getMessage('jwvnkp') || 'No results';
            body.appendChild(tip);
        }
        tip.style.display = '';
    } else if (tip) {
        tip.style.display = 'none';
    }
}
