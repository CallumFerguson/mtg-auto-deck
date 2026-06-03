import assert from "node:assert/strict"
import test from "node:test"
import {
  SimulationResultsBroadcaster,
  formatSseEvent,
  redactSimulationResultsInfoCosts,
  redactSimulationResultsStreamEventCosts,
  type SimulationResultsStreamEvent,
  type SimulationResultsStreamInfo,
  type SimulationResultsStreamRun,
} from "./simulation-results-stream.js"
import type { SimulationSummary } from "./simulations-postgres.js"

test("formats stream events as JSON SSE messages", () => {
  const event: SimulationResultsStreamEvent = {
    type: "error",
    message: "Something failed.",
  }

  assert.equal(
    formatSseEvent(event),
    'data: {"type":"error","message":"Something failed."}\n\n'
  )
})

test("formats run library snapshots in stream events", () => {
  const event: SimulationResultsStreamEvent = {
    type: "llm_run_updated",
    run: {
      llmRunId: "turn-run",
      llmModelPresetId: "preset-test",
      llmModelPresetName: null,
      processingMode: "realtime",
      phase: "turn",
      provider: "openai",
      model: "gpt-test",
      estimatedPriceCents: null,
      reasoningEffort: "low",
      serviceTier: "priority",
      status: "completed",
      runtimeStreamKey: null,
      attemptNumber: 1,
      failureMessage: null,
      resultStatus: "completed",
      resultFailureMessage: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      startedAt: "2026-01-01T00:00:01.000Z",
      completedAt: "2026-01-01T00:00:02.000Z",
      failedAt: null,
      cancelledAt: null,
      turnNumber: 1,
      librarySnapshot: ["Forest", "Island"],
      mcpFunctionCalls: [],
      openrouterGenerations: [],
    },
  }

  assert.match(
    formatSseEvent(event),
    /"librarySnapshot":\["Forest","Island"\]/
  )
})

test("redacts snapshot and done run costs when costs are excluded", () => {
  const results = createResultsInfo({
    openingHandLlmRuns: [
      createRun({
        llmRunId: "opening-run",
        estimatedPriceCents: "1.2",
      }),
    ],
    turnLlmRuns: [
      createRun({
        llmRunId: "turn-run",
        estimatedPriceCents: "3.4",
        phase: "turn",
        turnNumber: 1,
      }),
    ],
  })
  const snapshotEvent: SimulationResultsStreamEvent = {
    type: "snapshot",
    simulation: createSimulation(),
    results,
  }
  const doneEvent: SimulationResultsStreamEvent = {
    type: "done",
    simulation: createSimulation({ status: "completed" }),
    results,
  }

  const redactedSnapshot = redactSimulationResultsStreamEventCosts(
    snapshotEvent,
    false
  )
  const redactedDone = redactSimulationResultsStreamEventCosts(doneEvent, false)

  assert.equal(redactedSnapshot.type, "snapshot")
  assert.equal(redactedDone.type, "done")

  if (redactedSnapshot.type !== "snapshot" || redactedDone.type !== "done") {
    assert.fail("Expected snapshot and done events.")
  }

  assert.equal(
    redactedSnapshot.results.openingHandLlmRuns[0].estimatedPriceCents,
    null
  )
  assert.equal(redactedSnapshot.results.turnLlmRuns[0].estimatedPriceCents, null)
  assert.equal(
    redactedDone.results.openingHandLlmRuns[0].estimatedPriceCents,
    null
  )
  assert.equal(redactedDone.results.turnLlmRuns[0].estimatedPriceCents, null)
})

test("redacts result info run costs for exported JSON", () => {
  const results = createResultsInfo({
    openingHandLlmRuns: [
      createRun({
        estimatedPriceCents: "1.2",
      }),
    ],
    turnLlmRuns: [
      createRun({
        estimatedPriceCents: "3.4",
        phase: "turn",
        turnNumber: 1,
      }),
    ],
  })

  const redactedResults = redactSimulationResultsInfoCosts(results)

  assert.equal(redactedResults.openingHandLlmRuns[0].estimatedPriceCents, null)
  assert.equal(redactedResults.turnLlmRuns[0].estimatedPriceCents, null)
  assert.equal(results.openingHandLlmRuns[0].estimatedPriceCents, "1.2")
  assert.equal(results.turnLlmRuns[0].estimatedPriceCents, "3.4")
})

test("redacts updated run costs when costs are excluded", () => {
  const event: SimulationResultsStreamEvent = {
    type: "llm_run_updated",
    run: createRun({
      estimatedPriceCents: "9.2",
      status: "completed",
    }),
  }

  const redactedEvent = redactSimulationResultsStreamEventCosts(event, false)

  assert.equal(redactedEvent.type, "llm_run_updated")

  if (redactedEvent.type !== "llm_run_updated") {
    assert.fail("Expected run update event.")
  }

  assert.equal(redactedEvent.run.estimatedPriceCents, null)
})

test("preserves run costs when costs are included", () => {
  const event: SimulationResultsStreamEvent = {
    type: "llm_run_updated",
    run: createRun({
      estimatedPriceCents: "9.2",
      status: "completed",
    }),
  }

  const includedEvent = redactSimulationResultsStreamEventCosts(event, true)

  assert.equal(includedEvent.type, "llm_run_updated")

  if (includedEvent.type !== "llm_run_updated") {
    assert.fail("Expected run update event.")
  }

  assert.equal(includedEvent.run.estimatedPriceCents, "9.2")
})

