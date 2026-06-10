import type {
  PublicBenchmarkMetadata,
  PublicBenchmarkResultDeckMetrics,
  PublicBenchmarkResultMetrics,
  PublicBenchmarkResultsExportV2,
} from "./deck-types"

export type PublicBenchmarkSelectedPanel =
  | "results"
  | "simulation"
  | "error-runs"
  | "failed-evaluations"

export type PublicBenchmarkCostDiscountReason = "batch" | "flex"

export function getPublicBenchmarkSelectedPanelFromSearch(
  search: string
): PublicBenchmarkSelectedPanel {
  const searchParams = new URLSearchParams(search)

  if (searchParams.get("view") === "failed-evaluations") {
    return "failed-evaluations"
  }

  if (searchParams.get("view") === "error-runs") {
    return "error-runs"
  }

  const hasSimulationSelection =
    Boolean(searchParams.get("simulation")?.trim()) ||
    Boolean(searchParams.get("run")?.trim()) ||
    Boolean(searchParams.get("turn")?.trim())

  return hasSimulationSelection ? "simulation" : "results"
}

export function getPublicBenchmarkCostDiscountReason(
  benchmark: Pick<
    PublicBenchmarkMetadata,
    "llmProcessingMode" | "useFlexServiceTier"
  >
): PublicBenchmarkCostDiscountReason | null {
  if (benchmark.llmProcessingMode !== "realtime") {
    return "batch"
  }

  return benchmark.useFlexServiceTier ? "flex" : null
}

export function getPublicBenchmarkDisplayedCost(
  costUsd: number | null,
  discountReason: PublicBenchmarkCostDiscountReason | null
) {
  if (costUsd === null) {
    return null
  }

  return discountReason ? roundPublicBenchmarkDisplayCost(costUsd * 2) : costUsd
}

export function getPublicBenchmarkCostDiscountTooltipText(
  discountReason: PublicBenchmarkCostDiscountReason | null
) {
  return discountReason
    ? `Actual cost was 50% less because ${discountReason} processing was used.`
    : null
}

export function isPublicBenchmarkResultsExportV2(
  value: unknown
): value is PublicBenchmarkResultsExportV2 {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false
  }

  const record = value as Record<string, unknown>

  return (
    record.schemaVersion === 2 &&
    typeof record.exportedAt === "string" &&
    isPublicBenchmarkMetadata(record.benchmark) &&
    isPublicBenchmarkResultMetrics(record.resultMetrics)
  )
}

export function isPublicBenchmarkResultMetrics(
  value: unknown
): value is PublicBenchmarkResultMetrics {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false
  }

  const record = value as Record<string, unknown>

  return (
    isPublicBenchmarkNonnegativeInteger(record.plannedOpeningHandCount) &&
    isOptionalPublicBenchmarkNonnegativeInteger(
      record.attemptedOpeningHandCount
    ) &&
    isPublicBenchmarkNonnegativeInteger(record.plannedTurnCount) &&
    isPublicBenchmarkNonnegativeInteger(record.attemptedTurnCount) &&
    isPublicBenchmarkNonnegativeInteger(record.completedTurnCount) &&
    isNullablePublicBenchmarkNumber(record.mtgAutoDeckScore) &&
    isNullablePublicBenchmarkNumber(record.openingHandScore) &&
    isNullablePublicBenchmarkNumber(record.turnScore) &&
    isNullablePublicBenchmarkNumber(record.completedEvaluationQualityAverage) &&
    isNullablePublicBenchmarkNumber(record.legalPassRate) &&
    isNullablePublicBenchmarkNumber(record.strategicPassRate) &&
    isNullablePublicBenchmarkNumber(record.completionRate) &&
    isPublicBenchmarkNumber(record.totalRunCostUsd) &&
    isNullablePublicBenchmarkNumber(record.costPerAttemptedTurn) &&
    isNullablePublicBenchmarkNumber(record.costPerCompletedTurn) &&
    isNullablePublicBenchmarkNumber(record.costPerMtgAutoDeckScorePoint) &&
    isOptionalNullablePublicBenchmarkNumber(
      record.reasoningTokensPerAttemptedOpeningHand
    ) &&
    isNullablePublicBenchmarkNumber(record.reasoningTokensPerAttemptedTurn) &&
    isOptionalPublicBenchmarkReasoningTokensByTurn(
      record.reasoningTokensByTurn
    ) &&
    isNullablePublicBenchmarkNumber(record.totalTokensPerAttemptedTurn) &&
    Array.isArray(record.decks) &&
    record.decks.every(isPublicBenchmarkResultDeckMetrics)
  )
}

