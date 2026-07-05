/**
 * Conversation Export - PNG 导出器
 *
 * 无第三方库，纯 Canvas 绘制一张完整长图。
 * - 头部主题色区：标题、来源、导出时间
 * - 正文：逐轮渲染用户/助手内容，尽量呈现接近阅读视图的排版
 *   （段落、标题、列表、引用、代码块、图片）
 * - 图片：尝试内嵌；无法加载/跨域受限时显示占位提示
 * - 超长对话：当高度超过浏览器画布上限时截断，并显示提示
 */

class CEPngExporter {
    constructor() {
        this.PAGE_WIDTH = 820;
        this.PADDING_X = 40;
        this.contentWidth = this.PAGE_WIDTH - this.PADDING_X * 2;
        this.IMAGE_LOAD_TIMEOUT = 8000;
        this.MAX_IMAGE_HEIGHT = 460;

        this.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", Helvetica, Arial, sans-serif';
        this.monoFamily = '"SF Mono", "Cascadia Code", Consolas, "Courier New", monospace';

        this.colors = {
            bg: '#ffffff',
            text: '#1f2937',
            subtle: '#6b7280',
            userBg: '#f3f4f6',
            assistantRule: '#e5e7eb',
            codeBg: '#f6f8fa',
            codeText: '#24292e',
            quoteBar: '#d1d5db',
            divider: '#e5e7eb',
            placeholderBg: '#f3f4f6',
            placeholderText: '#9ca3af',
        };
    }

    /**
     * 导出 PNG。
     * @param {Object} job
     * @param {string} themeId
     * @returns {Promise<Blob>}
     */
    async export(job, themeId) {
        const theme = ceGetTheme(themeId);
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        // 测量用 ctx
        const measureCanvas = document.createElement('canvas');
        const measureCtx = measureCanvas.getContext('2d');

        // 预加载图片
        const imageMap = await this._preloadImages(job.turns);

        // 公式渲染能力探测 + 预渲染（LaTeX → MathML → SVG 图片）
        this.formulaCapable = await this._probeFormulaRendering();
        this.formulaImages = await this._preloadFormulas(job.turns);

        // 构建绘制操作（含测量高度）
        const headerBlock = this._buildHeader(measureCtx, job, theme);
        const bodyOps = this._buildBodyOps(measureCtx, job, imageMap);

        // 计算高度并处理截断
        const { ops, totalHeight, truncated } = this._layout(measureCtx, headerBlock.height, bodyOps);

        // 真正绘制
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(this.PAGE_WIDTH * dpr);
        canvas.height = Math.round(totalHeight * dpr);
        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
        ctx.textBaseline = 'top';

        // 背景
        ctx.fillStyle = this.colors.bg;
        ctx.fillRect(0, 0, this.PAGE_WIDTH, totalHeight);

        // 头部
        headerBlock.paint(ctx, 0, theme);

        // 正文
        let y = headerBlock.height;
        for (const op of ops) {
            op.paint(ctx, y);
            y += op.height;
        }

        // 截断提示
        if (truncated) {
            this._paintTruncationNotice(ctx, y);
        }

        return await this._canvasToBlob(canvas);
    }

    // ==================== 布局/截断 ====================

    _layout(ctx, headerHeight, bodyOps) {
        const maxBody = CE_MAX_CANVAS_HEIGHT - headerHeight - 80; // 预留底部边距/提示
        const ops = [];
        let used = 0;
        let truncated = false;

        for (const op of bodyOps) {
            if (used + op.height > maxBody) {
                truncated = true;
                break;
            }
            ops.push(op);
            used += op.height;
        }

        const bottomPadding = 32;
        const noticeSpace = truncated ? 56 : 0;
        const totalHeight = Math.ceil(headerHeight + used + bottomPadding + noticeSpace);
        return { ops, totalHeight, truncated };
    }

    _paintTruncationNotice(ctx, y) {
        this._setFont(ctx, { size: 14, weight: '500' });
        ctx.fillStyle = this.colors.subtle;
        ctx.textAlign = 'center';
        ctx.fillText(CE_TEXT.truncatedNotice, this.PAGE_WIDTH / 2, y + 16);
        ctx.textAlign = 'left';
    }

