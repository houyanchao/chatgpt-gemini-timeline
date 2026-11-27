const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

const read = path => readFileSync(join(__dirname, '../js', path), 'utf8');
const id = 'abcdefab-abcd-abcd-abcd-abcdefabcdef';
const question = key => ({ id: key, author: { role: 'user' }, content: { content_type: 'text', parts: [key] } });
const reply = (key, extra) => ({ ...question(key), author: { role: 'assistant' }, ...extra });
function page(respond) {
    const location = new URL('https://chatgpt.com/c/' + id), document = new EventTarget();
    const window = { async fetch(input) {
        const payload = await respond(new URL(input.url || input, location), input);
        return { ok: !!payload, clone() { return this; }, async json() { return payload; } };
    } };
    const globals = { window, document, location, URL, Request, Headers, AbortController, CustomEvent };
    vm.runInNewContext(read('apiCapture/chatgpt.js'), globals);
    const Adapter = vm.runInNewContext('class SiteAdapter {}\n' + read('timeline/adapters/chatgpt.js') + '\n;ChatGPTAdapter', globals);
    const adapter = new Adapter();
    const Actions = vm.runInNewContext(read('messageActions/adapters/base.js') + '\n' +
        read('messageActions/adapters/chatgpt.js') + '\n;ChatGPTMessageActionsAdapter', globals);
    const actions = new Actions();
    actions.getTimelineAdapter = () => adapter;
    return { adapter, actions,
        async fetch(endpoint) { await window.fetch(location.origin + '/backend-api/' + endpoint + '/' + id); await new Promise(setImmediate); },
        branch() { adapter._pullConvTexts(id); return adapter.getConversationBranch(); }
    };
}

const messages = [question('q1'), reply('tool-call', { recipient: 'web.run' }),
    reply('thought', { content: { content_type: 'thoughts' } }), reply('answer1'),
    reply('continued-answer'), question('q2'), reply('hidden', { metadata: { is_visually_hidden_from_conversation: true } }),
    { ...question('tool'), author: { role: 'tool' }, recipient: 'assistant' }, question('q3')];

test('opening a selection panel reads the count even when it missed the branch update event', async () => {
    const p = page(() => ({ messages, page_info: { has_previous_page: false } }));
    await p.fetch('conversations');
    const { actions } = p;
    assert.equal(actions.getConversationState(), null);
    assert.equal(actions.getConversationState({ refresh: true }).messageTotal, 4);
});

function mappingOf(records) {
    return { current_node: records.at(-1).id, mapping: Object.fromEntries(records.map((m, i) =>
        [m.id, { id: m.id, parent: records[i - 1]?.id, message: m }])) };
}

for (const endpoint of ['conversation', 'conversations']) {
    test(endpoint + ' panel receives the appended question and reply through the shared adapter without scrolling', async () => {
        const previous = [question('q1'), reply('r1')];
        const latest = [...previous, question('q2'), reply('r2')];
        let records = previous;
        const p = page(url => {
            if (endpoint === 'conversation') return mappingOf(records);
            // The paged branch ends at r2. An older mapping contains it but continues beyond it.
            if (url.pathname.includes('/conversation/')) return mappingOf([...latest, question('old-q3'), reply('old-r3')]);
            if (url.searchParams.has('before')) return { messages: previous, page_info: { has_previous_page: false } };
            return records === previous ? { messages: previous, page_info: { has_previous_page: false } }
                : { messages: latest.slice(2), page_info: { has_previous_page: true, start_cursor: 'older' } };
        });
        await p.fetch(endpoint);
        assert.equal(p.branch().messageTotal, 2);
        p.adapter._supplementalTimelineOrder.after = ['chatgpt-q2'];
        records = latest;
        p.adapter.subscribeCapturedChatsDataUpdated(() => {}); // timeline consumes the same update first
        const totals = [];
        p.actions.subscribeConversationChanges(() => totals.push(p.actions.getConversationState()?.messageTotal));
        assert.equal(p.actions.getConversationState({ refresh: true }).messageTotal, undefined);
        await new Promise(setImmediate);
        assert.equal(totals.at(-1), 4);
        assert.deepEqual(Array.from(p.actions.getConversationState().turnIds), ['q1', 'q2']);
    });
}