test("does not mutate original events when redacting run costs", () => {
  const event: SimulationResultsStreamEvent = {
    type: "snapshot",
    simulation: createSimulation(),
    results: createResultsInfo({
      openingHandLlmRuns: [
        createRun({
          estimatedPriceCents: "5.6",
        }),
      ],
    }),
  }

  const redactedEvent = redactSimulationResultsStreamEventCosts(event, false)

  assert.equal(event.type, "snapshot")
  assert.equal(redactedEvent.type, "snapshot")

  if (event.type !== "snapshot" || redactedEvent.type !== "snapshot") {
    assert.fail("Expected snapshot events.")
  }

  assert.equal(event.results.openingHandLlmRuns[0].estimatedPriceCents, "5.6")
  assert.equal(
    redactedEvent.results.openingHandLlmRuns[0].estimatedPriceCents,
    null
  )
  assert.notEqual(redactedEvent.results, event.results)
  assert.notEqual(
    redactedEvent.results.openingHandLlmRuns[0],
    event.results.openingHandLlmRuns[0]
  )
})

test("publishes events to active simulation subscribers immediately", () => {
  const broadcaster = new SimulationResultsBroadcaster()
  const writer = createWriter()

  broadcaster.subscribe("simulation-id", writer)
  broadcaster.publish("simulation-id", {
    type: "error",
    message: "Live event",
  })

  assert.equal(writer.writes.length, 1)
  assert.match(writer.writes[0], /Live event/)
})

test("redacts run costs per simulation subscriber", () => {
  const broadcaster = new SimulationResultsBroadcaster()
  const adminWriter = createWriter()
  const userWriter = createWriter()

  broadcaster.subscribe("simulation-id", adminWriter, {
    includeRunCosts: true,
  })
  broadcaster.subscribe("simulation-id", userWriter, {
    includeRunCosts: false,
  })
  broadcaster.publish("simulation-id", {
    type: "llm_run_updated",
    run: createRun({
      estimatedPriceCents: "7.8",
    }),
  })

  const adminEvent = parseSseEvent(adminWriter.writes[0])
  const userEvent = parseSseEvent(userWriter.writes[0])

  assert.equal(adminEvent.type, "llm_run_updated")
  assert.equal(userEvent.type, "llm_run_updated")

  if (
    adminEvent.type !== "llm_run_updated" ||
    userEvent.type !== "llm_run_updated"
  ) {
    assert.fail("Expected run update events.")
  }

  assert.equal(adminEvent.run.estimatedPriceCents, "7.8")
  assert.equal(userEvent.run.estimatedPriceCents, null)
})

test("unsubscribes closed simulation subscribers", () => {
  const broadcaster = new SimulationResultsBroadcaster()
  const writer = createWriter()
  const unsubscribe = broadcaster.subscribe("simulation-id", writer)

  assert.equal(broadcaster.getSubscriberCount("simulation-id"), 1)

  unsubscribe()

  assert.equal(broadcaster.getSubscriberCount("simulation-id"), 0)
})

test("closes and removes all subscribers for a completed simulation", () => {
  const broadcaster = new SimulationResultsBroadcaster()
  const firstWriter = createWriter()
  const secondWriter = createWriter()

  broadcaster.subscribe("simulation-id", firstWriter)
  broadcaster.subscribe("simulation-id", secondWriter)
  broadcaster.closeSimulation("simulation-id")

  assert.equal(firstWriter.endCount, 1)
  assert.equal(secondWriter.endCount, 1)
  assert.equal(broadcaster.getSubscriberCount("simulation-id"), 0)
})

function createSimulation(
  overrides: Partial<SimulationSummary> = {}
): SimulationSummary {
  return {
    id: "simulation-id",
    deckId: "deck-id",
    createdVia: "app",
    llmModelPresetId: "preset-id",
    startingHandId: null,
    seed: "seed",
    library: [],
    turnsToSimulate: 1,
    llmProcessingMode: "realtime",
    reasoningSummariesEnabled: false,
    useFlexServiceTier: false,
    autoSimulateNextStep: true,
    simulatedTurnCount: 0,
    completedLlmRunCount: 0,
    activeLlmRunCount: 1,
    status: "running",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  }
}

function createResultsInfo(
  overrides: Partial<SimulationResultsStreamInfo> = {}
): SimulationResultsStreamInfo {
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
  overrides: Partial<SimulationResultsStreamRun> = {}
): SimulationResultsStreamRun {
  return {
    llmRunId: "run-id",
    llmModelPresetId: "preset-test",
    llmModelPresetName: null,
    processingMode: "realtime",
    phase: "opening_hand",
    provider: "openai",
    model: "gpt-test",
    estimatedPriceCents: null,
    reasoningEffort: "low",
    serviceTier: "priority",
    status: "completed",
    runtimeStreamKey: null,
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

function parseSseEvent(data: string): SimulationResultsStreamEvent {
  return JSON.parse(
    data.replace(/^data: /, "").trim()
  ) as SimulationResultsStreamEvent
}

function createWriter() {
  return {
    endCount: 0,
    writes: [] as string[],
    write(data: string) {
      this.writes.push(data)
    },
    end() {
      this.endCount += 1
    },
  }
}
