/**
 * Changelog Data - 版本更新内容
 * 
 * 每次想推送更新提示时只需修改这个文件：
 * 1. 更换 id 为任意新字符串（与上次不同即可触发提示）
 * 2. 设置 displayMode：'icon'(提示词按钮左侧 Logo) 或 'popup'(自动弹窗)
 * 3. 更新 features / improvements 列表（支持 zh/en 双语）
 *    - features: 新功能
 *    - improvements: 功能优化 & 修复
 * 
 * 弹窗中展示的版本号自动从 manifest.json 获取，无需手动维护
 */

const CHANGELOG_DATA = {
    id: '2026053101',
    // 'icon' = 提示词按钮左侧显示 Logo + 小红点（温和提示）
    // 'popup' = 自动弹窗展示更新内容（强提醒）
    displayMode: 'icon',

    features: [
        {
            zh: '适配所有 ChatGPT、Gemini 镜像网站：无需手动配置，在常见镜像站上也能直接使用时间轴、闪记等全部功能',
            en: 'Support all ChatGPT and Gemini mirror sites: timeline, quick notes and every other feature now work out of the box on common mirror sites—no setup needed'
        },
        {
            zh: '阻止发送后自动跳到底部：向上翻看历史时发消息，页面不再被强制拉到底部，始终停留在当前阅读位置，AI 生成过程中也不会打断你',
            en: 'Stay where you’re reading: send a message while scrolled up in the history and the page no longer jumps to the bottom—your reading position is kept, even while the AI is generating'
        },
        {
            zh: '自定义平台适配：除原生支持的常用 AI 平台外，镜像站、公司内部 AI 站等也能自行接入，同样享受时间轴、闪记等功能',
            en: 'Adapt any site: beyond the built-in mainstream AI platforms, you can now bring timeline, quick notes and more to mirror sites, internal company AI tools, and other custom pages'
        }
    ],

    improvements: [
        {
            zh: '修复千问国际版（chat.qwen.ai）无法复制 LaTeX 公式的问题',
            en: 'Fixed an issue where LaTeX formulas could not be copied on Qwen (international)'
        },
        {
            zh: '修复 Gemini、ChatGPT 侧边栏对话历史列表中不显示「收藏到文件夹」的问题',
            en: 'Fixed the missing “Save to folder” action in the conversation history list of the Gemini and ChatGPT sidebars'
        }
    ]
};
