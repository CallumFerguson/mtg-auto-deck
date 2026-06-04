import type {
  ActiveAdminSubscriptionTierGrant,
  BillingTier,
} from "@/lib/subscription-tiers"
import type {
  LlmProcessingMode,
  SimulationRunEvaluationResultStatus,
} from "@/lib/deck-types"

export type AdminUser = {
  activeAdminTierGrant: ActiveAdminSubscriptionTierGrant | null
  id: string
  email: string
  emailVerified: boolean
  effectiveTier: BillingTier
  name: string
  role: string | null
  banned: boolean
  banReason: string | null
  banExpires: string | null
  recentLlmRunCostUsd: number
  stripeTier: BillingTier
  totalLlmRunCostUsd: number
  createdAt: string
  updatedAt: string
}

export type AdminUsersResponse = {
  users: AdminUser[]
  total: number
  recentLlmRunCostUsd: number
  totalLlmRunCostUsd: number
}

export type AdminUserEmailVerificationResponse = {
  id: string
  email: string
  emailVerified: boolean
  updatedAt: string
}

export type AdminBenchmarkStatus =
  | "running"
  | "stopped"
  | "completed"
  | "failed"

export type AdminBenchmarkDeck = {
  id: string
  name: string
}

export type AdminBenchmark = {
  id: string
  llmModelPresetId: string
  llmModelPresetName: string | null
  llmModelPresetModel: string | null
  llmModelPresetProvider: string | null
  llmModelPresetReasoningEffort: string | null
  llmModelPresetOpenrouterModelProvider: string | null
  simulationsPerDeck: number
  turnsToSimulate: number
  llmProcessingMode: LlmProcessingMode
  useFlexServiceTier: boolean
  status: AdminBenchmarkStatus
  decks: AdminBenchmarkDeck[]
  totalSimulationCount: number
  pendingSimulationCount: number
  runningSimulationCount: number
  completedSimulationCount: number
  failedSimulationCount: number
  cancelledSimulationCount: number
  activeSimulationCount: number
  averageSimulatedTurnCount: number
  totalEstimatedCostUsd: number
  startedAt: string
  completedAt: string | null
  stoppedAt: string | null
  createdAt: string
  updatedAt: string
}

export type AdminBenchmarksResponse = {
  benchmarks: AdminBenchmark[]
  total: number
}

export type AdminBenchmarkSimulationStatus =
  | "pending"
  | "unmanaged"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"

export type AdminBenchmarkSimulation = {
  benchmarkRunId: string
  deckId: string
  deckIndex: number
  deckName: string
  simulationId: string
  simulationIndex: number
  seed: string
  status: AdminBenchmarkSimulationStatus
  createdAt: string
  updatedAt: string
}

export type AdminBenchmarkSimulationsResponse = {
  simulations: AdminBenchmarkSimulation[]
  total: number
}

export type AdminBenchmarkEvaluationSummary = {
  targetRunCount: number
  evaluationCount: number
  completedEvaluationCount: number
  activeEvaluationCount: number
  failedEvaluationCount: number
  averageSimulationQualityScore: number | null
  legalPassCount: number
  legalFailCount: number
  strategicPassCount: number
  strategicFailCount: number
  totalEvaluationCostUsd: number
  attentionResults: AdminBenchmarkEvaluationAttentionResult[]
  failedResults: AdminBenchmarkEvaluationFailedResult[]
}

export type AdminBenchmarkEvaluationAttentionResult = {
  deckId: string
  simulationId: string
  targetLlmRunId: string
  targetRunPhase: "opening_hand" | "turn"
  turnNumber: number | null
  attemptNumber: number
  legalPass: boolean | null
  strategicPass: boolean | null
  simulationQualityScore: number | null
  simulationQualityScoreReasoning: string | null
  illegalActions: string[]
  strategicMistakes: string[]
}

export type AdminBenchmarkEvaluationFailedResult = {
  deckId: string
  simulationId: string
  targetLlmRunId: string
  targetRunPhase: "opening_hand" | "turn"
  turnNumber: number | null
  attemptNumber: number
  status: string
  failureMessage: string | null
  resultStatus: SimulationRunEvaluationResultStatus
  resultFailureMessage: string | null
}

export type AdminBenchmarkEvaluationsResponse = {
  summary: AdminBenchmarkEvaluationSummary
}

export type StartAdminBenchmarkEvaluationsResponse = {
  summary: AdminBenchmarkEvaluationSummary
  startedEvaluationCount: number
  skippedRunCount: number
  errorCount: number
  errorMessage: string | null
}

export type CreateAdminBenchmarkResponse = {
  benchmark: AdminBenchmark
}

export type StopAdminBenchmarkResponse = {
  benchmark: AdminBenchmark | null
  stoppedSimulations: {
    simulationId: string
    stoppedLlmRunIds: string[]
    cancelRequestedLlmRunIds: string[]
  }[]
  errors: {
    deckId: string
    error: string
    simulationId: string
  }[]
}
