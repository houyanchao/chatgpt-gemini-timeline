/**
 * Conversation Export - 常量与共享工具
 *
 * 集中管理对话导出功能的：
 * - 文案（当前仅中文，后续可迁移到 i18n）
 * - 导出格式定义
 * - PNG 图片主题色（canvas 友好的定义）
 * - 通用工具函数（文件名清洗、时间格式化等）
 *
 * 不涉及 DOM 抽取与渲染，保持纯数据/纯函数，便于复用与测试。
 */

/**
 * 文案集中管理。
 * 注意：按产品决策当前仅提供中文，后续接入 i18n 时只需替换此处取值。
 */
const CE_TEXT = {
    buttonTooltip: '导出对话',
    modalTitle: '导出对话',

    sectionRange: '导出范围',
    sectionFormat: '导出格式',
    sectionHeader: '顶部信息',
    sectionTheme: '图片主题色',
    sectionList: '选择对话',

    rangeAll: '整个会话',
    rangeSelect: '选择对话',

    headerShowUrl: '显示 URL',
    headerShowTime: '显示导出时间',

    selectAll: '全选',
    turnPrefix: '对话',
    userLabel: '用户',
    assistantLabel: '助手',
    emptyAssistant: '未找到回复内容',
    emptyUserPreview: '（无文本内容）',

    cancel: '取消',
    confirm: '导出',

    loading: '加载对话中...',
    loadingProgress: '加载对话中...（已加载 {count} 条）',
    cancelLoading: '取消加载',
    exporting: '导出中...',
    done: '对话已导出',
    failed: '导出失败',
    noConversation: '未找到可导出的对话',
    needSelect: '请至少选择 1 条对话',

    sourceLabel: '来源',
    timeLabel: '导出时间',
    titleLabel: '标题',
    imageCannotEmbed: '图片无法内嵌',
    imageNotRendered: '图片未渲染，无法内嵌（可滚动到该轮后重试）',
    truncatedNotice: '内容过长，已截断',
    imageListTitle: '图片',
};

/**
 * 导出格式定义。
 * @typedef {Object} ExportFormat
 * @property {string} id
 * @property {string} label
 * @property {string} ext - 文件扩展名（含点）
 * @property {string} mime
 */
const CE_FORMATS = [
    { id: 'markdown', label: 'Markdown', ext: '.md', mime: 'text/markdown' },
    { id: 'txt', label: 'TXT', ext: '.txt', mime: 'text/plain' },
    { id: 'json', label: 'JSON', ext: '.json', mime: 'application/json' },
    { id: 'png', label: 'PNG', ext: '.png', mime: 'image/png' },
];

const CE_DEFAULT_FORMAT = 'markdown';

/**
 * 采集策略：决定 collectAllTurns 如何把完整对话准备到「可读取」状态。
 * - SCROLL：反复向上滚动懒加载历史（Gemini 等——历史只在顶部按需加载，已加载节点常驻 DOM）
 * - STATIC：完整对话数据已在内存（如 React Fiber），无需滚动，直接读取（ChatGPT 等）
 *
 * 新增平台时按其加载方式选择策略；需要全新加载方式时可在此扩展并在基类 collectAllTurns 分派。
 */
const CE_LOAD_STRATEGY = {
    SCROLL: 'scroll',
    STATIC: 'static',
};

/**
 * PNG 图片主题色（canvas 友好定义）。
 * id 与时间轴激活色（TIMELINE_ACTIVE_COLOR_OPTIONS）保持一致，
 * 以便默认主题色跟随平台激活色设置。
 *
 * @typedef {Object} ExportTheme
 * @property {string} id
 * @property {string} label
 * @property {string} textColor - 头部文字颜色
 * @property {string} [solid] - 纯色填充
 * @property {Array<[number,string]>} [gradient] - 渐变色标 [offset, color]
 */
const CE_THEMES = [
    { id: 'black', label: '黑色', solid: '#0d0d0d', textColor: '#ffffff' },
    { id: 'blue', label: '蓝色', solid: '#3964fe', textColor: '#ffffff' },
    { id: 'purple', label: '紫色', solid: '#6128ff', textColor: '#ffffff' },
    {
        id: 'gemini',
        label: 'Gemini',
        gradient: [[0, '#4285F4'], [0.45, '#8E75FF'], [1, '#A142F4']],
        textColor: '#ffffff',
    },
];

const CE_DEFAULT_THEME = 'purple';

/**
 * 小于该尺寸（任一边）的图片视为装饰图（头像、图标等），不作为对话图片导出。
 */
const CE_MIN_IMAGE_SIZE = 48;

/**
 * 文件名最大长度（不含扩展名），避免过长导致下载失败。
 */
const CE_MAX_FILENAME_LENGTH = 80;

/**
 * 浏览器 canvas 高度的保守上限。
 * 各浏览器实际上限不同（Chrome 约 32767），这里留出余量。
 */
const CE_MAX_CANVAS_HEIGHT = 30000;

/**
 * 按模板插值文案。
 * @param {string} template - 含 {key} 占位符的模板
 * @param {Object} params
 * @returns {string}
 */
function ceFormatText(template, params = {}) {
    return String(template).replace(/\{(\w+)\}/g, (match, key) => (
        Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : match
    ));
}

/**
 * 根据 id 获取主题定义，找不到时回退默认主题。
 * @param {string} themeId
 * @returns {ExportTheme}
 */
function ceGetTheme(themeId) {
    return CE_THEMES.find(t => t.id === themeId) ||
        CE_THEMES.find(t => t.id === CE_DEFAULT_THEME) ||
        CE_THEMES[0];
}

/**
 * 清洗文件名：移除系统不允许的字符并限制长度。
 * @param {string} rawName
 * @returns {string}
 */
function ceSanitizeFilename(rawName) {
    const fallback = '对话导出';
    let name = (rawName || '').toString().trim();

    // 移除控制字符与文件系统保留字符 \ / : * ? " < > |
    name = name
        .replace(/[\x00-\x1f\x80-\x9f]/g, '')
        .replace(/[\\/:*?"<>|]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    // 去除结尾的点（Windows 不允许文件名以点结尾）
    name = name.replace(/\.+$/, '').trim();

    if (!name) name = fallback;

    if (name.length > CE_MAX_FILENAME_LENGTH) {
        name = name.slice(0, CE_MAX_FILENAME_LENGTH).trim();
    }

    return name || fallback;
}

/**
 * 格式化为本地时间字符串。
 * @param {Date} [date]
 * @returns {string}
 */
function ceFormatLocalTime(date = new Date()) {
    try {
        const pad = (n) => String(n).padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
            `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    } catch {
        return '';
    }
}

/**
 * 检测当前是否深色模式（复用全局 detectDarkMode）。
 * @returns {boolean}
 */
function ceIsDarkMode() {
    return typeof detectDarkMode === 'function' ? detectDarkMode() : false;
}
