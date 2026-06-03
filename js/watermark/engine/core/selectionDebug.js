function normalizeConfig(config) {
    if (!config || typeof config !== 'object') return null;
    const { logoSize, marginRight, marginBottom } = config;
    if (![logoSize, marginRight, marginBottom].every(Number.isFinite)) {
        return null;
    }
    return { logoSize, marginRight, marginBottom };
}

function normalizePosition(position) {
    if (!position || typeof position !== 'object') return null;
    const { x, y, width, height } = position;
    if (![x, y, width, height].every(Number.isFinite)) {
        return null;
    }
    return { x, y, width, height };
}

export function createSelectionDebugSummary({
    selectedTrial,
    selectionSource = null,
    initialConfig = null,
    initialPosition = null
} = {}) {
    if (!selectedTrial) return null;

    const candidateSource = typeof selectionSource === 'string' && selectionSource
        ? selectionSource
        : (typeof selectedTrial.source === 'string' ? selectedTrial.source : null);

    return {
        candidateSource,
        initialConfig: normalizeConfig(initialConfig),
        initialPosition: normalizePosition(initialPosition),
        finalConfig: normalizeConfig(selectedTrial.config),
        finalPosition: normalizePosition(selectedTrial.position),
        texturePenalty: Number.isFinite(selectedTrial.texturePenalty) ? selectedTrial.texturePenalty : null,
        tooDark: selectedTrial.tooDark === true,
        tooFlat: selectedTrial.tooFlat === true,
        hardReject: selectedTrial.hardReject === true,
        usedCatalogVariant: selectedTrial.provenance?.catalogVariant === true,
        usedSizeJitter: selectedTrial.provenance?.sizeJitter === true,
        usedLocalShift: selectedTrial.provenance?.localShift === true,
        usedAdaptive: selectedTrial.provenance?.adaptive === true,
        usedPreviewAnchor: selectedTrial.provenance?.previewAnchor === true
    };
}
