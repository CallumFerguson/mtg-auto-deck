import { queryDatabase, withDatabaseTransaction } from "./db.js"
import {
  applyLlmRunEstimatedCostServiceTierDiscount,
  estimatePartialLlmRunCostUsd,
  estimatePresetTokenCostUsd,
  formatPreferredLlmRunCostAsCents,
  getOpenRouterReportedCostUsd,
} from "./llm-pricing.js"
import { BILLING_TIER_LIMITS } from "./subscription-tiers.js"
import {
  USAGE_LIMIT_OUT_OF_USAGE_MESSAGE,
  ensureUserUsageLimitWindowsForRunStartWithClient,
} from "./usage-limits-postgres.js"

export const FREE_TIER_MODEL_PRESET_REQUIRED_MESSAGE =
  "Free tier users must choose a free tier model preset before starting LLM runs."

type DatabaseTransactionClient = Parameters<
  Parameters<typeof withDatabaseTransaction>[0]
>[0]

export type SimulationStatus =
  | "pending"
  | "unmanaged"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"

export type SimulationCreatedVia = "app" | "benchmark" | "external_mcp"

export type LlmProcessingMode = "realtime" | "openai_batch"

export function getInitialSimulationStatus(
  createdVia: SimulationCreatedVia
): SimulationStatus {
  return createdVia === "external_mcp" ? "unmanaged" : "pending"
}

export type LlmRunStatus =
  | "pending"
  | "batch_pending"
  | "batch_submitted"
  | "streaming"
  | "completed"
  | "failed"
  | "cancel_requested"
  | "cancelled"

export type LlmRunPhase = "opening_hand" | "turn" | "other"

export function canApplyLateLlmRunTerminalUpdate(status: LlmRunStatus) {
  return (
    status === "pending" ||
    status === "batch_submitted" ||
    status === "streaming"
  )
}

export type CreateOpeningHandLlmRunInput = {
  simulationId: string
  llmModelPresetId: string
  processingMode: LlmProcessingMode
  provider: string
  model: string
  openrouterModelProvider: string | null
  serviceTier: string | null
  reasoningEffort: string | null
  runtimeStreamKey: string
  fullPrompt: string
  requestPayload: unknown
}

export type CreateTurnLlmRunInput = {
  simulationId: string
  llmModelPresetId: string
  turnNumber: number
  processingMode: LlmProcessingMode
  provider: string
  model: string
  openrouterModelProvider: string | null
  serviceTier: string | null
  reasoningEffort: string | null
  runtimeStreamKey: string
  requireAutoSimulateNextStep?: boolean
}

export type OpeningHandLlmRun = {
  simulationId: string
  llmRunId: string
  attemptNumber: number
  reasoningSummariesEnabled: boolean
  runtimeStreamKey: string
  status: LlmRunStatus
  createdAt: string
}

type TurnLlmRun = OpeningHandLlmRun & {
  turnNumber: number
}

export type PreparedTurnLlmRun = TurnLlmRun & {
  previousGameState: unknown | null
}

export type ClaimedQueuedLlmRun = {
  simulationId: string
  deckId: string
  llmRunId: string
  llmModelPresetId: string | null
  phase: Extract<LlmRunPhase, "opening_hand" | "turn">
  provider: string
  model: string
  openrouterModelProvider: string | null
  serviceTier: string | null
  reasoningEffort: string | null
  reasoningSummariesEnabled: boolean
  runtimeStreamKey: string
  attemptNumber: number
  createdAt: string
  startedAt: string
  fullPrompt: string
  requestPayload: unknown
  ownerUserId: string | null
  turnNumber?: number
}

type UsageLimitedQueuedLlmRun = {
  usageLimitExceeded: true
  simulationId: string
  deckId: string
  llmRunId: string
  phase: Extract<LlmRunPhase, "opening_hand" | "turn">
  failureMessage: string
}

export type LlmRunQueueClaimResult =
  | ClaimedQueuedLlmRun
  | UsageLimitedQueuedLlmRun

export type OpenAiBatchPendingRun = {
  simulationId: string
  deckId: string
  llmRunId: string
  llmModelPresetId: string
  phase: Extract<LlmRunPhase, "opening_hand" | "turn">
  provider: string
  model: string
  openrouterModelProvider: string | null
  serviceTier: string | null
  reasoningEffort: string | null
  reasoningSummariesEnabled: boolean
  runtimeStreamKey: string
  attemptNumber: number
  createdAt: string
  fullPrompt: string
  requestPayload: unknown
  ownerUserId: string | null
  turnNumber?: number
}

export type OpenAiBatchSubmittedItemInput = {
  llmRunId: string
  customId: string
  requestPayloadRedacted: unknown
}

export type OpenAiBatchToPoll = {
  id: string
  llmModelPresetId: string
  providerBatchId: string
  providerStatus: string
}

export type OpenAiBatchItemForReconcile = {
  llmRunId: string
  customId: string
  simulationId: string
  deckId: string
  phase: Extract<LlmRunPhase, "opening_hand" | "turn">
  status: LlmRunStatus
}

export type UpdateLlmRunRequestDataInput = {
  llmRunId: string
  fullPrompt: string
  requestPayload: unknown
}

export type LlmRunMcpFunctionCallStatus = "completed" | "failed"

type LlmRunMcpFunctionCall = {
  id: number
  mcpFunctionName: string
  status: LlmRunMcpFunctionCallStatus
  inputPayload: unknown
  outputPayload: unknown
  calledAt: string
  completedAt: string
}

export type ActiveSimulationLlmRun = {
  simulationId: string
  llmRunId: string
  phase: LlmRunPhase
  runtimeStreamKey: string
  status: LlmRunStatus
}

type OpenRouterGeneration = {
  openrouterTurnIndex: number
  generationId: string
  createdAt: string
}

export type LlmRunMcpTokenPhase = Extract<LlmRunPhase, "opening_hand" | "turn">

export type LlmRunMcpTokenContext = {
  deckId: string
  llmRunId: string
  phase: LlmRunMcpTokenPhase
  simulationId: string
}

export type RecordLlmRunMcpFunctionCallInput = {
  llmRunId: string
  mcpFunctionName: string
  status: LlmRunMcpFunctionCallStatus
  inputPayload: unknown
  outputPayload: unknown
  calledAt?: Date
  completedAt?: Date
}

export type SimulationDebugLlmRun = {
  llmRunId: string
  llmModelPresetId: string | null
  llmModelPresetName: string | null
  processingMode: LlmProcessingMode
  phase: LlmRunPhase
  provider: string
  model: string
  estimatedPriceCents: string | null
  reasoningEffort: string | null
  serviceTier: string | null
  status: LlmRunStatus
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
  openrouterGenerations: OpenRouterGeneration[]
  mcpFunctionCalls: LlmRunMcpFunctionCall[]
}

type SimulationDebugLlmRunMetadata = {
  llmRunId: string
  llmModelPresetId: string | null
  llmModelPresetName: string | null
  processingMode: LlmProcessingMode
  phase: LlmRunPhase
  provider: string
  model: string
  estimatedPriceCents: string | null
  reasoningEffort: string | null
  serviceTier: string | null
  status: LlmRunStatus
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

export type SimulationDebugInfo = Omit<SimulationSummary, "id" | "library"> & {
  simulationId: string
  openingHandLlmRunCount: number
  turnLlmRunCount: number
  openingHandLlmRuns: SimulationDebugLlmRunMetadata[]
  turnLlmRuns: SimulationDebugLlmRunMetadata[]
}

export type SimulationResultsInfo = {
  simulationId: string
  openingHandLlmRunCount: number
  turnLlmRunCount: number
  openingHandLlmRuns: SimulationDebugLlmRun[]
  turnLlmRuns: SimulationDebugLlmRun[]
}

export type StaleInFlightLlmRunCleanupResult = {
  cancelledLlmRunIds: string[]
  cancelledSimulationIds: string[]
}

export const STALE_IN_FLIGHT_LLM_RUN_CANCELLATION_MESSAGE =
  "LLM run was cancelled because the server restarted before the in-flight API request completed."
export const STALE_RUNNING_SIMULATION_CANCELLATION_MESSAGE =
  "Simulation was cancelled because the server restarted before it finished."
export const INVALID_OPENING_HAND_SIMULATION_FAILURE_MESSAGE =
  "Opening-hand LLM run did not produce a valid starting hand."
export const SIMULATION_AUTO_ADVANCE_DISABLED_MESSAGE =
  "Simulation auto-advance is disabled."
export const SIMULATION_AUTO_ADVANCE_NOT_RUNNING_MESSAGE =
  "Simulation auto-advance requires a running simulation."

type SimulationNextStep =
  | {
      type: "opening_hand"
    }
  | {
      type: "turn"
      turnNumber: number
    }

export type SimulationCreationDecision = {
  simulationStatus: SimulationStatus
  nextStep: SimulationNextStep | null
}

export type SimulationCompletionDecision = {
  simulationStatus: SimulationStatus
  nextStep: SimulationNextStep | null
  disableAutoSimulateNextStep: boolean
  failureMessage: string | null
}

export type SimulationLlmCompletionResult = SimulationCompletionDecision & {
  simulationId: string
  deckId: string
}

export type SimulationSummary = {
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

export type LibraryShuffleResult = {
  simulationId: string
  cardsRemaining: number
}

export type LibraryDrawResult = {
  simulationId: string
  cards: string[]
  cardsRemaining: number
}

export type MulliganResult = LibraryDrawResult & {
  reason: string
  mulliganCount: number
  cardsToBottomIfKept: number
  reminder: string
  replacesPreviousOpeningHand: boolean
  alreadyDrewReplacementHand: boolean
}

export type LibraryReturnCardResult = {
  simulationId: string
  card: string
  side: "top" | "bottom"
  position: number
  insertedFromTop: number
  insertedFromBottom: number
  cardsRemaining: number
}

export type LibraryReturnCardsResult = {
  simulationId: string
  cards: string[]
  side: "top" | "bottom"
  randomizeOrder: boolean
  cardsRemaining: number
}

export type LibraryTakeCardsResult = {
  simulationId: string
  requestedCards: string[]
  matches: {
    requestedCard: string
    foundCard: string | null
  }[]
  foundCards: string[]
  cardsRemaining: number
}

const TURN_PHASE_CHANGES = [
  "untap",
  "upkeep",
  "draw",
  "precombat_main",
  "combat",
  "postcombat_main",
  "end_step_cleanup",
] as const

type TurnPhaseChange = (typeof TURN_PHASE_CHANGES)[number]

export type CreateSimulationInput = {
  seed: string
  llmModelPresetId: string | null
  llmProcessingMode?: LlmProcessingMode
  turnsToSimulate: number
  reasoningSummariesEnabled?: boolean
  useFlexServiceTier?: boolean
  forceFlexServiceTier?: boolean
  requireFreeTierModelPreset?: boolean
  startingHandId: string | null
  createdVia?: SimulationCreatedVia
}

export function getSimulationCreationDecision({
  hasPresetStartingHand,
  turnsToSimulate,
}: {
  hasPresetStartingHand: boolean
  turnsToSimulate: number
}): SimulationCreationDecision {
  if (!hasPresetStartingHand) {
    return {
      simulationStatus: "running",
      nextStep: {
        type: "opening_hand",
      },
    }
  }

  if (turnsToSimulate === 0) {
    return {
      simulationStatus: "completed",
      nextStep: null,
    }
  }

  return {
    simulationStatus: "running",
    nextStep: {
      type: "turn",
      turnNumber: 1,
    },
  }
}

export function getOpeningHandCompletionDecision({
  autoSimulateNextStep,
  openingHandIsValid,
  turnsToSimulate,
}: {
  autoSimulateNextStep: boolean
  openingHandIsValid: boolean
  turnsToSimulate: number
}): SimulationCompletionDecision {
  if (!openingHandIsValid) {
    return {
      simulationStatus: "failed",
      nextStep: null,
      disableAutoSimulateNextStep: true,
      failureMessage: INVALID_OPENING_HAND_SIMULATION_FAILURE_MESSAGE,
    }
  }

  if (turnsToSimulate === 0) {
    return {
      simulationStatus: "completed",
      nextStep: null,
      disableAutoSimulateNextStep: false,
      failureMessage: null,
    }
  }

  if (autoSimulateNextStep) {
    return {
      simulationStatus: "running",
      nextStep: {
        type: "turn",
        turnNumber: 1,
      },
      disableAutoSimulateNextStep: false,
      failureMessage: null,
    }
  }

  return {
    simulationStatus: "running",
    nextStep: null,
    disableAutoSimulateNextStep: false,
    failureMessage: null,
  }
}

export function getTurnCompletionDecision({
  autoSimulateNextStep,
  turnNumber,
  turnsToSimulate,
}: {
  autoSimulateNextStep: boolean
  turnNumber: number
  turnsToSimulate: number
}): SimulationCompletionDecision {
  if (turnNumber >= turnsToSimulate) {
    return {
      simulationStatus: "completed",
      nextStep: null,
      disableAutoSimulateNextStep: false,
      failureMessage: null,
    }
  }

  if (autoSimulateNextStep) {
    return {
      simulationStatus: "running",
      nextStep: {
        type: "turn",
        turnNumber: turnNumber + 1,
      },
      disableAutoSimulateNextStep: false,
      failureMessage: null,
    }
  }

  return {
    simulationStatus: "running",
    nextStep: null,
    disableAutoSimulateNextStep: false,
    failureMessage: null,
  }
}

type SimulationPromptCardFace = {
  name: string
  manaCost: string | null
  typeLine: string | null
  oracleText: string | null
  power: string | null
  toughness: string | null
  loyalty: string | null
}

export type SimulationPromptCard = {
  deckCardId: number
  oracleId: string
  name: string
  quantity: number
  zone: "commander" | "library"
  manaCost: string | null
  convertedManaCost: string | null
  typeLine: string | null
  oracleText: string | null
  power: string | null
  toughness: string | null
  loyalty: string | null
  cardFaces: SimulationPromptCardFace[]
}

export type StartingHandSimulationPromptData = {
  simulationId: string
  deckId: string
  mulliganGuidelines: string | null
  commanders: SimulationPromptCard[]
  library: SimulationPromptCard[]
}

export type SimulationIdentifier = {
  simulationId?: string
  llmRunId?: string
}

export type TurnSimulationPromptData = {
  simulationId: string
  deckId: string
  strategyGuidelines: string | null
  commanders: SimulationPromptCard[]
  libraryCards: SimulationPromptCard[]
  library: string[]
  startingHand: string[]
}

export class SimulationValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "SimulationValidationError"
  }
}

