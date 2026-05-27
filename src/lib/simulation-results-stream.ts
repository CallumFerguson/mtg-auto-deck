import type {
  SimulationDebugLlmRun,
  SimulationResultsInfo,
  SimulationResultsStreamEvent,
} from "./deck-types"

type SimulationOpenRouterGeneration =
  SimulationDebugLlmRun["openrouterGenerations"][number]
type SimulationMcpFunctionCall =
  SimulationDebugLlmRun["mcpFunctionCalls"][number]

export function applySimulationResultsStreamEvent(
  currentResults: SimulationResultsInfo | null,
  streamEvent: SimulationResultsStreamEvent
) {
  if (streamEvent.type === "snapshot" || streamEvent.type === "done") {
    return streamEvent.results
  }

  if (streamEvent.type === "llm_run_started") {
    return upsertSimulationResultsRun(currentResults, streamEvent.run)
  }

  if (streamEvent.type === "llm_run_updated") {
    return upsertSimulationResultsRun(currentResults, streamEvent.run)
  }

  return currentResults
}

function upsertSimulationResultsRun(
  currentResults: SimulationResultsInfo | null,
  incomingRun: SimulationDebugLlmRun
) {
  if (!currentResults) {
    return currentResults
  }

  if (incomingRun.phase === "opening_hand") {
    const openingHandLlmRuns = upsertRun(
      currentResults.openingHandLlmRuns,
      incomingRun
    ).sort(compareOpeningHandRuns)

    return {
      ...currentResults,
      openingHandLlmRunCount: openingHandLlmRuns.length,
      openingHandLlmRuns,
    }
  }

  if (incomingRun.phase === "turn") {
    const turnLlmRuns = upsertRun(currentResults.turnLlmRuns, incomingRun).sort(
      compareTurnRuns
    )

    return {
      ...currentResults,
      turnLlmRunCount: turnLlmRuns.length,
      turnLlmRuns,
    }
  }

  return currentResults
}

function upsertRun(
  currentRuns: SimulationDebugLlmRun[],
  incomingRun: SimulationDebugLlmRun
) {
  const existingRun = currentRuns.find(
    (run) => run.llmRunId === incomingRun.llmRunId
  )

  if (!existingRun) {
    return [...currentRuns, normalizeRun(incomingRun)]
  }

  const mergedRun = {
    ...existingRun,
    ...incomingRun,
    openrouterGenerations: mergeOpenRouterGenerations(
      existingRun.openrouterGenerations ?? [],
      incomingRun.openrouterGenerations ?? []
    ),
    mcpFunctionCalls: mergeMcpFunctionCalls(
      existingRun.mcpFunctionCalls ?? [],
      incomingRun.mcpFunctionCalls ?? []
    ),
  }

  return currentRuns.map((run) =>
    run.llmRunId === incomingRun.llmRunId ? mergedRun : run
  )
}

function mergeOpenRouterGenerations(
  currentGenerations: readonly SimulationOpenRouterGeneration[] = [],
  incomingGenerations: readonly SimulationOpenRouterGeneration[] = []
) {
  const generationsByTurn = new Map<number, SimulationOpenRouterGeneration>()

  for (const generation of currentGenerations) {
    generationsByTurn.set(generation.openrouterTurnIndex, generation)
  }

  for (const generation of incomingGenerations) {
    generationsByTurn.set(generation.openrouterTurnIndex, generation)
  }

  return Array.from(generationsByTurn.values()).sort(
    (firstGeneration, secondGeneration) =>
      firstGeneration.openrouterTurnIndex - secondGeneration.openrouterTurnIndex
  )
}

function mergeMcpFunctionCalls(
  currentCalls: readonly SimulationMcpFunctionCall[] = [],
  incomingCalls: readonly SimulationMcpFunctionCall[] = []
) {
  const callsById = new Map<number, SimulationMcpFunctionCall>()

  for (const call of currentCalls) {
    callsById.set(call.id, call)
  }

  for (const call of incomingCalls) {
    callsById.set(call.id, call)
  }

  return Array.from(callsById.values()).sort(compareMcpFunctionCalls)
}

function normalizeRun(run: SimulationDebugLlmRun) {
  return {
    ...run,
    openrouterGenerations: mergeOpenRouterGenerations(
      [],
      run.openrouterGenerations ?? []
    ),
    mcpFunctionCalls: [...(run.mcpFunctionCalls ?? [])].sort(
      compareMcpFunctionCalls
    ),
  }
}

function compareMcpFunctionCalls(
  firstCall: SimulationMcpFunctionCall,
  secondCall: SimulationMcpFunctionCall
) {
  const calledAtComparison =
    Date.parse(firstCall.calledAt) - Date.parse(secondCall.calledAt)

  return calledAtComparison || firstCall.id - secondCall.id
}

function compareOpeningHandRuns(
  firstRun: SimulationDebugLlmRun,
  secondRun: SimulationDebugLlmRun
) {
  return firstRun.attemptNumber - secondRun.attemptNumber
}

function compareTurnRuns(
  firstRun: SimulationDebugLlmRun,
  secondRun: SimulationDebugLlmRun
) {
  return (
    (firstRun.turnNumber ?? 0) - (secondRun.turnNumber ?? 0) ||
    firstRun.attemptNumber - secondRun.attemptNumber
  )
}
