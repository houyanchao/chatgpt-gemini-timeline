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
    const INITIAL_DETECT_WINDOW_MS = 30000;
    const RETRY_DETECT_WINDOW_MS = 10000;
    const DETECT_INTERVAL_MS = 1000;
    const EDITOR_SELECTOR = 'textarea, input:not([type]), input[type="text"], input[type="search"], '
        + '[contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"], [role="textbox"]';

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
     * 优先使用从平台适配器构建出的轻量选择器，普通网页无需加载完整适配器。
     * 未使用分包构建的开发环境仍可从注册表读取。
     */
    function getQuestionNodeSelectors() {
        if (Array.isArray(globalThis.AITContentConfig?.platformSelectors)) {
            return globalThis.AITContentConfig.platformSelectors;
        }
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
        const matched = [...new Set(getQuestionNodeSelectors()
            .filter(entry => hasQuestionNode(entry.selector))
            .map(entry => entry.platformId))];

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

        let completed = false;
        let active = false;
        let finishing = false;
        let dirty = false;
        let generation = 0;
        let observer = null;
        let windowTimer = null;
        let checkTimer = null;
        let checkPromise = null;
        let lastCheckAt = -Infinity;
        const inputEvents = ['focusin', 'input', 'keydown', 'pointerdown'];

        function stopWindow() {
            generation++;
            active = false;
            finishing = false;
            dirty = false;
            clearTimeout(windowTimer);
            clearTimeout(checkTimer);
            windowTimer = checkTimer = null;
            observer?.disconnect();
            observer = null;
        }

        function complete() {
            completed = true;
            stopWindow();
            document.removeEventListener('visibilitychange', onVisibilityChange);
            for (const type of inputEvents) document.removeEventListener(type, onInputInteraction, true);
        }

        function scheduleCheck() {
            if (!active || completed || document.hidden || checkTimer !== null || checkPromise
                || (!dirty && !finishing)) return;
            // 固定最早执行时间，后续 DOM 变化不再推迟它，避免连续更新饿死检测。
            const delay = Math.max(0, DETECT_INTERVAL_MS - (performance.now() - lastCheckAt));
            checkTimer = setTimeout(runCheck, delay);
        }

        async function runCheck() {
            checkTimer = null;
            if (!active || completed || document.hidden) return;
            const currentGeneration = generation;
            const finalCheck = finishing;
            dirty = false;
            lastCheckAt = performance.now();
            checkPromise = detectAndSaveMirrorSiteGuarded();
            try {
                if (await checkPromise) complete();
            } catch {
                // 暂时读取失败仍保留本轮观察和后续交互重试的机会。
            } finally {
                checkPromise = null;
                if (!completed) {
                    // 后台暂停后可能已开启新一轮，旧任务不能关闭新观察窗口。
                    if (currentGeneration === generation && finalCheck) stopWindow();
                    else scheduleCheck();
                }
            }
        }

        function finishWindow() {
            windowTimer = null;
            observer?.disconnect();
            observer = null;
            finishing = true;
            clearTimeout(checkTimer);
            checkTimer = null;
            // 等正在进行的检查完成，再补一次新检查；仍遵守每秒最多一次。
            scheduleCheck();
        }

        function startWindow(duration) {
            if (completed || active || document.hidden) return;
            generation++;
            active = true;
            dirty = true;
            observer = new MutationObserver(() => {
                dirty = true;
                scheduleCheck();
            });
            // 先观察再检查，覆盖异步读取平台配置期间出现的提问节点。
            observer.observe(document.body, { childList: true, subtree: true });
            windowTimer = setTimeout(finishWindow, duration);
            scheduleCheck();
        }

        function onVisibilityChange() {
            if (document.hidden) stopWindow();
            else startWindow(RETRY_DETECT_WINDOW_MS);
        }

        function onInputInteraction(event) {
            if (completed || active || document.hidden) return;
            if (event.type === 'keydown' && event.key !== 'Enter') return;
            const target = event.target;
            // pointerdown 发生在输入框失焦前，也覆盖停留很久后点击发送的情况。
            const editor = target?.closest?.(EDITOR_SELECTOR)
                || (event.type === 'pointerdown' && target?.closest?.('button, [role="button"], input[type="submit"]')
                    && document.activeElement?.closest?.(EDITOR_SELECTOR));
            if (editor) startWindow(RETRY_DETECT_WINDOW_MS);
        }

        document.addEventListener('visibilitychange', onVisibilityChange);
        for (const type of inputEvents) {
            document.addEventListener(type, onInputInteraction, { capture: true, passive: true });
        }
        startWindow(INITIAL_DETECT_WINDOW_MS);
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
