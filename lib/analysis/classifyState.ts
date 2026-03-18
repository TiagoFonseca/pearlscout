export type FocusType =
    | 'integrity'
    | 'visibility'
    | 'progression'
    | 'opportunity'
    | 'source_contrast'
    | 'stable'

export function classifyState(
    integrityStatus: 'healthy' | 'mixed' | 'low',
    visibilityDirection: 'up' | 'down' | 'stable',
    intentStrength: 'weak' | 'moderate' | 'strong',
    sourceContrast: boolean,
    hasSufficientHistory: boolean
): FocusType {
    if (integrityStatus === 'low') {
        return 'integrity'
    }

    if (!hasSufficientHistory) {
        return 'stable'
    }

    if (visibilityDirection === 'down') {
        return 'visibility'
    }

    if (intentStrength === 'weak') {
        return 'progression'
    }

    if (sourceContrast) {
        return 'source_contrast'
    }

    if (
        visibilityDirection === 'up' &&
        intentStrength === 'strong'
    ) {
        return 'opportunity'
    }

    return 'stable'
}
