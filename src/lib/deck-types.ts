export type Deck = {
  id: string
  name: string
  description: string | null
  mulliganGuidelines: string | null
  strategyGuidelines: string | null
}

export type DeckCard = {
  deckCardId: number
  oracleId: string
  name: string
  quantity: number
  scryfallUri: string
  defaultImageUrl: string | null
  typeLine: string | null
}

export type DeckDetails = Deck & {
  commanders: DeckCard[]
  cards: DeckCard[]
}

export type DecksResponse = {
  decks: Deck[]
}

export type DeckResponse = {
  deck: DeckDetails
}

type SimulationStatus =
  | "pending"
  | "unmanaged"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"

type SimulationCreatedVia = "app" | "external_mcp"
export type LlmProcessingMode = "realtime" | "openai_batch"

export type Simulation = {
  id: string
  deckId: string
  createdVia: SimulationCreatedVia
  llmModelPresetId: string | null
  startingHandId: string | null
  seed: string
  library: string[]
  turnsToSimulate: number
  llmProcessingMode: LlmProcessingMode
  reasoningSummariesEnabled: boolean
  useFlexServiceTier: boolean
  autoSimulateNextStep: boolean
  simulatedTurnCount: number
  completedLlmRunCount: number
  activeLlmRunCount: number
  status: SimulationStatus
  createdAt: string
  updatedAt: string
}

export type SimulationsResponse = {
  simulations: Simulation[]
}

export type CreateSimulationResponse = {
  simulation: Simulation
}

export type UpdateSimulationResponse = {
  simulation: Simulation
}

export type StopSimulationResponse = {
  simulationId: string
  stoppedLlmRunIds: string[]
  cancelRequestedLlmRunIds: string[]
}

type OpenRouterGeneration = {
  openrouterTurnIndex: number
  generationId: string
  createdAt: string
}

export type SimulationMcpFunctionCall = {
  id: number
  mcpFunctionName: string
  status: "completed" | "failed"
  inputPayload: unknown
  outputPayload: unknown
  calledAt: string
  completedAt: string
}

export type SimulationDebugLlmRun = {
  llmRunId: string
  llmModelPresetId: string | null
  processingMode: LlmProcessingMode
  phase: string
  provider: string
  model: string
  estimatedPriceCents: string | null
  reasoningEffort: string | null
  serviceTier: string | null
  status: string
  runtimeStreamKey: string | null
  attemptNumber: number
  failureMessage: string | null
  createdAt: string
  startedAt: string | null
  completedAt: string | null
  failedAt: string | null
  cancelledAt: string | null
  turnNumber?: number
  openingHand?: string[]
  summary?: string | null
  turnActions?: unknown
  gameState?: unknown
  librarySnapshot?: string[] | null
  outdated?: boolean
  openingHandIsValid?: boolean
  mcpFunctionCalls: SimulationMcpFunctionCall[]
  openrouterGenerations: OpenRouterGeneration[]
}

type SimulationDebugLlmRunMetadata = {
  llmRunId: string
  llmModelPresetId: string | null
  processingMode: LlmProcessingMode
  phase: string
  provider: string
  model: string
  estimatedPriceCents: string | null
  reasoningEffort: string | null
  serviceTier: string | null
  status: string
  runtimeStreamKey: string | null
  attemptNumber: number
  failureMessage: string | null
  createdAt: string
  startedAt: string | null
  completedAt: string | null
  failedAt: string | null
  cancelledAt: string | null
  turnNumber?: number
  outdated?: boolean
  openingHandIsValid?: boolean
  openrouterGenerations: OpenRouterGeneration[]
}

export type SimulationDebugInfo = {
  simulationId: string
  deckId: string
  createdVia: SimulationCreatedVia
  llmModelPresetId: string | null
  startingHandId: string | null
  seed: string
  turnsToSimulate: number
  llmProcessingMode: LlmProcessingMode
  reasoningSummariesEnabled: boolean
  useFlexServiceTier: boolean
  autoSimulateNextStep: boolean
  simulatedTurnCount: number
  completedLlmRunCount: number
  activeLlmRunCount: number
  status: SimulationStatus
  createdAt: string
  updatedAt: string
  openingHandLlmRunCount: number
  turnLlmRunCount: number
  openingHandLlmRuns: SimulationDebugLlmRunMetadata[]
  turnLlmRuns: SimulationDebugLlmRunMetadata[]
}

export type SimulationDebugResponse = {
  debug: SimulationDebugInfo
}

export type SimulationResultsInfo = {
  simulationId: string
  openingHandLlmRunCount: number
  turnLlmRunCount: number
  openingHandLlmRuns: SimulationDebugLlmRun[]
  turnLlmRuns: SimulationDebugLlmRun[]
}

export type PublicSimulationExportV1 = {
  schemaVersion: 1
  exportedAt: string
  deck: DeckDetails
  simulation: Simulation
  startingHand: StartingHand | null
  results: SimulationResultsInfo
}

export type SimulationResultsStreamEvent =
  | {
      type: "snapshot"
      simulation: Simulation
      results: SimulationResultsInfo
    }
  | {
      type: "llm_run_started"
      run: SimulationDebugLlmRun
    }
  | {
      type: "llm_run_updated"
      run: SimulationDebugLlmRun
    }
  | {
      type: "simulation_updated"
      simulation: Simulation
    }
  | {
      type: "done"
      simulation: Simulation
      results: SimulationResultsInfo
    }
  | {
      type: "error"
      message: string
    }

type StartingHandCard = {
  deckCardId: number
  oracleId: string
  name: string
  quantity: number
  scryfallUri: string
  defaultImageUrl: string | null
  typeLine: string | null
}

export type StartingHand = {
  id: string
  deckId: string
  name: string
  cards: StartingHandCard[]
  isEnabled: boolean
  createdAt: string
  updatedAt: string
}

export type StartingHandsResponse = {
  startingHands: StartingHand[]
}

export type CreateStartingHandResponse = {
  startingHand: StartingHand
}

export type SavedSeed = {
  id: string
  deckId: string
  name: string
  seed: string
  isEnabled: boolean
  createdAt: string
  updatedAt: string
}

export type SavedSeedsResponse = {
  savedSeeds: SavedSeed[]
}

export type CreateSavedSeedResponse = {
  savedSeed: SavedSeed
}
