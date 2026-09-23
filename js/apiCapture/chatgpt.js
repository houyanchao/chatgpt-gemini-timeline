// ChatGPT 对话接口拦截 —— MAIN world / document_start
//
// 目录：js/apiCapture/ —— 各平台 API 拦截模块统一放这里，每个平台一个 js 文件。
// 本文件：ChatGPT（chatgpt.com / chat.openai.com）
//
// ⚠️ MAIN WORLD ONLY，且必须 document_start 注入（要赶在页面发起首批请求前补丁 fetch）。
//
// 【解决什么问题】
// 新版 ChatGPT 虚拟化会把视口外轮次的 DOM 和 React 子树整体卸载，
// 未渲染轮次的内容在 DOM/fiber 中物理不存在。但页面自己一定从后端拿过完整对话 ——
// 本模块拦截页面发起的 GET /backend-api/conversation/{id} 响应，解析出全量提问文本，
// 供「时间轴」为未渲染轮次的节点提供悬停文案。
// （对话导出不依赖本模块：导出走滚动渲染 + DOM 采集，见 conversationExport 的 ChatGPT 适配器。）
//
// 【数据解析】
// 1. 沿 current_node 父链回溯 mapping，线性化出当前显示分支的节点序列；
// 2. 按角色分轮：user 消息独立成轮，连续的 assistant/tool/system 消息合并为一个助手轮
//    （与页面的 turn 结构一致）；
// 3. 文本过滤规则：content_type ∈ {text, multimodal_text}、recipient 为 all、
//    author.name 为空（排除思考链 / 工具调用 / 沙箱输出）；
// 4. 提问文本以【轮内每个消息 id】为键建索引 —— DOM 的 turn id（data-turn-id /
//    data-turn-id-container）等于轮内某条消息的 id，全键索引保证无论对应哪条都能命中。
//
// 【存储】按 convId 分桶保存消息 id → 提问文本。同一标签页内不限制跨对话总条目数，
// 刷新页面或关闭标签页后由页面生命周期统一释放。
//
// 【通信协议】（DOM 自定义事件同步往返，与项目内其他 MAIN world 桥一致）
//   ISOLATED 派发 'ait-gpt-user-texts-pull'，detail = 当前 conversationId
//   → 回派 'ait-gpt-user-texts-result'，detail = JSON 字符串
//     （{ conversationId, texts: {消息id: 提问文本} }）
//
// 【降级】拦截不到（脚本晚于页面请求加载 / 接口改版 / share 页）时表为空对象，
// 时间轴查不到即回退「渲染期缓存 → 占位符」。
(() => {
  'use strict';
  if (window.__aitGptApiCapture) { window.AITGPTDiagnostics?.log('api.already-installed'); return; }
  window.__aitGptApiCapture = true;

  const userTextsByConversation = new Map(); // convId → Map<消息id, 提问文本>
  const latestAppliedRequestByConversation = new Map(); // convId → 已成功应用的请求序号
  let nextRequestSequence = 0;
  let unmatchedJsonProbes = 0;
  let diagnosticRequestSequence = 0;
  const probedEndpointCounts = new Map();
  const endpointWords = new Set(['backend-api', 'conversation', 'conversations', 'thread', 'threads', 'message', 'messages', 'turn', 'turns', 'v1', 'v2', 'history', 'list', 'get', 'fetch', 'init', 'initialize', 'bootstrap', 'stream', 'resume', 'prepare', 'latest', 'recent', 'shared', 'sync', 'delta', 'batch', 'read', 'read-state', 'api', 'graphql', 'query']);
  const diag = window.AITGPTDiagnostics;
  const stats = { backendRequests: 0, matchedRequests: 0, unmatchedConversationRequests: 0, responses: 0, captured: 0, parseFailures: 0, pulls: 0 };
  diag?.log('api.capture-installed');

  // GET conversation 返回当前分支的完整 mapping，因此每次用最新结果替换整个分桶。
  // 这样切换分支或重新生成后，不会继续保留已经离开当前分支的旧消息 ID。
  const replaceTexts = (conversationId, texts) => {
    if (!conversationId) return;
    userTextsByConversation.set(conversationId, new Map(Object.entries(texts)));
  };

  // ---- 消息过滤/提取规则 ----
  const isVisibleType = (m) => {
    const ct = m?.content?.content_type;
    return ct === 'text' || ct === 'multimodal_text';
  };
  const isForUser = (m) => !m?.recipient || m.recipient === 'all';
  const isModelAuthored = (m) => !m?.author?.name; // 工具沙箱消息带 name，正文无 name

  // 单个 part 的文本：
  // - 普通文本：part 为字符串
  // - 语音模式：part 为 { content_type: 'audio_transcription', text, direction, ... } 对象，
  //   提问文字在 text 字段（图片/文件等 asset pointer 对象没有 text，自然被忽略）
  const textFromPart = (p) => {
    if (typeof p === 'string') return p;
    if (p && typeof p === 'object' && typeof p.text === 'string') return p.text;
    return '';
  };

  const textFromMessage = (m) => {
    try {
      const content = m?.content;
      if (!content) return '';
      if (/thought|reason/i.test(content.content_type || '')) return '';
      const parts = content.parts;
      if (!Array.isArray(parts)) return '';
      return parts.map(textFromPart).filter(Boolean).join('\n').trim();
    } catch {
      return '';
    }
  };

  // ---- mapping 线性化：沿 current_node 父链回溯出当前显示分支 ----
  const linearize = (json, metrics) => {
    const mapping = json?.mapping || {};
    let cur = json?.current_node;
    metrics.currentNodePresent = !!cur;
    metrics.currentNodeResolves = !!(cur && mapping[cur]);
    if (!cur || !mapping[cur]) {
      metrics.usedLeafFallback = true;
      // 兜底：任取一个叶子节点（无 children）
      cur = Object.keys(mapping).find(id => !(mapping[id]?.children?.length));
    }
    const chain = [];
    let guard = 0;
    while (cur && mapping[cur] && guard++ < 10000) {
      chain.push(mapping[cur]);
      cur = mapping[cur].parent;
    }
    metrics.chainLength = chain.length;
    metrics.guardLimitReached = guard >= 10000;
    metrics.brokenParentLink = !!cur && !mapping[cur];
    return chain.reverse();
  };

  // ---- 解析：按轮分组后提取用户提问文本（消息id → 文本）----
  const parseUserTexts = (json, rolloutNodes = null) => {
    const metrics = { usedLeafFallback: false, missingMessage: 0, missingNodeId: 0, roles: { user: 0, assistant: 0, system: 0, tool: 0, other: 0 }, contentTypes: { text: 0, multimodal_text: 0, other: 0 }, userNamedAuthor: 0, userNonPublicRecipient: 0, userUnsupportedContent: 0, userPartsNotArray: 0, userNoExtractableText: 0, userMissingMessageId: 0 };
    const chain = rolloutNodes || linearize(json, metrics);
    metrics.source = rolloutNodes ? 'messages' : 'mapping';
    metrics.chainLength = chain.length;
    const turns = [];
    let currentAssistant = null;
    chain.forEach(node => {
      const msg = node?.message;
      if (!msg) metrics.missingMessage++;
      if (!node?.id) metrics.missingNodeId++;
      if (msg) {
        const role = ['user', 'assistant', 'system', 'tool'].includes(msg.author?.role) ? msg.author.role : 'other';
        metrics.roles[role]++;
        if (role === 'user') {
          const ct = ['text', 'multimodal_text'].includes(msg.content?.content_type) ? msg.content.content_type : 'other';
          metrics.contentTypes[ct]++;
          if (!isModelAuthored(msg)) metrics.userNamedAuthor++;
          if (!isForUser(msg)) metrics.userNonPublicRecipient++;
          if (!isVisibleType(msg)) metrics.userUnsupportedContent++;
          if (!Array.isArray(msg.content?.parts)) metrics.userPartsNotArray++;
          if (!textFromMessage(msg)) metrics.userNoExtractableText++;
          if (!msg.id) metrics.userMissingMessageId++;
        }
      }
      if (!msg || !node.id) return;
      if (msg.author?.role === 'user') {
        currentAssistant = null;
        turns.push({ role: 'user', ids: [node.id], messages: [msg] });
      } else {
        if (!currentAssistant) {
          currentAssistant = { role: 'assistant', ids: [], messages: [] };
          turns.push(currentAssistant);
        }
        currentAssistant.ids.push(node.id);
        currentAssistant.messages.push(msg);
      }
    });

    const texts = Object.create(null);
    turns.forEach(t => {
      if (t.role !== 'user') return;
      const text = t.messages
        .filter(m => m.author?.role === 'user' && isModelAuthored(m) && isForUser(m) && isVisibleType(m))
        .map(textFromMessage)
        .filter(Boolean)
        .join('\n\n');
      if (!text) return;
      const compact = text.replace(/\s+/g, ' ').trim();
      t.ids.forEach(id => { texts[id] = compact; });
    });
    diag?.log('api.parsed-branch', { ...metrics, turns: turns.length, userTurns: turns.filter(t => t.role === 'user').length, textEntries: Object.keys(texts).length });
    return texts;
  };

  const capture = (conversationId, json, rollout = false) => {
    try {
      diag?.log('api.response-shape', diag.shape(json));
      const rolloutNodes = rollout ? window.AITChatGPTRolloutAPI?.nodes(json) : null;
      if (rollout ? !rolloutNodes : !json?.mapping) { diag?.log('api.capture-skipped', { reason: rollout ? 'messages-missing' : 'mapping-missing' }); return false; }
      diag?.log('api.mapping-shape', { type: diag.type(json.mapping), nodeCount: Object.keys(json.mapping || {}).length });
      const schema = { inspected: 0, withNodeId: 0, withMessage: 0, withParent: 0, childrenArray: 0, messageHasAuthor: 0, messageHasContent: 0, userMessages: 0, otherRoles: 0 };
      for (const node of Object.values(json.mapping || {}).slice(0, 10000)) {
        schema.inspected++;
        if (node?.id) schema.withNodeId++;
        if (node?.message) schema.withMessage++;
        if (node?.parent) schema.withParent++;
        if (Array.isArray(node?.children)) schema.childrenArray++;
        if (node?.message?.author) schema.messageHasAuthor++;
        if (node?.message?.content) schema.messageHasContent++;
        if (node?.message?.author?.role === 'user') schema.userMessages++;
        else schema.otherRoles++;
      }
      diag?.log('api.mapping-node-schema', schema);
      const texts = parseUserTexts(json, rolloutNodes);
      replaceTexts(conversationId, texts);
      stats.captured++;
      diag?.log('api.cache-written', { source: rollout ? 'messages' : 'mapping', textEntries: Object.keys(texts).length });
      // 通知 ISOLATED world：该对话的接口文本已写入缓存。
      // 事件只携带对话 ID，消费方再通过既有 pull 协议读取，避免重复传输整份文本。
      document.dispatchEvent(new CustomEvent('ait-gpt-user-texts-updated', {
        // MAIN → ISOLATED 跨 world 只传字符串，避免对象 detail 的兼容性限制。
        detail: conversationId
      }));
      return true;
    } catch (error) {
      stats.parseFailures++;
      diag?.error('api.capture', error);
      return false;
    }
  };

  // ---- fetch 补丁 ----
  // 匹配 GET /backend-api/conversation/{uuid}（POST /backend-api/conversation 是发消息的 SSE 流，排除）
  const CONV_URL_RE = /^\/backend-api\/conversation\/([0-9a-f][0-9a-f-]{18,})$/i;
  const origFetch = window.fetch;
  window.fetch = function (...args) {
    const p = origFetch.apply(this, args);
    try {
      const rawUrl = typeof args[0] === 'string' ? args[0] : (args[0] instanceof URL ? args[0].href : (args[0]?.url || ''));
      const method = String(args[1]?.method || (typeof args[0] === 'object' ? args[0]?.method : '') || 'GET').toUpperCase();
      const requestUrl = new URL(rawUrl, location.href);
      const sameOrigin = requestUrl.origin === location.origin;
      const legacyMatch = sameOrigin && requestUrl.pathname.match(CONV_URL_RE);
      const rolloutMatch = sameOrigin && window.AITChatGPTRolloutAPI?.match(requestUrl.pathname);
      const match = legacyMatch || rolloutMatch;
      // Endpoint metadata only; never log raw URL/path, request body or headers.
      let backend = false, conversationLike = false, pathDepth = 0, endpointShape = 'unknown', currentConversationInPath = false;
      try {
        const url = new URL(rawUrl, location.href);
        backend = url.origin === location.origin && (/^\/(?:backend-api|api)\//.test(url.pathname) || url.pathname === '/graphql');
        const segments = url.pathname.split('/').filter(Boolean);
        conversationLike = backend && segments.some(s => /conversation|thread|message|turn/i.test(s));
        const currentParts = location.pathname.split('/');
        const currentIndex = currentParts.indexOf('c');
        const currentId = currentIndex >= 0 ? currentParts[currentIndex + 1] : null;
        currentConversationInPath = !!currentId && segments.includes(currentId);
        pathDepth = segments.length;
        endpointShape = '/' + segments.map(segment => endpointWords.has(segment) ? segment : ':redacted').join('/');
      } catch {}
      if (backend) stats.backendRequests++;
      const diagnosticRequest = backend || match ? ++diagnosticRequestSequence : 0;
      const safeMethod = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method) ? method : 'other';
      if (backend) diag?.log('api.request-observed', { diagnosticRequest, endpointShape, method: safeMethod, conversationLike, currentConversationInPath });
      if (conversationLike && !(match && method === 'GET')) {
        stats.unmatchedConversationRequests++;
        diag?.log('api.unmatched-conversation-request', { diagnosticRequest, endpointShape, method: safeMethod, pathDepth, note: method === 'POST' ? 'may-be-normal-send-stream' : 'not-handled-by-existing-matcher' });
      }
      if (match && method === 'GET') {
        stats.matchedRequests++;
        const conversationId = match[1];
        const requestSequence = ++nextRequestSequence;
        diag?.log('api.request-matched', { requestSequence, diagnosticRequest, endpointShape });
        p.then(resp => {
          stats.responses++;
          const ct = resp?.headers?.get('content-type') || '';
          diag?.log('api.response', { requestSequence, status: resp?.status, ok: !!resp?.ok, contentType: ct.includes('json') ? 'json' : ct.includes('event-stream') ? 'event-stream' : ct.includes('html') ? 'html' : 'other' });
          if (resp && resp.ok) {
            resp.clone().json()
              .then(json => {
                const latestApplied = latestAppliedRequestByConversation.get(conversationId) || 0;
                if (requestSequence < latestApplied) { diag?.log('api.stale-response-skipped', { requestSequence, latestApplied }); return; }
                if (capture(conversationId, json, !!rolloutMatch)) {
                  latestAppliedRequestByConversation.set(conversationId, requestSequence);
                }
              })
              .catch(error => { stats.parseFailures++; diag?.error('api.response-json', error); });
          }
        }).catch(error => diag?.error('api.fetch', error));
      } else if (backend) {
        // Correlate every response with its request. Sample JSON from distinct endpoint
        // families, including POST JSON; never read request bodies or SSE streams.
        const probeKey = safeMethod + ':' + endpointShape;
        const shouldProbe = unmatchedJsonProbes < (conversationLike || currentConversationInPath ? 80 : 35) && (probedEndpointCounts.get(probeKey) || 0) < 3;
        if (shouldProbe) {
          unmatchedJsonProbes++;
          probedEndpointCounts.set(probeKey, (probedEndpointCounts.get(probeKey) || 0) + 1);
        }
        p.then(async resp => {
          const ct = resp?.headers?.get('content-type') || '';
          const meta = { diagnosticRequest, endpointShape, method: safeMethod, status: resp?.status,
            contentType: ct.includes('json') ? 'json' : ct.includes('event-stream') ? 'event-stream' : ct.includes('html') ? 'html' : 'other', conversationLike, currentConversationInPath };
          diag?.log('api.alternative-response', { ...meta, shapeProbeSelected: shouldProbe });
          if (shouldProbe && resp?.ok && ct.includes('json')) {
            const payload = await diag?.readResponseSample(resp, false);
            if (payload !== undefined) diag?.log('api.alternative-shape', { ...meta, ...diag.shape(payload) });
          } else if (shouldProbe && resp?.ok && ct.includes('event-stream')) {
            await diag?.readResponseSample(resp, true, meta);
          }
        }).catch(error => diag?.error('api.alternative-probe', error));
      }
    } catch (error) { diag?.error("api.fetch-hook", error); /* 补丁逻辑绝不影响页面请求本身 */ }
    return p;
  };

  const installedFetch = window.fetch;
  for (const delay of [5000, 15000, 30000, 60000]) {
    setTimeout(() => {
      try {
        const path = location.pathname.split('/');
        const index = path.indexOf('c');
        const bucket = index >= 0 ? userTextsByConversation.get(path[index + 1]) : null;
        const ids = new Set(Array.from(document.querySelectorAll('[data-turn-id-container], [data-turn-id]'))
          .map(el => el.getAttribute('data-turn-id-container') || el.getAttribute('data-turn-id')).filter(Boolean));
        diag?.log('api.health', { ...stats, fetchHookStillInstalled: window.fetch === installedFetch,
          currentConversationCached: !!bucket, currentTextEntries: bucket?.size || 0,
          domUniqueIds: ids.size, matchingCachedIds: Array.from(ids).filter(id => bucket?.has(id)).length });
      } catch (error) { diag?.error('api.health', error); }
    }, delay);
  }

  // ---- 事件视图：用户提问文本（时间轴）----
  document.addEventListener('ait-gpt-user-texts-pull', (event) => {
    try {
      const conversationId = typeof event.detail === 'string' ? event.detail : '';
      const bucket = userTextsByConversation.get(conversationId);
      stats.pulls++;
      diag?.log('api.bridge-pull', { validRequest: !!conversationId, cacheHit: !!bucket, textEntries: bucket?.size || 0 });
      document.dispatchEvent(new CustomEvent('ait-gpt-user-texts-result', {
        // Firefox 不允许页面脚本把非字符串 detail 直接暴露给扩展内容脚本。
        // MAIN → ISOLATED 统一使用 JSON 字符串，消费方负责解析。
        detail: JSON.stringify({
          conversationId,
          texts: bucket ? Object.fromEntries(bucket) : {}
        })
      }));
    } catch {
      document.dispatchEvent(new CustomEvent('ait-gpt-user-texts-result', {
        detail: JSON.stringify({ conversationId: '', texts: null })
      }));
    }
  });
})();