test('concurrent panels share a refresh, and a delayed refresh cannot replace a newer native branch', async () => {
    const first = [question('original')], next = [question('current')];
    let finish, refreshes = 0, current = first;
    const p = page((_url, input) => {
        if (input instanceof Request) {
            refreshes++;
            return new Promise(resolve => { finish = resolve; });
        }
        return mappingOf(current);
    });
    await p.fetch('conversation');
    p.adapter._supplementalTimelineOrder.after = ['chatgpt-current'];
    p.actions.getConversationState({ refresh: true });
    p.actions.getConversationState({ refresh: true });
    assert.equal(refreshes, 1);
    current = next;
    await p.fetch('conversation');
    finish(mappingOf(first));
    await new Promise(setImmediate);
    assert.deepEqual(Array.from(p.branch().turnIds), ['current']);
});

test('reopening a complete paginated conversation does not issue extra history requests', async () => {
    const latest = [question('q2'), reply('r2')];
    let requests = 0;
    const p = page(url => {
        requests++;
        if (url.pathname.includes('/conversation/')) return mappingOf([question('q1'), reply('r1'), ...latest, question('stale')]);
        if (url.searchParams.has('before')) return { messages: [question('q1'), reply('r1')], page_info: { has_previous_page: false } };
        return { messages: latest, page_info: { has_previous_page: true, start_cursor: 'older' } };
    });
    await p.fetch('conversations');
    p.branch();
    await new Promise(setImmediate);
    assert.deepEqual(Array.from(p.branch().turnIds), ['q1', 'q2'], 'ignore a mapping with a stale descendant on initial load');
    const originalRequests = requests;
    for (let i = 0; i < 3; i++) {
        assert.equal(p.actions.getConversationState({ refresh: true, messages: [{ role: 'user', id: 'q2' }] }).messageTotal, 4);
    }
    await new Promise(setImmediate);
    assert.equal(requests, originalRequests);
});

test('opening during pagination refreshes the latest question even if the original page was stale', async () => {
    const firstPage = [question('q2'), reply('r2')];
    const latest = [question('q1'), reply('r1'), ...firstPage, question('q3')];
    let resolveOldMapping;
    const p = page((url, input) => {
        if (url.pathname.includes('/conversation/')) return new Promise(resolve => { resolveOldMapping = resolve; });
        return input instanceof Request ? { messages: latest, page_info: { has_previous_page: false } }
            : { messages: firstPage, page_info: { has_previous_page: true, start_cursor: 'old' } };
    });
    await p.fetch('conversations');
    p.branch();
    assert.equal(typeof resolveOldMapping, 'function');
    const mounted = [{ role: 'user', id: 'q3' }];
    p.actions.subscribeConversationChanges(() => {});
    assert.equal(p.actions.getConversationState({ refresh: true, messages: mounted }), null);
    await new Promise(setImmediate);
    resolveOldMapping(mappingOf(latest.slice(0, -1)));
    await new Promise(setImmediate);
    assert.equal(p.actions.getConversationState({ messages: mounted }).messageTotal, 5);
});

test('receiving the first answer to a known last question refreshes its total', async () => {
    let records = [question('q1')];
    const p = page(() => mappingOf(records));
    await p.fetch('conversation');
    assert.equal(p.branch().messageTotal, 1);
    records = [...records, reply('r1')];
    const mounted = [{ role: 'assistant', id: 'r1', turnId: 'q1' }];
    p.actions.subscribeConversationChanges(() => {});
    assert.equal(p.actions.getConversationState({ refresh: true, messages: mounted }).messageTotal, undefined);
    await new Promise(setImmediate);
    assert.equal(p.actions.getConversationState({ messages: mounted }).messageTotal, 2);
});

test('a branch switched before opening the panel becomes its initial baseline when the refresh arrives', async () => {
    let records = [question('old')];
    const p = page(() => mappingOf(records));
    await p.fetch('conversation');
    records = [question('current'), reply('answer')];
    const mounted = [{ role: 'user', id: 'current', key: 'user:current' }];
    const Manager = vm.runInNewContext(read('messageActions/action-manager.js') + '\n;MessageActionManager', { AbortController });
    const manager = new Manager(p.actions, []);
    p.actions.subscribeConversationChanges(() => {});
    const session = { store: { messages: new Map([[mounted[0].key, mounted[0]]]), selection: [] },
        conversation: p.actions.getConversationState({ refresh: true, messages: mounted }) };
    assert.equal(session.conversation, null);
    assert.equal(manager.conversationChanged(session, mounted), false);
    await new Promise(setImmediate);
    assert.equal(manager.conversationChanged(session, mounted), false);
    assert.deepEqual(Array.from(session.conversation.turnIds), ['current']);
    assert.equal(session.conversation.messageTotal, 2);
});

