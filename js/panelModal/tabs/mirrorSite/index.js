/**
 * Custom Platform Tab - 自定义平台设置
 *
 * 流程：输入URL → 跳转 → 检测"123456" → 提取DOM → 组装反馈信息 → 引导用户提交
 *
 * 文件结构：
 * 1. 常量 & i18n
 * 2. 共享工具函数
 * 3. MirrorSiteTab 类（设置面板 Tab）
 * 4. 页面检测模块（DOM 采集、浮窗倒计时、反馈弹窗、自动检测 IIFE）
 */

// ============================================================
// 1. 常量 & i18n
// ============================================================

const AIT_DETECT_TRIGGER = '123456';
const AIT_DETECT_STORAGE_KEY = 'customTimelineAdapterDetecting';
const AIT_DETECT_TIMEOUT = 30000;

function _mirrorSiteMsg(key, fallbackOrSubstitutions = '', maybeSubstitutions) {
    const fallback = Array.isArray(fallbackOrSubstitutions) ? '' : fallbackOrSubstitutions;
    const substitutions = Array.isArray(fallbackOrSubstitutions) ? fallbackOrSubstitutions : maybeSubstitutions;
    try {
        return TimelineI18n.getMessage(key, substitutions) || fallback;
    } catch {
        return fallback;
    }
}

// ============================================================
// 2. 共享工具函数
// ============================================================

function _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text || '');
    return div.innerHTML;
}

function _isEditableElement(el) {
    if (!el) return false;
    const tag = el.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea') return true;
    if (el.isContentEditable) return true;
    if (el.closest('input, textarea, [contenteditable="true"], [contenteditable=""]')) return true;
    return false;
}
function _normalizeDetectUrl(url) {
    try {
        const parsed = new URL(url);
        parsed.hostname = parsed.hostname.toLowerCase();
        if (parsed.pathname.length > 1) {
            parsed.pathname = parsed.pathname.replace(/\/+$/, '');
        }
        return parsed.href;
    } catch {
        return '';
    }
}

function _makeWizardModalDraggable(shell) {
    const modal = shell?.querySelector('.mirror-site-wizard-modal');
    const header = shell?.querySelector('.mirror-site-wizard-header');
    if (!modal || !header) return;

    header.addEventListener('mousedown', (event) => {
        if (event.button !== 0 || event.target.closest('button, input, textarea, select, a')) return;

        const rect = modal.getBoundingClientRect();
        const offsetX = event.clientX - rect.left;
        const offsetY = event.clientY - rect.top;

        modal.style.left = `${rect.left}px`;
        modal.style.top = `${rect.top}px`;
        modal.style.right = 'auto';
        modal.style.margin = '0';
        modal.style.transform = 'none';
        event.preventDefault();

        const onMouseMove = (moveEvent) => {
            const maxLeft = Math.max(0, window.innerWidth - modal.offsetWidth);
            const maxTop = Math.max(0, window.innerHeight - modal.offsetHeight);
            const left = Math.min(Math.max(0, moveEvent.clientX - offsetX), maxLeft);
            const top = Math.min(Math.max(0, moveEvent.clientY - offsetY), maxTop);

            modal.style.left = `${left}px`;
            modal.style.top = `${top}px`;
        };

        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });
}

// ============================================================
// 3. MirrorSiteTab 类（设置面板 Tab）
// ============================================================

