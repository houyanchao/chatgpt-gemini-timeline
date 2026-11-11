/** Renderer loaded on demand; platform-independent HTML -> PNG pipeline. */
class MessageScreenshotCaptureService {
    async capture({ elements = [], snapshots: prepared, pixelRatio = 2, excludeSelector, excludeAttributes, signal, singleImage = false }) {
        const utils = MessageScreenshotSnapshot;
        utils.check(signal);
        // Capture computed styles synchronously, before resource loading can outlive the page.
        const snapshots = prepared || elements.map(element => utils.capture(element, excludeSelector, excludeAttributes));
        if (!snapshots.length || ![1, 2, 3, 4].includes(pixelRatio)) throw new Error('TooLarge');
        const width = Math.ceil(Math.max(...snapshots.map(snapshot => snapshot.width))) + 48;
        const mount = document.createElement('div');
        mount.setAttribute('data-ait-owned-ui', '');
        mount.setAttribute('aria-hidden', 'true');
        Object.assign(mount.style, { position: 'fixed', left: '-100000px', top: '0', pointerEvents: 'none' });
        const host = document.createElement('div');
        Object.assign(host.style, {
            position: 'relative',
            width: `${width}px`, boxSizing: 'border-box', padding: '24px',
            display: 'flex', flexDirection: 'column', gap: '24px',
            // Message clones already retain their own backgrounds; do not paint a shared backdrop.
            backgroundColor: 'transparent', colorScheme: snapshots.at(-1).colorScheme || 'normal'
        });
        for (const snapshot of snapshots) host.appendChild(snapshot.content);
        mount.appendChild(host);
        document.body.appendChild(mount);
        try {
            await utils.inlineImages(host, signal);
            await utils.wait(document.fonts.ready, signal);
            const htmlToImage = globalThis.htmlToImage;
            if (!htmlToImage) throw new Error('Failed');
            const options = { preferredFontFormat: 'woff2', fetchRequestInit: { signal }, backgroundColor: 'transparent' };
            const height = Math.ceil(host.getBoundingClientRect().height);
            const hostTop = host.getBoundingClientRect().top;
            const boundaries = [...host.querySelectorAll('p, pre, h1, h2, h3, li, tr, svg, img')]
                .map(node => Math.ceil(node.getBoundingClientRect().bottom - hostTop));
            const slices = utils.planSlices(height, width, pixelRatio, boundaries);
            if (singleImage && slices.length > 1) throw new Error('CopyTooLong');
            const fontEmbedCSS = await utils.wait(htmlToImage.getFontEmbedCSS(host, options), signal);
            const blobs = [];
            for (const part of slices) {
                utils.check(signal);
                const viewport = utils.slice(host, part.start, part.end, width);
                // Position the fragment on a connected node so computed style remains available.
                // Keep the captured node at local (0, 0). Only its parent is offscreen;
                // copied logical inset properties otherwise move the SVG content out of view.
                mount.appendChild(viewport);
                try {
                    const blob = await utils.wait(htmlToImage.toBlob(viewport, {
                        ...options, fontEmbedCSS, skipFonts: !fontEmbedCSS, pixelRatio,
                        width, height: part.end - part.start
                    }), signal, 30000);
                    utils.check(signal);
                    if (!blob?.size) throw new Error('Failed');
                    blobs.push(blob);
                } finally { viewport.remove(); }
            }
            return blobs;
        } finally { mount.remove(); }
    }
}
