import { baselines } from "../testing/scenarios/baselines.js"
import { currentWeeks } from "../testing/scenarios/currentWeeks.js"

import { computeSignals } from "../lib/analysis/computeSignals.js"
import { classifyState } from "../lib/analysis/classifyState.js"
import { generateWeeklyNarrative } from "../lib/analysis/buildInsight.js"
import { computeRollingBaseline } from "../lib/analysis/computeRollingBaseline.js"

// Parse CLI args
const args = process.argv.slice(2)

let baselineName = "stable"
let currentName = "healthy"

args.forEach(arg => {

    const [key, value] = arg.split("=")

    if (key === "baseline") baselineName = value
    if (key === "current") currentName = value

})

// Validate
const baseline = (baselines as any)[baselineName]
const current = currentWeeks[currentName]

if (!baseline) {
    console.log("Invalid baseline")
    process.exit()
}

if (!current) {
    console.log("Invalid current scenario")
    process.exit()
}

// Compute baseline averages
const rolling = computeRollingBaseline(baseline)

// Merge snapshot
const snapshot = {
    ...current,
    rolling_avg_sessions: rolling.avg_sessions,
    rolling_avg_intent_users: rolling.avg_intent_users
}

// Run pipeline
const signals = computeSignals(snapshot as any, [])

const state = classifyState(
    (snapshot.conversion_integrity || "healthy") as any,
    signals.visibilityDirection,
    signals.intentStrength,
    signals.sourceContrast,
    signals.hasSufficientHistory
)

const narrative = generateWeeklyNarrative(
    state,
    signals,
    snapshot
)

// Output
console.log("\n==============================")
console.log("PearlScout Simulation")
console.log("==============================\n")

console.log(`Baseline: ${baselineName}`)
console.log(`Current: ${currentName}`)

console.log("\n--- VISIBILITY ---\n")
console.log(narrative.visibility)

console.log("\n--- INTENT ---\n")
console.log(narrative.intent)

console.log("\n--- SUBMISSIONS ---\n")
console.log(narrative.submissions)

if (narrative.reliability) {
    console.log("\n--- RELIABILITY ---\n")
    console.log(narrative.reliability)
}

console.log("\n==============================\n")
