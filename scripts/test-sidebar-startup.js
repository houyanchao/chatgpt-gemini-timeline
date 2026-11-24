const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

const source = readFileSync(join(__dirname, '../js/sidebarStarred/index.js'), 'utf8');

function setup({ readSettings = () => ({}), init = async () => true } = {}) {
    let start, onSettings, onStop, onDom;
    const timers = new Set();
    const managers = [];
    const adapter = { findInsertionPoint: () => null, restoreNativeList() {} };
    const session = { active: true, onStop: callback => { onStop = callback; } };
    const window = {
        AITPlatformFeatures: { register: (_, callback) => { start = callback; } },
        AITContentSession: session,
        sidebarStarredAdapterRegistry: { getAdapter: () => adapter }
    };
    vm.runInNewContext(source, {
        window,
        getCurrentPlatform: () => ({ id: 'test', features: { sidebarStarred: true } }),
        StorageAdapter: {
            get: readSettings,
            addChangeListener: callback => { onSettings = callback; },
            removeChangeListener: () => { onSettings = null; }
        },
        DOMObserverManager: { getInstance: () => ({
            subscribeBody(_, { callback }) {
                onDom = callback;
                return () => { onDom = null; };
            }
        }) },
        SidebarStarredManager: class {
            static REINJECT_INTERVAL = 3000;
            constructor() { managers.push(this); }
            init() { return init(); }
            destroy() { this.destroyed = true; }
        },
        setInterval(callback) { timers.add(callback); return callback; },
        clearInterval(callback) { timers.delete(callback); }
    });
    return {
        start, managers, timers,
        addSidebar() { adapter.findInsertionPoint = () => ({ parent: { isConnected: true } }); },
        domChange: () => onDom?.(),
        toggle: enabled => onSettings?.({ sidebarStarredPlatformSettings: { newValue: { test: enabled } } }, 'local'),
        stop() { session.active = false; onStop(); }
    };
}

test('a late sidebar mounts without a layout box after repeated empty probes', async () => {
    const page = setup();
    await page.start();
    for (let tick = 0; tick < 10; tick++) {
        for (const callback of [...page.timers]) await callback();
    }
    page.addSidebar();
    await page.domChange();
    await page.domChange();
    assert.equal(page.managers.length, 1);
    assert.equal(page.timers.size, 0);
});

test('disabling while waiting cancels the mount, re-enabling starts it once', async () => {
    const page = setup();
    await page.start();
    page.toggle(false);
    page.addSidebar();
    await page.domChange();
    assert.equal(page.timers.size, 0);
    assert.equal(page.managers.length, 0);
    page.toggle(true);
    page.toggle(true);
    assert.equal(page.managers.length, 1);
    page.stop();
    assert.equal(page.managers[0].destroyed, true);
    page.toggle(true);
    assert.equal(page.managers.length, 1);
});

test('a stale initialization cannot tear down its replacement', async () => {
    let finishFirst;
    const pending = new Promise(resolve => { finishFirst = resolve; });
    let attempts = 0;
    const page = setup({ init: () => ++attempts === 1 ? pending : Promise.resolve(true) });
    await page.start();
    page.addSidebar();
    const first = page.domChange();
    page.toggle(false);
    page.toggle(true);
    finishFirst(false);
    await first;
    assert.equal(page.managers.length, 2);
    assert.equal(page.managers[0].destroyed, true);
    assert.equal(page.managers[1].destroyed, undefined);
    assert.equal(page.timers.size, 0);
});

test('a settings change beats an older pending startup read', async () => {
    let onRead, finishRead;
    const reading = new Promise(resolve => { onRead = resolve; });
    const stored = new Promise(resolve => { finishRead = resolve; });
    const page = setup({ readSettings: () => { onRead(); return stored; } });
    page.addSidebar();
    const ready = page.start();
    await reading;
    page.toggle(false);
    finishRead({ test: true });
    await ready;
    assert.equal(page.managers.length, 0);
    assert.equal(page.timers.size, 0);
});
