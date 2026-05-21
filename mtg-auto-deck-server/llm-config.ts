import { z } from "zod/v4"
import type { TokenPrice } from "./llm-pricing.js"

export const llmProviderSchema = z.enum(["openai", "openrouter", "llamacpp"])
export const reasoningEffortSchema = z.enum([
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
])

export type LlmProvider = z.infer<typeof llmProviderSchema>
export type ReasoningEffort = z.infer<typeof reasoningEffortSchema>

type Environment = Record<string, string | undefined>

export const GENERIC_GAME_RULES_REFERENCE_ENABLED_ENVIRONMENT_VARIABLE =
  "GENERIC_GAME_RULES_REFERENCE_ENABLED"
export const LOG_TURN_ACTION_FULL_ACTION_LIST_ENABLED_ENVIRONMENT_VARIABLE =
  "LOG_TURN_ACTION_FULL_ACTION_LIST_ENABLED"

type BaseLlmRunConfig = {
  apiKey: string
  modelPresetId: string
  maxOutputTokens: number
  provider: LlmProvider
  serviceTier: string | null
  tokenCosts: TokenPrice
}

type ReasoningEffortLlmRunConfig = BaseLlmRunConfig & {
  reasoningEffort: ReasoningEffort
}

type ConfiguredModelLlmRunConfig = ReasoningEffortLlmRunConfig & {
  model: string
}

export type LlmModelPresetRunConfig = {
  id: string
  provider: LlmProvider
  model: string
  reasoningEffort: ReasoningEffort
  openrouterModelProvider: string | null
  supportsFlex: boolean
  inputTokenCostUsdPerMillion: number | null
  cachedInputTokenCostUsdPerMillion: number | null
  outputTokenCostUsdPerMillion: number | null
}

export type OpenAiRunConfig = ConfiguredModelLlmRunConfig & {
  provider: "openai"
}

export type OpenRouterRunConfig = ConfiguredModelLlmRunConfig & {
  provider: "openrouter"
  modelProvider: string | null
  stopWhenStepCount: number
}

export type LlamaCppRunConfig = BaseLlmRunConfig & {
  provider: "llamacpp"
  baseUrl: string
  model: string
  reasoningEffort: null
  serviceTier: null
  stopWhenStepCount: number
}

export type ResolvedLlamaCppRunConfig = LlamaCppRunConfig

export type OpeningHandOpenAiRunConfig = OpenAiRunConfig & {
  openingHandMcpPublicUrl: string
}

export type TurnSimulationOpenAiRunConfig = OpenAiRunConfig & {
  turnSimulationMcpPublicUrl: string
}

export type OpeningHandLlmRunConfig =
  | OpeningHandOpenAiRunConfig
  | OpenRouterRunConfig
  | LlamaCppRunConfig

export type TurnSimulationLlmRunConfig =
  | TurnSimulationOpenAiRunConfig
  | OpenRouterRunConfig
  | LlamaCppRunConfig

export type ResolvedOpeningHandLlmRunConfig =
  | OpeningHandOpenAiRunConfig
  | OpenRouterRunConfig
  | ResolvedLlamaCppRunConfig

export type ResolvedTurnSimulationLlmRunConfig =
  | TurnSimulationOpenAiRunConfig
  | OpenRouterRunConfig
  | ResolvedLlamaCppRunConfig

export type EvaluationLlmRunConfig =
  | OpenAiRunConfig
  | OpenRouterRunConfig
  | LlamaCppRunConfig

export type ResolvedEvaluationLlmRunConfig =
  | OpenAiRunConfig
  | OpenRouterRunConfig
  | ResolvedLlamaCppRunConfig

export type LlmRunQueueConfig = {
  maxConcurrentRuns: number
}

type LlmRunServiceTierOptions = {
  useFlexServiceTier?: boolean
}

export function buildProviderReasoningOptions(
  reasoningEffort: ReasoningEffort,
  reasoningSummariesEnabled: boolean
) {
  return {
    effort: reasoningEffort,
    ...(reasoningSummariesEnabled ? { summary: "auto" as const } : {}),
  }
}

export function buildOpenRouterReasoningOptions(
  reasoningEffort: ReasoningEffort,
  reasoningSummariesEnabled: boolean
) {
  return {
    effort: reasoningEffort,
    ...(reasoningSummariesEnabled
      ? { summary: "auto" as const }
      : { exclude: true as const }),
  }
}

export class LlmConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "LlmConfigurationError"
  }
}

export function getOpeningHandLlmRunConfig(
  preset: LlmModelPresetRunConfig,
  environment: Environment = process.env,
  serviceTierOptions: LlmRunServiceTierOptions = {}
): OpeningHandLlmRunConfig {
  const config = getLlmRunConfig(preset, environment, serviceTierOptions)

  if (config.provider === "openai") {
    return {
      ...config,
      openingHandMcpPublicUrl: getRequiredEnvironmentVariable(
        environment,
        "OPENING_HAND_MCP_PUBLIC_URL"
      ),
    }
  }

  return config
}

export function getTurnSimulationLlmRunConfig(
  preset: LlmModelPresetRunConfig,
  environment: Environment = process.env,
  serviceTierOptions: LlmRunServiceTierOptions = {}
): TurnSimulationLlmRunConfig {
  const config = getLlmRunConfig(preset, environment, serviceTierOptions)

  if (config.provider === "openai") {
    return {
      ...config,
      turnSimulationMcpPublicUrl: getRequiredEnvironmentVariable(
        environment,
        "TURN_SIMULATION_MCP_PUBLIC_URL"
      ),
    }
  }

  return config
}

