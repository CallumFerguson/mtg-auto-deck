import "./environment.js"
import express, { type Express, type Request, type Response } from "express"
import { fromNodeHeaders, toNodeHandler } from "better-auth/node"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import { hostHeaderValidation } from "@modelcontextprotocol/sdk/server/middleware/hostHeaderValidation.js"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import { OpenRouter, stepCountIs, tool, type Tool } from "@openrouter/agent"
import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto"
import OpenAI from "openai"
import { z } from "zod/v4"
import {
  auth,
  ensureAuthSchema,
  hasValidEmailVerificationOtp,
  isPasswordResetTokenValid,
  refreshStripeBillingForUser,
} from "./auth.js"
import {
  ensureAdminSubscriptionTierGrantsSchema,
  getUserBillingTierSummary,
  revokeAdminSubscriptionTierGrant,
  setAdminSubscriptionTierGrant,
} from "./billing-tiers-postgres.js"
import {
  isAdminGrantBillingTier,
  type AdminGrantBillingTier,
} from "./subscription-tiers.js"
import {
  AUTO_ADMIN_EMAIL_ENVIRONMENT_VARIABLE,
  deleteAdminUser,
  getConfiguredAutoAdminEmail,
  listActiveAdminUserSimulations,
  listAdminUsers,
  promoteAdminUserByEmail,
} from "./admin-users-postgres.js"
import {
  createLlmModelPreset,
  deleteUnusedLlmModelPreset,
  ensureLlmModelPresetsSchema,
  getEnabledLlmModelPreset,
  listAdminLlmModelPresets,
  listEnabledLlmModelPresets,
  setDefaultLlmModelPreset,
  setLlmModelPresetEnabled,
  LlmModelPresetValidationError,
  type LlmModelPreset,
} from "./llm-model-presets-postgres.js"
import {
  closeDatabasePool,
  queryDatabase,
  verifyDatabaseConnection,
  withDatabaseTransaction,
} from "./db.js"
import {
  buildSimulateTurnPrompt,
  DRAW_STARTING_HAND_PROMPT,
} from "./llm/prompt-constants.js"
import { formatUserGuidelinesSection } from "./llm/user-guidelines.js"
import {
  createDeck,
  deleteDeck,
  ensureDecksSchema,
  getDeck,
  listDecks,
  updateDeckDetails,
} from "./decks-postgres.js"
import { ensureStarterDeckCopiesSchema } from "./starter-decks-postgres.js"
import { ensureFreshScryfallOracleCards } from "./scryfall-cache.js"
import {
  appendLlmRunChunkAtNextSequence,
  appendLlmRunChunk,
  appendLlmRunChunks,
  cancelLlmRun,
  cancelStaleInFlightLlmRuns,
  claimNextQueuedLlmRun,
  completeOpeningHandLlmRun,
  completeTurnLlmRun,
  createLlmRunMcpToken,
  createOpeningHandLlmRun,
  createSimulation,
  createTurnLlmRun,
  deleteSimulation,
  drawCardsFromBottom,
  drawCardsFromTop,
  drawStartingHand,
  ensureSimulationsSchema,
  failLlmRun,
  getActiveLlmRunMcpTokenContext,
  getPublicSimulationSummary,
  getSimulationCreationDecision,
  getSimulationDebugInfo,
  getSimulationResultsInfo,
  getSimulationSummary,
  getStartingHandSimulationPromptData,
  getTurnSimulationPromptData,
  isLlmRunStreaming,
  listActiveSimulationLlmRuns,
  listSimulationsForDeck,
  markLlmRunQueued,
  markSimulationCancelled,
  markSimulationCompleted,
  markSimulationFailed,
  mulliganSimulation,
  requestCancelSimulationLlmRuns,
  recordOpenRouterLlmRunGeneration,
  resetSimulationForOpeningHandLlmRun,
  returnCardToSimulationLibrary,
  returnCardsToSimulationLibrary,
  revokeLlmRunMcpToken,
  resolveSimulationIdentifier,
  setSimulationPublic,
  shuffleSimulationLibrary,
  SIMULATION_AUTO_ADVANCE_DISABLED_MESSAGE,
  SIMULATION_AUTO_ADVANCE_NOT_RUNNING_MESSAGE,
  SIMULATION_RESULTS_EXCLUDED_CHUNK_KINDS,
  SimulationValidationError,
  takeCardsFromSimulationLibrary,
  updateLlmRunRequestData,
  updateSimulation,
} from "./simulations-postgres.js"
import type {
  LlmRunChunkInput,
  LlmRunMcpTokenContext,
  LlmRunMcpTokenPhase,
  LlmRunPhase,
  LlmRunStatus,
  ClaimedQueuedLlmRun,
  LlmRunQueueClaimResult,
  OpenRouterGeneration,
  SimulationDebugLlmRunChunk,
  SimulationDebugLlmRun,
  SimulationLlmCompletionResult,
  SimulationPromptCard,
  SimulationResultsInfo,
  SimulationSummary,
  StartingHandSimulationPromptData,
  TurnSimulationPromptData,
} from "./simulations-postgres.js"
import {
  ensureUsageLimitsSchema,
  getUserUsageLimitStatus,
} from "./usage-limits-postgres.js"
import {
  createStartingHand,
  disableStartingHand,
  ensureStartingHandsSchema,
  getStartingHandForDeck,
  listStartingHandsForDeck,
  StartingHandValidationError,
} from "./starting-hands-postgres.js"
import {
  createSavedSeed,
  disableSavedSeed,
  ensureSavedSeedsSchema,
  listSavedSeedsForDeck,
  SavedSeedValidationError,
} from "./saved-seeds-postgres.js"
import {
  ProviderTerminalEventError,
  asRecord,
  createCancellationChunk,
  createFinalParsedOutputChunk,
  createServerErrorChunk,
  getCompletedResponseOutputText,
  getErrorMessage,
  getOpenRouterGenerationIdFromCompletedEvent,
  getStringProperty,
  isAbortError,
  isProviderTerminalEvent,
  normalizeOpenAiStreamEvent,
  normalizeOpenRouterStreamEvent,
  parseOpeningHandCompletionFromResponseText,
  parseTurnSimulationCompletionFromResponseText,
  type OpenRouterToolCallNameMap,
} from "./llm-run-events.js"
import {
  collectLlamaCppChatCompletion,
  createLlamaCppChatCompletionTools,
  type LlamaCppChatCompletionRequestPayload,
  type LlamaCppToolDefinition,
} from "./llamacpp-chat.js"
import {
  callWithRuntimeAbortSignal,
  createRuntimeAbortError,
  forEachRuntimeAbortableAsync,
  registerRuntimeAbortHandler,
  throwIfRuntimeAborted,
} from "./llm-runtime-cancellation.js"
import { runAuditedMcpFunctionCall } from "./mcp-function-call-audit.js"
import {
  buildOpenRouterReasoningOptions,
  buildProviderReasoningOptions,
  getGenericGameRulesReferenceEnabled,
  LlmConfigurationError,
  getLlmRunQueueConfig,
  getOpeningHandLlmRunConfig,
  getTurnSimulationLlmRunConfig,
  llmProviderSchema,
  reasoningEffortSchema,
  type OpenAiRunConfig,
  type OpenRouterRunConfig,
  type OpeningHandLlmRunConfig,
  type OpeningHandOpenAiRunConfig,
  type ResolvedLlamaCppRunConfig,
  type ResolvedOpeningHandLlmRunConfig,
  type ResolvedTurnSimulationLlmRunConfig,
  type TurnSimulationLlmRunConfig,
  type TurnSimulationOpenAiRunConfig,
  type LlmRunQueueConfig,
} from "./llm-config.js"
import {
  SimulationStopTimeoutError,
  waitForSimulationStopCompletions,
} from "./simulation-stop.js"
import {
  SimulationResultsBroadcaster,
  formatSseComment,
  formatSseEvent,
  type SimulationResultsStreamChunk,
  type SimulationResultsStreamEvent,
  type SimulationResultsStreamInfo,
  type SimulationResultsStreamRun,
} from "./simulation-results-stream.js"
import {
  aggregateOpenRouterUsage,
  applyLlmRunEstimatedCostServiceTierDiscount,
  estimatePresetTokenCostUsd,
  formatUsdCostAsCentLabel,
  getOpenRouterReportedCostUsd,
  type TokenPrice,
} from "./llm-pricing.js"
import {
  createExactScryfallOracleCardMatchMap,
  normalizeScryfallCardNameForExactMatch,
  resolveExactScryfallOracleCards,
} from "./scryfall-postgres.js"

const DEFAULT_HOST = "127.0.0.1"
const DEFAULT_PORT = 3001
const SERVER_NAME = "mtg-auto-deck-server"
const OPENING_HAND_SERVER_NAME = "opening-hand-server"
const TURN_SIMULATION_SERVER_NAME = "turn-simulation-server"
const OPENING_HAND_MCP_PATH = "/mcp/opening-hand"
const TURN_SIMULATION_MCP_PATH = "/mcp/turn-simulation"
const AUTH_PATH_PREFIX = "/api/auth"
const APP_SIGN_UP_PATH = "/api/app-auth/sign-up"
const APP_EMAIL_VERIFICATION_CODE_PATH = "/api/app-auth/email-verification-code"
const APP_PASSWORD_RESET_TOKEN_PATH =
  "/api/app-auth/password-reset-token/:token"
const OPENING_HAND_MCP_SERVER_LABEL = "opening_hand"
const TURN_SIMULATION_MCP_SERVER_LABEL = "turn_simulation"
const STREAM_FLUSH_INTERVAL_MS = 1000
const STREAM_RECENT_CHUNK_LIMIT = 500
const SSE_KEEPALIVE_INTERVAL_MS = 15000
const LLM_RUN_QUEUE_POLL_INTERVAL_MS = 1000
const MCP_RUN_TOKEN_TTL_MS = 6 * 60 * 60 * 1000
const QUEUED_MCP_RUN_TOKEN_PLACEHOLDER = "queued"
const LOOPBACK_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://[::1]:5173",
]
const LOOPBACK_ALLOWED_HOSTNAMES = ["localhost", "127.0.0.1", "[::1]"]
const DEFAULT_ALLOWED_HEADERS = [
  "Content-Type",
  "Accept",
  "Authorization",
  "Last-Event-ID",
  "Mcp-Session-Id",
  "Mcp-Protocol-Version",
]
const DECK_GUIDELINES_MAX_LENGTH = 1000

const llmRunIdSchema = z
  .string()
  .trim()
  .min(1)
  .describe("The LLM Run ID from the prompt.")
const llmRunIdentifierSchema = {
  llmRunId: llmRunIdSchema,
}
const createDeckSchema = z.object({
  name: z.string().trim().min(1),
  desc: z.string(),
  mulliganGuidelines: createDeckGuidelinesSchema(),
  strategyGuidelines: createDeckGuidelinesSchema(),
  commanders: z.array(z.string().trim().min(1)).min(1).max(2),
  cards: z.array(
    z.object({
      name: z.string().trim().min(1),
      quantity: z.number().int().positive(),
    })
  ),
})
const appSignUpSchema = z.object({
  email: z.email(),
  password: z.string().min(8).max(128),
})
const passwordResetTokenSchema = z.string().trim().min(1).max(256)
const updateDeckDetailsSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string(),
  mulliganGuidelines: createDeckGuidelinesSchema(),
  strategyGuidelines: createDeckGuidelinesSchema(),
})

function createDeckGuidelinesSchema() {
  return z.string().max(DECK_GUIDELINES_MAX_LENGTH).default("")
}

const createStartingHandSchema = z.object({
  name: z.string().trim().min(1),
  cards: z
    .array(
      z.object({
        deckCardId: z.number().int().positive(),
        quantity: z.number().int().positive(),
      })
    )
    .min(1),
})
const createSavedSeedSchema = z.object({
  name: z.string().trim().min(1),
  seed: z.string().trim().min(1),
})
const createSimulationSchema = z.object({
  seed: z.string().trim().min(1),
  llmModelPresetId: z.uuid(),
  turnsToSimulate: z.number().int().nonnegative(),
  reasoningSummariesEnabled: z.boolean().default(false),
  useFlexServiceTier: z.boolean().default(false),
  startingHandId: z.uuid().nullable(),
})
const updateSimulationSchema = z
  .object({
    llmModelPresetId: z.uuid().optional(),
    reasoningSummariesEnabled: z.boolean().optional(),
    useFlexServiceTier: z.boolean().optional(),
  })
  .refine(
    (update) =>
      update.llmModelPresetId !== undefined ||
      update.reasoningSummariesEnabled !== undefined ||
      update.useFlexServiceTier !== undefined
  )
const updateSimulationPublicSchema = z.object({
  isPublic: z.boolean(),
})
const optionalTokenCostSchema = z
  .number()
  .finite()
  .nonnegative()
  .nullable()
  .default(null)
const createLlmModelPresetSchema = z.object({
  provider: llmProviderSchema,
  model: z.string().trim().min(1),
  reasoningEffort: reasoningEffortSchema,
  openrouterModelProvider: z.string().trim().nullable().default(null),
  supportsFlex: z.boolean().default(false),
  inputTokenCostUsdPerMillion: optionalTokenCostSchema,
  cachedInputTokenCostUsdPerMillion: optionalTokenCostSchema,
  outputTokenCostUsdPerMillion: optionalTokenCostSchema,
  isEnabled: z.boolean().default(true),
  isDefault: z.boolean().default(false),
})
const updateLlmModelPresetEnabledSchema = z.object({
  isEnabled: z.boolean(),
})
const setDefaultLlmModelPresetSchema = z.object({
  presetId: z.uuid().nullable(),
})
const adminSubscriptionTierGrantSchema = z.object({
  days: z.number().int().min(1).max(3650),
  tier: z
    .string()
    .trim()
    .refine(isAdminGrantBillingTier),
})
const createTurnLlmRunSchema = z.object({
  turnNumber: z.number().int().positive(),
})

type ActiveLlmRunRuntime = {
  abortController: AbortController
  attemptNumber: number
  chunkBuffer: LlmRunChunkInput[]
  completionPromise: Promise<void>
  createdAt: string
  deckId: string
  flushTimer: NodeJS.Timeout | null
  flushPromise: Promise<void> | null
  llmRunId: string
  llmModelPresetId: string
  model: string
  fullPrompt: string
  nextSequence: number
  openrouterGenerations: OpenRouterGeneration[]
  phase: LlmRunPhase
  provider: string
  reasoningEffort: string | null
  serviceTier: string | null
  recentChunks: SimulationResultsStreamChunk[]
  resolveCompletion: () => void
  runtimeStreamKey: string
  simulationId: string
  startedAt: string | null
  status: LlmRunStatus
  turnNumber?: number
}

type AuthenticatedUser = {
  email: string
  emailVerified: boolean
  id: string
  impersonatedBy?: string | null
  role?: string | null
}

type GeneratedMcpRunToken = {
  expiresAt: Date
  token: string
  tokenHash: string
}

const activeLlmRunRuntimes = new Map<string, ActiveLlmRunRuntime>()
const simulationResultsBroadcaster = new SimulationResultsBroadcaster()
const publicSimulationResultsBroadcaster = new SimulationResultsBroadcaster()
const authenticatedUsersByRequest = new WeakMap<Request, AuthenticatedUser>()
const publicSimulationIds = new Set<string>()
let llmRunQueueConfig: LlmRunQueueConfig | null = null
let llmRunQueueDrainTimer: NodeJS.Timeout | null = null
let llmRunQueueDrainPromise: Promise<void> | null = null

function createRuntimeCompletion() {
  let resolveCompletion: () => void = () => { }
  const completionPromise = new Promise<void>((resolve) => {
    resolveCompletion = resolve
  })

  return {
    completionPromise,
    resolveCompletion,
  }
}

function isTerminalSimulationStatus(status: SimulationSummary["status"]) {
  return (
    status === "completed" ||
    status === "failed" ||
    status === "cancelled" ||
    status === "unmanaged"
  )
}

function shouldStreamSimulationResultsChunk(chunk: LlmRunChunkInput) {
  return !SIMULATION_RESULTS_EXCLUDED_CHUNK_KINDS.includes(chunk.kind)
}

function createRuntimeStreamChunk(
  chunk: LlmRunChunkInput
): SimulationResultsStreamChunk {
  return {
    id: null,
    sequence: chunk.sequence,
    kind: chunk.kind,
    mcpFunctionName: chunk.mcpFunctionName,
    mcpFunctionOutput: chunk.mcpFunctionOutput,
    mcpFunctionReason: chunk.mcpFunctionReason,
    reasoningDelta: chunk.reasoningDelta,
    outputDelta: chunk.outputDelta,
    payload: chunk.payload ?? null,
    receivedAt: new Date().toISOString(),
  }
}

function rememberRuntimeStreamChunk(
  runtime: ActiveLlmRunRuntime,
  chunk: SimulationResultsStreamChunk
) {
  runtime.recentChunks.push(chunk)

  if (runtime.recentChunks.length > STREAM_RECENT_CHUNK_LIMIT) {
    runtime.recentChunks.splice(
      0,
      runtime.recentChunks.length - STREAM_RECENT_CHUNK_LIMIT
    )
  }
}

function rememberRuntimeOpenRouterGeneration(
  runtime: ActiveLlmRunRuntime,
  generation: OpenRouterGeneration
) {
  const existingGenerationIndex = runtime.openrouterGenerations.findIndex(
    (existingGeneration) =>
      existingGeneration.openrouterTurnIndex === generation.openrouterTurnIndex
  )

  if (existingGenerationIndex === -1) {
    runtime.openrouterGenerations.push(generation)
  } else {
    runtime.openrouterGenerations[existingGenerationIndex] = generation
  }

  runtime.openrouterGenerations.sort(
    (firstGeneration, secondGeneration) =>
      firstGeneration.openrouterTurnIndex - secondGeneration.openrouterTurnIndex
  )
}

function createStreamRunFromRuntime(
  runtime: ActiveLlmRunRuntime,
  chunks = runtime.recentChunks
): SimulationResultsStreamRun {
  return {
    llmRunId: runtime.llmRunId,
    llmModelPresetId: runtime.llmModelPresetId,
    phase: runtime.phase,
    provider: runtime.provider,
    model: runtime.model,
    estimatedPriceCents: null,
    reasoningEffort: runtime.reasoningEffort,
    serviceTier: runtime.serviceTier,
    status: runtime.status,
    runtimeStreamKey: runtime.runtimeStreamKey,
    attemptNumber: runtime.attemptNumber,
    failureMessage: null,
    createdAt: runtime.createdAt,
    startedAt: runtime.startedAt,
    completedAt: null,
    failedAt: null,
    cancelledAt: null,
    turnNumber: runtime.turnNumber,
    openrouterGenerations: runtime.openrouterGenerations,
    chunks,
  }
}

function createStreamRunFromPersistedRun(
  run: SimulationDebugLlmRun
): SimulationResultsStreamRun {
  return {
    ...run,
    chunks: run.chunks.map((chunk) => ({
      ...chunk,
      id: chunk.id,
    })),
  }
}

function createStreamResultsInfo(
  results: SimulationResultsInfo
): SimulationResultsStreamInfo {
  return {
    ...results,
    openingHandLlmRuns: results.openingHandLlmRuns.map(
      createStreamRunFromPersistedRun
    ),
    turnLlmRuns: results.turnLlmRuns.map(createStreamRunFromPersistedRun),
  }
}

function mergeActiveRuntimeChunksIntoResults(
  results: SimulationResultsStreamInfo,
  simulationId: string
): SimulationResultsStreamInfo {
  let mergedResults = results

  for (const runtime of activeLlmRunRuntimes.values()) {
    if (runtime.simulationId !== simulationId) {
      continue
    }

    mergedResults = upsertStreamRun(
      mergedResults,
      createStreamRunFromRuntime(runtime)
    )
  }

  return mergedResults
}

function upsertStreamRun(
  results: SimulationResultsStreamInfo,
  incomingRun: SimulationResultsStreamRun
): SimulationResultsStreamInfo {
  if (incomingRun.phase === "opening_hand") {
    const openingHandLlmRuns = upsertStreamRunInList(
      results.openingHandLlmRuns,
      incomingRun
    ).sort(compareOpeningHandStreamRuns)

    return {
      ...results,
      openingHandLlmRunCount: openingHandLlmRuns.length,
      openingHandLlmRuns,
    }
  }

  if (incomingRun.phase === "turn") {
    const turnLlmRuns = upsertStreamRunInList(
      results.turnLlmRuns,
      incomingRun
    ).sort(compareTurnStreamRuns)

    return {
      ...results,
      turnLlmRunCount: turnLlmRuns.length,
      turnLlmRuns,
    }
  }

  return results
}

function upsertStreamRunInList(
  runs: readonly SimulationResultsStreamRun[],
  incomingRun: SimulationResultsStreamRun
) {
  const existingRun = runs.find((run) => run.llmRunId === incomingRun.llmRunId)

  if (!existingRun) {
    return [
      ...runs,
      {
        ...incomingRun,
        openrouterGenerations: mergeOpenRouterGenerations(
          [],
          incomingRun.openrouterGenerations ?? []
        ),
        chunks: [...incomingRun.chunks].sort(compareStreamChunks),
      },
    ]
  }

  const mergedRun = {
    ...incomingRun,
    ...existingRun,
    status: incomingRun.status,
    openrouterGenerations: mergeOpenRouterGenerations(
      existingRun.openrouterGenerations ?? [],
      incomingRun.openrouterGenerations ?? []
    ),
    chunks: mergeStreamChunks(existingRun.chunks, incomingRun.chunks),
  }

  return runs.map((run) =>
    run.llmRunId === incomingRun.llmRunId ? mergedRun : run
  )
}

function mergeStreamChunks(
  existingChunks: readonly SimulationResultsStreamChunk[],
  incomingChunks: readonly SimulationResultsStreamChunk[]
) {
  const chunksBySequence = new Map<number, SimulationResultsStreamChunk>()

  for (const chunk of existingChunks) {
    chunksBySequence.set(chunk.sequence, chunk)
  }

  for (const chunk of incomingChunks) {
    const existingChunk = chunksBySequence.get(chunk.sequence)

    if (!existingChunk || existingChunk.id === null || chunk.id !== null) {
      chunksBySequence.set(chunk.sequence, chunk)
    }
  }

  return Array.from(chunksBySequence.values()).sort(compareStreamChunks)
}

