import {
  buildSimulateTurnPrompt,
  DRAW_STARTING_HAND_PROMPT,
  EVALUATE_OPENING_HAND_PROMPT,
  EVALUATE_TURN_PROMPT,
} from "./llm/prompt-constants.js"
import { formatUserGuidelinesSection } from "./llm/user-guidelines.js"
import { getGenericGameRulesReferenceEnabled } from "./llm-config.js"
import {
  getStartingHandSimulationPromptData,
  getSimulationRunEvaluationPromptData,
  getTurnSimulationPromptData,
  resolveSimulationIdentifier,
  SimulationValidationError,
  type SimulationRunEvaluationPromptData,
  type SimulationPromptCard,
  type StartingHandSimulationPromptData,
  type TurnSimulationPromptData,
} from "./simulations-postgres.js"

type LlmRunIdentifier = {
  llmRunId: string
}

export type StructuredSimulationPrompt = {
  baseInstructions: string
  cardReference: string
  userGuidelines: string | null
  dynamicRunInput: string
  fullPrompt: string
}

async function resolveSimulationPromptIdentifier(identifier: LlmRunIdentifier) {
  const llmRunId = identifier.llmRunId.trim()

  if (!llmRunId) {
    throw new SimulationValidationError(
      "Prompt construction requires an LLM run ID."
    )
  }

  return {
    llmRunId,
    simulationId: await resolveSimulationIdentifier({ llmRunId }),
  }
}

export async function buildStartingHandSimulationPrompt(
  identifier: LlmRunIdentifier
) {
  const promptParts = await buildStartingHandSimulationPromptParts(identifier)

  return promptParts.fullPrompt
}

export async function buildStartingHandSimulationPromptParts(
  identifier: LlmRunIdentifier
): Promise<StructuredSimulationPrompt> {
  const { llmRunId, simulationId } =
    await resolveSimulationPromptIdentifier(identifier)
  const promptData = await getStartingHandSimulationPromptData(simulationId)

  if (!promptData) {
    throw new Error("Simulation not found.")
  }

  return buildStartingHandSimulationPromptFromData(promptData, llmRunId)
}

export function buildStartingHandSimulationPromptFromData(
  { commanders, library, mulliganGuidelines }: StartingHandSimulationPromptData,
  llmRunId: string
): StructuredSimulationPrompt {
  const commanderLabel = commanders.length === 1 ? "Commander" : "Commanders"
  const commanderNames = expandCardNames(commanders)
  const cardNames = expandCardNames(library)
  const uniqueCards = dedupeCardsByNameAndText([...commanders, ...library])
  const formattedCardReference = formatCardReference(uniqueCards)
  const mulliganGuidelinesSection = formatUserGuidelinesSection(
    "User provided mulligan guidelines",
    "USER PROVIDED MULLIGAN GUIDELINES",
    mulliganGuidelines
  )
  const mulliganGuidelinesBlock = mulliganGuidelinesSection
    ? `\n\n${mulliganGuidelinesSection}`
    : ""
  const cardReference = `Card reference:\n${formattedCardReference}`
  const dynamicRunInput = `${commanderLabel}:
${commanderNames.join("\n")}

Decklist:
${cardNames.join("\n")}

LLM Run ID: ${llmRunId}`

  const fullPrompt = `${DRAW_STARTING_HAND_PROMPT}

${commanderLabel}:
${commanderNames.join("\n")}

Decklist:
${cardNames.join("\n")}

${cardReference}${mulliganGuidelinesBlock}

LLM Run ID: ${llmRunId}
`.trim()

  return {
    baseInstructions: DRAW_STARTING_HAND_PROMPT,
    cardReference,
    dynamicRunInput,
    fullPrompt,
    userGuidelines: mulliganGuidelinesSection || null,
  }
}

function expandCardNames(cards: readonly SimulationPromptCard[]) {
  return cards.flatMap((card) =>
    Array.from({ length: card.quantity }, () => card.name)
  )
}

function dedupeCardsByNameAndText(cards: readonly SimulationPromptCard[]) {
  const cardsByNameAndText = new Map<string, SimulationPromptCard>()

  for (const card of cards) {
    const key = `${card.name}\n${formatCardText(card)}`

    if (!cardsByNameAndText.has(key)) {
      cardsByNameAndText.set(key, card)
    }
  }

  return Array.from(cardsByNameAndText.values())
}

function formatCardReference(cards: readonly SimulationPromptCard[]) {
  return cards
    .map((card) => `${card.name}\n${formatCardText(card)}\n`)
    .join("\n")
}

