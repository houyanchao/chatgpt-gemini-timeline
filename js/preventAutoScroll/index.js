/**
 * Prevent Auto Scroll On Send (多平台)
 *
 * 解决的问题：
 *   向上滚动浏览历史时，发送一条新消息后，平台会强制把页面滚动到底部，
 *   并在 AI 生成过程中多次自动滚动到底部，打断当前阅读。
 *
 * 方案：「发送 + 生成期间持续锚定阅读位置」
 *   1. 在 capture 阶段捕获发送动作（回车 / 点击发送按钮），早于平台自身处理。
 *   2. 仅当发送前用户已向上滚动、不在底部时才介入；已在底部则不干预。
 *   3. 用 rAF 循环把 scrollTop 钉回 savedTop，抵消平台的自动滚动；
 *      锚定持续到 AI 生成结束（依据各平台的"停止"按钮状态）。
 *   4. 生成期间用户主动滚动时不放弃保护，而是「跟随」用户更新 savedTop，
 *      并继续拦截平台的自动跳动（用每帧位移幅度区分用户滚动与程序化大跳）。
 *
 * 平台改变容器 scrollTop 通常绕过 scrollTop/scrollTo/scrollIntoView 等 JS API
 * （疑似缓存了原始引用），因此采用与机制无关的 rAF 拽回方案。
 *
 * 时间轴等扩展内导航可通过 window.__aitPreventAutoScroll 声明可信滚动，
 * 避免锚定逻辑把扩展主动跳转误判为平台自动滚动。
 */

