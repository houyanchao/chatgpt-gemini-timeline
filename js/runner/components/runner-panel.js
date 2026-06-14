/**
 * RunnerPanel - 代码运行器核心组件
 * 
 * 职责：代码编辑 + 执行 + 输出显示
 * 特点：宽高 100%，填满父容器，不关心外层布局
 * 
 * 使用方式：
 *   const panel = new RunnerPanel(containerElement, options);
 *   panel.setCode('console.log("Hello")');
 *   panel.run();
 */

(function() {
    'use strict';

    // ===== 安全的 i18n 调用 =====
    function safeI18n(key, fallback = '') {
        try {
            return TimelineI18n.getMessage(key) || fallback;
        } catch (e) {
            return fallback;
        }
    }

    // ===== 配置 =====
    const CONFIG = {
        headerHeight: 36,
        resizerHeight: 4,
        outputContentHeight: 150,      // output 内容区默认高度
        outputContentMinHeight: 50,    // output 内容区最小高度
        codeMinHeight: 100             // 代码区最小高度
    };

    // 获取全局语言配置
    function getLanguages() {
        return RUNNER_LANGUAGES;
    }

    class RunnerPanel {
        /**
         * @param {HTMLElement} container - 父容器元素
         * @param {Object} options - 配置选项
         * @param {string} options.language - 初始语言，默认 'javascript'
         * @param {string} options.code - 初始代码
         * @param {boolean} options.showSettings - 是否显示设置按钮，默认 true
         * @param {boolean} options.showCopy - 是否显示复制按钮，默认 true
         * @param {boolean} options.showClose - 是否显示关闭按钮，默认 true
         * @param {boolean} options.showPopout - 是否显示弹出按钮，默认 false
         * @param {boolean} options.showLanguageSelector - 是否显示语言选择器，默认 true
         * @param {Function} options.onClose - 关闭回调
         * @param {Function} options.onPopout - 弹出回调
         * @param {Function} options.onLanguageChange - 语言变更回调
         */
        constructor(container, options = {}) {
            this.container = container;
            this.options = {
                language: 'javascript',
                code: '',
                showSettings: true,
                showCopy: true,
                showClose: true,
                showPopout: false,
                showLanguageSelector: true,
                onClose: null,
                onPopout: null,
                onLanguageChange: null,
                ...options
            };

            this.language = this.options.language;
            this.theme = this._detectTheme(); // 'dark' or 'light'
            this.cmEditor = null;
            this.resultContent = null;
            this.element = null;

            this.render();
        }
        
        /**
         * 获取默认主题
         * 复用全局 detectDarkMode 函数（定义在 constants.js）
         */
        _detectTheme() {
            // 检测页面是否为深色模式
            const isDarkPage = typeof detectDarkMode === 'function' ? detectDarkMode() : false;
            // 深色页面默认用浅色主题，浅色页面默认用深色主题
            return isDarkPage ? 'light' : 'dark';
        }

        /**
         * 渲染面板
         */
        render() {
            const languages = getLanguages();
            const langConfig = languages.find(l => l.id === this.language) || languages[0];

            // 创建面板元素
            this.element = document.createElement('div');
            this.element.className = 'runner-panel';
            // 根据初始主题添加类名
            if (this.theme === 'light') {
                this.element.classList.add('runner-panel-light');
            } else {
                this.element.classList.add('runner-panel-dark');
            }
            this.element.innerHTML = this._getHTML(langConfig);

            this.container.appendChild(this.element);

            // 初始化组件
            this._initCodeMirror();
            this._bindEvents();

            // 设置初始代码
            if (this.options.code) {
                this.setCode(this.options.code);
            }
            
            // 同步悬浮容器的边框颜色（如果存在）
            const floatingContainer = this.element.closest('.floating-runner-container');
            if (floatingContainer) {
                floatingContainer.style.setProperty('--floating-border', this.theme === 'light' ? '#e7e7e7' : '#30363d');
                floatingContainer.style.setProperty('--floating-bg', this.theme === 'light' ? '#ffffff' : '#0d1117');
            }
        }

        /**
         * 获取面板 HTML
         */
        _getHTML(langConfig) {
            const { showSettings, showCopy, showClose, showPopout, showLanguageSelector } = this.options;

            // 构建操作按钮
            let actionsHTML = '';
            if (showSettings) {
                actionsHTML += `
                    <button class="runner-panel-btn" data-action="settings" title="${safeI18n('vkmzpx', '设置')}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="3"></circle>
                            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                        </svg>
                    </button>`;
            }
            if (showCopy) {
                actionsHTML += `
                    <button class="runner-panel-btn" data-action="copy" title="${safeI18n('mvkxpz', '复制')}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
                    </button>`;
            }
            if (showPopout) {
                actionsHTML += `
                    <button class="runner-panel-btn" data-action="popout" title="${safeI18n('popoutRunner', '弹出到悬浮面板')}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                            <polyline points="15 3 21 3 21 9"></polyline>
                            <line x1="10" y1="14" x2="21" y2="3"></line>
                        </svg>
                    </button>`;
            }
            if (showClose) {
                actionsHTML += `
                    <button class="runner-panel-btn runner-panel-close" data-action="close" title="${safeI18n('commonCancel', '关闭')}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>`;
            }

            // 语言选择器
            const titleHTML = showLanguageSelector
                ? `<button class="runner-panel-lang-selector" data-language="${this.language}">
                       <span class="lang-name">${langConfig?.name || this.language}</span>
                       <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                           <polyline points="6 9 12 15 18 9"></polyline>
                       </svg>
                   </button>`
                : `<span class="runner-panel-lang-name">${langConfig?.name || this.language}</span>`;
            
            // 主题选择器
            const themeLabel = this.theme === 'dark' ? safeI18n('themeDark', '深色') : safeI18n('themeLight', '浅色');
            const themeSelectorHTML = `<button class="runner-panel-theme-selector" data-theme="${this.theme}">
                <span class="theme-name">${themeLabel}</span>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
            </button>`;

            return `
                <div class="runner-panel-editor-section">
                    <div class="runner-panel-header">
                        <span class="runner-panel-title">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="16 18 22 12 16 6"></polyline>
                                <polyline points="8 6 2 12 8 18"></polyline>
                            </svg>
                            ${titleHTML}
                            ${themeSelectorHTML}
                        </span>
                        <div class="runner-panel-actions">${actionsHTML}</div>
                    </div>
                    <div class="runner-panel-editor"></div>
                </div>
                <div class="runner-panel-resizer"></div>
                <div class="runner-panel-output-section">
                    <div class="runner-panel-header">
                        <span class="runner-panel-title">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="4 17 10 11 4 5"></polyline>
                                <line x1="12" y1="19" x2="20" y2="19"></line>
                            </svg>
                            <span>Output</span>
                        </span>
                        <div class="runner-panel-actions">
                            <button class="runner-panel-btn" data-action="clear" title="${safeI18n('clearOutput', '清空')}">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="3 6 5 6 21 6"></polyline>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                </svg>
                            </button>
                            <button class="runner-panel-btn" data-action="copy-output" title="${safeI18n('mvkxpz', '复制')}">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                                </svg>
                            </button>
                            <button class="runner-panel-run-btn" data-action="run">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M8 5v14l11-7z"/>
                                </svg>
                                <span>${safeI18n('runBtn', '运行')}</span>
                            </button>
                        </div>
                    </div>
                    <div class="runner-panel-output-content">
                        <div class="runner-panel-output-empty">（无输出）</div>
                    </div>
                </div>
            `;
        }

        /**
         * 初始化 CodeMirror
         */
        _initCodeMirror() {
            const editorWrapper = this.element.querySelector('.runner-panel-editor');
            const languages = getLanguages();
            const langConfig = languages.find(l => l.id === this.language);

            if (typeof CodeMirror !== 'undefined') {
                this.cmEditor = CodeMirror(editorWrapper, {
                    mode: langConfig?.mode || 'javascript',
                    theme: 'default',
                    lineNumbers: true,
                    lineWrapping: true,
                    tabSize: 2,
                    indentWithTabs: false,
                    matchBrackets: true,
                    placeholder: '// 在此输入代码...'
                });
                this.cmEditor.setSize('100%', '100%');

                // 快捷键运行
                this.cmEditor.setOption('extraKeys', {
                    'Cmd-Enter': () => this.run(),
                    'Ctrl-Enter': () => this.run()
                });

                // 延迟刷新
                setTimeout(() => this.cmEditor.refresh(), 50);
            }

            this.resultContent = this.element.querySelector('.runner-panel-output-content');

            // 初始状态：Mermaid 时隐藏 output 复制按钮
            this._updateCopyOutputVisibility();
        }

        /**
         * 绑定事件
         */
        _bindEvents() {
            // 按钮事件
            this.element.querySelectorAll('[data-action]').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    this._handleAction(btn.dataset.action, btn);
                });
            });

            // 语言选择器
            const langSelector = this.element.querySelector('.runner-panel-lang-selector');
            if (langSelector) {
                langSelector.addEventListener('click', () => this._showLanguageDropdown(langSelector));
            }
            
            // 主题选择器
            const themeSelector = this.element.querySelector('.runner-panel-theme-selector');
            if (themeSelector) {
                themeSelector.addEventListener('click', () => this._showThemeDropdown(themeSelector));
            }

            // 分隔条拖动
            this._initResizer();
        }

        /**
         * 初始化分隔条拖动
         */
        _initResizer() {
            const resizer = this.element.querySelector('.runner-panel-resizer');
            const outputSection = this.element.querySelector('.runner-panel-output-section');
            
            let isResizing = false;
            let startY = 0;
            let startHeight = 0;

            resizer.addEventListener('mousedown', (e) => {
                isResizing = true;
                startY = e.clientY;
                startHeight = outputSection.offsetHeight;
                document.body.style.cursor = 'row-resize';
                document.body.style.userSelect = 'none';
                e.preventDefault();
            });

            const onMouseMove = (e) => {
                if (!isResizing) return;
                const deltaY = startY - e.clientY;
                
                // output section 最小高度 = header(36) + content最小高度(50) = 86px
                const outputMinHeight = CONFIG.headerHeight + CONFIG.outputContentMinHeight;
                
                // editor section 最小高度 = header(36) + editor最小高度(100) = 136px
                const editorMinHeight = CONFIG.headerHeight + CONFIG.codeMinHeight;
                
                // output section 最大高度 = 容器高度 - editor最小高度 - 分隔条
                const containerHeight = this.element.offsetHeight;
                const outputMaxHeight = containerHeight - editorMinHeight - CONFIG.resizerHeight;
                
                const newHeight = Math.max(
                    outputMinHeight,
                    Math.min(outputMaxHeight, startHeight + deltaY)
                );
                outputSection.style.height = newHeight + 'px';
                
                // 实时刷新 CodeMirror
                if (this.cmEditor) {
                    this.cmEditor.refresh();
                }
            };

            const onMouseUp = () => {
                if (isResizing) {
                    isResizing = false;
                    document.body.style.cursor = '';
                    document.body.style.userSelect = '';
                    // 最终刷新
                    if (this.cmEditor) {
                        this.cmEditor.refresh();
                    }
                }
            };

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);

            // 保存清理函数
            this._cleanupResizer = () => {
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
            };
        }

        /**
         * 处理按钮动作
         */
        _handleAction(action, btn) {
            switch (action) {
                case 'settings':
                    if (window.panelModal) {
                        window.panelModal.show('runner');
                    }
                    break;

                case 'copy':
                    const code = this.getCode();
                    navigator.clipboard.writeText(code).then(() => {
                        if (window.globalToastManager) {
                            window.globalToastManager.success(safeI18n('xpzmvk', '复制成功'), btn);
                        }
                    });
                    break;

                case 'popout':
                    if (this.options.onPopout) {
                        this.options.onPopout({
                            code: this.getCode(),
                            language: this.language
                        });
                    }
                    break;

                case 'close':
                    if (this.options.onClose) {
                        this.options.onClose();
                    }
                    break;

                case 'clear':
                    this.clearOutput();
                    break;

                case 'copy-output':
                    const output = this.resultContent?.innerText || '';
                    navigator.clipboard.writeText(output).then(() => {
                        if (window.globalToastManager) {
                            window.globalToastManager.success(safeI18n('xpzmvk', '复制成功'), btn);
                        }
                    });
                    break;

                case 'run':
                    this.run();
                    break;
            }
        }

        /**
         * 显示语言选择下拉
         */
        _showLanguageDropdown(anchor) {
            if (!window.globalDropdownManager) return;

            const languages = getLanguages();
            const items = languages.map(lang => ({
                id: lang.id,
                label: lang.name,
                selected: lang.id === this.language
            }));

            window.globalDropdownManager.show({
                trigger: anchor,
                items,
                onSelect: (item) => {
                    this.setLanguage(item.id);
                    // 切换语言后立即执行
                    this.run();
                }
            });
        }
        
        /**
         * 显示主题选择下拉菜单
         */
        _showThemeDropdown(anchor) {
            if (!window.globalDropdownManager) return;

            const themes = [
                { id: 'dark', label: safeI18n('themeDark', '深色') },
                { id: 'light', label: safeI18n('themeLight', '浅色') }
            ];
            const items = themes.map(t => ({
                id: t.id,
                label: t.label,
                selected: t.id === this.theme
            }));

            window.globalDropdownManager.show({
                trigger: anchor,
                items,
                onSelect: (item) => {
                    this.setTheme(item.id);
                }
            });
        }
        
        /**
         * 设置主题
         */
        setTheme(themeId) {
            if (themeId !== 'dark' && themeId !== 'light') return;
            
            this.theme = themeId;
            
            // 更新 UI
            const selector = this.element.querySelector('.runner-panel-theme-selector');
            if (selector) {
                selector.querySelector('.theme-name').textContent = themeId === 'dark' ? safeI18n('themeDark', '深色') : safeI18n('themeLight', '浅色');
                selector.dataset.theme = themeId;
            }
            
            // 应用主题：切换主题类
            if (themeId === 'light') {
                this.element.classList.remove('runner-panel-dark');
                this.element.classList.add('runner-panel-light');
            } else {
                this.element.classList.remove('runner-panel-light');
                this.element.classList.add('runner-panel-dark');
            }
            
            // 同步更新悬浮容器的边框颜色（如果存在）
            const floatingContainer = this.element.closest('.floating-runner-container');
            if (floatingContainer) {
                floatingContainer.style.setProperty('--floating-border', themeId === 'light' ? '#e7e7e7' : '#30363d');
                floatingContainer.style.setProperty('--floating-bg', themeId === 'light' ? '#ffffff' : '#0d1117');
            }
        }

        // ===== 公共 API =====

        /**
         * 设置代码
         */
        setCode(code) {
            if (this.cmEditor) {
                this.cmEditor.setValue(code);
            }
        }

        /**
         * 获取代码
         */
        getCode() {
            return this.cmEditor ? this.cmEditor.getValue() : '';
        }

        /**
         * 设置语言
         */
        setLanguage(langId) {
            const languages = getLanguages();
            const langConfig = languages.find(l => l.id === langId);
            if (!langConfig) return;

            this.language = langId;

            // 更新 UI
            const selector = this.element.querySelector('.runner-panel-lang-selector');
            if (selector) {
                selector.querySelector('.lang-name').textContent = langConfig.name;
                selector.dataset.language = langId;
            }

            // 更新 CodeMirror 模式
            if (this.cmEditor && langConfig.mode) {
                this.cmEditor.setOption('mode', langConfig.mode);
            }

            // Mermaid 输出是 SVG 图表，隐藏无意义的纯文本复制按钮
            this._updateCopyOutputVisibility();

            // 回调
            if (this.options.onLanguageChange) {
                this.options.onLanguageChange(langId);
            }
        }

        /**
         * 获取当前语言
         */
        getLanguage() {
            return this.language;
        }

        /**
         * 运行代码
         */
        async run() {
            const code = this.getCode();
            if (!code.trim()) {
                this.resultContent.innerHTML = '<div class="runner-panel-output-empty">（无代码）</div>';
                return;
            }

            this.resultContent.innerHTML = '<div class="runner-panel-output-loading">执行中...</div>';

            try {
                const manager = window.Runner?.getManager();
                if (!manager) {
                    throw new Error('Runner 未初始化');
                }

                const outputs = [];
                await manager.run(code, this.language, {
                    onOutput: (output) => {
                        if (output.level === 'table') {
                            outputs.push({ type: 'table', columns: output.data.columns, values: output.data.values });
                        } else if (output.level === 'html-preview') {
                            outputs.push({ type: 'html-preview', html: output.data.html });
                        } else if (output.level === 'json-formatted') {
                            outputs.push({ type: 'json-formatted', json: output.data.json });
                        } else if (output.level === 'markdown-preview') {
                            outputs.push({ type: 'markdown-preview', html: output.data.html });
                        } else if (output.level === 'mermaid-preview') {
                            outputs.push({ type: 'mermaid-preview', svg: output.data.svg });
                        } else {
                            const content = Array.isArray(output.data) ? output.data.join(' ') : output.data;
                            outputs.push({ type: output.level || 'log', content });
                        }
                        this._renderOutput(outputs);
                    },
                    onError: (error) => {
                        outputs.push({ type: 'error', content: error.message || error });
                    },
                    onComplete: () => {
                        this._renderOutput(outputs);
                    }
                });
            } catch (error) {
                this.resultContent.innerHTML = `<div class="runner-panel-output-error">${this._escapeHtml(error.message)}</div>`;
            }
        }

        /**
         * 清空输出
         */
        clearOutput() {
            if (this.resultContent) {
                this.resultContent.innerHTML = '<div class="runner-panel-output-empty">（无输出）</div>';
            }
        }

        /**
         * 刷新编辑器
         */
        refresh() {
            if (this.cmEditor) {
                this.cmEditor.refresh();
            }
        }

        /**
         * 销毁面板
         */
        destroy() {
            if (this._cleanupResizer) {
                this._cleanupResizer();
            }
            if (this.element) {
                this.element.remove();
            }
            this.cmEditor = null;
            this.resultContent = null;
        }

        // ===== 私有方法 =====

        _renderOutput(outputs) {
            if (!outputs || outputs.length === 0) {
                this.resultContent.innerHTML = '<div class="runner-panel-output-empty">（无输出）</div>';
                return;
            }

            this.resultContent.innerHTML = outputs.map(output => {
                if (output.type === 'table') {
                    return this._renderTable(output.columns, output.values);
                }
                if (output.type === 'html-preview') {
                    return `<div class="runner-panel-html-preview"><iframe srcdoc="${output.html.replace(/"/g, '&quot;')}" sandbox="allow-scripts allow-same-origin" style="width:100%;height:150px;border:1px solid var(--runner-border);border-radius:4px;background:white;"></iframe></div>`;
                }
                if (output.type === 'json-formatted') {
                    return `<pre class="runner-panel-json-output">${this._escapeHtml(output.json)}</pre>`;
                }
                if (output.type === 'markdown-preview') {
                    return `<div class="runner-panel-markdown-preview">${output.html}</div>`;
                }
                if (output.type === 'mermaid-preview') {
                    return `<div class="runner-mermaid-preview">${output.svg}</div>`;
                }
                return `<div class="runner-panel-output-${output.type || 'log'}">${this._escapeHtml(output.content)}</div>`;
            }).join('');
        }

        _renderTable(columns, values) {
            if (!columns || columns.length === 0) {
                return '<div class="runner-panel-output-info">查询成功，无返回数据</div>';
            }
            const headerCells = columns.map(col => `<th>${this._escapeHtml(col)}</th>`).join('');
            const rows = (values || []).map(row => {
                const cells = row.map(cell => {
                    const cellValue = cell === null ? '<span class="runner-panel-null">NULL</span>' : this._escapeHtml(String(cell));
                    return `<td>${cellValue}</td>`;
                }).join('');
                return `<tr>${cells}</tr>`;
            }).join('');
            return `<div class="runner-panel-table-wrapper"><table class="runner-panel-table"><thead><tr>${headerCells}</tr></thead><tbody>${rows}</tbody></table></div>`;
        }

        /**
         * 根据语言类型切换 output 复制按钮的显示
         */
        _updateCopyOutputVisibility() {
            const btn = this.element?.querySelector('[data-action="copy-output"]');
            if (btn) {
                // 用 !important 覆盖 .runner-panel-btn 的 display: flex !important
                btn.style.setProperty('display', this.language === 'mermaid' ? 'none' : 'flex', 'important');
            }
        }

        _escapeHtml(str) {
            const div = document.createElement('div');
            div.textContent = str;
            return div.innerHTML;
        }
    }

    // 导出
    if (typeof window !== 'undefined') {
        window.RunnerPanel = RunnerPanel;
    }

})();

