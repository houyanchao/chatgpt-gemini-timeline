// Conversation Export - ChatGPT MAIN-world Fiber 桥
//
// ⚠️ 本文件运行在 MAIN world（见 manifest content_scripts 的 world:"MAIN" 条目），
// 因此能访问页面 React 内部的 __reactFiber$xxx 属性；conversationExport 的其他文件都在
// ISOLATED world，无法直接读取这些属性。两者通过 DOM 自定义事件同步通信。
//
// 【导出模块的 MAIN-world 桥约定】
// 每个需要读取页面框架内部状态（React/Vue/框架数据）的平台，在本目录下各自建立一个
// *-fiber-bridge.js（或 *-main.js），只放该平台的 MAIN-world 取数逻辑，并在 manifest
// 的 MAIN-world content_scripts 条目中登记。ISOLATED 侧适配器通过收发自定义事件取用，
// 从而避免把导出取数逻辑散落到 timeline 等其他模块目录。
//
// Fiber 访问/向上爬取复用 MAIN-world 共享原语 window.AITChatGPTFiber
// （mainWorld/chatgpt-fiber-core.js，manifest 中排在本文件之前加载）；本文件只保留导出自己的
// 取数规则（分角色文本过滤 + 图片引用抽取）。共享层缺失时静默降级为空结果。
//
// 通信协议：
//   ISOLATED 派发 'conversation-export-extract-fiber'
//   → 本桥读取每轮 turn 的 messages（用户 + 助手）
//   → 回派 'conversation-export-fiber-result'，detail = { [turnId]: { role, text } }。
// text 对助手是原始 markdown 源文本（最适合 markdown 导出），对用户是原始文本。
// DOM 事件同步派发，round-trip 在同一 tick 内完成。
document.addEventListener('conversation-export-extract-fiber', () => {
  // 从单条 message 取正文纯文本 / markdown，跳过推理/思考/工具类内容（按 content_type）。
  const textFromMessage = (message) => {
    try {
      const content = message?.content;
      if (!content) return '';
      const contentType = content.content_type || '';
      if (/thought|reason/i.test(contentType)) return '';
      const parts = content.parts;
      if (!Array.isArray(parts)) return '';
      return parts.filter(p => typeof p === 'string').join('\n').trim();
    } catch {
      return '';
    }
  };

  // 一个 turn 可能捆绑多条 message（推理 + 工具调用 + 回答），只取「用户可见的正文」：
  // - 可见内容类型白名单：text / multimodal_text（thoughts、reasoning_recap、
  //   model_editable_context、发给工具的 code 等自然被排除）
  // - recipient 必须是 'all'（发给具体工具的消息不是给用户看的）
  // - author.name 必须为空：过滤掉工具沙箱输出。实测图片生成轮的 tool 消息
  //   author.name 形如 "t2uay3k.sj1i4kz"，其文本是发给图片模型的 "Model caption: ..."
  //   思考链、或 "Generated images ... saved at" 路径日志，均非用户可见正文，应剔除。
  const isVisibleType = (m) => {
    const ct = m?.content?.content_type;
    return ct === 'text' || ct === 'multimodal_text';
  };
  const isForUser = (m) => !m?.recipient || m.recipient === 'all';
  const isModelAuthored = (m) => !m?.author?.name; // 工具沙箱消息带 name，模型正文无 name

  const textFromTurn = (turnProps, role) => {
    const messages = Array.isArray(turnProps?.messages) ? turnProps.messages : [];
    if (!messages.length) return '';

    return messages
      .filter(m => m?.author?.role === role && isModelAuthored(m) && isForUser(m) && isVisibleType(m))
      .map(textFromMessage)
      .filter(Boolean)
      .join('\n\n');
  };

  // 从 asset_pointer / 附件 id 归一化出稳定的文件 id（去掉 sediment:// 或 file-service:// 前缀）。
  // 该 id 与页面渲染出的签名 URL（backend-api/...?id=file_xxx）里的 id 一致，供 ISOLATED 侧按 id 匹配 DOM src。
  const normFileId = (raw) => String(raw || '').replace(/^sediment:\/\//, '').replace(/^file-service:\/\//, '').trim();

  // 一轮里的图片资源引用：扫描所有 message 的 content.parts（image_asset_pointer）与
  // metadata.attachments（用户上传的图片），按 fileId 去重合并。fiber 只给指针 + 尺寸 +
  // 文件名，没有可直接使用的 URL，真实 URL 仍需 ISOLATED 侧从 DOM 签名 src 兜底。
  const imagesFromTurn = (turnProps) => {
    const messages = Array.isArray(turnProps?.messages) ? turnProps.messages : [];
    if (!messages.length) return [];
    const byId = new Map();
    const put = (fileId, patch) => {
      if (!fileId) return;
      const prev = byId.get(fileId) || { fileId, width: 0, height: 0, name: '', mime: '' };
      byId.set(fileId, {
        fileId,
        width: patch.width || prev.width || 0,
        height: patch.height || prev.height || 0,
        name: patch.name || prev.name || '',
        mime: patch.mime || prev.mime || '',
      });
    };
    messages.forEach(m => {
      const parts = m?.content?.parts;
      if (Array.isArray(parts)) parts.forEach(p => {
        if (p && typeof p === 'object' && p.content_type === 'image_asset_pointer' && p.asset_pointer) {
          put(normFileId(p.asset_pointer), { width: p.width, height: p.height });
        }
      });
      const atts = m?.metadata?.attachments;
      if (Array.isArray(atts)) atts.forEach(a => {
        const mime = a?.mime_type || a?.mimeType || '';
        if (a?.id && /^image\//i.test(mime)) {
          put(normFileId(a.id), { width: a.width, height: a.height, name: a.name, mime });
        }
      });
    });
    return Array.from(byId.values());
  };

  try {
    const fiberApi = window.AITChatGPTFiber;
    const result = {};
    document.querySelectorAll('[data-turn-id][data-turn]').forEach(el => {
      const turnId = el.getAttribute('data-turn-id');
      const role = el.getAttribute('data-turn');
      if (!turnId) return;
      // 向上找承载本轮的 fiber 节点：优先 turn（整轮 messages），否则退化到单条 message。
      const node = fiberApi?.climb(el, (props) => {
        if (props.turn) return { turn: props.turn };
        if (props.message) return { message: props.message };
        return null;
      }, 30);
      if (node?.turn) {
        const text = textFromTurn(node.turn, role);
        const images = imagesFromTurn(node.turn);
        // 有文本或有图片引用即记录该轮（纯图片轮此前会因 text 为空被漏掉）
        if (text || images.length) result[turnId] = { role, text, images };
      } else if (node?.message) {
        const text = textFromMessage(node.message);
        if (text) result[turnId] = { role, text, images: [] };
      }
    });
    document.dispatchEvent(new CustomEvent('conversation-export-fiber-result', { detail: result }));
  } catch {
    document.dispatchEvent(new CustomEvent('conversation-export-fiber-result', { detail: {} }));
  }
});
