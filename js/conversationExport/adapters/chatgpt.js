/**
 * Conversation Export - ChatGPT 导出适配器
 *
 * 与 Gemini 的关键差异：
 * 1. ChatGPT 是「视口窗口式」虚拟渲染：任意时刻 DOM 里只有视口附近一屏的轮次是
 *    已渲染的 <article>，其余全部是 [data-turn-id-container]
 *    [data-is-intersecting="false"] 空壳（运行日志实证：121 个容器滚到顶后仅 8 对
 *    已渲染，反复滚顶无增益）。因此基类「先加载完、再统一读」的编排不成立，
 *    本类覆盖 collectAllTurns：从顶到底逐屏滚动，分别采集用户和助手消息，
 *    结束后按容器 DOM 顺序配对输出。提问和回复无需在同一滚动窗口内同时存在。
 * 2. ChatGPT 的用户与助手是各自独立的 <article data-turn="user|assistant" data-turn-id>，
 *    不像 Gemini 用一个 .conversation-container 同时装问答。因此需要按文档顺序把
 *    「用户轮 + 紧随其后的助手轮」配成一对。
 *
 * 内容完全来自 DOM（滚动渲染后采集）；
 * 用户/助手消息选择器复用基类共享方法（优先取时间轴 adapter）。
 */

class CEChatGPTExportAdapter extends CEExportAdapter {
    constructor() {
        super('chatgpt');
    }

    /**
     * 未渲染的虚拟化空壳轮次列表。
     * ChatGPT 给视口外轮次保留 [data-turn-id-container] 容器，
     * 并以 data-is-intersecting="false" 标记（内部 React 子树已卸载）。
     * @returns {Element[]}
     */
    _getUnrenderedShells() {
        return Array.from(document.querySelectorAll(
            '[data-turn-id-container][data-is-intersecting="false"]'
        ));
    }

