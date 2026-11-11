/** Selection is keyed by message identity, never DOM position or checkbox state. */
class MessageSelectionStore {
    constructor() {
        this.messages = new Map();
        this.order = [];
        this.selected = new Set();
        this.excluded = new Set();
        this.allIntent = false;
        this.complete = false;
    }

    merge(records) {
        const incoming = [...new Set(records.map(record => record.key))];
        let previous = -1;
        for (const key of incoming) {
            const index = this.order.indexOf(key);
            if (index >= 0) { previous = index; continue; }
            const next = incoming.slice(incoming.indexOf(key) + 1).find(value => this.order.includes(value));
            const insertion = previous >= 0 ? previous + 1 : next ? this.order.indexOf(next) : this.order.length;
            this.order.splice(insertion, 0, key);
            previous = insertion;
            this.complete = false;
        }
        for (const record of records) {
            this.messages.set(record.key, record);
            if (record.generating) this.selected.delete(record.key);
            else if (this.allIntent && !this.excluded.has(record.key)) this.selected.add(record.key);
        }
        // Indexed virtual lists can expose non-overlapping windows in either order.
        if (records.some(record => Number.isInteger(record.position)) && this.order.every(key => Number.isInteger(this.messages.get(key)?.position))) {
            this.order.sort((a, b) => this.messages.get(a).position - this.messages.get(b).position);
        }
    }

    remove(key) {
        this.messages.delete(key);
        this.order = this.order.filter(value => value !== key);
        this.selected.delete(key);
        this.excluded.delete(key);
        this.complete = false;
    }

    setSelected(key, checked) {
        if (!this.messages.has(key) || this.messages.get(key).generating) return;
        if (checked) { this.selected.add(key); this.excluded.delete(key); }
        else { this.selected.delete(key); this.excluded.add(key); }
    }

    selectAll() {
        this.allIntent = true;
        this.excluded.clear();
        for (const message of this.messages.values()) if (!message.generating) this.selected.add(message.key);
    }

    clear() {
        this.selected.clear(); this.excluded.clear(); this.allIntent = false;
    }

    get eligible() { return this.order.map(key => this.messages.get(key)).filter(message => !message.generating); }
    get selection() { return this.eligible.filter(message => this.selected.has(message.key)); }
    get allChecked() { return this.complete && this.eligible.length > 0 && this.selection.length === this.eligible.length; }
}