function formatCardText(card: SimulationPromptCard) {
  const lines = [
    formatCardLine("Mana Cost", card.manaCost),
    formatCardLine("Mana Value", card.convertedManaCost),
    formatCardLine("Type", card.typeLine),
    formatCardLine("Rules Text", card.oracleText),
    formatPowerToughness(card),
    formatCardLine("Loyalty", card.loyalty),
  ].filter((line) => line !== null)

  if (card.cardFaces.length > 0) {
    lines.push(
      "Faces:",
      ...card.cardFaces.flatMap((face) =>
        [
          face.name,
          formatCardLine("Mana Cost", face.manaCost),
          formatCardLine("Type", face.typeLine),
          formatCardLine("Rules Text", face.oracleText),
          formatPowerToughness(face),
          formatCardLine("Loyalty", face.loyalty),
        ].filter((line) => line !== null)
      )
    )
  }

  return lines.join("\n")
}

function formatCardLine(label: string, value: string | null) {
  return value ? `${label}: ${value}` : null
}

function formatPowerToughness({
  power,
  toughness,
}: {
  power: string | null
  toughness: string | null
}) {
  return power !== null && toughness !== null
    ? `Power/Toughness: ${power}/${toughness}`
    : null
}

export async function buildTurnSimulationPrompt(
  identifier: LlmRunIdentifier,
  gameState?: unknown
) {
  const promptParts = await buildTurnSimulationPromptParts(
    identifier,
    gameState
  )

  return promptParts.fullPrompt
}

export async function buildSimulationRunEvaluationPromptParts({
  deckId,
  simulationId,
  targetLlmRunId,
}: {
  deckId: string
  simulationId: string
  targetLlmRunId: string
}): Promise<StructuredSimulationPrompt> {
  const promptData = await getSimulationRunEvaluationPromptData({
    deckId,
    simulationId,
    targetLlmRunId,
  })

  if (!promptData) {
    throw new Error("Simulation run not found.")
  }

  return buildSimulationRunEvaluationPromptFromData(promptData)
}

export function buildSimulationRunEvaluationPromptFromData(
  promptData: SimulationRunEvaluationPromptData
): StructuredSimulationPrompt {
  return promptData.targetRunPhase === "opening_hand"
    ? buildOpeningHandRunEvaluationPromptFromData(promptData)
    : buildTurnRunEvaluationPromptFromData(promptData)
}

function buildOpeningHandRunEvaluationPromptFromData(
  promptData: SimulationRunEvaluationPromptData
): StructuredSimulationPrompt {
  const baseInstructions = EVALUATE_OPENING_HAND_PROMPT
  const cardReference = buildEvaluationCardReference(promptData)
  const targetRunMetadata = {
    simulationId: promptData.simulationId,
    deckId: promptData.deckId,
    targetLlmRunId: promptData.targetLlmRunId,
    targetRunPhase: promptData.targetRunPhase,
    targetRunStatus: promptData.targetRunStatus,
  }
  const targetRunOutput = {
    summary: promptData.targetRunSummary,
    openingHand: promptData.targetRunOpeningHand,
  }
  const dynamicRunInput = `Target run metadata:
${formatJsonForPrompt(targetRunMetadata)}

Target run saved opening-hand output:
${formatJsonForPrompt(targetRunOutput)}

Target run MCP function calls:
${formatJsonForPrompt(promptData.mcpFunctionCalls)}`
  const fullPrompt = `${baseInstructions}

${cardReference}

${dynamicRunInput}
`.trim()

  return {
    baseInstructions,
    cardReference,
    dynamicRunInput,
    fullPrompt,
    userGuidelines: null,
  }
}

function buildTurnRunEvaluationPromptFromData(
  promptData: SimulationRunEvaluationPromptData
): StructuredSimulationPrompt {
  const baseInstructions = EVALUATE_TURN_PROMPT
  const cardReference = buildEvaluationCardReference(promptData)
  const targetRunMetadata = {
    simulationId: promptData.simulationId,
    deckId: promptData.deckId,
    targetLlmRunId: promptData.targetLlmRunId,
    targetRunPhase: promptData.targetRunPhase,
    targetRunStatus: promptData.targetRunStatus,
  }
  const targetRunOutput = {
    turnActions: promptData.targetRunTurnActions,
    gameState: promptData.targetRunGameState,
  }
  const dynamicRunInput = `Target run metadata:
${formatJsonForPrompt(targetRunMetadata)}

Target run saved turn output:
${formatJsonForPrompt(targetRunOutput)}

Target run MCP function calls:
${formatJsonForPrompt(promptData.mcpFunctionCalls)}`
  const fullPrompt = `${baseInstructions}

${cardReference}

${dynamicRunInput}
`.trim()

  return {
    baseInstructions,
    cardReference,
    dynamicRunInput,
    fullPrompt,
    userGuidelines: null,
  }
}

