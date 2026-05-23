/**
 * Custom Site Adapter - 用户自定义平台适配器
 * 
 * 允许用户通过设置面板自定义配置，支持任意 AI 聊天网站的时间轴功能。
 * 所有配置参数来自用户在设置面板中的输入，持久化存储在 chrome.storage.local。
 * 
 * 配置结构 (CustomPlatformConfig):
 * {
 *   id: string,              // 唯一标识（自动生成）
 *   name: string,            // 平台显示名称
 *   hostname: string,        // 域名匹配关键字（include 匹配）
 *   turnIdPrefix: string,    // turnId 前缀，默认用 id
 *   userMessageSelector: string,     // 用户消息 CSS 选择器（必填）
 *   textSelector: string,            // 文本提取子选择器（可选）
 *   conversationRoute: string,       // 对话页面路由匹配（include 匹配，必填）
 *   conversationIdRegex: string,     // 会话 ID 提取正则（必填）
 *   timeLabelTargetSelector: string, // 时间标签渲染目标子选择器（可选）
 *   timeLabelPosition: Object,       // 时间标签 CSS 位置（可选）
 *   timelinePosition: Object,        // 时间轴浮窗位置（可选）
 *   scrollOffset: number,            // 滚动偏移量（可选）
 *   aiGeneratingSelector: string,    // AI 生成中检测选择器（可选）
 *   aiGeneratingCheck: string,       // AI 检测方式: 'exists' | 'class' | 'attr', 默认 'exists'（可选）
 *   starChatButtonSelector: string,  // 收藏按钮目标选择器（可选）
 *   defaultChatThemeSelector: string,// 默认标题提取选择器（可选）
 * }
 */

class CustomSiteAdapter extends SiteAdapter {
    /**
     * @param {Object} config - 用户自定义的平台配置
     */
    constructor(config) {
        super();
        this.config = config;
        this.id = config.id;
        this.name = config.name;
    }

    // ==================== 核心方法（必须实现） ====================

    /**
     * 检查当前 URL 是否匹配此平台
     * 使用 config.hostname 进行 include 匹配
     * @param {string} url - 当前页面 URL
     * @returns {boolean}
     */
    matches(url) {
        return url.includes(this.config.hostname);
    }

    /**
     * 获取用户消息元素的 CSS 选择器
     * @returns {string}
     */
    getUserMessageSelector() {
        return this.config.userMessageSelector;
    }

    /**
     * 生成节点的唯一标识 turnId
     * 使用 config.turnIdPrefix 作为前缀，加上数组索引
     * @param {Element} element - 消息 DOM 元素
     * @param {number} index - 消息索引
     * @returns {string}
     */
    generateTurnId(element, index) {
        const prefix = this.config.turnIdPrefix || this.config.id || 'custom';
        return `${prefix}-${index}`;
    }

    /**
     * 提取消息元素的文本内容
     * 如果配置了 textSelector，则优先查找子元素提取文本
     * @param {Element} element - 消息 DOM 元素
     * @returns {string}
     */
    extractText(element) {
        if (this.config.textSelector) {
            const target = element.querySelector(this.config.textSelector);
            if (target) {
                const text = target.textContent.replace(/\s+/g, ' ').trim();
                return text || '[图片或文件]';
            }
        }
        // 回退：直接提取整个元素的文本
        const text = (element.textContent || '').replace(/\s+/g, ' ').trim();
        return text || '[图片或文件]';
    }

    /**
     * 检查当前路径是否为对话页面
     * @param {string} pathname - URL pathname
     * @returns {boolean}
     */
    isConversationRoute(pathname) {
        if (!this.config.conversationRoute) return false;
        return pathname.includes(this.config.conversationRoute);
    }

