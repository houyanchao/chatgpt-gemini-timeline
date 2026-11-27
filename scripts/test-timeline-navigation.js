const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

const source = ['common.js', 'adapters/base.js', 'adapters/chatgpt.js', 'adapters/claude.js', 'timeline-manager.js']
    .map(file => readFileSync(join(__dirname, '../js/timeline', file), 'utf8')).join('\n');

function loadTimeline(globals) {
    return vm.runInNewContext(source + '\n;({ ChatGPTAdapter, ClaudeAdapter, TimelineManager })', {
        AbortController, CustomEvent, crypto: { randomUUID }, window: {}, document: {}, ...globals
    });
}

function virtualRow(index, isMounted, viewportY) {
    return {
        index, childElementCount: 1,
        get isConnected() { return isMounted(); },
        matches: () => true,
        getAttribute: name => name === 'data-turn-id' ? String(index) : null,
        querySelectorAll: () => [],
        closest: () => null,
        getBoundingClientRect() {
            const top = viewportY();
            return { top, bottom: top + 80, width: 400, height: 80 };
        }
    };
}

function virtualChat({ reverse = false, missingIndex, fixedWindow = false, keepLastMounted = false, initialVisualTop,
    separateTurnRows = false, rowHeight = i => i < 25 ? 350 : 850 } = {}) {
    const height = 500;
    const offsets = [0];
    for (let index = 0; index < 50; index++) {
        offsets.push(offsets[index] + rowHeight(index));
    }
    const maxTop = offsets.at(-1) - height;
    // column-reverse uses native negative scrollTop while the visible questions stay in chronological order.
    const minTop = reverse ? -maxTop : 0;
    const initialTop = minTop + (initialVisualTop ?? maxTop - 850);
    let top = initialTop, renderedTop = initialTop, now = 0, lastMoved = 0;
    const writes = [];
    const scroller = {
        isConnected: true, scrollHeight: maxTop + height, clientHeight: height, clientTop: 0,
        getBoundingClientRect: () => ({ top: 0, bottom: height, height }),
        get scrollTop() { return top; },
        set scrollTop(value) {
            const next = Math.max(minTop, Math.min(minTop + maxTop, Math.round(value)));
            if (top !== next) lastMoved = now;
            writes.push(next);
            top = next;
        },
        scrollTo({ top }) { this.scrollTop = top; }
    };
    const elements = offsets.slice(0, -1).map((offset, index) => virtualRow(index, () => {
        const y = renderedTop - minTop;
        if (keepLastMounted && index === offsets.length - 2) return true;
        const bottom = separateTurnRows ? offset + 80 : offsets[index + 1];
        return missingIndex !== index && offset < y + height + 800 && bottom > y - 800;
    }, () => offset - (top - minTop)));
    const turns = offsets.slice(0, -1).map((offset, index) => ({
        get isConnected() {
            const y = renderedTop - minTop;
            return offset < y + height && offsets[index + 1] > y;
        },
        getAttribute: name => name === 'data-turn-key' ? String(index) : null,
        closest: () => null,
        getBoundingClientRect() {
            const y = offset - (top - minTop), height = offsets[index + 1] - offset;
            return { top: y, bottom: y + height, height };
        }
    }));
    const scope = { isConnected: true, contains: element => element.isConnected,
        querySelectorAll(selector) {
            if (selector === '[data-turn-key]') return separateTurnRows ? turns.filter(turn => turn.isConnected) : [];
            return elements.filter(element => element.isConnected);
        } };
    const { ChatGPTAdapter, TimelineManager } = loadTimeline({
        Date: { now: () => now },
        location: { pathname: '/c/example' },
        getComputedStyle: () => ({ flexDirection: reverse ? 'column-reverse' : 'column' })
    });
    const adapter = new ChatGPTAdapter();
    Object.assign(adapter, {
        getUserMessageSelector: () => '[data-turn-id]',
        filterTimelineUserElements: elements => elements,
        getCapturedTimelineEntries: () => elements.map((element, index) => ({
            id: 'chatgpt-' + index, element: element.isConnected ? element : null
        })),
        async _waitForTimelineRender() {
            now += 600;
            if (!fixedWindow && now - lastMoved >= 1200) renderedTop = top;
        }
    });
    function resolve(index, signal = new AbortController().signal, waitForTarget = false) {
        return adapter.resolveTimelineTarget({ id: 'chatgpt-' + index }, scroller, signal, undefined,
            { conversationContainer: scope, waitForTarget, deadline: now + 120000 });
    }
    const manager = Object.assign(Object.create(TimelineManager.prototype), { adapter, conversationContainer: scope });
    return { manager, resolve, elements, scroller, writes, initialTop, minTop, maxTop, elapsed: () => now };
}

