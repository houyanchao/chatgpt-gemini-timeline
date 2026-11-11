/** Shared history traversal, extracted from the ChatGPT export collection flow. */
class MessageActionLoader {
    static async load(adapter, { signal, shouldCancel, onMessages = () => {}, stopWhen } = {}) {
        const url = location.href;
        const scroller = adapter.getScrollContainer();
        const isWindow = scroller === window;
        const reverse = !isWindow && getComputedStyle(scroller).flexDirection === 'column-reverse';
        const top = () => isWindow ? window.scrollY : scroller.scrollTop;
        const range = () => Math.max(0, isWindow ? document.documentElement.scrollHeight - innerHeight : scroller.scrollHeight - scroller.clientHeight);
        const scroll = value => {
            adapter.beforeHistoryScroll?.();
            if (isWindow) window.scrollTo(0, value);
            else scroller.scrollTop = value;
        };
        const initial = top();
        const records = new MessageSelectionStore();
        const processed = new Set();
        const check = () => {
            if (signal?.aborted || shouldCancel?.() || location.href !== url) throw new DOMException('Cancelled', 'AbortError');
        };
        const wait = ms => new Promise((resolve, reject) => {
            const abort = () => { clearTimeout(timer); reject(new DOMException('Cancelled', 'AbortError')); };
            const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); try { check(); resolve(); } catch (error) { reject(error); } }, ms);
            signal?.addEventListener('abort', abort, { once: true });
            if (signal?.aborted) abort();
        });
        const settle = async () => {
            for (let attempt = 0; attempt < 30 && adapter.isHistoryLoading(); attempt++) await wait(100);
            if (adapter.isHistoryLoading()) throw new Error('LoadIncomplete');
        };
        const collect = async () => {
            check();
            const current = adapter.getMessages();
            records.merge(current);
            for (const message of current) {
                processed.add(message.id);
                processed.add(message.turnId);
            }
            await onMessages(current, records.order);
            check();
        };
        try {
            // Establish a stable top before sweeping down, as in the existing exporter.
            let stable = 0;
            for (let attempt = 0; attempt < 30 && stable < 2; attempt++) {
                check();
                const before = range();
                const count = records.messages.size;
                scroll(reverse ? -before : 0);
                await wait(500);
                await settle();
                await collect();
                if (stopWhen?.()) return records;
                const atTop = Math.abs(top() - (reverse ? -range() : 0)) <= 2;
                stable = atTop && Math.abs(before - range()) <= 2 && records.messages.size === count ? stable + 1 : 0;
            }
            if (stable < 2) throw new Error('LoadIncomplete');
            let stagnant = 0;
            const nextTarget = () => adapter.getHistoryTargets().find(element => !processed.has(adapter.getTargetId(element)));
            for (let iteration = 0; iteration < 800; iteration++) {
                await collect();
                if (stopWhen?.()) return records;
                let target = nextTarget();
                let targetOffset = -80;
                const bottom = reverse ? 0 : range();
                if (!target && Math.abs(top() - bottom) <= 2) {
                    await wait(300); await settle(); await collect();
                    if (stopWhen?.()) return records;
                    target = nextTarget();
                    if (!target && Math.abs(top() - (reverse ? 0 : range())) <= 2) {
                        const gap = adapter.getHistoryGap?.(records);
                        if (!gap) {
                            records.complete = true;
                            return records;
                        }
                        if (!gap.element) throw new Error('LoadIncomplete');
                        target = gap.element;
                        targetOffset = gap.offset;
                    }
                }
                const before = records.messages.size;
                const previous = top();
                if (target) {
                    const viewportTop = isWindow ? 0 : scroller.getBoundingClientRect().top;
                    scroll(top() + target.getBoundingClientRect().top - viewportTop + targetOffset);
                } else {
                    const viewport = isWindow ? innerHeight : scroller.clientHeight || innerHeight;
                    scroll(Math.min(bottom, top() + Math.max(1, viewport * .8)));
                }
                await wait(400); await settle(); await collect();
                if (stopWhen?.()) return records;
                if (records.messages.size === before && Math.abs(top() - previous) < 1) {
                    if (++stagnant >= 5) throw new Error('LoadIncomplete');
                } else stagnant = 0;
            }
            throw new Error('LoadIncomplete');
        } finally {
            if (location.href === url && window.AITContentSession?.active !== false) scroll(initial);
        }
    }
}
