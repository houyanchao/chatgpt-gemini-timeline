/**
 * Gemini Watermark Remover
 *
 * 在 Gemini 生成的图片上提供「下载原图 / 下载去水印图片」能力。
 * 算法引擎位于 js/watermark/engine/（GargantuaX/gemini-watermark-remover 的近原样移植，
 * MIT，源自 allenk/GeminiWatermarkTool），通过动态 import() 懒加载，仅在用户真正
 * 触发去水印时才解析重型算法与内嵌 alpha 蒙版。
 *
 * 设计要点：
 * - 仅在 Gemini 平台启用，且受设置开关 geminiWatermarkRemoverEnabled 控制。
 * - 劫持 Gemini 原生下载按钮，使用全局下拉菜单提供「原图 / 去水印」下载选项。
 * - 全程本地处理，不上传任何数据。跨域图片在无法读取像素时优雅降级并提示。
 */

class GeminiWatermarkRemover {
    constructor() {
        this.isEnabled = false;
        this.isDestroyed = false;

        // 引擎（懒加载，单例）
        this._enginePromise = null;
        this._engine = null;

        // 状态
        this._processing = false;
        this._scanPending = false;
        this._downloadButtonHandlers = new Map();
        this._nativeDownloadPassThrough = new WeakSet();

        // 事件处理器引用
        this._observer = null;
        this._storageListener = null;

        // 配置
        this.config = {
            minImageSize: 256,   // 仅对较大图片显示按钮，过滤头像/图标
            controlsSelector: '.generated-image-controls'
        };
    }

    async init() {
        await TimelineI18n.ready();

        this._setRuntimeState('loading');
        // 仅在 Gemini 平台运行
        if (!(await this._isGeminiPlatform())) {
            this._setRuntimeState('not-gemini');
            return;
        }

        await this._loadSettings();
        this._attachStorageListener();

        if (this._enabledSetting) {
            this._enable();
        } else {
            this._setRuntimeState('disabled');
        }
    }

    async _isGeminiPlatform() {
        try {
            return typeof matchesCurrentPlatform === 'function'
                ? await matchesCurrentPlatform('gemini')
                : this._hostnameMatches(location.hostname, 'gemini.google.com');
        } catch (e) {
            return false;
        }
    }

    _hostnameMatches(hostname, domain) {
        const normalizedHostname = String(hostname || '').trim().toLowerCase();
        const normalizedDomain = String(domain || '').trim().toLowerCase();
        if (!normalizedHostname || !normalizedDomain) return false;
        return normalizedHostname === normalizedDomain ||
            normalizedHostname.endsWith(`.${normalizedDomain}`);
    }

    async _loadSettings() {
        try {
            const result = await chrome.storage.local.get('geminiWatermarkRemoverEnabled');
            // 默认开启
            this._enabledSetting = result.geminiWatermarkRemoverEnabled !== false;
        } catch (e) {
            this._enabledSetting = true;
        }
    }

    _attachStorageListener() {
        this._storageListener = (changes, areaName) => {
            if (this.isDestroyed || areaName !== 'local') return;
            if (changes.geminiWatermarkRemoverEnabled) {
                this._enabledSetting = changes.geminiWatermarkRemoverEnabled.newValue !== false;
                if (this._enabledSetting && !this.isEnabled) {
                    this._enable();
                } else if (!this._enabledSetting && this.isEnabled) {
                    this._disable();
                }
            }
        };
        chrome.storage.onChanged.addListener(this._storageListener);
    }

    // ==================== 启用 / 禁用 ====================

