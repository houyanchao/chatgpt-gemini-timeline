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
    id: '2026111602',
    // 'icon' = 提示词按钮左侧显示 Logo + 小红点（温和提示）
    // 'popup' = 自动弹窗展示更新内容（强提醒）
    displayMode: 'icon',

    features: [
        {
            zh: '新增消息截图，在 ChatGPT、Gemini、Claude、DeepSeek、Kimi 和豆包中勾选提问或回复，即可复制图片或下载 PNG',
            en: 'Message screenshots let you select questions or replies and copy the image or download it as a PNG on ChatGPT, Gemini, Claude, DeepSeek, Kimi, and Doubao'
        },
        {
            zh: 'Poe、Arena Agent 和 Muse 新增时间轴、提问列表和闪记',
            en: 'Poe, Arena Agent, and Muse now support the timeline, question list, and quick notes'
        }
    ],

    improvements: [
        {
            zh: '修复 ChatGPT、Claude 等平台切换会话后的时间轴刷新和节点跳转问题。ChatGPT 重点标记在刷新后会正确恢复',
            en: 'Fixed timeline updates and message jumps after switching conversations on ChatGPT, Claude, and other platforms. ChatGPT pins now persist after a refresh'
        },
        {
            zh: '修复 Edge 上 ChatGPT 时间轴紧凑模式的边界误点击，节点跳转会等待虚拟化内容完成渲染，并避免被页面浮层遮挡',
            en: 'Fixed boundary misclicks in the compact ChatGPT timeline on Edge. Node navigation now waits for virtualized content to render and stays above page overlays'
        },
        {
            zh: '适配新版 Grok，恢复时间轴和整段对话收藏，修复提示词按钮的定位和配色、宠物动画不动以及点击发送后自动跳底的问题',
            en: 'Restored the timeline and conversation bookmarks on the updated Grok interface and fixed the prompt button styling and position, pet animation during replies, and unwanted jumps when clicking Send'
        },
        {
            zh: '优化对话导出，新增 Claude 支持，可逐条勾选提问和回复，并直接复制支持的格式。改善 PNG 和 PDF 的图片与公式呈现',
            en: 'Conversation export now supports Claude, lets you select individual questions and replies, and can copy supported formats directly. Improved image and formula rendering in PNG and PDF exports'
        },
        {
            zh: '加快截图速度并保留原页面样式，个别图片无法读取时仍可生成截图，并提示缺图数量',
            en: 'Screenshots render faster and retain page styling. When individual images cannot be read, the screenshot can still be generated and reports how many images are missing'
        },
        {
            zh: '修复带语言标签的短 JavaScript 代码块缺少运行按钮，以及运行器切换语言时误用上次设置的问题',
            en: 'Fixed missing Run buttons on short JavaScript blocks with language labels and made the runner use the language of the selected code block'
        }
    ]
};
