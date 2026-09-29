/**
 * Conversation Export - 导出弹窗 UI
 *
 * 纯 UI 组件：负责渲染设置区与对话选择列表、维护用户选择状态，并通过回调把
 * “导出 / 取消加载 / 关闭” 事件交给管理器处理。数据采集与导出逻辑不在此处。
 */

class CEExportModal {
    constructor() {
        this.isOpen = false;
        this.overlay = null;
        this.dialog = null;
        this.turns = [];
        this.callbacks = {};
        this.dark = false;

        this._boundKeydown = this._onKeydown.bind(this);
        this._refs = {};
    }

    /**
     * 打开弹窗（初始为加载态）。
     * @param {Object} config
     * @param {string} config.platformId - 用于限定宿主页面样式兼容
     * @param {string} config.defaultThemeId
     * @param {Function} config.onExport - (request) => void
     * @param {Function} config.onClose - () => void
     * @param {Function} config.onCancelLoad - () => void
     */
    open(config = {}) {
        if (this.isOpen) return;
        this.callbacks = config;
        this.dark = ceIsDarkMode();
        this.isOpen = true;

        this._build(config);
        document.addEventListener('keydown', this._boundKeydown, true);

        requestAnimationFrame(() => {
            this.overlay?.classList.add('visible');
        });
    }

    /** 切换到加载态 */
    showLoading() {
        if (!this._refs.loading) return;
        this._refs.loading.style.display = 'flex';
        this._refs.content.style.display = 'none';
        this._refs.footer.style.display = 'none';
        this.updateProgress(0);
    }

    /** 更新加载进度 */
    updateProgress(count) {
        if (!this._refs.loadingText) return;
        this._refs.loadingText.textContent = count > 0
            ? ceFormatText(CE_TEXT.loadingProgress, { count })
            : CE_TEXT.loading;
    }

    /** 加载完成，展示内容与对话列表 */
    showContent(turns) {
        this.turns = Array.isArray(turns) ? turns : [];
        if (!this._refs.loading) return;

        this._refs.loading.style.display = 'none';
        this._refs.content.style.display = 'block';
        this._refs.footer.style.display = 'flex';

        this._renderTurnList();
        this._syncSelectAllState();
        this._updateExportButtonState();
    }

    /** 设置导出中状态（禁用按钮 + 文案） */
    setExporting(exporting) {
        const btn = this._refs.exportBtn;
        if (!btn) return;
        if (exporting) {
            btn.disabled = true;
            btn.dataset.busy = '1';
            btn.textContent = CE_TEXT.exporting;
        } else {
            delete btn.dataset.busy;
            btn.textContent = CE_TEXT.confirm;
            this._updateExportButtonState();
        }
    }

    /** 关闭并清理 */
    close() {
        if (!this.isOpen) return;
        this.isOpen = false;
        document.removeEventListener('keydown', this._boundKeydown, true);

        const overlay = this.overlay;
        if (overlay) {
            overlay.classList.remove('visible');
            setTimeout(() => {
                if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            }, 200);
        }
        this.overlay = null;
        this.dialog = null;
        this._refs = {};
        this.turns = [];
    }

    /**
     * 收集当前导出请求。
     * @returns {Object}
     */
    getExportRequest() {
        const formatId = this._getSelectedFormat();
        const showUrl = !!this._refs.showUrl?.checked;
        const showTime = !!this._refs.showTime?.checked;
        const showConversationTime = !!this._refs.showConversationTime?.checked;
        const themeId = this._refs.themeSelect?.value || CE_DEFAULT_THEME;

        let selectedTurns = this.turns.filter((_, index) => this._isRowChecked(index));
        const rangeId = selectedTurns.length === this.turns.length ? 'all' : 'select';

        // 重新编号，保持导出内序号从 1 开始连续
        selectedTurns = selectedTurns.map((turn, index) => ({ ...turn, order: index + 1 }));

        return { rangeId, formatId, showUrl, showTime, showConversationTime, themeId, turns: selectedTurns };
    }

