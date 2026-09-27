// 2026-09 灰度接口兼容层（MAIN world）。删除本文件及 manifest 引用即可只保留旧接口。
// 不改变 mapping 的分支回溯；不把 messages 的数组顺序解释为页面轮次。
window.AITChatGPTRolloutAPI = {
  match(pathname) {
    return pathname.match(/^\/backend-api\/conversations\/([0-9a-f][0-9a-f-]{18,})$/i);
  },
  nodes(json) {
    if (!Array.isArray(json?.messages)) return null;
    return json.messages.map(message => ({ id: message?.id, message }));
  }
};