function buildEvaluationCardReference(
  promptData: SimulationRunEvaluationPromptData
) {
  const uniqueCards = dedupeCardsByNameAndText([
    ...promptData.commanders,
    ...promptData.libraryCards,
  ])

  return `Card reference:\n${formatCardReference(uniqueCards)}`
}

export async function buildTurnSimulationPromptParts(
  identifier: LlmRunIdentifier,
  gameState?: unknown
): Promise<StructuredSimulationPrompt> {
  const { llmRunId, simulationId } =
    await resolveSimulationPromptIdentifier(identifier)
  const promptData = await getTurnSimulationPromptData(simulationId)

  if (!promptData) {
    throw new Error("Simulation not found.")
  }

  return buildTurnSimulationPromptFromData(promptData, llmRunId, gameState)
}

export function buildTurnSimulationPromptFromData(
  {
    commanders,
    library,
    libraryCards,
    startingHand,
    strategyGuidelines,
  }: TurnSimulationPromptData,
  llmRunId: string,
  gameState?: unknown
): StructuredSimulationPrompt {
  const commanderNames = expandCardNames(commanders)
  const cardNames = [...library].sort((left, right) =>
    left.localeCompare(right)
  )
  const uniqueCards = dedupeCardsByNameAndText([...commanders, ...libraryCards])
  const formattedCardReference = formatCardReference(uniqueCards)
  const resolvedGameState =
    gameState ??
    buildInitialTurnGameState({
      commanderNames,
      startingHand,
    })
  const strategyGuidelinesSection = formatUserGuidelinesSection(
    "User provided strategy guidelines",
    "USER PROVIDED STRATEGY GUIDELINES",
    strategyGuidelines
  )
  const strategyGuidelinesBlock = strategyGuidelinesSection
    ? `\n\n${strategyGuidelinesSection}`
    : ""
  const simulateTurnPrompt = buildSimulateTurnPrompt({
    genericGameRulesReferenceEnabled: getGenericGameRulesReferenceEnabled(),
  })
  const cardReference = `Card reference:\n${formattedCardReference}`
  const dynamicRunInput = `Cards in library. Not actual order of library. Use tools to interact with library:
${cardNames.join("\n")}

===Start Previous End of Turn Game State===

${formatJsonForPrompt(resolvedGameState)}

===End Game State===

LLM Run ID: ${llmRunId}`

  const fullPrompt = `${simulateTurnPrompt}

${cardReference}${strategyGuidelinesBlock}

Cards in library. Not actual order of library. Use tools to interact with library:
${cardNames.join("\n")}

===Start Previous End of Turn Game State===

${formatJsonForPrompt(resolvedGameState)}

===End Game State===

LLM Run ID: ${llmRunId}
`.trim()

  return {
    baseInstructions: simulateTurnPrompt,
    cardReference,
    dynamicRunInput,
    fullPrompt,
    userGuidelines: strategyGuidelinesSection || null,
  }
}

export function isStructuredSimulationPrompt(
  value: unknown
): value is StructuredSimulationPrompt {
  if (typeof value !== "object" || value === null) {
    return false
  }

  const record = value as Partial<
    Record<keyof StructuredSimulationPrompt, unknown>
  >

  return (
    typeof record.baseInstructions === "string" &&
    typeof record.cardReference === "string" &&
    (record.userGuidelines === null ||
      typeof record.userGuidelines === "string") &&
    typeof record.dynamicRunInput === "string" &&
    typeof record.fullPrompt === "string"
  )
}

function buildInitialTurnGameState({
  commanderNames,
  startingHand,
}: {
  commanderNames: readonly string[]
  startingHand: readonly string[]
}) {
  const commanderDamage = Object.fromEntries(
    commanderNames.map((commanderName) => [commanderName, 0])
  )

  return {
    zones: {
      hand: startingHand.map(createInitialGameStateCard),
      command: commanderNames.map(createInitialGameStateCard),
      battlefield: [],
      graveyard: [],
      exile: [],
    },
    yourLife: 40,
    opponentA: {
      life: 40,
      commanderDamage,
    },
    opponentB: {
      life: 40,
      commanderDamage,
    },
    opponentC: {
      life: 40,
      commanderDamage,
    },
    other: "",
  }
}

function createInitialGameStateCard(name: string) {
  return {
    name,
    isToken: false,
    quantity: 1,
    tapped: null,
    notes: null,
  }
}

function formatJsonForPrompt(value: unknown) {
  return JSON.stringify(value, null, 2) ?? "null"
}
