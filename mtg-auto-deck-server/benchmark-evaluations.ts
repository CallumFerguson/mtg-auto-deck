import {
  parseOpeningHandCompletionFromResponseText,
  parseTurnSimulationCompletionFromResponseText,
} from "./llm-run-events.js"
import type {
  LlmRunStatus,
  SimulationRunEvaluationResultStatus,
} from "./simulations-postgres.js"

export const ACTIVE_BENCHMARK_EVALUATION_STATUSES = new Set<LlmRunStatus>([
  "pending",
  "batch_pending",
  "batch_submitted",
  "streaming",
  "cancel_requested",
])

export type BenchmarkEvaluationRunPhase = "opening_hand" | "turn"

export type BenchmarkEvaluationLatestRunSnapshot = {
  deckId: string
  simulationId: string
  targetLlmRunId: string
  targetRunPhase: BenchmarkEvaluationRunPhase
  turnNumber: number | null
  status: LlmRunStatus
  failureMessage: string | null
  finalOutputText: string | null
  openingHandIsValid: boolean | null
  gameState: unknown | null
  turnActions: unknown | null
}

export type BenchmarkEvaluationTargetRun = {
  deckId: string
  simulationId: string
  targetLlmRunId: string
  targetRunPhase: BenchmarkEvaluationRunPhase
  turnNumber: number | null
}

export type BenchmarkEvaluationLatestEvaluationSnapshot = {
  targetLlmRunId: string
  attemptNumber: number
  status: LlmRunStatus
  failureMessage: string | null
  resultStatus: SimulationRunEvaluationResultStatus
  resultFailureMessage: string | null
  legalPass: boolean | null
  strategicPass: boolean | null
  simulationQualityScore: number | null
  simulationQualityScoreReasoning: string | null
  illegalActions: string[]
  strategicMistakes: string[]
  costUsd: number | null
}

export type BenchmarkEvaluationAttentionResult = {
  deckId: string
  simulationId: string
  targetLlmRunId: string
  targetRunPhase: BenchmarkEvaluationRunPhase
  turnNumber: number | null
  attemptNumber: number
  legalPass: boolean | null
  strategicPass: boolean | null
  simulationQualityScore: number | null
  simulationQualityScoreReasoning: string | null
  illegalActions: string[]
  strategicMistakes: string[]
}

export type BenchmarkEvaluationFailedResult = {
  deckId: string
  simulationId: string
  targetLlmRunId: string
  targetRunPhase: BenchmarkEvaluationRunPhase
  turnNumber: number | null
  attemptNumber: number
  status: LlmRunStatus
  failureMessage: string | null
  resultStatus: SimulationRunEvaluationResultStatus
  resultFailureMessage: string | null
}

export type BenchmarkEvaluationSummary = {
  targetRunCount: number
  evaluationCount: number
  completedEvaluationCount: number
  activeEvaluationCount: number
  failedEvaluationCount: number
  averageSimulationQualityScore: number | null
  legalPassCount: number
  legalFailCount: number
  strategicPassCount: number
  strategicFailCount: number
  totalEvaluationCostUsd: number
  attentionResults: BenchmarkEvaluationAttentionResult[]
  failedResults: BenchmarkEvaluationFailedResult[]
}

export function getEligibleBenchmarkEvaluationTargetRuns(
  latestRuns: readonly BenchmarkEvaluationLatestRunSnapshot[]
) {
  const targetRuns: BenchmarkEvaluationTargetRun[] = []

  for (const run of latestRuns) {
    if (isEligibleBenchmarkEvaluationTargetRun(run)) {
      targetRuns.push({
        deckId: run.deckId,
        simulationId: run.simulationId,
        targetLlmRunId: run.targetLlmRunId,
        targetRunPhase: run.targetRunPhase,
        turnNumber: run.turnNumber,
      })
    }
  }

  return {
    skippedRunCount: latestRuns.length - targetRuns.length,
    targetRuns,
  }
}

