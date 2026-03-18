export function computeRollingBaseline(previousWeeks: any[]) {

    const totals = {
        sessions: 0,
        intent_users: 0,
        submissions: 0
    }

    previousWeeks.forEach(week => {

        totals.sessions += week.sessions || 0
        totals.intent_users += week.intent_users || 0
        totals.submissions += week.raw_submission_users || 0

    })

    return {
        avg_sessions: totals.sessions / previousWeeks.length,
        avg_intent_users: totals.intent_users / previousWeeks.length,
        avg_submissions: totals.submissions / previousWeeks.length
    }

}
