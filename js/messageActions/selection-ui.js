/** Shared message selection. Action-specific controls remain owned by each action. */
class MessageSelectionUI {
    constructor({ adapter, action, options, onSelect, onAll, onCancel, onStop, onConfirm, onCopy }) {
        this.adapter = adapter;
        this.action = action;
        this.options = options;
        this.onSelect = onSelect;
        this.onStop = onStop;
        this.compactBar = action.barLayout === 'compact';
        this.panelBar = action.barLayout === 'panel';
        this.labels = new Map();
        this.visibleEntries = [];
        this.events = new AbortController();
        this.root = document.createElement('div');
        this.root.className = 'ait-message-selection';
        this.root.setAttribute('data-ait-owned-ui', '');
        this.bar = document.createElement('section');
        this.bar.className = 'ait-message-action-bar';
        if (this.compactBar) this.bar.classList.add('ait-ma-compact');
        if (this.panelBar) this.bar.classList.add('ait-ma-panel');
        this.bar.setAttribute('aria-label', action.label());

        const heading = document.createElement('div');
        heading.className = 'ait-ma-heading';
        this.heading = heading;
        heading.hidden = this.compactBar;
        const identity = document.createElement('div');
        identity.className = 'ait-ma-identity';
        if (!this.compactBar) {
            const titleGroup = document.createElement('div');
            titleGroup.className = 'ait-ma-title-group';
            const title = document.createElement('strong');
            title.className = 'ait-ma-title';
            title.textContent = action.label();
            titleGroup.appendChild(title);
            if (action.settingsTabId) {
                const settings = this.button('', () => {
                    void window.panelModal?.show(action.settingsTabId);
                }, 'ait-ma-settings');
                settings.title = this.text('Settings');
                settings.setAttribute('aria-label', settings.title);
                settings.setAttribute('aria-haspopup', 'dialog');
                settings.appendChild(createAITSettingsIcon());
                titleGroup.appendChild(settings);
            }
            identity.appendChild(titleGroup);
        }
        this.hint = document.createElement('span');
        this.hint.className = 'ait-ma-hint';
        this.hint.hidden = true;
        this.hint.setAttribute('aria-live', 'polite');
        identity.appendChild(this.hint);
        const headingActions = document.createElement('div');
        headingActions.className = 'ait-ma-heading-actions';
        this.cancel = this.button('', onCancel, 'ait-ma-close');
        this.cancel.setAttribute('aria-label', this.text('Cancel'));
        this.cancel.title = this.text('Cancel');
        this.cancel.appendChild(MessageActionControls.icon(MessageActionControls.CLOSE));
        if (!this.compactBar) headingActions.appendChild(this.cancel);
        heading.append(identity, headingActions);

        const all = MessageActionControls.checkbox(this.text('SelectAll'));
        all.label.classList.add('ait-ma-all');
        all.label.title = this.text('SelectAllHint');
        this.all = all.input;
        this.all.setAttribute('aria-label', this.text('SelectAll'));
        this.status = document.createElement('span');
        this.status.className = 'ait-ma-count';
        this.status.setAttribute('role', 'status');
        this.status.setAttribute('aria-live', 'polite');
        const selectionTools = document.createElement('div');
        selectionTools.className = 'ait-ma-selection-tools';
        selectionTools.append(all.label, this.status);
        this.confirmLabel = action.confirmLabel?.() || action.label();
        this.confirm = this.button('', onConfirm, 'ait-ma-primary');
        this.confirm.setAttribute('aria-label', this.confirmLabel);
        this.confirmIcon = this.compactBar || action.showConfirmIcon === false ? null : MessageActionControls.icon(action.icon);
        this.spinner = document.createElement('span');
        this.spinner.className = 'ait-ma-spinner';
        this.spinner.setAttribute('aria-hidden', 'true');
        this.confirmText = document.createElement('span');
        this.confirmText.textContent = this.confirmLabel;
        if (this.confirmIcon) this.confirm.appendChild(this.confirmIcon);
        this.confirm.append(this.spinner, this.confirmText);
        this.copy = typeof action.copy === 'function' ? this.button('', onCopy, 'ait-ma-copy') : null;
        this.controls = document.createElement('div');
        this.controls.className = 'ait-ma-controls';
        let submit = this.confirm;
        if (this.compactBar || this.copy) {
            submit = document.createElement('div');
            submit.className = 'ait-ma-submit-actions';
            if (this.copy) submit.appendChild(this.copy);
            submit.appendChild(this.confirm);
            if (this.compactBar) submit.appendChild(this.cancel);
        }
        if (this.panelBar) {
            const footer = document.createElement('div');
            footer.className = 'ait-ma-action-footer';
            footer.append(selectionTools, submit);
            this.controls.append(options.element, footer);
        } else {
            this.controls.append(selectionTools, options.element, submit);
        }
        this.bar.append(heading, this.controls);
        this.root.appendChild(this.bar);
        document.body.appendChild(this.root);

        const signal = this.events.signal;
        this.all.addEventListener('change', () => onAll(this.all.checked), { signal });
        options.element.addEventListener('change', () => { if (this.session) this.update(this.session); }, { signal });
        const reposition = () => {
            if (this.frame) return;
            this.frame = requestAnimationFrame(() => { this.frame = 0; this.position(); });
        };
        window.addEventListener('scroll', reposition, { capture: true, passive: true, signal });
        window.addEventListener('resize', reposition, { signal });
        document.addEventListener('pointerover', event => {
            const hovered = this.visibleEntries.find(entry => entry.element.contains(event.target) || entry.label.contains(event.target));
            this.setHover(hovered?.key);
        }, { signal });
        this.all.focus({ preventScroll: true });
    }

