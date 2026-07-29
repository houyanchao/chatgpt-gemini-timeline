# Dropdown Manager - 全局下拉菜单管理器

全局下拉菜单组件，提供统一的下拉菜单交互体验。

## ✨ 特性

- ✅ **全局单例**：整个应用共享一个实例
- ✅ **智能定位**：自动计算位置，支持多种对齐方式
- ✅ **边界检测**：超出视口时自动调整位置
- ✅ **点击外部关闭**：点击下拉菜单外部区域自动关闭
- ✅ **图标支持**：选项可添加图标（Emoji 或其他字符）
- ✅ **分隔线**：支持在选项间添加分隔线
- ✅ **禁用状态**：支持禁用某些选项
- ✅ **单例模式**：同时只显示一个下拉菜单
- ✅ **主题适配**：自动适配浅色/深色主题
- ✅ **组件自治**：URL 变化时自动清理

## 📦 安装

在 content script 中引入：

```javascript
// manifest.json 或动态加载
import './js/global/dropdown-manager/index.js';
```

## 🚀 快速开始

### 基础用法

```javascript
// 获取全局实例
const DropdownManager = window.globalDropdownManager;

// 显示简单下拉菜单
button.addEventListener('click', (e) => {
  DropdownManager.show({
    trigger: e.target,
    items: [
      { label: '编辑', value: 'edit', onClick: () => console.log('编辑') },
      { label: '删除', value: 'delete', onClick: () => console.log('删除') }
    ]
  });
});
```

### 带图标的菜单

```javascript
DropdownManager.show({
  trigger: element,
  items: [
    { label: '复制', icon: '📋', value: 'copy' },
    { label: '粘贴', icon: '📄', value: 'paste' },
    { type: 'divider' },
    { label: '删除', icon: '🗑️', value: 'delete', className: 'danger' }
  ],
  onSelect: (item) => {
    console.log('选中了:', item.label, item.value);
  }
});
```

### 完整配置

```javascript
DropdownManager.show({
  trigger: element,              // 必选：触发元素（用于定位）
  items: [                       // 必选：选项数组
    { 
      label: '选项1',            // 必选：显示文本
      value: 'option1',          // 可选：选项值
      icon: '🔖',                // 可选：图标（Emoji 或字符）
      onClick: () => {},         // 可选：点击回调
      disabled: false,           // 可选：是否禁用
      className: 'custom'        // 可选：自定义样式类
    },
    { type: 'divider' },         // 分割线
    { label: '选项2', value: 'option2' }
  ],
  onSelect: (item) => {},        // 可选：选择回调（在 item.onClick 之后触发）
  position: 'bottom-left',       // 可选：定位方式
  width: 200,                    // 可选：宽度（默认 200）
  className: 'custom-dropdown',  // 可选：自定义容器样式类
  id: 'my-dropdown'              // 可选：唯一标识（默认自动生成）
});
```

### 带子菜单

```javascript
DropdownManager.show({
  trigger: button,
  items: [
    { label: '复制', icon: '📋', onClick: () => {} },
    { 
      label: '移动到',
      icon: '📁',
      children: [  // ✨ 子菜单数组
        { label: '工作', onClick: () => moveToFolder('work') },
        { label: '学习', onClick: () => moveToFolder('study') },
        { type: 'divider' },
        { label: '生活', onClick: () => moveToFolder('life') }
      ]
    },
    { type: 'divider' },
    { label: '删除', icon: '🗑️', className: 'danger', onClick: () => {} }
  ],
  width: 160
});
```

**子菜单特性**：
- ✅ 鼠标悬停自动展开
- ✅ 智能定位（右侧优先，空间不足时左侧）
- ✅ 200ms 延迟关闭（给用户时间移动鼠标）
- ✅ 父菜单项依然可以点击（触发 onClick）
- ✅ 只支持 1 级子菜单

## 📋 API

### 显示下拉菜单

```javascript
DropdownManager.show(options)
```

