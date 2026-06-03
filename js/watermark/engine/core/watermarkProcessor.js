import { removeWatermark } from './blendModes.js';
import { removeRepeatedWatermarkLayers } from './multiPassRemoval.js';
import {
    computeRegionGradientCorrelation,
    computeRegionSpatialCorrelation,
    warpAlphaMap
} from './adaptiveDetector.js';
import {
    calculateNearBlackRatio,
    scoreRegion,
    selectInitialCandidate
} from './candidateSelector.js';
import { assessAlphaBandHalo } from './restorationMetrics.js';
import { createSelectionDebugSummary } from './selectionDebug.js';
import {
    calculateWatermarkPosition,
    detectWatermarkConfig,
    resolveInitialStandardConfig
} from './watermarkConfig.js';

const RESIDUAL_RECALIBRATION_THRESHOLD = 0.5;
const MIN_SUPPRESSION_FOR_SKIP_RECALIBRATION = 0.18;
const MIN_RECALIBRATION_SCORE_DELTA = 0.18;
const MAX_NEAR_BLACK_RATIO_INCREASE = 0.05;
const OUTLINE_REFINEMENT_THRESHOLD = 0.42;
const OUTLINE_REFINEMENT_MIN_GAIN = 1.2;
const SUBPIXEL_REFINE_SHIFTS = [-0.25, 0, 0.25];
const SUBPIXEL_REFINE_SCALES = [0.99, 1, 1.01];
const ALPHA_GAIN_CANDIDATES = [1.05, 1.12, 1.2, 1.28, 1.36, 1.45, 1.52, 1.6, 1.7, 1.85, 2.0, 2.2, 2.4, 2.6];
const PREVIEW_EDGE_CLEANUP_MAX_SIZE = 40;
const PREVIEW_EDGE_CLEANUP_SPATIAL_THRESHOLD = 0.08;
const PREVIEW_EDGE_CLEANUP_GRADIENT_THRESHOLD = 0.1;
const PREVIEW_EDGE_CLEANUP_MIN_GRADIENT_IMPROVEMENT = 0.03;
const PREVIEW_EDGE_CLEANUP_MAX_SPATIAL_DRIFT = 0.04;
const PREVIEW_EDGE_CLEANUP_MAX_APPLIED_PASSES = 3;
const PREVIEW_EDGE_CLEANUP_FINE_GRADIENT_THRESHOLD = 0.16;
const PREVIEW_EDGE_CLEANUP_FINE_MIN_GRADIENT_IMPROVEMENT = 0.005;
const PREVIEW_EDGE_CLEANUP_HALO_RELAXED_MIN_GRADIENT_IMPROVEMENT = 0.01;
const PREVIEW_EDGE_CLEANUP_HALO_WEIGHT = 0.02;
const PREVIEW_EDGE_CLEANUP_MIN_HALO_REDUCTION = 1.5;
const PREVIEW_EDGE_CLEANUP_STRONG_HALO_THRESHOLD = 4;
const PREVIEW_EDGE_CLEANUP_HALO_SPATIAL_THRESHOLD = 0.18;
const PREVIEW_EDGE_CLEANUP_PRESETS = Object.freeze([
    { minAlpha: 0.02, maxAlpha: 0.45, radius: 2, strength: 0.7, outsideAlphaMax: 0.05 },
    { minAlpha: 0.05, maxAlpha: 0.55, radius: 3, strength: 0.7, outsideAlphaMax: 0.08 },
    { minAlpha: 0.1, maxAlpha: 0.7, radius: 3, strength: 0.8, outsideAlphaMax: 0.12 },
    { minAlpha: 0.01, maxAlpha: 0.35, radius: 4, strength: 1.4, outsideAlphaMax: 0.05 }
]);
const PREVIEW_EDGE_CLEANUP_STRONG_GRADIENT_THRESHOLD = 0.45;
const PREVIEW_EDGE_CLEANUP_AGGRESSIVE_PRESETS = Object.freeze([
    {
        minAlpha: 0.01,
        maxAlpha: 0.55,
        radius: 2,
        strength: 1.3,
        outsideAlphaMax: 0.05,
        minGradientImprovement: 0.12,
        maxSpatialDrift: 0.18,
        maxAcceptedSpatial: 0.18
    }
]);
const FIRST_PASS_SIGN_FLIP_GRADIENT_THRESHOLD = 0.08;
const FIRST_PASS_SIGN_FLIP_MIN_GRADIENT_DROP = 0.2;

