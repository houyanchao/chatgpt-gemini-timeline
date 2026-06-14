/**
 * Tongyi (千问 Qwen) Sidebar Starred Adapter
 *
 * 千问侧边栏 DOM 结构：
 *   aside.bg-pc-sidebar
 *     └── ...
 *         ├── .ait-sidebar-starred            ← 收藏区域（插入位置）
 *         ├── .desktop-no-drag               ← 聊天历史列表
 *         ├── div.tongyiDI-view-container
 *               └── div[data-react-window-index]
 *                     └── div.group
 *                           ├── div (flex-1)
 *                           │     └── div (title text)
 *                           └── button[aria-haspopup="menu"]  ← 三个点
 *
 * 菜单：Radix UI dropdown（[data-radix-popper-content-wrapper]）
 * 注意：聊天列表无 <a> 标签，URL 通过 window.location 获取当前会话
 */

class TongyiSidebarStarredAdapter extends BaseSidebarStarredAdapter {
    async matches() {
        return matchesPlatform(location.href, 'tongyi');
    }

    _findSidebar() {
        return document.querySelector('aside.bg-pc-sidebar');
    }

    _findInsertAnchor() {
        const sidebar = this._findSidebar();
        if (!sidebar) return null;
        const viewContainer = sidebar.querySelector('.tongyiDI-view-container');
        if (!viewContainer?.parentElement) return null;
        return viewContainer.parentElement.querySelector(':scope > .desktop-no-drag');
    }

    findSidebarContainer() {
        const anchor = this._findInsertAnchor();
        if (anchor?.parentElement) return anchor.parentElement;
        return null;
    }

    findInsertionPoint() {
        const anchor = this._findInsertAnchor();
        if (anchor?.parentElement) {
            return { parent: anchor.parentElement, reference: anchor, position: 'before' };
        }
        return null;
    }

    getPlatformClass() {
        return 'tongyi';
    }

    navigateToConversation(url) {
        try {
            const convId = new URL(url).pathname.split('/').filter(Boolean).pop();
            if (!convId) return false;
            window.location.href = url;
            return true;
        } catch { /* ignore */ }
        return false;
    }

    // ==================== 侧边栏收藏标记 ====================

    getConversationElements() {
        const sidebar = this._findSidebar();
        if (!sidebar) return [];
        return sidebar.querySelectorAll('[data-react-window-index]');
    }

    getConversationUrlPath(convEl) {
        return '';
    }

    injectStarIcon(convEl) {
        const titleDiv = convEl.querySelector('.text-ellipsis');
        if (!titleDiv || titleDiv.querySelector(`[${BaseSidebarStarredAdapter.STAR_ICON_ATTR}]`)) return;

        const icon = document.createElement('span');
        icon.setAttribute(BaseSidebarStarredAdapter.STAR_ICON_ATTR, 'true');
        icon.className = 'ait-conv-starred-icon';
        icon.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="rgb(255, 125, 3)" stroke="rgb(255, 125, 3)" stroke-width="1"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';
        titleDiv.parentElement.insertBefore(icon, titleDiv);
    }

    removeStarIcon(convEl) {
        const icon = convEl.querySelector(`[${BaseSidebarStarredAdapter.STAR_ICON_ATTR}]`);
        if (icon) icon.remove();
    }

    // ==================== 原生菜单注入 ====================

    getClickDelegateSelector() {
        return 'aside.bg-pc-sidebar [data-icon-type="qwpcicon-more"]';
    }

    getConversationFromClickTarget(el) {
        const group = el.closest('.group');
        if (!group) return null;
        const titleDiv = group.querySelector('.text-ellipsis');
        const title = titleDiv?.textContent?.trim() || '';
        return {
            url: window.location.href,
            title
        };
    }

    findCurrentMenuOverlay() {
        const wrappers = document.querySelectorAll('[data-radix-popper-content-wrapper]');
        for (const w of wrappers) {
            if (w.querySelector('[role="menu"]')) return w;
        }
        return null;
    }

    _buildStarSvg(isStarred) {
        return isStarred
            ? '<svg viewBox="0 0 24 24" width="100%" height="100%" style="fill: rgb(255,125,3); overflow: hidden; cursor: pointer;"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>'
            : '<svg viewBox="0 0 24 24" width="100%" height="100%" style="fill: currentcolor; overflow: hidden; cursor: pointer;"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
    }

    createStarMenuItem(overlay, isStarred) {
        const menu = overlay.querySelector('[role="menu"]');
        if (!menu) return null;

        const items = menu.querySelectorAll(':scope > [role="menuitem"]');
        if (items.length === 0) return null;

        const refItem = items[0];
        const menuItem = refItem.cloneNode(true);
        menuItem.setAttribute('data-ait-star-folder', 'true');

        const label = isStarred
            ? (TimelineI18n.getMessage('bpxjkw') || 'Unstar')
            : (TimelineI18n.getMessage('nativeMenuStarToFolder') || 'Star to Folder');

        const iconSpan = menuItem.querySelector('[data-role="icon"]');
        if (iconSpan) {
            iconSpan.removeAttribute('data-icon-type');
            iconSpan.innerHTML = this._buildStarSvg(isStarred);
        }

        for (const child of menuItem.childNodes) {
            if (child.nodeType === Node.TEXT_NODE && child.textContent.trim()) {
                child.textContent = label;
                break;
            }
        }

        if (isStarred) menuItem.style.color = '#ef4444';

        const secondItem = items[1] || null;
        menu.insertBefore(menuItem, secondItem);
        return menuItem;
    }

    updateStarMenuItemState(menuItem, isStarred) {
        const label = isStarred
            ? (TimelineI18n.getMessage('bpxjkw') || 'Unstar')
            : (TimelineI18n.getMessage('nativeMenuStarToFolder') || 'Star to Folder');

        const iconSpan = menuItem.querySelector('[data-role="icon"]');
        if (iconSpan) {
            iconSpan.innerHTML = this._buildStarSvg(isStarred);
        }

        for (const child of menuItem.childNodes) {
            if (child.nodeType === Node.TEXT_NODE && child.textContent.trim()) {
                child.textContent = label;
                break;
            }
        }

        menuItem.style.color = isStarred ? '#ef4444' : '';
    }
}
