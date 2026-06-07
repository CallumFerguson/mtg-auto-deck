export type TokenPrice = {
  inputDollarsPerMillion: number | null
  cachedInputDollarsPerMillion: number | null
  cacheWriteInputDollarsPerMillion?: number | null
  outputDollarsPerMillion: number | null
}

export type LlmTokenUsageCounts = {
  inputTokens: number | null
  cachedInputTokens: number | null
  outputTokens: number | null
  reasoningTokens: number
  totalTokens: number | null
}

export function getLlmTokenUsageCounts(usage: unknown): LlmTokenUsageCounts {
  const usageRecord = asRecord(usage)
  const inputTokens = getNumberProperty(
    usageRecord,
    "input_tokens",
    "inputTokens",
    "prompt_tokens",
    "promptTokens"
  )
  const inputDetails = asRecord(
    getFirstDefinedProperty(usageRecord, [
      "input_tokens_details",
      "inputTokensDetails",
      "prompt_tokens_details",
      "promptTokensDetails",
    ])
  )
  const cacheReadInputTokens = getNumberProperty(
    usageRecord,
    "cache_read_input_tokens",
    "cacheReadInputTokens"
  )
  const cachedInputTokens =
    cacheReadInputTokens ??
    (inputTokens === null
      ? null
      : Math.min(
          getNumberProperty(inputDetails, "cached_tokens", "cachedTokens") ?? 0,
          inputTokens
        ))
  const rawOutputTokens = getNumberProperty(
    usageRecord,
    "output_tokens",
    "outputTokens",
    "completion_tokens",
    "completionTokens"
  )
  const outputDetails = asRecord(
    getFirstDefinedProperty(usageRecord, [
      "output_tokens_details",
      "outputTokensDetails",
      "completion_tokens_details",
      "completionTokensDetails",
    ])
  )
  const reasoningTokens =
    getNumberProperty(
      outputDetails,
      "reasoning_tokens",
      "reasoningTokens",
      "thinking_tokens",
      "thinkingTokens"
    ) ?? 0
  const outputTokens =
    rawOutputTokens === null
      ? null
      : Math.max(rawOutputTokens - reasoningTokens, 0)
  const cacheCreationInputTokens =
    getNumberProperty(
      usageRecord,
      "cache_creation_input_tokens",
      "cacheCreationInputTokens"
    ) ?? 0
  const totalTokens =
    getNumberProperty(usageRecord, "total_tokens", "totalTokens") ??
    (inputTokens === null || rawOutputTokens === null
      ? null
      : inputTokens +
        cacheCreationInputTokens +
        (cacheReadInputTokens ?? 0) +
        rawOutputTokens)

  return {
    inputTokens,
    cachedInputTokens,
    outputTokens,
    reasoningTokens,
    totalTokens,
  }
}

export function estimatePresetTokenCostUsd({
  tokenCosts,
  usage,
}: {
  tokenCosts: TokenPrice
  usage: unknown
}) {
  const inputRate = getCostValue(tokenCosts.inputDollarsPerMillion)
  const cachedInputRate = getCostValue(tokenCosts.cachedInputDollarsPerMillion)
  const cacheWriteInputRate = getCostValue(
    tokenCosts.cacheWriteInputDollarsPerMillion
  )
  const outputRate = getCostValue(tokenCosts.outputDollarsPerMillion)

  if (inputRate === null || cachedInputRate === null || outputRate === null) {
    return null
  }

  const usageRecord = asRecord(usage)
  const inputTokens = getNumberProperty(
    usageRecord,
    "input_tokens",
    "inputTokens",
    "prompt_tokens",
    "promptTokens"
  )
  const outputTokens = getNumberProperty(
    usageRecord,
    "output_tokens",
    "outputTokens",
    "completion_tokens",
    "completionTokens"
  )

  if (inputTokens === null || outputTokens === null) {
    return null
  }

  const anthropicCacheCreationTokens = getNumberProperty(
    usageRecord,
    "cache_creation_input_tokens",
    "cacheCreationInputTokens"
  )
  const anthropicCacheReadTokens = getNumberProperty(
    usageRecord,
    "cache_read_input_tokens",
    "cacheReadInputTokens"
  )

  if (
    anthropicCacheCreationTokens !== null ||
    anthropicCacheReadTokens !== null
  ) {
    const cacheCreationTokens = anthropicCacheCreationTokens ?? 0
    const cacheReadTokens = anthropicCacheReadTokens ?? 0

    if (cacheCreationTokens > 0 && cacheWriteInputRate === null) {
      return null
    }

    return (
      (inputTokens * inputRate) / 1_000_000 +
      (cacheReadTokens * cachedInputRate) / 1_000_000 +
      (cacheCreationTokens * (cacheWriteInputRate ?? 0)) / 1_000_000 +
      (outputTokens * outputRate) / 1_000_000
    )
  }

  const inputDetails = asRecord(
    getFirstDefinedProperty(usageRecord, [
      "input_tokens_details",
      "inputTokensDetails",
      "prompt_tokens_details",
      "promptTokensDetails",
    ])
  )
  const cachedInputTokens = Math.min(
    getNumberProperty(inputDetails, "cached_tokens", "cachedTokens") ?? 0,
    inputTokens
  )
  const cacheWriteInputTokens = Math.min(
    getNumberProperty(
      inputDetails,
      "cache_write_tokens",
      "cacheWriteTokens"
    ) ?? 0,
    inputTokens - cachedInputTokens
  )
  const standardInputTokens =
    inputTokens - cachedInputTokens - cacheWriteInputTokens

  if (cacheWriteInputTokens > 0 && cacheWriteInputRate === null) {
    return null
  }

  return (
    (standardInputTokens * inputRate) / 1_000_000 +
    (cachedInputTokens * cachedInputRate) / 1_000_000 +
    (cacheWriteInputTokens * (cacheWriteInputRate ?? 0)) / 1_000_000 +
    (outputTokens * outputRate) / 1_000_000
  )
}

