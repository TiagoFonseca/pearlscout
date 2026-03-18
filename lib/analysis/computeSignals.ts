export type SignalState = {
    visibilityChange: number
    intentChange: number | null
    visibilityDirection: 'up' | 'down' | 'stable'
    intentDirection: 'up' | 'down' | 'stable'
    intentStrength: 'weak' | 'moderate' | 'strong'
    dominantTrafficSource: string | null
    dominantIntentSource: string | null
    sourceContrast: boolean
    hasSufficientHistory: boolean
}

function getDominantSource(sources: Record<string, number> | null | undefined): string | null {
    if (!sources) return null

    let topSource: string | null = null
    let max = 0

    for (const [source, count] of Object.entries(sources)) {
        if (count > max) {
            max = count
            topSource = source
        }
    }

    return topSource
}

export function computeSignals(
    snapshot: any,
    previousWeeks: any[] = []
): SignalState {

    const dominantTrafficSource = getDominantSource(
        snapshot.traffic_sources ?? snapshot.trafficSources
    )

    const dominantIntentSource = getDominantSource(
        snapshot.intent_sources ?? snapshot.intentSources
    )

    const sourceContrast =
        dominantTrafficSource !== null &&
        dominantIntentSource !== null &&
        dominantTrafficSource !== dominantIntentSource

    // ─── 1. Visibility Trend ──────────────────────────────────────────────────
    const currentSessions = snapshot.sessions || 0
    const baselineSessions = snapshot.rolling_avg_sessions || 0

    let visibilityDirection: "up" | "down" | "stable" = "stable"
    let visibilityChange = 0

    if (baselineSessions > 0) {
        visibilityChange = (currentSessions - baselineSessions) / baselineSessions

        if (visibilityChange >= 0.15) {
            visibilityDirection = "up"
        }
        else if (visibilityChange <= -0.15) {
            visibilityDirection = "down"
        }
    }

    // ─── 2. Intent Trend ──────────────────────────────────────────────────────
    const currentIntentRate =
        snapshot.sessions > 0
            ? snapshot.intent_users / snapshot.sessions
            : 0

    const baselineIntentRate =
        snapshot.rolling_avg_sessions > 0
            ? snapshot.rolling_avg_intent_users / snapshot.rolling_avg_sessions
            : 0

    let intentDirection: "up" | "down" | "stable" = "stable"
    let intentChange = 0

    if (baselineIntentRate > 0) {
        intentChange = (currentIntentRate - baselineIntentRate) / baselineIntentRate

        if (intentChange >= 0.15) {
            intentDirection = "up"
        }
        else if (intentChange <= -0.15) {
            intentDirection = "down"
        }
    }

    // ─── 3. Intent Strength (Interpretation) ──────────────────────────────────
    let intentStrength: 'weak' | 'moderate' | 'strong' = 'moderate'

    const weakAbsolute = currentIntentRate < 0.10
    const weakRelative = intentDirection === "down"

    const strongAbsolute = currentIntentRate >= 0.20
    const strongRelative = intentDirection === "up"

    if (weakAbsolute || weakRelative) intentStrength = 'weak'
    else if (strongAbsolute || strongRelative) intentStrength = 'strong'

    const hasSufficientHistory = baselineSessions > 0 || previousWeeks.length >= 4

    return {
        visibilityChange,
        intentChange,
        visibilityDirection,
        intentDirection,
        intentStrength,
        dominantTrafficSource,
        dominantIntentSource,
        sourceContrast,
        hasSufficientHistory
    }
}
