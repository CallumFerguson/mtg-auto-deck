import assert from "node:assert/strict"
import test from "node:test"
import {
  buildBenchmarkExportAverageEvaluationScoreBySimulation,
  buildBenchmarkExportFailedEvaluations,
  buildBenchmarkExportSimulationWithEvaluations,
  buildBenchmarkSimulationIndexEntry,
  getBenchmarkExportSimulationRunIds,
  type BenchmarkExportRunEvaluation,
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

test("decorates benchmark simulation runs with latest completed evaluations", () => {
  const simulationExport = createBenchmarkSimulationExport({
    openingHandLlmRuns: [
      createBenchmarkSimulationRun({ llmRunId: "opening-run" }),
    ],
    turnLlmRuns: [createBenchmarkSimulationRun({ llmRunId: "turn-run" })],
  })
  const decorated = buildBenchmarkExportSimulationWithEvaluations({
    latestEvaluations: [
      createEvaluation({
        targetLlmRunId: "opening-run",
        attemptNumber: 1,
        legalPass: false,
        strategicPass: true,
        simulationQualityScore: 8.5,
        simulationQualityScoreReasoning: "Opening hand sequencing was legal.",
        illegalActions: ["Missed required reveal."],
        strategicMistakes: [],
        costUsd: 0.01,
      }),
      createEvaluation({
        targetLlmRunId: "turn-run",
        attemptNumber: 2,
        legalPass: true,
        strategicPass: false,
        simulationQualityScore: 7,
        simulationQualityScoreReasoning: "Turn line missed a stronger attack.",
        illegalActions: [],
        strategicMistakes: ["Attacked with the wrong creature."],
        costUsd: 0.02,
      }),
    ],
    simulationExport,
  })

  assert.deepEqual(getBenchmarkExportSimulationRunIds(decorated), [
    "opening-run",
    "turn-run",
  ])
  assert.deepEqual(
    decorated.results.openingHandLlmRuns[0]?.benchmarkEvaluation,
    {
      legalPass: false,
      strategicPass: true,
      simulationQualityScore: 8.5,
      simulationQualityScoreReasoning: "Opening hand sequencing was legal.",
      illegalActions: ["Missed required reveal."],
      strategicMistakes: [],
    }
  )
  assert.deepEqual(decorated.results.turnLlmRuns[0]?.benchmarkEvaluation, {
    legalPass: true,
    strategicPass: false,
    simulationQualityScore: 7,
    simulationQualityScoreReasoning: "Turn line missed a stronger attack.",
    illegalActions: [],
    strategicMistakes: ["Attacked with the wrong creature."],
  })

  const exportedEvaluation = decorated.results.turnLlmRuns[0]
    ?.benchmarkEvaluation as Record<string, unknown> | undefined

  assert.ok(exportedEvaluation)
  assert.equal("attemptNumber" in exportedEvaluation, false)
  assert.equal("targetLlmRunId" in exportedEvaluation, false)
  assert.equal("llmRunId" in exportedEvaluation, false)
  assert.equal("costUsd" in exportedEvaluation, false)
})

test("omits missing, incomplete, failed, result-failed, and superseded benchmark run evaluations", () => {
  const simulationExport = createBenchmarkSimulationExport({
    openingHandLlmRuns: [
      createBenchmarkSimulationRun({ llmRunId: "active-run" }),
      createBenchmarkSimulationRun({ llmRunId: "failed-run" }),
      createBenchmarkSimulationRun({ llmRunId: "result-failed-run" }),
    ],
    turnLlmRuns: [
      createBenchmarkSimulationRun({ llmRunId: "missing-run" }),
      createBenchmarkSimulationRun({ llmRunId: "superseded-run" }),
    ],
  })
  const decorated = buildBenchmarkExportSimulationWithEvaluations({
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
    simulationExport,
  })

  for (const run of [
    ...decorated.results.openingHandLlmRuns,
    ...decorated.results.turnLlmRuns,
  ]) {
    assert.equal(run.benchmarkEvaluation, undefined)
  }
})

test("leaves simulation exports undecorated when no benchmark evaluations exist", () => {
  const simulationExport = createBenchmarkSimulationExport({
    openingHandLlmRuns: [
      createBenchmarkSimulationRun({ llmRunId: "opening-run" }),
    ],
    turnLlmRuns: [createBenchmarkSimulationRun({ llmRunId: "turn-run" })],
  })
  const decorated = buildBenchmarkExportSimulationWithEvaluations({
    latestEvaluations: [],
    simulationExport,
  })
  const openingRun = decorated.results.openingHandLlmRuns[0]
  const turnRun = decorated.results.turnLlmRuns[0]

  assert.deepEqual(decorated, simulationExport)
  assert.ok(openingRun)
  assert.ok(turnRun)
  assert.equal("benchmarkEvaluation" in openingRun, false)
  assert.equal("benchmarkEvaluation" in turnRun, false)
})

test("builds failed benchmark evaluations with run context sorted by score", () => {
  const failedEvaluations = buildBenchmarkExportFailedEvaluations({
    latestEvaluations: [
      createEvaluation({
        targetLlmRunId: "turn-low-score",
        legalPass: true,
        strategicPass: false,
        simulationQualityScore: 2,
        simulationQualityScoreReasoning: "Missed the winning attack.",
        strategicMistakes: ["Held back lethal damage."],
        costUsd: 0.02,
      }),
      createEvaluation({
        targetLlmRunId: "opening-null-score",
        legalPass: false,
        strategicPass: true,
        simulationQualityScore: null,
        simulationQualityScoreReasoning: "Opening hand was illegal.",
        illegalActions: ["Kept eight cards."],
        costUsd: 0.01,
      }),
      createEvaluation({
        targetLlmRunId: "turn-mid-score",
        legalPass: false,
        strategicPass: false,
        simulationQualityScore: 6,
        simulationQualityScoreReasoning: "Illegal spell and weak sequencing.",
        illegalActions: ["Cast a spell without enough mana."],
        strategicMistakes: ["Sequenced draw after combat."],
      }),
      createEvaluation({
        targetLlmRunId: "turn-passing",
        legalPass: true,
        strategicPass: true,
        simulationQualityScore: 1,
      }),
    ],
    simulationFiles: [
      createBenchmarkSimulationFile({
        childSimulation: createChildSimulation({
          deckId: "deck-two",
          deckIndex: 1,
          deckName: "Deck Two",
          simulationId: "simulation-two",
          simulationIndex: 0,
          seed: "seed-two",
        }),
        filePath: "benchmark-id/simulations/simulation-two.json",
        value: createBenchmarkSimulationExport({
          turnLlmRuns: [
            createBenchmarkSimulationRun({
              llmRunId: "turn-mid-score",
              attemptNumber: 1,
              turnNumber: 2,
            }),
          ],
        }),
      }),
      createBenchmarkSimulationFile({
        childSimulation: createChildSimulation(),
        value: createBenchmarkSimulationExport({
          openingHandLlmRuns: [
            createBenchmarkSimulationRun({
              llmRunId: "opening-null-score",
              attemptNumber: 1,
            }),
          ],
          turnLlmRuns: [
            createBenchmarkSimulationRun({
              llmRunId: "turn-low-score",
              attemptNumber: 3,
              turnNumber: 1,
            }),
            createBenchmarkSimulationRun({
              llmRunId: "turn-passing",
              attemptNumber: 1,
              turnNumber: 2,
            }),
          ],
        }),
      }),
    ],
  })

  assert.deepEqual(
    failedEvaluations.map((evaluation) => evaluation.targetLlmRunId),
    ["turn-low-score", "turn-mid-score", "opening-null-score"]
  )
  assert.deepEqual(failedEvaluations[0], {
    simulationId: "simulation-one",
    deckId: "deck-one",
    deckName: "Deck One",
    deckIndex: 0,
    simulationIndex: 1,
    seed: "seed-one",
    filePath: "benchmark-id/simulations/simulation-one.json",
    targetLlmRunId: "turn-low-score",
    targetRunPhase: "turn",
    turnNumber: 1,
    resultLabel: "Turn 1",
    legalPass: true,
    strategicPass: false,
    simulationQualityScore: 2,
    simulationQualityScoreReasoning: "Missed the winning attack.",
    illegalActions: [],
    strategicMistakes: ["Held back lethal damage."],
  })

  const exportedEvaluation = failedEvaluations[0] as Record<string, unknown>

  assert.equal("attemptNumber" in exportedEvaluation, false)
  assert.equal("id" in exportedEvaluation, false)
  assert.equal("llmRunId" in exportedEvaluation, false)
  assert.equal("model" in exportedEvaluation, false)
  assert.equal("costUsd" in exportedEvaluation, false)
})

test("omits incomplete and superseded failed benchmark evaluations from failed export", () => {
  const failedEvaluations = buildBenchmarkExportFailedEvaluations({
    latestEvaluations: [
      createEvaluation({
        targetLlmRunId: "active-run",
        status: "streaming",
        legalPass: false,
        strategicPass: false,
      }),
      createEvaluation({
        targetLlmRunId: "result-failed-run",
        resultStatus: "failed",
        legalPass: false,
      }),
      createEvaluation({
        targetLlmRunId: "superseded-run",
        attemptNumber: 1,
        legalPass: false,
        strategicPass: false,
        simulationQualityScore: 1,
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
    simulationFiles: [
      createBenchmarkSimulationFile({
        value: createBenchmarkSimulationExport({
          turnLlmRuns: [
            createBenchmarkSimulationRun({ llmRunId: "active-run" }),
            createBenchmarkSimulationRun({ llmRunId: "result-failed-run" }),
            createBenchmarkSimulationRun({ llmRunId: "superseded-run" }),
          ],
        }),
      }),
    ],
  })

  assert.deepEqual(failedEvaluations, [])
})

test("builds an empty failed benchmark evaluations export when no evaluations fail", () => {
  const failedEvaluations = buildBenchmarkExportFailedEvaluations({
    latestEvaluations: [
      createEvaluation({
        targetLlmRunId: "passing-run",
        legalPass: true,
        strategicPass: true,
        simulationQualityScore: 10,
      }),
    ],
    simulationFiles: [
      createBenchmarkSimulationFile({
        value: createBenchmarkSimulationExport({
          turnLlmRuns: [
            createBenchmarkSimulationRun({ llmRunId: "passing-run" }),
          ],
        }),
      }),
    ],
  })

  assert.deepEqual(failedEvaluations, [])
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

type TestBenchmarkSimulationRun = {
  llmRunId: string
  attemptNumber: number
  turnNumber?: number
  benchmarkEvaluation?: BenchmarkExportRunEvaluation
}

function createBenchmarkSimulationExport({
  openingHandLlmRuns = [],
  turnLlmRuns = [],
}: {
  openingHandLlmRuns?: TestBenchmarkSimulationRun[]
  turnLlmRuns?: TestBenchmarkSimulationRun[]
} = {}) {
  return {
    schemaVersion: 1,
    results: {
      openingHandLlmRuns,
      turnLlmRuns,
    },
    simulation: {
      id: "simulation-one",
    },
  }
}

function createBenchmarkSimulationRun(
  overrides: Partial<TestBenchmarkSimulationRun> = {}
): TestBenchmarkSimulationRun {
  return {
    llmRunId: "run",
    attemptNumber: 1,
    ...overrides,
  }
}

function createBenchmarkSimulationFile(
  overrides: Partial<{
    childSimulation: BenchmarkChildSimulation
    filePath: string
    value: ReturnType<typeof createBenchmarkSimulationExport>
  }> = {}
) {
  return {
    childSimulation: createChildSimulation(),
    filePath: "benchmark-id/simulations/simulation-one.json",
    value: createBenchmarkSimulationExport(),
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
