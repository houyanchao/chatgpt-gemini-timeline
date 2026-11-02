/**
 * ChatGPT Adapter
 * 
 * Supports: 
 *   - chatgpt.com/c/xxx (普通对话)
 *   - chatgpt.com/g/xxx/c/xxx (GPT 对话)
 *   - chatgpt.com/share/xxx 或 chatgpt.com/share/e/xxx (分享页面)
 *   - chat.openai.com (旧域名)
 */

class ChatGPTAdapter extends SiteAdapter {
    constructor() {
        super();
        // 内存文本缓存：nodeId → 提问文本（仅当前对话有效，切换对话 URL 时清空）
        // 新版虚拟化会把视口外轮次的 React 子树整体卸载（DOM/fiber 均无文本），
        // 只能在轮次渲染出来时缓存，空壳期回退缓存值
        this._turnTextCache = new Map();
        this._capturedTextIds = new Set(); // 上一份 API 完整快照包含的消息 ID
        this._textCacheConvId = null; // 缓存所属的对话 id
        this._turnRolesDirty = true;
        this._usesVirtualizedTurnSelector = false;
        this._capturedTimeline = null;
        this._capturedTimelineConvId = null;
        this._historyLoading = null;
        this._liveTimelineEntries = new Map();
        this._supplementalTimelineOrder = { before: [], after: [] };
        this._liveTimelineRevision = null;
        this._liveTimelineScopes = new WeakSet();
        this._timelineEntryRevisions = new Map();
    }



    /**
     * 从 MAIN world 接口拦截模块（apiCapture/chatgpt.js）同步拉取
     * 当前对话的全量提问文本，同步进当前对话的内存缓存。
     *
     * 数据来源：模块在 document_start 补丁 fetch，捕获页面自己发起的
     * GET /backend-api/conversation/{id} 响应 mapping —— 这是唯一能让
     * 「从未渲染过的虚拟化轮次」在首次渲染时就有文案的数据源
     * （DOM/fiber 里物理不存在，调试探测已证实）。
     *
     * 同步事件往返，模块未就绪/未捕获到数据时静默返回，走既有降级链
     * （渲染期缓存 → 占位符）。切换对话时先拉取一次；如果接口稍后才完成，
     * 拦截模块会派发更新事件，由时间轴再次拉取，不做轮询。
     *
     * @returns {number} 本次发生变化的缓存条目数
     */
    _pullConvTexts(conversationId, { restartHistory = false } = {}) {
        let received = null;
        const handler = (event) => {
            if (typeof event.detail !== 'string') return;
            try {
                const payload = JSON.parse(event.detail);
                if (payload?.conversationId === conversationId) received = payload;
            } catch {
                received = null;
            }
        };
        document.addEventListener('ait-gpt-user-texts-result', handler, { once: true });
        document.dispatchEvent(new CustomEvent('ait-gpt-user-texts-pull', {
            detail: restartHistory ? JSON.stringify({ conversationId, restartHistory: true }) : conversationId
        }));
        document.removeEventListener('ait-gpt-user-texts-result', handler);

        const texts = received ? received.texts : null;
        const previousTimeline = JSON.stringify(this._capturedTimeline);
        this._capturedTimeline = received?.timeline || null;
        this._capturedTimelineConvId = conversationId;
        this._historyLoading = { conversationId, loading: received?.historyLoading === true };
        const timelineChanged = JSON.stringify(this._capturedTimeline) !== previousTimeline;
        if (!texts) return timelineChanged ? 1 : 0;

        const nextCapturedTextIds = new Set(Object.keys(texts));
        let changedCount = timelineChanged ? 1 : 0;
        // 只清理上一份 API 快照拥有、但最新快照已不存在的键。
        // DOM 机会性缓存的新增消息不在 _capturedTextIds 中，因此会被保留。
        this._capturedTextIds.forEach(id => {
            if (!nextCapturedTextIds.has(id) && this._turnTextCache.delete(id)) {
                changedCount++;
            }
        });
        Object.entries(texts).forEach(([id, txt]) => {
            const previous = this._turnTextCache.get(id);
            this._cacheTurnText(id, txt);
            if (this._turnTextCache.get(id) !== previous) changedCount++;
        });
        this._capturedTextIds = nextCapturedTextIds;
        return changedCount;
    }

    // 只在已有顺序的边界或相邻锚点间插入新节点；没有重叠的历史窗口先等待 API。
    _mergeSupplementalTimelineOrder(current, observed) {
        const incoming = [...new Set(observed)];
        const ranks = new Map(current.map((id, index) => [id, index]));
        const anchors = incoming.filter(id => ranks.has(id));
        if (!anchors.length) return current.length ? current : incoming;
        if (anchors.some((id, index) => index > 0 && ranks.get(id) <= ranks.get(anchors[index - 1]))) return current;
        const result = [...current];
        let previousRank = -1, pending = [];
        for (const id of incoming) {
            if (!ranks.has(id)) { pending.push(id); continue; }
            const rank = ranks.get(id);
            if (rank === previousRank + 1) result.splice(result.indexOf(id), 0, ...pending);
            pending = [];
            previousRank = rank;
        }
        if (previousRank === current.length - 1) result.push(...pending);
        return result;
    }

