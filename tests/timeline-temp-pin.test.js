const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

class FakeClassList {
    constructor(element) {
        this.element = element;
        this.classes = new Set();
    }

    add(...classNames) {
        classNames.forEach(className => this.classes.add(className));
        this._sync();
    }

    remove(...classNames) {
        classNames.forEach(className => this.classes.delete(className));
        this._sync();
    }

    toggle(className, force) {
        const shouldAdd = force === undefined ? !this.classes.has(className) : !!force;
        if (shouldAdd) {
            this.classes.add(className);
        } else {
            this.classes.delete(className);
        }
        this._sync();
        return shouldAdd;
    }

    contains(className) {
        return this.classes.has(className);
    }

    setFromString(value) {
        this.classes = new Set(String(value || '').split(/\s+/).filter(Boolean));
        this._sync(false);
    }

    _sync(updateAttr = true) {
        this.element._className = [...this.classes].join(' ');
        if (updateAttr) {
            this.element.attributes.class = this.element._className;
        }
    }
}

class FakeElement {
    constructor(tagName) {
        this.tagName = tagName.toUpperCase();
        this.nodeType = 1;
        this.children = [];
        this.parentNode = null;
        this.attributes = {};
        this.dataset = {};
        this.eventListeners = {};
        this._className = '';
        this.classList = new FakeClassList(this);
        this.innerHTML = '';
        this.textContent = '';
        if (this.tagName === 'CANVAS') {
            this.getContext = () => ({
                font: '',
                measureText: (text) => ({ width: String(text || '').length * 8 }),
            });
        }
        this.style = {
            values: {},
            setProperty: (name, value) => {
                this.style.values[name] = String(value);
            },
            getPropertyValue: (name) => this.style.values[name] || '',
        };
    }

    get className() {
        return this._className;
    }

    set className(value) {
        this.classList.setFromString(value);
    }

    appendChild(child) {
        if (child.tagName === '#FRAGMENT') {
            [...child.children].forEach(fragmentChild => this.appendChild(fragmentChild));
            child.children = [];
            return child;
        }
        child.parentNode = this;
        this.children.push(child);
        return child;
    }

    get parentElement() {
        return this.parentNode;
    }

    get isConnected() {
        let node = this;
        while (node) {
            if (node.tagName === 'BODY') return true;
            node = node.parentNode;
        }
        return false;
    }

    remove() {
        if (!this.parentNode) return;
        this.parentNode.children = this.parentNode.children.filter(child => child !== this);
        this.parentNode = null;
    }

    setAttribute(name, value) {
        this.attributes[name] = String(value);
        if (name === 'class') {
            this.className = value;
        } else if (name.startsWith('data-')) {
            const key = name.slice(5).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
            this.dataset[key] = String(value);
        }
    }

    getAttribute(name) {
        return this.attributes[name] ?? null;
    }

    addEventListener(type, handler) {
        if (!this.eventListeners[type]) this.eventListeners[type] = [];
        this.eventListeners[type].push(handler);
    }

    dispatchEvent(event) {
        event.target = event.target || this;
        event.currentTarget = this;
        event.stopPropagation = event.stopPropagation || (() => {});
        event.preventDefault = event.preventDefault || (() => {});
        for (const handler of this.eventListeners[event.type] || []) {
            handler(event);
        }
    }

    querySelector(selector) {
        return this.querySelectorAll(selector)[0] || null;
    }

    matches(selector) {
        const simpleSelectors = selector.split(',').map(part => part.trim()).filter(Boolean);
        return simpleSelectors.some(simpleSelector => {
            if (simpleSelector.startsWith('.')) {
                return this.classList.contains(simpleSelector.slice(1));
            }
            if (/^\[.+\]$/.test(simpleSelector)) {
                const attrs = [...simpleSelector.matchAll(/\[([^=\]]+)(?:="([^"]*)")?\]/g)];
                return attrs.length > 0 && attrs.every(([, name, value]) => {
                    if (!(name in this.attributes)) return false;
                    return value === undefined || this.attributes[name] === value;
                });
            }
            return this.tagName.toLowerCase() === simpleSelector.toLowerCase();
        });
    }

    querySelectorAll(selector) {
        const results = [];
        const walk = (element) => {
            for (const child of element.children) {
                if (child.matches(selector)) results.push(child);
                walk(child);
            }
        };
        walk(this);
        return results;
    }
}

class FakeDocument {
    constructor() {
        this.body = new FakeElement('body');
        this.documentElement = new FakeElement('html');
    }

    createElement(tagName) {
        return new FakeElement(tagName);
    }

