import { useCallback, useEffect, useState, type ReactNode } from "react"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { API_BASE_URL } from "@/lib/api"
import type { DeckDetails, DeckResponse } from "@/lib/deck-types"
import { navigateTo } from "@/lib/navigation"
import { DeckSimulation } from "@/pages/DeckSimulation"
import { ViewDeckCards } from "@/pages/ViewDeckCards"

type DeckPageTab = "details" | "simulation"

export function DeckPage({ deckId }: { deckId: string }) {
  const [deck, setDeck] = useState<DeckDetails | null>(null)
  const [activeTab, setActiveTab] = useState<DeckPageTab>("details")
  const [isLoadingDeck, setIsLoadingDeck] = useState(true)
  const [deckLoadError, setDeckLoadError] = useState<string | null>(null)

  const loadDeck = useCallback(async () => {
    setIsLoadingDeck(true)
    setDeckLoadError(null)

    try {
      const response = await fetch(`${API_BASE_URL}/decks/${deckId}`)

      if (!response.ok) {
        throw new Error(`Deck request failed with ${response.status}`)
      }

      const data = (await response.json()) as DeckResponse
      setDeck(data.deck)
    } catch {
      setDeckLoadError("Deck could not be loaded.")
    } finally {
      setIsLoadingDeck(false)
    }
  }, [deckId])

  useEffect(() => {
    void loadDeck()
  }, [loadDeck])

  return (
    <main className="min-h-svh bg-background px-4 py-6 text-foreground sm:px-6 lg:px-8">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="flex flex-col gap-4 border-b border-border pb-5">
          <Button
            type="button"
            variant="ghost"
            className="w-fit"
            onClick={() => navigateTo("/")}
          >
            <ArrowLeft data-icon="inline-start" />
            Decks
          </Button>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-2">
              <p className="text-sm font-medium tracking-[0.18em] text-sky-300 uppercase">
                Deck page
              </p>
              <h1 className="text-3xl font-semibold text-foreground sm:text-4xl">
                {deck?.name ?? "Deck"}
              </h1>
            </div>

            <div className="inline-grid w-full grid-cols-2 rounded-lg border border-border bg-card/70 p-1 sm:w-auto">
              <TabButton
                isActive={activeTab === "details"}
                onClick={() => setActiveTab("details")}
              >
                Details
              </TabButton>
              <TabButton
                isActive={activeTab === "simulation"}
                onClick={() => setActiveTab("simulation")}
              >
                Simulation
              </TabButton>
            </div>
          </div>
        </header>

        {isLoadingDeck ? (
          <div className="rounded-lg border border-border bg-card/70 px-4 py-8 text-sm text-muted-foreground">
            Loading deck...
          </div>
        ) : deckLoadError ? (
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-card/70 px-4 py-8 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-destructive">{deckLoadError}</p>
            <Button
              type="button"
              variant="outline"
              onClick={() => void loadDeck()}
            >
              Try again
            </Button>
          </div>
        ) : deck ? (
          activeTab === "details" ? (
            <ViewDeckCards deck={deck} />
          ) : (
            <DeckSimulation deckName={deck.name} />
          )
        ) : null}
      </section>
    </main>
  )
}

function TabButton({
  children,
  isActive,
  onClick,
}: {
  children: ReactNode
  isActive: boolean
  onClick: () => void
}) {
  return (
    <button
      className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
        isActive
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-muted/45 hover:text-foreground"
      }`}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  )
}
