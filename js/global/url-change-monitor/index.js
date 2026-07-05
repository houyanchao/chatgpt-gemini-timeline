/**
 * URL Change Monitor - 全局 URL 变化监控器
 *
 * 解决问题：
 * - 多个模块各自 monkey-patch history.pushState / replaceState
 * - 导致 history 方法被多层包装，且无法安全还原
 *
 * 解决方案：
 * - 只 patch 一次 history，状态变化时派发 url:change 事件
 * - 消费方通过 window.addEventListener 订阅
 * - 同时兼听 popstate / hashchange，并用 setInterval 兜底
 *
 * 使用示例：
 * ```javascript
 * // 监听 URL 变化
 * window.addEventListener('url:change', (e) => {
 *     log('URL changed:', e.detail.url);
 *     log('Previous URL:', e.detail.oldUrl);
 * });
 *
 * // 同步查询当前 URL
 * window.urlChangeMonitor.currentUrl;
 * ```
 */

class UrlChangeMonitor {
    static _instance = null;

    static getInstance() {
        if (!UrlChangeMonitor._instance) {
            UrlChangeMonitor._instance = new UrlChangeMonitor();
        }
        return UrlChangeMonitor._instance;
    }

    constructor() {
        if (UrlChangeMonitor._instance) {
            throw new Error('Use UrlChangeMonitor.getInstance() instead');
        }
        this._currentUrl = location.href;
        this._init();
    }

    /** 当前 URL */
    get currentUrl() {
        return this._currentUrl;
    }

    /** @private */
    _init() {
        const self = this;

        const check = () => {
            if (location.href !== self._currentUrl) {
                const oldUrl = self._currentUrl;
                self._currentUrl = location.href;
                self._dispatch(self._currentUrl, oldUrl);
            }
        };

        const origPush = history.pushState;
        const origReplace = history.replaceState;

        history.pushState = function (...args) {
            origPush.apply(this, args);
            setTimeout(check, 0);
        };

        history.replaceState = function (...args) {
            origReplace.apply(this, args);
            setTimeout(check, 0);
        };

        window.addEventListener('popstate', check);
        window.addEventListener('hashchange', check);

        // 兜底轮询：某些 SPA 框架可能绕过 history API
        setInterval(check, 2000);
    }

    /** @private */
    _dispatch(url, oldUrl) {
        try {
            window.dispatchEvent(new CustomEvent('url:change', {
                detail: { url, oldUrl }
            }));
        } catch (e) {
            // 静默处理
        }
    }
}

// ==================== 全局单例 ====================

if (typeof window.urlChangeMonitor === 'undefined') {
    window.urlChangeMonitor = UrlChangeMonitor.getInstance();
}