    text(key) {
        const message = TimelineI18n.getMessage(`messageActions${key}`);
        if (message) return message;
        // Unpacked extensions may refresh source before Chrome refreshes its locale cache.
        const fallback = {
            Settings: ['设置', 'Settings'],
            SelectionHelp: ['勾选需要保存的消息', 'Select the messages you want to save.'],
            LoadingProgress: ['已加载 {count} 条消息', '{count} messages loaded'],
            SelectAllHint: ['全选并加载完整对话', 'Select all and load the full conversation']
        };
        return fallback[key]?.[/^zh/i.test(TimelineI18n.getUILanguage()) ? 0 : 1] || '';
    }

    button(text, callback, extra = '') {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = text;
        button.className = `ait-ma-button ${extra}`;
        button.addEventListener('click', callback, { signal: this.events.signal });
        return button;
    }

    setText(element, value) {
        if (element.textContent !== value) element.textContent = value;
    }

    update(session) {
        this.session = session;
        const { store, loading, busy, notice, busyKind } = session;
        const copying = busy && busyKind === 'copy';
        const downloading = busy && !copying;
        const count = store.selection.length;
        this.all.checked = !loading && store.allChecked;
        this.all.indeterminate = !this.all.checked && count > 0;
        this.all.disabled = busy;
        this.confirm.disabled = loading || busy || !count;
        this.confirm.setAttribute('aria-busy', String(downloading));
        this.spinner.hidden = !downloading;
        if (this.confirmIcon) this.confirmIcon.hidden = downloading;
        this.setText(this.confirmText, downloading ? this.text('Working') : this.confirmLabel);
        if (this.copy) {
            const values = this.options.getValue();
            const label = this.action.copyLabel?.(values) || this.text('CopyContent');
            this.copy.hidden = !this.action.copyType?.(values);
            this.copy.disabled = loading || busy || !count;
            this.copy.setAttribute('aria-label', label);
            this.copy.setAttribute('aria-busy', String(copying));
            this.setText(this.copy, copying ? this.text('Copying') : label);
        }
        this.options.element.querySelectorAll('input,select,button').forEach(control => { control.disabled = busy; });
        if (loading) {
            const progress = { title: this.text('Loading'), detail: this.text('LoadingProgress').replace('{count}', store.eligible.length) };
            this.loadingNotice ||= new AITLoadingNotice({ ...progress, cancelLabel: this.text('StopLoading'),
                onCancel: this.onStop, signal: this.events.signal });
            this.loadingNotice.update(progress);
        } else {
            this.loadingNotice?.close();
            this.loadingNotice = null;
        }
        const state = busy ? (copying ? 'Copying' : 'Working') : loading ? '' : notice;
        this.setText(this.hint, state ? this.text(state) : '');
        this.hint.hidden = !state;
        if (this.compactBar) this.heading.hidden = !state;
        this.hint.dataset.state = busy ? 'busy' : loading ? 'loading' : notice === 'LoadIncomplete' ? 'warning' : 'ready';
        this.setText(this.status, this.text('Selected').replace('{count}', count).replace('{total}', store.eligible.length));
        for (const [key, entry] of this.labels) {
            if (!store.messages.has(key)) {
                entry.label.remove();
                entry.outline.remove();
                this.labels.delete(key);
            }
        }
        for (const message of store.messages.values()) {
            let entry = this.labels.get(message.key);
            if (!entry) {
                const { label, input } = MessageActionControls.checkbox();
                label.classList.add('ait-ma-message-check');
                label.title = this.text('SelectionHelp');
                const outline = document.createElement('div');
                outline.className = 'ait-ma-message-outline';
                outline.setAttribute('aria-hidden', 'true');
                this.root.append(outline, label);
                entry = { key: message.key, label, input, outline };
                input.addEventListener('change', () => this.onSelect(message.key, input.checked), { signal: this.events.signal });
                this.labels.set(message.key, entry);
            }
            entry.input.setAttribute('aria-label', `${this.text(message.role === 'user' ? 'Question' : 'Reply')} ${store.order.indexOf(message.key) + 1}`);
            entry.input.checked = store.selected.has(message.key);
            entry.input.disabled = busy || message.generating;
            entry.outline.dataset.selected = String(entry.input.checked);
        }
        this.position();
    }

