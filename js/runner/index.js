/**
 * Runner - 代码块运行器
 * 
 * 检测页面中的代码块，为 JavaScript 代码块添加运行按钮
 * 完全独立运行，不依赖时间轴功能
 * 支持多平台：ChatGPT、Gemini、Claude、DeepSeek、豆包等
 */

(function() {
    'use strict';

    // ===== 安全的 i18n 调用 =====
    function safeI18n(key, fallback = '') {
        try {
            return TimelineI18n.getMessage(key) || fallback;
        } catch (e) {
            // 扩展上下文失效时返回默认值
            return fallback;
        }
    }

    // ===== 配置区域 =====
    
    const CONFIG = {
        // DOM 稳定延迟（500ms 内无 DOM 变化视为稳定，执行扫描）
        stableDelay: 500,
        // 已处理标记
        processedAttr: 'data-runner-initialized',
        
        // ===== 高度配置 =====
        headerHeight: 36,              // header 高度
        resizerHeight: 4,              // 分隔条高度
        outputContentHeight: 150,      // output 内容区默认高度
        
        // 调整限制
        outputContentMinHeight: 50,    // output 内容区最小高度
        codeMinHeight: 100             // 代码区最小高度
    };

    // 代码块配置（按优先级排序，特殊规则在前，通用规则在后）
    // top/right: Run 按钮相对于布局容器的偏移量（可选，默认 0）
    const CODE_BLOCK_CONFIGS = [
        { 
            codeSelector: 'code-block code',  // Gemini
            layoutSelector: 'code-block',
            useFloatingPanel: true
        },
        { 
            codeSelector: '.md-code-block pre',  // DeepSeek
            layoutSelector: '.md-code-block',
            useFloatingPanel: true
        },
        { 
            codeSelector: '[class*="code-area-"] code',  // 豆包
            layoutSelector: '[class*="code-area-"]',
            useFloatingPanel: true
        },
        { 
            codeSelector: '.cnblogs_code pre',  // 博客园
            layoutSelector: '.cnblogs_code',
            useFloatingPanel: true
        },
        { 
            codeSelector: '.CodeMirror pre',        // 阿里云社区（通义千问）
            layoutSelector: '.CodeMirror',
            useFloatingPanel: true
        },
        { 
            codeSelector: 'pre code',         // 通用（ChatGPT, Claude, Kimi...）
            layoutSelector: 'pre',
            useFloatingPanel: true
        },
    ];

    // ===== 状态变量 =====
    
    let runnerManagerInstance = null;
    let unsubscribeObserver = null;  // DOMObserverManager 取消订阅函数
    let initialized = false;
    let initInFlight = false;

    // ===== 工具函数 =====

    /**
     * 获取 RunnerManager 实例
     */
    function getRunnerManager() {
        if (!runnerManagerInstance) {
            runnerManagerInstance = new window.RunnerManager();
        }
        return runnerManagerInstance;
    }

    /**
     * 检测代码语言类型（使用 Highlight.js）
     * @param {string} code - 代码文本
     * @returns {string|null} 'javascript' | 'typescript' | 'sql' | null
     */
    function detectLanguage(code) {
        if (!window.LanguageDetector) {
            return null;
        }
        return window.LanguageDetector.detect(code);
    }

    /**
     * 获取代码块的代码文本
     * @param {HTMLElement} codeElement - code 元素
     * @returns {string}
     */
    function getCodeText(codeElement) {
        return (codeElement.textContent || '').replace(/\u00A0/g, ' ');
    }

    /**
     * HTML 转义
     * @param {string} str - 字符串
     * @returns {string}
     */
    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    /**
     * 获取容器下直接子元素的最大 z-index
     * @param {HTMLElement} container - 容器元素
     * @returns {number}
     */
    function getMaxChildZIndex(container) {
        let maxZ = 0;
        for (const child of container.children) {
            const z = parseInt(getComputedStyle(child).zIndex) || 0;
            if (z > maxZ) maxZ = z;
        }
        return maxZ;
    }

    // ===== UI 创建函数 =====

    /**
     * 创建运行按钮
     * @param {HTMLElement} codeElement - code 元素
     * @param {HTMLElement} layoutContainer - 布局容器
     * @param {string} language - 语言类型
     * @param {Object} config - 代码块配置（可选）
     * @returns {HTMLElement}
     */
    function createRunButton(codeElement, layoutContainer, language = 'javascript', config = {}) {
        const button = document.createElement('button');
        button.className = 'runner-code-run-btn';
        const runLabel = safeI18n('runBtn', '运行');
        button.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z"/>
            </svg>
            <span>${runLabel}</span>
        `;
        button.setAttribute('title', runLabel);
        button.setAttribute('data-language', language);
        
        // 动态计算 z-index，确保在其他同级元素之上
        const maxZ = getMaxChildZIndex(layoutContainer);
        button.style.zIndex = maxZ + 1;
        
        button.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();

            button.disabled = true;
            // 如果配置了使用悬浮面板，直接打开 FloatingRunnerPanel
            try {
                await window.AITResourceLoader?.load('runner-editor');
                if (config.useFloatingPanel && window.FloatingRunnerPanel) {
                    const code = getCodeText(codeElement);
                    const floatingPanel = window.FloatingRunnerPanel.getInstance();
                    floatingPanel.show({ code, language });
                } else {
                    handleRunClick(codeElement, layoutContainer, button, language);
                }
            } catch {
                window.globalToastManager?.error(
                    safeI18n('runnerLoadFailed', '运行器加载失败，请刷新页面后重试')
                );
            } finally {
                button.disabled = false;
            }
        });
        
        return button;
    }

    // 使用全局语言配置（来自 constants.js）
    const LANGUAGE_CONFIGS = RUNNER_LANGUAGES;

    // 语言显示名称映射（兼容）
    const LANGUAGE_DISPLAY_NAMES = {};
    LANGUAGE_CONFIGS.forEach(lang => {
        LANGUAGE_DISPLAY_NAMES[lang.id] = lang.name;
    });

    /**
     * 创建 Runner 容器（使用 RunnerPanel 核心组件）
     * @param {HTMLElement} layoutContainer - 布局容器
     * @param {HTMLElement} runButton - 运行按钮
     * @param {string} language - 语言类型
     * @returns {Object} { container, panel }
     */
    function createRunnerContainer(layoutContainer, runButton, language = 'javascript') {
        // 创建嵌入式容器
        const container = document.createElement('div');
        container.className = 'runner-container';
        
        // 计算 z-index
        // CSDN 网站使用固定值 20
        if (location.hostname.includes('csdn.net')) {
            container.style.zIndex = 20;
        } else {
            // 其他网站动态计算，确保在其他同级元素之上
            const maxZ = getMaxChildZIndex(layoutContainer);
            container.style.zIndex = maxZ + 1;
        }

        // 创建 RunnerPanel 核心组件
        const panel = new window.RunnerPanel(container, {
            language: language,
            showClose: true,
            showPopout: true,
            onClose: () => {
                // 还原布局容器的原始样式
                if (layoutContainer.dataset.originalHeight) {
                    layoutContainer.style.removeProperty('display');
                    layoutContainer.style.removeProperty('min-height');
                    layoutContainer.style.removeProperty('height');
                    layoutContainer.style.removeProperty('max-height');
                    layoutContainer.style.removeProperty('overflow');
                    delete layoutContainer.dataset.originalHeight;
                }
                // 显示 Run 按钮
                if (container._runButton) {
                    container._runButton.style.display = '';
                }
                panel.destroy();
                container.remove();
            },
            onPopout: ({ code, language }) => {
                // 打开悬浮面板
                if (window.FloatingRunnerPanel) {
                    const floatingPanel = window.FloatingRunnerPanel.getInstance();
                    floatingPanel.show({ code, language });
                }
            }
        });

        // 存储 panel 实例到容器
        container._panel = panel;

        return { container, panel };
    }

    // ===== 执行逻辑 =====

    /**
     * 执行代码
     * @param {string} code - 代码
     * @param {HTMLElement} contentEl - 输出容器
     * @param {HTMLElement} runButton - 运行按钮
     * @param {string} language - 语言类型
     */
    async function executeCode(code, contentEl, runButton, language = 'javascript') {
        if (!code.trim()) {
            contentEl.innerHTML = '<div class="runner-output-empty">（无代码）</div>';
            return;
        }

        contentEl.innerHTML = '<div class="runner-result-loading">执行中...</div>';
        runButton.classList.add('loading');
        runButton.disabled = true;

        try {
            const manager = getRunnerManager();
            const outputs = [];

            await manager.run(code, language, {
                onOutput: (output) => {
                    // 特殊处理各种输出类型
                    if (output.level === 'table') {
                        // SQL 表格
                        outputs.push({ 
                            type: 'table', 
                            columns: output.data.columns, 
                            values: output.data.values 
                        });
                    } else if (output.level === 'html-preview') {
                        // HTML 预览
                        outputs.push({ type: 'html-preview', html: output.data.html });
                    } else if (output.level === 'json-formatted') {
                        // JSON 格式化
                        outputs.push({ type: 'json-formatted', json: output.data.json });
                    } else if (output.level === 'markdown-preview') {
                        // Markdown 预览
                        outputs.push({ type: 'markdown-preview', html: output.data.html });
                    } else if (output.level === 'mermaid-preview') {
                        // Mermaid 图表预览
                        outputs.push({ type: 'mermaid-preview', svg: output.data.svg });
                    } else {
                        // 普通输出
                        const content = Array.isArray(output.data) ? output.data.join(' ') : output.data;
                        outputs.push({ type: output.level || 'log', content: content });
                    }
                    // 实时渲染输出
                    renderOutput(contentEl, outputs);
                },
                onError: (error) => {
                    outputs.push({ type: 'error', content: error.message || error });
                },
                onComplete: () => {
                    renderOutput(contentEl, outputs);
                }
            });
        } catch (error) {
            contentEl.innerHTML = `<div class="runner-output-error">${escapeHtml(error.message)}</div>`;
        } finally {
            runButton.classList.remove('loading');
            runButton.disabled = false;
        }
    }

    /**
     * 处理运行按钮点击
     * @param {HTMLElement} codeElement - code 元素
     * @param {HTMLElement} layoutContainer - 布局容器
     * @param {HTMLElement} runButton - 运行按钮
     * @param {string} language - 语言类型
     */
    async function handleRunClick(codeElement, layoutContainer, runButton, language = 'javascript') {
        // 确保布局容器有 position: relative
        if (getComputedStyle(layoutContainer).position === 'static') {
            layoutContainer.style.position = 'relative';
        }

        // 计算 runner-container 高度：<code>元素高度 + 标题栏header + 分隔条 + output_header + output_content
        const codeHeight = codeElement.offsetHeight;
        const calculatedHeight = codeHeight + 
            CONFIG.headerHeight +          // 标题栏 header
            CONFIG.resizerHeight +         // 分隔条
            CONFIG.headerHeight +          // output header
            CONFIG.outputContentHeight;    // output 内容区
        
        // 保存原始高度（用于关闭时恢复）
        if (!layoutContainer.dataset.originalHeight) {
            layoutContainer.dataset.originalHeight = layoutContainer.offsetHeight;
        }
        
        // layoutContainer 需要足够高来容纳 runner-container（因为 absolute 不会撑开父元素）
        layoutContainer.style.setProperty('display', 'block', 'important');
        layoutContainer.style.setProperty('height', calculatedHeight + 'px', 'important');
        layoutContainer.style.setProperty('min-height', calculatedHeight + 'px', 'important');
        layoutContainer.style.setProperty('max-height', 'none', 'important');
        layoutContainer.style.setProperty('overflow', 'visible', 'important');

        // 获取或创建 Runner 容器（在布局容器内部）
        let container = layoutContainer.querySelector('.runner-container');
        let panel;

        if (!container) {
            const result = createRunnerContainer(layoutContainer, runButton, language);
            container = result.container;
            panel = result.panel;
            // 存储 runButton 引用，用于关闭时恢复显示
            container._runButton = runButton;
            // 插入到布局容器内部
            layoutContainer.appendChild(container);
        } else {
            panel = container._panel;
        }
        
        // 隐藏 Run 按钮
        runButton.style.display = 'none';

        // 直接使用 textContent 获取代码
        const code = getCodeText(codeElement);

        // 设置代码并运行
        if (panel) {
            panel.setCode(code);
            panel.setLanguage(language);
            setTimeout(() => panel.refresh(), 10);
            await panel.run();
        }
    }

    // ===== 输出渲染 =====

    /**
     * 渲染输出结果
     * @param {HTMLElement} container - 容器元素
     * @param {Array} outputs - 输出数组
     */
    function renderOutput(container, outputs) {
        if (!outputs || outputs.length === 0) {
            container.innerHTML = '<div class="runner-output-empty">（无输出）</div>';
            return;
        }

        container.innerHTML = outputs.map(output => {
            // SQL 表格
            if (output.type === 'table') {
                return renderSQLTable(output.columns, output.values);
            }
            // HTML 预览
            if (output.type === 'html-preview') {
                return renderHtmlPreview(output.html);
            }
            // JSON 格式化
            if (output.type === 'json-formatted') {
                return renderJsonFormatted(output.json);
            }
            // Markdown 预览
            if (output.type === 'markdown-preview') {
                return renderMarkdownPreview(output.html);
            }
            // Mermaid 图表预览
            if (output.type === 'mermaid-preview') {
                return renderMermaidPreview(output.svg);
            }
            // 普通输出
            const typeClass = `runner-output-${output.type || 'log'}`;
            const content = formatOutputContent(output.content);
            return `<div class="${typeClass}">${content}</div>`;
        }).join('');
    }

    /**
     * 渲染 HTML 预览
     */
    function renderHtmlPreview(html) {
        // 使用 srcdoc 创建安全的 iframe 预览
        const escapedHtml = html.replace(/"/g, '&quot;');
        return `
            <div class="runner-html-preview">
                <iframe 
                    srcdoc="${escapedHtml}" 
                    sandbox="allow-scripts allow-same-origin"
                    style="width: 100%; height: 200px; border: 1px solid var(--runner-border); border-radius: 4px; background: white;"
                ></iframe>
            </div>
        `;
    }

    /**
     * 渲染格式化的 JSON
     */
    function renderJsonFormatted(json) {
        // 语法高亮
        const highlighted = json
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"([^"]+)":/g, '<span class="runner-json-key">"$1"</span>:')
            .replace(/: "([^"]*)"/g, ': <span class="runner-json-string">"$1"</span>')
            .replace(/: (\d+)/g, ': <span class="runner-json-number">$1</span>')
            .replace(/: (true|false)/g, ': <span class="runner-json-boolean">$1</span>')
            .replace(/: (null)/g, ': <span class="runner-json-null">$1</span>');
        
        return `<pre class="runner-json-output">${highlighted}</pre>`;
    }

    /**
     * 渲染 Markdown 预览
     */
    function renderMarkdownPreview(html) {
        return `<div class="runner-markdown-preview">${html}</div>`;
    }

    /**
     * 渲染 Mermaid 图表预览
     */
    function renderMermaidPreview(svg) {
        const fullscreenHint = typeof window.MermaidRenderer !== 'undefined'
            ? ' style="cursor:pointer" title="Click to fullscreen"'
            : '';
        return `<div class="runner-mermaid-preview"${fullscreenHint}>${svg}</div>`;
    }

    /**
     * 渲染 SQL 表格
     * @param {Array<string>} columns - 列名
     * @param {Array<Array>} values - 数据行
     * @returns {string} HTML 字符串
     */
    function renderSQLTable(columns, values) {
        if (!columns || columns.length === 0) {
            return '<div class="runner-output-info">查询成功，无返回数据</div>';
        }

        const headerCells = columns.map(col => `<th>${escapeHtml(col)}</th>`).join('');
        const rows = (values || []).map(row => {
            const cells = row.map(cell => {
                const cellValue = cell === null ? '<span class="runner-null">NULL</span>' : escapeHtml(String(cell));
                return `<td>${cellValue}</td>`;
            }).join('');
            return `<tr>${cells}</tr>`;
        }).join('');

        return `
            <div class="runner-sql-table-wrapper">
                <table class="runner-sql-table">
                    <thead><tr>${headerCells}</tr></thead>
                    <tbody>${rows}</tbody>
                </table>
                <div class="runner-sql-table-info">${values ? values.length : 0} 行</div>
            </div>
        `;
    }

    /**
     * 格式化输出内容
     * @param {*} content - 输出内容
     * @returns {string}
     */
    function formatOutputContent(content) {
        if (content === undefined) return '<span class="runner-undefined">undefined</span>';
        if (content === null) return '<span class="runner-null">null</span>';
        if (typeof content === 'string') return escapeHtml(content);
        if (typeof content === 'object') {
            try {
                return escapeHtml(JSON.stringify(content, null, 2));
            } catch {
                return escapeHtml(String(content));
            }
        }
        return escapeHtml(String(content));
    }

    // ===== 扫描与初始化 =====

    /**
     * 为代码块初始化运行器
     * @param {HTMLElement} codeElement - code 元素
     * @param {HTMLElement} layoutContainer - 布局容器
     * @param {Object} config - 配置对象
     * @param {Object} enabledLanguages - 已启用的语言
     */
    function initializeCodeBlock(codeElement, layoutContainer, config, enabledLanguages) {
        // 跳过已处理的（已添加 Run 按钮的）
        if (codeElement.hasAttribute(CONFIG.processedAttr)) return;
        
        // 跳过已有 Run 按钮的 layoutContainer（防止嵌套 code 重复添加）
        if (layoutContainer.querySelector('.runner-code-run-btn')) {
            codeElement.setAttribute(CONFIG.processedAttr, 'true');
            return;
        }

        // 获取代码文本
        const code = getCodeText(codeElement);

        // === Mermaid 优先检测（hljs 无法识别 Mermaid DSL） ===
        let language = null;
        if (enabledLanguages.mermaid && window.MermaidRenderer) {
            if (window.MermaidRenderer.detect(codeElement, layoutContainer)) {
                language = 'mermaid';
            }
        }

        // Mermaid 未命中 → hljs 自动识别其他语言
        if (!language) {
            language = detectLanguage(code);
        }
        
        // 没检测到支持的语言，不标记，下次继续检测
        if (!language) return;
        
        // 检查该语言是否启用
        if (!enabledLanguages[language]) return;
        
        // 检测到支持的代码，标记为已处理
        codeElement.setAttribute(CONFIG.processedAttr, 'true');

        // 确保 layoutContainer 有定位上下文（用于 absolute 定位按钮）
        const position = getComputedStyle(layoutContainer).position;
        if (position === 'static') {
            layoutContainer.style.position = 'relative';
        }

        // 创建运行按钮（absolute 定位在 layoutContainer 内）
        const runButton = createRunButton(codeElement, layoutContainer, language, config);
        
        // 插入按钮到 layoutContainer 内部
        layoutContainer.appendChild(runButton);
    }

    /**
     * 检查 JavaScript Runner 是否启用
     * @returns {Promise<boolean>}
     */
    async function isJavaScriptRunnerEnabled() {
        try {
            const result = await chrome.storage.local.get('runnerJsEnabled');
            // 默认值为 true（开启）
            return result.runnerJsEnabled !== false;
        } catch (e) {
            // 上下文失效时静默返回 false
            return false;
        }
    }

    /**
     * 检查 TypeScript Runner 是否启用
     * @returns {Promise<boolean>}
     */
    async function isTypeScriptRunnerEnabled() {
        try {
            const result = await chrome.storage.local.get('runnerTypeScriptEnabled');
            // 默认值为 true（开启）
            return result.runnerTypeScriptEnabled !== false;
        } catch (e) {
            // 上下文失效时静默返回 false
            return false;
        }
    }

    /**
     * 检查 SQL Runner 是否启用
     * @returns {Promise<boolean>}
     */
    async function isSQLRunnerEnabled() {
        try {
            const result = await chrome.storage.local.get('runnerSQLEnabled');
            // 默认值为 true（开启）
            return result.runnerSQLEnabled !== false;
        } catch (e) {
            // 上下文失效时静默返回 false
            return false;
        }
    }

    /**
     * 检查 HTML Runner 是否启用
     * @returns {Promise<boolean>}
     */
    async function isHtmlRunnerEnabled() {
        try {
            const result = await chrome.storage.local.get('runnerHtmlEnabled');
            return result.runnerHtmlEnabled !== false;
        } catch (e) {
            return false;
        }
    }

    /**
     * 检查 JSON Runner 是否启用
     * @returns {Promise<boolean>}
     */
    async function isJsonRunnerEnabled() {
        try {
            const result = await chrome.storage.local.get('runnerJsonEnabled');
            return result.runnerJsonEnabled !== false;
        } catch (e) {
            return false;
        }
    }

    /**
     * 检查 Markdown Runner 是否启用
     * @returns {Promise<boolean>}
     */
    async function isMarkdownRunnerEnabled() {
        try {
            const result = await chrome.storage.local.get('runnerMarkdownEnabled');
            return result.runnerMarkdownEnabled !== false;
        } catch (e) {
            return false;
        }
    }

    /**
     * 检查 Mermaid 渲染器是否启用
     * @returns {Promise<boolean>}
     */
    async function isMermaidRendererEnabled() {
        try {
            const key = window.MermaidRenderer?.STORAGE_KEY || 'mermaidRendererEnabled';
            const result = await chrome.storage.local.get(key);
            return result[key] !== false;
        } catch {
            return false;
        }
    }

    /**
     * 检查指定语言是否启用
     * @param {string} language - 语言类型
     * @returns {Promise<boolean>}
     */
    async function isLanguageEnabled(language) {
        if (language === 'javascript') return isJavaScriptRunnerEnabled();
        if (language === 'typescript') return isTypeScriptRunnerEnabled();
        if (language === 'sql') return isSQLRunnerEnabled();
        if (language === 'html') return isHtmlRunnerEnabled();
        if (language === 'json') return isJsonRunnerEnabled();
        if (language === 'markdown') return isMarkdownRunnerEnabled();
        if (language === 'mermaid') return isMermaidRendererEnabled();
        return false;
    }

    /**
     * 扫描并处理所有代码块
     */
    async function scanCodeBlocks() {
        // 检查各语言是否启用
        const [jsEnabled, tsEnabled, sqlEnabled, htmlEnabled, jsonEnabled, mdEnabled, mermaidEnabled] = await Promise.all([
            isJavaScriptRunnerEnabled(),
            isTypeScriptRunnerEnabled(),
            isSQLRunnerEnabled(),
            isHtmlRunnerEnabled(),
            isJsonRunnerEnabled(),
            isMarkdownRunnerEnabled(),
            isMermaidRendererEnabled()
        ]);
        
        // 如果所有功能都禁用，不扫描
        if (!jsEnabled && !tsEnabled && !sqlEnabled && !htmlEnabled && !jsonEnabled && !mdEnabled && !mermaidEnabled) {
            return;
        }
        
        const enabledLanguages = {
            javascript: jsEnabled,
            typescript: tsEnabled,
            sql: sqlEnabled,
            html: htmlEnabled,
            json: jsonEnabled,
            markdown: mdEnabled,
            mermaid: mermaidEnabled
        };
        
        // 遍历配置，按优先级匹配代码块
        for (const config of CODE_BLOCK_CONFIGS) {
            const codeElements = document.querySelectorAll(
                `${config.codeSelector}:not([${CONFIG.processedAttr}])`
            );
            
            codeElements.forEach(codeElement => {
                // 获取布局容器
                const layoutContainer = codeElement.closest(config.layoutSelector);
                if (layoutContainer) {
                    initializeCodeBlock(codeElement, layoutContainer, config, enabledLanguages);
                }
            });
        }
    }

    /**
     * 检查当前网站是否为已知 AI 平台（getSiteInfoList 白名单）
     * 只在 AI 平台上启用代码检测，其他网站直接跳过
     * @returns {Promise<boolean>}
     */
    async function isAiPlatform() {
        try {
            return typeof getCurrentPlatform === 'function' && !!(await getCurrentPlatform());
        } catch {
            return false;
        }
    }

    /**
     * 初始化 Runner 模块
     */
    async function initialize() {
        if (initialized || initInFlight) return;
        initInFlight = true;
        try {
            await TimelineI18n.ready();

            // 只在已知 AI 平台上运行
            if (!(await isAiPlatform())) {
                return;
            }

            // 检查是否有任何语言启用
            const [jsEnabled, tsEnabled, sqlEnabled, htmlEnabled, jsonEnabled, mdEnabled, mermaidEnabled] = await Promise.all([
                isJavaScriptRunnerEnabled(),
                isTypeScriptRunnerEnabled(),
                isSQLRunnerEnabled(),
                isHtmlRunnerEnabled(),
                isJsonRunnerEnabled(),
                isMarkdownRunnerEnabled(),
                isMermaidRendererEnabled()
            ]);

            if (!jsEnabled && !tsEnabled && !sqlEnabled && !htmlEnabled && !jsonEnabled && !mdEnabled && !mermaidEnabled) {
                return;
            }

            // Mermaid 图表点击全屏（事件委托，只注册一次）
            if (window.MermaidRenderer && !document.documentElement.dataset.runnerMermaidFullscreenBound) {
                document.documentElement.dataset.runnerMermaidFullscreenBound = 'true';
                document.addEventListener('click', (e) => {
                    const preview = e.target.closest('.runner-mermaid-preview');
                    if (preview) {
                        const svg = preview.innerHTML;
                        if (svg) window.MermaidRenderer.openFullscreen(svg);
                    }
                });
            }

            // 初始扫描
            await scanCodeBlocks();

            // 使用 DOMObserverManager 监听 DOM 变化
            // 防抖 500ms：等代码块输出完整后再添加 Run 按钮
            unsubscribeObserver = window.DOMObserverManager.getInstance().subscribeBody('runner', {
                callback: () => scanCodeBlocks(),
                filter: { hasAddedNodes: true },
                debounce: CONFIG.stableDelay  // 500ms 防抖
            });
            initialized = true;
        } catch (error) {
        } finally {
            initInFlight = false;
        }
    }

    /**
     * 清理资源
     */
    function cleanup() {
        // 取消 DOMObserverManager 订阅
        if (unsubscribeObserver) {
            unsubscribeObserver();
            unsubscribeObserver = null;
        }
        if (runnerManagerInstance) {
            runnerManagerInstance.cleanup();
            runnerManagerInstance = null;
        }
        initialized = false;
    }

    // ===== 暴露接口 =====

    if (typeof window !== 'undefined') {
        window.Runner = {
            getManager: getRunnerManager,
            scan: scanCodeBlocks,
            cleanup: cleanup
        };
    }

    // 自动初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }

})();
