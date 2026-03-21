export type DeckEntry = {
  quantity: number
  name: string
}

export type ResolvedCard = {
  name: string
  quantity: number
  manaCost: string
  typeLine: string
  oracleText: string
  power?: string
  toughness?: string
  loyalty?: string
  source: "scryfall" | "fuzzy" | "manual"
}

export type MissingCard = {
  name: string
  quantity: number
  manualText: string
}

export type ScryfallCardFace = {
  name?: string
  mana_cost?: string
  type_line?: string
  oracle_text?: string
  power?: string
  toughness?: string
  loyalty?: string
}

export type ScryfallCard = {
  name: string
  mana_cost?: string
  type_line?: string
  oracle_text?: string
  power?: string
  toughness?: string
  loyalty?: string
  card_faces?: ScryfallCardFace[]
}

export type FuzzyMatch = {
  name: string
  quantity: number
  suggestedCard: ScryfallCard
}
