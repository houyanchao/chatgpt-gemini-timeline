/**
 * Conversation Export - PDF 导出器（文字排版方案）
 *
 * 不再把长图切片成图片，而是把对话渲染成结构化 HTML，塞进隐藏 iframe，再调用
 * 浏览器打印（用户在弹出的对话框里选择“另存为 PDF”）。这样得到的是：
 * - 文字可选中 / 可搜索（中文用系统字体，无需内嵌字体）
 * - 浏览器自动分页
 * - 公式用页面已加载的 MathJax 渲染成 SVG（矢量、清晰）
 * - 图片内联（同源 blob 与签名 URL 均可加载）
 *
 * markdown 解析复用 CEPngExporter._parseMarkdownBlocks（保持与 PNG 一致，不重复造轮子）。
 */

class CEPdfExporter {
    /**
     * @param {Object} job
     * @param {string} themeId
     * @param {CEPngExporter} [markdownParser] - 复用其 _parseMarkdownBlocks
     * @returns {Promise<void>}
     */
    async export(job, themeId, markdownParser) {
        this._mjReady = await this._ensureMathJax();
        this._parser = markdownParser || null;
        const html = this._buildHtml(job, themeId);
        await this._printHtml(html);
    }

    // ==================== HTML 构建 ====================

    _buildHtml(job, themeId) {
        const { meta, options, turns } = job;
        const theme = (typeof ceGetTheme === 'function') ? ceGetTheme(themeId) : null;
        const accent = theme
            ? (theme.gradient ? theme.gradient[0][1] : (theme.solid || '#6128ff'))
            : '#6128ff';

        const title = meta?.title || '对话导出';

        const metaLines = [];
        if (options.showUrl && meta?.url) {
            metaLines.push(`${CE_TEXT.sourceLabel}: ${this._escapeHtml(meta.url)}`);
        }
        if (options.showTime) {
            metaLines.push(`${CE_TEXT.timeLabel}: ${this._escapeHtml(ceFormatLocalTime(meta.exportTime))}`);
        }

        const turnsHtml = turns.map(turn => this._turnHtml(turn, options)).join('');

        return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="utf-8">
<title>${this._escapeHtml(title)}</title>
<style>${this._css(accent)}</style>
</head>
<body>
<div class="ce-header">
  <div class="ce-title">${this._escapeHtml(title)}</div>
  ${metaLines.length ? `<div class="ce-meta">${metaLines.join('<br>')}</div>` : ''}
</div>
${turnsHtml}
</body>
</html>`;
    }

    _css(accent) {
        return `
@page { margin: 16mm 14mm; }
* { box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", Helvetica, Arial, sans-serif; color: #1f2937; font-size: 14px; line-height: 1.7; margin: 0; }
.ce-header { border-bottom: 3px solid ${accent}; padding-bottom: 12px; margin-bottom: 22px; }
.ce-title { font-size: 22px; font-weight: 700; }
.ce-meta { color: #6b7280; font-size: 12px; margin-top: 8px; word-break: break-all; }
.ce-turn { margin: 16px 0; }
.ce-row { display: flex; gap: 10px; align-items: flex-start; margin: 8px 0; }
.ce-badge { flex: none; width: 24px; height: 24px; margin-top: 6px; border-radius: 50%; font-weight: 700; font-size: 13px; display: inline-flex; align-items: center; justify-content: center; }
.ce-badge.q { background: ${accent}; color: #fff; }
.ce-badge.a { background: #e5e7eb; color: #4b5563; }
.ce-body { flex: 1; min-width: 0; }
.ce-user { background: #f3f4f6; border-radius: 10px; padding: 10px 12px; white-space: pre-wrap; word-break: break-word; }
.ce-time { color: #6b7280; font-size: 12px; margin-bottom: 4px; }
.ce-content { word-break: break-word; }
.ce-content p { margin: 8px 0; }
.ce-content h1, .ce-content h2, .ce-content h3, .ce-content h4 { margin: 12px 0 6px; line-height: 1.4; }
.ce-content ul, .ce-content ol { margin: 8px 0; padding-left: 22px; }
.ce-content li { margin: 3px 0; }
.ce-content pre { background: #f6f8fa; padding: 12px; border-radius: 8px; overflow-x: auto; break-inside: avoid; }
.ce-content code { font-family: "SF Mono", "Cascadia Code", Consolas, monospace; font-size: 13px; }
.ce-content pre code { white-space: pre-wrap; word-break: break-word; }
.ce-content blockquote { border-left: 3px solid #d1d5db; margin: 8px 0; padding-left: 12px; color: #6b7280; }
.ce-content hr { border: none; border-top: 1px solid #e5e7eb; margin: 12px 0; }
.ce-formula { text-align: center; margin: 12px 0; overflow-x: auto; break-inside: avoid; }
.ce-img { max-width: 100%; height: auto; border-radius: 6px; margin: 8px 0; break-inside: avoid; }
.ce-img-missing { color: #9ca3af; font-size: 13px; background: #f3f4f6; border-radius: 8px; padding: 10px 12px; }
.ce-empty { color: #9ca3af; }
svg { vertical-align: middle; }
a { color: #2563eb; text-decoration: none; }
`;
    }

    _turnHtml(turn, options) {
        const askTime = options.showConversationTime ? ceFormatChatTime(turn.user?.time) : '';
        const userText = turn.user?.text || CE_TEXT.emptyUserPreview;
        const userImages = (turn.user?.images || []).map(img => this._imageHtml(img)).join('');
        const assistantBody = this._assistantHtml(turn);

        return `
<div class="ce-turn">
  <div class="ce-row">
    <span class="ce-badge q">Q</span>
    <div class="ce-body">
      <div class="ce-user">${askTime ? `<div class="ce-time">${this._escapeHtml(askTime)}</div>` : ''}${this._escapeHtml(userText)}</div>
      ${userImages}
    </div>
  </div>
  <div class="ce-row">
    <span class="ce-badge a">A</span>
    <div class="ce-body"><div class="ce-content">${assistantBody}</div></div>
  </div>
</div>`;
    }

    _assistantHtml(turn) {
        const images = (turn.assistant?.images || []).map(img => this._imageHtml(img)).join('');
        const md = turn.assistant?.markdown || '';
        let body = '';
        if (md) {
            body = this._blocksToHtml(md);
        } else if (turn.assistant?.text) {
            body = `<p>${this._escapeHtml(turn.assistant.text)}</p>`;
        }
        if (!body && !images) {
            return `<p class="ce-empty">${this._escapeHtml(CE_TEXT.emptyAssistant)}</p>`;
        }
        return body + images;
    }

    // ==================== markdown → HTML ====================

    _blocksToHtml(md) {
        // 复用 PNG 的块解析；不可用时退化为按段落切分
        let blocks;
        if (this._parser && typeof this._parser._parseMarkdownBlocks === 'function') {
            blocks = this._parser._parseMarkdownBlocks(md);
        } else {
            blocks = md.split(/\n{2,}/).map(t => ({ kind: 'paragraph', text: t.trim() })).filter(b => b.text);
        }

        let html = '';
        let i = 0;
        while (i < blocks.length) {
            const b = blocks[i];

            if (b.kind === 'listitem') {
                const tag = b.ordered ? 'ol' : 'ul';
                let items = '';
                while (i < blocks.length && blocks[i].kind === 'listitem') {
                    items += `<li>${this._inlineToHtml(blocks[i].text)}</li>`;
                    i++;
                }
                html += `<${tag}>${items}</${tag}>`;
                continue;
            }

            switch (b.kind) {
                case 'heading': {
                    const level = Math.min(Math.max(b.level || 2, 1), 6);
                    html += `<h${level}>${this._inlineToHtml(b.text)}</h${level}>`;
                    break;
                }
                case 'code':
                    html += `<pre><code>${this._escapeHtml(b.code)}</code></pre>`;
                    break;
                case 'quote':
                    html += `<blockquote>${this._inlineToHtml(b.text)}</blockquote>`;
                    break;
                case 'formula': {
                    const svg = this._latexToSvg(b.latex, true);
                    html += `<div class="ce-formula">${svg || `<code>${this._escapeHtml(b.latex)}</code>`}</div>`;
                    break;
                }
                default:
                    html += `<p>${this._inlineToHtml(b.text)}</p>`;
            }
            i++;
        }
        return html;
    }

    /**
     * 行内 markdown → HTML：先挖出行内公式/代码占位（避免被转义或误处理），
     * 转义后再处理图片/链接/粗体/斜体，最后还原占位。
     */
    _inlineToHtml(text) {
        const stash = [];
        const put = (h) => `\u0000${stash.push(h) - 1}\u0000`;

        let s = String(text == null ? '' : text);

        // 行内公式 $...$
        s = s.replace(/\$([^$\n]+?)\$/g, (_, tex) => {
            const svg = this._latexToSvg(tex, false);
            return put(svg || `<code>${this._escapeHtml(tex)}</code>`);
        });
        // 行内代码 `...`
        s = s.replace(/`([^`]+?)`/g, (_, code) => put(`<code>${this._escapeHtml(code)}</code>`));

        // 转义正文
        s = this._escapeHtml(s);

        // 图片 ![alt](url)
        s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g, (_, alt, url) =>
            `<img class="ce-img" src="${this._attr(url)}" alt="${this._attr(alt)}">`);
        // 链接 [text](url)
        s = s.replace(/\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g, (_, t, url) =>
            `<a href="${this._attr(url)}">${t}</a>`);
        // 粗体 **...**
        s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        // 斜体 *...*
        s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');

        return s.replace(/\u0000(\d+)\u0000/g, (_, idx) => stash[Number(idx)]);
    }

    // ==================== 公式 ====================

    async _ensureMathJax() {
        try {
            if (typeof MathJax === 'undefined') return false;
            if (MathJax.startup && MathJax.startup.promise) await MathJax.startup.promise;
            return typeof MathJax.tex2svg === 'function';
        } catch {
            return false;
        }
    }

    _latexToSvg(latex, display) {
        if (!this._mjReady || !latex) return null;
        try {
            const node = MathJax.tex2svg(latex, { display: !!display });
            const svg = node.querySelector('svg');
            if (!svg) return null;
            svg.style.color = '#1f2937';
            return svg.outerHTML;
        } catch {
            return null;
        }
    }

    // ==================== 图片 / 工具 ====================

    _imageHtml(image) {
        if (image && image.src) {
            return `<img class="ce-img" src="${this._attr(image.src)}" alt="${this._attr(image.alt || '')}">`;
        }
        return `<div class="ce-img-missing">［${this._escapeHtml(CE_TEXT.imageCannotEmbed)}］</div>`;
    }

    _escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    _attr(s) {
        return this._escapeHtml(s).replace(/"/g, '&quot;');
    }

    // ==================== 打印 ====================

    _printHtml(html) {
        return new Promise((resolve) => {
            const iframe = document.createElement('iframe');
            iframe.setAttribute('aria-hidden', 'true');
            iframe.style.cssText = 'position:fixed;left:-99999px;top:0;width:794px;height:1123px;border:0;opacity:0;';
            document.body.appendChild(iframe);

            const win = iframe.contentWindow;
            const doc = win.document;
            doc.open();
            doc.write(html);
            doc.close();

            let printed = false;
            const finish = () => {
                if (printed) return;
                printed = true;
                try {
                    win.focus();
                    win.print();
                } catch { /* ignore */ }
                // 打印对话框关闭后再移除 iframe
                setTimeout(() => {
                    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
                    resolve();
                }, 500);
            };

            const waitImagesThenPrint = () => {
                const imgs = Array.from(doc.images || []);
                const pending = imgs.filter(im => !im.complete);
                if (!pending.length) { finish(); return; }
                let remaining = pending.length;
                const onSettle = () => { remaining -= 1; if (remaining <= 0) finish(); };
                pending.forEach(im => {
                    im.addEventListener('load', onSettle, { once: true });
                    im.addEventListener('error', onSettle, { once: true });
                });
                // 兜底：图片迟迟不返回也照常打印
                setTimeout(finish, 4000);
            };

            let started = false;
            const start = () => { if (started) return; started = true; waitImagesThenPrint(); };
            win.addEventListener('load', start);
            setTimeout(start, 800);
        });
    }
}
