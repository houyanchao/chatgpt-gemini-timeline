/**
 * Shared AI reply completion toast.
 * Used by both the real completion reminder and settings preview.
 */
(function() {
    const ANCHOR_CLASS = 'ait-timeline-ai-complete-toast-anchor';
    const TOAST_CLASS = 'ait-ai-complete-toast';

    const getMessage = (platformName = 'AI') => {
        return TimelineI18n.getMessage('timelineAICompleteNotLatestToast', platformName) ||
            `${platformName} 回复已完成`;
    };

    const getAnchor = () => {
        const existingAnchor = document.querySelector(`.${ANCHOR_CLASS}`);
        if (existingAnchor?.isConnected) {
            return existingAnchor;
        }

        const anchor = document.createElement('div');
        anchor.className = ANCHOR_CLASS;
        anchor.style.cssText = [
            'position: fixed',
            'top: 72px',
            'right: 26px',
            'width: 1px',
            'height: 1px',
            'pointer-events: none',
            'z-index: 2147483647'
        ].join(';');
        document.body.appendChild(anchor);
        return anchor;
    };

    const getOptions = () => ({
        duration: 3500,
        iconType: 'check',
        color: false,
        className: TOAST_CLASS,
        useClassStyles: true,
        position: 'left',
        gap: 10
    });

    const show = (platformName = 'AI') => {
        if (!window.globalToastManager) return false;

        window.globalToastManager.info(getMessage(platformName), getAnchor(), getOptions());
        return true;
    };

    const removeAnchor = () => {
        document.querySelectorAll(`.${ANCHOR_CLASS}`).forEach(anchor => anchor.remove());
    };

    window.AICompleteReminderToast = {
        show,
        getAnchor,
        getMessage,
        getOptions,
        removeAnchor
    };
})();
