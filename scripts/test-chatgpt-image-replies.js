const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const read = name => readFileSync(join(__dirname, '../js/messageActions/adapters', name), 'utf8');
const Adapter = vm.runInNewContext(read('base.js') + '\n' + read('chatgpt.js') + '\n;ChatGPTMessageActionsAdapter',
    { window: {}, location: { pathname: '/c/example' } });
const replyBody = '[data-conversation-role="assistant"] + [data-response-body][data-chatgpt-search-message-ids]';

function row({ id, role, heading, image, text = '', outer, height = 400 }) {
    const attributes = { 'data-chatgpt-search-message-ids': id };
    if (role) attributes['data-chatgpt-search-unit-key'] = 'turn:' + role;
    else attributes['data-response-body'] = '';
    return {
        textContent: text,
        getAttribute: name => attributes[name] ?? null,
        getBoundingClientRect: () => ({ width: 800, height }),
        matches: selector => selector === replyBody && !role && heading === 'assistant',
        parentElement: { closest: selector => selector.includes('[data-chatgpt-search-unit-key]') ? outer : null },
        closest: selector => selector === '[data-turn-key]' ? { getAttribute: () => 'q1' } : null,
        querySelector: selector => selector === 'img' && image ? {} : null
    };
}

test('image replies are selected by their own body and stable ID alongside ordinary replies', () => {
    const adapter = new Adapter();
    const question = row({ id: 'q1', role: 'user', image: true });
    const upload = row({ id: 'attachment', heading: 'user', image: true, outer: question });
    const image = row({ id: 'image-reply additional-tool-id', heading: 'assistant', image: true });
    const duplicate = row({ id: 'image-reply', heading: 'assistant', image: true });
    const normal = row({ id: 'text-reply', role: 'assistant', text: 'Answer' });
    const nested = row({ id: 'text-segment', heading: 'assistant', text: 'Answer', outer: normal });
    const shell = row({ id: 'shell', heading: 'assistant' });
    const hidden = row({ id: 'hidden', heading: 'assistant', image: true, height: 0 });
    const orphan = row({ id: '', heading: 'assistant', image: true });
    adapter.getRoot = () => ({ querySelectorAll(selector) {
        assert.ok(selector.includes(replyBody));
        return [question, upload, image, duplicate, normal, nested, shell, hidden, orphan];
    } });

    const messages = adapter.getMessages();
    assert.deepEqual(Array.from(messages, message => message.key), ['user:q1', 'assistant:image-reply', 'assistant:text-reply']);
    assert.strictEqual(messages[1].element, image);
    assert.equal(messages[1].turnId, 'q1');
    assert.strictEqual(messages[2].element, normal);
    assert.equal(adapter.getRole(row({ id: 'upload', heading: 'user', image: true })), undefined);
});

test('individually selecting an image caches it for output after unmount without loading history', async () => {
    const adapter = new Adapter(), cached = new Set();
    const managerSource = readFileSync(join(__dirname, '../js/messageActions/action-manager.js'), 'utf8');
    const manager = vm.runInNewContext(managerSource + '\n;Object.create(MessageActionManager.prototype)', {
        MessageActionLoader: { load() { assert.fail('a cached selection should not scroll the conversation'); } }
    });
    const collector = { capture: message => cached.add(message.key), has: key => cached.has(key) };
    Object.assign(manager, { adapter, current: () => true, collector: async () => collector, scan() {} });
    const image = { key: 'assistant:image-reply', element: { isConnected: true } };
    const session = { action: {}, store: { selected: new Set([image.key]), messages: new Map([[image.key, image]]), selection: [image] } };

    manager.captureSelection(session, image.key);
    await new Promise(setImmediate);
    assert.ok(cached.has(image.key));
    image.element.isConnected = false;
    const result = await manager.prepareOutput(session, {}, new AbortController().signal);
    assert.deepEqual(result.messages, [image]);
});

test('the image reply action is mounted in the reply toolbar when a turn also has a question toolbar', () => {
    const adapter = new Adapter();
    const toolbar = () => ({ querySelectorAll: () => [{}, {}] });
    const questionTools = toolbar(), replyTools = toolbar();
    const questionCopy = { closest: () => ({}), parentElement: questionTools };
    const replyCopy = { closest: () => null, parentElement: replyTools };
    const copies = [questionCopy, replyCopy];
    const turn = { querySelectorAll: selector => selector === '[data-testid="copy-turn-action-button"]' ? copies : [] };
    const image = { element: { closest: () => turn } };
    assert.strictEqual(adapter.getToolbar(image), replyTools);
    copies.pop();
    assert.equal(adapter.getToolbar(image), null);
});

