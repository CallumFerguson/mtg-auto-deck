import type { ChatCompletionMessageParam } from "openai/resources/chat/completions"
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
