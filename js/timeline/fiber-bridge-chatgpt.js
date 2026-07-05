// MAIN world script — can access React Fiber internals (__reactFiber$xxx).
// Content scripts (ISOLATED world) cannot read expando properties due to world isolation.
//
// Communication: content script dispatches 'timeline-extract-fiber' →
// this script reads Fiber data for virtualized user-turn elements →
// dispatches 'timeline-fiber-result' back with { [turnId]: text }.
// DOM events are synchronous, so the round-trip completes within one tick.
//
// Fiber 访问/向上爬取复用 MAIN-world 共享原语 window.AITChatGPTFiber（mainWorld/chatgpt-fiber-core.js，
// manifest 中排在本文件之前加载）。此处只保留时间轴自己的取数规则：仅取虚拟化（DOM 为空）
// 用户轮的首条消息文本。共享层缺失时静默降级为空结果，ISOLATED 侧自动回退 DOM 提取。
document.addEventListener('timeline-extract-fiber', () => {
  try {
    const fiberApi = window.AITChatGPTFiber;
    const result = {};
    document.querySelectorAll('[data-turn="user"][data-turn-id]').forEach(el => {
      if (el.childElementCount > 0) return;
      const turnId = el.getAttribute('data-turn-id');
      if (!turnId) return;
      const parts = fiberApi?.climb(el, (props) => {
        const p = props.turn?.messages?.[0]?.content?.parts ?? props.message?.content?.parts;
        return Array.isArray(p) ? p : null;
      }, 20);
      if (Array.isArray(parts)) {
        const txt = parts.filter(p => typeof p === 'string').join(' ');
        if (txt) result[turnId] = txt;
      }
    });
    document.dispatchEvent(new CustomEvent('timeline-fiber-result', { detail: result }));
  } catch {
    document.dispatchEvent(new CustomEvent('timeline-fiber-result', { detail: {} }));
  }
});