export function isPublicBenchmarkResultDeckMetrics(
  value: unknown
): value is PublicBenchmarkResultDeckMetrics {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false
  }

  const record = value as Record<string, unknown>

  return (
    typeof record.deckId === "string" &&
    typeof record.deckName === "string" &&
    isPublicBenchmarkNonnegativeInteger(record.deckIndex) &&
    isPublicBenchmarkNonnegativeInteger(record.plannedSimulationCount) &&
    isNullablePublicBenchmarkNumber(record.mtgAutoDeckScore) &&
    isNullablePublicBenchmarkNumber(record.completionRate) &&
    isNullablePublicBenchmarkNumber(record.legalPassRate) &&
    isNullablePublicBenchmarkNumber(record.strategicPassRate) &&
    isNullablePublicBenchmarkNumber(record.costPerAttemptedTurn) &&
    isNullablePublicBenchmarkNumber(record.reasoningTokensPerAttemptedTurn)
  )
}

function isOptionalPublicBenchmarkReasoningTokensByTurn(value: unknown) {
  return (
    value === undefined ||
    (Array.isArray(value) &&
      value.every(isPublicBenchmarkReasoningTokensByTurn))
  )
}

function isPublicBenchmarkReasoningTokensByTurn(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false
  }

  const record = value as Record<string, unknown>

  return (
    isPublicBenchmarkNonnegativeInteger(record.turnNumber) &&
    isPublicBenchmarkNonnegativeInteger(record.attemptedTurnCount) &&
    isNullablePublicBenchmarkNumber(record.reasoningTokensPerAttemptedTurn)
  )
}

function isPublicBenchmarkMetadata(
  value: unknown
): value is PublicBenchmarkMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false
  }

  const record = value as Record<string, unknown>

  return (
    typeof record.id === "string" &&
    typeof record.llmModelPresetId === "string" &&
    isNullableString(record.llmModelPresetName) &&
    isNullableString(record.llmModelPresetModel) &&
    isNullableString(record.llmModelPresetProvider) &&
    isNullableString(record.llmModelPresetReasoningEffort) &&
    isNullableString(record.llmModelPresetOpenrouterModelProvider) &&
    isPublicBenchmarkNumber(record.simulationsPerDeck) &&
    isPublicBenchmarkNumber(record.turnsToSimulate) &&
    isPublicBenchmarkLlmProcessingMode(record.llmProcessingMode) &&
    typeof record.useFlexServiceTier === "boolean" &&
    isPublicBenchmarkStatus(record.status) &&
    Array.isArray(record.decks) &&
    record.decks.every(isPublicBenchmarkDeck) &&
    isPublicBenchmarkNumber(record.totalSimulationCount) &&
    isPublicBenchmarkNumber(record.pendingSimulationCount) &&
    isPublicBenchmarkNumber(record.runningSimulationCount) &&
    isPublicBenchmarkNumber(record.completedSimulationCount) &&
    isPublicBenchmarkNumber(record.failedSimulationCount) &&
    isPublicBenchmarkNumber(record.cancelledSimulationCount) &&
    isPublicBenchmarkNumber(record.activeSimulationCount) &&
    isPublicBenchmarkNumber(record.averageSimulatedTurnCount) &&
    typeof record.startedAt === "string" &&
    isNullableString(record.completedAt) &&
    isNullableString(record.stoppedAt) &&
    typeof record.createdAt === "string" &&
    typeof record.updatedAt === "string"
  )
}

function isPublicBenchmarkDeck(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false
  }

  const record = value as Record<string, unknown>

  return typeof record.id === "string" && typeof record.name === "string"
}

function isPublicBenchmarkNonnegativeInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
}

function isOptionalPublicBenchmarkNonnegativeInteger(value: unknown) {
  return value === undefined || isPublicBenchmarkNonnegativeInteger(value)
}

function isNullableString(value: unknown) {
  return value === null || typeof value === "string"
}

function isNullablePublicBenchmarkNumber(value: unknown) {
  return value === null || isPublicBenchmarkNumber(value)
}

function isOptionalNullablePublicBenchmarkNumber(value: unknown) {
  return value === undefined || isNullablePublicBenchmarkNumber(value)
}

function isPublicBenchmarkNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
}

function isPublicBenchmarkLlmProcessingMode(value: unknown) {
  return (
    value === "realtime" ||
    value === "openai_batch" ||
    value === "anthropic_batch"
  )
}

function isPublicBenchmarkStatus(value: unknown) {
  return (
    value === "running" ||
    value === "stopped" ||
    value === "completed" ||
    value === "failed"
  )
}

function roundPublicBenchmarkDisplayCost(costUsd: number) {
  return Math.round(costUsd * 1_000_000_000) / 1_000_000_000
}