export async function ensureSimulationsSchema() {
  await queryDatabase("CREATE EXTENSION IF NOT EXISTS pgcrypto")
  await createEnumType("simulation_status", [
    "pending",
    "unmanaged",
    "running",
    "completed",
    "failed",
    "cancelled",
  ])
  await createEnumType("simulation_created_via", [
    "app",
    "benchmark",
    "external_mcp",
  ])
  await createEnumType("llm_processing_mode", ["realtime", "openai_batch"])
  await createEnumType("llm_run_status", [
    "pending",
    "batch_pending",
    "batch_submitted",
    "streaming",
    "completed",
    "failed",
    "cancel_requested",
    "cancelled",
  ])
  await createEnumType("llm_run_phase", ["opening_hand", "turn", "other"])
  await queryDatabase(`
    DROP TABLE IF EXISTS llm_run_chunk_card_mentions
  `)
  await queryDatabase(`
    DROP TYPE IF EXISTS llm_run_chunk_card_mention_resolution_status
  `)

  await queryDatabase(`
    CREATE TABLE IF NOT EXISTS simulations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

      deck_id uuid NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
      created_via simulation_created_via NOT NULL DEFAULT 'app',
      llm_model_preset_id uuid REFERENCES llm_model_presets(id) ON DELETE RESTRICT,

      seed text NOT NULL,
      random_state bigint NOT NULL,
      turns_to_simulate integer NOT NULL CHECK (turns_to_simulate >= 0),
      llm_processing_mode llm_processing_mode NOT NULL DEFAULT 'realtime',
      starting_hand_id uuid REFERENCES starting_hands(id) ON DELETE SET NULL,
      library jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(library) = 'array'),
      mulligan_count integer NOT NULL DEFAULT 0 CHECK (mulligan_count >= 0),
      has_drawn_starting_hand boolean NOT NULL DEFAULT false,
      auto_simulate_next_step boolean NOT NULL DEFAULT true,
      reasoning_summaries_enabled boolean NOT NULL DEFAULT false,
      use_flex_service_tier boolean NOT NULL DEFAULT false,

      status simulation_status NOT NULL DEFAULT 'pending',
      started_at timestamptz,
      completed_at timestamptz,
      failed_at timestamptz,
      cancel_requested_at timestamptz,
      failure_message text,

      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `)
  await queryDatabase(`
    ALTER TABLE simulations
    ADD COLUMN IF NOT EXISTS llm_processing_mode llm_processing_mode NOT NULL DEFAULT 'realtime'
  `)
  await queryDatabase(`
    ALTER TABLE simulations
    ADD COLUMN IF NOT EXISTS auto_simulate_next_step boolean NOT NULL DEFAULT true
  `)
  await queryDatabase(`
    ALTER TABLE simulations
    ADD COLUMN IF NOT EXISTS reasoning_summaries_enabled boolean NOT NULL DEFAULT false
  `)
  await queryDatabase(`
    ALTER TABLE simulations
    ADD COLUMN IF NOT EXISTS use_flex_service_tier boolean NOT NULL DEFAULT false
  `)
  await queryDatabase(`
    DROP INDEX IF EXISTS simulations_public_id_idx
  `)
  await queryDatabase(`
    ALTER TABLE simulations
    DROP COLUMN IF EXISTS is_public
  `)
  await queryDatabase(`
    ALTER TABLE simulations
    ADD COLUMN IF NOT EXISTS created_via simulation_created_via NOT NULL DEFAULT 'app'
  `)
  await queryDatabase(`
    ALTER TABLE simulations
    ADD COLUMN IF NOT EXISTS llm_model_preset_id uuid REFERENCES llm_model_presets(id) ON DELETE RESTRICT
  `)
  await backfillSimulationFlexServiceTierFromLegacyPresets()
  await dropLegacyLlmModelPresetServiceTier()
  await queryDatabase(`
    UPDATE simulations
    SET status = 'unmanaged',
        updated_at = now()
    WHERE created_via = 'external_mcp'
      AND status = 'pending'
  `)
  await queryDatabase(`
    CREATE TABLE IF NOT EXISTS llm_runs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

      phase llm_run_phase NOT NULL,
      provider text NOT NULL,
      model text NOT NULL,
      openrouter_model_provider text,
      service_tier text,
      reasoning_effort text,
      reasoning_summaries_enabled boolean NOT NULL DEFAULT false,
      llm_model_preset_id uuid REFERENCES llm_model_presets(id) ON DELETE RESTRICT,
      owner_user_id text REFERENCES "user"(id) ON DELETE SET NULL,

      processing_mode llm_processing_mode NOT NULL DEFAULT 'realtime',
      status llm_run_status NOT NULL DEFAULT 'pending',
      runtime_stream_key text UNIQUE,
      queued_at timestamptz,

      full_prompt text NOT NULL DEFAULT '',
      request_payload jsonb NOT NULL DEFAULT '{}',
      final_output_text text,
      raw_response jsonb NOT NULL DEFAULT '{}',
      usage jsonb NOT NULL DEFAULT '{}',
      estimated_cost_usd numeric,
      openrouter_reported_cost_usd numeric,

      started_at timestamptz,
      completed_at timestamptz,
      failed_at timestamptz,
      cancel_requested_at timestamptz,
      cancelled_at timestamptz,
      failure_message text,

      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `)
  await queryDatabase(`
    ALTER TABLE llm_runs
    ADD COLUMN IF NOT EXISTS processing_mode llm_processing_mode NOT NULL DEFAULT 'realtime'
  `)
  await queryDatabase(`
    ALTER TABLE llm_runs
    ADD COLUMN IF NOT EXISTS estimated_cost_usd numeric
  `)
  await queryDatabase(`
    ALTER TABLE llm_runs
    ADD COLUMN IF NOT EXISTS openrouter_reported_cost_usd numeric
  `)
  await queryDatabase(`
    ALTER TABLE llm_runs
    DROP CONSTRAINT IF EXISTS llm_runs_provider_check
  `)
  await queryDatabase(`
    ALTER TABLE llm_runs
    ADD CONSTRAINT llm_runs_provider_check
      CHECK (provider IN ('openai', 'openrouter', 'llamacpp', 'anthropic'))
  `)
  await queryDatabase(`
    ALTER TABLE llm_runs
    DROP CONSTRAINT IF EXISTS llm_runs_costs_nonnegative_check
  `)
  await queryDatabase(`
    ALTER TABLE llm_runs
    ADD CONSTRAINT llm_runs_costs_nonnegative_check
      CHECK (
        (estimated_cost_usd IS NULL OR estimated_cost_usd >= 0)
        AND (openrouter_reported_cost_usd IS NULL OR openrouter_reported_cost_usd >= 0)
      )
  `)
  await queryDatabase(`
    ALTER TABLE llm_runs
    ADD COLUMN IF NOT EXISTS openrouter_model_provider text
  `)
  await queryDatabase(`
    ALTER TABLE llm_runs
    ADD COLUMN IF NOT EXISTS service_tier text
  `)
  await queryDatabase(`
    ALTER TABLE llm_runs
    ADD COLUMN IF NOT EXISTS llm_model_preset_id uuid REFERENCES llm_model_presets(id) ON DELETE RESTRICT
  `)
  await queryDatabase(`
    ALTER TABLE llm_runs
    ALTER COLUMN openrouter_model_provider DROP NOT NULL
  `)
  await queryDatabase(`
    ALTER TABLE llm_runs
    ALTER COLUMN openrouter_model_provider DROP DEFAULT
  `)
  await queryDatabase(`
    UPDATE llm_runs
    SET openrouter_model_provider = NULL
    WHERE provider <> 'openrouter'
  `)
  await queryDatabase(`
    ALTER TABLE llm_runs
    DROP CONSTRAINT IF EXISTS llm_runs_openrouter_model_provider_requires_openrouter_check
  `)
  await queryDatabase(`
    ALTER TABLE llm_runs
    ADD CONSTRAINT llm_runs_openrouter_model_provider_requires_openrouter_check
      CHECK (
        openrouter_model_provider IS NULL
        OR provider = 'openrouter'
      )
  `)
  await queryDatabase(`
    ALTER TABLE llm_runs
    DROP CONSTRAINT IF EXISTS llm_runs_service_tier_provider_check
  `)
  await queryDatabase(`
    ALTER TABLE llm_runs
    ADD CONSTRAINT llm_runs_service_tier_provider_check
      CHECK (
        service_tier IS NULL
        OR (
          provider IN ('openai', 'openrouter')
          AND btrim(service_tier) <> ''
        )
      )
  `)
  await queryDatabase(`
    ALTER TABLE llm_runs
    ADD COLUMN IF NOT EXISTS reasoning_effort text
  `)
  await queryDatabase(`
    ALTER TABLE llm_runs
    ADD COLUMN IF NOT EXISTS reasoning_summaries_enabled boolean NOT NULL DEFAULT false
  `)
  await queryDatabase(`
    ALTER TABLE llm_runs
    ADD COLUMN IF NOT EXISTS owner_user_id text REFERENCES "user"(id) ON DELETE SET NULL
  `)
  await queryDatabase(`
    ALTER TABLE llm_runs
    ADD COLUMN IF NOT EXISTS queued_at timestamptz
  `)
  await queryDatabase(`
    ALTER TABLE llm_runs
    ADD COLUMN IF NOT EXISTS raw_response jsonb NOT NULL DEFAULT '{}'
  `)
  await queryDatabase(`
    ALTER TABLE llm_runs
    ADD COLUMN IF NOT EXISTS final_output_text text
  `)
  await queryDatabase(`
    ALTER TABLE llm_runs
    DROP COLUMN IF EXISTS response_metadata
  `)
  await queryDatabase(`
    ALTER TABLE llm_runs
    ALTER COLUMN reasoning_effort DROP NOT NULL
  `)
  await queryDatabase(`
    ALTER TABLE llm_runs
    ALTER COLUMN reasoning_effort DROP DEFAULT
  `)
  await queryDatabase(`
    ALTER TABLE llm_runs
    DROP COLUMN IF EXISTS provider_run_id
  `)
  await queryDatabase(`
    ALTER TABLE llm_runs
    DROP COLUMN IF EXISTS provider_request_id
  `)
  await queryDatabase(`
    CREATE TABLE IF NOT EXISTS llm_run_openrouter_generations (
      id bigserial PRIMARY KEY,

      llm_run_id uuid NOT NULL REFERENCES llm_runs(id) ON DELETE CASCADE,
      openrouter_turn_index integer NOT NULL CHECK (openrouter_turn_index >= 0),
      generation_id text NOT NULL CHECK (btrim(generation_id) <> ''),

      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),

      UNIQUE (llm_run_id, openrouter_turn_index),
      UNIQUE (generation_id)
    )
  `)
  await queryDatabase(`
    ALTER TABLE llm_run_openrouter_generations
    DROP COLUMN IF EXISTS response_metadata
  `)
  await queryDatabase(`
    CREATE TABLE IF NOT EXISTS llm_run_mcp_function_calls (
      id bigserial PRIMARY KEY,

      llm_run_id uuid NOT NULL REFERENCES llm_runs(id) ON DELETE CASCADE,
      mcp_function_name text NOT NULL,
      status text NOT NULL,
      input_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
      output_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
      called_at timestamptz NOT NULL DEFAULT now(),
      completed_at timestamptz NOT NULL DEFAULT now(),

      CONSTRAINT llm_run_mcp_function_calls_function_name_check
        CHECK (btrim(mcp_function_name) <> ''),
      CONSTRAINT llm_run_mcp_function_calls_status_check
        CHECK (status IN ('completed', 'failed'))
    )
  `)
  await queryDatabase(`
    DROP TABLE IF EXISTS llm_run_chunks
  `)
  await queryDatabase(`
    DROP TYPE IF EXISTS llm_chunk_kind
  `)
  await queryDatabase(`
    CREATE TABLE IF NOT EXISTS openai_batches (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

      llm_model_preset_id uuid NOT NULL REFERENCES llm_model_presets(id) ON DELETE RESTRICT,
      provider_batch_id text UNIQUE,
      input_file_id text,
      output_file_id text,
      error_file_id text,
      provider_status text NOT NULL DEFAULT 'submitted',
      request_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
      raw_batch jsonb NOT NULL DEFAULT '{}'::jsonb,
      failure_message text,

      submitted_at timestamptz,
      completed_at timestamptz,
      failed_at timestamptz,
      cancelled_at timestamptz,
      expired_at timestamptz,

      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `)
  await queryDatabase(`
    CREATE TABLE IF NOT EXISTS openai_batch_items (
      id bigserial PRIMARY KEY,

      openai_batch_id uuid NOT NULL REFERENCES openai_batches(id) ON DELETE CASCADE,
      llm_run_id uuid NOT NULL REFERENCES llm_runs(id) ON DELETE CASCADE,
      custom_id text NOT NULL CHECK (btrim(custom_id) <> ''),
      status text NOT NULL DEFAULT 'submitted',
      request_payload_redacted jsonb NOT NULL DEFAULT '{}'::jsonb,
      output_payload jsonb,
      error_payload jsonb,
      failure_message text,

      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),

      UNIQUE (openai_batch_id, custom_id),
      UNIQUE (llm_run_id)
    )
  `)
  await queryDatabase(`
    CREATE TABLE IF NOT EXISTS simulation_opening_hand_llm_runs (
      simulation_id uuid NOT NULL REFERENCES simulations(id) ON DELETE CASCADE,
      llm_run_id uuid NOT NULL REFERENCES llm_runs(id) ON DELETE CASCADE,
      attempt_number integer NOT NULL CHECK (attempt_number > 0),
      opening_hand jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(opening_hand) = 'array'),
      summary text,
      library_snapshot jsonb CHECK (library_snapshot IS NULL OR jsonb_typeof(library_snapshot) = 'array'),
      opening_hand_is_valid boolean NOT NULL DEFAULT false,
      random_state_snapshot bigint,
      created_at timestamptz NOT NULL DEFAULT now(),

      UNIQUE (simulation_id, attempt_number),
      UNIQUE (llm_run_id)
    )
  `)
  await queryDatabase(`
    ALTER TABLE simulation_opening_hand_llm_runs
    ADD COLUMN IF NOT EXISTS opening_hand_is_valid boolean NOT NULL DEFAULT false
  `)
  await queryDatabase(`
    ALTER TABLE simulation_opening_hand_llm_runs
    ADD COLUMN IF NOT EXISTS summary text
  `)
  await queryDatabase(`
    DROP TABLE IF EXISTS simulation_opening_hand_evaluations
  `)
  await queryDatabase(`
    CREATE TABLE IF NOT EXISTS simulation_turn_llm_runs (
      simulation_id uuid NOT NULL REFERENCES simulations(id) ON DELETE CASCADE,
      llm_run_id uuid NOT NULL REFERENCES llm_runs(id) ON DELETE CASCADE,
      turn_number integer NOT NULL CHECK (turn_number > 0),
      attempt_number integer NOT NULL CHECK (attempt_number > 0),
      game_state jsonb,
      turn_actions jsonb,
      outdated boolean NOT NULL DEFAULT false,
      library_snapshot jsonb CHECK (library_snapshot IS NULL OR jsonb_typeof(library_snapshot) = 'array'),
      random_state_snapshot bigint,
      created_at timestamptz NOT NULL DEFAULT now(),

      UNIQUE (simulation_id, turn_number, attempt_number),
      UNIQUE (llm_run_id)
    )
  `)
  await queryDatabase(`
    ALTER TABLE simulation_turn_llm_runs
    ADD COLUMN IF NOT EXISTS game_state jsonb
  `)
  await queryDatabase(`
    ALTER TABLE simulation_turn_llm_runs
    ADD COLUMN IF NOT EXISTS turn_actions jsonb
  `)
  await ensureSimulationTurnGameStateJsonbColumn()
  await queryDatabase(`
    ALTER TABLE simulation_turn_llm_runs
    DROP CONSTRAINT IF EXISTS simulation_turn_llm_runs_game_state_object_check
  `)
  await queryDatabase(`
    ALTER TABLE simulation_turn_llm_runs
    ADD CONSTRAINT simulation_turn_llm_runs_game_state_object_check
      CHECK (game_state IS NULL OR jsonb_typeof(game_state) = 'object')
  `)
  await queryDatabase(`
    ALTER TABLE simulation_turn_llm_runs
    DROP CONSTRAINT IF EXISTS simulation_turn_llm_runs_turn_actions_object_check
  `)
  await queryDatabase(`
    ALTER TABLE simulation_turn_llm_runs
    ADD CONSTRAINT simulation_turn_llm_runs_turn_actions_object_check
      CHECK (turn_actions IS NULL OR jsonb_typeof(turn_actions) = 'object')
  `)
  await queryDatabase(`
    ALTER TABLE simulation_turn_llm_runs
    ADD COLUMN IF NOT EXISTS outdated boolean NOT NULL DEFAULT false
  `)
  await queryDatabase(`
    DROP TABLE IF EXISTS simulation_turn_actions
  `)
  await queryDatabase(`
    DROP TABLE IF EXISTS simulation_turn_evaluations
  `)
  await queryDatabase(`
    UPDATE llm_runs llm_run
    SET owner_user_id = deck.owner_user_id,
        updated_at = now()
    FROM (
      SELECT simulation_id, llm_run_id
      FROM simulation_opening_hand_llm_runs
      UNION
      SELECT simulation_id, llm_run_id
      FROM simulation_turn_llm_runs
    ) linked_run
    JOIN simulations simulation
      ON simulation.id = linked_run.simulation_id
    JOIN decks deck
      ON deck.id = simulation.deck_id
    WHERE llm_run.id = linked_run.llm_run_id
      AND llm_run.owner_user_id IS NULL
      AND deck.owner_user_id IS NOT NULL
  `)
  await queryDatabase(`
    CREATE TABLE IF NOT EXISTS llm_run_mcp_tokens (
      id bigserial PRIMARY KEY,

      llm_run_id uuid NOT NULL REFERENCES llm_runs(id) ON DELETE CASCADE,
      simulation_id uuid NOT NULL REFERENCES simulations(id) ON DELETE CASCADE,
      deck_id uuid NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
      phase llm_run_phase NOT NULL,
      token_hash text NOT NULL,
      expires_at timestamptz NOT NULL,
      revoked_at timestamptz,

      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),

      CONSTRAINT llm_run_mcp_tokens_phase_check
        CHECK (phase IN ('opening_hand', 'turn')),
      UNIQUE (llm_run_id),
      UNIQUE (token_hash)
    )
  `)

  await queryDatabase(`
    CREATE INDEX IF NOT EXISTS simulations_deck_id_idx
      ON simulations (deck_id)
  `)
  await queryDatabase(`
    CREATE INDEX IF NOT EXISTS simulations_llm_model_preset_id_idx
      ON simulations (llm_model_preset_id)
  `)
  await queryDatabase(`
    CREATE INDEX IF NOT EXISTS simulations_status_idx
      ON simulations (status)
  `)
  await queryDatabase(`
    CREATE INDEX IF NOT EXISTS llm_runs_status_idx
      ON llm_runs (status)
  `)
  await queryDatabase(`
    CREATE INDEX IF NOT EXISTS llm_runs_provider_model_idx
      ON llm_runs (provider, model)
  `)
  await queryDatabase(`
    CREATE INDEX IF NOT EXISTS llm_runs_llm_model_preset_id_idx
      ON llm_runs (llm_model_preset_id)
  `)
  await queryDatabase(`
    CREATE INDEX IF NOT EXISTS llm_runs_queue_idx
      ON llm_runs (status, queued_at, id)
      WHERE status = 'pending' AND processing_mode = 'realtime' AND queued_at IS NOT NULL
  `)
  await queryDatabase(`
    CREATE INDEX IF NOT EXISTS llm_runs_openai_batch_pending_idx
      ON llm_runs (llm_model_preset_id, created_at, id)
      WHERE status = 'batch_pending' AND processing_mode = 'openai_batch'
  `)
  await queryDatabase(`
    CREATE INDEX IF NOT EXISTS llm_runs_streaming_owner_idx
      ON llm_runs (owner_user_id)
      WHERE status = 'streaming'
  `)
  await queryDatabase(`
    CREATE INDEX IF NOT EXISTS llm_run_mcp_tokens_hash_phase_idx
      ON llm_run_mcp_tokens (token_hash, phase)
  `)
  await queryDatabase(`
    CREATE INDEX IF NOT EXISTS llm_run_openrouter_generations_llm_run_id_turn_idx
      ON llm_run_openrouter_generations (llm_run_id, openrouter_turn_index)
  `)
  await queryDatabase(`
    CREATE INDEX IF NOT EXISTS llm_run_mcp_function_calls_llm_run_id_called_at_idx
      ON llm_run_mcp_function_calls (llm_run_id, called_at)
  `)
  await queryDatabase(`
    CREATE INDEX IF NOT EXISTS llm_run_mcp_function_calls_function_name_called_at_idx
      ON llm_run_mcp_function_calls (mcp_function_name, called_at)
  `)
  await queryDatabase(`
    CREATE INDEX IF NOT EXISTS openai_batches_status_idx
      ON openai_batches (provider_status, submitted_at, id)
  `)
  await queryDatabase(`
    CREATE INDEX IF NOT EXISTS openai_batch_items_openai_batch_id_idx
      ON openai_batch_items (openai_batch_id)
  `)
  await queryDatabase(`
    CREATE INDEX IF NOT EXISTS simulation_opening_hand_llm_runs_simulation_id_idx
      ON simulation_opening_hand_llm_runs (simulation_id)
  `)
  await queryDatabase(`
    CREATE INDEX IF NOT EXISTS simulation_turn_llm_runs_simulation_id_turn_number_idx
      ON simulation_turn_llm_runs (simulation_id, turn_number)
  `)
  await dropSimulationReportStorage()
}

async function dropSimulationReportStorage() {
  await queryDatabase(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM pg_type type
        JOIN pg_enum enum_value
          ON enum_value.enumtypid = type.oid
        WHERE type.typname = 'llm_run_phase'
          AND enum_value.enumlabel = 'report'
      ) THEN
        EXECUTE 'DELETE FROM llm_runs WHERE phase = ''report''';
      END IF;
    END $$;
  `)
  await queryDatabase(`
    DROP TABLE IF EXISTS simulation_report_llm_runs
  `)
  await queryDatabase(`
    ALTER TABLE simulations
    DROP COLUMN IF EXISTS auto_generate_report
  `)
  await queryDatabase(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM pg_type type
        JOIN pg_enum enum_value
          ON enum_value.enumtypid = type.oid
        WHERE type.typname = 'llm_run_phase'
          AND enum_value.enumlabel = 'report'
      ) THEN
        ALTER TABLE llm_runs
          ALTER COLUMN phase TYPE text USING phase::text;
        ALTER TABLE llm_run_mcp_tokens
          DROP CONSTRAINT IF EXISTS llm_run_mcp_tokens_phase_check;
        ALTER TABLE llm_run_mcp_tokens
          ALTER COLUMN phase TYPE text USING phase::text;
        DROP TYPE llm_run_phase;
        CREATE TYPE llm_run_phase AS ENUM ('opening_hand', 'turn', 'other');
        ALTER TABLE llm_runs
          ALTER COLUMN phase TYPE llm_run_phase USING phase::llm_run_phase;
        ALTER TABLE llm_run_mcp_tokens
          ALTER COLUMN phase TYPE llm_run_phase USING phase::llm_run_phase;
        ALTER TABLE llm_run_mcp_tokens
          ADD CONSTRAINT llm_run_mcp_tokens_phase_check
          CHECK (phase IN ('opening_hand', 'turn'));
      END IF;
    END $$;
  `)
}

async function backfillSimulationFlexServiceTierFromLegacyPresets() {
  await queryDatabase(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'llm_model_presets'
          AND column_name = 'service_tier'
      ) THEN
        UPDATE simulations simulation
        SET use_flex_service_tier = true,
            updated_at = now()
        FROM llm_model_presets preset
        WHERE simulation.llm_model_preset_id = preset.id
          AND preset.service_tier = 'flex'
          AND simulation.use_flex_service_tier = false;
      END IF;
    END $$;
  `)
}

async function ensureSimulationTurnGameStateJsonbColumn() {
  await queryDatabase(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'simulation_turn_llm_runs'
          AND column_name = 'game_state'
          AND data_type <> 'jsonb'
      ) THEN
        ALTER TABLE simulation_turn_llm_runs
          ALTER COLUMN game_state DROP DEFAULT;
        ALTER TABLE simulation_turn_llm_runs
          ALTER COLUMN game_state TYPE jsonb USING NULL::jsonb;
      END IF;
    END $$;
  `)
}

