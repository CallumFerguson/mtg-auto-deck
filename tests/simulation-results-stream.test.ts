import assert from "node:assert/strict"
import test from "node:test"

import type {
  Simulation,
  SimulationDebugLlmRun,
  SimulationResultsInfo,
} from "../src/lib/deck-types.js"
import { getSimulationFinalParsedOutput } from "../src/lib/simulation-final-output.js"
import { applySimulationResultsStreamEvent } from "../src/lib/simulation-results-stream.js"

test("applies snapshot, run update, simulation update, and done events without incremental output events", () => {
  const snapshotResults = createResultsInfo({
    openingHandLlmRuns: [createRun({ llmRunId: "opening-1" })],
  })
  const snapshotSimulation = createSimulation({ status: "running" })
  const updatedRun = createRun({
    llmRunId: "opening-1",
    openingHand: ["Island", "Sol Ring"],
    status: "completed",
    summary: "A keepable opener.",
  })

  let results = applySimulationResultsStreamEvent(null, {
    type: "snapshot",
    simulation: snapshotSimulation,
    results: snapshotResults,
  })

  assert.equal(results?.openingHandLlmRuns[0].status, "streaming")

  results = applySimulationResultsStreamEvent(results, {
    type: "simulation_updated",
    simulation: createSimulation({ status: "completed" }),
  })

  assert.equal(results?.openingHandLlmRuns[0].status, "streaming")

  results = applySimulationResultsStreamEvent(results, {
    type: "llm_run_updated",
    run: updatedRun,
  })

  assert.equal(results?.openingHandLlmRuns[0].status, "completed")
  assert.deepEqual(results?.openingHandLlmRuns[0].openingHand, [
    "Island",
    "Sol Ring",
  ])

  results = applySimulationResultsStreamEvent(results, {
    type: "done",
    simulation: createSimulation({ status: "completed" }),
    results: createResultsInfo({
      openingHandLlmRuns: [updatedRun],
    }),
  })

  assert.equal(results?.openingHandLlmRuns[0].summary, "A keepable opener.")
})

test("merges streaming MCP function calls in called_at order", () => {
  const currentResults = createResultsInfo({
    turnLlmRuns: [
      createRun({
        llmRunId: "turn-1",
        phase: "turn",
        turnNumber: 1,
        mcpFunctionCalls: [
          createMcpFunctionCall({
            id: 20,
            calledAt: "2026-01-01T00:00:20.000Z",
            mcpFunctionName: "draw_card_from_top",
          }),
        ],
      }),
    ],
  })

  const updatedResults = applySimulationResultsStreamEvent(currentResults, {
    type: "llm_run_updated",
    run: createRun({
      llmRunId: "turn-1",
      phase: "turn",
      turnNumber: 1,
      mcpFunctionCalls: [
        createMcpFunctionCall({
          id: 21,
          calledAt: "2026-01-01T00:00:10.000Z",
          mcpFunctionName: "shuffle_library",
        }),
      ],
    }),
  })

  assert.deepEqual(
    updatedResults?.turnLlmRuns[0].mcpFunctionCalls.map(
      (call) => call.mcpFunctionName
    ),
    ["shuffle_library", "draw_card_from_top"]
  )
})

test("uses done results as authoritative MCP function call resync", () => {
  const currentResults = createResultsInfo({
    turnLlmRuns: [
      createRun({
        llmRunId: "turn-1",
        phase: "turn",
        turnNumber: 1,
        mcpFunctionCalls: [
          createMcpFunctionCall({
            id: 20,
            mcpFunctionName: "draw_card_from_top",
          }),
        ],
      }),
    ],
  })
  const finalResults = createResultsInfo({
    turnLlmRuns: [
      createRun({
        llmRunId: "turn-1",
        phase: "turn",
        turnNumber: 1,
        status: "completed",
        mcpFunctionCalls: [
          createMcpFunctionCall({
            id: 20,
            mcpFunctionName: "draw_card_from_top",
          }),
          createMcpFunctionCall({
            id: 21,
            mcpFunctionName: "shuffle_library",
          }),
        ],
      }),
    ],
  })

  const updatedResults = applySimulationResultsStreamEvent(currentResults, {
    type: "done",
    simulation: createSimulation({ status: "completed" }),
    results: finalResults,
  })

  assert.deepEqual(
    updatedResults?.turnLlmRuns[0].mcpFunctionCalls.map(
      (call) => call.mcpFunctionName
    ),
    ["draw_card_from_top", "shuffle_library"]
  )
})

test("reads opening-hand final output from run columns", () => {
  const finalOutput = getSimulationFinalParsedOutput(
    createRun({
      openingHand: ["Forest", "Llanowar Elves"],
      status: "completed",
      summary: "Fast mana and land make this a keep.",
    })
  )

  assert.deepEqual(finalOutput, {
    type: "opening_hand",
    keptHand: ["Forest", "Llanowar Elves"],
    summary: "Fast mana and land make this a keep.",
  })
})

test("reads turn final output from run columns", () => {
  const turnActions = {
    untap: [],
    upkeep: [],
    draw: ["Draw a card."],
    precombat_main: ["Play a Forest."],
    combat: [],
    postcombat_main: [],
    end_step_cleanup: [],
  }
  const gameState = {
    battlefield: [{ name: "Forest" }],
    hand: [],
  }
  const finalOutput = getSimulationFinalParsedOutput(
    createRun({
      phase: "turn",
      turnNumber: 1,
      status: "completed",
      gameState,
      turnActions,
    })
  )

  assert.deepEqual(finalOutput, {
    type: "turn",
    gameState,
    turnActions,
  })
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

function createSimulation(overrides: Partial<Simulation> = {}): Simulation {
  return {
    id: "simulation-id",
    deckId: "deck-id",
    createdVia: "app",
    llmModelPresetId: "preset-id",
    startingHandId: null,
    seed: "seed",
    library: [],
    turnsToSimulate: 1,
    reasoningSummariesEnabled: false,
    useFlexServiceTier: false,
    isPublic: false,
    simulatedTurnCount: 0,
    completedLlmRunCount: 0,
    activeLlmRunCount: 1,
    status: "running",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  }
}

function createRun(
  overrides: Partial<SimulationDebugLlmRun> = {}
): SimulationDebugLlmRun {
  return {
    llmRunId: "run-id",
    llmModelPresetId: "preset-id",
    phase: "opening_hand",
    provider: "openai",
    model: "gpt-test",
    estimatedPriceCents: null,
    reasoningEffort: "low",
    serviceTier: null,
    status: "streaming",
    runtimeStreamKey: "runtime-key",
    attemptNumber: 1,
    failureMessage: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    startedAt: "2026-01-01T00:00:01.000Z",
    completedAt: null,
    failedAt: null,
    cancelledAt: null,
    librarySnapshot: null,
    mcpFunctionCalls: [],
    openrouterGenerations: [],
    ...overrides,
  }
}

function createMcpFunctionCall(
  overrides: Partial<SimulationDebugLlmRun["mcpFunctionCalls"][number]> = {}
): SimulationDebugLlmRun["mcpFunctionCalls"][number] {
  return {
    id: 1,
    mcpFunctionName: "draw_card_from_top",
    status: "completed",
    inputPayload: { reason: "Test call" },
    outputPayload: { cards: ["Island"] },
    calledAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:00:01.000Z",
    ...overrides,
  }
}
