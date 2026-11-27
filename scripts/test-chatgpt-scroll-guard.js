const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

const source = readFileSync(join(__dirname, '../js/preventAutoScroll/chatgpt-scroll-guard.js'), 'utf8');

function setup(hostname = 'chatgpt.com', nativeResult) {
    const document = new EventTarget();
    const window = new EventTarget();
    const timers = new Set();
    class Element extends EventTarget {
        constructor() {
            super();
            this.y = 135;
            this.clientHeight = 700;
            this.scrollHeight = 2662;
            this.writes = [];
        }
        closest(selector) {
            if (selector === '[data-ait-scroll-anchor]') return this.sendAnchor ? this : null;
            if (selector === 'button[class~="group/scroll-to-bottom"]') return this.jumpButton || null;
            return this.matchesControl ? this : null;
        }
        contains(target) {
            for (let el = target; el; el = el.parentElement) if (el === this) return true;
            return false;
        }
        getAttribute() { return null; }
        get scrollTop() { return this.y; }
        set scrollTop(value) { this.writes.push(value); this.y = value; }
        scrollTo(x, y) {
            const top = typeof x === 'object' ? x.top : y;
            if (top !== undefined) this.y = top;
            this.writes.push(top);
            return nativeResult;
        }
        scroll(x, y) { this.y = y; this.writes.push(y); }
        scrollBy(x, y) { this.y += y; this.writes.push(this.y); }
        scrollIntoView() { this.writes.push('intoView'); return nativeResult; }
    }
    const child = parent => Object.assign(new Element(), { parentElement: parent });
    document.documentElement = new Element();
    document.body = child(document.documentElement);
    document.createElement = () => new Element();
    vm.runInNewContext(source, {
        document, window, Element, EventTarget, CustomEvent, AbortController, location: { hostname },
        getComputedStyle: el => ({ flexDirection: el.reverse ? 'column-reverse' : 'column', overflowY: el.overflowY }),
        setTimeout: fn => { timers.add(fn); return fn; }, clearTimeout: fn => timers.delete(fn)
    });
    const scroller = child(child(document.body));
    function emit(receiver, type, target, properties) {
        const e = new CustomEvent(type, { detail: properties.detail });
        Object.defineProperty(e, 'target', { value: target });
        for (const key of ['isTrusted', 'key', 'shiftKey']) {
            if (key in properties) Object.defineProperty(e, key, { value: properties[key] });
        }
        receiver.dispatchEvent(e);
    }
    return {
        scroller, other: child(document.body), timers, child,
        start: (el, token) => emit(document, 'ait:history-navigation-start', el, { detail: token }),
        end: (el, token) => emit(el, 'ait:history-navigation-end', el, { detail: token }),
        input: (type, el, properties) => emit(document, type, el, properties)
    };
}

test('preserves prepend compensation and rejects the following jump to the new bottom', () => {
    const { scroller, other, start, end } = setup();
    const hostScrollTo = scroller.scrollTo.bind(scroller);
    start(scroller, 'old-question');
    scroller.scrollHeight += 2854;
    hostScrollTo({ top: 2989 });
    hostScrollTo({ top: 4816 });
    scroller.scroll(0, 4816);
    scroller.scrollBy(0, 1827);
    scroller.scrollTop = 9999;
    assert.deepEqual(scroller.writes, [2989]);
    other.scrollTo(0, 4816);
    assert.equal(other.scrollTop, 4816);
    hostScrollTo({ left: 25 });
    hostScrollTo(0, 3020);
    end(scroller, 'old-question');
    hostScrollTo(0, 4816);
    assert.deepEqual(scroller.writes, [2989, undefined, 3020, 4816]);
});

test('allows a prepend adjustment that preserves an existing bottom position', () => {
    const { scroller, start } = setup();
    scroller.y = 1962;
    start(scroller, 'latest');
    scroller.scrollHeight += 2854;
    scroller.scrollTo({ top: 4816 });
    assert.deepEqual(scroller.writes, [4816]);
});

test('renewing a long export keeps its pending prepend compensation and one cleanup timer', () => {
    const { scroller, start, end, timers } = setup();
    scroller.y = 1962;
    start(scroller, 'export');
    scroller.scrollHeight += 2854;
    start(scroller, 'export');
    scroller.scrollTo({ top: 4816 });
    assert.deepEqual(scroller.writes, [4816]);
    assert.equal(timers.size, 1);
    end(scroller, 'export');
    assert.equal(timers.size, 0);
});

