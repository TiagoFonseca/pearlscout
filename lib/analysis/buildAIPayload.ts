export type AIPayload = {
    meta: {
        week_start: string
        week_end: string
        focus_type: string
        integrity_status: string
    }
    metrics: {
        sessions: number
        rolling_sessions: number
        visibility_change_pct: number
        intent_rate: number
        rolling_intent_rate: number
        intent_strength: string
    }
    deterministic_summary: {
        visibility: string
        intent: string
        submissions: string
        reliability?: string
    }
    traffic_sources: Record<string, number>
    intent_sources: Record<string, number>
    constraints: {
        single_focus: boolean
        no_speculation: boolean
        no_psychology: boolean
        no_new_recommendations: boolean
        tone: string
    }
}

export function buildAIPayload({
    weekStart,
    weekEnd,
    focusType,
    integrityStatus,
    sessions,
    rollingSessions,
    visibilityChange,
    intentRate,
    rollingIntent,
    intentStrength,
    structuredSummary,
    trafficSources,
    intentSources
}: {
    weekStart: string
    weekEnd: string
    focusType: string
    integrityStatus: string
    sessions: number
    rollingSessions: number
    visibilityChange: number
    intentRate: number
    rollingIntent: number
    intentStrength: string
    structuredSummary: any
    trafficSources: Record<string, number>
    intentSources: Record<string, number>
}): AIPayload {
    return {
        meta: {
            week_start: weekStart,
            week_end: weekEnd,
            focus_type: focusType,
            integrity_status: integrityStatus
        },
        metrics: {
            sessions,
            rolling_sessions: rollingSessions,
            visibility_change_pct: visibilityChange,
            intent_rate: intentRate,
            rolling_intent_rate: rollingIntent,
            intent_strength: intentStrength
        },
        deterministic_summary: structuredSummary,
        traffic_sources: trafficSources,
        intent_sources: intentSources,
        constraints: {
            single_focus: true,
            no_speculation: true,
            no_psychology: true,
            no_new_recommendations: true,
            tone: "calm, analytical, conservative"
        }
    }
}