    /**
     * 覆盖基类采集编排：以「空壳」为锚点逐个滚动渲染、边滚边采集。
     *
     * 为什么不能用基类「先加载完、再统一读」的两段式编排：
     * ChatGPT 的虚拟化是视口窗口式的——滚到哪里就只渲染哪里，滚过去的轮次
     * 会被卸载回空壳。不存在「全部渲染完成」的时刻，必须在滚动途中即时提取。
     *
     * 为什么按空壳元素锚定、而不是按像素逐屏步进（运行日志实证的两个坑）：
     * 1. 空壳渲染成真实内容后高度膨胀（一次运行页面总高从 35250 涨到 43986），
     *    下方内容整体下移，固定像素步进会被重排反超、整段跳过；
     *    元素锚定用空壳的实时位置滚动，天然免疫重排。
     * 2. [data-turn-id-container] 容器本身也是窗口化的（同一运行中 121 → 85），
     *    结束时的单次快照排不出完整顺序——改为每轮把当前窗口的容器 id 序列
     *    增量合并进全局有序表（相邻窗口高度重叠，按锚点插入）。
     *
     * 流程：跳到顶部 → 每轮找文档序第一个「未处理过的空壳」滚到视口 → 等待渲染
     * 稳定（固定启动等待 + DOM 安静确认）→ 提取当前已渲染轮次（按用户轮 turn id
     * 去重）并合并容器顺序 → 无未处理空壳或连续多轮无进展时结束 → 按全局有序表
     * 排序输出，恢复用户原始滚动位置。
     *
     * @param {Object} options
     * @param {(count:number)=>void} [options.onProgress]
     * @param {()=>boolean} [options.shouldCancel]
     * @returns {Promise<Array>}
     */
    async collectAllTurns({ onProgress, shouldCancel } = {}) {
        const scroller = this.getScrollContainer();
        const isWin = scroller === window;
        const getScrollTop = () => (isWin ? window.scrollY : scroller.scrollTop);
        const scrollTo = (top) => {
            if (isWin) window.scrollTo(0, top);
            else scroller.scrollTop = top;
        };

        const initialScrollTop = getScrollTop();

        // 提问时间表（按 turn id 查，替代基类按元素的 WeakMap——
        // 逐屏采集时元素随滚动创建/卸载，元素键在跨屏后失效）
        const askTimes = await this._loadAskTimes();

        const capturedMessages = new Map(); // 消息 turn id → { id, role, content }
        const capturedUserIds = new Set(); // 进度统计，避免每轮扫描全部快照
        const capturedOrder = [];      // 消息首次渲染顺序（旧版 DOM / 顺序表兜底）
        const processedIds = new Set(); // 渲染过（内容采集过）的容器 id
        const masterOrder = [];         // 全局容器 id 顺序（跨窗口增量合并）

        // 把当前窗口的容器 id 序列合并进全局有序表。
        // 相邻轮次的窗口高度重叠：已知 id 作为锚点推进，未知 id 插到锚点之后。
        const mergeContainerOrder = () => {
            const seen = new Set();
            const current = [];
            document.querySelectorAll('[data-turn-id-container]').forEach(el => {
                const id = el.getAttribute('data-turn-id-container');
                if (id && !seen.has(id)) { seen.add(id); current.push(id); }
            });
            let ptr = -1; // masterOrder 中最后命中的锚点位置
            for (const id of current) {
                const idx = masterOrder.indexOf(id);
                if (idx >= 0) {
                    ptr = Math.max(ptr, idx);
                } else {
                    masterOrder.splice(ptr + 1, 0, id);
                    ptr += 1;
                }
            }
        };

        // 标记当前已渲染的容器（内部有 [data-turn] 真实内容，或明确 intersecting）
        const markProcessed = () => {
            document.querySelectorAll('[data-turn-id-container]').forEach(el => {
                const id = el.getAttribute('data-turn-id-container');
                if (!id || processedIds.has(id)) return;
                if (el.getAttribute('data-is-intersecting') === 'true' || el.querySelector('[data-turn]')) {
                    processedIds.add(id);
                }
            });
        };

        const collectRendered = () => {
            document.querySelectorAll('[data-turn-id][data-turn]').forEach(element => {
                const id = element.getAttribute('data-turn-id');
                const role = element.getAttribute('data-turn');
                if (!id || (role !== 'user' && role !== 'assistant')) return;

                let content;
                try {
                    if (role === 'user') {
                        content = this._extractUser(element);
                        if (askTimes) content.time = askTimes[`chatgpt-${id}`] || null;
                    } else {
                        content = this._extractAssistant(element);
                    }
                } catch {
                    return;
                }

                if (!capturedMessages.has(id)) capturedOrder.push(id);
                if (role === 'user') capturedUserIds.add(id);
                // 同一消息再次渲染时使用最新快照，兼容延迟补齐的正文、图片和公式。
                capturedMessages.set(id, { id, role, content });
            });
            markProcessed();
            mergeContainerOrder();
            onProgress?.(capturedUserIds.size);
        };

        // 文档序第一个「未处理过的空壳」（渲染过的容器被虚拟化卸载回空壳时不再重复处理）
        const nextPendingShell = () =>
            this._getUnrenderedShells().find(el => {
                const id = el.getAttribute('data-turn-id-container');
                return id && !processedIds.has(id);
            }) || null;

        // 从顶部开始（建立全局顺序表的头部）
        scrollTo(0);
        await this._wait(1000);              // 顶部渲染启动
        await this._waitWhileLoading(2000);  // DOM 稳定确认（与 Gemini 同一等待机制）
        collectRendered();

        // 逐个把未处理空壳滚进视口渲染并采集
        const maxRounds = 800;
        let stagnantRounds = 0;
        for (let round = 0; round < maxRounds; round++) {
            if (shouldCancel?.()) {
                try { scrollTo(initialScrollTop); } catch { /* ignore */ }
                return [];
            }

            const shell = nextPendingShell();
            if (!shell) break; // 所有容器都渲染并采集过

            const beforeCaptured = capturedMessages.size;
            const beforeProcessed = processedIds.size;

            // 元素锚定滚动：按空壳当前实时位置，把它滚到视口上沿附近
            const rect = shell.getBoundingClientRect();
            const viewTop = isWin ? 0 : scroller.getBoundingClientRect().top;
            scrollTo(getScrollTop() + (rect.top - viewTop) - 80);
            await this._wait(400);              // 渲染启动
            await this._waitWhileLoading(2000); // DOM 稳定确认
            collectRendered();

            // 连续多轮既无新采集也无新渲染 → 虚拟化不再响应，避免死循环
            if (capturedMessages.size === beforeCaptured && processedIds.size === beforeProcessed) {
                stagnantRounds++;
                if (stagnantRounds >= 5) break;
            } else {
                stagnantRounds = 0;
            }
        }
        collectRendered(); // 结束前最后再采一次

        // 用户和助手独立采集，最后才按完整顺序配对，避免虚拟窗口边界漏回复。
        const turns = this._pairCapturedMessages(capturedMessages, masterOrder, capturedOrder);

        // 恢复用户原始滚动位置（尽量不打扰）
        try { scrollTo(initialScrollTop); } catch { /* ignore */ }

        turns.forEach((turn, index) => { turn.order = index + 1; });
        return turns;
    }

