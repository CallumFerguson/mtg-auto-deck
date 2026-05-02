type OpenAiTokenPrice = {
  inputDollarsPerMillion: number
  cachedInputDollarsPerMillion: number | null
  outputDollarsPerMillion: number
}

export type OpenAiPriceEstimate = {
  cents: number
  formattedCents: string
}

const OPENAI_TOKEN_PRICES: Record<string, OpenAiTokenPrice> = {
  "gpt-5.5": {
    inputDollarsPerMillion: 5,
    cachedInputDollarsPerMillion: 0.5,
    outputDollarsPerMillion: 30,
  },
  "gpt-5.5-pro": {
    inputDollarsPerMillion: 30,
    cachedInputDollarsPerMillion: null,
    outputDollarsPerMillion: 180,
  },
  "gpt-5.4": {
    inputDollarsPerMillion: 2.5,
    cachedInputDollarsPerMillion: 0.25,
    outputDollarsPerMillion: 15,
  },
  "gpt-5.4-mini": {
    inputDollarsPerMillion: 0.75,
    cachedInputDollarsPerMillion: 0.075,
    outputDollarsPerMillion: 4.5,
  },
  "gpt-5.4-nano": {
    inputDollarsPerMillion: 0.2,
    cachedInputDollarsPerMillion: 0.02,
    outputDollarsPerMillion: 1.25,
  },
  "gpt-5.4-pro": {
    inputDollarsPerMillion: 30,
    cachedInputDollarsPerMillion: null,
    outputDollarsPerMillion: 180,
  },
}

export function estimateOpenAiTokenPriceCents({
  model,
  usage,
}: {
  model: string
  usage: unknown
}): OpenAiPriceEstimate | null {
  const normalizedModel = normalizeSupportedOpenAiModel(model)

  if (!normalizedModel) {
    return null
  }

  const usageRecord = asRecord(usage)
  const inputTokens = getNumberProperty(usageRecord, "input_tokens")
  const outputTokens = getNumberProperty(usageRecord, "output_tokens")

  if (inputTokens === null || outputTokens === null) {
    return null
  }

  const price = OPENAI_TOKEN_PRICES[normalizedModel]
  const inputDetails = asRecord(usageRecord.input_tokens_details)
  const cachedInputTokens = Math.min(
    getNumberProperty(inputDetails, "cached_tokens") ?? 0,
    inputTokens
  )
  const standardInputTokens = inputTokens - cachedInputTokens
  const cachedInputRate =
    price.cachedInputDollarsPerMillion ?? price.inputDollarsPerMillion
  const dollars =
    (standardInputTokens * price.inputDollarsPerMillion) / 1_000_000 +
    (cachedInputTokens * cachedInputRate) / 1_000_000 +
    (outputTokens * price.outputDollarsPerMillion) / 1_000_000
  const cents = dollars * 100

  return {
    cents,
    formattedCents: formatPriceEstimateCents(cents),
  }
}

export function estimateLlmTokenPriceCents({
  model,
  provider,
  usage,
}: {
  model: string
  provider: string
  usage: unknown
}): OpenAiPriceEstimate | null {
  if (provider === "openai") {
    return estimateOpenAiTokenPriceCents({ model, usage })
  }

  if (provider === "openrouter") {
    return estimateOpenRouterUsageCostCents(usage)
  }

  return null
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
  ])
  const outputTokens = sumRequiredNumberProperties(usageRecords, [
    "outputTokens",
    "output_tokens",
  ])
  const reportedTotalTokens = sumRequiredNumberProperties(usageRecords, [
    "totalTokens",
    "total_tokens",
  ])
  const aggregate: Record<string, unknown> = {}

  if (inputTokens !== null) {
    aggregate.inputTokens = inputTokens
    aggregate.inputTokensDetails = {
      cachedTokens: Math.min(
        sumOptionalNestedNumberProperties(
          usageRecords,
          ["inputTokensDetails", "input_tokens_details"],
          ["cachedTokens", "cached_tokens"]
        ),
        inputTokens
      ),
    }
  }

  if (outputTokens !== null) {
    aggregate.outputTokens = outputTokens
    aggregate.outputTokensDetails = {
      reasoningTokens: sumOptionalNestedNumberProperties(
        usageRecords,
        ["outputTokensDetails", "output_tokens_details"],
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

function estimateOpenRouterUsageCostCents(
  usage: unknown
): OpenAiPriceEstimate | null {
  const usageRecord = asRecord(usage)
  const costDollars = getNumberProperty(usageRecord, "cost")

  if (costDollars === null) {
    return null
  }

  const cents = costDollars * 100

  return {
    cents,
    formattedCents: formatPriceEstimateCents(cents),
  }
}

function normalizeSupportedOpenAiModel(model: string) {
  const normalizedModel = model.trim().toLowerCase()

  for (const supportedModel of Object.keys(OPENAI_TOKEN_PRICES)) {
    if (
      normalizedModel === supportedModel ||
      normalizedModel.startsWith(`${supportedModel}-202`)
    ) {
      return supportedModel
    }
  }

  return null
}

function formatPriceEstimateCents(cents: number) {
  if (cents < 0.1) {
    return "<0.1"
  }

  return cents.toFixed(1)
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
