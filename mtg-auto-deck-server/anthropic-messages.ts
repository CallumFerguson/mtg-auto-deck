import type { ReasoningEffort } from "./llm-config.js"
import { asRecord, getStringProperty } from "./llm-run-events.js"
import type { StructuredSimulationPrompt } from "./simulation-prompts.js"

export const ANTHROPIC_MCP_CLIENT_BETA = "mcp-client-2025-11-20"

const ANTHROPIC_CACHE_CONTROL_5M = {
  type: "ephemeral",
  ttl: "5m",
} as const

type AnthropicReasoningEffort = Extract<
  ReasoningEffort,
  "low" | "medium" | "high" | "xhigh" | "max"
>

export type AnthropicRequestPayload = ReturnType<
  typeof buildAnthropicRequestPayload
>

export function buildAnthropicRequestPayload({
  maxOutputTokens,
  mcpServerName,
  mcpServerUrl,
  model,
  prompt,
  reasoningEffort,
  reasoningSummariesEnabled,
}: {
  maxOutputTokens: number
  mcpServerName: string
  mcpServerUrl: string
  model: string
  prompt: StructuredSimulationPrompt
  reasoningEffort: ReasoningEffort
  reasoningSummariesEnabled: boolean
}) {
  return {
    providerType: "anthropic" as const,
    prompt,
    betas: [ANTHROPIC_MCP_CLIENT_BETA],
    max_tokens: maxOutputTokens,
    messages: [
      {
        role: "user" as const,
        content: prompt.dynamicRunInput,
      },
    ],
    mcp_servers: [
      {
        type: "url" as const,
        name: mcpServerName,
        url: mcpServerUrl,
      },
    ],
    model,
    output_config: {
      effort: getAnthropicReasoningEffort(reasoningEffort),
    },
    system: buildAnthropicSystemBlocks(prompt),
    thinking: {
      type: "adaptive" as const,
      display: reasoningSummariesEnabled
        ? ("summarized" as const)
        : ("omitted" as const),
    },
    tools: [
      {
        type: "mcp_toolset" as const,
        mcp_server_name: mcpServerName,
        cache_control: ANTHROPIC_CACHE_CONTROL_5M,
      },
    ],
  }
}

function buildAnthropicSystemBlocks(prompt: StructuredSimulationPrompt) {
  const cardReferenceAndGuidelines = [
    prompt.cardReference,
    prompt.userGuidelines,
  ]
    .filter((part) => part !== null && part.trim())
    .join("\n\n")

  return [
    {
      type: "text" as const,
      text: prompt.baseInstructions,
      cache_control: ANTHROPIC_CACHE_CONTROL_5M,
    },
    {
      type: "text" as const,
      text: cardReferenceAndGuidelines,
      cache_control: ANTHROPIC_CACHE_CONTROL_5M,
    },
  ]
}

function getAnthropicReasoningEffort(
  reasoningEffort: ReasoningEffort
): AnthropicReasoningEffort {
  if (reasoningEffort === "none" || reasoningEffort === "minimal") {
    throw new Error(
      "Anthropic model presets require low, medium, high, xhigh, or max reasoning effort."
    )
  }

  return reasoningEffort
}

export function getAnthropicMessageOutputText(response: unknown) {
  const content = asRecord(response).content

  if (!Array.isArray(content)) {
    return ""
  }

  return content
    .flatMap((block) => {
      const blockRecord = asRecord(block)

      return blockRecord.type === "text"
        ? (getStringProperty(blockRecord, "text") ?? "")
        : []
    })
    .join("")
}

export function assertCompletedAnthropicMessage(
  response: unknown,
  phaseLabel: string
) {
  const responseRecord = asRecord(response)
  const stopReason = getStringProperty(responseRecord, "stop_reason")

  if (stopReason === "end_turn") {
    return
  }

  throw new Error(
    `Anthropic ${phaseLabel} response ended with stop_reason "${stopReason ?? "unknown"}": ${getAnthropicMessageFailureDetail(response)}`
  )
}

function getAnthropicMessageFailureDetail(response: unknown) {
  const responseRecord = asRecord(response)
  const stopDetails = responseRecord.stop_details

  if (stopDetails) {
    return JSON.stringify(stopDetails)
  }

  const outputText = getAnthropicMessageOutputText(response)

  return outputText.trim() || JSON.stringify(response) || "unknown failure"
}

export function normalizeAnthropicUsage(usage: unknown) {
  const usageRecord = asRecord(usage)
  const outputDetails = asRecord(usageRecord.output_tokens_details)
  const thinkingTokens =
    getNumberProperty(outputDetails, "thinking_tokens", "thinkingTokens") ?? 0
  const normalizedOutputDetails = {
    ...outputDetails,
    reasoning_tokens:
      getNumberProperty(outputDetails, "reasoning_tokens", "reasoningTokens") ??
      thinkingTokens,
    thinking_tokens: thinkingTokens,
  }

  return {
    ...usageRecord,
    cache_creation_input_tokens:
      getNumberProperty(
        usageRecord,
        "cache_creation_input_tokens",
        "cacheCreationInputTokens"
      ) ?? 0,
    cache_read_input_tokens:
      getNumberProperty(
        usageRecord,
        "cache_read_input_tokens",
        "cacheReadInputTokens"
      ) ?? 0,
    input_tokens:
      getNumberProperty(usageRecord, "input_tokens", "inputTokens") ?? 0,
    output_tokens:
      getNumberProperty(usageRecord, "output_tokens", "outputTokens") ?? 0,
    output_tokens_details: normalizedOutputDetails,
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