    // ==================== 头部 ====================

    _buildHeader(ctx, job, theme) {
        const padX = this.PADDING_X;
        const padTop = 32;
        const innerWidth = this.contentWidth;

        this._setFont(ctx, { size: 24, weight: '700' });
        const titleLines = this._wrapText(ctx, job.meta.title || '', innerWidth);

        const metaLines = [];
        if (job.options.showUrl && job.meta.url) {
            metaLines.push(`${CE_TEXT.sourceLabel}: ${job.meta.url}`);
        }
        if (job.options.showTime) {
            metaLines.push(`${CE_TEXT.timeLabel}: ${ceFormatLocalTime(job.meta.exportTime)}`);
        }

        const titleLineHeight = 32;
        const metaLineHeight = 20;
        const gap = metaLines.length ? 14 : 0;
        const height = padTop + titleLines.length * titleLineHeight + gap +
            metaLines.length * metaLineHeight + 28;

        const self = this;
        return {
            height,
            paint(c, top, themeDef) {
                // 主题背景
                self._fillThemeBackground(c, top, height, themeDef);

                c.fillStyle = themeDef.textColor;
                c.textAlign = 'left';

                let cursor = top + padTop;
                self._setFont(c, { size: 24, weight: '700' });
                for (const line of titleLines) {
                    c.fillText(line, padX, cursor);
                    cursor += titleLineHeight;
                }

                if (metaLines.length) {
                    cursor += gap - 6;
                    self._setFont(c, { size: 13, weight: '400' });
                    c.globalAlpha = 0.9;
                    for (const line of metaLines) {
                        const clipped = self._clipToWidth(c, line, innerWidth);
                        c.fillText(clipped, padX, cursor);
                        cursor += metaLineHeight;
                    }
                    c.globalAlpha = 1;
                }
            },
        };
    }

    _fillThemeBackground(ctx, top, height, theme) {
        if (theme.gradient) {
            // 135deg 渐变
            const grad = ctx.createLinearGradient(0, top, this.PAGE_WIDTH, top + height);
            theme.gradient.forEach(([offset, color]) => grad.addColorStop(offset, color));
            ctx.fillStyle = grad;
        } else {
            ctx.fillStyle = theme.solid || '#0d0d0d';
        }
        ctx.fillRect(0, top, this.PAGE_WIDTH, height);
    }

    // ==================== 正文 ====================

    _buildBodyOps(ctx, job, imageMap) {
        const ops = [];

        job.turns.forEach((turn, index) => {
            if (index > 0) ops.push(this._dividerOp());

            ops.push(this._turnLabelOp(ctx, `${CE_TEXT.turnPrefix} ${turn.order}`));

            // 用户
            ops.push(this._roleLabelOp(ctx, CE_TEXT.userLabel));
            ops.push(this._userTextOp(ctx, turn.user?.text || CE_TEXT.emptyUserPreview));
            (turn.user?.images || []).forEach(image => {
                ops.push(this._imageOp(image, imageMap));
            });

            // 助手
            ops.push(this._roleLabelOp(ctx, CE_TEXT.assistantLabel));
            const blocks = this._parseMarkdownBlocks(turn.assistant?.markdown || '');
            if (!blocks.length) {
                ops.push(this._paragraphOp(ctx, turn.assistant?.text || CE_TEXT.emptyAssistant));
            } else {
                blocks.forEach(block => ops.push(this._markdownBlockOp(ctx, block)));
            }
            (turn.assistant?.images || []).forEach(image => {
                ops.push(this._imageOp(image, imageMap));
            });
        });

        return ops;
    }

    _dividerOp() {
        const self = this;
        return {
            height: 33,
            paint(c, y) {
                c.strokeStyle = self.colors.divider;
                c.lineWidth = 1;
                c.beginPath();
                c.moveTo(self.PADDING_X, y + 16);
                c.lineTo(self.PAGE_WIDTH - self.PADDING_X, y + 16);
                c.stroke();
            },
        };
    }

    _turnLabelOp(ctx, text) {
        const self = this;
        return {
            height: 34,
            paint(c, y) {
                self._setFont(c, { size: 13, weight: '700' });
                c.fillStyle = self.colors.subtle;
                c.textAlign = 'left';
                c.fillText(text, self.PADDING_X, y + 10);
            },
        };
    }

