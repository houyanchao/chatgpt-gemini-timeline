/** Export action adapter. Page selection and traversal are owned by messageActions. */
class ConversationExportAction {
    constructor() {
        this.id = 'export'; this.settingsKey = 'conversationExportPlatformSettings'; this.optionsKey = 'messageActionsExportOptions';
        this.barLayout = 'panel';
        this.settingsTabId = 'conversation-export';
        this.showConfirmIcon = false;
        // Lucide file-down (ISC); see ../messageActions/LUCIDE-LICENSE.
        this.icon = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M12 18v-6"/><path d="m9 15 3 3 3-3"/></svg>';
    }
    label() { return TimelineI18n.getMessage('exportLabel') || CE_TEXT.confirm; }
    confirmLabel() { return CE_TEXT.download; }
    copyType(options) {
        if (options.formatId === 'png') return 'image/png';
        return ['markdown', 'txt', 'json', 'csv'].includes(options.formatId) ? 'text/plain' : null;
    }
    copyLabel(options) { return TimelineI18n.getMessage(options.formatId === 'png' ? 'messageActionsCopyImage' : 'messageActionsCopyContent'); }
    supports(platformId) { return !!CE_EXPORT_ADAPTERS[platformId] && _isExportFeatureEnabled(platformId); }
    createHeaderButton({ adapter }) { return CEExportManager.createHeaderButton(adapter.platformId); }
    mountHeader(button, { adapter }) {
        if (adapter.platformId === 'chatgpt') return window.AITChatHeaderActions?.mount(button, 'export');
        const exporter = new CE_EXPORT_ADAPTERS[adapter.platformId]();
        const target = exporter.getButtonInsertTarget();
        if (!target?.parentElement) return false;
        if (adapter.platformId === 'deepseek' && window.AITChatHeaderActions?.mount(button, 'export', target)) return true;
        target.before(button);
        return true;
    }
    async createOptions({ adapter }) {
        const exporter = new CE_EXPORT_ADAPTERS[adapter.platformId]();
        const stored = await chrome.storage.local.get(this.optionsKey);
        return new CEExportOptions(await exporter.getDefaultThemeId(), stored[this.optionsKey]);
    }
    async createCollector({ adapter }) {
        const exporter = new CE_EXPORT_ADAPTERS[adapter.platformId]();
        const times = await exporter._loadAskTimes?.();
        const cache = new Map();
        return {
            capture(message) {
                if (!message.element?.isConnected || message.generating) return;
                const content = message.role === 'user' ? exporter._extractUser(message.element) : exporter._extractAssistant(message.element);
                if (message.role === 'user' && times) {
                    const timeKey = exporter.getSelectedAskTimeKey(message);
                    if (timeKey) content.time = times[timeKey] || content.time || null;
                }
                cache.set(message.key, content);
            },
            has: key => cache.has(key), get: key => cache.get(key), remove: key => cache.delete(key), destroy: () => cache.clear()
        };
    }
    buildTurns(messages, collector) {
        const turns = [];
        for (const message of messages) {
            const role = message.role === 'user' ? 'user' : 'assistant';
            let turn = turns.at(-1);
            if (role === 'user' || !turn || turn.id !== message.turnId || turn.selection.assistant) {
                turn = { id: message.turnId, order: turns.length + 1, selection: { user: false, assistant: false } };
                turns.push(turn);
            }
            const content = collector.get(message.key);
            if (!content) throw new Error('Changed');
            turn[role] = content; turn.selection[role] = true;
        }
        return turns;
    }
    async createJob({ messages, collector, options, adapter, signal }) {
        await window.AITContentLoader.load('export-ui');
        signal.throwIfAborted();
        const exporter = new CE_EXPORT_ADAPTERS[adapter.platformId]();
        const meta = { title: exporter.getConversationTitle(), url: location.href, exportTime: new Date(),
            platformId: adapter.platformId, platformName: await exporter.getPlatformName() };
        const format = CE_FORMATS.find(format => format.id === options.formatId);
        if (!format) throw new Error('InvalidFormat');
        const job = { meta, options: { ...options, rangeId: 'select' }, turns: this.buildTurns(messages, collector) };
        const filename = ceSanitizeFilename(meta.title);
        signal.throwIfAborted();
        return { job, filename, format };
    }
    async render(job, format, themeId) {
        if (format.id === 'png') return new CEPngExporter().export(job, themeId);
        const methods = { markdown: 'buildMarkdown', txt: 'buildTxt', csv: 'buildCsv', json: 'buildJson' };
        return CETextExporters[methods[format.id]](job);
    }
    async copy(context) {
        const type = this.copyType(context.options);
        if (!type) throw new Error('CopyUnsupported');
        const { job, format } = await this.createJob(context);
        const content = await this.render(job, format, context.options.themeId);
        context.signal.throwIfAborted();
        return type === 'image/png' ? content : new Blob([content], { type });
    }
    async execute(context) {
        const { options, signal } = context;
        const { job, filename, format } = await this.createJob(context);
        if (format.id === 'pdf') {
            await new CEPdfExporter().export(job, options.themeId, new CEPngExporter(), { signal });
            return;
        }
        const content = await this.render(job, format, options.themeId);
        signal.throwIfAborted();
        ceTriggerDownload(filename, format, content);
    }
}