    supportsDeferredNodeNavigation() {
        return true;
    }

    areTimelineIndexesStable() {
        return this._capturedTimelineConvId !== this.extractConversationId(location.pathname)
            || !this._capturedTimeline || this._capturedTimeline.complete === true;
    }

    getCapturedTimelineEntries(userElements) {
        const conversationId = this.extractConversationId(location.pathname);
        if (this._capturedTimelineConvId !== conversationId
            || !this._capturedTimeline?.entries?.length) {
            this._liveTimelineEntries.clear();
            this._supplementalTimelineOrder = { before: [], after: [] };
            this._liveTimelineRevision = null;
            this._liveTimelineScopes = new WeakSet();
            return null;
        }
        const revision = `${this._capturedTimelineConvId}:${this._capturedTimeline.revision || ''}`;
        if (this._liveTimelineRevision !== revision) {
            this._liveTimelineRevision = revision;
            this._liveTimelineEntries.clear();
            this._supplementalTimelineOrder = { before: [], after: [] };
            this._liveTimelineScopes = new WeakSet();
        }
        const scopeFor = element => element.closest('[data-thread-find-target="conversation"]')
            || element.closest('main') || element.parentElement;
        const confirmScope = element => {
            const scope = scopeFor(element);
            if (scope) this._liveTimelineScopes.add(scope);
        };
        const elementsById = new Map();
        for (const element of userElements) {
            const ids = [this._extractNodeIdFromDom(element),
                ...(element.getAttribute('data-chatgpt-search-message-ids') || '').split(/\s+/)];
            element.querySelectorAll('[data-message-id]').forEach(child => ids.push(child.getAttribute('data-message-id')));
            ids.filter(Boolean).forEach(id => elementsById.set(id, element));
        }
        const capturedIdsByElement = new Map();
        const entries = this._capturedTimeline.entries.map(entry => {
            this._timelineEntryRevisions.set(`chatgpt-${entry.id}`, revision);
            this._liveTimelineEntries.delete(`chatgpt-${entry.id}`);
            const element = elementsById.get(entry.id) || null;
            if (element) {
                capturedIdsByElement.set(element, `chatgpt-${entry.id}`);
                confirmScope(element);
            }
            const domText = element ? this.extractText(element) : '';
            return { id: `chatgpt-${entry.id}`, element,
                summary: this.isPlaceholderSummary(domText) ? entry.text : domText };
        });
        const capturedIds = new Set(entries.map(entry => entry.id));
        const complete = this._capturedTimeline.complete === true;
        // 已确认的新提问重新挂载后，也能确认其容器；虚拟化卸载不丢失归属。
        for (const [id, cached] of this._liveTimelineEntries) {
            if (complete && cached.side === 'before') continue;
            const element = elementsById.get(id.slice('chatgpt-'.length));
            if (element) confirmScope(element);
        }
        // SPA 切换时新 URL/快照可能先于旧 DOM 更新。只有当前快照确认过的
        // 对话容器才能补入新提问，且不能重新收录其他会话或旧分支的消息。
        const groups = new Map();
        for (const [index, element] of userElements.entries()) {
            const id = capturedIdsByElement.get(element) || this.generateTurnId(element, index);
            const knownRevision = this._timelineEntryRevisions.get(id);
            const scope = scopeFor(element);
            if (!scope || !this._liveTimelineScopes.has(scope) || (knownRevision && knownRevision !== revision)) continue;
            if (!groups.has(scope)) groups.set(scope, new Map());
            const group = groups.get(scope);
            if (!group.has(id)) group.set(id, { id, element });
        }
        const observed = { before: [], after: [] }, candidates = new Map();
        for (const records of groups.values()) {
            const group = [...records.values()];
            const apiPositions = [], beforePositions = [], afterPositions = [];
            group.forEach(({ id }, index) => {
                if (capturedIds.has(id)) apiPositions.push(index);
                else if (this._liveTimelineEntries.get(id)?.side === 'before') beforePositions.push(index);
                else if (this._liveTimelineEntries.get(id)?.side === 'after') afterPositions.push(index);
            });
            group.forEach(({ id, element }, index) => {
                if (capturedIds.has(id)) return;
                let side = this._liveTimelineEntries.get(id)?.side;
                if (!side && apiPositions.length) {
                    if (index < apiPositions[0]) side = 'before';
                    else if (index > apiPositions[apiPositions.length - 1]) side = 'after';
                } else if (!side && (beforePositions.length || afterPositions.length)) {
                    if (beforePositions.length && index <= beforePositions[beforePositions.length - 1]) side = 'before';
                    else if (afterPositions.length && index >= afterPositions[0]) side = 'after';
                    else if (complete) side = 'after';
                } else if (!side && complete) side = 'after';
                if (!side) return; // 部分历史缺少顺序锚点时不猜测位置。
                this._timelineEntryRevisions.set(id, revision);
                observed[side].push(id);
                candidates.set(id, { summary: this.extractText(element), side });
            });
        }
        for (const side of ['before', 'after']) {
            const current = this._supplementalTimelineOrder[side].filter(id => this._liveTimelineEntries.has(id));
            const ordered = this._mergeSupplementalTimelineOrder(current, observed[side]);
            this._supplementalTimelineOrder[side] = ordered;
            for (const id of ordered) {
                if (candidates.has(id)) this._liveTimelineEntries.set(id, candidates.get(id));
            }
        }
        const supplement = side => this._supplementalTimelineOrder[side].map(id => ({ id,
            summary: this._liveTimelineEntries.get(id).summary,
            element: elementsById.get(id.slice('chatgpt-'.length)) || null }));
        return [...(complete ? [] : supplement('before')), ...entries, ...supplement('after')];
    }

