import { useMemo, useState, type FormEvent, type MouseEvent } from "react"
import { Check, Plus, RefreshCw, Save, Trash2, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { API_BASE_URL, apiFetch } from "@/lib/api"
import { readApiError } from "@/lib/api-error"
import type {
  CreateSavedSeedResponse,
  CreateStartingHandResponse,
  SavedSeed,
  StartingHand,
} from "@/lib/deck-types"
import { CardPreviewPill } from "./CardPreviewPill"

export type OpeningHandCardOption = {
  id: string
  deckCardId: number
  defaultImageUrl: string | null
  name: string
  scryfallUri: string
}

function DeleteSavedItemModal({
  error,
  isDeleting,
  itemName,
  itemType,
  onClose,
  onConfirm,
}: {
  error: string | null
  isDeleting: boolean
  itemName: string
  itemType: "seed" | "starting hand"
  onClose: () => void
  onConfirm: () => void
}) {
  const title = itemType === "seed" ? "Delete seed" : "Delete starting hand"
  const confirmLabel =
    itemType === "seed" ? "Delete seed" : "Delete starting hand"

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-background/80 px-4 py-6 backdrop-blur-sm"
      role="presentation"
      onMouseDown={isDeleting ? undefined : onClose}
    >
      <section
        aria-labelledby="delete-saved-item-title"
        className="w-full max-w-md rounded-lg border border-border bg-card shadow-2xl shadow-black/40"
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="space-y-1">
            <h2 id="delete-saved-item-title" className="text-xl font-semibold">
              {title}
            </h2>
            <p className="text-sm break-words text-muted-foreground">
              This will hide {itemName} from future simulations. Existing
              simulations that already use it will keep working.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Close"
            title="Close"
            onClick={onClose}
            disabled={isDeleting}
          >
            <X />
          </Button>
        </header>

        <div className="grid gap-4 px-5 py-5">
          {error ? (
            <p
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={onConfirm}
              disabled={isDeleting}
            >
              <Trash2 data-icon="inline-start" />
              {isDeleting ? "Deleting..." : confirmLabel}
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}

function getSelectedStartingHandCards(
  selectedCardIds: readonly string[],
  cardOptions: readonly OpeningHandCardOption[]
) {
  const selectedCardIdSet = new Set(selectedCardIds)
  const cardsByDeckCardId = new Map<
    number,
    { deckCardId: number; quantity: number }
  >()

  for (const cardOption of cardOptions) {
    if (!selectedCardIdSet.has(cardOption.id)) {
      continue
    }

    const existingCard = cardsByDeckCardId.get(cardOption.deckCardId)

    if (existingCard) {
      existingCard.quantity += 1
      continue
    }

    cardsByDeckCardId.set(cardOption.deckCardId, {
      deckCardId: cardOption.deckCardId,
      quantity: 1,
    })
  }

  return Array.from(cardsByDeckCardId.values())
}

function getStartingHandCardCopies(startingHand: StartingHand) {
  return startingHand.cards.flatMap((card) =>
    Array.from({ length: card.quantity }, (_, copyIndex) => ({
      ...card,
      copyIndex,
    }))
  )
}

function StartingHandCardImageRow({
  startingHand,
}: {
  startingHand: StartingHand
}) {
  return (
    <ul className="grid w-full grid-cols-7 gap-1 sm:gap-2">
      {getStartingHandCardCopies(startingHand).map((card) => (
        <li key={`${card.deckCardId}-${card.copyIndex}`} className="min-w-0">
          <StartingHandCardImage card={card} />
        </li>
      ))}
    </ul>
  )
}

function StartingHandCardImage({
  card,
}: {
  card: ReturnType<typeof getStartingHandCardCopies>[number]
}) {
  const href = card.scryfallUri.trim() || null
  const imageUrl = card.defaultImageUrl?.trim() || null
  const content = imageUrl ? (
    <img
      className="block aspect-[488/680] w-full rounded-[5.75%/4.4%] bg-black/50 object-cover"
      src={imageUrl}
      alt={card.name}
      loading="lazy"
    />
  ) : (
    <span className="grid aspect-[488/680] w-full place-items-center rounded-[5.75%/4.4%] border border-border bg-black/50 px-1 text-center text-[0.5rem] leading-tight text-muted-foreground">
      No image
    </span>
  )

  if (!href) {
    return (
      <span className="block min-w-0" title={card.name}>
        {content}
      </span>
    )
  }

  return (
    <a
      className="block min-w-0 rounded-[5.75%/4.4%] shadow-lg shadow-black/25 transition-transform hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:outline-none"
      href={href}
      target="_blank"
      rel="noreferrer"
      title={card.name}
    >
      {content}
    </a>
  )
}

export function ChooseSavedSeedModal({
  deckId,
  isLoadingSavedSeeds,
  loadError,
  onApply,
  onClose,
  onCreateSeed,
  onDeleted,
  onRetry,
  savedSeeds,
  selectedSavedSeedId,
}: {
  deckId: string
  isLoadingSavedSeeds: boolean
  loadError: string | null
  onApply: (seedId: string) => void
  onClose: () => void
  onCreateSeed: () => void
  onDeleted: (seedId: string) => void
  onRetry: () => void
  savedSeeds: SavedSeed[]
  selectedSavedSeedId: string
}) {
  const [deleteSeed, setDeleteSeed] = useState<SavedSeed | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [isDeletingSeed, setIsDeletingSeed] = useState(false)
  const [draftSeedId, setDraftSeedId] = useState(() =>
    savedSeeds.some((seed) => seed.id === selectedSavedSeedId)
      ? selectedSavedSeedId
      : (savedSeeds[0]?.id ?? "")
  )
  const effectiveDraftSeedId = savedSeeds.some(
    (seed) => seed.id === draftSeedId
  )
    ? draftSeedId
    : savedSeeds.some((seed) => seed.id === selectedSavedSeedId)
      ? selectedSavedSeedId
      : (savedSeeds[0]?.id ?? "")
  const selectedSeed = useMemo(
    () => savedSeeds.find((seed) => seed.id === effectiveDraftSeedId) ?? null,
    [effectiveDraftSeedId, savedSeeds]
  )

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (selectedSeed) {
      onApply(selectedSeed.id)
    }
  }

  async function handleDeleteSeed(seed: SavedSeed) {
    if (isDeletingSeed) {
      return
    }

    setIsDeletingSeed(true)
    setDeleteError(null)

    try {
      const response = await apiFetch(
        `${API_BASE_URL}/decks/${deckId}/saved-seeds/${encodeURIComponent(
          seed.id
        )}`,
        {
          method: "DELETE",
        }
      )

      if (!response.ok) {
        setDeleteError(
          await readApiError(response, "Seed could not be deleted.")
        )
        return
      }

      const nextSeedId =
        savedSeeds.find((candidateSeed) => candidateSeed.id !== seed.id)?.id ??
        ""

      setDraftSeedId(nextSeedId)
      onDeleted(seed.id)
      setDeleteSeed(null)
    } catch {
      setDeleteError("Seed could not be sent to the server.")
    } finally {
      setIsDeletingSeed(false)
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 py-6 backdrop-blur-sm"
        role="presentation"
        onMouseDown={onClose}
      >
        <section
          aria-labelledby="choose-saved-seed-title"
          className="flex max-h-[calc(100svh-3rem)] w-full max-w-lg flex-col rounded-lg border border-border bg-card shadow-2xl shadow-black/40"
          role="dialog"
          aria-modal="true"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div className="space-y-1">
              <h2
                id="choose-saved-seed-title"
                className="text-xl font-semibold"
              >
                Set simulation seed
              </h2>
              <p className="text-sm text-muted-foreground">
                Choose a saved seed for this simulation.
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Close"
              title="Close"
              onClick={onClose}
            >
              <X />
            </Button>
          </header>

          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={handleSubmit}
          >
            <div className="grid min-h-0 gap-4 overflow-y-auto px-5 py-5">
              {loadError ? (
                <div className="grid gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2">
                  <p className="text-sm text-destructive">{loadError}</p>
                  <Button type="button" variant="outline" onClick={onRetry}>
                    <RefreshCw data-icon="inline-start" />
                    Try again
                  </Button>
                </div>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <label
                  className="grid gap-2 text-sm font-medium"
                  htmlFor="choose-saved-seed"
                >
                  <span>Saved seed</span>
                  <select
                    id="choose-saved-seed"
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground transition-colors outline-none focus:border-ring focus:ring-3 focus:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50"
                    value={effectiveDraftSeedId}
                    disabled={isLoadingSavedSeeds || savedSeeds.length === 0}
                    onChange={(event) => setDraftSeedId(event.target.value)}
                  >
                    {isLoadingSavedSeeds && savedSeeds.length === 0 ? (
                      <option value="">Loading saved seeds...</option>
                    ) : !isLoadingSavedSeeds && savedSeeds.length === 0 ? (
                      <option value="">No saved seeds yet</option>
                    ) : null}
                    {savedSeeds.map((seed) => (
                      <option key={seed.id} value={seed.id}>
                        {seed.name}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="flex flex-wrap gap-2 sm:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onCreateSeed}
                  >
                    <Plus data-icon="inline-start" />
                    New seed
                  </Button>
                  <Button
                    className="text-destructive hover:text-destructive"
                    type="button"
                    variant="outline"
                    disabled={!selectedSeed || isLoadingSavedSeeds}
                    onClick={() => {
                      setDeleteError(null)
                      setDeleteSeed(selectedSeed)
                    }}
                  >
                    <Trash2 data-icon="inline-start" />
                    Delete
                  </Button>
                </div>
              </div>

              {selectedSeed ? (
                <dl className="grid gap-1 text-sm">
                  <dt className="text-muted-foreground">Seed value</dt>
                  <dd className="rounded-md bg-muted/30 px-3 py-2 font-medium break-all text-foreground">
                    {selectedSeed.seed}
                  </dd>
                </dl>
              ) : !isLoadingSavedSeeds ? (
                <p className="text-sm text-muted-foreground">
                  Create a seed before using set seed.
                </p>
              ) : null}
            </div>

            <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={!selectedSeed}>
                <Check data-icon="inline-start" />
                Use seed
              </Button>
            </div>
          </form>
        </section>
      </div>

      {deleteSeed ? (
        <DeleteSavedItemModal
          error={deleteError}
          isDeleting={isDeletingSeed}
          itemName={deleteSeed.name}
          itemType="seed"
          onClose={() => {
            if (!isDeletingSeed) {
              setDeleteSeed(null)
              setDeleteError(null)
            }
          }}
          onConfirm={() => void handleDeleteSeed(deleteSeed)}
        />
      ) : null}
    </>
  )
}

export function ChooseStartingHandModal({
  deckId,
  isLoadingStartingHands,
  loadError,
  onApply,
  onClose,
  onCreateHand,
  onDeleted,
  onRetry,
  selectedStartingHandId,
  startingHands,
}: {
  deckId: string
  isLoadingStartingHands: boolean
  loadError: string | null
  onApply: (handId: string) => void
  onClose: () => void
  onCreateHand: () => void
  onDeleted: (handId: string) => void
  onRetry: () => void
  selectedStartingHandId: string
  startingHands: StartingHand[]
}) {
  const [deleteHand, setDeleteHand] = useState<StartingHand | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [isDeletingHand, setIsDeletingHand] = useState(false)
  const [draftStartingHandId, setDraftStartingHandId] = useState(() =>
    startingHands.some((hand) => hand.id === selectedStartingHandId)
      ? selectedStartingHandId
      : (startingHands[0]?.id ?? "")
  )
  const effectiveDraftStartingHandId = startingHands.some(
    (hand) => hand.id === draftStartingHandId
  )
    ? draftStartingHandId
    : startingHands.some((hand) => hand.id === selectedStartingHandId)
      ? selectedStartingHandId
      : (startingHands[0]?.id ?? "")
  const selectedHand = useMemo(
    () =>
      startingHands.find((hand) => hand.id === effectiveDraftStartingHandId) ??
      null,
    [effectiveDraftStartingHandId, startingHands]
  )

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (selectedHand) {
      onApply(selectedHand.id)
    }
  }

  async function handleDeleteHand(hand: StartingHand) {
    if (isDeletingHand) {
      return
    }

    setIsDeletingHand(true)
    setDeleteError(null)

    try {
      const response = await apiFetch(
        `${API_BASE_URL}/decks/${deckId}/starting-hands/${encodeURIComponent(
          hand.id
        )}`,
        {
          method: "DELETE",
        }
      )

      if (!response.ok) {
        setDeleteError(
          await readApiError(response, "Starting hand could not be deleted.")
        )
        return
      }

      const nextHandId =
        startingHands.find((candidateHand) => candidateHand.id !== hand.id)
          ?.id ?? ""

      setDraftStartingHandId(nextHandId)
      onDeleted(hand.id)
      setDeleteHand(null)
    } catch {
      setDeleteError("Starting hand could not be sent to the server.")
    } finally {
      setIsDeletingHand(false)
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 py-6 backdrop-blur-sm"
        role="presentation"
        onMouseDown={onClose}
      >
        <section
          aria-labelledby="choose-starting-hand-title"
          className="flex max-h-[calc(100svh-3rem)] w-full max-w-4xl flex-col rounded-lg border border-border bg-card shadow-2xl shadow-black/40"
          role="dialog"
          aria-modal="true"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div className="space-y-1">
              <h2
                id="choose-starting-hand-title"
                className="text-xl font-semibold"
              >
                Set opening hand
              </h2>
              <p className="text-sm text-muted-foreground">
                Choose a saved starting hand for this simulation.
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Close"
              title="Close"
              onClick={onClose}
            >
              <X />
            </Button>
          </header>

          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={handleSubmit}
          >
            <div className="grid min-h-0 gap-4 overflow-y-auto px-5 py-5">
              {loadError ? (
                <div className="grid gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2">
                  <p className="text-sm text-destructive">{loadError}</p>
                  <Button type="button" variant="outline" onClick={onRetry}>
                    <RefreshCw data-icon="inline-start" />
                    Try again
                  </Button>
                </div>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <label
                  className="grid gap-2 text-sm font-medium"
                  htmlFor="choose-starting-hand"
                >
                  <span>Starting hand</span>
                  <select
                    id="choose-starting-hand"
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground transition-colors outline-none focus:border-ring focus:ring-3 focus:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50"
                    value={effectiveDraftStartingHandId}
                    disabled={
                      isLoadingStartingHands || startingHands.length === 0
                    }
                    onChange={(event) =>
                      setDraftStartingHandId(event.target.value)
                    }
                  >
                    {isLoadingStartingHands && startingHands.length === 0 ? (
                      <option value="">Loading starting hands...</option>
                    ) : !isLoadingStartingHands &&
                      startingHands.length === 0 ? (
                      <option value="">No starting hands yet</option>
                    ) : null}
                    {startingHands.map((hand) => (
                      <option key={hand.id} value={hand.id}>
                        {hand.name}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="flex flex-wrap gap-2 sm:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onCreateHand}
                  >
                    <Plus data-icon="inline-start" />
                    New starting hand
                  </Button>
                  <Button
                    className="text-destructive hover:text-destructive"
                    type="button"
                    variant="outline"
                    disabled={!selectedHand || isLoadingStartingHands}
                    onClick={() => {
                      setDeleteError(null)
                      setDeleteHand(selectedHand)
                    }}
                  >
                    <Trash2 data-icon="inline-start" />
                    Delete
                  </Button>
                </div>
              </div>

              {selectedHand ? (
                <div className="grid gap-2">
                  <p className="text-sm text-sky-300">Cards</p>
                  <div className="rounded-md border border-border bg-background/35 p-2 sm:p-3">
                    <StartingHandCardImageRow startingHand={selectedHand} />
                  </div>
                </div>
              ) : !isLoadingStartingHands ? (
                <p className="text-sm text-muted-foreground">
                  Create a starting hand before providing an opening hand.
                </p>
              ) : null}
            </div>

            <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={!selectedHand}>
                <Check data-icon="inline-start" />
                Use hand
              </Button>
            </div>
          </form>
        </section>
      </div>

      {deleteHand ? (
        <DeleteSavedItemModal
          error={deleteError}
          isDeleting={isDeletingHand}
          itemName={deleteHand.name}
          itemType="starting hand"
          onClose={() => {
            if (!isDeletingHand) {
              setDeleteHand(null)
              setDeleteError(null)
            }
          }}
          onConfirm={() => void handleDeleteHand(deleteHand)}
        />
      ) : null}
    </>
  )
}

export function CreateSavedSeedModal({
  deckId,
  onClose,
  onSaved,
}: {
  deckId: string
  onClose: () => void
  onSaved: (seed: SavedSeed) => void
}) {
  const [seedName, setSeedName] = useState("")
  const [seedValue, setSeedValue] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const canSaveSeed = seedName.trim().length > 0 && seedValue.trim().length > 0

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const trimmedSeedName = seedName.trim()
    const trimmedSeedValue = seedValue.trim()

    if (!trimmedSeedName) {
      setError("Seed name is required.")
      return
    }

    if (!trimmedSeedValue) {
      setError("Seed value is required.")
      return
    }

    setError(null)
    setIsSaving(true)

    try {
      const response = await apiFetch(
        `${API_BASE_URL}/decks/${deckId}/saved-seeds`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: trimmedSeedName,
            seed: trimmedSeedValue,
          }),
        }
      )

      if (!response.ok) {
        setError(await readApiError(response, "Seed could not be saved."))
        return
      }

      const data = (await response.json()) as CreateSavedSeedResponse
      onSaved(data.savedSeed)
    } catch {
      setError("Seed could not be sent to the server.")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 py-6 backdrop-blur-sm"
      role="presentation"
      onMouseDown={isSaving ? undefined : onClose}
    >
      <section
        aria-labelledby="create-saved-seed-title"
        className="flex max-h-[calc(100svh-3rem)] w-full max-w-lg flex-col rounded-lg border border-border bg-card shadow-2xl shadow-black/40"
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="space-y-1">
            <h2 id="create-saved-seed-title" className="text-xl font-semibold">
              New seed
            </h2>
            <p className="text-sm text-muted-foreground">
              Name this seed so it can be reused with this deck.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Close"
            title="Close"
            onClick={onClose}
            disabled={isSaving}
          >
            <X />
          </Button>
        </header>

        <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
          <div className="grid min-h-0 gap-4 overflow-y-auto px-5 py-5">
            <label
              className="grid gap-2 text-sm font-medium"
              htmlFor="saved-seed-name"
            >
              <span>Name</span>
              <input
                id="saved-seed-name"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground transition outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-3 focus:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50"
                type="text"
                value={seedName}
                required
                disabled={isSaving}
                onChange={(event) => {
                  setSeedName(event.target.value)
                  setError(null)
                }}
              />
            </label>

            <label
              className="grid gap-2 text-sm font-medium"
              htmlFor="saved-seed-value"
            >
              <span>Seed</span>
              <input
                id="saved-seed-value"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground transition outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-3 focus:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50"
                type="text"
                value={seedValue}
                required
                disabled={isSaving}
                onChange={(event) => {
                  setSeedValue(event.target.value)
                  setError(null)
                }}
              />
            </label>

            {error ? (
              <p
                className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                role="alert"
              >
                {error}
              </p>
            ) : null}
          </div>

          <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving || !canSaveSeed}>
              <Save data-icon="inline-start" />
              {isSaving ? "Saving..." : "Save seed"}
            </Button>
          </div>
        </form>
      </section>
    </div>
  )
}

export function CreateStartingHandModal({
  cardOptions,
  deckId,
  onClose,
  onSaved,
}: {
  cardOptions: OpeningHandCardOption[]
  deckId: string
  onClose: () => void
  onSaved: (hand: StartingHand) => void
}) {
  const [handName, setHandName] = useState("")
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const hasHandName = handName.trim().length > 0
  const selectedCardIdSet = useMemo(
    () => new Set(selectedCardIds),
    [selectedCardIds]
  )
  const hasExactlySevenCards = selectedCardIds.length === 7
  const canSaveStartingHand = hasHandName && hasExactlySevenCards

  function toggleCard(cardId: string) {
    setSelectedCardIds((currentCardIds) => {
      if (currentCardIds.includes(cardId)) {
        return currentCardIds.filter(
          (currentCardId) => currentCardId !== cardId
        )
      }

      if (currentCardIds.length >= 7) {
        return currentCardIds
      }

      return [...currentCardIds, cardId]
    })
  }

  function handleCardRowClick(
    event: MouseEvent<HTMLDivElement>,
    cardId: string,
    isDisabled: boolean
  ) {
    const target = event.target

    if (
      isDisabled ||
      !(target instanceof Element) ||
      target.closest("input, [data-card-preview-pill]")
    ) {
      return
    }

    toggleCard(cardId)
    setError(null)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const trimmedHandName = handName.trim()

    if (!trimmedHandName) {
      setError("Starting hand name is required.")
      return
    }

    if (!hasExactlySevenCards) {
      setError("Select exactly 7 cards.")
      return
    }

    setError(null)
    setIsSaving(true)

    try {
      const response = await apiFetch(
        `${API_BASE_URL}/decks/${deckId}/starting-hands`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: trimmedHandName,
            cards: getSelectedStartingHandCards(selectedCardIds, cardOptions),
          }),
        }
      )

      if (!response.ok) {
        setError(
          await readApiError(response, "Starting hand could not be saved.")
        )
        return
      }

      const data = (await response.json()) as CreateStartingHandResponse
      onSaved(data.startingHand)
    } catch {
      setError("Starting hand could not be sent to the server.")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 py-6 backdrop-blur-sm"
      role="presentation"
      onMouseDown={isSaving ? undefined : onClose}
    >
      <section
        aria-labelledby="create-starting-hand-title"
        className="flex max-h-[calc(100svh-3rem)] w-full max-w-2xl flex-col rounded-lg border border-border bg-card shadow-2xl shadow-black/40"
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="space-y-1">
            <h2
              id="create-starting-hand-title"
              className="text-xl font-semibold"
            >
              New starting hand
            </h2>
            <p className="text-sm text-muted-foreground">
              Name this hand and choose exactly 7 cards.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Close"
            title="Close"
            onClick={onClose}
            disabled={isSaving}
          >
            <X />
          </Button>
        </header>

        <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
          <div className="grid min-h-0 gap-4 overflow-y-auto px-5 py-5">
            <label
              className="grid gap-2 text-sm font-medium"
              htmlFor="starting-hand-name"
            >
              <span>Name</span>
              <input
                id="starting-hand-name"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground transition outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-3 focus:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50"
                type="text"
                value={handName}
                placeholder="Fast Sol Ring hand"
                required
                disabled={isSaving}
                onChange={(event) => {
                  setHandName(event.target.value)
                  setError(null)
                }}
              />
            </label>

            <div className="grid gap-3">
              <div className="flex items-center justify-between gap-3 text-sm">
                <p
                  className={
                    hasExactlySevenCards
                      ? "text-sky-300"
                      : "text-muted-foreground"
                  }
                >
                  {selectedCardIds.length} of 7 selected
                </p>
                {!hasExactlySevenCards ? (
                  <p className="text-muted-foreground">
                    Select exactly 7 cards.
                  </p>
                ) : null}
              </div>

              <div className="max-h-80 overflow-y-auto rounded-md border border-border bg-background/35 p-2">
                <ul className="grid gap-1">
                  {cardOptions.map((card) => {
                    const isSelected = selectedCardIdSet.has(card.id)
                    const isDisabled =
                      isSaving || (!isSelected && selectedCardIds.length >= 7)

                    return (
                      <li key={card.id}>
                        <div
                          className={`flex min-w-0 items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                            isSelected
                              ? "bg-accent text-accent-foreground"
                              : isDisabled
                                ? "bg-muted/15 text-muted-foreground/55"
                                : "text-muted-foreground hover:bg-muted/45 hover:text-foreground"
                          } ${isDisabled ? "cursor-not-allowed" : "cursor-pointer"}`}
                          onClick={(event) =>
                            handleCardRowClick(event, card.id, isDisabled)
                          }
                        >
                          <input
                            className="size-4 shrink-0 accent-sky-300"
                            type="checkbox"
                            checked={isSelected}
                            disabled={isDisabled}
                            aria-label={`Select ${card.name}`}
                            onChange={() => {
                              toggleCard(card.id)
                              setError(null)
                            }}
                          />
                          <CardPreviewPill
                            href={card.scryfallUri}
                            imageUrl={card.defaultImageUrl}
                            label={card.name}
                            title={card.name}
                            variant={isSelected ? "selected" : "default"}
                          />
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            </div>

            {error ? (
              <p
                className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                role="alert"
              >
                {error}
              </p>
            ) : null}
          </div>

          <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving || !canSaveStartingHand}>
              <Save data-icon="inline-start" />
              {isSaving ? "Saving..." : "Save hand"}
            </Button>
          </div>
        </form>
      </section>
    </div>
  )
}
