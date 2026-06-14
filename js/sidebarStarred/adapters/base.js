/**
 * Base Sidebar Starred Adapter
 *
 * 侧边栏收藏列表适配器基类。
 * 每个 AI 平台的侧边栏 DOM 结构不同，需要平台适配器提供：
 *   - 侧边栏容器定位
 *   - 收藏区域插入点
 *   - 平台专属样式类名
 *
 * 原生菜单注入（可选）：
 *   平台适配器覆盖 getMenuObserveTarget / getClickDelegateSelector /
 *   getConversationFromClickTarget / findMenuOverlay / createStarMenuItem
 *   即可在原生 3 个点菜单中注入「收藏到文件夹」选项。
 *   通用流程（事件委托、Observer、收藏逻辑）由基类统一实现。
 */

class BaseSidebarStarredAdapter {

    static MARKER_ATTR = 'data-ait-star-folder';
    static TRACKED_EXPIRE_MS = 3000;

    constructor() {
        this._menuObserver = null;
        this._trackedConv = null;
        this._trackedAt = 0;
        this._menuFolderManager = null;
        this._menuInited = false;
    }

    // ==================== 必须实现 ====================

    matches() {
        throw new Error('BaseSidebarStarredAdapter.matches() must be implemented');
    }

    findSidebarContainer() {
        throw new Error('BaseSidebarStarredAdapter.findSidebarContainer() must be implemented');
    }

    findInsertionPoint() {
        throw new Error('BaseSidebarStarredAdapter.findInsertionPoint() must be implemented');
    }

    // ==================== 可选覆盖 ====================

    getPlatformClass() { return ''; }

    getMaxVisibleItems() { return 20; }

    navigateToConversation(url) { return false; }

    getName() {
        return this.constructor.name.replace('SidebarStarredAdapter', '');
    }

    // ==================== 原生菜单注入（平台覆盖） ====================

    /** 事件委托选择器：三个点操作按钮容器 */
    getClickDelegateSelector() { return ''; }

    /** 从委托匹配元素中提取对话 { url, title } */
    getConversationFromClickTarget(matchedEl) { return null; }

    /** 从当前 DOM 中查找活跃的菜单弹出层 */
    findCurrentMenuOverlay() { return null; }

    /** 在弹出层中创建收藏菜单项，isStarred 表示该对话是否已收藏 */
    createStarMenuItem(overlay, isStarred) { return null; }

    /** 异步更新已注入菜单项的收藏状态（文字 + 图标） */
    updateStarMenuItemState(menuItem, isStarred) {}

    /** 关闭原生菜单 */
    closeNativeMenu() {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    }

    // ==================== 侧边栏收藏标记（平台覆盖） ====================

    /** 获取侧边栏中所有对话项元素 */
    getConversationElements() { return []; }

    /** 从对话项元素中提取 URL pathname（用于匹配收藏） */
    getConversationUrlPath(convEl) { return ''; }

    /** 在对话项上注入收藏 icon */
    injectStarIcon(convEl) {}

    /** 从对话项上移除收藏 icon */
    removeStarIcon(convEl) {}

    // ==================== 原生菜单注入（基类通用逻辑） ====================

    /**
     * 初始化原生菜单注入（由 SidebarStarredManager 调用）
     * @param {Object} folderManager - FolderManager 实例
     */
    initNativeMenu(folderManager) {
        if (this._menuInited) return;
        this._menuFolderManager = folderManager;
        this._menuInited = true;

        const selector = this.getClickDelegateSelector();
        if (selector) {
            window.eventDelegateManager?.on('pointerdown', selector, (e, matchedEl) => {
                const info = this.getConversationFromClickTarget(matchedEl);
                if (info) {
                    this._trackedConv = info;
                    this._trackedAt = Date.now();
                    this._pollAndInject(info);
                }
            });
        }

        window.eventDelegateManager?.on('pointerup', `[${BaseSidebarStarredAdapter.MARKER_ATTR}]`, (e, matchedEl) => {
            e.preventDefault();
            e.stopPropagation();
            const url = matchedEl.getAttribute('data-ait-conv-url');
            const title = matchedEl.getAttribute('data-ait-conv-title');
            if (!url) return;
            this.closeNativeMenu();
            const isStarred = matchedEl.getAttribute('data-ait-conv-starred') === 'true';
            setTimeout(() => isStarred ? this._unstarConv({ url }) : this._starToFolder({ url, title }), 150);
        });
    }

