/** Start clipboard writes on the click's synchronous path; produce data asynchronously. */
const AITClipboard = Object.freeze({
    write(type, produce, { signal } = {}) {
        if (!['image/png', 'text/plain'].includes(type) || !navigator.clipboard?.write
            || typeof ClipboardItem === 'undefined' || (ClipboardItem.supports && !ClipboardItem.supports(type))) {
            return Promise.reject(new Error('CopyUnsupported'));
        }
        if (signal?.aborted) return Promise.reject(new DOMException('Cancelled', 'AbortError'));
        let failure;
        const data = new Promise((resolve, reject) => {
            let settled = false;
            const finish = (value, error) => {
                if (settled) return;
                settled = true;
                signal?.removeEventListener('abort', abort);
                if (error) { failure = error; reject(error); }
                else resolve(value);
            };
            const abort = () => finish(null, new DOMException('Cancelled', 'AbortError'));
            signal?.addEventListener('abort', abort, { once: true });
            Promise.resolve().then(() => {
                if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
                return produce();
            }).then(value => {
                if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
                const blob = value instanceof Blob ? value : new Blob([value], { type });
                if (!blob.size || blob.type !== type) throw new Error('CopyFailed');
                finish(blob);
            }).catch(error => finish(null, error));
        });
        // Some browsers reject a write before consuming its deferred data.
        void data.catch(() => {});
        try {
            // ClipboardItem accepts a Promise<Blob>, preserving the original user gesture.
            const item = new ClipboardItem({ [type]: data });
            return Promise.resolve(navigator.clipboard.write([item])).catch(error => { throw failure || new Error('CopyFailed', { cause: error }); });
        } catch (error) { return Promise.reject(failure || new Error('CopyFailed', { cause: error })); }
    }
});