    setHover(key) {
        if (this.hoveredKey === key) return;
        const previous = this.labels.get(this.hoveredKey);
        if (previous) previous.outline.dataset.hovered = 'false';
        const current = this.labels.get(key);
        if (current) current.outline.dataset.hovered = 'true';
        this.hoveredKey = key;
    }

    position() {
        if (!this.session) return;
        const dock = this.adapter.getDockBounds();
        const width = Math.min(920, innerWidth - 32, dock ? Math.max(360, dock.width + 100) : Infinity);
        const center = dock ? dock.left + dock.width / 2 : innerWidth / 2;
        this.bar.style.width = `${width}px`;
        this.bar.style.left = `${Math.max(width / 2 + 16, Math.min(innerWidth - width / 2 - 16, center))}px`;
        this.bar.style.bottom = '20px';
        const bounds = this.adapter.getViewportBounds?.() || { top: 0, bottom: innerHeight };
        const topLimit = Math.max(8, bounds.top + 8);
        const bottomLimit = Math.min(innerHeight - 8, bounds.bottom, this.bar.getBoundingClientRect().top - 12);
        const messages = this.session.store.order.map(key => {
            const message = this.session.store.messages.get(key);
            const rect = message?.element?.isConnected && message.element.getBoundingClientRect();
            return rect?.width > 0 && rect.height > 0 ? { key, message, rect } : null;
        }).filter(Boolean);
        const geometry = new Map(messages.map((item, index) => [item.key, {
            ...item,
            topPadding: index ? Math.max(0, Math.min(8, (item.rect.top - messages[index - 1].rect.bottom) / 2 - 2)) : 8,
            bottomPadding: index < messages.length - 1 ? Math.max(0, Math.min(8, (messages[index + 1].rect.top - item.rect.bottom) / 2 - 2)) : 8
        }]));
        this.visibleEntries = [];
        for (const [key, entry] of this.labels) {
            const item = geometry.get(key);
            const rect = item?.rect;
            const top = rect ? Math.max(topLimit, rect.top - 2) : 0;
            const visible = rect && rect.width > 0 && rect.height > 0 && rect.bottom > top + 20 && top + 36 < bottomLimit;
            entry.label.hidden = !visible;
            entry.outline.hidden = !visible;
            if (!visible) continue;
            entry.element = item.message.element;
            this.visibleEntries.push(entry);
            const column = this.adapter.getSelectionColumn?.(item.message) || rect;
            const outlineLeft = Math.max(2, column.left - 12);
            entry.label.style.left = `${Math.max(4, column.left - 48)}px`;
            entry.label.style.top = `${top}px`;
            const outlineTop = rect.top - item.topPadding;
            const outlineBottom = rect.bottom + item.bottomPadding;
            // Clip the full message outline instead of pinning its borders to the viewport.
            Object.assign(entry.outline.style, {
                left: `${outlineLeft}px`, top: `${outlineTop}px`,
                width: `${Math.min(innerWidth - 4, column.right + 12) - outlineLeft}px`,
                height: `${outlineBottom - outlineTop}px`,
                clipPath: `inset(${Math.max(0, topLimit - 4 - outlineTop)}px 0px ${Math.max(0, outlineBottom - bottomLimit)}px 0px)`
            });
        }
    }

    destroy() {
        this.events.abort();
        this.loadingNotice?.close();
        this.loadingNotice = null;
        if (this.frame) cancelAnimationFrame(this.frame);
        this.options.destroy?.();
        this.labels.clear();
        this.visibleEntries = [];
        this.root.remove();
        this.session = null;
    }
}