export function getEvaluationLlmRunConfig(
  preset: LlmModelPresetRunConfig,
  environment: Environment = process.env
): EvaluationLlmRunConfig {
  return getLlmRunConfig(preset, environment)
}

export function getOpenRouterApiKey(environment: Environment = process.env) {
  return getRequiredEnvironmentVariable(environment, "OPENROUTER_API_KEY")
}

export function getLlmRunQueueConfig(
  environment: Environment = process.env
): LlmRunQueueConfig {
  return {
    maxConcurrentRuns: getRequiredPositiveIntegerEnvironmentVariable(
      environment,
      "LLM_RUN_QUEUE_MAX_CONCURRENT_RUNS"
    ),
  }
}

export function getGenericGameRulesReferenceEnabled(
  environment: Environment = process.env
) {
  return getOptionalBooleanEnvironmentVariable(
    environment,
    GENERIC_GAME_RULES_REFERENCE_ENABLED_ENVIRONMENT_VARIABLE,
    true
  )
}

export function getLogTurnActionFullActionListEnabled(
  environment: Environment = process.env
) {
  return getOptionalBooleanEnvironmentVariable(
    environment,
    LOG_TURN_ACTION_FULL_ACTION_LIST_ENABLED_ENVIRONMENT_VARIABLE,
    true
  )
}

function getLlmRunConfig(
  preset: LlmModelPresetRunConfig,
  environment: Environment,
  serviceTierOptions: LlmRunServiceTierOptions = {}
): OpenAiRunConfig | OpenRouterRunConfig | LlamaCppRunConfig {
  const maxOutputTokens = getRequiredPositiveIntegerEnvironmentVariable(
    environment,
    "LLM_MAX_OUTPUT_TOKENS"
  )
  const tokenCosts = getPresetTokenCosts(preset)
  const serviceTier =
    preset.supportsFlex && serviceTierOptions.useFlexServiceTier ? "flex" : null

  if (preset.provider === "openai") {
    return {
      apiKey: getRequiredEnvironmentVariable(environment, "OPENAI_API_KEY"),
      maxOutputTokens,
      model: preset.model,
      modelPresetId: preset.id,
      provider: preset.provider,
      reasoningEffort: preset.reasoningEffort,
      serviceTier,
      tokenCosts,
    }
  }

  if (preset.provider === "llamacpp") {
    return {
      apiKey:
        getOptionalEnvironmentVariable(environment, "LLAMACPP_API_KEY") ??
        "not-needed",
      baseUrl: getRequiredEnvironmentVariable(environment, "LLAMACPP_BASE_URL"),
      maxOutputTokens,
      model: preset.model,
      modelPresetId: preset.id,
      provider: preset.provider,
      reasoningEffort: null,
      serviceTier: null,
      stopWhenStepCount: getRequiredPositiveIntegerEnvironmentVariable(
        environment,
        "LLAMACPP_STOP_WHEN_STEP_COUNT"
      ),
      tokenCosts,
    }
  }

  return {
    apiKey: getRequiredEnvironmentVariable(environment, "OPENROUTER_API_KEY"),
    maxOutputTokens,
    model: preset.model,
    modelPresetId: preset.id,
    modelProvider: preset.openrouterModelProvider,
    provider: preset.provider,
    reasoningEffort: preset.reasoningEffort,
    serviceTier,
    stopWhenStepCount: getRequiredPositiveIntegerEnvironmentVariable(
      environment,
      "OPENROUTER_STOP_WHEN_STEP_COUNT"
    ),
    tokenCosts,
  }
}

function getPresetTokenCosts(preset: LlmModelPresetRunConfig): TokenPrice {
  return {
    inputDollarsPerMillion: preset.inputTokenCostUsdPerMillion,
    cachedInputDollarsPerMillion: preset.cachedInputTokenCostUsdPerMillion,
    outputDollarsPerMillion: preset.outputTokenCostUsdPerMillion,
  }
}

function getRequiredPositiveIntegerEnvironmentVariable(
  environment: Environment,
  environmentVariable: string
) {
  const value = getRequiredEnvironmentVariable(environment, environmentVariable)
  const parsedValue = Number(value)

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw new LlmConfigurationError(
      `${environmentVariable} must be a positive integer.`
    )
  }

  return parsedValue
}

function getRequiredEnvironmentVariable(
  environment: Environment,
  environmentVariable: string
) {
  const value = environment[environmentVariable]?.trim()

  if (!value) {
    throw new LlmConfigurationError(
      `Missing LLM environment variable(s): ${environmentVariable}. Add it to mtg-auto-deck-server/.env.`
    )
  }

  return value
}

function getOptionalEnvironmentVariable(
  environment: Environment,
  environmentVariable: string
) {
  return environment[environmentVariable]?.trim() || null
}

function getOptionalBooleanEnvironmentVariable(
  environment: Environment,
  environmentVariable: string,
  defaultValue: boolean
) {
  const value = environment[environmentVariable]?.trim().toLowerCase()

  if (!value) {
    return defaultValue
  }

  if (value === "true" || value === "1" || value === "yes") {
    return true
  }

  if (value === "false" || value === "0" || value === "no") {
    return false
  }

  throw new LlmConfigurationError(`${environmentVariable} must be true or false.`)
}
