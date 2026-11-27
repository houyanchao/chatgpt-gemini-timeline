/** Shared history traversal, extracted from the ChatGPT export collection flow. */
class MessageActionLoader {
    static async load(adapter, { signal: callerSignal, shouldCancel, onMessages = () => {}, stopWhen, selectAll = false } = {}) {
        if (callerSignal?.aborted || shouldCancel?.()) throw new DOMException('Cancelled', 'AbortError');
        const url = location.href;
        const scroller = adapter.getScrollContainer();
        const isWindow = scroller === window;
        const reverse = !isWindow && getComputedStyle(scroller).flexDirection === 'column-reverse';
        const scanUp = selectAll && adapter.platformId === 'chatgpt';
        const top = () => isWindow ? window.scrollY : scroller.scrollTop;
        const range = () => Math.max(0, isWindow ? document.documentElement.scrollHeight - innerHeight : scroller.scrollHeight - scroller.clientHeight);
        const scroll = value => {
            guard?.protect(isWindow ? document.scrollingElement || document.documentElement : scroller);
            adapter.beforeHistoryScroll?.();
            if (isWindow) window.scrollTo(0, value);
            else scroller.scrollTop = value;
        };
        const initial = top();
        // Prepending ChatGPT history moves the bottom while its old pixel offset stays unchanged.
        const initialRange = adapter.platformId === 'chatgpt' ? range() : 0;
        const startedAtBottom = initialRange > 0 && Math.abs(initial - (reverse ? 0 : initialRange)) <= 1;
        const preserveReadingPosition = adapter.platformId === 'chatgpt' && !startedAtBottom;
        const viewportTop = () => isWindow ? 0 : TimelineUtils.getScrollViewportTop(scroller);
        let readingAnchor = null, readingTop = initial, olderRange = initialRange, loadingOlder = true;
        const updateReadingPosition = messages => {
            if (!preserveReadingPosition) return;
            if (loadingOlder) {
                // In column-reverse, prepending older turns extends the negative end; the origin stays at the bottom.
                const nextRange = range();
                if (!reverse) readingTop += nextRange - olderRange;
                olderRange = nextRange;
            }
            const row = readingAnchor && messages.find(message => message.key === readingAnchor.key);
            if (row?.element?.isConnected) {
                readingTop = top() + row.element.getBoundingClientRect().top - viewportTop() - readingAnchor.y;
            }
        };
        const records = new MessageSelectionStore();
        const processed = new Set();
        const owner = adapter.platformId === 'chatgpt' ? new AbortController() : null;
        const guard = owner && TimelineUtils.createHistoryScrollGuard(owner);
        // A normal Stop still owns restoration. Another navigation can take over until finally runs.
        const signals = [callerSignal, owner?.signal].filter(Boolean);
        const aborted = () => signals.some(signal => signal.aborted);
        const check = () => {
            if (aborted() || shouldCancel?.() || location.href !== url) throw new DOMException('Cancelled', 'AbortError');
        };
        const wait = ms => new Promise((resolve, reject) => {
            const cleanup = () => {
                clearTimeout(timer);
                for (const signal of signals) signal.removeEventListener('abort', abort);
            };
            const abort = () => { cleanup(); reject(new DOMException('Cancelled', 'AbortError')); };
            const timer = setTimeout(() => {
                cleanup();
                try { check(); resolve(); } catch (error) { reject(error); }
            }, ms);
            for (const signal of signals) signal.addEventListener('abort', abort, { once: true });
            if (aborted()) abort();
        });
        const settle = async () => {
            for (let attempt = 0; attempt < 30 && adapter.isHistoryLoading(); attempt++) {
                await wait(100);
            }
            if (adapter.isHistoryLoading()) throw new Error('LoadIncomplete');
        };
        const collect = async mounted => {
            check();
            const current = mounted || adapter.getMessages();
            records.merge(current, { prepend: scanUp });
            updateReadingPosition(current);
            if (!scanUp) {
                for (const message of current) {
                    processed.add(message.id);
                    processed.add(message.turnId);
                }
            }
            await onMessages(current, records.order);
            check();
        };
        try {
            if (preserveReadingPosition) {
                const height = isWindow ? innerHeight : scroller.clientHeight;
                let nearest = Infinity, origin;
                for (const message of adapter.getMessages()) {
                    if (!message.key || !message.element?.isConnected) continue;
                    origin ??= viewportTop();
                    const rect = message.element.getBoundingClientRect();
                    const y = rect.top - origin;
                    if (y >= height || rect.bottom <= origin) continue;
                    const distance = Math.max(0, y);
                    if (distance >= nearest) continue;
                    nearest = distance;
                    readingAnchor = { key: message.key, y };
                }
            }
            if (scanUp) {
                guard.protect(isWindow ? document.scrollingElement || document.documentElement : scroller);
                await this.collectUpward(adapter, {
                    reverse, top, range, scroll, viewportTop, collect, records,
                    height: () => isWindow ? innerHeight : scroller.clientHeight,
                    waitForRender: async ms => { await wait(ms); await settle(); }
                });
                return records;
            }
            // Targeted recovery and other platforms use their existing top-to-bottom traversal.
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
            loadingOlder = false;
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
            const keepAtTop = scanUp && records.complete;
            try {
                const takenOver = owner?.signal.reason === 'user-navigation' || owner?.signal.reason === 'superseded-navigation';
                if (!keepAtTop && !takenOver && location.href === url && window.AITContentSession?.active !== false) {
                    let restoreTop = initial;
                    if (startedAtBottom) restoreTop = reverse ? 0 : range();
                    if (preserveReadingPosition) {
                        // Re-read the message key after remounting; a retained DOM node can belong to a different turn.
                        // A failed adapter read must still allow the measured history growth to restore the viewport.
                        let mounted = [];
                        try { if (readingAnchor) mounted = adapter.getMessages(); } catch {}
                        updateReadingPosition(mounted);
                        const limit = range();
                        restoreTop = reverse ? Math.max(-limit, Math.min(0, readingTop)) : Math.min(limit, Math.max(0, readingTop));
                    }
                    scroll(restoreTop);
                }
            } finally {
                guard?.close();
            }
        }
    }

