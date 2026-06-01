/**
 * ChatGPT Bridge
 *
 * 单个 AI 平台（ChatGPT）基础能力的统一抽象层，运行在内容脚本（隔离世界）。
 *
 * 设计模型（详见同目录 BRIDGE_SPEC.md）：
 *   - 生命周期 / 能力探测：借鉴微信 H5 JS-SDK —— ready() / error() / checkApi()
 *   - 调用风格：借鉴微信小程序 —— 同步读 getXxxSync()、事件 onXxx()/offXxx()
 *
 * 自包含：不依赖 timeline/smartInputBox/sidebarStarred 三套旧 adapter。
 * 若全局存在 DOMObserverManager 则复用其 body 监听，否则降级到原生 MutationObserver。
 *
 * 当前已实现 API：
 *   - getAIGeneratingSync()                AI 当前是否正在生成回复
 *   - onAIGenerateStart() / offAIGenerateStart()   AI 开始生成事件
 *   - onAIGenerateEnd()   / offAIGenerateEnd()     AI 结束生成事件
 *   - getInputElementSync()                获取对话输入框元素
 */

class ChatGPTBridge {
    // ==================== 平台 DOM 常量 ====================

    /** 发送/停止按钮（生成中时 data-testid 切换为 stop-button） */
    static SUBMIT_BUTTON_ID = 'composer-submit-button';

    /** 输入框（contenteditable div） */
    static INPUT_SELECTOR = '#prompt-textarea';

    /** 侧边栏历史容器（用于就绪判定兜底） */
    static HISTORY_ID = 'history';

    /** 已对外提供的 API 列表（checkApi 探测用） */
    static SUPPORTED_APIS = [
        'getAIGeneratingSync',
        'onAIGenerateStart',
        'offAIGenerateStart',
        'onAIGenerateEnd',
        'offAIGenerateEnd',
        'getInputElementSync',
    ];

    // ==================== 单例 ====================

    static _instance = null;

    static getInstance() {
        if (!ChatGPTBridge._instance) {
            ChatGPTBridge._instance = new ChatGPTBridge();
        }
        return ChatGPTBridge._instance;
    }

    constructor() {
        // 生命周期状态
        this._initStarted = false;
        this._ready = false;
        this._errored = false;
        this._error = null;
        this._readyCbs = [];
        this._errorCbs = [];
        this._readyTimer = null;

        // 事件：type -> Set<callback>
        this._events = new Map();

        // AI 状态监控（懒加载）
        this._aiMonitorTeardown = null;
        this._aiLastState = false;
    }

    // ==================== 生命周期（H5 JS-SDK 风格）====================

    /**
     * 平台匹配且关键 DOM 就绪后回调。已就绪时异步立即回调。
     * @param {(bridge: ChatGPTBridge) => void} callback
     * @returns {ChatGPTBridge}
     */
    ready(callback) {
        if (typeof callback !== 'function') return this;
        if (this._ready) {
            Promise.resolve().then(() => this._safe(callback, this));
            return this;
        }
        this._readyCbs.push(callback);
        this._ensureInit();
        return this;
    }

    /**
     * 平台不匹配 / 初始化失败时回调。已失败时异步立即回调。
     * @param {(error: Error) => void} callback
     * @returns {ChatGPTBridge}
     */
    error(callback) {
        if (typeof callback !== 'function') return this;
        if (this._errored) {
            Promise.resolve().then(() => this._safe(callback, this._error));
            return this;
        }
        this._errorCbs.push(callback);
        this._ensureInit();
        return this;
    }

    /** 是否已就绪 */
    get isReady() {
        return this._ready;
    }

    /**
     * 平台描述信息（优先取全局 SITE_INFO，缺失时降级到内置兜底）
     * @returns {{ id: string, name: string, sites: string[], features: Object }}
     */
    get platform() {
        const fallback = {
            id: 'chatgpt',
            name: 'ChatGPT',
            sites: ['chatgpt.com', 'chat.openai.com'],
            features: {},
        };
        try {
            if (typeof SITE_INFO !== 'undefined' && Array.isArray(SITE_INFO)) {
                const p = SITE_INFO.find(s => s.id === 'chatgpt');
                if (p) return { id: p.id, name: p.name, sites: p.sites, features: p.features || {} };
            }
        } catch { /* ignore */ }
        return fallback;
    }

