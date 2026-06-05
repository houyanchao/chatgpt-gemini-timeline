/**
 * Kimi Sidebar Starred Adapter
 *
 * Kimi 侧边栏 DOM 结构：
 *   .history-part = 聊天历史列表容器
 *   收藏区域插在其上方
 *   会话链接格式：/chat/xxx?chat_enter_method=history
 */

class KimiSidebarStarredAdapter extends BaseSidebarStarredAdapter {
    async matches() {
        return matchesPlatform(location.href, 'kimi');
    }

    findSidebarContainer() {
        const history = document.querySelector('.history-part');
        if (history?.parentElement) return history.parentElement;
        return null;
    }

    findInsertionPoint() {
        const history = document.querySelector('.history-part');
        if (history?.parentElement) {
            return { parent: history.parentElement, reference: history, position: 'before' };
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
            const link = document.querySelector(`.history-part a[href*="${convId}"]`);
            if (link) { link.click(); return true; }
        } catch { /* ignore */ }
        return false;
    }

    // ==================== 侧边栏收藏标记 ====================

    getConversationElements() {
        return document.querySelectorAll('.history-part a.chat-info-item[href*="/chat/"]');
    }

    getConversationUrlPath(convEl) {
        try { return new URL(convEl.href).pathname; } catch { return ''; }
    }

    injectStarIcon(convEl) {
        const nameEl = convEl.querySelector('.chat-name');
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

    // ==================== 原生菜单注入 ====================

    getClickDelegateSelector() {
        return '.more-btn';
    }

    getConversationFromClickTarget(btn) {
        const convLink = btn.closest('a.chat-info-item');
        if (!convLink) return null;
        const nameEl = convLink.querySelector('.chat-name');
        return {
            url: convLink.href,
            title: nameEl?.textContent?.trim() || ''
        };
    }

    findCurrentMenuOverlay() {
        const popovers = document.querySelectorAll('.v-binder-follower-content');
        for (const p of popovers) {
            const menu = p.querySelector('ul.opts-menu');
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

    createStarMenuItem(overlay, isStarred) {
        const items = overlay.querySelectorAll('li.opt-item');
        if (items.length === 0) return null;

        const scopeAttr = this._getVueScopeAttr(items[0]);
        const label = isStarred
            ? (chrome.i18n.getMessage('bpxjkw') || 'Unstar')
            : (chrome.i18n.getMessage('nativeMenuStarToFolder') || 'Star to Folder');

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
            ? (chrome.i18n.getMessage('bpxjkw') || 'Unstar')
            : (chrome.i18n.getMessage('nativeMenuStarToFolder') || 'Star to Folder');
        const nameEl = menuItem.querySelector('.opt-name');
        if (nameEl) nameEl.textContent = label;

        const svg = menuItem.querySelector('svg');
        if (svg) svg.innerHTML = this._buildStarSvg(isStarred);

        menuItem.style.color = isStarred ? '#ef4444' : '';
    }
}
