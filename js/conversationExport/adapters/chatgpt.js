/**
 * Conversation Export - ChatGPT 导出适配器
 *
 * 与 Gemini 的关键差异：
 * 1. ChatGPT 对话是虚拟渲染的，滚出视口的内容会被卸载，无法用「滚到顶再一次性读 DOM」
 *    的方式采集。因此采用 STATIC 加载策略（loadStrategy = CE_LOAD_STRATEGY.STATIC），
 *    改为从 React Fiber 读取完整对话（经本目录下 MAIN-world 桥 bridges/chatgpt-fiber-bridge.js）。
 * 2. ChatGPT 的用户与助手是各自独立的 <article data-turn="user|assistant" data-turn-id>，
 *    不像 Gemini 用一个 .conversation-container 同时装问答。因此需要按文档顺序把
 *    「用户轮 + 紧随其后的助手轮」配成一对。
 *
 * 内容来源优先级：Fiber（原始文本/markdown） → DOM 兜底（当前已渲染的轮次）。
 * 用户/助手消息选择器复用基类共享方法（优先取时间轴 adapter）。
 */

class CEChatGPTExportAdapter extends CEExportAdapter {
    constructor() {
        super('chatgpt');
        // ChatGPT 完整对话数据已在内存（React Fiber），无需滚动，直接读取
        this.loadStrategy = CE_LOAD_STRATEGY.STATIC;

        // prepareCollection 阶段填充：turnId -> { role, text }
        this._fiberTurns = null;
    }

    /** 兜底：与时间轴 getStarChatButtonTarget 相同的分享按钮锚点 */
    _fallbackButtonInsertTarget() {
        return document.querySelector('[data-testid="share-chat-button"]');
    }

    /**
     * 对话轮单元 = { userEl, assistantEl } 配对。
     * ChatGPT 用户与助手是各自独立的 <article data-turn>，按文档顺序用基类
     * _pairFlatTurns 配对（以用户轮为锚，配其后的第一个助手轮）。
     * @returns {Array<{userEl:Element, assistantEl:Element|null}>}
     */
    getTurnContainers() {
        const ordered = Array.from(document.querySelectorAll('[data-turn-id][data-turn]'));
        return this._pairFlatTurns(ordered, el => el.getAttribute('data-turn'));
    }

    /**
     * 采集前：一次性从 Fiber 拉取完整对话文本并缓存。
     */
    async prepareCollection() {
        this._fiberTurns = this._extractFiberTurns();
    }

    /**
     * @param {{userEl:Element, assistantEl:Element|null}} pair
     */
    extractTurn(pair) {
        if (!pair || !pair.userEl) return null;

        const userTurnId = pair.userEl.getAttribute('data-turn-id');
        const user = this._extractUser(pair.userEl, userTurnId);
        const assistant = this._extractAssistant(pair.assistantEl);

        // 用户与助手都为空，跳过
        if (!user.text && !user.images.length && !assistant.text && !assistant.images.length) {
            return null;
        }

        const id = userTurnId ? `chatgpt-${userTurnId}` : null;
        return { id, user, assistant };
    }

    // ==================== 内部 ====================

    _extractUser(userEl, userTurnId) {
        const fiber = userTurnId ? this._fiberTurns?.get(userTurnId) : null;
        let text = fiber?.text || '';
        if (!text) text = this._domUserText(userEl);
        const images = this._resolveImages(userEl, fiber, 'user');
        return { text, images, time: this._getAskTime(userEl) };
    }

    _extractAssistant(assistantEl) {
        if (!assistantEl) return { markdown: '', text: '', images: [] };

        const assistantTurnId = assistantEl.getAttribute('data-turn-id');
        const fiber = assistantTurnId ? this._fiberTurns?.get(assistantTurnId) : null;

        // Fiber 提供的是原始 markdown 源文本，直接作为 markdown 使用最理想；
        // 拿不到时退化为对已渲染 DOM 做 markdown 转换。
        if (fiber?.text) {
            const md = this._normalizeLatexDelimiters(fiber.text);
            const images = this._resolveImages(assistantEl, fiber, 'assistant');
            return { markdown: md, text: md, images };
        }

        const dom = this._domMarkdownFrom(assistantEl, ['.markdown', '[data-message-author-role="assistant"]']);
        // 无 fiber 文本但 fiber 仍有图片引用（如纯图片轮）时，图片走 bridge 优先
        if (fiber?.images?.length) {
            dom.images = this._resolveImages(assistantEl, fiber, 'assistant');
        }
        return dom;
    }