function mergeOpenRouterGenerations(
  existingGenerations: readonly OpenRouterGeneration[] = [],
  incomingGenerations: readonly OpenRouterGeneration[] = []
) {
  const generationsByTurn = new Map<number, OpenRouterGeneration>()

  for (const generation of existingGenerations) {
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

function compareStreamChunks(
  firstChunk: SimulationResultsStreamChunk,
  secondChunk: SimulationResultsStreamChunk
) {
  return firstChunk.sequence - secondChunk.sequence
}

function compareOpeningHandStreamRuns(
  firstRun: SimulationResultsStreamRun,
  secondRun: SimulationResultsStreamRun
) {
  return firstRun.attemptNumber - secondRun.attemptNumber
}

function compareTurnStreamRuns(
  firstRun: SimulationResultsStreamRun,
  secondRun: SimulationResultsStreamRun
) {
  return (
    (firstRun.turnNumber ?? 0) - (secondRun.turnNumber ?? 0) ||
    firstRun.attemptNumber - secondRun.attemptNumber
  )
}

function findStreamRun(results: SimulationResultsStreamInfo, llmRunId: string) {
  return (
    results.openingHandLlmRuns.find((run) => run.llmRunId === llmRunId) ??
    results.turnLlmRuns.find((run) => run.llmRunId === llmRunId) ??
    null
  )
}

async function getSimulationResultsStreamSnapshot(
  deckId: string,
  simulationId: string
) {
  const simulation = await getSimulationSummary(deckId, simulationId)

  if (!simulation) {
    throw new SimulationValidationError("Simulation not found.")
  }

  const results = mergeActiveRuntimeChunksIntoResults(
    createStreamResultsInfo(
      await getSimulationResultsInfo(deckId, simulationId)
    ),
    simulationId
  )

  return {
    simulation,
    results,
  }
}

async function getPublicSimulationResultsStreamSnapshot(simulationId: string) {
  const simulation = await getPublicSimulationSummary(simulationId)

  if (!simulation) {
    throw new SimulationValidationError("Simulation not found.")
  }

  publicSimulationIds.add(simulationId)

  const results = mergeActiveRuntimeChunksIntoResults(
    createStreamResultsInfo(
      await getSimulationResultsInfo(simulation.deckId, simulationId)
    ),
    simulationId
  )

  return {
    simulation,
    results,
  }
}

function publishRuntimeChunk(
  runtime: ActiveLlmRunRuntime,
  chunk: LlmRunChunkInput
) {
  if (!shouldStreamSimulationResultsChunk(chunk)) {
    return
  }

  const streamChunk = createRuntimeStreamChunk(chunk)

  publishRuntimeStreamChunk(runtime, streamChunk)
}

function publishRuntimeStreamChunk(
  runtime: ActiveLlmRunRuntime,
  streamChunk: SimulationResultsStreamChunk
) {
  rememberRuntimeStreamChunk(runtime, streamChunk)
  simulationResultsBroadcaster.publish(runtime.simulationId, {
    type: "chunk",
    llmRunId: runtime.llmRunId,
    chunk: streamChunk,
  })
  publishPublicSimulationResultsEvent(runtime.simulationId, {
    type: "chunk",
    llmRunId: runtime.llmRunId,
    chunk: streamChunk,
  })
}

async function publishSimulationResultsState({
  deckId,
  llmRunId,
  simulationId,
}: {
  deckId: string
  simulationId: string
  llmRunId?: string
}) {
  try {
    const snapshot = await getSimulationResultsStreamSnapshot(
      deckId,
      simulationId
    )

    if (llmRunId) {
      const run = findStreamRun(snapshot.results, llmRunId)

      if (run) {
        const event: SimulationResultsStreamEvent = {
          type: "llm_run_updated",
          run,
        }

        simulationResultsBroadcaster.publish(simulationId, event)
        publishPublicSimulationResultsEvent(simulationId, event)
      }
    }

    const simulationUpdatedEvent: SimulationResultsStreamEvent = {
      type: "simulation_updated",
      simulation: snapshot.simulation,
    }

    if (snapshot.simulation.isPublic) {
      publicSimulationIds.add(simulationId)
    } else {
      closePublicSimulationSubscribers(simulationId)
    }

    simulationResultsBroadcaster.publish(simulationId, simulationUpdatedEvent)
    publishPublicSimulationResultsEvent(simulationId, simulationUpdatedEvent)

    if (
      isTerminalSimulationStatus(snapshot.simulation.status) &&
      snapshot.simulation.activeLlmRunCount === 0
    ) {
      const doneEvent: SimulationResultsStreamEvent = {
        type: "done",
        simulation: snapshot.simulation,
        results: snapshot.results,
      }

      simulationResultsBroadcaster.publish(simulationId, doneEvent)
      publishPublicSimulationResultsEvent(simulationId, doneEvent)
      simulationResultsBroadcaster.closeSimulation(simulationId)
      publicSimulationResultsBroadcaster.closeSimulation(simulationId)
    }
  } catch (error) {
    console.error("Failed to publish simulation results stream state:", error)
  }
}

function publishPublicSimulationResultsEvent(
  simulationId: string,
  event: SimulationResultsStreamEvent
) {
  if (!publicSimulationIds.has(simulationId)) {
    return
  }

  publicSimulationResultsBroadcaster.publish(simulationId, event)
}

function closePublicSimulationSubscribers(
  simulationId: string,
  message?: string
) {
  if (message) {
    publicSimulationResultsBroadcaster.publish(simulationId, {
      type: "error",
      message,
    })
  }

  publicSimulationResultsBroadcaster.closeSimulation(simulationId)
  publicSimulationIds.delete(simulationId)
}

function logLlmApiCallStarted({
  llmRunId,
  model,
  phase,
  provider,
}: {
  llmRunId: string
  model: string
  phase: LlmRunPhase
  provider: string
}) {
  console.log(
    `${formatProviderName(provider)} API call started: phase=${phase} llmRunId=${llmRunId} model=${model}`
  )
}

function logLlmApiCallFinished({
  llmRunId,
  model,
  phase,
  provider,
  serviceTier,
  tokenCosts,
  usage,
}: {
  llmRunId: string
  model: string
  phase: LlmRunPhase
  provider: string
  serviceTier?: string | null
  tokenCosts: TokenPrice
  usage: unknown
}) {
  const tokenUsage = getLlmTokenUsageSummary(usage)
  const estimatedCostUsd = applyLlmRunEstimatedCostServiceTierDiscount({
    estimatedCostUsd: estimatePresetTokenCostUsd({
      tokenCosts,
      usage,
    }),
    serviceTier,
  })
  const openrouterReportedCostUsd =
    provider === "openrouter" ? getOpenRouterReportedCostUsd(usage) : null

  console.log(
    `${formatProviderName(provider)} API call finished: phase=${phase} llmRunId=${llmRunId} model=${model} totalTokens=${tokenUsage.total} inputTokens=${tokenUsage.input} cachedInputTokens=${tokenUsage.cachedInput} reasoningTokens=${tokenUsage.reasoning} outputTokens=${tokenUsage.output} estimatedCost=${formatLlmApiCallCost(estimatedCostUsd)} openrouterCost=${formatLlmApiCallCost(openrouterReportedCostUsd)}`
  )
}

function formatLlmApiCallCost(costUsd: number | null) {
  return formatUsdCostAsCentLabel(costUsd) ?? "null"
}

function logLlmApiCallCancelled({
  llmRunId,
  phase,
  provider,
}: {
  llmRunId: string
  phase: LlmRunPhase
  provider: string
}) {
  console.log(
    `${formatProviderName(provider)} API call cancelled: phase=${phase} llmRunId=${llmRunId}`
  )
}

function logLlmApiCallStoppedWithError({
  error,
  llmRunId,
  phase,
  provider,
}: {
  error: unknown
  llmRunId: string
  phase: LlmRunPhase
  provider: string
}) {
  console.error(
    `${formatProviderName(provider)} API call stopped with error: phase=${phase} llmRunId=${llmRunId} error=${getErrorMessage(error)}`,
    error
  )
}

function getLlmTokenUsageSummary(usage: unknown) {
  const usageRecord = asRecord(usage)
  const inputTokens = getNumberProperty(
    usageRecord,
    "input_tokens",
    "inputTokens",
    "prompt_tokens",
    "promptTokens"
  )
  const inputDetails = asRecord(
    usageRecord.input_tokens_details ??
    usageRecord.inputTokensDetails ??
    usageRecord.prompt_tokens_details ??
    usageRecord.promptTokensDetails
  )
  const cachedInputTokens =
    inputTokens === null
      ? null
      : Math.min(
        getNumberProperty(inputDetails, "cached_tokens", "cachedTokens") ?? 0,
        inputTokens
      )
  const outputTokens = getNumberProperty(
    usageRecord,
    "output_tokens",
    "outputTokens",
    "completion_tokens",
    "completionTokens"
  )
  const outputDetails = asRecord(
    usageRecord.output_tokens_details ??
    usageRecord.outputTokensDetails ??
    usageRecord.completion_tokens_details ??
    usageRecord.completionTokensDetails
  )
  const reasoningTokens =
    getNumberProperty(outputDetails, "reasoning_tokens", "reasoningTokens") ?? 0
  const visibleOutputTokens =
    outputTokens === null ? null : Math.max(outputTokens - reasoningTokens, 0)
  const totalTokens =
    getNumberProperty(usageRecord, "total_tokens", "totalTokens") ??
    sumTokenCounts([
      getNumberProperty(
        usageRecord,
        "input_tokens",
        "inputTokens",
        "prompt_tokens",
        "promptTokens"
      ),
      reasoningTokens,
      visibleOutputTokens,
    ])

  return {
    input: formatTokenCount(inputTokens),
    cachedInput: formatTokenCount(cachedInputTokens),
    output: formatTokenCount(visibleOutputTokens),
    reasoning: formatTokenCount(reasoningTokens),
    total: formatTokenCount(totalTokens),
  }
}

function getNumberProperty(
  record: Record<string, unknown>,
  ...properties: string[]
) {
  for (const property of properties) {
    const value = record[property]

    if (typeof value === "number" && Number.isFinite(value)) {
      return value
    }
  }

  return null
}

function formatProviderName(provider: string) {
  if (provider === "openai") {
    return "OpenAI"
  }

  if (provider === "openrouter") {
    return "OpenRouter"
  }

  if (provider === "llamacpp") {
    return "llama.cpp"
  }

  return provider
}

function sumTokenCounts(tokenCounts: Array<number | null>) {
  if (tokenCounts.some((tokenCount) => tokenCount === null)) {
    return null
  }

  return tokenCounts.reduce<number>(
    (sum, tokenCount) => sum + (tokenCount ?? 0),
    0
  )
}

function formatTokenCount(tokenCount: number | null) {
  return tokenCount === null ? "unknown" : String(tokenCount)
}

function createServer(
  name: string,
  registerTools: (server: McpServer) => void
) {
  const server = new McpServer(
    {
      name,
      version: "0.0.1",
    },
    {
      capabilities: {
        logging: {},
      },
    }
  )

  registerTools(server)

  return server
}

function createToolResultContent(message: string, data: unknown) {
  return [
    {
      type: "text" as const,
      text: JSON.stringify(
        {
          message,
          data,
        },
        null,
        2
      ),
    },
  ]
}

type LlmRunIdentifier = {
  llmRunId: string
}

type McpSimulationIdentifierInput = {
  llmRunId?: string
  reason?: string
}
type McpDrawCardsInput = McpSimulationIdentifierInput & {
  count: number
}
type McpFlipCoinInput = McpSimulationIdentifierInput & {
  count?: number
}
type McpRollDiceInput = McpSimulationIdentifierInput & {
  count: number
  sides: number
}
type McpMulliganInput = McpSimulationIdentifierInput & {
  reason: string
}
type McpReturnCardInput = McpSimulationIdentifierInput & {
  card: string
  side: "top" | "bottom"
  position: number
}
type McpReturnCardsInput = McpSimulationIdentifierInput & {
  cards: string[]
  side: "top" | "bottom"
  randomizeOrder: boolean
}
type McpTakeCardsInput = McpSimulationIdentifierInput & {
  cards: string[]
}

type McpToolResponse = {
  content: ReturnType<typeof createToolResultContent>
}

type McpToolHandler<TInput extends McpSimulationIdentifierInput> = (
  input: TInput
) => Promise<McpToolResponse>

type McpSimulationIdentifierConfig = {
  authContext?: LlmRunMcpTokenContext
  inputSchema: typeof llmRunIdentifierSchema
  requireReason: boolean
}

const llmRunMcpIdentifier: McpSimulationIdentifierConfig = {
  inputSchema: llmRunIdentifierSchema,
  requireReason: true,
}

function createAuditedMcpToolHandler<TInput extends McpSimulationIdentifierInput>(
  mcpFunctionName: string,
  identifier: McpSimulationIdentifierConfig,
  handler: McpToolHandler<TInput>
) {
  return async (input: TInput) =>
    runAuditedMcpFunctionCall({
      authContext: identifier.authContext,
      getOutputPayload: getMcpToolAuditOutput,
      handler: () => handler(input),
      inputPayload: input,
      mcpFunctionName,
    })
}

async function resolveMcpSimulationId(
  input: McpSimulationIdentifierInput,
  authContext?: LlmRunMcpTokenContext
) {
  if (authContext) {
    const llmRunId = input.llmRunId?.trim()

    if (llmRunId && llmRunId !== authContext.llmRunId) {
      throw new Error("MCP run token does not match the requested LLM run.")
    }

    return authContext.simulationId
  }

  throw new Error("MCP run authentication is required.")
}

const mcpShortReasonSchema = z
  .string()
  .trim()
  .min(1)
  .describe("A short explanation of why this tool call is being made.")
const randomizerCountSchema = z
  .number()
  .int()
  .min(1)
  .max(100)
  .describe("How many results to generate. Must be between 1 and 100.")
const diceSidesSchema = z
  .number()
  .int()
  .min(2)
  .max(1000)
  .describe("How many sides each die has. Must be between 2 and 1000.")

function addMcpReasonToToolResult<T extends object>(
  identifier: McpSimulationIdentifierConfig,
  input: McpSimulationIdentifierInput,
  response: T
) {
  return identifier.requireReason && typeof input.reason === "string"
    ? {
      ...response,
      reason: input.reason.trim(),
    }
    : response
}

type CoinFlipResult = "win" | "lose"

function flipCoins(count: number) {
  const results: CoinFlipResult[] = []

  for (let index = 0; index < count; index += 1) {
    results.push(randomInt(2) === 0 ? "win" : "lose")
  }

  const wins = results.filter((result) => result === "win").length

  return {
    results,
    wins,
    losses: results.length - wins,
  }
}

function rollDice(count: number, sides: number) {
  const rolls: number[] = []

  for (let index = 0; index < count; index += 1) {
    rolls.push(randomInt(1, sides + 1))
  }

  return {
    rolls,
    total: rolls.reduce((sum, roll) => sum + roll, 0),
    sides,
  }
}

function createOpeningHandServer(authContext?: LlmRunMcpTokenContext) {
  const identifier = {
    ...llmRunMcpIdentifier,
    authContext,
  }

  return createServer(OPENING_HAND_SERVER_NAME, (server) => {
    registerDrawStartingHandTool(server, identifier)
    registerMulliganTool(server, identifier)
    registerReturnCardsToLibraryTool(server, identifier)
  })
}

function createTurnSimulationServer(authContext?: LlmRunMcpTokenContext) {
  const identifier = {
    ...llmRunMcpIdentifier,
    authContext,
  }

  return createServer(TURN_SIMULATION_SERVER_NAME, (server) => {
    registerDrawCardFromTopTool(server, identifier)
    registerDrawCardFromBottomTool(server, identifier)
    registerTakeCardsFromLibraryTool(server, identifier)
    registerReturnCardToLibraryTool(server, identifier)
    registerReturnCardsToLibraryTool(server, identifier)
    registerShuffleLibraryTool(server, identifier)
    registerFlipCoinTool(server, identifier)
    registerRollDiceTool(server, identifier)
  })
}

function registerDrawCardFromTopTool(
  server: McpServer,
  identifier: McpSimulationIdentifierConfig
) {
  server.registerTool(
    "draw_card_from_top",
    {
      title: "Draw Card From Top",
      description:
        "Draw one or more cards from the top of the stored library for an existing simulation.",
      inputSchema: {
        ...identifier.inputSchema,
        ...(identifier.requireReason ? { reason: mcpShortReasonSchema } : {}),
        count: z.number().int().positive().describe("How many cards to draw."),
      },
    },
    createAuditedMcpToolHandler(
      "draw_card_from_top",
      identifier,
      async (input: McpDrawCardsInput) => {
        const resolvedSimulationId = await resolveMcpSimulationId(
          input,
          identifier.authContext
        )
        const { count } = input
        const response = await drawCardsFromTop(resolvedSimulationId, count)

        return {
          content: createToolResultContent(
            `Drew ${response.cards.length} card(s) from the top. ${response.cardsRemaining} card(s) remain.`,
            addMcpReasonToToolResult(identifier, input, response)
          ),
        }
      }
    )
  )
}

function registerDrawCardFromBottomTool(
  server: McpServer,
  identifier: McpSimulationIdentifierConfig
) {
  server.registerTool(
    "draw_card_from_bottom",
    {
      title: "Draw Card From Bottom",
      description:
        "Draw one or more cards from the bottom of the stored library for an existing simulation.",
      inputSchema: {
        ...identifier.inputSchema,
        ...(identifier.requireReason ? { reason: mcpShortReasonSchema } : {}),
        count: z.number().int().positive().describe("How many cards to draw."),
      },
    },
    createAuditedMcpToolHandler(
      "draw_card_from_bottom",
      identifier,
      async (input: McpDrawCardsInput) => {
        const resolvedSimulationId = await resolveMcpSimulationId(
          input,
          identifier.authContext
        )
        const { count } = input
        const response = await drawCardsFromBottom(resolvedSimulationId, count)

        return {
          content: createToolResultContent(
            `Drew ${response.cards.length} card(s) from the bottom. ${response.cardsRemaining} card(s) remain.`,
            addMcpReasonToToolResult(identifier, input, response)
          ),
        }
      }
    )
  )
}

function registerDrawStartingHandTool(
  server: McpServer,
  identifier: McpSimulationIdentifierConfig
) {
  server.registerTool(
    "draw_starting_hand",
    {
      title: "Draw Starting Hand",
      description:
        "Draw the very first opening seven-card hand from the stored library for an existing simulation. Call this exactly once per simulation, before any mulligans. Never call this after mulligan, because mulligan already shuffles and draws the replacement seven-card hand.",
      inputSchema: {
        ...identifier.inputSchema,
        ...(identifier.requireReason ? { reason: mcpShortReasonSchema } : {}),
      },
    },
    createAuditedMcpToolHandler(
      "draw_starting_hand",
      identifier,
      async (input: McpSimulationIdentifierInput) => {
        const resolvedSimulationId = await resolveMcpSimulationId(
          input,
          identifier.authContext
        )
        const response = await drawStartingHand(resolvedSimulationId)

        return {
          content: createToolResultContent(
            `Drew the starting hand. ${response.cardsRemaining} card(s) remain in the library.`,
            addMcpReasonToToolResult(identifier, input, response)
          ),
        }
      }
    )
  )
}

function registerMulliganTool(
  server: McpServer,
  identifier: McpSimulationIdentifierConfig
) {
  server.registerTool(
    "mulligan",
    {
      title: "Mulligan",
      description:
        "Return the current opening hand to the library, shuffle, and draw a fresh seven-card hand. This can only be called after the starting hand has been drawn. Important: this tool already draws and returns the replacement hand, so do not call draw_starting_hand after using this tool.",
      inputSchema: {
        ...identifier.inputSchema,
        reason: z
          .string()
          .trim()
          .min(1)
          .describe(
            "A short explanation of why this hand is being mulliganed."
          ),
      },
    },
    createAuditedMcpToolHandler(
      "mulligan",
      identifier,
      async (input: McpMulliganInput) => {
        const resolvedSimulationId = await resolveMcpSimulationId(
          input,
          identifier.authContext
        )
        const { reason } = input
        const response = await mulliganSimulation(resolvedSimulationId, reason)

        return {
          content: createToolResultContent(
            `Mulligan ${response.mulliganCount}: drew a replacement seven-card hand. ${response.cardsRemaining} card(s) remain. ${response.reminder}`,
            response
          ),
        }
      }
    )
  )
}

function registerReturnCardToLibraryTool(
  server: McpServer,
  identifier: McpSimulationIdentifierConfig
) {
  server.registerTool(
    "return_card_to_library",
    {
      title: "Return Card To Library",
      description:
        "Return a card to the library for an existing simulation, placing it a specific number of cards from the top or bottom.",
      inputSchema: {
        ...identifier.inputSchema,
        ...(identifier.requireReason ? { reason: mcpShortReasonSchema } : {}),
        card: z
          .string()
          .trim()
          .min(1)
          .describe("The card name to put back into the library."),
        side: z
          .enum(["top", "bottom"])
          .describe(
            "Whether the position is measured from the top or the bottom of the library."
          ),
        position: z
          .number()
          .int()
          .nonnegative()
          .describe(
            "How many cards should remain above the card if using top, or below the card if using bottom. Position 0 puts it directly on that end. For example, if you want the card 3rd from the top, use side top, position 2."
          ),
      },
    },
    createAuditedMcpToolHandler(
      "return_card_to_library",
      identifier,
      async (input: McpReturnCardInput) => {
        const resolvedSimulationId = await resolveMcpSimulationId(
          input,
          identifier.authContext
        )
        const { card, position, side } = input
        const response = await returnCardToSimulationLibrary({
          simulationId: resolvedSimulationId,
          card,
          side,
          position,
        })

        return {
          content: createToolResultContent(
            `Returned ${JSON.stringify(response.card)} to the ${side} of the library. ${response.cardsRemaining} card(s) remain.`,
            addMcpReasonToToolResult(identifier, input, response)
          ),
        }
      }
    )
  )
}

function registerReturnCardsToLibraryTool(
  server: McpServer,
  identifier: McpSimulationIdentifierConfig
) {
  server.registerTool(
    "return_cards_to_library",
    {
      title: "Return Cards To Library",
      description:
        "Return multiple cards to the top or bottom of the library for an existing simulation, optionally randomizing the order they are returned in.",
      inputSchema: {
        ...identifier.inputSchema,
        ...(identifier.requireReason ? { reason: mcpShortReasonSchema } : {}),
        cards: z
          .array(z.string().trim().min(1))
          .min(1)
          .describe(
            "The cards to put back into the library. If randomizeOrder is false, they are inserted in list order, so the last card becomes the outermost card on the chosen side."
          ),
        side: z
          .enum(["top", "bottom"])
          .describe("Which end of the library to return the cards to."),
        randomizeOrder: z
          .boolean()
          .describe(
            "Whether to shuffle the returned cards before putting them back."
          ),
      },
    },
    createAuditedMcpToolHandler(
      "return_cards_to_library",
      identifier,
      async (input: McpReturnCardsInput) => {
        const resolvedSimulationId = await resolveMcpSimulationId(
          input,
          identifier.authContext
        )
        const { cards, randomizeOrder, side } = input
        const response = await returnCardsToSimulationLibrary({
          simulationId: resolvedSimulationId,
          cards,
          side,
          randomizeOrder,
        })

        return {
          content: createToolResultContent(
            `Returned ${response.cards.length} card(s) to the ${side} of the library. ${response.cardsRemaining} card(s) remain.`,
            addMcpReasonToToolResult(identifier, input, response)
          ),
        }
      }
    )
  )
}

function registerTakeCardsFromLibraryTool(
  server: McpServer,
  identifier: McpSimulationIdentifierConfig
) {
  server.registerTool(
    "take_cards_from_library",
    {
      title: "Take Cards From Library",
      description:
        "Take one or more specific cards out of the stored library for tutor and search effects. Each requested name uses the best reasonably close fuzzy match, ignoring case and punctuation. If no close enough match exists, that request returns no card.",
      inputSchema: {
        ...identifier.inputSchema,
        ...(identifier.requireReason ? { reason: mcpShortReasonSchema } : {}),
        cards: z
          .array(z.string().trim().min(1))
          .min(1)
          .describe(
            "The card names to remove from the library. Each request is matched independently against the current remaining library."
          ),
      },
    },
    createAuditedMcpToolHandler(
      "take_cards_from_library",
      identifier,
      async (input: McpTakeCardsInput) => {
        const resolvedSimulationId = await resolveMcpSimulationId(
          input,
          identifier.authContext
        )
        const { cards } = input
        const response = await takeCardsFromSimulationLibrary(
          resolvedSimulationId,
          cards
        )

        return {
          content: createToolResultContent(
            `Found and removed ${response.foundCards.length} requested card(s). ${response.cardsRemaining} card(s) remain.`,
            addMcpReasonToToolResult(identifier, input, response)
          ),
        }
      }
    )
  )
}

function registerShuffleLibraryTool(
  server: McpServer,
  identifier: McpSimulationIdentifierConfig
) {
  server.registerTool(
    "shuffle_library",
    {
      title: "Shuffle Library",
      description: "Shuffle the stored library for an existing simulation.",
      inputSchema: {
        ...identifier.inputSchema,
        ...(identifier.requireReason ? { reason: mcpShortReasonSchema } : {}),
      },
    },
    createAuditedMcpToolHandler(
      "shuffle_library",
      identifier,
      async (input: McpSimulationIdentifierInput) => {
        const resolvedSimulationId = await resolveMcpSimulationId(
          input,
          identifier.authContext
        )
        const response = await shuffleSimulationLibrary(resolvedSimulationId)

        return {
          content: createToolResultContent(
            `Shuffled the library. ${response.cardsRemaining} card(s) remain.`,
            addMcpReasonToToolResult(identifier, input, response)
          ),
        }
      }
    )
  )
}

function registerFlipCoinTool(
  server: McpServer,
  identifier: McpSimulationIdentifierConfig
) {
  server.registerTool(
    "flip_coin",
    {
      title: "Flip Coin",
      description:
        'Flip one or more fair coins for Magic card effects that care about winning or losing a flip. Each result is "win" or "lose".',
      inputSchema: {
        ...identifier.inputSchema,
        ...(identifier.requireReason ? { reason: mcpShortReasonSchema } : {}),
        count: randomizerCountSchema
          .default(1)
          .describe(
            "How many coins to flip. Defaults to 1. Must be between 1 and 100."
          ),
      },
    },
    createAuditedMcpToolHandler(
      "flip_coin",
      identifier,
      async (input: McpFlipCoinInput) => {
        await resolveMcpSimulationId(input, identifier.authContext)
        const response = flipCoins(input.count ?? 1)

        return {
          content: createToolResultContent(
            `Flipped ${response.results.length} coin(s): ${response.wins} win(s), ${response.losses} loss(es).`,
            addMcpReasonToToolResult(identifier, input, response)
          ),
        }
      }
    )
  )
}

function registerRollDiceTool(
  server: McpServer,
  identifier: McpSimulationIdentifierConfig
) {
  server.registerTool(
    "roll_dice",
    {
      title: "Roll Dice",
      description:
        "Roll one or more fair dice with a configurable number of sides for Magic card effects that instruct you to roll dice.",
      inputSchema: {
        ...identifier.inputSchema,
        ...(identifier.requireReason ? { reason: mcpShortReasonSchema } : {}),
        count: randomizerCountSchema,
        sides: diceSidesSchema,
      },
    },
    createAuditedMcpToolHandler(
      "roll_dice",
      identifier,
      async (input: McpRollDiceInput) => {
        await resolveMcpSimulationId(input, identifier.authContext)
        const response = rollDice(input.count, input.sides)

        return {
          content: createToolResultContent(
            `Rolled ${response.rolls.length} d${response.sides}: total ${response.total}.`,
            addMcpReasonToToolResult(identifier, input, response)
          ),
        }
      }
    )
  )
}

const openingHandLlmToolDefinitions: LlamaCppToolDefinition[] = [
  {
    name: "draw_starting_hand",
    description:
      "Draw the very first opening seven-card hand from the stored library for an existing simulation. Call this exactly once per simulation, before any mulligans. Never call this after mulligan, because mulligan already shuffles and draws the replacement seven-card hand.",
    inputSchema: z.object({
      ...llmRunIdentifierSchema,
      reason: mcpShortReasonSchema,
    }),
  },
  {
    name: "mulligan",
    description:
      "Return the current opening hand to the library, shuffle, and draw a fresh seven-card hand. This can only be called after the starting hand has been drawn. Important: this tool already draws and returns the replacement hand, so do not call draw_starting_hand after using this tool.",
    inputSchema: z.object({
      ...llmRunIdentifierSchema,
      reason: z
        .string()
        .trim()
        .min(1)
        .describe("A short explanation of why this hand is being mulliganed."),
    }),
  },
  {
    name: "return_cards_to_library",
    description:
      "Return multiple cards to the top or bottom of the library for an existing simulation, optionally randomizing the order they are returned in.",
    inputSchema: z.object({
      ...llmRunIdentifierSchema,
      reason: mcpShortReasonSchema,
      cards: z
        .array(z.string().trim().min(1))
        .min(1)
        .describe(
          "The cards to put back into the library. If randomizeOrder is false, they are inserted in list order, so the last card becomes the outermost card on the chosen side."
        ),
      side: z
        .enum(["top", "bottom"])
        .describe("Which end of the library to return the cards to."),
      randomizeOrder: z
        .boolean()
        .describe(
          "Whether to shuffle the returned cards before putting them back."
        ),
    }),
  },
]

const turnSimulationLibraryLlmToolDefinitions: LlamaCppToolDefinition[] = [
  {
    name: "draw_card_from_top",
    description:
      "Draw one or more cards from the top of the stored library for an existing simulation.",
    inputSchema: z.object({
      ...llmRunIdentifierSchema,
      reason: mcpShortReasonSchema,
      count: z.number().int().positive().describe("How many cards to draw."),
    }),
  },
  {
    name: "draw_card_from_bottom",
    description:
      "Draw one or more cards from the bottom of the stored library for an existing simulation.",
    inputSchema: z.object({
      ...llmRunIdentifierSchema,
      reason: mcpShortReasonSchema,
      count: z.number().int().positive().describe("How many cards to draw."),
    }),
  },
  {
    name: "take_cards_from_library",
    description:
      "Take one or more specific cards out of the stored library for tutor and search effects. Each requested name uses the best reasonably close fuzzy match, ignoring case and punctuation. If no close enough match exists, that request returns no card.",
    inputSchema: z.object({
      ...llmRunIdentifierSchema,
      reason: mcpShortReasonSchema,
      cards: z
        .array(z.string().trim().min(1))
        .min(1)
        .describe(
          "The card names to remove from the library. Each request is matched independently against the current remaining library."
        ),
    }),
  },
  {
    name: "return_card_to_library",
    description:
      "Return a card to the library for an existing simulation, placing it a specific number of cards from the top or bottom.",
    inputSchema: z.object({
      ...llmRunIdentifierSchema,
      reason: mcpShortReasonSchema,
      card: z
        .string()
        .trim()
        .min(1)
        .describe("The card name to put back into the library."),
      side: z
        .enum(["top", "bottom"])
        .describe(
          "Whether the position is measured from the top or the bottom of the library."
        ),
      position: z
        .number()
        .int()
        .nonnegative()
        .describe(
          "How many cards should remain above the card if using top, or below the card if using bottom. Position 0 puts it directly on that end. For example, if you want the card 3rd from the top, use side top, position 2."
        ),
    }),
  },
  {
    name: "return_cards_to_library",
    description:
      "Return multiple cards to the top or bottom of the library for an existing simulation, optionally randomizing the order they are returned in.",
    inputSchema: z.object({
      ...llmRunIdentifierSchema,
      reason: mcpShortReasonSchema,
      cards: z
        .array(z.string().trim().min(1))
        .min(1)
        .describe(
          "The cards to put back into the library. If randomizeOrder is false, they are inserted in list order, so the last card becomes the outermost card on the chosen side."
        ),
      side: z
        .enum(["top", "bottom"])
        .describe("Which end of the library to return the cards to."),
      randomizeOrder: z
        .boolean()
        .describe(
          "Whether to shuffle the returned cards before putting them back."
        ),
    }),
  },
  {
    name: "shuffle_library",
    description: "Shuffle the stored library for an existing simulation.",
    inputSchema: z.object({
      ...llmRunIdentifierSchema,
      reason: mcpShortReasonSchema,
    }),
  },
  {
    name: "flip_coin",
    description:
      'Flip one or more fair coins for Magic card effects that care about winning or losing a flip. Each result is "win" or "lose".',
    inputSchema: z.object({
      ...llmRunIdentifierSchema,
      reason: mcpShortReasonSchema,
      count: randomizerCountSchema
        .default(1)
        .describe(
          "How many coins to flip. Defaults to 1. Must be between 1 and 100."
        ),
    }),
  },
  {
    name: "roll_dice",
    description:
      "Roll one or more fair dice with a configurable number of sides for Magic card effects that instruct you to roll dice.",
    inputSchema: z.object({
      ...llmRunIdentifierSchema,
      reason: mcpShortReasonSchema,
      count: randomizerCountSchema,
      sides: diceSidesSchema,
    }),
  },
]

function getTurnSimulationLlmToolDefinitions(): readonly LlamaCppToolDefinition[] {
  return turnSimulationLibraryLlmToolDefinitions
}

function createOpeningHandOpenRouterTools(
  mcpClient: Client,
  signal: AbortSignal
): Tool[] {
  return createOpenRouterTools(openingHandLlmToolDefinitions, mcpClient, signal)
}

function createTurnSimulationOpenRouterTools(
  mcpClient: Client,
  signal: AbortSignal
): Tool[] {
  return createOpenRouterTools(
    getTurnSimulationLlmToolDefinitions(),
    mcpClient,
    signal
  )
}

function createOpenRouterTools(
  toolDefinitions: readonly LlamaCppToolDefinition[],
  mcpClient: Client,
  signal: AbortSignal
): Tool[] {
  return toolDefinitions.map((definition) =>
    tool({
      name: definition.name,
      description: definition.description,
      inputSchema: definition.inputSchema,
      execute: async (input) =>
        callMcpToolForProvider(
          mcpClient,
          definition.name,
          input,
          signal,
          "OpenRouter"
        ),
    })
  )
}

async function callMcpToolForProvider(
  mcpClient: Client,
  name: string,
  args: Record<string, unknown>,
  signal: AbortSignal,
  providerName: string
) {
  const result = await callWithRuntimeAbortSignal(
    signal,
    (options) =>
      mcpClient.callTool(
        {
          name,
          arguments: args,
        },
        undefined,
        options
      ),
    `${providerName} MCP tool ${name} was cancelled.`
  )

  return formatMcpToolResultForProvider(result)
}

function formatMcpToolResultForProvider(result: unknown) {
  const resultRecord = asRecord(result)

  if (Object.hasOwn(resultRecord, "structuredContent")) {
    return resultRecord.structuredContent
  }

  if (Object.hasOwn(resultRecord, "toolResult")) {
    return resultRecord.toolResult
  }

  const textContent = getMcpToolResultTextContent(resultRecord)

  if (textContent !== null) {
    return parseMcpToolResultTextContent(textContent)
  }

  return Object.hasOwn(resultRecord, "content") ? resultRecord.content : result
}

function getMcpToolAuditOutput(result: unknown) {
  const textContent = getMcpToolResultTextContent(asRecord(result))

  return textContent === null
    ? result
    : parseMcpToolResultTextContent(textContent)
}

function getMcpToolResultTextContent(resultRecord: Record<string, unknown>) {
  const content = resultRecord.content

  if (!Array.isArray(content)) {
    return null
  }

  const textParts = content.flatMap((part) => {
    const partRecord = asRecord(part)

    if (partRecord.type !== "text") {
      return []
    }

    const text = getStringProperty(partRecord, "text")

    return text === null ? [] : [text]
  })

  return textParts.length === 0 ? null : textParts.join("\n")
}

function parseMcpToolResultTextContent(textContent: string) {
  if (!textContent.trim()) {
    return textContent
  }

  try {
    return JSON.parse(textContent) as unknown
  } catch {
    return textContent
  }
}

async function createProviderMcpClient({
  clientName,
  path,
  signal,
}: {
  clientName: string
  path: string
  signal: AbortSignal
}) {
  throwIfRuntimeAborted(signal)

  const mcpClient = new Client({
    name: `${SERVER_NAME}-${clientName}`,
    version: "0.0.1",
  })
  const transport = new StreamableHTTPClientTransport(
    new URL(`http://${DEFAULT_HOST}:${DEFAULT_PORT}${path}`)
  )

  try {
    await callWithRuntimeAbortSignal(signal, (options) =>
      mcpClient.connect(transport, options)
    )
  } catch (error) {
    await mcpClient.close().catch((closeError: unknown) => {
      console.error(
        `Failed to close aborted ${clientName} MCP client:`,
        closeError
      )
    })

    throw error
  }

  return mcpClient
}

function buildOpeningHandOpenAiRequestPayload(
  config: OpeningHandOpenAiRunConfig,
  fullPrompt: string,
  mcpRunToken: string,
  simulationId: string,
  reasoningSummariesEnabled: boolean
) {
  return {
    model: config.model,
    input: fullPrompt,
    max_output_tokens: config.maxOutputTokens,
    stream: true as const,
    ...(config.serviceTier ? { service_tier: config.serviceTier } : {}),
    metadata: {
      simulationId,
      phase: "opening_hand",
    },
    reasoning: buildProviderReasoningOptions(
      config.reasoningEffort,
      reasoningSummariesEnabled
    ),
    tools: [
      {
        type: "mcp" as const,
        server_label: OPENING_HAND_MCP_SERVER_LABEL,
        server_description:
          "Tools for drawing, mulliganing, and finalizing a Magic: The Gathering opening hand simulation.",
        server_url: appendMcpRunTokenToUrl(
          config.openingHandMcpPublicUrl,
          mcpRunToken
        ),
        require_approval: "never" as const,
      },
    ],
  }
}

function buildTurnSimulationOpenAiRequestPayload(
  config: TurnSimulationOpenAiRunConfig,
  fullPrompt: string,
  mcpRunToken: string,
  simulationId: string,
  turnNumber: number,
  reasoningSummariesEnabled: boolean
) {
  return {
    model: config.model,
    input: fullPrompt,
    max_output_tokens: config.maxOutputTokens,
    stream: true as const,
    ...(config.serviceTier ? { service_tier: config.serviceTier } : {}),
    metadata: {
      simulationId,
      phase: "turn",
      turnNumber: String(turnNumber),
    },
    reasoning: buildProviderReasoningOptions(
      config.reasoningEffort,
      reasoningSummariesEnabled
    ),
    tools: [
      {
        type: "mcp" as const,
        server_label: TURN_SIMULATION_MCP_SERVER_LABEL,
        server_description: getTurnSimulationMcpServerDescription(),
        server_url: appendMcpRunTokenToUrl(
          config.turnSimulationMcpPublicUrl,
          mcpRunToken
        ),
        require_approval: "never" as const,
      },
    ],
  }
}

function getTurnSimulationMcpServerDescription() {
  return "Tools for resolving one Magic: The Gathering goldfish turn, including library operations and random coin/dice results."
}

function generateMcpRunToken(): GeneratedMcpRunToken {
  const token = randomBytes(32).toString("base64url")

  return {
    token,
    tokenHash: hashMcpRunToken(token),
    expiresAt: new Date(Date.now() + MCP_RUN_TOKEN_TTL_MS),
  }
}

function hashMcpRunToken(token: string) {
  return createHash("sha256").update(token).digest("base64url")
}

function appendMcpRunTokenToUrl(url: string, token: string) {
  const parsedUrl = new URL(url)

  parsedUrl.searchParams.set("mcpRunToken", token)

  return parsedUrl.toString()
}

function appendMcpRunTokenToPath(path: string, token: string) {
  const parsedUrl = new URL(path, `http://${DEFAULT_HOST}:${DEFAULT_PORT}`)

  parsedUrl.searchParams.set("mcpRunToken", token)

  return `${parsedUrl.pathname}${parsedUrl.search}`
}

function buildOpeningHandOpenRouterRequestPayload(
  config: OpenRouterRunConfig,
  fullPrompt: string,
  simulationId: string,
  reasoningSummariesEnabled: boolean
) {
  return {
    providerType: "openrouter" as const,
    model: config.model,
    input: fullPrompt,
    maxOutputTokens: config.maxOutputTokens,
    ...(config.serviceTier ? { serviceTier: config.serviceTier } : {}),
    metadata: {
      simulationId,
      phase: "opening_hand",
    },
    reasoning: buildOpenRouterReasoningOptions(
      config.reasoningEffort,
      reasoningSummariesEnabled
    ),
    parallelToolCalls: false as const,
    provider: getOpenRouterProviderPreferences(config.modelProvider),
    stopWhenStepCount: config.stopWhenStepCount,
  }
}

function buildOpeningHandLlamaCppRequestPayload(
  config: ResolvedLlamaCppRunConfig,
  fullPrompt: string,
  simulationId: string
): LlamaCppChatCompletionRequestPayload {
  return {
    providerType: "llamacpp",
    model: config.model,
    max_tokens: config.maxOutputTokens,
    messages: [
      {
        role: "user",
        content: fullPrompt,
      },
    ],
    metadata: {
      simulationId,
      phase: "opening_hand",
    },
    parallel_tool_calls: false,
    tools: createLlamaCppChatCompletionTools(openingHandLlmToolDefinitions),
    stopWhenStepCount: config.stopWhenStepCount,
  }
}

function buildTurnSimulationOpenRouterRequestPayload(
  config: OpenRouterRunConfig,
  fullPrompt: string,
  simulationId: string,
  turnNumber: number,
  reasoningSummariesEnabled: boolean
) {
  return {
    providerType: "openrouter" as const,
    model: config.model,
    input: fullPrompt,
    maxOutputTokens: config.maxOutputTokens,
    ...(config.serviceTier ? { serviceTier: config.serviceTier } : {}),
    metadata: {
      simulationId,
      phase: "turn",
      turnNumber: String(turnNumber),
    },
    reasoning: buildOpenRouterReasoningOptions(
      config.reasoningEffort,
      reasoningSummariesEnabled
    ),
    parallelToolCalls: false as const,
    provider: getOpenRouterProviderPreferences(config.modelProvider),
    stopWhenStepCount: config.stopWhenStepCount,
  }
}

function buildTurnSimulationLlamaCppRequestPayload(
  config: ResolvedLlamaCppRunConfig,
  fullPrompt: string,
  simulationId: string,
  turnNumber: number
): LlamaCppChatCompletionRequestPayload {
  return {
    providerType: "llamacpp",
    model: config.model,
    max_tokens: config.maxOutputTokens,
    messages: [
      {
        role: "user",
        content: fullPrompt,
      },
    ],
    metadata: {
      simulationId,
      phase: "turn",
      turnNumber: String(turnNumber),
    },
    parallel_tool_calls: false,
    tools: createLlamaCppChatCompletionTools(
      getTurnSimulationLlmToolDefinitions()
    ),
    stopWhenStepCount: config.stopWhenStepCount,
  }
}

function getOpenRouterProviderPreferences(modelProvider: string | null) {
  if (modelProvider === null) {
    return undefined
  }

  return {
    allowFallbacks: false,
    only: [modelProvider],
  }
}

function getLlmRunOpenRouterModelProvider(
  config: ResolvedOpeningHandLlmRunConfig | ResolvedTurnSimulationLlmRunConfig
) {
  return config.provider === "openrouter" ? config.modelProvider : null
}

function getLlmRunServiceTier(
  config: ResolvedOpeningHandLlmRunConfig | ResolvedTurnSimulationLlmRunConfig
) {
  return config.provider === "llamacpp" ? null : config.serviceTier
}

function withCapturedLlmRunServiceTier<
  TConfig extends
  | ResolvedOpeningHandLlmRunConfig
  | ResolvedTurnSimulationLlmRunConfig,
>(config: TConfig, serviceTier: string | null): TConfig {
  if (config.provider === "llamacpp") {
    return config
  }

  return {
    ...config,
    serviceTier,
  }
}

function buildOpeningHandLlmRequestPayload(
  config: ResolvedOpeningHandLlmRunConfig,
  fullPrompt: string,
  mcpRunToken: string,
  simulationId: string,
  reasoningSummariesEnabled: boolean
) {
  if (config.provider === "openai") {
    return buildOpeningHandOpenAiRequestPayload(
      config,
      fullPrompt,
      mcpRunToken,
      simulationId,
      reasoningSummariesEnabled
    )
  }

  if (config.provider === "llamacpp") {
    return buildOpeningHandLlamaCppRequestPayload(
      config,
      fullPrompt,
      simulationId
    )
  }

  return buildOpeningHandOpenRouterRequestPayload(
    config,
    fullPrompt,
    simulationId,
    reasoningSummariesEnabled
  )
}

function buildTurnSimulationLlmRequestPayload(
  config: ResolvedTurnSimulationLlmRunConfig,
  fullPrompt: string,
  mcpRunToken: string,
  simulationId: string,
  turnNumber: number,
  reasoningSummariesEnabled: boolean
) {
  if (config.provider === "openai") {
    return buildTurnSimulationOpenAiRequestPayload(
      config,
      fullPrompt,
      mcpRunToken,
      simulationId,
      turnNumber,
      reasoningSummariesEnabled
    )
  }

  if (config.provider === "llamacpp") {
    return buildTurnSimulationLlamaCppRequestPayload(
      config,
      fullPrompt,
      simulationId,
      turnNumber
    )
  }

  return buildTurnSimulationOpenRouterRequestPayload(
    config,
    fullPrompt,
    simulationId,
    turnNumber,
    reasoningSummariesEnabled
  )
}

type OpeningHandLlmRequestPayload = ReturnType<
  typeof buildOpeningHandLlmRequestPayload
>
type TurnSimulationLlmRequestPayload = ReturnType<
  typeof buildTurnSimulationLlmRequestPayload
>
type OpeningHandOpenRouterRequestPayload = ReturnType<
  typeof buildOpeningHandOpenRouterRequestPayload
>
type TurnSimulationOpenRouterRequestPayload = ReturnType<
  typeof buildTurnSimulationOpenRouterRequestPayload
>
type LlamaCppRequestPayload =
  | ReturnType<typeof buildOpeningHandLlamaCppRequestPayload>
  | ReturnType<typeof buildTurnSimulationLlamaCppRequestPayload>

function getPersistableLlmRequestPayload<
  TRequestPayload extends Record<string, unknown>,
>(requestPayload: TRequestPayload) {
  const persistableRequestPayload: Record<string, unknown> = {
    ...requestPayload,
  }

  if (Object.hasOwn(persistableRequestPayload, "input")) {
    persistableRequestPayload.input = "[stored in llm_runs.full_prompt]"
  }

  if (Array.isArray(persistableRequestPayload.messages)) {
    persistableRequestPayload.messages = "[stored in llm_runs.full_prompt]"
  }

  return redactMcpRunTokens(persistableRequestPayload)
}

function redactMcpRunTokens(value: unknown): unknown {
  if (typeof value === "string") {
    return redactMcpRunTokenFromString(value)
  }

  if (Array.isArray(value)) {
    return value.map(redactMcpRunTokens)
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, propertyValue]) => [
        key,
        key === "mcpRunToken" ? "[redacted]" : redactMcpRunTokens(propertyValue),
      ])
    )
  }

  return value
}