    _roleLabelOp(ctx, text) {
        const self = this;
        return {
            height: 28,
            paint(c, y) {
                self._setFont(c, { size: 14, weight: '700' });
                c.fillStyle = self.colors.text;
                c.textAlign = 'left';
                c.fillText(`${text}`, self.PADDING_X, y + 6);
            },
        };
    }

    _userTextOp(ctx, text) {
        const self = this;
        const padding = 14;
        const lineHeight = 22;
        this._setFont(ctx, { size: 15, weight: '400' });
        const lines = this._wrapText(ctx, text, this.contentWidth - padding * 2);
        const boxHeight = lines.length * lineHeight + padding * 2;

        return {
            height: boxHeight + 10,
            paint(c, y) {
                const boxTop = y;
                self._roundRect(c, self.PADDING_X, boxTop, self.contentWidth, boxHeight, 10);
                c.fillStyle = self.colors.userBg;
                c.fill();

                self._setFont(c, { size: 15, weight: '400' });
                c.fillStyle = self.colors.text;
                c.textAlign = 'left';
                let cursor = boxTop + padding;
                for (const line of lines) {
                    c.fillText(line, self.PADDING_X + padding, cursor);
                    cursor += lineHeight;
                }
            },
        };
    }

    _paragraphOp(ctx, text) {
        return this._richTextOp(ctx, text, {
            font: { size: 15, weight: '400' },
            lineHeight: 23,
            topPad: 4,
            bottomPad: 6,
        });
    }

    /**
     * 通用富文本块渲染：支持内联公式（文本 + 公式图片混排），
     * 可选列表标记 / 引用竖条 / 缩进。段落、列表项、标题、引用共用。
     * @param {CanvasRenderingContext2D} ctx
     * @param {string} rawText - 原始文本（含内联 $...$，此处才做公式切分与清洗）
     * @param {Object} opts
     */
    _richTextOp(ctx, rawText, opts) {
        const self = this;
        const font = opts.font;
        const lineHeight = opts.lineHeight || 23;
        const color = opts.color || this.colors.text;
        const indent = opts.indent || 0;
        const marker = opts.marker || null;
        const markerDx = opts.markerDx || 0;
        const topPad = opts.topPad != null ? opts.topPad : 4;
        const bottomPad = opts.bottomPad != null ? opts.bottomPad : 6;
        const quoteBar = !!opts.quoteBar;

        const maxWidth = this.contentWidth - indent;
        const tokens = this._tokenizeInline(rawText);
        const hasFormula = tokens.some(t => t.type === 'formula');

        let lines;
        if (hasFormula) {
            lines = this._layoutInline(ctx, tokens, maxWidth, font);
        } else {
            const plain = tokens.map(t => t.text).join('');
            this._setFont(ctx, font);
            lines = this._wrapText(ctx, plain, maxWidth).map(t => [{ type: 'text', text: t, w: 0 }]);
        }

        const innerHeight = lines.length * lineHeight;
        return {
            height: innerHeight + topPad + bottomPad,
            paint(c, y) {
                c.textAlign = 'left';
                if (quoteBar) {
                    c.fillStyle = self.colors.quoteBar;
                    c.fillRect(self.PADDING_X, y + topPad, 3, innerHeight);
                }
                if (marker) {
                    self._setFont(c, font);
                    c.fillStyle = color;
                    c.fillText(marker, self.PADDING_X + markerDx, y + topPad);
                }
                let cursor = y + topPad;
                const startX = self.PADDING_X + indent;
                for (const line of lines) {
                    let cx = startX;
                    for (const item of line) {
                        if (item.type === 'formula' && item.entry && item.entry.element) {
                            try {
                                c.drawImage(item.entry.element, cx, cursor + (lineHeight - item.h) / 2 - 2, item.w, item.h);
                            } catch {
                                self._setFont(c, font);
                                c.fillStyle = color;
                                c.fillText(item.fallback, cx, cursor);
                            }
                        } else if (item.type === 'formula') {
                            self._setFont(c, font);
                            c.fillStyle = color;
                            c.fillText(item.fallback, cx, cursor);
                        } else {
                            self._setFont(c, font);
                            c.fillStyle = color;
                            c.fillText(item.text, cx, cursor);
                        }
                        cx += (item.w || 0);
                    }
                    cursor += lineHeight;
                }
            },
        };
    }

