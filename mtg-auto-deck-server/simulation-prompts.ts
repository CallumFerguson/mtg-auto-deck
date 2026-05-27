import {
  buildSimulateTurnPrompt,
  DRAW_STARTING_HAND_PROMPT,
} from "./llm/prompt-constants.js"
import { formatUserGuidelinesSection } from "./llm/user-guidelines.js"
import { getGenericGameRulesReferenceEnabled } from "./llm-config.js"
import {
  getStartingHandSimulationPromptData,
  getTurnSimulationPromptData,
  resolveSimulationIdentifier,
  SimulationValidationError,
  type SimulationPromptCard,
  type StartingHandSimulationPromptData,
  type TurnSimulationPromptData,
} from "./simulations-postgres.js"

type LlmRunIdentifier = {
  llmRunId: string
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
  const { llmRunId, simulationId } =
    await resolveSimulationPromptIdentifier(identifier)
  const promptData = await getStartingHandSimulationPromptData(simulationId)

  if (!promptData) {
    throw new Error("Simulation not found.")
  }

  return buildStartingHandSimulationPromptFromData(promptData, llmRunId)
}

function buildStartingHandSimulationPromptFromData(
  { commanders, library, mulliganGuidelines }: StartingHandSimulationPromptData,
  llmRunId: string
) {
  const commanderLabel = commanders.length === 1 ? "Commander" : "Commanders"
  const commanderNames = expandCardNames(commanders)
  const cardNames = expandCardNames(library)
  const uniqueCards = dedupeCardsByNameAndText([...commanders, ...library])
  const cardReference = formatCardReference(uniqueCards)
  const mulliganGuidelinesSection = formatUserGuidelinesSection(
    "User provided mulligan guidelines",
    "USER PROVIDED MULLIGAN GUIDELINES",
    mulliganGuidelines
  )
  const mulliganGuidelinesBlock = mulliganGuidelinesSection
    ? `\n\n${mulliganGuidelinesSection}`
    : ""

  return `${DRAW_STARTING_HAND_PROMPT}

${commanderLabel}:
${commanderNames.join("\n")}

Decklist:
${cardNames.join("\n")}

Card reference:
${cardReference}${mulliganGuidelinesBlock}

LLM Run ID: ${llmRunId}
`.trim()
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
  const { llmRunId, simulationId } =
    await resolveSimulationPromptIdentifier(identifier)
  const promptData = await getTurnSimulationPromptData(simulationId)

  if (!promptData) {
    throw new Error("Simulation not found.")
  }

  return buildTurnSimulationPromptFromData(promptData, llmRunId, gameState)
}

function buildTurnSimulationPromptFromData(
  {
    commanders,
    library,
    libraryCards,
    startingHand,
    strategyGuidelines,
  }: TurnSimulationPromptData,
  llmRunId: string,
  gameState?: unknown
) {
  const commanderNames = expandCardNames(commanders)
  const cardNames = [...library].sort((left, right) =>
    left.localeCompare(right)
  )
  const uniqueCards = dedupeCardsByNameAndText([...commanders, ...libraryCards])
  const cardReference = formatCardReference(uniqueCards)
  const resolvedGameState =
    gameState ?? buildInitialTurnGameState({
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

  return `${simulateTurnPrompt}

Card reference:
${cardReference}${strategyGuidelinesBlock}

Cards in library. Not actual order of library. Use tools to interact with library:
${cardNames.join("\n")}

===Start Previous End of Turn Game State===

${formatJsonForPrompt(resolvedGameState)}

===End Game State===

LLM Run ID: ${llmRunId}
`.trim()
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
    tapped: null,
    notes: null,
  }
}

function formatJsonForPrompt(value: unknown) {
  return JSON.stringify(value, null, 2) ?? "null"
}
