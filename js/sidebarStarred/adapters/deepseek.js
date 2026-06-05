/**
 * DeepSeek Sidebar Starred Adapter
 *
 * DeepSeek 侧边栏 DOM 结构：
 *   通过 img[src*="/user-avatar/"] 定位用户头像
 *   → 父元素的父元素的上一个兄弟元素 = 聊天记录列表容器
 *   收藏区域插在聊天记录列表容器的上方
 *
 * 策略：
 *   findSidebarContainer → 聊天记录列表容器的父元素
 *   findInsertionPoint   → insertBefore(聊天记录列表容器)
 */

class DeepSeekSidebarStarredAdapter extends BaseSidebarStarredAdapter {
    async matches() {
        return matchesPlatform(location.href, 'deepseek');
    }

    _findHistoryContainer() {
        const avatar = document.querySelector('img[src*="/user-avatar/"]');
        if (!avatar?.parentElement?.parentElement?.parentElement) return null;
        const parent = avatar.parentElement.parentElement.parentElement;
        return parent.querySelector('.ds-scroll-area') || null;
    }

    findSidebarContainer() {
        const history = this._findHistoryContainer();
        if (history?.parentElement) return history.parentElement;
        return null;
    }

    findInsertionPoint() {
        const history = this._findHistoryContainer();
        if (history?.parentElement) {
            return { parent: history.parentElement, reference: history, position: 'before' };
        }
        return null;
    }

    getPlatformClass() {
        return 'deepseek';
    }

    navigateToConversation(url) {
        try {
            const convId = new URL(url).pathname.split('/').filter(Boolean).pop();
            if (!convId) return false;
            const history = this._findHistoryContainer();
            if (!history) return false;
            const link = history.querySelector(`a[href*="${convId}"]`);
            if (link) { link.click(); return true; }
        } catch { /* ignore */ }
        return false;
    }

    // ==================== 侧边栏收藏标记 ====================

    getConversationElements() {
        const history = this._findHistoryContainer();
        if (!history) return [];
        return history.querySelectorAll('a[href*="/chat/"]');
    }

    getConversationUrlPath(convEl) {
        try { return new URL(convEl.href).pathname; } catch { return ''; }
    }

    injectStarIcon(convEl) {
        const children = convEl.children;
        let titleEl = null;
        for (const child of children) {
            if (child.textContent.trim() && !child.querySelector('.ds-icon-button') && !child.classList.contains('ds-focus-ring')) {
                titleEl = child;
                break;
            }
        }
        if (!titleEl || titleEl.querySelector(`[${BaseSidebarStarredAdapter.STAR_ICON_ATTR}]`)) return;

        const icon = document.createElement('span');
        icon.setAttribute(BaseSidebarStarredAdapter.STAR_ICON_ATTR, 'true');
        icon.className = 'ait-conv-starred-icon';
        icon.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="rgb(255, 125, 3)" stroke="rgb(255, 125, 3)" stroke-width="1"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';
        titleEl.insertBefore(icon, titleEl.firstChild);
    }

    removeStarIcon(convEl) {
        const icon = convEl.querySelector(`[${BaseSidebarStarredAdapter.STAR_ICON_ATTR}]`);
        if (icon) icon.remove();
    }

    // ==================== 原生菜单注入 ====================

    getClickDelegateSelector() {
        return 'a[href*="/chat/"] .ds-icon-button';
    }

    getConversationFromClickTarget(btn) {
        const convLink = btn.closest('a[href*="/chat/"]');
        if (!convLink) return null;

        const children = convLink.children;
        let title = '';
        for (const child of children) {
            if (child.textContent.trim() && !child.querySelector('.ds-icon-button') && !child.classList.contains('ds-focus-ring')) {
                title = child.textContent.trim();
                break;
            }
        }

        return { url: convLink.href, title };
    }

    findCurrentMenuOverlay() {
        const menus = document.querySelectorAll('.ds-dropdown-menu[role="menu"]');
        for (const menu of menus) {
            if (menu.querySelector('.ds-dropdown-menu-option')) return menu;
        }
        return null;
    }

    _buildStarSvg(isStarred) {
        return isStarred
            ? '<svg width="16" height="16" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="rgb(255,125,3)" stroke="rgb(255,125,3)" stroke-width="0.5"/></svg>'
            : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" stroke="currentColor" stroke-width="1.5"/></svg>';
    }

    createStarMenuItem(overlay, isStarred) {
        const items = overlay.querySelectorAll('.ds-dropdown-menu-option');
        if (items.length === 0) return null;

        const label = isStarred
            ? (chrome.i18n.getMessage('bpxjkw') || 'Unstar')
            : (chrome.i18n.getMessage('nativeMenuStarToFolder') || 'Star to Folder');

        const menuItem = document.createElement('div');
        menuItem.className = 'ds-dropdown-menu-option ds-dropdown-menu-option--none';
        menuItem.setAttribute('data-ait-star-folder', 'true');
        if (isStarred) menuItem.style.color = '#ef4444';
        menuItem.innerHTML = `<div class="ds-dropdown-menu-option__icon">${this._buildStarSvg(isStarred)}</div><div class="ds-dropdown-menu-option__label">${label}</div>`;

        menuItem.addEventListener('pointerenter', () => {
            overlay.querySelectorAll('.ds-dropdown-menu-option--pending').forEach(el => {
                el.classList.remove('ds-dropdown-menu-option--pending');
            });
        });

        const parentEl = items[0].parentElement;
        if (!parentEl) return null;
        const secondItem = items[1] || null;
        parentEl.insertBefore(menuItem, secondItem);
        return menuItem;
    }

    updateStarMenuItemState(menuItem, isStarred) {
        const label = isStarred
            ? (chrome.i18n.getMessage('bpxjkw') || 'Unstar')
            : (chrome.i18n.getMessage('nativeMenuStarToFolder') || 'Star to Folder');
        const labelEl = menuItem.querySelector('.ds-dropdown-menu-option__label');
        if (labelEl) labelEl.textContent = label;

        const iconEl = menuItem.querySelector('.ds-dropdown-menu-option__icon');
        if (iconEl) iconEl.innerHTML = this._buildStarSvg(isStarred);

        menuItem.style.color = isStarred ? '#ef4444' : '';
    }
}
