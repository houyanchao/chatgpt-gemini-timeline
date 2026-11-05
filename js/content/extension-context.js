/** Old content scripts can receive DOM events after their extension APIs are gone. */
(function () {
    'use strict';
    if (window.AITExtensionContext) return;

    // These are owned roots, not decorations on host inputs or native chat/menu items.
    // New independently mounted controls can declare data-ait-owned-ui.
    const ownedUI = [
        '[data-ait-owned-ui]', '[data-ait-star-folder]',
        '.smart-input-prompt-btn', '.smart-input-update-btn', '.custom-site-float-btn',
        '.ait-chat-timeline-wrapper', '.timeline-toggle-btn', '.timeline-starred-btn',
        '.ait-question-list-btn', '.ait-question-list-popup', '.ait-notepad-btn', '.ait-notepad-panel',
        '.timeline-tooltip-container', '.ait-timeline-star-chat-btn-native',
        '.ait-sidebar-starred', '.ait-conv-starred-icon', '[data-ait-starred-icon]',
        '.ait-chat-header-actions-native', '.folder-edit-modal-overlay', '.star-input-modal-overlay',
        '.ait-ce-export-btn-native', '.ce-export-overlay', '.ait-scroll-to-bottom-btn',
        '.ait-panel-modal', '.starred-platform-modal-overlay', '.prompt-modal-overlay',
        '.ait-cw-float', '.ait-mermaid-overlay', '.runner-mermaid-preview',
        '.runner-code-run-btn', '.runner-container', '.floating-runner-container', '.runner-panel',
        '.ait-quick-ask-btn', '.ait-highlight-standalone-btn', '.ait-hl-popover', '.formula-tooltip',
        '.global-input-modal-overlay', '.global-popconfirm-overlay', '.changelog-modal-overlay', '.ait-ai-complete-toast',
        '.mirror-site-wizard-shell', '.ait-detect-floater',
        '.ait-node-navigation-loading', '.ait-timeline-history-loading', '.ait-scroll-padding',
        '.timeline-tooltip-overlay', '.ait-global-toast', '.timeline-copy-feedback'
    ].join(',');
    const session = window.AITContentSession;
    let invalidated = false;
    let extensionUrl = '';
    try { extensionUrl = chrome.runtime.getURL(''); } catch {}

    session?.onStop(() => {
        invalidated = true;
        for (const element of document.querySelectorAll(ownedUI)) {
            if (session.owns(element)) element.remove();
        }
    });

    function invalidate() {
        if (invalidated) return;
        invalidated = true;
        // Stop the shared observer from starting more work in the old context.
        try { window.DOMObserverManager?._instance?.destroy(); } catch {}
    }

    function isActive() {
        if (invalidated) return false;
        try {
            // This check does not depend on the background worker being awake.
            if (chrome.runtime?.id && chrome.runtime.getManifest()) return true;
        } catch {}
        invalidate();
        return false;
    }

    function handleInvalidation(error) {
        if (!/extension context (?:has been )?invalidated/i.test(error?.message || String(error))) return false;
        invalidate();
        return true;
    }

    function intercept(event) {
        if (event.type === 'keydown' && !['Enter', ' ', 'Escape'].includes(event.key)) return;
        const path = event.composedPath();
        // Other sites have no ownership registry. Require an explicit extension marker there.
        if (!path.some(node => session
            ? session.owns(node) && node.matches?.(ownedUI)
            : node.hasAttribute?.('data-ait-owned-ui'))) return;

        if (isActive()) return;
        event.preventDefault();
        event.stopImmediatePropagation();
    }

    function onExtensionError(event) {
        const error = event.reason || event.error;
        // Handle only failures originating in this extension's own scripts.
        if (!extensionUrl || !String(error?.stack || event.filename || '').includes(extensionUrl)) return;
        if (handleInvalidation(error)) event.preventDefault();
    }

    window.AITExtensionContext = Object.freeze({ isActive, handleInvalidation, get invalidated() { return invalidated; } });
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click', 'contextmenu', 'keydown', 'beforeinput', 'change', 'submit']) {
        window.addEventListener(type, intercept, { capture: true });
    }
    window.addEventListener('error', onExtensionError);
    window.addEventListener('unhandledrejection', onExtensionError);
})();
