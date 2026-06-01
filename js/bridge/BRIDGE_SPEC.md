# Bridge 接口规范

> 本文档定义所有平台 Bridge（`chatgpt-bridge.js`、`gemini-bridge.js` …）必须遵循的统一接口规范。
> **后续所有 Bridge API 都按本规范编写。**

## 1. 设计理念

Bridge = **单个 AI 平台基础能力的统一抽象层**，运行在内容脚本（隔离世界），注入到第三方页面（ChatGPT / Gemini 等）。

借鉴微信两套 SDK，取各自所长，组合成本项目的 Bridge 风格：

| 借鉴来源 | 借鉴的部分 | 用途 |
|---|---|---|
| 微信 **H5 JS-SDK** | 生命周期 + 能力探测：`ready()` / `error()` / `checkApi()` | 应对「注入第三方页面、DOM 异步出现、平台改版能力失效」的不可控环境 |
| 微信 **小程序** | 调用风格：同步读 `getXxxSync()` + 事件 `onXxx()/offXxx()` | 消费方是自己的代码，主要做「同步读 DOM / 订阅事件」 |

> 明确**不引入**的内容：H5 SDK 的 `wx.config` 鉴权与 `jsApiList` 声明（无服务端签名需求）、H5 SDK 的 `{success, fail, complete}` 三回调（用同步读 + Promise 替代）。

---

## 2. 命名约定（强制）

| 类别 | 命名 | 说明 |
|---|---|---|
| 同步读取 | `getXxxSync()` | 立即返回结果；取不到返回 `null`（对象/元素）或 `false`（布尔）；**绝不抛异常** |
| 异步动作 | `doXxx()` / 动词命名，返回 `Promise` | 触发副作用（发送消息、跳转对话等）；失败时 reject |
| 事件订阅 | `onXxx(callback)` | 注册监听器，返回 `this`（支持链式） |
| 事件注销 | `offXxx(callback)` | 注销监听器，返回 `this`；注销未注册的 callback 安全无操作 |

- 命名一律使用 **小驼峰**；同步读取**必须**带 `Sync` 后缀。
- 同一事件的 `onXxx` / `offXxx` 必须成对出现。

---

## 3. 生命周期 API（每个 Bridge 必须实现）

| 成员 | 类型 | 说明 |
|---|---|---|
| `ready(callback)` | `(bridge) => void` | 平台匹配且**关键 DOM 就绪**后回调；若已就绪，则**异步**立即回调。返回 `this`。 |
| `error(callback)` | `(error) => void` | 平台不匹配 / 初始化失败 / 就绪超时时回调；若已失败，则异步立即回调。返回 `this`。 |
| `isReady` | `getter => boolean` | 是否已就绪。 |
| `platform` | `getter => { id, name, sites, features }` | 平台描述；优先取全局 `SITE_INFO`，缺失时降级到内置兜底。 |
| `checkApi(apiName)` | `(string) => boolean` | 能力探测：当前 Bridge 是否提供该 API。 |
| `init()` | `() => this` | 手动触发初始化（一般无需调用，`ready/error/事件订阅` 会自动触发）。 |

### 初始化规则
- **懒初始化**：构造函数**不得**产生副作用（不启动 observer、不轮询）。初始化在首次调用 `ready()` / `error()` / 事件订阅时触发，且**幂等**。
- **就绪判定**：以「关键 DOM 出现」为准（如输入框出现）。带超时兜底，超时走 `error()`。
- **平台不匹配**：直接走 `error()`，`isReady` 保持 `false`。

---

## 4. 事件规范（强制）

- **懒加载底层监听**：首个监听器注册时才启动底层 observer；最后一个监听器注销时停止。
- callback 形如 `(detail) => void`，`detail` 为一个**对象**（即使只有一个字段，也用对象包装，便于扩展）。
- 同一 callback 重复注册只生效一次（内部用 `Set` 去重）。
- 回调执行需被 try/catch 包裹，单个监听器抛错不得影响其他监听器。

---

## 5. 错误处理与降级（强制）

- 所有 `getXxxSync()` 内部 try/catch，异常时返回空值（`null` / `false` / `[]`）。
- 优先复用全局基础设施：`window.DOMObserverManager`、`window.urlChangeMonitor`、`SITE_INFO`、`matchesPlatform()`。
- 上述全局缺失时**自动降级**到原生 API（如原生 `MutationObserver`、`location.hostname` 匹配），保证 Bridge 可独立工作。

---

## 6. 全局暴露（强制）

每个 Bridge 文件末尾：

```js
if (typeof window !== 'undefined') {
    window.XxxBridge = XxxBridge;                 // 暴露类
    if (!window.xxxBridge) {
        window.xxxBridge = XxxBridge.getInstance(); // 暴露单例
    }
}
```

- 类名：`XxxBridge`（大驼峰，如 `ChatGPTBridge`）。
- 单例：`XxxBridge.getInstance()`，并挂到 `window.xxxBridge`（小驼峰）。

---

## 7. 文件骨架模板

```js
class XxxBridge {
    static SUPPORTED_APIS = [ /* ... */ ];
    static _instance = null;
    static getInstance() { /* 单例 */ }

    constructor() { /* 仅初始化字段，无副作用 */ }

    // —— 生命周期（H5 风格）——
    ready(cb) {}
    error(cb) {}
    get isReady() {}
    get platform() {}
    checkApi(name) {}
    init() {}

    // —— 同步读取（小程序风格 getXxxSync）——
    getXxxSync() {}

    // —— 事件（小程序风格 onXxx/offXxx）——
    onXxx(cb) {}
    offXxx(cb) {}

    // —— 内部实现 _xxx() ——
}
```

---

## 8. 已实现 API 清单

### chatgpt-bridge.js

| API | 类别 | 签名 | 说明 |
|---|---|---|---|
| `getAIGeneratingSync()` | 同步读 | `() => boolean` | AI 当前是否正在生成回复（发送按钮 `data-testid === 'stop-button'`） |
| `onAIGenerateStart(cb)` | 事件 | `({ generating: true }) => void` | AI 开始生成回复 |
| `offAIGenerateStart(cb)` | 事件 | — | 取消订阅「开始生成」 |
| `onAIGenerateEnd(cb)` | 事件 | `({ generating: false }) => void` | AI 结束生成回复 |
| `offAIGenerateEnd(cb)` | 事件 | — | 取消订阅「结束生成」 |
| `getInputElementSync()` | 同步读 | `() => HTMLElement\|null` | 获取对话输入框元素（`#prompt-textarea`） |

> 后续新增 API 时，请在本表追加对应行。

---

## 9. 使用示例

```js
const bridge = window.chatGPTBridge; // 或 ChatGPTBridge.getInstance()

bridge
    .ready((b) => {
        console.log('当前平台：', b.platform.name);
        console.log('AI 是否正在生成：', b.getAIGeneratingSync());
        console.log('输入框元素：', b.getInputElementSync());
    })
    .error((err) => {
        console.warn('Bridge 初始化失败：', err.message);
    });

// 能力探测
if (bridge.checkApi('onAIGenerateStart')) {
    const onStart = () => console.log('AI 开始生成');
    const onEnd = () => console.log('AI 结束生成');
    bridge.onAIGenerateStart(onStart);
    bridge.onAIGenerateEnd(onEnd);

    // 不再需要时注销（最后一个监听器移除后会自动停止底层监控）
    // bridge.offAIGenerateStart(onStart);
    // bridge.offAIGenerateEnd(onEnd);
}
```