    isTimelineTargetReady(element) {
        if (!element?.isConnected || element.childElementCount === 0) return false;
        const hasUserContent = element.matches('[data-turn="user"], [data-chatgpt-search-unit-key$=":user"]')
            || element.querySelector('[data-turn="user"], [data-chatgpt-search-unit-key$=":user"]');
        if (element.matches('[data-turn-id-container], [data-turn-key]') && !hasUserContent) return false;
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.height > 0 && rect.width > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    }

    _findTimelineTarget(targetId) {
        // 同一提问可能同时有外层空壳和已渲染的内层元素，优先采用可定位的内容。
        let shell = null;
        for (const element of document.querySelectorAll(`${this.getUserMessageSelector()}, [data-turn-id-container], [data-turn-key]`)) {
            const matches = this._extractNodeIdFromDom(element) === targetId
                || element.getAttribute('data-turn-key') === targetId
                || (element.getAttribute('data-chatgpt-search-message-ids') || '').split(/\s+/).includes(targetId)
                || [...element.querySelectorAll('[data-message-id]')].some(child => child.getAttribute('data-message-id') === targetId);
            if (!matches) continue;
            if (this.isTimelineTargetReady(element)) return element;
            shell ||= element;
        }
        return shell;
    }

    // 与导出相同：先给虚拟内容启动渲染的时间，再等待 DOM 安静，设置硬超时。
    _waitForTimelineRender(signal) {
        if (signal.aborted) return Promise.resolve();
        return new Promise(resolve => {
            const startedAt = Date.now();
            let quietTimer, maxTimer, done = false;
            const finish = () => {
                if (done) return;
                done = true;
                observer.disconnect(); clearTimeout(quietTimer); clearTimeout(maxTimer);
                signal.removeEventListener('abort', finish); resolve();
            };
            const schedule = () => {
                clearTimeout(quietTimer);
                quietTimer = setTimeout(finish, Math.max(180, 580 - (Date.now() - startedAt)));
            };
            const observer = new MutationObserver(schedule);
            observer.observe(document.querySelector('[data-thread-find-target="conversation"]') || document.body, {
                childList: true, subtree: true, attributes: true,
                attributeFilter: ['data-is-intersecting', 'data-turn', 'data-turn-key']
            });
            signal.addEventListener('abort', finish, { once: true });
            maxTimer = setTimeout(finish, 2000);
            schedule();
            if (signal.aborted) finish();
        });
    }

