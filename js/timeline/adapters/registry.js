/**
 * Adapter Registry
 * 
 * Manages all site adapters and provides auto-detection
 */

class SiteAdapterRegistry {
    constructor() {
        this.builtInAdapters = [
            new ChatGPTAdapter(),
            new GeminiAdapter(),
            new DoubaoAdapter(),
            new DeepSeekAdapter(),
            new YiyanAdapter(),
            new TongyiAdapter(),
            new QwenAdapter(),
            new KimiAdapter(),
            new YuanbaoAdapter(),
            new GrokAdapter(),
            new PerplexityAdapter(),
            new ClaudeAdapter(),
            new NotebookLMAdapter(),
            // Add more adapters here in the future
        ];
        this.customAdapters = [];
        this.adapters = [...this.builtInAdapters];
    }

    loadCustomAdapters() {
        try {
            const staticConfigs = Array.isArray(window.CUSTOM_SITE_INFO)
                ? window.CUSTOM_SITE_INFO
                : [];
            this.customAdapters = staticConfigs
                .filter(config => config?.enabled !== false && Array.isArray(config.sites) && config.sites.length > 0)
                .filter(config => !config.sites.some(site => this._isBuiltInSite(site)))
                .map(config => new CustomSiteAdapter(config));
        } catch {
            this.customAdapters = [];
        }
        this.adapters = [...this.builtInAdapters, ...this.customAdapters];
    }

    _isBuiltInSite(site) {
        if (!site || typeof SITE_INFO === 'undefined') return false;
        return SITE_INFO.some(platform => platform.sites.some(builtInSite => (
            site === builtInSite ||
            site.endsWith(`.${builtInSite}`) ||
            builtInSite.endsWith(`.${site}`)
        )));
    }

    /**
     * Detect and return the appropriate adapter for current site
     * @returns {SiteAdapter|null}
     */
    detectAdapter() {
        const url = location.href;
        for (const adapter of this.builtInAdapters) {
            if (adapter.matches(url)) {
                adapter.isMirrorPlatform = false;
                adapter.mirrorPlatformId = null;
                return adapter;
            }
        }

        const mirrorAdapter = window.MirrorPlatformDetector?.detectAdapter?.(url, this.builtInAdapters);
        if (mirrorAdapter) {
            return mirrorAdapter;
        }

        for (const adapter of this.customAdapters) {
            if (adapter.matches(url)) {
                return adapter;
            }
        }

        return null;
    }

    /**
     * Check if current site is supported
     * @returns {boolean}
     */
    isSupportedSite() {
        return this.detectAdapter() !== null;
    }
}
