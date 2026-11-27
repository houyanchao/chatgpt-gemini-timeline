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

    merge(records, { prepend = false } = {}) {
        const incoming = [...new Set(records.map(record => record.key))];
        let previous = -1;
        for (const [offset, key] of incoming.entries()) {
            const index = this.order.indexOf(key);
            if (index >= 0) { previous = index; continue; }
            // An older window may share only the pinned last turn. Its leading new rows precede the scanned suffix.
            let insertion = previous + 1;
            if (previous < 0 && !prepend) {
                const next = incoming.slice(offset + 1).find(value => this.order.includes(value));
                insertion = next === undefined ? this.order.length : this.order.indexOf(next);
            }
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

    sortByTurnIds(turnIds) {
        if (!turnIds?.length) return;
        const turns = new Map(turnIds.map((id, index) => [id, index]));
        const positions = new Map();
        for (const key of this.order) {
            const message = this.messages.get(key);
            const user = message.role === 'user';
            const index = turns.get(user ? message.id : message.turnId);
            // A detached reply may have no known question. Preserve the observed order in that case.
            if (index === undefined) return;
            positions.set(key, 2 * index + (user ? 0 : 1));
        }
        this.order.sort((a, b) => positions.get(a) - positions.get(b));
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
