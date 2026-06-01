import "./environment.js"
import express, { type Express, type Request, type Response } from "express"
import { fromNodeHeaders, toNodeHandler } from "better-auth/node"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import { hostHeaderValidation } from "@modelcontextprotocol/sdk/server/middleware/hostHeaderValidation.js"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto"
import { createReadStream } from "node:fs"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import Anthropic from "@anthropic-ai/sdk"
import OpenAI from "openai"
import { z } from "zod/v4"
import {
  assertCompletedAnthropicMessage,
  buildAnthropicRequestPayload,
  getAnthropicMessageOutputText,
  normalizeAnthropicUsage,
  type AnthropicRequestPayload,
} from "./anthropic-messages.js"
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
  createBenchmarkRun,
  createBenchmarkSimulationSeed,
  ensureBenchmarkRunsSchema,
  getAdminBenchmark,
  linkBenchmarkSimulation,
  listAdminBenchmarks,
  listBenchmarkRunSimulationsForAdmin,
  markBenchmarkRunFailed,
  markBenchmarkRunStopped,
  MAX_BENCHMARK_SIMULATIONS_PER_DECK,
} from "./benchmarks-postgres.js"
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
  updateLlmModelPreset,
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
  buildStartingHandSimulationPromptParts,
  buildTurnSimulationPromptParts,
  isStructuredSimulationPrompt,
  type StructuredSimulationPrompt,
} from "./simulation-prompts.js"
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
  disableSimulationAutoAdvance,
  drawCardsFromBottom,
  drawCardsFromTop,
  drawStartingHand,
  ensureSimulationsSchema,
  failLlmRun,
  getActiveLlmRunMcpTokenContext,
  getSimulationCreationDecision,
  getSimulationDebugInfo,
  getSimulationResultsInfo,
  getSimulationSummary,
  isLlmRunActive,
  listActiveSimulationLlmRuns,
  listOpenAiBatchesToPoll,
  listOpenAiBatchItemsForReconcile,
  listPendingOpenAiBatchRuns,
  listSimulationsForDeck,
  markLlmRunQueued,
  markSimulationCancelled,
  markSimulationCompleted,
  markSimulationFailed,
  mulliganSimulation,
  requestCancelSimulationLlmRuns,
  recordOpenAiBatchItemError,
  recordOpenAiBatchItemOutput,
  recordOpenAiBatchSubmitted,
  resetSimulationForOpeningHandLlmRun,
  returnCardToSimulationLibrary,
  returnCardsToSimulationLibrary,
  revokeLlmRunMcpToken,
  shuffleSimulationLibrary,
  SIMULATION_AUTO_ADVANCE_DISABLED_MESSAGE,
  SIMULATION_AUTO_ADVANCE_NOT_RUNNING_MESSAGE,
  SimulationValidationError,
  takeCardsFromSimulationLibrary,
  updateLlmRunRequestData,
  updateOpenAiBatchProviderState,
  updateSimulation,
} from "./simulations-postgres.js"
import type {
  LlmRunMcpTokenContext,
  LlmRunMcpTokenPhase,
  LlmRunPhase,
  LlmProcessingMode,
  LlmRunStatus,
  ClaimedQueuedLlmRun,
  LlmRunQueueClaimResult,
  OpenAiBatchPendingRun,
  SimulationDebugLlmRun,
  SimulationLlmCompletionResult,
  SimulationResultsInfo,
  SimulationSummary,
} from "./simulations-postgres.js"
import {
  ensureUserUsageLimitWindowsForRunStartWithClient,
  ensureUsageLimitsSchema,
  getUserUsageLimitStatus,
  USAGE_LIMIT_OUT_OF_USAGE_MESSAGE,
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
  asRecord,
  getCompletedResponseOutputText,
  getErrorMessage,
  getStringProperty,
  isAbortError,
  parseOpeningHandCompletionFromResponseText,
  parseTurnSimulationCompletionFromResponseText,
} from "./llm-run-events.js"
import {
  collectLlamaCppChatCompletionNonStreaming,
  createLlamaCppChatCompletionTools,
  type LlamaCppChatCompletionRequestPayload,
  type LlamaCppToolDefinition,
  type LlamaCppChatCompletionCreateNonStreaming,
} from "./llamacpp-chat.js"
import {
  callWithRuntimeAbortSignal,
  createRuntimeAbortError,
  registerRuntimeAbortHandler,
  throwIfRuntimeAborted,
} from "./llm-runtime-cancellation.js"
import { runAuditedMcpFunctionCall } from "./mcp-function-call-audit.js"
import {
  buildOpenRouterReasoningOptions,
  buildProviderReasoningOptions,
  LlmConfigurationError,
  getLlmRunQueueConfig,
  getOpeningHandLlmRunConfig,
  getTurnSimulationLlmRunConfig,
  llmProviderSchema,
  reasoningEffortSchema,
  type OpenAiRunConfig,
  type AnthropicRunConfig,
  type OpenRouterRunConfig,
  type OpeningHandLlmRunConfig,
  type OpeningHandAnthropicRunConfig,
  type OpeningHandOpenAiRunConfig,
  type ResolvedLlamaCppRunConfig,
  type ResolvedOpeningHandLlmRunConfig,
  type ResolvedTurnSimulationLlmRunConfig,
  type TurnSimulationAnthropicRunConfig,
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
  redactSimulationResultsInfoCosts,
  redactSimulationResultsStreamEventCosts,
  type SimulationResultsStreamEvent,
  type SimulationResultsStreamInfo,
  type SimulationResultsStreamRun,
} from "./simulation-results-stream.js"
import {
  applyLlmRunEstimatedCostServiceTierDiscount,
  aggregateOpenRouterUsage,
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
import {
  ArchidektImportError,
  importArchidektDeck,
} from "./archidekt-import.js"
import { createJsonZipArchive } from "./zip.js"

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
const PUBLIC_SIMULATION_EXPORT_SCHEMA_VERSION = 1
const BENCHMARK_EXPORT_SCHEMA_VERSION = 1
const SSE_KEEPALIVE_INTERVAL_MS = 15000
const LLM_RUN_QUEUE_POLL_INTERVAL_MS = 1000
const MCP_RUN_TOKEN_TTL_MS = 6 * 60 * 60 * 1000
const OPENAI_BATCH_POLL_INTERVAL_MS = 60 * 1000
const OPENAI_BATCH_MCP_RUN_TOKEN_TTL_MS = 26 * 60 * 60 * 1000
const OPENAI_BATCH_COMPLETION_WINDOW = "24h"
const OPENAI_BATCH_ENDPOINT = "/v1/responses"
const OPENAI_BATCH_MAX_JSONL_BYTES = 90 * 1024 * 1024
const OPENAI_BATCH_TMP_PREFIX = "mtg-auto-deck-openai-batch-"
const QUEUED_MCP_RUN_TOKEN_PLACEHOLDER = "queued"
const SUBMITTED_BATCH_RUN_STOP_MESSAGE =
  "Submitted batch runs cannot be stopped. Stop future turns instead."
const FREE_TIER_FLEX_PROCESSING_REQUIRED_MESSAGE =
  "Free tier users must enable flex processing before starting LLM runs."
const FREE_TIER_MODEL_PRESET_REQUIRED_MESSAGE =
  "Free tier users must choose a free tier model preset before starting LLM runs."
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
const deckCardInputSchema = z.object({
  name: z.string().trim().min(1),
  quantity: z.number().int().positive(),
})
const createDeckCardsSchema = z.object({
  commanders: z.array(z.string().trim().min(1)).min(1).max(2),
  cards: z.array(deckCardInputSchema),
})
const createDeckSchema = createDeckCardsSchema.extend({
  name: z.string().trim().min(1),
  desc: z.string(),
  mulliganGuidelines: createDeckGuidelinesSchema(),
  strategyGuidelines: createDeckGuidelinesSchema(),
})
const archidektImportSchema = z.object({
  input: z.string().trim().min(1),
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
  llmProcessingMode: z.enum(["realtime", "openai_batch"]).default("realtime"),
  reasoningSummariesEnabled: z.boolean().default(false),
  useFlexServiceTier: z.boolean().default(false),
  startingHandId: z.uuid().nullable(),
})
const createBenchmarkSchema = z
  .object({
    deckIds: z.array(z.uuid()).min(1),
    llmModelPresetId: z.uuid(),
    simulationsPerDeck: z
      .number()
      .int()
      .min(1)
      .max(MAX_BENCHMARK_SIMULATIONS_PER_DECK),
    turnsToSimulate: z.number().int().nonnegative(),
    llmProcessingMode: z.enum(["realtime", "openai_batch"]),
    useFlexServiceTier: z.boolean(),
  })
  .strict()
const updateSimulationSchema = z
  .object({
    llmModelPresetId: z.uuid().optional(),
    llmProcessingMode: z.enum(["realtime", "openai_batch"]).optional(),
    reasoningSummariesEnabled: z.boolean().optional(),
    useFlexServiceTier: z.boolean().optional(),
  })
  .refine(
    (update) =>
      update.llmModelPresetId !== undefined ||
      update.llmProcessingMode !== undefined ||
      update.reasoningSummariesEnabled !== undefined ||
      update.useFlexServiceTier !== undefined
  )
const optionalTokenCostSchema = z
  .number()
  .finite()
  .nonnegative()
  .nullable()
  .default(null)
const createLlmModelPresetSchema = z.object({
  name: z.string().trim().nullable().default(null),
  provider: llmProviderSchema,
  model: z.string().trim().min(1),
  reasoningEffort: reasoningEffortSchema,
  openrouterModelProvider: z.string().trim().nullable().default(null),
  supportsFlex: z.boolean().default(false),
  isFreeTier: z.boolean().default(false),
  inputTokenCostUsdPerMillion: optionalTokenCostSchema,
  cachedInputTokenCostUsdPerMillion: optionalTokenCostSchema,
  cacheWriteInputTokenCostUsdPerMillion: optionalTokenCostSchema,
  outputTokenCostUsdPerMillion: optionalTokenCostSchema,
  isEnabled: z.boolean().default(true),
  isDefault: z.boolean().default(false),
})
const updateLlmModelPresetSchema = z
  .object({
    name: z.string().trim().nullable().default(null),
    model: z.string().trim().min(1),
    reasoningEffort: reasoningEffortSchema,
    openrouterModelProvider: z.string().trim().nullable().default(null),
    supportsFlex: z.boolean().default(false),
    isFreeTier: z.boolean().default(false),
    inputTokenCostUsdPerMillion: optionalTokenCostSchema,
    cachedInputTokenCostUsdPerMillion: optionalTokenCostSchema,
    cacheWriteInputTokenCostUsdPerMillion: optionalTokenCostSchema,
    outputTokenCostUsdPerMillion: optionalTokenCostSchema,
  })
  .strict()
const updateLlmModelPresetEnabledSchema = z.object({
  isEnabled: z.boolean(),
})
const setDefaultLlmModelPresetSchema = z.object({
  presetId: z.uuid().nullable(),
})
const adminSubscriptionTierGrantSchema = z.object({
  days: z.number().int().min(1).max(3650),
  tier: z.string().trim().refine(isAdminGrantBillingTier),
})
const createTurnLlmRunSchema = z.object({
  turnNumber: z.number().int().positive(),
})

type ActiveLlmRunRuntime = {
  abortController: AbortController
  attemptNumber: number
  completionPromise: Promise<void>
  createdAt: string
  deckId: string
  llmRunId: string
  llmModelPresetId: string
  llmModelPresetName: string | null
  processingMode: LlmProcessingMode
  model: string
  fullPrompt: string
  phase: LlmRunPhase
  provider: string
  reasoningEffort: string | null
  serviceTier: string | null
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
const authenticatedUsersByRequest = new WeakMap<Request, AuthenticatedUser>()
let llmRunQueueConfig: LlmRunQueueConfig | null = null
let llmRunQueueDrainTimer: NodeJS.Timeout | null = null
let llmRunQueueDrainPromise: Promise<void> | null = null
let openAiBatchSubmitTimer: NodeJS.Timeout | null = null
let openAiBatchSubmitPromise: Promise<void> | null = null
let openAiBatchPollTimer: NodeJS.Timeout | null = null
let openAiBatchPollPromise: Promise<void> | null = null

function createRuntimeCompletion() {
  let resolveCompletion: () => void = () => {}
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

function createStreamRunFromRuntime(
  runtime: ActiveLlmRunRuntime
): SimulationResultsStreamRun {
  return {
    llmRunId: runtime.llmRunId,
    llmModelPresetId: runtime.llmModelPresetId,
    llmModelPresetName: runtime.llmModelPresetName,
    processingMode: runtime.processingMode,
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
    openrouterGenerations: [],
    mcpFunctionCalls: [],
  }
}

function createStreamRunFromPersistedRun(
  run: SimulationDebugLlmRun
): SimulationResultsStreamRun {
  return run
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

function mergeActiveRuntimesIntoResults(
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
        mcpFunctionCalls: [...(incomingRun.mcpFunctionCalls ?? [])].sort(
          compareMcpFunctionCalls
        ),
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
    mcpFunctionCalls: mergeMcpFunctionCalls(
      existingRun.mcpFunctionCalls ?? [],
      incomingRun.mcpFunctionCalls ?? []
    ),
  }

  return runs.map((run) =>
    run.llmRunId === incomingRun.llmRunId ? mergedRun : run
  )
}

function mergeOpenRouterGenerations(
  existingGenerations: readonly SimulationResultsStreamRun["openrouterGenerations"][number][] = [],
  incomingGenerations: readonly SimulationResultsStreamRun["openrouterGenerations"][number][] = []
) {
  const generationsByTurn = new Map<
    number,
    SimulationResultsStreamRun["openrouterGenerations"][number]
  >()

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

function mergeMcpFunctionCalls(
  existingCalls: readonly SimulationResultsStreamRun["mcpFunctionCalls"][number][] = [],
  incomingCalls: readonly SimulationResultsStreamRun["mcpFunctionCalls"][number][] = []
) {
  const callsById = new Map<
    number,
    SimulationResultsStreamRun["mcpFunctionCalls"][number]
  >()

  for (const call of existingCalls) {
    callsById.set(call.id, call)
  }

  for (const call of incomingCalls) {
    callsById.set(call.id, call)
  }

  return Array.from(callsById.values()).sort(compareMcpFunctionCalls)
}

function compareMcpFunctionCalls(
  firstCall: SimulationResultsStreamRun["mcpFunctionCalls"][number],
  secondCall: SimulationResultsStreamRun["mcpFunctionCalls"][number]
) {
  const calledAtComparison =
    Date.parse(firstCall.calledAt) - Date.parse(secondCall.calledAt)

  return calledAtComparison || firstCall.id - secondCall.id
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

  const results = mergeActiveRuntimesIntoResults(
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

async function getPublicSimulationExport(deckId: string, simulationId: string) {
  const simulation = await getSimulationSummary(deckId, simulationId)

  if (!simulation) {
    throw new SimulationValidationError("Simulation not found.")
  }

  if (simulation.activeLlmRunCount > 0) {
    throw new SimulationValidationError(
      "Simulation cannot be exported while LLM runs are active."
    )
  }

  const deck = await getDeck(deckId)

  if (!deck) {
    throw new SimulationValidationError("Simulation not found.")
  }

  const startingHand =
    simulation.startingHandId === null
      ? null
      : await getStartingHandForDeck(deckId, simulation.startingHandId)

  return {
    schemaVersion: PUBLIC_SIMULATION_EXPORT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    deck,
    simulation,
    startingHand,
    results: redactSimulationResultsInfoCosts(
      await getSimulationResultsInfo(deckId, simulationId)
    ),
  } as const
}

async function getAdminBenchmarkZipExport(
  benchmarkRunId: string,
  adminUserId: string
) {
  const benchmark = await getAdminBenchmark(benchmarkRunId, adminUserId)

  if (!benchmark) {
    return null
  }

  const childSimulations = await listBenchmarkRunSimulationsForAdmin(
    benchmarkRunId,
    adminUserId
  )

  if (!childSimulations) {
    return null
  }

  const exportedAt = new Date().toISOString()
  const benchmarkExportRootPath = benchmark.id
  const simulationFiles = await Promise.all(
    childSimulations.map(async (childSimulation) => ({
      childSimulation,
      filePath: `${benchmarkExportRootPath}/simulations/${childSimulation.simulationId}.json`,
      value: await getPublicSimulationExport(
        childSimulation.deckId,
        childSimulation.simulationId
      ),
    }))
  )
  const benchmarkIndexMetadata = (() => {
    const { totalEstimatedCostUsd, ...metadata } = benchmark

    void totalEstimatedCostUsd

    return metadata
  })()
  const index = {
    schemaVersion: BENCHMARK_EXPORT_SCHEMA_VERSION,
    exportedAt,
    benchmark: benchmarkIndexMetadata,
    simulations: simulationFiles.map(({ childSimulation, filePath }) => ({
      simulationId: childSimulation.simulationId,
      deckId: childSimulation.deckId,
      deckName: childSimulation.deckName,
      deckIndex: childSimulation.deckIndex,
      simulationIndex: childSimulation.simulationIndex,
      seed: childSimulation.seed,
      filePath,
    })),
  }

  return {
    benchmark,
    zip: createJsonZipArchive(
      [
        {
          path: `${benchmarkExportRootPath}/index.json`,
          value: index,
        },
        ...simulationFiles.map((simulationFile) => ({
          path: simulationFile.filePath,
          value: simulationFile.value,
        })),
      ],
      new Date(exportedAt)
    ),
  }
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
      }
    }

    const simulationUpdatedEvent: SimulationResultsStreamEvent = {
      type: "simulation_updated",
      simulation: snapshot.simulation,
    }

    simulationResultsBroadcaster.publish(simulationId, simulationUpdatedEvent)

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
      simulationResultsBroadcaster.closeSimulation(simulationId)
    }
  } catch (error) {
    console.error("Failed to publish simulation results stream state:", error)
  }
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
  const cacheReadInputTokens = getNumberProperty(
    usageRecord,
    "cache_read_input_tokens",
    "cacheReadInputTokens"
  )
  const cachedInputTokens =
    cacheReadInputTokens ??
    (inputTokens === null
      ? null
      : Math.min(
          getNumberProperty(inputDetails, "cached_tokens", "cachedTokens") ?? 0,
          inputTokens
        ))
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
    getNumberProperty(
      outputDetails,
      "reasoning_tokens",
      "reasoningTokens",
      "thinking_tokens",
      "thinkingTokens"
    ) ?? 0
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
      getNumberProperty(
        usageRecord,
        "cache_creation_input_tokens",
        "cacheCreationInputTokens"
      ),
      getNumberProperty(
        usageRecord,
        "cache_read_input_tokens",
        "cacheReadInputTokens"
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

  if (provider === "anthropic") {
    return "Anthropic"
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

function createAuditedMcpToolHandler<
  TInput extends McpSimulationIdentifierInput,
>(
  mcpFunctionName: string,
  identifier: McpSimulationIdentifierConfig,
  handler: McpToolHandler<TInput>
) {
  const authContext = identifier.authContext

  return async (input: TInput) =>
    runAuditedMcpFunctionCall({
      authContext,
      getOutputPayload: getMcpToolAuditOutput,
      handler: () => handler(input),
      inputPayload: input,
      mcpFunctionName,
      onRecorded: authContext
        ? () =>
            publishSimulationResultsState({
              deckId: authContext.deckId,
              llmRunId: authContext.llmRunId,
              simulationId: authContext.simulationId,
            })
        : undefined,
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

type OpenRouterResponsesFunctionTool = {
  type: "function"
  name: string
  description: string
  parameters: Record<string, unknown>
}

function createOpenRouterResponsesTools(
  toolDefinitions: readonly LlamaCppToolDefinition[]
): OpenRouterResponsesFunctionTool[] {
  return toolDefinitions.map((definition) => ({
    type: "function",
    name: definition.name,
    description: definition.description,
    parameters: createJsonSchemaParameters(definition.inputSchema),
  }))
}

function createJsonSchemaParameters(inputSchema: z.ZodObject) {
  const schema = z.toJSONSchema(inputSchema, {
    target: "draft-07",
  }) as Record<string, unknown>

  return Object.fromEntries(
    Object.entries(schema).filter(([key]) => key !== "~standard")
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
  prompt: LlmPromptInput,
  mcpRunToken: string,
  simulationId: string,
  reasoningSummariesEnabled: boolean
) {
  const fullPrompt = getLlmPromptFullText(prompt)

  return {
    providerType: "openai" as const,
    model: config.model,
    input: fullPrompt,
    max_output_tokens: config.maxOutputTokens,
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
  prompt: LlmPromptInput,
  mcpRunToken: string,
  simulationId: string,
  turnNumber: number,
  reasoningSummariesEnabled: boolean
) {
  const fullPrompt = getLlmPromptFullText(prompt)

  return {
    providerType: "openai" as const,
    model: config.model,
    input: fullPrompt,
    max_output_tokens: config.maxOutputTokens,
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

function buildOpeningHandAnthropicRequestPayload(
  config: OpeningHandAnthropicRunConfig,
  prompt: LlmPromptInput,
  mcpRunToken: string,
  reasoningSummariesEnabled: boolean
) {
  return buildAnthropicRequestPayload({
    maxOutputTokens: config.maxOutputTokens,
    mcpServerName: OPENING_HAND_MCP_SERVER_LABEL,
    mcpServerUrl: appendMcpRunTokenToUrl(
      config.openingHandMcpPublicUrl,
      mcpRunToken
    ),
    model: config.model,
    prompt: requireStructuredLlmPrompt(prompt),
    reasoningEffort: config.reasoningEffort,
    reasoningSummariesEnabled,
  })
}

function buildTurnSimulationAnthropicRequestPayload(
  config: TurnSimulationAnthropicRunConfig,
  prompt: LlmPromptInput,
  mcpRunToken: string,
  reasoningSummariesEnabled: boolean
) {
  return buildAnthropicRequestPayload({
    maxOutputTokens: config.maxOutputTokens,
    mcpServerName: TURN_SIMULATION_MCP_SERVER_LABEL,
    mcpServerUrl: appendMcpRunTokenToUrl(
      config.turnSimulationMcpPublicUrl,
      mcpRunToken
    ),
    model: config.model,
    prompt: requireStructuredLlmPrompt(prompt),
    reasoningEffort: config.reasoningEffort,
    reasoningSummariesEnabled,
  })
}

function getTurnSimulationMcpServerDescription() {
  return "Tools for resolving one Magic: The Gathering goldfish turn, including library operations and random coin/dice results."
}

function generateMcpRunToken(
  ttlMs = MCP_RUN_TOKEN_TTL_MS
): GeneratedMcpRunToken {
  const token = randomBytes(32).toString("base64url")

  return {
    token,
    tokenHash: hashMcpRunToken(token),
    expiresAt: new Date(Date.now() + ttlMs),
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

type LlmPromptInput = string | StructuredSimulationPrompt

function getLlmPromptFullText(prompt: LlmPromptInput) {
  return typeof prompt === "string" ? prompt : prompt.fullPrompt
}

function requireStructuredLlmPrompt(
  prompt: LlmPromptInput
): StructuredSimulationPrompt {
  if (typeof prompt === "string") {
    throw new Error("Anthropic LLM requests require structured prompt parts.")
  }

  return prompt
}

function buildOpeningHandOpenRouterRequestPayload(
  config: OpenRouterRunConfig,
  prompt: LlmPromptInput,
  simulationId: string,
  reasoningSummariesEnabled: boolean
) {
  const fullPrompt = getLlmPromptFullText(prompt)

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
  prompt: LlmPromptInput,
  simulationId: string
): LlamaCppChatCompletionRequestPayload {
  const fullPrompt = getLlmPromptFullText(prompt)

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
  prompt: LlmPromptInput,
  simulationId: string,
  turnNumber: number,
  reasoningSummariesEnabled: boolean
) {
  const fullPrompt = getLlmPromptFullText(prompt)

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
  prompt: LlmPromptInput,
  simulationId: string,
  turnNumber: number
): LlamaCppChatCompletionRequestPayload {
  const fullPrompt = getLlmPromptFullText(prompt)

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
    allow_fallbacks: false,
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
  return config.provider === "llamacpp" || config.provider === "anthropic"
    ? null
    : config.serviceTier
}

function getQueuedLlmPromptInput(run: ClaimedQueuedLlmRun): LlmPromptInput {
  if (run.provider !== "anthropic") {
    return run.fullPrompt
  }

  const prompt = asRecord(run.requestPayload).prompt

  if (!isStructuredSimulationPrompt(prompt)) {
    throw new Error(
      "Queued Anthropic LLM run is missing structured prompt parts."
    )
  }

  return prompt
}

function withCapturedLlmRunServiceTier<
  TConfig extends
    | ResolvedOpeningHandLlmRunConfig
    | ResolvedTurnSimulationLlmRunConfig,
>(config: TConfig, serviceTier: string | null): TConfig {
  if (config.provider === "llamacpp" || config.provider === "anthropic") {
    return config
  }

  return {
    ...config,
    serviceTier,
  }
}

function buildOpeningHandLlmRequestPayload(
  config: ResolvedOpeningHandLlmRunConfig,
  prompt: LlmPromptInput,
  mcpRunToken: string,
  simulationId: string,
  reasoningSummariesEnabled: boolean
) {
  if (config.provider === "openai") {
    return buildOpeningHandOpenAiRequestPayload(
      config,
      prompt,
      mcpRunToken,
      simulationId,
      reasoningSummariesEnabled
    )
  }

  if (config.provider === "anthropic") {
    return buildOpeningHandAnthropicRequestPayload(
      config,
      prompt,
      mcpRunToken,
      reasoningSummariesEnabled
    )
  }

  if (config.provider === "llamacpp") {
    return buildOpeningHandLlamaCppRequestPayload(config, prompt, simulationId)
  }

  return buildOpeningHandOpenRouterRequestPayload(
    config,
    prompt,
    simulationId,
    reasoningSummariesEnabled
  )
}

function buildTurnSimulationLlmRequestPayload(
  config: ResolvedTurnSimulationLlmRunConfig,
  prompt: LlmPromptInput,
  mcpRunToken: string,
  simulationId: string,
  turnNumber: number,
  reasoningSummariesEnabled: boolean
) {
  if (config.provider === "openai") {
    return buildTurnSimulationOpenAiRequestPayload(
      config,
      prompt,
      mcpRunToken,
      simulationId,
      turnNumber,
      reasoningSummariesEnabled
    )
  }

  if (config.provider === "anthropic") {
    return buildTurnSimulationAnthropicRequestPayload(
      config,
      prompt,
      mcpRunToken,
      reasoningSummariesEnabled
    )
  }

  if (config.provider === "llamacpp") {
    return buildTurnSimulationLlamaCppRequestPayload(
      config,
      prompt,
      simulationId,
      turnNumber
    )
  }

  return buildTurnSimulationOpenRouterRequestPayload(
    config,
    prompt,
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
        key === "mcpRunToken"
          ? "[redacted]"
          : redactMcpRunTokens(propertyValue),
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

  const isFreeTierOwner = await isFreeTierSimulationOwner(deckId, simulationId)

  if (isFreeTierOwner && !preset.isFreeTier) {
    throw new SimulationValidationError(FREE_TIER_MODEL_PRESET_REQUIRED_MESSAGE)
  }

  if (
    isFreeTierOwner &&
    preset.supportsFlex &&
    (simulation.llmProcessingMode !== "realtime" ||
      !simulation.useFlexServiceTier)
  ) {
    throw new SimulationValidationError(
      FREE_TIER_FLEX_PROCESSING_REQUIRED_MESSAGE
    )
  }

  return {
    preset,
    llmProcessingMode: simulation.llmProcessingMode,
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
    cachedInputTokenCostUsdPerMillion: preset.cachedInputTokenCostUsdPerMillion,
    cacheWriteInputTokenCostUsdPerMillion:
      preset.cacheWriteInputTokenCostUsdPerMillion,
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
      processingMode: modelPresetSelection.llmProcessingMode,
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

    const prompt = await buildStartingHandSimulationPromptParts({
      llmRunId: openingHandRun.llmRunId,
    })
    const fullPrompt = prompt.fullPrompt
    const requestPayload = buildOpeningHandLlmRequestPayload(
      llmConfig,
      prompt,
      QUEUED_MCP_RUN_TOKEN_PLACEHOLDER,
      simulationId,
      openingHandRun.reasoningSummariesEnabled
    )

    await updateLlmRunRequestData({
      llmRunId: openingHandRun.llmRunId,
      fullPrompt,
      requestPayload: getPersistableLlmRequestPayload(requestPayload),
    })

    if (modelPresetSelection.llmProcessingMode === "realtime") {
      if (!(await markLlmRunQueued(openingHandRun.llmRunId))) {
        throw new Error("Opening-hand LLM run could not be queued.")
      }
    }
    await publishSimulationResultsState({
      deckId,
      llmRunId: openingHandRun.llmRunId,
      simulationId,
    })
    if (modelPresetSelection.llmProcessingMode === "realtime") {
      nudgeLlmRunQueue()
    }

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
      processingMode: modelPresetSelection.llmProcessingMode,
      provider: llmConfig.provider,
      model: llmConfig.model,
      openrouterModelProvider: getLlmRunOpenRouterModelProvider(llmConfig),
      serviceTier: getLlmRunServiceTier(llmConfig),
      reasoningEffort: llmConfig.reasoningEffort,
      runtimeStreamKey: randomUUID(),
      requireAutoSimulateNextStep,
    })
    createdLlmRunId = turnRun.llmRunId

    const prompt =
      turnNumber === 1
        ? await buildTurnSimulationPromptParts({ llmRunId: turnRun.llmRunId })
        : await buildTurnSimulationPromptParts(
            { llmRunId: turnRun.llmRunId },
            turnRun.previousGameState ?? undefined
          )
    const fullPrompt = prompt.fullPrompt
    const requestPayload = buildTurnSimulationLlmRequestPayload(
      llmConfig,
      prompt,
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

    if (modelPresetSelection.llmProcessingMode === "realtime") {
      if (!(await markLlmRunQueued(turnRun.llmRunId))) {
        throw new Error("Turn LLM run could not be queued.")
      }
    }
    await publishSimulationResultsState({
      deckId,
      llmRunId: turnRun.llmRunId,
      simulationId,
    })
    if (modelPresetSelection.llmProcessingMode === "realtime") {
      nudgeLlmRunQueue()
    }

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

async function createAdminBenchmarkRun({
  adminUserId,
  deckIds,
  llmModelPresetId,
  llmProcessingMode,
  simulationsPerDeck,
  turnsToSimulate,
  useFlexServiceTier,
}: {
  adminUserId: string
  deckIds: readonly string[]
  llmModelPresetId: string
  llmProcessingMode: LlmProcessingMode
  simulationsPerDeck: number
  turnsToSimulate: number
  useFlexServiceTier: boolean
}) {
  const benchmarkRunId = await createBenchmarkRun({
    adminUserId,
    deckIds,
    llmModelPresetId,
    llmProcessingMode,
    simulationsPerDeck,
    turnsToSimulate,
    useFlexServiceTier,
  })

  try {
    for (const deckId of deckIds) {
      for (
        let simulationIndex = 1;
        simulationIndex <= simulationsPerDeck;
        simulationIndex += 1
      ) {
        const seed = createBenchmarkSimulationSeed(simulationIndex)
        let createdSimulation: SimulationSummary | null = null

        try {
          createdSimulation = await createSimulation(deckId, {
            createdVia: "benchmark",
            llmModelPresetId,
            llmProcessingMode,
            reasoningSummariesEnabled: false,
            seed,
            startingHandId: null,
            turnsToSimulate,
            useFlexServiceTier,
          })

          await linkBenchmarkSimulation({
            benchmarkRunId,
            deckId,
            seed,
            simulationId: createdSimulation.id,
            simulationIndex,
          })

          await startCreatedSimulationInitialStep(deckId, createdSimulation)
        } catch (error) {
          if (createdSimulation) {
            await markSimulationFailed(
              createdSimulation.id,
              getErrorMessage(error)
            ).catch((failError: unknown) => {
              console.error(
                "Failed to mark benchmark simulation failed:",
                failError
              )
            })
          }

          throw error
        }
      }
    }
  } catch (error) {
    await markBenchmarkRunFailed(benchmarkRunId, getErrorMessage(error)).catch(
      (failError: unknown) => {
        console.error("Failed to mark benchmark failed:", failError)
      }
    )

    throw error
  }

  const benchmark = await getAdminBenchmark(benchmarkRunId, adminUserId)

  if (!benchmark) {
    throw new Error("Created benchmark could not be loaded.")
  }

  return benchmark
}

async function stopAdminBenchmarkRun(
  benchmarkRunId: string,
  adminUserId: string
) {
  const childSimulations = await listBenchmarkRunSimulationsForAdmin(
    benchmarkRunId,
    adminUserId
  )

  if (!childSimulations) {
    return null
  }

  const stoppedSimulations: Awaited<
    ReturnType<typeof stopActiveSimulationLlmRuns>
  >[] = []
  const errors: {
    deckId: string
    error: string
    simulationId: string
  }[] = []

  for (const childSimulation of childSimulations) {
    try {
      stoppedSimulations.push(
        await stopActiveSimulationLlmRuns(
          childSimulation.deckId,
          childSimulation.simulationId
        )
      )
    } catch (error) {
      errors.push({
        deckId: childSimulation.deckId,
        error: getErrorMessage(error),
        simulationId: childSimulation.simulationId,
      })
    }
  }

  if (errors.length === 0) {
    await markBenchmarkRunStopped(benchmarkRunId)
  }

  return {
    benchmark: await getAdminBenchmark(benchmarkRunId, adminUserId),
    errors,
    stoppedSimulations,
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

function startOpenAiBatchWorkers(config: LlmRunQueueConfig) {
  if (!openAiBatchSubmitTimer) {
    openAiBatchSubmitTimer = setInterval(
      () => nudgeOpenAiBatchSubmitter(config),
      OPENAI_BATCH_POLL_INTERVAL_MS
    )
  }

  if (!openAiBatchPollTimer) {
    openAiBatchPollTimer = setInterval(
      nudgeOpenAiBatchPoller,
      OPENAI_BATCH_POLL_INTERVAL_MS
    )
  }

  nudgeOpenAiBatchSubmitter(config)
  nudgeOpenAiBatchPoller()
}

function stopOpenAiBatchWorkers() {
  if (openAiBatchSubmitTimer) {
    clearInterval(openAiBatchSubmitTimer)
    openAiBatchSubmitTimer = null
  }

  if (openAiBatchPollTimer) {
    clearInterval(openAiBatchPollTimer)
    openAiBatchPollTimer = null
  }
}

function nudgeOpenAiBatchSubmitter(config: LlmRunQueueConfig) {
  if (openAiBatchSubmitPromise) {
    return
  }

  openAiBatchSubmitPromise = submitPendingOpenAiBatches(config)
    .catch((error: unknown) => {
      console.error("Failed to submit OpenAI batches:", error)
    })
    .finally(() => {
      openAiBatchSubmitPromise = null
    })
}

function nudgeOpenAiBatchPoller() {
  if (openAiBatchPollPromise) {
    return
  }

  openAiBatchPollPromise = pollOpenAiBatches()
    .catch((error: unknown) => {
      console.error("Failed to poll OpenAI batches:", error)
    })
    .finally(() => {
      openAiBatchPollPromise = null
    })
}

type OpenAiBatchRequestLine = {
  custom_id: string
  method: "POST"
  url: typeof OPENAI_BATCH_ENDPOINT
  body: Record<string, unknown>
}

type PreparedOpenAiBatchLine = {
  line: OpenAiBatchRequestLine
  requestPayloadRedacted: unknown
  run: OpenAiBatchPendingRun
}

async function submitPendingOpenAiBatches(config: LlmRunQueueConfig) {
  const pendingRuns = await listPendingOpenAiBatchRuns({
    maxConcurrentRuns: config.maxConcurrentRuns,
  })

  if (pendingRuns.length === 0) {
    return
  }

  const runsByPresetId = new Map<string, OpenAiBatchPendingRun[]>()

  for (const run of pendingRuns) {
    const runs = runsByPresetId.get(run.llmModelPresetId) ?? []
    runs.push(run)
    runsByPresetId.set(run.llmModelPresetId, runs)
  }

  for (const runs of runsByPresetId.values()) {
    await submitOpenAiBatchRunGroup(runs)
  }
}

async function submitOpenAiBatchRunGroup(runs: OpenAiBatchPendingRun[]) {
  const freeTierPolicyAllowedRuns =
    await filterFreeTierPolicyAllowedOpenAiBatchRuns(runs)

  if (freeTierPolicyAllowedRuns.length === 0) {
    return
  }

  const usageAllowedRuns = await filterUsageAllowedOpenAiBatchRuns(
    freeTierPolicyAllowedRuns
  )

  if (usageAllowedRuns.length === 0) {
    return
  }

  const preparedLines: PreparedOpenAiBatchLine[] = []

  try {
    for (const run of usageAllowedRuns) {
      preparedLines.push(await prepareOpenAiBatchLine(run))
    }
  } catch (error) {
    await failPreparedOpenAiBatchRuns(usageAllowedRuns, preparedLines, error)
    return
  }

  let chunks: PreparedOpenAiBatchLine[][]

  try {
    chunks = splitOpenAiBatchLines(preparedLines)
  } catch (error) {
    await failPreparedOpenAiBatchRuns(usageAllowedRuns, preparedLines, error)
    return
  }

  for (const chunk of chunks) {
    try {
      await submitPreparedOpenAiBatchLineChunk(chunk)
    } catch (error) {
      await failPreparedOpenAiBatchRuns(
        chunk.map((preparedLine) => preparedLine.run),
        chunk,
        error
      )
    }
  }
}

async function failPreparedOpenAiBatchRuns(
  runs: readonly OpenAiBatchPendingRun[],
  preparedLines: readonly PreparedOpenAiBatchLine[],
  error: unknown
) {
  const failureMessage = getErrorMessage(error)

  for (const preparedLine of preparedLines) {
    await revokeLlmRunMcpToken(preparedLine.run.llmRunId).catch(
      (revokeError: unknown) => {
        console.error("Failed to revoke failed batch MCP token:", revokeError)
      }
    )
  }

  for (const run of runs) {
    await failOpenAiBatchRun(run, failureMessage)
  }
}

async function filterFreeTierPolicyAllowedOpenAiBatchRuns(
  runs: OpenAiBatchPendingRun[]
) {
  const allowedRuns: OpenAiBatchPendingRun[] = []

  for (const run of runs) {
    let modelPreset: LlmModelPreset

    try {
      modelPreset = await getRequiredOpenAiBatchRunModelPreset(run)
    } catch (error) {
      await failOpenAiBatchRun(run, getErrorMessage(error))
      continue
    }

    const freeTierPolicyFailureMessage =
      await getFreeTierRunPolicyFailureMessage(run, modelPreset)

    if (freeTierPolicyFailureMessage) {
      await failOpenAiBatchRun(run, freeTierPolicyFailureMessage)
      continue
    }

    allowedRuns.push(run)
  }

  return allowedRuns
}

async function failOpenAiBatchRun(
  run: OpenAiBatchPendingRun,
  failureMessage: string
) {
  await failLlmRun(run.llmRunId, failureMessage).catch((failError: unknown) => {
    console.error("Failed to mark OpenAI batch run failed:", failError)
  })
  await publishSimulationResultsState({
    deckId: run.deckId,
    llmRunId: run.llmRunId,
    simulationId: run.simulationId,
  }).catch((publishError: unknown) => {
    console.error(
      "Failed to publish failed OpenAI batch run state:",
      publishError
    )
  })
}

async function filterUsageAllowedOpenAiBatchRuns(
  runs: OpenAiBatchPendingRun[]
) {
  const allowedRuns: OpenAiBatchPendingRun[] = []

  for (const run of runs) {
    const ownerUserId = run.ownerUserId

    if (ownerUserId !== null) {
      const usageDecision = await withDatabaseTransaction((client) =>
        ensureUserUsageLimitWindowsForRunStartWithClient(
          client,
          ownerUserId,
          new Date()
        )
      )

      if (!usageDecision.allowed) {
        await failLlmRun(run.llmRunId, USAGE_LIMIT_OUT_OF_USAGE_MESSAGE)
        await publishSimulationResultsState({
          deckId: run.deckId,
          llmRunId: run.llmRunId,
          simulationId: run.simulationId,
        })
        continue
      }
    }

    allowedRuns.push(run)
  }

  return allowedRuns
}

async function prepareOpenAiBatchLine(
  run: OpenAiBatchPendingRun
): Promise<PreparedOpenAiBatchLine> {
  const modelPreset = await getRequiredOpenAiBatchRunModelPreset(run)
  const mcpRunToken = generateMcpRunToken(OPENAI_BATCH_MCP_RUN_TOKEN_TTL_MS)
  await createLlmRunMcpToken({
    deckId: run.deckId,
    llmRunId: run.llmRunId,
    simulationId: run.simulationId,
    phase: run.phase,
    tokenHash: mcpRunToken.tokenHash,
    expiresAt: mcpRunToken.expiresAt,
  })

  const requestPayload =
    run.phase === "opening_hand"
      ? await buildOpenAiBatchOpeningHandRequestPayload({
          modelPreset,
          mcpRunToken: mcpRunToken.token,
          run,
        })
      : await buildOpenAiBatchTurnRequestPayload({
          modelPreset,
          mcpRunToken: mcpRunToken.token,
          run,
        })
  const requestPayloadRedacted = getPersistableLlmRequestPayload(requestPayload)

  await updateLlmRunRequestData({
    llmRunId: run.llmRunId,
    fullPrompt: run.fullPrompt,
    requestPayload: requestPayloadRedacted,
  })

  return {
    line: {
      custom_id: run.llmRunId,
      method: "POST",
      url: OPENAI_BATCH_ENDPOINT,
      body: getOpenAiBatchRequestBody(requestPayload),
    },
    requestPayloadRedacted,
    run,
  }
}

async function getRequiredOpenAiBatchRunModelPreset(
  run: OpenAiBatchPendingRun
) {
  const modelPreset = await getEnabledLlmModelPreset(run.llmModelPresetId)

  if (!modelPreset || modelPreset.provider !== "openai") {
    throw new Error(
      "Batch LLM run model preset is disabled, missing, or not OpenAI."
    )
  }

  return modelPreset
}

async function buildOpenAiBatchOpeningHandRequestPayload({
  mcpRunToken,
  modelPreset,
  run,
}: {
  modelPreset: LlmModelPreset
  mcpRunToken: string
  run: OpenAiBatchPendingRun
}): Promise<OpenAiRequestPayload> {
  const config = withCapturedLlmRunServiceTier(
    await resolveLlmRunConfigModel(
      getOpeningHandLlmRunConfig(getLlmModelPresetRunConfig(modelPreset))
    ),
    run.serviceTier
  )

  if (config.provider !== "openai") {
    throw new Error("Batch opening-hand run resolved to a non-OpenAI config.")
  }

  assertOpenAiBatchRunMatchesConfig(run, config)

  return requireOpenAiRequestPayload(
    buildOpeningHandLlmRequestPayload(
      config,
      run.fullPrompt,
      mcpRunToken,
      run.simulationId,
      run.reasoningSummariesEnabled
    )
  )
}

async function buildOpenAiBatchTurnRequestPayload({
  mcpRunToken,
  modelPreset,
  run,
}: {
  modelPreset: LlmModelPreset
  mcpRunToken: string
  run: OpenAiBatchPendingRun
}): Promise<OpenAiRequestPayload> {
  if (typeof run.turnNumber !== "number") {
    throw new Error("Batch turn LLM run is missing its turn number.")
  }

  const config = withCapturedLlmRunServiceTier(
    await resolveLlmRunConfigModel(
      getTurnSimulationLlmRunConfig(getLlmModelPresetRunConfig(modelPreset))
    ),
    run.serviceTier
  )

  if (config.provider !== "openai") {
    throw new Error("Batch turn run resolved to a non-OpenAI config.")
  }

  assertOpenAiBatchRunMatchesConfig(run, config)

  return requireOpenAiRequestPayload(
    buildTurnSimulationLlmRequestPayload(
      config,
      run.fullPrompt,
      mcpRunToken,
      run.simulationId,
      run.turnNumber,
      run.reasoningSummariesEnabled
    )
  )
}

function assertOpenAiBatchRunMatchesConfig(
  run: OpenAiBatchPendingRun,
  config: OpenAiRunConfig
) {
  const expectedOpenRouterModelProvider = null
  const expectedServiceTier = config.serviceTier

  if (
    run.provider !== config.provider ||
    run.model !== config.model ||
    run.openrouterModelProvider !== expectedOpenRouterModelProvider ||
    run.reasoningEffort !== config.reasoningEffort ||
    run.serviceTier !== expectedServiceTier
  ) {
    throw new Error(
      `Batch LLM run config changed before submission: expected ${formatLlmRunConfigParts(
        {
          model: config.model,
          openrouterModelProvider: expectedOpenRouterModelProvider,
          provider: config.provider,
          reasoningEffort: config.reasoningEffort,
          serviceTier: expectedServiceTier,
        }
      )}, got ${formatLlmRunConfigParts({
        model: run.model,
        openrouterModelProvider: run.openrouterModelProvider,
        provider: run.provider,
        reasoningEffort: run.reasoningEffort,
        serviceTier: run.serviceTier,
      })}`
    )
  }
}

function getOpenAiBatchRequestBody(requestPayload: OpenAiRequestPayload) {
  const body: Record<string, unknown> = {
    ...requestPayload,
  }
  delete body.providerType

  return body
}

function splitOpenAiBatchLines(preparedLines: PreparedOpenAiBatchLine[]) {
  const chunks: PreparedOpenAiBatchLine[][] = []
  let currentChunk: PreparedOpenAiBatchLine[] = []
  let currentChunkBytes = 0

  for (const preparedLine of preparedLines) {
    const lineBytes = Buffer.byteLength(
      `${JSON.stringify(preparedLine.line)}\n`,
      "utf8"
    )

    if (lineBytes > OPENAI_BATCH_MAX_JSONL_BYTES) {
      throw new Error(
        `OpenAI batch request for LLM run ${preparedLine.run.llmRunId} exceeds the JSONL file size limit.`
      )
    }

    if (
      currentChunk.length > 0 &&
      currentChunkBytes + lineBytes > OPENAI_BATCH_MAX_JSONL_BYTES
    ) {
      chunks.push(currentChunk)
      currentChunk = []
      currentChunkBytes = 0
    }

    currentChunk.push(preparedLine)
    currentChunkBytes += lineBytes
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk)
  }

  return chunks
}

async function submitPreparedOpenAiBatchLineChunk(
  preparedLines: PreparedOpenAiBatchLine[]
) {
  const modelPreset = await getRequiredOpenAiBatchRunModelPreset(
    preparedLines[0].run
  )
  const config = await resolveLlmRunConfigModel(
    getOpeningHandLlmRunConfig(getLlmModelPresetRunConfig(modelPreset))
  )

  if (config.provider !== "openai") {
    throw new Error(
      "OpenAI batch model preset resolved to a non-OpenAI config."
    )
  }

  const client = new OpenAI({
    apiKey: config.apiKey,
  })
  const tempDirectory = await mkdtemp(join(tmpdir(), OPENAI_BATCH_TMP_PREFIX))
  const jsonlPath = join(tempDirectory, "requests.jsonl")

  try {
    const jsonl = preparedLines
      .map((preparedLine) => JSON.stringify(preparedLine.line))
      .join("\n")
    await writeFile(jsonlPath, `${jsonl}\n`, "utf8")

    const uploadedFile = await client.files.create({
      file: createReadStream(jsonlPath),
      purpose: "batch",
    })
    const providerBatch = await client.batches.create({
      completion_window: OPENAI_BATCH_COMPLETION_WINDOW,
      endpoint: OPENAI_BATCH_ENDPOINT,
      input_file_id: uploadedFile.id,
    })
    const providerStatus = getOpenAiBatchProviderStatus(providerBatch)

    await recordOpenAiBatchSubmitted({
      errorFileId: getOpenAiBatchFileId(providerBatch, "error_file_id"),
      inputFileId:
        getOpenAiBatchFileId(providerBatch, "input_file_id") ?? uploadedFile.id,
      items: preparedLines.map((preparedLine) => ({
        customId: preparedLine.line.custom_id,
        llmRunId: preparedLine.run.llmRunId,
        requestPayloadRedacted: preparedLine.requestPayloadRedacted,
      })),
      llmModelPresetId: modelPreset.id,
      outputFileId: getOpenAiBatchFileId(providerBatch, "output_file_id"),
      providerBatchId: providerBatch.id,
      providerStatus,
      rawBatch: providerBatch,
      requestCounts: getOpenAiBatchRequestCounts(providerBatch),
    })

    for (const preparedLine of preparedLines) {
      await publishSimulationResultsState({
        deckId: preparedLine.run.deckId,
        llmRunId: preparedLine.run.llmRunId,
        simulationId: preparedLine.run.simulationId,
      })
    }
  } finally {
    await rm(tempDirectory, { force: true, recursive: true }).catch(
      (error: unknown) => {
        console.error("Failed to remove OpenAI batch temp directory:", error)
      }
    )
  }
}

async function pollOpenAiBatches() {
  const batches = await listOpenAiBatchesToPoll()

  for (const batch of batches) {
    const modelPreset = await getEnabledLlmModelPreset(batch.llmModelPresetId)

    if (!modelPreset || modelPreset.provider !== "openai") {
      await updateOpenAiBatchProviderState({
        errorFileId: null,
        failureMessage:
          "OpenAI batch model preset is disabled, missing, or no longer OpenAI.",
        inputFileId: null,
        openAiBatchId: batch.id,
        outputFileId: null,
        providerStatus: "failed",
        rawBatch: {},
        requestCounts: {},
      })
      continue
    }

    const config = await resolveLlmRunConfigModel(
      getOpeningHandLlmRunConfig(getLlmModelPresetRunConfig(modelPreset))
    )

    if (config.provider !== "openai") {
      continue
    }

    const client = new OpenAI({
      apiKey: config.apiKey,
    })
    const providerBatch = await client.batches.retrieve(batch.providerBatchId)
    const providerStatus = getOpenAiBatchProviderStatus(providerBatch)

    await updateOpenAiBatchProviderState({
      errorFileId: getOpenAiBatchFileId(providerBatch, "error_file_id"),
      failureMessage: getOpenAiBatchFailureMessage(providerBatch),
      inputFileId: getOpenAiBatchFileId(providerBatch, "input_file_id"),
      openAiBatchId: batch.id,
      outputFileId: getOpenAiBatchFileId(providerBatch, "output_file_id"),
      providerStatus,
      rawBatch: providerBatch,
      requestCounts: getOpenAiBatchRequestCounts(providerBatch),
    })

    if (providerStatus === "completed") {
      await reconcileCompletedOpenAiBatch({
        client,
        openAiBatchId: batch.id,
        providerBatch,
      })
      continue
    }

    if (isTerminalFailedOpenAiBatchStatus(providerStatus)) {
      await failSubmittedOpenAiBatchItems({
        failureMessage:
          getOpenAiBatchFailureMessage(providerBatch) ??
          `OpenAI batch ended with status "${providerStatus}".`,
        openAiBatchId: batch.id,
      })
    }
  }
}

async function reconcileCompletedOpenAiBatch({
  client,
  openAiBatchId,
  providerBatch,
}: {
  client: OpenAI
  openAiBatchId: string
  providerBatch: unknown
}) {
  const items = await listOpenAiBatchItemsForReconcile(openAiBatchId)
  const outputFileId = getOpenAiBatchFileId(providerBatch, "output_file_id")
  const errorFileId = getOpenAiBatchFileId(providerBatch, "error_file_id")
  const outputLinesByCustomId = outputFileId
    ? await downloadOpenAiBatchJsonlLinesByCustomId(client, outputFileId)
    : new Map<string, unknown>()
  const errorLinesByCustomId = errorFileId
    ? await downloadOpenAiBatchJsonlLinesByCustomId(client, errorFileId)
    : new Map<string, unknown>()

  for (const item of items) {
    if (item.status !== "batch_submitted") {
      continue
    }

    const outputLine = outputLinesByCustomId.get(item.customId)
    const errorLine = errorLinesByCustomId.get(item.customId)

    if (outputLine) {
      await reconcileOpenAiBatchOutputLine({ item, openAiBatchId, outputLine })
      continue
    }

    if (errorLine) {
      await reconcileOpenAiBatchErrorLine({
        errorLine,
        item,
        openAiBatchId,
      })
      continue
    }

    await reconcileOpenAiBatchItemFailure({
      errorPayload: {},
      failureMessage: "OpenAI batch did not return an output or error line.",
      item,
      openAiBatchId,
    })
  }
}

async function reconcileOpenAiBatchOutputLine({
  item,
  openAiBatchId,
  outputLine,
}: {
  item: Awaited<ReturnType<typeof listOpenAiBatchItemsForReconcile>>[number]
  openAiBatchId: string
  outputLine: unknown
}) {
  const lineRecord = asRecord(outputLine)
  const responseRecord = asRecord(lineRecord.response)
  const statusCode = Number(responseRecord.status_code)
  const responseBody = responseRecord.body

  if (!Number.isFinite(statusCode) || statusCode < 200 || statusCode >= 300) {
    await reconcileOpenAiBatchItemFailure({
      errorPayload: outputLine,
      failureMessage: getOpenAiBatchLineFailureMessage(outputLine),
      item,
      openAiBatchId,
    })
    return
  }

  let completion: SimulationLlmCompletionResult

  try {
    assertCompletedProviderResponse(responseBody, item.phase, "OpenAI")
    const outputText = getCompletedResponseOutputText(responseBody)
    const responseBodyRecord = asRecord(responseBody)
    const usage = responseBodyRecord.usage ?? {}

    if (item.phase === "opening_hand") {
      const parsedOpeningHand =
        parseOpeningHandCompletionFromResponseText(outputText)
      completion = await completeOpeningHandLlmRun({
        finalOutputText: outputText,
        llmRunId: item.llmRunId,
        openingHand: parsedOpeningHand.keptHand,
        rawResponse: responseBody,
        summary: parsedOpeningHand.summary,
        usage,
      })
    } else {
      const parsedTurn =
        parseTurnSimulationCompletionFromResponseText(outputText)
      completion = await completeTurnLlmRun({
        finalOutputText: outputText,
        gameState: parsedTurn.gameState,
        llmRunId: item.llmRunId,
        rawResponse: responseBody,
        turnActions: parsedTurn.turnActions,
        usage,
      })
    }
  } catch (error) {
    await reconcileOpenAiBatchItemFailure({
      errorPayload: outputLine,
      failureMessage: getErrorMessage(error),
      item,
      openAiBatchId,
    })
    return
  }

  await recordOpenAiBatchItemOutput({
    customId: item.customId,
    openAiBatchId,
    outputPayload: outputLine,
  })
  await revokeLlmRunMcpToken(item.llmRunId).catch((error: unknown) => {
    console.error("Failed to revoke completed batch MCP token:", error)
  })
  await publishSimulationResultsState({
    deckId: item.deckId,
    llmRunId: item.llmRunId,
    simulationId: item.simulationId,
  })
  await handleSimulationCompletionNextStep(completion)
}

async function reconcileOpenAiBatchErrorLine({
  errorLine,
  item,
  openAiBatchId,
}: {
  errorLine: unknown
  item: Awaited<ReturnType<typeof listOpenAiBatchItemsForReconcile>>[number]
  openAiBatchId: string
}) {
  await reconcileOpenAiBatchItemFailure({
    errorPayload: errorLine,
    failureMessage: getOpenAiBatchLineFailureMessage(errorLine),
    item,
    openAiBatchId,
  })
}

async function reconcileOpenAiBatchItemFailure({
  errorPayload,
  failureMessage,
  item,
  openAiBatchId,
}: {
  errorPayload: unknown
  failureMessage: string
  item: Awaited<ReturnType<typeof listOpenAiBatchItemsForReconcile>>[number]
  openAiBatchId: string
}) {
  await recordOpenAiBatchItemError({
    customId: item.customId,
    errorPayload,
    failureMessage,
    openAiBatchId,
  })
  await failLlmRun(item.llmRunId, failureMessage)
  await revokeLlmRunMcpToken(item.llmRunId).catch((error: unknown) => {
    console.error("Failed to revoke failed batch MCP token:", error)
  })
  await publishSimulationResultsState({
    deckId: item.deckId,
    llmRunId: item.llmRunId,
    simulationId: item.simulationId,
  })
}

async function failSubmittedOpenAiBatchItems({
  failureMessage,
  openAiBatchId,
}: {
  openAiBatchId: string
  failureMessage: string
}) {
  const items = await listOpenAiBatchItemsForReconcile(openAiBatchId)

  for (const item of items) {
    if (item.status !== "batch_submitted") {
      continue
    }

    await reconcileOpenAiBatchItemFailure({
      errorPayload: {},
      failureMessage,
      item,
      openAiBatchId,
    })
  }
}

async function downloadOpenAiBatchJsonlLinesByCustomId(
  client: OpenAI,
  fileId: string
) {
  const response = await client.files.content(fileId)
  const text = await response.text()
  const linesByCustomId = new Map<string, unknown>()

  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) {
      continue
    }

    const parsedLine = JSON.parse(line) as unknown
    const customId = getStringProperty(asRecord(parsedLine), "custom_id")

    if (customId) {
      linesByCustomId.set(customId, parsedLine)
    }
  }

  return linesByCustomId
}

function getOpenAiBatchProviderStatus(providerBatch: unknown) {
  return getStringProperty(asRecord(providerBatch), "status") ?? "unknown"
}

function getOpenAiBatchFileId(providerBatch: unknown, key: string) {
  return getStringProperty(asRecord(providerBatch), key)
}

function getOpenAiBatchRequestCounts(providerBatch: unknown) {
  return asRecord(providerBatch).request_counts ?? {}
}

function getOpenAiBatchFailureMessage(providerBatch: unknown) {
  const batchRecord = asRecord(providerBatch)
  const errors = batchRecord.errors

  if (errors) {
    return JSON.stringify(errors)
  }

  return null
}

function isTerminalFailedOpenAiBatchStatus(status: string) {
  return status === "failed" || status === "expired" || status === "cancelled"
}

function getOpenAiBatchLineFailureMessage(line: unknown) {
  const lineRecord = asRecord(line)
  const errorRecord = asRecord(lineRecord.error)
  const responseRecord = asRecord(lineRecord.response)
  const responseBodyRecord = asRecord(responseRecord.body)
  const responseBodyErrorRecord = asRecord(responseBodyRecord.error)
  const message =
    getStringProperty(errorRecord, "message") ??
    getStringProperty(responseBodyErrorRecord, "message") ??
    getStringProperty(responseRecord, "status_code")

  return message
    ? `OpenAI batch item failed: ${message}`
    : `OpenAI batch item failed: ${JSON.stringify(line)}`
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

    const freeTierPolicyFailureMessage =
      await getFreeTierRunPolicyFailureMessage(run, modelPreset)

    if (freeTierPolicyFailureMessage) {
      await failClaimedQueuedLlmRun(run, freeTierPolicyFailureMessage)
      return
    }

    if (run.phase === "opening_hand") {
      const config = withCapturedLlmRunServiceTier(
        await resolveLlmRunConfigModel(
          getOpeningHandLlmRunConfig(getLlmModelPresetRunConfig(modelPreset))
        ),
        run.serviceTier
      )

      assertClaimedRunMatchesConfig(run, config)

      if (!(await isLlmRunActive(run.llmRunId))) {
        return
      }

      startOpeningHandLlmRun({
        attemptNumber: run.attemptNumber,
        config,
        createdAt: run.createdAt,
        deckId: run.deckId,
        fullPrompt: run.fullPrompt,
        llmRunId: run.llmRunId,
        llmModelPresetName: modelPreset.name,
        prompt: getQueuedLlmPromptInput(run),
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

    if (!(await isLlmRunActive(run.llmRunId))) {
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
        llmModelPresetName: modelPreset.name,
        prompt: getQueuedLlmPromptInput(run),
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

async function getFreeTierRunPolicyFailureMessage(
  run: { ownerUserId: string | null; serviceTier: string | null },
  modelPreset: LlmModelPreset
) {
  if (run.ownerUserId === null) {
    return null
  }

  if (!(await isFreeTierUser(run.ownerUserId))) {
    return null
  }

  if (!modelPreset.isFreeTier) {
    return FREE_TIER_MODEL_PRESET_REQUIRED_MESSAGE
  }

  if (modelPreset.supportsFlex && run.serviceTier !== "flex") {
    return FREE_TIER_FLEX_PROCESSING_REQUIRED_MESSAGE
  }

  return null
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

type CompletedLlmResponseResult = {
  outputText: string
  rawResponse: unknown
  usage: unknown
}

type OpenAiRequestPayload =
  | ReturnType<typeof buildOpeningHandOpenAiRequestPayload>
  | ReturnType<typeof buildTurnSimulationOpenAiRequestPayload>
type OpenRouterRequestPayload =
  | OpeningHandOpenRouterRequestPayload
  | TurnSimulationOpenRouterRequestPayload

function isOpenAiRequestPayload(
  requestPayload: OpeningHandLlmRequestPayload | TurnSimulationLlmRequestPayload
): requestPayload is OpenAiRequestPayload {
  return asRecord(requestPayload).providerType === "openai"
}

function isOpenRouterRequestPayload(
  requestPayload: OpeningHandLlmRequestPayload | TurnSimulationLlmRequestPayload
): requestPayload is OpenRouterRequestPayload {
  return asRecord(requestPayload).providerType === "openrouter"
}

function isAnthropicRequestPayload(
  requestPayload: OpeningHandLlmRequestPayload | TurnSimulationLlmRequestPayload
): requestPayload is AnthropicRequestPayload {
  return asRecord(requestPayload).providerType === "anthropic"
}

function isLlamaCppRequestPayload(
  requestPayload: OpeningHandLlmRequestPayload | TurnSimulationLlmRequestPayload
): requestPayload is LlamaCppRequestPayload {
  return asRecord(requestPayload).providerType === "llamacpp"
}

function requireOpenAiRequestPayload(
  requestPayload: OpeningHandLlmRequestPayload | TurnSimulationLlmRequestPayload
) {
  if (!isOpenAiRequestPayload(requestPayload)) {
    throw new Error("LLM run config and request payload provider mismatch.")
  }

  return requestPayload
}

function requireOpenRouterRequestPayload(
  requestPayload: OpeningHandLlmRequestPayload | TurnSimulationLlmRequestPayload
) {
  if (!isOpenRouterRequestPayload(requestPayload)) {
    throw new Error("LLM run config and request payload provider mismatch.")
  }

  return requestPayload
}

function requireAnthropicRequestPayload(
  requestPayload: OpeningHandLlmRequestPayload | TurnSimulationLlmRequestPayload
) {
  if (!isAnthropicRequestPayload(requestPayload)) {
    throw new Error("LLM run config and request payload provider mismatch.")
  }

  return requestPayload
}

function requireLlamaCppRequestPayload(
  requestPayload: OpeningHandLlmRequestPayload | TurnSimulationLlmRequestPayload
) {
  if (!isLlamaCppRequestPayload(requestPayload)) {
    throw new Error("LLM run config and request payload provider mismatch.")
  }

  return requestPayload
}

async function collectOpenAiLlmResponse({
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
}): Promise<CompletedLlmResponseResult> {
  const client = new OpenAI({
    apiKey: config.apiKey,
  })
  const signal = runtime.abortController.signal
  const openAiRequestPayload: Record<string, unknown> = {
    ...requestPayload,
  }
  delete openAiRequestPayload.providerType

  logLlmApiCallStarted({
    llmRunId,
    model: requestPayload.model,
    phase,
    provider: config.provider,
  })

  throwIfRuntimeAborted(signal)

  const response = await client.responses.create(
    openAiRequestPayload as unknown as Parameters<
      typeof client.responses.create
    >[0],
    { signal }
  )
  assertCompletedProviderResponse(response, phase, "OpenAI")
  const responseRecord = asRecord(response)
  const outputText = getCompletedResponseOutputText(response)
  const usage = responseRecord.usage ?? {}

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
    rawResponse: response,
    usage,
  }
}

async function collectAnthropicLlmResponse({
  config,
  llmRunId,
  phase,
  requestPayload,
  runtime,
}: {
  config: AnthropicRunConfig
  llmRunId: string
  phase: LlmRunPhase
  requestPayload: AnthropicRequestPayload
  runtime: ActiveLlmRunRuntime
}): Promise<CompletedLlmResponseResult> {
  const client = new Anthropic({
    apiKey: config.apiKey,
  })
  const signal = runtime.abortController.signal
  const anthropicRequestPayload: Record<string, unknown> = {
    ...requestPayload,
  }
  delete anthropicRequestPayload.providerType
  delete anthropicRequestPayload.prompt

  logLlmApiCallStarted({
    llmRunId,
    model: requestPayload.model,
    phase,
    provider: config.provider,
  })

  throwIfRuntimeAborted(signal)

  const response = await client.beta.messages.create(
    anthropicRequestPayload as unknown as Parameters<
      typeof client.beta.messages.create
    >[0],
    { signal }
  )
  assertCompletedAnthropicMessage(response, formatLlmRunPhase(phase))
  const outputText = getAnthropicMessageOutputText(response)
  const responseRecord = asRecord(response)
  const usage = normalizeAnthropicUsage(responseRecord.usage ?? {})

  if (!outputText.trim()) {
    throw new Error("Anthropic response did not include final text content.")
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
    rawResponse: response,
    usage,
  }
}

async function collectOpenRouterLlmResponse({
  config,
  llmRunId,
  mcpPath,
  phase,
  requestPayload,
  runtime,
  toolDefinitions,
}: {
  config: OpenRouterRunConfig
  llmRunId: string
  mcpPath?: string
  phase: LlmRunPhase
  requestPayload: OpenRouterRequestPayload
  runtime: ActiveLlmRunRuntime
  toolDefinitions: readonly LlamaCppToolDefinition[]
}): Promise<CompletedLlmResponseResult> {
  if (shouldUseOpenRouterChatCompletionsToolLoop(requestPayload.model)) {
    return collectOpenRouterChatCompletionLlmResponse({
      config,
      llmRunId,
      mcpPath,
      phase,
      requestPayload,
      runtime,
      toolDefinitions,
    })
  }

  const signal = runtime.abortController.signal
  const mcpClient =
    mcpPath && toolDefinitions.length > 0
      ? await createProviderMcpClient({
          clientName: "openrouter-agent",
          path: mcpPath,
          signal,
        })
      : null
  let mcpClientClosePromise: Promise<void> | null = null
  const responses: unknown[] = []
  const usageValues: unknown[] = []
  const tools = createOpenRouterResponsesTools(toolDefinitions)
  const toolDefinitionsByName = new Map(
    toolDefinitions.map((definition) => [definition.name, definition])
  )
  let input: unknown = requestPayload.input

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

    const removeAbortHandler = registerRuntimeAbortHandler(signal, () => {
      void closeMcpClient()
    })

    try {
      for (
        let stepNumber = 1;
        stepNumber <= requestPayload.stopWhenStepCount;
        stepNumber += 1
      ) {
        throwIfRuntimeAborted(signal)

        const response = await createOpenRouterResponsesApiResponse(
          config,
          {
            include: ["reasoning.encrypted_content"],
            input,
            max_output_tokens: requestPayload.maxOutputTokens,
            metadata: requestPayload.metadata,
            model: requestPayload.model,
            parallel_tool_calls: requestPayload.parallelToolCalls,
            provider: requestPayload.provider,
            reasoning: requestPayload.reasoning,
            ...(requestPayload.serviceTier
              ? { service_tier: requestPayload.serviceTier }
              : {}),
            store: false,
            stream: false,
            tools,
          },
          signal
        )
        const responseRecord = asRecord(response)
        const functionCalls = getOpenRouterFunctionCalls(response)

        responses.push(response)
        usageValues.push(responseRecord.usage ?? {})

        assertCompletedProviderResponse(response, phase, "OpenRouter")

        if (functionCalls.length === 0) {
          const outputText = getCompletedResponseOutputText(response)
          const usage = aggregateOpenRouterUsage(usageValues)

          if (!outputText.trim()) {
            throw new Error(
              "OpenRouter response did not include final assistant content."
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
            rawResponse: { responses },
            usage,
          }
        }

        if (!mcpClient) {
          throw new Error(
            "OpenRouter requested a tool but no MCP tools are available."
          )
        }

        const toolOutputItems: unknown[] = []

        for (const toolCall of functionCalls) {
          const toolDefinition = toolDefinitionsByName.get(toolCall.name)

          if (!toolDefinition) {
            throw new Error(
              `OpenRouter requested unknown tool: ${toolCall.name}.`
            )
          }

          const toolInput = parseAndValidateOpenRouterToolArguments(
            toolCall,
            toolDefinition
          )
          const toolOutput = await callMcpToolForProvider(
            mcpClient,
            toolCall.name,
            toolInput,
            signal,
            "OpenRouter"
          )

          toolOutputItems.push({
            type: "function_call_output",
            id: `${toolCall.itemId ?? toolCall.callId}_output`,
            call_id: toolCall.callId,
            output: formatToolOutputForProviderMessage(toolOutput),
            status: "completed",
          })
        }

        input = createOpenRouterFollowUpInput({
          previousInput: input,
          responseOutput: responseRecord.output,
          toolOutputItems,
        })
      }
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

  throw new Error(
    `OpenRouter LLM run reached stopWhenStepCount (${requestPayload.stopWhenStepCount}) before producing final output.`
  )
}

async function collectOpenRouterChatCompletionLlmResponse({
  config,
  llmRunId,
  mcpPath,
  phase,
  requestPayload,
  runtime,
  toolDefinitions,
}: {
  config: OpenRouterRunConfig
  llmRunId: string
  mcpPath?: string
  phase: LlmRunPhase
  requestPayload: OpenRouterRequestPayload
  runtime: ActiveLlmRunRuntime
  toolDefinitions: readonly LlamaCppToolDefinition[]
}): Promise<CompletedLlmResponseResult> {
  const signal = runtime.abortController.signal
  const mcpClient =
    mcpPath && toolDefinitions.length > 0
      ? await createProviderMcpClient({
          clientName: "openrouter-chat-agent",
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
      console.error("Failed to close OpenRouter chat MCP client:", error)
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
      const result = await collectLlamaCppChatCompletionNonStreaming({
        callTool: (name, args, toolSignal) =>
          mcpClient
            ? callMcpToolForProvider(
                mcpClient,
                name,
                args,
                toolSignal,
                "OpenRouter"
              )
            : Promise.reject(new Error("No MCP tools are available.")),
        createChatCompletion: createOpenRouterChatCompletion(config),
        requestPayload: createOpenRouterChatCompletionToolLoopPayload(
          requestPayload,
          toolDefinitions
        ),
        signal,
        toolDefinitions,
      })
      const rawResponse = result.rawResponse ?? {}
      const usage = aggregateOpenRouterUsage(
        getProviderRawResponseList(rawResponse).map(
          (response) => asRecord(response).usage ?? {}
        )
      )

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
        outputText: result.outputText,
        rawResponse,
        usage,
      }
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

function shouldUseOpenRouterChatCompletionsToolLoop(model: string) {
  return model.toLowerCase().startsWith("deepseek/")
}

function createOpenRouterChatCompletionToolLoopPayload(
  requestPayload: OpenRouterRequestPayload,
  toolDefinitions: readonly LlamaCppToolDefinition[]
): LlamaCppChatCompletionRequestPayload {
  return {
    providerType: "openrouter",
    model: requestPayload.model,
    max_tokens: requestPayload.maxOutputTokens,
    messages: normalizeOpenRouterChatCompletionMessages(requestPayload.input),
    metadata: requestPayload.metadata,
    parallel_tool_calls: requestPayload.parallelToolCalls,
    tools: createLlamaCppChatCompletionTools(toolDefinitions),
    stopWhenStepCount: requestPayload.stopWhenStepCount,
    extraBody: {
      provider: requestPayload.provider,
      reasoning: requestPayload.reasoning,
      ...(requestPayload.serviceTier
        ? { service_tier: requestPayload.serviceTier }
        : {}),
    },
  }
}

function normalizeOpenRouterChatCompletionMessages(
  input: unknown
): LlamaCppChatCompletionRequestPayload["messages"] {
  if (typeof input === "string") {
    return [
      {
        role: "user",
        content: input,
      },
    ]
  }

  return [
    {
      role: "user",
      content: String(input ?? ""),
    },
  ]
}

function createOpenRouterChatCompletion(
  config: OpenRouterRunConfig
): LlamaCppChatCompletionCreateNonStreaming {
  return async (body, { signal }) => {
    const response = await callWithRuntimeAbortSignal(
      signal,
      (options) =>
        fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            "Content-Type": "application/json",
            "X-OpenRouter-Experimental-Metadata": "enabled",
          },
          body: JSON.stringify(body),
          signal: options.signal,
        }),
      "OpenRouter Chat Completions API request was cancelled."
    )
    const responseText = await response.text()

    if (!response.ok) {
      const responseMetadata = formatProviderHttpResponseMetadata(response)

      throw new Error(
        `OpenRouter Chat Completions API request failed (${response.status}): ${formatProviderHttpErrorBody(responseText)}${responseMetadata ? ` (${responseMetadata})` : ""}`
      )
    }

    if (!responseText.trim()) {
      return {} as Awaited<ReturnType<LlamaCppChatCompletionCreateNonStreaming>>
    }

    try {
      return JSON.parse(responseText) as Awaited<
        ReturnType<LlamaCppChatCompletionCreateNonStreaming>
      >
    } catch (error) {
      throw new Error(
        "OpenRouter Chat Completions API returned non-JSON output.",
        {
          cause: error,
        }
      )
    }
  }
}

function getProviderRawResponseList(rawResponse: unknown): unknown[] {
  const responses = asRecord(rawResponse).responses

  return Array.isArray(responses) ? responses : []
}

type OpenRouterResponsesApiRequestBody = {
  include?: ["reasoning.encrypted_content"]
  input: unknown
  max_output_tokens: number
  metadata: Record<string, string>
  model: string
  parallel_tool_calls: false
  provider: unknown
  reasoning: unknown
  service_tier?: string
  store: false
  stream: false
  tools: OpenRouterResponsesFunctionTool[]
}

type OpenRouterFunctionCall = {
  argumentsText: string
  callId: string
  itemId: string | null
  name: string
  rawItem: unknown
}

async function createOpenRouterResponsesApiResponse(
  config: OpenRouterRunConfig,
  body: OpenRouterResponsesApiRequestBody,
  signal: AbortSignal
) {
  const response = await callWithRuntimeAbortSignal(
    signal,
    (options) =>
      fetch("https://openrouter.ai/api/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
          "X-OpenRouter-Experimental-Metadata": "enabled",
        },
        body: JSON.stringify(body),
        signal: options.signal,
      }),
    "OpenRouter Responses API request was cancelled."
  )
  const responseText = await response.text()

  if (!response.ok) {
    const responseMetadata = formatProviderHttpResponseMetadata(response)

    throw new Error(
      `OpenRouter Responses API request failed (${response.status}): ${formatProviderHttpErrorBody(responseText)}${responseMetadata ? ` (${responseMetadata})` : ""}`
    )
  }

  if (!responseText.trim()) {
    return {}
  }

  try {
    return JSON.parse(responseText) as unknown
  } catch (error) {
    throw new Error("OpenRouter Responses API returned non-JSON output.", {
      cause: error,
    })
  }
}

function getOpenRouterFunctionCalls(
  response: unknown
): OpenRouterFunctionCall[] {
  const output = asRecord(response).output

  if (!Array.isArray(output)) {
    return []
  }

  return output.flatMap((item) => {
    const itemRecord = asRecord(item)

    if (itemRecord.type !== "function_call") {
      return []
    }

    const name = getStringProperty(itemRecord, "name")
    const callId =
      getStringProperty(itemRecord, "call_id") ??
      getStringProperty(itemRecord, "callId") ??
      getStringProperty(itemRecord, "id")

    if (!name || !callId) {
      throw new Error(
        "OpenRouter returned a function call without a name or call id."
      )
    }

    return [
      {
        argumentsText: getStringProperty(itemRecord, "arguments") ?? "{}",
        callId,
        itemId: getStringProperty(itemRecord, "id"),
        name,
        rawItem: item,
      },
    ]
  })
}

function parseAndValidateOpenRouterToolArguments(
  toolCall: OpenRouterFunctionCall,
  toolDefinition: LlamaCppToolDefinition
) {
  let parsedArguments: unknown

  try {
    parsedArguments = toolCall.argumentsText.trim()
      ? JSON.parse(toolCall.argumentsText)
      : {}
  } catch (error) {
    throw new Error(
      `OpenRouter tool ${toolCall.name} arguments were not valid JSON.`,
      {
        cause: error,
      }
    )
  }

  if (
    typeof parsedArguments !== "object" ||
    parsedArguments === null ||
    Array.isArray(parsedArguments)
  ) {
    throw new Error(
      `OpenRouter tool ${toolCall.name} arguments must be a JSON object.`
    )
  }

  const parsedInput = toolDefinition.inputSchema.safeParse(parsedArguments)

  if (!parsedInput.success) {
    throw new Error(
      `OpenRouter tool ${toolCall.name} arguments did not match schema: ${parsedInput.error.message}`
    )
  }

  return parsedInput.data as Record<string, unknown>
}

function createOpenRouterFollowUpInput({
  previousInput,
  responseOutput,
  toolOutputItems,
}: {
  previousInput: unknown
  responseOutput: unknown
  toolOutputItems: readonly unknown[]
}) {
  return [
    ...normalizeOpenRouterResponsesInput(previousInput),
    ...(Array.isArray(responseOutput) ? responseOutput : []),
    ...toolOutputItems,
  ]
}

function normalizeOpenRouterResponsesInput(input: unknown) {
  if (Array.isArray(input)) {
    return input
  }

  return [
    {
      role: "user",
      content: typeof input === "string" ? input : String(input ?? ""),
    },
  ]
}

function formatToolOutputForProviderMessage(value: unknown) {
  if (typeof value === "string") {
    return value
  }

  return JSON.stringify(value) ?? "null"
}

function assertCompletedProviderResponse(
  response: unknown,
  phase: LlmRunPhase,
  providerName: string
) {
  const responseRecord = asRecord(response)
  const status = getStringProperty(responseRecord, "status")

  if (!status || status === "completed") {
    return
  }

  throw new Error(
    `${providerName} ${formatLlmRunPhase(phase)} response ended with status "${status}": ${getProviderResponseFailureDetail(response)}`
  )
}

function getProviderResponseFailureDetail(response: unknown) {
  const responseRecord = asRecord(response)
  const errorRecord = asRecord(responseRecord.error)
  const incompleteDetailsRecord = asRecord(responseRecord.incomplete_details)
  const camelIncompleteDetailsRecord = asRecord(
    responseRecord.incompleteDetails
  )
  const errorMessage = getStringProperty(errorRecord, "message")
  const errorCode = getStringProperty(errorRecord, "code")
  const metadataDetail = getProviderErrorMetadataDetail(errorRecord)
  const routerMetadataDetail =
    getOpenRouterMetadataFailureDetail(responseRecord)
  const supplementalDetails = [metadataDetail, routerMetadataDetail].filter(
    (detail) => detail !== null
  )
  const supplementalDetail =
    supplementalDetails.length > 0 ? supplementalDetails.join(" / ") : null
  const incompleteDetail =
    getStringProperty(incompleteDetailsRecord, "reason") ??
    getStringProperty(camelIncompleteDetailsRecord, "reason")

  if (errorMessage && supplementalDetail) {
    return `${errorMessage}: ${supplementalDetail}`
  }

  return (
    errorMessage ??
    supplementalDetail ??
    errorCode ??
    incompleteDetail ??
    JSON.stringify(response) ??
    "unknown provider response failure"
  )
}

function getProviderErrorMetadataDetail(errorRecord: Record<string, unknown>) {
  const metadataRecord = asRecord(errorRecord.metadata)
  const providerName =
    getStringProperty(metadataRecord, "provider_name") ??
    getStringProperty(metadataRecord, "providerName")
  const rawError = formatProviderRawError(metadataRecord.raw)

  if (providerName && rawError) {
    return `${providerName} returned: ${rawError}`
  }

  if (providerName) {
    return `provider=${providerName}`
  }

  return rawError
}

function getOpenRouterMetadataFailureDetail(
  responseRecord: Record<string, unknown>
) {
  const metadataRecord = asRecord(
    responseRecord.openrouter_metadata ?? responseRecord.openrouterMetadata
  )

  if (Object.keys(metadataRecord).length === 0) {
    return null
  }

  const attemptsText = formatOpenRouterMetadataAttempts(metadataRecord.attempts)
  const attempt = getNumberProperty(metadataRecord, "attempt")
  const details = [
    getStringProperty(metadataRecord, "summary"),
    getStringProperty(metadataRecord, "requested")
      ? `requested=${getStringProperty(metadataRecord, "requested")}`
      : null,
    getStringProperty(metadataRecord, "strategy")
      ? `strategy=${getStringProperty(metadataRecord, "strategy")}`
      : null,
    attempt !== null ? `attempt=${attempt}` : null,
    attemptsText ? `attempts=${attemptsText}` : null,
  ].filter((detail) => detail !== null)

  return details.length > 0 ? `router metadata: ${details.join(", ")}` : null
}

function formatOpenRouterMetadataAttempts(attempts: unknown) {
  if (!Array.isArray(attempts)) {
    return null
  }

  const attemptLabels = attempts.flatMap((attempt) => {
    const attemptRecord = asRecord(attempt)
    const provider =
      getStringProperty(attemptRecord, "provider") ??
      getStringProperty(attemptRecord, "provider_name") ??
      getStringProperty(attemptRecord, "providerName")
    const model = getStringProperty(attemptRecord, "model")
    const statusValue = attemptRecord.status
    const status =
      typeof statusValue === "number" || typeof statusValue === "string"
        ? String(statusValue)
        : null

    if (!provider && !model && !status) {
      return []
    }

    const label = [provider, model].filter(Boolean).join("/")

    return [`${label || "provider"}${status ? `:${status}` : ""}`]
  })

  return attemptLabels.length > 0 ? attemptLabels.join("; ") : null
}

function formatProviderRawError(rawError: unknown): string | null {
  if (rawError === null || rawError === undefined) {
    return null
  }

  const rawErrorMessage = getProviderRawErrorMessage(rawError)

  if (rawErrorMessage !== null) {
    return rawErrorMessage
  }

  if (typeof rawError === "string") {
    const trimmedRawError = rawError.trim()

    return trimmedRawError ? trimmedRawError : null
  }

  return JSON.stringify(rawError) ?? String(rawError)
}

function getProviderRawErrorMessage(
  rawError: unknown,
  depth = 0
): string | null {
  if (depth > 3 || rawError === null || rawError === undefined) {
    return null
  }

  if (typeof rawError === "string") {
    const trimmedRawError = rawError.trim()

    if (!trimmedRawError) {
      return null
    }

    try {
      return getProviderRawErrorMessage(JSON.parse(trimmedRawError), depth + 1)
    } catch {
      return trimmedRawError
    }
  }

  if (typeof rawError !== "object") {
    return String(rawError)
  }

  const rawErrorRecord = asRecord(rawError)

  for (const property of ["message", "detail", "error", "reason", "code"]) {
    const propertyMessage = getProviderRawErrorMessage(
      rawErrorRecord[property],
      depth + 1
    )

    if (propertyMessage !== null) {
      return propertyMessage
    }
  }

  return null
}

function formatProviderHttpErrorBody(responseText: string) {
  if (!responseText.trim()) {
    return "empty response body"
  }

  try {
    const parsed = JSON.parse(responseText) as unknown
    const message = getProviderResponseFailureDetail(parsed)

    return message === "unknown provider response failure"
      ? JSON.stringify(parsed)
      : message
  } catch {
    return responseText.slice(0, 1000)
  }
}

function formatProviderHttpResponseMetadata(response: globalThis.Response) {
  const generationId = response.headers.get("X-Generation-Id")
  const retryAfter = response.headers.get("Retry-After")
  const details = [
    generationId ? `generationId=${generationId}` : null,
    retryAfter ? `retryAfter=${retryAfter}` : null,
  ].filter((detail) => detail !== null)

  return details.length > 0 ? details.join(", ") : null
}

async function collectLlamaCppLlmResponse({
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
}): Promise<CompletedLlmResponseResult> {
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
      const result = await collectLlamaCppChatCompletionNonStreaming({
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

      return {
        ...result,
        rawResponse: result.rawResponse ?? {},
      }
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
  llmModelPresetName,
  prompt,
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
  llmModelPresetName: string | null
  prompt: LlmPromptInput
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
    llmModelPresetName,
    prompt,
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
  llmModelPresetName,
  prompt,
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
  llmModelPresetName: string | null
  prompt: LlmPromptInput
  reasoningSummariesEnabled: boolean
  runtimeStreamKey: string
  simulationId: string
  startedAt: string
}) {
  const completion = createRuntimeCompletion()
  const runtime: ActiveLlmRunRuntime = {
    abortController: new AbortController(),
    attemptNumber,
    completionPromise: completion.completionPromise,
    createdAt,
    deckId,
    llmRunId,
    llmModelPresetId: config.modelPresetId,
    llmModelPresetName,
    processingMode: "realtime",
    model: config.model,
    fullPrompt,
    phase: "opening_hand",
    provider: config.provider,
    reasoningEffort: config.reasoningEffort,
    serviceTier: getLlmRunServiceTier(config),
    resolveCompletion: completion.resolveCompletion,
    runtimeStreamKey,
    simulationId,
    startedAt,
    status: "streaming",
  }

  activeLlmRunRuntimes.set(runtimeStreamKey, runtime)
  let responseResult: CompletedLlmResponseResult | null = null

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
      prompt,
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

    responseResult =
      config.provider === "openai"
        ? await collectOpenAiLlmResponse({
            config,
            llmRunId,
            phase: "opening_hand",
            requestPayload: requireOpenAiRequestPayload(requestPayload),
            runtime,
          })
        : config.provider === "anthropic"
          ? await collectAnthropicLlmResponse({
              config,
              llmRunId,
              phase: "opening_hand",
              requestPayload: requireAnthropicRequestPayload(requestPayload),
              runtime,
            })
          : config.provider === "openrouter"
            ? await collectOpenRouterLlmResponse({
                config,
                llmRunId,
                mcpPath: appendMcpRunTokenToPath(
                  OPENING_HAND_MCP_PATH,
                  mcpRunToken.token
                ),
                phase: "opening_hand",
                requestPayload: requireOpenRouterRequestPayload(requestPayload),
                runtime,
                toolDefinitions: openingHandLlmToolDefinitions,
              })
            : await collectLlamaCppLlmResponse({
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
    const parsedOpeningHand = parseOpeningHandCompletionFromResponseText(
      responseResult.outputText
    )

    throwIfRuntimeAborted(runtime.abortController.signal)

    const completion = await completeOpeningHandLlmRun({
      finalOutputText: responseResult.outputText,
      llmRunId,
      openingHand: parsedOpeningHand.keptHand,
      rawResponse: responseResult.rawResponse,
      summary: parsedOpeningHand.summary,
      usage: responseResult.usage,
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
      await cancelLlmRun(
        llmRunId,
        "Opening-hand LLM run was cancelled.",
        responseResult?.outputText
      )
      runtime.status = "cancelled"
      await publishSimulationResultsState({
        deckId,
        llmRunId,
        simulationId,
      })
      return
    }

    logLlmApiCallStoppedWithError({
      error,
      llmRunId,
      phase: "opening_hand",
      provider: config.provider,
    })
    console.error("Opening-hand LLM run failed:", error)
    await failLlmRun(
      llmRunId,
      getErrorMessage(error),
      responseResult?.outputText
    )
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
  llmModelPresetName,
  prompt,
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
  llmModelPresetName: string | null
  prompt: LlmPromptInput
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
    llmModelPresetName,
    prompt,
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
  llmModelPresetName,
  prompt,
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
  llmModelPresetName: string | null
  prompt: LlmPromptInput
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
    completionPromise: completion.completionPromise,
    createdAt,
    deckId,
    llmRunId,
    llmModelPresetId: config.modelPresetId,
    llmModelPresetName,
    processingMode: "realtime",
    model: config.model,
    fullPrompt,
    phase: "turn",
    provider: config.provider,
    reasoningEffort: config.reasoningEffort,
    serviceTier: getLlmRunServiceTier(config),
    resolveCompletion: completion.resolveCompletion,
    runtimeStreamKey,
    simulationId,
    startedAt,
    status: "streaming",
    turnNumber,
  }

  activeLlmRunRuntimes.set(runtimeStreamKey, runtime)
  let responseResult: CompletedLlmResponseResult | null = null

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
      prompt,
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

    responseResult =
      config.provider === "openai"
        ? await collectOpenAiLlmResponse({
            config,
            llmRunId,
            phase: "turn",
            requestPayload: requireOpenAiRequestPayload(requestPayload),
            runtime,
          })
        : config.provider === "anthropic"
          ? await collectAnthropicLlmResponse({
              config,
              llmRunId,
              phase: "turn",
              requestPayload: requireAnthropicRequestPayload(requestPayload),
              runtime,
            })
          : config.provider === "openrouter"
            ? await collectOpenRouterLlmResponse({
                config,
                llmRunId,
                mcpPath: appendMcpRunTokenToPath(
                  TURN_SIMULATION_MCP_PATH,
                  mcpRunToken.token
                ),
                phase: "turn",
                requestPayload: requireOpenRouterRequestPayload(requestPayload),
                runtime,
                toolDefinitions: getTurnSimulationLlmToolDefinitions(),
              })
            : await collectLlamaCppLlmResponse({
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
    const parsedTurn = parseTurnSimulationCompletionFromResponseText(
      responseResult.outputText
    )

    throwIfRuntimeAborted(runtime.abortController.signal)

    const completion = await completeTurnLlmRun({
      finalOutputText: responseResult.outputText,
      llmRunId,
      gameState: parsedTurn.gameState,
      rawResponse: responseResult.rawResponse,
      turnActions: parsedTurn.turnActions,
      usage: responseResult.usage,
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
      await cancelLlmRun(
        llmRunId,
        "Turn LLM run was cancelled.",
        responseResult?.outputText
      )
      runtime.status = "cancelled"
      await publishSimulationResultsState({
        deckId,
        llmRunId,
        simulationId,
      })
      return
    }

    logLlmApiCallStoppedWithError({
      error,
      llmRunId,
      phase: "turn",
      provider: config.provider,
    })
    console.error("Turn LLM run failed:", error)
    await failLlmRun(
      llmRunId,
      getErrorMessage(error),
      responseResult?.outputText
    )
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
  if (activeRuns.some((run) => run.status === "batch_submitted")) {
    throw new SimulationValidationError(SUBMITTED_BATCH_RUN_STOP_MESSAGE)
  }

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
  await ensureBenchmarkRunsSchema()
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

  app.get(
    APP_PASSWORD_RESET_TOKEN_PATH,
    async (req: Request, res: Response) => {
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
    }
  )

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

  app.use(async (req: Request, res: Response, next) => {
    if (req.path === "/health" || isAuthPath(req.path) || isMcpPath(req.path)) {
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
      res
        .status(200)
        .json(
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

  app.get("/admin/benchmarks", async (req: Request, res: Response) => {
    const adminUser = requireAdminUser(req, res)

    if (!adminUser) {
      return
    }

    try {
      const benchmarks = await listAdminBenchmarks(adminUser.id)

      res.status(200).json({
        benchmarks,
        total: benchmarks.length,
      })
    } catch (error) {
      console.error("Failed to list benchmarks:", error)
      res.status(500).json({
        error: "Failed to list benchmarks.",
      })
    }
  })

  app.get(
    "/admin/benchmarks/:benchmarkId/export",
    async (req: Request, res: Response) => {
      const adminUser = requireAdminUser(req, res)

      if (!adminUser) {
        return
      }

      const benchmarkId = String(req.params.benchmarkId)

      try {
        const exportData = await getAdminBenchmarkZipExport(
          benchmarkId,
          adminUser.id
        )

        if (!exportData) {
          res.status(404).json({
            error: "Benchmark not found.",
          })
          return
        }

        res.setHeader("Content-Type", "application/zip")
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="benchmark-${exportData.benchmark.id}.zip"`
        )
        res.status(200).send(exportData.zip)
      } catch (error) {
        if (error instanceof SimulationValidationError) {
          const status =
            error.message === "Simulation not found."
              ? 404
              : error.message ===
                  "Simulation cannot be exported while LLM runs are active."
                ? 409
                : 400

          res.status(status).json({
            error: error.message,
          })
          return
        }

        console.error("Failed to export benchmark ZIP:", error)
        res.status(500).json({
          error: "Failed to export benchmark ZIP.",
        })
      }
    }
  )

  app.post("/admin/benchmarks", async (req: Request, res: Response) => {
    const adminUser = requireAdminUser(req, res)

    if (!adminUser) {
      return
    }

    const parsedBenchmark = createBenchmarkSchema.safeParse(req.body)

    if (!parsedBenchmark.success) {
      res.status(400).json({
        error: "Benchmark payload is not in the expected format.",
      })
      return
    }

    const benchmarkInput = parsedBenchmark.data
    const deckIds = Array.from(new Set(benchmarkInput.deckIds))

    if (deckIds.length !== benchmarkInput.deckIds.length) {
      res.status(400).json({
        error: "Choose each benchmark deck only once.",
      })
      return
    }

    if (
      benchmarkInput.llmProcessingMode === "openai_batch" &&
      benchmarkInput.useFlexServiceTier
    ) {
      res.status(400).json({
        error: "Batch processing cannot be combined with flex processing.",
      })
      return
    }

    try {
      const [ownedDecks, modelPreset] = await Promise.all([
        listDecks(adminUser.id),
        getEnabledLlmModelPreset(benchmarkInput.llmModelPresetId),
      ])
      const ownedDeckIds = new Set(ownedDecks.map((deck) => deck.id))

      if (deckIds.some((deckId) => !ownedDeckIds.has(deckId))) {
        res.status(400).json({
          error: "Benchmarks can only use decks owned by your account.",
        })
        return
      }

      if (!modelPreset) {
        res.status(400).json({
          error: "Model preset not found or disabled.",
        })
        return
      }

      if (
        benchmarkInput.llmProcessingMode === "openai_batch" &&
        modelPreset.provider !== "openai"
      ) {
        res.status(400).json({
          error: "Batch processing can only use OpenAI model presets.",
        })
        return
      }

      if (benchmarkInput.useFlexServiceTier && !modelPreset.supportsFlex) {
        res.status(400).json({
          error:
            "Flex processing can only be enabled for model presets that support flex.",
        })
        return
      }

      const benchmark = await createAdminBenchmarkRun({
        adminUserId: adminUser.id,
        deckIds,
        llmModelPresetId: benchmarkInput.llmModelPresetId,
        llmProcessingMode: benchmarkInput.llmProcessingMode,
        simulationsPerDeck: benchmarkInput.simulationsPerDeck,
        turnsToSimulate: benchmarkInput.turnsToSimulate,
        useFlexServiceTier: benchmarkInput.useFlexServiceTier,
      })

      res.status(201).json({
        benchmark,
      })
    } catch (error) {
      if (error instanceof SimulationValidationError) {
        res.status(400).json({
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

      console.error("Failed to create benchmark:", error)
      res.status(500).json({
        error: "Failed to create benchmark.",
      })
    }
  })

  app.post(
    "/admin/benchmarks/:benchmarkId/stop",
    async (req: Request, res: Response) => {
      const adminUser = requireAdminUser(req, res)

      if (!adminUser) {
        return
      }

      const benchmarkId = String(req.params.benchmarkId)

      try {
        const stopResult = await stopAdminBenchmarkRun(
          benchmarkId,
          adminUser.id
        )

        if (!stopResult) {
          res.status(404).json({
            error: "Benchmark not found.",
          })
          return
        }

        res.status(200).json(stopResult)
      } catch (error) {
        console.error("Failed to stop benchmark:", error)
        res.status(500).json({
          error: "Failed to stop benchmark.",
        })
      }
    }
  )

  app.get("/llm-model-presets", async (_req: Request, res: Response) => {
    try {
      const presets = await listEnabledLlmModelPresets()

      res.status(200).json({
        presets,
        defaultPresetId: presets.find((preset) => preset.isDefault)?.id ?? null,
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

  app.get("/admin/llm-model-presets", async (req: Request, res: Response) => {
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
  })

  app.post("/admin/llm-model-presets", async (req: Request, res: Response) => {
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
  })

  app.patch(
    "/admin/llm-model-presets/:presetId",
    async (req: Request, res: Response) => {
      if (!requireAdminUser(req, res)) {
        return
      }

      const presetId = String(req.params.presetId)
      const parsedUpdate = updateLlmModelPresetSchema.safeParse(req.body)

      if (!parsedUpdate.success) {
        res.status(400).json({
          error: "Model preset update payload is not in the expected format.",
        })
        return
      }

      try {
        const preset = await updateLlmModelPreset(presetId, parsedUpdate.data)

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
        if (error instanceof LlmModelPresetValidationError) {
          res.status(400).json({
            error: error.message,
          })
          return
        }

        console.error("Failed to update model preset:", error)
        res.status(500).json({
          error: "Failed to update model preset.",
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

  app.post("/decks/validate-cards", async (req: Request, res: Response) => {
    const parsedDeckCards = createDeckCardsSchema.safeParse(req.body)

    if (!parsedDeckCards.success) {
      res.status(400).json({
        error: "Deck card payload is not in the expected format.",
      })
      return
    }

    try {
      const cardValidation = await validateCreateDeckCards(parsedDeckCards.data)

      if (!cardValidation.ok) {
        res.status(cardValidation.status).json(cardValidation.body)
        return
      }

      res.status(200).json({
        ok: true,
      })
    } catch (error) {
      console.error("Failed to validate deck cards:", error)
      res.status(500).json({
        error: "Deck cards could not be validated.",
      })
    }
  })

  app.post("/decks/import/archidekt", async (req: Request, res: Response) => {
    const parsedImport = archidektImportSchema.safeParse(req.body)

    if (!parsedImport.success) {
      res.status(400).json({
        error: "Archidekt import payload is not in the expected format.",
      })
      return
    }

    try {
      const deck = await importArchidektDeck(parsedImport.data.input)

      res.status(200).json({
        deck,
      })
    } catch (error) {
      if (error instanceof ArchidektImportError) {
        res.status(error.status).json({
          error: error.message,
        })
        return
      }

      console.error("Failed to import Archidekt deck:", error)
      res.status(500).json({
        error: "Archidekt deck could not be imported.",
      })
    }
  })

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
        const isFreeTier = await isFreeTierRequest(req)
        const simulation = await createSimulation(deckId, {
          ...parsedSimulation.data,
          createdVia: "app",
          forceFlexServiceTier: isFreeTier,
          requireFreeTierModelPreset: isFreeTier,
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
          const status =
            error.message === "Simulation not found."
              ? 404
              : error.message === SUBMITTED_BATCH_RUN_STOP_MESSAGE
                ? 409
                : 400

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

  app.post(
    "/decks/:deckId/simulations/:simulationId/stop-auto-advance",
    async (req: Request, res: Response) => {
      const deckId = String(req.params.deckId)
      const simulationId = String(req.params.simulationId)

      try {
        const simulation = await disableSimulationAutoAdvance(
          deckId,
          simulationId
        )
        await publishSimulationResultsState({
          deckId,
          simulationId,
        })
        res.status(200).json({ simulation })
      } catch (error) {
        if (error instanceof SimulationValidationError) {
          const status = error.message === "Simulation not found." ? 404 : 400

          res.status(status).json({
            error: error.message,
          })
          return
        }

        console.error("Failed to stop simulation auto-advance:", error)
        res.status(500).json({
          error: "Failed to stop future simulation turns.",
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
    "/decks/:deckId/simulations/:simulationId/export",
    async (req: Request, res: Response) => {
      if (!requireAdminUser(req, res)) {
        return
      }

      const deckId = String(req.params.deckId)
      const simulationId = String(req.params.simulationId)

      try {
        const exportData = await getPublicSimulationExport(deckId, simulationId)

        res.setHeader("Content-Type", "application/json")
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${simulationId}.json"`
        )
        res.status(200).json(exportData)
      } catch (error) {
        if (error instanceof SimulationValidationError) {
          const status =
            error.message === "Simulation not found."
              ? 404
              : error.message ===
                  "Simulation cannot be exported while LLM runs are active."
                ? 409
                : 400

          res.status(status).json({
            error: error.message,
          })
          return
        }

        console.error("Failed to export simulation JSON:", error)
        res.status(500).json({
          error: "Failed to export simulation JSON.",
        })
      }
    }
  )

  app.get(
    "/decks/:deckId/simulations/:simulationId/results/stream",
    async (req: Request, res: Response) => {
      const deckId = String(req.params.deckId)
      const simulationId = String(req.params.simulationId)
      const includeRunCosts = getAuthenticatedUser(req).role === "admin"
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
        let unsubscribe = () => {}
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
          write(data: string) {
            if (!isStreamOpen) {
              return
            }

            if (hasSentSnapshot) {
              res.write(data)
              return
            }

            queuedWrites.push(data)
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
            streamWriter,
            { includeRunCosts }
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

        res.write(
          formatSseEvent(
            redactSimulationResultsStreamEventCosts(
              snapshotEvent,
              includeRunCosts
            )
          )
        )
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

          res.write(
            formatSseEvent(
              redactSimulationResultsStreamEventCosts(
                doneEvent,
                includeRunCosts
              )
            )
          )
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
        const isFreeTier = await isFreeTierRequest(req)
        const simulation = await updateSimulation(deckId, simulationId, {
          ...parsedUpdate.data,
          forceFlexServiceTier: isFreeTier,
          requireFreeTierModelPreset: isFreeTier,
        })

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

    try {
      const cardValidation = await validateCreateDeckCards(parsedDeck.data)

      if (!cardValidation.ok) {
        res.status(cardValidation.status).json(cardValidation.body)
        return
      }

      const createdDeck = await createDeck({
        name: parsedDeck.data.name,
        desc: parsedDeck.data.desc,
        mulliganGuidelines: parsedDeck.data.mulliganGuidelines,
        strategyGuidelines: parsedDeck.data.strategyGuidelines,
        ownerUserId: user.id,
        commanders: cardValidation.commanderOracleIds.map((oracleId) => ({
          oracleId,
          quantity: 1,
        })),
        cards: parsedDeck.data.cards.map((card) => ({
          oracleId: getExactMatchOracleId(
            cardValidation.exactMatchesByName,
            card.name
          ),
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
  registerMcpEndpoint(
    app,
    TURN_SIMULATION_MCP_PATH,
    createTurnSimulationServer,
    {
      phase: "turn",
    }
  )

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
    startOpenAiBatchWorkers(queueConfig)
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

type CreateDeckCardValidationInput = z.infer<typeof createDeckCardsSchema>

type CreateDeckCardValidationResult =
  | {
      ok: true
      exactMatchesByName: ReturnType<
        typeof createExactScryfallOracleCardMatchMap
      >
      commanderOracleIds: string[]
    }
  | {
      ok: false
      status: number
      body: {
        error: string
        unmatchedCards?: string[]
      }
    }

async function validateCreateDeckCards(
  deckCards: CreateDeckCardValidationInput
): Promise<CreateDeckCardValidationResult> {
  const commanderNames = new Set(
    deckCards.commanders.map((commander) => commander.toLocaleLowerCase())
  )

  if (commanderNames.size !== deckCards.commanders.length) {
    return {
      ok: false,
      status: 400,
      body: {
        error: "Commander cards must be different.",
      },
    }
  }

  const expectedDeckSize = deckCards.commanders.length === 2 ? 98 : 99
  const actualDeckSize = deckCards.cards.reduce(
    (total, card) => total + card.quantity,
    0
  )

  if (actualDeckSize !== expectedDeckSize) {
    return {
      ok: false,
      status: 400,
      body: {
        error: `Deck list must contain exactly ${expectedDeckSize} cards. Parsed ${actualDeckSize}.`,
      },
    }
  }

  const cardResolution = await resolveExactScryfallOracleCards([
    ...deckCards.commanders,
    ...deckCards.cards.map((card) => card.name),
  ])

  if (cardResolution.missingNames.length > 0) {
    return {
      ok: false,
      status: 400,
      body: {
        error: `Could not find exact matches for: ${cardResolution.missingNames.join(", ")}.`,
        unmatchedCards: cardResolution.missingNames,
      },
    }
  }

  const exactMatchesByName = createExactScryfallOracleCardMatchMap(
    cardResolution.matches
  )
  const commanderOracleIds = deckCards.commanders.map((commander) =>
    getExactMatchOracleId(exactMatchesByName, commander)
  )

  if (new Set(commanderOracleIds).size !== commanderOracleIds.length) {
    return {
      ok: false,
      status: 400,
      body: {
        error: "Commander cards must be different.",
      },
    }
  }

  return {
    ok: true,
    exactMatchesByName,
    commanderOracleIds,
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
      stopOpenAiBatchWorkers()
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

async function isFreeTierRequest(req: Request) {
  return isFreeTierUser(getAuthenticatedUser(req).id)
}

async function isFreeTierUser(userId: string) {
  const billingTierSummary = await getUserBillingTierSummary(
    { query: queryDatabase },
    userId
  )

  return billingTierSummary.effectiveTier === "free"
}

async function isFreeTierSimulationOwner(deckId: string, simulationId: string) {
  const result = await queryDatabase<{ owner_user_id: string | null }>(
    `
      SELECT deck.owner_user_id
      FROM simulations simulation
      JOIN decks deck
        ON deck.id = simulation.deck_id
      WHERE simulation.id = $1
        AND simulation.deck_id = $2
    `,
    [simulationId, deckId]
  )
  const ownerUserId = result.rows[0]?.owner_user_id

  if (!ownerUserId) {
    return false
  }

  return isFreeTierUser(ownerUserId)
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
    throw new Error(
      `Missing server environment variable: ${environmentVariable}.`
    )
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

main().catch(async (error: unknown) => {
  console.error(error)
  await closeDatabasePool()
  process.exit(1)
})