    async resolveTimelineTarget(marker, scrollContainer, signal, onProgress, navigation = {}) {
        const conversationId = this.extractConversationId(location.pathname);
        const targetId = marker.id.slice('chatgpt-'.length);
        const initialScrollTop = scrollContainer.scrollTop;
        // 多次重挂载仍属于同一次导航，共用总超时，避免不断重新计时。
        const deadline = Math.min(Date.now() + 120000, navigation.deadline ?? Infinity);
        const checkedIds = new Set();
        let maxKnownEntries = 0, seenTargetShell = false, maxTargetChildren = 0;
        let foundTarget = null, lastSignature = '', lastProgressAt = Date.now();
        let lowerPosition = null, upperPosition = null, searchSnapshot = '';
        try {
            while (!signal.aborted && Date.now() < deadline
                && this.extractConversationId(location.pathname) === conversationId) {
                const target = this._findTimelineTarget(targetId);
                if (this.isTimelineTargetReady(target)) {
                    foundTarget = target;
                    return target;
                }
                const userElements = [...document.querySelectorAll(this.getUserMessageSelector())];
                const entries = this.getCapturedTimelineEntries(userElements) || userElements.map((element, index) => ({
                    id: this.generateTurnId(element, index), element
                }));
                const targetIndex = entries.findIndex(entry => entry.id === marker.id);
                const entryTarget = entries[targetIndex]?.element;
                if (this.isTimelineTargetReady(entryTarget)) {
                    foundTarget = entryTarget;
                    return entryTarget;
                }
                const loadedIndexes = [];
                entries.forEach((entry, index) => {
                    if (!this.isTimelineTargetReady(entry.element)) return;
                    checkedIds.add(entry.id); loadedIndexes.push(index);
                });
                onProgress?.({ checked: checkedIds.size, targetIndex, total: entries.length });
                maxKnownEntries = Math.max(maxKnownEntries, entries.length);
                seenTargetShell ||= !!target;
                maxTargetChildren = Math.max(maxTargetChildren, target?.childElementCount || 0);
                // 仅新内容或目标结构变化算进展；顶底切换、空白高度变化不能反复延长加载。
                const signature = `${checkedIds.size}:${maxKnownEntries}:${seenTargetShell}:${maxTargetChildren}`;
                if (signature !== lastSignature) {
                    lastProgressAt = Date.now(); lastSignature = signature;
                }
                // 收藏定位由外层两分钟期限控制，不能因正文暂未到达在 20 秒提前结束。
                else if (!navigation.waitForTarget && Date.now() - lastProgressAt > 20000) {
                    return null;
                }
                if (!target && (targetIndex < 0 || !loadedIndexes.length)) {
                    // 虚拟列表重排时可能暂时没有可用锚点，等待恢复，不盲目滚动。
                    await this._waitForTimelineRender(signal);
                    continue;
                }
                window.__aitPreventAutoScroll?.notifyUserNavigation?.({ durationMs: 2500 });
                const from = scrollContainer.scrollTop;
                if (target) {
                    // 已有目标空壳时直接锚定它；重排后每轮重新读取其位置。
                    scrollContainer.scrollTop += target.getBoundingClientRect().top
                        - scrollContainer.getBoundingClientRect().top - 80;
                } else {
                    const containerTop = scrollContainer.getBoundingClientRect().top;
                    // 首次向顶/底查找；两侧都越过目标后，在两次落点之间查找。
                    // 虚拟列表只挂载附近消息，反复跳顶底会始终跳过中间目标。
                    const preceding = loadedIndexes.filter(index =>
                        entries[index].element.getBoundingClientRect().top <= containerTop);
                    const currentIndex = preceding.length ? preceding[preceding.length - 1] : loadedIndexes[0];
                    const direction = targetIndex < currentIndex ? 'top' : 'bottom';
                    const maxScrollTop = Math.max(0, scrollContainer.scrollHeight
                        - (scrollContainer.clientHeight || window.innerHeight));
                    const snapshot = `${entries.length}:${targetIndex}`;
                    if (snapshot !== searchSnapshot) {
                        lowerPosition = upperPosition = null;
                        searchSnapshot = snapshot;
                    }
                    // 保存比例，避免懒加载图片或历史插入改变总高度后沿用旧像素位置。
                    const position = maxScrollTop > 0 ? Math.max(0, Math.min(1, from / maxScrollTop)) : 0;
                    if (direction === 'top') {
                        if (lowerPosition !== null && position <= lowerPosition) lowerPosition = null;
                        upperPosition = position;
                    } else {
                        if (upperPosition !== null && position >= upperPosition) upperPosition = null;
                        lowerPosition = position;
                    }
                    if (lowerPosition !== null && upperPosition !== null) {
                        scrollContainer.scrollTop = (lowerPosition + upperPosition) / 2 * maxScrollTop;
                    } else {
                        scrollContainer.scrollTop = direction === 'top' ? 0 : maxScrollTop;
                    }
                }
                await this._waitForTimelineRender(signal);
            }
            return null;
        } finally {
            // 手动取消或加载失败时回到出发位置；切换目标或离开页面时不抢位置。
            if (!foundTarget && this.extractConversationId(location.pathname) === conversationId
                && (!signal.aborted || signal.reason === 'cancel-navigation')) scrollContainer.scrollTop = initialScrollTop;
        }
    }

    isTimelineHistoryLoading() {
        return this._historyLoading?.conversationId === this.extractConversationId(location.pathname)
            && this._historyLoading.loading === true && this._capturedTimeline?.complete !== true;
    }

    isTimelineHistoryRenderPending(markers = []) {
        if (this._capturedTimelineConvId !== this.extractConversationId(location.pathname)
            || this._capturedTimeline?.complete !== true) return false;
        // 数据返回不等于节点已更新；按 ID 核对，避免旧节点数量相同却误判已完成。
        const renderedIds = new Set(markers.map(marker => marker.id));
        return this._capturedTimeline.entries?.some(entry => !renderedIds.has(`chatgpt-${entry.id}`)) === true;
    }

    subscribeCapturedChatsDataUpdated(callback) {
        if (typeof callback !== 'function') return () => {};

        const handler = (event) => {
            const conversationId = typeof event.detail === 'string' ? event.detail : '';
            const changedCount = this.handleCapturedChatsDataUpdated(conversationId);
            if (changedCount > 0) callback({ conversationId, changedCount });
        };
        const loadingHandler = event => {
            let state;
            try { state = JSON.parse(event.detail); } catch {
                return;
            }
            if (state?.conversationId !== this.extractConversationId(location.pathname)
                || typeof state.loading !== 'boolean') {
                return;
            }
            const wasLoading = this.isTimelineHistoryLoading();
            this._historyLoading = state;
            if (wasLoading !== this.isTimelineHistoryLoading()) {
                callback({ conversationId: state.conversationId, historyLoadingChanged: true });
            }
        };
        document.addEventListener('ait-gpt-user-texts-updated', handler);
        document.addEventListener('ait-gpt-history-loading', loadingHandler);
        return () => {
            document.removeEventListener('ait-gpt-user-texts-updated', handler);
            document.removeEventListener('ait-gpt-history-loading', loadingHandler);
        };
    }

