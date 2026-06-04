import assert from "node:assert/strict"
import test from "node:test"
import {
  buildBenchmarkExportAverageEvaluationScoreBySimulation,
  buildBenchmarkSimulationIndexEntry,
} from "./benchmark-export.js"
import type {
  BenchmarkEvaluationLatestEvaluationSnapshot,
  BenchmarkEvaluationLatestRunSnapshot,
  BenchmarkEvaluationTargetRun,
} from "./benchmark-evaluations.js"
import type { BenchmarkChildSimulation } from "./benchmarks-postgres.js"

test("averages latest completed evaluation scores by simulation", () => {
  const targetRuns = [
    createTargetRun({
      targetLlmRunId: "opening-run",
      targetRunPhase: "opening_hand",
    }),
    createTargetRun({
      targetLlmRunId: "turn-3-run",
      targetRunPhase: "turn",
      turnNumber: 3,
    }),
    createTargetRun({
      targetLlmRunId: "turn-1-run",
      targetRunPhase: "turn",
      turnNumber: 1,
    }),
  ]
  const averageScoreBySimulation =
    buildBenchmarkExportAverageEvaluationScoreBySimulation({
      latestEvaluations: [
        createEvaluation({
          targetLlmRunId: "turn-3-run",
          legalPass: false,
          strategicPass: true,
          simulationQualityScore: 6.5,
        }),
        createEvaluation({
          targetLlmRunId: "opening-run",
          legalPass: true,
          strategicPass: true,
          simulationQualityScore: 9,
        }),
        createEvaluation({
          targetLlmRunId: "turn-1-run",
          legalPass: true,
          strategicPass: false,
          simulationQualityScore: 7.5,
        }),
      ],
      latestRuns: targetRuns.map((run) => createLatestRun(run)),
      targetRuns,
    })

  assert.equal(averageScoreBySimulation.get("simulation-one"), 7.7)
})

test("counts failed target runs as zero scores in simulation averages", () => {
  const targetRuns = [
    createTargetRun({
      targetLlmRunId: "scored-run",
    }),
  ]
  const averageScoreBySimulation =
    buildBenchmarkExportAverageEvaluationScoreBySimulation({
      latestEvaluations: [
        createEvaluation({
          targetLlmRunId: "scored-run",
          simulationQualityScore: 8,
        }),
      ],
      latestRuns: [
        createLatestRun({
          targetLlmRunId: "scored-run",
        }),
        createLatestRun({
          targetLlmRunId: "failed-opening-run",
          targetRunPhase: "opening_hand",
          turnNumber: null,
          status: "failed",
          failureMessage: "Opening hand run failed.",
          finalOutputText: null,
          openingHandIsValid: null,
        }),
        createLatestRun({
          targetLlmRunId: "failed-turn-run",
          targetRunPhase: "turn",
          turnNumber: 2,
          status: "failed",
          failureMessage: "Turn run failed.",
          finalOutputText: null,
          gameState: null,
          turnActions: null,
        }),
        createLatestRun({
          simulationId: "simulation-two",
          targetLlmRunId: "failed-only-run",
          status: "failed",
          failureMessage: "Only run failed.",
          finalOutputText: null,
        }),
        createLatestRun({
          simulationId: "simulation-three",
          targetLlmRunId: "completed-error-run",
          failureMessage: "Completed run still had an error.",
        }),
      ],
      targetRuns,
    })

  assert.equal(averageScoreBySimulation.get("simulation-one"), 2.7)
  assert.equal(averageScoreBySimulation.get("simulation-two"), 0)
  assert.equal(averageScoreBySimulation.get("simulation-three"), 0)
})

