export function evaluateIntegrity({
    sessions,
    rawSubmissions
}: {
    sessions: number
    rawSubmissions: number
}) {

    if (sessions === 0) return 'healthy'

    const submissionRatio = rawSubmissions / sessions

    const isLow =
        rawSubmissions >= 10 &&
        submissionRatio >= 0.25

    return isLow ? 'low' : 'healthy'
}