    getConflictingTimelineSelectors() {
        return [
            '.chatgpt-timeline-bar',
            '*:has(> [data-toc-item-index])'
        ];
    }

    isPlaceholderSummary(text) {
        const normalized = String(text || '').trim();
        return super.isPlaceholderSummary(normalized)
            || normalized === '[未加载的提问]';
    }

    static TEXT_CACHE_MAX_TEXT_LENGTH = 200;
    static TEXT_CACHE_MAX_ENTRIES = 3000;

    async matches(url) {
        return matchesPlatform(url, 'chatgpt');
    }

    /**
     * 【2026-07 ChatGPT 虚拟化改版】给轮次容器标记角色属性 data-ait-turn
     *
     * 新版结构：每轮对话包在 [data-turn-id-container][data-is-intersecting] 容器里
     * （已渲染轮次为外层 DIV 套内层 SECTION 双层同 id 容器，内部保留旧的 [data-turn] 元素；
     * 视口外轮次被虚拟化成空壳 DIV，内部无任何内容，无法直接得知是提问还是回复）。
     *
     * 标记算法（纯 DOM，幂等，可反复执行）：
     * 1. 取所有双属性容器，按 id 去重（文档序先外后内，保留外层）；
     * 2. 倒序遍历。最后一轮被 ChatGPT 强制渲染（fiber props 的 isFinalTurn/forceRender），
     *    链条必有真实锚点：已渲染轮次用后代 [data-turn] 的真实值（并重新校准链条），
     *    空壳取后一轮角色的反值（提问/回复严格交替）；
     * 3. 第一轮必须是提问：推断为回复时不打属性（ChatGPT 开头可能有隐藏占位轮，
     *    只跳过、绝不平移链条）。
     *
     * TimelineManager 仅在轮次结构变化时调用 prepareTimelineNodes() 重跑标记，
     * 避免 AI 流式回复期间对所有容器反复执行全量扫描。结构属性延迟挂载、
     * 新消息、重渲染和虚拟化窗口移动由结构 MutationObserver 统一置脏。
     *
     * @returns {boolean} - 页面是否存在新版容器结构
     */
    /**
     * 时间轴重建 markers 前准备当前对话的文本数据。
     * 仅在切换对话时失效缓存并从网络拦截桥拉取一次全量文本，避免
     * getUserMessageSelector 在初始化预检查阶段提前消费唯一一次拉取机会。
     *
     * 前提：时间轴渲染时拦截模块已完成拦截，故每个对话拉取一次即可，不做轮询/节流。
     * 未拉到时静默降级（渲染期缓存 → 占位符）。
     */
    syncCapturedChatsData({ force = false, restartHistory = false } = {}) {
        const convId = this.extractConversationId(location.pathname);
        if (convId !== this._textCacheConvId) {
            // 切换对话：失效缓存归属
            this._textCacheConvId = convId;
            this._turnTextCache.clear();
            this._capturedTextIds.clear();
        } else if (!force && this._capturedTextIds.size > 0) {
            return; // 同一对话且已成功拉取过接口文本，直接用缓存
        }
        // 首次拉取，或上次拉取时接口尚未返回（SPA 切换时 pull 常早于响应，
        // 且「更新事件」可能落在时间轴销毁/重建的空窗被漏掉）→ 每次重建时廉价重试
        this._pullConvTexts(convId, { restartHistory });
    }

    /**
     * 接口拦截完成后的事件入口。仅处理当前 URL 对应的对话；
     * 其他对话可能是 ChatGPT 预加载的数据，只保留在 MAIN world 分桶缓存中。
     *
     * @param {string} conversationId - 已完成缓存的对话 ID
     * @returns {number} 本次发生变化的缓存条目数
     */
    handleCapturedChatsDataUpdated(conversationId) {
        const currentConvId = this.extractConversationId(location.pathname);
        if (!conversationId || conversationId !== currentConvId) return 0;

        // 更新事件可能早于 TimelineManager 初始化，此时先建立正确的缓存归属。
        if (this._textCacheConvId !== conversationId) {
            this._textCacheConvId = conversationId;
            this._turnTextCache.clear();
            this._capturedTextIds.clear();
        }

        return this._pullConvTexts(conversationId);
    }

