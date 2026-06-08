import {
  getBenchmarkEvaluationTargetRunTerminalError,
  type BenchmarkEvaluationLatestEvaluationSnapshot,
  type BenchmarkEvaluationLatestRunSnapshot,
  type BenchmarkEvaluationResultMetrics,
  type BenchmarkEvaluationTargetRun,
  type BenchmarkEvaluationTargetRunErrorKind,
  type BenchmarkEvaluationRunPhase,
} from "./benchmark-evaluations.js"
import type {
  BenchmarkChildSimulation,
} from "./benchmarks-postgres.js"
import type { SimulationStatus } from "./simulations-postgres.js"

export type BenchmarkExportSimulationIndexEntry = {
  simulationId: string
  deckId: string
  deckName: string
  deckIndex: number
  simulationIndex: number
  seed: string
  status: SimulationStatus
  turnsToSimulate: number
  simulatedTurnCount: number
  averageEvaluationScore: number | null
  filePath: string
}

export type BenchmarkExportRunEvaluation = {
  legalPass: boolean | null
  strategicPass: boolean | null
  simulationQualityScore: number | null
  simulationQualityScoreReasoning: string | null
  illegalActions: string[]
  strategicMistakes: string[]
}

export type BenchmarkExportFailedEvaluation = BenchmarkExportRunEvaluation & {
  simulationId: string
  deckId: string
  deckName: string
  deckIndex: number
  simulationIndex: number
  seed: string
  filePath: string
  targetLlmRunId: string
  targetRunPhase: "opening_hand" | "turn"
  turnNumber: number | null
  resultLabel: string
}

export type BenchmarkExportErrorRun = {
  simulationId: string
  deckId: string
  deckName: string
  deckIndex: number
  simulationIndex: number
  seed: string
  filePath: string
  targetLlmRunId: string
  targetRunPhase: "opening_hand" | "turn"
  turnNumber: number | null
  resultLabel: string
  attemptNumber: number
  runStatus: BenchmarkEvaluationLatestRunSnapshot["status"]
  resultStatus: BenchmarkEvaluationLatestRunSnapshot["resultStatus"]
  errorKind: BenchmarkEvaluationTargetRunErrorKind
  errorMessage: string
}

export type BenchmarkResultsExportV2<TBenchmarkMetadata> = {
  schemaVersion: 2
  exportedAt: string
  benchmark: TBenchmarkMetadata
  resultMetrics: BenchmarkEvaluationResultMetrics
}

type BenchmarkExportSimulationSummary = {
  status: SimulationStatus
  turnsToSimulate: number
  simulatedTurnCount: number
}

type BenchmarkExportSimulationRun = {
  llmRunId: string
  attemptNumber?: number
  turnNumber?: number
  benchmarkEvaluation?: BenchmarkExportRunEvaluation
}

type BenchmarkExportSimulationWithRuns = {
  results: {
    openingHandLlmRuns: readonly BenchmarkExportSimulationRun[]
    turnLlmRuns: readonly BenchmarkExportSimulationRun[]
  }
}

type BenchmarkExportSimulationFileWithRuns = {
  childSimulation: BenchmarkChildSimulation
  filePath: string
  value: BenchmarkExportSimulationWithRuns
}

