/**
 * Claude Adapter
 * 
 * Supports: claude.ai/chat/{conversation_id}
 * 新版使用 transcript-row 虚拟列表；旧版保留 data-test-render-count 降级。
 */

class ClaudeAdapter extends SiteAdapter {
    static STOP_SELECTOR = '[data-testid="chat-input-stop"], path[d="M128,20A108,108,0,1,0,236,128,108.12,108.12,0,0,0,128,20Zm0,192a84,84,0,1,1,84-84A84.09,84.09,0,0,1,128,212Zm40-112v56a12,12,0,0,1-12,12H100a12,12,0,0,1-12-12V100a12,12,0,0,1,12-12h56A12,12,0,0,1,168,100Z"]';

    constructor() {
        super();
        this._conversationId = null;
        this._snapshot = null;
        this._liveEntries = new Map();
        this._staleIds = new Set();
        this._confirmedScope = null;
    }

    async matches(url) {
        return matchesPlatform(url, 'claude');
    }

    getUserMessageSelector() {
        return document.querySelector('[data-testid="transcript-sizer"]')
            ? '[data-testid="transcript-row"]:has([data-testid="user-message"])'
            : '[data-test-render-count]:has([data-testid="user-message"])';
    }

    generateTurnId(element, index) {
        const message = element.matches('[data-testid="user-message"]')
            ? element : element.querySelector('[data-testid="user-message"]');
        const id = message?.id?.match(/([a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12})$/i)?.[1];
        if (id) return `claude-${id}`;
        return `claude-${index}`;
    }

    generateTurnIdFromIndex(key) { return `claude-${key}`; }

    extractIndexFromTurnId(id) {
        const value = id?.startsWith('claude-') ? id.slice(7) : null;
        return value && /^\d+$/.test(value) ? Number(value) : value;
    }

    supportsDeferredNodeNavigation() { return true; }

    areTimelineIndexesStable() {
        return !document.querySelector('[data-testid="transcript-sizer"]')
            || !!this._snapshot || [...this._liveEntries.values()].some(entry => entry.rowIndex === 0);
    }

    syncCapturedChatsData() {
        const conversationId = this.extractConversationId(location.pathname);
        if (conversationId !== this._conversationId) {
            this._conversationId = conversationId;
            this._snapshot = null;
            this._liveEntries.clear();
            this._staleIds.clear();
            this._confirmedScope = null;
        }
        let snapshot;
        const receive = event => {
            try { snapshot = JSON.parse(event.detail); } catch {}
        };
        document.addEventListener('ait-claude-timeline-result', receive, { once: true });
        document.dispatchEvent(new CustomEvent('ait-claude-timeline-pull', { detail: conversationId }));
        document.removeEventListener('ait-claude-timeline-result', receive);
        if (snapshot?.conversationId !== conversationId || !Array.isArray(snapshot.entries)
            || snapshot.revision === this._snapshot?.revision) return;

        const sameLeaf = this._snapshot?.leafId && this._snapshot.leafId === snapshot.leafId;
        const nextIds = new Set(snapshot.entries.map(entry => `claude-${entry.id}`));
        const previousIds = (this._snapshot?.entries || []).map(entry => `claude-${entry.id}`);
        // 同一叶节点的后台刷新可能早于新提问发出，不能抹掉 DOM 中刚追加的提问。
        if (!sameLeaf) previousIds.push(...this._liveEntries.keys());
        for (const id of previousIds) {
            if (!nextIds.has(id)) this._staleIds.add(id);
        }
        this._snapshot = snapshot;
        if (!sameLeaf) this._liveEntries.clear();
        for (const id of nextIds) this._liveEntries.delete(id);
        this._confirmedScope = null;
    }

    subscribeCapturedChatsDataUpdated(callback) {
        const handler = event => {
            try { callback(JSON.parse(event.detail)); } catch {}
        };
        document.addEventListener('ait-claude-timeline-updated', handler);
        return () => document.removeEventListener('ait-claude-timeline-updated', handler);
    }

