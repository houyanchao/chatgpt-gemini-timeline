const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

const source = ['timeline/common.js', 'timeline/timeline-manager.js',
    'messageActions/selection-store.js', 'messageActions/message-loader.js', 'messageActions/action-manager.js']
    .map(name => readFileSync(join(__dirname, '../js', name), 'utf8')).join('\n');

function page() {
    const window = new EventTarget(), document = new EventTarget();
    const writes = [];
    let top = 200, olderPageLoaded = false;
    const scroller = Object.assign(new EventTarget(), {
        scrollHeight: 850, clientHeight: 400, clientTop: 0,
        getBoundingClientRect: () => ({ top: 0, bottom: 400 })
    });
    Object.defineProperty(scroller, 'scrollTop', {
        get: () => top,
        set(value) {
            writes.push(value);
            top = Math.max(0, Math.min(scroller.scrollHeight - scroller.clientHeight, value));
            scroller.dispatchEvent(new Event('scroll'));
            if (top === 0 && !olderPageLoaded) {
                olderPageLoaded = true;
                queueMicrotask(() => {
                    // The host prepends history and compensates for the newly added height.
                    scroller.scrollHeight += 150;
                    window.timelineManager.markers = [markerFor(earlier), ...window.timelineManager.markers];
                    top = 150;
                    scroller.dispatchEvent(new Event('scroll'));
                });
            }
        }
    });
    function message(id, y) {
        return { key: 'user:' + id, id, turnId: id, role: 'user', element: {
            isConnected: true,
            getBoundingClientRect: () => ({ top: y() - top, bottom: y() - top + 60 })
        } };
    }
    const records = [0, 1].map(i => message('question-' + i, () => i * 500 + (olderPageLoaded ? 150 : 0)));
    const earlier = message('oldest', () => 0);
    const markerFor = record => ({ id: 'chatgpt-' + record.id, element: record.element });
    window.timelineManager = {
        scrollContainer: scroller, activeTurnId: 'chatgpt-' + records[1].id,
        markers: records.map(markerFor)
    };
    const adapter = {
        platformId: 'chatgpt', getScrollContainer: () => scroller,
        getMessages: () => (olderPageLoaded ? [earlier, ...records] : records).filter(record => {
            const rect = record.element.getBoundingClientRect();
            return rect.bottom > -100 && rect.top < scroller.clientHeight + 100;
        }), getHistoryTargets: () => [],
        getConversationState: () => ({ turnIds: [earlier, ...records].map(record => record.id) }),
        isHistoryLoading: () => false
    };
    const { MessageActionLoader, MessageActionManager, MessageSelectionStore, TimelineManager } = vm.runInNewContext(
        source + '\n;({ MessageActionLoader, MessageActionManager, MessageSelectionStore, TimelineManager })', {
        window, document, performance, crypto, AbortController, DOMException, Event, CustomEvent, innerHeight: 400,
        location: { href: 'https://chatgpt.com/c/example' },
        getComputedStyle: element => ({ flexDirection: element.flexDirection || 'column' }),
        setTimeout: callback => setImmediate(callback), clearTimeout: clearImmediate
    });
    async function selectAll(actionId) {
        const manager = new MessageActionManager(adapter, []);
        const session = manager.session = {
            url: 'https://chatgpt.com/c/example', controller: new AbortController(),
            action: { id: actionId }, store: new MessageSelectionStore(), ui: { update() {} }
        };
        await manager.selectAll(session);
        assert.equal(session.notice, 'Loaded');
        return session.store.selection.map(message => message.id);
    }
    const load = (...args) => MessageActionLoader.load(...args);
    return { window, adapter, selectAll, load, loader: MessageActionLoader, writes, TimelineManager };
}

test('a stopped export restores the initial position', async () => {
    const { adapter, load, writes } = page();
    const controller = new AbortController();
    await assert.rejects(load(adapter, {
        selectAll: true, signal: controller.signal, onMessages: () => controller.abort()
    }), { name: 'AbortError' });
    assert.equal(writes.at(-1), 200);
});

test('other history traversals still restore the original reading position', async () => {
    for (const [platform, expected] of [['chatgpt', 600], ['gemini', 450]]) {
        const { adapter, load, writes } = page();
        adapter.platformId = platform;
        adapter.getScrollContainer().scrollTop = 450;
        const result = await load(adapter);
        assert.equal(result.complete, true);
        assert.equal(writes.at(-1), expected, platform);
    }
});

