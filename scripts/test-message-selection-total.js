const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

const source = ['selection-store.js', 'selection-ui.js', 'adapters/base.js', 'adapters/kimi.js', 'adapters/claude.js']
    .map(file => readFileSync(join(__dirname, '../js/messageActions', file), 'utf8')).join('\n');
const document = {};
const { Store, UI, Kimi, Claude } = vm.runInNewContext(source +
    '\n;({ Store: MessageSelectionStore, UI: MessageSelectionUI, Kimi: KimiMessageActionsAdapter, Claude: ClaudeMessageActionsAdapter })', { document });

const user = id => ({ key: 'user:' + id, role: 'user', id, turnId: id });
const reply = (id, turnId) => ({ key: 'assistant:' + id, role: 'assistant', id, turnId });

test('the denominator uses all branch messages independently of mounted, selected and eligible counts', () => {
    const store = new Store(), ui = Object.create(UI.prototype);
    ui.adapter = {};
    const conversation = { turnIds: ['a', 'b', 'c', 'd'], messageTotal: 7 };
    store.merge([user('d'), { ...reply('r', 'd'), generating: true }]);
    store.selectAll();
    assert.equal(store.selection.length, 1);
    assert.equal(ui.getMessageTotal({ store, conversation }), 7);
    assert.equal(ui.getMessageTotal({ store }), '…');
    store.complete = true;
    assert.equal(ui.getMessageTotal({ store }), 2);
    store.merge([user('new')]);
    assert.equal(ui.getMessageTotal({ store, conversation }), '…');
    assert.equal(ui.getMessageTotal({ store, conversation: { turnIds: ['d', 'new'], messageTotal: 2 } }), '…');
    ui.adapter = new Kimi();
    assert.equal(ui.getMessageTotal({ store }), 3);
});

test('older windows stay before a scanned suffix when only the pinned last question overlaps', () => {
    const store = new Store();
    store.merge([user('d'), reply('dr', 'd'), user('last')], { prepend: true });
    store.merge([user('b'), reply('br', 'b'), user('last')], { prepend: true });
    store.merge([user('a')], { prepend: true });
    assert.deepEqual(Array.from(store.order), ['user:a', 'user:b', 'assistant:br', 'user:d', 'assistant:dr', 'user:last']);
});

test('Claude can use the native transcript size when the branch snapshot is unavailable', () => {
    const store = new Store(), ui = Object.create(UI.prototype);
    ui.adapter = new Claude();
    store.merge([user('d')]);
    let value = '10';
    document.querySelector = () => ({ getAttribute: () => value });
    assert.equal(ui.getMessageTotal({ store }), 10);
    value = '-1';
    assert.equal(ui.getMessageTotal({ store }), '…');
});

test('branch order puts the question before its replies and keeps observed ordering for an unassigned reply', () => {
    const store = new Store();
    store.merge([reply('dr', 'd'), user('d'), user('a')]);
    store.sortByTurnIds(['a', 'd']);
    assert.deepEqual(Array.from(store.order), ['user:a', 'user:d', 'assistant:dr']);
    store.merge([reply('unknown', 'unknown')], { prepend: true });
    const observed = Array.from(store.order);
    store.sortByTurnIds(['d', 'a']);
    assert.deepEqual(Array.from(store.order), observed);
});
