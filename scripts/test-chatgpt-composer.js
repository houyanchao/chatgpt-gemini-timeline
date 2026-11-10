const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fixture(adapterName = 'ChatGPTSmartEnterAdapter') {
    const inputs = [];
    const subscriptions = new Map();
    const listeners = new Map();
    const bodyListeners = new Map();
    const intervals = [];
    const timers = new Map();
    const observers = [];
    const frames = [];
    let petVisible = false;
    function addListener(handlers, type, callback, options = {}) {
        if (options.signal?.aborted) return;
        handlers.set(type, callback);
        options.signal?.addEventListener('abort', () => {
            if (handlers.get(type) === callback) handlers.delete(type);
        }, { once: true });
    }
    const document = {
        querySelector: selector => {
            const first = inputs.find(input => input.connected);
            return selector === '.yb-input-box-textarea' ? first?.reference || null : first || null;
        },
        querySelectorAll: () => inputs.filter(input => input.connected),
        body: {
            contains: input => input.connected,
            addEventListener: (type, callback) => bodyListeners.set(type, callback),
            removeEventListener: type => bodyListeners.delete(type)
        }
    };
    const window = {
        innerHeight: 900,
        addEventListener: (type, callback, options) => addListener(listeners, type, callback, options),
        removeEventListener: type => listeners.delete(type),
        DOMObserverManager: { getInstance: () => ({ subscribeBody(id, options) {
            subscriptions.set(id, options.callback);
            return () => subscriptions.delete(id);
        } }) },
        inputBoxAnimationManager: {
            updatePosition(rect) { frames.push(rect); petVisible = true; },
            hideActive() { petVisible = false; },
            destroy() { petVisible = false; }
        }
    };
    class ResizeObserver {
        constructor(callback) { this.callback = callback; this.disconnected = false; this.references = []; observers.push(this); }
        observe(reference) { this.reference = reference; this.references.push(reference); }
        disconnect() { this.disconnected = true; }
    }
    const adapterFiles = fs.readdirSync(path.join(__dirname, '../js/smartInputBox/adapters'))
        .filter(file => file.endsWith('.js') && !['base.js', 'registry.js'].includes(file));
    const files = ['adapters/base.js', ...adapterFiles.map(file => 'adapters/' + file), 'prompt-button-manager.js', 'smart-enter-manager.js'];
    const source = files.map(file => fs.readFileSync(path.join(__dirname, '../js/smartInputBox', file), 'utf8')).join('\n;\n');
    const names = [...source.matchAll(/class (\w+) extends BaseSmartEnterAdapter/g)].map(match => match[1]);
    const classes = vm.runInNewContext(source + `\n;({ ${names.join(',')}, PromptButtonManager, SmartEnterManager, SMART_ENTER_MODES });`, {
        document, window, ResizeObserver, AbortController,
        getComputedStyle: element => ({ visibility: element.visibility || 'visible' }),
        requestAnimationFrame: callback => callback(),
        setInterval: callback => { intervals.push(callback); return intervals.length; },
        clearInterval() {},
        setTimeout: callback => { const id = Symbol(); timers.set(id, callback); return id; },
        clearTimeout: id => timers.delete(id),
        Event: class { constructor(type, options) { this.type = type; Object.assign(this, options); } },
        SMART_ENTER_CONFIG: { DOUBLE_CLICK_INTERVAL: 500, DEBOUNCE_DELAY: 200 },
        SMART_ENTER_MODES: { DOUBLE_ENTER: 'double-enter', CTRL_ENTER: 'ctrl-enter', SHIFT_ENTER: 'shift-enter' }
    });
    function editor({ visible = true, blocked = false, legacy = false, contentEditable = true } = {}) {
        const handlers = new Map();
        const events = [];
        const input = {
            visible, blocked, legacy, connected: true, visibility: 'visible',
            isContentEditable: contentEditable, contentEditable: String(contentEditable), value: '',
            handlers, events, focus() {}, contains: node => node === input,
            addEventListener: (type, callback, options) => addListener(handlers, type, callback, options),
            removeEventListener: type => handlers.delete(type),
            dispatchEvent: event => events.push(event)
        };
        const reference = {
            getBoundingClientRect: () => ({ left: 200, top: 400, width: input.visible ? 600 : 0, height: input.visible ? 52 : 0 })
        };
        input.getBoundingClientRect = () => ({ left: 240, top: 408, width: input.visible ? 500 : 0, height: input.visible ? 30 : 0 });
        input.closest = selector => {
            if (selector.includes('[hidden]')) return input.blocked ? input : null;
            if (selector.includes('ComposerLayoutFooter-')) return input.legacy ? null : reference;
            if (selector === 'form') return input.legacy ? reference : null;
            return reference;
        };
        input.reference = reference;
        inputs.push(input);
        return input;
    }
    const adapter = new classes[adapterName]();
    const manager = new classes.PromptButtonManager(adapter);
    manager.isEnabled = true;
    manager.buttonElement = {
        style: { display: 'none' }, getBoundingClientRect: () => ({ width: 32, height: 32 }),
        parentNode: { removeChild(element) { element.parentNode = null; } }
    };
    return { ...classes, adapter, manager, editor, observers, subscriptions, listeners, bodyListeners, intervals, frames, inputs, window,
        flushTimers() { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach(callback => callback()); },
        petVisible: () => petVisible };
}

