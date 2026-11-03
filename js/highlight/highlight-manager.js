/**
 * Highlight Manager
 *
 * 网页文字标注功能核心模块
 * - 选中文字后创建高亮标注（<mark> 包裹）
 * - 序列化：TextQuoteSelector (exact + prefix + suffix) + TextPositionSelector (start + end)
 * - 页面加载及正文重建时恢复高亮，节流并跳过自身 DOM 修改
 * - 三级匹配（精确 → 模糊前缀锚定 → 模糊直接匹配）
 * - 使用 diff-match-patch 做模糊匹配，容忍页面渲染差异
 *
 * 存储结构（chrome.storage.local）：
 *   highlightEnabled  — boolean，功能开关
 *   highlightColor    — string，当前高亮颜色
 *   highlightData     — { [url]: [ {id, text, prefix, suffix, start, end, color, style, annotation, createdAt} ] }
 */

const _HL_INVISIBLE_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'IFRAME']);
const _HL_RESTORE_IGNORE_SELECTOR = [
    'input', 'textarea', 'select', '[contenteditable="true"]',
    '.ait-hl-popover', '.ait-highlight-standalone-btn', '.ait-quick-ask-btn',
    '.ait-panel-modal', '.ait-notepad-panel', '.ait-chat-timeline-wrapper',
    '.timeline-tooltip-overlay'
].join(',');

class HighlightManager {
    constructor() {
        this.isEnabled = false;
        this.currentColor = HIGHLIGHT_DEFAULT_COLORS[0];
        this.currentStyle = 'solid';
        this._storageKey = 'highlightData';
        this._colorKey = 'highlightColor';
        this._styleKey = 'highlightStyle';
        this._enabledKey = 'highlightEnabled';
        this._contextLen = 32;
        this._dmp = new diff_match_patch();
        this._dmp.Match_Threshold = 0.4;
        this._dmp.Match_Distance = 500;
        this._restoreObserver = null;
        this._observerActive = false;
        this._observerPauseDepth = 0;
        this._restoreTimer = null;
        this._restorePromise = null;
        this._restoreAgain = false;
        this._restoreDeferred = false;
        this._pageHighlights = null;
        this._pageHighlightsKey = null;
        this._dataRevision = 0;
        this._removedHighlightIds = new Set();
        this._obsoleteHighlightIds = new Set();
        this._destroyed = false;
    }

    async init() {
        const result = await chrome.storage.local.get([this._enabledKey, this._colorKey, this._styleKey]);
        this.isEnabled = result[this._enabledKey] !== false;
        if (result[this._colorKey]) this.currentColor = result[this._colorKey];
        if (result[this._styleKey]) this.currentStyle = result[this._styleKey];

        this._onStorageChange = (changes, area) => {
            if (area !== 'local') return;
            if (changes[this._enabledKey]) {
                this.isEnabled = changes[this._enabledKey].newValue !== false;
                if (this.isEnabled) this.scheduleRestore();
                else {
                    this._stopObserving();
                    this._cancelRestore();
                    this.clearAllMarks();
                }
            }
            if (changes[this._colorKey]) {
                this.currentColor = changes[this._colorKey].newValue || HIGHLIGHT_DEFAULT_COLORS[0];
            }
            if (changes[this._styleKey]) {
                this.currentStyle = changes[this._styleKey].newValue || 'solid';
            }
            if (changes[this._storageKey]) {
                this._dataRevision++;
                this._pageHighlights = null;
                const storedIds = new Set((changes[this._storageKey].newValue?.[this._getPageKey()] || []).map(hl => hl.id));
                const previousHighlights = changes[this._storageKey].oldValue?.[this._getPageKey()] || [];
                // 只清理确实从存储中移除的记录，避免误删尚在保存中的新标记。
                for (const hl of previousHighlights) {
                    if (!storedIds.has(hl.id)) this._obsoleteHighlightIds.add(hl.id);
                }
                for (const id of storedIds) this._obsoleteHighlightIds.delete(id);
                for (const id of this._removedHighlightIds) {
                    if (!storedIds.has(id)) this._removedHighlightIds.delete(id);
                }
                this.scheduleRestore();
            }
        };
        chrome.storage.onChanged.addListener(this._onStorageChange);
        this._onSelectionChange = () => {
            if (this._restoreDeferred && window.getSelection()?.isCollapsed !== false) {
                this.scheduleRestore();
            }
        };
        document.addEventListener('selectionchange', this._onSelectionChange);
        await this.restoreHighlights();
    }