    createDocumentFragment() {
        return new FakeElement('#fragment');
    }

    querySelector(selector) {
        return this.body.querySelector(selector);
    }

    querySelectorAll(selector) {
        return this.body.querySelectorAll(selector);
    }
}

function loadTimelineManager(options = {}) {
    const document = new FakeDocument();
    const storageCalls = [];
    const sourcePath = path.join(__dirname, '..', 'js', 'timeline', 'timeline-manager.js');
    const source = fs.readFileSync(sourcePath, 'utf8');
    const context = {
        console,
        document,
        window: {
            globalTooltipManager: {
                show: () => {},
                hide: () => {},
                hideOverlay: () => {},
                showOverlay: () => {},
            },
            eventDelegateManager: { on: () => {} },
        },
        navigator: {},
        location: { pathname: '/c/test', href: 'https://chatgpt.com/c/test' },
        chrome: { i18n: { getMessage: () => '' }, storage: { local: { get: async () => ({}) } } },
        requestAnimationFrame: (callback) => callback(0),
        cancelAnimationFrame: () => {},
        setTimeout: options.setTimeout || (() => 0),
        clearTimeout: options.clearTimeout || (() => {}),
        MutationObserver: options.MutationObserver || class {
            constructor() {}
            observe() {}
            disconnect() {}
        },
        ResizeObserver: options.ResizeObserver || class {
            observe() {}
            disconnect() {}
        },
        IntersectionObserver: options.IntersectionObserver || class {
            observe() {}
            disconnect() {}
        },
        Node: { ELEMENT_NODE: 1 },
        getSiteNameMap: () => ({}),
        getCurrentPlatform: () => ({ features: {} }),
        TIMELINE_CONFIG: { DEBOUNCE_DELAY: 0, INITIAL_RENDER_DELAY: 0 },
        StorageAdapter: options.StorageAdapter || {},
        PinStorageManager: {
            findByKey: async (key) => {
                storageCalls.push(['findByKey', key]);
                return undefined;
            },
            add: async (item) => {
                storageCalls.push(['add', item]);
            },
            remove: async (key) => {
                storageCalls.push(['remove', key]);
            },
            getByUrl: async (url) => {
                storageCalls.push(['getByUrl', url]);
                return [];
            },
        },
        TimelineUtils: {
            removeElementSafe: (element) => element?.remove(),
        },
    };
    context.window.window = context.window;
    vm.createContext(context);
    vm.runInContext(`${source}\nthis.TimelineManager = TimelineManager;`, context);
    return { TimelineManager: context.TimelineManager, document, storageCalls };
}

function createManager(options = {}) {
    const { TimelineManager, document, storageCalls } = loadTimelineManager(options);
    const adapter = {
        extractConversationId: () => 'test',
        extractIndexFromTurnId: (id) => id.replace(/^chatgpt-/, ''),
        getUserMessageSelector: () => '[data-turn="user"][data-turn-id]',
        getFeatures: () => ({ notepad: true, questionList: false, timeline_tooltipActions: true }),
        getTimelinePosition: () => ({}),
        getScrollOffset: () => 0,
        shouldHideTimeline: () => false,
    };
    const manager = new TimelineManager(adapter);
    manager.applyTimelineActiveColor = () => {};
    manager.cacheTooltipConfig = () => {};
    manager.truncateText = (text) => text;
    manager.getSiteNameFromUrl = () => 'ChatGPT';
    manager.ui.timelineBar = document.createElement('div');
    manager.ui.timelineBar.className = 'ait-chat-timeline-bar';
    document.body.appendChild(manager.ui.timelineBar);
    return { manager, document, storageCalls };
}

function makeMarker(document, id) {
    return {
        id,
        summary: `summary ${id}`,
        element: document.createElement('article'),
        dotElement: document.createElement('button'),
        dotN: id.endsWith('1') ? 0.25 : 0.75,
        pinned: false,
    };
}

test('togglePin creates a single temporary marker without writing pin storage', async () => {
    const { manager, document, storageCalls } = createManager();
    const first = makeMarker(document, 'chatgpt-1');
    const second = makeMarker(document, 'chatgpt-2');
    manager.markers = [first, second];
    manager.firstUserTurnOffset = 100;
    manager.contentSpanPx = 1000;
    manager.scrollContainer = { scrollTop: 600 };
    manager.activeTurnId = 'chatgpt-1';

    const result = await manager.toggleCurrentTemporaryPin();

    assert.equal(result, true);
    assert.deepEqual(storageCalls, []);
    assert.deepEqual([...manager.pinned], []);
    assert.equal(first.pinned, false);
    assert.equal(second.pinned, false);

    const pins = manager.ui.timelineBar.querySelectorAll('.timeline-pin-marker');
    assert.equal(pins.length, 1);
    assert.equal(pins[0].tagName, 'BUTTON');
    assert.equal(pins[0].getAttribute('aria-label'), 'Return to pinned answer');
    assert.equal(pins[0].style.getPropertyValue('--n'), '0.5');
});

test('clicking a temporary triangle marker scrolls back to the captured scroll position', async () => {
    const { manager, document } = createManager();
    const first = makeMarker(document, 'chatgpt-1');
    const second = makeMarker(document, 'chatgpt-2');
    manager.markers = [first, second];
    manager.firstUserTurnOffset = 100;
    manager.contentSpanPx = 1000;
    manager.scrollContainer = { scrollTop: 450 };
    manager.activeTurnId = 'chatgpt-1';
    let scrolledTo = null;
    manager.smoothScrollTo = (element) => {
        scrolledTo = element;
    };

    await manager.toggleCurrentTemporaryPin();
    manager.scrollContainer.scrollTop = 900;
    const pin = manager.ui.timelineBar.querySelector('.timeline-pin-marker');
    pin.dispatchEvent({ type: 'click' });

    assert.equal(scrolledTo, null);
    assert.equal(manager.scrollContainer.scrollTop, 450);
});

test('timeline toolbar shows a Pin chat button instead of the flash note pencil', () => {
    const { manager, document } = createManager();
    manager.ui.timelineBar.remove();
    manager.ui.timelineBar = null;

    manager.injectTimelineUI();

    const pinButton = document.querySelector('.ait-temp-pin-btn');
    assert.ok(pinButton);
    assert.equal(pinButton.getAttribute('aria-label'), 'Pin chat');
    assert.match(pinButton.innerHTML, /M12 17v5/);
    assert.equal(document.querySelector('.ait-notepad-btn'), null);
});

test('auto bottom jump creates a temporary marker at the pre-jump scroll position', () => {
    const { manager, document } = createManager();
    const first = makeMarker(document, 'chatgpt-1');
    const second = makeMarker(document, 'chatgpt-2');
    const third = makeMarker(document, 'chatgpt-3');
    const fourth = makeMarker(document, 'chatgpt-4');
    manager.markers = [first, second, third];
    manager.firstUserTurnOffset = 100;
    manager.contentSpanPx = 1000;
    manager.scrollContainer = { scrollTop: 450 };
    manager.activeTurnId = 'chatgpt-1';
    manager._lastScrollSnapshot = {
        scrollTop: 450,
        activeIndex: 0,
        totalCount: 3,
        isLast: false,
        timestamp: Date.now(),
    };

    assert.equal(manager._captureAutoBottomJumpCandidate(3, 4), true);

    manager.markers = [first, second, third, fourth];
    manager.scrollContainer.scrollTop = 1200;
    manager.activeTurnId = 'chatgpt-4';

    assert.equal(manager._maybeApplyPendingAutoBottomJumpPin(), true);
    assert.equal(manager.temporaryPin.scrollTop, 450);

    const pins = manager.ui.timelineBar.querySelectorAll('.timeline-pin-marker');
    assert.equal(pins.length, 1);
    assert.equal(pins[0].classList.contains('timeline-pin-marker-flash'), false);
});

test('auto bottom jump flashes a candidate marker without replacing an existing pin', async () => {
    const { manager, document } = createManager();
    const first = makeMarker(document, 'chatgpt-1');
    const second = makeMarker(document, 'chatgpt-2');
    const third = makeMarker(document, 'chatgpt-3');
    manager.markers = [first, second, third];
    manager.firstUserTurnOffset = 100;
    manager.contentSpanPx = 1000;
    manager.scrollContainer = { scrollTop: 100 };
    manager.activeTurnId = 'chatgpt-3';

    await manager.toggleCurrentTemporaryPin();
    manager.pendingAutoBottomJump = {
        scrollTop: 450,
        previousCount: 3,
        currentCount: 4,
        createdAt: Date.now(),
        expiresAt: Date.now() + 2500,
    };
    manager.scrollContainer.scrollTop = 1200;

    assert.equal(manager._maybeApplyPendingAutoBottomJumpPin(), true);
    assert.equal(manager.temporaryPin.scrollTop, 100);

    const flashPin = manager.ui.timelineBar.querySelector('.timeline-pin-marker-flash');
    assert.ok(flashPin);

    flashPin.dispatchEvent({ type: 'click' });

    assert.equal(manager.temporaryPin.scrollTop, 450);
    assert.equal(manager.ui.timelineBar.querySelector('.timeline-pin-marker-flash'), null);
});

test('flashing auto bottom jump candidate expires after six seconds without changing the current pin', async () => {
    const timers = [];
    const { manager, document } = createManager({
        setTimeout: (callback, delay) => {
            const timer = { callback, delay, cleared: false };
            timers.push(timer);
            return timer;
        },
        clearTimeout: (timer) => {
            if (timer) timer.cleared = true;
        },
    });
    const first = makeMarker(document, 'chatgpt-1');
    const second = makeMarker(document, 'chatgpt-2');
    manager.markers = [first, second];
    manager.firstUserTurnOffset = 100;
    manager.contentSpanPx = 1000;
    manager.scrollContainer = { scrollTop: 100 };
    manager.activeTurnId = 'chatgpt-2';

    await manager.toggleCurrentTemporaryPin();
    manager.pendingAutoBottomJump = {
        scrollTop: 450,
        previousCount: 2,
        currentCount: 3,
        createdAt: Date.now(),
        expiresAt: Date.now() + 2500,
    };
    manager.scrollContainer.scrollTop = 1200;

    assert.equal(manager._maybeApplyPendingAutoBottomJumpPin(), true);

    const flashTimer = timers.find(timer => timer.delay === 6000);
    assert.ok(flashTimer);
    flashTimer.callback();

    assert.equal(manager.temporaryPin.scrollTop, 100);
    assert.equal(manager.ui.timelineBar.querySelector('.timeline-pin-marker-flash'), null);
});

test('saving scroll position stores current position for the current chat URL', async () => {
    const stored = new Map();
    const { manager } = createManager({
        StorageAdapter: {
            set: async (key, value) => stored.set(key, value),
            get: async (key) => stored.get(key),
        },
    });
    manager.scrollContainer = { scrollTop: 732 };

    assert.equal(await manager.saveScrollPosition(), true);

    const saved = stored.get('chatTimelineScrollPosition:chatgpt.com/c/test');
    assert.equal(saved.scrollTop, 732);
    assert.equal(saved.url, 'https://chatgpt.com/c/test');
    assert.equal(saved.urlWithoutProtocol, 'chatgpt.com/c/test');
});

test('restoring scroll position jumps the same chat to the saved position once', async () => {
    const { manager } = createManager({
        StorageAdapter: {
            get: async () => ({ scrollTop: 512, timestamp: Date.now() }),
        },
    });
    manager.scrollContainer = { scrollTop: 0 };
    let syncCount = 0;
    manager.scheduleScrollSync = () => {
        syncCount++;
    };

    assert.equal(await manager.restoreSavedScrollPosition(), true);
    assert.equal(manager.scrollContainer.scrollTop, 512);
    assert.equal(syncCount, 1);

    manager.scrollContainer.scrollTop = 64;
    assert.equal(await manager.restoreSavedScrollPosition(), false);
    assert.equal(manager.scrollContainer.scrollTop, 64);
});

test('conversation observer ignores unrelated childList mutations', () => {
    const observers = [];
    class CapturingMutationObserver {
        constructor(callback) {
            this.callback = callback;
            observers.push(this);
        }
        observe(target, options) {
            this.target = target;
            this.options = options;
        }
        disconnect() {}
    }

    const { manager, document } = createManager({ MutationObserver: CapturingMutationObserver });
    const conversation = document.createElement('main');
    document.body.appendChild(conversation);
    manager.conversationContainer = conversation;
    manager.scrollContainer = document.body;
    manager.ui.trackContent = document.createElement('div');
    manager.ui.timelineBar.appendChild(manager.ui.trackContent);

    let recalculations = 0;
    let containerChecks = 0;
    manager.debouncedRecalculateAndRender = () => {
        recalculations++;
    };
    manager.ensureContainersUpToDate = () => {
        containerChecks++;
    };
    manager.updateIntersectionObserverTargets = () => {};
    manager.setupDomCheckObserver = () => {};

    manager.setupObservers();
    const conversationObserver = observers[0];

    const unrelatedNode = document.createElement('div');
    conversationObserver.callback([
        { type: 'childList', addedNodes: [unrelatedNode], removedNodes: [] },
    ]);

    assert.equal(recalculations, 0);
    assert.equal(containerChecks, 0);

    const userTurn = document.createElement('article');
    userTurn.setAttribute('data-turn', 'user');
    userTurn.setAttribute('data-turn-id', 'abc');
    conversationObserver.callback([
        { type: 'childList', addedNodes: [userTurn], removedNodes: [] },
    ]);

    assert.equal(recalculations, 1);
    assert.equal(containerChecks, 0);
});
