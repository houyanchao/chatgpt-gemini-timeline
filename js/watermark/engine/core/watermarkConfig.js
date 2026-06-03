import { computeRegionSpatialCorrelation, interpolateAlphaMap } from './adaptiveDetector.js';
import {
    resolveOfficialGeminiSearchConfigs,
    resolveOfficialGeminiWatermarkConfig
} from './geminiSizeCatalog.js';

/**
 * Detect watermark configuration based on image size
 * @param {number} imageWidth - Image width
 * @param {number} imageHeight - Image height
 * @returns {Object} Watermark configuration {logoSize, marginRight, marginBottom}
 */
export function detectWatermarkConfig(imageWidth, imageHeight) {
    const officialConfig = resolveOfficialGeminiWatermarkConfig(imageWidth, imageHeight);
    if (officialConfig) {
        return { ...officialConfig };
    }

    // Gemini's historical default rules:
    // If both image width and height are greater than 1024, use 96×96 watermark
    // Otherwise, use 48×48 watermark
    if (imageWidth > 1024 && imageHeight > 1024) {
        return {
            logoSize: 96,
            marginRight: 64,
            marginBottom: 64
        };
    }

    return {
        logoSize: 48,
        marginRight: 32,
        marginBottom: 32
    };
}

/**
 * Calculate watermark position in image based on image size and watermark configuration
 * @param {number} imageWidth - Image width
 * @param {number} imageHeight - Image height
 * @param {Object} config - Watermark configuration {logoSize, marginRight, marginBottom}
 * @returns {Object} Watermark position {x, y, width, height}
 */
export function calculateWatermarkPosition(imageWidth, imageHeight, config) {
    const { logoSize, marginRight, marginBottom } = config;

    return {
        x: imageWidth - marginRight - logoSize,
        y: imageHeight - marginBottom - logoSize,
        width: logoSize,
        height: logoSize
    };
}

function getStandardConfig(size) {
    return size === 96
        ? { logoSize: 96, marginRight: 64, marginBottom: 64 }
        : { logoSize: 48, marginRight: 32, marginBottom: 32 };
}

function getAlphaMapForConfig(config, alpha48, alpha96) {
    if (!config) return null;
    if (config.logoSize === 48) return alpha48;
    if (config.logoSize === 96) return alpha96;
    return alpha96 ? interpolateAlphaMap(alpha96, 96, config.logoSize) : null;
}

function isRegionInsideImage(imageData, region) {
    return region.x >= 0 &&
        region.y >= 0 &&
        region.x + region.width <= imageData.width &&
        region.y + region.height <= imageData.height;
}

/**
 * Resolve initial standard config by comparing 48/96 template correlation scores.
 * This helps when fixed size rules mismatch newer Gemini output layouts.
 */
export function resolveInitialStandardConfig({
    imageData,
    defaultConfig,
    alpha48,
    alpha96,
    minSwitchScore = 0.25,
    minScoreDelta = 0.08
}) {
    if (!imageData || !defaultConfig || !alpha48 || !alpha96) return defaultConfig;

    const fallbackConfig = getStandardConfig(48);
    const primaryConfig = defaultConfig.logoSize === 96 ? getStandardConfig(96) : fallbackConfig;
    const alternateConfig = defaultConfig.logoSize === 96 ? fallbackConfig : getStandardConfig(96);
    const candidateConfigs = [primaryConfig, alternateConfig];

    for (const officialConfig of resolveOfficialGeminiSearchConfigs(imageData.width, imageData.height, {
        limit: 1
    })) {
        if (!candidateConfigs.some((candidate) => (
            candidate.logoSize === officialConfig.logoSize &&
            candidate.marginRight === officialConfig.marginRight &&
            candidate.marginBottom === officialConfig.marginBottom
        ))) {
            candidateConfigs.push(officialConfig);
        }
    }

    let bestConfig = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const candidateConfig of candidateConfigs) {
        const candidateRegion = calculateWatermarkPosition(
            imageData.width,
            imageData.height,
            candidateConfig
        );
        if (!isRegionInsideImage(imageData, candidateRegion)) continue;

        const alphaMap = getAlphaMapForConfig(candidateConfig, alpha48, alpha96);
        if (!alphaMap) continue;

        const candidateScore = computeRegionSpatialCorrelation({
            imageData,
            alphaMap,
            region: {
                x: candidateRegion.x,
                y: candidateRegion.y,
                size: candidateRegion.width
            }
        });

        if (!bestConfig) {
            bestConfig = candidateConfig;
            bestScore = candidateScore;
            continue;
        }

        if (
            candidateScore >= minSwitchScore &&
            candidateScore > bestScore + minScoreDelta
        ) {
            bestConfig = candidateConfig;
            bestScore = candidateScore;
        }
    }

    return bestConfig ?? defaultConfig;
}
