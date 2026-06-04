import type {
  BenchmarkEvaluationLatestEvaluationSnapshot,
  BenchmarkEvaluationLatestRunSnapshot,
  BenchmarkEvaluationTargetRun,
} from "./benchmark-evaluations.js"
import type { BenchmarkChildSimulation } from "./benchmarks-postgres.js"
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

type BenchmarkExportSimulationSummary = {
  status: SimulationStatus
  turnsToSimulate: number
  simulatedTurnCount: number
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
      latestEvaluationByTargetRunId.set(
        evaluation.targetLlmRunId,
        evaluation
      )
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
    (run.status === "completed" && run.failureMessage !== null)
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