test("omits active, failed, result-failed, unscored, and superseded evaluations", () => {
  const targetRuns = [
    createTargetRun({ targetLlmRunId: "active-run" }),
    createTargetRun({ targetLlmRunId: "failed-run" }),
    createTargetRun({ targetLlmRunId: "result-failed-run" }),
    createTargetRun({ targetLlmRunId: "unscored-run" }),
    createTargetRun({ targetLlmRunId: "superseded-run" }),
  ]
  const averageScoreBySimulation =
    buildBenchmarkExportAverageEvaluationScoreBySimulation({
      latestEvaluations: [
        createEvaluation({
          targetLlmRunId: "active-run",
          status: "streaming",
        }),
        createEvaluation({
          targetLlmRunId: "failed-run",
          status: "failed",
        }),
        createEvaluation({
          targetLlmRunId: "result-failed-run",
          resultStatus: "failed",
        }),
        createEvaluation({
          targetLlmRunId: "unscored-run",
          simulationQualityScore: null,
        }),
        createEvaluation({
          targetLlmRunId: "superseded-run",
          attemptNumber: 1,
          legalPass: true,
          strategicPass: true,
          simulationQualityScore: 10,
        }),
        createEvaluation({
          targetLlmRunId: "superseded-run",
          attemptNumber: 2,
          status: "failed",
          legalPass: false,
          strategicPass: false,
          simulationQualityScore: 0,
        }),
      ],
      latestRuns: targetRuns.map((run) => createLatestRun(run)),
      targetRuns,
    })

  assert.equal(averageScoreBySimulation.size, 0)
})

test("builds benchmark simulation index entries with run counts and average score", () => {
  const childSimulation = createChildSimulation()
  const entryWithoutScores = buildBenchmarkSimulationIndexEntry({
    averageEvaluationScore: null,
    childSimulation,
    filePath: "benchmark-id/simulations/simulation-one.json",
    simulation: {
      status: "completed",
      turnsToSimulate: 5,
      simulatedTurnCount: 4,
    },
  })

  assert.deepEqual(entryWithoutScores, {
    simulationId: "simulation-one",
    deckId: "deck-one",
    deckName: "Deck One",
    deckIndex: 0,
    simulationIndex: 1,
    seed: "seed-one",
    status: "completed",
    turnsToSimulate: 5,
    simulatedTurnCount: 4,
    averageEvaluationScore: null,
    filePath: "benchmark-id/simulations/simulation-one.json",
  })

  const entryWithScore = buildBenchmarkSimulationIndexEntry({
    averageEvaluationScore: 8.5,
    childSimulation,
    filePath: "benchmark-id/simulations/simulation-one.json",
    simulation: {
      status: "failed",
      turnsToSimulate: 5,
      simulatedTurnCount: 2,
    },
  })

  assert.equal(entryWithScore.status, "failed")
  assert.equal(entryWithScore.turnsToSimulate, 5)
  assert.equal(entryWithScore.simulatedTurnCount, 2)
  assert.equal(entryWithScore.averageEvaluationScore, 8.5)
})

function createTargetRun(
  overrides: Partial<BenchmarkEvaluationTargetRun> = {}
): BenchmarkEvaluationTargetRun {
  return {
    deckId: "deck-one",
    simulationId: "simulation-one",
    targetLlmRunId: "target-run",
    targetRunPhase: "turn",
    turnNumber: 1,
    ...overrides,
  }
}

function createLatestRun(
  overrides: Partial<BenchmarkEvaluationLatestRunSnapshot> = {}
): BenchmarkEvaluationLatestRunSnapshot {
  return {
    deckId: "deck-one",
    simulationId: "simulation-one",
    targetLlmRunId: "target-run",
    targetRunPhase: "turn",
    turnNumber: 1,
    status: "completed",
    failureMessage: null,
    finalOutputText: "final output",
    openingHandIsValid: null,
    gameState: {},
    turnActions: {},
    ...overrides,
  }
}

function createEvaluation(
  overrides: Partial<BenchmarkEvaluationLatestEvaluationSnapshot> = {}
): BenchmarkEvaluationLatestEvaluationSnapshot {
  return {
    targetLlmRunId: "target-run",
    attemptNumber: 1,
    status: "completed",
    failureMessage: null,
    resultStatus: "completed",
    resultFailureMessage: null,
    legalPass: true,
    strategicPass: true,
    simulationQualityScore: 10,
    simulationQualityScoreReasoning: null,
    illegalActions: [],
    strategicMistakes: [],
    costUsd: null,
    ...overrides,
  }
}

function createChildSimulation(
  overrides: Partial<BenchmarkChildSimulation> = {}
): BenchmarkChildSimulation {
  return {
    benchmarkRunId: "benchmark-id",
    deckId: "deck-one",
    deckIndex: 0,
    deckName: "Deck One",
    simulationId: "simulation-one",
    simulationIndex: 1,
    seed: "seed-one",
    ...overrides,
  }
}
