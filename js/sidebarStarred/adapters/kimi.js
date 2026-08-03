/**
 * Kimi Sidebar Starred Adapter
 *
 * Kimi 侧边栏 DOM 结构：
 *   新版：.next-sidebar__section--history = 聊天历史区域
 *   旧版：.history-part = 聊天历史列表容器
 *   收藏区域插在聊天历史区域上方
 *   会话链接格式：/chat/xxx?chat_enter_method=history
 */

class KimiSidebarStarredAdapter extends BaseSidebarStarredAdapter {
    async matches() {
        return matchesPlatform(location.href, 'kimi');
    }

    _findHistorySection() {
        return document.querySelector('.next-sidebar__section--history')
            || document.querySelector('.history-part');
    }

    _findNextSidebarBody() {
        return document.querySelector('.next-sidebar__body.sidebar-nav');
    }

    findSidebarContainer() {
        const history = this._findHistorySection();
        if (history?.parentElement) return history.parentElement;
        return this._findNextSidebarBody();
    }

    findInsertionPoint() {
        const history = this._findHistorySection();
        if (history?.parentElement) {
            return { parent: history.parentElement, reference: history, position: 'before' };
        }

        const sidebarBody = this._findNextSidebarBody();
        if (sidebarBody) {
            const topSection = sidebarBody.querySelector(':scope > .next-sidebar__section--top');
            if (topSection) {
                return { parent: sidebarBody, reference: topSection, position: 'after' };
            }
            return { parent: sidebarBody, reference: null, position: 'prepend' };
        }
        return null;
    }

    getPlatformClass() {
        return 'kimi';
    }

    navigateToConversation(url) {
        try {
            const convId = new URL(url).pathname.split('/').filter(Boolean).pop();
            if (!convId) return false;
            const history = this._findHistorySection();
            const link = history?.querySelector(`a[href*="${convId}"]`);
            if (link) { link.click(); return true; }
        } catch { /* ignore */ }
        return false;
    }

    // ==================== 侧边栏收藏标记 ====================

    getConversationElements() {
        const history = this._findHistorySection();
        if (!history) return [];
        return history.querySelectorAll([
            'a.next-sidebar-history-item__link[href*="/chat/"]',
            'a.chat-info-item[href*="/chat/"]'
        ].join(', '));
    }

    getConversationUrlPath(convEl) {
        try { return new URL(convEl.href).pathname; } catch { return ''; }
    }

    injectStarIcon(convEl) {
        const nameEl = convEl.querySelector('.next-sidebar-history-item__title, .chat-name');
        if (!nameEl || nameEl.querySelector(`[${BaseSidebarStarredAdapter.STAR_ICON_ATTR}]`)) return;

        const icon = document.createElement('span');
        icon.setAttribute(BaseSidebarStarredAdapter.STAR_ICON_ATTR, 'true');
        icon.className = 'ait-conv-starred-icon';
        icon.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="rgb(255, 125, 3)" stroke="rgb(255, 125, 3)" stroke-width="1"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';
        nameEl.insertBefore(icon, nameEl.firstChild);
    }

    removeStarIcon(convEl) {
        const icon = convEl.querySelector(`[${BaseSidebarStarredAdapter.STAR_ICON_ATTR}]`);
        if (icon) icon.remove();
    }

    getHideTarget(convEl) {
        return convEl.closest('.next-sidebar-history-item') || convEl;
    }

    // ==================== 原生菜单注入 ====================

    getClickDelegateSelector() {
        return '.next-sidebar-history-item__more, .more-btn';
    }

    getConversationFromClickTarget(btn) {
        const historyItem = btn.closest('.next-sidebar-history-item');
        const convLink = historyItem?.querySelector('a.next-sidebar-history-item__link[href*="/chat/"]')
            || btn.closest('a.chat-info-item');
        if (!convLink) return null;
        const nameEl = convLink.querySelector('.next-sidebar-history-item__title, .chat-name');
        return {
            url: convLink.href,
            title: nameEl?.textContent?.trim() || ''
        };
    }