    destroyNativeMenu() {
        if (!this._menuInited) return;
        this._menuInited = false;
        const selector = this.getClickDelegateSelector();
        if (selector) window.eventDelegateManager?.off('pointerdown', selector);
        window.eventDelegateManager?.off('pointerup', `[${BaseSidebarStarredAdapter.MARKER_ATTR}]`);
        this._trackedConv = null;
        this._menuFolderManager = null;
    }

    _pollAndInject(convInfo, attempt = 0) {
        if (attempt >= 10) return;
        requestAnimationFrame(() => {
            const overlay = this.findCurrentMenuOverlay();
            if (!overlay) { this._pollAndInject(convInfo, attempt + 1); return; }
            if (overlay.querySelector(`[${BaseSidebarStarredAdapter.MARKER_ATTR}]`)) return;

            const menuItem = this.createStarMenuItem(overlay, false);
            if (!menuItem) { this._pollAndInject(convInfo, attempt + 1); return; }

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
        });
    }

    // ==================== 侧边栏收藏标记（基类通用逻辑） ====================

    static STAR_ICON_ATTR = 'data-ait-starred-icon';
    static HIDDEN_ATTR = 'data-ait-hidden';

    /** 获取需要隐藏/显示的目标元素（平台可覆盖，例如需要隐藏父级 li） */
    getHideTarget(convEl) { return convEl; }

    async refreshStarredIcons() {
        const [items, shouldHide] = await Promise.all([
            StarStorageManager.getAll(),
            StorageAdapter.get('hideStarredFromNativeList'),
        ]);
        const starredPaths = new Set();
        for (const item of items) {
            if (item.index !== -1) continue;
            if (!item.url && !item.urlWithoutProtocol) continue;
            try {
                const url = item.url || `https://${item.urlWithoutProtocol}`;
                starredPaths.add(new URL(url).pathname);
            } catch { /* ignore */ }
        }

        const convEls = this.getConversationElements();
        for (const el of convEls) {
            const path = this.getConversationUrlPath(el);
            const isStarred = path && starredPaths.has(path);
            const hasIcon = !!el.querySelector(`[${BaseSidebarStarredAdapter.STAR_ICON_ATTR}]`);
            if (isStarred) {
                if (!hasIcon) this.injectStarIcon(el);
            } else {
                if (hasIcon) this.removeStarIcon(el);
            }

            const hideTarget = this.getHideTarget(el);
            if (isStarred && shouldHide) {
                hideTarget.setAttribute(BaseSidebarStarredAdapter.HIDDEN_ATTR, '');
                hideTarget.style.display = 'none';
            } else if (hideTarget.hasAttribute(BaseSidebarStarredAdapter.HIDDEN_ATTR)) {
                hideTarget.removeAttribute(BaseSidebarStarredAdapter.HIDDEN_ATTR);
                hideTarget.style.display = '';
            }
        }
    }

    async _unstarConv(convInfo) {
        try {
            const urlWithoutProtocol = convInfo.url.replace(/^https?:\/\//, '');
            const key = `chatTimelineStar:${urlWithoutProtocol}:-1`;
            await StarStorageManager.remove(key);
            window.globalToastManager?.success(TimelineI18n.getMessage('pzmvkx') || 'Unstarred');
        } catch (err) {
            console.error('[SidebarStarredAdapter] Unstar failed:', err);
        }
    }

    async _starToFolder(convInfo) {
        try {
            const urlWithoutProtocol = convInfo.url.replace(/^https?:\/\//, '');
            const key = `chatTimelineStar:${urlWithoutProtocol}:-1`;

            const existing = await StarStorageManager.findByKey(key);
            if (existing) {
                window.globalToastManager?.info(TimelineI18n.getMessage('nativeMenuAlreadyStarred') || 'Already starred');
                return;
            }

            if (!window.starInputModal || !this._menuFolderManager) return;

            const result = await window.starInputModal.show({
                title: TimelineI18n.getMessage('zmvkpx'),
                defaultValue: convInfo.title || '',
                folderManager: this._menuFolderManager,
                defaultFolderId: null
            });
            if (!result) return;

            const question = (result.value || '').substring(0, 100);
            await StarStorageManager.add({
                key, url: convInfo.url, urlWithoutProtocol,
                index: -1, question,
                timestamp: Date.now(),
                folderId: result.folderId || null
            });

            window.globalToastManager?.success(TimelineI18n.getMessage('nativeMenuStarSuccess') || 'Starred');
        } catch (err) {
            console.error('[SidebarStarredAdapter] Star failed:', err);
        }
    }
}
