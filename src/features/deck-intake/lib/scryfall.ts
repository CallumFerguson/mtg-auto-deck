import type { DeckEntry, ResolvedCard, ScryfallCard } from "../types"

const SCRYFALL_COLLECTION_URL = "https://api.scryfall.com/cards/collection"
const SCRYFALL_NAMED_URL = "https://api.scryfall.com/cards/named"

export function toOracleText(card: ScryfallCard) {
  if (card.oracle_text?.trim()) {
    return card.oracle_text.trim()
  }

  if (!card.card_faces?.length) {
    return ""
  }

  return card.card_faces
    .map((face) =>
      [face.name, face.mana_cost, face.type_line, face.oracle_text]
        .filter(Boolean)
        .join("\n")
        .trim()
    )
    .filter(Boolean)
    .join("\n\n")
}

export function toTypeLine(card: ScryfallCard) {
  if (card.type_line?.trim()) {
    return card.type_line.trim()
  }

  if (!card.card_faces?.length) {
    return ""
  }

  return card.card_faces
    .map((face) => face.type_line?.trim())
    .filter(Boolean)
    .join(" // ")
}

export function toManaCost(card: ScryfallCard) {
  if (card.mana_cost?.trim()) {
    return card.mana_cost.trim()
  }

  if (!card.card_faces?.length) {
    return ""
  }

  return card.card_faces
    .map((face) => face.mana_cost?.trim())
    .filter(Boolean)
    .join(" // ")
}

export function toResolvedCard(
  entry: DeckEntry,
  card: ScryfallCard,
  source: ResolvedCard["source"] = "scryfall"
): ResolvedCard {
  const firstFaceWithStats = card.card_faces?.find(
    (face) => face.power || face.toughness || face.loyalty
  )

  return {
    name: card.name,
    quantity: entry.quantity,
    manaCost: toManaCost(card),
    typeLine: toTypeLine(card),
    oracleText: toOracleText(card),
    power: card.power ?? firstFaceWithStats?.power,
    toughness: card.toughness ?? firstFaceWithStats?.toughness,
    loyalty: card.loyalty ?? firstFaceWithStats?.loyalty,
    source,
  }
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = []

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }

  return chunks
}

function delay(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds))
}

async function fetchNamedCardFuzzy(name: string) {
  const response = await fetch(
    `${SCRYFALL_NAMED_URL}?fuzzy=${encodeURIComponent(name)}`,
    {
      headers: {
        Accept: "application/json;q=0.9,*/*;q=0.8",
      },
    }
  )

  if (!response.ok) {
    return null
  }

  return (await response.json()) as ScryfallCard
}

export async function fetchCardsByName(names: string[]) {
  const uniqueNames = Array.from(new Set(names))
  const results = new Map<string, ScryfallCard>()
  const fuzzyMatches = new Map<string, ScryfallCard>()
  const notFound = new Set<string>()

  for (const nameChunk of chunk(uniqueNames, 75)) {
    const response = await fetch(SCRYFALL_COLLECTION_URL, {
      method: "POST",
      headers: {
        Accept: "application/json;q=0.9,*/*;q=0.8",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        identifiers: nameChunk.map((name) => ({ name })),
      }),
    })

    if (!response.ok) {
      throw new Error("Scryfall lookup failed. Please try again.")
    }

    const payload = (await response.json()) as {
      data?: ScryfallCard[]
      not_found?: Array<{ name?: string }>
    }

    for (const card of payload.data ?? []) {
      results.set(card.name.toLowerCase(), card)
    }

    for (const missing of payload.not_found ?? []) {
      if (missing.name) {
        notFound.add(missing.name.toLowerCase())
      }
    }
  }

  const unresolvedNames = uniqueNames.filter(
    (name) => !results.has(name.toLowerCase())
  )

  for (const name of unresolvedNames) {
    const fuzzyMatch = await fetchNamedCardFuzzy(name)

    if (fuzzyMatch) {
      fuzzyMatches.set(name.toLowerCase(), fuzzyMatch)
    } else {
      notFound.add(name.toLowerCase())
    }

    await delay(120)
  }

  return { results, fuzzyMatches, notFound }
}
