import { Scenario } from "./types.js"

export const scenarios: Record<string, Scenario> = {

    "healthy-site": {

        previousWeeks: [

            { sessions: 300, intent_users: 45, returning_intent_users: 10, raw_submission_users: 8 },
            { sessions: 310, intent_users: 50, returning_intent_users: 12, raw_submission_users: 9 },
            { sessions: 290, intent_users: 42, returning_intent_users: 9, raw_submission_users: 7 },
            { sessions: 305, intent_users: 47, returning_intent_users: 11, raw_submission_users: 8 }

        ],

        currentWeek: {

            sessions: 320,
            intent_users: 48,
            returning_intent_users: 12,
            raw_submission_users: 9,
            clean_submission_users: 9,
            conversion_integrity: "healthy",

            traffic_sources: {
                google: 140,
                direct: 120,
                referral: 30,
                social: 30
            },

            intent_sources: {
                google: 20,
                direct: 18,
                referral: 6,
                social: 4
            }

        }

    }

}
