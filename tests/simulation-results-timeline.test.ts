import assert from "node:assert/strict"
import test from "node:test"

import type {
  SimulationDebugLlmRun,
  SimulationResultsInfo,
} from "../src/lib/deck-types.js"
import {
  buildSimulationResultsTimelineSteps,
  getSimulationResultsTimelineTurnFromSearchParams,
  resolveSimulationResultsTimelineSelection,
} from "../src/lib/simulation-results-timeline.js"

test("parses valid timeline turn query parameters", () => {
  assert.equal(
    getSimulationResultsTimelineTurnFromSearchParams(new URLSearchParams()),
    null
  )
  assert.equal(
    getSimulationResultsTimelineTurnFromSearchParams(
      new URLSearchParams("turn=0")
    ),
    0
  )
  assert.equal(
    getSimulationResultsTimelineTurnFromSearchParams(
      new URLSearchParams("turn=3")
    ),
    3
  )
  assert.equal(
    getSimulationResultsTimelineTurnFromSearchParams(
      new URLSearchParams("turn=001")
    ),
    1
  )
})

test("ignores invalid timeline turn query parameters", () => {
  for (const search of [
    "turn=",
    "turn=-1",
    "turn=1.5",
    "turn=abc",
    "turn=9007199254740992",
  ]) {
    assert.equal(
      getSimulationResultsTimelineTurnFromSearchParams(
        new URLSearchParams(search)
      ),
      null
    )
  }
})

test("resolves turn 0 to opening hand or preset opening hand", () => {
  const openingHandSteps = buildSimulationResultsTimelineSteps({
    hasPresetStartingHand: false,
    resultsInfo: createResultsInfo({
      openingHandLlmRuns: [
        createRun({
          attemptNumber: 1,
          llmRunId: "opening-attempt-1",
        }),
        createRun({
          attemptNumber: 2,
          llmRunId: "opening-attempt-2",
        }),
      ],
    }),
  })
  const presetSteps = buildSimulationResultsTimelineSteps({
    hasPresetStartingHand: true,
    resultsInfo: createResultsInfo(),
  })

  assert.equal(
    resolveSimulationResultsTimelineSelection(
      openingHandSteps,
      null,
      null,
      "latest",
      0
    ),
    "run:opening-attempt-2"
  )
  assert.equal(
    resolveSimulationResultsTimelineSelection(
      presetSteps,
      null,
      null,
      "latest",
      0
    ),
    "preset-opening-hand"
  )
})

test("resolves a requested turn to its latest attempt", () => {
  const steps = buildSimulationResultsTimelineSteps({
    hasPresetStartingHand: false,
    resultsInfo: createResultsInfo({
      turnLlmRuns: [
        createRun({
          attemptNumber: 1,
          llmRunId: "turn-1-attempt-1",
          phase: "turn",
          turnNumber: 1,
        }),
        createRun({
          attemptNumber: 2,
          llmRunId: "turn-1-attempt-2",
          phase: "turn",
          turnNumber: 1,
        }),
        createRun({
          attemptNumber: 1,
          llmRunId: "turn-2-attempt-1",
          phase: "turn",
          turnNumber: 2,
        }),
      ],
    }),
  })

  assert.equal(
    resolveSimulationResultsTimelineSelection(
      steps,
      null,
      null,
      "latest",
      1
    ),
    "run:turn-1-attempt-2"
  )
})

test("clamps oversized requested turns to the last available turn", () => {
  const steps = buildSimulationResultsTimelineSteps({
    hasPresetStartingHand: false,
    resultsInfo: createResultsInfo({
      openingHandLlmRuns: [
        createRun({
          llmRunId: "opening-attempt-1",
        }),
      ],
      turnLlmRuns: [
        createRun({
          llmRunId: "turn-1-attempt-1",
          phase: "turn",
          turnNumber: 1,
        }),
        createRun({
          llmRunId: "turn-3-attempt-1",
          phase: "turn",
          turnNumber: 3,
        }),
      ],
    }),
  })

  assert.equal(
    resolveSimulationResultsTimelineSelection(
      steps,
      null,
      null,
      "opening_hand",
      99
    ),
    "run:turn-3-attempt-1"
  )
})

test("falls back to existing defaults when no requested turn can be selected", () => {
  const steps = buildSimulationResultsTimelineSteps({
    hasPresetStartingHand: false,
    resultsInfo: createResultsInfo({
      openingHandLlmRuns: [
        createRun({
          llmRunId: "opening-attempt-1",
        }),
      ],
    }),
  })

  assert.equal(
    resolveSimulationResultsTimelineSelection(
      steps,
      null,
      null,
      "opening_hand",
      8
    ),
    "run:opening-attempt-1"
  )
})

test("marks completed runs with failed results as failed timeline steps", () => {
  const steps = buildSimulationResultsTimelineSteps({
    hasPresetStartingHand: false,
    resultsInfo: createResultsInfo({
      turnLlmRuns: [
        createRun({
          llmRunId: "turn-result-failed",
          phase: "turn",
          resultFailureMessage: "Turn LLM completed response was not valid JSON.",
          resultStatus: "failed",
          status: "completed",
          turnNumber: 1,
        }),
      ],
    }),
  })

  assert.equal(steps[0]?.status, "failed")
})

function createResultsInfo(
  overrides: Partial<SimulationResultsInfo> = {}
): SimulationResultsInfo {
  const openingHandLlmRuns = overrides.openingHandLlmRuns ?? []
  const turnLlmRuns = overrides.turnLlmRuns ?? []

  return {
    simulationId: "simulation-id",
    openingHandLlmRunCount: openingHandLlmRuns.length,
    turnLlmRunCount: turnLlmRuns.length,
    openingHandLlmRuns,
    turnLlmRuns,
    ...overrides,
  }
}

function createRun(
  overrides: Partial<SimulationDebugLlmRun> = {}
): SimulationDebugLlmRun {
  return {
    llmRunId: "run-id",
    llmModelPresetId: "preset-id",
    llmModelPresetName: null,
    processingMode: "realtime",
    phase: "opening_hand",
    provider: "openai",
    model: "gpt-test",
    estimatedPriceCents: null,
    reasoningEffort: "low",
    serviceTier: null,
    status: "completed",
    runtimeStreamKey: "runtime-key",
    attemptNumber: 1,
    failureMessage: null,
    resultStatus: "completed",
    resultFailureMessage: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    startedAt: "2026-01-01T00:00:01.000Z",
    completedAt: "2026-01-01T00:00:02.000Z",
    failedAt: null,
    cancelledAt: null,
    librarySnapshot: null,
    mcpFunctionCalls: [],
    openrouterGenerations: [],
    ...overrides,
  }
}
