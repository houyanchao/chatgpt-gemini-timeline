/**
 * Mirror Site Detector
 *
 * 页面初始化后，检测未知域名是否像某个内置 AI 平台的镜像站。
 * 命中后按平台 ID 存储域名：
 * {
 *   chatgpt: ['example.com', 'mirror.example.com'],
 *   gemini: ['gemini-mirror.example.com']
 * }
 */
(function () {
    'use strict';

    const STORAGE_KEY = 'mirrorSiteSourceDomain';
    const DETECT_TIMEOUT_MS = 10000;

    function getSiteInfo() {
        if (typeof getSiteInfoList === 'function') return getSiteInfoList();
        if (typeof SITE_INFO !== 'undefined' && Array.isArray(SITE_INFO)) return SITE_INFO;
        return [];
    }

    function normalizeDomain(value) {
        return String(value || '').trim().toLowerCase();
    }

    function getCurrentDomain() {
        return normalizeDomain(location.hostname);
    }

    function isBuiltInSite(domain) {
        const hostname = normalizeDomain(domain);
        if (!hostname) return false;

        return getSiteInfo().some(platform =>
            Array.isArray(platform.sites) &&
            platform.sites.some(site => {
                const builtInDomain = normalizeDomain(site);
                return builtInDomain && hostname === builtInDomain;
            })
        );
    }

    function getSmartInputAdapters() {
        try {
            if (window.smartEnterAdapterRegistry?.getAllAdapters) {
                return window.smartEnterAdapterRegistry.getAllAdapters();
            }
        } catch {
            // Ignore unavailable registry.
        }
        return [];
    }

    function findSourcePlatformByInput() {
        for (const adapter of getSmartInputAdapters()) {
            try {
                const selector = adapter.getInputSelector?.();
                const platformId = adapter.platformId;
                if (selector && platformId && document.querySelector(selector)) {
                    return platformId;
                }
            } catch {
                // Ignore invalid or unsupported selectors.
            }
        }
        return null;
    }

    async function getMirrorSiteMap() {
        if (typeof chrome === 'undefined' || !chrome.storage?.local) return {};
        const result = await chrome.storage.local.get(STORAGE_KEY);
        return result[STORAGE_KEY] && typeof result[STORAGE_KEY] === 'object'
            ? result[STORAGE_KEY]
            : {};
    }

    function isSavedMirrorDomain(map, domain) {
        const hostname = normalizeDomain(domain);
        if (!hostname || !map || typeof map !== 'object') return false;

        return Object.values(map).some(domains =>
            Array.isArray(domains) &&
            domains.some(saved => normalizeDomain(saved) === hostname)
        );
    }

    async function saveMirrorSiteDomain(platformId, domain, map) {
        if (!platformId || !domain) return;
        if (typeof chrome === 'undefined' || !chrome.storage?.local) return;

        const safeMap = map && typeof map === 'object' ? map : {};
        const domains = Array.isArray(safeMap[platformId]) ? safeMap[platformId] : [];
        if (!domains.includes(domain)) {
            safeMap[platformId] = [...domains, domain];
        }
        await chrome.storage.local.set({ [STORAGE_KEY]: safeMap });
    }

    async function detectAndSaveMirrorSite() {
        const domain = getCurrentDomain();
        if (!domain) return false;

        // 第一重判断：是否已存在于 getSiteInfoList（内置域名 + 已合并的镜像域名）
        if (isBuiltInSite(domain)) return true;

        // 第二重判断：是否已保存在 storage 的 mirrorSiteSourceDomain 中
        const map = await getMirrorSiteMap();
        if (isSavedMirrorDomain(map, domain)) return true;

        // 以上都判定为未知域名，才探测输入框以确定来源平台
        const platformId = findSourcePlatformByInput();
        if (!platformId) return false;

        await saveMirrorSiteDomain(platformId, domain, map);
        return true;
    }

    function initMirrorSiteDetector() {
        if (!document.body) return;

        detectAndSaveMirrorSite().then((matched) => {
            if (matched) return;

            const startedAt = Date.now();
            const observer = new MutationObserver(() => {
                if (Date.now() - startedAt > DETECT_TIMEOUT_MS) {
                    observer.disconnect();
                    return;
                }

                detectAndSaveMirrorSite().then((found) => {
                    if (found) observer.disconnect();
                });
            });

            observer.observe(document.body, { childList: true, subtree: true });
            setTimeout(() => observer.disconnect(), DETECT_TIMEOUT_MS);
        });
    }

    window.MirrorSiteDetector = {
        storageKey: STORAGE_KEY,
        isBuiltInSite,
        detectAndSave: detectAndSaveMirrorSite
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initMirrorSiteDetector, { once: true });
    } else {
        initMirrorSiteDetector();
    }
})();
