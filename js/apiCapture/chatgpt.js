// ChatGPT 对话接口拦截 —— MAIN world / document_start
//
// 目录：js/apiCapture/ —— 各平台 API 拦截模块统一放这里，每个平台一个 js 文件。
// 本文件：ChatGPT（chatgpt.com / chat.openai.com）
//
// ⚠️ MAIN WORLD ONLY，且必须 document_start 注入（要赶在页面发起首批请求前补丁 fetch）。
//
// 【解决什么问题】
// 新版 ChatGPT 虚拟化会把视口外轮次的 DOM 和 React 子树整体卸载，
// 未渲染轮次的内容在 DOM/fiber 中物理不存在。
// 兼容旧版 conversation/{id} mapping 和新版 conversations/{id} messages 分页。
// 时间轴启用后补齐历史，提供当前分支的完整提问列表，不依赖页面保留所有轮次 DOM。
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
  if (window.__aitGptApiCapture) return;
  window.__aitGptApiCapture = true;

  const userTextsByConversation = new Map(); // convId → Map<消息id, 提问文本>
  const latestAppliedRequestByConversation = new Map(); // convId → 已成功应用的请求序号
  const latestSnapshotRequestByConversation = new Map(); // convId → 最新发起的快照请求序号
  const timelineEntriesByConversation = new Map();
  const sectionedSources = new Map();
  const historyLoads = new Map();
  const emitHistoryLoading = conversationId => {
    document.dispatchEvent(new CustomEvent('ait-gpt-history-loading', {
      detail: JSON.stringify({ conversationId, loading: historyLoads.has(conversationId) })
    }));
  };
  const requestedHistories = new Set();
  let nextRequestSequence = 0;
  const beginSnapshotRequest = (conversationId) => {
    const sequence = ++nextRequestSequence;
    latestSnapshotRequestByConversation.set(conversationId, sequence);
    const previousLoad = historyLoads.get(conversationId);
    previousLoad?.abort();
    historyLoads.delete(conversationId);
    if (previousLoad) emitHistoryLoading(conversationId);
    // 新快照可能切换了分支，旧 source 的游标不能再用于补齐历史。
    sectionedSources.delete(conversationId);
    return sequence;
  };

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

  const userEntries = (messages) => messages
    .filter(m => m?.id && m.author?.role === 'user'
      && !m.metadata?.is_visually_hidden_from_conversation && isForUser(m))
    .map(m => ({ id: m.id, text: textFromMessage(m).replace(/\s+/g, ' ').trim().slice(0, 200) || '[图片或文件]' }));

  const publishEntries = (conversationId, entries, complete, requestSequence) => {
    if (latestSnapshotRequestByConversation.get(conversationId) !== requestSequence
      || latestAppliedRequestByConversation.get(conversationId) !== requestSequence) return;
    timelineEntriesByConversation.set(conversationId, {
      entries, complete, revision: requestSequence
    });
    replaceTexts(conversationId, Object.fromEntries(entries.map(entry => [entry.id, entry.text])));
    document.dispatchEvent(new CustomEvent('ait-gpt-user-texts-updated', { detail: conversationId }));
  };

  // 历史请求沿用页面请求的认证头，仅在时间轴请求数据后启动；不修改页面响应。
  const ensureFullHistory = async (conversationId) => {
    const source = sectionedSources.get(conversationId);
    if (!location.pathname.split('/').includes(conversationId) || !source || historyLoads.has(conversationId)
      || latestSnapshotRequestByConversation.get(conversationId) !== source.requestSequence
      || timelineEntriesByConversation.get(conversationId)?.complete) return;
    const controller = new AbortController();
    historyLoads.set(conversationId, controller);
    // 等同步拉取返回后再通知，避免状态被外层尚未处理的桥接结果覆盖。
    Promise.resolve().then(() => emitHistoryLoading(conversationId));
    const isCurrent = () => !controller.signal.aborted && sectionedSources.get(conversationId) === source
      && latestSnapshotRequestByConversation.get(conversationId) === source.requestSequence
      && location.pathname.split('/').includes(conversationId);
    const read = async url => {
      const response = await origFetch(new Request(url, {
        headers: source.headers, credentials: source.credentials, signal: controller.signal
      }));
      if (!response.ok) throw new Error(`History HTTP ${response.status}`);
      return response.json();
    };
    try {
      // 兼容仍提供完整 mapping 的服务端，优先一份快照，避免逐页请求。
      try {
        const fullUrl = new URL(`/backend-api/conversation/${encodeURIComponent(conversationId)}`, location.origin);
        const full = await read(fullUrl);
        if (!isCurrent()) return;
        if (full?.mapping && full.mapping[full.current_node]) {
          const chain = linearize(full);
          if (chain.length < 10000 && !(chain[0]?.parent && !full.mapping[chain[0].parent])) {
            publishEntries(conversationId, userEntries(chain.filter(node => node.message).map(node => ({ ...node.message, id: node.id }))), true, source.requestSequence);
            return;
          }
        }
      } catch (error) {
        if (!isCurrent()) return;
      }
      let page = source.json;
      let messages = [...page.messages];
      const seenCursors = new Set();
      for (let pageIndex = 0; page.page_info?.has_previous_page; pageIndex++) {
        if (!isCurrent()) return;
        const cursor = page.page_info.start_cursor;
        if (!cursor || seenCursors.has(cursor) || pageIndex >= 200) throw new Error('History pagination made no progress');
        seenCursors.add(cursor);
        const url = new URL(source.url);
        url.searchParams.set('num_turns', '100');
        url.searchParams.set('before', cursor);
        const previous = await read(url);
        if (!isCurrent()) return;
        if (!Array.isArray(previous.messages)) throw new Error('History response has no messages');
        const known = new Set(messages.map(message => message.id));
        const older = previous.messages.filter(message => message.id && !known.has(message.id));
        if (!older.length) throw new Error('History pagination returned no older messages');
        messages = [...older, ...messages];
        page = previous;
        publishEntries(conversationId, userEntries(messages), page.page_info?.has_previous_page === false, source.requestSequence);
      }
    } catch {
      // 保留已读取的历史，结束加载状态，后续可重新尝试。
    } finally {
      if (historyLoads.get(conversationId) === controller) {
        historyLoads.delete(conversationId);
        emitHistoryLoading(conversationId);
      }
    }
  };

  // ---- mapping 线性化：沿 current_node 父链回溯出当前显示分支 ----
  const linearize = (json) => {
    const mapping = json?.mapping || {};
    let cur = json?.current_node;
    if (!cur || !mapping[cur]) {
      // 兜底：任取一个叶子节点（无 children）
      cur = Object.keys(mapping).find(id => !(mapping[id]?.children?.length));
    }
    const chain = [];
    let guard = 0;
    while (cur && mapping[cur] && guard++ < 10000) {
      chain.push(mapping[cur]);
      cur = mapping[cur].parent;
    }
    return chain.reverse();
  };

  // ---- 解析：按轮分组后提取用户提问文本（消息id → 文本）----
  const parseUserTexts = (json) => {
    const chain = linearize(json);
    const turns = [];
    let currentAssistant = null;
    chain.forEach(node => {
      const msg = node?.message;
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

    const texts = {};
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
    return texts;
  };

  const capture = (conversationId, json, requestSequence) => {
    try {
      if (!json?.mapping) {
        return false;
      }
      if (latestSnapshotRequestByConversation.get(conversationId) !== requestSequence) return false;
      const texts = parseUserTexts(json);
      latestAppliedRequestByConversation.set(conversationId, requestSequence);
      replaceTexts(conversationId, texts);
      const chain = linearize(json);
      timelineEntriesByConversation.set(conversationId, {
        entries: userEntries(chain.filter(node => node.message).map(node => ({ ...node.message, id: node.id }))),
        revision: json.current_node || '',
        complete: chain.length < 10000 && !(chain[0]?.parent && !json.mapping[chain[0].parent])
      });
      // 通知 ISOLATED world：该对话的接口文本已写入缓存。
      // 事件只携带对话 ID，消费方再通过既有 pull 协议读取，避免重复传输整份文本。
      document.dispatchEvent(new CustomEvent('ait-gpt-user-texts-updated', {
        // MAIN → ISOLATED 跨 world 只传字符串，避免对象 detail 的兼容性限制。
        detail: conversationId
      }));
      return true;
    } catch (error) {
      return false;
    }
  };

  // ---- fetch 补丁 ----
  // 匹配 GET /backend-api/conversation/{uuid}（POST /backend-api/conversation 是发消息的 SSE 流，排除）
  const CONV_URL_RE = /\/backend-api\/conversation\/([0-9a-f][0-9a-f-]{18,})(?:[?#]|$)/i;
  const SECTIONED_URL_RE = /\/backend-api\/conversations\/([0-9a-f][0-9a-f-]{18,})(?:[?#]|$)/i;
  const origFetch = window.fetch;
  window.fetch = function (...args) {
    const p = origFetch.apply(this, args);
    try {
      const rawUrl = typeof args[0] === 'string' ? args[0] : (args[0]?.url || args[0]?.href || '');
      const method = String(args[1]?.method || (typeof args[0] === 'object' ? args[0]?.method : '') || 'GET').toUpperCase();
      const match = rawUrl.match(CONV_URL_RE);
      const sectionedMatch = rawUrl.match(SECTIONED_URL_RE);
      if (sectionedMatch && method === 'GET') {
        const conversationId = sectionedMatch[1];
        const url = new URL(rawUrl, location.href);
        // 页面自身分页只补 DOM，不能替换分支快照或打断扩展的历史补齐。
        const isPagination = url.searchParams.has('before') || url.searchParams.has('cursor');
        if (isPagination && latestSnapshotRequestByConversation.has(conversationId)) return p;
        const headers = new Headers(args[1]?.headers || args[0]?.headers || {});
        const credentials = args[1]?.credentials || args[0]?.credentials || 'same-origin';
        const requestSequence = beginSnapshotRequest(conversationId);
        p.then(async response => {
          if (!response?.ok) return;
          const json = await response.clone().json();
          if (!Array.isArray(json.messages)) return;
          if (latestSnapshotRequestByConversation.get(conversationId) !== requestSequence) return;
          latestAppliedRequestByConversation.set(conversationId, requestSequence);
          sectionedSources.set(conversationId, { url: url.href, headers, credentials, json, requestSequence });
          const entries = userEntries(json.messages);
          publishEntries(conversationId, entries, json.page_info?.has_previous_page === false, requestSequence);
          if (requestedHistories.has(conversationId)) void ensureFullHistory(conversationId);
        }).catch(() => {});
      }
      if (match && method === 'GET') {
        const conversationId = match[1];
        const requestSequence = beginSnapshotRequest(conversationId);
        p.then(resp => {
          if (resp && resp.ok) {
            resp.clone().json()
              .then(json => {
                capture(conversationId, json, requestSequence);
              })
              .catch(() => {});
          }
        }).catch(() => {});
      }
    } catch { /* 补丁逻辑绝不影响页面请求本身 */ }
    return p;
  };

  // ---- 事件视图：用户提问文本（时间轴）----
  document.addEventListener('ait-gpt-user-texts-pull', (event) => {
    try {
      const request = typeof event.detail === 'string' && event.detail.startsWith('{')
        ? JSON.parse(event.detail) : { conversationId: event.detail };
      const conversationId = typeof request.conversationId === 'string' ? request.conversationId : '';
      if (request.restartHistory === true) {
        // 显式重试必须结束旧请求，否则网络悬挂时会一直被 already-loading 拦住。
        historyLoads.get(conversationId)?.abort();
        historyLoads.delete(conversationId);
      }
      const bucket = userTextsByConversation.get(conversationId);
      for (const [id, controller] of historyLoads) {
        if (id !== conversationId) { controller.abort(); historyLoads.delete(id); emitHistoryLoading(id); }
      }
      requestedHistories.clear();
      requestedHistories.add(conversationId);
      document.dispatchEvent(new CustomEvent('ait-gpt-user-texts-result', {
        // Firefox 不允许页面脚本把非字符串 detail 直接暴露给扩展内容脚本。
        // MAIN → ISOLATED 统一使用 JSON 字符串，消费方负责解析。
        detail: JSON.stringify({
          conversationId,
          texts: bucket ? Object.fromEntries(bucket) : {},
          timeline: timelineEntriesByConversation.get(conversationId) || null,
          historyLoading: historyLoads.has(conversationId)
        })
      }));
      void ensureFullHistory(conversationId);
    } catch {
      document.dispatchEvent(new CustomEvent('ait-gpt-user-texts-result', {
        detail: JSON.stringify({ conversationId: '', texts: null })
      }));
    }
  });
})();