for (const reverse of [false, true]) {
    test('one click finds an older question across delayed, uneven virtual rows' + (reverse ? ' in column-reverse' : ''), async () => {
        const chat = virtualChat({ reverse });
        const target = chat.elements[17];
        assert.equal(target.isConnected, false);
        assert.equal(await chat.resolve(17), target);
        assert.ok(chat.writes.length > 0);
        assert.ok(chat.writes[0] > chat.minTop && chat.writes[0] < chat.minTop + chat.maxTop,
            'a middle question should not require a first trip to either end');
        assert.ok(chat.writes.length < 20, 'navigation should converge within a few virtual windows');
    });
}

for (const keepLastMounted of [false, true]) {
    test('finds a question beyond a very long answer' + (keepLastMounted ? ' with the last turn kept mounted' : ''), async () => {
        const chat = virtualChat({ keepLastMounted, rowHeight: index => index === 12 ? 12000 : 350 });
        assert.equal(await chat.resolve(17), chat.elements[17]);
        assert.ok(chat.writes.length < 20);
    });
}

test('uses the visible answer turn when only an offscreen final user bubble stays mounted', async () => {
    const chat = virtualChat({ separateTurnRows: true, keepLastMounted: true, rowHeight: i => i === 12 ? 12000 : 350 });
    assert.equal(await chat.resolve(9), chat.elements[9]);
    assert.ok(chat.writes.length < 10);
});

test('escapes a long answer between two mounted anchors when its turn wrapper is unavailable', async () => {
    const chat = virtualChat({ initialVisualTop: 7000, keepLastMounted: true, rowHeight: i => i === 12 ? 12000 : 350 });
    assert.equal(await chat.resolve(13), chat.elements[13]);
    assert.ok(chat.writes.length < 10);
    assert.ok(chat.writes.every(top => top > 0 && top < chat.maxTop), 'search within the real bounds of the two questions');
});

for (const reverse of [false, true]) {
    test('seeks forward from inside a long answer with only its question and the pinned last question mounted'
        + (reverse ? ' in column-reverse' : ''), async () => {
        const chat = virtualChat({ reverse, initialVisualTop: 13500, keepLastMounted: true,
            rowHeight: index => index === 34 ? 8500 : 350 });
        assert.deepEqual(chat.elements.filter(element => element.isConnected).map(element => element.index), [34, 49]);
        assert.equal(await chat.resolve(35), chat.elements[35]);
        assert.ok(chat.writes[0] > chat.initialTop, 'the next question is below the current long answer');
        assert.ok(chat.writes.every(top => top > chat.minTop && top < chat.minTop + chat.maxTop));
        assert.ok(chat.writes.length < 10);
    });
}

test('a still-mounted row recycled for a different question loses its original identity', () => {
    const chat = virtualChat();
    const row = chat.elements.find(element => element.isConnected);
    const marker = { id: 'chatgpt-' + row.index, element: row, apiBacked: true };
    assert.equal(chat.manager._isNavigationTargetReady(row, marker), true);
    row.getAttribute = name => name === 'data-turn-id' ? 'different-question' : null;
    assert.equal(row.isConnected, true);
    assert.equal(chat.manager._isNavigationTargetReady(row, marker), false);
    // Scroll events may run before the virtual list publishes its replacement marker map.
    const current = { id: 'chatgpt-different-question', element: row, apiBacked: true };
    const padding = [];
    Object.assign(chat.manager, {
        _apiTimelineMode: true, markers: [current, marker], markerMap: new Map([[current.id, current], [marker.id, marker]]),
        scrollContainer: chat.scroller,
        activeTurnId: current.id, ACTIVATE_AHEAD: Infinity,
        _updateScrollPadding: top => padding.push(top), _getCleanScrollMetrics: () => ({ maxScrollTop: chat.maxTop }),
        _emitActiveChange() {}
    });
    chat.manager._recalcMarkerPositions();
    chat.manager.computeActiveByScroll();
    assert.equal(chat.manager.activeTurnId, current.id);
    assert.equal(marker.offsetTop, undefined);
    assert.deepEqual(padding, []);
});

test('a virtual window that never mounts the target cannot keep driving the scroller', async () => {
    const chat = virtualChat({ missingIndex: 17, fixedWindow: true });
    assert.equal(await chat.resolve(17), null);
    assert.ok(chat.writes.length > 0 && chat.writes.length < 20);
});