class MirrorSiteTab extends BaseTab {
    constructor() {
        super();
        this.id = 'mirror-site';
        this.name = _mirrorSiteMsg('mirrorSiteTabName');
        this.icon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="2" y1="12" x2="22" y2="12"/>
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
        </svg>`;
    }

    shouldShow() { return true; }

    getInitialState() {
        return { transient: {}, persistent: {} };
    }

    render() {
        const container = document.createElement('div');
        container.className = 'mirror-site-settings';
        const title = _mirrorSiteMsg('mirrorSiteAdapterHeroTitle');
        container.innerHTML = `
            <div id="mirror-site-native-supported-sites"></div>
            <div class="mirror-site-tab-hero">
                <div class="mirror-site-tab-hero-text">
                    <div class="mirror-site-tab-hero-title">${this._esc(title)}</div>
                    <div class="mirror-site-tab-hero-desc">${this._esc(_mirrorSiteMsg('mirrorSiteAdapterHeroDesc'))}</div>
                </div>
                <button class="mirror-site-tab-hero-btn" id="mirror-site-adapter-wizard-btn">${this._esc(_mirrorSiteMsg('mirrorSiteAdapterStartButton'))}</button>
            </div>
        `;
        return container;
    }
    async _getNativeSupportedSites() {
        if (typeof getSiteInfoList !== 'function') {
            return [];
        }

        return (await getSiteInfoList())
            .filter(site => site?.features?.timeline !== false)
            .map(site => ({
                id: site.id,
                name: site.name || site.id,
                logo: chrome.runtime.getURL(site.logoPath || 'images/logo.png')
            }));
    }

    _renderNativeSupportedSites(sites) {
        if (!sites.length) {
            return '';
        }

        const siteItems = sites.map(site => `
            <div class="mirror-site-native-site" title="${this._esc(site.name)}">
                <div class="mirror-site-native-logo-wrap">
                    <img class="mirror-site-native-logo" src="${this._esc(site.logo)}" alt="${this._esc(site.name)}">
                </div>
                <div class="mirror-site-native-name">${this._esc(site.name)}</div>
            </div>
        `).join('');

        return `
            <div class="mirror-site-native-sites">
                <div class="mirror-site-native-sites-title">${this._esc(_mirrorSiteMsg('mirrorSiteNativeSupportedTitle'))}</div>
                <div class="mirror-site-native-sites-grid">
                    ${siteItems}
                </div>
            </div>
        `;
    }

    async mounted() {
        super.mounted();
        await this._renderNativeSupportedSitesIntoContainer();
        this._bindEvents();
    }

    async _renderNativeSupportedSitesIntoContainer() {
        const container = document.getElementById('mirror-site-native-supported-sites');
        if (!container) return;

        try {
            const nativeSites = await this._getNativeSupportedSites();
            container.innerHTML = this._renderNativeSupportedSites(nativeSites);
        } catch (e) {
            console.error('[MirrorSiteTab] Failed to render native supported sites:', e);
            container.innerHTML = '';
        }
    }

    _bindEvents() {
        const btn = document.getElementById('mirror-site-adapter-wizard-btn');
        if (btn) this.addEventListener(btn, 'click', () => this._showUrlInput());
    }

    _showUrlInput() {
        this._closeWizard();
        const shell = document.createElement('div');
        shell.className = 'mirror-site-wizard-shell';
        const title = _mirrorSiteMsg('mirrorSiteAdapterHeroTitle');
        shell.innerHTML = `
            <div class="mirror-site-wizard-modal mirror-site-wizard-modal-centered">
                <div class="mirror-site-wizard-header">
                    <div class="mirror-site-wizard-title">${this._esc(title)}</div>
                    <button class="mirror-site-wizard-close" type="button">✕</button>
                </div>
                <div class="mirror-site-wizard-body">
                    <div class="mirror-site-wizard-section">
                        <div class="mirror-site-wizard-ol">
                            <div class="mirror-site-wizard-ol-item"><span class="mirror-site-wizard-ol-num">1</span>${this._esc(_mirrorSiteMsg('mirrorSiteWizardStep1'))}</div>
                            <div class="mirror-site-wizard-ol-item mirror-site-wizard-ol-item-centered"><span class="mirror-site-wizard-ol-num">2</span><span class="mirror-site-wizard-inline-instruction">${this._esc(_mirrorSiteMsg('mirrorSiteWizardStep2'))}<span class="mirror-site-wizard-code">${this._esc(AIT_DETECT_TRIGGER)}</span></span></div>
                        </div>
                        <div class="mirror-site-wizard-ol">
                            <div class="mirror-site-wizard-ol-item"><span class="mirror-site-wizard-ol-num">3</span>${this._esc(_mirrorSiteMsg('mirrorSiteWizardStep3'))}</div>
                        </div>
                    </div>
                    <input class="mirror-site-wizard-url-input" id="ait-url-input" placeholder="${this._esc(_mirrorSiteMsg('mirrorSiteUrlInputPlaceholder'))}" autocomplete="off">
                    <div class="mirror-site-wizard-footer">
                        <button class="mirror-site-wizard-secondary" data-action="close">${this._esc(_mirrorSiteMsg('commonCancel'))}</button>
                        <button class="mirror-site-wizard-primary" data-action="go">${this._esc(_mirrorSiteMsg('mirrorSiteNextButton'))}</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(shell);
        this._wizard = { shell };
        _makeWizardModalDraggable(shell);
        shell.querySelector('.mirror-site-wizard-close')?.addEventListener('click', () => this._closeWizard());
        shell.querySelector('[data-action="close"]')?.addEventListener('click', () => this._closeWizard());
        shell.querySelector('[data-action="go"]')?.addEventListener('click', () => {
            void this._handleUrlGo()
                .catch(e => console.error('[MirrorSiteTab] Failed to handle URL:', e));
        });
        if (window.panelModal?.isVisible) {
            this._keepWizardOnUnmount = true;
            window.panelModal.hide();
            this._keepWizardOnUnmount = false;
        }
    }

