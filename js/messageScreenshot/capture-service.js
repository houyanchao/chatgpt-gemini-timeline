/** Renderer loaded on demand; platform-independent HTML -> PNG pipeline. */
class MessageScreenshotCaptureService {
    async capture({ elements = [], snapshots: prepared, pixelRatio = 2, excludeSelector, excludeAttributes, signal, timing }) {
        const utils = MessageScreenshotSnapshot;
        utils.check(signal);
        // Capture computed styles synchronously, before resource loading can outlive the page.
        const snapshots = prepared || elements.map(element => utils.capture(element, excludeSelector, excludeAttributes));
        if (!snapshots.length || ![1, 2, 3, 4].includes(pixelRatio)) throw new Error('TooLarge');
        const mountReady = timing?.start('mount snapshots');
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
        // Embedding changes image sources and can add placeholders. Keep cached
        // snapshots available with their original sources for the next attempt.
        for (const snapshot of snapshots) host.appendChild(snapshot.content.cloneNode(true));
        mount.appendChild(host);
        document.body.appendChild(mount);
        let output;
        try {
            mountReady?.({ messages: snapshots.length });
            const imagesReady = timing?.start('inline images');
            const { unavailableImageCount, usableImageCount } = await utils.inlineImages(host, signal);
            imagesReady?.({ unavailableImageCount });
            if (unavailableImageCount && !usableImageCount && !this.hasOtherContent(snapshots)) {
                throw new Error('ImageFailed');
            }
            const fontsReady = timing?.start('wait for document fonts');
            await utils.wait(document.fonts.ready, signal);
            fontsReady?.();
            const htmlToImage = globalThis.htmlToImage;
            if (!htmlToImage) throw new Error('Failed');
            const options = {
                preferredFontFormat: 'woff2', fetchRequestInit: { signal }, backgroundColor: 'transparent',
                // The snapshot's inline variable declarations survive the library's DOM clone.
                includeStyleProperties: [...getComputedStyle(host)].filter(name => !name.startsWith('--'))
            };
            const layoutReady = timing?.start('layout and plan capture');
            const hostRect = host.getBoundingClientRect();
            const height = Math.ceil(hostRect.height);
            const { outputWidth, outputHeight, reducedResolution } = utils.planCapture(width, height, pixelRatio);
            layoutReady?.({ width, height, outputWidth, outputHeight });
            const fontCssReady = timing?.start('embed web fonts');
            const fontEmbedCSS = await utils.wait(htmlToImage.getFontEmbedCSS(host, options), signal);
            fontCssReady?.({ characters: fontEmbedCSS?.length ?? 0 });
            const render = (node, sourceHeight, canvasHeight) => utils.wait(htmlToImage.toCanvas(node, {
                ...options, fontEmbedCSS, skipFonts: !fontEmbedCSS, pixelRatio: 1,
                width, height: sourceHeight, canvasWidth: outputWidth, canvasHeight, skipAutoScale: true
            }), signal, 30000);
            const encode = async () => {
                utils.check(signal);
                const pngReady = timing?.start('encode PNG');
                const blob = await utils.wait(new Promise(resolve => output.toBlob(resolve, 'image/png')), signal, 30000);
                utils.check(signal);
                if (!blob?.size) throw new Error('Failed');
                pngReady?.({ width: outputWidth, height: outputHeight, bytes: blob.size });
                return blob;
            };

            let blob;
            try {
                utils.check(signal);
                const wholeReady = timing?.start('render whole image');
                output = await render(host, height, outputHeight);
                if (output.width !== outputWidth || output.height !== outputHeight) throw new Error('Failed');
                wholeReady?.({ width: outputWidth, height: outputHeight });
                blob = await encode();
            } catch (error) {
                utils.check(signal);
                if (error?.name === 'AbortError') throw error;
                if (output) {
                    output.width = 0;
                    output.height = 0;
                }
                const fallbackReady = timing?.start('plan fallback slices');
                const boundaries = [...host.querySelectorAll('p, pre, h1, h2, h3, li, tr, svg, img')]
                    .map(node => Math.ceil(node.getBoundingClientRect().bottom - hostRect.top));
                const slices = utils.planSlices(height, boundaries);
                fallbackReady?.({ reason: error?.message, slices: slices.length });
                output = document.createElement('canvas');
                output.width = outputWidth;
                output.height = outputHeight;
                const outputContext = output.getContext('2d');
                if (!outputContext) throw new Error('Failed');
                for (const part of slices) {
                    utils.check(signal);
                    // Round shared boundaries once so adjacent slices meet on the same pixel row.
                    const top = Math.round(part.start * outputHeight / height);
                    const bottom = Math.round(part.end * outputHeight / height);
                    if (top === bottom) continue;
                    const viewport = utils.slice(host, part.start, part.end, width);
                    // Keep the captured node connected and at local (0, 0); only its parent is offscreen.
                    mount.appendChild(viewport);
                    try {
                        const sliceReady = timing?.start('render slice');
                        const tile = await render(viewport, part.end - part.start, bottom - top);
                        try {
                            utils.check(signal);
                            if (tile.width !== outputWidth || tile.height !== bottom - top) throw new Error('Failed');
                            outputContext.drawImage(tile, 0, top);
                        } finally {
                            tile.width = 0;
                            tile.height = 0;
                        }
                        sliceReady?.({ top, bottom });
                    } finally { viewport.remove(); }
                }
                blob = await encode();
            }
            return { blob, unavailableImageCount, reducedResolution };
        } finally {
            if (output) {
                output.width = 0;
                output.height = 0;
            }
            mount.remove();
        }
    }

    hasOtherContent(snapshots) {
        // Inspect the original snapshots so placeholder text does not count as content.
        const svgDefinitions = 'svg :is(defs, title, desc, clipPath, mask, marker, pattern, symbol)';
        const svgGraphics = `svg :is(path, line, polyline, polygon, rect, circle, ellipse, use):not(${svgDefinitions} *)`;
        return snapshots.some(({ content }) => {
            if (content.querySelector(svgGraphics)) return true;
            const textNodes = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
            for (let node = textNodes.nextNode(); node; node = textNodes.nextNode()) {
                if (node.data.trim() && !node.parentElement?.closest(svgDefinitions)) return true;
            }
            return false;
        });
    }
}
