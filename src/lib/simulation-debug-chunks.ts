import type { SimulationDebugLlmRunChunk } from "./deck-types"

export type FormattedDebugChunkBlock =
  | {
      id: string
      type: "reasoning" | "output"
      text: string
      chunks: SimulationDebugLlmRunChunk[]
    }
  | {
      id: string
      type: "event"
      chunk: SimulationDebugLlmRunChunk
    }

export function formatDebugChunkBlocks(
  chunks: readonly SimulationDebugLlmRunChunk[],
  {
    omitWhitespaceOnlyDeltaBlocks = false,
  }: {
    omitWhitespaceOnlyDeltaBlocks?: boolean
  } = {}
): FormattedDebugChunkBlock[] {
  const blocks: FormattedDebugChunkBlock[] = []

  for (const chunk of chunks) {
    const deltaType = getDebugChunkDeltaType(chunk)
    const chunkBlockId = getDebugChunkBlockId(chunk)

    if (!deltaType) {
      blocks.push({
        id: `event-${chunkBlockId}`,
        type: "event",
        chunk,
      })
      continue
    }

    const deltaText = getDebugChunkDeltaText(chunk, deltaType)
    const previousBlock = blocks[blocks.length - 1]

    if (previousBlock?.type === deltaType) {
      previousBlock.text += deltaText
      previousBlock.chunks.push(chunk)
      continue
    }

    blocks.push({
      id: `${deltaType}-${chunkBlockId}`,
      type: deltaType,
      text: deltaText,
      chunks: [chunk],
    })
  }

  if (!omitWhitespaceOnlyDeltaBlocks) {
    return blocks
  }

  return blocks.filter(
    (block) => block.type === "event" || block.text.trim().length > 0
  )
}

export function getDebugChunkBlockId(chunk: SimulationDebugLlmRunChunk) {
  return chunk.id === null ? `live-${chunk.sequence}` : String(chunk.id)
}

export function getDebugDeltaChunkLabel(
  chunk: SimulationDebugLlmRunChunk,
  deltaType: "reasoning" | "output"
) {
  const label = deltaType === "reasoning" ? "Reasoning" : "Output"
  const deltaText = getDebugChunkDeltaText(chunk, deltaType)

  return `${label} chunk ${chunk.sequence}: ${JSON.stringify(deltaText)}`
}

function getDebugChunkDeltaType(chunk: SimulationDebugLlmRunChunk) {
  if (chunk.kind === "reasoning_delta") {
    return "reasoning" as const
  }

  if (chunk.kind === "message_delta") {
    return "output" as const
  }

  return null
}

function getDebugChunkDeltaText(
  chunk: SimulationDebugLlmRunChunk,
  deltaType: "reasoning" | "output"
) {
  if (deltaType === "reasoning") {
    return chunk.reasoningDelta ?? ""
  }

  return chunk.outputDelta ?? ""
}
