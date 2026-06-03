/**
 * Smart Enter Adapter Registry
 * 
 * 适配器注册表，管理所有平台适配器
 */

class SmartEnterAdapterRegistry {
    constructor() {
        this.adapters = [];
        this._registerAdapters();
    }

    _registerAdapter(platformId, adapter) {
        if (!adapter) return;
        adapter.platformId = platformId;
        this.adapters.push(adapter);
    }
    
    /**
     * 注册所有适配器
     */
    _registerAdapters() {
        // 注册 ChatGPT 适配器
        if (typeof ChatGPTSmartEnterAdapter !== 'undefined') {
            this._registerAdapter('chatgpt', new ChatGPTSmartEnterAdapter());
        }
        
        // 注册 Gemini 适配器
        if (typeof GeminiSmartEnterAdapter !== 'undefined') {
            this._registerAdapter('gemini', new GeminiSmartEnterAdapter());
        }
        
        // 注册 DeepSeek 适配器
        if (typeof DeepSeekSmartEnterAdapter !== 'undefined') {
            this._registerAdapter('deepseek', new DeepSeekSmartEnterAdapter());
        }
        
        // 注册 Kimi 适配器
        if (typeof KimiSmartEnterAdapter !== 'undefined') {
            this._registerAdapter('kimi', new KimiSmartEnterAdapter());
        }
        
        // 注册 Perplexity 适配器
        if (typeof PerplexitySmartEnterAdapter !== 'undefined') {
            this._registerAdapter('perplexity', new PerplexitySmartEnterAdapter());
        }
        
        // 注册通义千问适配器
        if (typeof TongyiSmartEnterAdapter !== 'undefined') {
            this._registerAdapter('tongyi', new TongyiSmartEnterAdapter());
        }
        
        // 注册千问国际版适配器
        if (typeof QwenSmartEnterAdapter !== 'undefined') {
            this._registerAdapter('qwen', new QwenSmartEnterAdapter());
        }
        
        // 注册 Grok 适配器
        if (typeof GrokSmartEnterAdapter !== 'undefined') {
            this._registerAdapter('grok', new GrokSmartEnterAdapter());
        }
        
        // 注册豆包适配器
        if (typeof DoubaoSmartEnterAdapter !== 'undefined') {
            this._registerAdapter('doubao', new DoubaoSmartEnterAdapter());
        }
        
        // 注册 Claude 适配器
        if (typeof ClaudeSmartEnterAdapter !== 'undefined') {
            this._registerAdapter('claude', new ClaudeSmartEnterAdapter());
        }
        
        // 注册元宝适配器
        if (typeof YuanbaoSmartEnterAdapter !== 'undefined') {
            this._registerAdapter('yuanbao', new YuanbaoSmartEnterAdapter());
        }
        
        // 注册 NotebookLM 适配器
        if (typeof NotebookLMSmartEnterAdapter !== 'undefined') {
            this._registerAdapter('notebooklm', new NotebookLMSmartEnterAdapter());
        }
    }
    
    /**
     * 获取当前页面匹配的适配器
     * @returns {BaseSmartEnterAdapter|null}
     */
    getAdapter() {
        for (const adapter of this.adapters) {
            try {
                if (adapter.matches()) {
                    return adapter;
                }
            } catch (e) {
                console.error('[SmartEnterRegistry] Adapter check failed:', e);
            }
        }
        return null;
    }
    
    /**
     * 获取所有已注册的适配器
     * @returns {Array<BaseSmartEnterAdapter>}
     */
    getAllAdapters() {
        return [...this.adapters];
    }
}

// 创建全局注册表实例
if (typeof window.smartEnterAdapterRegistry === 'undefined') {
    window.smartEnterAdapterRegistry = new SmartEnterAdapterRegistry();
}