    /**
     * 将含内联公式的文本切分为 token：文本片段与 {latex} 公式片段。
     * 文本片段会做内联标记清洗，公式片段保留原始 LaTeX。
     */
    _tokenizeInline(rawText) {
        const tokens = [];
        const re = /\$([^$\n]+?)\$/g;
        let last = 0;
        let m;
        while ((m = re.exec(rawText)) !== null) {
            if (m.index > last) {
                tokens.push({ type: 'text', text: this._cleanInline(rawText.slice(last, m.index)) });
            }
            tokens.push({ type: 'formula', latex: m[1].trim() });
            last = re.lastIndex;
        }
        if (last < rawText.length) {
            tokens.push({ type: 'text', text: this._cleanInline(rawText.slice(last)) });
        }
        return tokens;
    }

    /**
     * 行内混排布局：文本按字符换行，公式作为整体盒子换行。
     * @returns {Array<Array<{type,text?,entry?,w,h?,fallback?}>>}
     */
    _layoutInline(ctx, tokens, maxWidth, font) {
        const inlineH = Math.round((font && font.size ? font.size : 15) * 1.15);
        const lines = [];
        let line = [];
        let x = 0;
        const pushLine = () => { lines.push(line); line = []; x = 0; };

        for (const token of tokens) {
            if (token.type === 'text') {
                this._setFont(ctx, font);
                for (const ch of token.text) {
                    const cw = ctx.measureText(ch).width;
                    if (x + cw > maxWidth && line.length) pushLine();
                    const lastItem = line[line.length - 1];
                    if (lastItem && lastItem.type === 'text') {
                        lastItem.text += ch;
                        lastItem.w += cw;
                    } else {
                        line.push({ type: 'text', text: ch, w: cw });
                    }
                    x += cw;
                }
            } else {
                const key = 'I:' + token.latex;
                const entry = (this.formulaCapable && this.formulaImages) ? this.formulaImages.get(key) : null;
                const usable = !!(entry && entry.element);
                let w;
                let h = inlineH;
                if (usable) {
                    w = entry.width * (inlineH / entry.height);
                } else {
                    this._setFont(ctx, font);
                    w = ctx.measureText(token.latex).width;
                }
                if (x + w > maxWidth && line.length) pushLine();
                line.push({ type: 'formula', entry: usable ? entry : null, w, h, fallback: token.latex });
                x += w;
            }
        }
        if (line.length) pushLine();
        return lines;
    }

    _markdownBlockOp(ctx, block) {
        switch (block.kind) {
            case 'heading': return this._headingOp(ctx, block);
            case 'listitem': return this._listItemOp(ctx, block);
            case 'quote': return this._quoteOp(ctx, block);
            case 'code': return this._codeOp(ctx, block);
            case 'formula': return this._formulaBlockOp(ctx, block);
            default: return this._paragraphOp(ctx, block.text);
        }
    }

    _formulaBlockOp(ctx, block) {
        const self = this;
        const key = 'D:' + block.latex;
        const entry = (this.formulaCapable && this.formulaImages) ? this.formulaImages.get(key) : null;

        if (entry && entry.element) {
            let w = entry.width;
            let h = entry.height;
            if (w > this.contentWidth) {
                const ratio = this.contentWidth / w;
                w = this.contentWidth;
                h = h * ratio;
            }
            return {
                height: h + 24,
                paint(c, y) {
                    const x = self.PADDING_X + (self.contentWidth - w) / 2;
                    try {
                        c.drawImage(entry.element, x, y + 12, w, h);
                    } catch {
                        self._paintCenteredText(c, y, block.latex);
                    }
                },
            };
        }

        // 回退：居中显示 LaTeX 文本
        const lineHeight = 23;
        this._setFont(ctx, { size: 15, weight: '400' });
        const lines = this._wrapText(ctx, block.latex, this.contentWidth);
        return {
            height: lines.length * lineHeight + 16,
            paint(c, y) {
                self._setFont(c, { size: 15, weight: '400' });
                c.fillStyle = self.colors.text;
                c.textAlign = 'center';
                let cursor = y + 8;
                for (const line of lines) {
                    c.fillText(line, self.PAGE_WIDTH / 2, cursor);
                    cursor += lineHeight;
                }
                c.textAlign = 'left';
            },
        };
    }

