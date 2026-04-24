import { useEffect, useState } from "react"
import { Plus, RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { API_BASE_URL } from "@/lib/api"
import type { Deck, DecksResponse } from "@/lib/deck-types"
import { navigateTo } from "@/lib/navigation"
import { CreateDeckModal } from "@/pages/CreateDeckModal"

export function DeckListPage() {
  const [decks, setDecks] = useState<Deck[]>([])
  const [isLoadingDecks, setIsLoadingDecks] = useState(true)
  const [deckLoadError, setDeckLoadError] = useState<string | null>(null)
  const [isCreateDeckOpen, setIsCreateDeckOpen] = useState(false)

  async function loadDecks() {
    setIsLoadingDecks(true)
    setDeckLoadError(null)

    try {
      const response = await fetch(`${API_BASE_URL}/decks`)

      if (!response.ok) {
        throw new Error(`Deck request failed with ${response.status}`)
      }

      const data = (await response.json()) as DecksResponse
      setDecks(data.decks)
    } catch {
      setDeckLoadError("Decks could not be loaded.")
    } finally {
      setIsLoadingDecks(false)
    }
  }

  useEffect(() => {
    void loadDecks()
  }, [])

  return (
    <main className="min-h-svh bg-background px-4 py-6 text-foreground sm:px-6 lg:px-8">
      <section className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <header className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <p className="text-sm font-medium tracking-[0.18em] text-sky-300 uppercase">
              MTG Auto Goldfish
            </p>
            <h1 className="text-3xl font-semibold text-foreground sm:text-4xl">
              Decks
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Refresh decks"
              title="Refresh decks"
              onClick={() => void loadDecks()}
              disabled={isLoadingDecks}
            >
              <RefreshCw
                className={isLoadingDecks ? "animate-spin" : undefined}
              />
            </Button>
            <Button type="button" onClick={() => setIsCreateDeckOpen(true)}>
              <Plus data-icon="inline-start" />
              New deck
            </Button>
          </div>
        </header>

        <div className="overflow-hidden rounded-lg border border-border bg-card/70">
          {isLoadingDecks ? (
            <div className="px-4 py-8 text-sm text-muted-foreground">
              Loading decks...
            </div>
          ) : deckLoadError ? (
            <div className="flex flex-col gap-3 px-4 py-8 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-destructive">{deckLoadError}</p>
              <Button
                type="button"
                variant="outline"
                onClick={() => void loadDecks()}
              >
                Try again
              </Button>
            </div>
          ) : decks.length > 0 ? (
            <ul className="divide-y divide-border">
              {decks.map((deck) => (
                <li key={deck.id}>
                  <a
                    className="group flex items-center justify-between gap-4 px-4 py-4 text-base font-medium text-foreground transition-colors hover:bg-muted/45 focus:bg-muted/45 focus:outline-none"
                    href={`/decks/${deck.id}`}
                    onClick={(event) => {
                      event.preventDefault()
                      navigateTo(`/decks/${deck.id}`)
                    }}
                  >
                    <span>{deck.name}</span>
                    <span className="text-sm text-muted-foreground transition-colors group-hover:text-sky-200">
                      Open
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-4 py-8 text-sm text-muted-foreground">
              No decks yet.
            </div>
          )}
        </div>
      </section>

      {isCreateDeckOpen ? (
        <CreateDeckModal
          onClose={() => setIsCreateDeckOpen(false)}
          onCreated={() => {
            setIsCreateDeckOpen(false)
            void loadDecks()
          }}
        />
      ) : null}
    </main>
  )
}
