import type { SimulationDebugLlmRunChunk } from "./deck-types"
export {
  formatSimulationRunChunksClipboardText,
  formatSimulationRunClipboardText,
} from "../../mtg-auto-deck-server/simulation-run-text.js"

export const TURN_PHASE_CHANGES = [
  "untap",
  "upkeep",
  "draw",
  "precombat_main",
  "combat",
  "postcombat_main",
  "end_step_cleanup",
] as const

export type TurnPhaseChange = (typeof TURN_PHASE_CHANGES)[number]

export type LoggedTurnAction = {
  action: string
  phaseChange: TurnPhaseChange | null
}

export type SimulationResultEntry = {
  id: string
  type: "chunk"
  chunk: SimulationDebugLlmRunChunk
}

const THINKING_PREVIEW_MAX_DELTA_CHUNKS = 100

export function getSimulationResultChunks(
  chunks: readonly SimulationDebugLlmRunChunk[]
) {
  const visibleChunks = chunks.filter(
    (chunk, index) => !isRedundantMcpCallFailedEvent(chunk, chunks[index + 1])
  )
  const hiddenToolStartChunks = getCompletedToolStartChunks(visibleChunks)
  const activeToolStartChunk = getActiveToolStartChunk(visibleChunks)

  return visibleChunks.filter(
    (chunk) =>
      !hiddenToolStartChunks.has(chunk) &&
      chunk !== activeToolStartChunk &&
      !isDeltaChunk(chunk) &&
      !isLifecycleChunk(chunk)
  )
}

export function getSimulationResultEntries(
  chunks: readonly SimulationDebugLlmRunChunk[]
): SimulationResultEntry[] {
  return getSimulationResultChunks(chunks).map((chunk) => ({
    id: `chunk-${getResultChunkId(chunk)}`,
    type: "chunk",
    chunk,
  }))
}

export function hasSimulationRunFinalParsedOutputChunk(
  chunks: readonly SimulationDebugLlmRunChunk[]
) {
  return chunks.some((chunk) => chunk.kind === "final_parsed_output")
}

export function getSimulationRunThinkingPreview(
  chunks: readonly SimulationDebugLlmRunChunk[]
) {
  const preview = [...chunks]
    .sort(
      (firstChunk, secondChunk) => firstChunk.sequence - secondChunk.sequence
    )
    .filter(isDeltaChunk)
    .slice(-THINKING_PREVIEW_MAX_DELTA_CHUNKS)
    .map(getDeltaText)
    .join("")
    .replace(/\s+/g, " ")
    .trim()

  return preview.length > 0 ? preview : null
}

export function getSimulationRunActiveToolCallName(
  chunks: readonly SimulationDebugLlmRunChunk[]
) {
  return getActiveToolStartChunk(chunks)?.mcpFunctionName ?? null
}

export function isSimulationRunLatestChunkOutputDelta(
  chunks: readonly SimulationDebugLlmRunChunk[]
) {
  return getLatestChunk(chunks)?.kind === "message_delta"
}

function getResultChunkId(chunk: SimulationDebugLlmRunChunk) {
  return chunk.id === null ? `live-${chunk.sequence}` : String(chunk.id)
}

function getCompletedToolStartChunks(
  chunks: readonly SimulationDebugLlmRunChunk[]
) {
  return new Set(
    getCompletedToolCallPairs(chunks).map((pair) => pair.startChunk)
  )
}

function getCompletedToolCallPairs(
  chunks: readonly SimulationDebugLlmRunChunk[]
) {
  const pendingToolStartChunks: SimulationDebugLlmRunChunk[] = []
  const completedToolCallPairs: {
    startChunk: SimulationDebugLlmRunChunk
    completeChunk: SimulationDebugLlmRunChunk
  }[] = []

  for (const chunk of chunks) {
    if (chunk.kind === "mcp_call_start") {
      pendingToolStartChunks.push(chunk)
      continue
    }

    if (chunk.kind !== "mcp_call_complete") {
      continue
    }

    const startChunkIndex = findMatchingToolStartChunkIndex(
      pendingToolStartChunks,
      chunk
    )

    if (startChunkIndex === -1) {
      continue
    }

    const [startChunk] = pendingToolStartChunks.splice(startChunkIndex, 1)
    completedToolCallPairs.push({
      startChunk,
      completeChunk: chunk,
    })
  }

  return completedToolCallPairs
}