    _paintCenteredText(ctx, y, text) {
        this._setFont(ctx, { size: 15, weight: '400' });
        ctx.fillStyle = this.colors.text;
        ctx.textAlign = 'center';
        ctx.fillText(text, this.PAGE_WIDTH / 2, y + 12);
        ctx.textAlign = 'left';
    }

    _headingOp(ctx, block) {
        const size = block.level <= 1 ? 20 : block.level === 2 ? 18 : 16;
        return this._richTextOp(ctx, block.text, {
            font: { size, weight: '700' },
            lineHeight: size + 8,
            topPad: 8,
            bottomPad: 4,
        });
    }

    _listItemOp(ctx, block) {
        const marker = block.ordered ? `${block.index}.` : '•';
        return this._richTextOp(ctx, block.text, {
            font: { size: 15, weight: '400' },
            lineHeight: 23,
            indent: 22 + block.depth * 18,
            marker,
            markerDx: block.depth * 18,
            topPad: 3,
            bottomPad: 3,
        });
    }

    _quoteOp(ctx, block) {
        return this._richTextOp(ctx, block.text, {
            font: { size: 15, weight: '400' },
            lineHeight: 23,
            indent: 18,
            color: this.colors.subtle,
            quoteBar: true,
            topPad: 2,
            bottomPad: 10,
        });
    }

    _codeOp(ctx, block) {
        const self = this;
        const padding = 14;
        const lineHeight = 20;
        this._setFont(ctx, { size: 13, mono: true });
        const rawLines = block.code.split('\n');
        const wrapped = [];
        rawLines.forEach(line => {
            const parts = this._wrapText(ctx, line || ' ', this.contentWidth - padding * 2);
            wrapped.push(...(parts.length ? parts : ['']));
        });
        const boxHeight = wrapped.length * lineHeight + padding * 2;

        return {
            height: boxHeight + 12,
            paint(c, y) {
                self._roundRect(c, self.PADDING_X, y, self.contentWidth, boxHeight, 8);
                c.fillStyle = self.colors.codeBg;
                c.fill();

                self._setFont(c, { size: 13, mono: true });
                c.fillStyle = self.colors.codeText;
                c.textAlign = 'left';
                let cursor = y + padding;
                for (const line of wrapped) {
                    c.fillText(line, self.PADDING_X + padding, cursor);
                    cursor += lineHeight;
                }
            },
        };
    }

    _imageOp(image, imageMap) {
        const self = this;
        const entry = imageMap.get(image.src);

        if (entry && entry.element) {
            const naturalW = entry.width || entry.element.naturalWidth || 1;
            const naturalH = entry.height || entry.element.naturalHeight || 1;
            const drawWidth = Math.min(naturalW, this.contentWidth);
            let drawHeight = (naturalH / naturalW) * drawWidth;
            let finalWidth = drawWidth;
            if (drawHeight > this.MAX_IMAGE_HEIGHT) {
                const ratio = this.MAX_IMAGE_HEIGHT / drawHeight;
                drawHeight = this.MAX_IMAGE_HEIGHT;
                finalWidth = drawWidth * ratio;
            }
            return {
                height: drawHeight + 16,
                paint(c, y) {
                    try {
                        c.drawImage(entry.element, self.PADDING_X, y + 8, finalWidth, drawHeight);
                    } catch {
                        self._paintImagePlaceholder(c, y);
                    }
                },
            };
        }

        return {
            height: 56,
            paint(c, y) {
                self._paintImagePlaceholder(c, y);
            },
        };
    }

    _paintImagePlaceholder(ctx, y) {
        const height = 40;
        this._roundRect(ctx, this.PADDING_X, y + 8, this.contentWidth, height, 8);
        ctx.fillStyle = this.colors.placeholderBg;
        ctx.fill();
        this._setFont(ctx, { size: 13, weight: '400' });
        ctx.fillStyle = this.colors.placeholderText;
        ctx.textAlign = 'center';
        ctx.fillText(CE_TEXT.imageCannotEmbed, this.PAGE_WIDTH / 2, y + 8 + height / 2 - 7);
        ctx.textAlign = 'left';
    }

