import { FocusType } from './classifyState.js'
import { SignalState } from './computeSignals.js'
import { ratioTextHelper } from './ratioHelpers.js'

export interface WeeklyNarrative {
    visibility: string
    intent: string
    submissions: string
    reliability?: string
}

function getVisibilityIntentContrast(
    visibility: "up" | "down" | "stable",
    intent: "up" | "down" | "stable"
): string | null {

    if (visibility === "down" && intent === "up") {
        return "Despite lower traffic, visitors are engaging more once they arrive."
    }

    if (visibility === "up" && intent === "down") {
        return "While more visitors are arriving, fewer are progressing to the enquiry stage."
    }

    if (visibility === "down" && intent === "down") {
        return "Both traffic and engagement have declined compared with recent weeks."
    }

    if (visibility === "up" && intent === "up") {
        return "Both traffic and visitor engagement have increased compared with recent weeks."
    }

    return null
}

function formatSource(source?: string | null) {
    if (!source) return ''
    if (source === 'direct') return 'direct access'
    if (source === 'google') return 'Google'
    if (source === 'ig' || source === 'instagram') return 'Instagram'
    if (source === 'fb' || source === 'facebook') return 'Facebook'
    return source.charAt(0).toUpperCase() + source.slice(1)
}

export function generateWeeklyNarrative(
    focusType: FocusType,
    signals: SignalState,
    snapshot: any
): WeeklyNarrative {

    const sessions = snapshot.sessions || 0
    const intentUsers = snapshot.intent_users || 0
    const returningIntent = snapshot.returning_intent_users || 0
    const submissions =
        snapshot.clean_submission_users ?? snapshot.raw_submission_users ?? 0

    const trafficSource = formatSource(signals.dominantTrafficSource)
    const intentSource = formatSource(signals.dominantIntentSource)

    const narrative: WeeklyNarrative = {
        visibility: '',
        intent: '',
        submissions: ''
    }

    // -----------------------------
    // VISIBILITY (Visitors first)
    // -----------------------------

    if (signals.visibilityDirection === 'up') {
        narrative.visibility =
            `Your website received ${sessions} visits this week, an increase compared with recent weeks.`
    }
    else if (signals.visibilityDirection === 'down') {
        narrative.visibility =
            `Your website received ${sessions} visits this week, which is lower than usual.`
    }
    else {
        narrative.visibility =
            `Your website received ${sessions} visits this week, similar to recent weeks.`
    }

    if (trafficSource) {
        narrative.visibility += ` Most visitors arrived from ${trafficSource}.`
    }

    // -----------------------------
    // INTENT (Visitor behaviour)
    // -----------------------------

    if (intentUsers > 0) {

        const intentRatio = sessions > 0 ? intentUsers / sessions : 0

        let intentQuality = "a typical level of interest"

        if (intentRatio < 0.1) {
            intentQuality = "a lower-than-expected level of interest"
        }
        else if (intentRatio >= 0.2) {
            intentQuality = "a strong level of interest"
        }

        const ratioText = ratioTextHelper(intentUsers, sessions)

        // Build clean interpretation sentence
        let interpretation = `${intentQuality}`

        if (signals.intentDirection === "up") {
            interpretation = `a higher level of engagement than usual`
        }
        else if (signals.intentDirection === "down") {
            interpretation = `a lower level of engagement than usual`
        }

        // FINAL SENTENCE (NO DUPLICATION)
        narrative.intent =
            `${intentUsers} visitors explored your enquiry pages, showing ${interpretation}`

        if (ratioText) {
            narrative.intent += ` (${ratioText}).`
        } else {
            narrative.intent += `.`
        }

        // SOURCE CONTRAST (unchanged logic, just appended cleanly)
        if (signals.sourceContrast && trafficSource && intentSource) {

            if (signals.dominantIntentSource === "direct") {

                narrative.intent +=
                    ` While most visitors arrived through ${trafficSource}, many of the visitors who explored your enquiry pages came through direct access.`

            } else {

                narrative.intent +=
                    ` While most visitors arrived through ${trafficSource}, visitors who explored your enquiry pages often came from ${intentSource}. This suggests ${intentSource} may be bringing particularly engaged visitors.`

            }

        }

        // RETURNING VISITORS (ratio-based, clean tone)
        if (returningIntent > 0) {

            const returningText = ratioTextHelper(returningIntent, intentUsers)

            if (returningText) {

                narrative.intent +=
                    ` Of these visitors, ${returningText} had visited the site previously before reaching your enquiry pages.`

            }

        }

        const contrast = getVisibilityIntentContrast(
            signals.visibilityDirection,
            signals.intentDirection
        )

        if (contrast) {
            narrative.intent += ` ${contrast}`
        }

    }

    // -----------------------------
    // ENQUIRIES
    // -----------------------------

    narrative.submissions =
        `${submissions} enquiries were recorded this week.`

    if (intentUsers > 0) {

        const conversionRate = submissions / intentUsers

        if (conversionRate < 0.05) {

            narrative.submissions +=
                ` Only a small proportion of visitors who reached the enquiry stage completed a submission.`

        }
        else if (conversionRate > 0.3) {

            narrative.submissions +=
                ` A high proportion of visitors who reached the enquiry stage completed a submission.`

        }
        else {

            narrative.submissions +=
                ` Visitors who reached the enquiry stage converted at a typical rate.`

        }

    }

    // -----------------------------
    // RELIABILITY (Tracking issues last)
    // -----------------------------

    if (snapshot.conversion_integrity === 'low') {

        narrative.reliability =
            `However, this number appears unusually high for the level of traffic. This suggests the form tracking may be triggering too easily, so the enquiry numbers may not yet be reliable.`

    }

    return narrative
}