export function estimatePartialLlmRunCostUsd({
  fullPromptCharCount,
  tokenCosts,
}: {
  fullPromptCharCount: number
  tokenCosts: Pick<TokenPrice, "cachedInputDollarsPerMillion">
}) {
  const cachedInputRate = getCostValue(tokenCosts.cachedInputDollarsPerMillion)

  if (cachedInputRate === null) {
    return null
  }

  const cachedInputTokens = estimateTokensFromCharCount(fullPromptCharCount)

  if (cachedInputTokens === null) {
    return null
  }

  return (cachedInputTokens * cachedInputRate) / 1_000_000
}

export function estimateRunningLlmRunInitialCostUsd({
  fullPromptCharCount,
  tokenCosts,
}: {
  fullPromptCharCount: number
  tokenCosts: Pick<TokenPrice, "cachedInputDollarsPerMillion">
}) {
  const cachedInputRate = getCostValue(tokenCosts.cachedInputDollarsPerMillion)

  if (cachedInputRate === null) {
    return null
  }

  const cachedInputTokens =
    estimateFractionalTokensFromCharCount(fullPromptCharCount)

  if (cachedInputTokens === null) {
    return null
  }

  return (cachedInputTokens * cachedInputRate) / 1_000_000
}

export function getOpenRouterReportedCostUsd(usage: unknown) {
  const costUsd = getNumberProperty(asRecord(usage), "cost")

  return costUsd !== null && costUsd >= 0 ? costUsd : null
}

export function applyLlmRunEstimatedCostServiceTierDiscount({
  estimatedCostUsd,
  processingMode,
  serviceTier,
}: {
  estimatedCostUsd: number | null
  processingMode?: string | null | undefined
  serviceTier: string | null | undefined
}) {
  if (estimatedCostUsd === null) {
    return null
  }

  return (
    serviceTier === "flex" ||
    processingMode === "openai_batch" ||
    processingMode === "anthropic_batch"
  )
    ? estimatedCostUsd / 2
    : estimatedCostUsd
}

export function formatUsdCostAsCents(costUsd: number | null | undefined) {
  if (
    costUsd === null ||
    costUsd === undefined ||
    !Number.isFinite(costUsd) ||
    costUsd < 0
  ) {
    return null
  }

  const cents = costUsd * 100
  const roundedCents = Math.round(cents * 10) / 10

  if (cents > 0 && roundedCents === 0) {
    return "<0.1"
  }

  return roundedCents.toFixed(1)
}

export function formatUsdCostAsCentLabel(costUsd: number | null | undefined) {
  const cents = formatUsdCostAsCents(costUsd)

  return cents === null ? null : `${cents}c`
}

export function formatPreferredLlmRunCostAsCents({
  estimatedCostUsd,
  openrouterReportedCostUsd,
}: {
  estimatedCostUsd: number | null
  openrouterReportedCostUsd: number | null
}) {
  return formatUsdCostAsCents(openrouterReportedCostUsd ?? estimatedCostUsd)
}

