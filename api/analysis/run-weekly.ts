import { createClient } from '@supabase/supabase-js'
import { BetaAnalyticsDataClient } from '@google-analytics/data'
import { OAuth2Client } from 'google-auth-library'
import { fetchWeeklyData } from '../../lib/ga/fetchWeeklyData.js'
import { evaluateIntegrity } from '../../lib/analysis/evaluateIntegrity.js'
import { computeSignals } from '../../lib/analysis/computeSignals.js'
import { classifyState } from '../../lib/analysis/classifyState.js'
import { generateWeeklyNarrative } from '../../lib/analysis/buildInsight.js'
import { buildAIPayload } from '../../lib/analysis/buildAIPayload.js'
import { composeWeeklyEmail } from '../../lib/analysis/composeWeeklyEmail.js'
import type { IncomingMessage, ServerResponse } from 'http'

// ─── Supabase admin client ────────────────────────────────────────────────────

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function refreshGoogleToken(refreshToken: string): Promise<string> {
    const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            client_id: process.env.GOOGLE_CLIENT_ID,
            client_secret: process.env.GOOGLE_CLIENT_SECRET,
            refresh_token: refreshToken,
            grant_type: 'refresh_token'
        })
    })
    const data = await res.json() as { access_token: string }
    return data.access_token
}