test('ChatGPT conversation skips the hidden composer preceding the visible editor', () => {
    const f = fixture();
    f.editor({ visible: false });
    const active = f.editor();
    f.manager._findInputAndShow();
    assert.equal(f.manager.inputElement, active);
    assert.equal(f.manager.buttonElement.style.display, 'flex');
    assert.equal(f.manager.buttonElement.style.visibility, 'visible');
    assert.equal(f.petVisible(), true);
    assert.equal(f.frames.at(-1).top, 400);
});

test('home-to-conversation navigation rebinds while the old editor remains mounted', () => {
    const f = fixture();
    const home = f.editor();
    f.manager._startInputDetection();
    f.manager._findInputAndShow();
    const previousObserver = f.observers[0];
    home.visible = false;
    const conversation = f.editor();
    f.subscriptions.get('prompt-button')();
    assert.equal(home.connected, true);
    assert.equal(f.manager.inputElement, conversation);
    assert.equal(previousObserver.disconnected, true);
    assert.equal(f.observers.at(-1).reference, conversation.reference);
    assert.equal(f.petVisible(), true);
});

test('composer resize retargets visibility changes without repeatedly observing the same node', () => {
    const f = fixture();
    const old = f.editor();
    f.manager._findInputAndShow();
    const firstObserver = f.observers[0];
    old.visible = false;
    const current = f.editor();
    firstObserver.callback();
    assert.equal(f.manager.inputElement, current);
    const currentObserver = f.observers.at(-1);
    const count = f.observers.length;
    currentObserver.callback();
    currentObserver.callback();
    assert.equal(f.observers.length, count, 'initial resize notifications must not create an observer loop');
    assert.equal(currentObserver.disconnected, false);
});

test('all hidden composers hide both decorations and a later composer restores them', () => {
    const f = fixture();
    const input = f.editor();
    f.manager._startInputDetection();
    f.manager._findInputAndShow();
    input.visible = false;
    f.subscriptions.get('prompt-button')();
    assert.equal(f.manager.inputElement, null);
    assert.equal(f.manager.buttonElement.style.display, 'none');
    assert.equal(f.petVisible(), false);
    input.visible = true;
    f.subscriptions.get('prompt-button')();
    assert.equal(f.manager.inputElement, input);
    assert.equal(f.petVisible(), true);
});

