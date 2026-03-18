import { createClient } from '@supabase/supabase-js'
import { BetaAnalyticsDataClient } from '@google-analytics/data'
import { OAuth2Client } from 'google-auth-library'
import { fetchWeeklyData } from '../../lib/ga/fetchWeeklyData.js'
import { detectConversionEvent } from '../../lib/ga/detectConversionEvent.js'
import { detectEnquiryPage } from '../../lib/ga/detectEnquiryPage.js'
import type { IncomingMessage, ServerResponse } from 'http'

// ─── Supabase admin client ────────────────────────────────────────────────────

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ─── Safe null response ───────────────────────────────────────────────────────

const SAFE_NULL = {
    conversionEvent: null,
    conversionConfidence: 0,
    enquiryPage: null,
    enquiryConfidence: 0,
    analysisReady: false
}

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

/**
 * Fetch top 20 pages by path (not title) for the last 30 days.
 * Used exclusively by detectEnquiryPage which needs pagePath, not pageTitle.
 */
async function fetchTopPagePaths(
    propertyId: string,
    googleAccessToken: string
): Promise<{ path: string; views: number }[]> {
    const authClient = new OAuth2Client(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
    )
    authClient.setCredentials({ access_token: googleAccessToken })
    const gaClient = new BetaAnalyticsDataClient({ authClient } as never)

    const property = propertyId.startsWith('properties/')
        ? propertyId
        : `properties/${propertyId}`

    const [report] = await gaClient.runReport({
        property,
        dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
        dimensions: [{ name: 'pagePath' }],
        metrics: [{ name: 'screenPageViews' }],
        orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
        limit: 20
    })

    return (report.rows ?? []).map(row => ({
        path: row.dimensionValues?.[0]?.value ?? '',
        views: parseInt(row.metricValues?.[0]?.value ?? '0', 10)
    }))
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(
    req: IncomingMessage & { headers: Record<string, string | undefined> },
    res: ServerResponse & { status: (c: number) => typeof res; json: (body: unknown) => void }
): Promise<void> {
    // 1) Authenticate
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

    // Prepare variables accessible in catch block
    let propertyId: string | null = null

    try {
        // 2) Get selected property
        const { data: propertyRows } = await supabase
            .from('user_properties')
            .select('property_id')
            .eq('user_id', user.id)
            .limit(1)

        propertyId = propertyRows?.[0]?.property_id as string | undefined | null || null

        if (!propertyId) {
            res.status(200).json({
                propertySelectionRequired: true
            })
            return
        }

        // 3) Get Google refresh token and exchange for access token
        const { data: connection } = await supabase
            .from('google_connections')
            .select('refresh_token')
            .eq('user_id', user.id)
            .limit(1)
            .maybeSingle()

        if (!connection?.refresh_token) {
            res.status(400).json({ error: 'No Google connection' })
            return
        }

        const googleAccessToken = await refreshGoogleToken(connection.refresh_token)

        // 4) Fetch 30-day GA data (sessions + candidate events) and top page paths in parallel
        const [weeklyData, topPagePaths] = await Promise.all([
            fetchWeeklyData({
                propertyId,
                accessToken: googleAccessToken,
                startDate: '30daysAgo',
                endDate: 'today'
            }),
            fetchTopPagePaths(propertyId, googleAccessToken)
        ])

        console.log('[initialise-analysis] Sessions (30d):', weeklyData.sessions)
        console.log('[initialise-analysis] Candidate Events:', weeklyData.candidateEvents)
        console.log('[initialise-analysis] Top Page Paths:', topPagePaths)

        // 5) Detect conversion event
        const conversionResult = detectConversionEvent({
            candidateEvents: weeklyData.candidateEvents,
            sessionsLast30Days: weeklyData.sessions,
            enquiryPagePath: undefined
        })

        // 6) Detect enquiry page
        let enquiryResult = detectEnquiryPage({ pages: topPagePaths })

        if (!enquiryResult.selectedPage) {
            const fallback = topPagePaths.find(p =>
                /contact|book|booking|quote|enquiry|get-in-touch/i.test(p.path)
            )

            if (fallback) {
                enquiryResult = {
                    selectedPage: fallback.path,
                    confidence: 60
                }
            }
        }

        console.log('[initialise-analysis] Conversion detection:', conversionResult)
        console.log('[initialise-analysis] Enquiry detection:', enquiryResult)

        // 7) Upsert settings
        const analysisReady =
            conversionResult.confidence >= 40 ||
            enquiryResult.confidence >= 30

        const { data: upsertData, error: upsertError } = await supabase
            .from('user_settings')
            .upsert(
                {
                    user_id: user.id,
                    property_id: propertyId,
                    conversion_event: conversionResult.selectedEvent,
                    conversion_confidence: conversionResult.confidence,
                    enquiry_page_path: enquiryResult.selectedPage,
                    enquiry_confidence: enquiryResult.confidence,
                    analysis_ready: analysisReady,
                    configured_at: new Date().toISOString()
                },
                { onConflict: 'user_id,property_id' }
            )

        console.log('[initialise-analysis] Upsert result:', {
            upsertData,
            upsertError
        })

        if (upsertError) {
            throw upsertError
        }

        // 8) Return result
        res.status(200).json({
            conversionEvent: conversionResult.selectedEvent,
            conversionConfidence: conversionResult.confidence,
            enquiryPage: enquiryResult.selectedPage,
            enquiryConfidence: enquiryResult.confidence,
            analysisReady
        })

    } catch (err) {
        console.error('[initialise-analysis] Error:', err)

        const errorDetails = (err as any)?.details || (err as any)?.message || '';
        if (errorDetails.includes('Google Analytics Data API')) {
            res.status(500).json({ error: "GA_DATA_API_DISABLED" })
            return
        }

        // 9) Attempt to store safe nulls so user isn't stuck
        if (propertyId) {
            try {
                const { error: fallbackError } = await supabase
                    .from('user_settings')
                    .upsert(
                        {
                            user_id: user.id,
                            property_id: propertyId,
                            conversion_event: null,
                            conversion_confidence: 0,
                            enquiry_page_path: null,
                            enquiry_confidence: 0,
                            analysis_ready: false,
                            configured_at: new Date().toISOString()
                        },
                        { onConflict: 'user_id,property_id' }
                    )

                console.error('[initialise-analysis] Fallback upsert result:', fallbackError)
            } catch (fallbackErr) {
                console.error('[initialise-analysis] Fallback failed:', fallbackErr)
            }
        }

        res.status(200).json(SAFE_NULL)
    }
}
