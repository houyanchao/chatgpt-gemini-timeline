/**
 * Conversation Export - 导出适配器基类
 *
 * 独立的多平台适配器家族（对齐 timeline/sidebarStarred/smartInputBox 的架构）。
 * 基类只承载「平台无关」的通用能力：
 * - 采集编排 collectAllTurns：按 loadStrategy（SCROLL 滚动加载 / STATIC 内存直读）
 *   把对话准备到可读取状态 → prepareCollection 一次性准备 → 逐轮 extractTurn 读取去重
 * - 「平台事实」优先委托时间轴 adapter（单一事实来源）：用户/助手消息选择器、
 *   对话路由判断、按钮插入锚点、会话标题、滚动容器；时间轴未运行时，选择器回退到
 *   全局 registry 里同平台的时间轴 adapter（仍是单一来源，无需重复维护），其余回退子类兜底
 * - 通用抽取 helper：_domMarkdownFrom（正文根→markdown）、_pairFlatTurns（扁平角色序列配对）
 * - 默认主题色、平台名等派生信息
 *
 * 「平台相关」的取数由子类实现（DOM 范式见 gemini.js，数据源/Fiber 范式见 chatgpt.js）。
 *
 * 数据结构（turn）：
 * {
 *   id: string,
 *   order: number,
 *   user: { text: string, images: Array, time: number|null },
 *   assistant: { markdown: string, text: string, images: Array }
 * }
 *
 * user.time 为提问时间戳（毫秒），来源于扩展的 ChatTimeRecorder 记录（chatTimes 存储）；
 * 未记录（历史对话/平台未开启该功能）时为 null。
 */

class CEExportAdapter {
    constructor(platformId) {
        this.platformId = platformId;
        this.domToMarkdown = new CEDomToMarkdown();
        // 采集策略（见 CE_LOAD_STRATEGY）。默认滚动加载（Gemini 等）。
        this.loadStrategy = CE_LOAD_STRATEGY.SCROLL;
    }

    // ---------- 平台事实（默认委托时间轴 adapter，子类提供兜底/覆盖） ----------

    /**
     * 解析同平台的时间轴 adapter（平台事实的单一来源）。
     * 优先返回运行中的 timelineManager.adapter（携带页面运行态）；时间轴未运行时，
     * 从全局只读单例 siteAdapterRegistry 按 platformId 取同平台内置 adapter，
     * 以复用其静态平台事实（如消息选择器），避免在导出侧重复维护一份。
     * 都取不到时返回 null。
     * @returns {SiteAdapter|null}
     */
    _resolveTimelineAdapter() {
        const live = window.timelineManager?.adapter;
        if (live) return live;
        try {
            const registry = window.siteAdapterRegistry;
            const all = registry?.getAllAdapters?.() || [];
            return all.find(a => a.platformId === this.platformId) || null;
        } catch {
            return null;
        }
    }

    /**
     * 当前页面是否可导出。
     * 默认实现：平台匹配 + 对话路由（复用时间轴 adapter 的 isConversationRoute，
     * 不可用时跳过该检查）+ 页面存在用户消息。
     */
    isExportablePage() {
        if (!matchesCurrentPlatformSync(this.platformId)) return false;

        const isRoute = window.timelineManager?.adapter?.isConversationRoute?.(location.pathname);
        if (isRoute === false) return false;

        const selector = this.getUserMessageSelector();
        return !!selector && document.querySelector(selector) !== null;
    }

    /**
     * 按钮插入锚点（插入到该元素前面）；返回 null 则不显示按钮。
     * 优先复用时间轴 adapter 的收藏按钮锚点（两者插入同一位置，单一事实来源），
     * 时间轴不可用时回退子类的 _fallbackButtonInsertTarget。
     */
    getButtonInsertTarget() {
        const shared = window.timelineManager?.adapter?.getStarChatButtonTarget?.();
        return shared || this._fallbackButtonInsertTarget();
    }

    /** 时间轴不可用时的按钮锚点兜底，由子类实现 */
    _fallbackButtonInsertTarget() { return null; }

