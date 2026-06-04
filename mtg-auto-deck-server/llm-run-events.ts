export class ModelReportedSimulationError extends Error {
  readonly modelError: string

  constructor(modelError: string) {
    super(`Model reported unrecoverable simulation error: ${modelError}`)
    this.name = "ModelReportedSimulationError"
    this.modelError = modelError
  }
}

export function parseOpeningHandFromResponseText(responseText: string) {
  const parsedCompletion =
    parseOpeningHandCompletionFromResponseText(responseText)

  return {
    keptHand: parsedCompletion.keptHand,
  }
}

export function parseOpeningHandCompletionFromResponseText(
  responseText: string
) {
  if (!responseText.trim()) {
    throw new Error("Opening-hand LLM completed response was empty.")
  }

  let parsedResponse: unknown

  try {
    parsedResponse = parseJsonWithLastObjectFallback(responseText)
  } catch (error) {
    throw new Error("Opening-hand LLM completed response was not valid JSON.", {
      cause: error,
    })
  }

  const responseRecord = asRecord(parsedResponse)
  assertSuccessfulSimulationOutputDidNotReportError(responseRecord)
  const keptHand = responseRecord.keptHand
  const summary = getRequiredStringProperty(responseRecord, "summary")

  if (
    !Array.isArray(keptHand) ||
    keptHand.some((card) => typeof card !== "string")
  ) {
    throw new Error("Opening-hand LLM response did not include keptHand.")
  }

  if (!summary) {
    throw new Error("Opening-hand LLM response did not include summary.")
  }

  return {
    keptHand,
    parsedOutput: responseRecord,
    summary,
  }
}

export function parseTurnSimulationFromResponseText(responseText: string) {
  const parsedCompletion =
    parseTurnSimulationCompletionFromResponseText(responseText)

  return {
    gameState: parsedCompletion.gameState,
    turnActions: parsedCompletion.turnActions,
  }
}

export function parseTurnSimulationCompletionFromResponseText(
  responseText: string
) {
  if (!responseText.trim()) {
    throw new Error("Turn LLM completed response was empty.")
  }

  let parsedResponse: unknown

  try {
    parsedResponse = parseJsonWithLastObjectFallback(responseText)
  } catch (error) {
    throw new Error("Turn LLM completed response was not valid JSON.", {
      cause: error,
    })
  }

  const responseRecord = asRecord(parsedResponse)
  assertSuccessfulSimulationOutputDidNotReportError(responseRecord)
  const gameState = responseRecord.gameState
  const turnActions = responseRecord.turnActions

  if (!isJsonObject(gameState)) {
    throw new Error("Turn LLM response did not include gameState.")
  }

  if (!isTurnActionsObject(turnActions)) {
    throw new Error("Turn LLM response did not include valid turnActions.")
  }

  return {
    gameState,
    turnActions,
    parsedOutput: responseRecord,
  }
}

export type SimulationRunEvaluationCompletion = {
  legalPass: boolean
  strategicPass: boolean
  simulationQualityScore: number
  simulationQualityScoreReasoning: string | null
  illegalActions: string[]
  strategicMistakes: string[]
  parsedOutput: Record<string, unknown>
  resultFailureMessage?: string
}

export const SIMULATION_QUALITY_REASONING_REQUIRED_MESSAGE =
  "Evaluation LLM response must explain simulationQualityScoreReasoning when simulationQualityScore is less than 10."

