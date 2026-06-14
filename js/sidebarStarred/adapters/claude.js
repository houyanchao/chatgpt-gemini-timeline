/**
 * Claude Sidebar Starred Adapter
 *
 * Claude 侧边栏 DOM 结构：
 *   nav[aria-label="Sidebar"]
 *     > div (scrollable, overflow-y-auto, tabindex="-1")
 *       > div (content wrapper)
 *         ├── a[href="/recents"]    (Chats)
 *         ├── a[href="/projects"]   (Projects)
 *         ├── a[href="/artifacts"]  (Artifacts)
 *         ├── a[href="/upgrade"]    (Code)
 *         └── div.flex-1            (chat history section)
 *               └── ul > li > div.relative.group
 *                     ├── a[href="/chat/xxx"]  (chat link)
 *                     │     └── span.truncate  (title)
 *                     └── div.absolute
 *                           └── button[aria-label^="More options for"]
 *
 * 菜单：Radix UI dropdown（[data-radix-popper-content-wrapper]）
 */

class ClaudeSidebarStarredAdapter extends BaseSidebarStarredAdapter {
    async matches() {
        return matchesPlatform(location.href, 'claude');
    }

    _findNav() {
        return document.querySelector('nav[aria-label="Sidebar"]');
    }

    _findScrollableArea() {
        const nav = this._findNav();
        return nav?.querySelector('[tabindex="-1"]') || null;
    }

    _findHistorySection() {
        const scrollable = this._findScrollableArea();
        if (!scrollable?.firstElementChild) return null;
        const contentWrapper = scrollable.firstElementChild;
        const chatLink = contentWrapper.querySelector('a[href^="/chat/"]');
        if (!chatLink) return null;
        let section = chatLink;
        while (section && section.parentElement !== contentWrapper) {
            section = section.parentElement;
        }
        return section || null;
    }

    findSidebarContainer() {
        const section = this._findHistorySection();
        return section?.parentElement || null;
    }

    findInsertionPoint() {
        const section = this._findHistorySection();
        if (section?.parentElement) {
            return { parent: section.parentElement, reference: section, position: 'before' };
        }
        return null;
    }

    getPlatformClass() {
        return 'claude';
    }

    navigateToConversation(url) {
        try {
            const convId = new URL(url).pathname.split('/').filter(Boolean).pop();
            if (!convId) return false;
            const nav = this._findNav();
            if (!nav) return false;
            const link = nav.querySelector(`a[href*="${convId}"]`);
            if (link) { link.click(); return true; }
        } catch { /* ignore */ }
        return false;
    }

    // ==================== 侧边栏收藏标记 ====================

    getConversationElements() {
        const nav = this._findNav();
        if (!nav) return [];
        return nav.querySelectorAll('a[href^="/chat/"]');
    }

    getConversationUrlPath(convEl) {
        try { return new URL(convEl.href).pathname; } catch { return ''; }
    }

    getHideTarget(convEl) {
        return convEl.closest('li') || convEl;
    }

    injectStarIcon(convEl) {
        const titleSpan = convEl.querySelector('span.truncate');
        if (!titleSpan || titleSpan.querySelector(`[${BaseSidebarStarredAdapter.STAR_ICON_ATTR}]`)) return;

        const icon = document.createElement('span');
        icon.setAttribute(BaseSidebarStarredAdapter.STAR_ICON_ATTR, 'true');
        icon.className = 'ait-conv-starred-icon';
        icon.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="rgb(255, 125, 3)" stroke="rgb(255, 125, 3)" stroke-width="1"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';
        titleSpan.insertBefore(icon, titleSpan.firstChild);
    }

    removeStarIcon(convEl) {
        const icon = convEl.querySelector(`[${BaseSidebarStarredAdapter.STAR_ICON_ATTR}]`);
        if (icon) icon.remove();
    }

    // ==================== 原生菜单注入 ====================
    // Claude 的 Radix UI 在 pointerdown 上调用 stopPropagation，
    // 导致 document 级别的事件委托无法触发。
    // 改用 MutationObserver 监听菜单 DOM 出现，通过 aria-labelledby 反查触发按钮定位会话。

    getClickDelegateSelector() {
        return 'button[aria-label^="More options for"]';
    }

    getConversationFromClickTarget(btn) {
        const li = btn.closest('li');
        if (!li) return null;
        const link = li.querySelector('a[href^="/chat/"]');
        if (!link) return null;
        const titleSpan = link.querySelector('span.truncate');
        return {
            url: link.href,
            title: titleSpan?.textContent?.trim() || ''
        };
    }

    closeNativeMenu() {
        const overlay = document.querySelector('[data-radix-popper-content-wrapper] [role="menu"][data-state="open"]');
        if (overlay) {
            overlay.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        }
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    }