test('only the current token can disarm a replacement navigation', () => {
    const { scroller, other, start, end, timers } = setup();
    start(scroller, 'first');
    start(scroller, 'second');
    end(scroller, 'first');
    scroller.scrollTop = 1962;
    assert.deepEqual(scroller.writes, []);
    start(other, 'third');
    scroller.scrollTop = 1962;
    end(scroller, 'second');
    other.scrollTop = 1962;
    assert.deepEqual(scroller.writes, [1962]);
    assert.deepEqual(other.writes, []);
    assert.equal(timers.size, 1);
    [...timers][0]();
    other.scrollTop = 1962;
    assert.deepEqual(other.writes, [1962]);
});

test('trusted user navigation releases protection before the native handler scrolls', () => {
    const { scroller, start, input } = setup();
    scroller.reverse = true;
    scroller.y = -800;
    start(scroller, 'up');
    scroller.scrollHeight += 800;
    input('click', scroller, { isTrusted: false });
    input('keydown', scroller, { isTrusted: true, key: 'a' });
    scroller.scrollTo(0, 0);
    assert.deepEqual(scroller.writes, []);
    const tokens = [];
    scroller.addEventListener('ait:history-navigation-takeover', e => {
        tokens.push(e.detail);
        scroller.scrollTo(0, 0);
    });
    input('keydown', scroller, { isTrusted: true, key: 'End' });
    assert.deepEqual(tokens, ['up']);
    assert.deepEqual(scroller.writes, [0]);
});

test('wheel, touch, repeated clicks, editing and a nested scroller leave history navigation active', () => {
    const { scroller, start, input, child, other } = setup();
    const editor = child(scroller), modal = child(scroller), code = child(scroller);
    editor.isContentEditable = true;
    modal.matchesControl = true;
    code.overflowY = 'auto';
    start(scroller, 'active');
    for (const type of ['wheel', 'touchstart', 'pointerdown', 'click']) {
        input(type, scroller, { isTrusted: true });
    }
    for (const el of [editor, modal, code, other]) input('keydown', el, { isTrusted: true, key: 'End' });
    input('keydown', scroller, { isTrusted: true, key: 'End', shiftKey: true });
    scroller.scrollTop = 1962;
    assert.deepEqual(scroller.writes, []);
});

test('only a trusted click on this chat’s native jump button takes over the active token', () => {
    const { scroller, other, child, start, input } = setup();
    const button = child(scroller.parentElement), icon = child(button);
    icon.jumpButton = button;
    other.jumpButton = other;
    const tokens = [];
    scroller.addEventListener('ait:history-navigation-takeover', e => tokens.push(e.detail));
    start(scroller, 'button');
    input('click', other, { isTrusted: true });
    input('click', icon, { isTrusted: false });
    input('pointerdown', icon, { isTrusted: true });
    assert.deepEqual(tokens, []);
    input('click', icon, { isTrusted: true });
    input('click', icon, { isTrusted: true });
    assert.deepEqual(tokens, ['button']);
    scroller.scrollTo(0, 1962);
    assert.deepEqual(scroller.writes, [1962]);
});

test('blocked calls keep the native return contract and proxy options use normal dictionary access', () => {
    for (const nativeResult of [undefined, Promise.resolve({ interrupted: false })]) {
        const { scroller, start } = setup('chatgpt.com', nativeResult);
        start(scroller, 'proxy');
        assert.equal(scroller.scrollTo({ top: 1962 }), nativeResult);
        const options = new Proxy({ top: 200 }, { getOwnPropertyDescriptor() { throw Error('opaque'); } });
        assert.equal(scroller.scrollTo(options), nativeResult);
        assert.deepEqual(scroller.writes, [200]);
    }
});

test('keeps the existing send guard independent and leaves Claude history navigation alone', () => {
    const { scroller, start } = setup('claude.ai');
    start(scroller, 'ignored');
    scroller.scrollTop = 1962;
    assert.deepEqual(scroller.writes, [1962]);
    scroller.sendAnchor = true;
    scroller.addEventListener('ait:before-programmatic-scroll', e => e.preventDefault());
    scroller.scrollIntoView();
    scroller.scrollTo(0, 100);
    assert.deepEqual(scroller.writes, [1962]);
});
