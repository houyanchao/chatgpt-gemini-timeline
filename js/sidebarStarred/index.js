/**
 * Sidebar Starred - Entry Point
 *
 * 功能入口：检测当前平台是否支持侧边栏收藏列表，
 * 然后以重试机制等待侧边栏 DOM 就绪后初始化 SidebarStarredManager。
 *
 * 生命周期：
 *   1. 平台检测（feature gate）
 *   2. 等待侧边栏 DOM 出现（retry）
 *   3. 初始化 Manager
 *   4. SPA 路由变化时由 Manager 内部的 reinjectTimer 自动处理
 */

(async function () {
    const RETRY_DELAYS = [800, 1000, 1500, 2000, 2000, 3000];

    let manager = null;
    let platform = null;
    let adapter = null;
    let initInFlight = false;
    let bootstrapInFlight = false;
    let settingsListenerAttached = false;

    async function resolveSupport() {
        platform = await getCurrentPlatform();
        if (!platform || platform.features?.sidebarStarred !== true) {
            platform = null;
            adapter = null;
            return false;
        }

        const registry = window.sidebarStarredAdapterRegistry;
        if (!registry) {
            adapter = null;
            return false;
        }

        adapter = await registry.getAdapter();
        return !!adapter;
    }

    // ==================== Init with retry ====================

    function canInject() {
        if (!adapter) return false;
        const info = adapter.findInsertionPoint();
        if (!info) return false;
        const { parent } = info;
        if (!parent || !parent.offsetParent || parent.offsetHeight <= 0) return false;
        return true;
    }

    async function initialize(retryIndex) {
        if (manager || initInFlight) return;
        initInFlight = true;
        try {
            await TimelineI18n.ready();

            if (!adapter) {
                if (!await resolveSupport()) return;
            }

            manager = new SidebarStarredManager(adapter);
            const ok = await manager.init();

            if (!ok) {
                manager.destroy();
                manager = null;
                if (retryIndex !== undefined) {
                    initWithRetry(retryIndex + 1);
                }
            }
        } catch (error) {
            destroyManager();
        } finally {
            initInFlight = false;
        }
    }

    function destroyManager() {
        if (manager) {
            manager.destroy();
            manager = null;
        }
    }

    function initWithRetry(retryIndex = 0) {
        if (retryIndex >= RETRY_DELAYS.length) return;

        setTimeout(async () => {
            try {
                if (!await resolveSupport()) return;
                if (canInject()) {
                    await initialize(retryIndex);
                } else {
                    initWithRetry(retryIndex + 1);
                }
            } catch (error) {
            }
        }, RETRY_DELAYS[retryIndex]);
    }

    // ==================== 监听开关变化 ====================

    function attachSettingsListener() {
        if (settingsListenerAttached) return;
        settingsListenerAttached = true;
        StorageAdapter.addChangeListener((changes, areaName) => {
            if (areaName !== 'local' || !changes.sidebarStarredPlatformSettings) return;
            if (!platform) return;
            const settings = changes.sidebarStarredPlatformSettings.newValue || {};
            const enabled = settings[platform.id] !== false;
            if (enabled && !manager) {
                if (canInject()) {
                    initialize(0);
                } else {
                    initWithRetry();
                }
            } else if (!enabled && manager) {
                destroyManager();
            }
        });
    }

    // ==================== Bootstrap ====================

    async function bootstrap() {
        if (manager || bootstrapInFlight) return;
        bootstrapInFlight = true;
        try {
            if (!await resolveSupport()) return;
            attachSettingsListener();

            const settings = await StorageAdapter.get('sidebarStarredPlatformSettings');
            if (settings && settings[platform.id] === false) return;

            if (canInject()) {
                await initialize(0);
            } else {
                initWithRetry();
            }
        } catch (error) {
        } finally {
            bootstrapInFlight = false;
        }
    }

    bootstrap();
})();