export function buildBenchmarkEvaluationSummary({
  latestEvaluations,
  targetRuns,
}: {
  latestEvaluations: readonly BenchmarkEvaluationLatestEvaluationSnapshot[]
  targetRuns: readonly BenchmarkEvaluationTargetRun[]
}): BenchmarkEvaluationSummary {
  const targetRunIds = new Set(targetRuns.map((run) => run.targetLlmRunId))
  const targetRunById = new Map(
    targetRuns.map((run) => [run.targetLlmRunId, run])
  )
  const latestEvaluationByTargetRunId = new Map<
    string,
    BenchmarkEvaluationLatestEvaluationSnapshot
  >()

  for (const evaluation of latestEvaluations) {
    if (!targetRunIds.has(evaluation.targetLlmRunId)) {
      continue
    }

    const currentEvaluation = latestEvaluationByTargetRunId.get(
      evaluation.targetLlmRunId
    )

    if (
      !currentEvaluation ||
      evaluation.attemptNumber > currentEvaluation.attemptNumber
    ) {
      latestEvaluationByTargetRunId.set(evaluation.targetLlmRunId, evaluation)
    }
  }

  const latestTargetEvaluations = Array.from(
    latestEvaluationByTargetRunId.values()
  )
  const completedEvaluations = latestTargetEvaluations.filter(
    (evaluation) =>
      evaluation.status === "completed" &&
      evaluation.resultStatus === "completed"
  )
  const failedEvaluations = latestTargetEvaluations.filter(
    (evaluation) =>
      evaluation.status === "failed" || evaluation.resultStatus === "failed"
  )
  const scoredEvaluations = completedEvaluations.filter(
    (evaluation) => evaluation.simulationQualityScore !== null
  )
  const averageSimulationQualityScore =
    scoredEvaluations.length === 0
      ? null
      : roundBenchmarkAverageScore(
          scoredEvaluations.reduce(
            (sum, evaluation) =>
              sum + (evaluation.simulationQualityScore ?? 0),
            0
          ) / scoredEvaluations.length
        )
  const totalEvaluationCostUsd = roundBenchmarkCost(
    latestTargetEvaluations.reduce(
      (sum, evaluation) => sum + (evaluation.costUsd ?? 0),
      0
    )
  )
  const attentionResults = latestTargetEvaluations
    .filter(isBenchmarkEvaluationAttentionResult)
    .flatMap((evaluation) => {
      const targetRun = targetRunById.get(evaluation.targetLlmRunId)

      if (!targetRun) {
        return []
      }

      return [
        {
          deckId: targetRun.deckId,
          simulationId: targetRun.simulationId,
          targetLlmRunId: targetRun.targetLlmRunId,
          targetRunPhase: targetRun.targetRunPhase,
          turnNumber: targetRun.turnNumber,
          attemptNumber: evaluation.attemptNumber,
          legalPass: evaluation.legalPass,
          strategicPass: evaluation.strategicPass,
          simulationQualityScore: evaluation.simulationQualityScore,
          simulationQualityScoreReasoning:
            evaluation.simulationQualityScoreReasoning,
          illegalActions: evaluation.illegalActions,
          strategicMistakes: evaluation.strategicMistakes,
        },
      ]
    })
    .sort(compareBenchmarkEvaluationAttentionResults)
  const failedResults = failedEvaluations
    .flatMap((evaluation) => {
      const targetRun = targetRunById.get(evaluation.targetLlmRunId)

      if (!targetRun) {
        return []
      }

      return [
        {
          deckId: targetRun.deckId,
          simulationId: targetRun.simulationId,
          targetLlmRunId: targetRun.targetLlmRunId,
          targetRunPhase: targetRun.targetRunPhase,
          turnNumber: targetRun.turnNumber,
          attemptNumber: evaluation.attemptNumber,
          status: evaluation.status,
          failureMessage: evaluation.failureMessage,
          resultStatus: evaluation.resultStatus,
          resultFailureMessage: evaluation.resultFailureMessage,
        },
      ]
    })
    .sort(compareBenchmarkEvaluationFailedResults)

  return {
    targetRunCount: targetRuns.length,
    evaluationCount: latestTargetEvaluations.length,
    completedEvaluationCount: completedEvaluations.length,
    activeEvaluationCount: latestTargetEvaluations.filter((evaluation) =>
      ACTIVE_BENCHMARK_EVALUATION_STATUSES.has(evaluation.status)
    ).length,
    failedEvaluationCount: failedEvaluations.length,
    averageSimulationQualityScore,
    legalPassCount: completedEvaluations.filter(
      (evaluation) => evaluation.legalPass === true
    ).length,
    legalFailCount: completedEvaluations.filter(
      (evaluation) => evaluation.legalPass === false
    ).length,
    strategicPassCount: completedEvaluations.filter(
      (evaluation) => evaluation.strategicPass === true
    ).length,
    strategicFailCount: completedEvaluations.filter(
      (evaluation) => evaluation.strategicPass === false
    ).length,
    totalEvaluationCostUsd,
    attentionResults,
    failedResults,
  }
}

