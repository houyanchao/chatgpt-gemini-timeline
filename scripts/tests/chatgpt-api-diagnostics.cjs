// NODE_PATH=/private/tmp/ait-dom-tests/node_modules node scripts/tests/chatgpt-api-diagnostics.cjs
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { JSDOM } = require('jsdom');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const current = fs.readFileSync(path.join(root, 'js/apiCapture/chatgpt.js'), 'utf8');
const baseline = execFileSync('git', ['show', 'HEAD:js/apiCapture/chatgpt.js'], { cwd: root, encoding: 'utf8' });
const logger = fs.readFileSync(path.join(root, 'js/global/chatgpt-diagnostics/index.js'), 'utf8');
const secret = 'PRIVATE_CONTENT_AND_ACCOUNT';
const id = '12345678-1234-1234-1234-123456789012';
const endpoint = `https://chatgpt.com/backend-api/conversation/${id}`;
const json = { current_node: 'secret-node', title: secret, mapping: {
    'secret-node': { id: 'secret-node', parent: null, children: [], message: { id: 'private-message', author: { role: 'user' }, recipient: 'all', content: { content_type: 'text', parts: [secret] } } }
} };
const clone = value => JSON.parse(JSON.stringify(value));
async function run(source, fixture, options = {}) {
    const dom = new JSDOM('<main></main>', { url: `https://chatgpt.com/c/${id}`, runScripts: 'outside-only' });
    const w = dom.window, logs = [];
    w.console.info = text => logs.push(text);
    const timers = [];
    w.setTimeout = fn => { timers.push(fn); return timers.length; };
    let cloned = 0, consumed = false;
    const response = { ok: !options.httpError, status: options.httpError ? 403 : 200, headers: { get: () => options.contentType || 'application/json' }, clone: () => {
        cloned++; if (options.cloneFailure) throw new TypeError('body locked ' + secret); return { json: async () => { if (options.invalidJson) throw new SyntaxError(secret); if (options.readFailure) throw new TypeError('network ' + secret); return fixture; } };
    }, json: async () => { consumed = true; return fixture; } };
    const originalPromise = options.networkError ? Promise.reject(new TypeError(secret)) : Promise.resolve(response);
    w.fetch = () => originalPromise;
    if (source === current) { w.__AIT_GPT_DIAG_VERBOSE__ = !options.focused; w.eval(logger); if (!options.noRollout) w.eval(fs.readFileSync(path.join(root, 'js/apiCapture/chatgpt-rollout.js'), 'utf8')); }
    w.eval(source);
    assert.equal(w.fetch(options.url || endpoint, { method: options.method || 'GET' }), originalPromise, 'Fetch must return original promise');
    await new Promise(resolve => setImmediate(resolve));
    let result;
    w.document.addEventListener('ait-gpt-user-texts-result', e => { result = JSON.parse(e.detail); }, { once: true });
    w.document.dispatchEvent(new w.CustomEvent('ait-gpt-user-texts-pull', { detail: id }));
    assert.equal(consumed, false, 'Diagnostics must not consume the original response');
    timers.forEach(fn => fn());
    const output = logs.join('\n');
    for (const value of [secret, id, 'secret-node', 'private-message']) assert(!output.includes(value), `Sensitive value leaked: ${value}`);
    const records = logs.map(line => JSON.parse(line.slice('[AIT-GPT-DIAG] '.length)));
    w.close();
    return { result, records, cloned };
}
(async () => {
    const cases = [
        ['normal', json, {}],
        ['wrapped mapping', { data: json }, {}],
        ['renamed nodes', { nodes: json.mapping }, {}],
        ['current node missing', { ...json, current_node: 'absent' }, {}],
        ['HTTP error', json, { httpError: true }],
        ['invalid JSON', json, { invalidJson: true }],
        ['network error', json, { networkError: true }],
        ['alternate endpoint', { data: json }, { url: endpoint + '/messages' }],
        ['alternate POST JSON', { items: [{ id: secret, message: { content: secret }, title: secret }] }, { url: endpoint + '/messages', method: 'POST' }],
        ['alternate stream', json, { url: endpoint + '/messages', method: 'POST', contentType: 'text/event-stream' }]
    ];
    for (const mutate of [j => delete j.mapping['secret-node'].id,
        j => j.mapping['secret-node'].message.author.role = secret,
        j => j.mapping['secret-node'].message.content.content_type = secret,
        j => j.mapping['secret-node'].message.recipient = secret,
        j => j.mapping['secret-node'].message.content.parts = { private: secret }]) {
        const value = clone(json); mutate(value); cases.push(['changed node fields', value, {}]);
    }
    for (const [name, fixture, options] of cases) {
        const before = await run(baseline, fixture, options);
        const after = await run(current, fixture, options);
        assert.deepEqual(after.result, before.result, `${name}: parser/bridge behavior changed`);
        assert(after.records.some(r => r.event === 'api.bridge-pull'));
        if (name === 'normal') {
            const parsed = after.records.find(r => r.event === 'api.parsed-branch');
            assert.equal(parsed.userTurns, 1); assert.equal(parsed.textEntries, 1);
        }
        if (name === 'wrapped mapping') assert(after.records.some(r => r.event === 'api.capture-skipped' && r.reason === 'mapping-missing'));
        if (name === 'alternate endpoint') assert(after.records.some(r => r.event === 'api.alternative-shape' && r.data.mapping.count === 1));
        if (name === 'alternate POST JSON') {
            const response = after.records.find(r => r.event === 'api.alternative-response');
            const shape = after.records.find(r => r.event === 'api.alternative-shape');
            assert.equal(shape.diagnosticRequest, response.diagnosticRequest);
            assert.equal(shape.endpointShape, '/backend-api/conversation/:redacted/messages');
            assert.equal(shape.arrayItemSchemas.items[0].message.type, 'object');
        }
        if (name === 'alternate stream') assert.equal(after.cloned, 0);
        if (name === 'invalid JSON') assert(after.records.some(r => r.event === 'error' && r.stage === 'api.response-json'));
    }
    const flat = { messages: [
        { id: 'system', author: { role: 'system' }, content: { content_type: 'text', parts: [secret] } },
        json.mapping['secret-node'].message,
        { id: 'tool', author: { role: 'user', name: 'sandbox' }, content: { content_type: 'text', parts: [secret] } },
        { id: 'image', author: { role: 'user' }, content: { content_type: 'multimodal_text', parts: [{ content_type: 'image_asset_pointer' }] } }
    ] };
    const plural = endpoint.replace('/conversation/', '/conversations/');
    const captured = await run(current, flat, { url: plural });
    assert.deepEqual(captured.result.texts, { 'private-message': secret });
    assert(captured.records.some(r => r.event === 'api.parsed-branch' && r.source === 'messages'));
    for (const options of [{ url: plural, noRollout: true }, { url: plural, method: 'POST' },
        { url: plural.replace('chatgpt.com', 'example.com') }, { url: endpoint }]) {
        assert.deepEqual((await run(current, flat, options)).result.texts, {});
    }
    assert.deepEqual((await run(current, { messages: [] }, { url: plural })).result.texts, {});
    assert.deepEqual((await run(current, json, { noRollout: true })).result.texts, { 'secret-node': secret });
    const focused = await run(current, flat, { url: plural, focused: true });
    assert(focused.records.some(r => r.event === 'api.read-complete' && r.messagesCount === 4));
    assert(!focused.records.some(r => ['api.request-observed', 'api.response-shape', 'api.mapping-node-schema'].includes(r.event)));
    const failed = await run(current, flat, { url: plural, focused: true, readFailure: true });
    const failure = failed.records.find(r => r.event === 'api.read-failed');
    assert.equal(failure.reason, 'network-read'); assert.equal(failure.stage, 'read-json');
    assert.equal(failure.requestSequence, 1);
    const cloneFailed = await run(current, flat, { url: plural, focused: true, cloneFailure: true });
    assert(cloneFailed.records.some(r => r.event === 'api.read-failed' && r.stage === 'clone' && r.reason === 'body-unavailable'));
    const unrelated = await run(current, flat, { url: plural + '/messages', focused: true });
    assert.equal(unrelated.cloned, 0, 'focused diagnostics must not clone unrelated responses');
    // Newer successful snapshot wins even when an older request finishes later.
    const race = new JSDOM('<main/>', { url: `https://chatgpt.com/c/${id}`, runScripts: 'outside-only' });
    const rw = race.window, pending = [];
    rw.setTimeout = () => 0;
    rw.fetch = () => new Promise(resolve => pending.push(resolve));
    rw.eval(fs.readFileSync(path.join(root, 'js/apiCapture/chatgpt-rollout.js'), 'utf8'));
    rw.eval(current);
    rw.fetch(plural); rw.fetch(plural);
    const responseFor = payload => ({ ok: true, headers: { get: () => 'application/json' }, clone: () => ({ json: async () => payload }) });
    const newer = { messages: [{ ...flat.messages[1], id: 'new-message' }] };
    pending[1](responseFor(newer));
    await new Promise(resolve => setImmediate(resolve));
    pending[0](responseFor(flat));
    await new Promise(resolve => setImmediate(resolve));
    let raceResult;
    rw.document.addEventListener('ait-gpt-user-texts-result', e => { raceResult = JSON.parse(e.detail); });
    const pull = () => rw.document.dispatchEvent(new rw.CustomEvent('ait-gpt-user-texts-pull', { detail: id }));
    pull(); assert.deepEqual(raceResult.texts, { 'new-message': secret });
    rw.fetch(plural); pending[2](responseFor({ messages: [] }));
    await new Promise(resolve => setImmediate(resolve));
    pull(); assert.deepEqual(raceResult.texts, {}, 'empty successful snapshot clears obsolete IDs');
    race.window.close();
    // Non-GPT pages remain quiet, and repeated identical logs are bounded.
    const dom = new JSDOM('', { url: 'https://example.com', runScripts: 'outside-only' });
    dom.window.eval(logger); assert.equal(dom.window.AITGPTDiagnostics, undefined); dom.window.close();
    console.log(`PASS: ${cases.length} legacy scenarios plus rollout parsing, isolation, race and cache replacement; response body preserved; all logs exclude private contents/IDs; alternate endpoint structure detected.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