#### 参数

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `trigger` | HTMLElement | 是 | - | 触发元素（用于定位） |
| `items` | Array | 是 | - | 选项数组 |
| `onSelect` | Function | 否 | - | 选择回调 `(item) => {}` |
| `position` | String | 否 | `'bottom-left'` | 定位方式 |
| `width` | Number | 否 | `200` | 宽度（px） |
| `className` | String | 否 | `''` | 自定义容器样式类 |
| `id` | String | 否 | 自动生成 | 唯一标识 |

#### items 配置

```javascript
// 普通选项
{
  label: '选项文本',        // 必选
  value: 'option-value',    // 可选
  icon: '🔖',               // 可选：图标（Emoji 或 SVG）
  onClick: (item) => {},    // 可选：点击回调
  disabled: false,          // 可选：是否禁用
  className: 'custom',      // 可选：自定义样式类（如 'danger'）
  children: [               // ✨ 可选：子菜单（只支持 1 级）
    { label: '子选项1', onClick: () => {} },
    { label: '子选项2', onClick: () => {} }
  ]
}

// 分割线
{
  type: 'divider'
}
```

#### position 选项

- `'bottom-left'`：下方左对齐（默认）
- `'bottom-right'`：下方右对齐
- `'top-left'`：上方左对齐
- `'top-right'`：上方右对齐

**注意**：组件会自动检测边界，如果超出视口会自动调整位置。

### 隐藏下拉菜单

```javascript
DropdownManager.hide()
```

### 强制隐藏所有下拉菜单

```javascript
DropdownManager.forceHideAll()
```

### 销毁管理器

```javascript
DropdownManager.destroy()
```

## 🎨 自定义样式

### 内置样式类

- `.global-dropdown-item.danger`：危险操作（红色）
- `.global-dropdown-item.disabled`：禁用状态（灰色）

### 自定义样式示例

```css
/* 自定义选项样式 */
.global-dropdown-item.custom {
  color: #3b82f6;
}

.global-dropdown-item.custom:hover {
  background-color: #dbeafe;
}

/* 自定义容器样式 */
.custom-dropdown {
  min-width: 250px;
}
```

## 💡 使用场景

### 1. 右键菜单

```javascript
element.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  
  DropdownManager.show({
    trigger: e.target,
    items: [
      { label: '复制', icon: '📋', onClick: () => copy() },
      { label: '剪切', icon: '✂️', onClick: () => cut() },
      { label: '粘贴', icon: '📄', onClick: () => paste() },
      { type: 'divider' },
      { label: '删除', icon: '🗑️', className: 'danger', onClick: () => remove() }
    ]
  });
});
```

### 2. 更多操作按钮

```javascript
moreButton.addEventListener('click', (e) => {
  DropdownManager.show({
    trigger: e.target,
    position: 'bottom-right',
    items: [
      { label: '分享', icon: '🔗' },
      { label: '收藏', icon: '⭐' },
      { label: '下载', icon: '⬇️' },
      { type: 'divider' },
      { label: '举报', icon: '🚫', className: 'danger' }
    ],
    onSelect: (item) => handleAction(item.value)
  });
});
```

### 3. 排序选择器

```javascript
sortButton.addEventListener('click', (e) => {
  DropdownManager.show({
    trigger: e.target,
    items: [
      { label: '按时间排序', icon: '🕐', value: 'time' },
      { label: '按名称排序', icon: '🔤', value: 'name' },
      { label: '按大小排序', icon: '📊', value: 'size' }
    ],
    onSelect: (item) => sortBy(item.value)
  });
});
```

## 📝 注意事项

1. **触发元素必须在 DOM 中**：确保 `trigger` 元素已添加到 DOM
2. **同时只显示一个**：新的下拉菜单会自动关闭旧的
3. **自动清理**：URL 变化时会自动清理下拉菜单
4. **点击外部关闭**：点击下拉菜单外部区域会自动关闭
5. **窗口大小改变**：窗口大小改变时会自动关闭下拉菜单

## 🔗 相关组件

- [Toast Manager](../toast-manager/README.md) - 全局提示消息
- [Tooltip Manager](../tooltip-manager/README.md) - 全局工具提示
- [Input Modal](../input-modal/README.md) - 全局输入弹窗

## 📄 License

MIT