function redactMcpRunTokenFromString(value: string) {
  try {
    const parsedUrl = new URL(value)

    if (parsedUrl.searchParams.has("mcpRunToken")) {
      parsedUrl.searchParams.set("mcpRunToken", "[redacted]")
      return parsedUrl.toString()
    }
  } catch {
    // Not a URL; fall through to the query-param regex.
  }

  return value.replace(/([?&]mcpRunToken=)[^&#]*/g, "$1[redacted]")
}

function formatLlmRunPhase(phase: LlmRunPhase) {
  if (phase === "opening_hand") {
    return "Opening-hand"
  }

  if (phase === "turn") {
    return "Turn"
  }

  return "Simulation"
}

async function resolveLlmRunConfigModel(
  config: OpeningHandLlmRunConfig
): Promise<ResolvedOpeningHandLlmRunConfig>
async function resolveLlmRunConfigModel(
  config: TurnSimulationLlmRunConfig
): Promise<ResolvedTurnSimulationLlmRunConfig>
async function resolveLlmRunConfigModel(
  config: OpeningHandLlmRunConfig | TurnSimulationLlmRunConfig
): Promise<
  ResolvedOpeningHandLlmRunConfig | ResolvedTurnSimulationLlmRunConfig
> {
  return config
}

async function getRequiredEnabledSimulationLlmModelPreset(
  deckId: string,
  simulationId: string
) {
  const simulation = await getSimulationSummary(deckId, simulationId)

  if (!simulation) {
    throw new SimulationValidationError("Simulation not found.")
  }

  if (!simulation.llmModelPresetId) {
    throw new SimulationValidationError(
      "Select an enabled model preset before starting LLM runs for this simulation."
    )
  }

  const preset = await getEnabledLlmModelPreset(simulation.llmModelPresetId)

  if (!preset) {
    throw new SimulationValidationError(
      "The selected model preset is disabled. Choose an enabled model preset before starting LLM runs."
    )
  }

  return {
    preset,
    useFlexServiceTier: simulation.useFlexServiceTier,
  }
}

async function getRequiredEnabledQueuedRunLlmModelPreset(
  run: ClaimedQueuedLlmRun
) {
  if (!run.llmModelPresetId) {
    throw new Error("Queued LLM run is missing a model preset.")
  }

  const preset = await getEnabledLlmModelPreset(run.llmModelPresetId)

  if (!preset) {
    throw new Error("Queued LLM run model preset is disabled or missing.")
  }

  return preset
}

function getLlmModelPresetRunConfig(preset: LlmModelPreset) {
  return {
    id: preset.id,
    provider: preset.provider,
    model: preset.model,
    reasoningEffort: preset.reasoningEffort,
    openrouterModelProvider: preset.openrouterModelProvider,
    supportsFlex: preset.supportsFlex,
    inputTokenCostUsdPerMillion: preset.inputTokenCostUsdPerMillion,
    cachedInputTokenCostUsdPerMillion:
      preset.cachedInputTokenCostUsdPerMillion,
    outputTokenCostUsdPerMillion: preset.outputTokenCostUsdPerMillion,
  }
}

async function prepareAndStartOpeningHandLlmRun({
  deckId,
  resetBeforeStart,
  simulationId,
}: {
  deckId: string
  simulationId: string
  resetBeforeStart: boolean
}) {
  let createdLlmRunId: string | null = null

  try {
    const modelPresetSelection =
      await getRequiredEnabledSimulationLlmModelPreset(deckId, simulationId)
    const llmConfig = await resolveLlmRunConfigModel(
      getOpeningHandLlmRunConfig(
        getLlmModelPresetRunConfig(modelPresetSelection.preset),
        process.env,
        {
          useFlexServiceTier: modelPresetSelection.useFlexServiceTier,
        }
      )
    )

    if (resetBeforeStart) {
      await resetSimulationForOpeningHandLlmRun(deckId, simulationId)
    }

    const openingHandRun = await createOpeningHandLlmRun(deckId, {
      simulationId,
      llmModelPresetId: llmConfig.modelPresetId,
      provider: llmConfig.provider,
      model: llmConfig.model,
      openrouterModelProvider: getLlmRunOpenRouterModelProvider(llmConfig),
      serviceTier: getLlmRunServiceTier(llmConfig),
      reasoningEffort: llmConfig.reasoningEffort,
      runtimeStreamKey: randomUUID(),
      fullPrompt: "",
      requestPayload: {},
    })
    createdLlmRunId = openingHandRun.llmRunId

    const fullPrompt = await buildStartingHandSimulationPrompt({
      llmRunId: openingHandRun.llmRunId,
    })
    const requestPayload = buildOpeningHandLlmRequestPayload(
      llmConfig,
      fullPrompt,
      QUEUED_MCP_RUN_TOKEN_PLACEHOLDER,
      simulationId,
      openingHandRun.reasoningSummariesEnabled
    )

    await updateLlmRunRequestData({
      llmRunId: openingHandRun.llmRunId,
      fullPrompt,
      requestPayload: getPersistableLlmRequestPayload(requestPayload),
    })

    if (!(await markLlmRunQueued(openingHandRun.llmRunId))) {
      throw new Error("Opening-hand LLM run could not be queued.")
    }
    await publishSimulationResultsState({
      deckId,
      llmRunId: openingHandRun.llmRunId,
      simulationId,
    })
    nudgeLlmRunQueue()

    return openingHandRun
  } catch (error) {
    if (createdLlmRunId !== null) {
      await failLlmRun(createdLlmRunId, getErrorMessage(error)).catch(
        (failError: unknown) => {
          console.error(
            "Failed to mark opening-hand LLM run failed:",
            failError
          )
        }
      )
    }

    throw error
  }
}

async function prepareAndStartTurnLlmRun({
  deckId,
  requireAutoSimulateNextStep = false,
  simulationId,
  turnNumber,
}: {
  deckId: string
  simulationId: string
  turnNumber: number
  requireAutoSimulateNextStep?: boolean
}) {
  let createdLlmRunId: string | null = null

  try {
    const modelPresetSelection =
      await getRequiredEnabledSimulationLlmModelPreset(deckId, simulationId)
    const llmConfig = await resolveLlmRunConfigModel(
      getTurnSimulationLlmRunConfig(
        getLlmModelPresetRunConfig(modelPresetSelection.preset),
        process.env,
        {
          useFlexServiceTier: modelPresetSelection.useFlexServiceTier,
        }
      )
    )
    const turnRun = await createTurnLlmRun(deckId, {
      simulationId,
      llmModelPresetId: llmConfig.modelPresetId,
      turnNumber,
      provider: llmConfig.provider,
      model: llmConfig.model,
      openrouterModelProvider: getLlmRunOpenRouterModelProvider(llmConfig),
      serviceTier: getLlmRunServiceTier(llmConfig),
      reasoningEffort: llmConfig.reasoningEffort,
      runtimeStreamKey: randomUUID(),
      requireAutoSimulateNextStep,
    })
    createdLlmRunId = turnRun.llmRunId

    const fullPrompt =
      turnNumber === 1
        ? await buildTurnSimulationPrompt({ llmRunId: turnRun.llmRunId })
        : await buildTurnSimulationPrompt(
          { llmRunId: turnRun.llmRunId },
          turnRun.previousGameState ?? undefined
        )
    const requestPayload = buildTurnSimulationLlmRequestPayload(
      llmConfig,
      fullPrompt,
      QUEUED_MCP_RUN_TOKEN_PLACEHOLDER,
      simulationId,
      turnNumber,
      turnRun.reasoningSummariesEnabled
    )

    await updateLlmRunRequestData({
      llmRunId: turnRun.llmRunId,
      fullPrompt,
      requestPayload: getPersistableLlmRequestPayload(requestPayload),
    })

    if (!(await markLlmRunQueued(turnRun.llmRunId))) {
      throw new Error("Turn LLM run could not be queued.")
    }
    await publishSimulationResultsState({
      deckId,
      llmRunId: turnRun.llmRunId,
      simulationId,
    })
    nudgeLlmRunQueue()

    return turnRun
  } catch (error) {
    if (createdLlmRunId !== null) {
      await failLlmRun(createdLlmRunId, getErrorMessage(error)).catch(
        (failError: unknown) => {
          console.error("Failed to mark turn LLM run failed:", failError)
        }
      )
    }

    throw error
  }
}

async function startCreatedSimulationInitialStep(
  deckId: string,
  simulation: {
    id: string
    startingHandId: string | null
    turnsToSimulate: number
  }
) {
  const decision = getSimulationCreationDecision({
    hasPresetStartingHand: simulation.startingHandId !== null,
    turnsToSimulate: simulation.turnsToSimulate,
  })

  if (decision.simulationStatus === "completed") {
    await markSimulationCompleted(simulation.id)
    return
  }

  if (decision.nextStep?.type === "opening_hand") {
    await prepareAndStartOpeningHandLlmRun({
      deckId,
      simulationId: simulation.id,
      resetBeforeStart: false,
    })
    return
  }

  if (decision.nextStep?.type === "turn") {
    await prepareAndStartTurnLlmRun({
      deckId,
      simulationId: simulation.id,
      turnNumber: decision.nextStep.turnNumber,
    })
  }
}

async function handleSimulationCompletionNextStep(
  completion: SimulationLlmCompletionResult
) {
  if (!completion.nextStep) {
    return
  }

  try {
    if (completion.nextStep.type === "turn") {
      await prepareAndStartTurnLlmRun({
        deckId: completion.deckId,
        simulationId: completion.simulationId,
        turnNumber: completion.nextStep.turnNumber,
        requireAutoSimulateNextStep: true,
      })
      return
    }

  } catch (error) {
    if (isBenignAutoAdvanceAbortError(error)) {
      console.log(
        `Simulation auto-advance skipped: simulationId=${completion.simulationId} reason=${getErrorMessage(error)}`
      )
      return
    }

    console.error("Failed to auto-start next simulation step:", error)
    await markSimulationFailed(completion.simulationId, getErrorMessage(error))
    await publishSimulationResultsState({
      deckId: completion.deckId,
      simulationId: completion.simulationId,
    })
  }
}

function startLlmRunQueue(config: LlmRunQueueConfig) {
  llmRunQueueConfig = config

  if (!llmRunQueueDrainTimer) {
    llmRunQueueDrainTimer = setInterval(
      nudgeLlmRunQueue,
      LLM_RUN_QUEUE_POLL_INTERVAL_MS
    )
  }

  nudgeLlmRunQueue()
}

function stopLlmRunQueue() {
  if (!llmRunQueueDrainTimer) {
    return
  }

  clearInterval(llmRunQueueDrainTimer)
  llmRunQueueDrainTimer = null
}

function nudgeLlmRunQueue() {
  if (!llmRunQueueConfig || llmRunQueueDrainPromise) {
    return
  }

  llmRunQueueDrainPromise = drainLlmRunQueue(llmRunQueueConfig)
    .catch((error: unknown) => {
      console.error("Failed to drain queued LLM runs:", error)
    })
    .finally(() => {
      llmRunQueueDrainPromise = null
    })
}

async function drainLlmRunQueue(config: LlmRunQueueConfig) {
  while (true) {
    const claimedRun = await claimNextQueuedLlmRun({
      maxConcurrentRuns: config.maxConcurrentRuns,
    })

    if (!claimedRun) {
      return
    }

    if (isUsageLimitedQueuedLlmRun(claimedRun)) {
      await handleUsageLimitedQueuedLlmRun(claimedRun)
      continue
    }

    await startClaimedQueuedLlmRun(claimedRun)
  }
}

function isUsageLimitedQueuedLlmRun(
  run: LlmRunQueueClaimResult
): run is Extract<LlmRunQueueClaimResult, { usageLimitExceeded: true }> {
  return "usageLimitExceeded" in run
}

async function handleUsageLimitedQueuedLlmRun(
  run: Extract<LlmRunQueueClaimResult, { usageLimitExceeded: true }>
) {
  console.log(
    `Queued LLM run failed usage limit check: phase=${run.phase} llmRunId=${run.llmRunId}`
  )
  await publishSimulationResultsState({
    deckId: run.deckId,
    llmRunId: run.llmRunId,
    simulationId: run.simulationId,
  })
}

async function startClaimedQueuedLlmRun(run: ClaimedQueuedLlmRun) {
  try {
    const modelPreset = await getRequiredEnabledQueuedRunLlmModelPreset(run)

    if (run.phase === "opening_hand") {
      const config = withCapturedLlmRunServiceTier(
        await resolveLlmRunConfigModel(
          getOpeningHandLlmRunConfig(getLlmModelPresetRunConfig(modelPreset))
        ),
        run.serviceTier
      )

      assertClaimedRunMatchesConfig(run, config)

      if (!(await isLlmRunStreaming(run.llmRunId))) {
        return
      }

      startOpeningHandLlmRun({
        attemptNumber: run.attemptNumber,
        config,
        createdAt: run.createdAt,
        deckId: run.deckId,
        fullPrompt: run.fullPrompt,
        llmRunId: run.llmRunId,
        reasoningSummariesEnabled: run.reasoningSummariesEnabled,
        runtimeStreamKey: run.runtimeStreamKey,
        simulationId: run.simulationId,
        startedAt: run.startedAt,
      })
      return
    }

    const config = withCapturedLlmRunServiceTier(
      await resolveLlmRunConfigModel(
        getTurnSimulationLlmRunConfig(getLlmModelPresetRunConfig(modelPreset))
      ),
      run.serviceTier
    )

    assertClaimedRunMatchesConfig(run, config)

    if (!(await isLlmRunStreaming(run.llmRunId))) {
      return
    }

    if (run.phase === "turn") {
      if (typeof run.turnNumber !== "number") {
        throw new Error("Queued turn LLM run is missing its turn number.")
      }

      startTurnLlmRun({
        attemptNumber: run.attemptNumber,
        config,
        createdAt: run.createdAt,
        deckId: run.deckId,
        fullPrompt: run.fullPrompt,
        llmRunId: run.llmRunId,
        reasoningSummariesEnabled: run.reasoningSummariesEnabled,
        runtimeStreamKey: run.runtimeStreamKey,
        simulationId: run.simulationId,
        startedAt: run.startedAt,
        turnNumber: run.turnNumber,
      })
      return
    }

  } catch (error) {
    console.error("Failed to start queued LLM run:", error)
    await failClaimedQueuedLlmRun(run, getErrorMessage(error))
  }
}

function assertClaimedRunMatchesConfig(
  run: ClaimedQueuedLlmRun,
  config: ResolvedOpeningHandLlmRunConfig | ResolvedTurnSimulationLlmRunConfig
) {
  const currentOpenRouterModelProvider =
    getLlmRunOpenRouterModelProvider(config)

  if (
    run.llmModelPresetId === config.modelPresetId &&
    run.provider === config.provider &&
    run.model === config.model &&
    run.openrouterModelProvider === currentOpenRouterModelProvider &&
    run.serviceTier === getLlmRunServiceTier(config) &&
    run.reasoningEffort === config.reasoningEffort
  ) {
    return
  }

  throw new Error(
    `${formatLlmRunPhase(run.phase)} LLM run was queued for ${formatQueuedRunConfig(run)}, but current configuration is ${formatLlmRunConfig(config)}.`
  )
}

function formatQueuedRunConfig(run: ClaimedQueuedLlmRun) {
  return formatLlmRunConfigParts({
    model: run.model,
    openrouterModelProvider: run.openrouterModelProvider,
    provider: run.provider,
    reasoningEffort: run.reasoningEffort,
    serviceTier: run.serviceTier,
  })
}

function formatLlmRunConfig(
  config: ResolvedOpeningHandLlmRunConfig | ResolvedTurnSimulationLlmRunConfig
) {
  return formatLlmRunConfigParts({
    model: config.model,
    openrouterModelProvider: getLlmRunOpenRouterModelProvider(config),
    provider: config.provider,
    reasoningEffort: config.reasoningEffort,
    serviceTier: getLlmRunServiceTier(config),
  })
}

function formatLlmRunConfigParts({
  model,
  openrouterModelProvider,
  provider,
  reasoningEffort,
  serviceTier,
}: {
  model: string
  openrouterModelProvider: string | null
  provider: string
  reasoningEffort: string | null
  serviceTier: string | null
}) {
  return [
    `provider=${provider}`,
    `model=${model}`,
    openrouterModelProvider ? `modelProvider=${openrouterModelProvider}` : null,
    reasoningEffort ? `reasoningEffort=${reasoningEffort}` : null,
    serviceTier ? `serviceTier=${serviceTier}` : null,
  ]
    .filter(Boolean)
    .join(", ")
}

async function failClaimedQueuedLlmRun(
  run: ClaimedQueuedLlmRun,
  failureMessage: string
) {
  await failLlmRun(run.llmRunId, failureMessage)

  await publishSimulationResultsState({
    deckId: run.deckId,
    llmRunId: run.llmRunId,
    simulationId: run.simulationId,
  })
  nudgeLlmRunQueue()
}

function isBenignAutoAdvanceAbortError(error: unknown) {
  return (
    error instanceof SimulationValidationError &&
    (error.message === SIMULATION_AUTO_ADVANCE_DISABLED_MESSAGE ||
      error.message === SIMULATION_AUTO_ADVANCE_NOT_RUNNING_MESSAGE)
  )
}

type CompletedLlmStreamResult = {
  outputText: string
  responseMetadata: unknown
  usage: unknown
}

type OpenAiRequestPayload =
  | ReturnType<typeof buildOpeningHandOpenAiRequestPayload>
  | ReturnType<typeof buildTurnSimulationOpenAiRequestPayload>
type OpenRouterRequestPayload =
  | OpeningHandOpenRouterRequestPayload
  | TurnSimulationOpenRouterRequestPayload

function isOpenAiRequestPayload(
  requestPayload:
    | OpeningHandLlmRequestPayload
    | TurnSimulationLlmRequestPayload
): requestPayload is OpenAiRequestPayload {
  return "stream" in requestPayload
}

function isOpenRouterRequestPayload(
  requestPayload:
    | OpeningHandLlmRequestPayload
    | TurnSimulationLlmRequestPayload
): requestPayload is OpenRouterRequestPayload {
  return asRecord(requestPayload).providerType === "openrouter"
}

function isLlamaCppRequestPayload(
  requestPayload:
    | OpeningHandLlmRequestPayload
    | TurnSimulationLlmRequestPayload
): requestPayload is LlamaCppRequestPayload {
  return asRecord(requestPayload).providerType === "llamacpp"
}

function requireOpenAiRequestPayload(
  requestPayload:
    | OpeningHandLlmRequestPayload
    | TurnSimulationLlmRequestPayload
) {
  if (!isOpenAiRequestPayload(requestPayload)) {
    throw new Error("LLM run config and request payload provider mismatch.")
  }

  return requestPayload
}

function requireOpenRouterRequestPayload(
  requestPayload:
    | OpeningHandLlmRequestPayload
    | TurnSimulationLlmRequestPayload
) {
  if (!isOpenRouterRequestPayload(requestPayload)) {
    throw new Error("LLM run config and request payload provider mismatch.")
  }

  return requestPayload
}

function requireLlamaCppRequestPayload(
  requestPayload:
    | OpeningHandLlmRequestPayload
    | TurnSimulationLlmRequestPayload
) {
  if (!isLlamaCppRequestPayload(requestPayload)) {
    throw new Error("LLM run config and request payload provider mismatch.")
  }

  return requestPayload
}

async function collectOpenAiLlmStream({
  config,
  llmRunId,
  phase,
  requestPayload,
  runtime,
}: {
  config: OpenAiRunConfig
  llmRunId: string
  phase: LlmRunPhase
  requestPayload: OpenAiRequestPayload
  runtime: ActiveLlmRunRuntime
}): Promise<CompletedLlmStreamResult> {
  let outputText = ""
  let responseMetadata: unknown = {}
  let usage: unknown = {}
  let didReceiveCompletedResponse = false
  let providerTerminalEventError: ProviderTerminalEventError | null = null
  const client = new OpenAI({
    apiKey: config.apiKey,
  })
  const signal = runtime.abortController.signal

  logLlmApiCallStarted({
    llmRunId,
    model: requestPayload.model,
    phase,
    provider: config.provider,
  })

  throwIfRuntimeAborted(signal)

  const stream = (await client.responses.create(
    requestPayload as unknown as Parameters<typeof client.responses.create>[0],
    {
      signal,
    }
  )) as AsyncIterable<unknown>

  await forEachRuntimeAbortableAsync(stream, signal, async (event) => {
    const eventRecord = asRecord(event)
    const eventType = getStringProperty(eventRecord, "type")
    const normalizedEvent = normalizeOpenAiStreamEvent(event)

    if (eventType === "response.completed") {
      const response = eventRecord.response
      const responseRecord = asRecord(response)
      didReceiveCompletedResponse = true
      outputText = getCompletedResponseOutputText(response)
      responseMetadata = response ?? {}
      usage = responseRecord.usage ?? {}
    }

    await appendRuntimeChunk(runtime, normalizedEvent)

    if (isProviderTerminalEvent(eventType)) {
      providerTerminalEventError = new ProviderTerminalEventError(
        eventType,
        event
      )
    }
  })

  if (providerTerminalEventError) {
    throw providerTerminalEventError
  }

  if (!didReceiveCompletedResponse) {
    throw new Error(
      `${formatLlmRunPhase(phase)} LLM stream ended without response.completed.`
    )
  }

  logLlmApiCallFinished({
    llmRunId,
    model: requestPayload.model,
    phase,
    provider: config.provider,
    serviceTier: config.serviceTier,
    tokenCosts: config.tokenCosts,
    usage,
  })

  return {
    outputText,
    responseMetadata,
    usage,
  }
}

async function collectOpenRouterLlmStream({
  config,
  createTools,
  llmRunId,
  mcpPath,
  phase,
  requestPayload,
  runtime,
}: {
  config: OpenRouterRunConfig
  createTools?: (mcpClient: Client, signal: AbortSignal) => Tool[]
  llmRunId: string
  mcpPath?: string
  phase: LlmRunPhase
  requestPayload: OpenRouterRequestPayload
  runtime: ActiveLlmRunRuntime
}): Promise<CompletedLlmStreamResult> {
  let outputText = ""
  let responseMetadata: unknown = {}
  let usage: unknown = {}
  let didReceiveCompletedResponse = false
  let providerTerminalEventError: ProviderTerminalEventError | null = null
  let currentOpenRouterTurnIndex = 0
  const completedResponseUsageValues: unknown[] = []
  const toolCallNamesById: OpenRouterToolCallNameMap = new Map()
  const openrouter = new OpenRouter({
    apiKey: config.apiKey,
  })
  const signal = runtime.abortController.signal
  const mcpClient =
    createTools && mcpPath
      ? await createProviderMcpClient({
        clientName: "openrouter-agent",
        path: mcpPath,
        signal,
      })
      : null
  let mcpClientClosePromise: Promise<void> | null = null

  const closeMcpClient = () => {
    if (!mcpClient) {
      return Promise.resolve()
    }

    mcpClientClosePromise ??= mcpClient.close().catch((error: unknown) => {
      console.error("Failed to close OpenRouter MCP client:", error)
    })

    return mcpClientClosePromise
  }

  try {
    logLlmApiCallStarted({
      llmRunId,
      model: requestPayload.model,
      phase,
      provider: config.provider,
    })

    const result = openrouter.callModel(
      {
        model: requestPayload.model,
        input: requestPayload.input,
        maxOutputTokens: requestPayload.maxOutputTokens,
        metadata: requestPayload.metadata,
        reasoning: requestPayload.reasoning,
        parallelToolCalls: requestPayload.parallelToolCalls,
        provider: requestPayload.provider,
        ...(requestPayload.serviceTier
          ? { serviceTier: requestPayload.serviceTier as never }
          : {}),
        stopWhen: stepCountIs(requestPayload.stopWhenStepCount),
        tools: mcpClient && createTools ? createTools(mcpClient, signal) : [],
      },
      {
        signal,
      }
    )
    const removeAbortHandler = registerRuntimeAbortHandler(signal, () => {
      void result.cancel().catch(() => { })
      void closeMcpClient()
    })

    try {
      // Drain the OpenRouter agent generator so its internal tool-execution
      // promise is observed after result.cancel() closes the stream.
      for await (const event of result.getFullResponsesStream()) {
        const eventRecord = asRecord(event)
        const eventType = getStringProperty(eventRecord, "type")
        const normalizedEvent = normalizeOpenRouterStreamEvent(
          event,
          toolCallNamesById
        )
        const eventTurnNumber = getNumberProperty(eventRecord, "turnNumber")

        if (
          eventType === "turn.start" &&
          eventTurnNumber !== null &&
          Number.isInteger(eventTurnNumber) &&
          eventTurnNumber >= 0
        ) {
          currentOpenRouterTurnIndex = eventTurnNumber
        }

        if (eventType === "response.completed") {
          const response = eventRecord.response
          const responseRecord = asRecord(response)
          const generationId =
            getOpenRouterGenerationIdFromCompletedEvent(event)
          didReceiveCompletedResponse = true
          outputText = getCompletedResponseOutputText(response)
          responseMetadata = response ?? {}
          completedResponseUsageValues.push(responseRecord.usage ?? {})
          usage = aggregateOpenRouterUsage(completedResponseUsageValues)

          if (generationId) {
            const generation = await recordOpenRouterLlmRunGeneration({
              llmRunId,
              openrouterTurnIndex: currentOpenRouterTurnIndex,
              generationId,
              responseMetadata,
            })

            if (generation) {
              rememberRuntimeOpenRouterGeneration(runtime, generation)
            }
          }
        }

        await appendRuntimeChunk(runtime, normalizedEvent)

        if (isProviderTerminalEvent(eventType)) {
          providerTerminalEventError = new ProviderTerminalEventError(
            eventType,
            event,
            "OpenRouter"
          )
        }
      }
    } catch (error) {
      if (signal.aborted) {
        await result.cancel().catch(() => { })
        throw createRuntimeAbortError()
      }

      throw error
    } finally {
      removeAbortHandler()
    }
  } finally {
    await closeMcpClient()
  }

  throwIfRuntimeAborted(signal)

  if (providerTerminalEventError) {
    throw providerTerminalEventError
  }

  if (!didReceiveCompletedResponse) {
    throw new Error(
      `${formatLlmRunPhase(phase)} LLM stream ended without response.completed.`
    )
  }

  logLlmApiCallFinished({
    llmRunId,
    model: requestPayload.model,
    phase,
    provider: config.provider,
    serviceTier: config.serviceTier,
    tokenCosts: config.tokenCosts,
    usage,
  })

  return {
    outputText,
    responseMetadata,
    usage,
  }
}

async function collectLlamaCppLlmStream({
  config,
  llmRunId,
  mcpPath,
  phase,
  requestPayload,
  runtime,
  toolDefinitions,
}: {
  config: ResolvedLlamaCppRunConfig
  llmRunId: string
  mcpPath?: string
  phase: LlmRunPhase
  requestPayload: LlamaCppRequestPayload
  runtime: ActiveLlmRunRuntime
  toolDefinitions: readonly LlamaCppToolDefinition[]
}): Promise<CompletedLlmStreamResult> {
  const signal = runtime.abortController.signal
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
  })
  const mcpClient =
    mcpPath && toolDefinitions.length > 0
      ? await createProviderMcpClient({
        clientName: "llamacpp-agent",
        path: mcpPath,
        signal,
      })
      : null
  let mcpClientClosePromise: Promise<void> | null = null

  const closeMcpClient = () => {
    if (!mcpClient) {
      return Promise.resolve()
    }

    mcpClientClosePromise ??= mcpClient.close().catch((error: unknown) => {
      console.error("Failed to close llama.cpp MCP client:", error)
    })

    return mcpClientClosePromise
  }

  try {
    logLlmApiCallStarted({
      llmRunId,
      model: requestPayload.model,
      phase,
      provider: config.provider,
    })

    const removeAbortHandler = registerRuntimeAbortHandler(signal, () => {
      void closeMcpClient()
    })

    try {
      const result = await collectLlamaCppChatCompletion({
        appendChunk: (chunk) => appendRuntimeChunk(runtime, chunk),
        callTool: (name, args, toolSignal) =>
          mcpClient
            ? callMcpToolForProvider(
              mcpClient,
              name,
              args,
              toolSignal,
              "llama.cpp"
            )
            : Promise.reject(new Error("No MCP tools are available.")),
        createChatCompletion: (body, options) =>
          client.chat.completions.create(body, options),
        requestPayload,
        signal,
        toolDefinitions,
      })

      logLlmApiCallFinished({
        llmRunId,
        model: requestPayload.model,
        phase,
        provider: config.provider,
        serviceTier: config.serviceTier,
        tokenCosts: config.tokenCosts,
        usage: result.usage,
      })

      return result
    } catch (error) {
      if (signal.aborted) {
        throw createRuntimeAbortError()
      }

      throw error
    } finally {
      removeAbortHandler()
    }
  } finally {
    await closeMcpClient()
  }
}

