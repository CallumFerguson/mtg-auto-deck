import type { DeckEntry } from "../types"

export function normalizeCardName(rawName: string) {
  return rawName
    .replace(/\s+\([^)]*\)\s+\d+[a-zA-Z]?$/u, "")
    .replace(/\s+\([^)]*\)$/u, "")
    .replace(/\s+\/\/\s+/gu, " // ")
    .trim()
}

export function parseCommanderInput(rawName: string) {
  const trimmed = rawName.trim()

  if (!trimmed) {
    return {
      quantity: 0,
      name: "",
    }
  }

  const quantityMatch = trimmed.match(/^(\d+)\s*x?\s+(.+)$/iu)

  if (quantityMatch) {
    return {
      quantity: Number(quantityMatch[1]),
      name: normalizeCardName(quantityMatch[2]),
    }
  }

  return {
    quantity: 1,
    name: normalizeCardName(trimmed),
  }
}

export function parseDeckLine(line: string) {
  const trimmed = line.trim()

  if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("#")) {
    return null
  }

  const quantityMatch = trimmed.match(/^(\d+)\s*x?\s+(.+)$/iu)

  if (quantityMatch) {
    return {
      quantity: Number(quantityMatch[1]),
      name: normalizeCardName(quantityMatch[2]),
    }
  }

  return {
    quantity: 1,
    name: normalizeCardName(trimmed),
  }
}

export function parseDecklist(decklistText: string) {
  return decklistText
    .split(/\r?\n/u)
    .map(parseDeckLine)
    .filter((entry): entry is DeckEntry => Boolean(entry?.name))
}
