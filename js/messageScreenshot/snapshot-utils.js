/** DOM capture helpers shared by every screenshot platform. No host DOM mutations. */
const MessageScreenshotSnapshot = (() => {
    // Bound the final canvas to 32 MP (128 MB RGBA) and keep fallback slices short.
    const MAX_CANVAS_PIXELS = 32000000;
    const MAX_CANVAS_SIDE = 16000;
    const MAX_SLICE_HEIGHT = 4000;
    const MAX_SLICES = 30;
    const OMIT = 'script, style, noscript, input, textarea, select, [data-ait-owned-ui], '
        + '.runner-code-run-btn, .runner-container, .formula-tooltip, .ait-highlight-action, '
        + '.turn-action-controls, [role="toolbar"], [hidden], .sr-only';
    const XLINK_NAMESPACE = 'http://www.w3.org/1999/xlink';
    const CSS_IMAGE_URL = /url\(\s*(?:"((?:\\[\s\S]|[^"\\])*)"|'((?:\\[\s\S]|[^'\\])*)'|((?:\\[\s\S]|[^)\\])*))\s*\)/gi;
    const EMPTY_BACKGROUND = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%221%22 height=%221%22/%3E';
    const RETRYABLE_IMAGE_STATUS = new Set([408, 500, 502, 503, 504]);

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

    function decodeCssEscapes(text) {
        return text.replace(/\\(?:([\da-f]{1,6})(?:\r\n|[\t\n\f\r ])?|([^\n\f\r]))/gi, (_, hex, character) => {
            if (!hex) return character;
            const codePoint = Number.parseInt(hex, 16);
            if (!codePoint || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) return '\uFFFD';
            return String.fromCodePoint(codePoint);
        });
    }

    function styleVariableDependencies(element) {
        const required = new Set();
        const declared = new Set();
        const visited = new Set();
        function collectStyleQueryVariables(text, decoded) {
            if (!/\bstyle\(/i.test(decoded) || !decoded.includes('--')) return;
            if (text.includes('\\') || /--[-\w\u0080-\uFFFF]+\(/.test(decoded)) {
                throw new Error('Unrecognized CSS style query');
            }
            for (const match of decoded.matchAll(/--[-\w\u0080-\uFFFF]+/g)) required.add(match[0]);
        }
        function visitSheet(sheet) {
            if (!sheet) throw new Error('Stylesheet unavailable');
            if (visited.has(sheet)) return;
            visited.add(sheet);
            visitRules(sheet.cssRules);
        }
        function visitRules(rules, insidePseudo = false) {
            for (const rule of rules) {
                if (rule.type === CSSRule.IMPORT_RULE) visitSheet(rule.styleSheet);
                const condition = rule.conditionText;
                if (condition) {
                    collectStyleQueryVariables(condition, condition.includes('\\') ? decodeCssEscapes(condition) : condition);
                }
                const selector = rule.selectorText || '';
                const pseudo = insidePseudo || /::|:(?:before|after|first-letter|first-line)\b/i.test(
                    selector.includes('\\') ? decodeCssEscapes(selector) : selector
                );
                if (rule.cssRules) visitRules(rule.cssRules, pseudo);
                const css = rule.style?.cssText;
                if (!css || (!css.includes('--') && !css.includes('\\'))) continue;
                for (const name of rule.style) {
                    if (name.startsWith('--')) declared.add(name);
                }
                if (!pseudo && !/!\s*important\b/i.test(css)) continue;
                const declarations = css.includes('\\') ? decodeCssEscapes(css) : css;
                if (/--[-\w\u0080-\uFFFF]+\(/.test(declarations)) throw new Error('Indirect CSS variable dependency');
                collectStyleQueryVariables(css, declarations);
                for (const match of declarations.matchAll(/\bvar\(\s*([^,)]+)/gi)) {
                    const name = match[1].trim();
                    if (!/^--[-\w\u0080-\uFFFF]+$/.test(name)) throw new Error('Unrecognized CSS variable');
                    required.add(name);
                }
            }
        }
        try {
            for (const root of new Set([element.ownerDocument, element.getRootNode()])) {
                for (const sheet of [...(root.styleSheets || []), ...(root.adoptedStyleSheets || [])]) visitSheet(sheet);
            }
            return { required, declared };
        } catch {
            // An unreadable sheet can contain variable-dependent rules. Preserve all values.
            return null;
        }
    }

    function capture(element, excludeSelector = '', excludeAttributes = []) {
        if (!element?.isConnected) throw new Error('Changed');
        const rootRect = element.getBoundingClientRect();
        if (!rootRect.width || !rootRect.height) throw new Error('Changed');
        const omit = excludeSelector ? `${OMIT}, ${excludeSelector}` : OMIT;
        const rootStyle = getComputedStyle(element);
        const computedProperties = [...rootStyle].filter(name => !name.startsWith('--'));
        const dependencies = styleVariableDependencies(element);
        const requiredVariables = dependencies?.required ?? new Set();
        function clone(node, inheritedVariables) {
            if (node.nodeType === Node.TEXT_NODE) return node.cloneNode(false);
            if (node.nodeType !== Node.ELEMENT_NODE || node.matches(omit)) return null;
            // The selected picture candidate is already frozen on its img.
            if (node.tagName === 'SOURCE' && node.parentElement?.tagName === 'PICTURE') return null;
            const style = node === element ? rootStyle : getComputedStyle(node);
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
            // Preserve variables that can affect styles after the snapshot is mounted.
            let variables = inheritedVariables;
            const needsAllVariables = !dependencies || node === element || node.localName === 'use' || node.shadowRoot
                || node.localName.includes('-') || node.hasAttribute('is')
                || ['::before', '::after'].some(selector => {
                    const content = getComputedStyle(node, selector).content;
                    return content && content !== 'none' && content !== 'normal';
                });
            if (needsAllVariables) {
                variables = new Set();
                for (const name of style) {
                    if (!name.startsWith('--')) continue;
                    const priority = !dependencies || requiredVariables.has(name) ? 'important' : '';
                    copy.style.setProperty(name, style.getPropertyValue(name), priority);
                    variables.add(name);
                }
                for (const name of inheritedVariables) {
                    if (!variables.has(name)) copy.style.setProperty(name, 'initial', 'important');
                }
            } else {
                // Authored inline variables survive cloneNode and can reach descendants.
                for (const name of copy.style) {
                    if (!name.startsWith('--') || inheritedVariables.has(name)) continue;
                    if (variables === inheritedVariables) variables = new Set(inheritedVariables);
                    variables.add(name);
                }
            }
            // Important declarations and hidden pseudo-elements can still use var()
            // in the new scope. Freeze those dependencies on each affected clone.
            for (const name of requiredVariables) {
                if (needsAllVariables && variables.has(name)) continue;
                const value = style.getPropertyValue(name);
                if (!value && !variables.has(name) && !dependencies.declared.has(name)) continue;
                copy.style.setProperty(name, value || 'initial', 'important');
                if (value && !variables.has(name)) {
                    if (variables === inheritedVariables) variables = new Set(inheritedVariables);
                    variables.add(name);
                }
            }
            for (const name of computedProperties) copy.style.setProperty(name, style.getPropertyValue(name));
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
                const source = node.currentSrc || node.getAttribute('src')?.trim();
                if (source) copy.src = node.currentSrc || node.src;
                else copy.removeAttribute('src');
                copy.removeAttribute('srcset');
                copy.removeAttribute('sizes');
                copy.loading = 'eager';
            }
            if (node.tagName !== 'CANVAS') {
                for (const child of node.childNodes) {
                    const result = clone(child, variables);
                    if (result) copy.appendChild(result);
                }
            }
            return copy;
        }
        const content = clone(element, new Set());
        if (!content) throw new Error('Changed');
        Object.assign(content.style, {
            width: `${rootRect.width}px`, maxWidth: 'none', minWidth: '0',
            height: 'auto', maxHeight: 'none', margin: '0', position: 'static',
            contentVisibility: 'visible', boxSizing: 'border-box'
        });
        return { content, width: rootRect.width, colorScheme: rootStyle.colorScheme };
    }

    async function readImage(url, signal) {
        check(signal);
        const request = new AbortController();
        const abort = () => request.abort();
        signal?.addEventListener('abort', abort, { once: true });
        let reader;
        let probe;

        async function readDataUrl() {
            if (url.protocol === 'data:') return url.href;
            if (!['http:', 'https:', 'blob:'].includes(url.protocol)) throw new Error('ImageFailed');
            if (location.origin === 'https://gemini.google.com' && url.origin === 'https://www.gstatic.com'
                && url.pathname.startsWith('/weather/conditions/v1/png/')) {
                // Gemini can display these icons, but the CDN does not allow page-level CORS reads.
                const result = await chrome.runtime.sendMessage({ type: 'AIT_FETCH_GEMINI_WEATHER_ICON', url: url.href });
                if (!result?.success || !result.data?.startsWith('data:image/png;base64,')) throw new Error('ImageFailed');
                return result.data;
            }
            const options = {
                signal: request.signal, credentials: url.origin === location.origin ? 'include' : 'omit'
            };
            let response = await fetch(url.href, options);
            if (RETRYABLE_IMAGE_STATUS.has(response.status) && !response.headers.has('Retry-After')) {
                await response.body?.cancel();
                check(request.signal);
                response = await fetch(url.href, options);
            }
            if (!response.ok) throw new Error('ImageFailed');
            const blob = await response.blob();
            check(request.signal);
            if (!blob.size || !blob.type.startsWith('image/')) throw new Error('ImageFailed');
            return new Promise((resolve, reject) => {
                reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = () => reject(new Error('ImageFailed'));
                reader.onabort = () => reject(new DOMException('Cancelled', 'AbortError'));
                reader.readAsDataURL(blob);
            });
        }

        try {
            // The same deadline covers any retry, transfer, and decode, regardless of image type.
            return await wait((async () => {
                const data = await readDataUrl();
                check(request.signal);
                probe = new Image();
                probe.src = data;
                await probe.decode();
                return data;
            })(), signal);
        } finally {
            request.abort();
            signal?.removeEventListener('abort', abort);
            if (reader?.readyState === 1) reader.abort();
            probe?.removeAttribute('src');
        }
    }

    function imagePlaceholder(image, label) {
        const rect = image.getBoundingClientRect();
        const width = rect.width || 128;
        const height = rect.height || 96;
        const scale = Math.min(1, 256 / Math.max(width, height));
        const w = Math.max(2, Math.round(width * scale));
        const h = Math.max(2, Math.round(height * scale));
        const safeLabel = label.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const fontSize = Math.min(14, Math.floor((w - 12) / [...label].length));
        const mark = fontSize >= 9 && h >= 24
            ? `<text x="50%" y="50%" dy=".35em" text-anchor="middle" font-family="sans-serif" font-size="${fontSize}" fill="#334155">${safeLabel}</text>`
            : `<path d="M${w / 3} ${h / 3}l${w / 3} ${h / 3}m0 ${-h / 3}l${-w / 3} ${h / 3}" stroke="#64748b"/>`;
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect x=".5" y=".5" width="${w - 1}" height="${h - 1}" fill="#e2e8f0" stroke="#94a3b8" stroke-dasharray="3 2"/>${mark}</svg>`;
        return `data:image/svg+xml,${encodeURIComponent(svg)}`;
    }

    async function inlineImages(root, signal, unavailableLabel = globalThis.TimelineI18n?.getMessage('messageScreenshotImageUnavailable') || 'Image unavailable') {
        const cache = new Map();
        let unavailableImageCount = 0;
        let usableImageCount = 0;
        async function readAsset(source) {
            check(signal);
            if (!source) return null;
            try {
                const url = new URL(source, location.href);
                if (!cache.has(url.href)) cache.set(url.href, readImage(url, signal));
                const data = await cache.get(url.href);
                check(signal);
                usableImageCount++;
                return data;
            } catch {
                check(signal);
                unavailableImageCount++;
                return null;
            }
        }

        const jobs = [];
        for (const image of root.querySelectorAll('img')) {
            const source = image.getAttribute('src')?.trim();
            if (!source) continue;
            jobs.push(readAsset(source).then(data => {
                check(signal);
                image.src = data ?? imagePlaceholder(image, unavailableLabel);
            }));
        }
        for (const image of root.querySelectorAll('svg image')) {
            const source = (image.getAttribute('href') || image.getAttributeNS(XLINK_NAMESPACE, 'href'))?.trim();
            if (!source) continue;
            jobs.push(readAsset(source).then(data => {
                check(signal);
                image.setAttribute('href', data ?? imagePlaceholder(image, unavailableLabel));
                image.removeAttributeNS(XLINK_NAMESPACE, 'href');
            }));
        }
        for (const node of root.querySelectorAll('[style]')) {
            const value = node.style.backgroundImage;
            const sources = [...value.matchAll(CSS_IMAGE_URL)].map(([, doubleQuoted, singleQuoted, unquoted]) =>
                decodeCssEscapes(doubleQuoted ?? singleQuoted ?? unquoted.trim()));
            if (!sources.length) continue;
            jobs.push(Promise.all(sources.map(readAsset)).then(urls => {
                check(signal);
                let index = 0;
                // Keep the failed layer slot so background position and size lists still align.
                node.style.backgroundImage = value.replace(CSS_IMAGE_URL, () => {
                    const url = (urls[index++] ?? EMPTY_BACKGROUND).replaceAll('\\', '\\\\').replaceAll('"', '\\"');
                    return `url("${url}")`;
                });
            }));
        }
        await Promise.all(jobs);
        check(signal);
        return { unavailableImageCount, usableImageCount };
    }

    function planCapture(width, height, pixelRatio) {
        if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0
            || width > MAX_CANVAS_SIDE || height > MAX_SLICE_HEIGHT * MAX_SLICES) throw new Error('TooLarge');
        const scale = Math.min(pixelRatio, MAX_CANVAS_SIDE / width, MAX_CANVAS_SIDE / height,
            Math.sqrt(MAX_CANVAS_PIXELS / (width * height)));
        const outputWidth = Math.floor(width * scale);
        const outputHeight = Math.floor(height * scale);
        if (!outputWidth || !outputHeight) throw new Error('TooLarge');

        return { outputWidth, outputHeight, reducedResolution: scale < pixelRatio };
    }

    function planSlices(height, boundaries) {
        // A failed whole render also needs a smaller retry for short captures.
        const maximum = Math.min(MAX_SLICE_HEIGHT, Math.ceil(height / 2));
        const slices = [];
        for (let start = 0; start < height;) {
            let end = Math.min(height, start + maximum);
            if (end < height) {
                // Paragraph breaks must leave enough capacity for the remaining slices.
                const minimumEnd = height - maximum * (MAX_SLICES - slices.length - 1);
                const suitable = boundaries.filter(value => value > start + maximum / 2 && value >= minimumEnd && value <= end);
                if (suitable.length) end = Math.max(...suitable);
            }
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

    return Object.freeze({ check, wait, capture, inlineImages, planCapture, planSlices, slice });
})();
