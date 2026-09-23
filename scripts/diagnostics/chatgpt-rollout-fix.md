# ChatGPT 2026-09 灰度时间轴兼容

本次只修复时间轴。保留脱敏诊断，不输出提问正文、消息 ID、账号或完整 URL。

## 新旧隔离

- 旧入口：`js/apiCapture/chatgpt.js` 的单数 conversation 接口和 mapping 父链回溯。
- 新入口：`js/apiCapture/chatgpt-rollout.js` 的复数 conversations 接口和 messages 列表。
- 共用：用户消息过滤、文本提取、会话缓存、响应乱序保护、跨 world 通信。
- 新 DOM：`js/timeline/adapters/chatgpt-rollout.js`，只有旧 DOM 选择器未命中时启用。
- 回退旧版：从 manifest 的 MAIN 和 ISOLATED 脚本列表分别删除两个 chatgpt-rollout.js 引用（再删除对应文件即可）；其余接入点均允许模块不存在。测试覆盖不加载模块的旧版路径。

新 DOM 根据 main 内的中英文无障碍角色标题定位消息，不依赖哈希 class。只在 API 提问全文与 DOM 全文双向唯一匹配时关联消息 ID，不使用 API 数组下标猜测页面轮次；重复提问或未匹配时沿用原来的数字索引降级。未匹配轮次的历史 UUID 收藏无法保证恢复。仅创建页面可定位的节点，不凭接口列表捏造未渲染节点的位置。

## 用户测试

解压修复测试包，在 chrome://extensions 重新加载扩展，然后刷新 ChatGPT 对话页面。分别检查已有对话、新发消息、切换对话、节点跳转和悬停文本。等待约 60 秒后，Console 执行：

```js
copy(window.AITGPTDiagnostics.export())
```

把复制的报告发回即可，不需要网页源码或完整聊天数据。报告应出现 api.parsed-branch 的 source=messages、adapter.prepared 的 headings=true、timeline.critical-elements 的 found=true，以及 timeline.render-input 的 userElements>0。

## 本地验证

使用临时目录中的 jsdom，不增加生产依赖：

```sh
NODE_PATH=/private/tmp/ait-dom-tests/node_modules node scripts/tests/chatgpt-api-diagnostics.cjs
NODE_PATH=/private/tmp/ait-dom-tests/node_modules node scripts/tests/chatgpt-rollout-dom.cjs
NODE_PATH=/private/tmp/ait-dom-tests/node_modules node scripts/tests/chatgpt-diagnostics-coverage.cjs
```

合成数据验证不能替代灰度账号的真实浏览器验收，尤其是分页、分支切换和尚未渲染轮次。

## r2：节点位置修复

对新版没有布局框的消息容器（例如 display: contents），使用正文子树的实际矩形合并测量；排除无障碍标题、按钮、隐藏节点和浮层。消息 ID 与文本仍由原消息容器负责。圆点分布、跳转、滚动高亮及布局重算统一调用适配器测量。旧版继续使用原生矩形和 offsetHeight。

新增脱敏字段：timeline.markers-built 的 distinctPositions（不同纵坐标数）、zeroHeightNodes（无有效高度的节点数）。多条分散提问应具有不同坐标，contentSpanPx 不应持续为 1。

新增测试：

```sh
NODE_PATH=/private/tmp/ait-dom-tests/node_modules node scripts/tests/chatgpt-rollout-geometry.cjs
```

该测试使用模拟布局坐标验证六个零尺寸容器、嵌套 contents、标题按钮排除、圆点分布、跳转、高亮、滚动坐标不变性、布局重排和旧版测量。仍需灰度用户实际页面验收。