function startOpeningHandLlmRun({
  attemptNumber,
  config,
  createdAt,
  deckId,
  fullPrompt,
  llmRunId,
  reasoningSummariesEnabled,
  runtimeStreamKey,
  simulationId,
  startedAt,
}: {
  attemptNumber: number
  config: ResolvedOpeningHandLlmRunConfig
  createdAt: string
  deckId: string
  fullPrompt: string
  llmRunId: string
  reasoningSummariesEnabled: boolean
  runtimeStreamKey: string
  simulationId: string
  startedAt: string
}) {
  void runOpeningHandLlmRun({
    attemptNumber,
    config,
    createdAt,
    deckId,
    fullPrompt,
    llmRunId,
    reasoningSummariesEnabled,
    runtimeStreamKey,
    simulationId,
    startedAt,
  })
}

async function runOpeningHandLlmRun({
  attemptNumber,
  config,
  createdAt,
  deckId,
  fullPrompt,
  llmRunId,
  reasoningSummariesEnabled,
  runtimeStreamKey,
  simulationId,
  startedAt,
}: {
  attemptNumber: number
  config: ResolvedOpeningHandLlmRunConfig
  createdAt: string
  deckId: string
  fullPrompt: string
  llmRunId: string
  reasoningSummariesEnabled: boolean
  runtimeStreamKey: string
  simulationId: string
  startedAt: string
}) {
  const completion = createRuntimeCompletion()
  const runtime: ActiveLlmRunRuntime = {
    abortController: new AbortController(),
    attemptNumber,
    chunkBuffer: [],
    completionPromise: completion.completionPromise,
    createdAt,
    deckId,
    flushTimer: null,
    flushPromise: null,
    llmRunId,
    llmModelPresetId: config.modelPresetId,
    model: config.model,
    fullPrompt,
    nextSequence: 1,
    openrouterGenerations: [],
    phase: "opening_hand",
    provider: config.provider,
    reasoningEffort: config.reasoningEffort,
    serviceTier: getLlmRunServiceTier(config),
    recentChunks: [],
    resolveCompletion: completion.resolveCompletion,
    runtimeStreamKey,
    simulationId,
    startedAt,
    status: "streaming",
  }

  activeLlmRunRuntimes.set(runtimeStreamKey, runtime)

  try {
    throwIfRuntimeAborted(runtime.abortController.signal)
    await publishSimulationResultsState({
      deckId,
      llmRunId,
      simulationId,
    })

    const mcpRunToken = generateMcpRunToken()
    await createLlmRunMcpToken({
      deckId,
      llmRunId,
      simulationId,
      phase: "opening_hand",
      tokenHash: mcpRunToken.tokenHash,
      expiresAt: mcpRunToken.expiresAt,
    })
    throwIfRuntimeAborted(runtime.abortController.signal)
    const requestPayload = buildOpeningHandLlmRequestPayload(
      config,
      fullPrompt,
      mcpRunToken.token,
      simulationId,
      reasoningSummariesEnabled
    )

    await updateLlmRunRequestData({
      llmRunId,
      fullPrompt,
      requestPayload: getPersistableLlmRequestPayload(requestPayload),
    })
    throwIfRuntimeAborted(runtime.abortController.signal)

    const streamResult =
      config.provider === "openai"
        ? await collectOpenAiLlmStream({
          config,
          llmRunId,
          phase: "opening_hand",
          requestPayload: requireOpenAiRequestPayload(requestPayload),
          runtime,
        })
        : config.provider === "openrouter"
          ? await collectOpenRouterLlmStream({
            config,
            createTools: createOpeningHandOpenRouterTools,
            llmRunId,
            mcpPath: appendMcpRunTokenToPath(
              OPENING_HAND_MCP_PATH,
              mcpRunToken.token
            ),
            phase: "opening_hand",
            requestPayload: requireOpenRouterRequestPayload(requestPayload),
            runtime,
          })
          : await collectLlamaCppLlmStream({
            config,
            llmRunId,
            mcpPath: appendMcpRunTokenToPath(
              OPENING_HAND_MCP_PATH,
              mcpRunToken.token
            ),
            phase: "opening_hand",
            requestPayload: requireLlamaCppRequestPayload(requestPayload),
            runtime,
            toolDefinitions: openingHandLlmToolDefinitions,
          })

    throwIfRuntimeAborted(runtime.abortController.signal)
    await forceFlushRuntimeChunks(runtime)
    throwIfRuntimeAborted(runtime.abortController.signal)

    const parsedOpeningHand = parseOpeningHandCompletionFromResponseText(
      streamResult.outputText
    )

    throwIfRuntimeAborted(runtime.abortController.signal)
    await appendRuntimeChunk(
      runtime,
      createFinalParsedOutputChunk(parsedOpeningHand.parsedOutput)
    )
    await forceFlushRuntimeChunks(runtime)
    throwIfRuntimeAborted(runtime.abortController.signal)

    const completion = await completeOpeningHandLlmRun({
      llmRunId,
      openingHand: parsedOpeningHand.keptHand,
      responseMetadata: streamResult.responseMetadata,
      usage: streamResult.usage,
    })
    runtime.status = "completed"

    await publishSimulationResultsState({
      deckId,
      llmRunId,
      simulationId,
    })
    await handleSimulationCompletionNextStep(completion)
  } catch (error) {
    if (isAbortError(error) || runtime.abortController.signal.aborted) {
      logLlmApiCallCancelled({
        llmRunId,
        phase: "opening_hand",
        provider: config.provider,
      })
      await appendRuntimeChunk(runtime, createCancellationChunk())
      await tryForceFlushRuntimeChunks(runtime, "cancelled opening-hand run")
      await cancelLlmRun(llmRunId, "Opening-hand LLM run was cancelled.")
      runtime.status = "cancelled"
      await publishSimulationResultsState({
        deckId,
        llmRunId,
        simulationId,
      })
      return
    }

    if (!(error instanceof ProviderTerminalEventError)) {
      await appendRuntimeChunk(runtime, createServerErrorChunk(error))
    }

    await tryForceFlushRuntimeChunks(runtime, "failed opening-hand run")
    logLlmApiCallStoppedWithError({
      error,
      llmRunId,
      phase: "opening_hand",
      provider: config.provider,
    })
    console.error("Opening-hand LLM run failed:", error)
    await failLlmRun(llmRunId, getErrorMessage(error))
    runtime.status = "failed"
    await publishSimulationResultsState({
      deckId,
      llmRunId,
      simulationId,
    })
  } finally {
    await revokeLlmRunMcpToken(llmRunId).catch((error: unknown) => {
      console.error("Failed to revoke opening-hand MCP run token:", error)
    })
    clearRuntimeFlushTimer(runtime)
    activeLlmRunRuntimes.delete(runtimeStreamKey)
    runtime.resolveCompletion()
    nudgeLlmRunQueue()
  }
}