    getCapturedTimelineEntries(userElements) {
        if (!document.querySelector('[data-testid="transcript-sizer"]')) return null;
        const elements = new Map(userElements.map((element, index) => [this.generateTurnId(element, index), element]));
        const scope = document.querySelector('[data-testid="transcript-list"]');
        const captured = (this._snapshot?.entries || []).map(entry => ({
            id: `claude-${entry.id}`, summary: entry.text, rowIndex: entry.rowIndex
        }));
        const capturedIds = new Set(captured.map(entry => entry.id));
        if (captured.some(entry => elements.has(entry.id))) this._confirmedScope = scope;
        for (const [id, element] of elements) {
            if (capturedIds.has(id) || this._staleIds.has(id)) continue;
            if (this._snapshot && this._confirmedScope !== scope) continue;
            const value = element.getAttribute('data-index');
            const rowIndex = value === null ? NaN : Number(value);
            if (!Number.isFinite(rowIndex)) continue;
            // 快照之后的新提问才可追加；切换分支时不能混入旧 DOM。
            if (this._snapshot && rowIndex < this._snapshot.messageCount) continue;
            this._liveEntries.set(id, { id, summary: this.extractText(element), rowIndex });
        }
        return [...captured, ...this._liveEntries.values()]
            .sort((a, b) => a.rowIndex - b.rowIndex)
            .map(entry => ({ ...entry, element: elements.get(entry.id) || null }));
    }

    extractText(element) {
        const message = element.querySelector('[data-testid="user-message"]') || element;
        const paragraphs = Array.from(message.querySelectorAll('p'));
        const text = (message.innerText || (paragraphs.length
            ? paragraphs.map(p => p.textContent).join('\n') : message.textContent || '')).trim();
        return text || '[图片或文件]';
    }
    
    /**
     * 获取时间标签的渲染目标元素
     * Claude: 使用 p 标签
     */
    getTimeLabelTarget(element) {
        const pElement = element.querySelector('p');
        return pElement || element;
    }

    getTimeLabelPosition() {
        return { top: '-26px', right: '-4px' };
    }

    isConversationRoute(pathname) {
        // Claude 对话 URL: /chat/{uuid} 或分享页面 /share/{uuid}
        // UUID 格式: 78721a47-289d-46ad-b497-a47ec784247c
        return /^\/(chat|share)\/[a-f0-9-]+$/i.test(pathname);
    }

    extractConversationId(pathname) {
        try {
            // 从 /chat/{uuid} 或 /share/{uuid} 提取对话 ID
            const match = pathname.match(/^\/(chat|share)\/([a-f0-9-]+)$/i);
            if (match) return match[2];
            return null;
        } catch {
            return null;
        }
    }

    findConversationContainer(firstMessage, context = {}) {
        const transcript = firstMessage?.closest('[data-testid="transcript-list"]');
        if (transcript) return transcript;
        /**
         * 查找对话容器
         * 使用 LCA（最近共同祖先）算法查找所有对话记录的最近父容器
         */
        return ContainerFinder.findConversationContainer(firstMessage, {
            messageSelector: context.messageSelector || this.getUserMessageSelector(),
            messages: context.userTurnElements
        });
    }

    getTimelineStructureAttributeFilter() { return ['data-index', 'data-perf-row']; }

    isTimelineTargetReady(element) {
        return !!element?.isConnected && element.getBoundingClientRect().height > 0;
    }

    _waitForTimelineRender(signal) {
        return new Promise(resolve => {
            const finish = () => {
                clearTimeout(timer);
                signal.removeEventListener('abort', finish);
                resolve();
            };
            const timer = setTimeout(finish, 220);
            signal.addEventListener('abort', finish, { once: true });
            if (signal.aborted) finish();
        });
    }