    /**
     * 会话标题。
     * 优先复用时间轴 adapter 的 getDefaultChatTheme（已做平台后缀清洗），
     * 退化为 document.title → 第一条用户消息文本。
     */
    getConversationTitle() {
        const shared = window.timelineManager?.adapter?.getDefaultChatTheme?.();
        if (shared) return shared;

        const title = (document.title || '').trim();
        if (title) return title;

        const selector = this.getUserMessageSelector();
        const firstUser = selector ? document.querySelector(selector) : null;
        if (firstUser) {
            const text = (firstUser.textContent || '').replace(/\s+/g, ' ').trim();
            if (text) return text.slice(0, 40);
        }
        return CE_TEXT.defaultTitle;
    }

    /**
     * 滚动容器。
     * 优先复用时间轴已解析好的滚动容器（与页面实际滚动区域一致），
     * 再尝试子类兜底 _fallbackScrollContainer，最后退化为页面根滚动元素。
     */
    getScrollContainer() {
        const timelineContainer = window.timelineManager?.scrollContainer;
        if (timelineContainer && timelineContainer.nodeType === 1) {
            return timelineContainer;
        }

        const custom = this._fallbackScrollContainer();
        if (custom) return custom;

        return document.scrollingElement || document.documentElement || window;
    }

    /** 时间轴不可用时的滚动容器兜底，由子类按需实现 */
    _fallbackScrollContainer() { return null; }

    // ---------- 子类需实现（平台相关） ----------

    /**
     * 当前对话的「轮单元」列表，按对话顺序排列。
     * 轮单元对基类是不透明的：可以是 DOM 容器（Gemini 的 .conversation-container），
     * 也可以是平台自定义对象（ChatGPT 的 {userEl, assistantEl} 配对）——
     * 基类只负责按顺序把它逐个传给 extractTurn，由同一子类负责解释。
     * @returns {Array<*>}
     */
    getTurnContainers() { return []; }

    /**
     * 从单个轮单元抽取一轮对话。
     * @param {*} turnUnit - getTurnContainers 返回的轮单元（Element 或平台自定义对象）
     * @returns {{id:string|null, user:Object, assistant:Object}|null}
     */
    extractTurn(turnUnit) { return null; }

    /**
     * 是否仍在加载更早的历史内容（平台各自的加载指示器）。
     * 默认无指示器，采集循环会退化为“滚动到位置稳定即停”。
     * @returns {boolean}
     */
    isLoadingMore() { return false; }

    /**
     * 采集前的准备钩子（在滚动加载完成、正式读取每轮内容之前调用一次）。
     * 平台可在此做一次性准备，例如 ChatGPT 通过 fiber bridge 拉取完整对话数据并缓存。
     * 默认无操作。
     * @returns {Promise<void>}
     */
    async prepareCollection() { /* no-op by default */ }

    // ---------- 通用 helper（供子类复用平台无关的抽取模式） ----------

    /**
     * 从消息元素里挑选「正文根节点」并转 markdown。
     *
     * 依次尝试 rootSelectors，命中第一个作为正文根；都不命中时退化为 el 本身。
     * 用于消除各平台 _extractAssistant 里「找 .markdown 等正文根再交给 domToMarkdown」的重复。
     *
     * @param {Element} el - 消息元素（如 model-response / 助手轮）
     * @param {string[]} [rootSelectors] - 正文根候选选择器（按优先级）
     * @returns {{markdown:string, text:string, images:Array}}
     */
    _domMarkdownFrom(el, rootSelectors = []) {
        if (!el) return { markdown: '', text: '', images: [] };
        let root = null;
        for (const sel of rootSelectors) {
            try { root = el.querySelector(sel); } catch { root = null; }
            if (root) break;
        }
        return this.domToMarkdown.convert(root || el);
    }

