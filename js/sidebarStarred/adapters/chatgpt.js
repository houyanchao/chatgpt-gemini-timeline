/**
 * ChatGPT Sidebar Starred Adapter
 *
 * 新版侧边栏：nav → .overflow-y-auto → .contents → 分组包装层
 *   section[data-app-action-sidebar-section] 在分组折叠时仍保留。
 *   沿分组向上找到滚动容器，把收藏区插到分组树之前，避免落入
 *   display: contents 包装层（无布局尺寸）或可折叠的分组内容中。
 *
 * 旧版侧边栏 DOM 结构（scrollport = nav.group/scrollport）：
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
        return this.findInsertionPoint()?.parent || null;
    }

    findInsertionPoint() {
        // 新版使用独立滚动容器；不依赖带哈希的 Navigation 类名或本地化标题。
        const modernSections = document.querySelectorAll('nav [data-app-action-sidebar-section]');
        for (const section of modernSections) {
            const nav = section.closest('nav');
            let reference = section;
            while (reference.parentElement && reference.parentElement !== nav) {
                const parent = reference.parentElement;
                if (parent.classList.contains('overflow-y-auto')) {
                    return { parent, reference, position: 'before' };
                }
                reference = parent;
            }
        }

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
        return document.querySelectorAll(
            '#history a[data-sidebar-item], nav .sidebar-item a[data-interactive-row-link]:has([data-thread-title])'
        );
    }

    getHideTarget(convEl) {
        // 新版按钮位于链接外，隐藏收藏对话时需要连同整行操作按钮一起隐藏。
        return convEl.closest('.sidebar-item') || convEl;
    }

    getConversationUrlPath(convEl) {
        try { return new URL(convEl.href).pathname; } catch { return ''; }
    }

    injectStarIcon(convEl) {
        if (convEl.querySelector(`[${BaseSidebarStarredAdapter.STAR_ICON_ATTR}]`)) return;
        const truncate = convEl.querySelector('[data-thread-title]') || convEl.querySelector('.truncate');
        const row = truncate?.parentElement;
        if (!row) return;

        const icon = document.createElement('span');
        icon.setAttribute(BaseSidebarStarredAdapter.STAR_ICON_ATTR, 'true');
        icon.className = 'ait-conv-starred-icon';
        icon.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="rgb(255, 125, 3)" stroke="rgb(255, 125, 3)" stroke-width="1"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';
        // 放在标题滚动容器外，避免图标随长标题滚动或被裁切。
        row.insertBefore(icon, truncate);
    }

    removeStarIcon(convEl) {
        const icon = convEl.querySelector(`[${BaseSidebarStarredAdapter.STAR_ICON_ATTR}]`);
        if (icon) icon.remove();
    }

    // ==================== 原生菜单注入 ====================

    getClickDelegateSelector() {
        return 'button[data-conversation-options-trigger], nav .sidebar-item button[aria-haspopup="menu"]';
    }

    getConversationFromClickTarget(btn) {
        // 新版操作按钮与链接是聊天行内的兄弟节点，不再位于链接内部。
        const convLink = btn.closest('a[data-sidebar-item]')
            || btn.closest('.sidebar-item')?.querySelector('a[data-interactive-row-link][href]');
        if (!convLink || !/\/c\/[^/]+/.test(new URL(convLink.href).pathname)) return null;

        this._menuTriggerId = btn.id || null;
        const titleSpan = convLink.querySelector('[data-thread-title], .truncate span[dir="auto"]');
        return {
            url: convLink.href,
            title: convLink.getAttribute('aria-label')?.trim() || titleSpan?.textContent?.trim() || convLink.textContent?.trim() || ''
        };
    }

    findCurrentMenuOverlay() {
        // ChatGPT 菜单为 radix dropdown，新版已不再包一层 [data-radix-popper-content-wrapper]，
        // [role="menu"] 直接挂在 body 下。取最新打开、且属于对话操作菜单（含分享/删除项）的那个。
        const menus = document.querySelectorAll('[role="menu"][data-radix-menu-content]');
        for (let i = menus.length - 1; i >= 0; i--) {
            const menu = menus[i];
            if (menu.getAttribute('data-state') === 'closed') continue;
            // 新版菜单项也移除了 testid，用 Radix 的触发按钮关联识别菜单。
            const labelledBy = (menu.getAttribute('aria-labelledby') || '').split(/\s+/);
            if (this._menuTriggerId && labelledBy.includes(this._menuTriggerId)) return menu;
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
        // 只复用原生样式，不复制重命名/子菜单的 id、状态或图标结构。
        const menuItem = document.createElement('div');
        menuItem.className = refItem.className;
        menuItem.setAttribute('role', 'menuitem');
        menuItem.setAttribute('tabindex', '-1');
        menuItem.setAttribute('data-ait-star-folder', 'true');

        const nativeRow = refItem.querySelector('[data-menu-row-content]');
        const row = nativeRow ? document.createElement('div') : menuItem;
        if (nativeRow) {
            row.className = nativeRow.className;
            row.setAttribute('data-menu-row-content', 'true');
            menuItem.appendChild(row);
        }
        const icon = document.createElement('span');
        icon.className = 'icon ait-native-star-icon';
        icon.style.cssText = 'display:inline-flex;flex-shrink:0;align-items:center;justify-content:center';
        icon.dataset.size = nativeRow ? '16' : '20';
        const label = document.createElement('span');
        label.className = 'ait-native-star-label';
        row.append(icon, label);
        this.updateStarMenuItemState(menuItem, isStarred);

        // 放在第一个原生操作之后（旧版为分享，新版为重命名）。
        const container = refItem.parentElement || menu;
        const secondItem = items[1] && items[1].parentElement === container ? items[1] : null;
        container.insertBefore(menuItem, secondItem);
        return menuItem;
    }

    updateStarMenuItemState(menuItem, isStarred) {
        const label = isStarred
            ? (TimelineI18n.getMessage('bpxjkw') || 'Unstar')
            : (TimelineI18n.getMessage('nativeMenuStarToFolder') || 'Star to Folder');

        const labelEl = menuItem.querySelector('.ait-native-star-label');
        if (labelEl) labelEl.textContent = label;
        menuItem.setAttribute('aria-label', label);

        const icon = menuItem.querySelector('.ait-native-star-icon');
        if (icon) {
            const color = isStarred ? 'rgb(255, 125, 3)' : 'currentColor';
            const size = icon.dataset.size;
            icon.innerHTML = `<svg aria-hidden="true" viewBox="0 0 24 24" width="${size}" height="${size}" fill="${isStarred ? color : 'none'}" stroke="${color}" stroke-width="${isStarred ? '0.5' : '2'}"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;
        }
        menuItem.style.color = isStarred ? '#ef4444' : '';
    }
}
