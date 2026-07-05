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
        this._syncRangeUI();
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
        const rangeId = this._refs.rangeSelect?.checked ? 'select' : 'all';
        const formatId = this._getSelectedFormat();
        const showUrl = !!this._refs.showUrl?.checked;
        const showTime = !!this._refs.showTime?.checked;
        const themeId = this._refs.themeSelect?.value || CE_DEFAULT_THEME;

        let selectedTurns;
        if (rangeId === 'select') {
            selectedTurns = this.turns.filter((_, index) => this._isRowChecked(index));
        } else {
            selectedTurns = this.turns.slice();
        }

        // 重新编号，保持导出内序号从 1 开始连续
        selectedTurns = selectedTurns.map((turn, index) => ({ ...turn, order: index + 1 }));

        return { rangeId, formatId, showUrl, showTime, themeId, turns: selectedTurns };
    }

    // ==================== 构建 DOM ====================

    _build(config) {
        const overlay = document.createElement('div');
        overlay.className = 'ce-export-overlay';
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

        content.appendChild(this._buildRangeSection());
        content.appendChild(this._buildFormatSection());
        content.appendChild(this._buildHeaderSection());
        content.appendChild(this._buildThemeSection(config.defaultThemeId));
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

    _buildRangeSection() {
        const section = this._buildSection(CE_TEXT.sectionRange);
        const group = document.createElement('div');
        group.className = 'ce-export-radio-group';

        const allRadio = this._radio('ce-range', CE_TEXT.rangeAll, true);
        const selectRadio = this._radio('ce-range', CE_TEXT.rangeSelect, false);

        allRadio.input.addEventListener('change', () => this._syncRangeUI());
        selectRadio.input.addEventListener('change', () => this._syncRangeUI());

        group.appendChild(allRadio.label);
        group.appendChild(selectRadio.label);
        section.appendChild(group);

        this._refs.rangeAll = allRadio.input;
        this._refs.rangeSelect = selectRadio.input;
        return section;
    }

    _buildFormatSection() {
        const section = this._buildSection(CE_TEXT.sectionFormat);
        const group = document.createElement('div');
        group.className = 'ce-export-radio-group ce-export-format-group';

        this._refs.formatInputs = [];
        CE_FORMATS.forEach(format => {
            const item = this._radio('ce-format', format.label, format.id === CE_DEFAULT_FORMAT);
            item.input.value = format.id;
            item.input.addEventListener('change', () => {
                this._syncThemeVisibility();
            });
            group.appendChild(item.label);
            this._refs.formatInputs.push(item.input);
        });

        section.appendChild(group);
        return section;
    }

    _buildHeaderSection() {
        const section = this._buildSection(CE_TEXT.sectionHeader);
        const group = document.createElement('div');
        group.className = 'ce-export-check-group';

        const urlCheck = this._checkbox(CE_TEXT.headerShowUrl, true);
        const timeCheck = this._checkbox(CE_TEXT.headerShowTime, true);

        group.appendChild(urlCheck.label);
        group.appendChild(timeCheck.label);
        section.appendChild(group);

        this._refs.showUrl = urlCheck.input;
        this._refs.showTime = timeCheck.input;
        return section;
    }

    _buildThemeSection(defaultThemeId) {
        const section = this._buildSection(CE_TEXT.sectionTheme);
        section.classList.add('ce-export-theme-section');

        const select = document.createElement('select');
        select.className = 'ce-export-select';
        CE_THEMES.forEach(theme => {
            const option = document.createElement('option');
            option.value = theme.id;
            option.textContent = theme.label;
            select.appendChild(option);
        });
        select.value = CE_THEMES.some(t => t.id === defaultThemeId) ? defaultThemeId : CE_DEFAULT_THEME;

        section.appendChild(select);
        this._refs.themeSelect = select;
        this._refs.themeSection = section;

        // 初始按默认格式（markdown）隐藏
        section.style.display = 'none';
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

        section.appendChild(selectAllLabel.label);
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

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'ce-export-list-check';
            checkbox.dataset.index = String(index);
            checkbox.addEventListener('change', () => {
                this._syncSelectAllState();
                this._updateExportButtonState();
            });

            const body = document.createElement('div');
            body.className = 'ce-export-list-body';

            const orderEl = document.createElement('div');
            orderEl.className = 'ce-export-list-order';
            orderEl.textContent = `${CE_TEXT.turnPrefix} ${turn.order}`;

            const userPreview = document.createElement('div');
            userPreview.className = 'ce-export-list-preview ce-export-list-user';
            userPreview.textContent = `${CE_TEXT.userLabel}：${this._preview(turn.user?.text) || CE_TEXT.emptyUserPreview}`;

            const assistantPreview = document.createElement('div');
            assistantPreview.className = 'ce-export-list-preview ce-export-list-assistant';
            assistantPreview.textContent = `${CE_TEXT.assistantLabel}：${this._preview(turn.assistant?.text) || CE_TEXT.emptyAssistant}`;

            body.appendChild(orderEl);
            body.appendChild(userPreview);
            body.appendChild(assistantPreview);

            row.appendChild(checkbox);
            row.appendChild(body);
            list.appendChild(row);

            this._refs.rows.push(checkbox);
        });
    }

    _onSelectAll(checked) {
        (this._refs.rows || []).forEach(cb => { cb.checked = checked; });
        this._updateExportButtonState();
    }

    _syncSelectAllState() {
        const rows = this._refs.rows || [];
        if (!this._refs.selectAll) return;
        const checkedCount = rows.filter(cb => cb.checked).length;
        this._refs.selectAll.checked = checkedCount > 0 && checkedCount === rows.length;
        this._refs.selectAll.indeterminate = checkedCount > 0 && checkedCount < rows.length;
    }

    _isRowChecked(index) {
        const cb = (this._refs.rows || [])[index];
        return !!(cb && cb.checked);
    }

    _syncRangeUI() {
        const isSelect = !!this._refs.rangeSelect?.checked;
        const listSection = this._refs.list?.closest('.ce-export-list-section');
        if (listSection) {
            listSection.classList.toggle('ce-disabled', !isSelect);
        }
        (this._refs.rows || []).forEach(cb => { cb.disabled = !isSelect; });
        if (this._refs.selectAll) this._refs.selectAll.disabled = !isSelect;
        this._updateExportButtonState();
    }

    _syncThemeVisibility() {
        const isPng = this._getSelectedFormat() === 'png';
        if (this._refs.themeSection) {
            this._refs.themeSection.style.display = isPng ? 'block' : 'none';
        }
    }

    _updateExportButtonState() {
        const btn = this._refs.exportBtn;
        if (!btn || btn.dataset.busy === '1') return;

        const isSelect = !!this._refs.rangeSelect?.checked;
        let enabled = true;
        if (this.turns.length === 0) {
            enabled = false;
        } else if (isSelect) {
            enabled = (this._refs.rows || []).some(cb => cb.checked);
        }
        btn.disabled = !enabled;
    }

    // ==================== 小组件工厂 ====================

    _radio(name, labelText, checked) {
        const label = document.createElement('label');
        label.className = 'ce-export-radio';
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = name;
        input.checked = checked;
        const span = document.createElement('span');
        span.textContent = labelText;
        label.appendChild(input);
        label.appendChild(span);
        return { label, input };
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
        const input = (this._refs.formatInputs || []).find(i => i.checked);
        return input ? input.value : CE_DEFAULT_FORMAT;
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
