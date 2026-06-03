/**
 * Mirror Platform Detector
 *
 * Detects AI mirror sites by route shape and lets them reuse built-in adapters.
 * Custom site configs remain a separate fallback for non-mirror platforms.
 */
const MirrorPlatformDetector = {
    presets: [
        {
            platformId: 'chatgpt',
            routePattern: /^\/(?:c|share)\/[^/?#]+(?:[/?#].*)?$/i,
            adapterClassName: 'ChatGPTAdapter'
        }
    ],

    detectAdapter(url, builtInAdapters = []) {
        if (this._isBuiltInPlatformUrl(url)) return null;

        const pathname = this._getPathname(url);
        if (!pathname) return null;

        for (const preset of this.presets) {
            if (!preset.routePattern.test(pathname)) continue;

            const adapter = builtInAdapters.find(item => item?.constructor?.name === preset.adapterClassName);
            if (!adapter) continue;

            adapter.mirrorPlatformId = preset.platformId;
            adapter.isMirrorPlatform = true;
            return adapter;
        }

        return null;
    },

    _isBuiltInPlatformUrl(url) {
        if (typeof SITE_INFO === 'undefined') return false;

        try {
            const hostname = new URL(url).hostname;
            return SITE_INFO.some(platform => platform.sites.some(site => (
                hostname === site || hostname.endsWith(`.${site}`)
            )));
        } catch {
            return false;
        }
    },

    _getPathname(url) {
        try {
            return new URL(url).pathname;
        } catch {
            return location.pathname;
        }
    }
};

globalThis.MirrorPlatformDetector = MirrorPlatformDetector;