    _enable() {
        if (this.isEnabled) return;
        this.isEnabled = true;
        this._setRuntimeState('enabled');

        this._scanControls();
        this._observer = new MutationObserver(() => this._scheduleScanControls());
        this._observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    _disable() {
        if (!this.isEnabled) return;
        this.isEnabled = false;
        this._setRuntimeState('disabled');

        if (this._observer) {
            this._observer.disconnect();
            this._observer = null;
        }
        this._unpatchDownloadButtons();
    }

    // ==================== 原生图片 controls 按钮 ====================

    _scheduleScanControls() {
        if (this._scanPending || !this.isEnabled) return;
        this._scanPending = true;
        requestAnimationFrame(() => {
            this._scanPending = false;
            this._scanControls();
        });
    }

    _pruneDetachedDownloadButtons() {
        for (const [button, handler] of this._downloadButtonHandlers) {
            if (!document.contains(button)) {
                button.removeEventListener('click', handler, true);
                this._downloadButtonHandlers.delete(button);
            }
        }
    }

    _scanControls() {
        if (!this.isEnabled) return;
        this._pruneDetachedDownloadButtons();
        document.querySelectorAll(this.config.controlsSelector).forEach((controls) => {
            const downloadButton = this._findDownloadButton(controls);
            if (!downloadButton || this._downloadButtonHandlers.has(downloadButton)) return;
            this._patchDownloadButton(downloadButton, controls);
        });
    }

    _findDownloadButton(controls) {
        const generatedImageDownloadButton = controls.querySelector('download-generated-image-button button');
        if (generatedImageDownloadButton) return generatedImageDownloadButton;

        const buttons = Array.from(controls.querySelectorAll('button'));
        const semanticDownloadButton = buttons.find((button) => {
            const label = button.getAttribute('aria-label') || '';
            const iconName = button.querySelector('mat-icon')?.getAttribute('data-mat-icon-name') || '';
            return label.includes('下载') ||
                /download/i.test(label) ||
                /download/i.test(iconName);
        });
        return semanticDownloadButton || null;
    }

    _patchDownloadButton(button, controls) {
        const handler = (e) => {
            if (this._nativeDownloadPassThrough.has(button)) {
                this._nativeDownloadPassThrough.delete(button);
                return;
            }

            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            try {
                this._showDownloadMenu(button, controls);
            } catch (err) {
                this._downloadOriginal(button);
            }
        };

        button.addEventListener('click', handler, true);
        this._downloadButtonHandlers.set(button, handler);
    }

    _showDownloadMenu(button, controls) {
        if (!window.globalDropdownManager) {
            this._downloadOriginal(button);
            return;
        }

        window.globalDropdownManager.show({
            id: 'gemini-watermark-download-menu',
            trigger: button,
            position: 'bottom-right',
            width: 190,
            items: [
                {
                    label: this._t('geminiWatermarkDownloadOriginal', '下载原图'),
                    value: 'original',
                    onClick: () => this._downloadOriginal(button)
                },
                {
                    label: this._t('geminiWatermarkDownload', '下载去水印图片'),
                    value: 'without-watermark',
                    onClick: () => this._downloadWithoutWatermark(controls, button)
                }
            ]
        });
    }

    _downloadOriginal(button) {
        this._nativeDownloadPassThrough.add(button);
        button.click();
    }

    _downloadWithoutWatermark(controls, button) {
        const img = this._findImageForControls(controls);
        const toast = window.globalToastManager;
        if (!img) {
            toast?.error(this._t('geminiWatermarkErrorNoImage', '未找到可处理的图片'));
            return;
        }
        if (!this._isEligibleImage(img)) {
            toast?.error(this._t('geminiWatermarkErrorTooSmall', '图片尺寸过小，无法去水印'));
            return;
        }
        this._process(img, button);
    }

    _isEligibleImage(img) {
        if (!img) {
            return false;
        }
        // 尺寸过滤：仅对足够大的图片显示（过滤头像、图标、装饰图）
        const rect = img.getBoundingClientRect();
        if (rect.width < 120 || rect.height < 120) return false;
        const naturalW = img.naturalWidth || rect.width;
        const naturalH = img.naturalHeight || rect.height;
        if (naturalW < this.config.minImageSize || naturalH < this.config.minImageSize) {
            return false;
        }
        return true;
    }

    _findImageForControls(controls) {
        const container = controls.closest('.overlay-container') || controls.parentElement;
        return container?.querySelector?.('.image-button img, img.image, img') || null;
    }

    _unpatchDownloadButtons() {
        this._downloadButtonHandlers.forEach((handler, button) => {
            button.removeEventListener('click', handler, true);
        });
        this._downloadButtonHandlers.clear();
    }

    _setRuntimeState(state) {
        try {
            document.documentElement.setAttribute('data-ait-watermark-remover', state);
        } catch (e) { /* ignore */ }
    }

    // ==================== 引擎加载 ====================

    async _ensureEngine() {
        if (this._engine) return this._engine;
        if (!this._enginePromise) {
            const url = chrome.runtime.getURL('js/watermark/engine/index.js');
            this._enginePromise = import(url).then(async (mod) => {
                const engine = await mod.createWatermarkEngine();
                this._engineModule = mod;
                this._engine = engine;
                return engine;
            }).catch((e) => {
                this._enginePromise = null;
                throw e;
            });
        }
        return this._enginePromise;
    }

    // ==================== 处理流程 ====================

    async _process(img, button = null) {
        if (this._processing || !img) return;

        this._processing = true;
        button?.classList.add('ait-wm-processing');
        button?.setAttribute('aria-busy', 'true');
        const toast = window.globalToastManager;

        try {
            const source = await this._loadCleanSource(img);
            if (!source) {
                toast?.error(this._t('geminiWatermarkErrorUnreadable', '无法读取图片像素（可能被浏览器安全策略拦截），请尝试下载原图'));
                return;
            }

            await this._ensureEngine();
            const { canvas, meta } = await this._engineModule.removeWatermarkFromImage(source, { engine: this._engine });

            if (!meta || meta.applied !== true) {
                toast?.error(this._processFailureMessage(meta));
                return;
            }

            const blob = await this._canvasToBlob(canvas);
            if (!blob) {
                toast?.error(this._t('geminiWatermarkErrorGeneric', '去水印失败'));
                return;
            }

            this._downloadBlob(blob);
        } catch (err) {
            toast?.error(this._t('geminiWatermarkErrorGeneric', '去水印失败'));
        } finally {
            this._processing = false;
            button?.classList.remove('ait-wm-processing');
            button?.removeAttribute('aria-busy');
        }
    }

    _processFailureMessage(meta) {
        if (meta?.skipReason === 'no-watermark-detected') {
            return this._t('geminiWatermarkErrorNoWatermark', '未检测到 Gemini 水印');
        }
        return this._t('geminiWatermarkErrorGeneric', '去水印失败');
    }

    /**
     * 获取未被 canvas 污染的图片源（HTMLCanvasElement）。
     * 分层策略：fetch -> createImageBitmap -> crossOrigin 重载 -> 直接绘制。
     * 任一方式得到可读像素即返回；全部失败返回 null。
     */
    async _loadCleanSource(img) {
        const url = img.currentSrc || img.src;
        if (!url) return null;

        // 1) fetch 原始字节（data:/blob:/同源/允许 CORS 的图片均可）
        try {
            const resp = await fetch(url, { mode: 'cors', credentials: 'omit' });
            if (resp.ok) {
                const blob = await resp.blob();
                const bitmap = await createImageBitmap(blob);
                const canvas = this._bitmapToCanvas(bitmap);
                if (this._isReadable(canvas)) return canvas;
            }
        } catch (e) { /* 继续降级 */ }

        // 2) crossOrigin='anonymous' 重新加载（图片服务支持 CORS 时可用）
        try {
            const cleanImg = await this._loadCrossOriginImage(url);
            const canvas = this._imageToCanvas(cleanImg);
            if (this._isReadable(canvas)) return canvas;
        } catch (e) { /* 继续降级 */ }

        // 3) 直接绘制页面上已加载的图片（同源/data/blob 不会污染）
        try {
            const canvas = this._imageToCanvas(img);
            if (this._isReadable(canvas)) return canvas;
        } catch (e) { /* 失败 */ }

        return null;
    }

    _bitmapToCanvas(bitmap) {
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        canvas.getContext('2d').drawImage(bitmap, 0, 0);
        return canvas;
    }

    _imageToCanvas(image) {
        const w = image.naturalWidth || image.width;
        const h = image.naturalHeight || image.height;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(image, 0, 0, w, h);
        return canvas;
    }

    _isReadable(canvas) {
        try {
            canvas.getContext('2d').getImageData(0, 0, 1, 1);
            return true;
        } catch (e) {
            return false;
        }
    }

    _appendCacheBust(url) {
        if (!url || url.startsWith('data:') || url.startsWith('blob:')) {
            return url;
        }
        const sep = url.includes('?') ? '&' : '?';
        return `${url}${sep}ait_wm=${Date.now()}`;
    }

    _loadCrossOriginImage(url) {
        return new Promise((resolve, reject) => {
            const image = new Image();
            image.crossOrigin = 'anonymous';
            image.onload = () => resolve(image);
            image.onerror = reject;
            image.src = this._appendCacheBust(url);
        });
    }

    _canvasToBlob(canvas) {
        // OffscreenCanvas（引擎默认）使用 convertToBlob，没有 HTMLCanvasElement 的 toBlob(callback)
        if (typeof OffscreenCanvas !== 'undefined' && canvas instanceof OffscreenCanvas) {
            return canvas.convertToBlob({ type: 'image/png' });
        }

        return new Promise((resolve) => {
            if (typeof canvas.toBlob === 'function') {
                canvas.toBlob((blob) => resolve(blob), 'image/png');
                return;
            }

            // 兜底：绘制到 HTMLCanvasElement 再导出
            try {
                const htmlCanvas = document.createElement('canvas');
                htmlCanvas.width = canvas.width;
                htmlCanvas.height = canvas.height;
                htmlCanvas.getContext('2d').drawImage(canvas, 0, 0);
                htmlCanvas.toBlob((blob) => resolve(blob), 'image/png');
            } catch (e) {
                resolve(null);
            }
        });
    }

    _downloadBlob(blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `gemini-no-watermark-${Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    // ==================== 工具 ====================

    _t(key, fallback) {
        try {
            return TimelineI18n.getMessage(key) || fallback;
        } catch (e) {
            return fallback;
        }
    }

    destroy() {
        this.isDestroyed = true;
        this._disable();
        if (this._storageListener) {
            chrome.storage.onChanged.removeListener(this._storageListener);
            this._storageListener = null;
        }
    }
}

// ==================== 初始化入口 ====================

(function () {
    'use strict';

    let remover = null;

    async function init() {
        try {
            await TimelineI18n.ready();

            remover = new GeminiWatermarkRemover();
            await remover.init();
        } catch (e) {
        }
    }

    function cleanup() {
        if (remover) {
            remover.destroy();
            remover = null;
        }
    }

    window.addEventListener('beforeunload', cleanup);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(init, 500));
    } else {
        setTimeout(init, 500);
    }
})();