    async _handleUrlGo() {
        const input = document.getElementById('ait-url-input');
        const raw = (input?.value || '').trim();
        if (!raw) { window.globalToastManager?.show('error', _mirrorSiteMsg('mirrorSiteUrlRequired')); return; }
        const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
        let targetUrl, domain;
        try {
            targetUrl = new URL(withProto);
            domain = targetUrl.hostname.toLowerCase();
        } catch {
            window.globalToastManager?.show('error', _mirrorSiteMsg('mirrorSiteUrlInvalid'));
            return;
        }

        const existingSupport = await this._getExistingSupportForDomain(domain);
        if (existingSupport) {
            await window.globalPopconfirmManager?.show({
                title: _mirrorSiteMsg('mirrorSiteAlreadySupported'),
                showCancel: false,
                confirmText: _mirrorSiteMsg('vkmzpx', '确定'),
                confirmTextType: 'primary'
            });
            input?.focus();
            return;
        }

        await chrome.storage.local.set({
            [AIT_DETECT_STORAGE_KEY]: {
                domain,
                url: _normalizeDetectUrl(targetUrl.href),
                startedAt: Date.now()
            }
        });
        this._closeWizard();
        location.href = targetUrl.href;
    }

    async _getExistingSupportForDomain(domain) {
        const nativeSupport = await this._findNativeSupportForDomain(domain);
        if (nativeSupport) {
            return { type: 'native', name: nativeSupport.name, domain };
        }

        const customSupport = this._findCustomSupportForDomain(domain);
        if (customSupport) {
            return { type: 'custom', domain: customSupport.domain };
        }

        return null;
    }

    async _findNativeSupportForDomain(domain) {
        if (typeof getSiteInfoList !== 'function') {
            return null;
        }

        return (await getSiteInfoList()).find(platform =>
            Array.isArray(platform.sites) &&
            platform.sites.some(site => this._domainMatches(domain, site))
        ) || null;
    }

    _findCustomSupportForDomain(domain) {
        try {
            const staticConfigs = Array.isArray(window.CUSTOM_SITE_INFO)
                ? window.CUSTOM_SITE_INFO
                : [];
            const configs = staticConfigs.filter(config => config?.enabled !== false && Array.isArray(config.sites));

            for (const config of configs) {
                const matchedDomain = config.sites.find(site => this._domainMatches(domain, site));
                if (matchedDomain) {
                    return { domain: this._normalizeDomain(matchedDomain) || String(matchedDomain) };
                }
            }
        } catch {
            return null;
        }

        return null;
    }