export function aggregateOpenRouterUsage(
  usageValues: readonly unknown[]
): Record<string, unknown> {
  const usageRecords = usageValues.map(asRecord)

  if (usageRecords.length === 0) {
    return {}
  }

  const inputTokens = sumRequiredNumberProperties(usageRecords, [
    "inputTokens",
    "input_tokens",
    "promptTokens",
    "prompt_tokens",
  ])
  const outputTokens = sumRequiredNumberProperties(usageRecords, [
    "outputTokens",
    "output_tokens",
    "completionTokens",
    "completion_tokens",
  ])
  const reportedTotalTokens = sumRequiredNumberProperties(usageRecords, [
    "totalTokens",
    "total_tokens",
  ])
  const aggregate: Record<string, unknown> = {}

  if (inputTokens !== null) {
    const cachedTokens = Math.min(
      sumOptionalNestedNumberProperties(
        usageRecords,
        [
          "inputTokensDetails",
          "input_tokens_details",
          "promptTokensDetails",
          "prompt_tokens_details",
        ],
        ["cachedTokens", "cached_tokens"]
      ),
      inputTokens
    )
    const cacheWriteTokens = Math.min(
      sumOptionalNestedNumberProperties(
        usageRecords,
        [
          "inputTokensDetails",
          "input_tokens_details",
          "promptTokensDetails",
          "prompt_tokens_details",
        ],
        ["cacheWriteTokens", "cache_write_tokens"]
      ),
      inputTokens - cachedTokens
    )

    aggregate.inputTokens = inputTokens
    aggregate.inputTokensDetails = {
      cachedTokens,
      cacheWriteTokens,
    }
  }

  if (outputTokens !== null) {
    aggregate.outputTokens = outputTokens
    aggregate.outputTokensDetails = {
      reasoningTokens: sumOptionalNestedNumberProperties(
        usageRecords,
        [
          "outputTokensDetails",
          "output_tokens_details",
          "completionTokensDetails",
          "completion_tokens_details",
        ],
        ["reasoningTokens", "reasoning_tokens"]
      ),
    }
  }

  if (reportedTotalTokens !== null) {
    aggregate.totalTokens = reportedTotalTokens
  } else if (inputTokens !== null && outputTokens !== null) {
    aggregate.totalTokens = inputTokens + outputTokens
  }

  const cost = sumRequiredNumberProperties(usageRecords, ["cost"])

  if (cost !== null) {
    aggregate.cost = cost
  }

  const costDetails = aggregateOpenRouterCostDetails(usageRecords)

  if (Object.keys(costDetails).length > 0) {
    aggregate.costDetails = costDetails
  }

  return aggregate
}

function getCostValue(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null
}

function estimateTokensFromCharCount(charCount: number) {
  if (!Number.isFinite(charCount) || charCount < 0) {
    return null
  }

  return Math.floor(charCount / 4)
}

function estimateFractionalTokensFromCharCount(charCount: number) {
  if (!Number.isFinite(charCount) || charCount < 0) {
    return null
  }

  return charCount / 4
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {}
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

function sumRequiredNumberProperties(
  records: readonly Record<string, unknown>[],
  properties: readonly string[]
) {
  let total = 0

  for (const record of records) {
    const value = getNumberProperty(record, ...properties)

    if (value === null) {
      return null
    }

    total += value
  }

  return total
}

function sumOptionalNestedNumberProperties(
  records: readonly Record<string, unknown>[],
  parentProperties: readonly string[],
  properties: readonly string[]
) {
  return records.reduce((total, record) => {
    const nestedRecord = asRecord(
      getFirstDefinedProperty(record, parentProperties)
    )
    const value = getNumberProperty(nestedRecord, ...properties)

    return total + (value ?? 0)
  }, 0)
}

function aggregateOpenRouterCostDetails(
  usageRecords: readonly Record<string, unknown>[]
) {
  const costDetailsRecords = usageRecords.map((record) =>
    asRecord(record.costDetails ?? record.cost_details)
  )
  const costDetails: Record<string, number> = {}
  const upstreamInferenceCost = sumRequiredNumberProperties(
    costDetailsRecords,
    ["upstreamInferenceCost", "upstream_inference_cost"]
  )
  const upstreamInferenceInputCost = sumRequiredNumberProperties(
    costDetailsRecords,
    ["upstreamInferenceInputCost", "upstream_inference_input_cost"]
  )
  const upstreamInferenceOutputCost = sumRequiredNumberProperties(
    costDetailsRecords,
    ["upstreamInferenceOutputCost", "upstream_inference_output_cost"]
  )

  if (upstreamInferenceCost !== null) {
    costDetails.upstreamInferenceCost = upstreamInferenceCost
  }

  if (upstreamInferenceInputCost !== null) {
    costDetails.upstreamInferenceInputCost = upstreamInferenceInputCost
  }

  if (upstreamInferenceOutputCost !== null) {
    costDetails.upstreamInferenceOutputCost = upstreamInferenceOutputCost
  }

  return costDetails
}

function getFirstDefinedProperty(
  record: Record<string, unknown>,
  properties: readonly string[]
) {
  for (const property of properties) {
    if (record[property] !== undefined) {
      return record[property]
    }
  }

  return undefined
}
