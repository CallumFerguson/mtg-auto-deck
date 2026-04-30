import type { SimulationDebugLlmRun } from "./deck-types"

export type ParsedSimulationFinalOutput =
  | {
      type: "opening_hand"
      keptHand: string[]
      summary: string
    }
  | {
      type: "turn"
      gameState: string
      summary: string
    }

export function parseSimulationFinalOutput(
  run: Pick<SimulationDebugLlmRun, "phase" | "status" | "chunks">
): ParsedSimulationFinalOutput | null {
  if (run.status !== "completed") {
    return null
  }

  const finalOutput = run.chunks
    .map((chunk) => chunk.outputDelta ?? "")
    .join("")
    .trim()

  if (!finalOutput) {
    return null
  }

  let parsedOutput: unknown

  try {
    parsedOutput = JSON.parse(finalOutput)
  } catch {
    return null
  }

  if (run.phase === "opening_hand") {
    return parseOpeningHandFinalOutput(parsedOutput)
  }

  if (run.phase === "turn") {
    return parseTurnFinalOutput(parsedOutput)
  }

  return null
}

function parseOpeningHandFinalOutput(
  value: unknown
): ParsedSimulationFinalOutput | null {
  if (!isRecord(value)) {
    return null
  }

  const keptHand = value.keptHand
  const summary = value.summary

  if (
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

function parseTurnFinalOutput(value: unknown): ParsedSimulationFinalOutput | null {
  if (!isRecord(value)) {
    return null
  }

  const gameState = value.gameState
  const summary = value.summary

  if (typeof gameState !== "string" || typeof summary !== "string") {
    return null
  }

  return {
    type: "turn",
    gameState,
    summary,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