    _domainMatches(hostname, site) {
        const normalizedHostname = this._normalizeDomain(hostname);
        const normalizedSite = this._normalizeDomain(site);
        if (!normalizedHostname || !normalizedSite) return false;
        return normalizedHostname === normalizedSite || normalizedHostname.endsWith(`.${normalizedSite}`);
    }

    _normalizeDomain(value) {
        const raw = String(value || '').trim().toLowerCase();
        if (!raw) return '';

        try {
            const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
            return new URL(withProto).hostname.toLowerCase();
        } catch {
            return raw
                .replace(/^https?:\/\//i, '')
                .split('/')[0]
                .split(':')[0]
                .toLowerCase();
        }
    }

    _closeWizard() {
        if (this._wizard?.shell) this._wizard.shell.remove();
        this._wizard = null;
    }

    _esc(t) { return _escapeHtml(t); }

    unmounted() {
        if (!this._keepWizardOnUnmount) this._closeWizard();
        super.unmounted();
    }
}

// ============================================================
// 4. 页面检测模块
// ============================================================
//
// 在内容脚本环境中自动运行：监听 chrome.storage 中的检测状态，
// 在目标页面中查找触发词、采集 DOM 结构、组装反馈信息并展示弹窗。

const PageDetector = (() => {
    // ---------- DOM 采集 ----------

    function findTriggerElement() {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
            acceptNode: (node) => {
                if (!node.nodeValue?.includes(AIT_DETECT_TRIGGER)) return NodeFilter.FILTER_REJECT;
                const p = node.parentElement;
                if (!p || p.closest('.ait-panel-modal, .mirror-site-wizard-shell, .ait-detect-floater')) return NodeFilter.FILTER_REJECT;
                if (_isEditableElement(p)) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            }
        });
        const textNode = walker.nextNode();
        if (!textNode) return null;
        return textNode.parentElement;
    }

    function buildDemoInfo(messageElement) {
        const ancestors = [];
        let current = messageElement;

        for (let level = 0; level < 10 && current && current.nodeType === Node.ELEMENT_NODE && !current.matches('html'); level++) {
            ancestors.push({ level, element: current });
            current = current.parentElement;
        }

        const lines = [
            `URL: ${location.href}`
        ];

        ancestors.forEach(({ element }) => {
            lines.push(getDemoOpenTag(element));
        });

        return lines.join('\n');
    }

    function getDemoOpenTag(element) {
        const attrs = [];
        for (let i = 0; i < (element.attributes?.length || 0); i++) {
            const attr = element.attributes[i];
            attrs.push(`${attr.name}="${String(attr.value).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`);
        }
        return `<${element.tagName.toLowerCase()}${attrs.length ? ' ' + attrs.join(' ') : ''}>`;
    }

    function buildErrorDemoInfo(error) {
        return [
            `URL: ${location.href}`,
            `${_mirrorSiteMsg('mirrorSiteDemoErrorDomain')}: ${location.hostname}`,
            '',
            `--- ${_mirrorSiteMsg('mirrorSiteDemoErrorStatusTitle')} ---`,
            _mirrorSiteMsg('mirrorSiteDemoErrorDetectedButFailed'),
            `${_mirrorSiteMsg('mirrorSiteDemoErrorMessage')}: ${error?.message || String(error)}`
        ].join('\n');
    }

    // ---------- 浮窗倒计时 ----------

