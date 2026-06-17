/**
 * Base Adapter for AI Chat Sites
 * 
 * All site-specific adapters should extend this class
 */

/**
 * Base class for site adapters
 * Each AI chat site needs to implement this interface
 */
class SiteAdapter {
    constructor() {
    }

    /**
     * Check if current URL matches this site
     * @param {string} url - Current page URL
     * @returns {boolean}
     */
    matches(url) {
        return false;
    }

    /**
     * Get CSS selector for user message elements
     * @returns {string}
     */
    getUserMessageSelector() {
        return '';
    }

    /**
     * Generate unique ID for a message (using index)
     * @param {Element} element - Message DOM element
     * @param {number} index - Message index in the list
     * @returns {string}
     */
    generateTurnId(element, index) {
        return `msg-${index}`;
    }

    /**
     * Extract text content from message element
     * @param {Element} element - Message DOM element
     * @returns {string}
     */
    extractText(element) {
        const text = (element.textContent || '').trim();
        return text || '[图片或文件]';
    }
    
    /**
     * 获取时间标签的渲染目标元素
     * @param {Element} element - 消息体元素（getUserMessageSelector 匹配到的）
     * @returns {Element} - 时间标签实际渲染到的元素
     */
    getTimeLabelTarget(element) {
        return element; // 默认返回消息元素本身
    }
    
    /**
     * Get time label position configuration
     * @returns {Object} - { top, right, left, bottom } CSS values
     */
    getTimeLabelPosition() {
        return {
            top: '-18px',
            right: '0'
        };
    }

    /**
     * Check if current path is a conversation page
     * @param {string} pathname - URL pathname
     * @returns {boolean}
     */
    isConversationRoute(pathname) {
        return false;
    }

    /**
     * Extract conversation ID from pathname (for storage key)
     * @param {string} pathname - URL pathname
     * @returns {string|null}
     */
    extractConversationId(pathname) {
        return null;
    }

    /**
     * Find conversation container element
     * @param {Element} firstMessage - First message element
     * @returns {Element|null}
     */
    findConversationContainer(firstMessage) {
        return firstMessage?.parentElement;
    }

    /**
     * Get timeline position configuration for this site
     * @returns {Object} - {top, right, bottom} in pixels or CSS values
     */
    getTimelinePosition() {
        return {
            top: '120px',      // 避开顶部导航栏
            right: '22px',    // 右侧边距
            bottom: '120px',   // 避开底部输入框
        };
    }
    
    /**
     * Get target element for inserting star chat button
     * @returns {Element|null} - Target element to insert before, or null if not supported
     */
    getStarChatButtonTarget() {
        return null; // 默认不支持，返回 null
    }
    
    /**
     * Get default chat theme for star chat feature
     * @returns {string} - Default theme name, empty string means no default
     */
    getDefaultChatTheme() {
        return ''; // 默认返回空字符串
    }
    
    /**
     * Detect if the site is in dark mode
     * 使用全局 detectDarkMode 函数（定义在 constants.js）
     * @returns {boolean} - true if dark mode is detected
     */
    detectDarkMode() {
        return typeof detectDarkMode === 'function' ? detectDarkMode() : false;
    }
    
    /**
     * Check if timeline should be hidden in current state
     * @returns {boolean} - true if timeline should be hidden
     */
    shouldHideTimeline() {
        return false; // 默认不隐藏
    }

    /**
     * Selectors that can affect timeline visibility.
     * TimelineManager uses these for fast, scoped DOM checks.
     * @returns {string[]}
     */
    getTimelineVisibilitySelectors() {
        return [];
    }

    /**
     * Selectors whose own attributes can affect timeline visibility.
     * These are observed directly after matching nodes appear.
     * @returns {string[]}
     */
    getTimelineVisibilityAttributeSelectors() {
        return [];
    }
    
    /**
     * Get scroll offset for this site when clicking timeline nodes
     * Different sites may need different offsets due to fixed headers etc.
     * @returns {number} - Scroll offset in pixels
     */
    getScrollOffset() {
        return 30; // 默认偏移量
    }

    /**
     * Whether TimelineManager should hide the host page's native chat scrollbar.
     * By default, only hide real internal scroll containers, not html/body fallback.
     * @param {Element} scrollContainer - Resolved scroll container
     * @param {Object} context - { isFallback, conversationContainer }
     * @returns {boolean}
     */
    shouldHideHostScrollbar(scrollContainer, context = {}) {
        return context.isFallback !== true;
    }
    
    /**
     * Check if AI is currently generating a response
     * Used to control padding visibility during AI response
     * @returns {boolean|null} - true: AI generating, false: AI stopped, null: not implemented
     */
    isAIGenerating() {
        return null; // 默认返回 null 表示未实现，子类需覆盖才能启用 padding 功能
    }
    
}
