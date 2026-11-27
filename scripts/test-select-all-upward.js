const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

const source = ['timeline/common.js', 'messageActions/selection-store.js', 'messageActions/message-loader.js']
    .map(file => readFileSync(join(__dirname, '../js', file), 'utf8')).join('\n');

function conversation({ start = 'bottom', compensate = true, reverse = false, branchKnown = true, missing } = {}) {
    const window = new EventTarget(), document = new EventTarget();
    const turnCount = 8, turnHeight = 420, height = 280;
    // At first only the latest three turns have layout boxes. Pagination prepends up to three more.
    let oldest = 5, loading = false;
    const range = () => (turnCount - oldest) * turnHeight - height;
    let offset = start === 'bottom' ? range() : Math.floor(range() / 2);
    const originalReadingPoint = oldest * turnHeight + offset;
    const writes = [];
    const scroller = Object.assign(new EventTarget(), {
        clientHeight: height, clientTop: 0, getBoundingClientRect: () => ({ top: 0, bottom: height })
    });
    Object.defineProperties(scroller, {
        scrollHeight: { get: () => range() + height },
        scrollTop: { get: () => reverse ? offset - range() : offset, set(value) {
            const before = offset + oldest * turnHeight;
            offset = Math.max(0, Math.min(range(), reverse ? value + range() : value));
            writes.push({ before, after: offset + oldest * turnHeight, oldest, bottom: offset === range() });
            if (oldest && offset === 0 && !loading) {
                loading = true;
                queueMicrotask(() => {
                    const added = Math.min(3, oldest);
                    oldest -= added;
                    if (compensate) offset += added * turnHeight;
                    loading = false;
                });
            }
        } }
    });

    const turnIds = Array.from({ length: turnCount }, (_, index) => 'q' + index);
    const messages = turnIds.flatMap((turnId, index) => ['user', 'assistant'].map(role => {
        const id = role === 'user' ? turnId : 'r' + index;
        const start = index * turnHeight + (role === 'user' ? 0 : 205);
        const rect = () => {
            const top = start - oldest * turnHeight - offset;
            return { top, bottom: top + 70, height: 70, width: 320 };
        };
        const element = { getBoundingClientRect: rect, get isConnected() {
            const { top, bottom } = rect();
            return index >= oldest && top < height && bottom > 0;
        } };
        return { key: `${role}:${id}`, id, turnId, role, element };
    }));
    const adapter = {
        platformId: 'chatgpt', getScrollContainer: () => scroller,
        getConversationState: () => branchKnown ? { turnIds, messageTotal: messages.length } : null,
        getMessages: () => messages.filter(message => message.id !== missing && message.element.isConnected),
        isHistoryLoading: () => loading, getHistoryTargets: () => []
    };
    const Loader = vm.runInNewContext(source + '\n;MessageActionLoader', {
        window, document, AbortController, CustomEvent, DOMException, crypto, innerHeight: height,
        location: { href: 'https://chatgpt.com/c/example' },
        getComputedStyle: () => ({ flexDirection: reverse ? 'column-reverse' : 'column' }),
        setTimeout: callback => setImmediate(callback), clearTimeout: clearImmediate
    });
    return {
        load: options => Loader.load(adapter, { selectAll: true, ...options }), expected: messages.map(row => row.key),
        writes, originalReadingPoint, get readingPoint() { return oldest * turnHeight + offset; },
        get prepended() { return oldest < 5; }
    };
}

for (const config of [
    { start: 'bottom', compensate: true },
    { start: 'middle', compensate: false },
    { start: 'bottom', compensate: true, reverse: true, branchKnown: false }
]) {
    test('ChatGPT All captures each virtual message in chronological order and stays on the first question ' + JSON.stringify(config), async () => {
        const page = conversation(config), seen = new Set();
        let selectionOrder;
        const result = await page.load({ onMessages(current, order) {
            for (const message of current) seen.add(message.key);
            selectionOrder = Array.from(order);
        } });
        assert.equal(result.complete, true);
        assert.deepEqual(Array.from(result.order), page.expected);
        assert.deepEqual(selectionOrder, page.expected, 'the selection panel receives the chronological order');
        assert.deepEqual(seen, new Set(page.expected));
        assert.equal(page.readingPoint, 0, 'end at the first question');
        assert.ok(!page.writes.some(step => step.oldest < 5 && step.bottom), 'no sweep back to the newest message');
        if (config.compensate) assert.ok(page.writes.every(step => step.after <= step.before), 'only scan toward older messages');
    });
}

