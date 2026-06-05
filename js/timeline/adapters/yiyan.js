/**
 * Yiyan (文心一言) Adapter
 * 
 * Supports: yiyan.baidu.com
 * Features: 使用 class 前缀识别用户消息
 */

class YiyanAdapter extends SiteAdapter {
    constructor() {
        super();
    }

    async matches(url) {
        return matchesPlatform(url, 'yiyan');
    }

    getUserMessageSelector() {
        // 基于 class 前缀 "questionText" 识别用户消息
        return '[class*="questionText"]';
    }

    generateTurnId(element, index) {
        return `yiyan-${index}`;
    }

    extractText(element) {
        // 文本在 span 子元素中
        const span = element.querySelector('span');
        const text = (span?.textContent || element.textContent || '').trim();
        return text || '[图片或文件]';
    }
    
    getTimeLabelTarget(element) {
        return element.querySelector('span') || element;
    }

    isConversationRoute(pathname) {
        // 文心一言对话 URL: /chat/{id}
        return pathname.includes('/chat/');
    }

    extractConversationId(pathname) {
        try {
            // 从 /chat/MjM2MDc0MjI2Mjo1MDU4NDg3MjI 提取对话 ID
            const match = pathname.match(/\/chat\/([^\/]+)/);
            return match ? match[1] : null;
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
        // 文心一言位置配置
        return {
            top: '120px',       // 避开顶部导航栏
            right: '22px',     // 右侧边距
            bottom: '120px',    // 避开底部输入框
        };
    }
    
    // getStarChatButtonTarget() {
    //     // 返回 TopRightTools 元素，收藏按钮将插入到它前面
    //     return document.querySelector('[class*="TopRightTools"]');
    // }
    
    // getDefaultChatTheme() {
    //     // 文心一言使用特定元素中的文本作为默认主题
    //     try {
    //         const topFixedArea = document.querySelector('[class*="topFixedArea"]');
    //         if (!topFixedArea) return '';
    //         
    //         const container = topFixedArea.querySelector('[class*="container"]');
    //         if (!container) return '';
    //         
    //         const span = container.querySelector('span');
    //         const title = span?.textContent?.trim() || '';
    //         
    //         // 返回原始文本，不需要过滤
    //         return title;
    //     } catch {
    //         return '';
    //     }
    // }
    
    /**
     * 检测 AI 是否正在生成回答
     * 文心一言: 当存在 class 包含 "stopDealBtn" 的元素时，表示正在生成
     * @returns {boolean}
     */
    isAIGenerating() {
        const stopBtn = document.querySelector('[class*="stopDealBtn"]');
        return !!stopBtn;
    }
}
