/**
 * AIT Resource Loader
 *
 * 将体积较大的第三方库延迟到真正使用对应功能时再加载，避免每个页面
 * 都在 content script 初始化阶段解析这些资源。
 */
(function initAITResourceLoader() {
    'use strict';

    const bundles = Object.freeze({
        'runner-editor': {
            scripts: [
                'js/runner/codemirror/codemirror.min.js',
                'js/runner/codemirror/javascript.min.js',
                'js/runner/codemirror/xml.min.js',
                'js/runner/codemirror/css.min.js',
                'js/runner/codemirror/sql.min.js',
                'js/runner/codemirror/htmlmixed.min.js',
                'js/runner/codemirror/markdown.min.js'
            ]
        },
        'runner-markdown': {
            scripts: [
                'js/runner/libs/marked.min.js'
            ]
        },
        'runner-mermaid': {
            scripts: [
                'js/mermaid/lib/mermaid.min.js'
            ]
        },
        'export-mathjax': {
            scripts: [
                'js/conversationExport/libs/mathjax-config.js',
                'js/conversationExport/libs/mathjax-tex-svg.js'
            ]
        }
    });

    const scriptPromises = new Map();
    const bundlePromises = new Map();

    function getResourceUrl(path) {
        return chrome.runtime.getURL(path);
    }

    function loadScript(path) {
        if (!scriptPromises.has(path)) {
            const promise = import(getResourceUrl(path)).catch((error) => {
                scriptPromises.delete(path);
                throw error;
            });
            scriptPromises.set(path, promise);
        }
        return scriptPromises.get(path);
    }

    async function loadBundle(name) {
        const bundle = bundles[name];
        if (!bundle) {
            throw new Error(`Unknown resource bundle: ${name}`);
        }

        if (!bundlePromises.has(name)) {
            const promise = (async () => {
                for (const path of bundle.scripts || []) {
                    await loadScript(path);
                }
            })().catch((error) => {
                bundlePromises.delete(name);
                throw error;
            });
            bundlePromises.set(name, promise);
        }

        return bundlePromises.get(name);
    }

    window.AITResourceLoader = Object.freeze({
        load: loadBundle,
        isLoaded: (name) => bundlePromises.has(name)
    });
})();
