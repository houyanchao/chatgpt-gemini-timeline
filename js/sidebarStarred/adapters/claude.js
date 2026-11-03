/**
 * Claude sidebar and conversation menu adapter.
 * Supports the current data-testid sidebar / Base UI menus and legacy nav / Radix menus.
 */
class ClaudeSidebarStarredAdapter extends BaseSidebarStarredAdapter {
    async matches() { return matchesPlatform(location.href, 'claude'); }

    _findNav() {
        return document.querySelector('[data-testid="sidebar"]')
            || document.querySelector('nav[aria-label="Sidebar"]');
    }

    _findScrollableArea() {
        const nav = this._findNav();
        return nav?.querySelector('.dframe-nav-scroll')
            || nav?.querySelector('[tabindex="-1"]') || null;
    }

    _findHistorySection() {
        const scrollable = this._findScrollableArea();
        if (!scrollable) return null;
        const modern = scrollable.querySelector('[data-testid="sidebar-pinned"], [data-testid="sidebar-recents"]');
        if (modern) {
            let section = modern;
            while (section.parentElement && section.parentElement !== scrollable) section = section.parentElement;
            return section;
        }
        const wrapper = scrollable.firstElementChild;
        let section = wrapper?.querySelector('a[href^="/chat/"]');
        if (!section) return null;
        while (section && section.parentElement !== wrapper) section = section.parentElement;
        return section;
    }

    findSidebarContainer() { return this._findHistorySection()?.parentElement || null; }

    findInsertionPoint() {
        const section = this._findHistorySection();
        return section?.parentElement ? { parent: section.parentElement, reference: section, position: 'before' } : null;
    }

    getPlatformClass() { return 'claude'; }

    navigateToConversation(url) {
        try {
            const path = new URL(url).pathname;
            const link = Array.from(this.getConversationElements()).find(el => new URL(el.href).pathname === path);
            if (link) { link.click(); return true; }
        } catch {}
        return false;
    }

    getConversationElements() { return this._findNav()?.querySelectorAll('a[href^="/chat/"]') || []; }

    getConversationUrlPath(el) {
        try { return new URL(el.href).pathname; } catch { return ''; }
    }

    getHideTarget(el) { return el.closest('[data-row]') || el.closest('li') || el; }

    injectStarIcon(el) {
        const title = el.querySelector('[data-row-label], span.truncate');
        if (!title || el.querySelector('[' + BaseSidebarStarredAdapter.STAR_ICON_ATTR + ']')) return;
        const icon = document.createElement('span');
        icon.setAttribute(BaseSidebarStarredAdapter.STAR_ICON_ATTR, 'true');
        icon.className = 'ait-conv-starred-icon ait-claude-conv-starred-icon';
        icon.innerHTML = this._buildStarSvg(true);
        icon.querySelector('svg').setAttribute('width', '14');
        icon.querySelector('svg').setAttribute('height', '14');
        // Keep the icon outside the modern title's clipping/fade container.
        if (title.matches('[data-row-label]')) el.insertBefore(icon, title);
        else title.insertBefore(icon, title.firstChild);
    }

    removeStarIcon(el) { el.querySelector('[' + BaseSidebarStarredAdapter.STAR_ICON_ATTR + ']')?.remove(); }

    getClickDelegateSelector() { return 'button[aria-label^="More options for"]'; }

    getConversationFromClickTarget(button) {
        if (this._findNav()?.contains(button)) {
            const row = button.closest('[data-row], li');
            const link = row?.querySelector('a[href^="/chat/"]');
            if (!link) return null;
            const title = link.querySelector('[data-row-label], span.truncate');
            return { url: link.href, title: (title?.textContent || link.textContent || '').trim() };
        }
        if (button.closest('[data-testid="chat-title-split"]') && /^\/chat\/[a-f0-9-]+$/i.test(location.pathname)) {
            return { url: location.href, title: document.title.replace(/\s*[-–]\s*Claude\s*$/i, '').trim() };
        }
        return null;
    }

    _findMenuTrigger(menu) {
        return (menu.getAttribute('aria-labelledby') || '').split(/\s+/)
            .map(id => document.getElementById(id)).find(Boolean) || null;
    }

    _getConversationMenus() {
        return Array.from(document.querySelectorAll(
            '[role="menu"][data-cds="Menu"], [data-radix-popper-content-wrapper] [role="menu"]'
        )).filter(menu => menu.getAttribute('data-state') !== 'closed' && !menu.hasAttribute('data-closed'));
    }

    findCurrentMenuOverlay() {
        return this._getConversationMenus().find(menu => {
            const trigger = this._findMenuTrigger(menu);
            return trigger && this.getConversationFromClickTarget(trigger);
        }) || null;
    }