function startTurnLlmRun({
  attemptNumber,
  config,
  createdAt,
  deckId,
  fullPrompt,
  llmRunId,
  reasoningSummariesEnabled,
  runtimeStreamKey,
  simulationId,
  startedAt,
  turnNumber,
}: {
  attemptNumber: number
  config: ResolvedTurnSimulationLlmRunConfig
  createdAt: string
  deckId: string
  fullPrompt: string
  llmRunId: string
  reasoningSummariesEnabled: boolean
  runtimeStreamKey: string
  simulationId: string
  startedAt: string
  turnNumber: number
}) {
  void runTurnLlmRun({
    attemptNumber,
    config,
    createdAt,
    deckId,
    fullPrompt,
    llmRunId,
    reasoningSummariesEnabled,
    runtimeStreamKey,
    simulationId,
    startedAt,
    turnNumber,
  })
}

async function runTurnLlmRun({
  attemptNumber,
  config,
  createdAt,
  deckId,
  fullPrompt,
  llmRunId,
  reasoningSummariesEnabled,
  runtimeStreamKey,
  simulationId,
  startedAt,
  turnNumber,
}: {
  attemptNumber: number
  config: ResolvedTurnSimulationLlmRunConfig
  createdAt: string
  deckId: string
  fullPrompt: string
  llmRunId: string
  reasoningSummariesEnabled: boolean
  runtimeStreamKey: string
  simulationId: string
  startedAt: string
  turnNumber: number
}) {
  const completion = createRuntimeCompletion()
  const runtime: ActiveLlmRunRuntime = {
    abortController: new AbortController(),
    attemptNumber,
    chunkBuffer: [],
    completionPromise: completion.completionPromise,
    createdAt,
    deckId,
    flushTimer: null,
    flushPromise: null,
    llmRunId,
    llmModelPresetId: config.modelPresetId,
    model: config.model,
    fullPrompt,
    nextSequence: 1,
    openrouterGenerations: [],
    phase: "turn",
    provider: config.provider,
    reasoningEffort: config.reasoningEffort,
    serviceTier: getLlmRunServiceTier(config),
    recentChunks: [],
    resolveCompletion: completion.resolveCompletion,
    runtimeStreamKey,
    simulationId,
    startedAt,
    status: "streaming",
    turnNumber,
  }

  activeLlmRunRuntimes.set(runtimeStreamKey, runtime)

  try {
    throwIfRuntimeAborted(runtime.abortController.signal)
    await publishSimulationResultsState({
      deckId,
      llmRunId,
      simulationId,
    })

    const mcpRunToken = generateMcpRunToken()
    await createLlmRunMcpToken({
      deckId,
      llmRunId,
      simulationId,
      phase: "turn",
      tokenHash: mcpRunToken.tokenHash,
      expiresAt: mcpRunToken.expiresAt,
    })
    throwIfRuntimeAborted(runtime.abortController.signal)
    const requestPayload = buildTurnSimulationLlmRequestPayload(
      config,
      fullPrompt,
      mcpRunToken.token,
      simulationId,
      turnNumber,
      reasoningSummariesEnabled
    )

    await updateLlmRunRequestData({
      llmRunId,
      fullPrompt,
      requestPayload: getPersistableLlmRequestPayload(requestPayload),
    })
    throwIfRuntimeAborted(runtime.abortController.signal)

    const streamResult =
      config.provider === "openai"
        ? await collectOpenAiLlmStream({
          config,
          llmRunId,
          phase: "turn",
          requestPayload: requireOpenAiRequestPayload(requestPayload),
          runtime,
        })
        : config.provider === "openrouter"
          ? await collectOpenRouterLlmStream({
            config,
            createTools: createTurnSimulationOpenRouterTools,
            llmRunId,
            mcpPath: appendMcpRunTokenToPath(
              TURN_SIMULATION_MCP_PATH,
              mcpRunToken.token
            ),
            phase: "turn",
            requestPayload: requireOpenRouterRequestPayload(requestPayload),
            runtime,
          })
          : await collectLlamaCppLlmStream({
            config,
            llmRunId,
            mcpPath: appendMcpRunTokenToPath(
              TURN_SIMULATION_MCP_PATH,
              mcpRunToken.token
            ),
            phase: "turn",
            requestPayload: requireLlamaCppRequestPayload(requestPayload),
            runtime,
            toolDefinitions: getTurnSimulationLlmToolDefinitions(),
          })

    throwIfRuntimeAborted(runtime.abortController.signal)
    await forceFlushRuntimeChunks(runtime)
    throwIfRuntimeAborted(runtime.abortController.signal)

    const parsedTurn = parseTurnSimulationCompletionFromResponseText(
      streamResult.outputText
    )

    throwIfRuntimeAborted(runtime.abortController.signal)
    await appendRuntimeChunk(
      runtime,
      createFinalParsedOutputChunk(parsedTurn.parsedOutput)
    )
    await forceFlushRuntimeChunks(runtime)
    throwIfRuntimeAborted(runtime.abortController.signal)

    const completion = await completeTurnLlmRun({
      llmRunId,
      gameState: parsedTurn.gameState,
      responseMetadata: streamResult.responseMetadata,
      turnActions: parsedTurn.turnActions,
      usage: streamResult.usage,
    })
    runtime.status = "completed"

    await publishSimulationResultsState({
      deckId,
      llmRunId,
      simulationId,
    })
    await handleSimulationCompletionNextStep(completion)
  } catch (error) {
    if (isAbortError(error) || runtime.abortController.signal.aborted) {
      logLlmApiCallCancelled({
        llmRunId,
        phase: "turn",
        provider: config.provider,
      })
      await appendRuntimeChunk(
        runtime,
        createCancellationChunk("Turn LLM run was cancelled.")
      )
      await tryForceFlushRuntimeChunks(runtime, "cancelled turn run")
      await cancelLlmRun(llmRunId, "Turn LLM run was cancelled.")
      runtime.status = "cancelled"
      await publishSimulationResultsState({
        deckId,
        llmRunId,
        simulationId,
      })
      return
    }

    if (!(error instanceof ProviderTerminalEventError)) {
      await appendRuntimeChunk(runtime, createServerErrorChunk(error))
    }

    await tryForceFlushRuntimeChunks(runtime, "failed turn run")
    logLlmApiCallStoppedWithError({
      error,
      llmRunId,
      phase: "turn",
      provider: config.provider,
    })
    console.error("Turn LLM run failed:", error)
    await failLlmRun(llmRunId, getErrorMessage(error))
    runtime.status = "failed"
    await publishSimulationResultsState({
      deckId,
      llmRunId,
      simulationId,
    })
  } finally {
    await revokeLlmRunMcpToken(llmRunId).catch((error: unknown) => {
      console.error("Failed to revoke turn MCP run token:", error)
    })
    clearRuntimeFlushTimer(runtime)
    activeLlmRunRuntimes.delete(runtimeStreamKey)
    runtime.resolveCompletion()
    nudgeLlmRunQueue()
  }
}

