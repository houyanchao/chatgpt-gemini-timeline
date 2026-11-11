/** ChatGPT content extraction; message discovery and history loading live in messageActions. */
class CEChatGPTExportAdapter extends CEExportAdapter {
    constructor() { super('chatgpt'); }

    _getMessageId(element) { return new ChatGPTMessageActionsAdapter().getId(element); }
    _getMessageRole(element) { return new ChatGPTMessageActionsAdapter().getRole(element); }

    _getRenderedMessages() {
        return new ChatGPTMessageActionsAdapter().getMessages().map(message => message.element);
    }

    /** Legacy callers share the same ordered DOM traversal as message actions. */
    async collectAllTurns({ onProgress, shouldCancel } = {}) {
        const adapter = new ChatGPTMessageActionsAdapter();
        const times = await this._loadAskTimes();
        const messages = new Map();
        const order = [];
        try {
            const result = await MessageActionLoader.load(adapter, {
                shouldCancel,
                onMessages: records => {
                    for (const record of records) {
                        const content = record.role === 'user' ? this._extractUser(record.element) : this._extractAssistant(record.element);
                        if (record.role === 'user' && times) content.time = times[`chatgpt-${record.id}`] || null;
                        messages.set(record.id, { id: record.id, role: record.role, content });
                    }
                    onProgress?.([...messages.values()].filter(message => message.role === 'user').length);
                }
            });
            order.push(...result.order.map(key => result.messages.get(key).id));
        } catch (error) {
            if (error.name === 'AbortError') return [];
            throw error;
        }
        return this._pairCapturedMessages(messages, order, []).map((turn, index) => ({ ...turn, order: index + 1 }));
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

    /** 兜底：与时间轴 getStarChatButtonTarget 相同的分享按钮锚点 */
    _fallbackButtonInsertTarget() {
        return window.AITChatHeaderActions?.getInsertTarget?.()
            || document.querySelector('[data-testid="share-chat-button"]');
    }

    /**
     * 对话轮单元 = { userEl, assistantEl } 配对。
     * ChatGPT 用户与助手是各自独立的 <article data-turn>，按文档顺序用基类
     * _pairFlatTurns 配对（以用户轮为锚，配其后的第一个助手轮）。
     * @returns {Array<{userEl:Element, assistantEl:Element|null}>}
     */
    getTurnContainers() {
        return this._pairFlatTurns(this._getRenderedMessages(), el => this._getMessageRole(el));
    }

    /**
     * @param {{userEl:Element, assistantEl:Element|null}} pair
     */
    extractTurn(pair) {
        if (!pair || !pair.userEl) return null;

        const userTurnId = this._getMessageId(pair.userEl);
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
        return this._domMarkdownFrom(assistantEl, ['[data-markdown-text-style="assistant-message"]', '.markdown', '[data-message-author-role="assistant"]']);
    }

    _domUserText(userEl) {
        if (!userEl) return '';
        const textEl = userEl.querySelector('[data-user-message-bubble]')
            || userEl.querySelector('.whitespace-pre-wrap');
        const raw = textEl ? textEl.textContent : userEl.textContent;
        return (raw || '').replace(/\s+/g, ' ').trim();
    }

}
