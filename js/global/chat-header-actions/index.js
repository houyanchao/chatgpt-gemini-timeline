/**
 * ChatGPT 顶部操作区共享容器。
 * 收藏和对话导出分别管理自己的按钮，这里只统一原生锚点、排列和位置校正。
 * 另提供顶栏按钮「仅图标 / 图标+文字」的平台级约定，供两个模块共用。
 */
(function initChatHeaderActions() {
    'use strict';

    if (window.AITChatHeaderActions) return;

    const CONTAINER_CLASS = 'ait-chat-header-actions-native';
    const ACTION_ORDER = {
        star: 10,
        export: 20,
    };

    /**
     * 顶栏收藏/导出按钮只显示图标、不显示文字的平台。
     * 这些平台原生顶栏本身就是纯图标按钮，加文字会显得突兀。
     */
    const ICON_ONLY_PLATFORMS = new Set(['chatgpt', 'gemini']);

    /**
     * 顶栏按钮是否显示文字标签
     * @param {string|undefined} platformId
     * @returns {boolean}
     */
    function shouldShowLabel(platformId) {
        return !ICON_ONLY_PLATFORMS.has(platformId);
    }

    function getInsertTarget() {
        const shareButton = document.querySelector('[data-testid="share-chat-button"]');
        if (!shareButton) return window.AITChatGPTEntryRollout?.header() || null;

        let actionBar = shareButton.parentElement;
        for (let depth = 0; actionBar && depth < 6; depth++) {
            if (getComputedStyle(actionBar).display === 'flex') {
                let target = shareButton;
                while (target.parentElement && target.parentElement !== actionBar) {
                    target = target.parentElement;
                }
                if (target.parentElement === actionBar) return target;
                break;
            }
            actionBar = actionBar.parentElement;
        }

        return shareButton;
    }

    function ensureContainer() {
        const target = getInsertTarget();
        if (!target?.parentNode) return null;
        const directHeader = target.matches('header, [role="banner"]');
        const parent = directHeader ? target : target.parentNode;

        let container = document.querySelector(`.${CONTAINER_CLASS}`);
        if (!container) {
            container = document.createElement('div');
            container.className = CONTAINER_CLASS;
            container.style.cssText = `
                display: inline-flex;
                align-items: center;
                flex: 0 0 auto;
                gap: 0;
                ${directHeader ? 'margin-left: auto;' : ''}
            `;
        }

        container.style.marginLeft = directHeader ? 'auto' : '';
        if (container.parentNode !== parent || (!directHeader && container.nextSibling !== target) ||
            (directHeader && container !== parent.lastElementChild)) {
            parent.insertBefore(container, directHeader ? null : target);
        }

        window.AITGPTDiagnostics?.log('entry.header-container', { mounted: container.isConnected,
            directHeader, actions: container.childElementCount });
        return container;
    }

    function mount(button, actionId) {
        if (!button) return false;

        const container = ensureContainer();
        if (!container) return false;

        button.dataset.aitHeaderAction = actionId;
        const order = ACTION_ORDER[actionId] ?? Number.MAX_SAFE_INTEGER;
        const nextButton = Array.from(container.children).find(child => {
            const childOrder = ACTION_ORDER[child.dataset.aitHeaderAction] ?? Number.MAX_SAFE_INTEGER;
            return childOrder > order;
        });
        container.insertBefore(button, nextButton || null);
        return true;
    }

    function removeEmptyContainer() {
        const container = document.querySelector(`.${CONTAINER_CLASS}`);
        if (container && container.childElementCount === 0) {
            container.remove();
        }
    }

    window.AITChatHeaderActions = {
        getInsertTarget,
        ensureContainer,
        mount,
        removeEmptyContainer,
        shouldShowLabel,
    };
})();