// FORMAT: YYYY-MM-DD
function getDateOffset(days: number): string {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() - days)
    return d.toISOString().split('T')[0]
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(
    req: IncomingMessage & { headers: Record<string, string | undefined> },
    res: ServerResponse & { status: (c: number) => typeof res; json: (body: unknown) => void }
): Promise<void> {

    // 1) Authenticate user via Bearer token
    console.log('[run-weekly] Handler triggered')
    const supabaseToken = req.headers.authorization?.replace('Bearer ', '')
    if (!supabaseToken) {
        res.status(401).json({ error: 'No session' })
        return
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(supabaseToken)
    if (authError || !user) {
        res.status(401).json({ error: 'Invalid user' })
        return
    }

    try {
        // 2) Fetch user_settings
        const { data: settings } = await supabase
            .from('user_settings')
            .select('*')
            .eq('user_id', user.id)
            .limit(1)
            .maybeSingle()

        if (!settings || !settings.analysis_ready || !settings.property_id) {
            res.status(400).json({ error: 'ANALYSIS_NOT_READY' })
            return
        }

        // Get Google refresh token
        const { data: connection } = await supabase
            .from('google_connections')
            .select('refresh_token')
            .eq('user_id', user.id)
            .limit(1)
            .maybeSingle()

        if (!connection?.refresh_token) {
            res.status(400).json({ error: 'NO_GOOGLE_CONNECTION' })
            return
        }

        const googleAccessToken = await refreshGoogleToken(connection.refresh_token)

        // 3) Fetch Current week and Previous week sequentially to avoid GA quota limits
        const currentStart = getDateOffset(6)
        const currentEnd = getDateOffset(0)

        const currentWeekData = await fetchWeeklyData({
            propertyId: settings.property_id,
            accessToken: googleAccessToken,
            startDate: currentStart,
            endDate: currentEnd,
            conversionEvent: settings.conversion_event || undefined,
            enquiryPagePath: settings.enquiry_page_path || undefined
        })

        const previousStart = getDateOffset(13)
        const previousEnd = getDateOffset(7)

        const previousWeekData = await fetchWeeklyData({
            propertyId: settings.property_id,
            accessToken: googleAccessToken,
            startDate: previousStart,
            endDate: previousEnd,
            conversionEvent: settings.conversion_event || undefined,
            enquiryPagePath: settings.enquiry_page_path || undefined
        })

        console.log('[run-weekly] GA Data fetched:', {
            currentSessions: currentWeekData.sessions,
            currentConversions: currentWeekData.rawSubmissionUsers,
            previousSessions: previousWeekData.sessions
        })

        // 4) Values for classification and insight
        const currentSessions = currentWeekData.sessions
        const currentConversions = currentWeekData.rawSubmissionUsers
        const currentIntentUsers = currentWeekData.intentUsers
        const currentTrafficSources = currentWeekData.trafficSources
        const currentIntentSources = currentWeekData.intentSources

        const conversionIntegrity = evaluateIntegrity({
            sessions: currentSessions,
            rawSubmissions: currentConversions
        })

        console.log('[run-weekly] Integrity evaluated:', conversionIntegrity)

        const intentRate = currentSessions > 0 ? currentIntentUsers / currentSessions : 0

        // A) Insert snapshot into weekly_snapshots
        const currentSnapshotData = {
            user_id: user.id,
            property_id: settings.property_id,
            week_start_date: currentStart,
            week_end_date: currentEnd,
            sessions: currentSessions,

            new_users: currentWeekData.newUsers,
            returning_users: currentWeekData.returningUsers,

            traffic_sources: currentTrafficSources,

            intent_users: currentIntentUsers,
            returning_intent_users: currentWeekData.returningIntentUsers ?? 0,
            intent_sources: currentIntentSources,
            intent_rate: intentRate,

            raw_submission_users: currentConversions,

            conversion_integrity: conversionIntegrity
        }

        console.log('[run-weekly] Snapshot data prepared:', {
            week_start_date: currentSnapshotData.week_start_date,
            sessions: currentSnapshotData.sessions,
            raw_submissions: currentSnapshotData.raw_submission_users,
            returning_intent: currentSnapshotData.returning_intent_users,
            integrity: currentSnapshotData.conversion_integrity
        })

        const { error: snapshotError } = await supabase.from('weekly_snapshots').upsert(
            currentSnapshotData,
            { onConflict: 'user_id,property_id,week_start_date' }
        )

        if (snapshotError) {
            console.error('[run-weekly] Snapshot upsert failed:', snapshotError)
            throw snapshotError
        }
        console.log('[run-weekly] Snapshot upsert success')

        // B) Fetch last 5 snapshots
        const { data: history } = await supabase
            .from('weekly_snapshots')
            .select('*')
            .eq('user_id', user.id)
            .eq('property_id', settings.property_id)
            .order('week_start_date', { ascending: false })
            .limit(5)

        const DEBUG_MODE = false

        let targetWeek = currentSnapshotData
        let previousWeeks: any[] = []

        if (history && history.length > 0) {
            targetWeek = history[0]
            previousWeeks = history
                .slice(1, 5) // ensure maximum 4 previous weeks
                .filter(Boolean)
        }

        if (DEBUG_MODE) {
            targetWeek = {
                ...targetWeek,
                sessions: 200,
                intent_rate: 0.25,
                conversion_integrity: 'low',
                raw_submission_users: 30
            }
            previousWeeks = [
                { sessions: 120, intent_rate: 0.15 },
                { sessions: 115, intent_rate: 0.14 },
                { sessions: 118, intent_rate: 0.16 },
                { sessions: 122, intent_rate: 0.15 }
            ] as any[]
        }

        // C) Compute signals
        const signals = computeSignals(targetWeek, previousWeeks)

        const focusType = classifyState(
            targetWeek.conversion_integrity as "healthy" | "mixed" | "low",
            signals.visibilityDirection,
            signals.intentStrength,
            signals.sourceContrast,
            signals.hasSufficientHistory
        )

        if (DEBUG_MODE) {
            console.log('DEBUG FOCUS:', focusType)
        }

        // 6) Run narrative building
        const insight = generateWeeklyNarrative(focusType, signals, targetWeek)

        if (DEBUG_MODE) {
            console.log('DEBUG NARRATIVE:', insight)
        }

        // 7) AI Report Orchestration
        const rollingSessions = previousWeeks.length >= 4
            ? previousWeeks.slice(0, 4).reduce((sum: number, w: any) => sum + w.sessions, 0) / 4
            : 0
        const rollingIntent = previousWeeks.length >= 4
            ? previousWeeks.slice(0, 4).reduce((sum: number, w: any) => sum + w.intent_rate, 0) / 4
            : 0

        // Check if report already exists for this week
        const { data: existingReport } = await supabase
            .from('weekly_reports')
            .select('*')
            .eq('user_id', user.id)
            .eq('property_id', settings.property_id)
            .eq('week_start_date', currentStart)
            .limit(1)
            .maybeSingle()

        let aiReport = existingReport

        if (!aiReport) {
            const aiPayload = buildAIPayload({
                weekStart: currentStart,
                weekEnd: currentEnd,
                focusType,
                integrityStatus: targetWeek.conversion_integrity,
                sessions: targetWeek.sessions,
                rollingSessions,
                visibilityChange: signals.visibilityChange,
                intentRate: targetWeek.intent_rate,
                rollingIntent,
                intentStrength: signals.intentStrength,
                structuredSummary: insight,
                trafficSources: currentWeekData.trafficSources,
                intentSources: currentWeekData.intentSources
            })

            try {
                console.log('[run-weekly] Composing AI report...')
                const composed = await composeWeeklyEmail(aiPayload)
                console.log('[run-weekly] AI report composed successfully')

                // Store report
                const { data: savedReport, error: upsertError } = await supabase
                    .from('weekly_reports')
                    .upsert({
                        user_id: user.id,
                        property_id: settings.property_id,
                        week_start_date: currentStart,
                        focus_type: focusType,
                        integrity_status: targetWeek.conversion_integrity,
                        sessions: targetWeek.sessions,
                        intent_rate: targetWeek.intent_rate,
                        narrative_json: insight,
                        email_subject: composed.subject,
                        email_body: composed.body
                    }, { onConflict: 'user_id,property_id,week_start_date' })
                    .select()
                    .limit(1)
                    .maybeSingle()

                if (upsertError) throw upsertError
                aiReport = savedReport
            } catch (aiErr) {
                console.error('[run-weekly] AI Orchestration failed:', aiErr)
            }
        }

        if (DEBUG_MODE) {
            console.log('DEBUG AI REPORT (FROM DB):', aiReport)
        }

        // 8) Return
        res.status(200).json({
            insight: aiReport?.narrative_json || insight,
            classification: {
                focusType: aiReport?.focus_type || focusType,
                signals: signals
            },
            conversionIntegrity: aiReport?.conversion_integrity || conversionIntegrity,
            aiReport: aiReport ? {
                subject: aiReport.email_subject,
                body: aiReport.email_body
            } : null
        })

    } catch (err) {
        console.error('[run-weekly] Error:', err)
        res.status(500).json({ error: 'ANALYSIS_FAILED' })
    }
}