async function dropLegacyLlmModelPresetServiceTier() {
  await queryDatabase(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'llm_model_presets'
          AND column_name = 'service_tier'
      ) THEN
        ALTER TABLE llm_model_presets
          DROP CONSTRAINT IF EXISTS llm_model_presets_service_tier_provider_check;
        ALTER TABLE llm_model_presets
          DROP COLUMN service_tier;
      END IF;
    END $$;
  `)
}

type SimulationSummaryRow = {
  id: string
  deck_id: string
  created_via: SimulationCreatedVia
  llm_model_preset_id: string | null
  starting_hand_id: string | null
  seed: string
  library: unknown
  turns_to_simulate: number
  llm_processing_mode: LlmProcessingMode
  reasoning_summaries_enabled: boolean
  use_flex_service_tier: boolean
  auto_simulate_next_step: boolean
  simulated_turn_count: number
  completed_llm_run_count: number
  active_llm_run_count: number
  status: SimulationStatus
  created_at: Date
  updated_at: Date
}

const SIMULATION_SUMMARY_COMPLETED_RUN_COUNT_SQL = `
  (
    SELECT COUNT(*)::integer
    FROM simulation_opening_hand_llm_runs opening_run
    JOIN llm_runs llm_run
      ON llm_run.id = opening_run.llm_run_id
    WHERE opening_run.simulation_id = simulations.id
      AND opening_run.attempt_number = (
        SELECT MAX(latest_run.attempt_number)
        FROM simulation_opening_hand_llm_runs latest_run
        WHERE latest_run.simulation_id = opening_run.simulation_id
      )
      AND (
        llm_run.status IN ('pending', 'batch_pending', 'batch_submitted', 'streaming', 'cancel_requested', 'failed', 'cancelled')
        OR (
          llm_run.status = 'completed'
          AND opening_run.opening_hand_is_valid = true
        )
      )
  ) + (
    SELECT COUNT(*)::integer
    FROM simulation_turn_llm_runs turn_run
    JOIN llm_runs llm_run
      ON llm_run.id = turn_run.llm_run_id
    WHERE turn_run.simulation_id = simulations.id
      AND turn_run.outdated = false
      AND (
        llm_run.status IN ('pending', 'batch_pending', 'batch_submitted', 'streaming', 'cancel_requested', 'failed', 'cancelled')
        OR (
          llm_run.status = 'completed'
          AND turn_run.game_state IS NOT NULL
          AND turn_run.turn_actions IS NOT NULL
        )
      )
  )
`

const SIMULATION_SUMMARY_ACTIVE_RUN_COUNT_SQL = `
  (
    SELECT COUNT(*)::integer
    FROM (
      SELECT opening_run.llm_run_id
      FROM simulation_opening_hand_llm_runs opening_run
      JOIN llm_runs llm_run
        ON llm_run.id = opening_run.llm_run_id
      WHERE opening_run.simulation_id = simulations.id
        AND llm_run.status IN ('pending', 'batch_pending', 'batch_submitted', 'streaming', 'cancel_requested')
      UNION ALL
      SELECT turn_run.llm_run_id
      FROM simulation_turn_llm_runs turn_run
      JOIN llm_runs llm_run
        ON llm_run.id = turn_run.llm_run_id
      WHERE turn_run.simulation_id = simulations.id
        AND llm_run.status IN ('pending', 'batch_pending', 'batch_submitted', 'streaming', 'cancel_requested')
    ) active_run
  )
`

const SIMULATION_SUMMARY_SIMULATED_TURN_COUNT_SQL = `
  COALESCE((
    SELECT MAX(turn_run.turn_number)::integer
    FROM simulation_turn_llm_runs turn_run
    WHERE turn_run.simulation_id = simulations.id
      AND turn_run.outdated = false
  ), 0)
`

function mapSimulationSummaryRow(
  simulation: SimulationSummaryRow
): SimulationSummary {
  return {
    id: simulation.id,
    deckId: simulation.deck_id,
    createdVia: simulation.created_via,
    llmModelPresetId: simulation.llm_model_preset_id,
    startingHandId: simulation.starting_hand_id,
    seed: simulation.seed,
    library: parseStringArray(simulation.library),
    turnsToSimulate: simulation.turns_to_simulate,
    llmProcessingMode: simulation.llm_processing_mode,
    reasoningSummariesEnabled: simulation.reasoning_summaries_enabled,
    useFlexServiceTier: simulation.use_flex_service_tier,
    autoSimulateNextStep: simulation.auto_simulate_next_step,
    simulatedTurnCount: simulation.simulated_turn_count,
    completedLlmRunCount: simulation.completed_llm_run_count,
    activeLlmRunCount: simulation.active_llm_run_count,
    status: simulation.status,
    createdAt: simulation.created_at.toISOString(),
    updatedAt: simulation.updated_at.toISOString(),
  }
}

export async function listSimulationsForDeck(
  deckId: string
): Promise<SimulationSummary[]> {
  const result = await queryDatabase<SimulationSummaryRow>(
    `
      SELECT
        id,
        deck_id,
        created_via,
        llm_model_preset_id,
        starting_hand_id,
        seed,
        library,
        turns_to_simulate,
        llm_processing_mode,
        reasoning_summaries_enabled,
        use_flex_service_tier,
        auto_simulate_next_step,
        ${SIMULATION_SUMMARY_SIMULATED_TURN_COUNT_SQL} AS simulated_turn_count,
        ${SIMULATION_SUMMARY_COMPLETED_RUN_COUNT_SQL} AS completed_llm_run_count,
        ${SIMULATION_SUMMARY_ACTIVE_RUN_COUNT_SQL} AS active_llm_run_count,
        status,
        created_at,
        updated_at
      FROM simulations
      WHERE deck_id = $1
        AND created_via IN ('app', 'benchmark')
      ORDER BY created_at DESC
    `,
    [deckId]
  )

  return result.rows.map(mapSimulationSummaryRow)
}

export async function createSimulation(
  deckId: string,
  input: CreateSimulationInput
): Promise<SimulationSummary> {
  const seed = input.seed.trim()
  const createdVia = input.createdVia ?? "app"
  const llmModelPresetId = input.llmModelPresetId?.trim() || null
  let llmProcessingMode = input.llmProcessingMode ?? "realtime"
  let useFlexServiceTier = input.useFlexServiceTier ?? false

  if (!seed) {
    throw new SimulationValidationError("Simulation seed is required.")
  }

  if (
    llmProcessingMode !== "realtime" &&
    llmProcessingMode !== "openai_batch"
  ) {
    throw new SimulationValidationError("LLM processing mode is invalid.")
  }

  if (
    createdVia !== "app" &&
    createdVia !== "benchmark" &&
    createdVia !== "external_mcp"
  ) {
    throw new SimulationValidationError(
      "Simulation creation source is invalid."
    )
  }

  if (!Number.isInteger(input.turnsToSimulate) || input.turnsToSimulate < 0) {
    throw new SimulationValidationError(
      "Turns to simulate must be a non-negative integer."
    )
  }

  if (createdVia === "app" && llmModelPresetId === null) {
    throw new SimulationValidationError("Model preset is required.")
  }

  const deckResult = await queryDatabase("SELECT id FROM decks WHERE id = $1", [
    deckId,
  ])

  if (deckResult.rowCount === 0) {
    throw new SimulationValidationError("Deck not found.")
  }

  if (
    !input.forceFlexServiceTier &&
    llmProcessingMode === "openai_batch" &&
    useFlexServiceTier
  ) {
    throw new SimulationValidationError(
      "Batch processing cannot be combined with the flex service tier."
    )
  }

  if (llmModelPresetId !== null) {
    const presetResult = await queryDatabase<{
      is_free_tier: boolean
      provider: string
      supports_flex: boolean
    }>(
      `
        SELECT is_free_tier, provider, supports_flex
        FROM llm_model_presets
        WHERE id = $1
          AND is_enabled = true
      `,
      [llmModelPresetId]
    )

    if (presetResult.rowCount === 0) {
      throw new SimulationValidationError("Model preset not found or disabled.")
    }

    if (
      input.requireFreeTierModelPreset &&
      !presetResult.rows[0].is_free_tier
    ) {
      throw new SimulationValidationError(
        FREE_TIER_MODEL_PRESET_REQUIRED_MESSAGE
      )
    }

    if (input.forceFlexServiceTier && presetResult.rows[0].supports_flex) {
      llmProcessingMode = "realtime"
      useFlexServiceTier = true
    }

    if (useFlexServiceTier && !presetResult.rows[0].supports_flex) {
      throw new SimulationValidationError(
        "Flex service tier can only be enabled for model presets that support flex."
      )
    }

    if (
      llmProcessingMode === "openai_batch" &&
      presetResult.rows[0].provider !== "openai"
    ) {
      throw new SimulationValidationError(
        "Batch processing can only be enabled for OpenAI model presets."
      )
    }
  } else if (useFlexServiceTier) {
    throw new SimulationValidationError(
      "Flex service tier can only be enabled after selecting a model preset that supports flex."
    )
  } else if (llmProcessingMode === "openai_batch") {
    throw new SimulationValidationError(
      "Batch processing can only be enabled after selecting an OpenAI model preset."
    )
  }

  if (input.startingHandId !== null) {
    const startingHandResult = await queryDatabase(
      `
        SELECT id
        FROM starting_hands
        WHERE id = $1
          AND deck_id = $2
          AND is_enabled = true
      `,
      [input.startingHandId, deckId]
    )

    if (startingHandResult.rowCount === 0) {
      throw new SimulationValidationError(
        "Starting hand does not exist or is disabled for this deck."
      )
    }
  }

  const shuffledLibrary = await createShuffledSimulationLibrary(
    deckId,
    seed,
    input.startingHandId
  )
  const initialStatus = getInitialSimulationStatus(createdVia)

  const result = await queryDatabase<SimulationSummaryRow>(
    `
      INSERT INTO simulations (
        deck_id,
        created_via,
        llm_model_preset_id,
        seed,
        random_state,
        turns_to_simulate,
        llm_processing_mode,
        reasoning_summaries_enabled,
        use_flex_service_tier,
        starting_hand_id,
        library,
        has_drawn_starting_hand,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13)
      RETURNING
        id,
        deck_id,
        created_via,
        llm_model_preset_id,
        starting_hand_id,
        seed,
        library,
        turns_to_simulate,
        llm_processing_mode,
        reasoning_summaries_enabled,
        use_flex_service_tier,
        auto_simulate_next_step,
        0::integer AS simulated_turn_count,
        0::integer AS completed_llm_run_count,
        0::integer AS active_llm_run_count,
        status,
        created_at,
        updated_at
    `,
    [
      deckId,
      createdVia,
      llmModelPresetId,
      seed,
      shuffledLibrary.randomState,
      input.turnsToSimulate,
      llmProcessingMode,
      input.reasoningSummariesEnabled ?? false,
      useFlexServiceTier,
      input.startingHandId,
      JSON.stringify(shuffledLibrary.library),
      input.startingHandId !== null,
      initialStatus,
    ]
  )

  return mapSimulationSummaryRow(result.rows[0])
}

export async function getSimulationSummary(
  deckId: string,
  simulationId: string
): Promise<SimulationSummary | null> {
  const result = await queryDatabase<SimulationSummaryRow>(
    `
      SELECT
        id,
        deck_id,
        created_via,
        llm_model_preset_id,
        starting_hand_id,
        seed,
        library,
        turns_to_simulate,
        llm_processing_mode,
        reasoning_summaries_enabled,
        use_flex_service_tier,
        auto_simulate_next_step,
        ${SIMULATION_SUMMARY_SIMULATED_TURN_COUNT_SQL} AS simulated_turn_count,
        ${SIMULATION_SUMMARY_COMPLETED_RUN_COUNT_SQL} AS completed_llm_run_count,
        ${SIMULATION_SUMMARY_ACTIVE_RUN_COUNT_SQL} AS active_llm_run_count,
        status,
        created_at,
        updated_at
      FROM simulations
      WHERE id = $1
        AND deck_id = $2
    `,
    [simulationId, deckId]
  )
  const simulation = result.rows[0]

  if (!simulation) {
    return null
  }

  return mapSimulationSummaryRow(simulation)
}

export type UpdateSimulationInput = {
  llmModelPresetId?: string
  llmProcessingMode?: LlmProcessingMode
  reasoningSummariesEnabled?: boolean
  useFlexServiceTier?: boolean
  forceFlexServiceTier?: boolean
  requireFreeTierModelPreset?: boolean
}

export async function updateSimulation(
  deckId: string,
  simulationId: string,
  input: UpdateSimulationInput
): Promise<SimulationSummary> {
  const trimmedPresetId = input.llmModelPresetId?.trim()

  if (
    trimmedPresetId === undefined &&
    input.llmProcessingMode === undefined &&
    input.reasoningSummariesEnabled === undefined &&
    input.useFlexServiceTier === undefined &&
    input.forceFlexServiceTier === undefined &&
    input.requireFreeTierModelPreset === undefined
  ) {
    throw new SimulationValidationError("Simulation update is required.")
  }

  if (input.llmModelPresetId !== undefined && !trimmedPresetId) {
    throw new SimulationValidationError("Model preset is required.")
  }

  if (
    !input.forceFlexServiceTier &&
    input.llmProcessingMode === "openai_batch" &&
    input.useFlexServiceTier === true
  ) {
    throw new SimulationValidationError(
      "Batch processing cannot be combined with the flex service tier."
    )
  }

  return withDatabaseTransaction(async (client) => {
    const currentSimulationResult = await client.query<{
      llm_model_preset_id: string | null
      llm_processing_mode: LlmProcessingMode
      status: SimulationStatus
      use_flex_service_tier: boolean
    }>(
      `
        SELECT
          llm_model_preset_id,
          llm_processing_mode,
          status,
          use_flex_service_tier
        FROM simulations
        WHERE id = $1
          AND deck_id = $2
        FOR UPDATE
      `,
      [simulationId, deckId]
    )
    const currentSimulation = currentSimulationResult.rows[0]

    if (!currentSimulation) {
      throw new SimulationValidationError("Simulation not found.")
    }

    let nextProcessingMode =
      input.llmProcessingMode ?? currentSimulation.llm_processing_mode
    let nextUseFlexServiceTier =
      input.useFlexServiceTier ?? currentSimulation.use_flex_service_tier

    if (input.useFlexServiceTier === true) {
      nextProcessingMode = "realtime"
    }

    if (nextProcessingMode === "openai_batch") {
      nextUseFlexServiceTier = false
    }

    const targetPresetId =
      trimmedPresetId ?? currentSimulation.llm_model_preset_id

    if (nextUseFlexServiceTier || nextProcessingMode === "openai_batch") {
      if (!targetPresetId) {
        throw new SimulationValidationError(
          nextProcessingMode === "openai_batch"
            ? "Batch processing can only be enabled after selecting an OpenAI model preset."
            : "Flex service tier can only be enabled after selecting a model preset that supports flex."
        )
      }
    }

    if (
      trimmedPresetId !== undefined ||
      nextUseFlexServiceTier ||
      nextProcessingMode === "openai_batch" ||
      (input.forceFlexServiceTier && targetPresetId !== null) ||
      (input.requireFreeTierModelPreset && targetPresetId !== null)
    ) {
      if (!targetPresetId) {
        throw new SimulationValidationError("Model preset is required.")
      }

      const presetResult = await client.query<{
        is_free_tier: boolean
        provider: string
        supports_flex: boolean
      }>(
        `
          SELECT is_free_tier, provider, supports_flex
          FROM llm_model_presets
          WHERE id = $1
            AND is_enabled = true
        `,
        [targetPresetId]
      )

      if (presetResult.rowCount === 0) {
        throw new SimulationValidationError(
          trimmedPresetId !== undefined
            ? "Model preset not found or disabled."
            : nextProcessingMode === "openai_batch"
              ? "Batch processing can only be enabled for an enabled OpenAI model preset."
              : "Flex service tier can only be enabled for an enabled model preset that supports flex."
        )
      }

      const targetPreset = presetResult.rows[0]
      const isFreeTierPreset = targetPreset.is_free_tier
      const supportsFlex = targetPreset.supports_flex

      if (input.requireFreeTierModelPreset && !isFreeTierPreset) {
        throw new SimulationValidationError(
          FREE_TIER_MODEL_PRESET_REQUIRED_MESSAGE
        )
      }

      if (
        input.forceFlexServiceTier &&
        supportsFlex &&
        (input.useFlexServiceTier === false ||
          input.llmProcessingMode === "openai_batch")
      ) {
        throw new SimulationValidationError(
          "Free tier users must enable flex processing before starting LLM runs."
        )
      }

      if (
        nextProcessingMode === "openai_batch" &&
        targetPreset.provider !== "openai"
      ) {
        throw new SimulationValidationError(
          "Batch simulations can only use OpenAI model presets."
        )
      }

      if (
        trimmedPresetId !== undefined &&
        !supportsFlex &&
        input.useFlexServiceTier !== true
      ) {
        nextUseFlexServiceTier = false
      }

      if (nextUseFlexServiceTier && !supportsFlex) {
        throw new SimulationValidationError(
          "Flex service tier can only be enabled for model presets that support flex."
        )
      }
    }

    if (
      nextProcessingMode !== currentSimulation.llm_processing_mode ||
      nextUseFlexServiceTier !== currentSimulation.use_flex_service_tier
    ) {
      if (currentSimulation.status === "running") {
        throw new SimulationValidationError(
          "Processing options cannot be changed while the simulation is running."
        )
      }

      await assertNoActiveSimulationLlmRuns(client, simulationId)
    }

    const result = await client.query<SimulationSummaryRow>(
      `
        UPDATE simulations
        SET llm_model_preset_id = COALESCE($3, llm_model_preset_id),
            reasoning_summaries_enabled = COALESCE($4, reasoning_summaries_enabled),
            use_flex_service_tier = $5,
            llm_processing_mode = $6,
            updated_at = now()
        WHERE id = $1
          AND deck_id = $2
        RETURNING
          id,
          deck_id,
          created_via,
          llm_model_preset_id,
          starting_hand_id,
          seed,
          library,
          turns_to_simulate,
          llm_processing_mode,
          reasoning_summaries_enabled,
          use_flex_service_tier,
          auto_simulate_next_step,
          ${SIMULATION_SUMMARY_SIMULATED_TURN_COUNT_SQL} AS simulated_turn_count,
          ${SIMULATION_SUMMARY_COMPLETED_RUN_COUNT_SQL} AS completed_llm_run_count,
          ${SIMULATION_SUMMARY_ACTIVE_RUN_COUNT_SQL} AS active_llm_run_count,
          status,
          created_at,
          updated_at
      `,
      [
        simulationId,
        deckId,
        trimmedPresetId ?? null,
        input.reasoningSummariesEnabled ?? null,
        nextUseFlexServiceTier,
        nextProcessingMode,
      ]
    )
    const simulation = result.rows[0]

    if (!simulation) {
      throw new SimulationValidationError("Simulation not found.")
    }

    return mapSimulationSummaryRow(simulation)
  })
}

export async function disableSimulationAutoAdvance(
  deckId: string,
  simulationId: string
): Promise<SimulationSummary> {
  const result = await queryDatabase<SimulationSummaryRow>(
    `
      UPDATE simulations
      SET auto_simulate_next_step = false,
          updated_at = now()
      WHERE id = $1
        AND deck_id = $2
      RETURNING
        id,
        deck_id,
        created_via,
        llm_model_preset_id,
        starting_hand_id,
        seed,
        library,
        turns_to_simulate,
        llm_processing_mode,
        reasoning_summaries_enabled,
        use_flex_service_tier,
        auto_simulate_next_step,
        ${SIMULATION_SUMMARY_SIMULATED_TURN_COUNT_SQL} AS simulated_turn_count,
        ${SIMULATION_SUMMARY_COMPLETED_RUN_COUNT_SQL} AS completed_llm_run_count,
        ${SIMULATION_SUMMARY_ACTIVE_RUN_COUNT_SQL} AS active_llm_run_count,
        status,
        created_at,
        updated_at
    `,
    [simulationId, deckId]
  )
  const simulation = result.rows[0]

  if (!simulation) {
    throw new SimulationValidationError("Simulation not found.")
  }

  return mapSimulationSummaryRow(simulation)
}

export async function markSimulationCompleted(simulationId: string) {
  await withDatabaseTransaction(async (client) => {
    await markSimulationCompletedWithClient(client, simulationId)
  })
}

export async function markSimulationFailed(
  simulationId: string,
  failureMessage: string
) {
  await withDatabaseTransaction(async (client) => {
    await markSimulationFailedWithClient(client, simulationId, failureMessage)
  })
}

export async function markSimulationCancelled(
  simulationId: string,
  failureMessage?: string
) {
  await withDatabaseTransaction(async (client) => {
    await markSimulationCancelledWithClient(
      client,
      simulationId,
      failureMessage
    )
  })
}

export async function shuffleSimulationLibrary(
  simulationId: string
): Promise<LibraryShuffleResult> {
  return withDatabaseTransaction(async (client) => {
    const result = await client.query<{
      library: unknown
      random_state: string
    }>(
      `
        SELECT
          library,
          random_state
        FROM simulations
        WHERE id = $1
        FOR UPDATE
      `,
      [simulationId]
    )

    if (result.rowCount === 0) {
      throw new SimulationValidationError("Simulation not found.")
    }

    const simulation = result.rows[0]
    const library = parseStringArray(simulation.library)
    const shuffleResult = shuffleWithRandomState(
      library,
      Number(simulation.random_state)
    )

    await client.query(
      `
        UPDATE simulations
        SET library = $2::jsonb,
            random_state = $3,
            updated_at = now()
        WHERE id = $1
      `,
      [
        simulationId,
        JSON.stringify(shuffleResult.items),
        shuffleResult.randomState,
      ]
    )

    return {
      simulationId,
      cardsRemaining: shuffleResult.items.length,
    }
  })
}

export async function drawCardsFromTop(
  simulationId: string,
  count: number
): Promise<LibraryDrawResult> {
  assertPositiveInteger(count, "Draw count")

  return withDatabaseTransaction(async (client) => {
    const simulation = await getLockedLibrarySimulation(client, simulationId)
    const library = parseStringArray(simulation.library)
    const cards = library.slice(0, count)
    const remainingLibrary = library.slice(cards.length)

    await updateSimulationLibrary(client, simulationId, remainingLibrary)

    return {
      simulationId,
      cards,
      cardsRemaining: remainingLibrary.length,
    }
  })
}

export async function drawCardsFromBottom(
  simulationId: string,
  count: number
): Promise<LibraryDrawResult> {
  assertPositiveInteger(count, "Draw count")

  return withDatabaseTransaction(async (client) => {
    const simulation = await getLockedLibrarySimulation(client, simulationId)
    const library = parseStringArray(simulation.library)
    const cardsToDraw = Math.min(count, library.length)
    const remainingLibrary = library.slice(0, library.length - cardsToDraw)
    const cards = library.slice(remainingLibrary.length).reverse()

    await updateSimulationLibrary(client, simulationId, remainingLibrary)

    return {
      simulationId,
      cards,
      cardsRemaining: remainingLibrary.length,
    }
  })
}

export async function drawStartingHand(
  simulationId: string
): Promise<LibraryDrawResult> {
  return withDatabaseTransaction(async (client) => {
    const simulation = await getLockedLibrarySimulation(client, simulationId)

    assertSimulationDoesNotHavePresetStartingHand(simulation)

    if (simulation.has_drawn_starting_hand) {
      throw new SimulationValidationError(
        "Starting hand has already been drawn for this simulation."
      )
    }

    const shuffledLibrary = await rebuildAndShuffleSimulationLibrary(
      client,
      simulation.deck_id,
      simulation.seed,
      1
    )
    const cards = shuffledLibrary.library.slice(0, 7)
    const remainingLibrary = shuffledLibrary.library.slice(cards.length)

    await client.query(
      `
        UPDATE simulations
        SET library = $2::jsonb,
            random_state = $3,
            mulligan_count = 0,
            has_drawn_starting_hand = true,
            updated_at = now()
        WHERE id = $1
      `,
      [
        simulationId,
        JSON.stringify(remainingLibrary),
        shuffledLibrary.randomState,
      ]
    )

    return {
      simulationId,
      cards,
      cardsRemaining: remainingLibrary.length,
    }
  })
}

export async function mulliganSimulation(
  simulationId: string,
  reason: string
): Promise<MulliganResult> {
  const trimmedReason = reason.trim()

  if (!trimmedReason) {
    throw new SimulationValidationError("Mulligan reason is required.")
  }

  return withDatabaseTransaction(async (client) => {
    const simulation = await getLockedLibrarySimulation(client, simulationId)

    assertSimulationDoesNotHavePresetStartingHand(simulation)

    if (!simulation.has_drawn_starting_hand) {
      throw new SimulationValidationError(
        "Draw a starting hand before taking a mulligan."
      )
    }

    const mulliganCount = simulation.mulligan_count + 1
    const shuffledLibrary = await rebuildAndShuffleSimulationLibrary(
      client,
      simulation.deck_id,
      simulation.seed,
      mulliganCount + 1
    )
    const cards = shuffledLibrary.library.slice(0, 7)
    const remainingLibrary = shuffledLibrary.library.slice(cards.length)

    await client.query(
      `
        UPDATE simulations
        SET library = $2::jsonb,
            random_state = $3,
            mulligan_count = $4,
            updated_at = now()
        WHERE id = $1
      `,
      [
        simulationId,
        JSON.stringify(remainingLibrary),
        shuffledLibrary.randomState,
        mulliganCount,
      ]
    )

    const cardsToBottomIfKept = Math.max(0, mulliganCount - 1)

    return {
      simulationId,
      reason: trimmedReason,
      cards,
      cardsRemaining: remainingLibrary.length,
      mulliganCount,
      cardsToBottomIfKept,
      reminder:
        cardsToBottomIfKept > 0
          ? `If you keep this hand, put ${cardsToBottomIfKept} card(s) on the bottom.`
          : "This mulligan is free; no cards need to be bottomed if you keep this hand.",
      replacesPreviousOpeningHand: true,
      alreadyDrewReplacementHand: true,
    }
  })
}

export async function returnCardToSimulationLibrary({
  card,
  position,
  side,
  simulationId,
}: {
  simulationId: string
  card: string
  side: "top" | "bottom"
  position: number
}): Promise<LibraryReturnCardResult> {
  const trimmedCard = card.trim()

  if (!trimmedCard) {
    throw new SimulationValidationError("Returned card name is required.")
  }

  if (!Number.isInteger(position) || position < 0) {
    throw new SimulationValidationError(
      "Return position must be a non-negative integer."
    )
  }

  return withDatabaseTransaction(async (client) => {
    const simulation = await getLockedLibrarySimulation(client, simulationId)
    const library = parseStringArray(simulation.library)
    const resolvedPosition = Math.min(position, library.length)
    const insertIndex =
      side === "top" ? resolvedPosition : library.length - resolvedPosition
    const updatedLibrary = [
      ...library.slice(0, insertIndex),
      trimmedCard,
      ...library.slice(insertIndex),
    ]

    await updateSimulationLibrary(client, simulationId, updatedLibrary)

    return {
      simulationId,
      card: trimmedCard,
      side,
      position,
      insertedFromTop: insertIndex,
      insertedFromBottom: library.length - insertIndex,
      cardsRemaining: updatedLibrary.length,
    }
  })
}

export async function returnCardsToSimulationLibrary({
  cards,
  randomizeOrder,
  side,
  simulationId,
}: {
  simulationId: string
  cards: readonly string[]
  side: "top" | "bottom"
  randomizeOrder: boolean
}): Promise<LibraryReturnCardsResult> {
  const trimmedCards = cards.map((card) => card.trim())

  if (trimmedCards.length === 0 || trimmedCards.some((card) => !card)) {
    throw new SimulationValidationError(
      "Returned cards must include at least one card name."
    )
  }

  return withDatabaseTransaction(async (client) => {
    const simulation = await getLockedLibrarySimulation(client, simulationId)
    const library = parseStringArray(simulation.library)
    let cardsToReturn = trimmedCards
    let randomState = Number(simulation.random_state)

    if (randomizeOrder) {
      const shuffleResult = shuffleWithRandomState(cardsToReturn, randomState)
      cardsToReturn = shuffleResult.items
      randomState = shuffleResult.randomState
    }

    const updatedLibrary =
      side === "top"
        ? [...cardsToReturn].reverse().concat(library)
        : library.concat(cardsToReturn)

    await client.query(
      `
        UPDATE simulations
        SET library = $2::jsonb,
            random_state = $3,
            updated_at = now()
        WHERE id = $1
      `,
      [simulationId, JSON.stringify(updatedLibrary), randomState]
    )

    return {
      simulationId,
      cards: cardsToReturn,
      side,
      randomizeOrder,
      cardsRemaining: updatedLibrary.length,
    }
  })
}

export async function takeCardsFromSimulationLibrary(
  simulationId: string,
  cards: readonly string[]
): Promise<LibraryTakeCardsResult> {
  const requestedCards = cards.map((card) => card.trim())

  if (requestedCards.length === 0 || requestedCards.some((card) => !card)) {
    throw new SimulationValidationError(
      "Requested cards must include at least one card name."
    )
  }

  return withDatabaseTransaction(async (client) => {
    const simulation = await getLockedLibrarySimulation(client, simulationId)
    const library = parseStringArray(simulation.library)
    const matches: LibraryTakeCardsResult["matches"] = []
    const foundCards: string[] = []

    for (const requestedCard of requestedCards) {
      const matchIndex = findBestLibraryCardMatchIndex(library, requestedCard)

      if (matchIndex === -1) {
        matches.push({
          requestedCard,
          foundCard: null,
        })
        continue
      }

      const foundCard = library[matchIndex]
      library.splice(matchIndex, 1)
      matches.push({
        requestedCard,
        foundCard,
      })
      foundCards.push(foundCard)
    }

    await updateSimulationLibrary(client, simulationId, library)

    return {
      simulationId,
      requestedCards,
      matches,
      foundCards,
      cardsRemaining: library.length,
    }
  })
}

export async function createOpeningHandLlmRun(
  deckId: string,
  input: CreateOpeningHandLlmRunInput
): Promise<OpeningHandLlmRun> {
  return withDatabaseTransaction(async (client) => {
    const simulationResult = await client.query<{
      id: string
      starting_hand_id: string | null
      reasoning_summaries_enabled: boolean
      owner_user_id: string | null
    }>(
      `
        SELECT
          simulation.id,
          simulation.starting_hand_id,
          simulation.reasoning_summaries_enabled,
          deck.owner_user_id
        FROM simulations simulation
        JOIN decks deck
          ON deck.id = simulation.deck_id
        WHERE simulation.id = $1
          AND simulation.deck_id = $2
        FOR UPDATE
      `,
      [input.simulationId, deckId]
    )

    if (simulationResult.rowCount === 0) {
      throw new SimulationValidationError("Simulation not found.")
    }

    if (simulationResult.rows[0].starting_hand_id !== null) {
      throw new SimulationValidationError(
        "This simulation uses a preset starting hand, so opening-hand LLM runs are not allowed."
      )
    }

    await assertNoActiveSimulationLlmRuns(client, input.simulationId)

    const attemptResult = await client.query<{ attempt_number: number }>(
      `
        SELECT COALESCE(MAX(attempt_number), 0) + 1 AS attempt_number
        FROM simulation_opening_hand_llm_runs
        WHERE simulation_id = $1
      `,
      [input.simulationId]
    )
    const attemptNumber = Number(attemptResult.rows[0].attempt_number)
    const openrouterModelProvider = getPersistableOpenRouterModelProvider(input)
    const initialRunStatus: LlmRunStatus =
      input.processingMode === "openai_batch" ? "batch_pending" : "pending"
    const llmRunResult = await client.query<{
      id: string
      status: LlmRunStatus
      runtime_stream_key: string
      created_at: Date
    }>(
      `
        INSERT INTO llm_runs (
          phase,
          llm_model_preset_id,
          provider,
          model,
          openrouter_model_provider,
          service_tier,
          reasoning_effort,
          reasoning_summaries_enabled,
          owner_user_id,
          processing_mode,
          status,
          runtime_stream_key,
          full_prompt,
          request_payload
        )
        VALUES (
          'opening_hand',
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          $12,
          $13::jsonb
        )
        RETURNING id, status, runtime_stream_key, created_at
      `,
      [
        input.llmModelPresetId,
        input.provider,
        input.model,
        openrouterModelProvider,
        input.serviceTier,
        input.reasoningEffort,
        simulationResult.rows[0].reasoning_summaries_enabled,
        simulationResult.rows[0].owner_user_id,
        input.processingMode,
        initialRunStatus,
        input.runtimeStreamKey,
        input.fullPrompt,
        JSON.stringify(input.requestPayload),
      ]
    )
    const llmRun = llmRunResult.rows[0]

    await client.query(
      `
        INSERT INTO simulation_opening_hand_llm_runs (
          simulation_id,
          llm_run_id,
          attempt_number
        )
        VALUES ($1, $2, $3)
      `,
      [input.simulationId, llmRun.id, attemptNumber]
    )

    await markSimulationRunningWithClient(client, input.simulationId)

    return {
      simulationId: input.simulationId,
      llmRunId: llmRun.id,
      attemptNumber,
      reasoningSummariesEnabled:
        simulationResult.rows[0].reasoning_summaries_enabled,
      runtimeStreamKey: llmRun.runtime_stream_key,
      status: llmRun.status,
      createdAt: llmRun.created_at.toISOString(),
    }
  })
}

export async function resetSimulationForOpeningHandLlmRun(
  deckId: string,
  simulationId: string
) {
  await withDatabaseTransaction(async (client) => {
    const simulationResult = await client.query<{
      deck_id: string
      seed: string
      starting_hand_id: string | null
    }>(
      `
        SELECT
          deck_id,
          seed,
          starting_hand_id
        FROM simulations
        WHERE id = $1
          AND deck_id = $2
        FOR UPDATE
      `,
      [simulationId, deckId]
    )

    if (simulationResult.rowCount === 0) {
      throw new SimulationValidationError("Simulation not found.")
    }

    const simulation = simulationResult.rows[0]

    if (simulation.starting_hand_id !== null) {
      throw new SimulationValidationError(
        "This simulation uses a preset starting hand, so opening-hand LLM runs are not allowed."
      )
    }

    await assertNoActiveSimulationLlmRuns(client, simulationId)

    const shuffledLibrary = await rebuildAndShuffleSimulationLibrary(
      client,
      simulation.deck_id,
      simulation.seed,
      1
    )

    await client.query(
      `
        UPDATE simulations
        SET library = $2::jsonb,
            random_state = $3,
            mulligan_count = 0,
            has_drawn_starting_hand = false,
            updated_at = now()
        WHERE id = $1
      `,
      [
        simulationId,
        JSON.stringify(shuffledLibrary.library),
        shuffledLibrary.randomState,
      ]
    )

    await client.query(
      `
        UPDATE simulation_turn_llm_runs
        SET outdated = true
        WHERE simulation_id = $1
      `,
      [simulationId]
    )
  })
}

export async function createTurnLlmRun(
  deckId: string,
  input: CreateTurnLlmRunInput
): Promise<PreparedTurnLlmRun> {
  assertPositiveInteger(input.turnNumber, "Turn number")

  return withDatabaseTransaction(async (client) => {
    const simulationResult = await client.query<{
      id: string
      deck_id: string
      seed: string
      starting_hand_id: string | null
      status: SimulationStatus
      auto_simulate_next_step: boolean
      reasoning_summaries_enabled: boolean
      owner_user_id: string | null
    }>(
      `
        SELECT
          simulation.id,
          simulation.deck_id,
          simulation.seed,
          simulation.starting_hand_id,
          simulation.status,
          simulation.auto_simulate_next_step,
          simulation.reasoning_summaries_enabled,
          deck.owner_user_id
        FROM simulations simulation
        JOIN decks deck
          ON deck.id = simulation.deck_id
        WHERE simulation.id = $1
          AND simulation.deck_id = $2
        FOR UPDATE
      `,
      [input.simulationId, deckId]
    )

    if (simulationResult.rowCount === 0) {
      throw new SimulationValidationError("Simulation not found.")
    }

    const simulation = simulationResult.rows[0]

    if (
      input.requireAutoSimulateNextStep &&
      !simulation.auto_simulate_next_step
    ) {
      throw new SimulationValidationError(
        SIMULATION_AUTO_ADVANCE_DISABLED_MESSAGE
      )
    }

    if (input.requireAutoSimulateNextStep && simulation.status !== "running") {
      throw new SimulationValidationError(
        SIMULATION_AUTO_ADVANCE_NOT_RUNNING_MESSAGE
      )
    }

    await assertNoActiveSimulationLlmRuns(client, input.simulationId)

    const previousGameState = await resetSimulationForTurnLlmRun(
      client,
      simulation,
      input.turnNumber
    )

    await client.query(
      `
        UPDATE simulation_turn_llm_runs
        SET outdated = true
        WHERE simulation_id = $1
          AND turn_number >= $2
      `,
      [input.simulationId, input.turnNumber]
    )

    const attemptResult = await client.query<{ attempt_number: number }>(
      `
        SELECT COALESCE(MAX(attempt_number), 0) + 1 AS attempt_number
        FROM simulation_turn_llm_runs
        WHERE simulation_id = $1
          AND turn_number = $2
      `,
      [input.simulationId, input.turnNumber]
    )
    const attemptNumber = Number(attemptResult.rows[0].attempt_number)
    const openrouterModelProvider = getPersistableOpenRouterModelProvider(input)
    const initialRunStatus: LlmRunStatus =
      input.processingMode === "openai_batch" ? "batch_pending" : "pending"
    const llmRunResult = await client.query<{
      id: string
      status: LlmRunStatus
      runtime_stream_key: string
      created_at: Date
    }>(
      `
        INSERT INTO llm_runs (
          phase,
          llm_model_preset_id,
          provider,
          model,
          openrouter_model_provider,
          service_tier,
          reasoning_effort,
          reasoning_summaries_enabled,
          owner_user_id,
          processing_mode,
          status,
          runtime_stream_key
        )
        VALUES (
          'turn',
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11
        )
        RETURNING id, status, runtime_stream_key, created_at
      `,
      [
        input.llmModelPresetId,
        input.provider,
        input.model,
        openrouterModelProvider,
        input.serviceTier,
        input.reasoningEffort,
        simulation.reasoning_summaries_enabled,
        simulation.owner_user_id,
        input.processingMode,
        initialRunStatus,
        input.runtimeStreamKey,
      ]
    )
    const llmRun = llmRunResult.rows[0]

    await client.query(
      `
        INSERT INTO simulation_turn_llm_runs (
          simulation_id,
          llm_run_id,
          turn_number,
          attempt_number
        )
        VALUES ($1, $2, $3, $4)
      `,
      [input.simulationId, llmRun.id, input.turnNumber, attemptNumber]
    )

    await markSimulationRunningWithClient(client, input.simulationId)

    return {
      simulationId: input.simulationId,
      llmRunId: llmRun.id,
      turnNumber: input.turnNumber,
      attemptNumber,
      reasoningSummariesEnabled: simulation.reasoning_summaries_enabled,
      runtimeStreamKey: llmRun.runtime_stream_key,
      status: llmRun.status,
      createdAt: llmRun.created_at.toISOString(),
      previousGameState,
    }
  })
}

export async function updateLlmRunRequestData({
  fullPrompt,
  llmRunId,
  requestPayload,
}: UpdateLlmRunRequestDataInput) {
  const result = await queryDatabase(
    `
      UPDATE llm_runs
      SET full_prompt = $2,
          request_payload = $3::jsonb,
          updated_at = now()
      WHERE id = $1
    `,
    [llmRunId, fullPrompt, JSON.stringify(requestPayload)]
  )

  if (result.rowCount === 0) {
    throw new SimulationValidationError("LLM run not found.")
  }
}

export async function markLlmRunQueued(llmRunId: string) {
  const result = await queryDatabase(
    `
      UPDATE llm_runs
      SET queued_at = COALESCE(queued_at, now()),
          updated_at = now()
      WHERE id = $1
        AND status = 'pending'
        AND processing_mode = 'realtime'
      RETURNING id
    `,
    [llmRunId]
  )

  return (result.rowCount ?? 0) > 0
}

export async function listPendingOpenAiBatchRuns({
  maxConcurrentRuns,
}: {
  maxConcurrentRuns: number
}): Promise<OpenAiBatchPendingRun[]> {
  const result = await queryDatabase<{
    simulation_id: string
    deck_id: string
    llm_run_id: string
    llm_model_preset_id: string
    phase: Extract<LlmRunPhase, "opening_hand" | "turn">
    provider: string
    model: string
    openrouter_model_provider: string | null
    service_tier: string | null
    reasoning_effort: string | null
    reasoning_summaries_enabled: boolean
    runtime_stream_key: string
    attempt_number: number
    created_at: Date
    full_prompt: string
    request_payload: unknown
    owner_user_id: string | null
    turn_number: number | null
  }>(
    `
      WITH linked_run AS (
        SELECT
          opening_run.simulation_id,
          simulation.deck_id,
          opening_run.llm_run_id,
          opening_run.attempt_number,
          NULL::integer AS turn_number
        FROM simulation_opening_hand_llm_runs opening_run
        JOIN simulations simulation
          ON simulation.id = opening_run.simulation_id
        UNION ALL
        SELECT
          turn_run.simulation_id,
          simulation.deck_id,
          turn_run.llm_run_id,
          turn_run.attempt_number,
          turn_run.turn_number
        FROM simulation_turn_llm_runs turn_run
        JOIN simulations simulation
          ON simulation.id = turn_run.simulation_id
      )
      SELECT
        linked_run.simulation_id,
        linked_run.deck_id,
        llm_run.id AS llm_run_id,
        llm_run.llm_model_preset_id,
        llm_run.phase,
        llm_run.provider,
        llm_run.model,
        llm_run.openrouter_model_provider,
        llm_run.service_tier,
        llm_run.reasoning_effort,
        llm_run.reasoning_summaries_enabled,
        llm_run.runtime_stream_key,
        linked_run.attempt_number,
        llm_run.created_at,
        llm_run.full_prompt,
        llm_run.request_payload,
        llm_run.owner_user_id,
        linked_run.turn_number
      FROM llm_runs llm_run
      JOIN linked_run
        ON linked_run.llm_run_id = llm_run.id
      WHERE llm_run.status = 'batch_pending'
        AND llm_run.processing_mode = 'openai_batch'
        AND llm_run.provider = 'openai'
        AND llm_run.llm_model_preset_id IS NOT NULL
        AND llm_run.runtime_stream_key IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM openai_batch_items item
          WHERE item.llm_run_id = llm_run.id
        )
        AND (
          SELECT COUNT(*)::integer
          FROM llm_runs active_run
          WHERE active_run.status IN ('streaming', 'batch_submitted')
        ) < $1::integer
        AND (
          SELECT COUNT(*)::integer
          FROM llm_runs active_run
          WHERE active_run.status IN ('streaming', 'batch_submitted')
            AND active_run.owner_user_id IS NOT DISTINCT FROM llm_run.owner_user_id
        ) < ${getLlmRunOwnerConcurrencyLimitSql()}
      ORDER BY llm_run.llm_model_preset_id ASC, llm_run.created_at ASC, llm_run.id ASC
    `,
    [
      maxConcurrentRuns,
      BILLING_TIER_LIMITS.free.maxConcurrentLlmRuns,
      BILLING_TIER_LIMITS.plus.maxConcurrentLlmRuns,
      BILLING_TIER_LIMITS.pro.maxConcurrentLlmRuns,
      BILLING_TIER_LIMITS.super_max.maxConcurrentLlmRuns,
    ]
  )

  return result.rows.map((row) => {
    const run: OpenAiBatchPendingRun = {
      simulationId: row.simulation_id,
      deckId: row.deck_id,
      llmRunId: row.llm_run_id,
      llmModelPresetId: row.llm_model_preset_id,
      phase: row.phase,
      provider: row.provider,
      model: row.model,
      openrouterModelProvider: row.openrouter_model_provider,
      serviceTier: row.service_tier,
      reasoningEffort: row.reasoning_effort,
      reasoningSummariesEnabled: row.reasoning_summaries_enabled,
      runtimeStreamKey: row.runtime_stream_key,
      attemptNumber: row.attempt_number,
      createdAt: row.created_at.toISOString(),
      fullPrompt: row.full_prompt,
      requestPayload: row.request_payload,
      ownerUserId: row.owner_user_id,
    }

    if (row.turn_number !== null) {
      run.turnNumber = row.turn_number
    }

    return run
  })
}

export async function recordOpenAiBatchSubmitted({
  errorFileId,
  inputFileId,
  items,
  llmModelPresetId,
  outputFileId,
  providerBatchId,
  providerStatus,
  rawBatch,
  requestCounts,
}: {
  llmModelPresetId: string
  providerBatchId: string
  inputFileId: string | null
  outputFileId: string | null
  errorFileId: string | null
  providerStatus: string
  requestCounts: unknown
  rawBatch: unknown
  items: OpenAiBatchSubmittedItemInput[]
}): Promise<string> {
  return withDatabaseTransaction(async (client) => {
    const batchResult = await client.query<{ id: string }>(
      `
        INSERT INTO openai_batches (
          llm_model_preset_id,
          provider_batch_id,
          input_file_id,
          output_file_id,
          error_file_id,
          provider_status,
          request_counts,
          raw_batch,
          submitted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, now())
        RETURNING id
      `,
      [
        llmModelPresetId,
        providerBatchId,
        inputFileId,
        outputFileId,
        errorFileId,
        providerStatus,
        getRequiredJsonbQueryValue(requestCounts),
        getRequiredJsonbQueryValue(rawBatch),
      ]
    )
    const openAiBatchId = batchResult.rows[0].id

    for (const item of items) {
      await client.query(
        `
          INSERT INTO openai_batch_items (
            openai_batch_id,
            llm_run_id,
            custom_id,
            request_payload_redacted
          )
          VALUES ($1, $2, $3, $4::jsonb)
          ON CONFLICT (llm_run_id)
          DO NOTHING
        `,
        [
          openAiBatchId,
          item.llmRunId,
          item.customId,
          getRequiredJsonbQueryValue(item.requestPayloadRedacted),
        ]
      )
    }

    await client.query(
      `
        UPDATE llm_runs
        SET status = 'batch_submitted',
            started_at = COALESCE(started_at, now()),
            updated_at = now()
        WHERE id = ANY($1::uuid[])
          AND status = 'batch_pending'
          AND processing_mode = 'openai_batch'
      `,
      [items.map((item) => item.llmRunId)]
    )

    return openAiBatchId
  })
}

export async function listOpenAiBatchesToPoll(): Promise<OpenAiBatchToPoll[]> {
  const result = await queryDatabase<{
    id: string
    llm_model_preset_id: string
    provider_batch_id: string
    provider_status: string
  }>(
    `
      SELECT id, llm_model_preset_id, provider_batch_id, provider_status
      FROM openai_batches
      WHERE provider_batch_id IS NOT NULL
        AND (
          provider_status NOT IN ('completed', 'failed', 'expired', 'cancelled')
          OR EXISTS (
            SELECT 1
            FROM openai_batch_items item
            JOIN llm_runs run
              ON run.id = item.llm_run_id
            WHERE item.openai_batch_id = openai_batches.id
              AND item.status = 'submitted'
              AND run.status = 'batch_submitted'
          )
        )
      ORDER BY submitted_at ASC NULLS LAST, created_at ASC
    `
  )

  return result.rows.map((row) => ({
    id: row.id,
    llmModelPresetId: row.llm_model_preset_id,
    providerBatchId: row.provider_batch_id,
    providerStatus: row.provider_status,
  }))
}

export async function updateOpenAiBatchProviderState({
  errorFileId,
  failureMessage,
  inputFileId,
  openAiBatchId,
  outputFileId,
  providerStatus,
  rawBatch,
  requestCounts,
}: {
  openAiBatchId: string
  providerStatus: string
  inputFileId: string | null
  outputFileId: string | null
  errorFileId: string | null
  requestCounts: unknown
  rawBatch: unknown
  failureMessage?: string | null
}) {
  await queryDatabase(
    `
      UPDATE openai_batches
      SET provider_status = $2,
          input_file_id = COALESCE($3, input_file_id),
          output_file_id = COALESCE($4, output_file_id),
          error_file_id = COALESCE($5, error_file_id),
          request_counts = $6::jsonb,
          raw_batch = $7::jsonb,
          failure_message = COALESCE($8, failure_message),
          completed_at = CASE WHEN $2 = 'completed' THEN COALESCE(completed_at, now()) ELSE completed_at END,
          failed_at = CASE WHEN $2 = 'failed' THEN COALESCE(failed_at, now()) ELSE failed_at END,
          cancelled_at = CASE WHEN $2 = 'cancelled' THEN COALESCE(cancelled_at, now()) ELSE cancelled_at END,
          expired_at = CASE WHEN $2 = 'expired' THEN COALESCE(expired_at, now()) ELSE expired_at END,
          updated_at = now()
      WHERE id = $1
    `,
    [
      openAiBatchId,
      providerStatus,
      inputFileId,
      outputFileId,
      errorFileId,
      getRequiredJsonbQueryValue(requestCounts),
      getRequiredJsonbQueryValue(rawBatch),
      failureMessage ?? null,
    ]
  )
}

export async function listOpenAiBatchItemsForReconcile(
  openAiBatchId: string
): Promise<OpenAiBatchItemForReconcile[]> {
  const result = await queryDatabase<{
    llm_run_id: string
    custom_id: string
    simulation_id: string
    deck_id: string
    phase: Extract<LlmRunPhase, "opening_hand" | "turn">
    status: LlmRunStatus
  }>(
    `
      SELECT
        item.llm_run_id,
        item.custom_id,
        COALESCE(opening_run.simulation_id, turn_run.simulation_id) AS simulation_id,
        simulation.deck_id,
        llm_run.phase,
        llm_run.status
      FROM openai_batch_items item
      JOIN llm_runs llm_run
        ON llm_run.id = item.llm_run_id
      LEFT JOIN simulation_opening_hand_llm_runs opening_run
        ON opening_run.llm_run_id = item.llm_run_id
      LEFT JOIN simulation_turn_llm_runs turn_run
        ON turn_run.llm_run_id = item.llm_run_id
      JOIN simulations simulation
        ON simulation.id = COALESCE(opening_run.simulation_id, turn_run.simulation_id)
      WHERE item.openai_batch_id = $1
        AND llm_run.phase IN ('opening_hand', 'turn')
      ORDER BY item.id ASC
    `,
    [openAiBatchId]
  )

  return result.rows.map((row) => ({
    llmRunId: row.llm_run_id,
    customId: row.custom_id,
    simulationId: row.simulation_id,
    deckId: row.deck_id,
    phase: row.phase,
    status: row.status,
  }))
}

export async function recordOpenAiBatchItemOutput({
  customId,
  openAiBatchId,
  outputPayload,
}: {
  openAiBatchId: string
  customId: string
  outputPayload: unknown
}) {
  await queryDatabase(
    `
      UPDATE openai_batch_items
      SET status = 'completed',
          output_payload = $3::jsonb,
          updated_at = now()
      WHERE openai_batch_id = $1
        AND custom_id = $2
    `,
    [openAiBatchId, customId, getRequiredJsonbQueryValue(outputPayload)]
  )
}

export async function recordOpenAiBatchItemError({
  customId,
  errorPayload,
  failureMessage,
  openAiBatchId,
}: {
  openAiBatchId: string
  customId: string
  errorPayload: unknown
  failureMessage: string
}) {
  await queryDatabase(
    `
      UPDATE openai_batch_items
      SET status = 'failed',
          error_payload = $3::jsonb,
          failure_message = $4,
          updated_at = now()
      WHERE openai_batch_id = $1
        AND custom_id = $2
    `,
    [
      openAiBatchId,
      customId,
      getRequiredJsonbQueryValue(errorPayload),
      failureMessage,
    ]
  )
}

export async function createLlmRunMcpToken({
  deckId,
  expiresAt,
  llmRunId,
  phase,
  simulationId,
  tokenHash,
}: LlmRunMcpTokenContext & {
  expiresAt: Date
  tokenHash: string
}) {
  await queryDatabase(
    `
      INSERT INTO llm_run_mcp_tokens (
        llm_run_id,
        simulation_id,
        deck_id,
        phase,
        token_hash,
        expires_at
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (llm_run_id)
      DO UPDATE SET
        token_hash = EXCLUDED.token_hash,
        phase = EXCLUDED.phase,
        expires_at = EXCLUDED.expires_at,
        revoked_at = NULL,
        updated_at = now()
    `,
    [llmRunId, simulationId, deckId, phase, tokenHash, expiresAt]
  )
}

export async function getActiveLlmRunMcpTokenContext({
  phase,
  tokenHash,
}: {
  phase: LlmRunMcpTokenPhase
  tokenHash: string
}): Promise<LlmRunMcpTokenContext | null> {
  const result = await queryDatabase<{
    deck_id: string
    llm_run_id: string
    phase: LlmRunMcpTokenPhase
    simulation_id: string
  }>(
    `
      SELECT
        token.deck_id,
        token.llm_run_id,
        token.phase,
        token.simulation_id
      FROM llm_run_mcp_tokens token
      JOIN llm_runs run
        ON run.id = token.llm_run_id
      WHERE token.token_hash = $1
        AND token.phase = $2
        AND token.revoked_at IS NULL
        AND token.expires_at > now()
        AND run.status IN ('pending', 'batch_submitted', 'streaming')
    `,
    [tokenHash, phase]
  )
  const token = result.rows[0]

  if (!token) {
    return null
  }

  return {
    deckId: token.deck_id,
    llmRunId: token.llm_run_id,
    phase: token.phase,
    simulationId: token.simulation_id,
  }
}

export async function revokeLlmRunMcpToken(llmRunId: string) {
  await queryDatabase(
    `
      UPDATE llm_run_mcp_tokens
      SET
        revoked_at = COALESCE(revoked_at, now()),
        updated_at = now()
      WHERE llm_run_id = $1
    `,
    [llmRunId]
  )
}

export async function recordLlmRunMcpFunctionCall(
  input: RecordLlmRunMcpFunctionCallInput
) {
  const query = buildRecordLlmRunMcpFunctionCallQuery(input)

  await queryDatabase(query.text, query.values)
}

export function buildRecordLlmRunMcpFunctionCallQuery(
  input: RecordLlmRunMcpFunctionCallInput
) {
  const calledAt = input.calledAt ?? new Date()
  const completedAt = input.completedAt ?? new Date()

  return {
    text: `
      INSERT INTO llm_run_mcp_function_calls (
        llm_run_id,
        mcp_function_name,
        status,
        input_payload,
        output_payload,
        called_at,
        completed_at
      )
      VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7)
    `,
    values: [
      input.llmRunId,
      input.mcpFunctionName,
      input.status,
      getRequiredJsonbQueryValue(input.inputPayload),
      getRequiredJsonbQueryValue(input.outputPayload),
      calledAt,
      completedAt,
    ],
  }
}

function getRequiredJsonbQueryValue(value: unknown | null | undefined) {
  return value === null || value === undefined ? "{}" : JSON.stringify(value)
}

const LLM_RUN_QUEUE_ADVISORY_LOCK_ID = 836_417_052

export function getLlmRunOwnerConcurrencyLimitSql() {
  return `(
    CASE
      WHEN EXISTS (
        SELECT 1
        FROM admin_subscription_tier_grants active_admin_grant
        WHERE active_admin_grant.user_id = llm_run.owner_user_id
          AND active_admin_grant.revoked_at IS NULL
          AND active_admin_grant.expires_at > now()
          AND active_admin_grant.tier = 'super_max'
      ) THEN $5::integer
      WHEN EXISTS (
        SELECT 1
        FROM "subscription" active_subscription
        WHERE active_subscription."referenceId" = llm_run.owner_user_id
          AND active_subscription.status IN ('active', 'trialing')
          AND lower(active_subscription.plan) = 'pro'
      ) OR EXISTS (
        SELECT 1
        FROM admin_subscription_tier_grants active_admin_grant
        WHERE active_admin_grant.user_id = llm_run.owner_user_id
          AND active_admin_grant.revoked_at IS NULL
          AND active_admin_grant.expires_at > now()
          AND active_admin_grant.tier = 'pro'
      ) THEN $4::integer
      WHEN EXISTS (
        SELECT 1
        FROM "subscription" active_subscription
        WHERE active_subscription."referenceId" = llm_run.owner_user_id
          AND active_subscription.status IN ('active', 'trialing')
          AND lower(active_subscription.plan) = 'plus'
      ) OR EXISTS (
        SELECT 1
        FROM admin_subscription_tier_grants active_admin_grant
        WHERE active_admin_grant.user_id = llm_run.owner_user_id
          AND active_admin_grant.revoked_at IS NULL
          AND active_admin_grant.expires_at > now()
          AND active_admin_grant.tier = 'plus'
      ) THEN $3::integer
      ELSE $2::integer
    END
  )`
}

export async function claimNextQueuedLlmRun({
  maxConcurrentRuns,
}: {
  maxConcurrentRuns: number
}): Promise<LlmRunQueueClaimResult | null> {
  return withDatabaseTransaction(async (client) => {
    const lockResult = await client.query<{ acquired: boolean }>(
      "SELECT pg_try_advisory_xact_lock($1) AS acquired",
      [LLM_RUN_QUEUE_ADVISORY_LOCK_ID]
    )

    if (!lockResult.rows[0]?.acquired) {
      return null
    }

    const result = await client.query<{
      simulation_id: string
      deck_id: string
      llm_run_id: string
      llm_model_preset_id: string | null
      phase: Extract<LlmRunPhase, "opening_hand" | "turn">
      provider: string
      model: string
      openrouter_model_provider: string | null
      service_tier: string | null
      reasoning_effort: string | null
      reasoning_summaries_enabled: boolean
      runtime_stream_key: string
      attempt_number: number
      created_at: Date
      full_prompt: string
      request_payload: unknown
      turn_number: number | null
      owner_user_id: string | null
    }>(
      `
        WITH linked_run AS (
          SELECT
            opening_run.simulation_id,
            simulation.deck_id,
            opening_run.llm_run_id,
            opening_run.attempt_number,
            NULL::integer AS turn_number
          FROM simulation_opening_hand_llm_runs opening_run
          JOIN simulations simulation
            ON simulation.id = opening_run.simulation_id
          UNION ALL
          SELECT
            turn_run.simulation_id,
            simulation.deck_id,
            turn_run.llm_run_id,
            turn_run.attempt_number,
            turn_run.turn_number
          FROM simulation_turn_llm_runs turn_run
          JOIN simulations simulation
            ON simulation.id = turn_run.simulation_id
        ),
        candidate AS (
          SELECT
            llm_run.id,
            linked_run.simulation_id,
            linked_run.deck_id,
            linked_run.attempt_number,
            linked_run.turn_number
          FROM llm_runs llm_run
          JOIN linked_run
            ON linked_run.llm_run_id = llm_run.id
          WHERE llm_run.status = 'pending'
            AND llm_run.processing_mode = 'realtime'
            AND llm_run.queued_at IS NOT NULL
            AND (
              SELECT COUNT(*)::integer
              FROM llm_runs active_run
              WHERE active_run.status = 'streaming'
            ) < $1::integer
            AND (
              SELECT COUNT(*)::integer
              FROM llm_runs active_run
              WHERE active_run.status = 'streaming'
                AND active_run.owner_user_id IS NOT DISTINCT FROM llm_run.owner_user_id
            ) < ${getLlmRunOwnerConcurrencyLimitSql()}
          ORDER BY llm_run.queued_at ASC, llm_run.id ASC
          LIMIT 1
          FOR UPDATE OF llm_run SKIP LOCKED
        )
        SELECT
          candidate.simulation_id,
          candidate.deck_id,
          llm_run.id AS llm_run_id,
          llm_run.llm_model_preset_id,
          llm_run.phase,
          llm_run.provider,
          llm_run.model,
          llm_run.openrouter_model_provider,
          llm_run.service_tier,
          llm_run.reasoning_effort,
          llm_run.reasoning_summaries_enabled,
          llm_run.runtime_stream_key,
          candidate.attempt_number,
          llm_run.created_at,
          llm_run.full_prompt,
          llm_run.request_payload,
          candidate.turn_number,
          llm_run.owner_user_id
        FROM candidate
        JOIN llm_runs llm_run
          ON llm_run.id = candidate.id
      `,
      [
        maxConcurrentRuns,
        BILLING_TIER_LIMITS.free.maxConcurrentLlmRuns,
        BILLING_TIER_LIMITS.plus.maxConcurrentLlmRuns,
        BILLING_TIER_LIMITS.pro.maxConcurrentLlmRuns,
        BILLING_TIER_LIMITS.super_max.maxConcurrentLlmRuns,
      ]
    )
    const run = result.rows[0]

    if (!run) {
      return null
    }

    const claimStartedAtResult = await client.query<{ claim_started_at: Date }>(
      "SELECT clock_timestamp() AS claim_started_at"
    )
    const claimStartedAt = claimStartedAtResult.rows[0]?.claim_started_at

    if (!claimStartedAt) {
      throw new Error("Failed to resolve LLM run claim timestamp.")
    }

    if (run.owner_user_id !== null) {
      const usageDecision =
        await ensureUserUsageLimitWindowsForRunStartWithClient(
          client,
          run.owner_user_id,
          claimStartedAt
        )

      if (!usageDecision.allowed) {
        const failRunQuery = buildFailQueuedLlmRunUsageLimitQuery(
          run.llm_run_id,
          USAGE_LIMIT_OUT_OF_USAGE_MESSAGE
        )
        await client.query(failRunQuery.text, failRunQuery.values)

        await client.query(
          `
            UPDATE simulations
            SET status = 'failed',
                auto_simulate_next_step = false,
                failed_at = now(),
                failure_message = $2,
                updated_at = now()
            WHERE id = $1
              AND status NOT IN ('completed', 'cancelled')
          `,
          [run.simulation_id, USAGE_LIMIT_OUT_OF_USAGE_MESSAGE]
        )

        return {
          usageLimitExceeded: true,
          simulationId: run.simulation_id,
          deckId: run.deck_id,
          llmRunId: run.llm_run_id,
          phase: run.phase,
          failureMessage: USAGE_LIMIT_OUT_OF_USAGE_MESSAGE,
        }
      }
    }

    const claimRunQuery = buildClaimQueuedLlmRunStartQuery(
      run.llm_run_id,
      claimStartedAt
    )
    const claimedResult = await client.query<{
      started_at: Date
    }>(claimRunQuery.text, claimRunQuery.values)
    const claimed = claimedResult.rows[0]

    if (!claimed) {
      return null
    }

    const claimedRun: ClaimedQueuedLlmRun = {
      simulationId: run.simulation_id,
      deckId: run.deck_id,
      llmRunId: run.llm_run_id,
      llmModelPresetId: run.llm_model_preset_id,
      phase: run.phase,
      provider: run.provider,
      model: run.model,
      openrouterModelProvider: run.openrouter_model_provider,
      serviceTier: run.service_tier,
      reasoningEffort: run.reasoning_effort,
      reasoningSummariesEnabled: run.reasoning_summaries_enabled,
      runtimeStreamKey: run.runtime_stream_key,
      attemptNumber: run.attempt_number,
      createdAt: run.created_at.toISOString(),
      startedAt: claimed.started_at.toISOString(),
      fullPrompt: run.full_prompt,
      requestPayload: run.request_payload,
      ownerUserId: run.owner_user_id,
    }

    if (run.turn_number !== null) {
      claimedRun.turnNumber = run.turn_number
    }

    return claimedRun
  })
}

export function buildClaimQueuedLlmRunStartQuery(
  llmRunId: string,
  startedAt: Date
) {
  return {
    text: `
      UPDATE llm_runs llm_run
      SET status = 'streaming',
          started_at = COALESCE(started_at, $2::timestamptz),
          estimated_cost_usd = ${getRunningLlmRunInitialCostSql()},
          updated_at = $2::timestamptz
      WHERE llm_run.id = $1
        AND llm_run.status = 'pending'
        AND llm_run.processing_mode = 'realtime'
      RETURNING started_at
    `,
    values: [llmRunId, startedAt],
  }
}

function getRunningLlmRunInitialCostSql() {
  return `(
            SELECT CASE
              WHEN COALESCE(
                CASE
                  WHEN llm_run.provider = 'anthropic'
                  THEN preset.cache_write_input_token_cost_usd_per_million
                  ELSE NULL
                END,
                preset.cached_input_token_cost_usd_per_million
              ) IS NOT NULL
                AND COALESCE(
                  CASE
                    WHEN llm_run.provider = 'anthropic'
                    THEN preset.cache_write_input_token_cost_usd_per_million
                    ELSE NULL
                  END,
                  preset.cached_input_token_cost_usd_per_million
                ) >= 0
              THEN
                (length(llm_run.full_prompt)::numeric / 4) *
                COALESCE(
                  CASE
                    WHEN llm_run.provider = 'anthropic'
                    THEN preset.cache_write_input_token_cost_usd_per_million
                    ELSE NULL
                  END,
                  preset.cached_input_token_cost_usd_per_million
                ) /
                1000000 *
                ${getLlmRunEstimatedCostServiceTierMultiplierSql()}
              ELSE NULL
            END
            FROM llm_model_presets preset
            WHERE preset.id = llm_run.llm_model_preset_id
          )`
}

function getLlmRunEstimatedCostServiceTierMultiplierSql() {
  return `(CASE WHEN llm_run.service_tier = 'flex' THEN 0.5 ELSE 1 END)`
}

export function buildFailQueuedLlmRunUsageLimitQuery(
  llmRunId: string,
  failureMessage: string
) {
  return {
    text: `
      UPDATE llm_runs
      SET status = 'failed',
          estimated_cost_usd = NULL,
          openrouter_reported_cost_usd = NULL,
          failed_at = now(),
          failure_message = $2,
          updated_at = now()
      WHERE id = $1
        AND status = 'pending'
        AND processing_mode = 'realtime'
      RETURNING id
    `,
    values: [llmRunId, failureMessage],
  }
}

export function buildCompleteLlmRunQuery({
  estimatedCostUsd,
  finalOutputText,
  llmRunId,
  openrouterReportedCostUsd,
  rawResponse,
  usage,
}: {
  llmRunId: string
  usage: unknown
  estimatedCostUsd: number | null
  openrouterReportedCostUsd: number | null
  rawResponse: unknown
  finalOutputText: string
}) {
  return {
    text: `
      UPDATE llm_runs
      SET status = 'completed',
          usage = $2::jsonb,
          estimated_cost_usd = $3,
          openrouter_reported_cost_usd = $4,
          raw_response = $5::jsonb,
          final_output_text = $6,
          completed_at = now(),
          updated_at = now()
      WHERE id = $1
        AND status IN ('pending', 'batch_submitted', 'streaming')
    `,
    values: [
      llmRunId,
      JSON.stringify(usage),
      estimatedCostUsd,
      openrouterReportedCostUsd,
      JSON.stringify(rawResponse ?? {}),
      finalOutputText,
    ],
  }
}

export function buildFailLlmRunQuery(
  llmRunId: string,
  failureMessage: string,
  estimatedCostUsd: number | null,
  finalOutputText?: string
) {
  return {
    text: `
      UPDATE llm_runs
      SET status = 'failed',
          estimated_cost_usd = $3,
          final_output_text = $4,
          failed_at = now(),
          failure_message = $2,
          updated_at = now()
      WHERE id = $1
        AND status IN ('pending', 'batch_pending', 'batch_submitted', 'streaming')
    `,
    values: [
      llmRunId,
      failureMessage,
      estimatedCostUsd,
      finalOutputText ?? null,
    ],
  }
}

export function buildCancelLlmRunQuery(
  llmRunId: string,
  failureMessage: string | null,
  estimatedCostUsd: number | null,
  finalOutputText?: string
) {
  return {
    text: `
      UPDATE llm_runs
      SET status = 'cancelled',
          estimated_cost_usd = $3,
          final_output_text = $4,
          cancelled_at = now(),
          failure_message = COALESCE($2, failure_message),
          updated_at = now()
      WHERE id = $1
        AND status IN ('pending', 'batch_pending', 'streaming', 'cancel_requested')
    `,
    values: [
      llmRunId,
      failureMessage,
      estimatedCostUsd,
      finalOutputText ?? null,
    ],
  }
}

export async function isLlmRunActive(llmRunId: string) {
  const result = await queryDatabase(
    `
      SELECT 1
      FROM llm_runs
      WHERE id = $1
        AND status = 'streaming'
      LIMIT 1
    `,
    [llmRunId]
  )

  return (result.rowCount ?? 0) > 0
}

export async function completeOpeningHandLlmRun({
  finalOutputText,
  llmRunId,
  openingHand,
  rawResponse,
  summary,
  usage,
}: {
  finalOutputText: string
  llmRunId: string
  openingHand: readonly string[]
  rawResponse: unknown
  summary: string
  usage: unknown
}): Promise<SimulationLlmCompletionResult> {
  return withDatabaseTransaction(async (client) => {
    const snapshotResult = await client.query<{
      simulation_id: string
      deck_id: string
      llm_run_status: LlmRunStatus
      provider: string
      processing_mode: LlmProcessingMode
      service_tier: string | null
      input_token_cost_usd_per_million: string | number | null
      cached_input_token_cost_usd_per_million: string | number | null
      cache_write_input_token_cost_usd_per_million: string | number | null
      output_token_cost_usd_per_million: string | number | null
      library: unknown
      random_state: string
      mulligan_count: number
      turns_to_simulate: number
      auto_simulate_next_step: boolean
      deck_library_card_count: number
    }>(
      `
        SELECT
          simulation.id AS simulation_id,
          simulation.deck_id,
          llm_run.status AS llm_run_status,
          llm_run.provider,
          llm_run.processing_mode,
          llm_run.service_tier,
          preset.input_token_cost_usd_per_million,
          preset.cached_input_token_cost_usd_per_million,
          preset.cache_write_input_token_cost_usd_per_million,
          preset.output_token_cost_usd_per_million,
          simulation.library,
          simulation.random_state,
          simulation.mulligan_count,
          simulation.turns_to_simulate,
          simulation.auto_simulate_next_step,
          COALESCE(deck_counts.library_card_count, 0)::integer AS deck_library_card_count
        FROM simulation_opening_hand_llm_runs opening_run
        JOIN llm_runs llm_run
          ON llm_run.id = opening_run.llm_run_id
        LEFT JOIN llm_model_presets preset
          ON preset.id = llm_run.llm_model_preset_id
        JOIN simulations simulation
          ON simulation.id = opening_run.simulation_id
        LEFT JOIN (
          SELECT deck_id, SUM(quantity)::integer AS library_card_count
          FROM deck_cards
          WHERE zone = 'library'
          GROUP BY deck_id
        ) deck_counts
          ON deck_counts.deck_id = simulation.deck_id
        WHERE opening_run.llm_run_id = $1
        FOR UPDATE OF llm_run
      `,
      [llmRunId]
    )

    if (snapshotResult.rowCount === 0) {
      throw new SimulationValidationError("Opening-hand LLM run not found.")
    }

    const snapshot = snapshotResult.rows[0]
    const costValues = getCompletedLlmRunCostValues(snapshot, usage)

    if (!canApplyLateLlmRunTerminalUpdate(snapshot.llm_run_status)) {
      throw new SimulationValidationError("LLM run is no longer active.")
    }

    const librarySnapshot = parseStringArray(snapshot.library)
    const openingHandIsValid = isValidCompletedOpeningHand({
      deckLibraryCardCount: Number(snapshot.deck_library_card_count),
      librarySnapshot,
      mulliganCount: snapshot.mulligan_count,
      openingHand,
    })

    await client.query(
      `
        UPDATE simulation_opening_hand_llm_runs
        SET opening_hand = $2::jsonb,
            library_snapshot = $3::jsonb,
            random_state_snapshot = $4,
            opening_hand_is_valid = $5,
            summary = $6
        WHERE llm_run_id = $1
      `,
      [
        llmRunId,
        JSON.stringify(openingHand),
        JSON.stringify(librarySnapshot),
        snapshot.random_state,
        openingHandIsValid,
        summary,
      ]
    )

    const completeRunQuery = buildCompleteLlmRunQuery({
      estimatedCostUsd: costValues.estimatedCostUsd,
      finalOutputText,
      llmRunId,
      openrouterReportedCostUsd: costValues.openrouterReportedCostUsd,
      rawResponse,
      usage,
    })
    await client.query(completeRunQuery.text, completeRunQuery.values)

    const decision = getOpeningHandCompletionDecision({
      autoSimulateNextStep: snapshot.auto_simulate_next_step,
      openingHandIsValid,
      turnsToSimulate: snapshot.turns_to_simulate,
    })

    await applySimulationCompletionDecisionWithClient(
      client,
      snapshot.simulation_id,
      decision
    )

    return {
      simulationId: snapshot.simulation_id,
      deckId: snapshot.deck_id,
      ...decision,
    }
  })
}

export async function completeTurnLlmRun({
  finalOutputText,
  gameState,
  llmRunId,
  rawResponse,
  turnActions,
  usage,
}: {
  finalOutputText: string
  llmRunId: string
  gameState: unknown
  rawResponse: unknown
  turnActions: unknown
  usage: unknown
}): Promise<SimulationLlmCompletionResult> {
  return withDatabaseTransaction(async (client) => {
    const snapshotResult = await client.query<{
      simulation_id: string
      deck_id: string
      llm_run_status: LlmRunStatus
      provider: string
      processing_mode: LlmProcessingMode
      service_tier: string | null
      input_token_cost_usd_per_million: string | number | null
      cached_input_token_cost_usd_per_million: string | number | null
      cache_write_input_token_cost_usd_per_million: string | number | null
      output_token_cost_usd_per_million: string | number | null
      turn_number: number
      library: unknown
      random_state: string
      turns_to_simulate: number
      auto_simulate_next_step: boolean
    }>(
      `
        SELECT
          simulation.id AS simulation_id,
          simulation.deck_id,
          llm_run.status AS llm_run_status,
          llm_run.provider,
          llm_run.processing_mode,
          llm_run.service_tier,
          preset.input_token_cost_usd_per_million,
          preset.cached_input_token_cost_usd_per_million,
          preset.cache_write_input_token_cost_usd_per_million,
          preset.output_token_cost_usd_per_million,
          turn_run.turn_number,
          simulation.library,
          simulation.random_state,
          simulation.turns_to_simulate,
          simulation.auto_simulate_next_step
        FROM simulation_turn_llm_runs turn_run
        JOIN llm_runs llm_run
          ON llm_run.id = turn_run.llm_run_id
        LEFT JOIN llm_model_presets preset
          ON preset.id = llm_run.llm_model_preset_id
        JOIN simulations simulation
          ON simulation.id = turn_run.simulation_id
        WHERE turn_run.llm_run_id = $1
        FOR UPDATE OF llm_run
      `,
      [llmRunId]
    )

    if (snapshotResult.rowCount === 0) {
      throw new SimulationValidationError("Turn LLM run not found.")
    }

    const snapshot = snapshotResult.rows[0]
    const costValues = getCompletedLlmRunCostValues(snapshot, usage)

    if (!canApplyLateLlmRunTerminalUpdate(snapshot.llm_run_status)) {
      throw new SimulationValidationError("LLM run is no longer active.")
    }

    const librarySnapshot = parseStringArray(snapshot.library)

    await client.query(
      `
        UPDATE simulation_turn_llm_runs
        SET game_state = $2::jsonb,
            turn_actions = $3::jsonb,
            library_snapshot = $4::jsonb,
            random_state_snapshot = $5
        WHERE llm_run_id = $1
      `,
      [
        llmRunId,
        JSON.stringify(gameState),
        JSON.stringify(turnActions),
        JSON.stringify(librarySnapshot),
        snapshot.random_state,
      ]
    )

    const completeRunQuery = buildCompleteLlmRunQuery({
      estimatedCostUsd: costValues.estimatedCostUsd,
      finalOutputText,
      llmRunId,
      openrouterReportedCostUsd: costValues.openrouterReportedCostUsd,
      rawResponse,
      usage,
    })
    await client.query(completeRunQuery.text, completeRunQuery.values)

    const decision = getTurnCompletionDecision({
      autoSimulateNextStep: snapshot.auto_simulate_next_step,
      turnNumber: snapshot.turn_number,
      turnsToSimulate: snapshot.turns_to_simulate,
    })

    await applySimulationCompletionDecisionWithClient(
      client,
      snapshot.simulation_id,
      decision
    )

    return {
      simulationId: snapshot.simulation_id,
      deckId: snapshot.deck_id,
      ...decision,
    }
  })
}

function getCompletedLlmRunCostValues(
  run: {
    provider: string
    processing_mode: LlmProcessingMode
    service_tier: string | null
    input_token_cost_usd_per_million: string | number | null
    cached_input_token_cost_usd_per_million: string | number | null
    cache_write_input_token_cost_usd_per_million: string | number | null
    output_token_cost_usd_per_million: string | number | null
  },
  usage: unknown
) {
  const estimatedCostUsd = estimatePresetTokenCostUsd({
    tokenCosts: {
      inputDollarsPerMillion: toOptionalNumber(
        run.input_token_cost_usd_per_million
      ),
      cachedInputDollarsPerMillion: toOptionalNumber(
        run.cached_input_token_cost_usd_per_million
      ),
      cacheWriteInputDollarsPerMillion: toOptionalNumber(
        run.cache_write_input_token_cost_usd_per_million
      ),
      outputDollarsPerMillion: toOptionalNumber(
        run.output_token_cost_usd_per_million
      ),
    },
    usage,
  })

  return {
    estimatedCostUsd: applyLlmRunEstimatedCostServiceTierDiscount({
      estimatedCostUsd,
      processingMode: run.processing_mode,
      serviceTier: run.service_tier,
    }),
    openrouterReportedCostUsd:
      run.provider === "openrouter"
        ? getOpenRouterReportedCostUsd(usage)
        : null,
  }
}

type PartialLlmRunCostSnapshotRow = {
  full_prompt_character_count: string | number
  processing_mode: LlmProcessingMode
  service_tier: string | null
  cached_input_token_cost_usd_per_million: string | number | null
}

export function buildPartialLlmRunCostSnapshotQuery(llmRunId: string) {
  return {
    text: `
      SELECT
        length(llm_run.full_prompt) AS full_prompt_character_count,
        llm_run.processing_mode,
        llm_run.service_tier,
        preset.cached_input_token_cost_usd_per_million
      FROM llm_runs llm_run
      LEFT JOIN llm_model_presets preset
        ON preset.id = llm_run.llm_model_preset_id
      WHERE llm_run.id = $1
      GROUP BY
        llm_run.id,
        llm_run.processing_mode,
        llm_run.service_tier,
        preset.cached_input_token_cost_usd_per_million
    `,
    values: [llmRunId],
  }
}

async function estimatePartialLlmRunCostUsdWithClient(
  client: DatabaseTransactionClient,
  llmRunId: string
) {
  const query = buildPartialLlmRunCostSnapshotQuery(llmRunId)
  const result = await client.query<PartialLlmRunCostSnapshotRow>(
    query.text,
    query.values
  )
  const snapshot = result.rows[0]

  if (!snapshot) {
    return null
  }

  const estimatedCostUsd = estimatePartialLlmRunCostUsd({
    fullPromptCharCount:
      toOptionalNumber(snapshot.full_prompt_character_count) ?? 0,
    tokenCosts: {
      cachedInputDollarsPerMillion: toOptionalNumber(
        snapshot.cached_input_token_cost_usd_per_million
      ),
    },
  })

  return applyLlmRunEstimatedCostServiceTierDiscount({
    estimatedCostUsd,
    processingMode: snapshot.processing_mode,
    serviceTier: snapshot.service_tier,
  })
}

export async function failLlmRun(
  llmRunId: string,
  failureMessage: string,
  finalOutputText?: string
) {
  await withDatabaseTransaction(async (client) => {
    const estimatedCostUsd = await estimatePartialLlmRunCostUsdWithClient(
      client,
      llmRunId
    )

    const failRunQuery = buildFailLlmRunQuery(
      llmRunId,
      failureMessage,
      estimatedCostUsd,
      finalOutputText
    )
    await client.query(failRunQuery.text, failRunQuery.values)

    await client.query(
      `
        UPDATE simulations
        SET status = 'failed',
            auto_simulate_next_step = false,
            failed_at = now(),
            failure_message = $2,
            updated_at = now()
        WHERE id IN (
          SELECT opening_run.simulation_id
          FROM simulation_opening_hand_llm_runs opening_run
          WHERE opening_run.llm_run_id = $1
          UNION
          SELECT turn_run.simulation_id
          FROM simulation_turn_llm_runs turn_run
          WHERE turn_run.llm_run_id = $1
        )
          AND EXISTS (
            SELECT 1
            FROM llm_runs llm_run
            WHERE llm_run.id = $1
              AND llm_run.status = 'failed'
          )
          AND status NOT IN ('completed', 'cancelled')
      `,
      [llmRunId, failureMessage]
    )
  })
}

export async function cancelLlmRun(
  llmRunId: string,
  failureMessage?: string,
  finalOutputText?: string
) {
  await withDatabaseTransaction(async (client) => {
    const estimatedCostUsd = await estimatePartialLlmRunCostUsdWithClient(
      client,
      llmRunId
    )

    const cancelRunQuery = buildCancelLlmRunQuery(
      llmRunId,
      failureMessage ?? null,
      estimatedCostUsd,
      finalOutputText
    )
    await client.query(cancelRunQuery.text, cancelRunQuery.values)

    await client.query(
      `
        UPDATE simulations
        SET status = 'cancelled',
            auto_simulate_next_step = false,
            cancel_requested_at = COALESCE(cancel_requested_at, now()),
            failure_message = COALESCE($2, failure_message),
            updated_at = now()
        WHERE id IN (
          SELECT opening_run.simulation_id
          FROM simulation_opening_hand_llm_runs opening_run
          WHERE opening_run.llm_run_id = $1
          UNION
          SELECT turn_run.simulation_id
          FROM simulation_turn_llm_runs turn_run
          WHERE turn_run.llm_run_id = $1
        )
          AND EXISTS (
            SELECT 1
            FROM llm_runs llm_run
            WHERE llm_run.id = $1
              AND llm_run.status = 'cancelled'
          )
      `,
      [llmRunId, failureMessage ?? null]
    )
  })
}

export async function cancelStaleInFlightLlmRuns(): Promise<StaleInFlightLlmRunCleanupResult> {
  return withDatabaseTransaction(async (client) => {
    const activeRunsResult = await client.query<{
      id: string
      phase: LlmRunPhase
      simulation_id: string | null
    }>(
      `
        SELECT
          llm_run.id,
          llm_run.phase,
          COALESCE(
            opening_run.simulation_id,
            turn_run.simulation_id
          ) AS simulation_id
        FROM llm_runs llm_run
        LEFT JOIN simulation_opening_hand_llm_runs opening_run
          ON opening_run.llm_run_id = llm_run.id
        LEFT JOIN simulation_turn_llm_runs turn_run
          ON turn_run.llm_run_id = llm_run.id
        WHERE (
          llm_run.status IN ('streaming', 'cancel_requested')
          OR (
            llm_run.status = 'pending'
            AND llm_run.queued_at IS NULL
          )
        )
        ORDER BY llm_run.created_at ASC, llm_run.id ASC
        FOR UPDATE OF llm_run
      `
    )
    const cancelledLlmRunIds: string[] = []
    const cancelledSimulationIds = new Set<string>()

    for (const run of activeRunsResult.rows) {
      const estimatedCostUsd = await estimatePartialLlmRunCostUsdWithClient(
        client,
        run.id
      )
      const cancelledRunResult = await client.query(
        `
          UPDATE llm_runs
          SET status = 'cancelled',
              estimated_cost_usd = $3,
              cancelled_at = now(),
              failure_message = $2,
              updated_at = now()
          WHERE id = $1
            AND (
              status IN ('streaming', 'cancel_requested')
              OR (
                status = 'pending'
                AND queued_at IS NULL
              )
            )
        `,
        [run.id, STALE_IN_FLIGHT_LLM_RUN_CANCELLATION_MESSAGE, estimatedCostUsd]
      )

      if ((cancelledRunResult.rowCount ?? 0) > 0) {
        cancelledLlmRunIds.push(run.id)
      }
    }

    const activeSimulationIds = Array.from(
      new Set(
        activeRunsResult.rows.flatMap((run) =>
          run.simulation_id === null ? [] : [run.simulation_id]
        )
      )
    )

    if (activeSimulationIds.length > 0) {
      const activeSimulationCleanupResult = await client.query<{ id: string }>(
        `
          UPDATE simulations
          SET status = 'cancelled',
              auto_simulate_next_step = false,
              cancel_requested_at = COALESCE(cancel_requested_at, now()),
              failure_message = $2,
              updated_at = now()
          WHERE id = ANY($1::uuid[])
            AND status <> 'completed'
          RETURNING id
        `,
        [activeSimulationIds, STALE_IN_FLIGHT_LLM_RUN_CANCELLATION_MESSAGE]
      )

      for (const simulation of activeSimulationCleanupResult.rows) {
        cancelledSimulationIds.add(simulation.id)
      }
    }

    const staleRunningSimulationCleanupResult = await client.query<{
      id: string
    }>(
      `
        UPDATE simulations
        SET status = 'cancelled',
            auto_simulate_next_step = false,
            cancel_requested_at = COALESCE(cancel_requested_at, now()),
            failure_message = $1,
            updated_at = now()
        WHERE status = 'running'
          AND NOT EXISTS (
            SELECT 1
            FROM (
              SELECT opening_run.llm_run_id
              FROM simulation_opening_hand_llm_runs opening_run
              WHERE opening_run.simulation_id = simulations.id
              UNION ALL
              SELECT turn_run.llm_run_id
              FROM simulation_turn_llm_runs turn_run
              WHERE turn_run.simulation_id = simulations.id
            ) linked_run
            JOIN llm_runs llm_run
              ON llm_run.id = linked_run.llm_run_id
            WHERE llm_run.status IN ('pending', 'batch_pending', 'batch_submitted', 'streaming', 'cancel_requested')
          )
        RETURNING id
      `,
      [STALE_RUNNING_SIMULATION_CANCELLATION_MESSAGE]
    )

    for (const simulation of staleRunningSimulationCleanupResult.rows) {
      cancelledSimulationIds.add(simulation.id)
    }

    return {
      cancelledLlmRunIds,
      cancelledSimulationIds: Array.from(cancelledSimulationIds),
    }
  })
}

export async function requestCancelSimulationLlmRuns(
  deckId: string,
  simulationId: string
): Promise<ActiveSimulationLlmRun[]> {
  return withDatabaseTransaction(async (client) => {
    const simulationResult = await client.query(
      `
        SELECT id
        FROM simulations
        WHERE id = $1
          AND deck_id = $2
      `,
      [simulationId, deckId]
    )

    if (simulationResult.rowCount === 0) {
      throw new SimulationValidationError("Simulation not found.")
    }

    const activeRunsResult = await client.query<{
      simulation_id: string
      llm_run_id: string
      phase: LlmRunPhase
      runtime_stream_key: string
      status: LlmRunStatus
    }>(
      `
        SELECT
          opening_run.simulation_id,
          llm_run.id AS llm_run_id,
          llm_run.phase,
          llm_run.runtime_stream_key,
          llm_run.status
        FROM simulation_opening_hand_llm_runs opening_run
        JOIN llm_runs llm_run
          ON llm_run.id = opening_run.llm_run_id
        WHERE opening_run.simulation_id = $1
          AND llm_run.status IN ('pending', 'batch_pending', 'batch_submitted', 'streaming', 'cancel_requested')
        UNION ALL
        SELECT
          turn_run.simulation_id,
          llm_run.id AS llm_run_id,
          llm_run.phase,
          llm_run.runtime_stream_key,
          llm_run.status
        FROM simulation_turn_llm_runs turn_run
        JOIN llm_runs llm_run
          ON llm_run.id = turn_run.llm_run_id
        WHERE turn_run.simulation_id = $1
          AND llm_run.status IN ('pending', 'batch_pending', 'batch_submitted', 'streaming', 'cancel_requested')
      `,
      [simulationId]
    )

    if (activeRunsResult.rows.some((run) => run.status === "batch_submitted")) {
      return activeRunsResult.rows.map((run) => ({
        simulationId: run.simulation_id,
        llmRunId: run.llm_run_id,
        phase: run.phase,
        runtimeStreamKey: run.runtime_stream_key,
        status: run.status,
      }))
    }

    await client.query(
      `
        UPDATE simulations
        SET auto_simulate_next_step = false,
            cancel_requested_at = COALESCE(cancel_requested_at, now()),
            updated_at = now()
        WHERE id = $1
      `,
      [simulationId]
    )

    if (activeRunsResult.rows.length > 0) {
      await client.query(
        `
          UPDATE llm_runs
          SET status = 'cancel_requested',
              cancel_requested_at = COALESCE(cancel_requested_at, now()),
              updated_at = now()
          WHERE id = ANY($1::uuid[])
            AND status IN ('pending', 'batch_pending', 'streaming', 'cancel_requested')
        `,
        [activeRunsResult.rows.map((run) => run.llm_run_id)]
      )
    }

    return activeRunsResult.rows.map((run) => ({
      simulationId: run.simulation_id,
      llmRunId: run.llm_run_id,
      phase: run.phase,
      runtimeStreamKey: run.runtime_stream_key,
      status: run.status,
    }))
  })
}

export async function listActiveSimulationLlmRuns(
  deckId: string,
  simulationId: string
): Promise<ActiveSimulationLlmRun[]> {
  const simulationResult = await queryDatabase(
    `
      SELECT id
      FROM simulations
      WHERE id = $1
        AND deck_id = $2
    `,
    [simulationId, deckId]
  )

  if (simulationResult.rowCount === 0) {
    throw new SimulationValidationError("Simulation not found.")
  }

  const activeRunsResult = await queryDatabase<{
    simulation_id: string
    llm_run_id: string
    phase: LlmRunPhase
    runtime_stream_key: string
    status: LlmRunStatus
  }>(
    `
      SELECT
        opening_run.simulation_id,
        llm_run.id AS llm_run_id,
        llm_run.phase,
        llm_run.runtime_stream_key,
        llm_run.status
      FROM simulation_opening_hand_llm_runs opening_run
      JOIN llm_runs llm_run
        ON llm_run.id = opening_run.llm_run_id
      WHERE opening_run.simulation_id = $1
        AND llm_run.status IN ('pending', 'batch_pending', 'batch_submitted', 'streaming', 'cancel_requested')
      UNION ALL
      SELECT
        turn_run.simulation_id,
        llm_run.id AS llm_run_id,
        llm_run.phase,
        llm_run.runtime_stream_key,
        llm_run.status
      FROM simulation_turn_llm_runs turn_run
      JOIN llm_runs llm_run
        ON llm_run.id = turn_run.llm_run_id
      WHERE turn_run.simulation_id = $1
        AND llm_run.status IN ('pending', 'batch_pending', 'batch_submitted', 'streaming', 'cancel_requested')
    `,
    [simulationId]
  )

  return activeRunsResult.rows.map((run) => ({
    simulationId: run.simulation_id,
    llmRunId: run.llm_run_id,
    phase: run.phase,
    runtimeStreamKey: run.runtime_stream_key,
    status: run.status,
  }))
}

export async function getSimulationDebugInfo(
  deckId: string,
  simulationId: string
): Promise<SimulationDebugInfo> {
  const simulationResult = await queryDatabase<SimulationDebugSimulationRow>(
    `
      SELECT
        id,
        deck_id,
        created_via,
        llm_model_preset_id,
        starting_hand_id,
        seed,
        turns_to_simulate,
        llm_processing_mode,
        reasoning_summaries_enabled,
        use_flex_service_tier,
        auto_simulate_next_step,
        ${SIMULATION_SUMMARY_SIMULATED_TURN_COUNT_SQL} AS simulated_turn_count,
        ${SIMULATION_SUMMARY_COMPLETED_RUN_COUNT_SQL} AS completed_llm_run_count,
        ${SIMULATION_SUMMARY_ACTIVE_RUN_COUNT_SQL} AS active_llm_run_count,
        status,
        created_at,
        updated_at
      FROM simulations
      WHERE id = $1
        AND deck_id = $2
    `,
    [simulationId, deckId]
  )

  if (simulationResult.rowCount === 0) {
    throw new SimulationValidationError("Simulation not found.")
  }

  const simulation = simulationResult.rows[0]
  const openingHandRuns = await getSimulationDebugLlmRunMetadata({
    simulationId,
    tableName: "simulation_opening_hand_llm_runs",
    selectColumns:
      "run.attempt_number, NULL::integer AS turn_number, NULL::boolean AS outdated, run.opening_hand_is_valid",
    orderBy: "run.attempt_number ASC",
  })
  const turnRuns = await getSimulationDebugLlmRunMetadata({
    simulationId,
    tableName: "simulation_turn_llm_runs",
    selectColumns:
      "run.attempt_number, run.turn_number, run.outdated, NULL::boolean AS opening_hand_is_valid",
    orderBy: "run.turn_number ASC, run.attempt_number ASC",
  })
  return {
    simulationId,
    deckId: simulation.deck_id,
    createdVia: simulation.created_via,
    llmModelPresetId: simulation.llm_model_preset_id,
    startingHandId: simulation.starting_hand_id,
    seed: simulation.seed,
    turnsToSimulate: simulation.turns_to_simulate,
    llmProcessingMode: simulation.llm_processing_mode,
    reasoningSummariesEnabled: simulation.reasoning_summaries_enabled,
    useFlexServiceTier: simulation.use_flex_service_tier,
    autoSimulateNextStep: simulation.auto_simulate_next_step,
    simulatedTurnCount: simulation.simulated_turn_count,
    completedLlmRunCount: simulation.completed_llm_run_count,
    activeLlmRunCount: simulation.active_llm_run_count,
    status: simulation.status,
    createdAt: simulation.created_at.toISOString(),
    updatedAt: simulation.updated_at.toISOString(),
    openingHandLlmRunCount: openingHandRuns.length,
    turnLlmRunCount: turnRuns.length,
    openingHandLlmRuns: openingHandRuns,
    turnLlmRuns: turnRuns,
  }
}

export async function getSimulationResultsInfo(
  deckId: string,
  simulationId: string
): Promise<SimulationResultsInfo> {
  const simulationResult = await queryDatabase(
    `
      SELECT id
      FROM simulations
      WHERE id = $1
        AND deck_id = $2
    `,
    [simulationId, deckId]
  )

  if (simulationResult.rowCount === 0) {
    throw new SimulationValidationError("Simulation not found.")
  }

  const openingHandRuns = await getSimulationDebugLlmRuns({
    simulationId,
    tableName: "simulation_opening_hand_llm_runs",
    selectColumns:
      "run.attempt_number, NULL::integer AS turn_number, run.opening_hand, run.summary, NULL::jsonb AS turn_actions, NULL::jsonb AS game_state, run.library_snapshot, NULL::boolean AS outdated, run.opening_hand_is_valid",
    orderBy: "run.attempt_number ASC",
    additionalWhereSql: `
      run.attempt_number = (
        SELECT MAX(latest_run.attempt_number)
        FROM simulation_opening_hand_llm_runs latest_run
        WHERE latest_run.simulation_id = run.simulation_id
      )
    `,
  })
  const turnRuns = await getSimulationDebugLlmRuns({
    simulationId,
    tableName: "simulation_turn_llm_runs",
    selectColumns:
      "run.attempt_number, run.turn_number, NULL::jsonb AS opening_hand, NULL::text AS summary, run.turn_actions, run.game_state, run.library_snapshot, run.outdated, NULL::boolean AS opening_hand_is_valid",
    orderBy: "run.turn_number ASC, run.attempt_number ASC",
    additionalWhereSql: "run.outdated = false",
  })

  return {
    simulationId,
    openingHandLlmRunCount: openingHandRuns.length,
    turnLlmRunCount: turnRuns.length,
    openingHandLlmRuns: openingHandRuns,
    turnLlmRuns: turnRuns,
  }
}

export async function deleteSimulation(
  deckId: string,
  simulationId: string
): Promise<boolean> {
  return withDatabaseTransaction(async (client) => {
    const linkedLlmRunResult = await client.query<{ llm_run_id: string }>(
      `
        SELECT llm_run_id
        FROM simulation_opening_hand_llm_runs
        WHERE simulation_id = $1
        UNION
        SELECT llm_run_id
        FROM simulation_turn_llm_runs
        WHERE simulation_id = $1
      `,
      [simulationId]
    )

    const result = await client.query(
      `
        DELETE FROM simulations
        WHERE id = $1
          AND deck_id = $2
      `,
      [simulationId, deckId]
    )

    if ((result.rowCount ?? 0) === 0) {
      return false
    }

    const llmRunIds = linkedLlmRunResult.rows.map((row) => row.llm_run_id)

    if (llmRunIds.length > 0) {
      await client.query(
        `
          DELETE FROM llm_runs
          WHERE id = ANY($1::uuid[])
        `,
        [llmRunIds]
      )
    }

    return true
  })
}

async function resolveSimulationIdForActiveLlmRun(llmRunId: string) {
  const result = await queryDatabase<{
    simulation_id: string
    status: LlmRunStatus
    outdated: boolean
  }>(
    `
      SELECT
        opening_run.simulation_id,
        llm_run.status,
        false AS outdated
      FROM llm_runs llm_run
      JOIN simulation_opening_hand_llm_runs opening_run
        ON opening_run.llm_run_id = llm_run.id
      WHERE llm_run.id = $1
      UNION ALL
      SELECT
        turn_run.simulation_id,
        llm_run.status,
        turn_run.outdated
      FROM llm_runs llm_run
      JOIN simulation_turn_llm_runs turn_run
        ON turn_run.llm_run_id = llm_run.id
      WHERE llm_run.id = $1
      LIMIT 1
    `,
    [llmRunId]
  )
  const run = result.rows[0]

  if (!run) {
    throw new SimulationValidationError(
      "LLM run not found or is not associated with a simulation."
    )
  }

  if (
    !["pending", "batch_pending", "batch_submitted", "streaming"].includes(
      run.status
    )
  ) {
    throw new SimulationValidationError(
      "LLM run is not an active simulation run."
    )
  }

  if (run.outdated) {
    throw new SimulationValidationError("LLM run is outdated.")
  }

  return run.simulation_id
}

export async function resolveSimulationIdentifier({
  llmRunId,
  simulationId,
}: SimulationIdentifier) {
  const trimmedSimulationId = simulationId?.trim()
  const trimmedLlmRunId = llmRunId?.trim()

  if (trimmedLlmRunId) {
    const runSimulationId =
      await resolveSimulationIdForActiveLlmRun(trimmedLlmRunId)

    if (trimmedSimulationId && trimmedSimulationId !== runSimulationId) {
      throw new SimulationValidationError(
        "Provided simulationId does not match the simulation associated with llmRunId."
      )
    }

    return runSimulationId
  }

  if (trimmedSimulationId) {
    return trimmedSimulationId
  }

  throw new SimulationValidationError(
    "Provide either simulationId or llmRunId."
  )
}

export async function getStartingHandSimulationPromptData(
  simulationId: string
): Promise<StartingHandSimulationPromptData | null> {
  const result = await queryDatabase<SimulationPromptCardRow>(
    `
      SELECT
        simulation.id AS simulation_id,
        simulation.deck_id,
        deck.mulligan_guidelines AS deck_mulligan_guidelines,
        deck.strategy_guidelines AS deck_strategy_guidelines,
        deck_card.id AS deck_card_id,
        deck_card.oracle_id,
        deck_card.quantity,
        deck_card.zone,
        card.name,
        card.mana_cost,
        card.cmc,
        card.type_line,
        card.oracle_text,
        card.power,
        card.toughness,
        card.loyalty,
        card.card_faces
      FROM simulations simulation
      JOIN decks deck
        ON deck.id = simulation.deck_id
      JOIN deck_cards deck_card
        ON deck_card.deck_id = simulation.deck_id
      JOIN scryfall_oracle_cards card
        ON card.oracle_id = deck_card.oracle_id
      WHERE simulation.id = $1
      ORDER BY
        CASE deck_card.zone
          WHEN 'commander' THEN 0
          ELSE 1
        END,
        card.name ASC
    `,
    [simulationId]
  )

  const firstRow = result.rows[0]

  if (!firstRow) {
    return null
  }

  const cards = result.rows.map(mapSimulationPromptCard)

  return {
    simulationId: firstRow.simulation_id,
    deckId: firstRow.deck_id,
    mulliganGuidelines: firstRow.deck_mulligan_guidelines ?? null,
    commanders: cards.filter((card) => card.zone === "commander"),
    library: cards.filter((card) => card.zone === "library"),
  }
}

export async function getTurnSimulationPromptData(
  simulationId: string
): Promise<TurnSimulationPromptData | null> {
  const simulationResult = await queryDatabase<{
    simulation_id: string
    deck_id: string
    strategy_guidelines: string | null
    starting_hand_id: string | null
    library: unknown
  }>(
    `
      SELECT
        simulation.id AS simulation_id,
        simulation.deck_id,
        deck.strategy_guidelines,
        simulation.starting_hand_id,
        simulation.library
      FROM simulations simulation
      JOIN decks deck
        ON deck.id = simulation.deck_id
      WHERE simulation.id = $1
    `,
    [simulationId]
  )
  const simulation = simulationResult.rows[0]

  if (!simulation) {
    return null
  }

  const cardsResult = await queryDatabase<SimulationPromptCardRow>(
    `
      SELECT
        simulation.id AS simulation_id,
        simulation.deck_id,
        deck_card.id AS deck_card_id,
        deck_card.oracle_id,
        deck_card.quantity,
        deck_card.zone,
        card.name,
        card.mana_cost,
        card.cmc,
        card.type_line,
        card.oracle_text,
        card.power,
        card.toughness,
        card.loyalty,
        card.card_faces
      FROM simulations simulation
      JOIN deck_cards deck_card
        ON deck_card.deck_id = simulation.deck_id
      JOIN scryfall_oracle_cards card
        ON card.oracle_id = deck_card.oracle_id
      WHERE simulation.id = $1
      ORDER BY
        CASE deck_card.zone
          WHEN 'commander' THEN 0
          ELSE 1
        END,
        card.name ASC
    `,
    [simulationId]
  )
  const cards = cardsResult.rows.map(mapSimulationPromptCard)

  return {
    simulationId: simulation.simulation_id,
    deckId: simulation.deck_id,
    strategyGuidelines: simulation.strategy_guidelines,
    commanders: cards.filter((card) => card.zone === "commander"),
    libraryCards: cards.filter((card) => card.zone === "library"),
    library: parseStringArray(simulation.library),
    startingHand: await getTurnSimulationStartingHand({
      simulationId,
      startingHandId: simulation.starting_hand_id,
    }),
  }
}

type SimulationDebugLlmRunRow = {
  llm_run_id: string
  llm_model_preset_id: string | null
  llm_model_preset_name: string | null
  processing_mode: LlmProcessingMode
  phase: LlmRunPhase
  provider: string
  model: string
  estimated_cost_usd: string | number | null
  openrouter_reported_cost_usd: string | number | null
  reasoning_effort: string | null
  service_tier: string | null
  status: LlmRunStatus
  runtime_stream_key: string | null
  failure_message: string | null
  created_at: Date
  started_at: Date | null
  completed_at: Date | null
  failed_at: Date | null
  cancelled_at: Date | null
  attempt_number: number
  turn_number: number | null
  opening_hand: unknown | null
  summary: string | null
  turn_actions: unknown | null
  game_state: unknown | null
  library_snapshot: unknown | null
  outdated: boolean | null
  opening_hand_is_valid: boolean | null
}

type SimulationDebugSimulationRow = {
  id: string
  deck_id: string
  created_via: SimulationCreatedVia
  llm_model_preset_id: string | null
  starting_hand_id: string | null
  seed: string
  turns_to_simulate: number
  llm_processing_mode: LlmProcessingMode
  reasoning_summaries_enabled: boolean
  use_flex_service_tier: boolean
  auto_simulate_next_step: boolean
  simulated_turn_count: number
  completed_llm_run_count: number
  active_llm_run_count: number
  status: SimulationStatus
  created_at: Date
  updated_at: Date
}

type SimulationDebugLlmRunMetadataRow = {
  llm_run_id: string
  llm_model_preset_id: string | null
  llm_model_preset_name: string | null
  processing_mode: LlmProcessingMode
  phase: LlmRunPhase
  provider: string
  model: string
  estimated_cost_usd: string | number | null
  openrouter_reported_cost_usd: string | number | null
  reasoning_effort: string | null
  service_tier: string | null
  status: LlmRunStatus
  runtime_stream_key: string | null
  failure_message: string | null
  created_at: Date
  started_at: Date | null
  completed_at: Date | null
  failed_at: Date | null
  cancelled_at: Date | null
  attempt_number: number
  turn_number: number | null
  outdated: boolean | null
  opening_hand_is_valid: boolean | null
}

type OpenRouterGenerationRow = {
  llm_run_id: string
  openrouter_turn_index: number
  generation_id: string
  created_at: Date
}

type LlmRunMcpFunctionCallRow = {
  id: string | number
  llm_run_id: string
  mcp_function_name: string
  status: LlmRunMcpFunctionCallStatus
  input_payload: unknown
  output_payload: unknown
  called_at: Date
  completed_at: Date
}

async function getSimulationDebugLlmRunMetadata({
  orderBy,
  selectColumns,
  simulationId,
  tableName,
}: {
  simulationId: string
  tableName: "simulation_opening_hand_llm_runs" | "simulation_turn_llm_runs"
  selectColumns: string
  orderBy: string
}): Promise<SimulationDebugLlmRunMetadata[]> {
  const result = await queryDatabase<SimulationDebugLlmRunMetadataRow>(
    `
      SELECT
        llm_run.id AS llm_run_id,
        llm_run.llm_model_preset_id,
        preset.name AS llm_model_preset_name,
        llm_run.processing_mode,
        llm_run.phase,
        COALESCE(preset.provider, llm_run.provider) AS provider,
        COALESCE(preset.model, llm_run.model) AS model,
        llm_run.estimated_cost_usd,
        llm_run.openrouter_reported_cost_usd,
        COALESCE(preset.reasoning_effort, llm_run.reasoning_effort) AS reasoning_effort,
        llm_run.service_tier,
        llm_run.status,
        llm_run.runtime_stream_key,
        llm_run.failure_message,
        llm_run.created_at,
        llm_run.started_at,
        llm_run.completed_at,
        llm_run.failed_at,
        llm_run.cancelled_at,
        ${selectColumns}
      FROM ${tableName} run
      JOIN llm_runs llm_run
        ON llm_run.id = run.llm_run_id
      LEFT JOIN llm_model_presets preset
        ON preset.id = llm_run.llm_model_preset_id
      WHERE run.simulation_id = $1
      ORDER BY ${orderBy}
    `,
    [simulationId]
  )
  const runs = result.rows.map(mapSimulationDebugLlmRunMetadataRow)
  const openRouterGenerationsByRunId =
    await getOpenRouterGenerationsByLlmRunIds(
      runs
        .filter((run) => run.provider === "openrouter")
        .map((run) => run.llmRunId)
    )

  for (const run of runs) {
    run.openrouterGenerations =
      openRouterGenerationsByRunId.get(run.llmRunId) ?? []
  }

  return runs
}

function mapSimulationDebugLlmRunMetadataRow(
  row: SimulationDebugLlmRunMetadataRow
): SimulationDebugLlmRunMetadata {
  const run: SimulationDebugLlmRunMetadata = {
    llmRunId: row.llm_run_id,
    llmModelPresetId: row.llm_model_preset_id,
    llmModelPresetName: row.llm_model_preset_name,
    processingMode: row.processing_mode,
    phase: row.phase,
    provider: row.provider,
    model: row.model,
    estimatedPriceCents: formatPreferredLlmRunCostAsCents({
      estimatedCostUsd: toOptionalNumber(row.estimated_cost_usd),
      openrouterReportedCostUsd: toOptionalNumber(
        row.openrouter_reported_cost_usd
      ),
    }),
    reasoningEffort: row.reasoning_effort || null,
    serviceTier: row.service_tier || null,
    status: row.status,
    runtimeStreamKey: row.runtime_stream_key,
    attemptNumber: row.attempt_number,
    failureMessage: row.failure_message,
    createdAt: row.created_at.toISOString(),
    startedAt: row.started_at?.toISOString() ?? null,
    completedAt: row.completed_at?.toISOString() ?? null,
    failedAt: row.failed_at?.toISOString() ?? null,
    cancelledAt: row.cancelled_at?.toISOString() ?? null,
    openrouterGenerations: [],
  }

  if (row.turn_number !== null) {
    run.turnNumber = row.turn_number
  }

  if (row.outdated !== null) {
    run.outdated = row.outdated
  }

  if (row.opening_hand_is_valid !== null) {
    run.openingHandIsValid = row.opening_hand_is_valid
  }

  return run
}

async function getSimulationDebugLlmRuns({
  additionalWhereSql,
  orderBy,
  selectColumns,
  simulationId,
  tableName,
}: {
  simulationId: string
  tableName: "simulation_opening_hand_llm_runs" | "simulation_turn_llm_runs"
  selectColumns: string
  orderBy: string
  additionalWhereSql?: string
}): Promise<SimulationDebugLlmRun[]> {
  const result = await queryDatabase<SimulationDebugLlmRunRow>(
    `
      SELECT
        llm_run.id AS llm_run_id,
        llm_run.llm_model_preset_id,
        preset.name AS llm_model_preset_name,
        llm_run.processing_mode,
        llm_run.phase,
        COALESCE(preset.provider, llm_run.provider) AS provider,
        COALESCE(preset.model, llm_run.model) AS model,
        llm_run.estimated_cost_usd,
        llm_run.openrouter_reported_cost_usd,
        COALESCE(preset.reasoning_effort, llm_run.reasoning_effort) AS reasoning_effort,
        llm_run.service_tier,
        llm_run.status,
        llm_run.runtime_stream_key,
        llm_run.failure_message,
        llm_run.created_at,
        llm_run.started_at,
        llm_run.completed_at,
        llm_run.failed_at,
        llm_run.cancelled_at,
        ${selectColumns}
      FROM ${tableName} run
      JOIN llm_runs llm_run
        ON llm_run.id = run.llm_run_id
      LEFT JOIN llm_model_presets preset
        ON preset.id = llm_run.llm_model_preset_id
      WHERE run.simulation_id = $1
        ${additionalWhereSql ? `AND ${additionalWhereSql}` : ""}
      ORDER BY ${orderBy}
    `,
    [simulationId]
  )
  const runsById = new Map<string, SimulationDebugLlmRun>()

  for (const row of result.rows) {
    let run = runsById.get(row.llm_run_id)

    if (!run) {
      run = {
        llmRunId: row.llm_run_id,
        llmModelPresetId: row.llm_model_preset_id,
        llmModelPresetName: row.llm_model_preset_name,
        processingMode: row.processing_mode,
        phase: row.phase,
        provider: row.provider,
        model: row.model,
        estimatedPriceCents: formatPreferredLlmRunCostAsCents({
          estimatedCostUsd: toOptionalNumber(row.estimated_cost_usd),
          openrouterReportedCostUsd: toOptionalNumber(
            row.openrouter_reported_cost_usd
          ),
        }),
        reasoningEffort: row.reasoning_effort || null,
        serviceTier: row.service_tier || null,
        status: row.status,
        runtimeStreamKey: row.runtime_stream_key,
        attemptNumber: row.attempt_number,
        failureMessage: row.failure_message,
        createdAt: row.created_at.toISOString(),
        startedAt: row.started_at?.toISOString() ?? null,
        completedAt: row.completed_at?.toISOString() ?? null,
        failedAt: row.failed_at?.toISOString() ?? null,
        cancelledAt: row.cancelled_at?.toISOString() ?? null,
        openrouterGenerations: [],
        mcpFunctionCalls: [],
      }

      if (row.turn_number !== null) {
        run.turnNumber = row.turn_number
      }

      if (row.opening_hand !== null) {
        run.openingHand = parseStringArray(row.opening_hand)
      }

      if (row.summary !== null) {
        run.summary = row.summary
      }

      if (row.turn_actions !== null) {
        run.turnActions = row.turn_actions
      }

      if (row.game_state !== null) {
        run.gameState = row.game_state
      }

      if (row.phase === "opening_hand" || row.phase === "turn") {
        run.librarySnapshot = asStringArray(row.library_snapshot)
      }

      if (row.outdated !== null) {
        run.outdated = row.outdated
      }

      if (row.opening_hand_is_valid !== null) {
        run.openingHandIsValid = row.opening_hand_is_valid
      }

      runsById.set(row.llm_run_id, run)
    }
  }

  const runs = Array.from(runsById.values())
  const openRouterGenerationsByRunId =
    await getOpenRouterGenerationsByLlmRunIds(
      runs
        .filter((run) => run.provider === "openrouter")
        .map((run) => run.llmRunId)
    )

  for (const run of runs) {
    run.openrouterGenerations =
      openRouterGenerationsByRunId.get(run.llmRunId) ?? []
  }

  const mcpFunctionCallsByRunId = await getMcpFunctionCallsByLlmRunIds(
    runs.map((run) => run.llmRunId)
  )

  for (const run of runs) {
    run.mcpFunctionCalls = mcpFunctionCallsByRunId.get(run.llmRunId) ?? []
  }

  return runs
}

async function getMcpFunctionCallsByLlmRunIds(llmRunIds: readonly string[]) {
  const callsByRunId = new Map<string, LlmRunMcpFunctionCall[]>()

  if (llmRunIds.length === 0) {
    return callsByRunId
  }

  const result = await queryDatabase<LlmRunMcpFunctionCallRow>(
    `
      SELECT
        id,
        llm_run_id,
        mcp_function_name,
        status,
        input_payload,
        output_payload,
        called_at,
        completed_at
      FROM llm_run_mcp_function_calls
      WHERE llm_run_id = ANY($1::uuid[])
      ORDER BY llm_run_id ASC, called_at ASC, id ASC
    `,
    [llmRunIds]
  )

  for (const row of result.rows) {
    const calls = callsByRunId.get(row.llm_run_id) ?? []

    calls.push({
      id: Number(row.id),
      mcpFunctionName: row.mcp_function_name,
      status: row.status,
      inputPayload: row.input_payload,
      outputPayload: row.output_payload,
      calledAt: row.called_at.toISOString(),
      completedAt: row.completed_at.toISOString(),
    })
    callsByRunId.set(row.llm_run_id, calls)
  }

  return callsByRunId
}

async function getOpenRouterGenerationsByLlmRunIds(
  llmRunIds: readonly string[]
) {
  const generationsByRunId = new Map<string, OpenRouterGeneration[]>()

  if (llmRunIds.length === 0) {
    return generationsByRunId
  }

  const result = await queryDatabase<OpenRouterGenerationRow>(
    `
      SELECT
        llm_run_id,
        openrouter_turn_index,
        generation_id,
        created_at
      FROM llm_run_openrouter_generations
      WHERE llm_run_id = ANY($1::uuid[])
      ORDER BY llm_run_id ASC, openrouter_turn_index ASC
    `,
    [llmRunIds]
  )

  for (const row of result.rows) {
    const generations = generationsByRunId.get(row.llm_run_id) ?? []

    generations.push({
      openrouterTurnIndex: row.openrouter_turn_index,
      generationId: row.generation_id,
      createdAt: row.created_at.toISOString(),
    })
    generationsByRunId.set(row.llm_run_id, generations)
  }

  return generationsByRunId
}

type PromptCardRow = {
  deck_card_id: number
  oracle_id: string
  quantity: number
  zone: "commander" | "library"
  name: string
  mana_cost: string | null
  cmc: string | null
  type_line: string | null
  oracle_text: string | null
  power: string | null
  toughness: string | null
  loyalty: string | null
  card_faces: unknown
}

type SimulationPromptCardRow = PromptCardRow & {
  simulation_id: string
  deck_id: string
  deck_mulligan_guidelines?: string | null
  deck_strategy_guidelines?: string | null
}

type LibrarySimulationRow = {
  deck_id: string
  seed: string
  starting_hand_id: string | null
  random_state: string
  library: unknown
  mulligan_count: number
  has_drawn_starting_hand: boolean
}

async function markSimulationRunningWithClient(
  client: DatabaseTransactionClient,
  simulationId: string
) {
  await client.query(
    `
      UPDATE simulations
      SET status = 'running',
          started_at = COALESCE(started_at, now()),
          completed_at = NULL,
          failed_at = NULL,
          cancel_requested_at = NULL,
          failure_message = NULL,
          updated_at = now()
      WHERE id = $1
    `,
    [simulationId]
  )
}

async function markSimulationCompletedWithClient(
  client: DatabaseTransactionClient,
  simulationId: string
) {
  await client.query(
    `
      UPDATE simulations
      SET status = 'completed',
          completed_at = now(),
          failed_at = NULL,
          failure_message = NULL,
          updated_at = now()
      WHERE id = $1
    `,
    [simulationId]
  )
}

async function markSimulationFailedWithClient(
  client: DatabaseTransactionClient,
  simulationId: string,
  failureMessage: string
) {
  await client.query(
    `
      UPDATE simulations
      SET status = 'failed',
          auto_simulate_next_step = false,
          failed_at = now(),
          failure_message = $2,
          updated_at = now()
      WHERE id = $1
        AND status NOT IN ('completed', 'cancelled')
    `,
    [simulationId, failureMessage]
  )
}

async function markSimulationCancelledWithClient(
  client: DatabaseTransactionClient,
  simulationId: string,
  failureMessage?: string
) {
  await client.query(
    `
      UPDATE simulations
      SET status = 'cancelled',
          auto_simulate_next_step = false,
          cancel_requested_at = COALESCE(cancel_requested_at, now()),
          failure_message = COALESCE($2, failure_message),
          updated_at = now()
      WHERE id = $1
    `,
    [simulationId, failureMessage ?? null]
  )
}

async function applySimulationCompletionDecisionWithClient(
  client: DatabaseTransactionClient,
  simulationId: string,
  decision: SimulationCompletionDecision
) {
  if (decision.simulationStatus === "failed") {
    await markSimulationFailedWithClient(
      client,
      simulationId,
      decision.failureMessage ?? "Simulation failed."
    )
    return
  }

  if (decision.simulationStatus === "completed") {
    await markSimulationCompletedWithClient(client, simulationId)
    return
  }

  if (decision.disableAutoSimulateNextStep) {
    await client.query(
      `
        UPDATE simulations
        SET auto_simulate_next_step = false,
            updated_at = now()
        WHERE id = $1
      `,
      [simulationId]
    )
  }
}

async function assertNoActiveSimulationLlmRuns(
  client: DatabaseTransactionClient,
  simulationId: string
) {
  const activeRunResult = await client.query(
    `
      SELECT 1
      FROM (
        SELECT llm_run.id
        FROM simulation_opening_hand_llm_runs opening_run
        JOIN llm_runs llm_run
          ON llm_run.id = opening_run.llm_run_id
        WHERE opening_run.simulation_id = $1
          AND llm_run.status IN ('pending', 'batch_pending', 'batch_submitted', 'streaming', 'cancel_requested')
        UNION ALL
        SELECT llm_run.id
        FROM simulation_turn_llm_runs turn_run
        JOIN llm_runs llm_run
          ON llm_run.id = turn_run.llm_run_id
        WHERE turn_run.simulation_id = $1
          AND llm_run.status IN ('pending', 'batch_pending', 'batch_submitted', 'streaming', 'cancel_requested')
      ) active_run
      LIMIT 1
    `,
    [simulationId]
  )

  if ((activeRunResult.rowCount ?? 0) > 0) {
    throw new SimulationValidationError(
      "An LLM run is already active for this simulation."
    )
  }
}

async function resetSimulationForTurnLlmRun(
  client: DatabaseTransactionClient,
  simulation: {
    id: string
    deck_id: string
    seed: string
    starting_hand_id: string | null
  },
  turnNumber: number
) {
  if (turnNumber === 1) {
    await resetSimulationForFirstTurnLlmRun(client, simulation)
    return null
  }

  const latestPreviousTurnRuns = await getLatestPreviousTurnRuns(
    client,
    simulation.id,
    turnNumber
  )
  const latestPreviousTurnRunsByTurn = new Map(
    latestPreviousTurnRuns.map((run) => [run.turn_number, run])
  )

  for (
    let previousTurnNumber = 1;
    previousTurnNumber < turnNumber;
    previousTurnNumber += 1
  ) {
    const previousTurnRun = latestPreviousTurnRunsByTurn.get(previousTurnNumber)

    if (!previousTurnRun) {
      throw new SimulationValidationError(
        `Turn ${previousTurnNumber} has not been simulated.`
      )
    }

    if (previousTurnRun.status !== "completed") {
      throw new SimulationValidationError(
        `The most recent turn ${previousTurnNumber} LLM run is not complete.`
      )
    }

    if (previousTurnRun.outdated) {
      throw new SimulationValidationError(
        `The most recent turn ${previousTurnNumber} LLM run is outdated.`
      )
    }

    if (
      !isJsonObject(previousTurnRun.game_state) ||
      !isTurnActionsObject(previousTurnRun.turn_actions)
    ) {
      throw new SimulationValidationError(
        `The most recent turn ${previousTurnNumber} LLM run does not have valid turn output.`
      )
    }
  }

  const immediatePreviousTurn = latestPreviousTurnRunsByTurn.get(turnNumber - 1)

  if (!immediatePreviousTurn) {
    throw new SimulationValidationError(
      `Turn ${turnNumber - 1} has not been simulated.`
    )
  }

  const previousGameState = immediatePreviousTurn.game_state

  if (
    !isJsonObject(previousGameState) ||
    !isTurnActionsObject(immediatePreviousTurn.turn_actions)
  ) {
    throw new SimulationValidationError(
      `The most recent turn ${turnNumber - 1} LLM run does not have valid turn output.`
    )
  }

  const librarySnapshot = parseRequiredStringArray(
    immediatePreviousTurn.library_snapshot,
    `The most recent turn ${turnNumber - 1} LLM run does not have a library snapshot.`
  )

  if (immediatePreviousTurn.random_state_snapshot === null) {
    throw new SimulationValidationError(
      `The most recent turn ${turnNumber - 1} LLM run does not have a random state snapshot.`
    )
  }

  await updateSimulationLibraryAndRandomState(
    client,
    simulation.id,
    librarySnapshot,
    immediatePreviousTurn.random_state_snapshot
  )

  return previousGameState
}

async function resetSimulationForFirstTurnLlmRun(
  client: DatabaseTransactionClient,
  simulation: {
    id: string
    deck_id: string
    seed: string
    starting_hand_id: string | null
  }
) {
  if (simulation.starting_hand_id !== null) {
    const shuffledLibrary = await createShuffledSimulationLibraryWithClient(
      client,
      simulation.deck_id,
      simulation.seed,
      simulation.starting_hand_id
    )

    await client.query(
      `
        UPDATE simulations
        SET library = $2::jsonb,
            random_state = $3,
            mulligan_count = 0,
            has_drawn_starting_hand = true,
            updated_at = now()
        WHERE id = $1
      `,
      [
        simulation.id,
        JSON.stringify(shuffledLibrary.library),
        shuffledLibrary.randomState,
      ]
    )
    return
  }

  const openingHandResult = await client.query<{
    status: LlmRunStatus
    opening_hand_is_valid: boolean
    library_snapshot: unknown | null
    random_state_snapshot: string | null
  }>(
    `
      SELECT
        llm_run.status,
        opening_run.opening_hand_is_valid,
        opening_run.library_snapshot,
        opening_run.random_state_snapshot
      FROM simulation_opening_hand_llm_runs opening_run
      JOIN llm_runs llm_run
        ON llm_run.id = opening_run.llm_run_id
      WHERE opening_run.simulation_id = $1
      ORDER BY opening_run.attempt_number DESC
      LIMIT 1
    `,
    [simulation.id]
  )
  const latestOpeningHand = openingHandResult.rows[0]

  if (!latestOpeningHand) {
    throw new SimulationValidationError(
      "No opening-hand LLM run exists for this simulation."
    )
  }

  if (latestOpeningHand.status !== "completed") {
    throw new SimulationValidationError(
      "The most recent opening-hand LLM run is not complete."
    )
  }

  if (!latestOpeningHand.opening_hand_is_valid) {
    throw new SimulationValidationError(
      "The most recent opening-hand LLM run does not have a valid starting hand."
    )
  }

  const librarySnapshot = parseRequiredStringArray(
    latestOpeningHand.library_snapshot,
    "The most recent opening-hand LLM run does not have a library snapshot."
  )

  if (latestOpeningHand.random_state_snapshot === null) {
    throw new SimulationValidationError(
      "The most recent opening-hand LLM run does not have a random state snapshot."
    )
  }

  await client.query(
    `
      UPDATE simulations
      SET library = $2::jsonb,
          random_state = $3,
          has_drawn_starting_hand = true,
          updated_at = now()
      WHERE id = $1
    `,
    [
      simulation.id,
      JSON.stringify(librarySnapshot),
      latestOpeningHand.random_state_snapshot,
    ]
  )
}

async function getLatestPreviousTurnRuns(
  client: DatabaseTransactionClient,
  simulationId: string,
  turnNumber: number
) {
  const result = await client.query<{
    turn_number: number
    attempt_number: number
    status: LlmRunStatus
    outdated: boolean
    turn_actions: unknown | null
    game_state: unknown | null
    library_snapshot: unknown | null
    random_state_snapshot: string | null
  }>(
    `
      SELECT DISTINCT ON (turn_run.turn_number)
        turn_run.turn_number,
        turn_run.attempt_number,
        llm_run.status,
        turn_run.outdated,
        turn_run.turn_actions,
        turn_run.game_state,
        turn_run.library_snapshot,
        turn_run.random_state_snapshot
      FROM simulation_turn_llm_runs turn_run
      JOIN llm_runs llm_run
        ON llm_run.id = turn_run.llm_run_id
      WHERE turn_run.simulation_id = $1
        AND turn_run.turn_number < $2
      ORDER BY turn_run.turn_number ASC, turn_run.attempt_number DESC
    `,
    [simulationId, turnNumber]
  )

  return result.rows
}

async function updateSimulationLibraryAndRandomState(
  client: DatabaseTransactionClient,
  simulationId: string,
  library: readonly string[],
  randomState: string | number
) {
  await client.query(
    `
      UPDATE simulations
      SET library = $2::jsonb,
          random_state = $3,
          updated_at = now()
      WHERE id = $1
    `,
    [simulationId, JSON.stringify(library), randomState]
  )
}

function parseRequiredStringArray(value: unknown, errorMessage: string) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new SimulationValidationError(errorMessage)
  }

  return value
}

async function getTurnSimulationStartingHand({
  simulationId,
  startingHandId,
}: {
  simulationId: string
  startingHandId: string | null
}) {
  if (startingHandId !== null) {
    const startingHandResult = await queryDatabase<{
      quantity: number
      name: string
    }>(
      `
        SELECT
          hand_card.quantity,
          card.name
        FROM starting_hand_cards hand_card
        JOIN deck_cards deck_card
          ON deck_card.id = hand_card.deck_card_id
        JOIN scryfall_oracle_cards card
          ON card.oracle_id = deck_card.oracle_id
        WHERE hand_card.starting_hand_id = $1
        ORDER BY card.name ASC, deck_card.id ASC
      `,
      [startingHandId]
    )

    return startingHandResult.rows.flatMap((card) =>
      Array.from({ length: card.quantity }, () => card.name)
    )
  }

  const openingHandResult = await queryDatabase<{
    opening_hand: unknown
    opening_hand_is_valid: boolean
  }>(
    `
      SELECT
        opening_hand,
        opening_hand_is_valid
      FROM simulation_opening_hand_llm_runs
      WHERE simulation_id = $1
      ORDER BY attempt_number DESC
      LIMIT 1
    `,
    [simulationId]
  )
  const latestOpeningHand = openingHandResult.rows[0]

  if (!latestOpeningHand) {
    throw new SimulationValidationError(
      "No opening-hand LLM run exists for this simulation."
    )
  }

  const openingHand = parseStringArray(latestOpeningHand.opening_hand)

  if (!latestOpeningHand.opening_hand_is_valid || openingHand.length === 0) {
    throw new SimulationValidationError(
      "The most recent opening-hand LLM run does not have a valid starting hand."
    )
  }

  return openingHand
}

function mapSimulationPromptCard(row: PromptCardRow): SimulationPromptCard {
  return {
    deckCardId: Number(row.deck_card_id),
    oracleId: row.oracle_id,
    name: row.name,
    quantity: row.quantity,
    zone: row.zone,
    manaCost: row.mana_cost,
    convertedManaCost: row.cmc,
    typeLine: row.type_line,
    oracleText: row.oracle_text,
    power: row.power,
    toughness: row.toughness,
    loyalty: row.loyalty,
    cardFaces: parseSimulationPromptCardFaces(row.card_faces),
  }
}

function parseSimulationPromptCardFaces(
  cardFaces: unknown
): SimulationPromptCardFace[] {
  if (!Array.isArray(cardFaces)) {
    return []
  }

  return cardFaces.flatMap((face) => {
    if (typeof face !== "object" || face === null) {
      return []
    }

    const faceRecord = face as Record<string, unknown>
    const name = getOptionalString(faceRecord.name)

    if (!name) {
      return []
    }

    return [
      {
        name,
        manaCost: getOptionalString(faceRecord.mana_cost),
        typeLine: getOptionalString(faceRecord.type_line),
        oracleText: getOptionalString(faceRecord.oracle_text),
        power: getOptionalString(faceRecord.power),
        toughness: getOptionalString(faceRecord.toughness),
        loyalty: getOptionalString(faceRecord.loyalty),
      },
    ]
  })
}

function getOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isTurnActionsObject(
  value: unknown
): value is Record<TurnPhaseChange, string[]> {
  if (!isJsonObject(value)) {
    return false
  }

  const phaseKeySet = new Set<string>(TURN_PHASE_CHANGES)

  return (
    Object.keys(value).every((key) => phaseKeySet.has(key)) &&
    TURN_PHASE_CHANGES.every((phaseKey) => {
      const actions = value[phaseKey]

      return (
        Array.isArray(actions) &&
        actions.every((action) => typeof action === "string")
      )
    })
  )
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    return null
  }

  return value
}

function parseStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return value.filter((item): item is string => typeof item === "string")
}

function getPersistableOpenRouterModelProvider(input: {
  provider: string
  openrouterModelProvider: string | null
}) {
  if (input.provider !== "openrouter") {
    return null
  }

  return input.openrouterModelProvider?.trim() || null
}

export function isValidCompletedOpeningHand({
  deckLibraryCardCount,
  librarySnapshot,
  mulliganCount,
  openingHand,
}: {
  deckLibraryCardCount: number
  librarySnapshot: readonly string[]
  mulliganCount: number
  openingHand: readonly string[]
}) {
  const expectedOpeningHandCount = Math.max(
    0,
    7 - Math.max(0, mulliganCount - 1)
  )

  return (
    openingHand.length === expectedOpeningHandCount &&
    openingHand.length + librarySnapshot.length === deckLibraryCardCount
  )
}

async function getLockedLibrarySimulation(
  client: DatabaseTransactionClient,
  simulationId: string
) {
  const result = await client.query<LibrarySimulationRow>(
    `
      SELECT
        deck_id,
        seed,
        starting_hand_id,
        random_state,
        library,
        mulligan_count,
        has_drawn_starting_hand
      FROM simulations
      WHERE id = $1
      FOR UPDATE
    `,
    [simulationId]
  )

  if (result.rowCount === 0) {
    throw new SimulationValidationError("Simulation not found.")
  }

  return result.rows[0]
}

function assertSimulationDoesNotHavePresetStartingHand({
  starting_hand_id: startingHandId,
}: {
  starting_hand_id: string | null
}) {
  if (startingHandId !== null) {
    throw new SimulationValidationError(
      "This simulation uses a preset starting hand, so opening-hand tools are not allowed."
    )
  }
}

async function updateSimulationLibrary(
  client: DatabaseTransactionClient,
  simulationId: string,
  library: readonly string[]
) {
  await client.query(
    `
      UPDATE simulations
      SET library = $2::jsonb,
          updated_at = now()
      WHERE id = $1
    `,
    [simulationId, JSON.stringify(library)]
  )
}

async function rebuildAndShuffleSimulationLibrary(
  client: DatabaseTransactionClient,
  deckId: string,
  seed: string,
  shuffleCount: number
) {
  let library = await getDeckLibraryCardNames(client, deckId)
  let randomState = createSeededRandomState(seed)

  for (let index = 0; index < shuffleCount; index += 1) {
    const shuffleResult = shuffleWithRandomState(library, randomState)
    library = shuffleResult.items
    randomState = shuffleResult.randomState
  }

  return {
    library,
    randomState,
  }
}

async function getDeckLibraryCardNames(
  client: DatabaseTransactionClient,
  deckId: string
) {
  const libraryResult = await client.query<{
    quantity: number
    name: string
  }>(
    `
      SELECT
        deck_card.quantity,
        card.name
      FROM deck_cards deck_card
      JOIN scryfall_oracle_cards card
        ON card.oracle_id = deck_card.oracle_id
      WHERE deck_card.deck_id = $1
        AND deck_card.zone = 'library'
      ORDER BY card.name ASC, deck_card.id ASC
    `,
    [deckId]
  )

  return libraryResult.rows.flatMap((card) =>
    Array.from({ length: card.quantity }, () => card.name)
  )
}

function assertPositiveInteger(value: number, label: string) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new SimulationValidationError(`${label} must be a positive integer.`)
  }
}

function findBestLibraryCardMatchIndex(
  library: readonly string[],
  requestedCard: string
) {
  const normalizedRequest = normalizeLibraryCardSearchText(requestedCard)

  if (!normalizedRequest) {
    return -1
  }

  let bestIndex = -1
  let bestScore = 0

  for (let index = 0; index < library.length; index += 1) {
    const normalizedCandidate = normalizeLibraryCardSearchText(library[index])
    const score = getLibraryCardMatchScore(
      normalizedRequest,
      normalizedCandidate
    )

    if (score === 1) {
      return index
    }

    if (score > bestScore) {
      bestIndex = index
      bestScore = score
    }
  }

  return bestScore >= 0.72 ? bestIndex : -1
}

function normalizeLibraryCardSearchText(cardName: string) {
  return cardName
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
}

function getLibraryCardMatchScore(
  requestedCard: string,
  candidateCard: string
) {
  if (!candidateCard) {
    return 0
  }

  if (requestedCard === candidateCard) {
    return 1
  }

  if (requestedCard.length >= 3 && candidateCard.includes(requestedCard)) {
    return requestedCard.length / candidateCard.length >= 0.5 ? 0.9 : 0.74
  }

  if (candidateCard.length >= 3 && requestedCard.includes(candidateCard)) {
    return candidateCard.length / requestedCard.length >= 0.5 ? 0.88 : 0.72
  }

  const editDistance = getLevenshteinDistance(requestedCard, candidateCard)
  const maxLength = Math.max(requestedCard.length, candidateCard.length)

  return maxLength === 0 ? 0 : 1 - editDistance / maxLength
}

function getLevenshteinDistance(left: string, right: string) {
  const previousRow = Array.from(
    { length: right.length + 1 },
    (_, index) => index
  )

  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    const currentRow = [leftIndex + 1]

    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex] === right[rightIndex] ? 0 : 1

      currentRow[rightIndex + 1] = Math.min(
        currentRow[rightIndex] + 1,
        previousRow[rightIndex + 1] + 1,
        previousRow[rightIndex] + substitutionCost
      )
    }

    previousRow.splice(0, previousRow.length, ...currentRow)
  }

  return previousRow[right.length]
}

async function createShuffledSimulationLibrary(
  deckId: string,
  seed: string,
  startingHandId: string | null
) {
  const libraryResult = await queryDatabase<{
    deck_card_id: string
    quantity: number
    name: string
  }>(
    `
      SELECT
        deck_card.id AS deck_card_id,
        deck_card.quantity,
        card.name
      FROM deck_cards deck_card
      JOIN scryfall_oracle_cards card
        ON card.oracle_id = deck_card.oracle_id
      WHERE deck_card.deck_id = $1
        AND deck_card.zone = 'library'
      ORDER BY card.name ASC, deck_card.id ASC
    `,
    [deckId]
  )
  const startingHandQuantities = startingHandId
    ? await getStartingHandDeckCardQuantities(startingHandId)
    : new Map<number, number>()
  const library = libraryResult.rows.flatMap((card) => {
    const deckCardId = Number(card.deck_card_id)
    const startingHandQuantity = startingHandQuantities.get(deckCardId) ?? 0
    const remainingQuantity = card.quantity - startingHandQuantity

    if (remainingQuantity < 0) {
      throw new SimulationValidationError(
        "Starting hand contains more copies of a card than the deck has."
      )
    }

    return Array.from({ length: remainingQuantity }, () => card.name)
  })

  const shuffleResult = shuffleWithRandomState(
    library,
    createSeededRandomState(seed)
  )

  return {
    library: shuffleResult.items,
    randomState: shuffleResult.randomState,
  }
}

async function createShuffledSimulationLibraryWithClient(
  client: DatabaseTransactionClient,
  deckId: string,
  seed: string,
  startingHandId: string | null
) {
  const libraryResult = await client.query<{
    deck_card_id: string
    quantity: number
    name: string
  }>(
    `
      SELECT
        deck_card.id AS deck_card_id,
        deck_card.quantity,
        card.name
      FROM deck_cards deck_card
      JOIN scryfall_oracle_cards card
        ON card.oracle_id = deck_card.oracle_id
      WHERE deck_card.deck_id = $1
        AND deck_card.zone = 'library'
      ORDER BY card.name ASC, deck_card.id ASC
    `,
    [deckId]
  )
  const startingHandQuantities = startingHandId
    ? await getStartingHandDeckCardQuantitiesWithClient(client, startingHandId)
    : new Map<number, number>()
  const library = libraryResult.rows.flatMap((card) => {
    const deckCardId = Number(card.deck_card_id)
    const startingHandQuantity = startingHandQuantities.get(deckCardId) ?? 0
    const remainingQuantity = card.quantity - startingHandQuantity

    if (remainingQuantity < 0) {
      throw new SimulationValidationError(
        "Starting hand contains more copies of a card than the deck has."
      )
    }

    return Array.from({ length: remainingQuantity }, () => card.name)
  })

  const shuffleResult = shuffleWithRandomState(
    library,
    createSeededRandomState(seed)
  )

  return {
    library: shuffleResult.items,
    randomState: shuffleResult.randomState,
  }
}

async function getStartingHandDeckCardQuantities(startingHandId: string) {
  const result = await queryDatabase<{
    deck_card_id: string
    quantity: number
  }>(
    `
      SELECT deck_card_id, quantity
      FROM starting_hand_cards
      WHERE starting_hand_id = $1
    `,
    [startingHandId]
  )

  return new Map(
    result.rows.map((card) => [Number(card.deck_card_id), card.quantity])
  )
}

async function getStartingHandDeckCardQuantitiesWithClient(
  client: DatabaseTransactionClient,
  startingHandId: string
) {
  const result = await client.query<{
    deck_card_id: string
    quantity: number
  }>(
    `
      SELECT deck_card_id, quantity
      FROM starting_hand_cards
      WHERE starting_hand_id = $1
    `,
    [startingHandId]
  )

  return new Map(
    result.rows.map((card) => [Number(card.deck_card_id), card.quantity])
  )
}

function shuffleWithRandomState<T>(
  items: readonly T[],
  initialRandomState: number
) {
  const shuffledItems = [...items]
  let randomState = initialRandomState

  for (let index = shuffledItems.length - 1; index > 0; index -= 1) {
    const nextRandom = getNextRandomValue(randomState)
    randomState = nextRandom.randomState

    const swapIndex = Math.floor(nextRandom.value * (index + 1))
    const currentItem = shuffledItems[index]
    shuffledItems[index] = shuffledItems[swapIndex]
    shuffledItems[swapIndex] = currentItem
  }

  return {
    items: shuffledItems,
    randomState,
  }
}

function createSeededRandomState(seed: string) {
  let state = 0x811c9dc5

  for (let index = 0; index < seed.length; index += 1) {
    state = Math.imul(state ^ seed.charCodeAt(index), 0x01000193)
  }

  return state >>> 0
}

function getNextRandomValue(randomState: number) {
  const nextRandomState = (randomState + 0x6d2b79f5) >>> 0
  let value = nextRandomState
  value = Math.imul(value ^ (value >>> 15), value | 1)
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61)

  return {
    randomState: nextRandomState,
    value: ((value ^ (value >>> 14)) >>> 0) / 4294967296,
  }
}

async function createEnumType(name: string, values: readonly string[]) {
  const sqlIdentifier = getSafeSqlIdentifier(name)

  await queryDatabase(`
    DO $$
    BEGIN
      CREATE TYPE ${sqlIdentifier} AS ENUM (${values
        .map(quoteSqlLiteral)
        .join(", ")});
    EXCEPTION
      WHEN duplicate_object THEN null;
    END
    $$;
  `)

  for (const value of values) {
    await queryDatabase(
      `ALTER TYPE ${sqlIdentifier} ADD VALUE IF NOT EXISTS ${quoteSqlLiteral(
        value
      )}`
    )
  }
}

function getSafeSqlIdentifier(identifier: string) {
  if (!/^[a-z_][a-z0-9_]*$/u.test(identifier)) {
    throw new Error(`Unsafe SQL identifier: ${identifier}`)
  }

  return identifier
}

function quoteSqlLiteral(value: string) {
  return `'${value.replace(/'/g, "''")}'`
}

function toOptionalNumber(value: string | number | null) {
  if (value === null) {
    return null
  }

  const parsedValue = Number(value)

  return Number.isFinite(parsedValue) ? parsedValue : null
}
