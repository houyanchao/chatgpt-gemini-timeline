/**
 * Custom Site Entry Point
 *
 * 检测当前页面是否命中自定义时间轴适配站点，
 * 如果是，初始化浮窗按钮（提示词复制模式）。
 */

(async function initCustomSite() {
    await TimelineI18n.ready();

    if (typeof loadCustomTimelineSiteDomains === 'function') {
        loadCustomTimelineSiteDomains();
    }

    if (typeof isCurrentCustomTimelineSite === 'function' && isCurrentCustomTimelineSite()) {
        console.log('[CustomSite] Detected custom timeline site, initializing float button');
        const floatButton = new CustomSiteFloatButton();
        await floatButton.init();
        window._customSiteFloatButton = floatButton;
    }
})();
