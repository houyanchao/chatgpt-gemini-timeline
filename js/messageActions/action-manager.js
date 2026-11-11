/** Coordinates registered actions. No file formats or image-library dependencies. */
class MessageActionManager {
    constructor(adapter, actions) {
        this.adapter = adapter; this.actions = actions; this.enabled = new Map();
        this.entries = new Map(); this.session = null; this.revision = 0; this.stopped = false;
        this.events = new AbortController();
    }
    async init() {
        document.addEventListener('click', event => {
            const button = event.target.closest('[data-ait-message-action]');
            if (!button || !this.entries.has(button) || button.disabled) return;
            event.preventDefault(); event.stopPropagation();
            const entry = this.entries.get(button);
            void this.open(entry.action, entry.key);
        }, { signal: this.events.signal });
        window.addEventListener('url:change', () => { this.close(); this.removeEntries(); this.scan(); }, { signal: this.events.signal });
        // Back/forward can return to the same URL before the shared SPA monitor polls.
        window.addEventListener('popstate', () => { this.close(); this.removeEntries(); this.scan(); }, { signal: this.events.signal });
        this.unsubscribe = window.DOMObserverManager?.getInstance().subscribeBody('message-actions', {
            callback: () => this.scan(), filter: { hasAddedNodes: true }, throttle: 200, debounce: 200
        });
        this.unsubscribeConversation = this.adapter.subscribeConversationChanges?.(() => this.scan());
        this.unwatch = window.AIStateMonitor?.getInstance().watch(this.adapter.getTimelineAdapter(), generating => {
            // A new generation may edit an earlier question or replace a reply before the branch snapshot arrives.
            if (generating && this.session) this.invalidate(this.session);
            else this.scan();
        });
        await this.refresh();
    }
    async refresh() {
        const revision = ++this.revision;
        const settings = await chrome.storage.local.get([...this.actions.values()].map(action => action.settingsKey).filter(Boolean));
        if (this.stopped || revision !== this.revision) return;
        this.enabled.clear();
        for (const action of this.actions.values()) {
            if (action.supports(this.adapter.platformId) && (!action.settingsKey || settings[action.settingsKey]?.[this.adapter.platformId] !== false)) this.enabled.set(action.id, action);
        }
        if (this.session && !this.enabled.has(this.session.action.id)) this.close();
        this.scan();
    }
    makeEntry(action, key, header = false) {
        const headerButton = header ? action.createHeaderButton?.({ adapter: this.adapter }) : null;
        const button = headerButton || document.createElement('button'); button.type = 'button';
        if (!headerButton) {
            button.className = `ait-message-action-entry${header && action.headerClassName ? ` ${action.headerClassName}` : ''}`;
            button.innerHTML = action.icon;
            if (header) button.title = action.label();
        }
        button.setAttribute('data-ait-owned-ui', '');
        button.setAttribute('data-ait-message-action', action.id);
        button.setAttribute('aria-label', action.label());
        const events = new AbortController();
        if (!header) {
            button.addEventListener('mouseenter', () => {
                if (this.stopped || this.session || button.disabled) return;
                this.tooltipEntry = button;
                window.globalTooltipManager?.show(`message-action-${action.id}-${key}`, 'button', button, action.label(), {
                    placement: 'bottom', theme: 'inverse', noArrow: true
                });
            }, { signal: events.signal });
            button.addEventListener('mouseleave', () => this.hideEntryTooltip(button), { signal: events.signal });
            button.addEventListener('mousedown', () => this.hideEntryTooltip(button), { signal: events.signal });
        }
        this.entries.set(button, { action, key, events });
        return button;
    }
    hideEntryTooltip(button = this.tooltipEntry) {
        if (!button || this.tooltipEntry !== button) return;
        this.tooltipEntry = null;
        window.globalTooltipManager?.hide(true);
    }
    removeEntry(button) {
        this.hideEntryTooltip(button);
        this.entries.get(button)?.events?.abort();
        button.remove();
        this.entries.delete(button);
    }
    scan() {
        if (this.stopped) return;
        if (this.session && this.session.url !== location.href) { this.close(); return; }
        const records = this.adapter.getMessages();
        if (this.session && this.conversationChanged(this.session, records)) { this.invalidate(this.session); return; }
        const currentKeys = new Set(records.map(message => message.key));
        for (const [button, entry] of this.entries) {
            if (!button.isConnected || !this.enabled.has(entry.action.id) || (entry.key && !currentKeys.has(entry.key))) {
                this.removeEntry(button);
            } else button.disabled = !!this.session;
        }
        if (!this.adapter.isConversationPage()) { this.removeEntries(); this.close(); return; }
        for (const message of records.filter(record => record.role === 'assistant')) {
            const toolbar = this.adapter.getToolbar(message);
            if (!toolbar) continue;
            const buttons = [];
            for (const action of this.enabled.values()) {
                let button = [...toolbar.querySelectorAll('[data-ait-message-action]')].find(element =>
                    this.entries.get(element)?.action.id === action.id && this.entries.get(element)?.key === message.key);
                if (!button) button = this.makeEntry(action, message.key);
                button.disabled = !!this.session || message.generating;
                buttons.push(button);
            }
            const mount = this.adapter.getToolbarMount?.(toolbar) || { container: toolbar, before: null };
            let before = mount.before;
            // Align backwards so rescanning an already-correct row makes no DOM changes.
            for (const button of buttons.reverse()) {
                if (button.parentElement !== mount.container || button.nextElementSibling !== before) {
                    mount.container.insertBefore(button, before);
                }
                before = button;
            }
        }
        for (const action of this.enabled.values()) {
            if (!action.mountHeader || [...this.entries.values()].some(entry => entry.action.id === action.id && !entry.key)) continue;
            const button = this.makeEntry(action, null, true);
            if (!action.mountHeader(button, { adapter: this.adapter })) this.removeEntry(button);
        }
        if (this.session) {
            const store = this.session.store;
            for (const previous of [...store.messages.values()]) {
                if (currentKeys.has(previous.key)) continue;
                const replacement = records.find(record => (record.slot ?? record.turnId) === (previous.slot ?? previous.turnId)
                    && record.role === previous.role);
                if (replacement) { store.remove(previous.key); this.session.collector?.remove?.(previous.key); }
            }
            store.merge(records);
            this.session.ui?.update(this.session);
        }
    }
    conversationChanged(session, records) {
        const next = this.adapter.getConversationState?.();
        if (next) {
            const turnIds = new Set(next.turnIds);
            const previousIds = session.conversation?.turnIds
                || [...session.store.messages.values()].filter(message => message.role === 'user').map(message => message.id);
            if (previousIds.some(id => !turnIds.has(id))) return true;
            session.conversation = next;
        }
        // Replacing a selected reply can also invalidate every later turn on that branch.
        const currentKeys = new Set(records.map(record => record.key));
        const turns = new Set(records.map(record => `${record.role}:${record.slot ?? record.turnId}`));
        return session.store.selection.some(previous => !currentKeys.has(previous.key)
            && turns.has(`${previous.role}:${previous.slot ?? previous.turnId}`));
    }
    invalidate(session) {
        this.showError(new Error('Changed'), session.action);
        this.close();
    }
    async open(action, initialKey) {
        if (this.session || this.stopped) return;
        this.hideEntryTooltip();
        const session = { action, store: new MessageSelectionStore(), controller: new AbortController(), url: location.href, loading: false, busy: false,
            conversation: this.adapter.getConversationState?.(),
            trigger: [...this.entries].find(([, entry]) => entry.action === action && entry.key === initialKey)?.[0] };
        this.session = session; this.scan();
        session.store.merge(this.adapter.getMessages());
        if (initialKey) session.store.setSelected(initialKey, true);
        try {
            await window.AITContentLoader.load('message-actions-ui');
            if (!this.current(session)) return;
            const options = await action.createOptions({ adapter: this.adapter });
            if (!this.current(session)) { options.destroy?.(); return; }
            session.options = options;
            session.ui = new MessageSelectionUI({ adapter: this.adapter, action, options,
                onSelect: (key, checked) => {
                    session.store.setSelected(key, checked);
                    if (checked) this.captureSelection(session, key);
                    session.ui.update(session);
                },
                onAll: checked => { if (checked) void this.selectAll(session); else { this.stopLoading(session); session.store.clear(); session.notice = ''; session.ui.update(session); } },
                onStop: () => this.stopLoading(session), onCancel: () => this.close(),
                onConfirm: () => { void this.execute(session); }, onCopy: () => { void this.execute(session, 'copy'); }
            });
            if (initialKey) this.captureSelection(session, initialKey);
            session.ui.update(session);
        } catch (error) {
            if (this.current(session)) { this.showError(error, action); this.close(); }
        }
    }
    current(session) { return !this.stopped && this.session === session && session.url === location.href && !session.controller.signal.aborted; }
    async collector(session) {
        if (!session.collectorTask) session.collectorTask = Promise.resolve(session.action.createCollector?.({ adapter: this.adapter, signal: session.controller.signal }))
            .then(collector => { if (!this.current(session)) { collector?.destroy?.(); return null; } return (session.collector = collector); })
            .catch(error => { session.collectorTask = null; throw error; });
        return await session.collectorTask;
    }
    captureSelection(session, key) {
        if (!this.adapter.virtualHistory) return;
        void this.collector(session).then(collector => {
            if (!this.current(session) || !session.store.selected.has(key)) return;
            return collector?.capture(session.store.messages.get(key));
        }).catch(() => {}); // Confirm can retry if a virtual row detached before capture.
    }
    async selectAll(session) {
        if (!this.current(session) || session.busy) return;
        session.store.selectAll();
        if (session.loading) { session.ui.update(session); return; }
        const operation = new AbortController(); session.load = operation; session.loading = true; session.notice = '';
        const abort = () => operation.abort(); session.controller.signal.addEventListener('abort', abort, { once: true });
        session.ui.update(session);
        try {
            const collector = await this.collector(session);
            if (!this.current(session) || operation.signal.aborted) return;
            const result = await MessageActionLoader.load(this.adapter, {
                signal: operation.signal,
                onMessages: async (records, order) => {
                    if (!this.current(session) || operation.signal.aborted) return;
                    session.store.merge(records);
                    // Keep selected later messages visible while the loader sweeps down from the top.
                    const loadedKeys = new Set(order);
                    session.store.order = [...order, ...session.store.order.filter(key => !loadedKeys.has(key))];
                    for (const message of records) {
                        if (!this.current(session) || operation.signal.aborted) return;
                        if (session.store.selected.has(message.key)) await collector?.capture(message);
                    }
                    if (this.current(session) && !operation.signal.aborted) session.ui.update(session);
                }
            });
            if (this.current(session) && !operation.signal.aborted) {
                session.store.complete = result.complete;
                session.notice = 'Loaded';
            }
        } catch (error) {
            if (this.current(session) && !operation.signal.aborted) {
                session.notice = 'LoadIncomplete';
                if (error.message !== 'LoadIncomplete') this.showError(error, session.action);
            }
        } finally {
            session.controller.signal.removeEventListener('abort', abort);
            if (this.current(session) && session.load === operation) {
                session.store.allIntent = false; session.loading = false; session.load = null; session.ui.update(session);
            }
        }
    }
    stopLoading(session) {
        session.load?.abort(); session.load = null; session.loading = false; session.store.allIntent = false;
        session.notice = 'LoadStopped'; session.ui?.update(session);
    }
    async prepareOutput(session, options, signal) {
        const check = () => { if (signal.aborted || !this.current(session)) throw new DOMException('Cancelled', 'AbortError'); };
        const collector = await this.collector(session);
        check();
        this.scan();
        check();
        let messages = session.store.selection;
        if (!messages.length) throw new Error('Changed');
        const missing = new Set(messages.filter(message => !message.element?.isConnected && !collector?.has?.(message.key)).map(message => message.key));
        if (this.adapter.virtualHistory && missing.size) {
            await MessageActionLoader.load(this.adapter, { signal, stopWhen: () => !missing.size, onMessages: async records => {
                for (const message of records) {
                    check();
                    if (!missing.has(message.key) || message.generating) continue;
                    await collector?.capture(message);
                    if (collector?.has?.(message.key)) missing.delete(message.key);
                }
            } });
            check();
            this.scan();
            check();
            messages = session.store.selection;
        }
        for (const message of messages) {
            check();
            if (message.element?.isConnected && !message.generating) await collector?.capture(message);
            else if (!collector?.has?.(message.key)) throw new Error('Changed');
        }
        check();
        if (session.action.optionsKey) await chrome.storage.local.set({ [session.action.optionsKey]: options }).catch(() => {});
        check();
        return { messages, collector, options, adapter: this.adapter, signal };
    }
    async execute(session, destination = 'download') {
        if (!this.current(session) || session.busy || session.loading || !session.store.selection.length) return;
        const copying = destination === 'copy';
        const options = session.options.getValue();
        const type = copying ? session.action.copyType?.(options) : null;
        if (copying && (!type || !session.action.copy)) return;
        const operation = new AbortController();
        const abort = () => operation.abort();
        session.controller.signal.addEventListener('abort', abort, { once: true });
        session.busy = true; session.busyKind = destination; session.ui.update(session);
        try {
            if (copying) {
                // Invoke write before any await; data collection/rendering runs through its deferred payload.
                await AITClipboard.write(type, async () => session.action.copy(await this.prepareOutput(session, options, operation.signal)), { signal: operation.signal });
            } else {
                await session.action.execute(await this.prepareOutput(session, options, operation.signal));
            }
            if (this.current(session)) {
                window.globalToastManager?.success(TimelineI18n.getMessage(copying ? 'messageActionsCopied' : 'messageActionsDone'));
                if (!copying) this.close();
            }
        } catch (error) {
            if (this.current(session)) this.showError(error, session.action, copying);
        } finally {
            operation.abort();
            session.controller.signal.removeEventListener('abort', abort);
            if (this.current(session)) { session.busy = false; session.busyKind = null; session.ui.update(session); }
        }
    }
    showError(error, action, copying = false) {
        const copyError = ['CopyUnsupported', 'CopyTooLong', 'CopyFailed'].includes(error.message) ? error.message : null;
        const message = (copyError && TimelineI18n.getMessage(`messageActions${copyError}`)) || action?.errorMessage?.(error)
            || TimelineI18n.getMessage(error.message === 'Changed' ? 'messageActionsChanged' : copying ? 'messageActionsCopyFailed' : 'messageActionsFailed');
        window.globalToastManager?.error(message);
        console.warn('[messageActions]', error);
    }
    close() {
        const session = this.session; this.session = null;
        if (!session) return;
        const restoreFocus = session.url === location.href && session.ui?.root?.contains(document.activeElement);
        session.controller.abort(); session.load?.abort(); session.ui?.destroy(); session.collector?.destroy?.();
        if (!this.stopped) this.scan();
        if (restoreFocus && session.trigger?.isConnected) session.trigger.focus?.({ preventScroll: true });
    }
    removeEntries() { for (const button of this.entries.keys()) this.removeEntry(button); window.AITChatHeaderActions?.removeEmptyContainer?.(); }
    destroy() { this.stopped = true; this.revision++; this.close(); this.events.abort(); this.unsubscribe?.(); this.unsubscribeConversation?.(); this.unwatch?.(); this.removeEntries(); }
}