test('a pinned last question below the viewport does not steal the active dot while reading a long answer', () => {
    const page = staticChat(false);
    const { manager } = page;
    manager._apiTimelineMode = true;
    manager.ACTIVATE_AHEAD = 30;
    manager.activeTurnId = 'reading';
    manager.markers = [{ id: 'first' }, { id: 'reading' }, { id: 'last', element: page.target(3900) }];
    manager.markerMap = new Map(manager.markers.map(marker => [marker.id, marker]));
    manager._emitActiveChange = () => {};
    manager.computeActiveByScroll();
    assert.equal(manager.activeTurnId, 'reading');
    page.scroller.scrollTop = 3900;
    manager.computeActiveByScroll();
    assert.equal(manager.activeTurnId, 'last');
});

test('ordinary navigation stops on stalled rendering, with a longer bounded wait for history or a bookmark', async () => {
    for (const [historyLoading, waitForTarget, limit] of [[false, false, 20000], [true, false, 120000], [false, true, 120000]]) {
        const chat = virtualChat({ fixedWindow: true });
        chat.manager.adapter.isTimelineHistoryLoading = () => historyLoading;
        assert.equal(await chat.resolve(17, undefined, waitForTarget), null);
        assert.ok(chat.elapsed() >= limit && chat.elapsed() <= limit + 600);
    }
});

for (const reason of ['cancel-navigation', 'superseded-navigation', 'user-navigation']) {
    test(reason + ' stops outstanding virtual navigation', async () => {
        const chat = virtualChat();
        const controller = new AbortController();
        const pending = chat.resolve(17, controller.signal);
        assert.ok(chat.writes.length > 0);
        const writesBeforeAbort = chat.writes.length;
        controller.abort(reason);
        assert.equal(await pending, null);
        if (reason === 'cancel-navigation') assert.equal(chat.scroller.scrollTop, chat.initialTop);
        else assert.equal(chat.writes.length, writesBeforeAbort, 'the old navigation must leave its replacement in control');
    });
}

function observeHistoryGuard(container, writes) {
    const events = [];
    for (const action of ['start', 'end']) {
        container.addEventListener('ait:history-navigation-' + action, event => {
            events.push(writes ? { action, token: event.detail, writes: writes.length } : { action, token: event.detail });
        });
    }
    return events;
}

// After a refresh, API history can already list a question whose DOM page is still missing.
function paginatedChat(onRender, firstCaptured = 95, { rowCount = 100, initialRange = 3000, firstRowTop = 0, reverse = false } = {}) {
    let now = 0, pendingClick;
    const initialTop = reverse ? 0 : initialRange;
    const mounted = new Map(Array.from({ length: 4 }, (_, index) =>
        [rowCount - 4 + index, index === 0 ? firstRowTop : Math.round(initialRange * index / 3)]));
    const writes = [];
    const scroller = Object.assign(new EventTarget(), {
        isConnected: true, clientTop: 0, clientHeight: 500, scrollHeight: initialRange + 500, scrollTop: initialTop,
        contains: row => row.isConnected,
        getBoundingClientRect: () => ({ top: 0 }),
        scrollTo({ top }) {
            const range = this.scrollHeight - this.clientHeight;
            const start = reverse ? -range : 0;
            this.scrollTop = Math.round(Math.max(start, Math.min(top, start + range)));
            writes.push(this.scrollTop);
        }
    });
    const guardEvents = observeHistoryGuard(scroller, writes);
    const visualTop = () => scroller.scrollTop + (reverse ? scroller.scrollHeight - scroller.clientHeight : 0);
    const rows = Array.from({ length: rowCount }, (_, index) => virtualRow(index,
        () => mounted.has(index), () => mounted.get(index) - visualTop()));
    const scope = { isConnected: true, contains: row => row.isConnected, querySelectorAll: () => rows.filter(row => row.isConnected) };
    const { ChatGPTAdapter, TimelineManager } = loadTimeline({
        Date: { now: () => now }, location: { pathname: '/c/example' },
        getComputedStyle: () => ({ flexDirection: reverse ? 'column-reverse' : 'column' }),
        requestAnimationFrame(callback) { queueMicrotask(() => callback(now += 16)); },
        TimelineI18n: { getMessage: () => 'failed' }
    });
    const adapter = new ChatGPTAdapter();
    Object.assign(adapter, {
        _capturedTimelineConvId: 'example', getUserMessageSelector: () => '[data-turn-id]',
        _pullConvTexts() {}, // This fixture supplies the API snapshot through capture().
        filterTimelineUserElements: elements => elements, extractText: row => 'Question ' + row.index,
        async _waitForTimelineRender() {
            now += 600;
            onRender({ now, scroller, mounted, capture });
        }
    });
    const manager = Object.assign(Object.create(TimelineManager.prototype), {
        adapter, scrollContainer: scroller, conversationContainer: scope, isCurrentPage: () => true,
        _showNodeNavigationLoading: () => ({ close() {} }), _recalcMarkerPositions() {},
        updateActiveDotUI() {}, syncTimelineTrackToMain() {},
        _emitActiveChange: (_previous, current) => pendingClick(current),
        showErrorToast: () => pendingClick(null)
    });
    function capture(first) {
        adapter._capturedTimeline = { revision: first, complete: first === 0,
            entries: rows.slice(first).map(row => ({ id: String(row.index), text: 'Question ' + row.index })) };
        manager.markers = adapter.getCapturedTimelineEntries(scope.querySelectorAll())
            .map(entry => ({ ...entry, apiBacked: true }));
        manager.markerMap = new Map(manager.markers.map(marker => [marker.id, marker]));
    }
    capture(firstCaptured);
    function click(id, { bookmark = false } = {}) {
        const result = new Promise(resolve => { pendingClick = resolve; });
        const started = bookmark ? manager.navigateToStoredNode(String(id))
            : manager.scrollToIndex(manager.markers.findIndex(marker => marker.id === 'chatgpt-' + id));
        assert.equal(started, true);
        return result;
    }
    return { click, scroller, writes, initialTop, guardEvents };
}