    const Floater = {
        _el: null,
        _timer: null,

        show(startedAt) {
            this.hide();
            const el = document.createElement('div');
            el.className = 'ait-detect-floater';
            el.innerHTML = `<div class="ait-detect-floater-inner"><div class="ait-detect-floater-spinner"></div><div class="ait-detect-floater-text"><div class="ait-detect-floater-title">${_escapeHtml(_mirrorSiteMsg('mirrorSiteDetectWaitingTitle', [AIT_DETECT_TRIGGER]))}</div><div class="ait-detect-floater-desc">${_escapeHtml(_mirrorSiteMsg('mirrorSiteDetectWaitingDesc'))}</div></div><div class="ait-detect-floater-countdown" id="ait-detect-countdown">0:30</div><button class="ait-detect-floater-cancel" id="ait-detect-cancel">${_escapeHtml(_mirrorSiteMsg('commonCancel'))}</button></div>`;
            document.body.appendChild(el);
            this._el = el;
            el.querySelector('#ait-detect-cancel')?.addEventListener('click', () => this.cancel());
            this._timer = setInterval(() => {
                const remaining = Math.max(0, AIT_DETECT_TIMEOUT - (Date.now() - startedAt));
                if (remaining <= 0) { this.cancel(); return; }
                const m = Math.floor(remaining / 60000), s = Math.floor((remaining % 60000) / 1000);
                const cd = el.querySelector('#ait-detect-countdown');
                if (cd) cd.textContent = `${m}:${String(s).padStart(2, '0')}`;
            }, 1000);
        },

        hide() {
            if (this._timer) { clearInterval(this._timer); this._timer = null; }
            if (this._el) { this._el.remove(); this._el = null; }
        },

        async cancel() {
            this.hide();
            await chrome.storage.local.remove(AIT_DETECT_STORAGE_KEY);
        }
    };

    // ---------- 反馈弹窗 ----------

