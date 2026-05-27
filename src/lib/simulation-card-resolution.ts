import type { DeckCard, SimulationMcpFunctionCall } from "./deck-types"

export type SimulationCardLookup = ReadonlyMap<string, DeckCard>

export const EMPTY_SIMULATION_CARD_LOOKUP: SimulationCardLookup = new Map()

export function createSimulationCardLookup({
  cards,
  commanders,
}: {
  cards: readonly DeckCard[]
  commanders: readonly DeckCard[]
}): SimulationCardLookup {
  const cardsByName = new Map<string, DeckCard>()

  for (const card of [...commanders, ...cards]) {
    const key = getSimulationCardLookupKey(card.name)

    if (key && !cardsByName.has(key)) {
      cardsByName.set(key, card)
    }
  }

  return cardsByName
}

export function resolveSimulationCard(
  cardLookup: SimulationCardLookup,
  cardName: string
) {
  return cardLookup.get(getSimulationCardLookupKey(cardName)) ?? null
}

export function getSimulationCardLookupKey(cardName: string) {
  return cardName.trim().toLowerCase()
}

export function getSimulationResultToolCardNames(
  call: Pick<SimulationMcpFunctionCall, "mcpFunctionName" | "outputPayload">
) {
  const outputData = getSimulationResultToolOutputData(call.outputPayload)

  switch (call.mcpFunctionName) {
    case "draw_starting_hand":
    case "mulligan":
    case "draw_card_from_top":
    case "draw_card_from_bottom":
    case "return_cards_to_library":
      return getPayloadStringArray(outputData, "cards")
    case "return_card_to_library": {
      const cardName = getTrimmedPayloadString(outputData.card)

      return cardName === null ? [] : [cardName]
    }
    case "take_cards_from_library": {
      const matchCardNames = getTakeCardsFromLibraryMatchCardNames(outputData)

      return matchCardNames.length > 0
        ? matchCardNames
        : getPayloadStringArray(outputData, "foundCards")
    }
    default:
      return []
  }
}

function getSimulationResultToolOutputData(output: unknown) {
  const resolvedOutput = parseSimulationResultJsonObjectPayload(output)
  const outputRecord = asPayloadRecord(resolvedOutput)
  const dataRecord = asPayloadRecord(outputRecord.data)

  return Object.hasOwn(outputRecord, "data") &&
    Object.keys(dataRecord).length > 0
    ? dataRecord
    : outputRecord
}

function parseSimulationResultJsonObjectPayload(payload: unknown): unknown {
  if (Array.isArray(payload)) {
    for (const part of payload) {
      const parsedTextPayload = parseSimulationResultJsonObjectPayload(
        getPayloadString(part, "text")
      )

      if (typeof parsedTextPayload === "object" && parsedTextPayload !== null) {
        return parsedTextPayload
      }
    }

    return null
  }

  if (typeof payload === "object" && payload !== null) {
    const content = asPayloadRecord(payload).content

    if (Array.isArray(content)) {
      for (const part of content) {
        const parsedTextPayload = parseSimulationResultJsonObjectPayload(
          getPayloadString(part, "text")
        )

        if (
          typeof parsedTextPayload === "object" &&
          parsedTextPayload !== null
        ) {
          return parsedTextPayload
        }
      }
    }

    return payload
  }

  if (typeof payload !== "string") {
    return null
  }

  try {
    const parsedPayload = JSON.parse(payload) as unknown

    return typeof parsedPayload === "object" && parsedPayload !== null
      ? parsedPayload
      : null
  } catch {
    return null
  }
}

function getPayloadStringArray(
  value: Record<string, unknown>,
  property: string
) {
  const propertyValue = value[property]

  if (!Array.isArray(propertyValue)) {
    return []
  }

  return propertyValue.flatMap((entry) => {
    const trimmedEntry = getTrimmedPayloadString(entry)

    return trimmedEntry === null ? [] : [trimmedEntry]
  })
}

function getTakeCardsFromLibraryMatchCardNames(value: Record<string, unknown>) {
  const matches = value.matches

  if (!Array.isArray(matches)) {
    return []
  }

  return matches.flatMap((match) => {
    const matchRecord = asPayloadRecord(match)
    const foundCard =
      getTrimmedPayloadString(matchRecord.foundCard) ??
      getTrimmedPayloadString(matchRecord.requestedCard)

    return foundCard === null ? [] : [foundCard]
  })
}

function getTrimmedPayloadString(value: unknown) {
  if (typeof value !== "string") {
    return null
  }

  const trimmedValue = value.trim()

  return trimmedValue ? trimmedValue : null
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
