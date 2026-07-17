/**
 * Conversation Export - 文本类导出器（Markdown / TXT / JSON）与下载工具
 *
 * 输入统一的导出任务对象 job：
 * {
 *   meta: { title, platformId, platformName, url, exportTime: Date },
 *   options: { showUrl, showTime, showConversationTime, rangeId, formatId },
 *   turns: [{ order, user:{text,images,time}, assistant:{markdown,text,images} }]
 * }
 */

const CETextExporters = {
    /**
     * 汇总一轮对话的全部图片（用户 + 助手）。
     */
    _turnImages(turn) {
        const userImages = (turn.user?.images || []);
        const assistantImages = (turn.assistant?.images || []);
        return [...userImages, ...assistantImages];
    },

    _imageInfoLabel(image) {
        const role = image.role === 'user' ? CE_TEXT.exportRoleUser : CE_TEXT.exportRoleAssistant;
        const size = (image.width && image.height) ? `${image.width}x${image.height}` : '未知尺寸';
        const alt = image.alt ? ` ${image.alt}` : '';
        return `${role} · ${size}${alt}`;
    },

    /**
     * 一张图片对应的 Markdown 行：有 src 时输出图片语法 + 信息，
     * 未渲染（bridge 有引用但 DOM 无签名 URL）时只给信息 + 无法内嵌提示。
     */
    _imageMarkdownLines(image) {
        if (image.src) {
            return [
                `![${image.alt || ''}](${image.src})`,
                `> ${CE_TEXT.imageListTitle}：${this._imageInfoLabel(image)}`,
            ];
        }
        return [`> ${CE_TEXT.imageListTitle}：${this._imageInfoLabel(image)}（${CE_TEXT.imageNotRendered}）`];
    },

    /**
     * Markdown 导出。
     * @param {Object} job
     * @returns {string}
     */
    buildMarkdown(job) {
        const { meta, options, turns } = job;
        const lines = [];

        lines.push(`# ${meta.title}`);
        const headerLines = [];
        if (options.showUrl && meta.url) headerLines.push(`> ${CE_TEXT.sourceLabel}: ${meta.url}`);
        if (options.showTime) headerLines.push(`> ${CE_TEXT.timeLabel}: ${ceFormatLocalTime(meta.exportTime)}`);
        if (headerLines.length) {
            lines.push('');
            lines.push(...headerLines);
        }
        lines.push('');
        lines.push('---');

        for (const turn of turns) {
            // 用户
            lines.push('');
            lines.push(`**${CE_TEXT.exportRoleUser}：**`);
            const mdAskTime = options.showConversationTime ? ceFormatChatTime(turn.user?.time) : '';
            if (mdAskTime) {
                lines.push('');
                lines.push(`> ${CE_TEXT.askTimeLabel}: ${mdAskTime}`);
            }
            lines.push('');
            lines.push(turn.user?.text ? turn.user.text : CE_TEXT.emptyUserPreview);

            (turn.user?.images || []).forEach(image => {
                lines.push('');
                lines.push(...this._imageMarkdownLines(image));
            });

            // 助手
            lines.push('');
            lines.push(`**${CE_TEXT.exportRoleAssistant}：**`);
            const mdAsstImages = turn.assistant?.images || [];
            if (turn.assistant?.markdown) {
                lines.push('');
                lines.push(turn.assistant.markdown);
            } else if (!mdAsstImages.length) {
                // 无文本且无图片时才显示占位（纯图片回复不应提示“未找到回复内容”）
                lines.push('');
                lines.push(CE_TEXT.emptyAssistant);
            }

            mdAsstImages.forEach(image => {
                lines.push('');
                lines.push(...this._imageMarkdownLines(image));
            });

            lines.push('');
            lines.push('---');
        }

        return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
    },

    /**
     * TXT 导出。
     * @param {Object} job
     * @returns {string}
     */
    buildTxt(job) {
        const { meta, options, turns } = job;
        const lines = [];

        lines.push(meta.title);
        if (options.showUrl && meta.url) lines.push(`${CE_TEXT.sourceLabel}: ${meta.url}`);
        if (options.showTime) lines.push(`${CE_TEXT.timeLabel}: ${ceFormatLocalTime(meta.exportTime)}`);
        lines.push('='.repeat(40));

        for (const turn of turns) {
            lines.push('');
            const txtAskTime = options.showConversationTime ? ceFormatChatTime(turn.user?.time) : '';
            lines.push(txtAskTime ? `${CE_TEXT.exportRoleUser}（${txtAskTime}）：` : `${CE_TEXT.exportRoleUser}：`);
            lines.push(turn.user?.text ? turn.user.text : CE_TEXT.emptyUserPreview);
            lines.push('');
            lines.push(`${CE_TEXT.exportRoleAssistant}：`);
            if (turn.assistant?.text) {
                lines.push(turn.assistant.text);
            } else if (!(turn.assistant?.images || []).length) {
                // 无文本且无图片时才显示占位（图片在下方图片清单中列出）
                lines.push(CE_TEXT.emptyAssistant);
            }

            const images = this._turnImages(turn);
            if (images.length) {
                lines.push('');
                lines.push(`${CE_TEXT.imageListTitle}：`);
                images.forEach((image, index) => {
                    const tail = image.src ? image.src : `（${CE_TEXT.imageNotRendered}）`;
                    lines.push(`  ${index + 1}. [${this._imageInfoLabel(image)}] ${tail}`);
                });
            }

            lines.push('');
            lines.push('-'.repeat(40));
        }

        return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
    },

    /**
     * JSON 导出。
     * @param {Object} job
     * @returns {string}
     */
    buildJson(job) {
        const { meta, options, turns } = job;

        const imageCount = turns.reduce((sum, turn) => sum + this._turnImages(turn).length, 0);

        const metadata = {
            title: meta.title,
            platform: meta.platformName || meta.platformId,
            range: options.rangeId,
            format: options.formatId,
            turnCount: turns.length,
            imageCount,
        };
        if (options.showUrl && meta.url) metadata.source = meta.url;
        if (options.showTime) metadata.exportTime = ceFormatLocalTime(meta.exportTime);

        const conversation = turns.map(turn => ({
            order: turn.order,
            user: {
                text: turn.user?.text || '',
                ...(options.showConversationTime && turn.user?.time
                    ? { time: ceFormatChatTime(turn.user.time) }
                    : {}),
                images: (turn.user?.images || []).map(this._serializeImage),
            },
            assistant: {
                text: turn.assistant?.text || '',
                markdown: turn.assistant?.markdown || '',
                images: (turn.assistant?.images || []).map(this._serializeImage),
            },
        }));

        return JSON.stringify({ metadata, conversation }, null, 2);
    },

    /**
     * CSV 导出：每轮一行，列为 序号 /（提问时间）/ Q / A / 图片。
     * 使用 RFC4180 转义（含逗号/引号/换行的字段用双引号包裹、内部引号翻倍），
     * 并加 UTF-8 BOM 便于 Excel 正确识别中文。
     * @param {Object} job
     * @returns {string}
     */
    buildCsv(job) {
        const { meta, options, turns } = job;
        const withTime = !!options.showConversationTime;

        const rows = [];

        // 头部信息（标题总是输出；来源/导出时间跟随开关），以 key,value 预置行放在表格上方
        rows.push(`${this._csvEscape(CE_TEXT.titleLabel)},${this._csvEscape(meta.title)}`);
        if (options.showUrl && meta.url) {
            rows.push(`${this._csvEscape(CE_TEXT.sourceLabel)},${this._csvEscape(meta.url)}`);
        }
        if (options.showTime) {
            rows.push(`${this._csvEscape(CE_TEXT.timeLabel)},${this._csvEscape(ceFormatLocalTime(meta.exportTime))}`);
        }
        rows.push(''); // 空行分隔头部信息与数据表

        const header = ['序号'];
        if (withTime) header.push(CE_TEXT.askTimeLabel);
        header.push(CE_TEXT.exportRoleUser, CE_TEXT.exportRoleAssistant, CE_TEXT.imageListTitle);
        rows.push(header.map(h => this._csvEscape(h)).join(','));

        turns.forEach(turn => {
            const cells = [turn.order];
            if (withTime) cells.push(ceFormatChatTime(turn.user?.time) || '');
            cells.push(turn.user?.text || '');
            cells.push(turn.assistant?.text || turn.assistant?.markdown || '');
            const imgs = this._turnImages(turn)
                .map(img => (img.src ? img.src : `（${CE_TEXT.imageNotRendered}）`))
                .join('\n');
            cells.push(imgs);
            rows.push(cells.map(c => this._csvEscape(c)).join(','));
        });

        return '\uFEFF' + rows.join('\r\n') + '\r\n';
    },

    _csvEscape(value) {
        const s = value == null ? '' : String(value);
        return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    },

    _serializeImage(image) {
        return {
            role: image.role,
            src: image.src || '',
            alt: image.alt || '',
            width: image.width || null,
            height: image.height || null,
            fileId: image.fileId || null,
            unrendered: !!image.unrendered,
        };
    },
};

/**
 * 触发浏览器下载。
 * @param {string} filenameBase - 不含扩展名的文件名（已清洗）
 * @param {Object} format - CE_FORMATS 中的格式定义
 * @param {string|Blob} content - 文本内容或 Blob
 */
function ceTriggerDownload(filenameBase, format, content) {
    const blob = content instanceof Blob
        ? content
        : new Blob([content], { type: `${format.mime};charset=utf-8` });

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${filenameBase}${format.ext}`;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();

    // 释放资源
    setTimeout(() => {
        if (anchor.parentNode) anchor.parentNode.removeChild(anchor);
        URL.revokeObjectURL(url);
    }, 1000);
}