test('a captured gallery image remains available after the host revokes its temporary URL', async () => {
    const reads = new Map();
    class FileReader {
        async readAsDataURL(blob) {
            this.result = 'data:' + blob.type + ';base64,' + Buffer.from(await blob.arrayBuffer()).toString('base64');
            this.onload();
        }
    }
    const GalleryAdapter = vm.runInNewContext(read('base.js') + '\n' + read('chatgpt.js') + '\n;ChatGPTMessageActionsAdapter',
        { FileReader, fetch: (src, options) => {
            reads.set(src, (reads.get(src) || 0) + 1);
            return fetch(src, options);
        } });
    const source = URL.createObjectURL(new Blob(['sample'], { type: 'image/png' }));
    const revoked = URL.createObjectURL(new Blob(['old'], { type: 'image/png' }));
    URL.revokeObjectURL(revoked);
    const reply = { querySelectorAll: () => [{ currentSrc: source }, { src: revoked }, { src: 'https://example.test/image' }] };
    const controller = new AbortController();
    const preserve = new GalleryAdapter().createGeneratedImageCache(controller.signal);
    let captured;
    try {
        const results = await Promise.all([preserve(reply), preserve(reply)]);
        [captured] = results;
        assert.equal(results[1].get(source), captured.get(source));
    } finally {
        URL.revokeObjectURL(source);
    }
    assert.equal(captured.get(source), 'data:image/png;base64,c2FtcGxl');
    assert.deepEqual(Array.from(captured.keys()), [source]);
    assert.equal((await preserve(reply)).get(source), captured.get(source));
    assert.equal(reads.get(source), 1);
    assert.equal(reads.get(revoked), 2);
    assert.equal(preserve({ querySelectorAll: () => [] }), null);
    controller.abort();
    await assert.rejects(preserve(reply), { name: 'AbortError' });
});

test('a revoked image leaves the reply available to the export and screenshot renderers', async () => {
    const src = URL.createObjectURL(new Blob(['old'], { type: 'image/png' }));
    URL.revokeObjectURL(src);
    const text = 'Readable reply';
    const element = {
        isConnected: true, innerHTML: text, matches: () => false, querySelector: () => null,
        querySelectorAll: () => [{ src }], getBoundingClientRect: () => ({ width: 800 })
    };
    const adapterSource = read('base.js') + '\n' + read('chatgpt.js') + '\n;new ChatGPTMessageActionsAdapter()';
    const context = { adapter: vm.runInNewContext(adapterSource, { fetch }), signal: new AbortController().signal };
    const action = (path, name, globals) => vm.runInNewContext(
        readFileSync(join(__dirname, '../js', path), 'utf8') + '\n;new ' + name + '()', globals);
    const exporter = action('conversationExport/export-action.js', 'ConversationExportAction', {
        CE_EXPORT_ADAPTERS: { chatgpt: class { _extractAssistant() { return { text, images: [{ src }] }; } } }
    });
    const snapshotImages = [{ src }];
    const screenshot = action('messageScreenshot/screenshot-action.js', 'MessageScreenshotAction', {
        window: { AITContentLoader: { load() {} } }, setTimeout, getComputedStyle: () => ({}),
        document: { documentElement: { getAttribute: () => '' } },
        MessageScreenshotSnapshot: { capture: () => ({ content: { textContent: text, querySelectorAll: () => snapshotImages } }) }
    });
    const message = { role: 'assistant', key: 'a1', element };
    const exportCollector = await exporter.createCollector(context);
    await exportCollector.capture(message);
    assert.deepEqual(exportCollector.get('a1'), { text, images: [{ src }] });
    const screenshotCollector = await screenshot.createCollector(context);
    await screenshotCollector.capture(message);
    assert.equal(screenshotCollector.get('a1').content.textContent, text);
    assert.equal(screenshotCollector.get('a1').content.querySelectorAll('img')[0].src, src);
});

test('clickable content photos are exported across locales while toolbar buttons and small icons are omitted', () => {
    class Image {
        src = 'https://example.test/flower.jpg';
        width = 320;
        height = 240;
        naturalWidth = 800;
        naturalHeight = 600;
        label = '';
        getAttribute(name) { return name === 'alt' ? 'Une fleur' : null; }
        closest(selector) {
            if (selector === 'button, [role="button"]') return { getAttribute: () => this.label };
            return this.toolbar && selector.includes('[role="toolbar"]') ? {} : null;
        }
    }
    const source = readFileSync(join(__dirname, '../js/conversationExport/dom-to-markdown.js'), 'utf8');
    const converter = vm.runInNewContext(source + '\n;new CEDomToMarkdown({ minImageSize: 48 })', { HTMLImageElement: Image });
    const img = new Image();
    const collect = (inContent = true) => converter.extractImage(img, 'assistant', { contains: () => inContent });
    assert.equal(collect().src, img.src);
    img.label = 'Afficher l’image';
    assert.equal(collect().src, img.src);
    assert.equal(collect(false), null);
    img.toolbar = true;
    assert.equal(collect(), null);
    img.toolbar = false;
    img.label = 'Download';
    assert.equal(collect(), null);
    img.label = '';
    img.width = img.height = 16;
    assert.equal(collect(), null);
});
