/**
 * Conversation Export - DOM 富文本转换器
 *
 * 将平台渲染好的回复内容 DOM（如 Gemini 的 .markdown 容器）转换为：
 * - markdown：尽量保留段落/标题/列表/引用/代码块/链接/图片的可读 Markdown
 * - text：纯文本（用于 TXT / 预览 / PNG 渲染）
 * - images：去重后的图片信息列表
 *
 * 设计原则：
 * - 只保留正文，剔除按钮、图标、辅助朗读标签（sr-only/aria-hidden）、反馈按钮、来源列表等界面噪音
 * - 容错优先：任何未知结构都退化为其文本内容，不抛错
 */

class CEDomToMarkdown {
    constructor(options = {}) {
        // 命中这些选择器的元素整体跳过（界面噪音，非正文）
        this.ignoreSelectors = options.ignoreSelectors || [
            'button',
            'svg',
            'mat-icon',
            '[role="button"]',
            '[aria-hidden="true"]',
            '.sr-only',
            '.visually-hidden',
            '.cdk-visually-hidden',
            'script',
            'style',
            'noscript',
        ];
        this.minImageSize = options.minImageSize || CE_MIN_IMAGE_SIZE;
    }

    /**
     * 转换一个内容根元素。
     * @param {Element} root
     * @returns {{ markdown: string, text: string, images: Array }}
     */
    convert(root) {
        const images = [];
        const seenImages = new Set();

        if (!root) {
            return { markdown: '', text: '', images };
        }

        const collectImage = (img) => {
            const info = this._extractImageInfo(img, 'assistant');
            if (!info) return null;
            if (seenImages.has(info.src)) return null;
            seenImages.add(info.src);
            images.push(info);
            return info;
        };

        const markdown = this._renderBlock(root, { collectImage }).trim();
        const text = this._toPlainText(root).trim();

        return {
            markdown: this._normalizeBlankLines(markdown),
            text: this._normalizeBlankLines(text),
            images,
        };
    }

    /**
     * 从单个 img 元素提取图片信息（供用户消息/助手消息共用）。
     * @param {HTMLImageElement} img
     * @param {'user'|'assistant'} role
     * @returns {Object|null}
     */
    extractImage(img, role) {
        return this._extractImageInfo(img, role);
    }

    // ==================== 内部：块级渲染 ====================

    _shouldIgnore(el) {
        if (!(el instanceof Element)) return false;
        return this.ignoreSelectors.some(sel => {
            try { return el.matches(sel); } catch { return false; }
        });
    }

    /**
     * 渲染块级容器，返回带换行的 markdown 文本。
     */
    _renderBlock(el, ctx) {
        let out = '';
        for (const node of Array.from(el.childNodes)) {
            out += this._renderNode(node, ctx);
        }
        return out;
    }

    _renderNode(node, ctx) {
        if (node.nodeType === Node.TEXT_NODE) {
            return this._collapseInlineWhitespace(node.textContent);
        }
        if (node.nodeType !== Node.ELEMENT_NODE) {
            return '';
        }

        const el = /** @type {Element} */ (node);
        if (this._shouldIgnore(el)) return '';

        // 数学公式：提取 LaTeX 源码，避免 KaTeX 渲染节点产生乱码/丢失
        const formula = this._extractFormula(el);
        if (formula) {
            if (!formula.latex) return '';
            return formula.isDisplay
                ? `\n\n$$\n${formula.latex}\n$$\n\n`
                : `$${formula.latex}$`;
        }

        const tag = el.tagName.toLowerCase();

        switch (tag) {
            case 'h1': case 'h2': case 'h3':
            case 'h4': case 'h5': case 'h6': {
                const level = Number(tag[1]);
                const inline = this._renderInline(el, ctx).trim();
                return inline ? `\n\n${'#'.repeat(level)} ${inline}\n\n` : '';
            }
            case 'p': {
                const inline = this._renderInline(el, ctx).trim();
                return inline ? `\n\n${inline}\n\n` : '';
            }
            case 'br':
                return '\n';
            case 'hr':
                return '\n\n---\n\n';
            case 'ul':
            case 'ol':
                return `\n\n${this._renderList(el, ctx, tag === 'ol')}\n\n`;
            case 'blockquote': {
                const inner = this._renderBlock(el, ctx).trim();
                if (!inner) return '';
                const quoted = inner.split('\n').map(line => `> ${line}`.trimEnd()).join('\n');
                return `\n\n${quoted}\n\n`;
            }
            case 'pre':
                return `\n\n${this._renderCodeBlock(el)}\n\n`;
            case 'table':
                return `\n\n${this._renderTable(el, ctx)}\n\n`;
            case 'img': {
                const info = ctx.collectImage(el);
                if (!info) return '';
                return `\n\n![${this._escapeInline(info.alt || '')}](${info.src})\n\n`;
            }
            case 'figure':
            case 'div':
            case 'section':
            case 'article':
            case 'span':
            case 'main':
                // 容器：继续向下渲染
                return this._renderBlock(el, ctx);
            default:
                // 其他内联/未知元素：当作内联处理
                return this._renderInline(el, ctx);
        }
    }

