<div align="center">
  <img src="./icons/icon128.png" alt="Timeline Logo" width="88" height="88">
  <h1>Timeline</h1>
  <p><strong>面向 AI 对话页面的浏览器增强扩展</strong></p>
  <p>为 ChatGPT、Gemini、Claude、DeepSeek、Kimi、豆包、通义千问、Grok、Perplexity、NotebookLM 等平台提供对话导航、收藏整理、输入增强、公式复制、代码运行与数据备份能力。</p>

  <p>
    <a href="https://chromewebstore.google.com/detail/timeline-ai-chat/fgebdnlceacaiaeikopldglhffljjlhh"><img src="https://img.shields.io/badge/Chrome-Web%20Store-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white" alt="Chrome Web Store"></a>
    <a href="https://microsoftedge.microsoft.com/addons/detail/ai-timeline%EF%BC%9A%E5%8A%A9%E4%BD%A0%E4%BD%BF%E7%94%A8-ai-%E6%95%88%E7%8E%87%E7%BF%BB%E5%80%8D-/ekednjjojnhlajfobalaaihkibbdcbab"><img src="https://img.shields.io/badge/Microsoft-Edge%20Add--ons-0078D7?style=for-the-badge&logo=microsoftedge&logoColor=white" alt="Microsoft Edge Add-ons"></a>
    <a href="https://addons.mozilla.org/en-US/firefox/addon/ai-timeline/"><img src="https://img.shields.io/badge/Firefox-Add--ons-FF7139?style=for-the-badge&logo=firefoxbrowser&logoColor=white" alt="Firefox Add-ons"></a>
  </p>

  <p>
    <img src="https://img.shields.io/badge/Manifest-V3-2B6CB0?style=flat-square" alt="Manifest V3">
    <img src="https://img.shields.io/badge/License-GPL--3.0-2F855A?style=flat-square" alt="GPL-3.0 License">
    <a href="https://github.com/houyanchao/chatgpt-gemini-timeline"><img src="https://img.shields.io/badge/GitHub-AITimeline-24292F?style=flat-square&logo=github" alt="GitHub"></a>
  </p>

  <p><strong>简体中文</strong> | <a href="./README.md">English</a></p>

  <h2>立即安装</h2>
  <p>
    <a href="https://chromewebstore.google.com/detail/timeline-ai-chat/fgebdnlceacaiaeikopldglhffljjlhh"><strong>Chrome Web Store</strong></a>
    &nbsp;|&nbsp;
    <a href="https://microsoftedge.microsoft.com/addons/detail/ai-timeline%EF%BC%9A%E5%8A%A9%E4%BD%A0%E4%BD%BF%E7%94%A8-ai-%E6%95%88%E7%8E%87%E7%BF%BB%E5%80%8D-/ekednjjojnhlajfobalaaihkibbdcbab"><strong>Microsoft Edge Add-ons</strong></a>
    &nbsp;|&nbsp;
    <a href="https://addons.mozilla.org/en-US/firefox/addon/ai-timeline/"><strong>Firefox Add-ons</strong></a>
  </p>

  <img src="./READMEIMAGE/index.png" alt="Timeline 功能预览" width="840">
</div>

## 简介

Timeline 是一个运行在浏览器端的 AI 对话增强扩展。它保留各 AI 平台原有界面，在页面内补充更适合长对话使用的导航、整理、记录、复制和输入辅助能力。

它主要解决这些问题：

- 长对话中难以快速回到某次提问。
- 高价值回答分散在不同会话中，后续检索和复用成本高。
- 公式、代码块、Mermaid 图表等内容需要额外处理。
- 不同 AI 平台的输入习惯不一致，常用提示词和追问流程重复。
- 浏览器扩展数据需要在本地备份或跨浏览器迁移。

## 安装

推荐通过浏览器官方商店安装：