(function () {
    'use strict';

    const START_GRACE = 2000;       // 发送后等待生成开始的宽限期（ms）
    const TAIL_AFTER = 600;         // 生成结束后继续锚定一小段，拦截收尾时的自动滚动（ms）
    const MAX_DURATION = 120000;    // 安全上限，防止生成态检测异常导致无限锚定（ms）
    const BOTTOM_THRESHOLD = 150;   // 距底部多少 px 内视为"已在底部"
    const USER_WINDOW = 250;        // 用户主动滚动后的「跟随」窗口（ms）
    const USER_STEP_MAX = 400;      // 跟随窗口内，单帧位移 <= 此值视为用户滚动，否则视为程序化大跳
    const NAV_KEYS = new Set([
        'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'
    ]);

    // 已适配的平台（选择器/状态判断全部复用现有 adapter）
    // 纳入条件：① 存在 smartEnter adapter（提供 getInputSelector/canSend）；
    //          ② timeline adapter 实现了 isAIGenerating（用于判断锚定时长）。
    // 未纳入：yiyan（无 smartEnter adapter）、notebooklm（无 isAIGenerating 且 timeline 关闭）。
    const SUPPORTED_PLATFORMS = new Set([
        'gemini', 'chatgpt',
        'claude', 'grok', 'deepseek', 'kimi',
        'doubao', 'tongyi', 'qwen', 'yuanbao', 'perplexity'
    ]);

    // 用户开关（设置面板：时间轴设置 > 阻止发送后跳到底部），默认开启。
    // 仅控制是否「启动锚定」，监听器始终就绪，因此开关改动可即时生效、无需刷新。
    let settingEnabled = true;

    class ScrollAnchor {
        constructor(platformId, inputAdapter = null) {
            this.platformId = platformId;
            this.inputAdapter = inputAdapter;
            this.enabled = false;
            this.pinning = false;
            this.scrollContainer = null;
            this.savedTop = 0;
            this.rafId = null;
            this._startTs = 0;
            this._sawGenerating = false;
            this._lastGeneratingTs = 0;
            this._userScrollUntil = 0;
            this._trustedNavigationUntil = 0;
            this._trustedNavigationId = 0;

            this._onKeydown = this._onKeydown.bind(this);
            this._onClick = this._onClick.bind(this);
            this._onUserScrollIntent = this._onUserScrollIntent.bind(this);
            this._loop = this._loop.bind(this);
        }

        init() {
            if (this.enabled) return;
            this.enabled = true;

            // 发送动作捕获（capture 阶段，先于平台处理）
            document.addEventListener('keydown', this._onKeydown, true);
            document.addEventListener('click', this._onClick, true);

            // 用户主动滚动 -> 开启「跟随」窗口（程序化 scrollTop 不会触发 wheel/touch）
            window.addEventListener('wheel', this._onUserScrollIntent, { passive: true, capture: true });
            window.addEventListener('touchmove', this._onUserScrollIntent, { passive: true, capture: true });
        }

        destroy() {
            this._stopPin();
            document.removeEventListener('keydown', this._onKeydown, true);
            document.removeEventListener('click', this._onClick, true);
            window.removeEventListener('wheel', this._onUserScrollIntent, { capture: true });
            window.removeEventListener('touchmove', this._onUserScrollIntent, { capture: true });
            this.enabled = false;
        }

        // ==================== 发送动作捕获 ====================

        _onKeydown(e) {
            // 锚定期间按下导航键 => 用户想自己滚动，开启跟随窗口
            if (this.pinning && NAV_KEYS.has(e.key)) {
                this._userScrollUntil = performance.now() + USER_WINDOW;
                return;
            }

            if (e.key !== 'Enter' || e.shiftKey || e.isComposing || e.keyCode === 229) {
                return;
            }

            const inputSelector = this._inputSelector();
            if (!inputSelector) return;
            const target = e.target;
            const editor = target && target.closest ? target.closest(inputSelector) : null;
            if (!editor) return;

            // 输入框为空（占位态）不会发送，跳过
            if (this._isInputEmpty(editor)) return;

            this._maybeStartPin();
        }

        _onClick(e) {
            const sendButtonSelector = this._sendButtonSelector();
            if (!sendButtonSelector) return;
            const target = e.target;
            const btn = target && target.closest ? target.closest(sendButtonSelector) : null;
            if (!btn) return;
            // 生成中点击的是"停止"按钮，不处理
            if (this._isGenerating()) return;

            this._maybeStartPin();
        }

        _onUserScrollIntent() {
            if (this.pinning) {
                this._userScrollUntil = performance.now() + USER_WINDOW;
            }
        }

        /**
         * 扩展内主动导航（时间轴节点、问题列表等）可大幅改变 scrollTop，
         * 不适用 USER_STEP_MAX 的用户手势阈值。
         * @param {{ durationMs?: number }} [options]
         * @returns {number|undefined} navigation id for settleUserNavigation()
         */
        notifyUserNavigation(options = {}) {
            if (!this.pinning || !this.scrollContainer) return undefined;

            const durationMs = Number(options.durationMs);
            const followMs = Number.isFinite(durationMs) && durationMs > 0
                ? durationMs
                : USER_WINDOW;

            this._trustedNavigationId += 1;
            this._trustedNavigationUntil = performance.now() + followMs;
            this.savedTop = this._readTop(this.scrollContainer);
            return this._trustedNavigationId;
        }

        /**
         * 扩展内导航落点后，将当前位置固化为新的阅读锚点。
         * @param {{ id?: number }} [options]
         */
        settleUserNavigation(options = {}) {
            if (!this.pinning || !this.scrollContainer) return;
            if (options.id !== undefined && options.id !== this._trustedNavigationId) return;

            this.savedTop = this._readTop(this.scrollContainer);
            this._trustedNavigationUntil = 0;
        }

        // ==================== 选择器/状态：全部复用现有 adapter ====================

        /** smartInputBox 的输入框 adapter（提供 getInputSelector / canSend / getSendButtonSelector） */
        _inputAdapter() {
            return this.inputAdapter || null;
        }

        _inputSelector() {
            return this._inputAdapter()?.getInputSelector?.() || null;
        }

        _sendButtonSelector() {
            return this._inputAdapter()?.getSendButtonSelector?.() || null;
        }

        /** 输入框是否为空（复用 adapter.canSend，避免重复判断 ql-blank / textContent） */
        _isInputEmpty(editor) {
            const adapter = this._inputAdapter();
            if (adapter && typeof adapter.canSend === 'function') {
                return !adapter.canSend(editor);
            }
            return !editor || !(editor.textContent || '').trim();
        }

        /** 用户消息选择器（定位滚动容器用），复用 timeline adapter */
        _userMessageSelector() {
            return window.timelineManager?.adapter?.getUserMessageSelector?.() || null;
        }

        /**
         * AI 是否正在生成回答
         * 复用平台 adapter 的 isAIGenerating()（与代码库统一），回退到 AIStateMonitor
         */
        _isGenerating() {
            const adapter = window.timelineManager?.adapter;
            if (adapter && typeof adapter.isAIGenerating === 'function') {
                return !!adapter.isAIGenerating();
            }
            const mon = window.AIStateMonitor?.getInstance?.();
            return !!(mon && mon.isGenerating);
        }

        // ==================== 锚定逻辑 ====================

        _maybeStartPin() {
            if (!settingEnabled) return;

            const container = this._findScrollContainer();
            if (!container) return;

            const { top, atBottom } = this._measure(container);

            // 已在底部 => 让平台正常滚动，不干预
            if (atBottom) return;

            this.scrollContainer = container;
            this.savedTop = top;
            this._startTs = performance.now();
            this._sawGenerating = false;
            this._lastGeneratingTs = 0;
            this._userScrollUntil = 0;
            this._trustedNavigationUntil = 0;
            this._trustedNavigationId = 0;

            if (!this.pinning) {
                this.pinning = true;
                this.rafId = requestAnimationFrame(this._loop);
            }
        }

        _loop() {
            if (!this.pinning) return;

            const now = performance.now();
            const cur = this._readTop(this.scrollContainer);

            if (now < this._trustedNavigationUntil) {
                // 扩展主动导航：可信任大位移，持续跟随并更新锚点
                this.savedTop = cur;
            } else if (now < this._userScrollUntil) {
                // 用户主动滚动窗口内：跟随用户更新 savedTop，但拒绝程序化大跳
                if (Math.abs(cur - this.savedTop) <= USER_STEP_MAX) {
                    this.savedTop = cur; // 跟随
                } else {
                    this._setTop(this.scrollContainer, this.savedTop); // 拒绝平台的大跳
                }
            } else {
                // 非用户滚动：把位置钉回 savedTop，抵消平台的自动滚动
                this._setTop(this.scrollContainer, this.savedTop);
            }

            const elapsed = now - this._startTs;
            const generating = this._isGenerating();
            if (generating) {
                this._sawGenerating = true;
                this._lastGeneratingTs = now;
            }

            let cont;
            if (elapsed >= MAX_DURATION) {
                cont = false;
            } else if (this._sawGenerating) {
                // 生成中持续锚定；生成结束后再多守 TAIL_AFTER 拦截收尾滚动
                cont = generating || (now - this._lastGeneratingTs) < TAIL_AFTER;
            } else {
                // 生成尚未开始，在宽限期内等待
                cont = elapsed < START_GRACE;
            }

            if (cont) {
                this.rafId = requestAnimationFrame(this._loop);
            } else {
                this._stopPin();
            }
        }

        _stopPin() {
            this.pinning = false;
            if (this.rafId) {
                cancelAnimationFrame(this.rafId);
                this.rafId = null;
            }
            this.scrollContainer = null;
            this._trustedNavigationUntil = 0;
            this._trustedNavigationId = 0;
        }

        // ==================== 滚动容器工具 ====================

        /**
         * 查找会话滚动容器：从用户消息元素向上找可滚动祖先，回退到 window
         */
        _findScrollContainer() {
            const sel = this._userMessageSelector();
            if (!sel) return window;
            const list = document.querySelectorAll(sel);
            const anchor = list.length ? list[list.length - 1] : null;
            let el = anchor ? anchor.parentElement : null;
            while (el && el !== document.body) {
                const style = window.getComputedStyle(el);
                if ((style.overflowY === 'auto' || style.overflowY === 'scroll') &&
                    el.scrollHeight > el.clientHeight + 1) {
                    return el;
                }
                el = el.parentElement;
            }
            return window;
        }

        _readTop(container) {
            if (container === window) return window.scrollY;
            return container.scrollTop;
        }

        _measure(container) {
            if (container === window) {
                const top = window.scrollY;
                const clientHeight = window.innerHeight;
                const scrollHeight = document.documentElement.scrollHeight;
                return { top, atBottom: scrollHeight - clientHeight - top < BOTTOM_THRESHOLD };
            }
            const top = container.scrollTop;
            return {
                top,
                atBottom: container.scrollHeight - container.clientHeight - top < BOTTOM_THRESHOLD
            };
        }

        _setTop(container, top) {
            try {
                if (container === window) {
                    window.scrollTo(0, top);
                } else {
                    container.scrollTop = top;
                }
            } catch (e) {
                // 静默处理
            }
        }
    }

    // ==================== 初始化入口 ====================

    let instance = null;
    let initInFlight = false;

    async function getSupportedPlatformId() {
        try {
            const platform = typeof getCurrentPlatform === 'function' ? await getCurrentPlatform() : null;
            if (!platform || !SUPPORTED_PLATFORMS.has(platform.id)) return null;
            return platform.id;
        } catch (e) {
            return null;
        }
    }

    function loadSetting() {
        try {
            chrome.storage?.local?.get?.('preventAutoScrollEnabled', (res) => {
                settingEnabled = res?.preventAutoScrollEnabled !== false;
            });
            chrome.storage?.onChanged?.addListener?.((changes, area) => {
                if (area === 'local' && changes.preventAutoScrollEnabled) {
                    settingEnabled = changes.preventAutoScrollEnabled.newValue !== false;
                    // 关闭时立即解除当前锚定
                    if (!settingEnabled && instance) instance._stopPin();
                }
            });
        } catch (e) {
            // chrome.storage 不可用时保持默认开启
        }
    }

    async function init() {
        if (instance || initInFlight) return;
        initInFlight = true;
        try {
            const platformId = await getSupportedPlatformId();
            if (!platformId) return;

            const inputAdapter = (await window.smartEnterAdapterRegistry?.getAdapter?.()) || null;
            if (!inputAdapter) return;

            instance = new ScrollAnchor(platformId, inputAdapter);
            instance.init();
            loadSetting();

            window.__aitPreventAutoScroll = {
                notifyUserNavigation: (options) => instance.notifyUserNavigation(options),
                settleUserNavigation: (options) => instance.settleUserNavigation(options)
            };
        } catch (error) {
            console.error('[PreventAutoScroll] init failed:', error);
            cleanup();
        } finally {
            initInFlight = false;
        }
    }

    function cleanup() {
        if (instance) {
            instance.destroy();
            instance = null;
        }
        try {
            delete window.__aitPreventAutoScroll;
        } catch (e) {
            window.__aitPreventAutoScroll = undefined;
        }
    }

    window.addEventListener('beforeunload', cleanup);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(init, 500));
    } else {
        setTimeout(init, 500);
    }
})();
