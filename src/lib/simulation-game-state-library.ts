type CardQuantity = {
  quantity: number
}

type StartingHandCardList = {
  cards: readonly CardQuantity[]
}

export function getSimulationRunLibraryCardCount(
  run: { librarySnapshot?: readonly string[] | null } | null
) {
  return Array.isArray(run?.librarySnapshot) ? run.librarySnapshot.length : null
}

export function getPresetStartingHandLibraryCardCount({
  deckCards,
  startingHand,
}: {
  deckCards: readonly CardQuantity[]
  startingHand: StartingHandCardList | null
}) {
  if (!startingHand) {
    return null
  }

  return Math.max(
    0,
    getCardQuantityTotal(deckCards) - getCardQuantityTotal(startingHand.cards)
  )
}

function getCardQuantityTotal(cards: readonly CardQuantity[]) {
  return cards.reduce(
    (total, card) =>
      Number.isFinite(card.quantity)
        ? total + Math.max(0, card.quantity)
        : total,
    0
  )
}
