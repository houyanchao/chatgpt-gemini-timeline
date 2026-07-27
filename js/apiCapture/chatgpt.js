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
  if (window.__aitGptApiCapture) return;
  window.__aitGptApiCapture = true;

  const userTextsByConversation = new Map(); // convId → Map<消息id, 提问文本>
  const latestAppliedRequestByConversation = new Map(); // convId → 已成功应用的请求序号
  let nextRequestSequence = 0;

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

  const textFromMessage = (m) => {
    try {
      const content = m?.content;
      if (!content) return '';
      if (/thought|reason/i.test(content.content_type || '')) return '';
      const parts = content.parts;
      if (!Array.isArray(parts)) return '';
      return parts.filter(p => typeof p === 'string').join('\n').trim();
    } catch {
      return '';
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

  const capture = (conversationId, json) => {
    try {
      if (!json?.mapping) return false;
      const texts = parseUserTexts(json);
      replaceTexts(conversationId, texts);
      // 通知 ISOLATED world：该对话的接口文本已写入缓存。
      // 事件只携带对话 ID，消费方再通过既有 pull 协议读取，避免重复传输整份文本。
      document.dispatchEvent(new CustomEvent('ait-gpt-user-texts-updated', {
        // MAIN → ISOLATED 跨 world 只传字符串，避免对象 detail 的兼容性限制。
        detail: conversationId
      }));
      return true;
    } catch {
      return false;
    }
  };

  // ---- fetch 补丁 ----
  // 匹配 GET /backend-api/conversation/{uuid}（POST /backend-api/conversation 是发消息的 SSE 流，排除）
  const CONV_URL_RE = /\/backend-api\/conversation\/([0-9a-f][0-9a-f-]{18,})(?:[?#]|$)/i;
  const origFetch = window.fetch;
  window.fetch = function (...args) {
    const p = origFetch.apply(this, args);
    try {
      const rawUrl = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
      const method = String(args[1]?.method || (typeof args[0] === 'object' ? args[0]?.method : '') || 'GET').toUpperCase();
      const match = rawUrl.match(CONV_URL_RE);
      if (match && method === 'GET') {
        const conversationId = match[1];
        const requestSequence = ++nextRequestSequence;
        p.then(resp => {
          if (resp && resp.ok) {
            resp.clone().json()
              .then(json => {
                const latestApplied = latestAppliedRequestByConversation.get(conversationId) || 0;
                if (requestSequence < latestApplied) return;
                if (capture(conversationId, json)) {
                  latestAppliedRequestByConversation.set(conversationId, requestSequence);
                }
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
      const conversationId = typeof event.detail === 'string' ? event.detail : '';
      const bucket = userTextsByConversation.get(conversationId);
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