    _markTurnRoles() {
        const all = document.querySelectorAll('[data-turn-id-container][data-is-intersecting]');
        if (!all.length) return false;

        // 按 id 去重，保留外层容器
        const seen = new Set();
        const containers = [];
        all.forEach(el => {
            const id = el.getAttribute('data-turn-id-container');
            if (!id || seen.has(id)) return;
            seen.add(id);
            containers.push(el);
        });

        // 倒序推导每个容器的角色
        const roles = new Array(containers.length).fill(null);
        let nextRole = null; // 后一个（更靠下）容器的角色
        for (let i = containers.length - 1; i >= 0; i--) {
            const real = containers[i].querySelector('[data-turn]')?.getAttribute('data-turn');
            let role = (real === 'user' || real === 'assistant') ? real : null;
            if (!role && nextRole) {
                role = (nextRole === 'user') ? 'assistant' : 'user';
            }
            roles[i] = role;
            if (role) nextRole = role;
        }

        // 第一轮推断为回复时不标记
        if (roles[0] === 'assistant') roles[0] = null;

        containers.forEach((el, i) => {
            const role = roles[i];
            // 机会性填充文本缓存：轮次只要渲染出来过，就在标记周期里把提问文本存住。
            // 不能依赖 extractText（只在 markers 重建时被调用）：滚动渲染不触发重建，
            // 等到重建时轮次可能已被虚拟化回空壳，文本就永远缓存不上了（调试日志实证）。
            if (role === 'user') {
                const id = el.getAttribute('data-turn-id-container');
                if (id && !this._turnTextCache.has(id)) {
                    const raw = el.querySelector('.whitespace-pre-wrap')?.textContent;
                    const text = (raw || '').replace(/\s+/g, ' ').trim();
                    if (text) this._cacheTurnText(id, text);
                }
            }
            if (role) {
                if (el.getAttribute('data-ait-turn') !== role) {
                    el.setAttribute('data-ait-turn', role);
                }
            } else if (el.hasAttribute('data-ait-turn')) {
                el.removeAttribute('data-ait-turn');
            }
        });
        return true;
    }

    prepareTimelineNodes(context = {}) {
        if (!context.force && !this._turnRolesDirty) return false;

        const hasVirtualizedTurns = this._markTurnRoles();
        this._usesVirtualizedTurnSelector = hasVirtualizedTurns
            && document.querySelector('[data-turn-id-container][data-ait-turn="user"]') !== null;
        this._turnRolesDirty = false;
        return true;
    }

    invalidateTimelineNodes() {
        this._turnRolesDirty = true;
    }

    getTimelineStructureSelectors() {
        return [
            '[data-turn-id-container]',
            '[data-turn]',
            '[data-turn-key]',
            '[data-chatgpt-search-unit-key]'
        ];
    }

    getTimelineStructureAttributeFilter() {
        return [
            'data-turn-id-container',
            'data-is-intersecting',
            'data-turn',
            'data-turn-key',
            'data-chatgpt-search-unit-key',
            'data-chatgpt-search-message-ids'
        ];
    }

    getUserMessageSelector() {
        // prepareTimelineNodes() 负责维护模式；getter 保持无副作用。
        if (this._usesVirtualizedTurnSelector) {
            return '[data-turn-id-container][data-ait-turn="user"]';
        }
        return '[data-turn="user"][data-turn-id], [data-thread-find-target="conversation"] [data-chatgpt-search-unit-key$=":user"][data-chatgpt-search-message-ids]';
    }

    getAssistantMessageSelector() {
        if (document.querySelector('[data-turn-id-container][data-ait-turn="assistant"]')) {
            return '[data-turn-id-container][data-ait-turn="assistant"]';
        }
        return '[data-turn="assistant"][data-turn-id], [data-thread-find-target="conversation"] [data-chatgpt-search-unit-key$=":assistant"][data-chatgpt-search-message-ids]';
    }

    /**
     * 从 DOM 元素中提取 nodeId
     * 新版结构读容器的 data-turn-id-container，旧版结构读 data-turn-id
     * （两者是同一批 turn UUID，收藏等历史数据可直接对上）
     * 
     * ✅ 降级方案：返回 null 时，generateTurnId 会降级使用 index（数字类型）
     * @param {Element} element - 用户消息元素
     * @returns {string|null} - nodeId（字符串），失败返回 null
     */
    _extractNodeIdFromDom(element) {
        if (!element) return null;
        
        const nodeId = element.getAttribute('data-turn-id-container')
            || element.getAttribute('data-turn-id')
            || element.getAttribute('data-chatgpt-search-message-ids')?.trim().split(/\s+/)[0]
            || null;
        return nodeId ? String(nodeId) : null;
    }

    /**
     * 生成节点的唯一标识 turnId
     * 优先使用 turn UUID（data-turn-id-container / data-turn-id，稳定），回退到数组索引（兼容）
     */
    generateTurnId(element, index) {
        const nodeId = this._extractNodeIdFromDom(element);
        return nodeId ? `chatgpt-${nodeId}` : `chatgpt-${index}`;
    }
    
    /**
     * 从存储的 nodeId 生成 turnId（用于收藏跳转）
     * @param {string|number} identifier - nodeId（字符串）或 index（数字）
     * @returns {string}
     */
    generateTurnIdFromIndex(identifier) {
        return `chatgpt-${identifier}`;
    }
    
    /**
     * 从 turnId 中提取 nodeId/index
     * @param {string} turnId - 格式为 chatgpt-{nodeId} 或 chatgpt-{index}
     * @returns {string|number|null} - nodeId（字符串）或 index（数字）
     */
    extractIndexFromTurnId(turnId) {
        if (!turnId) return null;
        if (turnId.startsWith('chatgpt-')) {
            const part = turnId.substring(8); // 'chatgpt-'.length = 8
            // ✅ 尝试解析为数字（降级到 index 时的数据）
            const parsed = parseInt(part, 10);
            // 如果是纯数字字符串，返回数字；否则返回字符串
            return (String(parsed) === part) ? parsed : part;
        }
        return null;
    }
    
