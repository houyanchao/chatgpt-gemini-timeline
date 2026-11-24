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
    id: '2026112401',
    // 'icon' = 提示词按钮左侧显示 Logo + 小红点（温和提示）
    // 'popup' = 自动弹窗展示更新内容（强提醒）
    displayMode: 'icon',

    features: [
        {
            zh: '设置面板新增「赞助」页，可通过微信或支付宝支持插件开发',
            en: 'The new Sponsor tab in settings lets you support development through WeChat or Alipay'
        }
    ],

    improvements: [
        {
            zh: '提示词弹窗顶部的爱心按钮可直接打开「赞助」页',
            en: 'The heart button in the prompt menu opens the Sponsor tab directly'
        }
    ]
};