test('window resize reselects the current editor and legacy form positioning is retained', () => {
    const f = fixture();
    const old = f.editor();
    f.manager._findInputAndShow();
    f.manager._bindEvents();
    old.visible = false;
    const legacy = f.editor({ legacy: true });
    f.listeners.get('resize')();
    assert.equal(f.manager.inputElement, legacy);
    assert.equal(f.observers.at(-1).reference, legacy.reference);
    assert.equal(f.petVisible(), true);
});

test('inert or CSS-hidden composers are ignored even when they have a layout box', () => {
    const f = fixture();
    f.editor({ blocked: true });
    f.editor().visibility = 'hidden';
    assert.equal(f.adapter.findInputElement(), null);
    const current = f.editor();
    assert.equal(f.adapter.findInputElement(), current);
});

test('smart Enter binds the same visible composer and its health check follows replacement', () => {
    const f = fixture();
    f.editor({ visible: false });
    const current = f.editor();
    const smartEnter = new f.SmartEnterManager(f.adapter);
    const attached = [];
    smartEnter._attachListener = input => { attached.push(input); smartEnter.attachedElements.set(input, {}); };
    smartEnter._attachToInputIfNeeded();
    assert.equal(attached[0], current);
    smartEnter._startHealthCheck();
    current.visible = false;
    const next = f.editor();
    f.intervals[0]();
    assert.equal(attached.at(-1), next);
});

test('destroy removes keyboard handlers from retained ChatGPT composers even when all are hidden', () => {
    const f = fixture();
    const first = f.editor();
    const smartEnter = new f.SmartEnterManager(f.adapter);
    smartEnter._attachToInputIfNeeded();
    first.visible = false;
    const second = f.editor();
    smartEnter._attachToInputIfNeeded();
    second.visible = false;
    assert.equal(f.adapter.findInputElement(), null);
    smartEnter.destroy();
    for (const input of [first, second]) {
        assert.equal(input.handlers.has('keydown'), false);
        assert.equal(input.handlers.has('input'), false);
    }
});

test('initially hidden ChatGPT candidates remain observed until either editor gains a layout', () => {
    const f = fixture();
    f.editor({ visible: false });
    const pending = f.editor({ visible: false });
    f.manager._findInputAndShow();
    assert.equal(f.manager.inputElement, null);
    assert.equal(f.petVisible(), false);
    assert.equal(f.observers.at(-1).references.length, 2);
    pending.visible = true;
    f.observers.at(-1).callback();
    assert.equal(f.manager.inputElement, pending);
    assert.equal(f.petVisible(), true);
    assert.equal(f.observers.at(-1).references.length, 1);
});

test('a ChatGPT composer can disappear and return through CSS layout alone', () => {
    const f = fixture();
    const input = f.editor();
    f.manager._findInputAndShow();
    input.visible = false;
    f.observers.at(-1).callback();
    assert.equal(f.manager.inputElement, null);
    assert.equal(f.petVisible(), false);
    input.visible = true;
    f.observers.at(-1).callback();
    assert.equal(f.manager.inputElement, input);
    assert.equal(f.petVisible(), true);
});

