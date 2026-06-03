import {
    computeRegionGradientCorrelation,
    computeRegionSpatialCorrelation
} from './adaptiveDetector.js';

const NEAR_BLACK_THRESHOLD = 5;
const TEXTURE_REFERENCE_MARGIN = 1;
const TEXTURE_STD_FLOOR_RATIO = 0.8;
const TEXTURE_DARKNESS_VISIBILITY_HARD_REJECT_THRESHOLD = 1.5;
const TEXTURE_DARKNESS_HARD_REJECT_PENALTY_THRESHOLD = 0.5;
const TEXTURE_FLATNESS_HARD_REJECT_PENALTY_THRESHOLD = 0.2;
const DEFAULT_HALO_MIN_ALPHA = 0.12;
const DEFAULT_HALO_MAX_ALPHA = 0.35;
const DEFAULT_HALO_OUTSIDE_ALPHA_MAX = 0.01;
const DEFAULT_HALO_OUTER_MARGIN = 3;

export function cloneImageData(imageData) {
    if (typeof ImageData !== 'undefined' && imageData instanceof ImageData) {
        return new ImageData(
            new Uint8ClampedArray(imageData.data),
            imageData.width,
            imageData.height
        );
    }

    return {
        width: imageData.width,
        height: imageData.height,
        data: new Uint8ClampedArray(imageData.data)
    };
}

export function calculateNearBlackRatio(imageData, position) {
    let nearBlack = 0;
    let total = 0;
    for (let row = 0; row < position.height; row++) {
        for (let col = 0; col < position.width; col++) {
            const idx = ((position.y + row) * imageData.width + (position.x + col)) * 4;
            const r = imageData.data[idx];
            const g = imageData.data[idx + 1];
            const b = imageData.data[idx + 2];
            if (r <= NEAR_BLACK_THRESHOLD && g <= NEAR_BLACK_THRESHOLD && b <= NEAR_BLACK_THRESHOLD) {
                nearBlack++;
            }
            total++;
        }
    }

    return total > 0 ? nearBlack / total : 0;
}

function calculateRegionTextureStats(imageData, region) {
    let sum = 0;
    let sq = 0;
    let total = 0;

    for (let row = 0; row < region.height; row++) {
        for (let col = 0; col < region.width; col++) {
            const idx = ((region.y + row) * imageData.width + (region.x + col)) * 4;
            const lum =
                0.2126 * imageData.data[idx] +
                0.7152 * imageData.data[idx + 1] +
                0.0722 * imageData.data[idx + 2];
            sum += lum;
            sq += lum * lum;
            total++;
        }
    }

    const meanLum = total > 0 ? sum / total : 0;
    const variance = total > 0 ? Math.max(0, sq / total - meanLum * meanLum) : 0;

    return {
        meanLum,
        stdLum: Math.sqrt(variance)
    };
}

export function getRegionTextureStats(imageData, region) {
    return calculateRegionTextureStats(imageData, region);
}

export function assessAlphaBandHalo({
    imageData,
    position,
    alphaMap,
    minAlpha = DEFAULT_HALO_MIN_ALPHA,
    maxAlpha = DEFAULT_HALO_MAX_ALPHA,
    outsideAlphaMax = DEFAULT_HALO_OUTSIDE_ALPHA_MAX,
    outerMargin = DEFAULT_HALO_OUTER_MARGIN
}) {
    let bandSum = 0;
    let bandSq = 0;
    let bandCount = 0;
    let outerSum = 0;
    let outerSq = 0;
    let outerCount = 0;

    for (let row = -outerMargin; row < position.height + outerMargin; row++) {
        for (let col = -outerMargin; col < position.width + outerMargin; col++) {
            const pixelX = position.x + col;
            const pixelY = position.y + row;
            if (pixelX < 0 || pixelY < 0 || pixelX >= imageData.width || pixelY >= imageData.height) {
                continue;
            }

            const pixelIndex = (pixelY * imageData.width + pixelX) * 4;
            const luminance =
                0.2126 * imageData.data[pixelIndex] +
                0.7152 * imageData.data[pixelIndex + 1] +
                0.0722 * imageData.data[pixelIndex + 2];
            const insideRegion = row >= 0 && col >= 0 && row < position.height && col < position.width;
            const alpha = insideRegion
                ? alphaMap[row * position.width + col]
                : 0;

            if (insideRegion && alpha >= minAlpha && alpha <= maxAlpha) {
                bandSum += luminance;
                bandSq += luminance * luminance;
                bandCount++;
                continue;
            }

            if (!insideRegion || alpha <= outsideAlphaMax) {
                outerSum += luminance;
                outerSq += luminance * luminance;
                outerCount++;
            }
        }
    }

    const bandMeanLum = bandCount > 0 ? bandSum / bandCount : 0;
    const outerMeanLum = outerCount > 0 ? outerSum / outerCount : 0;
    const bandStdLum = bandCount > 0 ? Math.sqrt(Math.max(0, bandSq / bandCount - bandMeanLum * bandMeanLum)) : 0;
    const outerStdLum = outerCount > 0 ? Math.sqrt(Math.max(0, outerSq / outerCount - outerMeanLum * outerMeanLum)) : 0;
    const deltaLum = bandMeanLum - outerMeanLum;
    const visibility = deltaLum / Math.max(1, outerStdLum);

    return {
        bandCount,
        outerCount,
        bandMeanLum,
        outerMeanLum,
        bandStdLum,
        outerStdLum,
        deltaLum,
        positiveDeltaLum: Math.max(0, deltaLum),
        visibility
    };
}