for (const bookmark of [false, true]) {
    test((bookmark ? 'bookmark' : 'timeline click') + ' guards a mounted historical question before scrolling', async () => {
        const chat = paginatedChat(() => assert.fail('the selected question is already mounted'));
        assert.equal(await chat.click(96, { bookmark }), 'chatgpt-96');
        await new Promise(setImmediate);
        assert.ok(chat.writes.length > 0);
        assert.equal(chat.scroller.scrollTop, 0);
        const token = chat.guardEvents[0]?.token;
        assert.equal(typeof token, 'string');
        assert.deepEqual(chat.guardEvents, [
            { action: 'start', token, writes: 0 },
            { action: 'end', token, writes: chat.writes.length }
        ]);

        // The last question can also be above the viewport when its answer is long.
        chat.scroller.scrollHeight += 1800;
        chat.scroller.scrollTop = chat.scroller.scrollHeight - chat.scroller.clientHeight;
        assert.equal(await chat.click(99, { bookmark }), 'chatgpt-99');
        await new Promise(setImmediate);
        assert.equal(chat.scroller.scrollTop, 2980);
        assert.equal(chat.guardEvents.length, 2, 'navigating to the last question should not start another guard');
    });
}

for (const mountTarget of [false, true]) {
    test('prepending API history during an empty DOM window ' + (mountTarget ? 'still lands on the original question' : 'does not bounce on failure'), async () => {
        const chat = paginatedChat(({ now, scroller, mounted, capture }) => {
            if (now === 600) {
                mounted.clear();
                capture(0); // The selected question moves from index 0 to index 95.
            } else if (now === 1200) {
                for (let i = 96; i < 100; i++) mounted.set(i, (i - 96) * 1000);
            } else if (mountTarget && now >= 1800 && scroller.scrollTop < 500) {
                mounted.set(95, 60);
            }
        });
        assert.equal(await chat.click(95), mountTarget ? 'chatgpt-95' : null);
        assert.ok(chat.writes.length > 0);
        assert.ok(chat.writes.every(top => top < 500), 'late API pages must not push the scroll back toward the bottom');
        assert.ok(Math.abs(chat.scroller.scrollTop - (mountTarget ? 40 : 0)) <= 1);
        await new Promise(setImmediate); // The click settles before the navigation finally handler.
        const [start] = chat.guardEvents;
        assert.equal(typeof start?.token, 'string');
        assert.deepEqual(chat.guardEvents, [
            { action: 'start', token: start.token, writes: 0 },
            { action: 'end', token: start.token, writes: chat.writes.length }
        ]);
    });
}

test('a stable API snapshot still allows the next DOM history page to load after native scroll anchoring', async () => {
    const hostAnchors = [];
    const chat = paginatedChat(({ scroller, mounted }) => {
        if (scroller.scrollTop !== 0) return;
        if (!hostAnchors.length) {
            // Prepending history preserves the viewport; the old rows remain mounted until the next render.
            for (const [index, top] of mounted) mounted.set(index, top + 1000);
            scroller.scrollHeight += 1000;
            scroller.scrollTop = 1000;
            hostAnchors.push(scroller.scrollTop);
        } else {
            mounted.set(0, 80);
        }
    }, 0);
    assert.equal(await chat.click(0), 'chatgpt-0');
    assert.deepEqual(hostAnchors, [1000]);
    assert.ok(chat.writes.filter(top => top === 0).length >= 2, 'the host loads the second page only on a fresh hit at the top');
    assert.ok(chat.writes.every(top => top <= 1000));
    assert.ok(Math.abs(chat.scroller.scrollTop - 60) <= 1);
});

