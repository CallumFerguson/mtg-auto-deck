import type {
  ChatCompletion,
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions"
import { asRecord, getStringProperty } from "./llm-run-events.js"
import {
  isStructuredSimulationPrompt,
  type StructuredSimulationPrompt,
} from "./simulation-prompts.js"

export const OPENROUTER_EXPLICIT_CACHE_CONTROL = {
  type: "ephemeral",
} as const

type OpenRouterChatCompletionMessagesInput = {
  explicitPromptCachingEnabled: boolean
  input: unknown
  prompt?: StructuredSimulationPrompt | null
}

type OpenRouterTextContentPart = {
  type: "text"
  text: string
  cache_control?: typeof OPENROUTER_EXPLICIT_CACHE_CONTROL
}

export function buildOpenRouterChatCompletionMessages({
  explicitPromptCachingEnabled,
  input,
  prompt,
}: OpenRouterChatCompletionMessagesInput): ChatCompletionMessageParam[] {
  if (explicitPromptCachingEnabled && prompt) {
    return [
      {
        role: "user",
        content: buildOpenRouterExplicitCachingContent(prompt),
      },
    ] as unknown as ChatCompletionMessageParam[]
  }

  return [
    {
      role: "user",
      content: typeof input === "string" ? input : String(input ?? ""),
    },
  ]
}

export function buildOpenRouterExplicitCachingContent(
  prompt: StructuredSimulationPrompt
): OpenRouterTextContentPart[] {
  const stableReference = [prompt.cardReference, prompt.userGuidelines]
    .filter((part) => part !== null && part.trim())
    .join("\n\n")
  const cacheableBlocks = [prompt.baseInstructions, stableReference].filter(
    (part) => part.trim()
  )

  return [
    ...cacheableBlocks.map((text) => ({
      type: "text" as const,
      text,
      cache_control: OPENROUTER_EXPLICIT_CACHE_CONTROL,
    })),
    {
      type: "text",
      text: prompt.dynamicRunInput,
    },
  ]
}

export function assertOpenRouterChatCompletionResponse(
  value: unknown
): asserts value is ChatCompletion {
  const choices = asRecord(value).choices

  if (Array.isArray(choices) && choices.length > 0) {
    return
  }

  throw new Error(
    `OpenRouter Chat Completions API response did not include choices: ${getOpenRouterChatCompletionFailureDetail(value)}`
  )
}

export function restorePersistedStructuredSimulationPrompt(
  value: unknown,
  fullPrompt: string
) {
  return isStructuredSimulationPrompt(value)
    ? {
        ...value,
        fullPrompt,
      }
    : null
}

function getOpenRouterChatCompletionFailureDetail(value: unknown) {
  const responseRecord = asRecord(value)
  const errorRecord = asRecord(responseRecord.error)
  const errorMessage = getStringProperty(errorRecord, "message")
  const errorCode = getPrimitiveProperty(errorRecord, "code")
  const metadataDetail = getOpenRouterProviderErrorMetadataDetail(errorRecord)

  if (errorMessage && metadataDetail) {
    return `${errorMessage}: ${metadataDetail}`
  }

  return (
    errorMessage ??
    metadataDetail ??
    errorCode ??
    JSON.stringify(value) ??
    String(value)
  )
}

function getOpenRouterProviderErrorMetadataDetail(
  errorRecord: Record<string, unknown>
) {
  const metadataRecord = asRecord(errorRecord.metadata)
  const providerName =
    getStringProperty(metadataRecord, "provider_name") ??
    getStringProperty(metadataRecord, "providerName")
  const rawError = formatOpenRouterRawError(metadataRecord.raw)

  if (providerName && rawError) {
    return `${providerName} returned: ${rawError}`
  }

  if (providerName) {
    return `provider=${providerName}`
  }

  return rawError
}

function formatOpenRouterRawError(rawError: unknown): string | null {
  if (rawError === null || rawError === undefined) {
    return null
  }

  const rawErrorMessage = getOpenRouterRawErrorMessage(rawError)

  if (rawErrorMessage !== null) {
    return rawErrorMessage
  }

  if (typeof rawError === "string") {
    const trimmedRawError = rawError.trim()

    return trimmedRawError ? trimmedRawError : null
  }

  return JSON.stringify(rawError) ?? String(rawError)
}

function getOpenRouterRawErrorMessage(
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
      return getOpenRouterRawErrorMessage(
        JSON.parse(trimmedRawError),
        depth + 1
      )
    } catch {
      return trimmedRawError
    }
  }

  if (typeof rawError !== "object") {
    return String(rawError)
  }

  const rawErrorRecord = asRecord(rawError)

  for (const property of ["message", "detail", "error", "reason", "code"]) {
    const propertyMessage = getOpenRouterRawErrorMessage(
      rawErrorRecord[property],
      depth + 1
    )

    if (propertyMessage !== null) {
      return propertyMessage
    }
  }

  return null
}

function getPrimitiveProperty(
  record: Record<string, unknown>,
  property: string
) {
  const value = record[property]

  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : null
}
