export interface WeeklyData {
    sessions: number
    intent_users: number
    returning_intent_users: number
    raw_submission_users: number
    clean_submission_users?: number
    traffic_sources?: Record<string, number>
    intent_sources?: Record<string, number>
    conversion_integrity?: "healthy" | "mixed" | "low"
}

export interface Scenario {
    previousWeeks: WeeklyData[] // must be 4
    currentWeek: WeeklyData
}
