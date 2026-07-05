/**
 * LanguageDetector - 基于 Highlight.js 的代码语言检测器
 * 
 * 使用 Highlight.js 的 highlightAuto 功能自动检测代码语言
 * 语言配置来自全局 RUNNER_LANGUAGES（constants.js）
 */

(function() {
    'use strict';

    // 从全局配置获取 Highlight.js 语言列表
    function getHljsLangs() {
        return RUNNER_LANGUAGES.map(l => l.hljsLang);
    }

    // 从全局配置获取支持的语言 ID 列表
    function getSupportedLangs() {
        return RUNNER_LANGUAGES.map(l => l.id);
    }

    // 将 hljs 语言名称映射到我们的语言 ID
    function mapHljsToLangId(hljsLang) {
        const lang = RUNNER_LANGUAGES.find(l => l.hljsLang === hljsLang);
        return lang ? lang.id : null;
    }
    
    // 最低置信度阈值
    const MIN_RELEVANCE = 12;

    /**
     * 检测代码语言
     * @param {string} code - 代码文本
     * @returns {string|null} 语言 ID 或 null
     */
    function detectLanguage(code) {
        if (!code || typeof code !== 'string' || !code.trim()) {
            return null;
        }

        if (typeof hljs === 'undefined') {
            return null;
        }

        try {
            const hljsLangs = getHljsLangs();
            const result = hljs.highlightAuto(code, hljsLangs);
            
            if (result.relevance < MIN_RELEVANCE) {
                return null;
            }
            
            if (hljsLangs.includes(result.language)) {
                // 映射到我们的语言 ID
                return mapHljsToLangId(result.language);
            }
            
            return null;
        } catch (error) {
            return null;
        }
    }

    /**
     * 获取检测详情（用于调试）
     * @param {string} code - 代码文本
     * @returns {Object}
     */
    function detectWithDetails(code) {
        if (!code || typeof code !== 'string' || !code.trim()) {
            return { language: null, relevance: 0 };
        }

        if (typeof hljs === 'undefined') {
            return { language: null, relevance: 0, error: 'hljs not loaded' };
        }

        try {
            const hljsLangs = getHljsLangs();
            const result = hljs.highlightAuto(code, hljsLangs);
            const mapped = mapHljsToLangId(result.language);
            return {
                language: result.relevance >= MIN_RELEVANCE && hljsLangs.includes(result.language) 
                    ? mapped : null,
                relevance: result.relevance,
                secondBest: result.secondBest ? {
                    language: result.secondBest.language,
                    relevance: result.secondBest.relevance
                } : null
            };
        } catch (error) {
            return { language: null, relevance: 0, error: error.message };
        }
    }

    // 导出
    if (typeof window !== 'undefined') {
        window.LanguageDetector = {
            detect: detectLanguage,
            detectWithDetails: detectWithDetails,
            get supportedLanguages() {
                return getSupportedLangs();
            }
        };
    }

})();
