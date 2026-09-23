// 2026-09 灰度 DOM 兼容层。移除此文件及 manifest 引用即可关闭新版 DOM 支持。
// 旧版 adapter 不依赖本模块存在。仅本地处理消息正文，不写入诊断日志。
window.AITChatGPTRolloutDOM = {
    // 灰度页面以无障碍角色标题分隔消息，不依赖会变化的哈希 class。
    markTurns() {
        const main = document.querySelector('main');
        if (!main) return false;
        const candidates = new Map();
        for (const heading of main.querySelectorAll('h4.sr-only')) {
            const label = (heading.textContent || '').replace(/\s+/g, ' ').trim().replace(/[:：]$/, '').trim().toLowerCase();
            const role = ['你说', '你說', 'you said', 'you'].includes(label) ? 'user'
                : ['chatgpt 说', 'chatgpt 說', 'chatgpt said', 'chatgpt', 'assistant'].includes(label) ? 'assistant' : null;
            if (!role || heading.closest('form, nav, aside, pre, code, .markdown')) continue;
            // 标题可能在单独 wrapper 内；只接纳包含一个角色标题且有正文的最近父层。
            let container = heading.parentElement;
            while (container && container !== main && !container.matches('form, nav, aside')) {
                if (container.querySelectorAll('h4.sr-only').length !== 1) break;
                if (Array.from(container.children).some(child => child !== heading && !child.contains(heading))) {
                    candidates.set(container, role);
                    break;
                }
                container = container.parentElement;
            }
        }
        for (const old of document.querySelectorAll('[data-ait-heading-turn]')) {
            if (!candidates.has(old)) old.removeAttribute('data-ait-heading-turn');
        }
        for (const [element, role] of candidates) {
            if (element.getAttribute('data-ait-heading-turn') !== role) element.setAttribute('data-ait-heading-turn', role);
        }
        return Array.from(candidates.values()).includes('user');
    },

    text(element) {
        const content = element.querySelector('.whitespace-pre-wrap');
        if (content) return (content.textContent || '').replace(/\s+/g, ' ').trim();
        const copy = element.cloneNode(true);
        copy.querySelectorAll('h4.sr-only, button, nav, [data-ait-time], .ait-time-label').forEach(node => node.remove());
        return (copy.textContent || '').replace(/\s+/g, ' ').trim();
    },

    matchId(element, texts) {
        const text = this.text(element);
        if (!text) return null;
        // 全文且唯一匹配才关联 ID；重复提问或未匹配时沿用现有索引降级，绝不按 API 数组顺序猜。
        const matches = Array.from(texts).filter(([, value]) => value.replace(/\s+/g, ' ').trim() === text);
        const peers = Array.from(document.querySelectorAll('[data-ait-heading-turn="user"]'));
        if (matches.length !== 1 || peers.filter(peer => this.text(peer) === text).length !== 1) return null;
        return matches[0][0];
    },

};
