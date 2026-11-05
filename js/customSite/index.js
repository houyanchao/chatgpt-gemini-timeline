/**
 * Custom Site Entry Point
 *
 * 检测当前页面是否命中自定义时间轴适配站点，
 * 如果是，初始化浮窗按钮（提示词复制模式）。
 */

(function () {
    async function initCustomSite() {
        if (window._customSiteFloatButton) return;
        await TimelineI18n.ready();

        if (typeof loadCustomTimelineSiteDomains === 'function') {
            loadCustomTimelineSiteDomains();
        }

        if (typeof isCurrentCustomTimelineSite === 'function' && isCurrentCustomTimelineSite()) {
            if (window.AITContentSession?.active === false) return;
            const floatButton = new CustomSiteFloatButton();
            window.AITContentSession?.onStop(() => floatButton.destroy());
            await floatButton.init();
            window._customSiteFloatButton = floatButton;
        }
    }

    window.AITPlatformFeatures.register('custom-site', initCustomSite);
})();
