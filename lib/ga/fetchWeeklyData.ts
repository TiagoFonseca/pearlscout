import { BetaAnalyticsDataClient } from '@google-analytics/data'
import { OAuth2Client } from 'google-auth-library'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FetchWeeklyDataParams {
    /** GA4 property ID, e.g. "properties/123456789" or just "123456789" */
    propertyId: string
    /** User's Google OAuth access token (retrieved from google_connections) */
    accessToken: string
    /** Inclusive start date, e.g. "2024-01-01" */
    startDate: string
    /** Inclusive end date, e.g. "2024-01-07" */
    endDate: string
    /** GA4 event name to treat as a conversion, e.g. "generate_lead" */
    conversionEvent?: string
    /** Partial page path to identify enquiry pages, e.g. "/contact" */
    enquiryPagePath?: string
}

export interface WeeklyData {
    sessions: number
    newUsers: number
    returningUsers: number
    trafficSources: Record<string, number>
    intentUsers: number
    returningIntentUsers: number
    intentSources: Record<string, number>
    rawSubmissionUsers: number
    candidateEvents: Array<{ name: string; count: number }>
}

// ─── Client factory ───────────────────────────────────────────────────────────

function makeClient(accessToken: string): BetaAnalyticsDataClient {
    const authClient = new OAuth2Client(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
    )
    authClient.setCredentials({ access_token: accessToken })
    return new BetaAnalyticsDataClient({ authClient } as never)
}

/** Normalise a GA property ID to the "properties/XXXXXXX" format */
function propertyName(propertyId: string): string {
    return propertyId.startsWith('properties/')
        ? propertyId
        : `properties/${propertyId}`
}

/** Safely parse an integer from a GA metric value string */
function int(value: string | null | undefined): number {
    const n = parseInt(value ?? '0', 10)
    return isNaN(n) ? 0 : n
}

// ─── Helper queries ───────────────────────────────────────────────────────────

/**
 * A) Total sessions in [startDate, endDate].
 */
async function fetchSessions(
    client: BetaAnalyticsDataClient,
    property: string,
    startDate: string,
    endDate: string
): Promise<number> {
    const [res] = await client.runReport({
        property,
        dateRanges: [{ startDate, endDate }],
        metrics: [{ name: 'sessions' }]
    })
    return int(res.rows?.[0]?.metricValues?.[0]?.value)
}

/**
 * B) New vs Returning users breakdown in [startDate, endDate].
 */
async function fetchVisitorBreakdown(
    client: BetaAnalyticsDataClient,
    property: string,
    startDate: string,
    endDate: string
): Promise<{ newUsers: number; returningUsers: number }> {

    const [res] = await client.runReport({
        property,
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: 'newVsReturning' }],
        metrics: [{ name: 'activeUsers' }]
    })

    let newUsers = 0
    let returningUsers = 0

    for (const row of res.rows ?? []) {
        const type = row.dimensionValues?.[0]?.value
        const count = int(row.metricValues?.[0]?.value)

        if (type === 'new') newUsers = count
        if (type === 'returning') returningUsers = count
    }

    return { newUsers, returningUsers }
}

/**
 * C) Top 20 events by count over the last 30 days.
 *    Used to surface candidate conversion events to the user / LLM.
 */
async function fetchEventCountsLast30Days(
    client: BetaAnalyticsDataClient,
    property: string
): Promise<Array<{ name: string; count: number }>> {
    const [res] = await client.runReport({
        property,
        dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
        dimensions: [{ name: 'eventName' }],
        metrics: [{ name: 'eventCount' }],
        orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
        limit: 20
    })
    return (res.rows ?? []).map(row => ({
        name: row.dimensionValues?.[0]?.value ?? '',
        count: int(row.metricValues?.[0]?.value)
    }))
}

/**
 * D) Unique user count for a specific conversion event in [startDate, endDate].
 */
async function fetchEventCountForWeek(
    client: BetaAnalyticsDataClient,
    property: string,
    startDate: string,
    endDate: string,
    conversionEvent: string
): Promise<{ rawUsers: number }> {
    const [res] = await client.runReport({
        property,
        dateRanges: [{ startDate, endDate }],
        metrics: [{ name: 'totalUsers' }],
        dimensionFilter: {
            filter: {
                fieldName: 'eventName',
                stringFilter: { matchType: 'EXACT', value: conversionEvent }
            }
        }
    })

    return {
        rawUsers: int(res.rows?.[0]?.metricValues?.[0]?.value)
    }
}

/**
 * E) Top 5 traffic sources in [startDate, endDate].
 */
async function fetchTrafficSources(
    client: BetaAnalyticsDataClient,
    property: string,
    startDate: string,
    endDate: string
): Promise<Record<string, number>> {

    const [res] = await client.runReport({
        property,
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: 'sessionSource' }],
        metrics: [{ name: 'sessions' }],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: 3
    })

    const sources: Record<string, number> = {}

    for (const row of res.rows ?? []) {
        let source = (row.dimensionValues?.[0]?.value ?? '(direct)').toLowerCase()

        if (source === '(not set)' || source === '(direct)') {
            source = 'direct'
        }

        if (source.includes('instagram') || source === 'ig' || source === 'l.ig') source = 'instagram'
        if (source.includes('facebook')) source = 'facebook'

        const count = int(row.metricValues?.[0]?.value)

        sources[source] = (sources[source] ?? 0) + count
    }

    return sources
}

