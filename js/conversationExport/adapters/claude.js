/**
 * Claude 导出：新版 transcript 虚拟列表必须边滚动边保存消息快照，
 * 再按 data-index 配对；不能在滚动结束后只读取剩余的 DOM。
 * 旧版非虚拟列表沿用基类加载流程。
 */
class CEClaudeExportAdapter extends CEExportAdapter {
    constructor() {
        super('claude');
    }

    getUserMessageSelector() {
        return '[data-testid="user-message"]';
    }

    getAssistantMessageSelector() {
        return '[data-testid="assistant-message"], .font-claude-response';
    }

    isExportablePage() {
        return /^\/(chat|share)\/[a-f0-9-]+\/?$/i.test(location.pathname)
            && super.isExportablePage();
    }

    _fallbackButtonInsertTarget() {
        return this._resolveTimelineAdapter()?.getStarChatButtonTarget?.()
            || document.querySelector('[data-testid="chat-actions"]');
    }

    _fallbackScrollContainer() {
        let element = document.querySelector('[data-testid="transcript-list"]')
            || document.querySelector(this.getUserMessageSelector());
        while (element) {
            if (/^(auto|scroll)$/.test(getComputedStyle(element).overflowY)) return element;
            element = element.parentElement;
        }
        return null;
    }

    getConversationTitle() {
        return super.getConversationTitle().replace(/\s*[-–]\s*Claude\s*$/i, '').trim()
            || CE_TEXT.defaultTitle;
    }

    _messageId(element) {
        return element?.getAttribute('data-turn-key')
            || element?.closest('[data-turn-key]')?.getAttribute('data-turn-key')
            || element?.id?.match(/([a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12})$/i)?.[1]
            || null;
    }

    _messages(root = document) {
        const selector = `${this.getUserMessageSelector()}, ${this.getAssistantMessageSelector()}`;
        // 兼容旧版正文 class，同时避免 assistant-message 内部的相同 class 重复入列。
        return Array.from(root.querySelectorAll(selector)).filter(element =>
            !element.parentElement?.closest(selector));
    }

    _extractUser(element) {
        const content = this.domToMarkdown.convert(element);
        return { text: content.text, images: this._collectImagesFrom(
            element.closest('[data-cds="UserMessage"], [data-test-render-count]') || element, 'user'
        ), time: this._getAskTime(element)
            || this._getAskTime(element.closest('[data-test-render-count]')) };
    }

    _extractAssistant(element) {
        if (!element) return { markdown: '', text: '', images: [] };
        const root = element.cloneNode(true);
        // 克隆不保留 currentSrc、自然尺寸；先同步实际选中的图片地址与尺寸，
        // 防止 srcset 图片变成占位图、已加载的小头像被当成对话图片。
        const originals = element.querySelectorAll('img');
        root.querySelectorAll('img').forEach((image, index) => {
            const original = originals[index];
            const src = original.currentSrc || original.src;
            if (src) image.setAttribute('src', src);
            image.removeAttribute('srcset');
            const width = original.naturalWidth || original.width;
            const height = original.naturalHeight || original.height;
            if (width) image.setAttribute('width', width);
            if (height) image.setAttribute('height', height);
        });
        root.querySelectorAll('[data-testid="message-actions"], [data-testid="growth-inline-line"], [data-find-omitted], [role="toolbar"]')
            .forEach(node => node.remove());
        // 保留所有正文块（包括工具执行前后的多段回复），排除操作栏和辅助标题。
        // 与 Gemini 一样补收可点击图片：Markdown 转换会跳过 button 子树。
        return this._extractAssistantFrom(root);
    }

    getTurnContainers() {
        return this._pairFlatTurns(this._messages(), element =>
            element.matches(this.getUserMessageSelector()) ? 'user' : 'assistant');
    }

    extractTurn(pair) {
        if (!pair?.userEl) return null;
        const id = this._messageId(pair.userEl);
        return {
            id: id ? `claude-${id}` : null,
            user: this._extractUser(pair.userEl),
            assistant: this._extractAssistant(pair.assistantEl),
        };
    }