test('a reversed ChatGPT scroller restores the bottom at zero when interrupted', async () => {
    const { adapter, load } = page();
    const scroller = Object.assign(new EventTarget(), {
        flexDirection: 'column-reverse', clientHeight: 400, scrollHeight: 850, scrollTop: -0.5
    });
    adapter.getScrollContainer = () => scroller;
    const controller = new AbortController();
    await assert.rejects(load(adapter, { signal: controller.signal, onMessages() {
        assert.equal(scroller.scrollTop, -450);
        scroller.scrollHeight += 150;
        controller.abort();
    } }), { name: 'AbortError' });
    assert.equal(scroller.scrollTop, 0);
});

test('the original message wins over height growth and a recycled DOM reference', async () => {
    const { adapter, load } = page();
    const scroller = adapter.getScrollContainer();
    scroller.scrollHeight = 5000;
    scroller.scrollTop = 1250;
    const message = (key, element) => ({ id: key, turnId: key, key, role: 'user', element });
    const elementAt = y => ({ isConnected: true, getBoundingClientRect() {
        const top = y - scroller.scrollTop;
        return { top, bottom: top + 60 };
    } });
    const original = elementAt(1270);
    let rows = [message('reading', original)];
    adapter.getMessages = () => rows;
    await load(adapter, { stopWhen: () => true, onMessages() {
        scroller.scrollHeight += 3000;
        // Some height was added below the original message. The host recycled its DOM element.
        original.getBoundingClientRect = elementAt(100).getBoundingClientRect;
        rows = [message('other', original), message('reading', elementAt(1270 + 2854))];
    } });
    assert.equal(scroller.scrollTop, 4104);
});

test('a reversed ChatGPT scroller retains its distance from the bottom if the reading anchor disappears', async () => {
    const { adapter, load } = page();
    const scroller = Object.assign(new EventTarget(), {
        flexDirection: 'column-reverse', clientTop: 0, clientHeight: 400, scrollHeight: 5000, scrollTop: -1250,
        getBoundingClientRect: () => ({ top: 0 })
    });
    adapter.getScrollContainer = () => scroller;
    adapter.getMessages = () => [];
    await load(adapter, { stopWhen: () => true, onMessages() { scroller.scrollHeight += 2854; } });
    assert.equal(scroller.scrollTop, -1250);
});

test('ChatGPT screenshot and export select-all finish at the top in conversation order', async () => {
    for (const action of ['screenshot', 'export']) {
        const { adapter, selectAll } = page();
        const selected = await selectAll(action);
        assert.equal(adapter.getScrollContainer().scrollTop, 0, action);
        assert.deepEqual(Array.from(selected), ['oldest', 'question-0', 'question-1']);
    }
});

test('the All action on other platforms preserves its traversal and reading position', async () => {
    const { adapter, selectAll } = page();
    adapter.platformId = 'gemini';
    await selectAll('export');
    assert.equal(adapter.getScrollContainer().scrollTop, 200);
});

test('select-all uses the final reconciled order when the last sampled window had a provisional order', async () => {
    const { loader, selectAll } = page();
    loader.load = async (_adapter, { onMessages }) => {
        const rows = ['oldest', 'newest'].map(id => ({ id, key: 'user:' + id, turnId: id, role: 'user' }));
        const ordered = rows.map(row => row.key);
        await onMessages(rows, [...ordered].reverse());
        return { complete: true, order: ordered };
    };
    assert.deepEqual(Array.from(await selectAll('export')), ['oldest', 'newest']);
});

test('the active dot follows the upward traversal after older messages are inserted', async () => {
    const { window, adapter, load, TimelineManager } = page();
    const tm = window.timelineManager = Object.assign(Object.create(TimelineManager.prototype),
        window.timelineManager, { _apiTimelineMode: true, adapter: {}, ACTIVATE_AHEAD: 20 });
    const changes = [];
    window.addEventListener('timeline:activeChange', event => changes.push({ id: tm.activeTurnId, direction: event.detail.direction }));
    await load(adapter, { selectAll: true, onMessages() {
        tm.markerMap = new Map(tm.markers.map(marker => [marker.id, marker]));
        tm.computeActiveByScroll();
    } });
    await new Promise(setImmediate);
    assert.deepEqual(changes, [{ id: 'chatgpt-question-0', direction: -1 }, { id: 'chatgpt-oldest', direction: -1 }]);
    assert.equal(tm.activeTurnId, 'chatgpt-oldest');
});