    // ==================== Markdown 轻量解析 ====================

    _parseMarkdownBlocks(markdown) {
        const blocks = [];
        if (!markdown) return blocks;

        const lines = markdown.split('\n');
        let i = 0;
        let paragraph = [];

        const flushParagraph = () => {
            if (paragraph.length) {
                // 保留原始文本（含内联 $...$），清洗与公式切分留到渲染时处理
                const raw = paragraph.join(' ').trim();
                if (raw) blocks.push({ kind: 'paragraph', text: raw });
                paragraph = [];
            }
        };

        while (i < lines.length) {
            const line = lines[i];
            const trimmed = line.trim();

            // 代码块
            const fence = trimmed.match(/^```(.*)$/);
            if (fence) {
                flushParagraph();
                const lang = fence[1].trim();
                const codeLines = [];
                i++;
                while (i < lines.length && !lines[i].trim().startsWith('```')) {
                    codeLines.push(lines[i]);
                    i++;
                }
                i++; // 跳过结束 fence
                blocks.push({ kind: 'code', lang, code: codeLines.join('\n') });
                continue;
            }

            // 独立公式块：$$ 独占一行作为起止围栏（与 dom-to-markdown 输出一致）
            if (trimmed === '$$') {
                flushParagraph();
                const formulaLines = [];
                i++;
                while (i < lines.length && lines[i].trim() !== '$$') {
                    formulaLines.push(lines[i]);
                    i++;
                }
                i++; // 跳过结束 $$
                blocks.push({ kind: 'formula', latex: formulaLines.join('\n').trim() });
                continue;
            }

            if (trimmed === '') {
                flushParagraph();
                i++;
                continue;
            }

            // 标题
            const heading = trimmed.match(/^(#{1,6})\s+(.*)$/);
            if (heading) {
                flushParagraph();
                blocks.push({
                    kind: 'heading',
                    level: heading[1].length,
                    text: heading[2].trim(),
                });
                i++;
                continue;
            }

            // 分隔线
            if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
                flushParagraph();
                i++;
                continue;
            }

            // 引用
            const quote = line.match(/^\s*>\s?(.*)$/);
            if (quote) {
                flushParagraph();
                const quoteText = [quote[1]];
                i++;
                while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
                    quoteText.push(lines[i].replace(/^\s*>\s?/, ''));
                    i++;
                }
                blocks.push({ kind: 'quote', text: quoteText.join(' ').trim() });
                continue;
            }

            // 列表项
            const listMatch = line.match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/);
            if (listMatch) {
                flushParagraph();
                const depth = Math.min(Math.floor(listMatch[1].length / 2), 4);
                const ordered = /\d+\./.test(listMatch[2]);
                const index = ordered ? parseInt(listMatch[2], 10) : 0;
                blocks.push({
                    kind: 'listitem',
                    depth,
                    ordered,
                    index,
                    text: listMatch[3].trim(),
                });
                i++;
                continue;
            }

