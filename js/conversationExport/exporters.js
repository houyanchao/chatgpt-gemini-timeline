/**
 * Conversation Export - 文本类导出器（Markdown / TXT / JSON）与下载工具
 *
 * 输入统一的导出任务对象 job：
 * {
 *   meta: { title, platformId, platformName, url, exportTime: Date },
 *   options: { showUrl, showTime, rangeId, formatId },
 *   turns: [{ order, user:{text,images}, assistant:{markdown,text,images} }]
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
        const role = image.role === 'user' ? CE_TEXT.userLabel : CE_TEXT.assistantLabel;
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
            lines.push('');
            lines.push(`## ${CE_TEXT.turnPrefix} ${turn.order}`);

            // 用户
            lines.push('');
            lines.push(`**${CE_TEXT.userLabel}：**`);
            lines.push('');
            lines.push(turn.user?.text ? turn.user.text : CE_TEXT.emptyUserPreview);

            (turn.user?.images || []).forEach(image => {
                lines.push('');
                lines.push(...this._imageMarkdownLines(image));
            });

            // 助手
            lines.push('');
            lines.push(`**${CE_TEXT.assistantLabel}：**`);
            lines.push('');
            lines.push(turn.assistant?.markdown ? turn.assistant.markdown : CE_TEXT.emptyAssistant);

            (turn.assistant?.images || []).forEach(image => {
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
            lines.push(`【${CE_TEXT.turnPrefix} ${turn.order}】`);
            lines.push('');
            lines.push(`${CE_TEXT.userLabel}：`);
            lines.push(turn.user?.text ? turn.user.text : CE_TEXT.emptyUserPreview);
            lines.push('');
            lines.push(`${CE_TEXT.assistantLabel}：`);
            lines.push(turn.assistant?.text ? turn.assistant.text : CE_TEXT.emptyAssistant);

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