test('mapping counts only selectable questions and reply groups on the active branch', async () => {
    const mapping = {};
    for (const [i, m] of messages.entries()) mapping[m.id] = { id: m.id, parent: messages[i - 1]?.id, message: m };
    mapping.alternative = { id: 'alternative', parent: 'q3', message: reply('alternative') };
    const p = page(() => ({ mapping, current_node: 'q3' }));
    await p.fetch('conversation');
    const branch = p.branch();
    assert.deepEqual(Array.from(branch.turnIds), ['q1', 'q2', 'q3']);
    assert.equal(branch.messageTotal, 4);
    p.adapter._supplementalTimelineOrder.after = ['chatgpt-new-question'];
    assert.equal(p.adapter.getConversationBranch().messageTotal, undefined, 'newer DOM questions invalidate the old count');
});

test('sectioned history publishes a total only after assembling the full branch across page boundaries', async () => {
    const p = page(url => {
        if (url.pathname.includes('/conversation/')) return null;
        if (url.searchParams.has('before')) return { messages: messages.slice(0, 5), page_info: { has_previous_page: false } };
        return { messages: messages.slice(4), page_info: { has_previous_page: true, start_cursor: 'older' } };
    });
    await p.fetch('conversations');
    assert.equal(p.branch(), null);
    await new Promise(setImmediate);
    assert.equal(p.branch().messageTotal, 4);
});

const toolImage = (key, extra = {}) => ({
    id: key, author: { role: 'tool', name: 'image-tool-' + key }, recipient: 'all', status: 'finished_successfully',
    content: { content_type: 'multimodal_text', parts: [{ content_type: 'image_asset_pointer', asset_pointer: 'asset-' + key }] },
    ...extra
});

for (const endpoint of ['conversation', 'conversations']) {
    test(endpoint + ' counts 43 questions, 28 image-only replies and 14 text replies as 85 messages', async () => {
        const branch = [];
        for (let i = 1; i <= 43; i++) {
            branch.push(question('q' + i));
            if (i <= 28) branch.push(toolImage('image' + i));
            else if (i < 43) {
                if (i === 29) branch.push(reply('error', { author: { role: 'tool' }, content: { content_type: 'system_error' } }));
                branch.push(reply('answer' + i));
            }
        }
        const mapping = Object.fromEntries(branch.map((m, i) => [m.id, { id: m.id, parent: branch[i - 1]?.id, message: m }]));
        const p = page(url => {
            if (endpoint === 'conversation') return { current_node: 'q43', mapping };
            if (url.pathname.includes('/conversation/')) return null;
            return url.searchParams.has('before')
                ? { messages: branch.slice(0, 28), page_info: { has_previous_page: false } }
                : { messages: branch.slice(27), page_info: { has_previous_page: true, start_cursor: 'older' } };
        });
        await p.fetch(endpoint);
        if (endpoint === 'conversations') {
            assert.equal(p.branch(), null);
            await new Promise(setImmediate);
        }
        assert.equal(p.branch().turnIds.length, 43);
        assert.equal(p.branch().messageTotal, 85);
    });
}

test('several pictures and text in one reply count once; private tool images do not add replies', async () => {
    const records = [question('first'), toolImage('a'), toolImage('b'), reply('caption'),
        question('second'), toolImage('internal', { recipient: 'assistant' }),
        toolImage('hidden', { metadata: { is_visually_hidden_from_conversation: true } }),
        toolImage('analysis', { channel: 'analysis' }), question('third'), reply('visible-stream', { status: 'in_progress' })];
    const p = page(() => ({ messages: records, page_info: { has_previous_page: false } }));
    await p.fetch('conversations');
    assert.equal(p.branch().messageTotal, 5);
});

for (const last of [reply('image-tool', { author: { role: 'tool' }, content: { content_type: 'multimodal_text' } }),
    reply('new-format', { content: { content_type: 'widget' } }),
    reply('streaming', { status: 'in_progress', content: { content_type: 'text', parts: [''] } })]) {
    test('an uncertain ' + last.id + ' reply leaves the full selectable count unknown', async () => {
        const p = page(() => ({ messages: [question('q1'), last], page_info: { has_previous_page: false } }));
        await p.fetch('conversations');
        const branch = p.branch();
        assert.deepEqual(Array.from(branch.turnIds), ['q1']);
        assert.equal(branch.messageTotal, undefined);
    });
}
