import {
  parseOpeningHandCompletionFromResponseText,
  parseTurnSimulationCompletionFromResponseText,
} from "./llm-run-events.js"
import { getLlmTokenUsageCounts } from "./llm-pricing.js"
import type {
  LlmRunStatus,
  SimulationRunEvaluationResultStatus,
  SimulationRunResultStatus,
} from "./simulations-postgres.js"

export const ACTIVE_BENCHMARK_EVALUATION_STATUSES = new Set<LlmRunStatus>([
  "pending",
  "batch_pending",
  "batch_submitted",
  "streaming",
  "cancel_requested",
])

export type BenchmarkEvaluationRunPhase = "opening_hand" | "turn"

const BENCHMARK_OPENING_HAND_SCORE_WEIGHT = 0.15
const BENCHMARK_TURN_SCORE_WEIGHT = 0.85
const LEGAL_FAIL_SCORE_CAP = 40
const STRATEGIC_FAIL_SCORE_CAP = 75

export type BenchmarkEvaluationLatestRunSnapshot = {
  deckId: string
  simulationId: string
  targetLlmRunId: string
  targetRunPhase: BenchmarkEvaluationRunPhase
  turnNumber: number | null
  attemptNumber: number
  status: LlmRunStatus
  failureMessage: string | null
  resultStatus: SimulationRunResultStatus
  resultFailureMessage: string | null
  finalOutputText: string | null
  openingHandIsValid: boolean | null
  gameState: unknown | null
  turnActions: unknown | null
  usage: unknown
  costUsd: number | null
}

export type BenchmarkEvaluationTargetRunErrorKind =
  | "llm_run_failed"
  | "result_failed"
  | "invalid_output"

export type BenchmarkEvaluationTargetRunTerminalError = {
  errorKind: BenchmarkEvaluationTargetRunErrorKind
  errorMessage: string
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

export type BenchmarkEvaluationPlannedSimulation = {
  deckId: string
  deckName: string
  deckIndex: number
  simulationId: string
  simulationIndex: number
}

export type BenchmarkEvaluationResultDeckMetrics = {
  deckId: string
  deckName: string
  deckIndex: number
  plannedSimulationCount: number
  mtgAutoDeckScore: number | null
  completionRate: number | null
  legalPassRate: number | null
  strategicPassRate: number | null
  costPerAttemptedTurn: number | null
  reasoningTokensPerAttemptedTurn: number | null
}

export type BenchmarkEvaluationResultMetrics = {
  plannedOpeningHandCount: number
  plannedTurnCount: number
  attemptedTurnCount: number
  completedTurnCount: number
  mtgAutoDeckScore: number | null
  openingHandScore: number | null
  turnScore: number | null
  completedEvaluationQualityAverage: number | null
  legalPassRate: number | null
  strategicPassRate: number | null
  completionRate: number | null
  totalRunCostUsd: number
  costPerAttemptedTurn: number | null
  costPerCompletedTurn: number | null
  costPerMtgAutoDeckScorePoint: number | null
  reasoningTokensPerAttemptedTurn: number | null
  inputTokensPerAttemptedTurn: number | null
  cachedInputTokensPerAttemptedTurn: number | null
  cachedInputTokenPercent: number | null
  totalTokensPerAttemptedTurn: number | null
  decks: BenchmarkEvaluationResultDeckMetrics[]
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
  resultMetrics: BenchmarkEvaluationResultMetrics
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

export function getBenchmarkEvaluationTargetRunTerminalError(
  run: BenchmarkEvaluationLatestRunSnapshot
): BenchmarkEvaluationTargetRunTerminalError | null {
  if (run.status === "failed") {
    return {
      errorKind: "llm_run_failed",
      errorMessage: run.failureMessage || "LLM run failed.",
    }
  }

  if (run.status !== "completed") {
    return null
  }

  if (run.failureMessage) {
    return {
      errorKind: "llm_run_failed",
      errorMessage: run.failureMessage,
    }
  }

  if (run.resultStatus === "failed") {
    return {
      errorKind: "result_failed",
      errorMessage: run.resultFailureMessage || "Run result failed.",
    }
  }

  if (run.resultStatus !== "completed") {
    return null
  }

  const outputFailureMessage =
    getBenchmarkEvaluationTargetRunOutputFailureMessage(run)

  return outputFailureMessage
    ? {
        errorKind: "invalid_output",
        errorMessage: outputFailureMessage,
      }
    : null
}

export function buildBenchmarkEvaluationSummary({
  latestRuns = [],
  latestEvaluations,
  plannedSimulations,
  targetRuns,
  turnsToSimulate,
}: {
  latestRuns?: readonly BenchmarkEvaluationLatestRunSnapshot[]
  latestEvaluations: readonly BenchmarkEvaluationLatestEvaluationSnapshot[]
  plannedSimulations?: readonly BenchmarkEvaluationPlannedSimulation[]
  targetRuns: readonly BenchmarkEvaluationTargetRun[]
  turnsToSimulate?: number
}): BenchmarkEvaluationSummary {
  const targetRunIds = new Set(targetRuns.map((run) => run.targetLlmRunId))
  const targetRunById = new Map(
    targetRuns.map((run) => [run.targetLlmRunId, run])
  )
  const latestEvaluationByTargetRunId =
    buildLatestBenchmarkEvaluationByTargetRunId(latestEvaluations, targetRunIds)

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
            (sum, evaluation) => sum + (evaluation.simulationQualityScore ?? 0),
            0
          ) / scoredEvaluations.length
        )
  const totalEvaluationCostUsd = roundBenchmarkCost(
    latestTargetEvaluations.reduce(
      (sum, evaluation) => sum + (evaluation.costUsd ?? 0),
      0
    )
  )
  const resultMetrics = buildBenchmarkEvaluationResultMetrics({
    latestEvaluations,
    latestRuns,
    plannedSimulations:
      plannedSimulations ?? buildFallbackPlannedSimulations(targetRuns),
    turnsToSimulate:
      turnsToSimulate ?? getFallbackBenchmarkTurnsToSimulate(targetRuns),
  })
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
    resultMetrics,
    attentionResults,
    failedResults,
  }
}

