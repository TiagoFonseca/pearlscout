export function ratioTextHelper(part: number, total: number): string | null {

    if (!part || !total) return null

    const percentage = (part / total) * 100

    if (percentage < 3) return "less than 5% of visitors"
    if (percentage < 8) return "around 5% of visitors"
    if (percentage < 15) return "around 10% of visitors"
    if (percentage < 25) return "around 20% of visitors"
    if (percentage < 40) return "around 30% of visitors"
    if (percentage < 60) return "around half of visitors"
    if (percentage < 80) return "most visitors"

    return "almost all visitors"
}