export function parseSimulationRunEvaluationCompletionFromResponseText(
  responseText: string
): SimulationRunEvaluationCompletion {
  if (!responseText.trim()) {
    throw new Error("Evaluation LLM completed response was empty.")
  }

  let parsedResponse: unknown

  try {
    parsedResponse = parseJsonWithLastObjectFallback(responseText)
  } catch (error) {
    throw new Error("Evaluation LLM completed response was not valid JSON.", {
      cause: error,
    })
  }

  const responseRecord = asRecord(parsedResponse)
  const legalPass = responseRecord.legalPass
  const strategicPass = responseRecord.strategicPass
  const simulationQualityScore = responseRecord.simulationQualityScore
  const simulationQualityScoreReasoning =
    responseRecord.simulationQualityScoreReasoning
  const illegalActions = responseRecord.illegalActions
  const strategicMistakes = responseRecord.strategicMistakes

  if (typeof legalPass !== "boolean") {
    throw new Error("Evaluation LLM response did not include legalPass.")
  }

  if (typeof strategicPass !== "boolean") {
    throw new Error("Evaluation LLM response did not include strategicPass.")
  }

  if (
    typeof simulationQualityScore !== "number" ||
    !Number.isFinite(simulationQualityScore) ||
    simulationQualityScore < 0 ||
    simulationQualityScore > 10
  ) {
    throw new Error(
      "Evaluation LLM response did not include a valid simulationQualityScore."
    )
  }

  if (!isStringArray(illegalActions)) {
    throw new Error(
      "Evaluation LLM response did not include valid illegalActions."
    )
  }

  const normalizedSimulationQualityScoreReasoning =
    simulationQualityScoreReasoning === undefined ||
    simulationQualityScoreReasoning === null
      ? null
      : typeof simulationQualityScoreReasoning === "string"
        ? simulationQualityScoreReasoning.trim() || null
        : undefined

  if (normalizedSimulationQualityScoreReasoning === undefined) {
    throw new Error(
      "Evaluation LLM response did not include valid simulationQualityScoreReasoning."
    )
  }

  const roundedSimulationQualityScore = roundEvaluationScore(
    simulationQualityScore
  )
  const resultFailureMessage =
    roundedSimulationQualityScore < 10 &&
    normalizedSimulationQualityScoreReasoning === null
      ? SIMULATION_QUALITY_REASONING_REQUIRED_MESSAGE
      : undefined

  if (!isStringArray(strategicMistakes)) {
    throw new Error(
      "Evaluation LLM response did not include valid strategicMistakes."
    )
  }

  return {
    legalPass,
    strategicPass,
    simulationQualityScore: roundedSimulationQualityScore,
    simulationQualityScoreReasoning: normalizedSimulationQualityScoreReasoning,
    illegalActions,
    strategicMistakes,
    parsedOutput: responseRecord,
    ...(resultFailureMessage ? { resultFailureMessage } : {}),
  }
}

const TURN_ACTION_PHASE_KEYS = [
  "untap",
  "upkeep",
  "draw",
  "precombat_main",
  "combat",
  "postcombat_main",
  "end_step_cleanup",
] as const

function isTurnActionsObject(
  value: unknown
): value is Record<(typeof TURN_ACTION_PHASE_KEYS)[number], string[]> {
  if (!isJsonObject(value)) {
    return false
  }

  const phaseKeySet = new Set<string>(TURN_ACTION_PHASE_KEYS)

  return (
    Object.keys(value).every((key) => phaseKeySet.has(key)) &&
    TURN_ACTION_PHASE_KEYS.every((phaseKey) => {
      const actions = value[phaseKey]

      return (
        Array.isArray(actions) &&
        actions.every((action) => typeof action === "string")
      )
    })
  )
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
}

function roundEvaluationScore(value: number) {
  return Math.round(value * 10) / 10
}

function assertSuccessfulSimulationOutputDidNotReportError(
  responseRecord: Record<string, unknown>
) {
  const errorValue = responseRecord.error

  if (errorValue === null || errorValue === undefined) {
    return
  }

  const modelError = typeof errorValue === "string" ? errorValue.trim() : ""

  throw new ModelReportedSimulationError(
    modelError ||
      "Model reported an unrecoverable simulation error without a readable message."
  )
}

function getRequiredStringProperty(
  record: Record<string, unknown>,
  property: string
) {
  const value = record[property]

  return typeof value === "string" && value.trim() ? value : null
}

function parseJsonWithLastObjectFallback(responseText: string) {
  const trimmedResponseText = responseText.trim()

  try {
    return JSON.parse(trimmedResponseText) as unknown
  } catch (error) {
    const parsedObject = parseLastJsonObject(trimmedResponseText)

    if (parsedObject.found) {
      return parsedObject.value
    }

    throw error
  }
}

