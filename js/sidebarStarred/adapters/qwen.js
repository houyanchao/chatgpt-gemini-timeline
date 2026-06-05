/**
 * Qwen International Sidebar Starred Adapter
 *
 * 千问国际版侧边栏 DOM 结构：
 *   .session-list-wrapper = 聊天历史列表容器
 *   收藏区域插在其上方
 */

class QwenSidebarStarredAdapter extends BaseSidebarStarredAdapter {
    async matches() {
        return matchesPlatform(location.href, 'qwen');
    }

    findSidebarContainer() {
        const history = document.querySelector('.session-list-wrapper');
        if (history?.parentElement) return history.parentElement;
        return null;
    }

    findInsertionPoint() {
        const history = document.querySelector('.session-list-wrapper');
        if (history?.parentElement) {
            return { parent: history.parentElement, reference: history, position: 'before' };
        }
        return null;
    }

    getPlatformClass() {
        return 'qwen';
    }

    navigateToConversation(url) {
        try {
            const convId = new URL(url).pathname.split('/').filter(Boolean).pop();
            if (!convId) return false;
            const link = document.querySelector(`.session-list-wrapper a[href*="${convId}"]`);
            if (link) { link.click(); return true; }
        } catch { /* ignore */ }
        return false;
    }
}
