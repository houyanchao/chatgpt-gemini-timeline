const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));

function flattenContentScriptFiles(kind) {
    return manifest.content_scripts.flatMap(script => script[kind] || []);
}

test('manifest only injects the retained ChatGPT timeline feature set', () => {
    const scriptMatches = manifest.content_scripts.map(script => script.matches);
    assert.deepEqual(scriptMatches, [
        ['https://chatgpt.com/*', 'https://chat.openai.com/*'],
        ['https://chatgpt.com/*', 'https://chat.openai.com/*'],
    ]);

    const jsFiles = flattenContentScriptFiles('js');
    const cssFiles = flattenContentScriptFiles('css');
    const injectedFiles = [...jsFiles, ...cssFiles];

    const required = [
        'js/timeline/fiber-bridge-chatgpt.js',
        'js/timeline/timeline-manager.js',
        'js/timeline/question-list/index.js',
        'js/timeline/star-input-modal/star-input-modal.js',
        'js/panelModal/tabs/starred/index.js',
    ];
    for (const file of required) {
        assert.ok(jsFiles.includes(file), `${file} should stay injected`);
    }

    const removedFeaturePathParts = [
        'formula/',
        'runner/',
        'smartInputBox/',
        'quickAsk/',
        'highlight/',
        'scrollToBottom/',
        'chat-width-manager',
        'mirrorSite/',
        'notepad/',
        'chat-time-recorder',
        'ai-state-monitor',
        'changelog-modal',
        'sidebarStarred/adapters/',
        'sidebarStarred/sidebar-starred-manager',
    ];
    for (const part of removedFeaturePathParts) {
        assert.equal(
            injectedFiles.some(file => file.includes(part)),
            false,
            `${part} should not be injected`
        );
    }
});

test('manifest no longer exposes runner sandbox resources', () => {
    const resources = manifest.web_accessible_resources.flatMap(entry => entry.resources || []);
    assert.equal(resources.some(resource => resource.includes('runner/')), false);
    assert.equal('sandbox' in manifest, false);
    assert.equal('content_security_policy' in manifest, false);
});