    /**
     * 按全局消息顺序把独立快照组成对话轮。
     * 助手消息即使在用户消息卸载后才渲染，也能通过稳定 turn id 和顺序正确归属。
     *
     * @param {Map<string,{id:string,role:string,content:Object}>} capturedMessages
     * @param {string[]} masterOrder
     * @param {string[]} capturedOrder
     * @returns {Array}
     */
    _pairCapturedMessages(capturedMessages, masterOrder, capturedOrder) {
        const orderedIds = [];
        const seen = new Set();
        [...masterOrder, ...capturedOrder].forEach(id => {
            if (!id || seen.has(id) || !capturedMessages.has(id)) return;
            seen.add(id);
            orderedIds.push(id);
        });

        const turns = [];
        let pendingUser = null;
        const emptyAssistant = () => ({ markdown: '', text: '', images: [] });
        const flushPending = () => {
            if (!pendingUser) return;
            const { id, user, assistant } = pendingUser;
            if (user.text || user.images.length || assistant.text || assistant.images.length) {
                turns.push({ id: `chatgpt-${id}`, user, assistant });
            }
            pendingUser = null;
        };

        orderedIds.forEach(id => {
            const message = capturedMessages.get(id);
            if (message.role === 'user') {
                flushPending();
                pendingUser = {
                    id,
                    user: message.content,
                    assistant: emptyAssistant(),
                    assistantAssigned: false
                };
                return;
            }
            if (message.role === 'assistant' && pendingUser && !pendingUser.assistantAssigned) {
                pendingUser.assistant = message.content;
                pendingUser.assistantAssigned = true;
            }
        });
        flushPending();
        return turns;
    }

    /**
     * 读取扩展记录的提问时间表（ChatTimeRecorder 写入的 chatTimes 存储）。
     * 键为时间轴 generateTurnId 的产物（chatgpt-<turnId>），值为毫秒时间戳。
     * 无记录/存储不可用时返回 null。
     * @returns {Promise<Object|null>}
     */
    async _loadAskTimes() {
        try {
            if (typeof ChatTimeStorageManager === 'undefined') return null;
            const conversationKey = location.href
                .replace(/^https?:\/\//, '')
                .split('?')[0]
                .split('#')[0];
            if (!conversationKey) return null;
            const data = await ChatTimeStorageManager.getByConversation(conversationKey);
            const nodes = data?.nodes || {};
            return Object.keys(nodes).length ? nodes : null;
        } catch {
            return null;
        }
    }

    /** 兜底：与时间轴 getStarChatButtonTarget 相同的分享按钮锚点 */
    _fallbackButtonInsertTarget() {
        return document.querySelector('[data-testid="share-chat-button"]');
    }

    /**
     * 对话轮单元 = { userEl, assistantEl } 配对。
     * ChatGPT 用户与助手是各自独立的 <article data-turn>，按文档顺序用基类
     * _pairFlatTurns 配对（以用户轮为锚，配其后的第一个助手轮）。
     * @returns {Array<{userEl:Element, assistantEl:Element|null}>}
     */
    getTurnContainers() {
        const ordered = Array.from(document.querySelectorAll('[data-turn-id][data-turn]'));
        return this._pairFlatTurns(ordered, el => el.getAttribute('data-turn'));
    }

    /**
     * @param {{userEl:Element, assistantEl:Element|null}} pair
     */
    extractTurn(pair) {
        if (!pair || !pair.userEl) return null;

        const userTurnId = pair.userEl.getAttribute('data-turn-id');
        const user = this._extractUser(pair.userEl);
        const assistant = this._extractAssistant(pair.assistantEl);

        // 用户与助手都为空，跳过
        if (!user.text && !user.images.length && !assistant.text && !assistant.images.length) {
            return null;
        }

        const id = userTurnId ? `chatgpt-${userTurnId}` : null;
        return { id, user, assistant };
    }

    // ==================== 内部 ====================

    _extractUser(userEl) {
        const text = this._domUserText(userEl);
        const images = this._collectImagesFrom(userEl, 'user');
        return { text, images, time: this._getAskTime(userEl) };
    }

    _extractAssistant(assistantEl) {
        if (!assistantEl) return { markdown: '', text: '', images: [] };
        return this._domMarkdownFrom(assistantEl, ['.markdown', '[data-message-author-role="assistant"]']);
    }

    _domUserText(userEl) {
        if (!userEl) return '';
        const textEl = userEl.querySelector('.whitespace-pre-wrap');
        const raw = textEl ? textEl.textContent : userEl.textContent;
        return (raw || '').replace(/\s+/g, ' ').trim();
    }

}