    findCurrentMenuOverlay() {
        const popovers = document.querySelectorAll('.v-binder-follower-content');
        for (const p of popovers) {
            const menu = p.querySelector([
                'ul.next-sidebar-history-item__menu',
                'ul.opts-menu'
            ].join(', '));
            if (menu) return menu;
        }
        return null;
    }

    _getVueScopeAttr(refEl) {
        for (const attr of refEl.attributes) {
            if (attr.name.startsWith('data-v-')) return attr.name;
        }
        return '';
    }

    _buildStarSvg(isStarred) {
        return isStarred
            ? '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="rgb(255,125,3)" stroke="rgb(255,125,3)" stroke-width="0.5"/>'
            : '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="none" stroke="currentColor" stroke-width="2"/>';
    }

    _createNextSidebarMenuItem(overlay, isStarred, label) {
        const items = Array.from(overlay.children)
            .map(child => child.querySelector(':scope > button.next-sidebar-history-item__menu-item'))
            .filter(Boolean);
        if (items.length === 0) return null;

        const referenceItem = items[0];
        const referenceWrapper = referenceItem.parentElement;
        if (!referenceWrapper) return null;

        const wrapper = referenceWrapper.cloneNode(false);
        const menuItem = referenceItem.cloneNode(true);
        menuItem.classList.remove('is-delete');
        menuItem.setAttribute('data-ait-star-folder', 'true');
        if (isStarred) menuItem.style.color = '#ef4444';

        const svg = menuItem.querySelector('svg');
        if (svg) {
            svg.setAttribute('viewBox', '0 0 24 24');
            svg.setAttribute('width', '16');
            svg.setAttribute('height', '16');
            svg.innerHTML = this._buildStarSvg(isStarred);
        }

        const nameEl = menuItem.querySelector('.next-sidebar-history-item__menu-name');
        if (nameEl) nameEl.textContent = label;

        wrapper.appendChild(menuItem);
        overlay.insertBefore(wrapper, items[1]?.parentElement || null);
        return menuItem;
    }

    createStarMenuItem(overlay, isStarred) {
        const label = isStarred
            ? (TimelineI18n.getMessage('bpxjkw') || 'Unstar')
            : (TimelineI18n.getMessage('nativeMenuStarToFolder') || 'Star to Folder');

        if (overlay.classList.contains('next-sidebar-history-item__menu')) {
            return this._createNextSidebarMenuItem(overlay, isStarred, label);
        }

        const items = overlay.querySelectorAll('li.opt-item');
        if (items.length === 0) return null;

        const scopeAttr = this._getVueScopeAttr(items[0]);
        const menuItem = document.createElement('li');
        menuItem.className = 'opt-item';
        menuItem.setAttribute('data-ait-star-folder', 'true');
        if (scopeAttr) menuItem.setAttribute(scopeAttr, '');
        if (isStarred) menuItem.style.color = '#ef4444';

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', '16');
        svg.setAttribute('height', '16');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('class', 'iconify opt-icon');
        if (scopeAttr) svg.setAttribute(scopeAttr, '');
        svg.innerHTML = this._buildStarSvg(isStarred);
        menuItem.appendChild(svg);

        const span = document.createElement('span');
        span.className = 'opt-name';
        span.textContent = label;
        if (scopeAttr) span.setAttribute(scopeAttr, '');
        menuItem.appendChild(span);

        const secondItem = items[1] || null;
        overlay.insertBefore(menuItem, secondItem);
        return menuItem;
    }

    updateStarMenuItemState(menuItem, isStarred) {
        const label = isStarred
            ? (TimelineI18n.getMessage('bpxjkw') || 'Unstar')
            : (TimelineI18n.getMessage('nativeMenuStarToFolder') || 'Star to Folder');
        const nameEl = menuItem.querySelector('.next-sidebar-history-item__menu-name, .opt-name');
        if (nameEl) nameEl.textContent = label;

        const svg = menuItem.querySelector('svg');
        if (svg) svg.innerHTML = this._buildStarSvg(isStarred);

        menuItem.style.color = isStarred ? '#ef4444' : '';
    }
}
