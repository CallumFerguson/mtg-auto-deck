import type { SimulationDebugLlmRun } from "@/lib/deck-types"
import {
  getSimulationRunStartTimeMs,
  parseTimestampMs,
} from "@/lib/simulation-run-timing"

export function isActiveLlmRunStatus(status: string) {
  return (
    status === "pending" ||
    status === "batch_pending" ||
    status === "batch_submitted" ||
    status === "streaming" ||
    status === "cancel_requested"
  )
}

export function getLlmRunEstimatedPriceText(
  run: Pick<SimulationDebugLlmRun, "estimatedPriceCents" | "status">
) {
  if (isActiveLlmRunStatus(run.status) || !run.estimatedPriceCents) {
    return null
  }

  return `${run.estimatedPriceCents} cents`
}

export function getSimulationRunFinishedTimeMs(
  run: Pick<SimulationDebugLlmRun, "completedAt" | "failedAt" | "cancelledAt">
) {
  return (
    parseTimestampMs(run.completedAt) ??
    parseTimestampMs(run.failedAt) ??
    parseTimestampMs(run.cancelledAt)
  )
}

export function getSimulationRunFinishedDurationText(
  run: Pick<
    SimulationDebugLlmRun,
    "startedAt" | "completedAt" | "failedAt" | "cancelledAt"
  >
) {
  const startTimeMs = getSimulationRunStartTimeMs(run)
  const finishedTimeMs = getSimulationRunFinishedTimeMs(run)

  if (startTimeMs === null || finishedTimeMs === null) {
    return null
  }

  return formatMinutesSeconds(finishedTimeMs - startTimeMs)
}

export function formatMinutesSeconds(durationMs: number) {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  if (minutes === 0) {
    return `${seconds}s`
  }

  return `${minutes}m ${seconds}s`
}