    // ==================== TreeWalker 工具 ====================

    _isVisibleTextNode(node) {
        let el = node.parentElement;
        while (el && el !== document.body) {
            if (_HL_INVISIBLE_TAGS.has(el.tagName)) return false;
            el = el.parentElement;
        }
        return true;
    }

    _createVisibleTextWalker(root = document.body) {
        return document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode: (node) => this._isVisibleTextNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
        });
    }

    _collectTextNodes(root = document.body) {
        const tw = this._createVisibleTextWalker(root);
        const textArr = [];
        const nodes = [];
        let node;
        while ((node = tw.nextNode())) {
            textArr.push(node.textContent);
            nodes.push(node);
        }
        return { textArr, nodes, text: textArr.join('') };
    }

    // ==================== 选区与已有高亮的关系判断 ====================

    isSelectionInsideHighlight() {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed) return false;
        const range = selection.getRangeAt(0);
        const startEl = range.startContainer.nodeType === Node.TEXT_NODE ? range.startContainer.parentElement : range.startContainer;
        const endEl = range.endContainer.nodeType === Node.TEXT_NODE ? range.endContainer.parentElement : range.endContainer;
        if (!startEl || !endEl) return false;
        const startMark = startEl.closest('mark.ait-highlight');
        const endMark = endEl.closest('mark.ait-highlight');
        return !!(startMark && endMark && startMark.dataset.hlId === endMark.dataset.hlId);
    }

    _getOverlappingHighlightIds(range) {
        const ids = new Set();
        const marks = document.querySelectorAll('mark.ait-highlight');
        for (const mark of marks) {
            if (range.intersectsNode(mark)) {
                ids.add(mark.dataset.hlId);
            }
        }
        return ids;
    }

    // ==================== 创建高亮 ====================

    async highlightSelection(opts = {}) {
        if (!this.isEnabled) return false;

        const selection = window.getSelection();
        if (!selection || selection.isCollapsed || !selection.toString().trim()) return false;
        if (this.isSelectionInsideHighlight()) return false;

        return this.highlightRange(selection.getRangeAt(0), opts);
    }

    async highlightRange(range, opts = {}) {
        if (!this.isEnabled || !range) return false;

        const color = opts.color || this.currentColor;
        const style = opts.style || this.currentStyle;
        const annotation = opts.annotation || '';

        const overlapping = this._getOverlappingHighlightIds(range);

        const serialized = this._serialize(range, range.toString(), { color, style, annotation });
        if (!serialized) return false;

        if (overlapping.size > 0) {
            for (const id of overlapping) {
                this._unwrapHighlight(id);
            }
            for (const id of overlapping) {
                await this._removeFromStorage(id);
            }

            const recoveredRange = this._findRange(serialized);
            if (!recoveredRange) return false;

            try {
                this._wrapRange(recoveredRange, serialized.id, color, style, annotation);
            } catch (e) {
                this._wrapRangeComplex(recoveredRange, serialized.id, color, style, annotation);
            }
        } else {
            try {
                this._wrapRange(range, serialized.id, color, style, annotation);
            } catch (e) {
                this._wrapRangeComplex(range, serialized.id, color, style, annotation);
            }
        }

        await this._saveHighlight(serialized);
        window.getSelection()?.removeAllRanges();
        return true;
    }

    async highlightSerialized(serialized) {
        if (!this.isEnabled || !serialized) return false;

        let range = this._findRange(serialized);
        if (!range) return false;

        const overlapping = this._getOverlappingHighlightIds(range);
        if (overlapping.size > 0) {
            for (const id of overlapping) {
                this._unwrapHighlight(id);
            }
            for (const id of overlapping) {
                await this._removeFromStorage(id);
            }
            range = this._findRange(serialized);
            if (!range) return false;
        }

        const { color, style, annotation } = serialized;
        try {
            this._wrapRange(range, serialized.id, color, style, annotation || '');
        } catch {
            try {
                this._wrapRangeComplex(range, serialized.id, color, style, annotation || '');
            } catch { return false; }
        }

        await this._saveHighlight(serialized);
        window.getSelection()?.removeAllRanges();
        return true;
    }

    // ==================== 删除高亮 ====================

    _unwrapHighlight(id) {
        this._withObserverPaused(() => {
            const marks = document.querySelectorAll(`mark.ait-highlight[data-hl-id="${id}"]`);
            marks.forEach(mark => {
                const parent = mark.parentNode;
                while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
                parent.removeChild(mark);
                parent.normalize();
            });
        });
    }

    removeHighlight(id) {
        this._unwrapHighlight(id);
        this._removeFromStorage(id);
    }

    // ==================== 恢复高亮 ====================

    scheduleRestore(delay = 300) {
        if (!this.isEnabled || this._destroyed || this._restoreTimer !== null) return;
        // 不重置已有计时器，流式输出持续变化时也能定期恢复。
        this._restoreTimer = setTimeout(() => {
            this._restoreTimer = null;
            this.restoreHighlights().catch(() => {});
        }, delay);
    }

    _cancelRestore() {
        clearTimeout(this._restoreTimer);
        this._restoreTimer = null;
        this._restoreAgain = false;
        this._restoreDeferred = false;
    }

    _isRestoreContentNode(node) {
        const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
        return !element?.closest(_HL_RESTORE_IGNORE_SELECTOR)
            && !element?.closest('script, style, noscript, template, iframe');
    }

    _handleContentMutations(mutations) {
        if (mutations.some(mutation => this._isRestoreContentNode(mutation.target)
            && (mutation.type === 'characterData'
                || [...mutation.addedNodes, ...mutation.removedNodes].some(node =>
                    this._isRestoreContentNode(node) && node.textContent?.trim())))) {
            this.scheduleRestore();
        }
    }

    _startObserving() {
        if (!this.isEnabled || this._destroyed || this._observerPauseDepth
            || !this._pageHighlights?.length || this._pageHighlightsKey !== this._getPageKey()) return;
        if (!this._restoreObserver) {
            this._restoreObserver = new MutationObserver(mutations => this._handleContentMutations(mutations));
        }
        if (!this._observerActive) {
            this._restoreObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
            this._observerActive = true;
        }
    }

    _stopObserving() {
        this._restoreObserver?.disconnect();
        this._observerActive = false;
    }

    _withObserverPaused(callback) {
        if (this._observerActive) {
            // 先保留尚未派发的正文变化，再屏蔽本次高亮自身的 DOM 写入。
            this._handleContentMutations(this._restoreObserver.takeRecords());
            this._stopObserving();
        }
        this._observerPauseDepth++;
        try {
            return callback();
        } finally {
            this._observerPauseDepth--;
            this._startObserving();
        }
    }

    handlePageChange() {
        this._stopObserving();
        this._cancelRestore();
        this._dataRevision++;
        this._pageHighlights = null;
        this._pageHighlightsKey = null;
        this._removedHighlightIds.clear();
        this._obsoleteHighlightIds.clear();
        this.clearAllMarks();
        this.scheduleRestore();
    }

    restoreHighlights() {
        if (!this.isEnabled || this._destroyed) return Promise.resolve();
        if (this._restorePromise) {
            this._restoreAgain = true;
            return this._restorePromise;
        }
        this._restorePromise = this._restoreHighlights().finally(() => {
            this._restorePromise = null;
            if (this._restoreAgain) {
                this._restoreAgain = false;
                this.scheduleRestore();
            }
        });
        return this._restorePromise;
    }

    async _restoreHighlights() {
        const url = this._getPageKey();
        if (this._pageHighlights === null || this._pageHighlightsKey !== url) {
            const revision = this._dataRevision;
            const allData = await this._loadAllData();
            if (!this.isEnabled || this._destroyed || url !== this._getPageKey()
                || revision !== this._dataRevision) {
                this.scheduleRestore();
                return;
            }
            this._pageHighlights = allData[url] || [];
            this._pageHighlightsKey = url;
        }
        const highlights = this._pageHighlights;
        this._startObserving();
        // 不在用户选区或临时高亮上写入，避免破坏正在编辑的 Range。
        this._restoreDeferred = window.getSelection()?.isCollapsed === false
            || !!document.querySelector('mark.ait-highlight-pending');
        if (this._restoreDeferred) return;

        // 同步/导入可能用新 ID 替换同一段文字，先移除旧标记，再定位新高亮。
        // 空列表也要执行清理；选区和临时标注则沿用上面的延后处理。
        for (const id of this._obsoleteHighlightIds) this._unwrapHighlight(id);
        this._obsoleteHighlightIds.clear();
        if (!highlights.length) {
            this._stopObserving();
            return;
        }

        const marksById = new Map();
        document.querySelectorAll('mark.ait-highlight[data-hl-id]').forEach(mark => {
            const id = mark.dataset.hlId;
            if (!marksById.has(id)) marksById.set(id, []);
            marksById.get(id).push(mark);
        });
        let content = null;
        for (const hl of highlights) {
            if (this._removedHighlightIds.has(hl.id)) continue;
            // wrap/unwrap 会移动其它 ID 的 mark，节点引用仍有效；跳过已移除的节点。
            const marks = (marksById.get(hl.id) || []).filter(mark => mark.isConnected);
            const markedText = marks.map(mark => mark.textContent).join('');
            if (marks.length && (markedText === hl.text || markedText === hl.text.replace(/\*\*|__/g, ''))) continue;

            // 尚未挂载的多条消息共用一次正文扫描；只有修改 DOM 后才重新采集节点。
            if (!content) content = this._collectTextNodes();
            let range = this._findRangeIn(content.text, content.textArr, content.nodes, hl);
            if (range && marks.length) {
                this._unwrapHighlight(hl.id);
                content = this._collectTextNodes();
                range = this._findRangeIn(content.text, content.textArr, content.nodes, hl);
            }
            if (range) {
                const hlStyle = hl.style || 'solid';
                const hlNote = hl.annotation || '';
                try {
                    this._wrapRange(range, hl.id, hl.color, hlStyle, hlNote);
                } catch (e1) {
                    try {
                        this._wrapRangeComplex(range, hl.id, hl.color, hlStyle, hlNote);
                    } catch { /* skip */ }
                }
                // mark 会切分文本节点，后面的高亮不能沿用本轮修改前的节点。
                content = null;
            }
        }
    }

    clearAllMarks() {
        this._withObserverPaused(() => {
            document.querySelectorAll('mark.ait-highlight').forEach(mark => {
                const parent = mark.parentNode;
                while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
                parent.removeChild(mark);
                parent.normalize();
            });
        });
    }

    destroy() {
        this._destroyed = true;
        this._cancelRestore();
        this._stopObserving();
        if (this._onStorageChange) chrome.storage.onChanged.removeListener(this._onStorageChange);
        if (this._onSelectionChange) document.removeEventListener('selectionchange', this._onSelectionChange);
    }

    // ==================== 序列化（TextQuoteSelector + TextPositionSelector） ====================

    _serialize(range, text, opts = {}) {
        if (!text.trim()) return null;

        const { fullText, idx, endIdx } = this._buildTextAndOffset(range);
        if (idx === -1 || endIdx === -1) return null;

        const exact = fullText.substring(idx, endIdx);
        if (!exact.trim()) return null;

        const prefix = fullText.substring(Math.max(0, idx - this._contextLen), idx);
        const suffix = fullText.substring(endIdx, endIdx + this._contextLen);

        const hl = {
            id: 'hl_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
            text: exact,
            prefix,
            suffix,
            start: idx,
            end: endIdx,
            color: opts.color || this.currentColor,
            style: opts.style || this.currentStyle,
            createdAt: Date.now()
        };
        if (opts.annotation) hl.annotation = opts.annotation;
        return hl;
    }

    _buildTextAndOffset(range) {
        const tw = this._createVisibleTextWalker();
        let fullText = '';
        let startIdx = -1;
        let endIdx = -1;
        let node;
        while ((node = tw.nextNode())) {
            if (node === range.startContainer && startIdx === -1) {
                startIdx = fullText.length + range.startOffset;
            }
            if (node === range.endContainer && endIdx === -1) {
                endIdx = fullText.length + range.endOffset;
            }
            fullText += node.textContent;
        }
        return { fullText, idx: startIdx, endIdx };
    }

    // ==================== 查找 Range（恢复用 — 三级模糊匹配） ====================

    _findRange(hl) {
        const { textArr, nodes, text } = this._collectTextNodes();
        return this._findRangeIn(text, textArr, nodes, hl);
    }

    _findRangeIn(text, textArr, nodes, hl) {
        let matchIdx = -1;
        let matchLen = hl.text.length;

        // Strategy 1: 精确 indexOf + 上下文验证
        matchIdx = this._exactSearch(text, hl);

        // Strategy 2: 模糊前缀/后缀锚定（需要至少一个锚点命中）
        if (matchIdx === -1 && (hl.prefix || hl.suffix)) {
            const result = this._fuzzyAnchorSearch(text, hl);
            if (result) {
                matchIdx = result.index;
                matchLen = result.length;
            }
        }

        // Strategy 3: 短文本（≤32字符）模糊直接匹配 + 上下文验证
        if (matchIdx === -1 && hl.text.length <= 32) {
            const loc = hl.start != null ? Math.min(hl.start, text.length) : Math.floor(text.length / 2);
            const pos = this._dmp.match_main(text, hl.text, loc);
            if (pos !== -1 && this._verifyContext(text, pos, hl.text.length, hl.prefix, hl.suffix)) {
                matchIdx = pos;
                matchLen = hl.text.length;
            }
        }

        if (matchIdx === -1) return null;
        return this._offsetToRange(nodes, textArr, matchIdx, matchLen);
    }

    _exactSearch(text, hl) {
        let searchStart = 0;
        while (true) {
            const pos = text.indexOf(hl.text, searchStart);
            if (pos === -1) return -1;

            if (this._verifyContext(text, pos, hl.text.length, hl.prefix, hl.suffix)) {
                return pos;
            }
            searchStart = pos + 1;
        }
    }

    _fuzzyAnchorSearch(text, hl) {
        let expectedPos = hl.start != null ? Math.min(hl.start, text.length) : -1;
        let anchored = false;

        if (hl.prefix) {
            const prefixSnippet = hl.prefix.substring(Math.max(0, hl.prefix.length - 32));
            const searchLoc = expectedPos >= 0 ? Math.max(0, expectedPos - prefixSnippet.length) : Math.floor(text.length / 2);
            const prefixLoc = this._dmp.match_main(text, prefixSnippet, searchLoc);
            if (prefixLoc !== -1) {
                expectedPos = prefixLoc + prefixSnippet.length;
                anchored = true;
            }
        }

        if (!anchored && hl.suffix) {
            const suffixSnippet = hl.suffix.substring(0, Math.min(32, hl.suffix.length));
            const searchLoc = expectedPos >= 0 ? expectedPos + hl.text.length : Math.floor(text.length / 2);
            const suffixLoc = this._dmp.match_main(text, suffixSnippet, searchLoc);
            if (suffixLoc !== -1) {
                expectedPos = suffixLoc - hl.text.length;
                anchored = true;
            }
        }

        if (!anchored) return null;

        const searchFrom = Math.max(0, expectedPos - 100);
        const exactIdx = text.indexOf(hl.text, searchFrom);
        if (exactIdx !== -1 && Math.abs(exactIdx - expectedPos) < 300) {
            return { index: exactIdx, length: hl.text.length };
        }

        const stripped = hl.text.replace(/\*\*|__/g, '');
        if (stripped !== hl.text && stripped.length > 0) {
            const strippedIdx = text.indexOf(stripped, searchFrom);
            if (strippedIdx !== -1 && Math.abs(strippedIdx - expectedPos) < 300) {
                return { index: strippedIdx, length: stripped.length };
            }
        }

        return null;
    }

    _verifyContext(text, pos, len, prefix, suffix) {
        if (prefix) {
            const before = text.substring(Math.max(0, pos - this._contextLen * 2), pos);
            const tail = prefix.substring(Math.max(0, prefix.length - 8));
            if (!before.includes(tail)) return false;
        }
        if (suffix) {
            const after = text.substring(pos + len, pos + len + this._contextLen * 2);
            const head = suffix.substring(0, Math.min(8, suffix.length));
            if (!after.includes(head)) return false;
        }
        return true;
    }

    _offsetToRange(nodes, textArr, offset, length) {
        let cumulative = 0;
        let startNode = null, startOffset = 0;
        let endNode = null, endOffset = 0;

        for (let i = 0; i < nodes.length; i++) {
            const nodeLen = textArr[i].length;
            const nodeEnd = cumulative + nodeLen;

            if (!startNode && offset < nodeEnd) {
                startNode = nodes[i];
                startOffset = offset - cumulative;
            }

            if (startNode && offset + length <= nodeEnd) {
                endNode = nodes[i];
                endOffset = offset + length - cumulative;
                break;
            }

            cumulative = nodeEnd;
        }

        if (!startNode || !endNode) return null;

        try {
            const range = document.createRange();
            range.setStart(startNode, startOffset);
            range.setEnd(endNode, endOffset);
            return range;
        } catch {
            return null;
        }
    }

    // ==================== DOM 包裹 ====================

    _applyMarkStyle(mark, color, style) {
        const s = style || this.currentStyle;
        switch (s) {
            case 'half':
            case 'highlighter':
                mark.style.cssText = `background: linear-gradient(transparent 50%, ${color} 50%) !important;`;
                mark.dataset.hlStyle = 'half';
                break;
            case 'underline':
                mark.style.cssText = `background: linear-gradient(transparent calc(100% - 4px), ${color} calc(100% - 4px)) !important; padding-bottom: 2px;`;
                mark.dataset.hlStyle = 'underline';
                break;
            case 'textOnly':
                mark.style.cssText = `background: transparent !important; color: ${color} !important;`;
                mark.dataset.hlStyle = 'textOnly';
                break;
            default:
                mark.style.cssText = `background-color: ${color} !important;`;
                mark.dataset.hlStyle = 'solid';
                break;
        }
    }

    _createMark(id, color, style, annotation) {
        const mark = document.createElement('mark');
        mark.className = 'ait-highlight';
        mark.dataset.hlId = id;
        this._applyMarkStyle(mark, color, style);
        if (annotation) mark.title = annotation;
        return mark;
    }

    _wrapRange(range, id, color, style, annotation) {
        return this._withObserverPaused(() => {
            const mark = this._createMark(id, color, style, annotation);
            try {
                range.surroundContents(mark);
            } catch {
                this._wrapRangeComplex(range, id, color, style, annotation);
                return;
            }
            this._bindMarkEvents(mark);
        });
    }

    _wrapRangeComplex(range, id, color, style, annotation) {
        return this._withObserverPaused(() => {
            const nodes = this._getTextNodesInRange(range);
            if (nodes.length === 0) return;

            for (let i = 0; i < nodes.length; i++) {
                const mark = this._createMark(id, color, style, annotation);
                const subRange = document.createRange();
                subRange.setStart(nodes[i].node, nodes[i].start);
                subRange.setEnd(nodes[i].node, nodes[i].end);
                subRange.surroundContents(mark);
                this._bindMarkEvents(mark);
            }
        });
    }

    _getTextNodesInRange(range) {
        const result = [];
        const treeWalker = document.createTreeWalker(
            range.commonAncestorContainer.nodeType === Node.TEXT_NODE
                ? range.commonAncestorContainer.parentElement
                : range.commonAncestorContainer,
            NodeFilter.SHOW_TEXT, null
        );

        let node;
        while ((node = treeWalker.nextNode())) {
            if (!range.intersectsNode(node)) continue;

            const start = node === range.startContainer ? range.startOffset : 0;
            const end = node === range.endContainer ? range.endOffset : node.textContent.length;
            if (end > start) {
                result.push({ node, start, end });
            }
        }

        return result;
    }

    _bindMarkEvents(mark) {
        mark.addEventListener('mouseenter', () => {
            const id = mark.dataset.hlId;
            document.querySelectorAll(`mark.ait-highlight[data-hl-id="${id}"]`).forEach(m => m.classList.add('ait-highlight-hover'));
        });
        mark.addEventListener('mouseleave', () => {
            const id = mark.dataset.hlId;
            document.querySelectorAll(`mark.ait-highlight[data-hl-id="${id}"]`).forEach(m => m.classList.remove('ait-highlight-hover'));
        });
        mark.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = mark.dataset.hlId;
            window.dispatchEvent(new CustomEvent('ait-highlight-click', { detail: { id, mark } }));
        });
    }

    // ==================== 存储 ====================

    _getPageKey() {
        return location.origin + location.pathname;
    }

    async _loadAllData() {
        const result = await chrome.storage.local.get(this._storageKey);
        return result[this._storageKey] || {};
    }

    async _saveHighlight(hl) {
        const url = this._getPageKey();
        const allData = await this._loadAllData();
        if (!allData[url]) allData[url] = [];
        allData[url].push(hl);
        await chrome.storage.local.set({ [this._storageKey]: allData });
    }

    async _removeFromStorage(id) {
        // 存储写入完成前，已排队的恢复任务也不能重新画出刚删除的高亮。
        this._removedHighlightIds.add(id);
        const url = this._getPageKey();
        const allData = await this._loadAllData();
        if (!allData[url]) return;
        allData[url] = allData[url].filter(h => h.id !== id);
        if (allData[url].length === 0) delete allData[url];
        await chrome.storage.local.set({ [this._storageKey]: allData });
    }

    async getHighlightById(id) {
        const url = this._getPageKey();
        const allData = await this._loadAllData();
        return allData[url]?.find(h => h.id === id) || null;
    }

    async updateHighlight(id, updates) {
        const url = this._getPageKey();
        const allData = await this._loadAllData();
        if (!allData[url]) return;
        const hl = allData[url].find(h => h.id === id);
        if (!hl) return;
        Object.assign(hl, updates);
        await chrome.storage.local.set({ [this._storageKey]: allData });

        const marks = document.querySelectorAll(`mark.ait-highlight[data-hl-id="${id}"]`);
        marks.forEach(mark => {
            if (updates.color || updates.style) {
                this._applyMarkStyle(mark, updates.color || hl.color, updates.style || hl.style);
            }
            if ('annotation' in updates) {
                mark.title = updates.annotation || '';
            }
        });
    }

    async setColor(color) {
        this.currentColor = color;
        await chrome.storage.local.set({ [this._colorKey]: color });
    }

    async setStyle(style) {
        this.currentStyle = style;
        await chrome.storage.local.set({ [this._styleKey]: style });
    }

    async setEnabled(enabled) {
        this.isEnabled = enabled;
        if (!enabled) {
            this._stopObserving();
            this._cancelRestore();
            this.clearAllMarks();
        }
        await chrome.storage.local.set({ [this._enabledKey]: enabled });
        if (enabled) await this.restoreHighlights();
    }
}

window.HighlightManager = HighlightManager;