            // 普通段落（累积连续行）
            paragraph.push(trimmed);
            i++;
        }

        flushParagraph();
        return blocks;
    }

    /**
     * 去除 markdown 内联标记，转为适合 PNG 渲染的纯文本。
     */
    _cleanInline(text) {
        return (text || '')
            .replace(/!\[[^\]]*\]\([^)]*\)/g, '')          // 图片
            .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')        // 链接 → 文本
            .replace(/`([^`]+)`/g, '$1')                    // 行内代码
            .replace(/\*\*([^*]+)\*\*/g, '$1')              // 粗体
            .replace(/__([^_]+)__/g, '$1')
            .replace(/\*([^*]+)\*/g, '$1')                  // 斜体
            .replace(/(^|[^\w])_([^_]+)_($|[^\w])/g, '$1$2$3')
            .replace(/\s+/g, ' ')
            .trim();
    }

    // ==================== 图片预加载 ====================

    async _preloadImages(turns) {
        const srcs = new Set();
        turns.forEach(turn => {
            (turn.user?.images || []).forEach(img => srcs.add(img.src));
            (turn.assistant?.images || []).forEach(img => srcs.add(img.src));
        });

        const map = new Map();
        await Promise.all(Array.from(srcs).map(async (src) => {
            const result = await this._loadImage(src);
            map.set(src, result);
        }));
        return map;
    }

    _loadImage(src) {
        return new Promise((resolve) => {
            const img = new Image();
            let settled = false;
            const finish = (value) => {
                if (settled) return;
                settled = true;
                resolve(value);
            };

            const timer = setTimeout(() => finish({ element: null }), this.IMAGE_LOAD_TIMEOUT);

            img.crossOrigin = 'anonymous';
            img.onload = () => {
                clearTimeout(timer);
                finish({ element: img, width: img.naturalWidth, height: img.naturalHeight });
            };
            img.onerror = () => {
                clearTimeout(timer);
                finish({ element: null });
            };

            try {
                img.src = src;
            } catch {
                clearTimeout(timer);
                finish({ element: null });
            }
        });
    }

    // ==================== 公式渲染（LaTeX → MathML → SVG 图片）====================

    /**
     * 探测公式图片渲染是否可用且不会污染 canvas。
     * 用一个最小公式预先验证（渲染 + 绘制 + toDataURL 读回），
     * 若 MathJax 不可用或画布被污染则整体回退到 LaTeX 文本，保证导出不失败。
     * @returns {Promise<boolean>}
     */
    async _probeFormulaRendering() {
        try {
            const entry = await this._renderLatexToImage('x^2', false);
            if (!entry || !entry.element) return false;
            const test = document.createElement('canvas');
            test.width = 4;
            test.height = 4;
            const tctx = test.getContext('2d');
            tctx.drawImage(entry.element, 0, 0, 4, 4);
            test.toDataURL(); // 若画布被污染会抛出 SecurityError
            return true;
        } catch {
            return false;
        }
    }

    /**
     * 预渲染选中对话中出现的全部公式（去重）。
     * @returns {Promise<Map<string, {element:Image,width:number,height:number}|null>>}
     */
    async _preloadFormulas(turns) {
        const map = new Map();
        if (!this.formulaCapable) return map;

        const seen = new Set();
        const items = [];
        turns.forEach(turn => {
            this._collectFormulas(turn.assistant?.markdown || '').forEach(f => {
                const key = (f.display ? 'D:' : 'I:') + f.latex;
                if (!seen.has(key)) {
                    seen.add(key);
                    items.push({ key, latex: f.latex, display: f.display });
                }
            });
        });

        await Promise.all(items.map(async (item) => {
            const entry = await this._renderLatexToImage(item.latex, item.display);
            map.set(item.key, entry);
        }));
        return map;
    }

    /**
     * 从一段 markdown 中收集公式（$$ 独立公式与 $...$ 内联公式）。
     */
    _collectFormulas(markdown) {
        const result = [];
        if (!markdown) return result;

        let m;
        const displayRe = /\$\$([\s\S]+?)\$\$/g;
        while ((m = displayRe.exec(markdown)) !== null) {
            const latex = m[1].trim();
            if (latex) result.push({ latex, display: true });
        }

        const inlineSource = markdown.replace(/\$\$[\s\S]+?\$\$/g, ' ');
        const inlineRe = /\$([^$\n]+?)\$/g;
        while ((m = inlineRe.exec(inlineSource)) !== null) {
            const latex = m[1].trim();
            if (latex) result.push({ latex, display: false });
        }
        return result;
    }

    /**
     * 确保 MathJax 就绪（tex2svg 可用）。
     * @returns {Promise<boolean>}
     */
    _ensureMathJax() {
        if (this._mathjaxReady) return this._mathjaxReady;
        this._mathjaxReady = (async () => {
            try {
                if (typeof MathJax === 'undefined') return false;
                if (MathJax.startup && MathJax.startup.promise) {
                    await MathJax.startup.promise;
                }
                return typeof MathJax.tex2svg === 'function';
            } catch {
                return false;
            }
        })();
        return this._mathjaxReady;
    }

    /**
     * 将 LaTeX 渲染为图片：用 MathJax 输出自包含的 SVG（字形为矢量路径），
     * 再作为图片加载。SVG 不含 foreignObject/外部字体，可安全绘制到 canvas。
     * @param {string} latex
     * @param {boolean} displayMode
     * @returns {Promise<{element:Image,width:number,height:number}|null>}
     */
    async _renderLatexToImage(latex, displayMode) {
        if (!latex) return null;

        const ready = await this._ensureMathJax();
        if (!ready) return null;

        const fontSize = displayMode ? 22 : 17;
        const color = this.colors.text;

        let svg;
        try {
            const node = MathJax.tex2svg(latex, { display: displayMode });
            svg = node.querySelector('svg');
        } catch {
            return null;
        }
        if (!svg) return null;

        // 在真实 DOM 中按目标字号测量像素尺寸（MathJax SVG 默认使用 ex 单位）
        const probe = document.createElement('div');
        probe.style.cssText = `position:absolute;left:-99999px;top:0;visibility:hidden;font-size:${fontSize}px;`;
        probe.appendChild(svg);
        document.body.appendChild(probe);
        const rect = svg.getBoundingClientRect();
        const width = Math.max(1, Math.ceil(rect.width));
        const height = Math.max(1, Math.ceil(rect.height));

        // 固定像素尺寸与颜色，便于后续绘制
        svg.setAttribute('width', String(width));
        svg.setAttribute('height', String(height));
        svg.style.color = color; // MathJax 字形使用 currentColor
        const svgString = new XMLSerializer().serializeToString(svg);
        document.body.removeChild(probe);

        const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString)}`;
        return await new Promise((resolve) => {
            const img = new Image();
            let settled = false;
            const finish = (value) => { if (!settled) { settled = true; resolve(value); } };
            const timer = setTimeout(() => finish(null), 5000);
            img.onload = () => { clearTimeout(timer); finish({ element: img, width, height }); };
            img.onerror = () => { clearTimeout(timer); finish(null); };
            try {
                img.src = url;
            } catch {
                clearTimeout(timer);
                finish(null);
            }
        });
    }

    // ==================== Canvas 工具 ====================

    _setFont(ctx, { size, weight = '400', mono = false }) {
        const family = mono ? this.monoFamily : this.fontFamily;
        ctx.font = `${weight} ${size}px ${family}`;
    }

    _wrapText(ctx, text, maxWidth) {
        const lines = [];
        const paragraphs = String(text == null ? '' : text).split('\n');

        for (const para of paragraphs) {
            if (para === '') { lines.push(''); continue; }

            let line = '';
            for (let i = 0; i < para.length; i++) {
                const ch = para[i];
                const test = line + ch;
                if (ctx.measureText(test).width > maxWidth && line !== '') {
                    const lastSpace = line.lastIndexOf(' ');
                    if (lastSpace > 0 && /[A-Za-z0-9]/.test(ch)) {
                        lines.push(line.slice(0, lastSpace));
                        line = line.slice(lastSpace + 1) + ch;
                    } else {
                        lines.push(line);
                        line = ch;
                    }
                } else {
                    line = test;
                }
            }
            if (line !== '') lines.push(line);
        }

        return lines.length ? lines : [''];
    }

    _clipToWidth(ctx, text, maxWidth) {
        if (ctx.measureText(text).width <= maxWidth) return text;
        const ellipsis = '…';
        let result = text;
        while (result.length > 1 && ctx.measureText(result + ellipsis).width > maxWidth) {
            result = result.slice(0, -1);
        }
        return result + ellipsis;
    }

    _roundRect(ctx, x, y, width, height, radius) {
        const r = Math.min(radius, width / 2, height / 2);
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + width, y, x + width, y + height, r);
        ctx.arcTo(x + width, y + height, x, y + height, r);
        ctx.arcTo(x, y + height, x, y, r);
        ctx.arcTo(x, y, x + width, y, r);
        ctx.closePath();
    }

    _canvasToBlob(canvas) {
        return new Promise((resolve, reject) => {
            try {
                canvas.toBlob((blob) => {
                    if (blob) resolve(blob);
                    else reject(new Error('canvas.toBlob returned null'));
                }, 'image/png');
            } catch (error) {
                reject(error);
            }
        });
    }
}
