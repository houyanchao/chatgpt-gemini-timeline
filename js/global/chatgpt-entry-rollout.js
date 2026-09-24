// ChatGPT 灰度页面入口锚点。旧版选择器由各适配器优先处理；删除本文件及
// manifest 引用即可关闭新版入口定位。这里只读取布局，不读取页面文字或账号。
(() => {
    if (!['chatgpt.com', 'chat.openai.com'].includes(location.hostname)) return;

    const visible = element => {
        if (!element?.isConnected) return false;
        const rect = element.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return false;
        for (let node = element; node; node = node.parentElement) {
            const css = getComputedStyle(node);
            if (css.display === 'none' || css.visibility === 'hidden') return false;
        }
        return true;
    };
    const log = (event, data) => window.AITGPTDiagnostics?.log(event, data);
    const api = {
        input() {
            const candidates = Array.from(document.querySelectorAll('main form [role="textbox"][contenteditable="true"]'));
            const element = candidates.find(visible) || null;
            log('entry.rollout-input', { candidates: candidates.length, found: !!element });
            return element;
        },
        sidebar() {
            // 旧版分组和 #history 由 adapter 先处理。灰度版保留可见左侧导航。
            const candidates = Array.from(document.querySelectorAll('nav')).filter(nav => {
                if (!visible(nav) || nav.closest('.ait-sidebar-starred')) return false;
                const rect = nav.getBoundingClientRect();
                return rect.width >= 150 && rect.width <= 500 && rect.height >= 200 && rect.left < 400;
            });
            const nav = candidates.sort((a, b) => b.getBoundingClientRect().height - a.getBoundingClientRect().height)[0] || null;
            const inner = nav?.querySelector('.group\\/scrollport');
            const parent = inner && visible(inner) ? inner : nav;
            log('entry.rollout-sidebar', { candidates: candidates.length, found: !!parent,
                usedScrollport: parent !== nav, width: Math.round(parent?.getBoundingClientRect().width || 0),
                height: Math.round(parent?.getBoundingClientRect().height || 0) });
            return parent ? { parent, reference: null, position: 'prepend' } : null;
        },
        header() {
            // 优先对话 main 内的顶部 header；再找非侧栏、非编辑区且可见的顶栏。
            const candidates = Array.from(document.querySelectorAll('main header, header, [role="banner"]'));
            const qualified = candidates.filter(element => {
                if (!visible(element) || element.closest('nav, aside, form, .ait-sidebar-starred')) return false;
                const rect = element.getBoundingClientRect();
                return rect.top >= -20 && rect.top < 180 && rect.width >= 250 && rect.height >= 24 && rect.height <= 120;
            });
            const main = qualified.find(el => el.closest('main'));
            const element = main || qualified.at(-1) || null;
            log('entry.rollout-header', { candidates: candidates.length, qualified: qualified.length,
                found: !!element, withinMain: !!element?.closest('main'),
                width: Math.round(element?.getBoundingClientRect().width || 0),
                height: Math.round(element?.getBoundingClientRect().height || 0) });
            return element;
        }
    };
    window.AITChatGPTEntryRollout = api;
})();
