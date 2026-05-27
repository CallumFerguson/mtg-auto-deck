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

export function getSimulationFinalParsedOutput(
  run: Pick<
    SimulationDebugLlmRun,
    "gameState" | "openingHand" | "phase" | "summary" | "turnActions"
  >
): ParsedSimulationFinalOutput | null {
  if (run.phase === "opening_hand") {
    if (
      !Array.isArray(run.openingHand) ||
      !run.openingHand.every((cardName) => typeof cardName === "string") ||
      typeof run.summary !== "string"
    ) {
      return null
    }

    return {
      type: "opening_hand",
      keptHand: run.openingHand,
      summary: run.summary,
    }
  }

  if (run.phase === "turn" && hasTurnActions(run.turnActions)) {
    return {
      type: "turn",
      turnActions: run.turnActions,
      gameState: run.gameState,
    }
  }

  return null
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