async function stopActiveAdminUserSimulations(userId: string) {
  const activeSimulations = await listActiveAdminUserSimulations(userId)

  for (const simulation of activeSimulations) {
    await stopActiveSimulationLlmRuns(
      simulation.deckId,
      simulation.simulationId
    )
  }
}

async function stopActiveSimulationLlmRuns(
  deckId: string,
  simulationId: string
) {
  const activeRuns = await requestCancelSimulationLlmRuns(deckId, simulationId)
  const stoppedRunIds: string[] = []
  const cancelRequestedRunIds: string[] = []
  const runtimeCompletionPromises: Promise<void>[] = []
  for (const run of activeRuns) {
    const runtime = activeLlmRunRuntimes.get(run.runtimeStreamKey)

    if (runtime) {
      runtime.abortController.abort()
      runtimeCompletionPromises.push(runtime.completionPromise)
      stoppedRunIds.push(run.llmRunId)
    } else {
      const cancellationMessage = `${formatLlmRunPhase(run.phase)} LLM run was cancelled before its active runtime could be found.`

      await appendLlmRunChunkAtNextSequence(
        run.llmRunId,
        createCancellationChunk(cancellationMessage)
      )
      await cancelLlmRun(run.llmRunId, cancellationMessage)
      cancelRequestedRunIds.push(run.llmRunId)
    }
  }

  await waitForSimulationStopCompletions(runtimeCompletionPromises)

  const remainingActiveRuns = await listActiveSimulationLlmRuns(
    deckId,
    simulationId
  )

  if (remainingActiveRuns.length > 0) {
    throw new SimulationStopTimeoutError()
  }

  if (activeRuns.length > 0) {
    await markSimulationCancelled(simulationId, "Simulation was stopped.")
  }

  await publishSimulationResultsState({
    deckId,
    simulationId,
  })

  return {
    simulationId,
    stoppedLlmRunIds: stoppedRunIds,
    cancelRequestedLlmRunIds: cancelRequestedRunIds,
  }
}

async function appendRuntimeChunk(
  runtime: ActiveLlmRunRuntime,
  chunk: Omit<LlmRunChunkInput, "sequence">
) {
  const sequencedChunk = {
    ...chunk,
    sequence: runtime.nextSequence,
  }

  runtime.nextSequence += 1

  if (shouldPersistRuntimeChunkBeforeStreaming(sequencedChunk)) {
    await forceFlushRuntimeChunks(runtime)

    const persistedChunk = await appendLlmRunChunk(
      runtime.llmRunId,
      sequencedChunk
    )

    if (persistedChunk) {
      publishRuntimeStreamChunk(
        runtime,
        createStreamChunkFromPersistedChunk(persistedChunk)
      )
      return
    }
  }

  runtime.chunkBuffer.push(sequencedChunk)
  publishRuntimeChunk(runtime, sequencedChunk)
  scheduleRuntimeFlush(runtime)
}

function shouldPersistRuntimeChunkBeforeStreaming(chunk: LlmRunChunkInput) {
  return (
    chunk.kind === "mcp_call_complete" || chunk.kind === "final_parsed_output"
  )
}

function createStreamChunkFromPersistedChunk(
  chunk: SimulationDebugLlmRunChunk
): SimulationResultsStreamChunk {
  return {
    ...chunk,
    id: chunk.id,
  }
}

function scheduleRuntimeFlush(runtime: ActiveLlmRunRuntime) {
  if (runtime.flushTimer || runtime.flushPromise) {
    return
  }

  runtime.flushTimer = setTimeout(() => {
    runtime.flushTimer = null
    void flushRuntimeChunks(runtime).catch((error: unknown) => {
      console.error("Failed to flush LLM run chunks:", error)
    })
  }, STREAM_FLUSH_INTERVAL_MS)
}

async function flushRuntimeChunks(runtime: ActiveLlmRunRuntime) {
  if (runtime.flushPromise) {
    await runtime.flushPromise
    return
  }

  const chunks = runtime.chunkBuffer.slice()

  if (chunks.length === 0) {
    return
  }

  runtime.flushPromise = appendLlmRunChunks(runtime.llmRunId, chunks)
    .then(() => {
      runtime.chunkBuffer.splice(0, chunks.length)
    })
    .finally(() => {
      runtime.flushPromise = null

      if (runtime.chunkBuffer.length > 0) {
        scheduleRuntimeFlush(runtime)
      }
    })
  await runtime.flushPromise
}

async function forceFlushRuntimeChunks(runtime: ActiveLlmRunRuntime) {
  clearRuntimeFlushTimer(runtime)

  while (runtime.flushPromise || runtime.chunkBuffer.length > 0) {
    await flushRuntimeChunks(runtime)
  }
}

async function tryForceFlushRuntimeChunks(
  runtime: ActiveLlmRunRuntime,
  context: string
) {
  try {
    await forceFlushRuntimeChunks(runtime)
    return true
  } catch (error) {
    console.error(`Failed to flush chunks for ${context}:`, error)
    return false
  }
}

function clearRuntimeFlushTimer(runtime: ActiveLlmRunRuntime) {
  if (!runtime.flushTimer) {
    return
  }

  clearTimeout(runtime.flushTimer)
  runtime.flushTimer = null
}

