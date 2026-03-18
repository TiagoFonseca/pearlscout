export interface PageData {
    path: string
    views: number
}

export interface DetectEnquiryPageParams {
    pages: PageData[]
}

export interface DetectEnquiryPageResult {
    selectedPage: string | null
    confidence: number
}

const EXCLUDED_TERMS = ['privacy', 'terms', 'policy', 'wp-admin', 'thank']

const SCORE_RULES: { term: string; points: number }[] = [
    { term: 'contact', points: 30 },
    { term: 'book', points: 25 },
    { term: 'enquiry', points: 20 },
    { term: 'get-in-touch', points: 15 }
]

const MIN_SCORE = 20

export function detectEnquiryPage({
    pages
}: DetectEnquiryPageParams): DetectEnquiryPageResult {
    const eligible = pages.filter(
        p => !EXCLUDED_TERMS.some(term => p.path.includes(term))
    )

    let topPath: string | null = null
    let topScore = 0

    for (const page of eligible) {
        let score = 0
        for (const rule of SCORE_RULES) {
            if (page.path.includes(rule.term)) score += rule.points
        }
        if (score > topScore) {
            topScore = score
            topPath = page.path
        }
    }

    if (topScore < MIN_SCORE) {
        return { selectedPage: null, confidence: 0 }
    }

    return {
        selectedPage: topPath,
        confidence: Math.min(topScore, 100)
    }
}