    function showFeedbackModal(demoInfo) {
        const safeDemoInfo = String(demoInfo || '');
        const shell = document.createElement('div');
        shell.className = 'mirror-site-wizard-shell';
        shell.innerHTML = `
            <div class="mirror-site-wizard-modal">
                <div class="mirror-site-wizard-header">
                    <div class="mirror-site-wizard-title">${_escapeHtml(_mirrorSiteMsg('mirrorSiteAdapterHeroTitle'))}</div>
                    <button class="mirror-site-wizard-close" type="button">✕</button>
                </div>
                <div class="mirror-site-wizard-body">
                    <div class="mirror-site-wizard-section">
                        <div class="mirror-site-wizard-hint">
                            <div>${_escapeHtml(_mirrorSiteMsg('mirrorSiteFeedbackSuccessLine1'))}</div>
                        </div>
                    </div>
                    <textarea class="mirror-site-wizard-prompt" readonly></textarea>
                    <div class="mirror-site-wizard-footer">
                        <button class="mirror-site-wizard-secondary" data-action="close">${_escapeHtml(_mirrorSiteMsg('notepadClose'))}</button>
                        <button class="mirror-site-wizard-secondary mirror-site-wizard-icon-btn" data-action="copy">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                            <span>${_escapeHtml(_mirrorSiteMsg('mirrorSiteCopyInfo'))}</span>
                        </button>
                        <button class="mirror-site-wizard-primary mirror-site-wizard-icon-btn" data-action="issue">
                            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 .5a12 12 0 0 0-3.79 23.39c.6.11.82-.26.82-.58v-2.03c-3.34.73-4.04-1.42-4.04-1.42-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.07 1.83 2.8 1.3 3.49.99.11-.78.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23A11.5 11.5 0 0 1 12 6c1.02 0 2.05.14 3.01.4 2.29-1.55 3.3-1.23 3.3-1.23.66 1.66.24 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.63-5.49 5.93.43.37.82 1.1.82 2.22v3.29c0 .32.22.69.83.57A12 12 0 0 0 12 .5Z"/></svg>
                            <span>${_escapeHtml(_mirrorSiteMsg('mirrorSiteGoGithub'))}</span>
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(shell);
        const promptEl = shell.querySelector('.mirror-site-wizard-prompt');
        if (promptEl) promptEl.value = safeDemoInfo;
        _makeWizardModalDraggable(shell);

        shell.querySelector('.mirror-site-wizard-close')?.addEventListener('click', () => shell.remove());
        shell.querySelector('[data-action="close"]')?.addEventListener('click', () => shell.remove());
        shell.querySelector('[data-action="copy"]')?.addEventListener('click', async (e) => {
            await navigator.clipboard?.writeText(safeDemoInfo);
            window.globalToastManager?.success(_mirrorSiteMsg('mirrorSiteCopied'), e.currentTarget, { position: 'top', gap: 8 });
        });
        shell.querySelector('[data-action="issue"]')?.addEventListener('click', () => {
            const title = encodeURIComponent(_mirrorSiteMsg('mirrorSiteIssueTitle', [location.hostname]));
            const body = encodeURIComponent(safeDemoInfo);
            window.open(`https://github.com/houyanchao/chatgpt-gemini-timeline/issues/new?title=${title}&body=${body}`, '_blank');
        });
    }

    // ---------- 检测循环 ----------

    let detectTimer = null;

    async function isActiveFocusedTab() {
        if (document.visibilityState !== 'visible') return false;

        try {
            const response = await chrome.runtime.sendMessage({ type: 'AIT_IS_ACTIVE_FOCUSED_TAB' });
            if (response?.success) return !!response.active;
        } catch (error) {
            console.warn('[MirrorSite] Failed to check active tab:', error);
        }

        return document.hasFocus();
    }

    function stopDetection() {
        if (detectTimer) { clearInterval(detectTimer); detectTimer = null; }
    }

    async function startDetection(state) {
        stopDetection();
        const { url, startedAt } = state;
        if (!url || _normalizeDetectUrl(location.href) !== _normalizeDetectUrl(url)) return;
        if (!await isActiveFocusedTab()) {
            Floater.hide();
            return;
        }

        Floater.show(startedAt);

        detectTimer = setInterval(async () => {
            if (!await isActiveFocusedTab()) {
                stopDetection();
                Floater.hide();
                return;
            }

            if (Date.now() - startedAt > AIT_DETECT_TIMEOUT) {
                stopDetection();
                Floater.hide();
                await chrome.storage.local.remove(AIT_DETECT_STORAGE_KEY);
                return;
            }

            const el = findTriggerElement();
            if (el) {
                stopDetection();
                Floater.hide();
                await chrome.storage.local.remove(AIT_DETECT_STORAGE_KEY);
                let demoInfo;
                try {
                    demoInfo = buildDemoInfo(el);
                } catch (error) {
                    console.error('[MirrorSite] Failed to build demo info:', error);
                    demoInfo = buildErrorDemoInfo(error);
                }
                showFeedbackModal(demoInfo);
            }
        }, 2000);
    }

    async function startDetectionFromStorage() {
        const result = await chrome.storage.local.get(AIT_DETECT_STORAGE_KEY);
        const state = result[AIT_DETECT_STORAGE_KEY];
        if (state?.domain) startDetection(state);
    }

    // ---------- 启动 ----------

    function init() {
        startDetectionFromStorage().catch(() => {});

        window.addEventListener('focus', () => startDetectionFromStorage().catch(() => {}));
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                startDetectionFromStorage().catch(() => {});
            } else {
                stopDetection();
                Floater.hide();
            }
        });

        chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== 'local' || !changes[AIT_DETECT_STORAGE_KEY]) return;
            const nv = changes[AIT_DETECT_STORAGE_KEY].newValue;
            if (nv?.domain) startDetection(nv);
            else { stopDetection(); Floater.hide(); }
        });
    }

    return { init };
})();

TimelineI18n.ready()
    .then(() => PageDetector.init())
    .catch(error => console.error('[MirrorSite] Failed to initialize page detector:', error));
