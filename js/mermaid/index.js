/**
 * MermaidRenderer - Mermaid 检测工具 + 全屏查看器
 * 
 * 职责：
 * 1. detect(codeEl, wrapperEl) — 供 Runner 的 initializeCodeBlock 调用，
 *    判断代码块是否为 Mermaid 语法
 * 2. openFullscreen(svg) — 供输出面板点击图表时调用，
 *    打开全屏查看器（缩放 + 拖拽 + ESC 关闭）
 * 
 * 不再负责：内联渲染、扫描、DOM 监听（全部由 Runner 体系统一管理）
 * 
 * 依赖：detectDarkMode()（全局工具函数）
 */

(function() {
    'use strict';

    // ===== Mermaid 语法检测 =====

    // 图表类型关键字（首行匹配）
    const DIAGRAM_KEYWORDS = [
        'graph', 'flowchart', 'sequenceDiagram', 'classDiagram',
        'stateDiagram', 'stateDiagram-v2', 'erDiagram',
        'gantt', 'pie', 'gitGraph', 'journey', 'mindmap',
        'timeline', 'quadrantChart', 'xychart-beta', 'xychart',
        'sankey-beta', 'sankey', 'block-beta', 'block',
        'packet-beta', 'packet', 'architecture-beta', 'architecture',
        'C4Context', 'C4Container', 'C4Component', 'C4Dynamic', 'C4Deployment',
        'requirementDiagram', 'requirement', 'zenuml',
        'kanban', 'radar-beta', 'treemap'
    ];

    // 明确的编程语言标签（命中则跳过 Mermaid 检测）
    const KNOWN_PROG_LANGS = new Set([
        'javascript', 'js', 'typescript', 'ts', 'python', 'py',
        'java', 'c', 'c++', 'cpp', 'c#', 'csharp', 'go', 'golang',
        'rust', 'ruby', 'rb', 'php', 'swift', 'kotlin', 'scala',
        'r', 'matlab', 'perl', 'lua', 'dart', 'elixir', 'erlang',
        'haskell', 'ocaml', 'clojure', 'groovy', 'shell', 'bash',
        'powershell', 'sql', 'html', 'css', 'scss', 'less', 'sass',
        'xml', 'json', 'yaml', 'yml', 'toml', 'ini', 'csv',
        'markdown', 'md', 'latex', 'tex', 'dockerfile', 'makefile',
        'cmake', 'graphql', 'protobuf', 'proto', 'solidity',
        'assembly', 'asm', 'vhdl', 'verilog', 'jsx', 'tsx',
        'vue', 'svelte', 'wasm', 'zig', 'nim', 'v', 'vlang',
        'fortran', 'cobol', 'pascal', 'delphi', 'ada', 'lisp',
        'scheme', 'racket', 'prolog', 'objective-c', 'objc'
    ]);

    /**
     * 判断代码文本是否为 Mermaid 语法
     */
    function isMermaidSyntax(code) {
        if (!code || code.length < 30) return false;

        const lines = code.split('\n').filter(l => l.trim() !== '');
        if (lines.length < 2) return false;

        // 跳过 Mermaid 注释行（%%）
        let firstContentLine = '';
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('%%')) {
                firstContentLine = trimmed;
                break;
            }
        }
        if (!firstContentLine) return false;

        // 首行是否以图表关键字开头
        const lower = firstContentLine.toLowerCase();
        const matched = DIAGRAM_KEYWORDS.some(kw => {
            const kwLower = kw.toLowerCase();
            return lower === kwLower ||
                   lower.startsWith(kwLower + ' ') ||
                   lower.startsWith(kwLower + '\t');
        });
        if (!matched) return false;

        // 流式安全：末行不能以未完成连接符结尾
        const lastLine = lines[lines.length - 1].trim();
        const incomplete = ['-->', '---', '-.', '==>', '~~~', '-->|', '--|', '==>|'];
        const trailing = ['{', '[', '(', '<', '|', ',', ':'];
        if (incomplete.some(e => lastLine.endsWith(e))) return false;
        if (trailing.some(c => lastLine.endsWith(c))) return false;

        return true;
    }

    /**
     * 从代码块 DOM 中读取语言标注
     */
    function readLanguageLabel(codeEl, wrapperEl) {
        // class 中的 language-xxx（ChatGPT、Claude 等）
        const classList = (codeEl.className || '') + ' ' + (codeEl.parentElement?.className || '');
        const match = classList.match(/(?:language|lang|hljs)-(\w[\w+#-]*)/i);
        if (match) return match[1].toLowerCase();

        // Gemini code-block 装饰区域
        const deco = wrapperEl.querySelector('.code-block-decoration, [class*="code-header"]');
        if (deco) {
            const el = deco.querySelector('span, [class*="lang"]');
            const t = el?.textContent?.trim().toLowerCase();
            if (t && t.length < 30) return t;
        }

        // DeepSeek code-header
        const hdr = wrapperEl.querySelector('.code-header span, .md-code-block-info-bar span');
        if (hdr) {
            const t = hdr.textContent?.trim().toLowerCase();
            if (t && t.length < 30) return t;
        }

        return null;
    }

    /**
     * 检测代码块是否为 Mermaid
     * 
     * 策略：
     * 1. 语言标签 === 'mermaid' → true
     * 2. 语言标签是明确的编程语言 → false
     * 3. 无标签或泛化标签 → 内容启发式检测
     * 
     * @param {HTMLElement} codeEl - 代码元素
     * @param {HTMLElement} wrapperEl - 布局容器
     * @returns {boolean}
     */
    function detect(codeEl, wrapperEl) {
        const label = readLanguageLabel(codeEl, wrapperEl);
        if (label === 'mermaid') return true;
        if (label && KNOWN_PROG_LANGS.has(label)) return false;
        return isMermaidSyntax(codeEl.textContent || '');
    }

    // ===== 全屏查看器 =====

    let fullscreenOverlay = null;
    let viewerZoom = 1;
    let viewerPanX = 0;
    let viewerPanY = 0;
    let isPanning = false;
    let panStartX = 0;
    let panStartY = 0;

    function safeI18n(key, fallback) {
        try { return TimelineI18n.getMessage(key) || fallback; }
        catch { return fallback; }
    }

    /**
     * 打开全屏查看器
     * @param {string} svg - SVG 内容
     */
    function openFullscreen(svg) {
        if (fullscreenOverlay) closeFullscreen();

        viewerZoom = 1;
        viewerPanX = 0;
        viewerPanY = 0;

        const overlay = document.createElement('div');
        overlay.className = 'ait-mermaid-overlay';

        const canvas = document.createElement('div');
        canvas.className = 'ait-mermaid-canvas';
        canvas.innerHTML = svg;
        applyTransform(canvas);

        const controls = document.createElement('div');
        controls.className = 'ait-mermaid-controls';
        controls.innerHTML = `
            <button class="ait-mc-btn" data-action="zoom-in" title="Zoom In">+</button>
            <button class="ait-mc-btn" data-action="zoom-out" title="Zoom Out">−</button>
            <button class="ait-mc-btn" data-action="reset" title="Reset">⊙</button>
            <button class="ait-mc-btn ait-mc-close" data-action="close" title="Close">✕</button>
        `;

        const hint = document.createElement('div');
        hint.className = 'ait-mermaid-hint';
        hint.textContent = safeI18n('mermaidViewerHint', 'Scroll to zoom · Drag to pan · ESC to close');

        overlay.appendChild(canvas);
        overlay.appendChild(controls);
        overlay.appendChild(hint);
        document.body.appendChild(overlay);

        requestAnimationFrame(() => overlay.classList.add('visible'));
        fullscreenOverlay = overlay;

        controls.addEventListener('click', (e) => {
            const action = e.target.closest('[data-action]')?.dataset.action;
            if (!action) return;
            e.stopPropagation();
            switch (action) {
                case 'zoom-in':  viewerZoom = Math.min(viewerZoom * 1.25, 10); break;
                case 'zoom-out': viewerZoom = Math.max(viewerZoom / 1.25, 0.1); break;
                case 'reset':    viewerZoom = 1; viewerPanX = 0; viewerPanY = 0; break;
                case 'close':    closeFullscreen(); return;
            }
            applyTransform(canvas);
        });

        overlay.addEventListener('wheel', (e) => {
            e.preventDefault();
            const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
            viewerZoom = Math.min(Math.max(viewerZoom * factor, 0.1), 10);
            applyTransform(canvas);
        }, { passive: false });

        overlay.addEventListener('mousedown', (e) => {
            if (e.target.closest('.ait-mermaid-controls')) return;
            isPanning = true;
            panStartX = e.clientX - viewerPanX;
            panStartY = e.clientY - viewerPanY;
            overlay.classList.add('panning');
        });

        const onMouseMove = (e) => {
            if (!isPanning) return;
            viewerPanX = e.clientX - panStartX;
            viewerPanY = e.clientY - panStartY;
            applyTransform(canvas);
        };
        const onMouseUp = () => {
            isPanning = false;
            overlay?.classList.remove('panning');
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);

        const onKeyDown = (e) => { if (e.key === 'Escape') closeFullscreen(); };
        document.addEventListener('keydown', onKeyDown);

        overlay.addEventListener('click', (e) => { if (e.target === overlay) closeFullscreen(); });

        overlay._cleanup = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            document.removeEventListener('keydown', onKeyDown);
        };
    }

    function closeFullscreen() {
        if (!fullscreenOverlay) return;
        const overlay = fullscreenOverlay;
        fullscreenOverlay = null;
        isPanning = false;
        overlay.classList.remove('visible');
        overlay._cleanup?.();
        setTimeout(() => overlay.remove(), 250);
    }

    function applyTransform(canvas) {
        canvas.style.transform = `translate(${viewerPanX}px, ${viewerPanY}px) scale(${viewerZoom})`;
    }

    // ===== 导出 =====

    if (typeof window !== 'undefined') {
        window.MermaidRenderer = {
            detect: detect,
            openFullscreen: openFullscreen,
            STORAGE_KEY: 'mermaidRendererEnabled'
        };
    }

})();