    /**
     * 根据存储的 nodeId/index 查找 marker
     * 支持新数据（nodeId 字符串）和旧数据（index 数字）
     * @param {string|number} storedKey - 存储的 nodeId 或 index
     * @param {Array} markers - marker 数组
     * @param {Map} markerMap - markerMap
     * @returns {Object|null} - 匹配的 marker
     */
    findMarkerByStoredIndex(storedKey, markers, markerMap) {
        if (storedKey === null || storedKey === undefined) return null;
        
        // 1. 先尝试用 nodeId/index 构建 turnId 查找
        const turnId = `chatgpt-${storedKey}`;
        const marker = markerMap.get(turnId);
        if (marker) return marker;
        
        // 2. Fallback：如果是数字，尝试用数组索引（兼容旧数据）
        if (typeof storedKey === 'number' && storedKey >= 0 && storedKey < markers.length) {
            return markers[storedKey];
        }
        
        return null;
    }

    /**
     * 写入内存文本缓存（带容量控制）
     * @param {string} nodeId - turn UUID
     * @param {string} text - 提问文本
     */
    _cacheTurnText(nodeId, text) {
        // 截断长文本：tooltip 最多显示 5 行，控制内存与存储体积
        const maxLen = ChatGPTAdapter.TEXT_CACHE_MAX_TEXT_LENGTH;
        const trimmed = text.length > maxLen ? text.slice(0, maxLen) : text;
        if (this._turnTextCache.get(nodeId) === trimmed) return;
        if (!this._turnTextCache.has(nodeId)
            && this._turnTextCache.size >= ChatGPTAdapter.TEXT_CACHE_MAX_ENTRIES) {
            // 简单容量控制：删最早的一条
            const oldest = this._turnTextCache.keys().next().value;
            this._turnTextCache.delete(oldest);
        }
        this._turnTextCache.set(nodeId, trimmed);
    }

    extractText(element) {
        const nodeId = this._extractNodeIdFromDom(element);
        const textElement = element.querySelector('[data-user-message-bubble]')
            || element.querySelector('.whitespace-pre-wrap');
        const text = (textElement?.textContent || '').replace(/\s+/g, ' ').trim();
        if (text) {
            // 渲染期缓存文本，供该轮被虚拟化成空壳后使用
            if (nodeId) this._cacheTurnText(nodeId, text);
            return text;
        }
        // 虚拟化空壳：React 子树已卸载，DOM/fiber 均无文本，回退会话级缓存
        if (nodeId && this._turnTextCache.has(nodeId)) {
            return this._turnTextCache.get(nodeId);
        }
        // 区分两种"无文本"：
        // - 空壳（childElementCount=0）：轮次从未渲染过，文本在客户端物理不存在
        // - 已渲染但无文本节点：真的是纯图片/文件消息
        return element.childElementCount === 0 ? '[未加载的提问]' : '[图片或文件]';
    }

    /**
     * 获取时间标签的渲染目标元素
     * ChatGPT: 使用 [data-message-id] 子元素
     */
    getTimeLabelTarget(element) {
        return element.querySelector('[data-message-id], [data-user-message-bubble]') || null;
    }

    isConversationRoute(pathname) {
        const segs = pathname.split('/').filter(Boolean);
        
        // 检查普通对话路径: /c/{id}
        const cIndex = segs.indexOf('c');
        if (cIndex !== -1) {
            const slug = segs[cIndex + 1];
            if (typeof slug === 'string' && slug.length > 0 && /^[A-Za-z0-9_-]+$/.test(slug)) {
                return true;
            }
        }
        
        // 检查 GPT 对话路径: /g/{gpt_id}/c/{conversation_id}
        const gIndex = segs.indexOf('g');
        if (gIndex !== -1 && segs[gIndex + 2] === 'c') {
            const gptId = segs[gIndex + 1];
            const conversationId = segs[gIndex + 3];
            if (gptId && conversationId && 
                /^[A-Za-z0-9_-]+$/.test(gptId) && 
                /^[A-Za-z0-9_-]+$/.test(conversationId)) {
                return true;
            }
        }
        
        // 检查分享页面路径: /share/{id} 或 /share/e/{id}
        const shareIndex = segs.indexOf('share');
        if (shareIndex !== -1) {
            const shareId = segs[shareIndex + 1] === 'e'
                ? segs[shareIndex + 2]
                : segs[shareIndex + 1];
            if (typeof shareId === 'string' && shareId.length > 0 && /^[A-Za-z0-9_-]+$/.test(shareId)) {
                return true;
            }
        }
        
        return false;
    }

