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
            const info = this.extractImage(img, 'assistant', root);
            if (!info) return null;
            if (seenImages.has(info.src)) return null;
            seenImages.add(info.src);
            images.push(info);
            return info;
        };

        // Mark both ends of each literal line until prose spacing, list indentation and quotes are formatted.
        const source = root.textContent || '';
        let boundary = '\u0000';
        while (source.includes(boundary)) boundary += boundary;
        const protect = code => code.split('\n').map(line => boundary + line + boundary).join('\n');
        const finish = text => this._normalizeBlankLines(text).replaceAll(boundary, '');
        const markdown = this._renderNode(root, { collectImage, protect });
        const text = this._toPlainText(root, protect);

        return {
            markdown: finish(markdown),
            text: finish(text),
            images,
        };
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
                return `\n\n${ctx.protect(this._renderCodeBlock(el))}\n\n`;
            case 'code':
                return ctx.protect(this._renderInlineCode(el));
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
        const code = this.literalText(codeEl);
        const fence = this._codeDelimiter(code, 3);
        return fence + lang + '\n' + code + '\n' + fence;
    }

    _codeDelimiter(code, minimum) {
        let length = minimum;
        for (const match of code.matchAll(/`+/g)) length = Math.max(length, match[0].length + 1);
        return '`'.repeat(length);
    }

    _renderInlineCode(el) {
        const code = this.literalText(el);
        if (!code) return '';
        const fence = this._codeDelimiter(code, 1);
        // CommonMark removes one padding space on each side of a nonblank code span.
        const pad = /^`|`$/.test(code) || (/^ [\s\S]* $/.test(code) && /[^ ]/.test(code)) ? ' ' : '';
        return fence + pad + code + pad + fence;
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
                    out += ctx.protect(this._renderInlineCode(child));
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

    /** 读取提问和代码的原始空白，兼容文本节点、显式 br 及分行容器。 */
    literalText(root) {
        if (!root) return '';
        // A lone br is the placeholder for an empty editable/paragraph line.
        if (root.childNodes.length === 1 && root.firstChild.nodeName === 'BR'
            && /^(DIV|P)$/.test(root.tagName)) return '';
        const parts = [];
        let previousBlock = false;
        for (const node of root.childNodes) {
            let text;
            let block = false;
            if (node.nodeType === Node.TEXT_NODE) {
                text = node.textContent;
            } else if (node.nodeType === Node.ELEMENT_NODE && !this._shouldIgnore(node)) {
                block = /^(DIV|P|PRE|LI|BLOCKQUOTE|SECTION|ARTICLE)$/.test(node.tagName);
                const formula = this._extractFormula(node);
                text = formula ? formula.latex : node.tagName === 'BR' ? '\n' : this.literalText(node);
            } else continue;
            if (!text && !block) continue;
            if (parts.length && (block || previousBlock)) parts.push('\n');
            parts.push(text);
            previousBlock = block;
        }
        return parts.join('');
    }

    _toPlainText(root, protect) {
        const codeText = el => protect(this.literalText(el.tagName === 'PRE' ? el.querySelector('code') || el : el));
        if (root.matches('pre, code')) return codeText(root);
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
                if (tag === 'pre' || tag === 'code') {
                    out += codeText(child);
                    if (tag === 'pre') out += '\n';
                } else if (/^(p|div|li|h[1-6]|blockquote|tr|section|article)$/.test(tag)) {
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
     * 优先读取 FormulaManager 已解析的源码；未标记的公式交给同一个
     * FormulaSourceParser 即时解析。导出不依赖公式复制开关或其异步扫描时机。
     *
     * @param {Element} el
     * @returns {{latex:string, isDisplay:boolean}|null}
     */
    _extractFormula(el) {
        if (!(el instanceof Element)) return null;
        if (el.closest('pre, code')) return null;

        let latex = (el.getAttribute('data-latex-source') || '').trim();
        if (!latex && typeof FormulaSourceParser !== 'undefined' && el.matches(
            '.katex, .katex-display, .math-inline, .math-block, .mwe-math-element, '
            + '.MathJax, .MathJax_SVG, mjx-container, math, [data-math], [data-latex], [copy-text]'
        )) {
            try { latex = FormulaSourceParser.parseLatex(el) || ''; } catch { /* preserve readable fallback */ }
        }
        // 无源码的 MathML 保留可读正文，不因空的已处理标记吞掉整个公式。
        if (!latex) return null;

        const isDisplay = !!el.closest('.katex-display') ||
            el.classList.contains('math-block') ||
            !!el.closest('math[display="block"]');

        return { latex, isDisplay };
    }

    // ==================== 内部：图片 ====================

    /**
     * @param {HTMLImageElement} img
     * @param {'user'|'assistant'} role
     * @param {Element|null} contentRoot - 平台适配器定位出的正文区域。
     * @returns {Object|null}
     */
    extractImage(img, role, contentRoot = null) {
        if (!(img instanceof HTMLImageElement)) return null;

        const src = img.currentSrc || img.src || img.getAttribute('src') || '';
        if (!src || img.closest('[hidden], [role="toolbar"], message-actions, [data-testid="message-actions"], '
            + '[data-cds="MessageActions"], .turn-action-controls, [data-ait-owned-ui], '
            + '[class*="avatar" i], [data-testid*="avatar" i], img[src*="/user-avatar/"], '
            + 'img[alt="user avatar" i], img[alt="assistant avatar" i], '
            + '.sr-only, .visually-hidden, .ds-icon-button, .icon, mat-icon, [data-icon]')) return null;

        const width = img.naturalWidth || img.width || 0;
        const height = img.naturalHeight || img.height || 0;
        const alt = (img.getAttribute('alt') || '').trim();
        const inContent = contentRoot?.contains(img);
        const button = img.closest('button, [role="button"]');
        const attachment = img.closest('generated-image, single-image, user-uploaded-image, '
            + '[data-attachment-id], [data-file-id], [data-testid*="attachment" i], [data-test-id*="attachment" i], '
            + '[class*="attachment" i], [class*="generated-image" i], [class*="image-preview" i], '
            + '[data-testid*="image-preview" i], [data-test-id*="image-preview" i], [data-testid*="generated-image" i]');
        const namedImage = /\.(?:png|jpe?g|gif|webp|avif|bmp|svg)$/i.test(alt)
            || /^(?:(?:uploaded|generated) image|(?:已上传|生成)的图片)$/i.test(alt);
        let mediaImage = attachment || namedImage;
        if (button) {
            const label = (button.getAttribute('aria-label') || button.title || '').trim();
            const preview = /^(?:open|view|preview|enlarge|expand|zoom)\b.*\b(?:image|photo|attachment)\b|^(?:查看|预览|放大)(?:原图|图片|附件)/i.test(label);
            mediaImage ||= preview;
            // 正文预览按钮可能没有标签或使用其他语言；用显示尺寸区分缩略图和图标。
            const contentThumbnail = inContent && (img.width || width) >= this.minImageSize
                && (img.height || height) >= this.minImageSize;
            if (!mediaImage && !contentThumbnail) return null;
            const isAction = /^(?:copy|download|edit|remove|delete|share|more actions)\b|^(?:复制|下载|编辑|移除|删除|分享|更多)/i.test(label);
            // 下载按钮有时直接以附件缩略图为内容；附件容器旁的下载图标则跳过。
            const generatedPreview = /^(?:edit\b|编辑)/i.test(label)
                && img.matches('[class~="group/generated-image-preview"] > button > img');
            if (isAction && !generatedPreview && !namedImage && !(attachment && attachment !== button && button.contains(attachment))) return null;
        }
        if (!mediaImage && img.closest('[aria-hidden="true"], [role="presentation"]')) return null;
        const isContent = mediaImage || inContent || img.closest('figure, picture');
        // 扫描整条消息时，只有正文和附件以外的未识别图片才按旧规则过滤。
        if (!isContent && (src.startsWith('data:image/gif')
            || (width && height && (width < this.minImageSize || height < this.minImageSize)))) return null;

        return {
            role,
            src,
            alt,
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