    /**
     * 把「按文档顺序排列、带角色的元素序列」配对成一问一答的 turn 单元。
     *
     * 以用户消息为锚：其后、下一个用户消息之前的第一个助手消息作为该轮回复。
     * 适用于 user/assistant 交替的扁平消息列表（ChatGPT 等；Gemini 那种一个容器含问答的
     * 结构不需要它）。开头出现、无前置用户轮的助手消息（如开场白）忽略。
     *
     * ⚠️ 隐含假设：一轮回复只对应一个助手元素。若平台把一轮回复拆成多个连续的
     * assistant 元素（如工具调用 + 正文分段），第二个起会被丢弃——这类平台应在
     * 元素粒度上先合并（如 ChatGPT 在 turn 级聚合 messages），或自行实现配对。
     *
     * @param {Element[]} orderedEls - 按文档顺序排列的消息/轮元素
     * @param {(el:Element)=>string} getRole - 返回 'user' | 'assistant' | 其他
     * @returns {Array<{userEl:Element, assistantEl:Element|null}>}
     */
    _pairFlatTurns(orderedEls, getRole) {
        const pairs = [];
        let current = null;
        for (const el of orderedEls) {
            const role = getRole(el);
            if (role === 'user') {
                if (current) pairs.push(current);
                current = { userEl: el, assistantEl: null };
            } else if (role === 'assistant') {
                if (current && !current.assistantEl) current.assistantEl = el;
            }
        }
        if (current) pairs.push(current);
        return pairs;
    }

    /**
     * 收集元素内的对话图片（按 src 去重，过滤装饰小图，规则见 CEDomToMarkdown.extractImage）。
     * @param {Element} root
     * @param {'user'|'assistant'} role
     * @returns {Array}
     */
    _collectImagesFrom(root, role) {
        if (!root) return [];
        const images = [];
        const seen = new Set();
        root.querySelectorAll('img').forEach(img => {
            const info = this.domToMarkdown.extractImage(img, role);
            if (info && !seen.has(info.src)) {
                seen.add(info.src);
                images.push(info);
            }
        });
        return images;
    }

    // ---------- 通用能力（平台无关） ----------

    /**
     * 用户消息选择器。
     * 复用同平台时间轴 adapter 的 getUserMessageSelector（单一事实来源，
     * 运行态优先、否则取全局 registry 里的同平台 adapter）。
     * @returns {string}
     */
    getUserMessageSelector() {
        return this._resolveTimelineAdapter()?.getUserMessageSelector?.() || '';
    }

    /**
     * AI 回复消息选择器。
     * 复用同平台时间轴 adapter 的 getAssistantMessageSelector（单一事实来源，
     * 运行态优先、否则取全局 registry 里的同平台 adapter）。
     * @returns {string}
     */
    getAssistantMessageSelector() {
        return this._resolveTimelineAdapter()?.getAssistantMessageSelector?.() || '';
    }