for (const [name, expectedTop, expectedLeft, petTop] of [
    ['GeminiSmartEnterAdapter', 415, 158, 400],
    ['ClaudeSmartEnterAdapter', 410, 160, 400],
    ['DeepSeekSmartEnterAdapter', 410, 158, 395],
    ['KimiSmartEnterAdapter', 405, 158, 400],
    ['TongyiSmartEnterAdapter', 410, 158, 400],
    ['QwenSmartEnterAdapter', 410, 158, 400],
    ['GrokSmartEnterAdapter', 412, 158, 400],
    ['DoubaoSmartEnterAdapter', 410, 158, 400],
    ['PerplexitySmartEnterAdapter', 408, 158, 400],
    ['YuanbaoSmartEnterAdapter', 410, 158, 400],
    ['NotebookLMSmartEnterAdapter', 410, 145, 400]
]) {
    test(`${name}: prompt positioning and the existing bound editor stay unchanged`, () => {
        const f = fixture(name);
        const current = f.editor();
        f.manager._startInputDetection();
        f.manager._findInputAndShow();
        assert.equal(f.manager.inputElement, current);
        assert.equal(f.manager.buttonElement.style.top, `${expectedTop}px`);
        assert.equal(f.manager.buttonElement.style.left, `${expectedLeft}px`);
        assert.equal(f.frames.at(-1).top, petTop);
        const earlierInDocument = f.editor();
        f.inputs.unshift(f.inputs.pop());
        f.subscriptions.get('prompt-button')();
        assert.equal(f.manager.inputElement, current, 'DOM insertions must not switch a still-mounted editor on other platforms');
        assert.equal(f.adapter.findInputElement(), earlierInDocument, 'unbound lookup retains its original querySelector behavior');
    });

    test(`${name}: replacing the editor reconnects handling and destroy releases all listeners`, () => {
        const f = fixture(name);
        const old = f.editor();
        f.manager._startInputDetection();
        f.manager._findInputAndShow();
        const smartEnter = new f.SmartEnterManager(f.adapter);
        smartEnter._attachToInputIfNeeded();
        assert.equal(smartEnter.attachedElements.has(old), true);
        old.connected = false;
        const next = f.editor();
        f.subscriptions.get('prompt-button')();
        smartEnter._attachToInputIfNeeded();
        assert.equal(f.manager.inputElement, next);
        assert.equal(smartEnter.attachedElements.has(next), true);
        assert.equal(f.manager.buttonElement.style.visibility, 'visible');
        next.connected = false;
        smartEnter.destroy();
        for (const input of [old, next]) {
            assert.equal(input.handlers.has('keydown'), false);
            assert.equal(input.handlers.has('input'), false);
        }
        assert.equal(f.listeners.has('keydown'), false);
    });
}

test('disabling and re-enabling prompts preserves settings and correctly restores observation', () => {
    const f = fixture();
    f.editor();
    f.manager._bindEvents();
    f.manager._startInputDetection();
    f.manager._findInputAndShow();
    const callback = f.observers.at(-1).callback;
    f.manager._disable();
    assert.equal(f.manager.isEnabled, false);
    assert.equal(f.petVisible(), false);
    assert.equal(f.subscriptions.size, 0);
    assert.equal(f.listeners.size, 0);
    assert.equal(f.bodyListeners.size, 0);
    callback();
    assert.equal(f.petVisible(), false);
    f.manager._enable();
    assert.equal(f.petVisible(), true);
    assert.equal(f.subscriptions.size, 1);
    assert.equal(f.listeners.size, 1);
});

test('destroy releases observers and stale callbacks cannot restore the decorations', () => {
    const f = fixture();
    f.editor();
    f.manager._bindEvents();
    f.manager._startInputDetection();
    f.manager._findInputAndShow();
    const callback = f.observers.at(-1).callback;
    f.manager.destroy();
    const frames = f.frames.length;
    callback();
    assert.equal(f.manager.buttonElement, null);
    assert.equal(f.frames.length, frames);
    assert.equal(f.petVisible(), false);
    assert.equal(f.observers.at(-1).disconnected, true);
    assert.equal(f.subscriptions.size, 0);
    assert.equal(f.bodyListeners.size, 0);
});

test('textarea prompt insertion still appends content and dispatches input events', () => {
    const f = fixture('QwenSmartEnterAdapter');
    const input = f.editor({ contentEditable: false });
    f.manager._findInputAndShow();
    f.manager._insertPrompt({ content: '第一段提示词' });
    assert.equal(input.value, '第一段提示词\n\n');
    f.manager._insertPrompt({ content: '第二段提示词' });
    assert.equal(input.value, '第一段提示词\n\n第二段提示词\n\n');
    assert.equal(input.events.filter(event => event.type === 'input').length, 2);
    assert.equal(input.selectionStart, input.value.length);
    f.flushTimers();
});

