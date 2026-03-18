// ─── Types ────────────────────────────────────────────────────────────────────

export type PrimaryConstraint =
    | 'visibility'
    | 'progression'
    | 'conversion_friction'
    | 'stable'
    | 'insufficient_data'

export type StrengthSignal =
    | 'strong_conversion'
    | 'strong_intent'
    | 'strong_channel'
    | 'none'

export interface ChannelData {
    channel: string
    sessions: number
}

export interface ClassifyBottleneckParams {
    sessions: number
    conversions: number
    enquiryPageViews: number
    channels: ChannelData[]
}

export interface BottleneckMetrics {
    conversionRate: number
    intentRate: number
    conversionFromIntent: number
    dominantChannel?: string
    dominantChannelPercent?: number
}

export interface ClassifyBottleneckResult {
    primaryConstraint: PrimaryConstraint
    strengthSignal: StrengthSignal
    metrics: BottleneckMetrics
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function r4(n: number): number {
    return Math.round(n * 10_000) / 10_000
}

function dominantChannel(
    channels: ChannelData[],
    totalSessions: number
): { channel: string; percent: number } | null {
    if (channels.length === 0 || totalSessions === 0) return null

    const top = channels.reduce((a, b) => (a.sessions >= b.sessions ? a : b))
    return {
        channel: top.channel,
        percent: r4(top.sessions / totalSessions)
    }
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function classifyBottleneck({
    sessions,
    conversions,
    enquiryPageViews,
    channels
}: ClassifyBottleneckParams): ClassifyBottleneckResult {
    // 1) Insufficient data
    if (sessions < 20) {
        return {
            primaryConstraint: 'insufficient_data',
            strengthSignal: 'none',
            metrics: {
                conversionRate: 0,
                intentRate: 0,
                conversionFromIntent: 0
            }
        }
    }

    // 2) Derived metrics
    const conversionRate = r4(conversions / sessions)
    const intentRate = r4(enquiryPageViews / sessions)
    const conversionFromIntent = r4(
        enquiryPageViews > 0 ? conversions / enquiryPageViews : 0
    )

    const dom = dominantChannel(channels, sessions)

    const metrics: BottleneckMetrics = {
        conversionRate,
        intentRate,
        conversionFromIntent,
        ...(dom ? { dominantChannel: dom.channel, dominantChannelPercent: dom.percent } : {})
    }

    // 3–5) Primary constraint
    let primaryConstraint: PrimaryConstraint

    if (sessions < 100) {
        primaryConstraint = 'visibility'
    } else if (conversions === 0) {
        primaryConstraint = intentRate >= 0.15 ? 'conversion_friction' : 'progression'
    } else {
        if (intentRate < 0.10) {
            primaryConstraint = 'progression'
        } else if (conversionFromIntent < 0.20) {
            primaryConstraint = 'conversion_friction'
        } else {
            primaryConstraint = 'stable'
        }
    }

    // 6) Strength signal
    let strengthSignal: StrengthSignal

    if (conversionRate >= 0.40) {
        strengthSignal = 'strong_conversion'
    } else if (intentRate >= 0.25) {
        strengthSignal = 'strong_intent'
    } else if (dom && dom.percent >= 0.40) {
        strengthSignal = 'strong_channel'
    } else {
        strengthSignal = 'none'
    }

    return { primaryConstraint, strengthSignal, metrics }
}