    _renderList(listEl, ctx, ordered) {
        const items = Array.from(listEl.children).filter(c => c.tagName.toLowerCase() === 'li');
        const lines = [];
        items.forEach((li, index) => {
            if (this._shouldIgnore(li)) return;
            const marker = ordered ? `${index + 1}.` : '-';

            // 分离嵌套列表与本项内容
            const nestedLists = Array.from(li.children).filter(c => /^(ul|ol)$/i.test(c.tagName));
            const itemContent = this._renderInlineExcluding(li, ctx, nestedLists).trim();

            lines.push(`${marker} ${itemContent}`.trimEnd());

            nestedLists.forEach(nested => {
                const nestedMd = this._renderList(nested, ctx, nested.tagName.toLowerCase() === 'ol');
                nestedMd.split('\n').forEach(l => {
                    if (l.trim()) lines.push(`  ${l}`);
                });
            });
        });
        return lines.join('\n');
    }

    _renderCodeBlock(preEl) {
        const codeEl = preEl.querySelector('code') || preEl;
        const lang = this._detectCodeLanguage(preEl, codeEl);
        const raw = codeEl.textContent || '';
        const code = raw.replace(/\n+$/, '');
        return '```' + (lang || '') + '\n' + code + '\n```';
    }

    _detectCodeLanguage(preEl, codeEl) {
        const classNames = `${preEl.className} ${codeEl.className}`;
        const match = classNames.match(/language-([\w+-]+)/i) || classNames.match(/lang-([\w+-]+)/i);
        if (match) return match[1];
        const dataLang = preEl.getAttribute('data-language') || codeEl.getAttribute('data-language');
        return dataLang || '';
    }

    _renderTable(tableEl, ctx) {
        const rows = Array.from(tableEl.querySelectorAll('tr'));
        if (!rows.length) return '';

        const renderRow = (tr) => {
            const cells = Array.from(tr.querySelectorAll('th,td'))
                .map(cell => this._renderInline(cell, ctx).trim().replace(/\|/g, '\\|') || ' ');
            return `| ${cells.join(' | ')} |`;
        };

        const lines = [];
        const headerCells = Array.from(rows[0].querySelectorAll('th,td'));
        lines.push(renderRow(rows[0]));
        lines.push(`| ${headerCells.map(() => '---').join(' | ')} |`);
        for (let i = 1; i < rows.length; i++) {
            lines.push(renderRow(rows[i]));
        }
        return lines.join('\n');
    }

    // ==================== 内部：内联渲染 ====================

    _renderInline(el, ctx) {
        return this._renderInlineExcluding(el, ctx, []);
    }