test('stopping All after a prepend returns to the original reading point', async () => {
    const page = conversation({ start: 'middle' }), controller = new AbortController();
    await assert.rejects(page.load({ signal: controller.signal, onMessages() {
        if (page.prepended) controller.abort();
    } }), { name: 'AbortError' });
    assert.equal(page.readingPoint, page.originalReadingPoint);
});

for (const missing of ['q3', 'r3']) {
    test('ChatGPT All reports incomplete when a branch message never mounted: ' + missing, async () => {
        const page = conversation({ missing });
        await assert.rejects(page.load(), /LoadIncomplete/);
    });
}

test('a pinned ChatGPT reply keeps its unmounted question through collection, export and a branch change', async () => {
    const extra = ['messageActions/adapters/base.js', 'messageActions/adapters/chatgpt.js',
        'messageActions/action-manager.js', 'conversationExport/export-action.js']
        .map(file => readFileSync(join(__dirname, '../js', file), 'utf8')).join('\n');
    const { adapter, manager, exporter, records, Loader } = vm.runInNewContext(source + '\n' + extra + `
        ;({ adapter: new ChatGPTMessageActionsAdapter(), manager: Object.create(MessageActionManager.prototype),
            exporter: new ConversationExportAction(), records: new MessageSelectionStore(), Loader: MessageActionLoader })
    `, { window: {}, location: { pathname: '/c/example' } });

    let top = 0;
    const height = 100, span = 160;
    const turns = ['q1', 'r1', 'q2', 'r2'];
    adapter.getRoot = () => ({ querySelectorAll(selector) {
        const rows = [];
        turns.forEach((id, index) => {
            // The outer div and inner section share the same ID. Unmounted rows retain only the outer shell.
            const shell = { matches: () => false, closest: () => null,
                getAttribute: name => name === 'data-turn-id-container' ? id : null };
            const shells = selector.includes('[data-turn-id-container]');
            if (shells) rows.push(shell);
            const y = [0, 50, 160, 210][index] - top;
            if (index !== 3 && (y >= height || y + 40 <= 0)) return;
            if (shells) rows.push(shell);
            const attrs = { 'data-turn-id': id, 'data-turn': index % 2 ? 'assistant' : 'user' };
            rows.push({ isConnected: true, matches: () => false, querySelector: () => null, closest: () => null,
                getAttribute: name => attrs[name] || null,
                getBoundingClientRect: () => ({ top: y, bottom: y + 40, width: 320, height: 40 }) });
        });
        return rows;
    } });
    adapter.getConversationState = () => ({ turnIds: ['q1', 'q2'], messageTotal: 4 });
    manager.adapter = adapter;
    assert.equal(adapter.getMessages().at(-1).turnId, 'q2', 'q2 has never mounted');
    records.selectAll();
    await Loader.collectUpward(adapter, {
        reverse: false, top: () => top, range: () => span, viewportTop: () => 0, height: () => height,
        scroll: value => { top = value; }, waitForRender: async () => {},
        records, collect: mounted => records.merge(mounted, { prepend: true })
    });
    assert.equal(records.complete, true);
    assert.deepEqual(Array.from(records.order), ['user:q1', 'assistant:r1', 'user:q2', 'assistant:r2']);
    const exported = exporter.buildTurns(records.selection, { get: key => key });
    assert.deepEqual(Array.from(exported, turn => [turn.id, turn.user, turn.assistant]), [
        ['q1', 'user:q1', 'assistant:r1'], ['q2', 'user:q2', 'assistant:r2']
    ]);
    const session = { store: records };
    assert.equal(manager.conversationChanged(session, adapter.getMessages()), false);
    turns[3] = 'new-reply';
    assert.equal(manager.conversationChanged(session, adapter.getMessages()), true);
});
