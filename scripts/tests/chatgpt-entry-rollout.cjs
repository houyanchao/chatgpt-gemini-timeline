// NODE_PATH=/private/tmp/ait-dom-tests/node_modules node scripts/tests/chatgpt-entry-rollout.cjs
const { JSDOM } = require('jsdom');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const secret = 'PRIVATE_ACCOUNT_PROMPT_FOLDER';
function setup(html) {
    const dom = new JSDOM(html, { url: 'https://chatgpt.com/c/private-id', runScripts: 'outside-only' });
    const w = dom.window, logs = [];
    w.console.info = value => logs.push(value);
    w.AITGPTDiagnostics = { log: (name, data) => logs.push(JSON.stringify({ name, data })) };
    w.HTMLElement.prototype.getBoundingClientRect = function() {
        const top = this.closest('nav') ? 5 : 20;
        const width = this.closest('nav') ? 240 : this.matches('header') ? 800 : 550;
        const height = this.closest('nav') ? 780 : this.matches('header') ? 52 : 36;
        return { top, bottom: top + height, left: this.closest('nav') ? 0 : 250,
            right: width + 250, width, height };
    };
    w.eval(read('js/global/chatgpt-entry-rollout.js'));
    w.eval(read('js/global/chat-header-actions/index.js'));
    w.BaseSmartEnterAdapter = class {};
    w.BaseSidebarStarredAdapter = class {};
    w.eval(read('js/smartInputBox/adapters/chatgpt.js') + '\nwindow.PromptAdapter = ChatGPTSmartEnterAdapter');
    w.eval(read('js/sidebarStarred/adapters/chatgpt.js') + '\nwindow.SidebarAdapter = ChatGPTSidebarStarredAdapter');
    return { dom, w, logs };
}
{
    const { dom, w, logs } = setup(`<main><header><div>${secret}</div></header><form><div role="textbox" contenteditable="true">${secret}</div></form></main><nav><div>${secret}</div></nav>`);
    const prompt = new w.PromptAdapter();
    const input = prompt.getInputElement();
    assert(input && input.closest('form'));
    assert(w.document.querySelector(prompt.getInputSelector()));
    const sidebar = new w.SidebarAdapter().findInsertionPoint();
    assert.equal(sidebar.parent.tagName, 'NAV');
    assert.equal(sidebar.position, 'prepend');
    const header = w.AITChatHeaderActions.getInsertTarget();
    assert.equal(header.tagName, 'HEADER');
    for (const action of ['star', 'export']) {
        const button = w.document.createElement('button');
        assert(w.AITChatHeaderActions.mount(button, action));
    }
    assert.equal(w.document.querySelectorAll('.ait-chat-header-actions-native').length, 1);
    assert.deepEqual(Array.from(header.lastElementChild.children, x => x.dataset.aitHeaderAction), ['star', 'export']);
    assert(!logs.join('\n').includes(secret));
    assert(!logs.join('\n').includes('private-id'));
    dom.window.close();
}
{
    const { dom, w } = setup(`<main><form><div id="prompt-textarea" contenteditable="true"></div></form></main><nav><div class="group/sidebar-expando-section"></div><div id="history"></div></nav><header style="display:flex"><button data-testid="share-chat-button"></button></header>`);
    assert.equal(new w.PromptAdapter().getInputElement().id, 'prompt-textarea');
    assert.equal(new w.SidebarAdapter().findInsertionPoint().position, 'before');
    assert.equal(w.AITChatHeaderActions.getInsertTarget().getAttribute('data-testid'), 'share-chat-button');
    dom.window.close();
}
{
    const { dom, w } = setup('<main><div role="textbox" contenteditable="true"></div></main><nav style="display:none"></nav>');
    assert.equal(w.AITChatGPTEntryRollout.input(), null);
    assert.equal(w.AITChatGPTEntryRollout.sidebar(), null);
    assert.equal(w.AITChatHeaderActions.getInsertTarget(), null);
    dom.window.close();
}
console.log('PASS: new anchors, old precedence, safe failure, shared star/export ordering, no private text in logs.');