    extractConversationId(pathname) {
        try {
            const segs = pathname.split('/').filter(Boolean);
            
            // 尝试提取 GPT 对话 ID: /g/{gpt_id}/c/{conversation_id}
            const gIndex = segs.indexOf('g');
            if (gIndex !== -1 && segs[gIndex + 2] === 'c') {
                const conversationId = segs[gIndex + 3];
                if (conversationId && /^[A-Za-z0-9_-]+$/.test(conversationId)) return conversationId;
            }
            
            // 尝试提取普通对话 ID: /c/{id}
            const cIndex = segs.indexOf('c');
            if (cIndex !== -1) {
                const slug = segs[cIndex + 1];
                if (slug && /^[A-Za-z0-9_-]+$/.test(slug)) return slug;
            }
            
            // 尝试提取分享页面 ID: /share/{id} 或 /share/e/{id}
            const shareIndex = segs.indexOf('share');
            if (shareIndex !== -1) {
                const shareId = segs[shareIndex + 1] === 'e'
                    ? segs[shareIndex + 2]
                    : segs[shareIndex + 1];
                if (shareId && /^[A-Za-z0-9_-]+$/.test(shareId)) return shareId;
            }
            
            return null;
        } catch {
            return null;
        }
    }

    findConversationContainer(firstMessage, context = {}) {
        const transcript = firstMessage?.closest('[data-thread-find-target="conversation"]');
        if (transcript) return transcript;
        /**
         * 查找对话容器
         * 
         * 使用 LCA（最近共同祖先）算法查找所有对话记录的最近父容器。
         * 传递 messageSelector 参数，让 ContainerFinder 能够：
         * 1. 查询所有用户消息元素
         * 2. 找到它们的最近共同祖先
         * 3. 确保容器是直接包裹所有对话的最小容器
         * 
         * 优势：比传统的向上遍历更精确，避免找到过于外层的容器
         */
        return ContainerFinder.findConversationContainer(firstMessage, {
            messageSelector: context.messageSelector || this.getUserMessageSelector(),
            messages: context.userTurnElements
        });
    }

    getTimelinePosition() {
        // ChatGPT 默认位置
        return {
            top: '120px',      // 避开顶部导航栏
            right: '22px',    // 右侧边距
            bottom: '120px',   // 避开底部输入框
        };
    }
    
    /**
     * 获取时间标签位置配置
     * ChatGPT: 底部显示
     */
    getTimeLabelPosition() {
        // 相对于消息元素定位
        return {
            top: '-16px',
            right: '10px'
        };
    }
    
    getStarChatButtonTarget() {
        return window.AITChatHeaderActions?.getInsertTarget?.()
            || document.querySelector('[data-testid="share-chat-button"]');
    }
    
    getDefaultChatTheme() {
        // ChatGPT 使用页面标题作为默认主题
        return document.title || '';
    }
    
    /**
     * 检测是否应该隐藏时间轴
     * ChatGPT: 当页面存在 .text-token-primary 元素时隐藏
     * @returns {boolean}
     */
    shouldHideTimeline() {
        return document.querySelector('.text-token-primary') !== null ||
               document.querySelector('[data-stage-thread-flyout="true"][data-testid="stage-thread-flyout"]') !== null;
    }

    getTimelineVisibilitySelectors() {
        return [
            '.text-token-primary',
            '[data-stage-thread-flyout="true"][data-testid="stage-thread-flyout"]'
        ];
    }
    
    /**
     * 获取滚动偏移量
     * 用户消息节点本身上方留白较多，仅需小幅补偿即可避免被顶部 UI 遮挡
     * @returns {number} - 滚动偏移量（像素）
     */
    getScrollOffset() {
        return 20;
    }
    
    /**
     * 检测 AI 是否正在生成回答
     * 兼容旧版 testid；新版按主操作按钮的停止图标识别，不依赖界面语言。
     * @returns {boolean}
     */
    isAIGenerating() {
        const submitButton = document.getElementById('composer-submit-button');
        if (submitButton?.getAttribute('data-testid') === 'stop-button') return true;

        // 来自新版停止按钮的圆角方块路径。限定 Composer 主操作图标，
        // 不以按钮位置或任意方形图标推断状态，避免误认发送、语音、代码停止按钮。
        // 若站点更换图标资源，需要更新此签名；忽略 SVG 路径中的空格和逗号。
        const stopPath = 'M4.5 5.75C4.5 5.05964 5.05964 4.5 5.75 4.5H14.25C14.9404 4.5 15.5 5.05964 15.5 5.75V14.25C15.5 14.9404 14.9404 15.5 14.25 15.5H5.75C5.05964 15.5 4.5 14.9404 4.5 14.25V5.75Z';
        const normalizePath = value => (value || '').replace(/[\s,]+/g, '');
        return [...document.querySelectorAll(
            '[data-composer-body] button svg.icon-primary-action path, '
            + '[class*="ComposerLayoutFooter-"] button svg.icon-primary-action path'
        )].some(path => normalizePath(path.getAttribute('d')) === normalizePath(stopPath));
    }

    /** 覆盖图标路径原地更新、图标替换、纯移除与输入区重建。 */
    observeAIGeneration(onChange) {
        const observer = new MutationObserver(onChange);
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['d', 'class', 'data-testid'],
        });
        return () => observer.disconnect();
    }
}
