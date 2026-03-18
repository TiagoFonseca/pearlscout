import { BetaAnalyticsDataClient } from '@google-analytics/data'

export async function fetchSubmissionStructure(
    client: BetaAnalyticsDataClient,
    property: string,
    startDate: string,
    endDate: string,
    conversionEvent: string
) {
    const [res] = await client.runReport({
        property,
        dateRanges: [{ startDate, endDate }],
        dimensions: [
            { name: 'country' },
            { name: 'browser' },
            { name: 'deviceCategory' }
        ],
        metrics: [
            { name: 'eventCount' }
        ],
        dimensionFilter: {
            filter: {
                fieldName: 'eventName',
                stringFilter: {
                    matchType: 'EXACT',
                    value: conversionEvent
                }
            }
        }
    })

    const rows = res.rows ?? []

    let totalEvents = 0
    const countrySet = new Set<string>()
    const browserCounts: Record<string, number> = {}
    const deviceCounts: Record<string, number> = {}

    for (const row of rows) {
        const country = row.dimensionValues?.[0]?.value || 'unknown'
        const browser = row.dimensionValues?.[1]?.value || 'unknown'
        const device = row.dimensionValues?.[2]?.value || 'unknown'
        const count = parseInt(row.metricValues?.[0]?.value || '0', 10)

        totalEvents += count
        countrySet.add(country)

        browserCounts[browser] = (browserCounts[browser] || 0) + count
        deviceCounts[device] = (deviceCounts[device] || 0) + count
    }

    const distinctCountries = countrySet.size

    const topBrowserShare =
        totalEvents > 0
            ? Math.max(...Object.values(browserCounts)) / totalEvents
            : 0

    const topDeviceShare =
        totalEvents > 0
            ? Math.max(...Object.values(deviceCounts)) / totalEvents
            : 0

    return {
        totalEvents,
        distinctCountries,
        topBrowserShare,
        topDeviceShare
    }
}