function isBenchmarkEvaluationAttentionResult(
  evaluation: BenchmarkEvaluationLatestEvaluationSnapshot
) {
  if (
    evaluation.status !== "completed" ||
    evaluation.resultStatus !== "completed"
  ) {
    return false
  }

  return (
    evaluation.legalPass === false ||
    evaluation.strategicPass === false
  )
}

function compareBenchmarkEvaluationAttentionResults(
  first: BenchmarkEvaluationAttentionResult,
  second: BenchmarkEvaluationAttentionResult
) {
  if (
    first.simulationQualityScore === null &&
    second.simulationQualityScore === null
  ) {
    return 0
  }

  if (first.simulationQualityScore === null) {
    return 1
  }

  if (second.simulationQualityScore === null) {
    return -1
  }

  return first.simulationQualityScore - second.simulationQualityScore
}

function compareBenchmarkEvaluationFailedResults(
  first: BenchmarkEvaluationFailedResult,
  second: BenchmarkEvaluationFailedResult
) {
  const deckCompare = first.deckId.localeCompare(second.deckId)

  if (deckCompare !== 0) {
    return deckCompare
  }

  const simulationCompare = first.simulationId.localeCompare(
    second.simulationId
  )

  if (simulationCompare !== 0) {
    return simulationCompare
  }

  const phaseCompare =
    getBenchmarkEvaluationPhaseSortOrder(first.targetRunPhase) -
    getBenchmarkEvaluationPhaseSortOrder(second.targetRunPhase)

  if (phaseCompare !== 0) {
    return phaseCompare
  }

  const turnCompare = (first.turnNumber ?? 0) - (second.turnNumber ?? 0)

  if (turnCompare !== 0) {
    return turnCompare
  }

  return second.attemptNumber - first.attemptNumber
}

function getBenchmarkEvaluationPhaseSortOrder(
  phase: BenchmarkEvaluationRunPhase
) {
  return phase === "opening_hand" ? 0 : 1
}

function isEligibleBenchmarkEvaluationTargetRun(
  run: BenchmarkEvaluationLatestRunSnapshot
) {
  if (run.status !== "completed") {
    return false
  }

  if (run.failureMessage) {
    return false
  }

  if (!run.finalOutputText?.trim()) {
    return false
  }

  try {
    if (run.targetRunPhase === "opening_hand") {
      if (run.openingHandIsValid !== true) {
        return false
      }

      parseOpeningHandCompletionFromResponseText(run.finalOutputText)
      return true
    }

    if (!isJsonObject(run.gameState) || !isJsonObject(run.turnActions)) {
      return false
    }

    parseTurnSimulationCompletionFromResponseText(run.finalOutputText)
    return true
  } catch {
    return false
  }
}

function isJsonObject(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function roundBenchmarkAverageScore(score: number) {
  return Math.round(score * 10) / 10
}

function roundBenchmarkCost(costUsd: number) {
  return Math.round(costUsd * 1_000_000_000) / 1_000_000_000
}
