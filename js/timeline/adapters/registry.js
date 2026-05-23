/**
 * Adapter Registry
 * 
 * Manages all site adapters and provides auto-detection.
 * 
 * Supports:
 * - 内置适配器（hard-coded built-in adapters）
 * - 用户自定义适配器（从 chrome.storage.local 动态加载）
 * 
 * 自定义适配器优先级高于内置适配器：
 * 如果用户为某个已支持的平台创建了自定义配置，自定义版本将覆盖内置版本。
 */

class SiteAdapterRegistry {
    constructor() {
        /** @type {SiteAdapter[]} 内置适配器列表 */
        this._builtinAdapters = [
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
        ];

        /** @type {CustomSiteAdapter[]} 用户自定义适配器列表 */
        this._customAdapters = [];

        /** @type {boolean} 自定义适配器是否已加载 */
        this._customLoaded = false;
    }

    /**
     * 获取所有适配器（自定义优先，内置其次）
     * 自定义适配器排前面，这样同域名下自定义覆盖内置
     * @returns {SiteAdapter[]}
     */
    get adapters() {
        return [...this._customAdapters, ...this._builtinAdapters];
    }

    /**
     * 从 chrome.storage.local 加载用户自定义适配器
     * 异步方法，应在页面初始化早期调用
     * @returns {Promise<void>}
     */
    async loadCustomAdapters() {
        if (this._customLoaded) return;

        try {
            const result = await chrome.storage.local.get('customTimelineAdapters');
            const configs = result.customTimelineAdapters || [];

            if (!Array.isArray(configs)) {
                console.warn('[SiteAdapterRegistry] Invalid customTimelineAdapters data, resetting');
                this._customAdapters = [];
                this._customLoaded = true;
                return;
            }

            // 过滤掉无效配置，构建 CustomSiteAdapter 实例
            this._customAdapters = configs
                .filter(cfg => this._validateConfig(cfg))
                .map(cfg => new CustomSiteAdapter(cfg));

            this._customLoaded = true;

            if (this._customAdapters.length > 0) {
                console.log(`[SiteAdapterRegistry] Loaded ${this._customAdapters.length} custom adapters:`,
                    this._customAdapters.map(a => a.name));
            }
        } catch (e) {
            console.error('[SiteAdapterRegistry] Failed to load custom adapters:', e);
            this._customAdapters = [];
            this._customLoaded = true;
        }
    }

    /**
     * 重新加载自定义适配器（配置变更后调用）
     * @returns {Promise<void>}
     */
    async reloadCustomAdapters() {
        this._customLoaded = false;
        this._customAdapters = [];
        await this.loadCustomAdapters();
    }

    /**
     * 验证自定义适配器配置是否有效
     * @param {Object} config - 用户配置
     * @returns {boolean}
     */
    _validateConfig(config) {
        if (!config || typeof config !== 'object') return false;
        // 必填字段检查
        if (!config.id) {
            console.warn('[SiteAdapterRegistry] Custom adapter missing "id", skipping');
            return false;
        }
        if (!config.hostname) {
            console.warn('[SiteAdapterRegistry] Custom adapter missing "hostname", skipping:', config.id);
            return false;
        }
        if (!config.userMessageSelector) {
            console.warn('[SiteAdapterRegistry] Custom adapter missing "userMessageSelector", skipping:', config.id);
            return false;
        }
        if (!config.conversationRoute) {
            console.warn('[SiteAdapterRegistry] Custom adapter missing "conversationRoute", skipping:', config.id);
            return false;
        }
        // conversationIdRegex 为可选字段，留空时 extractConversationId 返回 null，
        // 系统自动以完整 URL 作为存储 key，不影响时间轴核心功能
        return true;
    }

    /**
     * 检测并返回当前网站对应的适配器
     * 自定义适配器优先（排在前面），匹配到即返回
     * @returns {SiteAdapter|null}
     */
    detectAdapter() {
        const url = location.href;
        for (const adapter of this.adapters) {
            if (adapter.matches(url)) {
                return adapter;
            }
        }
        return null;
    }

    /**
     * 检查当前网站是否被支持
     * @returns {boolean}
     */
    isSupportedSite() {
        return this.detectAdapter() !== null;
    }

    /**
     * 获取当前适配器是否为自定义适配器
     * @param {SiteAdapter} adapter - 适配器实例
     * @returns {boolean}
     */
    isCustomAdapter(adapter) {
        return adapter instanceof CustomSiteAdapter;
    }
}