const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = ['base.js', 'gemini.js']
    .map(file => readFileSync(join(__dirname, '../js/timeline/adapters', file), 'utf8')).join('\n');
const adapter = vm.runInNewContext(source + '\n;new GeminiAdapter()', {
    Node: { ELEMENT_NODE: 1, TEXT_NODE: 3, COMMENT_NODE: 8 }
});

// Small DOM fixture for the element, class and attribute selectors used by the adapter.
function element(tag, selectors, ...children) {
    const keys = new Set([tag, ...selectors]);
    const nodes = children.map(child => typeof child === 'string' ? { nodeType: 3, textContent: child } : child);
    const el = {
        nodeType: 1, tagName: tag.toUpperCase(), nodeName: tag.toUpperCase(), childNodes: nodes,
        get textContent() { return nodes.filter(node => node.nodeType !== 8).map(node => node.textContent).join(''); },
        matches(selector) { return selector.split(',').some(part => keys.has(part.trim())); },
        closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) || null; },
        querySelectorAll(selector) {
            return nodes.filter(node => node.nodeType === 1).flatMap(node =>
                [...(node.matches(selector) ? [node] : []), ...node.querySelectorAll(selector)]);
        },
        querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    };
    for (const node of nodes) node.parentElement = el;
    return el;
}

const query = (...children) => element('user-query', [], ...children);
const body = (...children) => element('div', ['.query-text'], ...children);
const line = (...children) => element('p', ['.query-text-line'], ...children);
const span = (...children) => element('span', [], ...children);

test('Gemini summaries preserve inline text and separate lines, including the original plain-text layout', () => {
    assert.equal(adapter.extractText(query(line('旧结构', { nodeType: 8, textContent: 'Angular' }))), '旧结构');
    assert.equal(adapter.extractText(query(body(line('问', span('题'), '一'), line(span('第二行'))))), '问题一 第二行');
    assert.equal(adapter.extractText(query(body(span('Explain '), span('this'), element('br', []), 'please'))), 'Explain this please');
    const hidden = element('div', ['.query-text', '[hidden]'], '隐藏的副本');
    assert.equal(adapter.extractText(query(hidden, body(body('第一段')), body('第二段'))), '第一段 第二段');
});

test('Gemini summaries can read a prompt without query-text-line and exclude controls and extension UI', () => {
    const root = element('user-query', ['[data-ait-time]'],
        element('user-query-content', [], element('div', [], span('实际问题'), element('button', [], '复制'),
            element('span', ['[aria-hidden="true"]'], '折叠'), element('i', ['[data-ait-owned-ui]'], '昨天'))),
        element('button', [], '编辑'));
    assert.equal(adapter.extractText(root), '实际问题');
});

test('only an attachment with no prompt uses the Gemini attachment placeholder', () => {
    const photo = () => element('user-uploaded-image', [], element('img', []));
    const file = () => element('div', ['[data-file-id]'], 'report.pdf');
    assert.equal(adapter.extractText(query(photo(), body(line(span('请解读这张图'))))), '请解读这张图');
    assert.equal(adapter.extractText(query(photo())), '[图片或文件]');
    assert.equal(adapter.extractText(query(file(), element('button', [], '删除附件'))), '[图片或文件]');
    assert.equal(adapter.extractText(query(element('button', [], element('img', []), '编辑'))), '');
    assert.equal(adapter.extractText(query()), '');
});