    initNativeMenu(folderManager) {
        if (this._menuInited) return;
        this._menuFolderManager = folderManager;
        this._menuInited = true;

        if (window.DOMObserverManager) {
            this._unsubscribeMenuObserver = window.DOMObserverManager.getInstance().subscribeBody('claude-native-menu', {
                callback: () => this._checkAndInjectMenu(),
                filter: { hasAddedNodes: true },
                debounce: 50
            });
        }
    }

    _checkAndInjectMenu() {
        const wrappers = document.querySelectorAll('[data-radix-popper-content-wrapper]');
        for (const wrapper of wrappers) {
            const menu = wrapper.querySelector('[role="menu"]');
            if (!menu) continue;
            if (menu.querySelector(`[${BaseSidebarStarredAdapter.MARKER_ATTR}]`)) continue;

            const triggerId = menu.getAttribute('aria-labelledby');
            const trigger = triggerId ? document.getElementById(triggerId) : null;
            if (!trigger) continue;

            const nav = this._findNav();
            if (!nav?.contains(trigger)) continue;

            const li = trigger.closest('li');
            if (!li) continue;
            const link = li.querySelector('a[href^="/chat/"]');
            if (!link) continue;

            const titleSpan = link.querySelector('span.truncate');
            const convInfo = { url: link.href, title: titleSpan?.textContent?.trim() || '' };

            const menuItem = this.createStarMenuItem(wrapper, false);
            if (!menuItem) continue;

            menuItem.setAttribute('data-ait-conv-url', convInfo.url);
            menuItem.setAttribute('data-ait-conv-title', convInfo.title || '');
            menuItem.setAttribute('data-ait-conv-starred', 'false');

            menuItem.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const url = menuItem.getAttribute('data-ait-conv-url');
                const title = menuItem.getAttribute('data-ait-conv-title');
                if (!url) return;
                this.closeNativeMenu();
                const starred = menuItem.getAttribute('data-ait-conv-starred') === 'true';
                setTimeout(() => starred ? this._unstarConv({ url }) : this._starToFolder({ url, title }), 150);
            });

            const urlWithoutProtocol = convInfo.url.replace(/^https?:\/\//, '');
            const key = `chatTimelineStar:${urlWithoutProtocol}:-1`;
            StarStorageManager.findByKey(key).then(existing => {
                if (!existing) return;
                menuItem.setAttribute('data-ait-conv-starred', 'true');
                this.updateStarMenuItemState?.(menuItem, true);
            }).catch(() => {});
        }
    }

    destroyNativeMenu() {
        if (!this._menuInited) return;
        this._menuInited = false;
        if (this._unsubscribeMenuObserver) {
            this._unsubscribeMenuObserver();
            this._unsubscribeMenuObserver = null;
        }
        this._trackedConv = null;
        this._menuFolderManager = null;
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
            ? '<svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="rgb(255,125,3)" stroke="rgb(255,125,3)" stroke-width="0.5"/></svg>'
            : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" stroke="currentColor" stroke-width="2"/></svg>';
    }

    createStarMenuItem(overlay, isStarred) {
        const menu = overlay.querySelector('[role="menu"]');
        if (!menu) return null;

        const items = menu.querySelectorAll('[role="menuitem"]');
        if (items.length === 0) return null;

        const refItem = items[0];
        const parentEl = refItem.parentElement;
        if (!parentEl) return null;

        const menuItem = refItem.cloneNode(true);
        menuItem.setAttribute('data-ait-star-folder', 'true');
        menuItem.removeAttribute('data-testid');
        menuItem.className = refItem.className;

        const label = isStarred
            ? (TimelineI18n.getMessage('bpxjkw') || 'Unstar')
            : (TimelineI18n.getMessage('nativeMenuStarToFolder') || 'Star to Folder');

        const iconWrapper = menuItem.querySelector('div[style*="width: 20px"]');
        if (iconWrapper) {
            iconWrapper.innerHTML = this._buildStarSvg(isStarred);
        }

        const labelSpan = menuItem.querySelector('span.truncate');
        if (labelSpan) {
            labelSpan.textContent = label;
        }

        if (isStarred) menuItem.style.color = '#ef4444';

        const secondItem = items[1] || null;
        parentEl.insertBefore(menuItem, secondItem);
        return menuItem;
    }

    updateStarMenuItemState(menuItem, isStarred) {
        const label = isStarred
            ? (TimelineI18n.getMessage('bpxjkw') || 'Unstar')
            : (TimelineI18n.getMessage('nativeMenuStarToFolder') || 'Star to Folder');

        const iconWrapper = menuItem.querySelector('div[style*="width: 20px"]');
        if (iconWrapper) {
            iconWrapper.innerHTML = this._buildStarSvg(isStarred);
        }

        const labelSpan = menuItem.querySelector('span.truncate');
        if (labelSpan) {
            labelSpan.textContent = label;
        }

        menuItem.style.color = isStarred ? '#ef4444' : '';
    }
}