async function main() {
  registerShutdownHandlers()
  const queueConfig = getLlmRunQueueConfig()
  await verifyDatabaseConnection()
  await ensureAuthSchema()
  await ensureAdminSubscriptionTierGrantsSchema({ query: queryDatabase })
  await promoteConfiguredAutoAdminUserOnStartup()
  await ensureFreshScryfallOracleCards()
  await ensureDecksSchema()
  await ensureStarterDeckCopiesSchema()
  await ensureStartingHandsSchema()
  await ensureSavedSeedsSchema()
  await ensureLlmModelPresetsSchema()
  await ensureSimulationsSchema()
  await ensureUsageLimitsSchema({ query: queryDatabase })
  const staleLlmRunCleanup = await cancelStaleInFlightLlmRuns()

  if (staleLlmRunCleanup.cancelledLlmRunIds.length > 0) {
    console.error(
      `Cancelled ${staleLlmRunCleanup.cancelledLlmRunIds.length} stale in-flight LLM run(s) from a previous server process.`
    )
  }

  if (staleLlmRunCleanup.cancelledSimulationIds.length > 0) {
    console.error(
      `Cancelled ${staleLlmRunCleanup.cancelledSimulationIds.length} stale running simulation(s) from a previous server process.`
    )
  }

  const host = DEFAULT_HOST
  const port = DEFAULT_PORT
  const allowedOrigins = getAllowedCorsOrigins()
  const app = express()

  app.use(hostHeaderValidation(getAllowedHostnames()))

  app.use((req: Request, res: Response, next) => {
    applyCors(req, res, allowedOrigins)

    if (req.method === "OPTIONS") {
      res.status(204).end()
      return
    }

    next()
  })

  app.all("/api/auth/*splat", toNodeHandler(auth))

  app.use((req: Request, res: Response, next) => {
    if (isMcpPath(req.path)) {
      next()
      return
    }

    express.json()(req, res, (error: unknown) => {
      if (error) {
        res.status(400).json({
          error: "Request body must be valid JSON.",
        })
        return
      }

      next()
    })
  })

  app.post(APP_SIGN_UP_PATH, async (req: Request, res: Response) => {
    const signUpInput = parseAppSignUpBody(req.body)

    if (!signUpInput) {
      res.status(400).json({
        error:
          "Email and password are required. Password must be between 8 and 128 characters.",
      })
      return
    }

    try {
      if (await userEmailExists(signUpInput.email)) {
        res.status(409).json({
          error: "An account with this email already exists.",
        })
        return
      }

      const signUpResult = await auth.api.signUpEmail({
        body: {
          email: signUpInput.email,
          name: signUpInput.email,
          password: signUpInput.password,
          rememberMe: true,
        },
        headers: fromNodeHeaders(req.headers),
        returnHeaders: true,
      })

      forwardResponseCookies(res, signUpResult.headers)

      res.status(201).json({
        email: signUpInput.email,
      })
    } catch (error) {
      console.error("Failed to create account:", error)
      res.status(500).json({
        error: "Account could not be created.",
      })
    }
  })

  app.get(APP_PASSWORD_RESET_TOKEN_PATH, async (req: Request, res: Response) => {
    const token = parsePasswordResetTokenParam(req.params.token)

    if (!token) {
      res.status(200).json({ valid: false })
      return
    }

    try {
      res.status(200).json({
        valid: await isPasswordResetTokenValid(token),
      })
    } catch (error) {
      console.error("Failed to check password reset token:", error)
      res.status(500).json({
        error: "Password reset link could not be checked.",
      })
    }
  })

  app.get(
    APP_EMAIL_VERIFICATION_CODE_PATH,
    async (req: Request, res: Response) => {
      try {
        const session = await auth.api.getSession({
          headers: fromNodeHeaders(req.headers),
        })

        if (!session) {
          res.status(401).json({
            error: "Authentication required.",
          })
          return
        }

        res.status(200).json({
          email: session.user.email,
          emailVerified: session.user.emailVerified,
          hasValidCode: session.user.emailVerified
            ? false
            : await hasValidEmailVerificationOtp(session.user.email),
        })
      } catch (error) {
        console.error("Failed to check email verification code:", error)
        res.status(500).json({
          error: "Email verification code could not be checked.",
        })
      }
    }
  )

  app.get("/health", (_req: Request, res: Response) => {
    res.status(200).json({
      ok: true,
      service: SERVER_NAME,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    })
  })

  app.get(
    "/public/simulations/:simulationId",
    async (req: Request, res: Response) => {
      const simulationId = String(req.params.simulationId)

      try {
        const simulation = await getPublicSimulationSummary(simulationId)

        if (!simulation) {
          res.status(404).json({
            error: "Simulation not found.",
          })
          return
        }

        const deck = await getDeck(simulation.deckId)

        if (!deck) {
          res.status(404).json({
            error: "Simulation not found.",
          })
          return
        }

        const startingHand =
          simulation.startingHandId === null
            ? null
            : await getStartingHandForDeck(
                simulation.deckId,
                simulation.startingHandId
              )
        const snapshot = await getPublicSimulationResultsStreamSnapshot(
          simulation.id
        )

        res.status(200).json({
          deck,
          simulation: snapshot.simulation,
          startingHand,
          results: snapshot.results,
        })
      } catch (error) {
        if (error instanceof SimulationValidationError) {
          res.status(404).json({
            error: "Simulation not found.",
          })
          return
        }

        console.error("Failed to load public simulation:", error)
        res.status(500).json({
          error: "Failed to load public simulation.",
        })
      }
    }
  )

  app.get(
    "/public/simulations/:simulationId/results/stream",
    async (req: Request, res: Response) => {
      const simulationId = String(req.params.simulationId)
      let streamCleanup: (() => void) | null = null

      try {
        const initialSimulation =
          await getPublicSimulationSummary(simulationId)

        if (!initialSimulation) {
          res.status(404).json({
            error: "Simulation not found.",
          })
          return
        }

        publicSimulationIds.add(simulationId)
        res.status(200)
        res.setHeader("Content-Type", "text/event-stream")
        res.setHeader("Cache-Control", "no-cache, no-transform")
        res.setHeader("Connection", "keep-alive")
        res.flushHeaders()
        res.write(formatSseComment("connected"))

        const queuedWrites: string[] = []
        let hasSentSnapshot = false
        let shouldEndAfterSnapshot = false
        let isStreamOpen = true
        let unsubscribe = () => { }
        const keepaliveIntervalId = setInterval(() => {
          if (isStreamOpen) {
            res.write(formatSseComment("keepalive"))
          }
        }, SSE_KEEPALIVE_INTERVAL_MS)
        const cleanup = () => {
          if (!isStreamOpen) {
            return
          }

          isStreamOpen = false
          clearInterval(keepaliveIntervalId)
          unsubscribe()
        }
        streamCleanup = cleanup
        const streamWriter = {
          write(chunk: string) {
            if (!isStreamOpen) {
              return
            }

            if (hasSentSnapshot) {
              res.write(chunk)
              return
            }

            queuedWrites.push(chunk)
          },
          end() {
            if (!isStreamOpen) {
              return
            }

            if (hasSentSnapshot) {
              cleanup()
              res.end()
              return
            }

            shouldEndAfterSnapshot = true
          },
        }

        req.on("close", cleanup)

        if (
          !isTerminalSimulationStatus(initialSimulation.status) ||
          initialSimulation.activeLlmRunCount > 0
        ) {
          unsubscribe = publicSimulationResultsBroadcaster.subscribe(
            simulationId,
            streamWriter
          )
        }

        const snapshot =
          await getPublicSimulationResultsStreamSnapshot(simulationId)
        const snapshotEvent: SimulationResultsStreamEvent = {
          type: "snapshot",
          simulation: snapshot.simulation,
          results: snapshot.results,
        }

        res.write(formatSseEvent(snapshotEvent))
        hasSentSnapshot = true

        for (const queuedWrite of queuedWrites) {
          res.write(queuedWrite)
        }

        queuedWrites.length = 0

        if (shouldEndAfterSnapshot) {
          cleanup()
          res.end()
          return
        }

        if (
          isTerminalSimulationStatus(snapshot.simulation.status) &&
          snapshot.simulation.activeLlmRunCount === 0
        ) {
          const doneEvent: SimulationResultsStreamEvent = {
            type: "done",
            simulation: snapshot.simulation,
            results: snapshot.results,
          }

          res.write(formatSseEvent(doneEvent))
          cleanup()
          res.end()
        }
      } catch (error) {
        if (res.headersSent) {
          streamCleanup?.()
          const errorEvent: SimulationResultsStreamEvent = {
            type: "error",
            message:
              error instanceof SimulationValidationError
                ? "Simulation is no longer public."
                : "Simulation results stream could not be opened.",
          }

          res.write(formatSseEvent(errorEvent))
          res.end()
          return
        }

        if (error instanceof SimulationValidationError) {
          res.status(404).json({
            error: "Simulation not found.",
          })
          return
        }

        console.error("Failed to open public simulation results stream:", error)
        res.status(500).json({
          error: "Failed to open public simulation results stream.",
        })
      }
    }
  )

  app.use(async (req: Request, res: Response, next) => {
    if (
      req.path === "/health" ||
      isAuthPath(req.path) ||
      isMcpPath(req.path)
    ) {
      next()
      return
    }

    try {
      const session = await auth.api.getSession({
        headers: fromNodeHeaders(req.headers),
      })

      if (!session) {
        res.status(401).json({
          error: "Authentication required.",
        })
        return
      }

      if (!session.user.emailVerified) {
        res.status(403).json({
          error: "Email verification required.",
        })
        return
      }

      authenticatedUsersByRequest.set(req, {
        id: session.user.id,
        email: session.user.email,
        emailVerified: session.user.emailVerified,
        impersonatedBy:
          typeof session.session.impersonatedBy === "string"
            ? session.session.impersonatedBy
            : null,
        role: session.user.role ?? null,
      })
      next()
    } catch (error) {
      console.error("Failed to authenticate request:", error)
      res.status(500).json({
        error: "Authentication could not be verified.",
      })
    }
  })

  app.post("/billing/refresh", async (req: Request, res: Response) => {
    const user = getAuthenticatedUser(req)

    if (user.impersonatedBy) {
      res.status(403).json({
        error: "Billing refresh is disabled while impersonating.",
      })
      return
    }

    try {
      res.status(200).json(await refreshStripeBillingForUser(user))
    } catch (error) {
      console.error("Failed to refresh billing:", error)
      res.status(500).json({
        error: "Billing could not be refreshed.",
      })
    }
  })

  app.get("/billing/tier", async (req: Request, res: Response) => {
    const user = getAuthenticatedUser(req)

    try {
      res.status(200).json(
        await getUserBillingTierSummary({ query: queryDatabase }, user.id)
      )
    } catch (error) {
      console.error("Failed to load billing tier:", error)
      res.status(500).json({
        error: "Billing tier could not be loaded.",
      })
    }
  })

  app.get("/admin/users", async (req: Request, res: Response) => {
    if (!requireAdminUser(req, res)) {
      return
    }

    try {
      const users = await listAdminUsers()
      const totalLlmRunCostUsd = users.reduce(
        (totalCost, user) => totalCost + user.totalLlmRunCostUsd,
        0
      )
      const recentLlmRunCostUsd = users.reduce(
        (totalCost, user) => totalCost + user.recentLlmRunCostUsd,
        0
      )

      res.status(200).json({
        recentLlmRunCostUsd,
        totalLlmRunCostUsd,
        users,
        total: users.length,
      })
    } catch (error) {
      console.error("Failed to list admin users:", error)
      res.status(500).json({
        error: "Failed to list users.",
      })
    }
  })

  app.put(
    "/admin/users/:userId/admin-tier-grant",
    async (req: Request, res: Response) => {
      const adminUser = requireAdminUser(req, res)

      if (!adminUser) {
        return
      }

      const userId = String(req.params.userId).trim()

      if (!userId) {
        res.status(400).json({
          error: "User ID is required.",
        })
        return
      }

      const parsedBody = adminSubscriptionTierGrantSchema.safeParse(req.body)

      if (!parsedBody.success) {
        res.status(400).json({
          error:
            "Tier must be plus, pro, or super_max, and days must be an integer from 1 to 3650.",
        })
        return
      }

      try {
        const billingTierSummary = await withDatabaseTransaction((client) =>
          setAdminSubscriptionTierGrant(client, {
            adminUserId: adminUser.id,
            days: parsedBody.data.days,
            targetUserId: userId,
            tier: parsedBody.data.tier as AdminGrantBillingTier,
          })
        )

        if (!billingTierSummary) {
          res.status(404).json({
            error: "User not found.",
          })
          return
        }

        nudgeLlmRunQueue()
        res.status(200).json(billingTierSummary)
      } catch (error) {
        console.error("Failed to set admin subscription tier grant:", error)
        res.status(500).json({
          error: "Admin subscription tier could not be saved.",
        })
      }
    }
  )

  app.delete(
    "/admin/users/:userId/admin-tier-grant",
    async (req: Request, res: Response) => {
      const adminUser = requireAdminUser(req, res)

      if (!adminUser) {
        return
      }

      const userId = String(req.params.userId).trim()

      if (!userId) {
        res.status(400).json({
          error: "User ID is required.",
        })
        return
      }

      try {
        const billingTierSummary = await withDatabaseTransaction((client) =>
          revokeAdminSubscriptionTierGrant(client, {
            adminUserId: adminUser.id,
            targetUserId: userId,
          })
        )

        if (!billingTierSummary) {
          res.status(404).json({
            error: "User not found.",
          })
          return
        }

        res.status(200).json(billingTierSummary)
      } catch (error) {
        console.error("Failed to revoke admin subscription tier grant:", error)
        res.status(500).json({
          error: "Admin subscription tier could not be revoked.",
        })
      }
    }
  )

  app.delete("/admin/users/:userId", async (req: Request, res: Response) => {
    const adminUser = requireAdminUser(req, res)

    if (!adminUser) {
      return
    }

    const userId = String(req.params.userId).trim()

    if (!userId) {
      res.status(400).json({
        error: "User ID is required.",
      })
      return
    }

    if (userId === adminUser.id) {
      res.status(400).json({
        error: "You cannot delete your own account.",
      })
      return
    }

    try {
      await stopActiveAdminUserSimulations(userId)

      const deletion = await deleteAdminUser(userId)

      if (!deletion) {
        res.status(404).json({
          error: "User not found.",
        })
        return
      }

      for (const simulationId of deletion.deletedSimulationIds) {
        simulationResultsBroadcaster.closeSimulation(simulationId)
        closePublicSimulationSubscribers(simulationId)
      }

      nudgeLlmRunQueue()
      res.status(204).send()
    } catch (error) {
      if (error instanceof SimulationStopTimeoutError) {
        res.status(504).json({
          error: error.message,
        })
        return
      }

      console.error("Failed to delete admin user:", error)
      res.status(500).json({
        error: "Failed to delete user.",
      })
    }
  })

  app.get("/llm-model-presets", async (_req: Request, res: Response) => {
    try {
      const presets = await listEnabledLlmModelPresets()

      res.status(200).json({
        presets,
        defaultPresetId:
          presets.find((preset) => preset.isDefault)?.id ?? null,
      })
    } catch (error) {
      console.error("Failed to list model presets:", error)
      res.status(500).json({
        error: "Failed to list model presets.",
      })
    }
  })

  app.get("/usage-limits", async (req: Request, res: Response) => {
    const user = getAuthenticatedUser(req)

    try {
      res.status(200).json({
        usageLimits: await getUserUsageLimitStatus(
          { query: queryDatabase },
          user.id
        ),
      })
    } catch (error) {
      console.error("Failed to load usage limits:", error)
      res.status(500).json({
        error: "Usage limits could not be loaded.",
      })
    }
  })

  app.get(
    "/admin/llm-model-presets",
    async (req: Request, res: Response) => {
      if (!requireAdminUser(req, res)) {
        return
      }

      try {
        const presets = await listAdminLlmModelPresets()

        res.status(200).json({
          presets,
          total: presets.length,
        })
      } catch (error) {
        console.error("Failed to list admin model presets:", error)
        res.status(500).json({
          error: "Failed to list model presets.",
        })
      }
    }
  )

  app.post(
    "/admin/llm-model-presets",
    async (req: Request, res: Response) => {
      if (!requireAdminUser(req, res)) {
        return
      }

      const parsedPreset = createLlmModelPresetSchema.safeParse(req.body)

      if (!parsedPreset.success) {
        res.status(400).json({
          error: "Model preset payload is not in the expected format.",
        })
        return
      }

      try {
        const preset = await createLlmModelPreset(parsedPreset.data)

        res.status(201).json({
          preset,
        })
      } catch (error) {
        if (error instanceof LlmModelPresetValidationError) {
          res.status(400).json({
            error: error.message,
          })
          return
        }

        console.error("Failed to create model preset:", error)
        res.status(500).json({
          error: "Failed to create model preset.",
        })
      }
    }
  )

  app.patch(
    "/admin/llm-model-presets/:presetId/enabled",
    async (req: Request, res: Response) => {
      if (!requireAdminUser(req, res)) {
        return
      }

      const presetId = String(req.params.presetId)
      const parsedUpdate = updateLlmModelPresetEnabledSchema.safeParse(req.body)

      if (!parsedUpdate.success) {
        res.status(400).json({
          error: "Model preset update payload is not in the expected format.",
        })
        return
      }

      try {
        const preset = await setLlmModelPresetEnabled(
          presetId,
          parsedUpdate.data.isEnabled
        )

        if (!preset) {
          res.status(404).json({
            error: "Model preset not found.",
          })
          return
        }

        res.status(200).json({
          preset,
        })
      } catch (error) {
        console.error("Failed to update model preset:", error)
        res.status(500).json({
          error: "Failed to update model preset.",
        })
      }
    }
  )

  app.put(
    "/admin/llm-model-presets/default",
    async (req: Request, res: Response) => {
      if (!requireAdminUser(req, res)) {
        return
      }

      const parsedDefault = setDefaultLlmModelPresetSchema.safeParse(req.body)

      if (!parsedDefault.success) {
        res.status(400).json({
          error: "Default model preset payload is not in the expected format.",
        })
        return
      }

      try {
        const preset = await setDefaultLlmModelPreset(
          parsedDefault.data.presetId
        )

        res.status(200).json({
          preset,
        })
      } catch (error) {
        if (error instanceof LlmModelPresetValidationError) {
          res.status(400).json({
            error: error.message,
          })
          return
        }

        console.error("Failed to set default model preset:", error)
        res.status(500).json({
          error: "Failed to set default model preset.",
        })
      }
    }
  )

  app.delete(
    "/admin/llm-model-presets/:presetId",
    async (req: Request, res: Response) => {
      if (!requireAdminUser(req, res)) {
        return
      }

      const presetId = String(req.params.presetId)

      try {
        const wasDeleted = await deleteUnusedLlmModelPreset(presetId)

        if (!wasDeleted) {
          res.status(404).json({
            error: "Model preset not found.",
          })
          return
        }

        res.status(204).send()
      } catch (error) {
        if (error instanceof LlmModelPresetValidationError) {
          res.status(400).json({
            error: error.message,
          })
          return
        }

        console.error("Failed to delete model preset:", error)
        res.status(500).json({
          error: "Failed to delete model preset.",
        })
      }
    }
  )

  app.use("/decks/:deckId", async (req: Request, res: Response, next) => {
    try {
      const deckId = String(req.params.deckId)
      const deck = await getDeck(deckId, getAuthenticatedUser(req).id)

      if (!deck) {
        res.status(404).json({
          error: "Deck not found.",
        })
        return
      }

      next()
    } catch (error) {
      console.error("Failed to verify deck ownership:", error)
      res.status(500).json({
        error: "Deck access could not be verified.",
      })
    }
  })

  app.get("/decks", async (_req: Request, res: Response) => {
    try {
      res.status(200).json({
        decks: await listDecks(getAuthenticatedUser(_req).id),
      })
    } catch (error) {
      console.error("Failed to list decks:", error)
      res.status(500).json({
        error: "Failed to list decks.",
      })
    }
  })

  app.get("/decks/:deckId", async (req: Request, res: Response) => {
    const deckId = String(req.params.deckId)

    try {
      const deck = await getDeck(deckId)

      if (!deck) {
        res.status(404).json({
          error: "Deck not found.",
        })
        return
      }

      res.status(200).json({
        deck,
      })
    } catch (error) {
      console.error("Failed to load deck:", error)
      res.status(500).json({
        error: "Failed to load deck.",
      })
    }
  })

  app.get("/decks/:deckId/simulations", async (req: Request, res: Response) => {
    const deckId = String(req.params.deckId)

    try {
      const deck = await getDeck(deckId)

      if (!deck) {
        res.status(404).json({
          error: "Deck not found.",
        })
        return
      }

      res.status(200).json({
        simulations: await listSimulationsForDeck(deckId),
      })
    } catch (error) {
      console.error("Failed to list simulations:", error)
      res.status(500).json({
        error: "Failed to list simulations.",
      })
    }
  })

  app.post(
    "/decks/:deckId/simulations",
    async (req: Request, res: Response) => {
      const deckId = String(req.params.deckId)
      const parsedSimulation = createSimulationSchema.safeParse(req.body)
      let createdSimulationId: string | null = null

      if (!parsedSimulation.success) {
        res.status(400).json({
          error: "Simulation payload is not in the expected format.",
        })
        return
      }

      try {
        const simulation = await createSimulation(deckId, {
          ...parsedSimulation.data,
          createdVia: "app",
        })
        createdSimulationId = simulation.id

        await startCreatedSimulationInitialStep(deckId, simulation)

        const updatedSimulation =
          (await getSimulationSummary(deckId, simulation.id)) ?? simulation

        res.status(201).json({
          simulation: updatedSimulation,
        })
      } catch (error) {
        if (createdSimulationId !== null) {
          await markSimulationFailed(
            createdSimulationId,
            getErrorMessage(error)
          ).catch((failError: unknown) => {
            console.error("Failed to mark simulation failed:", failError)
          })
        }

        if (error instanceof SimulationValidationError) {
          const status = error.message === "Deck not found." ? 404 : 400

          res.status(status).json({
            error: error.message,
          })
          return
        }

        if (error instanceof LlmConfigurationError) {
          res.status(500).json({
            error: error.message,
          })
          return
        }

        console.error("Failed to create simulation:", error)
        res.status(500).json({
          error: "Failed to create simulation.",
        })
      }
    }
  )

  app.post(
    "/decks/:deckId/simulations/:simulationId/opening-hand-llm-runs",
    async (req: Request, res: Response) => {
      const deckId = String(req.params.deckId)
      const simulationId = String(req.params.simulationId)

      try {
        const openingHandRun = await prepareAndStartOpeningHandLlmRun({
          deckId,
          simulationId,
          resetBeforeStart: true,
        })

        res.status(202).json(openingHandRun)
      } catch (error) {
        if (error instanceof SimulationValidationError) {
          const status = error.message === "Simulation not found." ? 404 : 400

          res.status(status).json({
            error: error.message,
          })
          return
        }

        if (error instanceof LlmConfigurationError) {
          res.status(500).json({
            error: error.message,
          })
          return
        }

        console.error("Failed to start opening-hand LLM run:", error)
        res.status(500).json({
          error: "Failed to start opening-hand LLM run.",
        })
      }
    }
  )

  app.post(
    "/decks/:deckId/simulations/:simulationId/turn-llm-runs",
    async (req: Request, res: Response) => {
      const deckId = String(req.params.deckId)
      const simulationId = String(req.params.simulationId)
      const parsedTurnRun = createTurnLlmRunSchema.safeParse(req.body)

      if (!parsedTurnRun.success) {
        res.status(400).json({
          error: "Turn LLM run payload is not in the expected format.",
        })
        return
      }

      try {
        const turnNumber = parsedTurnRun.data.turnNumber
        const turnRun = await prepareAndStartTurnLlmRun({
          deckId,
          simulationId,
          turnNumber,
        })

        res.status(202).json({
          simulationId: turnRun.simulationId,
          llmRunId: turnRun.llmRunId,
          turnNumber: turnRun.turnNumber,
          attemptNumber: turnRun.attemptNumber,
          runtimeStreamKey: turnRun.runtimeStreamKey,
          status: turnRun.status,
          createdAt: turnRun.createdAt,
        })
      } catch (error) {
        if (error instanceof SimulationValidationError) {
          const status = error.message === "Simulation not found." ? 404 : 400

          res.status(status).json({
            error: error.message,
          })
          return
        }

        if (error instanceof LlmConfigurationError) {
          res.status(500).json({
            error: error.message,
          })
          return
        }

        console.error("Failed to start turn LLM run:", error)
        res.status(500).json({
          error: "Failed to start turn LLM run.",
        })
      }
    }
  )

  app.post(
    "/decks/:deckId/simulations/:simulationId/stop",
    async (req: Request, res: Response) => {
      const deckId = String(req.params.deckId)
      const simulationId = String(req.params.simulationId)

      try {
        res
          .status(200)
          .json(await stopActiveSimulationLlmRuns(deckId, simulationId))
      } catch (error) {
        if (error instanceof SimulationStopTimeoutError) {
          res.status(504).json({
            error: error.message,
          })
          return
        }

        if (error instanceof SimulationValidationError) {
          const status = error.message === "Simulation not found." ? 404 : 400

          res.status(status).json({
            error: error.message,
          })
          return
        }

        console.error("Failed to stop simulation:", error)
        res.status(500).json({
          error: "Failed to stop simulation.",
        })
      }
    }
  )

  app.get(
    "/decks/:deckId/simulations/:simulationId/debug",
    async (req: Request, res: Response) => {
      if (!requireAdminUser(req, res)) {
        return
      }

      const deckId = String(req.params.deckId)
      const simulationId = String(req.params.simulationId)

      try {
        res.status(200).json({
          debug: await getSimulationDebugInfo(deckId, simulationId),
        })
      } catch (error) {
        if (error instanceof SimulationValidationError) {
          const status = error.message === "Simulation not found." ? 404 : 400

          res.status(status).json({
            error: error.message,
          })
          return
        }

        console.error("Failed to load simulation debug info:", error)
        res.status(500).json({
          error: "Failed to load simulation debug info.",
        })
      }
    }
  )

  app.get(
    "/decks/:deckId/simulations/:simulationId/results",
    async (req: Request, res: Response) => {
      const deckId = String(req.params.deckId)
      const simulationId = String(req.params.simulationId)

      try {
        res.status(200).json({
          results: await getSimulationResultsInfo(deckId, simulationId),
        })
      } catch (error) {
        if (error instanceof SimulationValidationError) {
          const status = error.message === "Simulation not found." ? 404 : 400

          res.status(status).json({
            error: error.message,
          })
          return
        }

        console.error("Failed to load simulation results:", error)
        res.status(500).json({
          error: "Failed to load simulation results.",
        })
      }
    }
  )

  app.get(
    "/decks/:deckId/simulations/:simulationId/results/stream",
    async (req: Request, res: Response) => {
      const deckId = String(req.params.deckId)
      const simulationId = String(req.params.simulationId)
      let streamCleanup: (() => void) | null = null

      try {
        const initialSimulation = await getSimulationSummary(
          deckId,
          simulationId
        )

        if (!initialSimulation) {
          res.status(404).json({
            error: "Simulation not found.",
          })
          return
        }

        res.status(200)
        res.setHeader("Content-Type", "text/event-stream")
        res.setHeader("Cache-Control", "no-cache, no-transform")
        res.setHeader("Connection", "keep-alive")
        res.flushHeaders()
        res.write(formatSseComment("connected"))

        const queuedWrites: string[] = []
        let hasSentSnapshot = false
        let shouldEndAfterSnapshot = false
        let isStreamOpen = true
        let unsubscribe = () => { }
        const keepaliveIntervalId = setInterval(() => {
          if (isStreamOpen) {
            res.write(formatSseComment("keepalive"))
          }
        }, SSE_KEEPALIVE_INTERVAL_MS)
        const cleanup = () => {
          if (!isStreamOpen) {
            return
          }

          isStreamOpen = false
          clearInterval(keepaliveIntervalId)
          unsubscribe()
        }
        streamCleanup = cleanup
        const streamWriter = {
          write(chunk: string) {
            if (!isStreamOpen) {
              return
            }

            if (hasSentSnapshot) {
              res.write(chunk)
              return
            }

            queuedWrites.push(chunk)
          },
          end() {
            if (!isStreamOpen) {
              return
            }

            if (hasSentSnapshot) {
              cleanup()
              res.end()
              return
            }

            shouldEndAfterSnapshot = true
          },
        }

        req.on("close", cleanup)

        if (
          !isTerminalSimulationStatus(initialSimulation.status) ||
          initialSimulation.activeLlmRunCount > 0
        ) {
          unsubscribe = simulationResultsBroadcaster.subscribe(
            simulationId,
            streamWriter
          )
        }

        const snapshot = await getSimulationResultsStreamSnapshot(
          deckId,
          simulationId
        )
        const snapshotEvent: SimulationResultsStreamEvent = {
          type: "snapshot",
          simulation: snapshot.simulation,
          results: snapshot.results,
        }

        res.write(formatSseEvent(snapshotEvent))
        hasSentSnapshot = true

        for (const queuedWrite of queuedWrites) {
          res.write(queuedWrite)
        }

        queuedWrites.length = 0

        if (shouldEndAfterSnapshot) {
          cleanup()
          res.end()
          return
        }

        if (
          isTerminalSimulationStatus(snapshot.simulation.status) &&
          snapshot.simulation.activeLlmRunCount === 0
        ) {
          const doneEvent: SimulationResultsStreamEvent = {
            type: "done",
            simulation: snapshot.simulation,
            results: snapshot.results,
          }

          res.write(formatSseEvent(doneEvent))
          cleanup()
          res.end()
        }
      } catch (error) {
        if (res.headersSent) {
          streamCleanup?.()
          const errorEvent: SimulationResultsStreamEvent = {
            type: "error",
            message: "Simulation results stream could not be opened.",
          }

          res.write(formatSseEvent(errorEvent))
          res.end()
          return
        }

        if (error instanceof SimulationValidationError) {
          const status = error.message === "Simulation not found." ? 404 : 400

          res.status(status).json({
            error: error.message,
          })
          return
        }

        console.error("Failed to open simulation results stream:", error)
        res.status(500).json({
          error: "Failed to open simulation results stream.",
        })
      }
    }
  )

  app.patch(
    "/decks/:deckId/simulations/:simulationId/public",
    async (req: Request, res: Response) => {
      if (!requireAdminUser(req, res)) {
        return
      }

      const deckId = String(req.params.deckId)
      const simulationId = String(req.params.simulationId)
      const parsedUpdate = updateSimulationPublicSchema.safeParse(req.body)

      if (!parsedUpdate.success) {
        res.status(400).json({
          error: "Simulation public update payload is not in the expected format.",
        })
        return
      }

      try {
        const simulation = await setSimulationPublic(
          deckId,
          simulationId,
          parsedUpdate.data.isPublic
        )

        if (simulation.isPublic) {
          publicSimulationIds.add(simulationId)
        } else {
          closePublicSimulationSubscribers(
            simulationId,
            "Simulation is no longer public."
          )
        }

        await publishSimulationResultsState({
          deckId,
          simulationId,
        })

        res.status(200).json({
          simulation,
        })
      } catch (error) {
        if (error instanceof SimulationValidationError) {
          const status = error.message === "Simulation not found." ? 404 : 400

          res.status(status).json({
            error: error.message,
          })
          return
        }

        console.error("Failed to update simulation public state:", error)
        res.status(500).json({
          error: "Failed to update simulation public state.",
        })
      }
    }
  )

  app.patch(
    "/decks/:deckId/simulations/:simulationId",
    async (req: Request, res: Response) => {
      const deckId = String(req.params.deckId)
      const simulationId = String(req.params.simulationId)
      const parsedUpdate = updateSimulationSchema.safeParse(req.body)

      if (!parsedUpdate.success) {
        res.status(400).json({
          error: "Simulation update payload is not in the expected format.",
        })
        return
      }

      try {
        const simulation = await updateSimulation(
          deckId,
          simulationId,
          parsedUpdate.data
        )

        await publishSimulationResultsState({
          deckId,
          simulationId,
        })

        res.status(200).json({
          simulation,
        })
      } catch (error) {
        if (error instanceof SimulationValidationError) {
          const status = error.message === "Simulation not found." ? 404 : 400

          res.status(status).json({
            error: error.message,
          })
          return
        }

        console.error("Failed to update simulation:", error)
        res.status(500).json({
          error: "Failed to update simulation.",
        })
      }
    }
  )

  app.delete(
    "/decks/:deckId/simulations/:simulationId",
    async (req: Request, res: Response) => {
      const deckId = String(req.params.deckId)
      const simulationId = String(req.params.simulationId)

      try {
        await stopActiveSimulationLlmRuns(deckId, simulationId)

        const wasDeleted = await deleteSimulation(deckId, simulationId)

        if (!wasDeleted) {
          res.status(404).json({
            error: "Simulation not found.",
          })
          return
        }

        simulationResultsBroadcaster.closeSimulation(simulationId)
        closePublicSimulationSubscribers(simulationId)
        res.status(204).send()
      } catch (error) {
        if (error instanceof SimulationStopTimeoutError) {
          res.status(504).json({
            error: error.message,
          })
          return
        }

        if (error instanceof SimulationValidationError) {
          const status = error.message === "Simulation not found." ? 404 : 400

          res.status(status).json({
            error: error.message,
          })
          return
        }

        console.error("Failed to delete simulation:", error)
        res.status(500).json({
          error: "Failed to delete simulation.",
        })
      }
    }
  )

  app.get(
    "/decks/:deckId/starting-hands",
    async (req: Request, res: Response) => {
      const deckId = String(req.params.deckId)

      try {
        const deck = await getDeck(deckId)

        if (!deck) {
          res.status(404).json({
            error: "Deck not found.",
          })
          return
        }

        res.status(200).json({
          startingHands: await listStartingHandsForDeck(deckId),
        })
      } catch (error) {
        console.error("Failed to list starting hands:", error)
        res.status(500).json({
          error: "Failed to list starting hands.",
        })
      }
    }
  )

  app.get(
    "/decks/:deckId/starting-hands/:startingHandId",
    async (req: Request, res: Response) => {
      const deckId = String(req.params.deckId)
      const startingHandId = String(req.params.startingHandId)

      try {
        const deck = await getDeck(deckId)

        if (!deck) {
          res.status(404).json({
            error: "Deck not found.",
          })
          return
        }

        const startingHand = await getStartingHandForDeck(
          deckId,
          startingHandId
        )

        if (!startingHand) {
          res.status(404).json({
            error: "Starting hand not found.",
          })
          return
        }

        res.status(200).json({
          startingHand,
        })
      } catch (error) {
        console.error("Failed to load starting hand:", error)
        res.status(500).json({
          error: "Failed to load starting hand.",
        })
      }
    }
  )

  app.post(
    "/decks/:deckId/starting-hands",
    async (req: Request, res: Response) => {
      const deckId = String(req.params.deckId)
      const parsedStartingHand = createStartingHandSchema.safeParse(req.body)

      if (!parsedStartingHand.success) {
        res.status(400).json({
          error: "Starting hand payload is not in the expected format.",
        })
        return
      }

      try {
        const startingHand = await createStartingHand(
          deckId,
          parsedStartingHand.data
        )

        res.status(201).json({
          startingHand,
        })
      } catch (error) {
        if (error instanceof StartingHandValidationError) {
          const status = error.message === "Deck not found." ? 404 : 400

          res.status(status).json({
            error: error.message,
          })
          return
        }

        console.error("Failed to create starting hand:", error)
        res.status(500).json({
          error: "Failed to create starting hand.",
        })
      }
    }
  )

  app.delete(
    "/decks/:deckId/starting-hands/:startingHandId",
    async (req: Request, res: Response) => {
      const deckId = String(req.params.deckId)
      const startingHandId = String(req.params.startingHandId)

      try {
        const wasDisabled = await disableStartingHand(deckId, startingHandId)

        if (!wasDisabled) {
          res.status(404).json({
            error: "Starting hand not found.",
          })
          return
        }

        res.status(204).send()
      } catch (error) {
        console.error("Failed to delete starting hand:", error)
        res.status(500).json({
          error: "Failed to delete starting hand.",
        })
      }
    }
  )

  app.get("/decks/:deckId/saved-seeds", async (req: Request, res: Response) => {
    const deckId = String(req.params.deckId)

    try {
      const deck = await getDeck(deckId)

      if (!deck) {
        res.status(404).json({
          error: "Deck not found.",
        })
        return
      }

      res.status(200).json({
        savedSeeds: await listSavedSeedsForDeck(deckId),
      })
    } catch (error) {
      console.error("Failed to list saved seeds:", error)
      res.status(500).json({
        error: "Failed to list saved seeds.",
      })
    }
  })

  app.post(
    "/decks/:deckId/saved-seeds",
    async (req: Request, res: Response) => {
      const deckId = String(req.params.deckId)
      const parsedSavedSeed = createSavedSeedSchema.safeParse(req.body)

      if (!parsedSavedSeed.success) {
        res.status(400).json({
          error: "Saved seed payload is not in the expected format.",
        })
        return
      }

      try {
        const savedSeed = await createSavedSeed(deckId, parsedSavedSeed.data)

        res.status(201).json({
          savedSeed,
        })
      } catch (error) {
        if (error instanceof SavedSeedValidationError) {
          const status = error.message === "Deck not found." ? 404 : 400

          res.status(status).json({
            error: error.message,
          })
          return
        }

        console.error("Failed to create saved seed:", error)
        res.status(500).json({
          error: "Failed to create saved seed.",
        })
      }
    }
  )

  app.delete(
    "/decks/:deckId/saved-seeds/:savedSeedId",
    async (req: Request, res: Response) => {
      const deckId = String(req.params.deckId)
      const savedSeedId = String(req.params.savedSeedId)

      try {
        const wasDisabled = await disableSavedSeed(deckId, savedSeedId)

        if (!wasDisabled) {
          res.status(404).json({
            error: "Saved seed not found.",
          })
          return
        }

        res.status(204).send()
      } catch (error) {
        console.error("Failed to delete saved seed:", error)
        res.status(500).json({
          error: "Failed to delete saved seed.",
        })
      }
    }
  )

  app.patch("/decks/:deckId", async (req: Request, res: Response) => {
    const deckId = String(req.params.deckId)
    const parsedDeck = updateDeckDetailsSchema.safeParse(req.body)

    if (!parsedDeck.success) {
      res.status(400).json({
        error: "Deck details payload is not in the expected format.",
      })
      return
    }

    try {
      const updatedDeck = await updateDeckDetails(
        deckId,
        parsedDeck.data,
        getAuthenticatedUser(req).id
      )

      if (!updatedDeck) {
        res.status(404).json({
          error: "Deck not found.",
        })
        return
      }

      res.status(200).json({
        deck: updatedDeck,
      })
    } catch (error) {
      console.error("Failed to update deck details:", error)
      res.status(500).json({
        error: "Failed to update deck details.",
      })
    }
  })

  app.post("/decks", async (req: Request, res: Response) => {
    const parsedDeck = createDeckSchema.safeParse(req.body)
    const user = getAuthenticatedUser(req)

    if (!parsedDeck.success) {
      res.status(400).json({
        error: "Deck payload is not in the expected format.",
      })
      return
    }

    const commanderNames = new Set(
      parsedDeck.data.commanders.map((commander) =>
        commander.toLocaleLowerCase()
      )
    )

    if (commanderNames.size !== parsedDeck.data.commanders.length) {
      res.status(400).json({
        error: "Commander cards must be different.",
      })
      return
    }

    const expectedDeckSize = parsedDeck.data.commanders.length === 2 ? 98 : 99
    const actualDeckSize = parsedDeck.data.cards.reduce(
      (total, card) => total + card.quantity,
      0
    )

    if (actualDeckSize !== expectedDeckSize) {
      res.status(400).json({
        error: `Deck list must contain exactly ${expectedDeckSize} cards. Parsed ${actualDeckSize}.`,
      })
      return
    }

    try {
      const cardResolution = await resolveExactScryfallOracleCards([
        ...parsedDeck.data.commanders,
        ...parsedDeck.data.cards.map((card) => card.name),
      ])

      if (cardResolution.missingNames.length > 0) {
        res.status(400).json({
          error: `Could not find exact matches for: ${cardResolution.missingNames.join(", ")}.`,
          unmatchedCards: cardResolution.missingNames,
        })
        return
      }

      const exactMatchesByName = createExactScryfallOracleCardMatchMap(
        cardResolution.matches
      )
      const commanderOracleIds = parsedDeck.data.commanders.map((commander) =>
        getExactMatchOracleId(exactMatchesByName, commander)
      )

      if (new Set(commanderOracleIds).size !== commanderOracleIds.length) {
        res.status(400).json({
          error: "Commander cards must be different.",
        })
        return
      }

      const createdDeck = await createDeck({
        name: parsedDeck.data.name,
        desc: parsedDeck.data.desc,
        mulliganGuidelines: parsedDeck.data.mulliganGuidelines,
        strategyGuidelines: parsedDeck.data.strategyGuidelines,
        ownerUserId: user.id,
        commanders: commanderOracleIds.map((oracleId) => ({
          oracleId,
          quantity: 1,
        })),
        cards: parsedDeck.data.cards.map((card) => ({
          oracleId: getExactMatchOracleId(exactMatchesByName, card.name),
          quantity: card.quantity,
        })),
      })

      res.status(201).json({
        deck: createdDeck,
      })
    } catch (error) {
      console.error("Failed to create deck:", error)
      res.status(500).json({
        error: "Failed to create deck.",
      })
    }
  })

  app.delete("/decks/:deckId", async (req: Request, res: Response) => {
    const deckId = String(req.params.deckId)

    try {
      const wasDeleted = await deleteDeck(deckId, getAuthenticatedUser(req).id)

      if (!wasDeleted) {
        res.status(404).json({
          error: "Deck not found.",
        })
        return
      }

      res.status(204).send()
    } catch (error) {
      console.error("Failed to delete deck:", error)
      res.status(500).json({
        error: "Failed to delete deck.",
      })
    }
  })

  registerMcpEndpoint(app, OPENING_HAND_MCP_PATH, createOpeningHandServer, {
    phase: "opening_hand",
  })
  registerMcpEndpoint(app, TURN_SIMULATION_MCP_PATH, createTurnSimulationServer, {
    phase: "turn",
  })

  app.listen(port, host, (error?: Error) => {
    if (error) {
      console.error("Failed to start server:", error)
      process.exit(1)
    }

    console.error(`${SERVER_NAME} listening at http://${host}:${port}`)
    console.error(
      `Opening-hand MCP endpoint available at http://${host}:${port}${OPENING_HAND_MCP_PATH}`
    )
    console.error(
      `Turn-simulation MCP endpoint available at http://${host}:${port}${TURN_SIMULATION_MCP_PATH}`
    )
    startLlmRunQueue(queueConfig)
  })
}