function parseLastJsonObject(
  text: string
): { found: true; value: unknown } | { found: false } {
  let lastParsedObject:
    | { end: number; start: number; value: unknown }
    | undefined

  for (
    let start = text.indexOf("{");
    start !== -1;
    start = text.indexOf("{", start + 1)
  ) {
    const end = findJsonObjectEnd(text, start)

    if (end === null) {
      continue
    }

    try {
      const value = JSON.parse(text.slice(start, end)) as unknown

      if (
        lastParsedObject === undefined ||
        end > lastParsedObject.end ||
        (end === lastParsedObject.end && start < lastParsedObject.start)
      ) {
        lastParsedObject = { end, start, value }
      }
    } catch {
      // Keep looking for another balanced object.
    }
  }

  return lastParsedObject === undefined
    ? { found: false }
    : { found: true, value: lastParsedObject.value }
}

function findJsonObjectEnd(text: string, start: number) {
  let objectDepth = 0
  let isInString = false
  let isEscaped = false

  for (let index = start; index < text.length; index += 1) {
    const char = text[index]

    if (isInString) {
      if (isEscaped) {
        isEscaped = false
        continue
      }

      if (char === "\\") {
        isEscaped = true
        continue
      }

      if (char === '"') {
        isInString = false
      }

      continue
    }

    if (char === '"') {
      isInString = true
      continue
    }

    if (char === "{") {
      objectDepth += 1
      continue
    }

    if (char === "}") {
      objectDepth -= 1

      if (objectDepth === 0) {
        return index + 1
      }
    }
  }

  return null
}

export function getCompletedResponseOutputText(response: unknown) {
  const responseRecord = asRecord(response)
  const topLevelOutputText =
    getStringProperty(responseRecord, "output_text") ??
    getStringProperty(responseRecord, "outputText")

  if (topLevelOutputText) {
    return topLevelOutputText
  }

  const output = responseRecord.output

  if (!Array.isArray(output)) {
    return ""
  }

  const finalAnswerTextParts = output.flatMap((item) => {
    const itemRecord = asRecord(item)

    if (
      itemRecord.type !== "message" ||
      itemRecord.phase !== "final_answer" ||
      !Array.isArray(itemRecord.content)
    ) {
      return []
    }

    return getOutputTextParts(itemRecord.content)
  })

  if (finalAnswerTextParts.length > 0) {
    return finalAnswerTextParts.join("")
  }

  return output
    .flatMap((item) => {
      const itemRecord = asRecord(item)

      if (itemRecord.type !== "message" || !Array.isArray(itemRecord.content)) {
        return []
      }

      return getOutputTextParts(itemRecord.content)
    })
    .join("")
}

export function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {}
}

export function getStringProperty(
  record: Record<string, unknown>,
  property: string
) {
  const value = record[property]

  return typeof value === "string" ? value : null
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function isAbortError(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === "APIUserAbortError" ||
      error.name === "AbortError" ||
      error.name === "RequestAbortedError")
  )
}

export function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export function getLlmRunFailureMessage({
  error,
  provider,
  serviceTier,
}: {
  error: unknown
  provider: string
  serviceTier: string | null
}) {
  const errorMessage = getErrorMessage(error)

  if (provider !== "openai" || !isOpenAiRateLimitError(error)) {
    return errorMessage
  }

  const providerMessage = `OpenAI returned error: "${errorMessage}"`

  return serviceTier === "flex"
    ? `${providerMessage} Disable flex processing to reduce the chance of getting this error.`
    : providerMessage
}

function isOpenAiRateLimitError(error: unknown) {
  const errorRecord = asRecord(error)
  const nestedErrorRecord = asRecord(errorRecord.error)
  const status = errorRecord.status
  const code =
    getStringProperty(errorRecord, "code") ??
    getStringProperty(nestedErrorRecord, "code")

  return status === 429 || code === "rate_limit_exceeded"
}

function getOutputTextParts(content: unknown[]) {
  return content.flatMap((part) => {
    const partRecord = asRecord(part)

    if (partRecord.type !== "output_text") {
      return []
    }

    const text = getStringProperty(partRecord, "text")

    return text === null ? [] : [text]
  })
}
