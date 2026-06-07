import type {
  ChatCompletion,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionTool,
} from "openai/resources/chat/completions"
import { z } from "zod/v4"
import { asRecord, getStringProperty } from "./llm-run-events.js"
import { throwIfRuntimeAborted } from "./llm-runtime-cancellation.js"

export type LlamaCppToolDefinition = {
  name: string
  description: string
  inputSchema: z.ZodObject
}

export type LlamaCppChatCompletionRequestPayload = {
  providerType: "llamacpp" | "openrouter"
  model: string
  max_tokens: number
  messages: ChatCompletionMessageParam[]
  metadata: Record<string, string>
  parallel_tool_calls: false
  tools: ChatCompletionTool[]
  stopWhenStepCount: number
  extraBody?: Record<string, unknown>
}

export type LlamaCppChatCompletionCreateNonStreaming = (
  body: ChatCompletionCreateParamsNonStreaming,
  options: { signal: AbortSignal }
) => Promise<ChatCompletion>

export type LlamaCppChatCompletionToolCall = {
  argumentsText: string
  id: string
  name: string
  rawToolCall: unknown
}

export type LlamaCppChatCompletionResult = {
  outputText: string
  rawResponse?: unknown
  usage: unknown
}

type LlamaCppChatCompletionStepResult = {
  finishReason: string | null
  outputText: string
  rawMessage: unknown
  toolCalls: LlamaCppChatCompletionToolCall[]
  usage: unknown
}

export function createLlamaCppChatCompletionTools(
  toolDefinitions: readonly LlamaCppToolDefinition[]
): ChatCompletionTool[] {
  return toolDefinitions.map((definition) => ({
    type: "function",
    function: {
      name: definition.name,
      description: definition.description,
      parameters: createJsonSchemaParameters(definition.inputSchema),
    },
  }))
}

export async function collectLlamaCppChatCompletionNonStreaming({
  callTool,
  createChatCompletion,
  requestPayload,
  signal,
  toolDefinitions,
}: {
  callTool: (
    name: string,
    args: Record<string, unknown>,
    signal: AbortSignal
  ) => Promise<unknown>
  createChatCompletion: LlamaCppChatCompletionCreateNonStreaming
  requestPayload: LlamaCppChatCompletionRequestPayload
  signal: AbortSignal
  toolDefinitions: readonly LlamaCppToolDefinition[]
}): Promise<LlamaCppChatCompletionResult> {
  const messages = requestPayload.messages.slice()
  const rawResponses: unknown[] = []
  const toolDefinitionsByName = new Map(
    toolDefinitions.map((definition) => [definition.name, definition])
  )

  for (
    let stepNumber = 1;
    stepNumber <= requestPayload.stopWhenStepCount;
    stepNumber += 1
  ) {
    throwIfRuntimeAborted(signal)

    const response = await createChatCompletion(
      createNonStreamingChatCompletionApiPayload(requestPayload, messages),
      { signal }
    )
    const stepResult = collectLlamaCppChatCompletionNonStreamingStep(
      response,
      stepNumber
    )
    const { toolCalls } = stepResult

    rawResponses.push(response)

    if (toolCalls.length === 0) {
      const { outputText } = stepResult

      if (!outputText.trim()) {
        throw new Error(
          `${formatChatCompletionProviderLabel(requestPayload.providerType)} chat completion did not include final assistant content: ${getEmptyFinalContentFailureDetail(stepResult)}`
        )
      }

      return {
        outputText,
        rawResponse: { responses: rawResponses },
        usage: stepResult.usage,
      }
    }

    messages.push(
      createAssistantToolCallMessage(
        stepResult.outputText,
        toolCalls,
        stepResult.rawMessage
      )
    )

    for (const toolCall of toolCalls) {
      const toolDefinition = toolDefinitionsByName.get(toolCall.name)

      if (!toolDefinition) {
        throw new Error(`llama.cpp requested unknown tool: ${toolCall.name}.`)
      }

      const toolInput = parseAndValidateToolArguments(toolCall, toolDefinition)
      const toolOutput = await callTool(toolCall.name, toolInput, signal)

      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: formatToolOutputForMessage(toolOutput),
      })
    }
  }

  throw new Error(
    getStopWhenStepCountFailureMessage(requestPayload)
  )
}

function formatChatCompletionProviderLabel(
  providerType: LlamaCppChatCompletionRequestPayload["providerType"]
) {
  return providerType === "openrouter" ? "OpenRouter" : "llama.cpp"
}

function getStopWhenStepCountFailureMessage(
  requestPayload: LlamaCppChatCompletionRequestPayload
) {
  return requestPayload.providerType === "openrouter"
    ? `OpenRouter LLM run reached stopWhenStepCount (${requestPayload.stopWhenStepCount}) before producing final output.`
    : `llama.cpp LLM run reached LLAMACPP_STOP_WHEN_STEP_COUNT (${requestPayload.stopWhenStepCount}) before producing final output.`
}

function getEmptyFinalContentFailureDetail({
  finishReason,
  rawMessage,
}: Pick<LlamaCppChatCompletionStepResult, "finishReason" | "rawMessage">) {
  return `finish_reason=${finishReason ?? "unknown"} message=${JSON.stringify(rawMessage)}`
}

export function getLlamaCppChatCompletionToolCalls(
  message: unknown,
  stepNumber: number
): LlamaCppChatCompletionToolCall[] {
  const toolCalls = asRecord(message).tool_calls

  if (!Array.isArray(toolCalls)) {
    return []
  }

  return toolCalls.map((toolCall, index) =>
    normalizeLlamaCppToolCall(toolCall, stepNumber, index)
  )
}

