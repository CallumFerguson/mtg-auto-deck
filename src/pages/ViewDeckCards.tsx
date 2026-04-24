import { useState } from "react"

import type { DeckCard, DeckDetails } from "@/lib/deck-types"

const CARD_TYPE_PRIORITY = [
  "Land",
  "Creature",
  "Planeswalker",
  "Battle",
  "Instant",
  "Sorcery",
  "Artifact",
  "Enchantment",
] as const
const CARD_TYPE_DISPLAY_ORDER = [
  ...CARD_TYPE_PRIORITY.filter((type) => type !== "Land"),
  "Land",
] as const
const DEFAULT_CARD_CATEGORY = "Other"
const CARD_CATEGORY_LABELS: Record<string, string> = {
  Artifact: "Artifacts",
  Battle: "Battles",
  Commander: "Commander",
  Creature: "Creatures",
  Enchantment: "Enchantments",
  Instant: "Instants",
  Land: "Lands",
  Other: "Other",
  Planeswalker: "Planeswalkers",
  Sorcery: "Sorceries",
}

type CardGroup = {
  category: string
  cards: DeckCard[]
}

export function ViewDeckCards({ deck }: { deck: DeckDetails }) {
  const cardGroups = getDeckCardGroups(deck)
  const [previewCard, setPreviewCard] = useState(
    deck.commanders[0] ?? deck.cards[0] ?? null
  )

  return (
    <div className="grid gap-7 sm:grid-cols-[12rem_minmax(0,1fr)] xl:grid-cols-[14rem_minmax(0,1fr)]">
      <aside className="sm:sticky sm:top-6 sm:self-start">
        <CardPreview card={previewCard} />
      </aside>

      <div className="space-y-6">
        {deck.description?.trim() ? (
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            {deck.description}
          </p>
        ) : null}

        <div className={getCardColumnClassName(cardGroups.length)}>
          {cardGroups.map((group) => (
            <CardList
              key={group.category}
              group={group}
              onPreviewCard={setPreviewCard}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function CardPreview({ card }: { card: DeckCard | null }) {
  if (!card?.defaultImageUrl) {
    return (
      <div className="hidden aspect-[488/680] w-full place-items-center rounded-lg border border-border bg-card/70 px-4 text-center text-sm text-muted-foreground sm:grid">
        No card image
      </div>
    )
  }

  return (
    <a
      className="hidden overflow-hidden rounded-[5.75%/4.4%] bg-card shadow-2xl shadow-black/30 outline-none sm:block"
      href={card.scryfallUri}
      rel="noreferrer"
      target="_blank"
    >
      <img
        alt={card.name}
        className="block aspect-[488/680] w-full object-cover"
        src={card.defaultImageUrl}
      />
    </a>
  )
}

function CardList({
  group,
  onPreviewCard,
}: {
  group: CardGroup
  onPreviewCard: (card: DeckCard) => void
}) {
  return (
    <section className="mb-9 break-inside-avoid">
      <div className="mb-1 flex items-center gap-2 border-b border-border pb-2">
        <h3 className="text-sm font-semibold text-foreground">
          {getCardCategoryLabel(group.category)} ({countCards(group.cards)})
        </h3>
      </div>
      <ul>
        {group.cards.map((card) => (
          <li
            key={`${card.oracleId}-${group.category}`}
            className="border-b border-border/45"
          >
            <a
              className="group flex min-w-0 items-baseline gap-2 py-1.5 text-sm text-foreground focus:outline-none"
              href={card.scryfallUri}
              onFocus={() => onPreviewCard(card)}
              onMouseEnter={() => onPreviewCard(card)}
              rel="noreferrer"
              target="_blank"
            >
              <span className="w-5 shrink-0 text-right text-muted-foreground">
                {card.quantity}
              </span>
              <span className="truncate decoration-primary decoration-2 underline-offset-3 group-hover:underline group-focus:underline">
                {card.name}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}

function getDeckCardGroups(deck: DeckDetails) {
  return [
    {
      category: "Commander",
      cards: deck.commanders,
    },
    ...groupCardsByCategory(deck.cards),
  ].filter((group) => group.cards.length > 0)
}

function getCardColumnClassName(categoryCount: number) {
  const baseClassName = "gap-9"

  if (categoryCount <= 1) {
    return `${baseClassName} columns-1`
  }

  if (categoryCount === 2) {
    return `${baseClassName} columns-1 lg:columns-2`
  }

  if (categoryCount === 3) {
    return `${baseClassName} columns-1 lg:columns-2 xl:columns-3`
  }

  return `${baseClassName} columns-1 lg:columns-2 xl:columns-3 2xl:columns-4`
}

function groupCardsByCategory(cards: DeckCard[]): CardGroup[] {
  const groups = new Map<string, DeckCard[]>()

  for (const type of CARD_TYPE_DISPLAY_ORDER) {
    groups.set(type, [])
  }

  groups.set(DEFAULT_CARD_CATEGORY, [])

  for (const card of cards) {
    groups.get(getCardCategory(card))?.push(card)
  }

  return Array.from(groups.entries())
    .map(([category, groupedCards]) => ({
      category,
      cards: groupedCards,
    }))
    .filter((group) => group.cards.length > 0)
}

function countCards(cards: DeckCard[]) {
  return cards.reduce((total, card) => total + card.quantity, 0)
}

function getCardCategoryLabel(category: string) {
  return CARD_CATEGORY_LABELS[category] ?? category
}

function getCardCategory(card: DeckCard) {
  const typeLine = card.typeLine ?? ""
  const category = CARD_TYPE_PRIORITY.find((type) =>
    typeLineContainsCardType(typeLine, type)
  )

  return category ?? DEFAULT_CARD_CATEGORY
}

function typeLineContainsCardType(typeLine: string, cardType: string) {
  return new RegExp(`(^|\\s)${cardType}(\\s|$|-)`, "i").test(typeLine)
}