function nowMs() {
    if (typeof globalThis.performance?.now === 'function') {
        return globalThis.performance.now();
    }
    return Date.now();
}

function cloneImageData(imageData) {
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

function normalizeMetaPosition(position) {
    if (!position) return null;

    const { x, y, width, height } = position;
    if (![x, y, width, height].every((value) => Number.isFinite(value))) {
        return null;
    }

    return { x, y, width, height };
}

function normalizeMetaConfig(config) {
    if (!config) return null;

    const { logoSize, marginRight, marginBottom } = config;
    if (![logoSize, marginRight, marginBottom].every((value) => Number.isFinite(value))) {
        return null;
    }

    return { logoSize, marginRight, marginBottom };
}

function createWatermarkMeta({
    position = null,
    config = null,
    adaptiveConfidence = null,
    originalSpatialScore = null,
    originalGradientScore = null,
    processedSpatialScore = null,
    processedGradientScore = null,
    suppressionGain = null,
    templateWarp = null,
    alphaGain = 1,
    passCount = 0,
    attemptedPassCount = 0,
    passStopReason = null,
    passes = null,
    source = 'standard',
    decisionTier = null,
    applied = true,
    skipReason = null,
    subpixelShift = null,
    selectionDebug = null
} = {}) {
    const normalizedPosition = normalizeMetaPosition(position);

    return {
        applied,
        skipReason: applied ? null : skipReason,
        size: normalizedPosition ? normalizedPosition.width : null,
        position: normalizedPosition,
        config: normalizeMetaConfig(config),
        detection: {
            adaptiveConfidence,
            originalSpatialScore,
            originalGradientScore,
            processedSpatialScore,
            processedGradientScore,
            suppressionGain
        },
        templateWarp: templateWarp ?? null,
        alphaGain,
        passCount,
        attemptedPassCount,
        passStopReason,
        passes: Array.isArray(passes) ? passes : null,
        // decisionTier is the normalized contract used by UI and attribution.
        // source remains as a verbose execution trace for debugging/tests.
        source,
        decisionTier,
        subpixelShift: subpixelShift ?? null,
        selectionDebug
    };
}

function shouldRecalibrateAlphaStrength({ originalScore, processedScore, suppressionGain }) {
    return originalScore >= 0.6 &&
        processedScore >= RESIDUAL_RECALIBRATION_THRESHOLD &&
        suppressionGain <= MIN_SUPPRESSION_FOR_SKIP_RECALIBRATION;
}

function shouldStopAfterFirstPass({
    originalSpatialScore,
    originalGradientScore,
    firstPassSpatialScore,
    firstPassGradientScore
}) {
    if (Math.abs(firstPassSpatialScore) <= 0.25) {
        return true;
    }

    return originalSpatialScore >= 0 &&
        firstPassSpatialScore < 0 &&
        firstPassGradientScore <= FIRST_PASS_SIGN_FLIP_GRADIENT_THRESHOLD &&
        (originalGradientScore - firstPassGradientScore) >= FIRST_PASS_SIGN_FLIP_MIN_GRADIENT_DROP;
}

function refineSubpixelOutline({
    sourceImageData,
    alphaMap,
    position,
    alphaGain,
    originalNearBlackRatio,
    baselineSpatialScore,
    baselineGradientScore,
    baselineShift,
    minGain = OUTLINE_REFINEMENT_MIN_GAIN,
    shiftCandidates = SUBPIXEL_REFINE_SHIFTS,
    scaleCandidates = SUBPIXEL_REFINE_SCALES,
    minGradientImprovement = 0.04,
    maxSpatialDrift = 0.08
}) {
    const size = position.width;
    if (!size || size <= 8) return null;
    if (alphaGain < minGain) return null;

    const maxAllowedNearBlackRatio = Math.min(1, originalNearBlackRatio + MAX_NEAR_BLACK_RATIO_INCREASE);
    const gainCandidates = [alphaGain];
    const lower = Math.max(1, Number((alphaGain - 0.01).toFixed(2)));
    const upper = Number((alphaGain + 0.01).toFixed(2));
    if (lower !== alphaGain) gainCandidates.push(lower);
    if (upper !== alphaGain) gainCandidates.push(upper);

    const baseDx = baselineShift?.dx ?? 0;
    const baseDy = baselineShift?.dy ?? 0;
    const baseScale = baselineShift?.scale ?? 1;

    let best = null;
    for (const scaleDelta of scaleCandidates) {
        const scale = Number((baseScale * scaleDelta).toFixed(4));
        for (const dyDelta of shiftCandidates) {
            const dy = baseDy + dyDelta;
            for (const dxDelta of shiftCandidates) {
                const dx = baseDx + dxDelta;
                const warped = warpAlphaMap(alphaMap, size, { dx, dy, scale });
                for (const gain of gainCandidates) {
                    const candidate = cloneImageData(sourceImageData);
                    removeWatermark(candidate, warped, position, { alphaGain: gain });
                    const nearBlackRatio = calculateNearBlackRatio(candidate, position);
                    if (nearBlackRatio > maxAllowedNearBlackRatio) continue;

                    const spatialScore = computeRegionSpatialCorrelation({
                        imageData: candidate,
                        alphaMap: warped,
                        region: { x: position.x, y: position.y, size }
                    });
                    const gradientScore = computeRegionGradientCorrelation({
                        imageData: candidate,
                        alphaMap: warped,
                        region: { x: position.x, y: position.y, size }
                    });

                    const cost = Math.abs(spatialScore) * 0.6 + Math.max(0, gradientScore);
                    if (!best || cost < best.cost) {
                        best = {
                            imageData: candidate,
                            alphaMap: warped,
                            alphaGain: gain,
                            shift: { dx, dy, scale },
                            spatialScore,
                            gradientScore,
                            nearBlackRatio,
                            cost
                        };
                    }
                }
            }
        }
    }

    if (!best) return null;

    const improvedGradient = best.gradientScore <= baselineGradientScore - minGradientImprovement;
    const keptSpatial = Math.abs(best.spatialScore) <= Math.abs(baselineSpatialScore) + maxSpatialDrift;
    if (!improvedGradient || !keptSpatial) return null;

    return best;
}

function recalibrateAlphaStrength({
    sourceImageData,
    alphaMap,
    position,
    originalSpatialScore,
    processedSpatialScore,
    originalNearBlackRatio
}) {
    let bestScore = processedSpatialScore;
    let bestGain = 1;
    let bestImageData = null;
    const maxAllowedNearBlackRatio = Math.min(1, originalNearBlackRatio + MAX_NEAR_BLACK_RATIO_INCREASE);

    for (const alphaGain of ALPHA_GAIN_CANDIDATES) {
        const candidate = cloneImageData(sourceImageData);
        removeWatermark(candidate, alphaMap, position, { alphaGain });
        const candidateNearBlackRatio = calculateNearBlackRatio(candidate, position);
        if (candidateNearBlackRatio > maxAllowedNearBlackRatio) {
            continue;
        }

        const score = computeRegionSpatialCorrelation({
            imageData: candidate,
            alphaMap,
            region: {
                x: position.x,
                y: position.y,
                size: position.width
            }
        });

        if (score < bestScore) {
            bestScore = score;
            bestGain = alphaGain;
            bestImageData = candidate;
        }
    }

    const refinedCandidates = [];
    for (let delta = -0.05; delta <= 0.05; delta += 0.01) {
        refinedCandidates.push(Number((bestGain + delta).toFixed(2)));
    }

    for (const alphaGain of refinedCandidates) {
        if (alphaGain <= 1 || alphaGain >= 3) continue;
        const candidate = cloneImageData(sourceImageData);
        removeWatermark(candidate, alphaMap, position, { alphaGain });
        const candidateNearBlackRatio = calculateNearBlackRatio(candidate, position);
        if (candidateNearBlackRatio > maxAllowedNearBlackRatio) {
            continue;
        }

        const score = computeRegionSpatialCorrelation({
            imageData: candidate,
            alphaMap,
            region: {
                x: position.x,
                y: position.y,
                size: position.width
            }
        });

        if (score < bestScore) {
            bestScore = score;
            bestGain = alphaGain;
            bestImageData = candidate;
        }
    }

    const scoreDelta = processedSpatialScore - bestScore;
    if (!bestImageData || scoreDelta < MIN_RECALIBRATION_SCORE_DELTA) {
        return null;
    }

    return {
        imageData: bestImageData,
        alphaGain: bestGain,
        processedSpatialScore: bestScore,
        suppressionGain: originalSpatialScore - bestScore
    };
}

function shouldRefinePreviewResidualEdge({
    source,
    position,
    baselineSpatialScore,
    baselineGradientScore,
    baselinePositiveHalo
}) {
    return typeof source === 'string' &&
        source.includes('preview-anchor') &&
        position?.width >= 24 &&
        position?.width <= PREVIEW_EDGE_CLEANUP_MAX_SIZE &&
        (
            Math.abs(baselineSpatialScore) <= PREVIEW_EDGE_CLEANUP_SPATIAL_THRESHOLD ||
            (
                baselinePositiveHalo >= PREVIEW_EDGE_CLEANUP_STRONG_HALO_THRESHOLD &&
                Math.abs(baselineSpatialScore) <= PREVIEW_EDGE_CLEANUP_HALO_SPATIAL_THRESHOLD
            )
        ) &&
        baselineGradientScore >= PREVIEW_EDGE_CLEANUP_GRADIENT_THRESHOLD;
}

function shouldUsePreviewAnchorFastCleanup(selectedTrial, position) {
    return selectedTrial?.provenance?.previewAnchor === true &&
        position?.width >= 24 &&
        position?.width <= PREVIEW_EDGE_CLEANUP_MAX_SIZE;
}

function blendPreviewResidualEdge({
    sourceImageData,
    alphaMap,
    position,
    minAlpha,
    maxAlpha,
    radius,
    strength,
    outsideAlphaMax
}) {
    const candidate = cloneImageData(sourceImageData);
    const { width: imageWidth, height: imageHeight, data } = sourceImageData;
    const regionSize = position.width;
    const maxAlphaSafe = Math.max(maxAlpha, 1e-6);

    for (let row = 0; row < regionSize; row++) {
        for (let col = 0; col < regionSize; col++) {
            const alpha = alphaMap[row * regionSize + col];
            if (alpha < minAlpha || alpha > maxAlpha) continue;

            let sumR = 0;
            let sumG = 0;
            let sumB = 0;
            let sumWeight = 0;

            for (let dy = -radius; dy <= radius; dy++) {
                for (let dx = -radius; dx <= radius; dx++) {
                    if (dx === 0 && dy === 0) continue;

                    const localY = row + dy;
                    const localX = col + dx;
                    const pixelX = position.x + localX;
                    const pixelY = position.y + localY;

                    if (pixelX < 0 || pixelY < 0 || pixelX >= imageWidth || pixelY >= imageHeight) {
                        continue;
                    }

                    let neighborAlpha = 0;
                    if (localY >= 0 && localX >= 0 && localY < regionSize && localX < regionSize) {
                        neighborAlpha = alphaMap[localY * regionSize + localX];
                    }
                    if (neighborAlpha > outsideAlphaMax) continue;

                    const distance = Math.sqrt(dx * dx + dy * dy) || 1;
                    const weight = 1 / distance;
                    const pixelIndex = (pixelY * imageWidth + pixelX) * 4;
                    sumR += data[pixelIndex] * weight;
                    sumG += data[pixelIndex + 1] * weight;
                    sumB += data[pixelIndex + 2] * weight;
                    sumWeight += weight;
                }
            }

            if (sumWeight <= 0) continue;

            const blend = Math.max(0, Math.min(1, strength * alpha / maxAlphaSafe));
            const pixelIndex = ((position.y + row) * imageWidth + (position.x + col)) * 4;
            candidate.data[pixelIndex] = Math.round(data[pixelIndex] * (1 - blend) + (sumR / sumWeight) * blend);
            candidate.data[pixelIndex + 1] = Math.round(data[pixelIndex + 1] * (1 - blend) + (sumG / sumWeight) * blend);
            candidate.data[pixelIndex + 2] = Math.round(data[pixelIndex + 2] * (1 - blend) + (sumB / sumWeight) * blend);
        }
    }

    return candidate;
}

function refinePreviewResidualEdge({
    sourceImageData,
    alphaMap,
    position,
    source,
    baselineSpatialScore,
    baselineGradientScore,
    minGradientImprovement = PREVIEW_EDGE_CLEANUP_MIN_GRADIENT_IMPROVEMENT,
    maxSpatialDrift = PREVIEW_EDGE_CLEANUP_MAX_SPATIAL_DRIFT,
    allowAggressivePresets = false
}) {
    const baselineHalo = assessAlphaBandHalo({
        imageData: sourceImageData,
        position,
        alphaMap
    });
    const baselinePositiveHalo = baselineHalo.positiveDeltaLum;
    if (!shouldRefinePreviewResidualEdge({
        source,
        position,
        baselineSpatialScore,
        baselineGradientScore,
        baselinePositiveHalo
    })) {
        return null;
    }

    const baselineNearBlackRatio = calculateNearBlackRatio(sourceImageData, position);
    const maxAllowedNearBlackRatio = Math.min(1, baselineNearBlackRatio + MAX_NEAR_BLACK_RATIO_INCREASE);
    const resolvedMinGradientImprovement = baselineGradientScore <= PREVIEW_EDGE_CLEANUP_FINE_GRADIENT_THRESHOLD
        ? PREVIEW_EDGE_CLEANUP_FINE_MIN_GRADIENT_IMPROVEMENT
        : (
            baselinePositiveHalo >= PREVIEW_EDGE_CLEANUP_STRONG_HALO_THRESHOLD
                ? PREVIEW_EDGE_CLEANUP_HALO_RELAXED_MIN_GRADIENT_IMPROVEMENT
                : minGradientImprovement
        );
    const presets = allowAggressivePresets &&
        baselineGradientScore >= PREVIEW_EDGE_CLEANUP_STRONG_GRADIENT_THRESHOLD &&
        Math.abs(baselineSpatialScore) <= 0.05
        ? [...PREVIEW_EDGE_CLEANUP_PRESETS, ...PREVIEW_EDGE_CLEANUP_AGGRESSIVE_PRESETS]
        : PREVIEW_EDGE_CLEANUP_PRESETS;
    let best = null;

    for (const preset of presets) {
        const candidate = blendPreviewResidualEdge({
            sourceImageData,
            alphaMap,
            position,
            ...preset
        });
        const nearBlackRatio = calculateNearBlackRatio(candidate, position);
        if (nearBlackRatio > maxAllowedNearBlackRatio) continue;

        const spatialScore = computeRegionSpatialCorrelation({
            imageData: candidate,
            alphaMap,
            region: { x: position.x, y: position.y, size: position.width }
        });
        const gradientScore = computeRegionGradientCorrelation({
            imageData: candidate,
            alphaMap,
            region: { x: position.x, y: position.y, size: position.width }
        });
        const halo = assessAlphaBandHalo({
            imageData: candidate,
            position,
            alphaMap
        });

        const presetMinGradientImprovement = preset.minGradientImprovement ?? resolvedMinGradientImprovement;
        const presetMaxSpatialDrift = preset.maxSpatialDrift ?? maxSpatialDrift;
        const presetMaxAcceptedSpatial = preset.maxAcceptedSpatial ?? 0.22;
        const improvedGradient = gradientScore <= baselineGradientScore - presetMinGradientImprovement;
        const keptSpatial = Math.abs(spatialScore) <= Math.abs(baselineSpatialScore) + presetMaxSpatialDrift;
        const keptResidualWithinTarget = Math.abs(spatialScore) <= presetMaxAcceptedSpatial;
        const candidatePositiveHalo = halo.positiveDeltaLum;
        const improvedHalo = baselinePositiveHalo < PREVIEW_EDGE_CLEANUP_STRONG_HALO_THRESHOLD ||
            candidatePositiveHalo <= baselinePositiveHalo - PREVIEW_EDGE_CLEANUP_MIN_HALO_REDUCTION;
        if (!improvedGradient || !keptSpatial || !keptResidualWithinTarget || !improvedHalo) continue;

        const cost = Math.abs(spatialScore) * 0.6 +
            Math.max(0, gradientScore) +
            candidatePositiveHalo * PREVIEW_EDGE_CLEANUP_HALO_WEIGHT;
        if (!best || cost < best.cost) {
            best = {
                imageData: candidate,
                spatialScore,
                gradientScore,
                halo,
                cost
            };
        }
    }

    return best;
}

export function processWatermarkImageData(imageData, options = {}) {
    const totalStartedAt = nowMs();
    const debugTimingsEnabled = options.debugTimings === true;
    const debugTimings = debugTimingsEnabled ? {} : null;
    const adaptiveMode = options.adaptiveMode || 'auto';
    const allowAdaptiveSearch =
        adaptiveMode !== 'never' &&
        adaptiveMode !== 'off';
    const originalImageData = cloneImageData(imageData);
    const { alpha48, alpha96 } = options;
    const alphaGainCandidates = ALPHA_GAIN_CANDIDATES;

    if (!alpha48 || !alpha96) {
        throw new Error('processWatermarkImageData requires alpha48 and alpha96');
    }

    const defaultConfig = detectWatermarkConfig(originalImageData.width, originalImageData.height);
    const resolvedConfig = resolveInitialStandardConfig({
        imageData: originalImageData,
        defaultConfig,
        alpha48,
        alpha96
    });

    let config = resolvedConfig;
    let position = calculateWatermarkPosition(originalImageData.width, originalImageData.height, config);
    let alphaMap = config.logoSize === 96 ? alpha96 : alpha48;
    let source = 'standard';
    let adaptiveConfidence = null;
    let alphaGain = 1;
    let subpixelShift = null;
    let templateWarp = null;
    let decisionTier = null;
    let passCount = 0;
    let attemptedPassCount = 0;
    let passStopReason = null;
    let passes = null;

    const initialSelectionStartedAt = nowMs();
    const initialSelection = selectInitialCandidate({
        originalImageData,
        config,
        position,
        alpha48,
        alpha96,
        alpha96Variants: options.alpha96Variants ?? null,
        getAlphaMap: options.getAlphaMap,
        allowAdaptiveSearch,
        alphaGainCandidates
    });
    if (debugTimingsEnabled) {
        debugTimings.initialSelectionMs = nowMs() - initialSelectionStartedAt;
    }

    if (!initialSelection.selectedTrial) {
        if (debugTimingsEnabled) {
            debugTimings.totalMs = nowMs() - totalStartedAt;
        }
        return {
            imageData: originalImageData,
            meta: createWatermarkMeta({
                adaptiveConfidence: initialSelection.adaptiveConfidence,
                originalSpatialScore: initialSelection.standardSpatialScore,
                originalGradientScore: initialSelection.standardGradientScore,
                processedSpatialScore: initialSelection.standardSpatialScore,
                processedGradientScore: initialSelection.standardGradientScore,
                suppressionGain: 0,
                alphaGain: 1,
                source: 'skipped',
                decisionTier: initialSelection.decisionTier ?? 'insufficient',
                applied: false,
                skipReason: 'no-watermark-detected',
                selectionDebug: null
            }),
            debugTimings
        };
    }

    position = initialSelection.position;
    alphaMap = initialSelection.alphaMap;
    config = initialSelection.config;
    source = initialSelection.source;
    adaptiveConfidence = initialSelection.adaptiveConfidence;
    templateWarp = initialSelection.templateWarp;
    alphaGain = initialSelection.alphaGain;
    decisionTier = initialSelection.decisionTier;

    const selectedTrial = initialSelection.selectedTrial;
    const usePreviewAnchorFastCleanup = shouldUsePreviewAnchorFastCleanup(selectedTrial, position);
    const skipPreviewAnchorMultiPass = selectedTrial?.provenance?.previewAnchor === true;

    let finalImageData = selectedTrial.imageData;

    let originalSpatialScore = selectedTrial.originalSpatialScore;
    let originalGradientScore = selectedTrial.originalGradientScore;

    const firstPassMetricsStartedAt = nowMs();
    const firstPassSpatialScore = computeRegionSpatialCorrelation({
        imageData: finalImageData,
        alphaMap,
        region: { x: position.x, y: position.y, size: position.width }
    });
    const firstPassGradientScore = computeRegionGradientCorrelation({
        imageData: finalImageData,
        alphaMap,
        region: { x: position.x, y: position.y, size: position.width }
    });
    const firstPassNearBlackRatio = calculateNearBlackRatio(finalImageData, position);
    const firstPassRecord = {
        index: 1,
        beforeSpatialScore: originalSpatialScore,
        beforeGradientScore: originalGradientScore,
        afterSpatialScore: firstPassSpatialScore,
        afterGradientScore: firstPassGradientScore,
        improvement: Math.abs(originalSpatialScore) - Math.abs(firstPassSpatialScore),
        gradientDelta: firstPassGradientScore - originalGradientScore,
        nearBlackRatio: firstPassNearBlackRatio
    };
    if (debugTimingsEnabled) {
        debugTimings.firstPassMetricsMs = nowMs() - firstPassMetricsStartedAt;
    }

    const totalMaxPasses = Math.max(
        1,
        options.maxPasses ?? 4
    );
    const remainingPasses = Math.max(0, totalMaxPasses - 1);
    const firstPassClearedResidual = shouldStopAfterFirstPass({
        originalSpatialScore,
        originalGradientScore,
        firstPassSpatialScore,
        firstPassGradientScore
    });
    const extraPassStartedAt = nowMs();
    const extraPassResult = remainingPasses > 0 &&
        !firstPassClearedResidual &&
        !skipPreviewAnchorMultiPass
        ? removeRepeatedWatermarkLayers({
            imageData: finalImageData,
            alphaMap,
            position,
            maxPasses: remainingPasses,
            startingPassIndex: 1,
            alphaGain
        })
        : null;
    if (debugTimingsEnabled) {
        debugTimings.extraPassMs = nowMs() - extraPassStartedAt;
    }
    finalImageData = extraPassResult?.imageData ?? finalImageData;
    passCount = extraPassResult?.passCount ?? 1;
    attemptedPassCount = extraPassResult?.attemptedPassCount ?? 1;
    passStopReason = extraPassResult?.stopReason ?? (
        firstPassClearedResidual
            ? 'residual-low'
            : (skipPreviewAnchorMultiPass ? 'preview-anchor-single-pass' : 'max-passes')
    );
    passes = [firstPassRecord, ...(extraPassResult?.passes ?? [])];
    if (passCount > 1) {
        source = `${source}+multipass`;
    }

    const finalMetricsStartedAt = nowMs();
    const processedSpatialScore = computeRegionSpatialCorrelation({
        imageData: finalImageData,
        alphaMap,
        region: {
            x: position.x,
            y: position.y,
            size: position.width
        }
    });
    const processedGradientScore = computeRegionGradientCorrelation({
        imageData: finalImageData,
        alphaMap,
        region: {
            x: position.x,
            y: position.y,
            size: position.width
        }
    });
    if (debugTimingsEnabled) {
        debugTimings.finalMetricsMs = nowMs() - finalMetricsStartedAt;
    }
    let finalProcessedSpatialScore = processedSpatialScore;
    let finalProcessedGradientScore = processedGradientScore;
    let suppressionGain = originalSpatialScore - finalProcessedSpatialScore;

    const recalibrationStartedAt = nowMs();
    if (shouldRecalibrateAlphaStrength({
        originalScore: originalSpatialScore,
        processedScore: finalProcessedSpatialScore,
        suppressionGain
    })) {
        const originalNearBlackRatio = calculateNearBlackRatio(finalImageData, position);
        const recalibrated = recalibrateAlphaStrength({
            sourceImageData: finalImageData,
            alphaMap,
            position,
            originalSpatialScore,
            processedSpatialScore: finalProcessedSpatialScore,
            originalNearBlackRatio
        });

        if (recalibrated) {
            finalImageData = recalibrated.imageData;
            alphaGain = recalibrated.alphaGain;
            finalProcessedSpatialScore = recalibrated.processedSpatialScore;
            finalProcessedGradientScore = computeRegionGradientCorrelation({
                imageData: finalImageData,
                alphaMap,
                region: {
                    x: position.x,
                    y: position.y,
                    size: position.width
                }
            });
            suppressionGain = recalibrated.suppressionGain;
            source = source === 'adaptive' ? 'adaptive+gain' : `${source}+gain`;
        }
    }
    if (debugTimingsEnabled) {
        debugTimings.recalibrationMs = nowMs() - recalibrationStartedAt;
    }

    let previewEdgeCleanupElapsedMs = 0;
    const applyPreviewEdgeCleanup = () => {
        const previewEdgeStartedAt = nowMs();
        const previewEdgeRefined = refinePreviewResidualEdge({
            sourceImageData: finalImageData,
            alphaMap,
            position,
            source,
            baselineSpatialScore: finalProcessedSpatialScore,
            baselineGradientScore: finalProcessedGradientScore,
            allowAggressivePresets: usePreviewAnchorFastCleanup
        });
        previewEdgeCleanupElapsedMs += nowMs() - previewEdgeStartedAt;

        if (!previewEdgeRefined) {
            return false;
        }

        finalImageData = previewEdgeRefined.imageData;
        finalProcessedSpatialScore = previewEdgeRefined.spatialScore;
        finalProcessedGradientScore = previewEdgeRefined.gradientScore;
        suppressionGain = originalSpatialScore - finalProcessedSpatialScore;
        source = `${source}+edge-cleanup`;
        return true;
    };

    const subpixelStartedAt = nowMs();
    if (
        !usePreviewAnchorFastCleanup &&
        finalProcessedSpatialScore <= 0.3 &&
        finalProcessedGradientScore >= OUTLINE_REFINEMENT_THRESHOLD
    ) {
        const originalNearBlackRatio = calculateNearBlackRatio(finalImageData, position);
        const baselineShift = templateWarp ?? { dx: 0, dy: 0, scale: 1 };
        const refined = refineSubpixelOutline({
            sourceImageData: finalImageData,
            alphaMap,
            position,
            alphaGain,
            originalNearBlackRatio,
            baselineSpatialScore: finalProcessedSpatialScore,
            baselineGradientScore: finalProcessedGradientScore,
            baselineShift,
            minGain: OUTLINE_REFINEMENT_MIN_GAIN,
            shiftCandidates: SUBPIXEL_REFINE_SHIFTS,
            scaleCandidates: SUBPIXEL_REFINE_SCALES,
            minGradientImprovement: 0.04,
            maxSpatialDrift: 0.08
        });

        if (refined) {
            finalImageData = refined.imageData;
            alphaMap = refined.alphaMap;
            alphaGain = refined.alphaGain;
            finalProcessedSpatialScore = refined.spatialScore;
            finalProcessedGradientScore = refined.gradientScore;
            suppressionGain = originalSpatialScore - finalProcessedSpatialScore;
            source = `${source}+subpixel`;
            subpixelShift = refined.shift;
        }
    }
    if (debugTimingsEnabled) {
        debugTimings.subpixelRefinementMs = nowMs() - subpixelStartedAt;
    }

    let previewEdgeCleanupPassCount = 0;
    while (previewEdgeCleanupPassCount < PREVIEW_EDGE_CLEANUP_MAX_APPLIED_PASSES) {
        if (!applyPreviewEdgeCleanup()) {
            break;
        }
        previewEdgeCleanupPassCount++;
    }
    if (debugTimingsEnabled) {
        debugTimings.previewEdgeCleanupMs = previewEdgeCleanupElapsedMs;
        debugTimings.totalMs = nowMs() - totalStartedAt;
    }

    return {
        imageData: finalImageData,
        meta: createWatermarkMeta({
            position,
            config,
            adaptiveConfidence,
            originalSpatialScore,
            originalGradientScore,
            processedSpatialScore: finalProcessedSpatialScore,
            processedGradientScore: finalProcessedGradientScore,
            suppressionGain,
            templateWarp,
            alphaGain,
            passCount,
            attemptedPassCount,
            passStopReason,
            passes,
            source,
            decisionTier,
            applied: true,
            subpixelShift,
            selectionDebug: createSelectionDebugSummary({
                selectedTrial,
                selectionSource: initialSelection.source,
                initialConfig: resolvedConfig,
                initialPosition: calculateWatermarkPosition(
                    originalImageData.width,
                    originalImageData.height,
                    resolvedConfig
                )
            })
        }),
        debugTimings
    };
}
