/**
 * Question List Panel
 *
 * 嵌入时间轴 wrapper 内，与 timeline-bar 互斥切换显示。
 * 支持：序号、单行省略、当前激活高亮、收藏状态展示与切换、长按标记📌、点击跳转。
 */
class QuestionListPopup {
    constructor() {
        this._el = null;
        this._listEl = null;
        this._visible = false;
        this._timelineBar = null;
        this._wrapper = null;
        this._boundOnActiveChange = this._onActiveChange.bind(this);
        this._boundOnClickOutside = this._onClickOutside.bind(this);
    }

    get visible() { return this._visible; }

    /**
     * 绑定时间轴 UI 引用（由 TimelineManager 调用）
     */
    bind(wrapper, timelineBar) {
        this._wrapper = wrapper;
        this._timelineBar = timelineBar;
    }

    toggle() {
        if (this._visible) {
            this.hide();
        } else {
            this.show();
        }
    }

    show() {
        const tm = window.timelineManager;
        if (!tm || !tm.markers || tm.markers.length === 0) return;
        if (!this._wrapper || !this._timelineBar) return;

        this.hide();

        // 创建面板 DOM
        this._el = document.createElement('div');
        this._el.className = 'ait-question-list-popup';

        // Header
        const header = document.createElement('div');
        header.className = 'ait-ql-header';

        const title = document.createElement('span');
        title.className = 'ait-ql-title';
        title.textContent = chrome.i18n.getMessage('questionListTitle') || 'Questions';

        const headerRight = document.createElement('div');
        headerRight.className = 'ait-ql-header-right';

        const settingsBtn = document.createElement('button');
        settingsBtn.className = 'ait-ql-settings';
        settingsBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>';
        settingsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.hide();
            if (window.panelModal) {
                window.panelModal.show('timeline');
            }
        });

        // const closeBtn = document.createElement('button');
        // closeBtn.className = 'ait-ql-close';
        // closeBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
        // closeBtn.addEventListener('click', (e) => {
        //     e.stopPropagation();
        //     this.hide();
        // });

        headerRight.appendChild(settingsBtn);
        // headerRight.appendChild(closeBtn);

        header.appendChild(title);
        header.appendChild(headerRight);

        // List
        this._listEl = document.createElement('div');
        this._listEl.className = 'ait-ql-list';
        this._renderItems(tm);

        this._el.appendChild(header);
        this._el.appendChild(this._listEl);

        // 同步高度：与 timeline-bar 一致
        const barHeight = this._timelineBar.style.height;
        if (barHeight) {
            this._el.style.height = barHeight;
        }

        // 插入到 wrapper 内，timeline-bar 之前
        this._wrapper.insertBefore(this._el, this._timelineBar);

        // 隐藏 timeline-bar
        this._timelineBar.style.display = 'none';

        this._visible = true;

        // 监听时间轴激活节点变化
        window.addEventListener('timeline:activeChange', this._boundOnActiveChange);

        // 点击外部区域关闭
        setTimeout(() => {
            document.addEventListener('click', this._boundOnClickOutside, true);
        }, 0);

        // 按钮高亮
        if (tm.ui && tm.ui.questionListBtn) {
            tm.ui.questionListBtn.classList.add('active');
        }

        this._scrollActiveIntoView();
    }

    hide() {
        window.removeEventListener('timeline:activeChange', this._boundOnActiveChange);
        document.removeEventListener('click', this._boundOnClickOutside, true);
        if (this._el) {
            this._el.remove();
            this._el = null;
            this._listEl = null;
        }

        // 恢复 timeline-bar
        if (this._timelineBar) {
            this._timelineBar.style.display = '';
        }

        this._visible = false;

        // 取消按钮高亮
        const tm = window.timelineManager;
        if (tm && tm.ui && tm.ui.questionListBtn) {
            tm.ui.questionListBtn.classList.remove('active');
        }
    }

    _renderItems(tm) {
        if (!this._listEl) return;
        this._listEl.innerHTML = '';

        if (tm.markers.length === 0) {
            this._listEl.innerHTML = `<div class="ait-ql-empty">${chrome.i18n.getMessage('questionListEmpty') || 'No questions yet'}</div>`;
            return;
        }

        const frag = document.createDocumentFragment();
        const supportsTimelineTooltipActions = tm.getTimelineFeatures?.()?.timeline_tooltipActions === true;

        tm.markers.forEach((marker, i) => {
            const item = document.createElement('div');
            item.className = 'ait-ql-item';
            if (marker.id === tm.activeTurnId) item.classList.add('active');
            item.dataset.index = i;
            item.dataset.turnId = marker.id;

            const idx = document.createElement('span');
            idx.className = 'ait-ql-item-index';
            idx.textContent = `Q${i + 1}`;

            const text = document.createElement('span');
            text.className = 'ait-ql-item-text';
            text.textContent = marker.summary || '...';

            let pin = null;
            let star = null;
            if (supportsTimelineTooltipActions) {
                // Pin icon
                const isPinned = tm.pinned.has(marker.id);
                pin = document.createElement('span');
                pin.className = 'ait-ql-item-pin';
                if (!isPinned) pin.classList.add('not-pinned');
                const pinTip = () => tm.pinned.has(marker.id)
                    ? (chrome.i18n.getMessage('unpinAction') || '取消标记重点')
                    : (chrome.i18n.getMessage('pinAction') || '标记重点');
                pin.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const ok = await tm.togglePin(marker.id);
                    if (ok) {
                        pin.classList.toggle('not-pinned', !tm.pinned.has(marker.id));
                    }
                });
                pin.addEventListener('mouseenter', () => {
                    window.globalTooltipManager.show(`ql-pin-${i}`, 'button', pin, pinTip(), { placement: 'top' });
                });
                pin.addEventListener('mouseleave', () => { window.globalTooltipManager.hide(); });

                // Star icon
                const isStarred = tm.starred.has(marker.id);
                const starTip = () => tm.starred.has(marker.id)
                    ? (chrome.i18n.getMessage('unstarAction') || '取消收藏')
                    : (chrome.i18n.getMessage('starAction') || '收藏到文件夹');
                star = document.createElement('span');
                star.className = 'ait-ql-item-star';
                if (!isStarred) star.classList.add('not-starred');
                star.dataset.turnId = marker.id;
                star.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const result = await tm.toggleStar(marker.id);
                    if (result?.success) {
                        star.classList.toggle('not-starred', !tm.starred.has(marker.id));
                    }
                });
                star.addEventListener('mouseenter', () => {
                    window.globalTooltipManager.show(`ql-star-${i}`, 'button', star, starTip(), { placement: 'top' });
                });
                star.addEventListener('mouseleave', () => { window.globalTooltipManager.hide(); });
            }

            text.addEventListener('mouseenter', () => {
                if (text.scrollWidth > text.clientWidth) {
                    const el = this._buildItemTooltipElement(marker);
                    window.globalTooltipManager.show(
                        `ql-item-${i}`,
                        'node',
                        item,
                        { element: el },
                        { placement: 'left', maxWidth: 320 }
                    );
                }
            });
            text.addEventListener('mouseleave', () => {
                window.globalTooltipManager.hide();
            });

            item.addEventListener('click', () => {
                tm.scrollToIndex(i);
                this._updateActiveItem(marker.id);
            });

            item.appendChild(idx);
            item.appendChild(text);
            if (pin) item.appendChild(pin);
            if (star) item.appendChild(star);
            frag.appendChild(item);
        });

        this._listEl.appendChild(frag);
    }

    _updateActiveItem(turnId) {
        if (!this._listEl) return;
        this._listEl.querySelectorAll('.ait-ql-item.active').forEach(el => el.classList.remove('active'));
        const item = this._listEl.querySelector(`.ait-ql-item[data-turn-id="${turnId}"]`);
        if (item) item.classList.add('active');
    }

    _scrollActiveIntoView() {
        if (!this._listEl) return;
        const activeItem = this._listEl.querySelector('.ait-ql-item.active');
        if (activeItem) {
            activeItem.scrollIntoView({ block: 'center', behavior: 'instant' });
        }
    }

    _buildItemTooltipElement(marker) {
        const container = document.createElement('div');
        container.className = 'timeline-tooltip-container';

        const contentWrap = document.createElement('div');
        contentWrap.className = 'timeline-tooltip-content-wrap';

        const timeStr = marker.timeLabel
            || marker.element?.getAttribute('data-ait-time')
            || marker.element?.querySelector?.('[data-ait-time]')?.getAttribute('data-ait-time');
        if (timeStr) {
            const timeTag = document.createElement('span');
            timeTag.className = 'timeline-tooltip-time';
            timeTag.textContent = timeStr;
            contentWrap.appendChild(timeTag);
        }

        const content = document.createElement('div');
        content.className = 'timeline-tooltip-content';
        content.style.pointerEvents = 'none';
        content.textContent = marker.summary || '';

        contentWrap.appendChild(content);
        container.appendChild(contentWrap);
        return container;
    }

    _onClickOutside(e) {
        if (!this._visible || !this._el) return;
        if (this._el.contains(e.target)) return;
        const tm = window.timelineManager;
        if (tm?.ui?.questionListBtn?.contains(e.target)) return;
        this.hide();
    }

    _onActiveChange(e) {
        if (!this._visible) return;
        const tm = window.timelineManager;
        if (!tm || !tm.markers) return;
        const idx = e.detail?.currentIndex;
        if (idx == null || idx < 0 || idx >= tm.markers.length) return;
        const turnId = tm.markers[idx].id;
        this._updateActiveItem(turnId);
        this._scrollActiveIntoView();
    }

    onMarkersRebuilt() {
        if (!this._visible || !this._listEl) return;
        const tm = window.timelineManager;
        if (!tm || !tm.markers || tm.markers.length === 0) {
            this.hide();
            return;
        }

        const scrollTop = this._listEl.scrollTop;
        this._renderItems(tm);
        this._listEl.scrollTop = scrollTop;
    }
}

if (typeof window.questionListPopup === 'undefined') {
    window.questionListPopup = new QuestionListPopup();
}
