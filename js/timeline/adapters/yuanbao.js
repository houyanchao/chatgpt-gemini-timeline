/**
 * Yuanbao (元宝) Adapter
 * 
 * Supports: yuanbao.tencent.com
 * Features: 使用 class 后缀匹配，URL 格式特殊
 */

class YuanbaoAdapter extends SiteAdapter {
    constructor() {
        super();
    }

    async matches(url) {
        return matchesPlatform(url, 'yuanbao');
    }

    getUserMessageSelector() {
        // 使用属性选择器匹配 class 以 "-content-text" 结尾的元素
        // 例如：hyc-content-text, abc-content-text 等
        return '[class$="-content-text"]';
    }

    generateTurnId(element, index) {
        return `yuanbao-${index}`;
    }

    extractText(element) {
        // 文本直接在元素中
        const text = (element.textContent || '').trim();
        return text || '[图片或文件]';
    }

    isConversationRoute(pathname) {
        // 元宝对话 URL: /chat/{variable}/{id}
        return pathname.includes('/chat/');
    }

    extractConversationId(pathname) {
        try {
            // 从 /chat/naQivTmsDa/21187e6f-054c-4fee-b92b-c2386be40b65 提取最后一段作为对话 ID
            const segments = pathname.split('/').filter(Boolean);
            // 假设格式为 ['chat', 'variable', 'id']
            if (segments.length >= 3 && segments[0] === 'chat') {
                return segments[segments.length - 1]; // 返回最后一段
            }
            return null;
        } catch {
            return null;
        }
    }

    findConversationContainer(firstMessage) {
        // 查找对话容器 - 使用 LCA（最近共同祖先）算法
        return ContainerFinder.findConversationContainer(firstMessage, {
            messageSelector: this.getUserMessageSelector()
        });
    }

    getTimelinePosition() {
        // 元宝位置配置
        return {
            top: '120px',       // 避开顶部导航栏
            right: '22px',     // 右侧边距
            bottom: '120px',    // 避开底部输入框
        };
    }
    
    getStarChatButtonTarget() {
        // 返回 header__name 元素，收藏按钮将插入到它前面（左边）
        return document.querySelector('[class*="agent-dialogue__content--common__header__name"]');
    }
    
    getDefaultChatTheme() {
        // 元宝使用页面标题作为默认主题
        return document.title || '';
    }
    
    /**
     * 检测 AI 是否正在生成回答
     * 元宝: 当 #yuanbao-send-btn 元素不存在时，表示正在生成
     * @returns {boolean}
     */
    isAIGenerating() {
        const sendBtn = document.getElementById('yuanbao-send-btn');
        return !sendBtn;
    }
    
}