function collectLlamaCppChatCompletionNonStreamingStep(
  response: ChatCompletion,
  stepNumber: number
): LlamaCppChatCompletionStepResult {
  const choice = response.choices[0]
  const message = choice?.message ?? null

  return {
    finishReason: choice?.finish_reason ?? null,
    outputText: getLlamaCppChatCompletionMessageText(message),
    rawMessage: message,
    toolCalls: getLlamaCppChatCompletionToolCalls(message, stepNumber),
    usage: response.usage ?? {},
  }
}

function createJsonSchemaParameters(inputSchema: z.ZodObject) {
  const schema = z.toJSONSchema(inputSchema, {
    target: "draft-07",
  }) as Record<string, unknown>

  return Object.fromEntries(
    Object.entries(schema).filter(([key]) => key !== "~standard")
  )
}

function createNonStreamingChatCompletionApiPayload(
  requestPayload: LlamaCppChatCompletionRequestPayload,
  messages: ChatCompletionMessageParam[]
): ChatCompletionCreateParamsNonStreaming {
  const payload: ChatCompletionCreateParamsNonStreaming = {
    model: requestPayload.model,
    max_tokens: requestPayload.max_tokens,
    messages,
    metadata: requestPayload.metadata,
    parallel_tool_calls: requestPayload.parallel_tool_calls,
    tools: requestPayload.tools,
    stream: false,
    ...requestPayload.extraBody,
  }

  return payload
}

function getLlamaCppChatCompletionMessageText(message: unknown) {
  const content = asRecord(message).content

  if (typeof content === "string") {
    return content
  }

  if (!Array.isArray(content)) {
    return ""
  }

  return content
    .flatMap((part) => {
      const partRecord = asRecord(part)

      return partRecord.type === "text"
        ? [getStringProperty(partRecord, "text") ?? ""]
        : []
    })
    .join("")
}

function normalizeLlamaCppToolCall(
  toolCall: unknown,
  stepNumber: number,
  index: number
): LlamaCppChatCompletionToolCall {
  const toolCallRecord = asRecord(toolCall)
  const functionRecord = asRecord(toolCallRecord.function)
  const customRecord = asRecord(toolCallRecord.custom)
  const name =
    getStringProperty(functionRecord, "name") ??
    getStringProperty(toolCallRecord, "name") ??
    getStringProperty(customRecord, "name")

  if (!name) {
    throw new Error("llama.cpp returned a tool call without a function name.")
  }

  return {
    argumentsText:
      getStringProperty(functionRecord, "arguments") ??
      getStringProperty(toolCallRecord, "arguments") ??
      getStringProperty(customRecord, "input") ??
      "{}",
    id:
      getStringProperty(toolCallRecord, "id") ??
      `llamacpp_call_${stepNumber}_${index + 1}`,
    name,
    rawToolCall: toolCall,
  }
}

function createAssistantToolCallMessage(
  outputText: string,
  toolCalls: readonly LlamaCppChatCompletionToolCall[],
  rawMessage: unknown
): ChatCompletionMessageParam {
  return {
    role: "assistant",
    content: outputText || null,
    ...getPreservedAssistantReasoningFields(rawMessage),
    tool_calls: toolCalls.map(createOpenAiToolCall),
  } as ChatCompletionMessageParam
}

function getPreservedAssistantReasoningFields(rawMessage: unknown) {
  const messageRecord = asRecord(rawMessage)
  const preservedFields: Record<string, unknown> = {}
  const reasoningContent = getStringProperty(messageRecord, "reasoning_content")
  const reasoning = getStringProperty(messageRecord, "reasoning")
  const reasoningDetails = messageRecord.reasoning_details

  if (reasoningContent) {
    preservedFields.reasoning_content = reasoningContent
  }

  if (reasoning) {
    preservedFields.reasoning = reasoning
    preservedFields.reasoning_content ??= reasoning
  }

  if (Array.isArray(reasoningDetails)) {
    preservedFields.reasoning_details = reasoningDetails
  }

  return preservedFields
}

function createOpenAiToolCall(
  toolCall: LlamaCppChatCompletionToolCall
): ChatCompletionMessageToolCall {
  return {
    id: toolCall.id,
    type: "function",
    function: {
      name: toolCall.name,
      arguments: toolCall.argumentsText,
    },
  }
}

function parseAndValidateToolArguments(
  toolCall: LlamaCppChatCompletionToolCall,
  toolDefinition: LlamaCppToolDefinition
) {
  let parsedArguments: unknown

  try {
    parsedArguments = toolCall.argumentsText.trim()
      ? JSON.parse(toolCall.argumentsText)
      : {}
  } catch (error) {
    throw new Error(
      `llama.cpp tool ${toolCall.name} arguments were not valid JSON.`,
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
      `llama.cpp tool ${toolCall.name} arguments must be a JSON object.`
    )
  }

  const parsedInput = toolDefinition.inputSchema.safeParse(parsedArguments)

  if (!parsedInput.success) {
    throw new Error(
      `llama.cpp tool ${toolCall.name} arguments did not match schema: ${parsedInput.error.message}`
    )
  }

  return parsedInput.data as Record<string, unknown>
}

function formatToolOutputForMessage(toolOutput: unknown) {
  if (typeof toolOutput === "string") {
    return toolOutput
  }

  return JSON.stringify(toolOutput) ?? "null"
}