    /**
     * 能力探测：当前 bridge 是否提供某个 API
     * @param {string} apiName
     * @returns {boolean}
     */
    checkApi(apiName) {
        return ChatGPTBridge.SUPPORTED_APIS.includes(apiName);
    }

    /** 手动触发初始化（一般无需调用，ready/error/事件订阅会自动触发） */
    init() {
        this._ensureInit();
        return this;
    }

    // ==================== 同步读取（小程序风格 getXxxSync）====================

    /**
     * AI 当前是否正在生成回复
     * 判定：发送按钮的 data-testid === 'stop-button'
     * @returns {boolean}
     */
    getAIGeneratingSync() {
        try {
            const btn = document.getElementById(ChatGPTBridge.SUBMIT_BUTTON_ID);
            return !!(btn && btn.getAttribute('data-testid') === 'stop-button');
        } catch {
            return false;
        }
    }

    /**
     * 获取对话输入框元素
     * @returns {HTMLElement|null}
     */
    getInputElementSync() {
        try {
            return document.querySelector(ChatGPTBridge.INPUT_SELECTOR);
        } catch {
            return null;
        }
    }

    // ==================== 事件：AI 生成开始 / 结束（小程序风格 onXxx/offXxx）====================

    /**
     * 订阅「AI 开始生成回复」事件
     * @param {(detail: { generating: true }) => void} callback
     * @returns {ChatGPTBridge}
     */
    onAIGenerateStart(callback) {
        this._on('aiGenerateStart', callback);
        this._ensureAIMonitor();
        return this;
    }

    /**
     * 取消订阅「AI 开始生成回复」事件
     * @param {Function} callback
     * @returns {ChatGPTBridge}
     */
    offAIGenerateStart(callback) {
        this._off('aiGenerateStart', callback);
        this._maybeStopAIMonitor();
        return this;
    }

    /**
     * 订阅「AI 结束生成回复」事件
     * @param {(detail: { generating: false }) => void} callback
     * @returns {ChatGPTBridge}
     */
    onAIGenerateEnd(callback) {
        this._on('aiGenerateEnd', callback);
        this._ensureAIMonitor();
        return this;
    }

    /**
     * 取消订阅「AI 结束生成回复」事件
     * @param {Function} callback
     * @returns {ChatGPTBridge}
     */
    offAIGenerateEnd(callback) {
        this._off('aiGenerateEnd', callback);
        this._maybeStopAIMonitor();
        return this;
    }

    // ==================== 内部：生命周期实现 ====================

    /** @private */
    _ensureInit() {
        if (this._initStarted) return;
        this._initStarted = true;

        if (!this._matchesPlatform()) {
            this._fail(new Error('[ChatGPTBridge] current page is not ChatGPT'));
            return;
        }
        this._waitForReady();
    }

    /** @private 等待关键 DOM 就绪（输入框出现，或历史容器出现） */
    _waitForReady() {
        const isDomReady = () =>
            !!this.getInputElementSync() ||
            !!document.getElementById(ChatGPTBridge.HISTORY_ID);

        if (isDomReady()) {
            this._markReady();
            return;
        }

        const STEP = 200;
        const TIMEOUT = 20000;
        let elapsed = 0;
        this._readyTimer = setInterval(() => {
            if (isDomReady()) {
                clearInterval(this._readyTimer);
                this._readyTimer = null;
                this._markReady();
            } else if ((elapsed += STEP) >= TIMEOUT) {
                clearInterval(this._readyTimer);
                this._readyTimer = null;
                this._fail(new Error('[ChatGPTBridge] DOM ready timeout'));
            }
        }, STEP);
    }

