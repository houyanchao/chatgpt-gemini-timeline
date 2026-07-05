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
    const DETECT_DEBOUNCE_MS = 300;

    let _detectInFlight = false;

    async function getSiteInfo() {
        if (typeof getSiteInfoList === 'function') return await getSiteInfoList();
        if (typeof SITE_INFO !== 'undefined' && Array.isArray(SITE_INFO)) return SITE_INFO;
        return [];
    }

    function normalizeDomain(value) {
        return String(value || '').trim().toLowerCase();
    }

    function getCurrentDomain() {
        return normalizeDomain(location.hostname);
    }

    async function isBuiltInSite(domain) {
        const hostname = normalizeDomain(domain);
        if (!hostname) return false;

        const siteInfo = await getSiteInfo();
        return siteInfo.some(platform =>
            Array.isArray(platform.sites) &&
            platform.sites.some(site => {
                const builtInDomain = normalizeDomain(site);
                return builtInDomain && hostname === builtInDomain;
            })
        );
    }

    /**
     * 从全局站点适配器注册表取「平台 id → 提问节点选择器」。
     * 平台清单的唯一真源是 SiteAdapterRegistry，这里只消费，不再单独维护。
     * 自定义站点适配器没有 platformId，会被自动过滤。
     */
    function getQuestionNodeSelectors() {
        const adapters = window.siteAdapterRegistry?.getAllAdapters?.() || [];
        const selectors = [];
        for (const adapter of adapters) {
            try {
                const platformId = adapter?.platformId;
                const selector = adapter?.getUserMessageSelector?.();
                if (platformId && selector) {
                    selectors.push({ platformId, selector });
                }
            } catch {
                // 忽略无法提供提问节点选择器的适配器。
            }
        }
        return selectors;
    }

    function hasQuestionNode(selector) {
        if (!selector) return false;

        try {
            const nodes = document.querySelectorAll(selector);
            return Array.from(nodes).some(node => {
                if (!node?.isConnected) return false;
                const rect = node.getBoundingClientRect?.();
                if (rect && rect.width > 0 && rect.height > 0) return true;
                return !!(node.textContent || '').trim() || node.childElementCount > 0;
            });
        } catch {
            return false;
        }
    }

    function findSourcePlatformByQuestionNode() {
        const matched = getQuestionNodeSelectors()
            .filter(entry => hasQuestionNode(entry.selector))
            .map(entry => entry.platformId);

        // 仅当唯一一家命中时才可信；多家命中（选择器撞车）无法判定来源，返回 null。
        return matched.length === 1 ? matched[0] : null;
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
        if (await isBuiltInSite(domain)) return true;

        // 第二重判断：是否已保存在 storage 的 mirrorSiteSourceDomain 中
        const map = await getMirrorSiteMap();
        if (isSavedMirrorDomain(map, domain)) return true;

        // 以上都判定为未知域名，才探测页面提问节点以确定来源平台
        const platformId = findSourcePlatformByQuestionNode();
        if (!platformId) return false;

        await saveMirrorSiteDomain(platformId, domain, map);
        return true;
    }

    /**
     * 带 in-flight 守卫的检测：并发触发时跳过，避免重叠的 storage 读写。
     * @returns {Promise<boolean>}
     */
    async function detectAndSaveMirrorSiteGuarded() {
        if (_detectInFlight) return false;
        _detectInFlight = true;
        try {
            return await detectAndSaveMirrorSite();
        } finally {
            _detectInFlight = false;
        }
    }

    function initMirrorSiteDetector() {
        if (!document.body) return;

        detectAndSaveMirrorSiteGuarded().then((matched) => {
            if (matched) return;

            const startedAt = Date.now();
            let debounceTimer = null;
            let stopped = false;

            const observer = new MutationObserver(() => {
                if (stopped) return;
                if (Date.now() - startedAt > DETECT_TIMEOUT_MS) {
                    stop();
                    return;
                }

                // 防抖：DOM 高频变动时合并为一次检测
                if (debounceTimer) clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => {
                    debounceTimer = null;
                    detectAndSaveMirrorSiteGuarded()
                        .then((found) => {
                            if (found) stop();
                        })
                        .catch(error => void 0);
                }, DETECT_DEBOUNCE_MS);
            });

            function stop() {
                if (stopped) return;
                stopped = true;
                if (debounceTimer) clearTimeout(debounceTimer);
                observer.disconnect();
            }

            observer.observe(document.body, { childList: true, subtree: true });
            setTimeout(stop, DETECT_TIMEOUT_MS);
        }).catch(error => void 0);
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
