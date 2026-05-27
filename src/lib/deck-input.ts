type DeckCardInput = {
  name: string
  quantity: number
}

export const DECK_GUIDELINES_MAX_LENGTH = 1000

type ParsedDeckInput = {
  name: string
  desc: string
  mulliganGuidelines: string
  strategyGuidelines: string
  commanders: string[]
  cards: DeckCardInput[]
}

export type DeckInputValidationResult =
  | {
      ok: true
      deck: ParsedDeckInput
    }
  | {
      ok: false
      errors: string[]
    }

type ParsedDeckLine = {
  name: string
  quantity: number
}

export function validateAndParseDeckInput({
  commanderOne,
  commanderTwo,
  deckList,
  description,
  mulliganGuidelines,
  name,
  strategyGuidelines,
}: {
  commanderOne: string
  commanderTwo: string
  deckList: string
  description: string
  mulliganGuidelines: string
  name: string
  strategyGuidelines: string
}): DeckInputValidationResult {
  const trimmedName = name.trim()
  const trimmedMulliganGuidelines = mulliganGuidelines.trim()
  const trimmedStrategyGuidelines = strategyGuidelines.trim()
  const trimmedCommanderOne = commanderOne.trim()
  const trimmedCommanderTwo = commanderTwo.trim()
  const parsedCommanderOne = trimmedCommanderOne
    ? parseCardLine(trimmedCommanderOne)
    : null
  const parsedCommanderTwo = trimmedCommanderTwo
    ? parseCardLine(trimmedCommanderTwo)
    : null
  const errors: string[] = []

  if (!trimmedName) {
    errors.push("Deck name is required.")
  }

  if (!trimmedCommanderOne) {
    errors.push("Commander 1 is required.")
  }

  if (trimmedMulliganGuidelines.length > DECK_GUIDELINES_MAX_LENGTH) {
    errors.push("Mulligan guidelines must be 1000 characters or fewer.")
  }

  if (trimmedStrategyGuidelines.length > DECK_GUIDELINES_MAX_LENGTH) {
    errors.push("Strategy guidelines must be 1000 characters or fewer.")
  }

  if (trimmedCommanderOne && !parsedCommanderOne) {
    errors.push("Commander 1 could not be parsed.")
  }

  if (parsedCommanderOne && parsedCommanderOne.quantity !== 1) {
    errors.push("Commander 1 must have either no quantity or a quantity of 1.")
  }

  if (trimmedCommanderTwo && !trimmedCommanderOne) {
    errors.push("Commander 2 can only be used after Commander 1 is filled.")
  }

  if (trimmedCommanderTwo && !parsedCommanderTwo) {
    errors.push("Commander 2 could not be parsed.")
  }

  if (parsedCommanderTwo && parsedCommanderTwo.quantity !== 1) {
    errors.push("Commander 2 must have either no quantity or a quantity of 1.")
  }

  if (
    parsedCommanderOne &&
    parsedCommanderTwo &&
    parsedCommanderOne.name.toLocaleLowerCase() ===
      parsedCommanderTwo.name.toLocaleLowerCase()
  ) {
    errors.push("Commander 1 and Commander 2 must be different cards.")
  }

  const parsedCards = mergeDeckCards(parseDeckList(deckList))
  const expectedDeckSize = trimmedCommanderTwo ? 98 : 99
  const actualDeckSize = countCards(parsedCards)

  if (actualDeckSize !== expectedDeckSize) {
    errors.push(
      `Deck list must contain exactly ${expectedDeckSize} cards for ${
        trimmedCommanderTwo ? "two commanders" : "one commander"
      }. Parsed ${actualDeckSize}.`
    )
  }

  if (errors.length > 0) {
    return {
      ok: false,
      errors,
    }
  }

  return {
    ok: true,
    deck: {
      name: trimmedName,
      desc: description.trim(),
      mulliganGuidelines: trimmedMulliganGuidelines,
      strategyGuidelines: trimmedStrategyGuidelines,
      commanders: [parsedCommanderOne, parsedCommanderTwo]
        .filter((commander): commander is ParsedDeckLine => commander !== null)
        .map((commander) => commander.name),
      cards: parsedCards,
    },
  }
}

function parseDeckList(deckList: string): DeckCardInput[] {
  return deckList
    .split(/\r?\n/)
    .map(parseCardLine)
    .filter((line): line is ParsedDeckLine => line !== null)
}

function parseCardLine(line: string): ParsedDeckLine | null {
  const normalizedLine = line.trim()

  if (!normalizedLine) {
    return null
  }

  const suffixQuantityMatch = normalizedLine.match(/^(.+?)\s+x(\d+)$/i)
  const quantityMatch = suffixQuantityMatch
    ? null
    : normalizedLine.match(/^(\d+)\s*x?\s+(.+)$/i)
  const quantity = quantityMatch ? Number(quantityMatch[1]) : 1
  const cardText = quantityMatch
    ? quantityMatch[2]
    : suffixQuantityMatch
      ? suffixQuantityMatch[1]
      : normalizedLine
  const name = stripCardMetadata(cardText)
  const parsedQuantity = suffixQuantityMatch
    ? Number(suffixQuantityMatch[2])
    : quantity

  if (!name || parsedQuantity < 1 || !Number.isInteger(parsedQuantity)) {
    return null
  }

  return {
    name,
    quantity: parsedQuantity,
  }
}

function stripCardMetadata(cardText: string) {
  return cardText
    .replace(/\s+\^[^^]*\^.*$/u, "")
    .replace(/\s+\[[^\]]+\].*$/u, "")
    .replace(/\s+\([A-Z0-9]{2,6}\)(?:\s+[#A-Z0-9-]+)?.*$/iu, "")
    .replace(/\s+\([^)]*\).*$/u, "")
    .replace(/\s+\*[A-Z]\*.*$/iu, "")
    .replace(/\s+#\S+.*$/u, "")
    .replace(/\s{2,}/gu, " ")
    .trim()
}

function mergeDeckCards(cards: DeckCardInput[]) {
  const cardsByName = new Map<string, DeckCardInput>()

  for (const card of cards) {
    const existingCard = cardsByName.get(card.name.toLocaleLowerCase())

    if (existingCard) {
      existingCard.quantity += card.quantity
      continue
    }

    cardsByName.set(card.name.toLocaleLowerCase(), { ...card })
  }

  return Array.from(cardsByName.values()).sort((firstCard, secondCard) =>
    firstCard.name.localeCompare(secondCard.name)
  )
}

function countCards(cards: DeckCardInput[]) {
  return cards.reduce((total, card) => total + card.quantity, 0)
}