function getReferenceRegion(position, imageData) {
    const referenceY = position.y - position.height;
    if (referenceY < 0) return null;

    return {
        x: position.x,
        y: referenceY,
        width: position.width,
        height: position.height
    };
}

export function assessReferenceTextureAlignment({
    originalImageData,
    referenceImageData,
    candidateImageData,
    position
}) {
    const candidateTextureStats = candidateImageData
        ? calculateRegionTextureStats(candidateImageData, position)
        : null;

    return assessReferenceTextureAlignmentFromStats({
        originalImageData,
        referenceImageData,
        candidateTextureStats,
        position
    });
}

export function assessReferenceTextureAlignmentFromStats({
    originalImageData,
    referenceImageData,
    candidateTextureStats,
    position
}) {
    const resolvedReferenceImageData = referenceImageData ?? originalImageData;
    const referenceRegion = resolvedReferenceImageData
        ? getReferenceRegion(position, resolvedReferenceImageData)
        : null;
    const referenceTextureStats = referenceRegion
        ? calculateRegionTextureStats(resolvedReferenceImageData, referenceRegion)
        : null;
    const darknessPenalty = referenceTextureStats && candidateTextureStats
        ? Math.max(0, referenceTextureStats.meanLum - candidateTextureStats.meanLum - TEXTURE_REFERENCE_MARGIN) /
            Math.max(1, referenceTextureStats.meanLum)
        : 0;
    const flatnessPenalty = referenceTextureStats && candidateTextureStats
        ? Math.max(0, referenceTextureStats.stdLum * TEXTURE_STD_FLOOR_RATIO - candidateTextureStats.stdLum) /
            Math.max(1, referenceTextureStats.stdLum)
        : 0;
    const darknessVisibility = referenceTextureStats && candidateTextureStats
        ? Math.max(0, referenceTextureStats.meanLum - candidateTextureStats.meanLum - TEXTURE_REFERENCE_MARGIN) /
            Math.max(1, referenceTextureStats.stdLum)
        : 0;
    const tooDark = darknessPenalty > 0;
    const tooFlat = flatnessPenalty > 0;
    const visibleDarkHole = tooDark && darknessVisibility >= TEXTURE_DARKNESS_VISIBILITY_HARD_REJECT_THRESHOLD;
    const strongDarkFlatCollapse =
        tooDark &&
        tooFlat &&
        darknessPenalty >= TEXTURE_DARKNESS_HARD_REJECT_PENALTY_THRESHOLD &&
        flatnessPenalty >= TEXTURE_FLATNESS_HARD_REJECT_PENALTY_THRESHOLD;

    return {
        referenceTextureStats,
        candidateTextureStats,
        darknessPenalty,
        flatnessPenalty,
        darknessVisibility,
        texturePenalty: darknessPenalty * 2 + flatnessPenalty * 2,
        tooDark,
        tooFlat,
        visibleDarkHole,
        hardReject: strongDarkFlatCollapse || visibleDarkHole
    };
}

export function scoreRegion(imageData, alphaMap, position) {
    return {
        spatialScore: computeRegionSpatialCorrelation({
            imageData,
            alphaMap,
            region: {
                x: position.x,
                y: position.y,
                size: position.width
            }
        }),
        gradientScore: computeRegionGradientCorrelation({
            imageData,
            alphaMap,
            region: {
                x: position.x,
                y: position.y,
                size: position.width
            }
        })
    };
}
