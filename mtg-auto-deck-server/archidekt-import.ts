const ARCHIDEKT_API_BASE_URL = "https://archidekt.com/api/decks"
const ARCHIDEKT_REQUEST_TIMEOUT_MS = 15_000
const SERVER_NAME = "mtg-auto-deck-server"
const EXCLUDED_CATEGORIES = new Set(["maybeboard", "sideboard"])

export type ArchidektImportedCard = {
  name: string
  quantity: number
}

export type ArchidektImportedDeck = {
  deckId: string
  name: string
  description: string
  commanders: string[]
  cards: ArchidektImportedCard[]
}

export class ArchidektImportError extends Error {
  status: number

  constructor(status: number, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = "ArchidektImportError"
    this.status = status
  }
}

export async function importArchidektDeck(
  input: string,
  fetchDeck: typeof fetch = fetch
): Promise<ArchidektImportedDeck> {
  const deckId = parseArchidektDeckId(input)

  if (!deckId) {
    throw new ArchidektImportError(
      400,
      "Enter a valid Archidekt deck ID or deck link."
    )
  }

  let response: Response

  try {
    response = await fetchDeck(`${ARCHIDEKT_API_BASE_URL}/${deckId}/`, {
      headers: {
        Accept: "application/json",
        "User-Agent": `${SERVER_NAME}/0.0.1`,
      },
      signal: AbortSignal.timeout(ARCHIDEKT_REQUEST_TIMEOUT_MS),
    })
  } catch (error) {
    throw new ArchidektImportError(
      502,
      "Archidekt could not be reached. Try again in a moment.",
      { cause: error }
    )
  }

  if (!response.ok) {
    if ([400, 403, 404].includes(response.status)) {
      throw new ArchidektImportError(
        404,
        "Archidekt deck could not be loaded. Make sure it is public or unlisted and the ID is correct."
      )
    }

    throw new ArchidektImportError(
      502,
      "Archidekt returned an error while loading the deck."
    )
  }

  let payload: unknown

  try {
    payload = await response.json()
  } catch (error) {
    throw new ArchidektImportError(
      502,
      "Archidekt returned deck data that could not be read.",
      { cause: error }
    )
  }

  return normalizeArchidektDeck(deckId, payload)
}

export function parseArchidektDeckId(input: string) {
  const trimmedInput = input.trim()

  if (/^\d+$/.test(trimmedInput)) {
    return trimmedInput
  }

  const deckUrlMatch = trimmedInput.match(
    /(?:^|\/)(?:api\/)?decks\/(\d+)(?:[/?#]|$)/i
  )

  return deckUrlMatch?.[1] ?? null
}

export function normalizeArchidektDeck(
  deckId: string,
  payload: unknown
): ArchidektImportedDeck {
  const deck = getRecord(payload)

  if (!deck || !Array.isArray(deck.cards)) {
    throw new ArchidektImportError(
      502,
      "Archidekt returned deck data in an unexpected format."
    )
  }

  const commanders: ArchidektImportedCard[] = []
  const libraryCards: ArchidektImportedCard[] = []

  for (const entry of deck.cards) {
    const card = normalizeArchidektCardEntry(entry)

    if (!card) {
      continue
    }

    if (card.isCommander) {
      commanders.push({
        name: card.name,
        quantity: card.quantity,
      })
      continue
    }

    libraryCards.push({
      name: card.name,
      quantity: card.quantity,
    })
  }

  const mergedCommanders = mergeImportedCards(commanders)

  if (mergedCommanders.length < 1 || mergedCommanders.length > 2) {
    throw new ArchidektImportError(
      400,
      "Archidekt deck must include one or two cards in the Commander category."
    )
  }

  return {
    deckId,
    name: getString(deck.name)?.trim() ?? "",
    description: normalizeArchidektDescription(deck.description),
    commanders: mergedCommanders.map((commander) => commander.name),
    cards: mergeImportedCards(libraryCards),
  }
}

function normalizeArchidektCardEntry(entry: unknown) {
  const cardEntry = getRecord(entry)

  if (
    !cardEntry ||
    (cardEntry.deletedAt !== null && cardEntry.deletedAt !== undefined)
  ) {
    return null
  }

  if (cardEntry.companion === true) {
    return null
  }

  const categories = getStringArray(cardEntry.categories)

  if (categories.some((category) => EXCLUDED_CATEGORIES.has(category))) {
    return null
  }

  const card = getRecord(cardEntry.card)
  const oracleCard = getRecord(card?.oracleCard)

  if (!oracleCard) {
    throw new ArchidektImportError(
      502,
      "Archidekt returned card data in an unexpected format."
    )
  }

  if (isTokenOracleCard(oracleCard)) {
    return null
  }

  const name = getString(oracleCard.name)?.trim()
  const quantity = getPositiveInteger(cardEntry.quantity)

  if (!name || quantity === null) {
    throw new ArchidektImportError(
      502,
      "Archidekt returned card data in an unexpected format."
    )
  }

  return {
    name,
    quantity,
    isCommander: categories.includes("commander"),
  }
}

function normalizeArchidektDescription(value: unknown) {
  const descriptionText = getString(value)

  if (!descriptionText) {
    return ""
  }

  const trimmedDescription = descriptionText.trim()

  if (!trimmedDescription) {
    return ""
  }

  try {
    return (
      normalizeQuillDescription(JSON.parse(trimmedDescription)) ??
      trimmedDescription
    )
  } catch {
    return trimmedDescription
  }
}

function normalizeQuillDescription(value: unknown) {
  const description = getRecord(value)

  if (!description || !Array.isArray(description.ops)) {
    return null
  }

  return description.ops
    .map((operation) => getString(getRecord(operation)?.insert) ?? "")
    .join("")
    .replace(/\r\n/g, "\n")
    .trim()
}

function mergeImportedCards(cards: readonly ArchidektImportedCard[]) {
  const cardsByName = new Map<string, ArchidektImportedCard>()

  for (const card of cards) {
    const cardKey = card.name.toLocaleLowerCase()
    const existingCard = cardsByName.get(cardKey)

    if (existingCard) {
      existingCard.quantity += card.quantity
      continue
    }

    cardsByName.set(cardKey, { ...card })
  }

  return Array.from(cardsByName.values()).sort((firstCard, secondCard) =>
    firstCard.name.localeCompare(secondCard.name)
  )
}

function isTokenOracleCard(oracleCard: Record<string, unknown>) {
  return (
    getString(oracleCard.layout)?.toLocaleLowerCase() === "token" ||
    getStringArray(oracleCard.types).includes("token")
  )
}

function getRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null
  }

  return value as Record<string, unknown>
}

function getString(value: unknown) {
  return typeof value === "string" ? value : null
}

function getPositiveInteger(value: unknown) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    return null
  }

  return value
}

function getStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().toLocaleLowerCase())
    .filter(Boolean)
}
