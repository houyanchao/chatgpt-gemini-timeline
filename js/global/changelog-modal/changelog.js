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
    id: '2026111901',
    // 'icon' = 提示词按钮左侧显示 Logo + 小红点（温和提示）
    // 'popup' = 自动弹窗展示更新内容（强提醒）
    displayMode: 'icon',

    features: [
        {
            zh: '更新日志底部新增 DeepSeek Harness 入口，可直达「DSH 插件」页，查看三种安装方式和官方客户端下载链接',
            en: 'A new DeepSeek Harness shortcut in the changelog opens the DSH Plugin tab with three installation options and the official desktop download link'
        }
    ],

    improvements: [
        {
            zh: '消息截图下载和复制均生成一张 PNG。超长内容超出尺寸上限时，会等比缩小以保留完整内容',
            en: 'Message screenshot downloads and copies now produce one PNG. Captures that exceed the size limit are scaled down to keep all content'
        },
        {
            zh: '修复设置弹窗打开时，右侧时间轴盖住遮罩、仍可点击的问题',
            en: 'Fixed the timeline appearing above the settings backdrop and remaining clickable while settings were open'
        }
    ]
};