    closeNativeMenu() {
        const menu = this.findCurrentMenuOverlay();
        const trigger = menu && this._findMenuTrigger(menu);
        if (menu?.matches('[data-cds="Menu"]') && trigger?.getAttribute('aria-expanded') === 'true') {
            trigger.click();
        } else if (menu) {
            menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
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
        this._checkAndInjectMenu();
    }

    _checkAndInjectMenu() {
        for (const menu of this._getConversationMenus()) {
            const trigger = this._findMenuTrigger(menu);
            const info = trigger && this.getConversationFromClickTarget(trigger);
            if (!info) continue;
            let item = menu.querySelector('[' + BaseSidebarStarredAdapter.MARKER_ATTR + ']');
            if (item?.getAttribute('data-ait-conv-url') === info.url) continue;
            if (!item) item = this.createStarMenuItem(menu, false);
            if (!item) continue;
            item.setAttribute('data-ait-conv-url', info.url);
            item.setAttribute('data-ait-conv-title', info.title || '');
            item.setAttribute('data-ait-conv-starred', 'false');
            this.updateStarMenuItemState(item, false);
            const key = 'chatTimelineStar:' + info.url.replace(/^https?:\/\//, '') + ':-1';
            StarStorageManager.findByKey(key).then(existing => {
                if (!existing || !item.isConnected || item.getAttribute('data-ait-conv-url') !== info.url) return;
                item.setAttribute('data-ait-conv-starred', 'true');
                this.updateStarMenuItemState(item, true);
            }).catch(() => {});
        }
    }

    destroyNativeMenu() {
        if (!this._menuInited) return;
        this._menuInited = false;
        this._unsubscribeMenuObserver?.();
        this._unsubscribeMenuObserver = null;
        this._trackedConv = null;
        this._menuFolderManager = null;
    }

    _buildStarSvg(starred) {
        const color = starred ? 'rgb(255,125,3)' : 'currentColor';
        return '<svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="'
            + (starred ? color : 'none') + '" stroke="' + color + '" stroke-width="' + (starred ? '0.5' : '2')
            + '"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';
    }

    createStarMenuItem(overlay, starred) {
        const menu = overlay.matches('[role="menu"]') ? overlay : overlay.querySelector('[role="menu"]');
        const items = menu?.querySelectorAll('[role="menuitem"]');
        const reference = items?.[0];
        if (!reference?.parentElement) return null;
        // Reuse appearance without copying native IDs, shortcuts or action attributes.
        const item = document.createElement('div');
        item.className = reference.className;
        item.setAttribute(BaseSidebarStarredAdapter.MARKER_ATTR, 'true');
        item.setAttribute('role', 'menuitem');
        item.setAttribute('tabindex', '0');
        const icon = document.createElement('span');
        icon.setAttribute('data-ait-star-icon', '');
        icon.className = 'flex size-icon shrink-0 items-center justify-center';
        icon.style.width = '20px';
        icon.style.height = '20px';
        const label = document.createElement('span');
        label.setAttribute('data-ait-star-label', '');
        label.className = 'min-w-0 flex-1 truncate';
        item.append(icon, label);
        for (const type of ['mouseenter', 'focus']) item.addEventListener(type, () => item.setAttribute('data-highlighted', ''));
        for (const type of ['mouseleave', 'blur']) item.addEventListener(type, () => item.removeAttribute('data-highlighted'));
        const activate = event => {
            event.preventDefault();
            event.stopPropagation();
            const url = item.getAttribute('data-ait-conv-url');
            const title = item.getAttribute('data-ait-conv-title');
            if (!url) return;
            const isStarred = item.getAttribute('data-ait-conv-starred') === 'true';
            this.closeNativeMenu();
            setTimeout(() => isStarred ? this._unstarConv({ url }) : this._starToFolder({ url, title }), 150);
        };
        item.addEventListener('click', activate);
        item.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') activate(event);
        });
        this.updateStarMenuItemState(item, starred);
        const next = items[1]?.parentElement === reference.parentElement ? items[1] : null;
        reference.parentElement.insertBefore(item, next);
        return item;
    }

    updateStarMenuItemState(item, starred) {
        const label = starred
            ? (TimelineI18n.getMessage('bpxjkw') || 'Unstar')
            : (TimelineI18n.getMessage('nativeMenuStarToFolder') || 'Star to Folder');
        const icon = item.querySelector('[data-ait-star-icon]');
        if (icon) icon.innerHTML = this._buildStarSvg(starred);
        const text = item.querySelector('[data-ait-star-label]');
        if (text) text.textContent = label;
        item.style.color = starred ? '#ef4444' : '';
    }
}
