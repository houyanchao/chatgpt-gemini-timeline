/**
 * Conversation Export - 常量与共享工具
 *
 * 集中管理对话导出功能的：
 * - 文案（已接入 i18n：TimelineI18n 取值 + 中文兜底，见 CE_TEXT）
 * - 导出格式定义
 * - PNG 图片主题色（canvas 友好的定义）
 * - 通用工具函数（文件名清洗、时间格式化等）
 *
 * 不涉及 DOM 抽取与渲染，保持纯数据/纯函数，便于复用与测试。
 */

/**
 * 文案集中管理（已接入 i18n）。
 *
 * 通过 TimelineI18n.getMessage 惰性取值：
 * - 每次访问 CE_TEXT.xxx 时实时解析，随语言切换即时生效；
 * - i18n key 缺失或 TimelineI18n 尚未就绪时，回退到 CE_TEXT_FALLBACK 的中文兜底；
 * - 角色标签 Q / A 为固定符号，不接入 i18n，仅保留在兜底表中。
 * 各文案的 i18n key 见 CE_TEXT_I18N_KEYS，中文/英文分别维护在 _locales/{zh_CN,en}/messages.json。
 */
const CE_TEXT_FALLBACK = {
    buttonTooltip: '导出对话',
    modalTitle: '导出对话',

    sectionRange: '导出范围',
    sectionFormat: '导出格式',
    sectionHeader: '更多配置',
    sectionTheme: '主题色',
    sectionList: '选择对话',

    rangeAll: '整个会话',
    rangeSelect: '选择对话',

    headerShowUrl: '对话 URL',
    headerShowTime: '导出时间',
    headerShowConversationTime: '对话时间',
    askTimeLabel: '提问时间',

    selectAll: '全选',
    turnPrefix: '对话',
    // 角色标签：PNG / Markdown / TXT / 选择列表统一使用 Q / A
    exportRoleUser: 'Q',
    exportRoleAssistant: 'A',
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

    sourceLabel: '对话 URL',
    timeLabel: '导出时间',
    titleLabel: '标题',
    imageCannotEmbed: '图片无法内嵌',
    imageNotRendered: '图片未渲染，无法内嵌（可滚动到该轮后重试）',
    truncatedNotice: '内容过长，已截断',
    imageListTitle: '图片',

    // 兜底文案：会话标题 / 文件名缺省值
    defaultTitle: '对话导出',
};

/**
 * 文案 key → i18n message key 映射。
 * 未列入者（如 exportRoleUser / exportRoleAssistant）不走 i18n，直接使用中文兜底。
 */
const CE_TEXT_I18N_KEYS = {
    buttonTooltip: 'conversationExportButtonTooltip',
    modalTitle: 'conversationExportModalTitle',

    sectionRange: 'conversationExportSectionRange',
    sectionFormat: 'conversationExportSectionFormat',
    sectionHeader: 'conversationExportSectionHeader',
    sectionTheme: 'conversationExportSectionTheme',
    sectionList: 'conversationExportSectionList',

    rangeAll: 'conversationExportRangeAll',
    rangeSelect: 'conversationExportRangeSelect',

    headerShowUrl: 'conversationExportHeaderShowUrl',
    headerShowTime: 'conversationExportHeaderShowTime',
    headerShowConversationTime: 'conversationExportHeaderShowConversationTime',
    askTimeLabel: 'conversationExportAskTimeLabel',

    selectAll: 'conversationExportSelectAll',
    turnPrefix: 'conversationExportTurnPrefix',
    emptyAssistant: 'conversationExportEmptyAssistant',
    emptyUserPreview: 'conversationExportEmptyUserPreview',

    cancel: 'conversationExportCancel',
    confirm: 'conversationExportConfirm',

    loading: 'conversationExportLoading',
    loadingProgress: 'conversationExportLoadingProgress',
    cancelLoading: 'conversationExportCancelLoading',
    exporting: 'conversationExportExporting',
    done: 'conversationExportDone',
    failed: 'conversationExportFailed',
    noConversation: 'conversationExportNoConversation',
    needSelect: 'conversationExportNeedSelect',

    sourceLabel: 'conversationExportSourceLabel',
    timeLabel: 'conversationExportTimeLabel',
    titleLabel: 'conversationExportTitleLabel',
    imageCannotEmbed: 'conversationExportImageCannotEmbed',
    imageNotRendered: 'conversationExportImageNotRendered',
    truncatedNotice: 'conversationExportTruncatedNotice',
    imageListTitle: 'conversationExportImageListTitle',

    defaultTitle: 'conversationExportDefaultTitle',
};

