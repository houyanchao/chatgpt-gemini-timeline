/** DOM snapshot/image generation only. Message discovery belongs to messageActions. */
class MessageScreenshotAction {
    constructor() {
        this.id = 'screenshot'; this.settingsKey = 'messageScreenshotPlatformSettings'; this.optionsKey = 'messageScreenshotOptions';
        this.barLayout = 'panel';
        this.settingsTabId = 'conversation-export';
        this.showConfirmIcon = false;
        // Lucide scissors (ISC); see ../messageActions/LUCIDE-LICENSE.
        this.icon = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><g transform="rotate(90 12 12)"><circle cx="6" cy="6" r="3"/><path d="M8.12 8.12 12 12"/><path d="M20 4 8.12 15.88"/><circle cx="6" cy="18" r="3"/><path d="M14.8 14.8 20 20"/></g></svg>';
    }
    label() { return TimelineI18n.getMessage('messageScreenshotButton'); }
    confirmLabel() { return TimelineI18n.getMessage('messageScreenshotDownload'); }
    copyType() { return 'image/png'; }
    copyLabel() { return TimelineI18n.getMessage('messageActionsCopyImage'); }
    supports(platformId) { return getSiteInfoListSync().some(site => site.id === platformId && site.features.messageScreenshot === true); }
    async createOptions() {
        const stored = await chrome.storage.local.get(this.optionsKey);
        return new MessageScreenshotOptions(stored[this.optionsKey]);
    }
    errorMessage(error) {
        const known = ['ImageFailed', 'Unsupported', 'TooLarge', 'Timeout', 'Changed'];
        return TimelineI18n.getMessage(`messageScreenshot${known.includes(error.message) ? error.message : 'Failed'}`);
    }
    async createCollector({ signal, adapter }) {
        await window.AITContentLoader.load('message-screenshot-renderer');
        signal.throwIfAborted();
        const cache = new Map();
        const rules = adapter.getSnapshotRules();
        let nodeCount = 0;
        return {
            async capture(message) {
                // Give cancellation and selection events a turn between DOM snapshots.
                await new Promise(resolve => setTimeout(resolve, 0));
                signal.throwIfAborted();
                if (!message.element?.isConnected || message.generating) return;
                const element = adapter.getSnapshotElement?.(message) || message.element;
                const previous = cache.get(message.key);
                const html = element.innerHTML;
                const style = getComputedStyle(element);
                const signature = [element.getBoundingClientRect().width, style.color, style.backgroundColor, style.colorScheme,
                    document.documentElement.className, document.documentElement.getAttribute('data-theme')].join('|');
                // Canvas pixels can change without changing markup, dimensions or the page theme.
                const hasCanvas = element.matches('canvas') || !!element.querySelector('canvas');
                if (!hasCanvas && previous?.source === element && previous.html === html && previous.signature === signature) return;
                const count = element.querySelectorAll('*').length;
                if (nodeCount - (previous?.nodeCount || 0) + count > 20000) throw new Error('TooLarge');
                const snapshot = MessageScreenshotSnapshot.capture(element, rules.selector, rules.attributes);
                nodeCount += count - (previous?.nodeCount || 0);
                cache.set(message.key, { ...snapshot, source: element, html, signature, nodeCount: count });
            },
            has: key => cache.has(key), get: key => cache.get(key),
            remove(key) { nodeCount -= cache.get(key)?.nodeCount || 0; cache.delete(key); },
            destroy() { cache.clear(); nodeCount = 0; }
        };
    }
    async render({ messages, collector, options, signal }, singleImage = false) {
        signal.throwIfAborted();
        const snapshots = messages.map(message => {
            const snapshot = collector.get(message.key);
            if (!snapshot) throw new Error('Changed');
            return snapshot;
        });
        return new MessageScreenshotCaptureService().capture({ snapshots, pixelRatio: options.scale, signal, singleImage });
    }
    async copy(context) {
        const blobs = await this.render(context, true);
        context.signal.throwIfAborted();
        if (blobs.length !== 1) throw new Error('CopyTooLong');
        return blobs[0];
    }
    async execute(context) {
        const { signal } = context;
        const blobs = await this.render(context);
        signal.throwIfAborted();
        const filename = `${AITDownload.filename(document.title.replace(/\s*[-–]\s*ChatGPT$/, ''))}-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;
        for (let index = 0; index < blobs.length; index++) {
            signal.throwIfAborted();
            AITDownload.saveBlob(blobs[index], `${filename}${blobs.length > 1 ? `-${index + 1}` : ''}.png`);
        }
    }
}
