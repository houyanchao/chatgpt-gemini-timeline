/**
 * Gemini Sidebar Starred Adapter
 *
 * Gemini 侧边栏 DOM 结构：
 *   SIDE-NAVIGATION-V2 > BARD-SIDENAV-CONTAINER > BARD-SIDENAV
 *     > SIDE-NAVIGATION-CONTENT > .sidenav-with-history-container
 *       > .overflow-container > INFINITE-SCROLLER
 *         ├── .side-nav-entry-container  (New Chat)
 *         ├── .gems-list-container       (Gems)
 *         ├── .ait-sidebar-starred       ← 收藏区域（插入位置）
 *         └── [data-test-id="chats-expandable-section"]  ← 聊天历史（参考锚点）
 *
 * 策略：
 *   findSidebarContainer → chats-expandable-section 的父元素
 *   findInsertionPoint   → insertBefore(chats-expandable-section)
 */

class GeminiSidebarStarredAdapter extends BaseSidebarStarredAdapter {
    static CHATS_SECTION_SELECTOR = '[data-test-id="chats-expandable-section"]';

    async matches() {
        return matchesPlatform(location.href, 'gemini');
    }

    _getChatsSectionAnchor() {
        return document.querySelector(GeminiSidebarStarredAdapter.CHATS_SECTION_SELECTOR);
    }

    findSidebarContainer() {
        const chatsSection = this._getChatsSectionAnchor();
        return chatsSection?.parentElement || null;
    }

    findInsertionPoint() {
        const chatsSection = this._getChatsSectionAnchor();
        if (chatsSection?.parentElement) {
            return { parent: chatsSection.parentElement, reference: chatsSection, position: 'before' };
        }
        return null;
    }

    getPlatformClass() {
        return 'gemini';
    }

    navigateToConversation(url) {
        try {
            const convId = new URL(url).pathname.split('/').filter(Boolean).pop();
            if (!convId) return false;
            const link = document.querySelector(`conversations-list a[href*="${convId}"]`);
            if (link) { link.click(); return true; }
        } catch { /* ignore */ }
        return false;
    }

    // ==================== 侧边栏收藏标记 ====================

    getConversationElements() {
        return document.querySelectorAll('conversations-list gem-nav-list-item');
    }

    getConversationUrlPath(convEl) {
        const link = convEl.querySelector('a[href]');
        if (!link) return '';
        try { return new URL(link.href).pathname; } catch { return ''; }
    }

    injectStarIcon(convEl) {
        const titleEl = convEl.querySelector('.title-text');
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
        return 'button[data-test-id="actions-menu-button"]';
    }

    /**
     * 第一步：从三个点按钮向上找到对话项 gem-nav-list-item，提取 URL 和标题
     */
    getConversationFromClickTarget(actionsBtn) {
        const conv = actionsBtn.closest('gem-nav-list-item');
        if (!conv) return null;

        const link = conv.querySelector('a[href]');
        if (!link) return null;

        const titleEl = conv.querySelector('.title-text');
        const title = titleEl ? titleEl.textContent.trim() : '';

        return { url: link.href, title };
    }

    findCurrentMenuOverlay() {
        // 精确定位对话操作菜单面板，取最新打开且已渲染出「分享」按钮（菜单已就绪）的那个，
        // 避免命中残留/动画中的旧浮层、tooltip 或只渲染了一半的菜单。
        const panels = document.querySelectorAll('.mat-mdc-menu-panel.conversation-actions-menu');
        for (let i = panels.length - 1; i >= 0; i--) {
            if (panels[i].querySelector('[data-test-id="share-button"]')) return panels[i];
        }
        return null;
    }

