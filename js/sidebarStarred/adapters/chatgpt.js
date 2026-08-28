/**
 * ChatGPT Sidebar Starred Adapter
 *
 * ChatGPT 侧边栏 DOM 结构（scrollport = nav.group/scrollport）：
 *   nav.group/scrollport
 *     ├── (sticky 头部 / 搜索 / 文件库 / 项目 / 应用 / 更多 等导航项)
 *     ├── .ait-sidebar-starred                        ← 收藏区域（插入到此，压在所有对话分组之上）
 *     ├── div.group/sidebar-expando-section「已置顶」  ← 置顶分组（可能不存在）
 *     └── div.group/sidebar-expando-section「最近」    ← 展开时内含 #history
 *
 * ⚠️ 分组可折叠：折叠「最近」时 ChatGPT 会卸载 #history（连同对话列表），但
 *   .group/sidebar-expando-section 分组容器本身在折叠态仍保留。因此定位锚点用分组容器，
 *   不用 #history（否则折叠时 findInsertionPoint 返回 null，会导致收藏区被移除而消失）。
 *
 * 策略：
 *   findSidebarContainer → 第一个 expando-section 的父元素（即 scrollport）
 *   findInsertionPoint   → insertBefore(scrollport 内第一个 expando-section)
 *     即插在「已置顶」之前；无置顶时即插在「最近」之前，始终位于置顶与历史记录上方。
 */

class ChatGPTSidebarStarredAdapter extends BaseSidebarStarredAdapter {
    async matches() {
        return matchesPlatform(location.href, 'chatgpt');
    }

    findSidebarContainer() {
        // 分组容器在折叠态也保留，用它反查 scrollport；#history 折叠时会被卸载，仅作兜底
        const section = document.querySelector('.group\\/sidebar-expando-section');
        if (section?.parentElement) return section.parentElement;
        const history = document.getElementById('history');
        return history?.parentElement?.parentElement || null;
    }

    findInsertionPoint() {
        // 分组容器（已置顶/最近）在展开与折叠状态都存在、class 稳定；不依赖 #history（折叠时被卸载）。
        // 插到第一个分组之前：有置顶时是「已置顶」，无置顶时即「最近」，始终位于置顶与历史记录之上。
        const sections = document.querySelectorAll('.group\\/sidebar-expando-section');
        if (sections.length && sections[0].parentElement) {
            return { parent: sections[0].parentElement, reference: sections[0], position: 'before' };
        }

        // 兜底：无分组容器（结构大改）时退回到 #history 父容器之前
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
        if (convEl.querySelector(`[${BaseSidebarStarredAdapter.STAR_ICON_ATTR}]`)) return;
        const truncate = convEl.querySelector('.truncate');
        const row = truncate?.parentElement;
        if (!row) return;

        const icon = document.createElement('span');
        icon.setAttribute(BaseSidebarStarredAdapter.STAR_ICON_ATTR, 'true');
        icon.className = 'ait-conv-starred-icon';
        icon.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="rgb(255, 125, 3)" stroke="rgb(255, 125, 3)" stroke-width="1"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';
        // 标题被 marquee 组件包成多层块级元素，插进去必然换行；只能作为 .truncate 的兄弟插入外层 flex 行
        row.insertBefore(icon, truncate);
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
            ? (TimelineI18n.getMessage('bpxjkw') || 'Unstar')
            : (TimelineI18n.getMessage('nativeMenuStarToFolder') || 'Star to Folder');

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
            ? (TimelineI18n.getMessage('bpxjkw') || 'Unstar')
            : (TimelineI18n.getMessage('nativeMenuStarToFolder') || 'Star to Folder');

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
