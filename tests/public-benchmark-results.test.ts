import assert from "node:assert/strict"
import test from "node:test"

import type { PublicBenchmarkResultsExportV1 } from "../src/lib/deck-types.js"
import {
  getPublicBenchmarkSelectedPanelFromSearch,
  isPublicBenchmarkResultsExportV1,
} from "../src/lib/public-benchmark-results.js"

test("validates public benchmark results exports", () => {
  assert.equal(isPublicBenchmarkResultsExportV1(createResultsExport()), true)
})

test("rejects malformed public benchmark results exports", () => {
  const malformedMissingMetrics = {
    ...createResultsExport(),
    resultMetrics: {
      ...createResultsExport().resultMetrics,
      mtgGoldfishScore: "91.5",
    },
  }
  const malformedDeckMetrics = {
    ...createResultsExport(),
    resultMetrics: {
      ...createResultsExport().resultMetrics,
      decks: [
        {
          ...createResultsExport().resultMetrics.decks[0],
          reasoningTokensPerAttemptedTurn: "1024",
        },
      ],
    },
  }

  assert.equal(isPublicBenchmarkResultsExportV1(malformedMissingMetrics), false)
  assert.equal(isPublicBenchmarkResultsExportV1(malformedDeckMetrics), false)
})

test("selects public benchmark results by default", () => {
  assert.equal(getPublicBenchmarkSelectedPanelFromSearch(""), "results")
  assert.equal(
    getPublicBenchmarkSelectedPanelFromSearch("?view=results"),
    "results"
  )
})

test("selects failed runs or simulations from public benchmark search params", () => {
  assert.equal(
    getPublicBenchmarkSelectedPanelFromSearch("?view=failed-evaluations"),
    "failed-evaluations"
  )
  assert.equal(
    getPublicBenchmarkSelectedPanelFromSearch("?simulation=simulation-one"),
    "simulation"
  )
  assert.equal(
    getPublicBenchmarkSelectedPanelFromSearch("?run=run-one"),
    "simulation"
  )
  assert.equal(
    getPublicBenchmarkSelectedPanelFromSearch("?turn=2"),
    "simulation"
  )
})

function createResultsExport(): PublicBenchmarkResultsExportV1 {
  return {
    schemaVersion: 1,
    exportedAt: "2026-06-04T12:00:00.000Z",
    benchmark: {
      id: "benchmark-one",
      llmModelPresetId: "preset-one",
      llmModelPresetName: "Test preset",
      llmModelPresetModel: "test-model",
      llmModelPresetProvider: "openai",
      llmModelPresetReasoningEffort: "medium",
      llmModelPresetOpenrouterModelProvider: null,
      simulationsPerDeck: 1,
      turnsToSimulate: 5,
      llmProcessingMode: "realtime",
      useFlexServiceTier: false,
      status: "completed",
      decks: [
        {
          id: "deck-one",
          name: "Deck One",
        },
      ],
      totalSimulationCount: 1,
      pendingSimulationCount: 0,
      runningSimulationCount: 0,
      completedSimulationCount: 1,
      failedSimulationCount: 0,
      cancelledSimulationCount: 0,
      activeSimulationCount: 0,
      averageSimulatedTurnCount: 5,
      startedAt: "2026-06-04T11:00:00.000Z",
      completedAt: "2026-06-04T12:00:00.000Z",
      stoppedAt: null,
      createdAt: "2026-06-04T10:00:00.000Z",
      updatedAt: "2026-06-04T12:00:00.000Z",
    },
    resultMetrics: {
      plannedOpeningHandCount: 1,
      plannedTurnCount: 5,
      attemptedTurnCount: 2,
      completedTurnCount: 1,
      mtgGoldfishScore: 25.7,
      openingHandScore: 90,
      turnScore: 14.4,
      completedEvaluationQualityAverage: 8.7,
      legalPassRate: 33.3,
      strategicPassRate: 50,
      completionRate: 20,
      totalRunCostUsd: 0.0421,
      costPerAttemptedTurn: 0.011,
      costPerCompletedTurn: 0.022,
      costPerGoldfishPoint: 0.0016,
      reasoningTokensPerAttemptedTurn: 1024.5,
      totalTokensPerAttemptedTurn: 4096,
      decks: [
        {
          deckId: "deck-one",
          deckName: "Deck One",
          deckIndex: 0,
          plannedSimulationCount: 1,
          mtgGoldfishScore: 25.7,
          completionRate: 20,
          legalPassRate: 33.3,
          strategicPassRate: 50,
          costPerAttemptedTurn: 0.011,
          reasoningTokensPerAttemptedTurn: 1024.5,
        },
      ],
    },
  }
}