    /**
     * 归一化 ChatGPT 的 LaTeX 分隔符，使其与导出器/其它平台一致（$$ 块级、$ 行内）。
     *
     * ChatGPT 原始 markdown 用 \[ ... \] 表示块级公式、\( ... \) 表示行内公式，
     * 而 PNG/文本导出的公式解析只认 $$ 与 $；不转换会被当作普通文本原样输出（显示 LaTeX 码）。
     * 为避免误伤，先挖出代码块(```)与行内代码(`)占位，转换后再还原。
     * @param {string} md
     * @returns {string}
     */
    _normalizeLatexDelimiters(md) {
        if (!md || (!md.includes('\\[') && !md.includes('\\('))) return md || '';

        const placeholders = [];
        const stash = (m) => `\u0000${placeholders.push(m) - 1}\u0000`;

        let s = md
            .replace(/```[\s\S]*?```/g, stash)   // 围栏代码块
            .replace(/`[^`\n]*`/g, stash);        // 行内代码

        s = s
            .replace(/\\\[([\s\S]*?)\\\]/g, (_, inner) => `\n$$\n${inner.trim()}\n$$\n`)  // 块级
            .replace(/\\\(([\s\S]*?)\\\)/g, (_, inner) => `$${inner.trim()}$`);            // 行内

        return s.replace(/\u0000(\d+)\u0000/g, (_, i) => placeholders[Number(i)]);
    }

    /**
     * 图片解析：bridge 优先 + DOM 兜底。
     * - fiber 提供图片引用（稳定 fileId + 尺寸 + 文件名）时以其为准，真实 src 从当前 DOM
     *   的签名 URL（backend-api/...?id=fileId）按 fileId 匹配兜底；该轮未渲染（虚拟卸载）时
     *   拿不到 src，标记 unrendered，导出侧提示「无法内嵌」。
     * - fiber 无图片引用（桥不可用等）时退化为纯 DOM 采集。
     * @param {Element} turnEl
     * @param {{images?:Array}|null} fiber
     * @param {'user'|'assistant'} role
     * @returns {Array}
     */
    _resolveImages(turnEl, fiber, role) {
        const fiberImages = fiber?.images || [];
        if (!fiberImages.length) return this._collectImagesFrom(turnEl, role);

        const domUrlById = this._domImageUrlsByFileId(turnEl);
        return fiberImages.map(ref => {
            const src = domUrlById.get(ref.fileId) || '';
            return {
                role,
                src,
                alt: ref.name || '',
                width: ref.width || 0,
                height: ref.height || 0,
                fileId: ref.fileId,
                unrendered: !src,
            };
        });
    }

    /**
     * 扫描轮内 <img>，按其签名 URL 里的 id 参数（file_xxx）建立 fileId → src 映射。
     * ChatGPT 渲染的图片 src 形如 backend-api/estuary/content?id=file_xxx&...&sig=...
     * @param {Element} turnEl
     * @returns {Map<string,string>}
     */
    _domImageUrlsByFileId(turnEl) {
        const map = new Map();
        if (!turnEl) return map;
        turnEl.querySelectorAll('img').forEach(img => {
            const src = img.currentSrc || img.getAttribute('src') || '';
            const m = src.match(/[?&]id=(file[_-][A-Za-z0-9]+)/);
            if (m && !map.has(m[1])) map.set(m[1], src);
        });
        return map;
    }

    _domUserText(userEl) {
        if (!userEl) return '';
        const textEl = userEl.querySelector('.whitespace-pre-wrap');
        const raw = textEl ? textEl.textContent : userEl.textContent;
        return (raw || '').replace(/\s+/g, ' ').trim();
    }

    /**
     * 通过 MAIN world 的 fiber bridge 一次性提取完整对话（用户 + 助手）。
     * 与时间轴的 extractFiberTexts 同源（DOM 自定义事件同步往返）。
     * 桥不可用时返回空 Map，调用方自动退化为 DOM 提取。
     * @returns {Map<string, {role:string, text:string, images:Array}>} - turnId → { role, text, images }
     */
    _extractFiberTurns() {
        const cache = new Map();
        let received = false;
        const handler = (e) => {
            received = true;
            if (e.detail) {
                Object.entries(e.detail).forEach(([turnId, value]) => cache.set(turnId, value));
            }
        };
        document.addEventListener('conversation-export-fiber-result', handler, { once: true });
        document.dispatchEvent(new CustomEvent('conversation-export-extract-fiber'));
        if (!received) {
            document.removeEventListener('conversation-export-fiber-result', handler);
            if (!CEChatGPTExportAdapter._bridgeWarned) {
                CEChatGPTExportAdapter._bridgeWarned = true;
                // warn('[CEChatGPTExportAdapter] fiber bridge unavailable, falling back to DOM extraction. Check that conversationExport/bridges/chatgpt-fiber-bridge.js is loaded in MAIN world.');
            }
        }
        return cache;
    }
}