    /** @private */
    _markReady() {
        if (this._ready) return;
        this._ready = true;
        const cbs = this._readyCbs.splice(0);
        cbs.forEach(cb => this._safe(cb, this));
    }

    /** @private */
    _fail(err) {
        if (this._errored) return;
        this._errored = true;
        this._error = err;
        const cbs = this._errorCbs.splice(0);
        cbs.forEach(cb => this._safe(cb, err));
    }

    /** @private */
    _matchesPlatform() {
        try {
            if (typeof matchesPlatform === 'function' && typeof SITE_INFO !== 'undefined') {
                return matchesPlatform(location.href, 'chatgpt');
            }
        } catch { /* ignore */ }
        const h = location.hostname;
        return h === 'chatgpt.com' || h.endsWith('.chatgpt.com') || h === 'chat.openai.com';
    }

    // ==================== 内部：事件总线 ====================

    /** @private */
    _on(type, callback) {
        if (typeof callback !== 'function') return;
        let set = this._events.get(type);
        if (!set) {
            set = new Set();
            this._events.set(type, set);
        }
        set.add(callback);
    }

    /** @private */
    _off(type, callback) {
        const set = this._events.get(type);
        if (set) set.delete(callback);
    }

    /** @private */
    _emit(type, detail) {
        const set = this._events.get(type);
        if (!set || set.size === 0) return;
        [...set].forEach(cb => this._safe(cb, detail));
    }

    /** @private */
    _safe(fn, arg) {
        try {
            fn.call(this, arg);
        } catch (e) {
            console.error('[ChatGPTBridge] listener error:', e);
        }
    }

    // ==================== 内部：AI 状态监控（懒加载）====================

    /** @private 是否存在 AI 状态事件监听者 */
    _hasAIListeners() {
        const start = this._events.get('aiGenerateStart')?.size || 0;
        const end = this._events.get('aiGenerateEnd')?.size || 0;
        return start + end > 0;
    }

    /** @private 首个监听者出现时启动监控 */
    _ensureAIMonitor() {
        if (this._aiMonitorTeardown || !this._hasAIListeners()) return;
        if (!this._matchesPlatform()) return;

        // 以当前状态为基线，仅在状态翻转时派发，避免重复触发
        this._aiLastState = this.getAIGeneratingSync();

        const check = () => {
            const cur = this.getAIGeneratingSync();
            if (cur === this._aiLastState) return;
            this._aiLastState = cur;
            if (cur) {
                this._emit('aiGenerateStart', { generating: true });
            } else {
                this._emit('aiGenerateEnd', { generating: false });
            }
        };

        // 优先搭便车在全局 DOMObserverManager 的 body 监听上：
        // AI 生成过程中会持续新增节点，throttle 保证实时性，debounce 兜底捕获收尾翻转。
        const dom = (typeof window !== 'undefined' && window.DOMObserverManager?.getInstance)
            ? window.DOMObserverManager.getInstance()
            : null;

        if (dom && typeof dom.subscribeBody === 'function') {
            this._aiMonitorTeardown = dom.subscribeBody('chatgpt-bridge:ai-state', {
                callback: check,
                filter: { hasAddedNodes: true },
                throttle: 250,
                debounce: 300,
            });
        } else {
            const observer = new MutationObserver(check);
            try {
                observer.observe(document.body, { childList: true, subtree: true });
            } catch { /* document.body 未就绪时静默 */ }
            this._aiMonitorTeardown = () => observer.disconnect();
        }
    }

    /** @private 最后一个监听者移除后停止监控 */
    _maybeStopAIMonitor() {
        if (this._hasAIListeners() || !this._aiMonitorTeardown) return;
        try {
            this._aiMonitorTeardown();
        } catch { /* ignore */ }
        this._aiMonitorTeardown = null;
    }
}

// ==================== 全局暴露 ====================

if (typeof window !== 'undefined') {
    window.ChatGPTBridge = ChatGPTBridge;
    if (!window.chatGPTBridge) {
        window.chatGPTBridge = ChatGPTBridge.getInstance();
    }
}