    /**
     * 覆写基类的 rAF 轮询，改用 MutationObserver 事件驱动注入。
     * 菜单面板可能分多帧渲染、旧面板延迟移除，轮询易产生竞态（漏插/错位/重复），
     * 监听浮层容器、待菜单就绪后再精确注入更稳定。
     */
    _pollAndInject(convInfo) {
        this._teardownMenuObserver();

        const tryInject = () => {
            const overlay = this.findCurrentMenuOverlay();
            if (!overlay) return false;
            if (overlay.querySelector(`[${BaseSidebarStarredAdapter.MARKER_ATTR}]`)) return true;

            const menuItem = this.createStarMenuItem(overlay, false);
            if (!menuItem) return false;

            menuItem.setAttribute('data-ait-conv-url', convInfo.url);
            menuItem.setAttribute('data-ait-conv-title', convInfo.title || '');
            menuItem.setAttribute('data-ait-conv-starred', 'false');

            const urlWithoutProtocol = convInfo.url.replace(/^https?:\/\//, '');
            const key = `chatTimelineStar:${urlWithoutProtocol}:-1`;
            StarStorageManager.findByKey(key).then(existing => {
                if (!existing) return;
                menuItem.setAttribute('data-ait-conv-starred', 'true');
                this.updateStarMenuItemState?.(menuItem, true);
            }).catch(() => {});
            return true;
        };

        if (tryInject()) return;

        const container = document.querySelector('.cdk-overlay-container') || document.body;
        this._menuObserver = new MutationObserver(() => { tryInject(); });
        this._menuObserver.observe(container, { childList: true, subtree: true });
        this._menuObserverTimer = setTimeout(() => this._teardownMenuObserver(), 3000);
    }

    _teardownMenuObserver() {
        if (this._menuObserver) { this._menuObserver.disconnect(); this._menuObserver = null; }
        if (this._menuObserverTimer) { clearTimeout(this._menuObserverTimer); this._menuObserverTimer = null; }
    }

    /**
     * 以「分享」菜单项为模板克隆，并固定插入到它后面（第二项）
     */
    createStarMenuItem(overlay, isStarred) {
        const shareBtn = overlay.querySelector('[data-test-id="share-button"]');
        const items = overlay.querySelectorAll('button[role="menuitem"]');
        const template = shareBtn || items[0];
        if (!template) return null;

        const menuItem = template.cloneNode(true);
        menuItem.setAttribute('data-ait-star-folder', 'true');
        menuItem.removeAttribute('data-test-id');
        menuItem.removeAttribute('jslog');

        const label = isStarred
            ? (chrome.i18n.getMessage('bpxjkw') || 'Unstar')
            : (chrome.i18n.getMessage('nativeMenuStarToFolder') || 'Star to Folder');
        const labelEl = menuItem.querySelector('.gem-menu-item-label');
        if (labelEl) {
            labelEl.textContent = label;
        } else {
            const spans = menuItem.querySelectorAll('span');
            if (spans.length > 0) spans[spans.length - 1].textContent = label;
            else menuItem.textContent = label;
        }

        const icon = menuItem.querySelector('mat-icon');
        if (icon) this._renderStarIcon(icon, isStarred);
        menuItem.style.color = isStarred ? '#ef4444' : '';

        const anchor = shareBtn && items.length > 0 ? shareBtn : null;
        if (anchor) {
            anchor.insertAdjacentElement('afterend', menuItem);
        } else {
            const container = template.parentElement;
            if (!container) return null;
            container.insertBefore(menuItem, container.firstChild);
        }
        return menuItem;
    }

    updateStarMenuItemState(menuItem, isStarred) {
        const label = isStarred
            ? (chrome.i18n.getMessage('bpxjkw') || 'Unstar')
            : (chrome.i18n.getMessage('nativeMenuStarToFolder') || 'Star to Folder');
        const labelEl = menuItem.querySelector('.gem-menu-item-label');
        if (labelEl) {
            labelEl.textContent = label;
        } else {
            const spans = menuItem.querySelectorAll('span');
            if (spans.length > 0) spans[spans.length - 1].textContent = label;
        }

        const icon = menuItem.querySelector('mat-icon');
        if (icon) this._renderStarIcon(icon, isStarred);
        menuItem.style.color = isStarred ? '#ef4444' : '';
    }

    /**
     * 用内联 SVG 星星替换菜单项图标。
     * Gemini 新版菜单图标改用 lumi-symbols ligature 字体，没有 star/star_border 字形，
     * 因此不再依赖 fonticon，直接注入 SVG，保证任何字体下都能正确显示。
     */
    _renderStarIcon(icon, isStarred) {
        icon.removeAttribute('fonticon');
        icon.removeAttribute('data-mat-icon-name');
        icon.classList.remove('lumi-symbols', 'mat-ligature-font', 'notranslate', 'mat-icon-no-color');
        const color = isStarred ? 'rgb(255, 125, 3)' : 'currentColor';
        const fill = isStarred ? color : 'none';
        icon.style.color = isStarred ? 'rgb(255, 125, 3)' : '';
        icon.textContent = '';
        icon.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="${fill}" stroke="${color}" stroke-width="2" stroke-linejoin="round" style="display:block"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;
    }

    closeNativeMenu() {
        const overlay = document.querySelector('.cdk-overlay-backdrop');
        if (overlay) {
            overlay.click();
        } else {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        }
    }
}
