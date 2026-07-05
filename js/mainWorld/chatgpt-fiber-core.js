// ChatGPT React Fiber 读取器 —— MAIN world 共享底层
//
// ⚠️ MAIN WORLD ONLY。本目录 js/mainWorld/ 下的脚本都注入页面的 MAIN world
// （见 manifest content_scripts 的 world:"MAIN" 条目），因此能访问页面 React 内部的
// __reactFiber$xxx 属性；ISOLATED world（js/global/ 等其余脚本）无法直接读取。
// 与 ISOLATED 侧通过 DOM 自定义事件同步通信。
//
// 【为什么单独一个文件】
// timeline（时间轴）与 conversationExport（对话导出）都要从 ChatGPT 的 DOM 元素爬到
// React Fiber，再向上找承载「一轮对话」的 memoizedProps.turn / 单条 memoizedProps.message。
// 这段「怎么访问 fiber、怎么向上爬」是耦合 ChatGPT 内部实现、最容易随其改版失效的部分，
// 集中在此一处，让上层各自的过滤/组装逻辑复用同一套爬取原语——ChatGPT 改结构时只改这里。
//
// 各功能自己的 MAIN-world 桥（timeline/fiber-bridge-chatgpt.js、
// conversationExport/bridges/chatgpt-fiber-bridge.js）仍各管各的取数规则，只共享本原语。
//
// ⚠️ 加载顺序契约：本文件通过挂在 window 上给同 world 的桥使用，因此在 manifest 的
// MAIN-world content_scripts.js 数组里必须排在两份桥【之前】。若顺序被打乱，桥侧用
// window.AITChatGPTFiber?. 可选链静默降级为空结果，ISOLATED 侧再回退 DOM 提取（不崩，
// 但会失去 fiber 直读能力）。
(function () {
  'use strict';
  if (window.AITChatGPTFiber) return;

  /**
   * 取元素上的 React Fiber 实例（__reactFiber$xxx expando）。
   * @param {Element} el
   * @returns {*} fiber 或 null
   */
  function getFiber(el) {
    if (!el) return null;
    const key = Object.keys(el).find(k => k.startsWith('__reactFiber'));
    return key ? el[key] : null;
  }

  /**
   * 从元素的 fiber 起，沿 fiber.return 向上最多 maxDepth 层，对每层的 memoizedProps
   * 调用 pick(props)，返回第一个「非 null / 非 undefined」的 pick 结果；找不到返回 null。
   *
   * ChatGPT 把「一轮对话」的数据挂在某个祖先 fiber 的 memoizedProps.turn 上，单条消息挂在
   * memoizedProps.message 上，层级不定，故需向上爬找。具体接受哪一层由调用方的 pick 决定。
   *
   * @param {Element} el - 起始 DOM 元素（如 [data-turn-id] 轮元素）
   * @param {(props:Object)=>*} pick - 对每层 memoizedProps 求值，命中返回目标值，否则返回 null
   * @param {number} [maxDepth=30] - 最多向上爬的层数
   * @returns {*} pick 的命中结果或 null
   */
  function climb(el, pick, maxDepth = 30) {
    let fiber = getFiber(el);
    for (let i = 0; i < maxDepth && fiber; i++) {
      try {
        const hit = pick(fiber.memoizedProps || {});
        if (hit !== null && hit !== undefined) return hit;
      } catch { /* 忽略异常层，继续向上 */ }
      fiber = fiber.return;
    }
    return null;
  }

  window.AITChatGPTFiber = { getFiber, climb };
})();
