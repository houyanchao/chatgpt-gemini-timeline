/**
 * Mirror Site Entry Point
 *
 * 检测当前页面是否命中自定义时间轴适配站点，
 * 如果是，初始化浮窗按钮（提示词复制模式）。
 */

(async function initMirrorSite() {
    if (typeof loadCustomTimelineSiteDomains === 'function') {
        loadCustomTimelineSiteDomains();
    }

    if (typeof isCurrentCustomTimelineSite === 'function' && isCurrentCustomTimelineSite()) {
        console.log('[MirrorSite] Detected custom timeline site, initializing float button');
        const floatButton = new MirrorSiteFloatButton();
        await floatButton.init();
        window._mirrorSiteFloatButton = floatButton;
    }
})();