function getActiveToolStartChunk(
  chunks: readonly SimulationDebugLlmRunChunk[]
) {
  const latestChunk = getLatestChunk(chunks)

  return latestChunk?.kind === "mcp_call_start" ? latestChunk : null
}

function getLatestChunk(chunks: readonly SimulationDebugLlmRunChunk[]) {
  return chunks.reduce<SimulationDebugLlmRunChunk | null>(
    (latestChunk, chunk) =>
      latestChunk === null || chunk.sequence > latestChunk.sequence
        ? chunk
        : latestChunk,
    null
  )
}

function findMatchingToolStartChunkIndex(
  pendingToolStartChunks: readonly SimulationDebugLlmRunChunk[],
  completeChunk: SimulationDebugLlmRunChunk
) {
  const completeCallKey = getMcpCallKey(completeChunk)

  if (completeCallKey !== null) {
    for (
      let index = pendingToolStartChunks.length - 1;
      index >= 0;
      index -= 1
    ) {
      if (getMcpCallKey(pendingToolStartChunks[index]) === completeCallKey) {
        return index
      }
    }
  }

  if (completeChunk.mcpFunctionName === null) {
    return -1
  }

  for (let index = pendingToolStartChunks.length - 1; index >= 0; index -= 1) {
    if (
      pendingToolStartChunks[index].mcpFunctionName ===
      completeChunk.mcpFunctionName
    ) {
      return index
    }
  }

  return -1
}

function isRedundantMcpCallFailedEvent(
  chunk: SimulationDebugLlmRunChunk,
  nextChunk: SimulationDebugLlmRunChunk | undefined
) {
  return (
    chunk.kind === "error" &&
    nextChunk?.kind === "mcp_call_complete" &&
    getPayloadString(chunk.payload, "item_id") !== null &&
    getPayloadString(chunk.payload, "item_id") === getMcpCallItemId(nextChunk)
  )
}

function isDeltaChunk(chunk: SimulationDebugLlmRunChunk) {
  return chunk.kind === "reasoning_delta" || chunk.kind === "message_delta"
}

function isLifecycleChunk(chunk: SimulationDebugLlmRunChunk) {
  return (
    chunk.kind === "reasoning_start" ||
    chunk.kind === "reasoning_done" ||
    chunk.kind === "output_start" ||
    chunk.kind === "output_done"
  )
}

function getDeltaText(chunk: SimulationDebugLlmRunChunk) {
  if (chunk.kind === "reasoning_delta") {
    return chunk.reasoningDelta ?? ""
  }

  if (chunk.kind === "message_delta") {
    return chunk.outputDelta ?? ""
  }

  return ""
}

function getMcpCallItemId(chunk: SimulationDebugLlmRunChunk) {
  return getPayloadString(asPayloadRecord(chunk.payload).item, "id")
}

function getMcpCallKey(chunk: SimulationDebugLlmRunChunk) {
  const payloadRecord = asPayloadRecord(chunk.payload)
  const itemRecord = asPayloadRecord(payloadRecord.item)

  return (
    getPayloadString(itemRecord, "id") ??
    getPayloadString(itemRecord, "callId") ??
    getPayloadString(itemRecord, "call_id") ??
    getPayloadString(payloadRecord, "toolCallId") ??
    getPayloadString(payloadRecord, "tool_call_id") ??
    getPayloadString(payloadRecord, "itemId") ??
    getPayloadString(payloadRecord, "item_id") ??
    getPayloadString(payloadRecord, "id")
  )
}

function asPayloadRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {}
}

function getPayloadString(value: unknown, property: string) {
  const propertyValue = asPayloadRecord(value)[property]

  return typeof propertyValue === "string" ? propertyValue : null
}
