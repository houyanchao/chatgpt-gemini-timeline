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
    id: '2026072902',
    // 'icon' = 提示词按钮左侧显示 Logo + 小红点（温和提示）
    // 'popup' = 自动弹窗展示更新内容（强提醒）
    displayMode: 'icon',

    features: [
        {
            zh: '新增 ChatGPT、Gemini 对话导出：支持导出完整会话或选择部分对话，并提供 Markdown、TXT、JSON、CSV、PNG 和 PDF 格式',
            en: 'ChatGPT and Gemini conversation export: export an entire conversation or selected turns in Markdown, TXT, JSON, CSV, PNG, or PDF format'
        }
    ],

    improvements: [
        {
            zh: '性能优化：大型依赖改为按需加载，并减少时间轴渲染、页面监听和初始化开销，提升长对话场景的流畅度',
            en: 'Performance improvements: large dependencies now load on demand, with lower timeline rendering, page observation, and initialization overhead for smoother long conversations'
        },
        {
            zh: '优化 ChatGPT 长对话支持，提升问题文本加载和完整对话导出的稳定性',
            en: 'Improved ChatGPT long-conversation support for more reliable question loading and complete conversation exports'
        },
        {
            zh: '优化回复生成期间的滚动体验，减少页面自动跳转及长对话中手动滚动被误判的问题',
            en: 'Improved scrolling while responses are generated, reducing automatic jumps and misinterpreted manual scrolling in long conversations'
        },
        {
            zh: '提示词内容上限由 10,000 提升至 20,000 个字符',
            en: 'Increased the prompt content limit from 10,000 to 20,000 characters'
        }
    ]
};
