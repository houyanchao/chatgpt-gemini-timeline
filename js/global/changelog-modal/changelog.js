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
    id: '2026112501',
    // 'icon' = 提示词按钮左侧显示 Logo + 小红点（温和提示）
    // 'popup' = 自动弹窗展示更新内容（强提醒）
    displayMode: 'icon',

    features: [],

    improvements: [
        {
            zh: '修复侧栏较晚展开或切换对话后文件夹偶尔不显示的问题。侧栏重建后也会保留文件夹的展开状态。',
            en: 'Fixed folders sometimes disappearing when opening the sidebar later or switching chats. Expanded folders now stay open when the sidebar is rebuilt.'
        },
        {
            zh: '重新设计「关于插件」页，将文档、GitHub 和三个浏览器的安装入口集中到页首。',
            en: 'Redesigned the About page and grouped the documentation, GitHub repository, and links to all three browser stores at the top.'
        }
    ]
};
