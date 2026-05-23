import type { SimulationDebugLlmRun } from "./deck-types"

export type ParsedSimulationFinalOutput =
  | {
      type: "opening_hand"
      keptHand: string[]
      summary: string
    }
  | {
      type: "turn"
      turnActions: Record<string, string[]>
      gameState: unknown
    }
  | {
      type: "report"
      report: string
    }

export function getSimulationFinalParsedOutput(
  run: Pick<SimulationDebugLlmRun, "phase" | "chunks">
): ParsedSimulationFinalOutput | null {
  const finalParsedOutputChunk = [...run.chunks]
    .reverse()
    .find((chunk) => chunk.kind === "final_parsed_output")

  if (!finalParsedOutputChunk) {
    return null
  }

  return getSimulationFinalParsedOutputFromPayload(
    run.phase,
    finalParsedOutputChunk.payload
  )
}

export function getSimulationFinalParsedOutputFromPayload(
  phase: string,
  payload: unknown
): ParsedSimulationFinalOutput | null {
  if (phase === "opening_hand") {
    return getOpeningHandFinalParsedOutput(payload)
  }

  if (phase === "turn") {
    return getTurnFinalParsedOutput(payload)
  }

  if (phase === "report") {
    return getReportFinalParsedOutput(payload)
  }

  return null
}

function getOpeningHandFinalParsedOutput(
  value: unknown
): ParsedSimulationFinalOutput | null {
  if (!isRecord(value)) {
    return null
  }

  const keptHand = value.keptHand
  const summary = value.summary

  if (
    value.error !== null ||
    !Array.isArray(keptHand) ||
    !keptHand.every((cardName) => typeof cardName === "string") ||
    typeof summary !== "string"
  ) {
    return null
  }

  return {
    type: "opening_hand",
    keptHand,
    summary,
  }
}

function getTurnFinalParsedOutput(
  value: unknown
): ParsedSimulationFinalOutput | null {
  if (!isRecord(value)) {
    return null
  }

  const gameState = value.gameState
  const turnActions = value.turnActions

  if (
    value.error !== null ||
    !isRecord(gameState) ||
    !hasTurnActions(turnActions)
  ) {
    return null
  }

  return {
    type: "turn",
    turnActions,
    gameState,
  }
}

function getReportFinalParsedOutput(
  value: unknown
): ParsedSimulationFinalOutput | null {
  if (!isRecord(value)) {
    return null
  }

  const report = value.report

  if (typeof report !== "string" || !report.trim()) {
    return null
  }

  return {
    type: "report",
    report,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

const TURN_ACTION_PHASE_KEYS = [
  "untap",
  "upkeep",
  "draw",
  "precombat_main",
  "combat",
  "postcombat_main",
  "end_step_cleanup",
] as const

export function hasTurnActions(
  value: unknown
): value is Record<(typeof TURN_ACTION_PHASE_KEYS)[number], string[]> {
  if (!isRecord(value)) {
    return false
  }

  const phaseKeySet = new Set<string>(TURN_ACTION_PHASE_KEYS)

  return (
    Object.keys(value).every((key) => phaseKeySet.has(key)) &&
    TURN_ACTION_PHASE_KEYS.every((phaseKey) => {
      const actions = value[phaseKey]

      return (
        Array.isArray(actions) &&
        actions.every((action) => typeof action === "string")
      )
    })
  )
}