async function promoteConfiguredAutoAdminUserOnStartup() {
  const autoAdminEmail = getConfiguredAutoAdminEmail()

  if (!autoAdminEmail) {
    return
  }

  const promotion = await promoteAdminUserByEmail(autoAdminEmail)

  if (!promotion) {
    console.info(
      `${AUTO_ADMIN_EMAIL_ENVIRONMENT_VARIABLE} is configured, but no matching user exists yet. A matching new user will be promoted when created.`
    )
    return
  }

  if (promotion.wasPromoted) {
    console.info("Auto-promoted configured admin user on startup:", {
      email: promotion.email,
      environmentVariable: AUTO_ADMIN_EMAIL_ENVIRONMENT_VARIABLE,
      userId: promotion.id,
    })
  }
}

function getExactMatchOracleId(
  matchesByName: ReturnType<typeof createExactScryfallOracleCardMatchMap>,
  cardName: string
) {
  const match = matchesByName.get(
    normalizeScryfallCardNameForExactMatch(cardName)
  )

  if (!match) {
    throw new Error(`Missing exact card match for ${JSON.stringify(cardName)}.`)
  }

  return match.oracleId
}

function registerShutdownHandlers() {
  const shutdown = (signal: NodeJS.Signals) => {
    void (async () => {
      stopLlmRunQueue()
      console.error(`Received ${signal}. Closing database pool...`)
      await closeDatabasePool()
      process.exit(0)
    })()
  }

  process.once("SIGINT", shutdown)
  process.once("SIGTERM", shutdown)
}


function applyCors(
  req: Request,
  res: Response,
  allowedOrigins: readonly string[]
) {
  const requestOrigin = req.headers.origin

  if (requestOrigin && isAllowedOrigin(requestOrigin, allowedOrigins)) {
    res.setHeader("Access-Control-Allow-Origin", requestOrigin)
    res.setHeader("Access-Control-Allow-Credentials", "true")
    res.setHeader("Vary", "Origin")
  }

  if (req.headers["access-control-request-private-network"] === "true") {
    res.setHeader("Access-Control-Allow-Private-Network", "true")
  }

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,POST,PUT,PATCH,DELETE,OPTIONS"
  )
  res.setHeader(
    "Access-Control-Allow-Headers",
    getAllowedRequestHeaders(req.headers["access-control-request-headers"])
  )
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id")
}

function getAuthenticatedUser(req: Request) {
  const user = authenticatedUsersByRequest.get(req)

  if (!user) {
    throw new Error("Request has not been authenticated.")
  }

  return user
}

function requireAdminUser(req: Request, res: Response) {
  const user = getAuthenticatedUser(req)

  if (user.role !== "admin") {
    res.status(403).json({
      error: "Admin access required.",
    })
    return null
  }

  return user
}

function parseAppSignUpBody(body: unknown) {
  if (!body || typeof body !== "object") {
    return null
  }

  const record = body as Record<string, unknown>
  const parsedBody = appSignUpSchema.safeParse({
    email:
      typeof record.email === "string"
        ? record.email.trim().toLowerCase()
        : record.email,
    password: record.password,
  })

  return parsedBody.success ? parsedBody.data : null
}

function parsePasswordResetTokenParam(token: unknown) {
  const parsedToken = passwordResetTokenSchema.safeParse(token)

  return parsedToken.success ? parsedToken.data : null
}

async function userEmailExists(email: string) {
  const result = await queryDatabase(
    `
      SELECT 1
      FROM "user"
      WHERE lower(email) = lower($1)
      LIMIT 1
    `,
    [email]
  )

  return (result.rowCount ?? 0) > 0
}

function forwardResponseCookies(res: Response, headers: Headers) {
  const getSetCookie = (headers as Headers & { getSetCookie?: () => string[] })
    .getSetCookie
  const setCookieHeaders = getSetCookie
    ? getSetCookie.call(headers)
    : headers.get("set-cookie")
      ? [headers.get("set-cookie") as string]
      : []

  if (setCookieHeaders.length > 0) {
    res.append("Set-Cookie", setCookieHeaders)
  }
}

function isAuthPath(path: string) {
  return path === AUTH_PATH_PREFIX || path.startsWith(`${AUTH_PATH_PREFIX}/`)
}

function isAllowedOrigin(origin: string, allowedOrigins: readonly string[]) {
  return allowedOrigins.includes(origin) || isLoopbackOrigin(origin)
}

function isLoopbackOrigin(origin: string) {
  try {
    const parsedOrigin = new URL(origin)

    return (
      parsedOrigin.protocol === "http:" &&
      (parsedOrigin.hostname === "localhost" ||
        parsedOrigin.hostname === "127.0.0.1" ||
        parsedOrigin.hostname === "[::1]")
    )
  } catch {
    return false
  }
}

function getAllowedCorsOrigins() {
  return [
    normalizeOrigin(getRequiredServerEnvironmentVariable("APP_PUBLIC_URL")),
    ...LOOPBACK_ALLOWED_ORIGINS,
  ]
}

function getAllowedHostnames() {
  return Array.from(
    new Set([
      ...LOOPBACK_ALLOWED_HOSTNAMES,
      getHostnameFromUrl(
        getRequiredServerEnvironmentVariable("BETTER_AUTH_URL"),
        "BETTER_AUTH_URL"
      ),
    ])
  )
}

function normalizeOrigin(url: string) {
  return new URL(url.trim()).origin
}

function getHostnameFromUrl(url: string, environmentVariable: string) {
  try {
    return new URL(url.trim()).hostname
  } catch {
    throw new Error(
      `${environmentVariable} must be a valid absolute URL for host validation.`
    )
  }
}

function getRequiredServerEnvironmentVariable(environmentVariable: string) {
  const value = process.env[environmentVariable]?.trim()

  if (!value) {
    throw new Error(`Missing server environment variable: ${environmentVariable}.`)
  }

  return value
}

function getAllowedRequestHeaders(
  requestedHeaders: string | string[] | undefined
) {
  const headerNames = new Set(
    DEFAULT_ALLOWED_HEADERS.map((header) => header.toLowerCase())
  )
  const requestedHeaderList = Array.isArray(requestedHeaders)
    ? requestedHeaders.join(",")
    : requestedHeaders

  if (requestedHeaderList) {
    for (const header of requestedHeaderList.split(",")) {
      const normalizedHeader = header.trim().toLowerCase()

      if (normalizedHeader) {
        headerNames.add(normalizedHeader)
      }
    }
  }

  return Array.from(headerNames).join(", ")
}

function registerMcpEndpoint(
  app: Express,
  path: string,
  createScopedServer: (authContext?: LlmRunMcpTokenContext) => McpServer,
  authOptions?: {
    phase: LlmRunMcpTokenPhase
  }
) {
  app.post(path, async (req: Request, res: Response) => {
    await handleMcpRequest(req, res, createScopedServer, authOptions)
  })

  app.get(path, (_req: Request, res: Response) => {
    respondWithMethodNotAllowed(res)
  })

  app.delete(path, (_req: Request, res: Response) => {
    respondWithMethodNotAllowed(res)
  })
}

async function authenticateMcpRequest(
  req: Request,
  res: Response,
  phase: LlmRunMcpTokenPhase
) {
  const token = getMcpRunTokenFromRequest(req)

  if (!token) {
    res.status(401).json({
      error: "MCP run token is required.",
    })
    return null
  }

  const authContext = await getActiveLlmRunMcpTokenContext({
    phase,
    tokenHash: hashMcpRunToken(token),
  })

  if (!authContext) {
    res.status(401).json({
      error: "MCP run token is invalid or expired.",
    })
    return null
  }

  return authContext
}

function getMcpRunTokenFromRequest(req: Request) {
  const authorization = req.headers.authorization

  if (typeof authorization === "string") {
    const match = authorization.match(/^Bearer\s+(.+)$/i)

    if (match?.[1]?.trim()) {
      return match[1].trim()
    }
  }

  const requestUrl = new URL(req.originalUrl, `http://${DEFAULT_HOST}`)

  return requestUrl.searchParams.get("mcpRunToken")?.trim() || null
}

async function handleMcpRequest(
  req: Request,
  res: Response,
  createScopedServer: (authContext?: LlmRunMcpTokenContext) => McpServer,
  authOptions?: {
    phase: LlmRunMcpTokenPhase
  }
) {
  let authContext: LlmRunMcpTokenContext | null | undefined

  try {
    authContext = authOptions
      ? await authenticateMcpRequest(req, res, authOptions.phase)
      : undefined
  } catch (error) {
    console.error("Failed to authenticate MCP request:", error)
    res.status(500).json({
      error: "MCP authentication could not be verified.",
    })
    return
  }

  if (authContext === null) {
    return
  }

  const server = createScopedServer(authContext)
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  })
  let didCleanup = false

  const cleanup = () => {
    if (didCleanup) {
      return
    }

    didCleanup = true
    void transport.close()
    void server.close()
  }

  res.on("close", cleanup)

  try {
    await server.connect(transport)
    await transport.handleRequest(req, res, req.body)
  } catch (error) {
    cleanup()
    console.error("Error handling MCP request:", error)

    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal server error",
        },
        id: null,
      })
    }
  }
}

function respondWithMethodNotAllowed(res: Response) {
  res.status(405).json({
    jsonrpc: "2.0",
    error: {
      code: -32000,
      message: "Method not allowed.",
    },
    id: null,
  })
}

function isMcpPath(path: string) {
  return path === OPENING_HAND_MCP_PATH || path === TURN_SIMULATION_MCP_PATH
}

async function resolveSimulationPromptIdentifier(identifier: LlmRunIdentifier) {
  const llmRunId = identifier.llmRunId.trim()

  if (!llmRunId) {
    throw new SimulationValidationError(
      "Prompt construction requires an LLM run ID."
    )
  }

  return {
    llmRunId,
    simulationId: await resolveSimulationIdentifier({ llmRunId }),
  }
}

export async function buildStartingHandSimulationPrompt(
  identifier: LlmRunIdentifier
) {
  const { llmRunId, simulationId } =
    await resolveSimulationPromptIdentifier(identifier)
  const promptData = await getStartingHandSimulationPromptData(simulationId)

  if (!promptData) {
    throw new Error("Simulation not found.")
  }

  return buildStartingHandSimulationPromptFromData(promptData, llmRunId)
}

function buildStartingHandSimulationPromptFromData(
  { commanders, library, mulliganGuidelines }: StartingHandSimulationPromptData,
  llmRunId: string
) {
  const commanderLabel = commanders.length === 1 ? "Commander" : "Commanders"
  const commanderNames = expandCardNames(commanders)
  const cardNames = expandCardNames(library)
  const uniqueCards = dedupeCardsByNameAndText([...commanders, ...library])
  const cardReference = formatCardReference(uniqueCards)
  const mulliganGuidelinesSection = formatUserGuidelinesSection(
    "User provided mulligan guidelines",
    "USER PROVIDED MULLIGAN GUIDELINES",
    mulliganGuidelines
  )
  const mulliganGuidelinesBlock = mulliganGuidelinesSection
    ? `\n\n${mulliganGuidelinesSection}`
    : ""

  return `${DRAW_STARTING_HAND_PROMPT}

${commanderLabel}:
${commanderNames.join("\n")}

Decklist:
${cardNames.join("\n")}

Card reference:
${cardReference}${mulliganGuidelinesBlock}

LLM Run ID: ${llmRunId}
`.trim()
}

function expandCardNames(cards: readonly SimulationPromptCard[]) {
  return cards.flatMap((card) =>
    Array.from({ length: card.quantity }, () => card.name)
  )
}

function dedupeCardsByNameAndText(cards: readonly SimulationPromptCard[]) {
  const cardsByNameAndText = new Map<string, SimulationPromptCard>()

  for (const card of cards) {
    const key = `${card.name}\n${formatCardText(card)}`

    if (!cardsByNameAndText.has(key)) {
      cardsByNameAndText.set(key, card)
    }
  }

  return Array.from(cardsByNameAndText.values())
}

function formatCardReference(cards: readonly SimulationPromptCard[]) {
  return cards
    .map((card) => `${card.name}\n${formatCardText(card)}\n`)
    .join("\n")
}

function formatCardText(card: SimulationPromptCard) {
  const lines = [
    formatCardLine("Mana Cost", card.manaCost),
    formatCardLine("Mana Value", card.convertedManaCost),
    formatCardLine("Type", card.typeLine),
    formatCardLine("Rules Text", card.oracleText),
    formatPowerToughness(card),
    formatCardLine("Loyalty", card.loyalty),
  ].filter((line) => line !== null)

  if (card.cardFaces.length > 0) {
    lines.push(
      "Faces:",
      ...card.cardFaces.flatMap((face) =>
        [
          face.name,
          formatCardLine("Mana Cost", face.manaCost),
          formatCardLine("Type", face.typeLine),
          formatCardLine("Rules Text", face.oracleText),
          formatPowerToughness(face),
          formatCardLine("Loyalty", face.loyalty),
        ].filter((line) => line !== null)
      )
    )
  }

  return lines.join("\n")
}

function formatCardLine(label: string, value: string | null) {
  return value ? `${label}: ${value}` : null
}

function formatPowerToughness({
  power,
  toughness,
}: {
  power: string | null
  toughness: string | null
}) {
  return power !== null && toughness !== null
    ? `Power/Toughness: ${power}/${toughness}`
    : null
}

export async function buildTurnSimulationPrompt(
  identifier: LlmRunIdentifier,
  gameState?: unknown
) {
  const { llmRunId, simulationId } =
    await resolveSimulationPromptIdentifier(identifier)
  const promptData = await getTurnSimulationPromptData(simulationId)

  if (!promptData) {
    throw new Error("Simulation not found.")
  }

  return buildTurnSimulationPromptFromData(promptData, llmRunId, gameState)
}

function buildTurnSimulationPromptFromData(
  {
    commanders,
    library,
    libraryCards,
    startingHand,
    strategyGuidelines,
  }: TurnSimulationPromptData,
  llmRunId: string,
  gameState?: unknown
) {
  const commanderNames = expandCardNames(commanders)
  const cardNames = [...library].sort((left, right) =>
    left.localeCompare(right)
  )
  const uniqueCards = dedupeCardsByNameAndText([...commanders, ...libraryCards])
  const cardReference = formatCardReference(uniqueCards)
  const resolvedGameState =
    gameState ?? buildInitialTurnGameState({
      commanderNames,
      startingHand,
    })
  const strategyGuidelinesSection = formatUserGuidelinesSection(
    "User provided strategy guidelines",
    "USER PROVIDED STRATEGY GUIDELINES",
    strategyGuidelines
  )
  const strategyGuidelinesBlock = strategyGuidelinesSection
    ? `\n\n${strategyGuidelinesSection}`
    : ""
  const simulateTurnPrompt = buildSimulateTurnPrompt({
    genericGameRulesReferenceEnabled: getGenericGameRulesReferenceEnabled(),
  })

  return `${simulateTurnPrompt}

Card reference:
${cardReference}${strategyGuidelinesBlock}

Cards in library. Not actual order of library. Use tools to interact with library:
${cardNames.join("\n")}

===Start Previous End of Turn Game State===

${formatJsonForPrompt(resolvedGameState)}

===End Game State===

LLM Run ID: ${llmRunId}
`.trim()
}

function buildInitialTurnGameState({
  commanderNames,
  startingHand,
}: {
  commanderNames: readonly string[]
  startingHand: readonly string[]
}) {
  const commanderDamage = Object.fromEntries(
    commanderNames.map((commanderName) => [commanderName, 0])
  )

  return {
    zones: {
      hand: startingHand.map(createInitialGameStateCard),
      command: commanderNames.map(createInitialGameStateCard),
      battlefield: [],
      graveyard: [],
      exile: [],
    },
    yourLife: 40,
    opponentA: {
      life: 40,
      commanderDamage,
    },
    opponentB: {
      life: 40,
      commanderDamage,
    },
    opponentC: {
      life: 40,
      commanderDamage,
    },
    other: "",
  }
}

function createInitialGameStateCard(name: string) {
  return {
    name,
    tapped: null,
    notes: null,
  }
}

function formatJsonForPrompt(value: unknown) {
  return JSON.stringify(value, null, 2) ?? "null"
}

main().catch(async (error: unknown) => {
  console.error(error)
  await closeDatabasePool()
  process.exit(1)
})
