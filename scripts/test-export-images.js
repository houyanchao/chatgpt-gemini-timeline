const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadExporters() {
    const source = ['exporters.js', 'png-exporter.js', 'pdf-exporter.js'].map(file =>
        fs.readFileSync(path.join(__dirname, '../js/conversationExport', file), 'utf8')).join('\n;\n');
    const classes = vm.runInNewContext(source + '\n;({ CETextExporters, CEPngExporter, CEPdfExporter });', {
        CE_TEXT: { exportRoleUser: 'Q', exportRoleAssistant: 'A', emptyAssistant: 'empty', imageListTitle: 'Images' },
    });
    const pdf = new classes.CEPdfExporter();
    pdf._parser = new classes.CEPngExporter();
    return { pdf, text: classes.CETextExporters };
}

// Decode HTML attributes once, as the HTML parser does (not repeatedly).
function imageUrls(html) {
    const entities = { amp: '&', quot: '"', lt: '<', gt: '>' };
    return Array.from(html.matchAll(/<img\b[^>]*\bsrc="([^"]*)"/g), match =>
        match[1].replace(/&(amp|quot|lt|gt);/g, (_, name) => entities[name]));
}

function turn(markdown, src) {
    return { user: { text: 'Question' }, assistant: { markdown, images: [{ src, alt: 'sample' }] } };
}

for (const src of [
    'https://example.com/image.png?token=abc&expires=123',
    'https://example.com/plot(1).png',
    'https://example.com/plot((v1)).png?x=1&y=2',
]) {
    test(`PDF preserves the complete image URL exactly once: ${src}`, () => {
        const { pdf } = loadExporters();
        assert.deepEqual(imageUrls(pdf._assistantHtml(turn(`![sample](${src})`, src))), [src]);
    });
}

const src = 'https://example.com/image.png';
for (const markdown of [
    `\`![sample](${src})\``,
    `\`\`literal \` and ![sample](${src})\`\``,
    '```markdown\n![sample](' + src + ')\n```',
    '~~~markdown\n![sample](' + src + ')\n~~~',
    '> ```markdown\n> ![sample](' + src + ')\n> ```',
    '    ![sample](' + src + ')',
]) {
    test(`code examples do not suppress real images: ${JSON.stringify(markdown)}`, () => {
        const { text, pdf } = loadExporters();
        assert.equal(text._hasMarkdownImage(markdown, src), false);
        const exported = text.buildMarkdown({ meta: { title: 'Test' }, options: {}, turns: [turn(markdown, src)] });
        assert.ok(exported.includes(`\n![sample](${src})\n> Images`));
        assert.ok(imageUrls(pdf._assistantHtml(turn(markdown, src))).includes(src));
    });
}

test('real images following code examples are still deduplicated', () => {
    const { text, pdf } = loadExporters();
    const markdown = `\`![sample](${src})\`\n\n![sample](${src})`;
    assert.equal(text._hasMarkdownImage(markdown, src), true);
    assert.deepEqual(imageUrls(pdf._assistantHtml(turn(markdown, src))), [src]);
});

test('escaped image syntax and ordinary links do not count as images', () => {
    const { text } = loadExporters();
    assert.equal(text._hasMarkdownImage(`\\![sample](${src})`, src), false);
    assert.equal(text._hasMarkdownImage(`[sample](${src})`, src), false);
});

test('image captions, titles and nearby markup are safely rendered', () => {
    const { pdf, text } = loadExporters();
    const markdown = `<script>bad()</script> ![a \\[caption\\]](${src} "title") **bold**`;
    const html = pdf._assistantHtml(turn(markdown, src));
    assert.equal(text._hasMarkdownImage(markdown, src), true);
    assert.deepEqual(imageUrls(html), [src]);
    assert.ok(html.includes('alt="a [caption]"'));
    assert.ok(html.includes('&lt;script&gt;bad()&lt;/script&gt;'));
    assert.ok(html.includes('<strong>bold</strong>'));
});
