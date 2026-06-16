/**
 * Selection Copy
 *
 * 选区复制增强：当选区包含「文本高亮」或「公式」时，提供"复制"按钮。
 * 复制后剪贴板包含两份内容：
 *   - text/html  — 保留高亮的视觉样式（inline style），公式转 LaTeX/MathML 节点
 *   - text/plain — 公式按 formulaFormat 模板（如 $%s$）输出，其余按 textContent
 *
 * 公式优先级（按用户设置）：
 *   - 同时启用：LaTeX → MathML 兜底
 *   - 仅 LaTeX：仅 LaTeX，无源时跳过
 *   - 仅 MathML：仅 MathML
 *   - 全部关闭：公式不再作为触发器（高亮仍然算）
 *
 * 该模块完全独立，不依赖 QuickAsk / Highlight；
 * 通过 window.AIChatTimelineSelectionCopy 暴露能力。
 */

(function () {
    'use strict';

    // 公式元素选择器：覆盖 KaTeX、豆包、维基、MathJax、Gemini、Grok、Meta.ai 等
    const FORMULA_SELECTOR = (() => {
        const parts = [
            '.katex-display',
            '.katex',
            '.math-inline',
            '.math-display',
            '.mwe-math-element',
            '.MathJax_Display',
            '.MathJax_SVG',
            '.MathJax',
            '[data-mathml]',
            '[copy-text]',
            'img[data-latex-source]'
        ];
        if (location.hostname.endsWith('meta.ai')) {
            parts.push('[data-testid="assistant-message"] .markdown-content img[alt]');
        }
        return parts.join(',');
    })();

    // 临时标记属性：在原 DOM 上短暂打标，cloneContents 后通过该属性回查
    // 使用前缀防止与页面冲突，try/finally 保证一定移除
    const COPY_MARKER_ATTR = 'data-ait-copy-marker';

    /**
     * 选区复制管理器
     */
    class SelectionCopyManager {
        constructor() {
            // 公式相关配置（异步从 storage 加载）
            this._config = {
                latexOn: true,    // formulaLatexEnabled，默认 true
                mathmlOn: false,  // formulaMathMLEnabled，默认 false
                template: '%s'    // formulaFormat 对应的模板
            };
            this._configReady = false;
            this._initConfig();
        }

        // ==================== 配置 ====================

        async _initConfig() {
            try {
                const r = await chrome.storage.local.get([
                    'formulaLatexEnabled',
                    'formulaMathMLEnabled',
                    'formulaFormat'
                ]);
                this._applyConfig(r);
                this._configReady = true;
            } catch (e) {
                console.warn('[SelectionCopy] init config failed:', e);
                this._configReady = true; // 用默认值
            }

            try {
                chrome.storage.onChanged.addListener((changes, area) => {
                    if (area !== 'local') return;
                    const next = {};
                    if (changes.formulaLatexEnabled) {
                        next.formulaLatexEnabled = changes.formulaLatexEnabled.newValue;
                    }
                    if (changes.formulaMathMLEnabled) {
                        next.formulaMathMLEnabled = changes.formulaMathMLEnabled.newValue;
                    }
                    if (changes.formulaFormat) {
                        next.formulaFormat = changes.formulaFormat.newValue;
                    }
                    if (Object.keys(next).length) {
                        this._applyConfig({ ...this._readableConfig(), ...next });
                    }
                });
            } catch (e) {
                console.warn('[SelectionCopy] storage listener failed:', e);
            }
        }

        _readableConfig() {
            return {
                formulaLatexEnabled: this._config.latexOn,
                formulaMathMLEnabled: this._config.mathmlOn,
                formulaFormat: this._config.formatId
            };
        }

        _applyConfig(raw) {
            this._config.latexOn = raw.formulaLatexEnabled !== false;
            this._config.mathmlOn = raw.formulaMathMLEnabled === true;
            this._config.formatId = raw.formulaFormat || 'none';

            const list = (typeof FORMULA_FORMATS !== 'undefined') ? FORMULA_FORMATS : null;
            const fmt = list ? list.find(f => f.id === this._config.formatId) : null;
            this._config.template = fmt?.template || '%s';
        }

        // ==================== 选区检测 ====================

        /**
         * 选区是否包含「高亮 OR 公式」（且公式提取至少有一种被启用）
         * 同步、低成本：只在 _showButton 调用一次
         */
        hasRichContent(range) {
            if (!range || range.collapsed) return false;

            const root = this._getRangeRoot(range);
            if (!root) return false;

            if (this._rangeHasHighlight(range, root)) return true;

            const formulasEnabled = this._config.latexOn || this._config.mathmlOn;
            if (formulasEnabled && this._rangeHasFormula(range, root)) return true;

            return false;
        }

        _getRangeRoot(range) {
            const ac = range.commonAncestorContainer;
            if (!ac) return null;
            return ac.nodeType === Node.TEXT_NODE ? ac.parentElement : ac;
        }

        _rangeHasHighlight(range, root) {
            const marks = root.querySelectorAll('mark.ait-highlight');
            for (const m of marks) {
                if (range.intersectsNode(m)) return true;
            }
            return false;
        }

        _rangeHasFormula(range, root) {
            const candidates = root.querySelectorAll(FORMULA_SELECTOR);
            for (const el of candidates) {
                if (range.intersectsNode(el)) return true;
            }
            return false;
        }

        // ==================== 公式定位 ====================

        /**
         * 找出选区内所有「最外层」公式元素
         * 公式结构往往嵌套（.katex 内含 .katex-mathml/.katex-html），
         * 我们只取最外层那一个，避免重复处理。
         */
        _findOutermostFormulas(range, root) {
            const all = Array.from(root.querySelectorAll(FORMULA_SELECTOR));
            return all.filter(el => {
                if (!range.intersectsNode(el)) return false;
                if (el.parentElement?.closest(FORMULA_SELECTOR)) return false;
                return true;
            });
        }

        // ==================== Payload 构建 ====================

        /**
         * 构建剪贴板 payload
         * @param {Range} range
         * @returns {{ html: string, plain: string }}
         */
        buildPayload(range) {
            if (!range || range.collapsed) {
                return { html: '', plain: '' };
            }

            const root = this._getRangeRoot(range);
            if (!root) return { html: '', plain: '' };

            const formulas = this._findOutermostFormulas(range, root);

            // 在原 DOM 短暂打标，cloneContents 后两次扫描回查
            formulas.forEach((el, i) => el.setAttribute(COPY_MARKER_ATTR, String(i)));

            try {
                const html = this._buildHtml(range, formulas);
                const plain = this._buildPlain(range, formulas);
                return { html, plain };
            } finally {
                formulas.forEach(el => el.removeAttribute(COPY_MARKER_ATTR));
            }
        }

        _buildHtml(range, formulas) {
            const fragment = range.cloneContents();

            // 替换公式
            fragment.querySelectorAll(`[${COPY_MARKER_ATTR}]`).forEach(cloneEl => {
                const idx = parseInt(cloneEl.getAttribute(COPY_MARKER_ATTR), 10);
                const original = formulas[idx];
                if (!original) {
                    cloneEl.removeAttribute(COPY_MARKER_ATTR);
                    return;
                }
                const replacement = this._formulaToHtml(original);
                if (replacement) {
                    cloneEl.replaceWith(replacement);
                } else {
                    // 无源可提取：保留原 DOM 视觉，仅清理标记
                    cloneEl.removeAttribute(COPY_MARKER_ATTR);
                }
            });

            // 高亮：转为 <span> 并保留 inline style，剥离扩展私有属性
            // 同时覆盖 pending 态（编辑中的标注），避免私有 class 泄漏
            fragment.querySelectorAll('mark.ait-highlight, mark.ait-highlight-pending').forEach(mark => {
                this._sanitizeHighlightMark(mark);
            });

            const container = document.createElement('div');
            container.appendChild(fragment);
            return container.innerHTML;
        }

        _buildPlain(range, formulas) {
            const fragment = range.cloneContents();

            fragment.querySelectorAll(`[${COPY_MARKER_ATTR}]`).forEach(cloneEl => {
                const idx = parseInt(cloneEl.getAttribute(COPY_MARKER_ATTR), 10);
                const original = formulas[idx];
                if (!original) return;
                const text = this._formulaToPlain(original);
                if (text !== null) {
                    cloneEl.replaceWith(document.createTextNode(text));
                }
                // 无源时保留原始克隆（textContent 会拿到公式的渲染后文本，至少不丢内容）
            });

            // 浏览器 Cmd+C 默认会用换行表达块级元素，这里使用一个轻量 walker 做近似
            return this._fragmentToPlainText(fragment);
        }

        // ==================== 公式转换 ====================

        _formulaToHtml(originalEl) {
            const { latexOn, mathmlOn, template } = this._config;

            if (latexOn) {
                const latex = this._safeParseLatex(originalEl);
                if (latex) {
                    const wrapped = template.replace('%s', latex);
                    const span = document.createElement('span');
                    span.setAttribute('data-ait-formula', 'latex');
                    span.textContent = wrapped;
                    return span;
                }
            }

            if (mathmlOn) {
                const mathml = this._safeParseMathML(originalEl);
                if (mathml) {
                    const wrapper = document.createElement('span');
                    wrapper.setAttribute('data-ait-formula', 'mathml');
                    // 安全注入：用 template 元素解析 XML/HTML 字符串
                    const tmpl = document.createElement('template');
                    tmpl.innerHTML = mathml;
                    wrapper.appendChild(tmpl.content.cloneNode(true));
                    return wrapper;
                }
            }

            return null;
        }

        _formulaToPlain(originalEl) {
            const { latexOn, mathmlOn, template } = this._config;

            if (latexOn) {
                const latex = this._safeParseLatex(originalEl);
                if (latex) return template.replace('%s', latex);
            }

            if (mathmlOn) {
                const mathml = this._safeParseMathML(originalEl);
                if (mathml) return mathml;
            }

            return null;
        }

        _safeParseLatex(el) {
            try {
                if (typeof FormulaSourceParser === 'undefined') return null;
                const raw = FormulaSourceParser.parseLatex(el);
                return raw ? raw.trim() : null;
            } catch (e) {
                console.warn('[SelectionCopy] parseLatex failed:', e);
                return null;
            }
        }

        _safeParseMathML(el) {
            try {
                if (typeof FormulaSourceParser === 'undefined') return null;
                const raw = FormulaSourceParser.parseMathML(el);
                return raw ? raw.trim() : null;
            } catch (e) {
                console.warn('[SelectionCopy] parseMathML failed:', e);
                return null;
            }
        }

        // ==================== 高亮清洗 ====================

        /**
         * 把扩展内部的 <mark.ait-highlight> 转成纯样式 <span>
         * - 仅保留 inline style（视觉样式）
         * - 移除：class、data-hl-id、data-hl-style、title（批注）等扩展私有属性
         */
        _sanitizeHighlightMark(markEl) {
            const span = document.createElement('span');
            const style = markEl.getAttribute('style');
            if (style) span.setAttribute('style', style);
            while (markEl.firstChild) {
                span.appendChild(markEl.firstChild);
            }
            markEl.replaceWith(span);
        }

        // ==================== 纯文本输出 ====================

        /**
         * 将 fragment 转为纯文本，对块级元素插入 \n，对 <br> 插入 \n
         * 保留与浏览器 Cmd+C 行为接近的换行语义
         */
        _fragmentToPlainText(fragment) {
            const BLOCK_TAGS = new Set([
                'P', 'DIV', 'BLOCKQUOTE', 'PRE', 'LI', 'TR',
                'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
                'UL', 'OL', 'TABLE', 'THEAD', 'TBODY', 'TFOOT',
                'SECTION', 'ARTICLE', 'HEADER', 'FOOTER',
                'FIGURE', 'FIGCAPTION', 'HR', 'DL', 'DT', 'DD'
            ]);

            const out = [];
            const walk = (node) => {
                if (!node) return;
                if (node.nodeType === Node.TEXT_NODE) {
                    out.push(node.textContent);
                    return;
                }
                if (node.nodeType !== Node.ELEMENT_NODE) return;

                const tag = node.tagName;
                if (tag === 'BR') { out.push('\n'); return; }
                if (tag === 'SCRIPT' || tag === 'STYLE') return;

                const isBlock = BLOCK_TAGS.has(tag);
                if (isBlock && out.length && !out[out.length - 1].endsWith('\n')) {
                    out.push('\n');
                }

                for (const child of node.childNodes) walk(child);

                if (isBlock && out.length && !out[out.length - 1].endsWith('\n')) {
                    out.push('\n');
                }
            };

            for (const child of fragment.childNodes) walk(child);
            return out.join('').replace(/\n{3,}/g, '\n\n').trim();
        }

        // ==================== 剪贴板写入 ====================

        /**
         * 复制选区（必须在用户手势的同步路径上调用以确保 user gesture）
         * @param {Range} range
         * @returns {Promise<boolean>}
         */
        async copyRange(range) {
            const { html, plain } = this.buildPayload(range);
            if (!html && !plain) return false;

            try {
                if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
                    const wrapped = `<html><body>${html}</body></html>`;
                    const item = new ClipboardItem({
                        'text/html': new Blob([wrapped], { type: 'text/html' }),
                        'text/plain': new Blob([plain], { type: 'text/plain' })
                    });
                    await navigator.clipboard.write([item]);
                } else {
                    await navigator.clipboard.writeText(plain);
                }
                return true;
            } catch (e) {
                console.error('[SelectionCopy] clipboard write failed:', e);
                // 退路：用 execCommand 模拟一次（部分老环境）
                return this._fallbackCopy(plain);
            }
        }

        _fallbackCopy(text) {
            try {
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;';
                document.body.appendChild(ta);
                ta.select();
                const ok = document.execCommand('copy');
                ta.remove();
                return ok;
            } catch (e) {
                console.error('[SelectionCopy] fallback copy failed:', e);
                return false;
            }
        }
    }

    // ==================== 暴露接口 ====================

    if (!window.AIChatTimelineSelectionCopy) {
        const instance = new SelectionCopyManager();
        window.AIChatTimelineSelectionCopy = {
            hasRichContent: (range) => instance.hasRichContent(range),
            buildPayload: (range) => instance.buildPayload(range),
            copyRange: (range) => instance.copyRange(range),
            _instance: instance
        };
    }
})();
