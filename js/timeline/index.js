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
        console.error('[Timeline] Failed to check platform enabled:', e);
        return true; // 出错默认启用
    }
}

// Helper function: lightweight check if timeline can be initialized
async function canInitialize() {
    const adapter = await resolveCurrentAdapter();
    if (!adapter) return false;
    
    const selector = adapter.getUserMessageSelector();
    if (!selector) return false;
    return document.querySelector(selector) !== null;
}

// Initialize timeline with retry mechanism (exponential backoff)
async function initWithRetry(version, delays, retryIndex = 0) {
    // Check if we've exceeded max retries
    if (retryIndex >= delays.length) {
        return;
    }
    
    // Wait for the specified delay
    await sleep(delays[retryIndex]);
    
    // Check if version is still current (user may have navigated away)
    if (version !== initVersion) {
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
    if (await canInitialize()) {
        // Yes! Initialize the timeline
        await initializeTimeline(version);
        return;
    }
    
    // No, retry with next delay
    await initWithRetry(version, delays, retryIndex + 1);
}

function attachRouteListenersOnce() {
    if (routeListenersAttached) return;
    routeListenersAttached = true;

    TimelineUtils.removeEventListenerSafe(window, 'url:change', handleUrlChange);
    try { window.addEventListener('url:change', handleUrlChange); } catch {}
}

function detachRouteListeners() {
    if (!routeListenersAttached) return;
    routeListenersAttached = false;

    TimelineUtils.removeEventListenerSafe(window, 'url:change', handleUrlChange);
}

function cleanupGlobalObservers() {
    // 取消 DOMObserverManager 订阅
    if (unsubscribePageObserver) {
        unsubscribePageObserver();
        unsubscribePageObserver = null;
    }
}

function destroyTimelineInstance() {
    if (timelineManagerInstance) {
        try { timelineManagerInstance.destroy(); } catch (e) { console.warn('[AIT] destroy error:', e); }
        timelineManagerInstance = null;
    }

    if (window.AIStateMonitor) {
        window.AIStateMonitor.getInstance().stop();
    }

    TimelineUtils.removeElementSafe(document.querySelector('.ait-chat-timeline-wrapper'));
    TimelineUtils.removeElementSafe(document.querySelector('.ait-timeline-star-chat-btn-native'));
    cleanupGlobalObservers();
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
        if (!adapter || version !== initVersion) {
            return false;
        }

        destroyTimelineInstance();

        const manager = new TimelineManager(adapter);
        timelineManagerInstance = manager;

        try {
            const initialized = await manager.init();
            if (!initialized || version !== initVersion || timelineManagerInstance !== manager) {
                try { manager.destroy(); } catch {}
                if (timelineManagerInstance === manager) {
                    timelineManagerInstance = null;
                }
                return false;
            }
        } catch (err) {
            console.error('[Timeline] Failed to initialize timeline:', err);
            if (timelineManagerInstance === manager) {
                timelineManagerInstance = null;
            }
            try { manager.destroy(); } catch {}
            return false;
        }

        // ✅ 启动 AI 状态监控（事件驱动，替代各模块的 setInterval 轮询）
        if (window.AIStateMonitor) {
            window.AIStateMonitor.getInstance().start(adapter);
        }
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
    // 检测 URL 是否变化
    if (location.href === currentUrl) return;

    // URL 变化确认，立即隐藏提问列表
    if (window.questionListPopup && window.questionListPopup.visible) {
        window.questionListPopup.hide();
    }

    currentUrl = location.href;
    initVersion++;
    currentAdapter = null;
    currentAdapter = await adapterRegistry.detectAdapter();

    // URL 变化了，先清理旧时间轴实例（内部会销毁 ChatTimeRecorder）
    destroyTimelineInstance();

    // 如果当前是对话 URL，重新初始化
    if (await isConversationRoute()) {
        const currentVersion = initVersion;
        void initWithRetry(currentVersion, TIMELINE_CONFIG.INIT_RETRY_DELAYS)
            .catch(e => console.error('[Timeline] Failed to init after URL change:', e));
    }
    // 如果不是对话 URL，只清理（上面已经做了）
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
                            initVersion++;
                            const currentVersion = initVersion;
                            void initWithRetry(currentVersion, TIMELINE_CONFIG.INIT_RETRY_DELAYS)
                                .catch(e => console.error('[Timeline] Failed to init after settings change:', e));
                        }
                    } else {
                        // 从启用到禁用：销毁时间轴
                        destroyTimelineInstance();
                    }
                }
            })().catch(e => console.error('[Timeline] Failed to handle platform settings change:', e));
        }
    });
}

async function bootstrapTimeline() {
    await adapterRegistry.loadCustomAdapters();

    // Check if current site is supported before initializing
    if (!(await adapterRegistry.isSupportedSite())) {
        return;
    }

    setupPlatformSettingsListener();
    currentAdapter = await adapterRegistry.detectAdapter();
    
    // ✅ 修复：先检查DOM中是否已存在用户消息（SPA路由切换场景）
    const checkAndInit = async () => {
        const adapter = await resolveCurrentAdapter();
        const selector = adapter ? adapter.getUserMessageSelector() : null;
        if (selector && document.querySelector(selector)) {
            if (await isConversationRoute()) {
                // Use retry mechanism for initial load as well
                initVersion++;
                const currentVersion = initVersion;
                void initWithRetry(currentVersion, TIMELINE_CONFIG.INIT_RETRY_DELAYS)
                    .catch(e => console.error('[Timeline] Failed to init during bootstrap:', e));
            }
            
            attachRouteListenersOnce();
            
            return true; // 已初始化
        }
        return false; // 未初始化
    };
    
    // ✅ 修复：立即检查一次（处理SPA路由切换到对话页的情况）
    // ✅ 异步检查平台是否启用
    const platformEnabled = await isPlatformEnabled();
    if (!platformEnabled) {
        return; // 当前平台未启用，不初始化
    }

    if (await checkAndInit()) {
        // 已经初始化成功，不需要observer
    } else {
        // 还没有用户消息，使用 DOMObserverManager 等待
        let unsubscribeInitial = null;
        if (window.DOMObserverManager) {
            unsubscribeInitial = window.DOMObserverManager.getInstance().subscribeBody('timeline-initial', {
                callback: () => {
                    void (async () => {
                        if (await checkAndInit()) {
                            // 初始化成功，取消订阅
                            if (unsubscribeInitial) {
                                unsubscribeInitial();
                                unsubscribeInitial = null;
                            }
                        }
                    })().catch(e => console.error('[Timeline] Failed to init from DOM observer:', e));
                },
                debounce: 150  // 150ms 防抖
            });
        }
    }
}

bootstrapTimeline().catch(e => console.error('[Timeline] Failed to bootstrap:', e));
