/**
 * Adapter Registry
 * 
 * Manages all site adapters and provides auto-detection
 */

class SiteAdapterRegistry {
    constructor() {
        this.builtInAdapters = [];
        this.customAdapters = [];
        this._registerBuiltInAdapters();
        this.adapters = [...this.builtInAdapters];
    }

    /**
     * 注册单个内置适配器，并挂上 platformId（与 SITE_INFO 的 id 一致）。
     * 让外部（如镜像站检测）能统一拿到「平台 id → 适配器」，无需另维护一份平台清单。
     */
    _registerAdapter(platformId, adapter) {
        if (!platformId || !adapter) return;
        adapter.platformId = platformId;
        this.builtInAdapters.push(adapter);
    }

    /**
     * 注册所有内置适配器。
     * ✨ 新增平台只需在这里加一行，镜像站检测等消费方会自动覆盖。
     */
    _registerBuiltInAdapters() {
        this._registerAdapter('chatgpt', new ChatGPTAdapter());
        this._registerAdapter('gemini', new GeminiAdapter());
        this._registerAdapter('doubao', new DoubaoAdapter());
        this._registerAdapter('deepseek', new DeepSeekAdapter());
        this._registerAdapter('yiyan', new YiyanAdapter());
        this._registerAdapter('tongyi', new TongyiAdapter());
        this._registerAdapter('qwen', new QwenAdapter());
        this._registerAdapter('kimi', new KimiAdapter());
        this._registerAdapter('yuanbao', new YuanbaoAdapter());
        this._registerAdapter('grok', new GrokAdapter());
        this._registerAdapter('perplexity', new PerplexityAdapter());
        this._registerAdapter('claude', new ClaudeAdapter());
        this._registerAdapter('notebooklm', new NotebookLMAdapter());
    }

    async loadCustomAdapters() {
        try {
            const staticConfigs = Array.isArray(window.CUSTOM_SITE_INFO)
                ? window.CUSTOM_SITE_INFO
                : [];
            const builtInSiteList = typeof getSiteInfoList === 'function'
                ? await getSiteInfoList()
                : [];
            this.customAdapters = staticConfigs
                .filter(config => config?.enabled !== false && Array.isArray(config.sites) && config.sites.length > 0)
                .filter(config => !config.sites.some(site => this._isBuiltInSite(site, builtInSiteList)))
                .map(config => new CustomSiteAdapter(config));
        } catch {
            this.customAdapters = [];
        }
        this.adapters = [...this.builtInAdapters, ...this.customAdapters];
    }

    _isBuiltInSite(site, builtInSiteList) {
        if (!site || !Array.isArray(builtInSiteList)) return false;
        return builtInSiteList.some(platform => platform.sites.some(builtInSite => (
            site === builtInSite ||
            site.endsWith(`.${builtInSite}`) ||
            builtInSite.endsWith(`.${site}`)
        )));
    }

    /**
     * Detect and return the appropriate adapter for current site
     * @returns {Promise<SiteAdapter|null>}
     */
    async detectAdapter() {
        const url = location.href;
        for (const adapter of this.adapters) {
            if (await adapter.matches(url)) {
                return adapter;
            }
        }
        return null;
    }

    /**
     * Check if current site is supported
     * @returns {Promise<boolean>}
     */
    async isSupportedSite() {
        return (await this.detectAdapter()) !== null;
    }

    /**
     * 获取全部已注册适配器（含自定义站点适配器）。
     * 自定义站点适配器没有 platformId，消费方可据此过滤。
     * @returns {Array<SiteAdapter>}
     */
    getAllAdapters() {
        return [...this.adapters];
    }
}

// 全局只读单例：供镜像站检测等模块复用，避免重复 new 与重复维护平台清单。
// timeline/quickAsk 仍各自 new SiteAdapterRegistry()，互不影响。
if (typeof window.siteAdapterRegistry === 'undefined') {
    window.siteAdapterRegistry = new SiteAdapterRegistry();
}