| 浏览器 | 安装入口 |
| --- | --- |
| Chrome | **[安装 Chrome 版](https://chromewebstore.google.com/detail/timeline-ai-chat/fgebdnlceacaiaeikopldglhffljjlhh)** |
| Microsoft Edge | **[安装 Edge 版](https://microsoftedge.microsoft.com/addons/detail/ai-timeline%EF%BC%9A%E5%8A%A9%E4%BD%A0%E4%BD%BF%E7%94%A8-ai-%E6%95%88%E7%8E%87%E7%BF%BB%E5%80%8D-/ekednjjojnhlajfobalaaihkibbdcbab)** |
| Firefox | **[安装 Firefox 版](https://addons.mozilla.org/en-US/firefox/addon/ai-timeline/)** |

安装后打开受支持的 AI 对话页面即可使用。大多数功能默认开启，也可以在扩展设置面板中按平台或功能关闭。

## 功能

| 分类 | 说明 |
| --- | --- |
| 对话导航 | 在页面右侧生成时间轴，每个节点对应一次用户提问，支持点击跳转、键盘导航、回到底部和提问时间标签。 |
| 问题列表 | 将当前会话中的问题集中展示，支持跳转、收藏和标记重点，适合按问题维度回顾长对话。 |
| 收藏与归档 | 支持收藏单条问答或整页会话，并使用文件夹、备注和搜索进行管理。部分平台支持在原生侧边栏中展示收藏入口。 |
| 输入增强 | 支持提示词库、快捷追问、智能 Enter 行为、输入框动画和常用设置入口。 |
| 阅读与复制 | 支持文本高亮、LaTeX / MathML 公式复制、Mermaid 图表预览和代码块辅助操作。 |
| 代码运行 | 支持 JavaScript、TypeScript、SQL、HTML、JSON、Markdown 等常见代码块的运行或预览。 |
| 数据管理 | 支持 JSON 导入导出、Google Drive 备份与恢复，用于数据迁移和多设备同步。 |
| 个性化设置 | 支持时间轴主题色、对话宽度调整、多语言界面和细粒度功能开关。 |

## 支持平台

| 平台 | 时间轴 | 高亮 | 智能输入 | 输入动画 | 快捷追问 | 提问时间 | 侧边栏收藏 | 回到底部 |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| ChatGPT | 支持 | 支持 | 支持 | 支持 | 支持 | 支持 | 支持 | - |
| Gemini | 支持 | 支持 | 支持 | 支持 | 支持 | 支持 | 支持 | 支持 |
| DeepSeek | 支持 | 支持 | 支持 | 支持 | 支持 | 支持 | 支持 | - |
| Claude | 支持 | 支持 | 支持 | - | 支持 | - | 支持 | - |
| Kimi | 支持 | 支持 | 支持 | 支持 | 支持 | 支持 | 支持 | - |
| 豆包 | 支持 | 支持 | 支持 | 支持 | 支持 | 支持 | 支持 | - |
| 通义千问 | 支持 | 支持 | 支持 | 支持 | 支持 | 支持 | 支持 | - |
| Qwen 国际版 | 支持 | 支持 | 支持 | 支持 | 支持 | 支持 | 支持 | - |
| Grok | 支持 | 支持 | 支持 | 支持 | 支持 | - | - | - |
| Perplexity | 支持 | 支持 | 支持 | - | 支持 | - | - | - |
| 腾讯元宝 | 支持 | 支持 | 支持 | 支持 | 支持 | - | - | - |
| 文心一言 | 支持 | 支持 | - | - | 支持 | - | - | - |
| NotebookLM | - | 支持 | 支持 | - | 支持 | - | - | - |

公式复制、代码运行和 Mermaid 图表能力不依赖特定 AI 平台。只要页面中存在可识别内容，扩展会尽量提供对应操作。

## 数据与隐私

Timeline 的核心数据默认保存在浏览器本地，包括收藏、文件夹、提示词、设置项、时间标签和笔记内容。

可选的 Google Drive 同步只会在用户主动授权后使用，并用于备份和恢复扩展数据。扩展不会收集、上传或分享用户的对话内容和个人信息。

本项目已开源，所有数据处理逻辑都可以在仓库中审查。

## 权限说明

| 权限 | 用途 |
| --- | --- |
| `storage` | 保存收藏、文件夹、提示词、功能设置和本地数据。 |
| `unlimitedStorage` | 避免长对话收藏、笔记和备份数据受浏览器默认配额影响。 |
| `identity` | 用于 Google Drive 授权备份和恢复。 |
| `activeTab` | 在用户当前打开的 AI 页面中启用扩展功能。 |

## 多语言

当前内置 19 个语言包：

| 语言 | 代码 |
| --- | --- |
| English | `en` |
| English (US) | `en_US` |
| English (GB) | `en_GB` |
| 简体中文 | `zh_CN` |
| 繁體中文 | `zh_TW` |
| 繁體中文（香港） | `zh_HK` |
| 日本語 | `ja` |
| 한국어 | `ko` |
| Deutsch | `de` |
| Français | `fr` |
| Español | `es` |
| Italiano | `it` |
| Português | `pt_PT` |
| Русский | `ru` |
| Polski | `pl` |
| हिन्दी | `hi` |
| ไทย | `th` |
| Tiếng Việt | `vi` |
| Bahasa Indonesia | `id` |

## 本地开发

本仓库是浏览器扩展项目，没有前端构建步骤。开发时可以直接加载源码目录：

1. 打开 Chrome 或 Edge 的扩展管理页面。
2. 启用开发者模式。
3. 选择“加载已解压的扩展程序”。
4. 选择本仓库根目录。
5. 修改代码后，在扩展管理页面点击重新加载，并刷新目标 AI 平台页面。

Firefox 调试可使用 `about:debugging` 临时加载扩展。

## 反馈

欢迎通过以下方式反馈问题或提出需求：

- [GitHub Issues](https://github.com/houyanchao/chatgpt-gemini-timeline/issues)
- 邮件：houyanchao@outlook.com
- Chrome / Edge / Firefox 插件商店评价区

提交问题时建议包含浏览器版本、扩展版本、目标 AI 平台、复现步骤、预期行为、实际行为和截图。

## 致谢

本项目基于 [chatgpt-conversation-timeline](https://github.com/Reborn14/chatgpt-conversation-timeline) 继续开发，感谢原作者的开源贡献。

Gemini 图片去水印功能（`js/watermark/engine/`）移植自 [GargantuaX/gemini-watermark-remover](https://github.com/GargantuaX/gemini-watermark-remover)（MIT），其反向 Alpha 混合算法与校准蒙版源自 [allenk/GeminiWatermarkTool](https://github.com/allenk/GeminiWatermarkTool)（MIT，© 2024 AllenK / Kwyshell）。完整许可证见 [`js/watermark/engine/LICENSE`](./js/watermark/engine/LICENSE)。

## 许可证

本项目基于 [GPL-3.0](./LICENSE) 许可证开源。

---

<div align="center">
  <p>如果 Timeline 对你有帮助，欢迎给一个 Star。</p>
</div>