    async _loadAskTimes() {
        try {
            if (typeof ChatTimeStorageManager === 'undefined') return {};
            const key = location.href.replace(/^https?:\/\//, '').split(/[?#]/)[0];
            return (await ChatTimeStorageManager.getByConversation(key))?.nodes || {};
        } catch { return {}; }
    }

    _snapshotRows(captured, askTimes) {
        document.querySelectorAll('[data-testid="transcript-row"]').forEach(row => {
            const value = row.getAttribute('data-index');
            const index = value === null ? NaN : Number(value);
            if (!Number.isInteger(index) || index < 0) return;
            const elements = this._messages(row);
            if (!elements.length) return;
            const element = elements[0];
            const role = element.matches(this.getUserMessageSelector()) ? 'user' : 'assistant';
            const id = this._messageId(element);
            const content = role === 'user' ? this._extractUser(element) : this._extractAssistant(element);
            if (role === 'user') content.time = askTimes[`claude-${id}`] || null;
            captured.set(index, { index, id, role, content });
        });
    }

    _buildTurns(captured) {
        const turns = [];
        let current = null;
        let previousIndex = -1;
        for (const message of [...captured.values()].sort((a, b) => a.index - b.index)) {
            if (message.role === 'user') {
                current = {
                    id: message.id ? `claude-${message.id}` : `claude-row-${message.index}`,
                    order: turns.length + 1,
                    user: message.content,
                    assistant: { markdown: '', text: '', images: [] },
                };
                turns.push(current);
            } else if (current && message.index === previousIndex + 1) {
                const assistant = current.assistant;
                for (const key of ['markdown', 'text']) {
                    assistant[key] = [assistant[key], message.content[key]].filter(Boolean).join('\n\n');
                }
                const seen = new Set(assistant.images.map(image => image.src));
                for (const image of message.content.images) {
                    if (!seen.has(image.src)) { assistant.images.push(image); seen.add(image.src); }
                }
            } else {
                // 加载中断时，不把缺失区间之后的回复错误配给前一条提问。
                current = null;
            }
            previousIndex = message.index;
        }
        return turns;
    }

    /** 找到仍有未采集消息的占位区；用它的实时位置补齐滚动重排造成的缺口。 */
    _missingSpacer(captured) {
        for (const spacer of document.querySelectorAll('[data-testid="transcript-spacer"]')) {
            if (spacer.getBoundingClientRect().height <= 1) continue;
            let before = spacer.previousElementSibling;
            let after = spacer.nextElementSibling;
            while (before && !before.hasAttribute('data-index')) before = before.previousElementSibling;
            while (after && !after.hasAttribute('data-index')) after = after.nextElementSibling;
            const start = before ? Number(before.getAttribute('data-index')) + 1 : 0;
            // 尾部占位可在没有已挂载后继行时存在。
            const total = Number(document.querySelector('[data-testid="transcript-row"] [aria-setsize]')
                ?.getAttribute('aria-setsize'));
            const end = after ? Number(after.getAttribute('data-index')) : total;
            for (let index = start; index < end; index++) {
                if (!captured.has(index)) return { spacer, fraction: (index - start) / (end - start) };
            }
        }
        return null;
    }

    async collectAllTurns({ onProgress, shouldCancel } = {}) {
        if (!document.querySelector('[data-testid="transcript-sizer"]')) {
            return super.collectAllTurns({ onProgress, shouldCancel });
        }
        const scroller = this.getScrollContainer();
        const isWindow = scroller === window;
        const getTop = () => isWindow ? window.scrollY : scroller.scrollTop;
        const setTop = top => {
            window.__aitPreventAutoScroll?.notifyUserNavigation?.({ durationMs: 1000 });
            if (isWindow) window.scrollTo(0, top);
            else scroller.scrollTop = top;
        };
        const initialTop = getTop();
        const url = location.href;
        const cancelled = () => shouldCancel?.() || location.href !== url;
        const captured = new Map();
        const askTimes = await this._loadAskTimes();
        let stableBottom = 0;
        let stalled = 0;
        try {
            if (cancelled()) return [];
            this._snapshotRows(captured, askTimes);
            setTop(0);
            for (let round = 0; round < 800 && !cancelled(); round++) {
                await this._wait(250);
                if (cancelled()) break;
                const previousSize = captured.size;
                this._snapshotRows(captured, askTimes);
                onProgress?.([...captured.values()].filter(message => message.role === 'user').length);
                if (cancelled()) break;
                const viewport = isWindow ? window.innerHeight : scroller.clientHeight;
                const height = isWindow ? document.documentElement.scrollHeight : scroller.scrollHeight;
                const top = getTop();
                const atBottom = top >= height - viewport - 2;
                const missing = this._missingSpacer(captured);
                if (atBottom && !missing) {
                    if (++stableBottom >= 2) break;
                    continue;
                }
                stableBottom = 0;
                // 正常逐屏扫描；到尾部后用占位区补齐，避免按像素前进漏过高度重排的消息。
                let target = top + Math.max(1, viewport * 0.75);
                if (atBottom && missing) {
                    const rect = missing.spacer.getBoundingClientRect();
                    const origin = isWindow ? 0 : scroller.getBoundingClientRect().top;
                    target = top + rect.top - origin + rect.height * missing.fraction
                        + Math.min(rect.height / 2, viewport / 2);
                }
                setTop(target);
                stalled = captured.size === previousSize && Math.abs(getTop() - top) < 2 ? stalled + 1 : 0;
                if (stalled >= 8) break;
            }
            return this._buildTurns(captured);
        } finally {
            // 路由已切换时不要滚动新会话；取消或异常仍恢复原会话的位置。
            if (location.href === url) setTop(initialTop);
        }
    }
}