/**
 * 取指定文案：优先 i18n，回退中文兜底。
 * @param {string} key - CE_TEXT_FALLBACK 中的键
 * @returns {string}
 */
function ceGetText(key) {
    const i18nKey = CE_TEXT_I18N_KEYS[key];
    if (i18nKey && typeof TimelineI18n !== 'undefined') {
        const message = TimelineI18n.getMessage(i18nKey);
        if (message) return message;
    }
    return CE_TEXT_FALLBACK[key];
}

/**
 * 文案访问对象：保持 CE_TEXT.xxx 的调用方式不变，读取时惰性解析 i18n。
 */
const CE_TEXT = Object.keys(CE_TEXT_FALLBACK).reduce((acc, key) => {
    Object.defineProperty(acc, key, {
        get() { return ceGetText(key); },
        enumerable: true,
    });
    return acc;
}, {});

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
    { id: 'csv', label: 'CSV', ext: '.csv', mime: 'text/csv' },
    { id: 'png', label: 'PNG', ext: '.png', mime: 'image/png' },
    { id: 'pdf', label: 'PDF', ext: '.pdf', mime: 'application/pdf' },
];

const CE_DEFAULT_FORMAT = 'markdown';

/**
 * 采集策略：决定 collectAllTurns 如何把完整对话准备到「可读取」状态。
 * - SCROLL：滚动把未渲染内容加载/渲染出来（Gemini 顶部懒加载、ChatGPT 虚拟化空壳等）
 * - STATIC：完整对话数据已在 DOM/内存，无需滚动，直接读取
 *
 * 新增平台时按其加载方式选择策略；需要全新加载方式时可在此扩展并在基类 collectAllTurns 分派。
 */
const CE_LOAD_STRATEGY = {
    SCROLL: 'scroll',
    STATIC: 'static',
};

/**
 * PNG 图片主题色（canvas 友好定义）。
 * 由全局 ACTIVE_COLOR_PALETTE 派生，色值与时间轴激活色共享同一来源，避免重复维护；
 * id 天然与时间轴激活色保持一致，默认主题色可跟随平台激活色设置。
 * - solid 主题保留纯色填充；gradient 主题转成 canvas 色标数组 [[offset, color], ...]
 * - 头部文字统一使用白色
 *
 * @typedef {Object} ExportTheme
 * @property {string} id
 * @property {string} label
 * @property {string} textColor - 头部文字颜色
 * @property {string} [solid] - 纯色填充
 * @property {Array<[number,string]>} [gradient] - 渐变色标 [offset, color]
 */
const CE_THEMES = ACTIVE_COLOR_PALETTE.map(entry => ({
    id: entry.id,
    label: entry.label,
    textColor: '#ffffff',
    ...(entry.gradient
        ? { gradient: entry.gradient.stops.map(stop => [...stop]) }
        : { solid: entry.solid }),
}));

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
    const fallback = CE_TEXT.defaultTitle;
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
 * 格式化提问时间（时间戳，毫秒）为简洁的本地时间字符串。
 * 与导出时间一致采用 YYYY-MM-DD HH:mm 形式（不含秒）。
 * @param {number} timestamp - 毫秒时间戳
 * @returns {string}
 */
function ceFormatChatTime(timestamp) {
    if (!timestamp) return '';
    try {
        const date = new Date(timestamp);
        if (Number.isNaN(date.getTime())) return '';
        const pad = (n) => String(n).padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
            `${pad(date.getHours())}:${pad(date.getMinutes())}`;
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
