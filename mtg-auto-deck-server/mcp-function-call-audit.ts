import {
  recordLlmRunMcpFunctionCall,
  type LlmRunMcpFunctionCallStatus,
  type LlmRunMcpTokenContext,
  type RecordLlmRunMcpFunctionCallInput,
} from "./simulations-postgres.js"

type ErrorLogger = {
  error: (...data: unknown[]) => void
}

type RecordMcpFunctionCall = (
  input: RecordLlmRunMcpFunctionCallInput
) => Promise<unknown>

type OnMcpFunctionCallRecorded = (
  input: RecordLlmRunMcpFunctionCallInput
) => Promise<unknown> | unknown

export async function runAuditedMcpFunctionCall<TOutput>({
  authContext,
  getOutputPayload,
  handler,
  inputPayload,
  logger = console,
  mcpFunctionName,
  onRecorded,
  recordCall = recordLlmRunMcpFunctionCall,
}: {
  authContext?: Pick<LlmRunMcpTokenContext, "llmRunId">
  getOutputPayload: (output: TOutput) => unknown
  handler: () => Promise<TOutput>
  inputPayload: unknown
  logger?: ErrorLogger
  mcpFunctionName: string
  onRecorded?: OnMcpFunctionCallRecorded
  recordCall?: RecordMcpFunctionCall
}) {
  const calledAt = new Date()

  try {
    const output = await handler()
    let outputPayload: unknown

    try {
      outputPayload = getOutputPayload(output)
    } catch (error) {
      logger.error("Failed to normalize MCP function call output:", error)
      outputPayload = output
    }

    await recordMcpFunctionCallSafely({
      authContext,
      calledAt,
      inputPayload,
      logger,
      mcpFunctionName,
      onRecorded,
      outputPayload,
      recordCall,
      status: "completed",
    })

    return output
  } catch (error) {
    await recordMcpFunctionCallSafely({
      authContext,
      calledAt,
      inputPayload,
      logger,
      mcpFunctionName,
      onRecorded,
      outputPayload: createMcpFunctionCallFailureOutput(error),
      recordCall,
      status: "failed",
    })

    throw error
  }
}

export function createMcpFunctionCallFailureOutput(error: unknown) {
  return {
    error: {
      name: error instanceof Error ? error.name : null,
      message: getErrorMessage(error),
    },
  }
}

async function recordMcpFunctionCallSafely({
  authContext,
  calledAt,
  inputPayload,
  logger,
  mcpFunctionName,
  onRecorded,
  outputPayload,
  recordCall,
  status,
}: {
  authContext?: Pick<LlmRunMcpTokenContext, "llmRunId">
  calledAt: Date
  inputPayload: unknown
  logger: ErrorLogger
  mcpFunctionName: string
  onRecorded?: OnMcpFunctionCallRecorded
  outputPayload: unknown
  recordCall: RecordMcpFunctionCall
  status: LlmRunMcpFunctionCallStatus
}) {
  if (!authContext) {
    return
  }

  try {
    const record = {
      llmRunId: authContext.llmRunId,
      mcpFunctionName,
      status,
      inputPayload,
      outputPayload,
      calledAt,
      completedAt: new Date(),
    }

    await recordCall(record)

    if (!onRecorded) {
      return
    }

    try {
      await onRecorded(record)
    } catch (error) {
      logger.error("Failed to publish MCP function call stream update:", error)
    }
  } catch (error) {
    logger.error("Failed to record MCP function call:", error)
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
