/**
 * Main Entry Point
 * 
 * Initializes the timeline extension and manages SPA navigation
 * 
 * Features:
 * - Site detection and adapter loading
 * - History API hooks for better SPA support
 * - Route change detection
 * - Timeline lifecycle management
 */

// --- Entry Point and SPA Navigation Handler ---
let timelineManagerInstance = null;
let currentUrl = location.href;
let initVersion = 0; // Version number for initialization, increments on URL change
let unsubscribePageObserver = null;  // DOMObserverManager 取消订阅函数
let unwatchGeneration = null;
let routeListenersAttached = false;
let settingsListenerAttached = false;
let adapterRegistry = new SiteAdapterRegistry();
let currentAdapter = null;
let timelineInitInFlight = null;
let timelineInitInFlightVersion = null;

// Check if current route is a conversation page (uses adapter)
async function resolveCurrentAdapter() {
    if (!currentAdapter) {
        currentAdapter = await adapterRegistry.detectAdapter();
    }
    return currentAdapter;
}

async function isConversationRoute(pathname = location.pathname) {
    const currentAdapter = await resolveCurrentAdapter();
    return currentAdapter ? currentAdapter.isConversationRoute(pathname) : false;
}

// Helper function: sleep for specified milliseconds
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Helper function: check if current platform is enabled
async function isPlatformEnabled() {
    try {
        const platform = await getCurrentPlatform();
        if (!platform) return true; // 未知平台，默认启用
        
        // ✅ 首先检查平台是否支持时间轴功能
        if (platform.features?.timeline !== true) {
            return false; // 平台不支持该功能
        }
        
        const result = await chrome.storage.local.get('timelinePlatformSettings');
        const settings = result.timelinePlatformSettings || {};
        
        // 默认启用（!== false）
        return settings[platform.id] !== false;
    } catch (e) {
        return true; // 出错默认启用
    }
}

// Helper function: lightweight check if timeline can be initialized
async function canInitialize() {
    const adapter = await resolveCurrentAdapter();
    if (!adapter) return false;
    
    adapter.prepareTimelineNodes?.({
        force: true,
        reason: 'initialization-check'
    });
    const selector = adapter.getUserMessageSelector();
    if (!selector) return false;
    if (adapter.filterTimelineUserElements) {
        return adapter.filterTimelineUserElements(Array.from(document.querySelectorAll(selector))).length > 0;
    }
    return document.querySelector(selector) !== null;
}

function isCurrentInitialization(version) {
    return version === initVersion && currentUrl === location.href && window.AITContentSession?.active !== false;
}

function waitForFirstMessage(version) {
    if (!isCurrentInitialization(version) || unsubscribePageObserver) return;
    const observerManager = window.DOMObserverManager?.getInstance();
    if (!observerManager) return;

    let checking = false;
    const check = async () => {
        if (checking || !isCurrentInitialization(version)) return;
        checking = true;
        try {
            if (await canInitialize() && await isPlatformEnabled() && isCurrentInitialization(version)) {
                await initializeTimeline(version);
            }
        } finally {
            checking = false;
        }
    };
    const onChange = () => void check().catch(() => {});
    const unsubscribeBody = observerManager.subscribeBody('timeline-first-message', {
        callback: onChange,
        debounce: 150,
        throttle: 150
    });
    const unsubscribeCapturedData = currentAdapter?.subscribeCapturedChatsDataUpdated?.(onChange);
    const attributes = currentAdapter?.getTimelineStructureAttributeFilter?.();
    const attributeObserver = attributes?.length ? new MutationObserver(onChange) : null;
    attributeObserver?.observe(document.body, { subtree: true, attributes: true, attributeFilter: attributes });
    unsubscribePageObserver = () => {
        unsubscribeBody();
        unsubscribeCapturedData?.();
        attributeObserver?.disconnect();
    };
    onChange();
}

// Retry while the route settles, then wait for messages without polling.
async function initWithRetry(version, delays, retryIndex = 0) {
    if (!isCurrentInitialization(version)) return;
    if (retryIndex >= delays.length) {
        waitForFirstMessage(version);
        return;
    }
    
    // Wait for the specified delay
    await sleep(delays[retryIndex]);
    
    // Check if version is still current (user may have navigated away)
    if (!isCurrentInitialization(version)) {
        return; // Version mismatch, cancel this retry
    }
    
    // Double-check we're still on a conversation route
    if (!(await isConversationRoute())) {
        return;
    }
    
    // ✅ 检查当前平台是否启用时间轴功能
    const platformEnabled = await isPlatformEnabled();
    if (!platformEnabled) {
        return; // 当前平台未启用，不初始化
    }
    
    // Lightweight check: can we initialize?
    if (await canInitialize() && await initializeTimeline(version)) return;
    
    // No, retry with next delay
    await initWithRetry(version, delays, retryIndex + 1);
}

function attachRouteListenersOnce() {
    if (routeListenersAttached) return;
    currentUrl = location.href;
    routeListenersAttached = true;

    TimelineUtils.removeEventListenerSafe(window, 'url:change', handleUrlChange);
    try { window.addEventListener('url:change', handleUrlChange); } catch {}
    window.navigation?.addEventListener('currententrychange', handleUrlChange);
}

function detachRouteListeners() {
    if (!routeListenersAttached) return;
    routeListenersAttached = false;

    TimelineUtils.removeEventListenerSafe(window, 'url:change', handleUrlChange);
    window.navigation?.removeEventListener('currententrychange', handleUrlChange);
}