function keyboardEvent(overrides = {}) {
    return { key: 'Enter', prevented: 0, stopped: 0,
        preventDefault() { this.prevented++; }, stopPropagation() { this.stopped++; }, ...overrides };
}

test('Chinese composition Enter and keyCode 229 never trigger sending or prevent confirmation', () => {
    const f = fixture();
    const input = f.editor();
    const smartEnter = new f.SmartEnterManager(f.adapter);
    let sends = 0;
    smartEnter._triggerSend = () => sends++;
    for (const event of [keyboardEvent({ isComposing: true }), keyboardEvent({ keyCode: 229 })]) {
        smartEnter.state.enterCount = 1;
        smartEnter._handleKeyDown(input, event);
        assert.equal(event.prevented, 0);
        assert.equal(smartEnter.state.enterCount, 0);
    }
    assert.equal(sends, 0);
});

test('disabled smart Enter leaves native keyboard behavior untouched', () => {
    const f = fixture('GeminiSmartEnterAdapter');
    const input = f.editor();
    const smartEnter = new f.SmartEnterManager(f.adapter);
    smartEnter._currentPlatform = { id: 'gemini', features: { smartEnter: true } };
    smartEnter.platformSettings = { gemini: false };
    const event = keyboardEvent();
    smartEnter._handleKeyDown(input, event);
    assert.equal(event.prevented, 0);
    assert.equal(smartEnter.state.enterCount, 0);
});

test('double Enter, Ctrl/Cmd Enter, and Shift Enter retain their configured send behavior', () => {
    const f = fixture();
    const input = f.editor();
    const smartEnter = new f.SmartEnterManager(f.adapter);
    smartEnter._isPlatformEnabled = () => true;
    let sends = 0;
    let newlines = 0;
    smartEnter._triggerSend = () => sends++;
    smartEnter._insertNewline = () => newlines++;
    smartEnter._showNewlineToast = () => {};
    smartEnter._saveSelection = () => {};
    smartEnter._handleKeyDown(input, keyboardEvent());
    assert.equal(sends, 0);
    smartEnter._handleKeyDown(input, keyboardEvent());
    assert.equal(sends, 1);
    smartEnter.smartEnterMode = f.SMART_ENTER_MODES.CTRL_ENTER;
    smartEnter._handleKeyDown(input, keyboardEvent());
    smartEnter._handleKeyDown(input, keyboardEvent({ ctrlKey: true }));
    smartEnter._handleKeyDown(input, keyboardEvent({ metaKey: true }));
    assert.equal(newlines, 1);
    assert.equal(sends, 3);
    smartEnter.smartEnterMode = f.SMART_ENTER_MODES.SHIFT_ENTER;
    smartEnter._handleKeyDown(input, keyboardEvent());
    smartEnter._handleKeyDown(input, keyboardEvent({ shiftKey: true }));
    assert.equal(newlines, 2);
    assert.equal(sends, 4);
});

test('Claude ancestor key listener ignores other editors and is replaced without duplicates', () => {
    const f = fixture('ClaudeSmartEnterAdapter');
    const current = f.editor();
    const smartEnter = new f.SmartEnterManager(f.adapter);
    let events = 0;
    smartEnter._handleKeyDown = () => events++;
    smartEnter._attachToInputIfNeeded();
    const firstListener = f.listeners.get('keydown');
    firstListener(keyboardEvent({ target: {} }));
    assert.equal(events, 0);
    firstListener(keyboardEvent({ target: current }));
    assert.equal(events, 1);
    current.connected = false;
    const next = f.editor();
    smartEnter._attachToInputIfNeeded();
    assert.equal(smartEnter.attachedElements.has(current), false);
    assert.equal(smartEnter.attachedElements.has(next), true);
    assert.equal(current.handlers.has('input'), false);
    f.listeners.get('keydown')(keyboardEvent({ target: next }));
    assert.equal(events, 2);
});