    _renderInlineExcluding(el, ctx, excludeNodes) {
        let out = '';
        for (const node of Array.from(el.childNodes)) {
            if (excludeNodes.includes(node)) continue;

            if (node.nodeType === Node.TEXT_NODE) {
                out += this._collapseInlineWhitespace(node.textContent);
                continue;
            }
            if (node.nodeType !== Node.ELEMENT_NODE) continue;

            const child = /** @type {Element} */ (node);
            if (this._shouldIgnore(child)) continue;

            const inlineFormula = this._extractFormula(child);
            if (inlineFormula) {
                if (inlineFormula.latex) {
                    out += inlineFormula.isDisplay
                        ? `\n\n$$\n${inlineFormula.latex}\n$$\n\n`
                        : `$${inlineFormula.latex}$`;
                }
                continue;
            }

            const tag = child.tagName.toLowerCase();
            switch (tag) {
                case 'strong': case 'b': {
                    const inner = this._renderInline(child, ctx).trim();
                    out += inner ? `**${inner}**` : '';
                    break;
                }
                case 'em': case 'i': {
                    const inner = this._renderInline(child, ctx).trim();
                    out += inner ? `*${inner}*` : '';
                    break;
                }
                case 'code': {
                    const inner = (child.textContent || '').trim();
                    out += inner ? '`' + inner + '`' : '';
                    break;
                }
                case 'a': {
                    const inner = this._renderInline(child, ctx).trim();
                    const href = child.getAttribute('href');
                    if (inner && href && /^https?:/i.test(href)) {
                        out += `[${inner}](${href})`;
                    } else {
                        out += inner;
                    }
                    break;
                }
                case 'br':
                    out += '\n';
                    break;
                case 'img': {
                    const info = ctx.collectImage(child);
                    if (info) out += `![${this._escapeInline(info.alt || '')}](${info.src})`;
                    break;
                }
                case 'ul': case 'ol': case 'p': case 'pre':
                case 'blockquote': case 'table':
                    // 嵌在内联里的块级元素：退化为块渲染
                    out += this._renderNode(child, ctx);
                    break;
                default:
                    out += this._renderInline(child, ctx);
            }
        }
        return out;
    }

    // ==================== 内部：纯文本 ====================

    _toPlainText(root) {
        let out = '';
        const walk = (el) => {
            for (const node of Array.from(el.childNodes)) {
                if (node.nodeType === Node.TEXT_NODE) {
                    out += node.textContent;
                    continue;
                }
                if (node.nodeType !== Node.ELEMENT_NODE) continue;
                const child = /** @type {Element} */ (node);
                if (this._shouldIgnore(child)) continue;

                const formula = this._extractFormula(child);
                if (formula) {
                    if (formula.latex) {
                        out += formula.isDisplay ? `\n${formula.latex}\n` : formula.latex;
                    }
                    continue;
                }

                const tag = child.tagName.toLowerCase();
                if (/^(p|div|li|h[1-6]|blockquote|pre|tr|section|article)$/.test(tag)) {
                    walk(child);
                    out += '\n';
                } else if (tag === 'br') {
                    out += '\n';
                } else {
                    walk(child);
                }
            }
        };
        walk(root);
        return out;
    }

    // ==================== 内部：数学公式 ====================

    /**
     * 若 el 是数学公式，直接读取“复制公式”功能（FormulaManager）写入的
     * data-latex-source 属性获取 LaTeX 源码。
     *
     * 该属性由 FormulaManager.scanAndAttachFormulas 主动写入所有公式元素，
     * 因此这里只读属性、不再自行解析。MathML-only 公式时该属性为空字符串
     * （仅作已处理标记），此时返回空 latex，调用方据此跳过公式子树但不输出文本。
     *
     * @param {Element} el
     * @returns {{latex:string, isDisplay:boolean}|null}
     */
    _extractFormula(el) {
        if (!(el instanceof Element)) return null;
        if (!el.hasAttribute('data-latex-source')) return null;

        const latex = (el.getAttribute('data-latex-source') || '').trim();
        const isDisplay = !!el.closest('.katex-display') ||
            el.classList.contains('math-block') ||
            el.getAttribute('display') === 'block';

        return { latex, isDisplay };
    }

    // ==================== 内部：图片 ====================

    _extractImageInfo(img, role) {
        if (!(img instanceof HTMLImageElement)) return null;

        const src = img.currentSrc || img.src || img.getAttribute('src') || '';
        if (!src || src.startsWith('data:image/gif')) return null;

        const width = img.naturalWidth || img.width || 0;
        const height = img.naturalHeight || img.height || 0;

        // 过滤过小的装饰图（头像/图标）。尺寸未知时（width=0）保留。
        if (width && height && (width < this.minImageSize || height < this.minImageSize)) {
            return null;
        }

        return {
            role,
            src,
            alt: (img.getAttribute('alt') || '').trim(),
            width,
            height,
        };
    }

    // ==================== 内部：工具 ====================

    _collapseInlineWhitespace(text) {
        return (text || '').replace(/\s+/g, ' ');
    }

    _escapeInline(text) {
        return (text || '').replace(/([\[\]])/g, '\\$1');
    }

    _normalizeBlankLines(text) {
        return (text || '')
            .replace(/[ \t]+\n/g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }
}