export function buildBenchmarkExportAverageEvaluationScoreBySimulation({
  latestEvaluations,
  latestRuns,
  targetRuns,
}: {
  latestEvaluations: readonly BenchmarkEvaluationLatestEvaluationSnapshot[]
  latestRuns: readonly BenchmarkEvaluationLatestRunSnapshot[]
  targetRuns: readonly BenchmarkEvaluationTargetRun[]
}) {
  const targetRunById = new Map(
    targetRuns.map((run) => [run.targetLlmRunId, run])
  )
  const latestEvaluationByTargetRunId = new Map<
    string,
    BenchmarkEvaluationLatestEvaluationSnapshot
  >()

  for (const evaluation of latestEvaluations) {
    if (!targetRunById.has(evaluation.targetLlmRunId)) {
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

  const scoresBySimulationId = new Map<string, number[]>()

  for (const run of latestRuns) {
    if (isFailedBenchmarkExportTargetRun(run)) {
      addBenchmarkExportSimulationScore(
        scoresBySimulationId,
        run.simulationId,
        0
      )
    }
  }

  for (const evaluation of latestEvaluationByTargetRunId.values()) {
    if (!isScoredBenchmarkExportEvaluation(evaluation)) {
      continue
    }

    const targetRun = targetRunById.get(evaluation.targetLlmRunId)

    if (!targetRun) {
      continue
    }

    addBenchmarkExportSimulationScore(
      scoresBySimulationId,
      targetRun.simulationId,
      evaluation.simulationQualityScore
    )
  }

  const averageScoreBySimulationId = new Map<string, number>()

  for (const [simulationId, scores] of scoresBySimulationId) {
    averageScoreBySimulationId.set(
      simulationId,
      roundBenchmarkExportAverageScore(
        scores.reduce((sum, score) => sum + score, 0) / scores.length
      )
    )
  }

  return averageScoreBySimulationId
}

export function getBenchmarkExportSimulationRunIds(
  simulationExport: BenchmarkExportSimulationWithRuns
) {
  return [
    ...simulationExport.results.openingHandLlmRuns,
    ...simulationExport.results.turnLlmRuns,
  ].map((run) => run.llmRunId)
}

export function buildBenchmarkExportSimulationWithEvaluations<
  T extends BenchmarkExportSimulationWithRuns,
>({
  latestEvaluations,
  simulationExport,
}: {
  latestEvaluations: readonly BenchmarkEvaluationLatestEvaluationSnapshot[]
  simulationExport: T
}): T {
  const latestEvaluationByTargetRunId =
    buildLatestBenchmarkExportEvaluationByTargetRunId(latestEvaluations)

  return {
    ...simulationExport,
    results: {
      ...simulationExport.results,
      openingHandLlmRuns: simulationExport.results.openingHandLlmRuns.map(
        (run) =>
          buildBenchmarkExportRunWithEvaluation(
            run,
            latestEvaluationByTargetRunId
          )
      ),
      turnLlmRuns: simulationExport.results.turnLlmRuns.map((run) =>
        buildBenchmarkExportRunWithEvaluation(
          run,
          latestEvaluationByTargetRunId
        )
      ),
    },
  } as T
}

export function buildBenchmarkExportFailedEvaluations({
  latestEvaluations,
  simulationFiles,
}: {
  latestEvaluations: readonly BenchmarkEvaluationLatestEvaluationSnapshot[]
  simulationFiles: readonly BenchmarkExportSimulationFileWithRuns[]
}): BenchmarkExportFailedEvaluation[] {
  const latestEvaluationByTargetRunId =
    buildLatestBenchmarkExportEvaluationByTargetRunId(latestEvaluations)
  const failedEvaluations: BenchmarkExportFailedEvaluation[] = []

  for (const simulationFile of simulationFiles) {
    const openingHandRuns = simulationFile.value.results.openingHandLlmRuns.map(
      (run) => ({
        run,
        targetRunPhase: "opening_hand" as const,
        turnNumber: null,
      })
    )
    const turnRuns = simulationFile.value.results.turnLlmRuns.map((run) => ({
      run,
      targetRunPhase: "turn" as const,
      turnNumber: typeof run.turnNumber === "number" ? run.turnNumber : null,
    }))

    for (const { run, targetRunPhase, turnNumber } of [
      ...openingHandRuns,
      ...turnRuns,
    ]) {
      const evaluation = latestEvaluationByTargetRunId.get(run.llmRunId)

      if (
        !evaluation ||
        !isCompletedBenchmarkExportEvaluation(evaluation) ||
        !isFailedBenchmarkExportRunEvaluation(evaluation)
      ) {
        continue
      }

      failedEvaluations.push({
        ...buildBenchmarkExportRunEvaluation(evaluation),
        ...buildBenchmarkExportFailedEvaluationContext({
          simulationFile,
          targetRunPhase,
          turnNumber,
          run,
        }),
      })
    }
  }

  return failedEvaluations.sort(compareBenchmarkExportFailedEvaluations)
}

export function buildBenchmarkExportErrorRuns({
  latestRuns,
  simulationFiles,
}: {
  latestRuns: readonly BenchmarkEvaluationLatestRunSnapshot[]
  simulationFiles: readonly BenchmarkExportSimulationFileWithRuns[]
}): BenchmarkExportErrorRun[] {
  const simulationFileById = new Map(
    simulationFiles.map((simulationFile) => [
      simulationFile.childSimulation.simulationId,
      simulationFile,
    ])
  )
  const errorRuns: BenchmarkExportErrorRun[] = []

  for (const run of latestRuns) {
    const terminalError = getBenchmarkEvaluationTargetRunTerminalError(run)

    if (!terminalError) {
      continue
    }

    const simulationFile = simulationFileById.get(run.simulationId)

    if (!simulationFile) {
      continue
    }

    errorRuns.push({
      ...buildBenchmarkExportRunContext({
        simulationFile,
        targetRunPhase: run.targetRunPhase,
        turnNumber: run.turnNumber,
        targetLlmRunId: run.targetLlmRunId,
      }),
      attemptNumber: run.attemptNumber,
      runStatus: run.status,
      resultStatus: run.resultStatus,
      errorKind: terminalError.errorKind,
      errorMessage: terminalError.errorMessage,
    })
  }

  return errorRuns.sort(compareBenchmarkExportErrorRuns)
}

export function buildBenchmarkResultsExport<TBenchmarkMetadata>({
  benchmark,
  exportedAt,
  resultMetrics,
}: {
  benchmark: TBenchmarkMetadata
  exportedAt: string
  resultMetrics: BenchmarkEvaluationResultMetrics
}): BenchmarkResultsExportV2<TBenchmarkMetadata> {
  return {
    schemaVersion: 2,
    exportedAt,
    benchmark,
    resultMetrics,
  }
}

export function buildBenchmarkSimulationIndexEntry({
  averageEvaluationScore,
  childSimulation,
  filePath,
  simulation,
}: {
  averageEvaluationScore: number | null
  childSimulation: BenchmarkChildSimulation
  filePath: string
  simulation: BenchmarkExportSimulationSummary
}): BenchmarkExportSimulationIndexEntry {
  return {
    simulationId: childSimulation.simulationId,
    deckId: childSimulation.deckId,
    deckName: childSimulation.deckName,
    deckIndex: childSimulation.deckIndex,
    simulationIndex: childSimulation.simulationIndex,
    seed: childSimulation.seed,
    status: simulation.status,
    turnsToSimulate: simulation.turnsToSimulate,
    simulatedTurnCount: simulation.simulatedTurnCount,
    averageEvaluationScore,
    filePath,
  }
}

function buildBenchmarkExportRunContext({
  simulationFile,
  targetRunPhase,
  turnNumber,
  targetLlmRunId,
}: {
  simulationFile: BenchmarkExportSimulationFileWithRuns
  targetRunPhase: BenchmarkEvaluationRunPhase
  turnNumber: number | null
  targetLlmRunId: string
}) {
  const { childSimulation, filePath } = simulationFile

  return {
    simulationId: childSimulation.simulationId,
    deckId: childSimulation.deckId,
    deckName: childSimulation.deckName,
    deckIndex: childSimulation.deckIndex,
    simulationIndex: childSimulation.simulationIndex,
    seed: childSimulation.seed,
    filePath,
    targetLlmRunId,
    targetRunPhase,
    turnNumber,
    resultLabel: getBenchmarkExportRunResultLabel({
      targetRunPhase,
      turnNumber,
    }),
  }
}

function buildBenchmarkExportFailedEvaluationContext({
  simulationFile,
  targetRunPhase,
  turnNumber,
  run,
}: {
  simulationFile: BenchmarkExportSimulationFileWithRuns
  targetRunPhase: BenchmarkExportFailedEvaluation["targetRunPhase"]
  turnNumber: number | null
  run: BenchmarkExportSimulationRun
}): Omit<BenchmarkExportFailedEvaluation, keyof BenchmarkExportRunEvaluation> {
  return buildBenchmarkExportRunContext({
    simulationFile,
    targetLlmRunId: run.llmRunId,
    targetRunPhase,
    turnNumber,
  })
}

function getBenchmarkExportRunResultLabel({
  targetRunPhase,
  turnNumber,
}: {
  targetRunPhase: BenchmarkEvaluationRunPhase
  turnNumber: number | null
}) {
  if (targetRunPhase === "opening_hand") {
    return "Opening hand"
  }

  return `Turn ${turnNumber ?? "?"}`
}

function buildLatestBenchmarkExportEvaluationByTargetRunId(
  latestEvaluations: readonly BenchmarkEvaluationLatestEvaluationSnapshot[]
) {
  const latestEvaluationByTargetRunId = new Map<
    string,
    BenchmarkEvaluationLatestEvaluationSnapshot
  >()

  for (const evaluation of latestEvaluations) {
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

function buildBenchmarkExportRunEvaluation(
  evaluation: BenchmarkEvaluationLatestEvaluationSnapshot
): BenchmarkExportRunEvaluation {
  return {
    legalPass: evaluation.legalPass,
    strategicPass: evaluation.strategicPass,
    simulationQualityScore: evaluation.simulationQualityScore,
    simulationQualityScoreReasoning: evaluation.simulationQualityScoreReasoning,
    illegalActions: evaluation.illegalActions,
    strategicMistakes: evaluation.strategicMistakes,
  }
}

function buildBenchmarkExportRunWithEvaluation(
  run: BenchmarkExportSimulationRun,
  latestEvaluationByTargetRunId: ReadonlyMap<
    string,
    BenchmarkEvaluationLatestEvaluationSnapshot
  >
): BenchmarkExportSimulationRun {
  const evaluation = latestEvaluationByTargetRunId.get(run.llmRunId)

  if (!evaluation || !isCompletedBenchmarkExportEvaluation(evaluation)) {
    const { benchmarkEvaluation, ...runWithoutEvaluation } = run

    void benchmarkEvaluation

    return runWithoutEvaluation
  }

  return {
    ...run,
    benchmarkEvaluation: buildBenchmarkExportRunEvaluation(evaluation),
  }
}

function isCompletedBenchmarkExportEvaluation(
  evaluation: BenchmarkEvaluationLatestEvaluationSnapshot
) {
  return (
    evaluation.status === "completed" && evaluation.resultStatus === "completed"
  )
}

function isFailedBenchmarkExportRunEvaluation(
  evaluation: BenchmarkEvaluationLatestEvaluationSnapshot
) {
  return evaluation.legalPass === false || evaluation.strategicPass === false
}

function compareBenchmarkExportFailedEvaluations(
  first: BenchmarkExportFailedEvaluation,
  second: BenchmarkExportFailedEvaluation
) {
  const scoreCompare = compareNullableBenchmarkExportScores(
    first.simulationQualityScore,
    second.simulationQualityScore
  )

  if (scoreCompare !== 0) {
    return scoreCompare
  }

  return (
    compareBenchmarkExportRunContexts(first, second) ||
    first.targetLlmRunId.localeCompare(second.targetLlmRunId)
  )
}

function compareBenchmarkExportErrorRuns(
  first: BenchmarkExportErrorRun,
  second: BenchmarkExportErrorRun
) {
  return (
    getBenchmarkExportErrorRunSortOrder(first.errorKind) -
      getBenchmarkExportErrorRunSortOrder(second.errorKind) ||
    compareBenchmarkExportRunContexts(first, second)
  )
}

function compareBenchmarkExportRunContexts(
  first: Pick<
    BenchmarkExportFailedEvaluation,
    | "deckIndex"
    | "simulationIndex"
    | "targetRunPhase"
    | "turnNumber"
    | "targetLlmRunId"
  >,
  second: Pick<
    BenchmarkExportFailedEvaluation,
    | "deckIndex"
    | "simulationIndex"
    | "targetRunPhase"
    | "turnNumber"
    | "targetLlmRunId"
  >
) {
  return (
    first.deckIndex - second.deckIndex ||
    first.simulationIndex - second.simulationIndex ||
    getBenchmarkExportRunPhaseSortOrder(first.targetRunPhase) -
      getBenchmarkExportRunPhaseSortOrder(second.targetRunPhase) ||
    (first.turnNumber ?? 0) - (second.turnNumber ?? 0) ||
    first.targetLlmRunId.localeCompare(second.targetLlmRunId)
  )
}

function getBenchmarkExportErrorRunSortOrder(
  errorKind: BenchmarkExportErrorRun["errorKind"]
) {
  return errorKind === "result_failed" ? 0 : 1
}

function compareNullableBenchmarkExportScores(
  firstScore: number | null,
  secondScore: number | null
) {
  if (firstScore === null && secondScore === null) {
    return 0
  }

  if (firstScore === null) {
    return 1
  }

  if (secondScore === null) {
    return -1
  }

  return firstScore - secondScore
}

function getBenchmarkExportRunPhaseSortOrder(
  phase: BenchmarkExportFailedEvaluation["targetRunPhase"]
) {
  return phase === "opening_hand" ? 0 : 1
}

function isScoredBenchmarkExportEvaluation(
  evaluation: BenchmarkEvaluationLatestEvaluationSnapshot
): evaluation is BenchmarkEvaluationLatestEvaluationSnapshot & {
  simulationQualityScore: number
} {
  return (
    evaluation.status === "completed" &&
    evaluation.resultStatus === "completed" &&
    evaluation.simulationQualityScore !== null
  )
}

function isFailedBenchmarkExportTargetRun(
  run: BenchmarkEvaluationLatestRunSnapshot
) {
  return (
    run.status === "failed" ||
    (run.status === "completed" &&
      (run.failureMessage !== null || run.resultStatus === "failed"))
  )
}

function addBenchmarkExportSimulationScore(
  scoresBySimulationId: Map<string, number[]>,
  simulationId: string,
  score: number
) {
  const scores = scoresBySimulationId.get(simulationId) ?? []
  scores.push(score)
  scoresBySimulationId.set(simulationId, scores)
}

function roundBenchmarkExportAverageScore(score: number) {
  return Math.round(score * 10) / 10
}