    async resolveTimelineTarget(marker, scrollContainer, signal, onProgress, navigation = {}) {
        const conversationId = this.extractConversationId(location.pathname);
        const deadline = Math.min(navigation.deadline ?? Infinity, Date.now() + 10000);
        let low = 0, high = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight);
        while (!signal.aborted && Date.now() < deadline
            && this.extractConversationId(location.pathname) === conversationId) {
            const elements = Array.from(document.querySelectorAll(this.getUserMessageSelector()));
            const target = elements.find((element, index) => this.generateTurnId(element, index) === marker.id);
            if (this.isTimelineTargetReady(target)) return target;
            const entries = this.getCapturedTimelineEntries(elements) || [];
            const entry = entries.find(item => item.id === marker.id);
            if (!entry) return null;
            const rows = Array.from(document.querySelectorAll('[data-testid="transcript-row"]'));
            const indexes = rows.map(row => Number(row.getAttribute('data-index'))).filter(Number.isFinite);
            if (!indexes.length) { await this._waitForTimelineRender(signal); continue; }
            const from = scrollContainer.scrollTop;
            if (entry.rowIndex < Math.min(...indexes)) high = Math.min(high, from);
            else if (entry.rowIndex > Math.max(...indexes)) low = Math.max(low, from);
            else {
                const row = rows.find(item => Number(item.getAttribute('data-index')) === entry.rowIndex);
                if (row) {
                    window.__aitPreventAutoScroll?.notifyUserNavigation?.({ durationMs: 1000 });
                    scrollContainer.scrollTop += row.getBoundingClientRect().top - scrollContainer.getBoundingClientRect().top - 80;
                    await this._waitForTimelineRender(signal);
                    continue;
                }
            }
            onProgress?.({ targetIndex: entries.indexOf(entry), total: entries.length });
            window.__aitPreventAutoScroll?.notifyUserNavigation?.({ durationMs: 1000 });
            scrollContainer.scrollTop = (low + high) / 2;
            await this._waitForTimelineRender(signal);
        }
        return null;
    }

    getTimelinePosition() {
        const shortViewport = window.innerHeight < 500;
        // Claude 位置配置
        return {
            top: shortViewport ? '56px' : '120px', // 避开顶部导航栏
            right: '22px',      // 右侧边距
            bottom: shortViewport ? '100px' : '120px', // 为底部入口预留空间
            minHeight: 0,
        };
    }
    
    getStarChatButtonTarget() {
        if (!this.isConversationRoute(location.pathname)) return null;
        // 新版放在顶部 Share 操作组左侧，避免插入按钮内部的禁用状态包装层。
        return document.querySelector('[data-testid="chat-header"] [data-testid="wiggle-controls-actions"]')
            || document.querySelector('[data-testid="chat-actions"]');
    }
    
    getDefaultChatTheme() {
        // Claude 使用页面标题作为默认主题，并过滤尾部的 " - Claude"
        const title = document.title || '';
        return title.replace(/\s*[-–]\s*Claude\s*$/i, '').trim();
    }
    
    /**
     * 检测是否应该隐藏时间轴
     * @returns {boolean}
     */
    shouldHideTimeline() {
        return false; // 默认不隐藏
    }
    
    /**
     * 检测 AI 是否正在生成回答
     * 新版使用 chat-input-stop；旧版回退到停止图标。
     * @returns {boolean}
     */
    isAIGenerating() {
        return !!document.querySelector(ClaudeAdapter.STOP_SELECTOR);
    }

    // 停止按钮出现或消失时立即检查，避免正文持续输出让通用防抖一直延后。
    observeAIGeneration(onChange) {
        const hasStopControl = node => node.nodeType === 1
            && (node.matches(ClaudeAdapter.STOP_SELECTOR) || node.querySelector(ClaudeAdapter.STOP_SELECTOR));
        let stopped = false;
        const observer = new MutationObserver(mutations => {
            if (stopped) return;
            const relevant = mutations.some(mutation => {
                if (mutation.type === 'childList') {
                    return [...mutation.addedNodes, ...mutation.removedNodes].some(hasStopControl);
                }
                if (mutation.attributeName === 'data-testid') {
                    return mutation.target.getAttribute('data-testid') === 'chat-input-stop'
                        || mutation.oldValue === 'chat-input-stop';
                }
                return mutation.attributeName === 'd' && !!mutation.target.closest('button');
            });
            if (relevant) onChange();
        });
        observer.observe(document.body, {
            childList: true, subtree: true, attributes: true,
            attributeFilter: ['data-testid', 'd'], attributeOldValue: true
        });
        return () => {
            stopped = true;
            observer.disconnect();
        };
    }
}
