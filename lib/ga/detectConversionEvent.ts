// ─── Types ────────────────────────────────────────────────────────────────────

export interface CandidateEvent {
    name: string
    count: number
}

export interface DetectConversionEventParams {
    candidateEvents: CandidateEvent[]
    sessionsLast30Days: number
    enquiryPagePath?: string
    /** Map of eventName → array of { pagePath, count } breakdowns */
    eventPageBreakdowns?: Record<string, { pagePath: string; count: number }[]>
}

export interface DetectConversionEventResult {
    selectedEvent: string | null
    /** 0–100 */
    confidence: number
    reasoning: string[]
}

// ─── Constants ────────────────────────────────────────────────────────────────

const EXCLUDED_EVENTS = new Set([
    'page_view',
    'session_start',
    'first_visit',
    'user_engagement',
    'scroll',
    'click',
    'file_download',
    'video_start',
    'video_progress',
    'video_complete',
    'view_search_results'
])

const MIN_SCORE = 20

// ─── Scorer ───────────────────────────────────────────────────────────────────

interface ScoredEvent {
    name: string
    count: number
    score: number
    reasoning: string[]
}

function scoreCandidate(
    event: CandidateEvent,
    sessionsLast30Days: number,
    enquiryPagePath: string | undefined,
    eventPageBreakdowns: Record<string, { pagePath: string; count: number }[]> | undefined
): ScoredEvent {
    const { name, count } = event
    const log: string[] = []
    let score = 0

    // ── Name-based scoring ───────────────────────────────────────────────────

    if (name === 'generate_lead') {
        score += 30
        log.push(`"${name}": exact match "generate_lead" → +30`)
    }

    if (name.includes('submit')) {
        score += 25
        log.push(`"${name}": contains "submit" → +25`)
    }

    if (name.includes('lead') && name !== 'generate_lead') {
        score += 20
        log.push(`"${name}": contains "lead" → +20`)
    }

    if (name.includes('contact')) {
        score += 15
        log.push(`"${name}": contains "contact" → +15`)
    }

    if (name.includes('book')) {
        score += 15
        log.push(`"${name}": contains "book" → +15`)
    }

    // ── Volume sanity ────────────────────────────────────────────────────────

    if (count > 3) {
        score += 15
        log.push(`"${name}": count ${count} > 3 → +15`)
    }

    if (sessionsLast30Days > 0 && count > 0.8 * sessionsLast30Days) {
        score -= 40
        log.push(
            `"${name}": count ${count} > 80% of sessions (${sessionsLast30Days}) — likely noise → -40`
        )
    }

    // ── Page concentration ───────────────────────────────────────────────────

    if (enquiryPagePath && eventPageBreakdowns) {
        const breakdowns = eventPageBreakdowns[name]

        if (breakdowns && breakdowns.length > 0) {
            const totalBreakdownCount = breakdowns.reduce((sum, b) => sum + b.count, 0)
            const onEnquiryPage = breakdowns
                .filter(b => b.pagePath.includes(enquiryPagePath))
                .reduce((sum, b) => sum + b.count, 0)

            if (totalBreakdownCount > 0) {
                const pct = onEnquiryPage / totalBreakdownCount

                if (pct >= 0.7) {
                    score += 25
                    log.push(
                        `"${name}": ${Math.round(pct * 100)}% of fires on enquiry path "${enquiryPagePath}" → +25`
                    )
                } else if (pct < 0.4) {
                    score -= 25
                    log.push(
                        `"${name}": only ${Math.round(pct * 100)}% of fires on enquiry path "${enquiryPagePath}" — low concentration → -25`
                    )
                } else {
                    log.push(
                        `"${name}": ${Math.round(pct * 100)}% of fires on enquiry path — neutral`
                    )
                }
            }
        }
    }

    return { name, count, score, reasoning: log }
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function detectConversionEvent({
    candidateEvents,
    sessionsLast30Days,
    enquiryPagePath,
    eventPageBreakdowns
}: DetectConversionEventParams): DetectConversionEventResult {
    const globalReasoning: string[] = []

    // 1) Exclude noise events
    const excluded = candidateEvents.filter(e => EXCLUDED_EVENTS.has(e.name))
    const eligible = candidateEvents.filter(e => !EXCLUDED_EVENTS.has(e.name))

    if (excluded.length > 0) {
        globalReasoning.push(
            `Excluded ${excluded.length} noise event(s): ${excluded.map(e => e.name).join(', ')}`
        )
    }

    if (eligible.length === 0) {
        globalReasoning.push('No eligible candidates after exclusion list was applied.')
        return { selectedEvent: null, confidence: 0, reasoning: globalReasoning }
    }

    // 2) Score all eligible candidates
    const scored: ScoredEvent[] = eligible.map(e =>
        scoreCandidate(e, sessionsLast30Days, enquiryPagePath, eventPageBreakdowns)
    )

    // 3) Append per-event reasoning to global log
    for (const s of scored) {
        globalReasoning.push(...s.reasoning)
        globalReasoning.push(`"${s.name}": final score ${s.score}`)
    }

    // 4) Filter out low-confidence candidates
    const passing = scored.filter(s => s.score >= MIN_SCORE)

    if (passing.length === 0) {
        globalReasoning.push(
            `No candidate scored ≥ ${MIN_SCORE}. Cannot confidently identify a conversion event.`
        )
        return {
            selectedEvent: null,
            confidence: 0,
            reasoning: ['No high-confidence conversion event detected', ...globalReasoning]
        }
    }

    // 5) Select the highest-scoring candidate
    passing.sort((a, b) => b.score - a.score)
    const winner = passing[0]

    globalReasoning.push(
        `Selected "${winner.name}" with score ${winner.score} over ${passing.length} passing candidate(s).`
    )

    return {
        selectedEvent: winner.name,
        confidence: Math.min(winner.score, 100),
        reasoning: globalReasoning
    }
}