function cleanupGlobalObservers() {
    // 取消 DOMObserverManager 订阅
    if (unsubscribePageObserver) {
        unsubscribePageObserver();
        unsubscribePageObserver = null;
    }
}

function destroyTimelineInstance({ keepPageObserver = false } = {}) {
    if (window.questionListPopup?.visible) window.questionListPopup.hide();

    if (timelineManagerInstance) {
        try { timelineManagerInstance.destroy(); } catch (e) { void 0; }
        timelineManagerInstance = null;
    }

    unwatchGeneration?.();
    unwatchGeneration = null;

    TimelineUtils.removeElementSafe(document.querySelector('.ait-chat-timeline-wrapper'));
    TimelineUtils.removeElementSafe(document.querySelector('.ait-timeline-star-chat-btn-native'));
    window.AITChatHeaderActions?.removeEmptyContainer?.();
    if (!keepPageObserver) cleanupGlobalObservers();
}

async function initializeTimeline(version = initVersion) {
    if (timelineInitInFlight) {
        if (timelineInitInFlightVersion === version) {
            return timelineInitInFlight;
        }
    }

    timelineInitInFlightVersion = version;
    timelineInitInFlight = (async () => {
        // Detect current site adapter
        const adapter = await resolveCurrentAdapter();
        if (!adapter || !isCurrentInitialization(version)) {
            return false;
        }

        destroyTimelineInstance({ keepPageObserver: true });

        const manager = new TimelineManager(adapter);
        timelineManagerInstance = manager;

        try {
            const initialized = await manager.init();
            if (!initialized || !isCurrentInitialization(version) || timelineManagerInstance !== manager) {
                try { manager.destroy(); } catch {}
                if (timelineManagerInstance === manager) {
                    timelineManagerInstance = null;
                }
                return false;
            }
        } catch (err) {
            if (timelineManagerInstance === manager) {
                timelineManagerInstance = null;
            }
            try { manager.destroy(); } catch {}
            return false;
        }

        cleanupGlobalObservers();

        // ✅ 启动 AI 状态监控（事件驱动，替代各模块的 setInterval 轮询）
        unwatchGeneration = window.AIStateMonitor?.getInstance().watch(adapter) ?? null;
        return true;
    })().finally(() => {
        if (timelineInitInFlightVersion === version) {
            timelineInitInFlight = null;
            timelineInitInFlightVersion = null;
        }
    });

    return timelineInitInFlight;
}

async function handleUrlChange() {
    const url = location.href;
    if (url === currentUrl) return;
    currentUrl = url;
    const version = ++initVersion;
    currentAdapter = null;
    destroyTimelineInstance();

    const adapter = await adapterRegistry.detectAdapter();
    if (version !== initVersion || url !== location.href) return;
    currentAdapter = adapter;
    if (adapter?.isConversationRoute(location.pathname)) {
        void initWithRetry(version, TIMELINE_CONFIG.INIT_RETRY_DELAYS)
            .catch(e => void 0);
    }
}

// ✅ 监听平台设置变化，动态启用/禁用时间轴
function setupPlatformSettingsListener() {
    if (settingsListenerAttached) return;
    settingsListenerAttached = true;

    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local') return;

        // 监听平台设置变化
        if (changes.timelinePlatformSettings) {
            void (async () => {
                const platform = await getCurrentPlatform();
                if (!platform) return;

                // ✅ 检查平台是否支持时间轴功能
                if (platform.features?.timeline !== true) {
                    return; // 平台不支持该功能，忽略
                }

                const oldSettings = changes.timelinePlatformSettings.oldValue || {};
                const newSettings = changes.timelinePlatformSettings.newValue || {};

                const wasEnabled = oldSettings[platform.id] !== false;
                const isEnabled = newSettings[platform.id] !== false;

                // 状态发生变化
                if (wasEnabled !== isEnabled) {
                    if (isEnabled) {
                        // 从禁用到启用：重新初始化时间轴
                        if (!timelineManagerInstance && await isConversationRoute()) {
                            cleanupGlobalObservers();
                            initVersion++;
                            const currentVersion = initVersion;
                            void initWithRetry(currentVersion, TIMELINE_CONFIG.INIT_RETRY_DELAYS)
                                .catch(e => void 0);
                        }
                    } else {
                        // 从启用到禁用：销毁时间轴
                        initVersion++;
                        destroyTimelineInstance();
                    }
                }
            })().catch(e => void 0);
        }
    });
}

async function bootstrapTimeline() {
    await TimelineI18n.ready();
    await adapterRegistry.loadCustomAdapters();

    // Check if current site is supported before initializing
    if (!(await adapterRegistry.isSupportedSite()) || window.AITContentSession?.active === false) {
        return;
    }

    currentAdapter = await adapterRegistry.detectAdapter();
    if (window.AITContentSession?.active === false) return;
    attachRouteListenersOnce();
    setupPlatformSettingsListener();

    const version = initVersion;
    if (!await isPlatformEnabled() || !isCurrentInitialization(version) || !await isConversationRoute()) return;
    if (await canInitialize()) {
        void initWithRetry(version, TIMELINE_CONFIG.INIT_RETRY_DELAYS).catch(() => {});
    } else {
        waitForFirstMessage(version);
    }
}

window.AITContentSession?.onStop(() => {
    initVersion++;
    detachRouteListeners();
    destroyTimelineInstance();
});
window.AITPlatformFeatures.register('timeline', bootstrapTimeline);
