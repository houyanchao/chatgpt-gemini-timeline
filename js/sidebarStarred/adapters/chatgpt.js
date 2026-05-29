/**
 * ChatGPT Sidebar Starred Adapter
 *
 * ChatGPT 侧边栏 DOM 结构：
 *   nav > ... > #history 的父元素
 *     ├── .ait-sidebar-starred       ← 收藏区域（插入位置）
 *     └── #history 的父元素          ← 聊天历史（参考锚点）
 *
 * 策略：
 *   findSidebarContainer → #history 父元素的父元素
 *   findInsertionPoint   → insertBefore(#history 的父元素)
 */

class ChatGPTSidebarStarredAdapter extends BaseSidebarStarredAdapter {
    matches() {
        return matchesPlatform(location.href, 'chatgpt');
    }

    findSidebarContainer() {
        const history = document.getElementById('history');
        if (history?.parentElement?.parentElement) return history.parentElement.parentElement;
        return null;
    }

    findInsertionPoint() {
        const history = document.getElementById('history');
        if (history?.parentElement?.parentElement) {
            return { parent: history.parentElement.parentElement, reference: history.parentElement, position: 'before' };
        }
        return null;
    }

    getPlatformClass() {
        return 'chatgpt';
    }

    navigateToConversation(url) {
        try {
            const convId = new URL(url).pathname.split('/').filter(Boolean).pop();
            if (!convId) return false;
            const link = document.querySelector(`#history a[href*="${convId}"]`);
            if (link) { link.click(); return true; }
        } catch { /* ignore */ }
        return false;
    }

    // ==================== 侧边栏收藏标记 ====================

    getConversationElements() {
        return document.querySelectorAll('#history a[data-sidebar-item]');
    }

    getConversationUrlPath(convEl) {
        try { return new URL(convEl.href).pathname; } catch { return ''; }
    }

    injectStarIcon(convEl) {
        const truncate = convEl.querySelector('.truncate');
        if (!truncate || truncate.querySelector(`[${BaseSidebarStarredAdapter.STAR_ICON_ATTR}]`)) return;

        const icon = document.createElement('span');
        icon.setAttribute(BaseSidebarStarredAdapter.STAR_ICON_ATTR, 'true');
        icon.className = 'ait-conv-starred-icon';
        icon.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="rgb(255, 125, 3)" stroke="rgb(255, 125, 3)" stroke-width="1"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';
        truncate.insertBefore(icon, truncate.firstChild);
    }

    removeStarIcon(convEl) {
        const icon = convEl.querySelector(`[${BaseSidebarStarredAdapter.STAR_ICON_ATTR}]`);
        if (icon) icon.remove();
    }

    // ==================== 原生菜单注入 ====================

    getClickDelegateSelector() {
        return 'button[data-conversation-options-trigger]';
    }

    getConversationFromClickTarget(btn) {
        const convLink = btn.closest('a[data-sidebar-item]');
        if (!convLink) return null;

        const titleSpan = convLink.querySelector('.truncate span[dir="auto"]');
        return {
            url: convLink.href,
            title: titleSpan?.textContent?.trim() || ''
        };
    }

    findCurrentMenuOverlay() {
        // ChatGPT 菜单为 radix dropdown，新版已不再包一层 [data-radix-popper-content-wrapper]，
        // [role="menu"] 直接挂在 body 下。取最新打开、且属于对话操作菜单（含分享/删除项）的那个。
        const menus = document.querySelectorAll('[role="menu"][data-radix-menu-content]');
        for (let i = menus.length - 1; i >= 0; i--) {
            const menu = menus[i];
            if (menu.getAttribute('data-state') === 'closed') continue;
            if (menu.querySelector('[data-testid="share-chat-menu-item"], [data-testid="delete-chat-menu-item"]')) {
                return menu;
            }
        }
        return null;
    }

    createStarMenuItem(overlay, isStarred) {
        const menu = overlay.matches('[role="menu"]') ? overlay : overlay.querySelector('[role="menu"]');
        if (!menu) return null;

        const items = menu.querySelectorAll('[role="menuitem"]');
        if (items.length === 0) return null;

        const refItem = items[0];
        const menuItem = refItem.cloneNode(true);
        menuItem.setAttribute('data-ait-star-folder', 'true');
        menuItem.removeAttribute('data-testid');
        menuItem.removeAttribute('data-has-submenu');
        menuItem.removeAttribute('aria-haspopup');
        menuItem.removeAttribute('aria-expanded');
        menuItem.removeAttribute('aria-controls');
        menuItem.removeAttribute('data-state');
        menuItem.className = refItem.className;

        const label = isStarred
            ? (chrome.i18n.getMessage('bpxjkw') || 'Unstar')
            : (chrome.i18n.getMessage('nativeMenuStarToFolder') || 'Star to Folder');

        for (const child of [...menuItem.childNodes].reverse()) {
            if (child.nodeType === Node.TEXT_NODE && child.textContent.trim()) {
                child.textContent = label;
                break;
            }
        }

        const iconDiv = menuItem.querySelector('.icon');
        if (iconDiv) {
            const starSvg = isStarred
                ? '<svg viewBox="0 0 24 24" width="20" height="20" fill="rgb(255, 125, 3)" stroke="rgb(255, 125, 3)" stroke-width="0.5"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>'
                : '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';
            iconDiv.innerHTML = starSvg;
        }
        if (isStarred) menuItem.style.color = '#ef4444';

        // 插到「分享」项之后；按菜单项的实际父容器插入，避免菜单项非 menu 直接子节点时出错
        const container = refItem.parentElement || menu;
        const secondItem = items[1] && items[1].parentElement === container ? items[1] : null;
        container.insertBefore(menuItem, secondItem);
        return menuItem;
    }

    updateStarMenuItemState(menuItem, isStarred) {
        const label = isStarred
            ? (chrome.i18n.getMessage('bpxjkw') || 'Unstar')
            : (chrome.i18n.getMessage('nativeMenuStarToFolder') || 'Star to Folder');

        for (const child of [...menuItem.childNodes].reverse()) {
            if (child.nodeType === Node.TEXT_NODE && child.textContent.trim()) {
                child.textContent = label;
                break;
            }
        }

        const iconDiv = menuItem.querySelector('.icon');
        if (iconDiv) {
            const starSvg = isStarred
                ? '<svg viewBox="0 0 24 24" width="20" height="20" fill="rgb(255, 125, 3)" stroke="rgb(255, 125, 3)" stroke-width="0.5"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>'
                : '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';
            iconDiv.innerHTML = starSvg;
        }
        menuItem.style.color = isStarred ? '#ef4444' : '';
    }
}
