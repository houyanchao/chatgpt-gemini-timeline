/** Shared local Blob download. The caller owns filename/format selection. */
const AITDownload = Object.freeze({
    saveBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        anchor.style.display = 'none';
        anchor.setAttribute('data-ait-owned-ui', '');
        document.body.appendChild(anchor);
        try { anchor.click(); }
        finally {
            setTimeout(() => {
                anchor.remove();
                URL.revokeObjectURL(url);
            }, 1000);
        }
    },
    filename(value) {
        return String(value || 'ChatGPT').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim().slice(0, 100) || 'ChatGPT';
    }
});