    /**
     * 构建「用户消息元素 → 提问时间戳」映射。
     *
     * 复用扩展已记录的提问时间（ChatTimeRecorder 写入的 chatTimes 存储）：
     * 键为时间轴 adapter 的 generateTurnId(userEl, index)。这里对时间轴 adapter 声明的
     * 用户消息元素逐个计算相同的 nodeId 并回填时间戳，用 WeakMap 以元素为键，
     * 便于子类在 extractTurn 中按用户元素直接取用（无需关心 ID 规则差异）。
     *
     * 存储无记录 / 时间轴不可用 / 平台未开启该功能时返回 null。
     * @returns {Promise<WeakMap<Element, number>|null>}
     */
    async _buildAskTimeMap() {
        try {
            const adapter = window.timelineManager?.adapter;
            if (!adapter?.generateTurnId || typeof ChatTimeStorageManager === 'undefined') return null;

            const conversationKey = location.href
                .replace(/^https?:\/\//, '')
                .split('?')[0]
                .split('#')[0];
            if (!conversationKey) return null;

            const data = await ChatTimeStorageManager.getByConversation(conversationKey);
            const nodes = data?.nodes || {};
            if (!Object.keys(nodes).length) return null;

            const selector = adapter.getUserMessageSelector?.();
            if (!selector) return null;

            const els = Array.from(document.querySelectorAll(selector));
            const map = new WeakMap();
            els.forEach((el, index) => {
                const nodeId = adapter.generateTurnId(el, index);
                const ts = nodes[String(nodeId)];
                if (ts) map.set(el, ts);
            });
            return map;
        } catch {
            return null;
        }
    }

    /**
     * 按用户消息元素取提问时间戳（毫秒），无记录时返回 null。
     * @param {Element} userEl
     * @returns {number|null}
     */
    _getAskTime(userEl) {
        if (!userEl || !this._askTimeMap) return null;
        return this._askTimeMap.get(userEl) || null;
    }

    /** 平台展示名 */
    async getPlatformName() {
        const platform = await getPlatformById(this.platformId);
        return platform?.name || this.platformId;
    }

    /** 默认 PNG 主题色：跟随时间轴激活色设置 */
    async getDefaultThemeId() {
        try {
            const result = await chrome.storage.local.get('timelineActiveColorByPlatform');
            const settings = result?.timelineActiveColorByPlatform || {};
            const colorId = resolveTimelineActiveColorId(this.platformId, settings);
            // 仅当该 id 也是导出可选主题时才采用，否则回退默认
            if (CE_THEMES.some(t => t.id === colorId)) return colorId;
        } catch { /* ignore */ }
        return CE_DEFAULT_THEME;
    }

    /**
     * 自动加载并采集完整对话。
     *
     * 流程：① 按 loadStrategy 把对话准备到「可读取」状态 → ② prepareCollection 一次性准备
     * →（③）按 getTurnContainers 顺序逐轮 extractTurn 读取、去重。
     *
     * 加载策略（见 CE_LOAD_STRATEGY）：
     * - SCROLL（Gemini 等）：反复向上滚动到顶，把只在顶部懒加载的历史全部加载出来。
     * - STATIC（ChatGPT 等）：完整对话数据已在内存（React Fiber），无需滚动，直接读取。
     *
     * @param {Object} options
     * @param {(count:number)=>void} [options.onProgress]
     * @param {()=>boolean} [options.shouldCancel]
     * @returns {Promise<Array>} 按对话顺序排列的 turn 列表
     */
    async collectAllTurns({ onProgress, shouldCancel } = {}) {
        const scroller = this.getScrollContainer();

        const getScrollTop = () => (scroller === window ? window.scrollY : scroller.scrollTop);
        const scrollTo = (top) => {
            if (scroller === window) window.scrollTo(0, top);
            else scroller.scrollTop = top;
        };

        const initialScrollTop = getScrollTop();

        // ① 按策略把完整对话准备到可读取状态
        if (this.loadStrategy === CE_LOAD_STRATEGY.SCROLL) {
            await this._loadByScrolling({ onProgress, shouldCancel, scrollTo });
        } else {
            // STATIC：数据已在内存，仅上报当前数量供进度显示
            onProgress?.(this.getTurnContainers().length);
        }

        if (shouldCancel?.()) {
            try { scrollTo(initialScrollTop); } catch { /* ignore */ }
            return [];
        }

        // ② 正式读取前的一次性准备（如 ChatGPT 从 fiber 拉取完整对话并缓存）
        try {
            await this.prepareCollection();
        } catch (error) {
        }

        if (shouldCancel?.()) {
            try { scrollTo(initialScrollTop); } catch { /* ignore */ }
            return [];
        }

        // 预取提问时间映射（元素 → 时间戳），供 extractTurn 里按用户元素取用
        this._askTimeMap = await this._buildAskTimeMap();

        // ③ 按顺序一次性读取所有对话轮。
        const turns = [];
        const seen = new Set();
        for (const container of this.getTurnContainers()) {
            let turn;
            try {
                turn = this.extractTurn(container);
            } catch {
                turn = null;
            }
            if (!turn) continue;
            const key = turn.id || `sig:${this._signature(turn)}`;
            if (seen.has(key)) continue;
            seen.add(key);
            turns.push(turn);
        }

        // 恢复用户原始滚动位置（尽量不打扰）
        try { scrollTo(initialScrollTop); } catch { /* ignore */ }

        turns.forEach((turn, index) => { turn.order = index + 1; });
        return turns;
    }

    /**
     * SCROLL 策略：反复跳到顶部把只在顶部懒加载的历史全部加载出来。
     *
     * 每次 scrollTo(0) 触发上方历史加载 —— 在加载就等其完成后再跳；跳顶后既不在加载、
     * 对话数也不再增长，说明已到达真正的顶部、历史全部加载完成。
     *
     * @param {Object} ctx
     * @param {(count:number)=>void} [ctx.onProgress]
     * @param {()=>boolean} [ctx.shouldCancel]
     * @param {(top:number)=>void} ctx.scrollTo
     * @returns {Promise<void>}
     */
    async _loadByScrolling({ onProgress, shouldCancel, scrollTo }) {
        const maxRounds = 800;

        let prevCount = this.getTurnContainers().length;
        onProgress?.(prevCount);
        for (let round = 0; round < maxRounds; round++) {
            if (shouldCancel?.()) break;

            scrollTo(0);
            await this._wait(1000);             // 给顶部“加载中”一点启动时间
            await this._waitWhileLoading(2000); // 若正在加载则等其完成

            const count = this.getTurnContainers().length;
            onProgress?.(count);

            if (this.isLoadingMore()) continue; // 仍在加载 → 再跳顶继续
            if (count === prevCount) break;     // 不在加载且无新增 → 已到顶、全部加载完成
            prevCount = count;                  // 有新增 → 再跳顶看是否还有更早历史
        }
    }

    /**
     * 等待“加载中”动画结束（最多 maxMs）。
     *
     * 借鉴 AIStateMonitor 的“免轮询”思路：搭全局共享的 DOMObserverManager
     * body 观察器——加载指示器的出现/消失都是节点增删，能被捕获——每次 DOM 变化时
     * 重新判断 isLoadingMore()，加载结束（连续 IDLE 无加载）即结算，最长等待 maxMs。
     * DOMObserverManager 不可用时直接结算（采集循环自身还有多轮兜底）。
     *
     * @param {number} maxMs
     * @returns {Promise<void>}
     */
    _waitWhileLoading(maxMs = 3000) {
        return new Promise((resolve) => {
            const manager = window.DOMObserverManager;
            if (!manager || !manager.getInstance) {
                resolve();
                return;
            }

            const IDLE_MS = 150; // 连续无加载达到该时长视为加载结束
            let done = false;
            let unsubscribe = null;
            let idleTimer = null;
            let maxTimer = null;

            const cleanup = () => {
                if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
                if (maxTimer) { clearTimeout(maxTimer); maxTimer = null; }
                if (unsubscribe) { unsubscribe(); unsubscribe = null; }
            };
            const finish = () => {
                if (done) return;
                done = true;
                cleanup();
                resolve();
            };

            const scheduleIdleConfirm = () => {
                if (idleTimer) clearTimeout(idleTimer);
                idleTimer = setTimeout(() => {
                    idleTimer = null;
                    if (!this.isLoadingMore()) finish();
                }, IDLE_MS);
            };

            const evaluate = () => {
                if (this.isLoadingMore()) {
                    // 仍在加载：取消结束确认，继续等待下一次 DOM 变化
                    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
                } else {
                    scheduleIdleConfirm();
                }
            };

            maxTimer = setTimeout(finish, maxMs);

            try {
                // 不设过滤：加载条出现=增节点、消失=删节点，都要感知
                unsubscribe = manager.getInstance().subscribeBody('ce-export-loading-wait', {
                    callback: evaluate,
                });
            } catch {
                finish();
                return;
            }

            // 立即评估一次当前状态
            evaluate();
        });
    }

    _signature(turn) {
        const u = (turn.user?.text || '').replace(/\s+/g, ' ').slice(0, 80);
        const aLen = (turn.assistant?.text || '').length;
        return `${u}#${aLen}`;
    }

    _wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