test('continues loading confirmed older pages past the speculative scroll limit', async () => {
    let first = 96;
    const chat = paginatedChat(({ scroller, mounted }) => {
        if (scroller.scrollTop !== 0 || first <= 66) return;
        for (const [index, offset] of mounted) mounted.set(index, offset + 1000);
        mounted.set(--first, 30);
        mounted.delete(first + 4);
        scroller.scrollHeight += 1000;
        scroller.scrollTop = 1000;
    }, 0);
    assert.equal(await chat.click(66), 'chatgpt-66');
    assert.equal(first, 66);
    assert.equal(chat.writes.filter(top => top === 0).length, 30);
});

test('layout growth without an earlier page does not renew the scroll budget', async () => {
    const chat = paginatedChat(({ scroller, mounted }) => {
        if (scroller.scrollTop !== 0) return;
        for (const [index, offset] of mounted) mounted.set(index, offset + 1000);
        scroller.scrollHeight += 1000;
        scroller.scrollTop = 1000;
    }, 0);
    assert.equal(await chat.click(66), null);
    assert.equal(chat.writes.length, 24);
});

for (const reverse of [false, true]) {
    test('loads the previous DOM page from a padded first question even after a host jump to the bottom'
        + (reverse ? ' in column-reverse' : ''), async () => {
        const pageRequests = [];
        const chat = paginatedChat(({ scroller, mounted }) => {
            const range = scroller.scrollHeight - scroller.clientHeight;
            if (scroller.scrollTop !== (reverse ? -range : 0)) return;
            pageRequests.push(range);
            if (pageRequests.length === 1) {
                mounted.delete(39); // The original first question no longer renders.
                for (const [index, offset] of mounted) mounted.set(index, offset + 2854);
                scroller.scrollHeight += 2854;
                scroller.scrollTop = reverse ? 0 : 4816; // Native anchoring was followed by the site's bottom-follow behavior.
            } else {
                mounted.set(12, 80);
            }
        }, 0, { rowCount: 43, initialRange: 1962, firstRowTop: 438, reverse });
        assert.equal(await chat.click(12), 'chatgpt-12');
        assert.deepEqual(pageRequests, [1962, 4816]);
        assert.deepEqual(chat.writes.slice(0, 2), reverse ? [-1962, -4816] : [0, 0]);
        assert.equal(chat.guardEvents[0]?.action, 'start');
        assert.equal(chat.guardEvents[0].writes, 0);
    });
}

function staticChat(root) {
    let time = 0, top = 2800;
    const frames = new Map();
    const writes = [];
    let frameId = 0;
    const scroller = Object.assign(new EventTarget(), {
        isConnected: true, clientTop: root ? 0 : 3, scrollHeight: 4500, clientHeight: 500,
        contains: () => true,
        getBoundingClientRect: () => ({ top: root ? -top : 120 }),
        scrollTo({ top }) { this.scrollTop = top; }
    });
    Object.defineProperty(scroller, 'scrollTop', {
        get: () => top,
        set(value) { top = Math.max(0, Math.min(4000, value)); writes.push(top); }
    });
    const { TimelineManager } = loadTimeline({
        document: { scrollingElement: root ? scroller : {} },
        getComputedStyle: () => ({ flexDirection: 'column' }),
        requestAnimationFrame(callback) { frames.set(++frameId, callback); return frameId; },
        cancelAnimationFrame(id) { frames.delete(id); }
    });
    const manager = Object.assign(Object.create(TimelineManager.prototype), {
        adapter: { getScrollOffset: () => 30 }, scrollContainer: scroller,
        isCurrentPage: () => true, _recalcMarkerPositions() {}
    });
    function target(offset) {
        return { isConnected: true, getBoundingClientRect: () => ({ top: (root ? 0 : 123) + offset - top }) };
    }
    function advance(ms) {
        const end = time + ms;
        for (; time < end; time += 16) {
            const batch = [...frames.values()];
            frames.clear();
            batch.forEach(frame => frame(time));
        }
    }
    return { manager, scroller, writes, frames, target, advance };
}

for (const root of [true, false]) {
    test('scrolls to the same question offset in ' + (root ? 'the document viewport' : 'a bordered, nested scroller'), async () => {
        const page = staticChat(root);
        const result = page.manager.smoothScrollTo(page.target(700), 400);
        page.advance(1200);
        assert.equal(page.frames.size, 0);
        assert.equal(await result, true);
        assert.ok(Math.abs(page.scroller.scrollTop - 670) <= 1);
    });
}