    /** Walk overlapping viewports from the newest messages, keeping the cursor across prepended pages. */
    static async collectUpward(adapter, { reverse, top, range, scroll, viewportTop, height, collect, records, waitForRender }) {
        const latest = span => reverse ? 0 : span;
        let previousRange = range(), wantedDistance = 0, anchor = null;
        let stableTop = 0, stalled = 0, lastDistance = -1;
        if (Math.abs(top() - latest(previousRange)) > 1) {
            scroll(latest(previousRange));
            await waitForRender(400);
        } else await waitForRender(0);
        for (let stepsWithoutNewMessages = 0; stepsWithoutNewMessages < 800; stepsWithoutNewMessages++) {
            const span = range(), y = top(), distance = latest(span) - y;
            if (Math.abs(span - previousRange) > 1) stableTop = 0;
            const mounted = adapter.getMessages();
            const viewportHeight = height();
            if (viewportHeight <= 0) throw new Error('LoadIncomplete');
            const overlap = Math.max(1, viewportHeight * .2);
            const tolerance = wantedDistance === 0 ? 1 : overlap;
            if (span > previousRange + 1 && distance > wantedDistance + tolerance) {
                // The host may insert an entire page above us without compensating scrollTop.
                // Return to the intended overlap before sampling, so the inserted page is visited in order.
                const sameRow = anchor && mounted.find(row => row.key === anchor.key);
                const correction = sameRow?.element?.isConnected
                    ? sameRow.element.getBoundingClientRect().top - viewportTop() - anchor.expectedY
                    : distance - wantedDistance;
                if (correction > tolerance) {
                    previousRange = span;
                    scroll(Math.min(latest(span), y + correction));
                    await waitForRender(400);
                    continue;
                }
            }
            const count = records.messages.size;
            await collect(mounted);
            if (records.messages.size > count) stepsWithoutNewMessages = 0;
            // Capturing a screenshot can itself span a layout update. Recheck this viewport first.
            previousRange = span;
            if (Math.abs(range() - span) > 1 || Math.abs(top() - y) > 1) {
                stableTop = 0;
                continue;
            }
            const atTop = span - distance <= 1;
            if (atTop && stableTop >= 2 && count === records.messages.size) {
                const branch = adapter.getConversationState?.();
                const missingQuestion = branch?.turnIds?.some(id => !records.messages.has('user:' + id));
                if (!count || missingQuestion || (Number.isInteger(branch?.messageTotal) && count < branch.messageTotal)) {
                    throw new Error('LoadIncomplete');
                }
                if (branch?.turnIds) records.sortByTurnIds(branch.turnIds);
                records.complete = true;
                return;
            }
            stableTop = atTop && count === records.messages.size ? stableTop + 1 : 0;
            if (!atTop && distance <= lastDistance + 1 && count === records.messages.size) {
                if (++stalled >= 5) throw new Error('LoadIncomplete');
            } else stalled = 0;
            lastDistance = distance;
            wantedDistance = Math.min(span, distance + Math.max(1, viewportHeight - overlap));
            const target = latest(span) - wantedDistance;
            // A stable row near the incoming viewport distinguishes added history from resizing below.
            anchor = null;
            for (const { key, element } of mounted) {
                if (!element?.isConnected) continue;
                const rect = element.getBoundingClientRect(), origin = viewportTop();
                if (rect.bottom > origin && rect.top < origin + overlap) {
                    anchor = { key, expectedY: rect.top - origin + y - target };
                    break;
                }
            }
            if (!atTop || stableTop === 0) scroll(target);
            await waitForRender(atTop ? 500 : 400);
        }
        throw new Error('LoadIncomplete');
    }
}
