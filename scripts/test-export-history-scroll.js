const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

const read = file => readFileSync(join(__dirname, '../js', file), 'utf8');
const isolated = ['timeline/common.js', 'messageActions/selection-store.js',
    'messageActions/adapters/base.js', 'messageActions/adapters/chatgpt.js', 'messageActions/message-loader.js']
    .map(read).join('\n');
const main = read('preventAutoScroll/chatgpt-scroll-guard.js');

function chat(initial = 1962) {
    const document = new EventTarget(), window = new EventTarget();
    class Element extends EventTarget {
        get scrollTop() { return this.y; }
        set scrollTop(top) { this.y = top; }
        scrollTo({ top } = {}) { if (top !== undefined) this.y = top; }
        closest() { return null; }
        contains(node) { return node === this; }
    }
    const scroller = Object.assign(new Element(), { y: initial, clientHeight: 585, scrollHeight: 1962 + 585 });
    const writes = [], host = [], scanFollow = [];
    document.createElement = () => new Element();
    const globals = {
        document, window, EventTarget, Element, CustomEvent, DOMException, AbortController, crypto: webcrypto,
        location: { hostname: 'chatgpt.com', pathname: '/c/example', href: 'https://chatgpt.com/c/example' },
        getComputedStyle: () => ({ flexDirection: 'column' }), innerHeight: 585,
        setTimeout: (fn, ms) => ms < 120000 ? setImmediate(fn) : undefined, clearTimeout: clearImmediate
    };
    vm.runInNewContext(main, globals);
    const { MessageActionLoader, ChatGPTMessageActionsAdapter, TimelineUtils } = vm.runInNewContext(isolated
        + '\n;({ MessageActionLoader, ChatGPTMessageActionsAdapter, TimelineUtils })', globals);
    window.timelineManager = { scrollContainer: scroller };
    // Node EventTarget has no DOM bubbling. Forward the isolated-world start event to the document.
    scroller.addEventListener('ait:history-navigation-start', event => {
        const copy = new CustomEvent(event.type, { detail: event.detail });
        Object.defineProperty(copy, 'target', { value: scroller });
        document.dispatchEvent(copy);
    });
    const hostScrollTo = scroller.scrollTo.bind(scroller);
    // The extension writes in its isolated world; only the host calls the patched MAIN prototype.
    Object.defineProperty(scroller, 'scrollTop', {
        get: () => scroller.y,
        set(value) {
            writes.push(value);
            scroller.y = value;
            if (value === 468) queueMicrotask(() => {
                hostScrollTo({ top: 4816 });
                scanFollow.push(scroller.y);
            });
            if (value !== 0) return;
            queueMicrotask(() => {
                if (!host.length) {
                    scroller.scrollHeight += 2854;
                    hostScrollTo({ top: 2854 });
                }
                const compensated = scroller.y;
                hostScrollTo({ top: 4816 });
                host.push({ compensated, afterFollow: scroller.y });
            });
        }
    });
    const adapter = Object.assign(new ChatGPTMessageActionsAdapter(), {
        isHistoryLoading: () => false, getHistoryTargets: () => [],
        getMessages() {
            const position = Math.min(10, Math.floor(scroller.y / 468));
            const id = 'turn-' + position;
            return [{ key: 'user:' + id, id, turnId: id, role: 'user', position }];
        }
    });
    function pressEnd() {
        const event = new Event('keydown');
        Object.defineProperties(event, {
            isTrusted: { value: true }, target: { value: scroller }, key: { value: 'End' }
        });
        document.dispatchEvent(event);
        hostScrollTo({ top: 4816 });
    }
    function startNavigation() {
        const guard = TimelineUtils.createHistoryScrollGuard(new AbortController());
        guard.protect(scroller);
        return guard;
    }
    return { load: options => MessageActionLoader.load(adapter, options), scroller, writes, host,
        scanFollow, pressEnd, hostScrollTo, startNavigation };
}

test('ChatGPT export preserves the 2854px prepend and rejects the following jump to 4816 before scanning', async () => {
    const page = chat();
    const result = await page.load();
    assert.deepEqual(page.host[0], { compensated: 2854, afterFollow: 2854 });
    assert.ok(page.host.slice(1).every(row => row.afterFollow === 0));
    assert.ok(page.writes.includes(468), 'the export advanced to the downward scan');
    assert.deepEqual(page.scanFollow, [468], 'a delayed host follow must not skip the middle questions');
    assert.equal(result.complete, true);
    assert.equal(result.messages.size, 11);
});

for (const outcome of ['cancel', 'error']) {
    test('ChatGPT export releases the history guard after ' + outcome, async () => {
        const page = chat(900);
        const controller = new AbortController();
        await assert.rejects(page.load({ signal: controller.signal, onMessages() {
            if (outcome === 'cancel') controller.abort();
            else throw new Error('collector failed');
        } }), outcome === 'cancel' ? { name: 'AbortError' } : /collector failed/);
        assert.equal(page.host[0].afterFollow, 2854);
        assert.equal(page.scroller.scrollTop, 3754, 'preserve the original reading point after the 2854px prepend');
        page.hostScrollTo({ top: 4816 });
        assert.equal(page.scroller.scrollTop, 4816);
    });
}

test('a native End during history loading stops export without restoring the old position', async () => {
    const page = chat(900);
    let writesAtTakeover;
    await assert.rejects(page.load({ onMessages() {
        writesAtTakeover = page.writes.length;
        page.pressEnd();
    } }), { name: 'AbortError' });
    assert.equal(page.writes.length, writesAtTakeover);
    assert.equal(page.scroller.scrollTop, 4816);
});

test('a newer timeline guard takes over without a stale export restoring or disarming it', async () => {
    const page = chat(900);
    let next, writesAtTakeover;
    await assert.rejects(page.load({ onMessages() {
        writesAtTakeover = page.writes.length;
        next = page.startNavigation();
    } }), { name: 'AbortError' });
    assert.equal(page.writes.length, writesAtTakeover);
    page.hostScrollTo({ top: 4816 });
    assert.equal(page.scroller.scrollTop, 2854);
    next.close();
    page.hostScrollTo({ top: 4816 });
    assert.equal(page.scroller.scrollTop, 4816);
});

test('a stopped export returning from capture cannot restore over a newer timeline jump', async () => {
    const page = chat(900);
    const controller = new AbortController();
    let next, writesAfterJump;
    await assert.rejects(page.load({ signal: controller.signal, async onMessages() {
        controller.abort();
        next = page.startNavigation();
        page.scroller.scrollTop = 720;
        writesAfterJump = page.writes.length;
        await Promise.resolve();
    } }), { name: 'AbortError' });
    assert.equal(page.writes.length, writesAfterJump);
    assert.equal(page.scroller.scrollTop, 720);
    next.close();
});