export function buildBenchmarkEvaluationResultMetrics({
  latestEvaluations,
  latestRuns,
  plannedSimulations,
  turnsToSimulate,
}: {
  latestEvaluations: readonly BenchmarkEvaluationLatestEvaluationSnapshot[]
  latestRuns: readonly BenchmarkEvaluationLatestRunSnapshot[]
  plannedSimulations: readonly BenchmarkEvaluationPlannedSimulation[]
  turnsToSimulate: number
}): BenchmarkEvaluationResultMetrics {
  const normalizedTurnsToSimulate = Math.max(0, Math.trunc(turnsToSimulate))
  const latestEvaluationByTargetRunId =
    buildLatestBenchmarkEvaluationByTargetRunId(latestEvaluations)
  const latestRunBySlotKey = new Map<
    string,
    BenchmarkEvaluationLatestRunSnapshot
  >()

  for (const run of latestRuns) {
    latestRunBySlotKey.set(getBenchmarkRunSlotKey(run), run)
  }

  const deckMetricsById = new Map<string, BenchmarkEvaluationDeckAccumulator>()
  const openingHandScores: number[] = []
  const turnScores: number[] = []
  let plannedOpeningHandCount = 0
  let plannedTurnCount = 0
  let attemptedTurnCount = 0
  let completedTurnCount = 0
  let plannedPassRateSlotCount = 0
  let legalPassCount = 0
  let strategicPassCount = 0
  let totalRunCostUsd = 0
  let turnRunCostUsd = 0
  let turnReasoningTokens = 0
  let turnInputTokens = 0
  let turnCachedInputTokens = 0
  let turnTotalTokens = 0
  const plannedRunIds = new Set<string>()

  for (const plannedSimulation of plannedSimulations) {
    const deckMetrics = getBenchmarkEvaluationDeckAccumulator(
      deckMetricsById,
      plannedSimulation
    )
    const openingRun = latestRunBySlotKey.get(
      getBenchmarkSlotKey(plannedSimulation.simulationId, "opening_hand", null)
    )
    const openingEvaluation = getBenchmarkEvaluationCompletedScore(
      openingRun,
      latestEvaluationByTargetRunId
    )
    const openingScore = getBenchmarkEvaluationSlotScore(openingEvaluation)
    const simulationTurnScores: number[] = []

    plannedOpeningHandCount += 1
    plannedPassRateSlotCount += 1
    openingHandScores.push(openingScore)
    deckMetrics.openingHandScores.push(openingScore)
    recordBenchmarkEvaluationPassCounts(openingEvaluation, {
      incrementLegalPass: () => {
        legalPassCount += 1
        deckMetrics.legalPassCount += 1
      },
      incrementStrategicPass: () => {
        strategicPassCount += 1
        deckMetrics.strategicPassCount += 1
      },
    })

    if (openingRun) {
      totalRunCostUsd += getBenchmarkRunCostUsd(openingRun)
      plannedRunIds.add(openingRun.targetLlmRunId)
    }

    for (
      let turnNumber = 1;
      turnNumber <= normalizedTurnsToSimulate;
      turnNumber += 1
    ) {
      const turnRun = latestRunBySlotKey.get(
        getBenchmarkSlotKey(plannedSimulation.simulationId, "turn", turnNumber)
      )
      const turnEvaluation = getBenchmarkEvaluationCompletedScore(
        turnRun,
        latestEvaluationByTargetRunId
      )
      const turnScore = getBenchmarkEvaluationSlotScore(turnEvaluation)

      plannedTurnCount += 1
      plannedPassRateSlotCount += 1
      deckMetrics.plannedTurnCount += 1
      turnScores.push(turnScore)
      simulationTurnScores.push(turnScore)
      deckMetrics.turnScores.push(turnScore)
      recordBenchmarkEvaluationPassCounts(turnEvaluation, {
        incrementLegalPass: () => {
          legalPassCount += 1
          deckMetrics.legalPassCount += 1
        },
        incrementStrategicPass: () => {
          strategicPassCount += 1
          deckMetrics.strategicPassCount += 1
        },
      })

      if (!turnRun) {
        continue
      }

      const turnCostUsd = getBenchmarkRunCostUsd(turnRun)
      const tokenUsage = getLlmTokenUsageCounts(turnRun.usage)

      attemptedTurnCount += 1
      deckMetrics.attemptedTurnCount += 1
      totalRunCostUsd += turnCostUsd
      turnRunCostUsd += turnCostUsd
      deckMetrics.turnRunCostUsd += turnCostUsd
      turnReasoningTokens += tokenUsage.reasoningTokens
      turnInputTokens += tokenUsage.inputTokens ?? 0
      turnCachedInputTokens += tokenUsage.cachedInputTokens ?? 0
      turnTotalTokens += tokenUsage.totalTokens ?? 0
      deckMetrics.reasoningTokens += tokenUsage.reasoningTokens
      plannedRunIds.add(turnRun.targetLlmRunId)

      if (isEligibleBenchmarkEvaluationTargetRun(turnRun)) {
        completedTurnCount += 1
        deckMetrics.completedTurnCount += 1
      }
    }

    deckMetrics.simulationScores.push(
      getBenchmarkEvaluationSimulationScore({
        openingScore,
        turnScore: averageNumbers(simulationTurnScores),
      })
    )
  }

  const completedEvaluationQualityAverage =
    getBenchmarkCompletedEvaluationQualityAverage({
      latestEvaluationByTargetRunId,
      plannedRunIds,
    })
  const deckMetrics = Array.from(deckMetricsById.values())
    .sort((first, second) => first.deckIndex - second.deckIndex)
    .map(buildBenchmarkEvaluationResultDeckMetrics)
  const deckScores = deckMetrics
    .map((deckMetric) => deckMetric.mtgAutoDeckScore)
    .filter((score): score is number => score !== null)
  const mtgAutoDeckScore = averageNumbers(deckScores)

  return {
    plannedOpeningHandCount,
    plannedTurnCount,
    attemptedTurnCount,
    completedTurnCount,
    mtgAutoDeckScore: roundNullableBenchmarkScore(mtgAutoDeckScore),
    openingHandScore: roundNullableBenchmarkScore(
      averageNumbers(openingHandScores)
    ),
    turnScore: roundNullableBenchmarkScore(averageNumbers(turnScores)),
    completedEvaluationQualityAverage,
    legalPassRate: roundNullableBenchmarkRate(
      divideToPercent(legalPassCount, plannedPassRateSlotCount)
    ),
    strategicPassRate: roundNullableBenchmarkRate(
      divideToPercent(strategicPassCount, plannedPassRateSlotCount)
    ),
    completionRate: roundNullableBenchmarkRate(
      divideToPercent(completedTurnCount, plannedTurnCount)
    ),
    totalRunCostUsd: roundBenchmarkCost(totalRunCostUsd),
    costPerAttemptedTurn: roundNullableBenchmarkCost(
      divide(turnRunCostUsd, attemptedTurnCount)
    ),
    costPerCompletedTurn: roundNullableBenchmarkCost(
      divide(turnRunCostUsd, completedTurnCount)
    ),
    costPerMtgAutoDeckScorePoint: roundNullableBenchmarkCost(
      divide(totalRunCostUsd, mtgAutoDeckScore ?? 0)
    ),
    reasoningTokensPerAttemptedTurn: roundNullableBenchmarkTokenRate(
      divide(turnReasoningTokens, attemptedTurnCount)
    ),
    inputTokensPerAttemptedTurn: roundNullableBenchmarkTokenRate(
      divide(turnInputTokens, attemptedTurnCount)
    ),
    cachedInputTokensPerAttemptedTurn: roundNullableBenchmarkTokenRate(
      divide(turnCachedInputTokens, attemptedTurnCount)
    ),
    cachedInputTokenPercent: roundNullableBenchmarkRate(
      divideToPercent(turnCachedInputTokens, turnInputTokens)
    ),
    totalTokensPerAttemptedTurn: roundNullableBenchmarkTokenRate(
      divide(turnTotalTokens, attemptedTurnCount)
    ),
    decks: deckMetrics,
  }
}

