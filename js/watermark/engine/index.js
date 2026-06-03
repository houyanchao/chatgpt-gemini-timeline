/**
 * Gemini watermark removal engine entry point.
 *
 * This directory is a near-verbatim port of the core algorithm from
 * GargantuaX/gemini-watermark-remover (MIT), itself a JavaScript port of
 * allenk/GeminiWatermarkTool (MIT, © 2024 AllenK / Kwyshell).
 * See ./LICENSE for the full MIT license and required attribution.
 *
 * Loaded lazily via dynamic import() from the content-script integration
 * layer so the heavy algorithm + embedded alpha maps are only parsed when
 * the user actually removes a watermark.
 */

export {
    createWatermarkEngine,
    removeWatermarkFromImage
} from './browser.js';

export {
    removeWatermarkFromImageData,
    removeWatermarkFromImageDataSync
} from './image-data.js';
