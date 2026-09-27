// NODE_PATH=/private/tmp/ait-dom-tests/node_modules node scripts/tests/chatgpt-rollout-geometry.cjs
const { JSDOM } = require('jsdom');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const dom = new JSDOM('<main></main>', { url: 'https://chatgpt.com/c/test', runScripts: 'outside-only' });
const w = dom.window;
w.SiteAdapter = class {};
for (const name of ['js/timeline/adapters/chatgpt-rollout.js', 'js/timeline/adapters/chatgpt.js', 'js/timeline/timeline-manager.js']) {
    let source = fs.readFileSync(path.join(root, name), 'utf8');
    if (name.endsWith('/chatgpt.js')) source += '\nwindow.Adapter = ChatGPTAdapter;';
    if (name.endsWith('/timeline-manager.js')) source += '\nwindow.Manager = TimelineManager;';
    w.eval(source);
}
w.TIMELINE_CONFIG = { MIN_ACTIVE_CHANGE_INTERVAL: 0 };
const adapter = new w.Adapter();
const scroll = { scrollTop: 0, getBoundingClientRect: () => rect(50, 665) };
function rect(top, height, width = 500) { return { top, bottom: top + height, left: 10, right: 10 + width, width, height, x: 10, y: top }; }
const positions = [100, 600, 1300, 2500, 4200, 7000];
const elements = positions.map((_, i) => {
    const element = w.document.createElement('section');
    element.style.display = 'contents';
    element.innerHTML = '<h4 class="sr-only">You said:</h4><div style="display:contents"><div class="body">PRIVATE</div><button>Copy</button></div>';
    element.getBoundingClientRect = () => rect(0, 0, 0);
    const heading = element.querySelector('h4');
    heading.getBoundingClientRect = () => rect(-9999, 1, 1);
    element.querySelector('button').getBoundingClientRect = () => rect(99999, 30);
    element.querySelector('.body').getBoundingClientRect = () => rect(50 + positions[i] - scroll.scrollTop, 80);
    w.document.querySelector('main').append(element);
    return element;
});
adapter.prepareTimelineNodes({ force: true });
const manager = Object.create(w.Manager.prototype);
Object.assign(manager, {
    adapter, scrollContainer: scroll,
    markers: elements.map((element, i) => ({ element, id: String(i) })),
    _getCleanScrollMetrics: () => ({ maxScrollTop: 8000 }),
    debouncedUpdateScrollPadding() {}, updateTimelineGeometry() {},
    updateActiveDotUI() {}, _emitActiveChange() {}, ACTIVATE_AHEAD: 120,
    lastActiveChangeTime: -Infinity
});
manager._recalcMarkerPositions();
assert.deepEqual(Array.from(manager.markers, m => m.offsetTop), positions);
assert.equal(manager.contentSpanPx, 6900);
assert.equal(manager.markers[0].visualN, 0);
assert.equal(manager.markers[5].visualN, 1);
assert(manager.markers.every((m, i) => !i || m.visualN > manager.markers[i - 1].visualN));
assert(manager.markers.every(m => m.offsetBottom - m.offsetTop === 80));
// Scrolling does not change content coordinates; highlighting uses the same measurements.
scroll.scrollTop = 2400;
manager._recalcMarkerPositions();
assert.deepEqual(Array.from(manager.markers, m => m.offsetTop), positions);
manager.computeActiveByScroll();
assert.equal(manager.activeTurnId, '3');
// Late layout shift of an unchanged DOM node is remeasured.
positions[5] = 9000;
manager._recalcMarkerPositions();
assert.equal(manager.contentSpanPx, 8900);
const frames = [];
w.requestAnimationFrame = callback => frames.push(callback);
manager.smoothScrollTo(elements[5], 600);
frames.shift()(0); frames.shift()(600);
assert.equal(scroll.scrollTop, 8980, 'click target uses body box and adapter offset');
// A normal rollout wrapper keeps its own rectangle; legacy height/rectangle semantics unchanged.
elements[0].getBoundingClientRect = () => rect(123, 99);
assert.equal(manager._getMessageRect(elements[0]).top, 123);
const legacy = w.document.createElement('article');
legacy.getBoundingClientRect = () => rect(321, 77);
Object.defineProperty(legacy, 'offsetHeight', { value: 78 });
assert.equal(manager._getMessageRect(legacy).top, 321);
assert.equal(manager._getMessageHeight(legacy), 78);
delete w.AITChatGPTRolloutDOM;
assert.equal(manager._getMessageRect(legacy).top, 321);
w.close();
console.log('PASS: six zero-box wrappers, nested contents, excluded headings/buttons, spread, click, active marker, scroll invariance, layout shifts and legacy measurement.');