test('a second timeline click takes over a running scroll on ordinary pages', () => {
    const page = staticChat(false);
    page.manager.markers = [{ id: 'a', element: page.target(700) }, { id: 'b', element: page.target(3600) }];
    assert.equal(page.manager.scrollToIndex(0), true);
    page.advance(160);
    const turnPosition = page.scroller.scrollTop;
    page.writes.length = 0;
    assert.equal(page.manager.scrollToIndex(1), true);
    page.advance(1200);
    let previous = turnPosition;
    for (const position of page.writes) {
        assert.ok(position >= previous, 'the first animation must not pull the page back toward its old target');
        previous = position;
    }
    assert.ok(Math.abs(page.scroller.scrollTop - 3570) <= 1);
    assert.equal(page.frames.size, 0);
});

test('a distant resolved question remains aligned after a late layout shift', async () => {
    const page = staticChat(false);
    let documentOffset = 700;
    const element = { isConnected: true, getBoundingClientRect: () => page.target(documentOffset).getBoundingClientRect() };
    const marker = { id: 'chatgpt-question', element, apiBacked: true };
    const result = page.manager.smoothScrollTo(element, 400, { marker });
    page.advance(160);
    assert.ok(Math.abs(page.scroller.scrollTop - 670) <= 1, 'the mounted question should be inside the viewport');
    documentOffset += 240;
    page.advance(1000);
    assert.equal(await result, true);
    assert.ok(Math.abs(page.scroller.scrollTop - 910) <= 1);
    assert.equal(page.frames.size, 0, 'correction stops once the layout settles');
});

test('scrolling by hand after arrival keeps the reader’s position when the question is unmounted', async () => {
    const page = staticChat(false);
    const { manager, scroller } = page;
    const marker = { id: 'question', element: page.target(3000) };
    manager.markers = [marker];
    manager.markerMap = new Map([[marker.id, marker]]);
    manager.adapter.supportsDeferredNodeNavigation = () => true;
    let lookups = 0;
    manager._showNodeNavigationLoading = () => ({ close() {} });
    manager.adapter.resolveTimelineTarget = async () => { lookups++; return null; };
    manager.activeTurnId = 'previous';
    let failures = 0;
    manager.showErrorToast = () => failures++;
    assert.equal(manager.scrollToIndex(0), true);
    page.advance(460);
    const landing = scroller.scrollTop;
    assert.ok(Math.abs(landing - 2970) <= 1);
    class ReaderWheel extends Event {
        get isTrusted() { return true; }
        get deltaY() { return 360; }
    }
    scroller.dispatchEvent(new ReaderWheel('wheel'));
    page.advance(32); // A nested code block consumed this first wheel.
    assert.equal(manager._markerNavigationController.signal.aborted, false);
    scroller.dispatchEvent(new ReaderWheel('wheel'));
    scroller.scrollTop += 360;
    // The virtual list can release the question before the next animation frame.
    marker.element.isConnected = false;
    const writes = page.writes.length;
    page.advance(1000);
    await new Promise(setImmediate);
    assert.equal(manager._markerNavigationController.signal.reason, 'user-navigation');
    assert.equal(scroller.scrollTop, landing + 360);
    assert.equal(page.writes.length, writes);
    assert.equal(lookups, 0);
    assert.equal(failures, 0);
    assert.equal(manager.activeTurnId, 'previous');
});

test('a compositor scroll can reach its new position before the passive wheel listener runs', async () => {
    const page = staticChat(false);
    const element = page.target(3000);
    const controller = new AbortController();
    const result = page.manager.smoothScrollTo(element, 400, {
        marker: { id: 'question', element }, signal: controller.signal,
        onUserScroll: () => controller.abort('user-navigation')
    });
    page.advance(460);
    const landing = page.scroller.scrollTop;
    page.scroller.scrollTop += 850;
    class CompositorWheel extends Event {
        get isTrusted() { return true; }
        get deltaY() { return 850; }
    }
    page.scroller.dispatchEvent(new CompositorWheel('wheel'));
    element.isConnected = false;
    page.advance(32);
    assert.equal(await result, false);
    assert.equal(controller.signal.reason, 'user-navigation');
    assert.equal(page.scroller.scrollTop, landing + 850);
});

