/** Reusable, non-blocking loading notice. The caller owns progress and cancellation. */
class AITLoadingNotice {
    constructor({ title, detail = '', cancelLabel, onCancel, signal } = {}) {
        this.events = new AbortController();
        this.signal = signal;
        this.closeOnAbort = () => this.close();
        this.panel = document.createElement('div');
        this.panel.className = 'ait-loading-notice';
        this.panel.setAttribute('data-ait-owned-ui', '');
        this.panel.setAttribute('role', 'status');
        this.panel.setAttribute('aria-live', 'polite');
        this.panel.setAttribute('aria-atomic', 'true');

        const icon = document.createElement('span');
        icon.className = 'ait-loading-notice-icon';
        icon.setAttribute('aria-hidden', 'true');
        const spinner = document.createElement('span');
        spinner.className = 'ait-loading-notice-spinner';
        icon.appendChild(spinner);
        const content = document.createElement('div');
        content.className = 'ait-loading-notice-content';
        this.title = document.createElement('div');
        this.title.className = 'ait-loading-notice-title';
        this.detail = document.createElement('div');
        this.detail.className = 'ait-loading-notice-detail';
        content.append(this.title, this.detail);
        this.panel.append(icon, content);
        if (onCancel) {
            const cancel = document.createElement('button');
            cancel.className = 'ait-loading-notice-cancel';
            cancel.type = 'button';
            cancel.textContent = cancelLabel;
            cancel.addEventListener('click', onCancel, { signal: this.events.signal });
            this.panel.appendChild(cancel);
        }
        this.update({ title, detail });
        if (signal?.aborted) { this.close(); return; }
        signal?.addEventListener('abort', this.closeOnAbort, { once: true });
        document.body.appendChild(this.panel);
    }

    update({ title, detail = '' }) {
        if (this.closed) return;
        if (this.title.textContent !== title) this.title.textContent = title;
        if (this.detail.textContent !== detail) this.detail.textContent = detail;
        this.detail.hidden = !detail;
    }

    close() {
        if (this.closed) return;
        this.closed = true;
        this.events.abort();
        this.signal?.removeEventListener('abort', this.closeOnAbort);
        this.panel.remove();
    }
}
