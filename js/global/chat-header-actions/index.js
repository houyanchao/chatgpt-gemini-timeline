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
        if (!shareButton) {
            // 新版分享按钮不再带 testid；只在对话路由中使用右侧原生操作区，
            // 避免匹配侧栏、消息中的分享按钮或首页工具栏。
            if (!/\/c\/[^/]+/.test(location.pathname)) return null;
            return document.querySelector('header [data-app-shell-header-obstacle] .gap-toolbar-action > button');
        }

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

        let container = document.querySelector(`.${CONTAINER_CLASS}`);
        if (!container) {
            container = document.createElement('div');
            container.className = CONTAINER_CLASS;
            container.style.cssText = `
                display: inline-flex;
                align-items: center;
                flex: 0 0 auto;
                gap: 0;
            `;
        }

        if (container.parentNode !== target.parentNode || container.nextSibling !== target) {
            target.parentNode.insertBefore(container, target);
        }

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
