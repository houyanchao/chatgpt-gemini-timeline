# Smart Enter - 智能 Enter 功能

## 📝 功能说明

为 AI 对话平台提供更友好的输入体验：
- **单击 Enter**：在输入框中换行（不发送）
- **快速双击 Enter**：发送消息

这样可以方便地输入多行内容，同时保留快速发送的便捷性。

## 🏗️ 架构设计

### 文件结构

```
js/smartEnter/
├── index.js                    # 主入口，初始化逻辑
├── smart-enter-manager.js      # 核心管理器
├── constants.js                # 配置常量
├── adapters/                   # 平台适配器
│   ├── base.js                # 基础适配器（接口定义）
│   ├── chatgpt.js             # ChatGPT 适配器
│   └── registry.js            # 适配器注册表
└── README.md                   # 文档
```

### 设计模式

采用 **Adapter Pattern（适配器模式）**：
- 核心逻辑与平台解耦
- 每个平台只需实现特定的适配器
- 易于扩展新平台

## 🎯 工作原理

### 1. 双击检测机制

```
第一次 Enter
  ↓
阻止默认发送
  ↓
插入换行符
  ↓
记录时间戳
  ↓
启动 500ms 计时器
  ↓
第二次 Enter (< 500ms)
  ↓
检测到双击！
  ↓
触发发送按钮点击
```

### 2. 核心配置

```javascript
const SMART_ENTER_CONFIG = {
    DOUBLE_CLICK_INTERVAL: 500,  // 双击间隔（ms）
    ENABLED_BY_DEFAULT: true     // 默认启用
};
```

### 3. 平台适配器接口

每个平台适配器需要实现：

```javascript
class PlatformAdapter extends BaseSmartEnterAdapter {
    // 是否匹配当前页面
    matches() { }
    
    // 获取输入框选择器
    getInputSelector() { }
    
    // 获取发送按钮选择器
    getSendButtonSelector() { }
    
    // 判断是否可以发送（可选）
    canSend(inputElement) { }
}
```

## 🚀 已支持平台

### ChatGPT
- **域名**：`chatgpt.com`, `chat.openai.com`
- **输入框**：`#prompt-textarea`
- **发送按钮**：`button[data-testid="send-button"]`

## 📦 添加新平台

### 步骤：

#### 1. 创建新适配器

`js/smartEnter/adapters/platform.js`:

```javascript
class PlatformSmartEnterAdapter extends BaseSmartEnterAdapter {
    matches() {
        return location.hostname === 'platform.com';
    }
    
    getInputSelector() {
        return '.input-selector';
    }
    
    getSendButtonSelector() {
        return '.send-button-selector';
    }
    
    canSend(inputElement) {
        return inputElement.value.trim().length > 0;
    }
}
```

#### 2. 在 registry.js 中注册

```javascript
_registerAdapters() {
    // ... 现有适配器
    
    // 添加新平台
    if (typeof PlatformSmartEnterAdapter !== 'undefined') {
        this.adapters.push(new PlatformSmartEnterAdapter());
    }
}
```

#### 3. 更新 manifest.json

在 `content_scripts.js` 中添加新文件：

```json
"js/smartEnter/adapters/platform.js"
```

## 🎮 使用方式

### 用户体验

1. **输入多行内容**：
   - 按 Enter → 换行 ✅
   - 按 Enter → 换行 ✅
   - 按 Enter → 换行 ✅

2. **快速发送**：
   - 按 Enter → 换行
   - 快速再按 Enter（< 500ms）→ 发送消息 🚀

### 开发者控制

```javascript
// 全局访问管理器
window.smartEnterManager

// 启用功能
window.smartEnterManager.enable()

// 禁用功能
window.smartEnterManager.disable()
```

## ⚙️ 配置选项

### 调整双击间隔

在 `constants.js` 中修改：

```javascript
DOUBLE_CLICK_INTERVAL: 500  // 单位：毫秒
```

建议范围：300-800ms

## 🐛 故障排查

### 功能未生效

1. 检查是否为支持的平台
2. 检查控制台是否有错误
3. 检查输入框选择器是否正确

### 双击不灵敏

- 增大 `DOUBLE_CLICK_INTERVAL` 值

### 双击太敏感

- 减小 `DOUBLE_CLICK_INTERVAL` 值

## 📌 注意事项

1. **不影响组合键**：Shift+Enter、Ctrl+Enter 等组合键保持原生行为
2. **自动高度调整**：插入换行后会触发输入框高度自适应
3. **性能优化**：使用 WeakSet 避免重复附加监听器
4. **兼容性**：使用 capture 模式优先拦截，确保功能可靠

## 🎯 未来扩展

计划支持的平台：
- [ ] Gemini
- [ ] Claude
- [ ] DeepSeek
- [ ] Kimi
- [ ] 文心一言
- [ ] 通义千问
- [ ] 更多...
