/**
 * Mirror Site Utils
 *
 * 自定义站点检测工具：加载自定义时间轴适配配置，判断当前页面是否命中。
 */

let _customTimelineSiteDomains = null;

function loadCustomTimelineSiteDomains() {
    try {
        const staticConfigs = Array.isArray(window.CUSTOM_SITE_INFO)
            ? window.CUSTOM_SITE_INFO
            : [];
        const domains = staticConfigs
            .filter(config => config?.enabled !== false && Array.isArray(config.sites))
            .flatMap(config => config.sites)
            .map(site => String(site || '').trim().toLowerCase())
            .filter(Boolean);
        _customTimelineSiteDomains = [...new Set(domains)];
    } catch (e) {
        _customTimelineSiteDomains = [];
    }
}

function isCustomTimelineSite(url) {
    if (!_customTimelineSiteDomains || _customTimelineSiteDomains.length === 0) return false;

    try {
        const hostname = new URL(url).hostname.toLowerCase();
        return _customTimelineSiteDomains.some(domain =>
            hostname === domain || hostname.endsWith('.' + domain)
        );
    } catch {
        return false;
    }
}

function isCurrentCustomTimelineSite() {
    return isCustomTimelineSite(location.href);
}
