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
    id: '2026061701',
    // 'icon' = 提示词按钮左侧显示 Logo + 小红点（温和提示）
    // 'popup' = 自动弹窗展示更新内容（强提醒）
    displayMode: 'icon',

    features: [
        {
            zh: '新增第三方 AI 对话站适配：meta.ai、z.ai、chatglm.cn 等站点现已支持时间轴、闪记等全部功能',
            en: 'Third-party AI site support: timeline, quick notes, and every other feature now work on meta.ai, z.ai, chatglm.cn, and more'
        },
        {
            zh: 'AI 回复完成提示音：回复结束后可播放提示音效，默认关闭，可在设置中按需开启',
            en: 'Reply completion sound: optional notification when the AI finishes responding—off by default, enable it anytime in settings'
        },
        {
            zh: '界面语言切换：支持跟随系统、中文、英文三种模式，按需切换扩展显示语言',
            en: 'Language options: choose Follow system, Chinese, or English for the extension UI'
        },
        {
            zh: '适配所有 ChatGPT、Gemini 镜像网站：无需手动配置，在常见镜像站上也能直接使用时间轴、闪记等全部功能',
            en: 'Support all ChatGPT and Gemini mirror sites: timeline, quick notes and every other feature now work out of the box on common mirror sites—no setup needed'
        }
    ],

    improvements: [
        {
            zh: '修复 ChatGPT 对话框左侧提示词图标位置偏移的问题',
            en: 'Fixed misaligned prompt icon on the left side of the ChatGPT chat input area'
        }
    ]
};