    // ==================== 构建 DOM ====================

    _build(config) {
        const overlay = document.createElement('div');
        overlay.className = 'ce-export-overlay';
        if (config.platformId === 'chatgpt') overlay.classList.add('ce-platform-chatgpt');
        if (this.dark) overlay.classList.add('ce-dark');

        const dialog = document.createElement('div');
        dialog.className = 'ce-export-modal';

        dialog.appendChild(this._buildHeader());
        dialog.appendChild(this._buildLoading());
        dialog.appendChild(this._buildContent(config));
        dialog.appendChild(this._buildFooter());

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) this._requestClose();
        });

        this.overlay = overlay;
        this.dialog = dialog;
    }

    _buildHeader() {
        const header = document.createElement('div');
        header.className = 'ce-export-header';

        const title = document.createElement('h3');
        title.textContent = CE_TEXT.modalTitle;

        const closeBtn = document.createElement('button');
        closeBtn.className = 'ce-export-close';
        closeBtn.type = 'button';
        closeBtn.setAttribute('aria-label', CE_TEXT.cancel);
        closeBtn.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <line x1="6" y1="6" x2="18" y2="18"/>
                <line x1="18" y1="6" x2="6" y2="18"/>
            </svg>`;
        closeBtn.addEventListener('click', () => this._requestClose());

        header.appendChild(title);
        header.appendChild(closeBtn);
        return header;
    }

    _buildLoading() {
        const loading = document.createElement('div');
        loading.className = 'ce-export-loading';

        const spinner = document.createElement('div');
        spinner.className = 'ce-export-spinner';

        const text = document.createElement('div');
        text.className = 'ce-export-loading-text';
        text.textContent = CE_TEXT.loading;

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'ce-export-loading-cancel';
        cancelBtn.type = 'button';
        cancelBtn.textContent = CE_TEXT.cancelLoading;
        cancelBtn.addEventListener('click', () => {
            this.callbacks.onCancelLoad?.();
        });

        loading.appendChild(spinner);
        loading.appendChild(text);
        loading.appendChild(cancelBtn);

        this._refs.loading = loading;
        this._refs.loadingText = text;
        return loading;
    }

    _buildContent(config) {
        const content = document.createElement('div');
        content.className = 'ce-export-content';
        content.style.display = 'none';

        content.appendChild(this._buildFormatSection(config.defaultThemeId));
        content.appendChild(this._buildListSection());

        this._refs.content = content;
        return content;
    }

    _buildSection(titleText) {
        const section = document.createElement('div');
        section.className = 'ce-export-section';
        const title = document.createElement('div');
        title.className = 'ce-export-section-title';
        title.textContent = titleText;
        section.appendChild(title);
        return section;
    }

    _buildFormatSection(defaultThemeId) {
        const section = document.createElement('div');
        section.className = 'ce-export-section';

        const row = document.createElement('div');
        row.className = 'ce-export-field-row';

        const formatField = this._buildSelectField(
            CE_TEXT.sectionFormat,
            CE_FORMATS.map(f => ({ value: f.id, label: f.label })),
            CE_DEFAULT_FORMAT
        );
        formatField.select.addEventListener('change', () => this._syncThemeVisibility());
        this._refs.formatSelect = formatField.select;

        // 图片主题色：PNG 和 PDF 格式时显示
        const themeDefault = CE_THEMES.some(t => t.id === defaultThemeId) ? defaultThemeId : CE_DEFAULT_THEME;
        const themeField = this._buildSelectField(
            CE_TEXT.sectionTheme,
            CE_THEMES.map(t => ({ value: t.id, label: t.label })),
            themeDefault
        );
        this._refs.themeSelect = themeField.select;
        this._refs.themeField = themeField.field;
        themeField.field.style.display = 'none'; // 初始按默认格式（markdown）隐藏

        const formatColumn = document.createElement('div');
        formatColumn.className = 'ce-export-format-column';
        formatColumn.appendChild(formatField.field);
        formatColumn.appendChild(themeField.field);

        row.appendChild(formatColumn);
        row.appendChild(this._buildHeaderSection());
        section.appendChild(row);
        return section;
    }

    _buildHeaderSection() {
        const section = this._buildSection(CE_TEXT.sectionHeader);
        section.className = 'ce-export-field ce-export-header-options';
        const group = document.createElement('div');
        group.className = 'ce-export-check-group';

        const urlCheck = this._checkbox(CE_TEXT.headerShowUrl, true);
        const timeCheck = this._checkbox(CE_TEXT.headerShowTime, true);
        const chatTimeCheck = this._checkbox(CE_TEXT.headerShowConversationTime, true);

        group.appendChild(urlCheck.label);
        group.appendChild(timeCheck.label);
        group.appendChild(chatTimeCheck.label);
        section.appendChild(group);

        this._refs.showUrl = urlCheck.input;
        this._refs.showTime = timeCheck.input;
        this._refs.showConversationTime = chatTimeCheck.input;
        return section;
    }

    _buildListSection() {
        const section = this._buildSection(CE_TEXT.sectionList);
        section.classList.add('ce-export-list-section');

        const selectAllLabel = this._checkbox(CE_TEXT.selectAll, false);
        selectAllLabel.label.classList.add('ce-export-select-all');
        selectAllLabel.input.addEventListener('change', () => this._onSelectAll(selectAllLabel.input.checked));

        const list = document.createElement('div');
        list.className = 'ce-export-list';

        const selectionStatus = document.createElement('div');
        selectionStatus.className = 'ce-export-selection-status';
        selectionStatus.setAttribute('role', 'status');

        const selectionToolbar = document.createElement('div');
        selectionToolbar.className = 'ce-export-selection-toolbar';
        selectionToolbar.appendChild(selectAllLabel.label);
        selectionToolbar.appendChild(selectionStatus);
        section.appendChild(selectionToolbar);
        this._refs.selectionStatus = selectionStatus;
        section.appendChild(list);

        this._refs.selectAll = selectAllLabel.input;
        this._refs.list = list;
        return section;
    }

    _buildFooter() {
        const footer = document.createElement('div');
        footer.className = 'ce-export-footer';
        footer.style.display = 'none';

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'ce-export-btn ce-export-btn-cancel';
        cancelBtn.type = 'button';
        cancelBtn.textContent = CE_TEXT.cancel;
        cancelBtn.addEventListener('click', () => this._requestClose());

        const exportBtn = document.createElement('button');
        exportBtn.className = 'ce-export-btn ce-export-btn-confirm';
        exportBtn.type = 'button';
        exportBtn.textContent = CE_TEXT.confirm;
        exportBtn.addEventListener('click', () => {
            if (exportBtn.disabled) return;
            this.callbacks.onExport?.(this.getExportRequest());
        });

        footer.appendChild(cancelBtn);
        footer.appendChild(exportBtn);

        this._refs.footer = footer;
        this._refs.exportBtn = exportBtn;
        return footer;
    }

    // ==================== 列表渲染与选择 ====================

    _renderTurnList() {
        const list = this._refs.list;
        if (!list) return;
        list.innerHTML = '';
        this._refs.rows = [];

        this.turns.forEach((turn, index) => {
            const row = document.createElement('label');
            row.className = 'ce-export-list-item';

            const aside = document.createElement('div');
            aside.className = 'ce-export-list-aside';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = true;
            checkbox.className = 'ce-export-list-check';
            checkbox.dataset.index = String(index);
            checkbox.addEventListener('change', () => {
                this._syncSelectAllState();
                this._updateExportButtonState();
            });

            const orderEl = document.createElement('div');
            orderEl.className = 'ce-export-list-order';
            orderEl.textContent = `${CE_TEXT.turnPrefix} ${turn.order}`;

            aside.appendChild(checkbox);
            aside.appendChild(orderEl);

            const body = document.createElement('div');
            body.className = 'ce-export-list-body';

            const userPreview = document.createElement('div');
            userPreview.className = 'ce-export-list-preview ce-export-list-user';
            userPreview.textContent = `${CE_TEXT.exportRoleUser}：${this._preview(turn.user?.text) || CE_TEXT.emptyUserPreview}`;

            const assistantPreview = document.createElement('div');
            assistantPreview.className = 'ce-export-list-preview ce-export-list-assistant';
            assistantPreview.textContent = `${CE_TEXT.exportRoleAssistant}：${this._preview(turn.assistant?.text) || CE_TEXT.emptyAssistant}`;

            body.appendChild(userPreview);
            body.appendChild(assistantPreview);

            row.appendChild(aside);
            row.appendChild(body);
            list.appendChild(row);

            this._refs.rows.push(checkbox);
        });
    }

    _onSelectAll(checked) {
        (this._refs.rows || []).forEach(cb => { cb.checked = checked; });
        this._syncSelectAllState();
        this._updateExportButtonState();
    }

    _syncSelectAllState() {
        const rows = this._refs.rows || [];
        if (!this._refs.selectAll) return;
        const checkedCount = rows.filter(cb => cb.checked).length;
        this._refs.selectAll.checked = checkedCount > 0 && checkedCount === rows.length;
        this._refs.selectAll.indeterminate = checkedCount > 0 && checkedCount < rows.length;
        this._refs.selectAll.disabled = rows.length === 0;
        if (this._refs.selectionStatus) {
            const countText = ceFormatText(CE_TEXT.selectedCount, { count: checkedCount, total: rows.length });
            this._refs.selectionStatus.textContent = checkedCount > 0
                ? countText
                : `${countText} · ${CE_TEXT.needSelect}`;
        }
    }

    _isRowChecked(index) {
        const cb = (this._refs.rows || [])[index];
        return !!(cb && cb.checked);
    }

    _syncThemeVisibility() {
        // PNG 与 PDF 都基于长图渲染，需要图片主题色
        const fmt = this._getSelectedFormat();
        const isImageBased = fmt === 'png' || fmt === 'pdf';
        if (this._refs.themeField) {
            this._refs.themeField.style.display = isImageBased ? '' : 'none';
        }
    }

    _updateExportButtonState() {
        const btn = this._refs.exportBtn;
        if (!btn || btn.dataset.busy === '1') return;

        btn.disabled = !(this._refs.rows || []).some(cb => cb.checked);
    }

    // ==================== 小组件工厂 ====================

    _buildSelectField(titleText, options, selectedValue) {
        const field = document.createElement('div');
        field.className = 'ce-export-field';

        const title = document.createElement('div');
        title.className = 'ce-export-section-title';
        title.textContent = titleText;

        const select = document.createElement('select');
        select.className = 'ce-export-select';
        options.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt.value;
            option.textContent = opt.label;
            select.appendChild(option);
        });
        if (selectedValue != null) select.value = selectedValue;

        field.appendChild(title);
        field.appendChild(select);
        return { field, select };
    }

    _checkbox(labelText, checked) {
        const label = document.createElement('label');
        label.className = 'ce-export-check';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = checked;
        const span = document.createElement('span');
        span.textContent = labelText;
        label.appendChild(input);
        label.appendChild(span);
        return { label, input };
    }

    _getSelectedFormat() {
        return this._refs.formatSelect?.value || CE_DEFAULT_FORMAT;
    }

    _preview(text) {
        const clean = (text || '').replace(/\s+/g, ' ').trim();
        return clean.length > 60 ? `${clean.slice(0, 60)}…` : clean;
    }

    // ==================== 事件 ====================

    _onKeydown(e) {
        if (e.key === 'Escape') {
            e.stopPropagation();
            this._requestClose();
        }
    }

    _requestClose() {
        this.callbacks.onClose?.();
    }
}
