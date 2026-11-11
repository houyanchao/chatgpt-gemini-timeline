/** DOM capture helpers shared by every screenshot platform. No host DOM mutations. */
const MessageScreenshotSnapshot = (() => {
    // Allow ordinary multi-message 4x captures to remain one image (32 MP / 128 MB RGBA).
    // Keep both canvas dimensions bounded so html-to-image never silently rescales them.
    const MAX_CANVAS_PIXELS = 32000000;
    const MAX_CANVAS_SIDE = 16000;
    const MAX_FILES = 30;
    const OMIT = 'script, style, noscript, input, textarea, select, [data-ait-owned-ui], '
        + '.runner-code-run-btn, .runner-container, .formula-tooltip, .ait-highlight-action, '
        + '.turn-action-controls, [role="toolbar"], [hidden], .sr-only';

    function check(signal) {
        if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    }

    function wait(promise, signal, milliseconds = 15000) {
        check(signal);
        return new Promise((resolve, reject) => {
            const finish = callback => value => {
                clearTimeout(timer);
                signal?.removeEventListener('abort', abort);
                callback(value);
            };
            const abort = () => finish(reject)(new DOMException('Cancelled', 'AbortError'));
            const timer = setTimeout(() => finish(reject)(new Error('Timeout')), milliseconds);
            signal?.addEventListener('abort', abort, { once: true });
            Promise.resolve(promise).then(finish(resolve), finish(reject));
        });
    }

    function capture(element, excludeSelector = '', excludeAttributes = []) {
        if (!element?.isConnected) throw new Error('Changed');
        const rootRect = element.getBoundingClientRect();
        if (!rootRect.width || !rootRect.height) throw new Error('Changed');
        const omit = excludeSelector ? `${OMIT}, ${excludeSelector}` : OMIT;
        function clone(node) {
            if (node.nodeType === Node.TEXT_NODE) return node.cloneNode(false);
            if (node.nodeType !== Node.ELEMENT_NODE || node.matches(omit)) return null;
            const style = getComputedStyle(node);
            if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return null;
            if (node.matches('iframe, video, object, embed')) throw new Error('Unsupported');
            // Retain meaningful content such as citations, file labels and image cards.
            // Native action rows are excluded separately; empty icon controls add no content.
            if (node.tagName === 'BUTTON' && !node.textContent.trim() && !node.querySelector('img, canvas')) return null;
            let copy;
            if (node.tagName === 'CANVAS') {
                copy = document.createElement('img');
                try { copy.src = node.toDataURL(); } catch { throw new Error('Unsupported'); }
            } else {
                copy = node.tagName === 'BUTTON' ? document.createElement('div') : node.cloneNode(false);
            }
            for (const name of style) copy.style.setProperty(name, style.getPropertyValue(name));
            copy.style.animation = 'none';
            copy.style.transition = 'none';
            copy.style.caretColor = 'transparent';
            // Offscreen capture must render subtrees that the host normally skips.
            copy.style.contentVisibility = 'visible';
            if (['fixed', 'sticky'].includes(style.position)) copy.style.position = 'static';
            for (const attribute of [...copy.attributes]) {
                if (/^on/i.test(attribute.name) || excludeAttributes.includes(attribute.name)) copy.removeAttribute(attribute.name);
            }
            if (node.tagName === 'IMG') {
                copy.src = node.currentSrc || node.src;
                copy.removeAttribute('srcset');
                copy.removeAttribute('sizes');
                copy.loading = 'eager';
            }
            if (node.tagName !== 'CANVAS') {
                for (const child of node.childNodes) {
                    const result = clone(child);
                    if (result) copy.appendChild(result);
                }
            }
            return copy;
        }
        const content = clone(element);
        if (!content) throw new Error('Changed');
        Object.assign(content.style, {
            width: `${rootRect.width}px`, maxWidth: 'none', minWidth: '0',
            height: 'auto', maxHeight: 'none', margin: '0', position: 'static',
            contentVisibility: 'visible', boxSizing: 'border-box'
        });
        return { content, width: rootRect.width, colorScheme: getComputedStyle(element).colorScheme };
    }

    async function inlineImages(root, signal) {
        const cache = new Map();
        async function dataUrl(url) {
            if (/^data:/i.test(url)) return url;
            if (!cache.has(url)) cache.set(url, (async () => {
                check(signal);
                const parsed = new URL(url, location.href);
                if (!['http:', 'https:', 'blob:'].includes(parsed.protocol)) throw new Error('ImageFailed');
                if (location.origin === 'https://gemini.google.com' && parsed.origin === 'https://www.gstatic.com'
                    && parsed.pathname.startsWith('/weather/conditions/v1/png/')) {
                    // Gemini can display these icons, but the CDN does not allow page-level CORS reads.
                    const result = await wait(chrome.runtime.sendMessage({
                        type: 'AIT_FETCH_GEMINI_WEATHER_ICON', url: parsed.href
                    }), signal);
                    if (!result?.success || !result.data?.startsWith('data:image/png;base64,')) throw new Error('ImageFailed');
                    return result.data;
                }
                const request = new AbortController();
                const abort = () => request.abort();
                signal?.addEventListener('abort', abort, { once: true });
                let reader;
                try {
                    // Bound the entire transfer, including a body that stalls after response headers arrive.
                    return await wait((async () => {
                        const response = await fetch(parsed.href, {
                            signal: request.signal, credentials: parsed.origin === location.origin ? 'include' : 'omit'
                        });
                        if (!response.ok) throw new Error('ImageFailed');
                        const blob = await response.blob();
                        if (!blob.type.startsWith('image/')) throw new Error('ImageFailed');
                        return await new Promise((resolve, reject) => {
                            reader = new FileReader();
                            reader.onload = () => resolve(reader.result);
                            reader.onerror = () => reject(new Error('ImageFailed'));
                            reader.onabort = () => reject(new DOMException('Cancelled', 'AbortError'));
                            reader.readAsDataURL(blob);
                        });
                    })(), signal);
                } finally {
                    request.abort();
                    signal?.removeEventListener('abort', abort);
                    if (reader?.readyState === 1) reader.abort();
                }
            })());
            return cache.get(url);
        }
        try {
            const jobs = [...root.querySelectorAll('img')].map(async image => {
                image.src = await dataUrl(image.src);
                await wait(image.decode(), signal);
            });
            for (const image of root.querySelectorAll('svg image')) {
                const source = image.getAttribute('href') || image.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
                if (source) jobs.push(dataUrl(source).then(value => {
                    image.setAttribute('href', value);
                    image.removeAttributeNS('http://www.w3.org/1999/xlink', 'href');
                }));
            }
            for (const node of root.querySelectorAll('[style]')) {
                const value = node.style.backgroundImage;
                const matches = [...value.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/g)];
                if (!matches.length) continue;
                jobs.push(Promise.all(matches.map(match => dataUrl(match[1] || match[2] || match[3].trim()))).then(urls => {
                    let background = value;
                    matches.forEach((match, index) => { background = background.replace(match[0], `url("${urls[index]}")`); });
                    node.style.backgroundImage = background;
                }));
            }
            await Promise.all(jobs);
        } catch (error) {
            check(signal);
            if (error.message === 'Timeout') throw error;
            throw new Error('ImageFailed');
        }
    }

    function planSlices(height, width, pixelRatio, boundaries = []) {
        const maximum = Math.min(4000, Math.floor(MAX_CANVAS_PIXELS / (width * pixelRatio * pixelRatio)), Math.floor(MAX_CANVAS_SIDE / pixelRatio));
        if (!Number.isFinite(height) || !Number.isFinite(width) || width <= 0 || width * pixelRatio > MAX_CANVAS_SIDE
            || maximum < 256 || height > maximum * MAX_FILES) throw new Error('TooLarge');
        const slices = [];
        for (let start = 0; start < height;) {
            let end = Math.min(height, start + maximum);
            if (end < height) {
                // Paragraph breaks must leave enough capacity to finish within the file limit.
                const minimumEnd = height - maximum * (MAX_FILES - slices.length - 1);
                const suitable = boundaries.filter(value => value > start + maximum / 2 && value >= minimumEnd && value <= end);
                if (suitable.length) end = Math.max(...suitable);
            }
            if (slices.length >= MAX_FILES) throw new Error('TooLarge');
            slices.push({ start, end });
            start = end;
        }
        return slices;
    }

    function slice(root, start, end, width) {
        const viewport = document.createElement('div');
        Object.assign(viewport.style, { width: `${width}px`, height: `${end - start}px`, overflow: 'hidden', position: 'relative' });
        const copy = root.cloneNode(true);
        const top = root.getBoundingClientRect().top;
        // Heights were already copied from source styles; root alone has auto height.
        copy.style.height = `${root.getBoundingClientRect().height}px`;
        Object.assign(copy.style, { position: 'relative', left: '0', top: '0', zIndex: 'auto' });
        // Remove off-slice branches while preserving their space (no reflow of later content).
        function hideOutside(original, duplicate) {
            for (let index = 0; index < original.children.length; index++) {
                const child = original.children[index];
                const childCopy = duplicate.children[index];
                const rect = child.getBoundingClientRect();
                if (child.namespaceURI !== 'http://www.w3.org/2000/svg' && rect.width > 0 && rect.height > 0
                    && (rect.bottom <= top + start || rect.top >= top + end)) {
                    childCopy.replaceChildren();
                    childCopy.style.height = `${rect.height}px`;
                    childCopy.style.minHeight = `${rect.height}px`;
                } else hideOutside(child, childCopy);
            }
        }
        hideOutside(root, copy);
        copy.style.transform = `translateY(${-start}px)`;
        viewport.appendChild(copy);
        return viewport;
    }

    return Object.freeze({ check, wait, capture, inlineImages, planSlices, slice });
})();
