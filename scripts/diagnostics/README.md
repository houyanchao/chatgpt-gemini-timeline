# ChatGPT 接口诊断 revision 3

本轮只增加诊断，保留原时间轴识别和接口解析逻辑。

## 用户操作

1. 解压诊断包，在 Chrome 扩展管理页加载文件夹或重新加载已有诊断版。避免同时启用两个 Timeline 版本。
2. 打开出问题的已有 GPT 对话页，打开 Console，刷新网页，等待 60 秒。
3. 若方便，再切换到另一条已有对话，等待约 15 秒。不需要发送私人测试消息。
4. Console 顶部 JavaScript 上下文选择 `top`，执行：

   ```js
   copy(window.AITGPTDiagnostics.export())
   ```

5. 将剪贴板内容粘贴到 TXT 发回。报告开头是 `[AIT-GPT-DIAG-REPORT]`，revision 为 3。

若提示 AITGPTDiagnostics 不存在，请反馈该情况；不需要导出完整网页 HTML 或全部 Console 日志。

## 覆盖范围

- fetch 请求、原接口命中、脱敏路径、当前会话路径匹配布尔值、状态和响应格式。
- 其他同源 API 的 JSON 结构、POST JSON、SSE 前段结构；XHR 与浏览器 Resource Timing，用于判断请求是否绕过原 fetch 包装。
- 原解析器的 mapping / 当前分支 / 消息过滤 / 缓存 / API 与 DOM ID 匹配数量。
- 功能开关、依赖、初始化阶段、DOM 匹配、固定角色标签统计、容器及渲染数量。
- MAIN 与 ISOLATED 环境的记录在 MAIN 中合并导出；不写入持久存储，不发送诊断报告到服务器。

## 隐私与限额

不输出正文、输入内容、账号、Cookie、请求体、原始链接、ID、原始异常消息或堆栈。
响应仅在内存中检查类型和结构；未知字段名用序号代替，标量值不输出，固定角色值除外。
自动脱敏并非对整个页面 Console 的处理，只适用于本模块产生的记录，请使用导出命令。

报告最多保留 2000 条；相同事件 5 秒内去重，每种事件最多 500 条；`dropped` 表示超过限额的记录数量。
替代 fetch 响应最多选择 80 次，每种方法/脱敏路径最多 3 次；非对话类请求优先使用较小配额。
JSON 副本最多 2 MiB、5 秒；SSE 副本最多 32 KiB、约 10 个事件、5 秒，仅输出前 3 个 JSON 事件的结构。
XHR 最多采样 20 个 JSON 响应；Resource Timing 最多 300 条、观察 3 分钟。
结构树最多 180 个节点、深度 5、每对象 30 个字段、每数组 3 个样本；报告中标注截断。
这些限额用于避免拖慢用户页面。报告不保证覆盖未知协议、后续流事件或被浏览器屏蔽的请求。

## 本地验证

临时 jsdom 依赖可装在工作区之外。

```sh
NODE_PATH=/private/tmp/ait-dom-tests/node_modules node scripts/tests/chatgpt-api-diagnostics.cjs
NODE_PATH=/private/tmp/ait-dom-tests/node_modules node scripts/tests/chatgpt-diagnostics-coverage.cjs
```