test('Claude stops following a recycled UUID during landing and keeps legacy index targets usable', async () => {
    const page = staticChat(false);
    const { ClaudeAdapter } = loadTimeline();
    const adapter = new ClaudeAdapter();
    const manager = page.manager;
    manager.adapter = adapter;
    manager.conversationContainer = page.scroller;
    let offset = 3000;
    const message = { id: '' };
    const row = {
        isConnected: true, matches: () => false, querySelector: () => message,
        getBoundingClientRect: () => ({ ...page.target(offset).getBoundingClientRect(), height: 80 })
    };
    assert.equal(manager._isNavigationTargetReady(row, { id: 'claude-4', element: row }), true);
    message.id = 'user-11111111-1111-1111-1111-111111111111';
    const marker = { id: adapter.generateTurnId(row, 4), element: row };
    const scrolling = manager.smoothScrollTo(row, 400, { marker });
    page.advance(460);
    assert.ok(Math.abs(page.scroller.scrollTop - (offset - adapter.getScrollOffset())) <= 1);
    const previousWrites = page.writes.length;
    message.id = 'user-22222222-2222-2222-2222-222222222222';
    offset = 600;
    page.advance(400);
    assert.equal(await scrolling, false);
    assert.equal(page.writes.length, previousWrites);
});

for (const remount of [true, false]) {
    test('Claude navigation handles a vanished marker when its row ' + (remount ? 'remounts' : 'stays unavailable'), async () => {
        const { scroller, target } = staticChat(false);
        const uuid = '11111111-1111-1111-1111-111111111111';
        const makeRow = offset => ({
            id: 'user-' + uuid, isConnected: true, matches: () => true,
            getBoundingClientRect: () => ({ ...target(offset).getBoundingClientRect(), height: 80 })
        });
        let row = makeRow(3100), now = 0, waits = 0;
        const scope = { isConnected: true, contains: element => element === row, querySelectorAll: () => row ? [row] : [] };
        const { TimelineManager, ClaudeAdapter } = loadTimeline({
            document: { querySelector: () => ({}) }, location: { pathname: '/chat/' + uuid },
            Date: { now: () => now }, getComputedStyle: () => ({ flexDirection: 'column' }),
            TimelineI18n: { getMessage: () => 'failed' },
            requestAnimationFrame: callback => queueMicrotask(() => {
                now += 16;
                if (now === 32) {
                    row.isConnected = false;
                    row = null;
                    manager.markerMap.clear();
                }
                callback(now);
            })
        });
        const adapter = new ClaudeAdapter();
        const marker = { id: adapter.generateTurnId(row, 0), element: row };
        adapter._snapshot = { entries: [{ id: uuid, text: 'question', rowIndex: 0 }] };
        adapter._waitForTimelineRender = async () => {
            waits++;
            now += 600;
            if (remount) {
                row = makeRow(600);
                manager.markerMap.set(marker.id, { ...marker, element: row });
            }
        };
        let finish;
        const done = new Promise(resolve => { finish = resolve; });
        const manager = Object.assign(Object.create(TimelineManager.prototype), {
            adapter, scrollContainer: scroller, conversationContainer: scope, markers: [marker],
            markerMap: new Map([[marker.id, marker]]), _routeRows: { filter: (_adapter, rows) => rows },
            isCurrentPage: () => true, _showNodeNavigationLoading: () => ({ close() {} }),
            _recalcMarkerPositions() {}, updateActiveDotUI() {}, syncTimelineTrackToMain() {},
            _emitActiveChange: (_previous, id) => finish(id), showErrorToast: () => finish(null)
        });
        assert.equal(manager.scrollToIndex(0), true);
        assert.equal(await done, remount ? marker.id : null);
        assert.ok(waits > 0 && waits <= 17, 'resolve the original UUID within the Claude render deadline');
        if (remount) assert.ok(Math.abs(scroller.scrollTop - (600 - adapter.getScrollOffset())) <= 1);
    });
}

