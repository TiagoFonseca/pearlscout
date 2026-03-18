export const currentWeeks: Record<string, any> = {

    healthy: {

        sessions: 320,
        intent_users: 48,
        returning_intent_users: 12,
        raw_submission_users: 9,
        clean_submission_users: 9,
        conversion_integrity: "healthy"

    },

    "weak-intent": {

        sessions: 320,
        intent_users: 15,
        returning_intent_users: 2,
        raw_submission_users: 2,
        clean_submission_users: 2,
        conversion_integrity: "healthy"

    },

    "high-intent-low-submissions": {

        sessions: 300,
        intent_users: 80,
        returning_intent_users: 25,
        raw_submission_users: 3,
        clean_submission_users: 3,
        conversion_integrity: "healthy"

    },

    "tracking-error": {

        sessions: 80,
        intent_users: 21,
        returning_intent_users: 5,
        raw_submission_users: 20,
        clean_submission_users: 20,
        conversion_integrity: "low"

    },

    "traffic-drop": {

        sessions: 120,
        intent_users: 25,
        returning_intent_users: 5,
        raw_submission_users: 4,
        clean_submission_users: 4,
        conversion_integrity: "healthy"

    }

}