    /**
     * 从 pathname 中提取会话 ID
     * 使用 config.conversationIdRegex 正则提取
     * @param {string} pathname - URL pathname
     * @returns {string|null}
     */
    extractConversationId(pathname) {
        if (!this.config.conversationIdRegex) return null;
        try {
            const regex = new RegExp(this.config.conversationIdRegex);
            const match = pathname.match(regex);
            return match ? (match[1] || match[0]) : null;
        } catch (e) {
            console.error('[CustomSiteAdapter] Invalid regex:', this.config.conversationIdRegex, e);
            return null;
        }
    }

    // ==================== 可选方法 ====================

    /**
     * 获取时间标签的渲染目标元素
     * @param {Element} element - 用户消息元素
     * @returns {Element}
     */
    getTimeLabelTarget(element) {
        if (this.config.timeLabelTargetSelector) {
            const target = element.querySelector(this.config.timeLabelTargetSelector);
            if (target) return target;
        }
        return super.getTimeLabelTarget(element);
    }

    /**
     * 获取时间标签位置配置
     * @returns {Object} - { top, right, left, bottom }
     */
    getTimeLabelPosition() {
        if (this.config.timeLabelPosition) {
            return this.config.timeLabelPosition;
        }
        return super.getTimeLabelPosition();
    }

    /**
     * 获取时间轴浮窗位置配置
     * @returns {Object}
     */
    getTimelinePosition() {
        if (this.config.timelinePosition) {
            return this.config.timelinePosition;
        }
        return super.getTimelinePosition();
    }

    /**
     * 查找对话容器元素
     * 使用 LCA（最近共同祖先）算法
     * @param {Element} firstMessage - 第一条消息元素
     * @returns {Element|null}
     */
    findConversationContainer(firstMessage) {
        return ContainerFinder.findConversationContainer(firstMessage, {
            messageSelector: this.getUserMessageSelector()
        });
    }

    /**
     * 获取收藏按钮的插入目标元素
     * @returns {Element|null}
     */
    getStarChatButtonTarget() {
        if (this.config.starChatButtonSelector) {
            return document.querySelector(this.config.starChatButtonSelector);
        }
        return super.getStarChatButtonTarget();
    }

    /**
     * 获取默认对话主题（标题）
     * @returns {string}
     */
    getDefaultChatTheme() {
        if (this.config.defaultChatThemeSelector === 'title') {
            return document.title || '';
        }
        if (this.config.defaultChatThemeSelector) {
            const el = document.querySelector(this.config.defaultChatThemeSelector);
            return (el?.textContent || '').trim();
        }
        return super.getDefaultChatTheme();
    }

    /**
     * 获取滚动偏移量
     * @returns {number}
     */
    getScrollOffset() {
        if (this.config.scrollOffset !== undefined) {
            return this.config.scrollOffset;
        }
        return super.getScrollOffset();
    }

    /**
     * 检测 AI 是否正在生成回答
     * 支持三种检测方式：
     * - 'exists': 检查选择器元素是否存在
     * - 'class': 检查选择器元素是否包含 'stop' class
     * - 'attr': 检查选择器元素是否有特定属性
     * @returns {boolean|null} - true: 正在生成, false: 未生成, null: 未配置
     */
    isAIGenerating() {
        if (!this.config.aiGeneratingSelector) return null;

        const element = document.querySelector(this.config.aiGeneratingSelector);
        if (!element) return false;

        const checkType = this.config.aiGeneratingCheck || 'exists';

        switch (checkType) {
            case 'exists':
                return true;
            case 'class':
                return element.classList.contains('stop');
            case 'attr': {
                // 检查 data-testid="stop-button" 这种
                const attrName = this.config.aiGeneratingAttrName || 'data-testid';
                const attrValue = this.config.aiGeneratingAttrValue || 'stop-button';
                return element.getAttribute(attrName) === attrValue;
            }
            default:
                return true;
        }
    }

    /**
     * 检测是否应该隐藏时间轴
     * @returns {boolean}
     */
    shouldHideTimeline() {
        return false; // 自定义平台默认不隐藏
    }
}