test('repeated clicks share the pending lookup and a different question replaces it', () => {
    const { manager } = staticChat(false);
    manager.markers = [{ id: 'chatgpt-a' }, { id: 'chatgpt-b' }];
    const lookups = [];
    manager._showNodeNavigationLoading = () => ({ close() {} });
    manager.adapter = {
        supportsDeferredNodeNavigation: () => true,
        findMarkerByStoredIndex: (key, markers) => markers.find(marker => marker.id === key),
        resolveTimelineTarget(marker, _scroller, signal, _onProgress, navigation) {
            lookups.push({ id: marker.id, signal, waitForTarget: navigation.waitForTarget === true });
            return new Promise(resolve => signal.addEventListener('abort', () => resolve(null), { once: true }));
        }
    };
    assert.equal(manager.scrollToIndex(0), true);
    // Marker objects can be rebuilt by the virtual list between the two clicks.
    manager.markers[0] = { id: 'chatgpt-a' };
    assert.equal(manager.scrollToIndex(0), true);
    assert.deepEqual(lookups.map(lookup => lookup.id), ['chatgpt-a']);
    assert.equal(lookups[0].signal.aborted, false);
    assert.equal(manager.scrollToIndex(1), true);
    assert.deepEqual(lookups.map(lookup => lookup.id), ['chatgpt-a', 'chatgpt-b']);
    assert.equal(lookups[0].signal.aborted, true);
    assert.equal(lookups[1].signal.aborted, false);
    assert.equal(lookups[1].waitForTarget, false);
    assert.equal(manager.navigateToStoredNode('chatgpt-a'), true);
    assert.equal(lookups[1].signal.aborted, true);
    assert.equal(lookups[2].waitForTarget, true);
    manager._markerNavigationController.abort();
});

test('only the current scroll guard may hand a running lookup back to the user', async () => {
    const { manager } = staticChat(false);
    const first = new EventTarget(), replacement = new EventTarget();
    const firstEvents = observeHistoryGuard(first), nextEvents = observeHistoryGuard(replacement);
    const pending = [];
    manager.markers = [{ id: 'chatgpt-a' }, { id: 'chatgpt-b' }];
    manager.scrollContainer = first;
    manager._showNodeNavigationLoading = () => ({ close() {} });
    manager.adapter = {
        supportsDeferredNodeNavigation: () => true,
        resolveTimelineTarget(_marker, container, signal, _onProgress, navigation) {
            navigation.protectScroll(container);
            navigation.protectScroll(container);
            return new Promise(resolve => {
                pending.push(resolve);
                signal.addEventListener('abort', () => resolve(null), { once: true });
            });
        }
    };
    assert.equal(manager.scrollToIndex(0), true);
    manager.scrollContainer = replacement;
    pending[0](null); // The first lookup returns after its original container was removed.
    await new Promise(setImmediate);
    const oldToken = firstEvents[0]?.token;
    assert.equal(typeof oldToken, 'string');
    assert.deepEqual(firstEvents, [{ action: 'start', token: oldToken }, { action: 'end', token: oldToken }]);
    const rebound = nextEvents[0]?.token;
    assert.equal(typeof rebound, 'string');
    assert.notEqual(oldToken, rebound);

    assert.equal(manager.scrollToIndex(1), true);
    await new Promise(setImmediate); // A late cleanup of the previous lookup must leave B in control.
    const newest = nextEvents[2]?.token;
    assert.equal(typeof newest, 'string');
    assert.notEqual(rebound, newest);
    assert.deepEqual(nextEvents, [
        { action: 'start', token: rebound }, { action: 'end', token: rebound }, { action: 'start', token: newest }
    ]);
    const handOver = (container, token) => container.dispatchEvent(
        new CustomEvent('ait:history-navigation-takeover', { detail: token }));
    handOver(first, oldToken);
    handOver(replacement, rebound);
    assert.equal(manager._markerNavigationController.signal.aborted, false);
    handOver(replacement, newest);
    assert.equal(manager._markerNavigationController.signal.reason, 'user-navigation');
    await new Promise(setImmediate);
    assert.equal(nextEvents.length, 4);
    assert.deepEqual(nextEvents[3], { action: 'end', token: newest });
});

test('a failed bookmark releases its scroll guard while the retry prompt is still open', async () => {
    const { manager } = staticChat(false);
    manager.scrollContainer = new EventTarget();
    const events = observeHistoryGuard(manager.scrollContainer);
    let promptOpen = false;
    manager._showNodeNavigationLoading = () => ({
        close() { promptOpen = false; }, showFailure() { promptOpen = true; }
    });
    manager._findStoredNodeMarker = () => ({ id: 'chatgpt-bookmark' });
    manager.adapter = {
        supportsDeferredNodeNavigation: () => true,
        async resolveTimelineTarget(_marker, container, _signal, _onProgress, navigation) {
            navigation.protectScroll(container);
            throw new Error('history unavailable');
        }
    };
    assert.equal(manager.navigateToStoredNode('bookmark'), true);
    const task = manager._nodeNavigationTask;
    assert.equal(await task.promise, false);
    assert.equal(task.status, 'failed');
    assert.equal(promptOpen, true);
    const token = events[0]?.token;
    assert.equal(typeof token, 'string');
    assert.deepEqual(events, [{ action: 'start', token }, { action: 'end', token }]);
    manager._markerNavigationController.abort();
    assert.equal(promptOpen, false);
    assert.equal(events.length, 2);
});