type BenchmarkEvaluationDeckAccumulator = {
  deckId: string
  deckName: string
  deckIndex: number
  plannedSimulationCount: number
  plannedTurnCount: number
  attemptedTurnCount: number
  completedTurnCount: number
  legalPassCount: number
  strategicPassCount: number
  turnRunCostUsd: number
  reasoningTokens: number
  openingHandScores: number[]
  turnScores: number[]
  simulationScores: number[]
}

function buildLatestBenchmarkEvaluationByTargetRunId(
  latestEvaluations: readonly BenchmarkEvaluationLatestEvaluationSnapshot[],
  targetRunIds?: ReadonlySet<string>
) {
  const latestEvaluationByTargetRunId = new Map<
    string,
    BenchmarkEvaluationLatestEvaluationSnapshot
  >()

  for (const evaluation of latestEvaluations) {
    if (targetRunIds && !targetRunIds.has(evaluation.targetLlmRunId)) {
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

  return latestEvaluationByTargetRunId
}

function buildFallbackPlannedSimulations(
  targetRuns: readonly BenchmarkEvaluationTargetRun[]
): BenchmarkEvaluationPlannedSimulation[] {
  const plannedSimulationsById = new Map<
    string,
    BenchmarkEvaluationPlannedSimulation
  >()

  for (const run of targetRuns) {
    if (plannedSimulationsById.has(run.simulationId)) {
      continue
    }

    plannedSimulationsById.set(run.simulationId, {
      deckId: run.deckId,
      deckName: run.deckId,
      deckIndex: plannedSimulationsById.size,
      simulationId: run.simulationId,
      simulationIndex: plannedSimulationsById.size + 1,
    })
  }

  return Array.from(plannedSimulationsById.values())
}

function getFallbackBenchmarkTurnsToSimulate(
  targetRuns: readonly BenchmarkEvaluationTargetRun[]
) {
  return targetRuns.reduce(
    (maxTurn, run) => Math.max(maxTurn, run.turnNumber ?? 0),
    0
  )
}

function getBenchmarkEvaluationDeckAccumulator(
  deckMetricsById: Map<string, BenchmarkEvaluationDeckAccumulator>,
  plannedSimulation: BenchmarkEvaluationPlannedSimulation
) {
  const existingMetrics = deckMetricsById.get(plannedSimulation.deckId)

  if (existingMetrics) {
    existingMetrics.plannedSimulationCount += 1
    return existingMetrics
  }

  const createdMetrics: BenchmarkEvaluationDeckAccumulator = {
    deckId: plannedSimulation.deckId,
    deckName: plannedSimulation.deckName,
    deckIndex: plannedSimulation.deckIndex,
    plannedSimulationCount: 1,
    plannedTurnCount: 0,
    attemptedTurnCount: 0,
    completedTurnCount: 0,
    legalPassCount: 0,
    strategicPassCount: 0,
    turnRunCostUsd: 0,
    reasoningTokens: 0,
    openingHandScores: [],
    turnScores: [],
    simulationScores: [],
  }

  deckMetricsById.set(plannedSimulation.deckId, createdMetrics)
  return createdMetrics
}

function buildBenchmarkEvaluationResultDeckMetrics(
  deckMetrics: BenchmarkEvaluationDeckAccumulator
): BenchmarkEvaluationResultDeckMetrics {
  const plannedSlotCount =
    deckMetrics.openingHandScores.length + deckMetrics.plannedTurnCount

  return {
    deckId: deckMetrics.deckId,
    deckName: deckMetrics.deckName,
    deckIndex: deckMetrics.deckIndex,
    plannedSimulationCount: deckMetrics.plannedSimulationCount,
    mtgAutoDeckScore: roundNullableBenchmarkScore(
      averageNumbers(deckMetrics.simulationScores)
    ),
    completionRate: roundNullableBenchmarkRate(
      divideToPercent(
        deckMetrics.completedTurnCount,
        deckMetrics.plannedTurnCount
      )
    ),
    legalPassRate: roundNullableBenchmarkRate(
      divideToPercent(deckMetrics.legalPassCount, plannedSlotCount)
    ),
    strategicPassRate: roundNullableBenchmarkRate(
      divideToPercent(deckMetrics.strategicPassCount, plannedSlotCount)
    ),
    costPerAttemptedTurn: roundNullableBenchmarkCost(
      divide(deckMetrics.turnRunCostUsd, deckMetrics.attemptedTurnCount)
    ),
    reasoningTokensPerAttemptedTurn: roundNullableBenchmarkTokenRate(
      divide(deckMetrics.reasoningTokens, deckMetrics.attemptedTurnCount)
    ),
  }
}

function getBenchmarkRunSlotKey(run: BenchmarkEvaluationLatestRunSnapshot) {
  return getBenchmarkSlotKey(
    run.simulationId,
    run.targetRunPhase,
    run.turnNumber
  )
}

function getBenchmarkSlotKey(
  simulationId: string,
  phase: BenchmarkEvaluationRunPhase,
  turnNumber: number | null
) {
  return `${simulationId}:${phase}:${turnNumber ?? "opening"}`
}

function getBenchmarkEvaluationCompletedScore(
  run: BenchmarkEvaluationLatestRunSnapshot | undefined,
  latestEvaluationByTargetRunId: ReadonlyMap<
    string,
    BenchmarkEvaluationLatestEvaluationSnapshot
  >
) {
  if (!run) {
    return null
  }

  const evaluation = latestEvaluationByTargetRunId.get(run.targetLlmRunId)

  if (
    !evaluation ||
    evaluation.status !== "completed" ||
    evaluation.resultStatus !== "completed" ||
    evaluation.simulationQualityScore === null
  ) {
    return null
  }

  return evaluation
}

function getBenchmarkEvaluationSlotScore(
  evaluation: BenchmarkEvaluationLatestEvaluationSnapshot | null
) {
  if (!evaluation) {
    return 0
  }

  let score = Math.min(Math.max(evaluation.simulationQualityScore ?? 0, 0), 10)
  score *= 10

  if (evaluation.legalPass === false) {
    score = Math.min(score, LEGAL_FAIL_SCORE_CAP)
  }

  if (evaluation.strategicPass === false) {
    score = Math.min(score, STRATEGIC_FAIL_SCORE_CAP)
  }

  return score
}

function recordBenchmarkEvaluationPassCounts(
  evaluation: BenchmarkEvaluationLatestEvaluationSnapshot | null,
  callbacks: {
    incrementLegalPass: () => void
    incrementStrategicPass: () => void
  }
) {
  if (evaluation?.legalPass === true) {
    callbacks.incrementLegalPass()
  }

  if (evaluation?.strategicPass === true) {
    callbacks.incrementStrategicPass()
  }
}

function getBenchmarkRunCostUsd(run: BenchmarkEvaluationLatestRunSnapshot) {
  return run.costUsd && run.costUsd > 0 ? run.costUsd : 0
}

function getBenchmarkEvaluationSimulationScore({
  openingScore,
  turnScore,
}: {
  openingScore: number
  turnScore: number | null
}) {
  if (turnScore === null) {
    return openingScore
  }

  return (
    openingScore * BENCHMARK_OPENING_HAND_SCORE_WEIGHT +
    turnScore * BENCHMARK_TURN_SCORE_WEIGHT
  )
}

function getBenchmarkCompletedEvaluationQualityAverage({
  latestEvaluationByTargetRunId,
  plannedRunIds,
}: {
  latestEvaluationByTargetRunId: ReadonlyMap<
    string,
    BenchmarkEvaluationLatestEvaluationSnapshot
  >
  plannedRunIds: ReadonlySet<string>
}) {
  const qualityScores = Array.from(latestEvaluationByTargetRunId.values())
    .filter(
      (evaluation) =>
        plannedRunIds.has(evaluation.targetLlmRunId) &&
        evaluation.status === "completed" &&
        evaluation.resultStatus === "completed" &&
        evaluation.simulationQualityScore !== null
    )
    .map((evaluation) => evaluation.simulationQualityScore ?? 0)

  return roundNullableBenchmarkScore(averageNumbers(qualityScores))
}

function averageNumbers(values: readonly number[]) {
  if (values.length === 0) {
    return null
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function divide(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : null
}

function divideToPercent(numerator: number, denominator: number) {
  const quotient = divide(numerator, denominator)

  return quotient === null ? null : quotient * 100
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

  return evaluation.legalPass === false || evaluation.strategicPass === false
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

  if (run.resultStatus !== "completed") {
    return false
  }

  return getBenchmarkEvaluationTargetRunOutputFailureMessage(run) === null
}

function getBenchmarkEvaluationTargetRunOutputFailureMessage(
  run: BenchmarkEvaluationLatestRunSnapshot
) {
  if (!run.finalOutputText?.trim()) {
    return "LLM run completed without final output text."
  }

  try {
    if (run.targetRunPhase === "opening_hand") {
      if (run.openingHandIsValid !== true) {
        return "Opening-hand run did not produce a valid opening hand."
      }

      parseOpeningHandCompletionFromResponseText(run.finalOutputText)
      return null
    }

    if (!isJsonObject(run.gameState) || !isJsonObject(run.turnActions)) {
      return "Turn run did not store parsed game state and turn actions."
    }

    parseTurnSimulationCompletionFromResponseText(run.finalOutputText)
    return null
  } catch (error) {
    return error instanceof Error
      ? error.message
      : "LLM run output could not be parsed."
  }
}

function isJsonObject(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function roundBenchmarkAverageScore(score: number) {
  return Math.round(score * 10) / 10
}

function roundNullableBenchmarkScore(score: number | null) {
  return score === null ? null : roundBenchmarkAverageScore(score)
}

function roundNullableBenchmarkRate(rate: number | null) {
  return rate === null ? null : Math.round(rate * 10) / 10
}

function roundNullableBenchmarkTokenRate(rate: number | null) {
  return rate === null ? null : Math.round(rate * 10) / 10
}

function roundBenchmarkCost(costUsd: number) {
  return Math.round(costUsd * 1_000_000_000) / 1_000_000_000
}

function roundNullableBenchmarkCost(costUsd: number | null) {
  return costUsd === null ? null : roundBenchmarkCost(costUsd)
}
