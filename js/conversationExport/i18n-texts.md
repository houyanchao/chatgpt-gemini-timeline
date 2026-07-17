# 对话导出模块 · 待接入 i18n 中文文案清单

本文件整理 `conversationExport` 导出模块中**面向用户可见、需要写入 `_locales` 的中文文案**，用于后续接入 i18n。

说明：

- 所有面向用户的文案集中在 `js/conversationExport/constants.js` 的 `CE_TEXT` 对象，其余文件（`exporters.js`、`png-exporter.js`、`pdf-exporter.js`、`export-modal.js`、`export-manager.js` 等）均通过 `CE_TEXT` 取值，无独立硬编码文案。
- 设置面板 Tab（`js/panelModal/tabs/conversationExport/index.js`）已接入 i18n（`conversationExportTabName` / `conversationExportSettingsTitle` / `conversationExportSettingsHint` / `conversationExportSettingsEmpty`），本清单不再重复。
- 建议 key 统一以 `conversationExport` 为前缀，保持与现有命名一致。
- 带 `{count}` 的文案为模板文案，接入时需保留占位符。

## 一、弹窗与按钮

| 建议 key | 中文文案 | 说明 |
| --- | --- | --- |
| conversationExportButtonTooltip | 导出对话 | 导出按钮悬停提示 |
| conversationExportModalTitle | 导出对话 | 弹窗标题 |

## 二、设置区标题

| 建议 key | 中文文案 | 说明 |
| --- | --- | --- |
| conversationExportSectionRange | 导出范围 | 分区标题 |
| conversationExportSectionFormat | 导出格式 | 分区标题 |
| conversationExportSectionHeader | 更多配置 | 分区标题 |
| conversationExportSectionTheme | 主题色 | 分区标题 |
| conversationExportSectionList | 选择对话 | 分区标题 |

## 三、导出范围

| 建议 key | 中文文案 | 说明 |
| --- | --- | --- |
| conversationExportRangeAll | 整个会话 | 范围选项 |
| conversationExportRangeSelect | 选择对话 | 范围选项 |

## 四、更多配置 / 头部信息

| 建议 key | 中文文案 | 说明 |
| --- | --- | --- |
| conversationExportHeaderShowUrl | 对话 URL | 开关项 |
| conversationExportHeaderShowTime | 导出时间 | 开关项 |
| conversationExportHeaderShowConversationTime | 对话时间 | 开关项 |
| conversationExportAskTimeLabel | 提问时间 | 提问时间标签 |
| conversationExportSourceLabel | 对话 URL | 导出内容中的来源标签 |
| conversationExportTimeLabel | 导出时间 | 导出内容中的时间标签 |
| conversationExportTitleLabel | 标题 | 导出内容中的标题标签 |

## 五、对话选择列表

| 建议 key | 中文文案 | 说明 |
| --- | --- | --- |
| conversationExportSelectAll | 全选 | 全选按钮 |
| conversationExportTurnPrefix | 对话 | 对话序号前缀（如「对话 1」） |
| conversationExportEmptyAssistant | 未找到回复内容 | 无助手回复时的占位文案 |
| conversationExportEmptyUserPreview | （无文本内容） | 用户内容为空时的预览占位 |

> 注：角色标签 `Q` / `A`（`exportRoleUser` / `exportRoleAssistant`）为固定符号，通常无需翻译；如需本地化可一并纳入。

## 六、操作按钮

| 建议 key | 中文文案 | 说明 |
| --- | --- | --- |
| conversationExportCancel | 取消 | 取消按钮 |
| conversationExportConfirm | 导出 | 确认导出按钮 |

## 七、状态提示

| 建议 key | 中文文案 | 说明 |
| --- | --- | --- |
| conversationExportLoading | 加载对话中... | 加载中提示 |
| conversationExportLoadingProgress | 加载对话中...（已加载 {count} 条） | 加载进度（含占位符 `{count}`） |
| conversationExportCancelLoading | 取消加载 | 取消加载按钮 |
| conversationExportExporting | 导出中... | 导出进行中提示 |
| conversationExportDone | 对话已导出 | 导出成功提示 |
| conversationExportFailed | 导出失败 | 导出失败提示 |
| conversationExportNoConversation | 未找到可导出的对话 | 无可导出内容提示 |
| conversationExportNeedSelect | 请至少选择 1 条对话 | 未选择时的提示 |

## 八、图片相关

| 建议 key | 中文文案 | 说明 |
| --- | --- | --- |
| conversationExportImageCannotEmbed | 图片无法内嵌 | PNG 图片占位提示（短） |
| conversationExportImageNotRendered | 图片未渲染，无法内嵌（可滚动到该轮后重试） | 图片未渲染时的详细提示 |
| conversationExportTruncatedNotice | 内容过长，已截断 | 内容截断提示 |
| conversationExportImageListTitle | 图片 | 图片列表标题 |

## 九、兜底文案（constants.js / base.js）

| 建议 key | 中文文案 | 说明 |
| --- | --- | --- |
| conversationExportDefaultFilename | 对话导出 | 文件名兜底（`ceSanitizeFilename` 的 `fallback`） |
| conversationExportDefaultTitle | 对话导出 | 会话标题兜底（`base.js` `getChatTitle` 返回值） |

> 上述两处中文文案一致，可复用同一 key（如 `conversationExportDefaultFilename`）。