/**
 * F) Unique active users for pages whose path contains enquiryPagePath.
 */
async function fetchIntentUsers(
    client: BetaAnalyticsDataClient,
    property: string,
    startDate: string,
    endDate: string,
    enquiryPagePath: string
): Promise<{ intentUsers: number; returningIntentUsers: number }> {
    const [res] = await client.runReport({
        property,
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: 'newVsReturning' }],
        metrics: [{ name: 'activeUsers' }],
        dimensionFilter: {
            filter: {
                fieldName: 'pagePath',
                stringFilter: { matchType: 'CONTAINS', value: enquiryPagePath }
            }
        }
    })
    
    let intentUsers = 0
    let returningIntentUsers = 0
    
    for (const row of res.rows ?? []) {
        const type = row.dimensionValues?.[0]?.value
        const count = int(row.metricValues?.[0]?.value)
        intentUsers += count
        if (type === 'returning') returningIntentUsers = count
    }

    return { intentUsers, returningIntentUsers }
}

/**
 * G) Breakdown of traffic sources for users visiting enquiry pages in [startDate, endDate].
 */
async function fetchIntentSources(
    client: BetaAnalyticsDataClient,
    property: string,
    startDate: string,
    endDate: string,
    enquiryPagePath: string
): Promise<Record<string, number>> {

    const [res] = await client.runReport({
        property,
        dateRanges: [{ startDate, endDate }],
        dimensions: [
            { name: 'sessionSource' },
            { name: 'pagePath' }
        ],
        metrics: [{ name: 'activeUsers' }],
        dimensionFilter: {
            filter: {
                fieldName: 'pagePath',
                stringFilter: { matchType: 'CONTAINS', value: enquiryPagePath }
            }
        }
    })

    const sources: Record<string, number> = {}

    for (const row of res.rows ?? []) {
        let source = (row.dimensionValues?.[0]?.value ?? '(direct)').toLowerCase()

        if (source === '(not set)' || source === '(direct)') {
            source = 'direct'
        }

        if (source.includes('instagram') || source === 'ig' || source === 'l.ig') source = 'instagram'
        if (source.includes('facebook')) source = 'facebook'

        const users = int(row.metricValues?.[0]?.value)

        sources[source] = (sources[source] ?? 0) + users
    }

    return sources
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function fetchWeeklyData({
    propertyId,
    accessToken,
    startDate,
    endDate,
    conversionEvent,
    enquiryPagePath
}: FetchWeeklyDataParams): Promise<WeeklyData> {
    const client = makeClient(accessToken)
    const property = propertyName(propertyId)

    // Fetch ALL data points sequentially to strictly avoid "Exhausted concurrent requests quota" errors.
    // Standard GA4 properties have a very low concurrent request limit (10).
    // By awaiting each query individually, we ensure we never exceed 1 request at a time per user session.

    const sessionsResult = await (async () => {
        try { return await fetchSessions(client, property, startDate, endDate) }
        catch (e) { console.error('[GA] fetchSessions failed:', e); return 0 }
    })()

    const visitorBreakdownResult = await (async () => {
        try { return await fetchVisitorBreakdown(client, property, startDate, endDate) }
        catch (e) { console.error('[GA] fetchVisitorBreakdown failed:', e); return { newUsers: 0, returningUsers: 0 } }
    })()

    const trafficSourcesResult = await (async () => {
        try { return await fetchTrafficSources(client, property, startDate, endDate) }
        catch (e) { console.error('[GA] fetchTrafficSources failed:', e); return {} }
    })()

    const conversionUsersResult = await (async () => {
        if (!conversionEvent) return { rawUsers: 0 }
        try { return await fetchEventCountForWeek(client, property, startDate, endDate, conversionEvent) }
        catch (e) { console.error('[GA] fetchEventCountForWeek failed:', e); return { rawUsers: 0 } }
    })()

    const intentUsersResult = await (async () => {
        if (!enquiryPagePath) return { intentUsers: 0, returningIntentUsers: 0 }
        try { return await fetchIntentUsers(client, property, startDate, endDate, enquiryPagePath) }
        catch (e) { console.error('[GA] fetchIntentUsers failed:', e); return { intentUsers: 0, returningIntentUsers: 0 } }
    })()

    const intentSourcesResult = await (async () => {
        if (!enquiryPagePath) return {}
        try { return await fetchIntentSources(client, property, startDate, endDate, enquiryPagePath) }
        catch (e) { console.error('[GA] fetchIntentSources failed:', e); return {} }
    })()

    const candidateEventsResult = await (async () => {
        try { return await fetchEventCountsLast30Days(client, property) }
        catch (e) { console.error('[GA] fetchEventCountsLast30Days failed:', e); return [] }
    })()

    return {
        sessions: sessionsResult as number,

        newUsers: (visitorBreakdownResult as any).newUsers,
        returningUsers: (visitorBreakdownResult as any).returningUsers,

        trafficSources: trafficSourcesResult as Record<string, number>,

        intentUsers: (intentUsersResult as any).intentUsers,
        returningIntentUsers: (intentUsersResult as any).returningIntentUsers,
        intentSources: intentSourcesResult as Record<string, number>,

        rawSubmissionUsers: (conversionUsersResult as { rawUsers: number }).rawUsers,

        candidateEvents: candidateEventsResult as Array<{ name: string; count: number }>
    }
}
