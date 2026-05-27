export type DeckCardInput = {
  name: string
  quantity: number
}

export const DECK_GUIDELINES_MAX_LENGTH = 1000

export type ParsedDeckInput = {
  name: string
  desc: string
  mulliganGuidelines: string
  strategyGuidelines: string
  commanders: string[]
  cards: DeckCardInput[]
}

export type ParsedDeckCardsInput = Pick<ParsedDeckInput, "commanders" | "cards">

export type DeckInputValidationResult =
  | {
      ok: true
      deck: ParsedDeckInput
    }
  | {
      ok: false
      errors: string[]
    }

export type DeckCardsInputValidationResult =
  | {
      ok: true
      deckCards: ParsedDeckCardsInput
    }
  | {
      ok: false
      errors: string[]
    }

export type DeckDetailsInputValidationResult =
  | {
      ok: true
      details: {
        name: string
        description: string
      }
    }
  | {
      ok: false
      errors: string[]
    }

export type DeckGuidelinesInputValidationResult =
  | {
      ok: true
      guidelines: {
        mulliganGuidelines: string
        strategyGuidelines: string
      }
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
  const cardsResult = validateAndParseDeckCardsInput({
    commanderOne,
    commanderTwo,
    deckList,
  })
  const detailsResult = validateDeckDetailsInput({
    description,
    name,
  })
  const guidelinesResult = validateDeckGuidelinesInput({
    mulliganGuidelines,
    strategyGuidelines,
  })

  if (!cardsResult.ok || !detailsResult.ok || !guidelinesResult.ok) {
    return {
      ok: false,
      errors: [
        ...(cardsResult.ok ? [] : cardsResult.errors),
        ...(detailsResult.ok ? [] : detailsResult.errors),
        ...(guidelinesResult.ok ? [] : guidelinesResult.errors),
      ],
    }
  }

  return {
    ok: true,
    deck: {
      name: detailsResult.details.name,
      desc: detailsResult.details.description,
      mulliganGuidelines: guidelinesResult.guidelines.mulliganGuidelines,
      strategyGuidelines: guidelinesResult.guidelines.strategyGuidelines,
      commanders: cardsResult.deckCards.commanders,
      cards: cardsResult.deckCards.cards,
    },
  }
}

export function validateAndParseDeckCardsInput({
  commanderOne,
  commanderTwo,
  deckList,
}: {
  commanderOne: string
  commanderTwo: string
  deckList: string
}): DeckCardsInputValidationResult {
  const trimmedCommanderOne = commanderOne.trim()
  const trimmedCommanderTwo = commanderTwo.trim()
  const parsedCommanderOne = trimmedCommanderOne
    ? parseCardLine(trimmedCommanderOne)
    : null
  const parsedCommanderTwo = trimmedCommanderTwo
    ? parseCardLine(trimmedCommanderTwo)
    : null
  const errors: string[] = []

  if (!trimmedCommanderOne) {
    errors.push("Commander 1 is required.")
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
    deckCards: {
      commanders: [parsedCommanderOne, parsedCommanderTwo]
        .filter((commander): commander is ParsedDeckLine => commander !== null)
        .map((commander) => commander.name),
      cards: parsedCards,
    },
  }
}

export function validateDeckDetailsInput({
  description,
  name,
}: {
  description: string
  name: string
}): DeckDetailsInputValidationResult {
  const trimmedName = name.trim()

  if (!trimmedName) {
    return {
      ok: false,
      errors: ["Deck name is required."],
    }
  }

  return {
    ok: true,
    details: {
      name: trimmedName,
      description: description.trim(),
    },
  }
}

export function validateDeckGuidelinesInput({
  mulliganGuidelines,
  strategyGuidelines,
}: {
  mulliganGuidelines: string
  strategyGuidelines: string
}): DeckGuidelinesInputValidationResult {
  const trimmedMulliganGuidelines = mulliganGuidelines.trim()
  const trimmedStrategyGuidelines = strategyGuidelines.trim()
  const errors: string[] = []

  if (trimmedMulliganGuidelines.length > DECK_GUIDELINES_MAX_LENGTH) {
    errors.push("Mulligan guidelines must be 1000 characters or fewer.")
  }

  if (trimmedStrategyGuidelines.length > DECK_GUIDELINES_MAX_LENGTH) {
    errors.push("Strategy guidelines must be 1000 characters or fewer.")
  }

  if (errors.length > 0) {
    return {
      ok: false,
      errors,
    }
  }

  return {
    ok: true,
    guidelines: {
      mulliganGuidelines: trimmedMulliganGuidelines,
      strategyGuidelines: trimmedStrategyGuidelines,
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
