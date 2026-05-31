import type {
  ActiveAdminSubscriptionTierGrant,
  BillingTier,
} from "@/lib/subscription-tiers"
import type { LlmProcessingMode } from "@/lib/deck-types"

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
