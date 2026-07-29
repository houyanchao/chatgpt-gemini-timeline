/**
 * Container Finder - 容器查找策略
 * 
 * 提供统一的对话容器查找逻辑，用于所有 AI 平台适配器
 * 
 * 核心策略：
 * 1. 使用 LCA（最近共同祖先）算法查找所有对话记录的最近父容器
 * 2. 确保找到的容器是直接包裹所有对话的最小容器
 * 3. 兜底机制：如果只有一个消息或查找失败，向上查找固定深度
 * 
 * 优势：
 * - 精确定位：避免找到过于外层的容器
 * - 稳定计算：基于此容器的 offsetTop 计算节点位置更稳定
 * - 通用性强：适用于各种 DOM 结构的 AI 平台
 */

const ContainerFinder = {
    /**
     * 智能查找对话容器
     * 
     * @param {HTMLElement} firstMessage - 第一个用户消息元素
     * @param {Object} options - 配置选项
     * @param {string} options.messageSelector - 用户消息选择器，用于查找所有消息
     * @param {Element[]} options.messages - 已查询的消息元素，避免重复全量查询
     * @returns {HTMLElement|null} 找到的容器元素
     */
    findConversationContainer(firstMessage, options = {}) {
        if (!firstMessage) return null;
        
        const { messageSelector, messages } = options;
        
        // ✅ 核心改进：找到所有对话记录的最近共同祖先
        // 这样可以确保找到的是直接包裹所有对话的容器
        if (messageSelector) {
            try {
                // 查询所有用户消息元素
                const allMessages = messages || document.querySelectorAll(messageSelector);
                if (allMessages.length > 1) {
                    // 找到所有消息的最近共同祖先 (LCA)
                    const lca = this.findLowestCommonAncestor(Array.from(allMessages));
                    if (lca && lca !== document.body && lca !== document.documentElement) {
                        return lca;
                    }
                }
            } catch (e) {
            }
        }
        
        // 兜底：如果只有一个消息或查找失败，向上查找几层
        let container = firstMessage;
        for (let i = 0; i < 5 && container && container.parentElement; i++) {
            container = container.parentElement;
            if (container === document.body) break;
        }
        
        return container || firstMessage.parentElement;
    },
    
    /**
     * 查找多个元素的最近共同祖先 (Lowest Common Ancestor)
     * 
     * 算法说明：
     * 从第一个元素的父元素开始，逐层向上遍历，
     * 找到第一个包含所有元素的祖先，即为最近共同祖先。
     * 
     * 时间复杂度：O(d * n)，其中 d 是 DOM 树深度，n 是元素数量
     * 空间复杂度：O(1)
     * 
     * @param {HTMLElement[]} elements - 元素数组
     * @returns {HTMLElement|null} 最近共同祖先
     * 
     * @example
     * // 假设有3个兄弟节点 div1, div2, div3，它们的父元素是 container
     * findLowestCommonAncestor([div1, div2, div3]) // 返回 container
     */
    findLowestCommonAncestor(elements) {
        if (!elements || elements.length === 0) return null;
        if (elements.length === 1) return elements[0].parentElement;
        
        // 从第一个元素的父元素开始向上遍历
        let ancestor = elements[0].parentElement;
        
        // 向上查找，直到找到包含所有元素的祖先
        while (ancestor && ancestor !== document.documentElement) {
            // 检查当前祖先是否包含所有元素
            const containsAll = elements.every(el => ancestor.contains(el));
            
            if (containsAll) {
                // 找到第一个包含所有元素的祖先，即为最近共同祖先
                return ancestor;
            }
            
            // 继续向上查找父元素
            ancestor = ancestor.parentElement;
        }
        
        // 如果找不到（理论上不应该发生），返回 document.body 作为兜底
        return document.body;
    },
    
    /**
     * 验证容器是否有效（可选的验证方法）
     * 
     * @param {HTMLElement} container - 待验证的容器
     * @param {string} messageSelector - 消息元素的选择器
     * @param {number} minMessages - 容器中应该至少包含的消息数量，默认 1
     * @returns {boolean} 容器是否有效
     */
    validateContainer(container, messageSelector, minMessages = 1) {
        if (!container || !messageSelector) return false;
        
        try {
            const messages = container.querySelectorAll(messageSelector);
            return messages.length >= minMessages;
        } catch {
            return false;
        }
    }
};
