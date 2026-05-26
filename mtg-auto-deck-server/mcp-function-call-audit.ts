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

export async function runAuditedMcpFunctionCall<TOutput>({
  authContext,
  getOutputPayload,
  handler,
  inputPayload,
  logger = console,
  mcpFunctionName,
  recordCall = recordLlmRunMcpFunctionCall,
}: {
  authContext?: Pick<LlmRunMcpTokenContext, "llmRunId">
  getOutputPayload: (output: TOutput) => unknown
  handler: () => Promise<TOutput>
  inputPayload: unknown
  logger?: ErrorLogger
  mcpFunctionName: string
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
  outputPayload,
  recordCall,
  status,
}: {
  authContext?: Pick<LlmRunMcpTokenContext, "llmRunId">
  calledAt: Date
  inputPayload: unknown
  logger: ErrorLogger
  mcpFunctionName: string
  outputPayload: unknown
  recordCall: RecordMcpFunctionCall
  status: LlmRunMcpFunctionCallStatus
}) {
  if (!authContext) {
    return
  }

  try {
    await recordCall({
      llmRunId: authContext.llmRunId,
      mcpFunctionName,
      status,
      inputPayload,
      outputPayload,
      calledAt,
      completedAt: new Date(),
    })
  } catch (error) {
    logger.error("Failed to record MCP function call:", error)
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
