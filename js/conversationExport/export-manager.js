/**
 * Conversation Export - 管理器
 *
 * 职责：
 * - 在可导出的对话页注入“导出对话”按钮（插入平台原生顶部操作区）
 * - 打开导出弹窗并驱动“自动加载完整对话 → 选择 → 导出”全流程
 * - 输出状态提示（加载中 / 导出中 / 完成 / 失败 / 无内容）
 */

class CEExportManager {
    static BUTTON_CLASS = 'ait-ce-export-btn-native';

    static DOWNLOAD_ICON = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>`;

    constructor(adapter) {
        this.adapter = adapter;
        this.modal = null;
        this.pngExporter = new CEPngExporter();
        this.pdfExporter = new CEPdfExporter();

        this._modalOpen = false;
        this._loadCancelled = false;
        this._clickDelegateAttached = false;
        this._unsubscribeObserver = null;
        this._boundUrlChange = this._onUrlChange.bind(this);
    }

    init() {
        this._attachClickDelegate();
        this._injectButton();
        this._startObserving();

        try { window.addEventListener('url:change', this._boundUrlChange); } catch { /* ignore */ }
    }

    destroy() {
        this._closeModal();
        this._removeButton();
        if (this._unsubscribeObserver) {
            this._unsubscribeObserver();
            this._unsubscribeObserver = null;
        }
        try { window.removeEventListener('url:change', this._boundUrlChange); } catch { /* ignore */ }
    }

    // ==================== 按钮注入 ====================

    _injectButton() {
        try {
            if (!this.adapter.isExportablePage()) {
                this._removeButton();
                return;
            }
            const showLabel = this.adapter.platformId !== 'chatgpt';

            const existingButton = document.querySelector(`.${CEExportManager.BUTTON_CLASS}`);
            if (existingButton) {
                const exportLabel = TimelineI18n.getMessage('exportLabel') || CE_TEXT.confirm;
                existingButton.setAttribute('aria-label', exportLabel);
                existingButton.style.minWidth = '36px';
                existingButton.style.width = showLabel ? 'auto' : '36px';
                existingButton.style.padding = showLabel ? '0 10px' : '0';
                existingButton.style.gap = showLabel ? '6px' : '0';
                existingButton.style.color = 'inherit';
                existingButton.style.fontSize = '14px';
                existingButton.style.fontWeight = '500';
                existingButton.style.lineHeight = '1';
                existingButton.style.whiteSpace = 'nowrap';
                let label = existingButton.querySelector('.ait-ce-export-btn-label');
                if (showLabel && !label) {
                    label = document.createElement('span');
                    label.className = 'ait-ce-export-btn-label';
                    existingButton.appendChild(label);
                }
                if (showLabel) label.textContent = exportLabel;
                else label?.remove();
                return;
            }

            const target = this.adapter.getButtonInsertTarget();
            if (!target || !target.parentNode) return;

            const button = document.createElement('button');
            button.className = CEExportManager.BUTTON_CLASS;
            button.type = 'button';
            const exportLabel = TimelineI18n.getMessage('exportLabel') || CE_TEXT.confirm;
            button.setAttribute('aria-label', exportLabel);
            button.innerHTML = `${CEExportManager.DOWNLOAD_ICON}${showLabel ? `<span class="ait-ce-export-btn-label">${exportLabel}</span>` : ''}`;
            button.style.cssText = `
                min-width: 36px;
                width: ${showLabel ? 'auto' : '36px'};
                height: 36px;
                padding: ${showLabel ? '0 10px' : '0'};
                background: transparent;
                border: none;
                border-radius: 8px;
                cursor: pointer;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: ${showLabel ? '6px' : '0'};
                color: inherit;
                font-size: 14px;
                font-weight: 500;
                line-height: 1;
                white-space: nowrap;
                transition: background-color 0.2s;
                position: relative;
            `;

            button.addEventListener('mouseenter', () => {
                button.style.backgroundColor = 'rgba(127, 127, 127, 0.15)';
                window.globalTooltipManager?.show(
                    'ce-export-btn',
                    'button',
                    button,
                    CE_TEXT.buttonTooltip,
                    { placement: 'bottom' }
                );
            });
            button.addEventListener('mouseleave', () => {
                button.style.backgroundColor = 'transparent';
                window.globalTooltipManager?.hide();
            });

            target.parentNode.insertBefore(button, target);
        } catch (error) {
        }
    }

    _removeButton() {
        const button = document.querySelector(`.${CEExportManager.BUTTON_CLASS}`);
        if (button && button.parentNode) button.parentNode.removeChild(button);
    }

    _attachClickDelegate() {
        if (this._clickDelegateAttached) return;
        const edm = window.eventDelegateManager;
        if (!edm) return;
        edm.on('click', `.${CEExportManager.BUTTON_CLASS}`, () => this._onButtonClick());
        this._clickDelegateAttached = true;
    }

    _startObserving() {
        const manager = window.DOMObserverManager;
        if (!manager?.getInstance) return;
        this._unsubscribeObserver = manager.getInstance().subscribeBody('conversation-export', {
            callback: () => this._injectButton(),
            filter: { hasAddedNodes: true },
            debounce: 400,
        });
    }

    _onUrlChange() {
        // 路由变化：关闭可能存在的弹窗，并按新页面状态重置按钮
        this._closeModal();
        this._removeButton();
        setTimeout(() => this._injectButton(), 300);
    }

    // ==================== 导出流程 ====================

    async _onButtonClick() {
        if (this._modalOpen) return;
        if (!this.adapter.isExportablePage()) {
            window.globalToastManager?.error(CE_TEXT.noConversation);
            return;
        }

        this._modalOpen = true;
        this._loadCancelled = false;

        let defaultThemeId = CE_DEFAULT_THEME;
        try { defaultThemeId = await this.adapter.getDefaultThemeId(); } catch { /* ignore */ }

        this.modal = new CEExportModal();
        this.modal.open({
            defaultThemeId,
            onCancelLoad: () => this._cancelLoad(),
            onClose: () => this._closeModal(),
            onExport: (request) => this._runExport(request),
        });
        this.modal.showLoading();

        await this._loadConversation();
    }

    _cancelLoad() {
        this._loadCancelled = true;
        this._closeModal();
    }

    async _loadConversation() {
        let turns = [];
        try {
            turns = await this.adapter.collectAllTurns({
                onProgress: (count) => this.modal?.updateProgress(count),
                shouldCancel: () => this._loadCancelled || !this._modalOpen,
            });
        } catch (error) {
        }

        // 加载期间弹窗已被关闭
        if (!this._modalOpen || !this.modal) return;

        if (this._loadCancelled) {
            this._closeModal();
            return;
        }

        if (!turns.length) {
            window.globalToastManager?.error(CE_TEXT.noConversation);
            this._closeModal();
            return;
        }

        this.modal.showContent(turns);
    }

    async _runExport(request) {
        if (!this.modal) return;

        if (!request.turns.length) {
            window.globalToastManager?.warning(CE_TEXT.needSelect);
            return;
        }

        this.modal.setExporting(true);

        try {
            const meta = await this._buildMeta();
            const format = CE_FORMATS.find(f => f.id === request.formatId) || CE_FORMATS[0];
            const job = {
                meta,
                options: {
                    showUrl: request.showUrl,
                    showTime: request.showTime,
                    showConversationTime: request.showConversationTime,
                    rangeId: request.rangeId,
                    formatId: request.formatId,
                },
                turns: request.turns,
            };

            const filenameBase = ceSanitizeFilename(meta.title);

            if (request.formatId === 'png') {
                const blob = await this.pngExporter.export(job, request.themeId);
                ceTriggerDownload(filenameBase, format, blob);
            } else if (request.formatId === 'pdf') {
                // 文字排版方案：构建 HTML → 浏览器打印为 PDF（复用 PNG 的 markdown 解析）
                await this.pdfExporter.export(job, request.themeId, this.pngExporter);
            } else {
                let content;
                if (request.formatId === 'markdown') content = CETextExporters.buildMarkdown(job);
                else if (request.formatId === 'txt') content = CETextExporters.buildTxt(job);
                else if (request.formatId === 'csv') content = CETextExporters.buildCsv(job);
                else content = CETextExporters.buildJson(job);
                ceTriggerDownload(filenameBase, format, content);
            }

            window.globalToastManager?.success(CE_TEXT.done);
            this._closeModal();
        } catch (error) {
            window.globalToastManager?.error(CE_TEXT.failed);
            this.modal?.setExporting(false);
        }
    }

    async _buildMeta() {
        let platformName = this.adapter.platformId;
        try { platformName = await this.adapter.getPlatformName(); } catch { /* ignore */ }

        return {
            title: this.adapter.getConversationTitle() || '对话导出',
            platformId: this.adapter.platformId,
            platformName,
            url: location.href,
            exportTime: new Date(),
        };
    }

    _closeModal() {
        this._modalOpen = false;
        if (this.modal) {
            this.modal.close();
            this.modal = null;
        }
    }
}
