import { Plus, Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"

const SIMULATION_PLACEHOLDERS = [
  "Opening hand check",
  "Three-turn ramp line",
  "Interaction-heavy table",
]

export function DeckSimulation({ deckName }: { deckName: string }) {
  return (
    <div className="grid min-h-[34rem] overflow-hidden rounded-lg border border-border bg-card/70 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <aside className="border-b border-border bg-background/35 lg:border-r lg:border-b-0">
        <div className="border-b border-border p-4">
          <Button type="button" className="w-full">
            <Plus data-icon="inline-start" />
            New simulation
          </Button>
        </div>

        <nav className="grid gap-1 p-2" aria-label="Simulations">
          {SIMULATION_PLACEHOLDERS.map((simulation, index) => (
            <button
              key={simulation}
              className={`rounded-md px-3 py-3 text-left text-sm transition-colors ${
                index === 0
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-muted/45 hover:text-foreground"
              }`}
              type="button"
            >
              {simulation}
            </button>
          ))}
        </nav>
      </aside>

      <section className="flex min-h-[28rem] flex-col">
        <header className="border-b border-border px-5 py-4">
          <p className="text-sm font-medium tracking-[0.16em] text-sky-300 uppercase">
            Simulation
          </p>
          <h2 className="mt-1 text-2xl font-semibold">{deckName}</h2>
        </header>

        <div className="grid flex-1 place-items-center px-5 py-10 text-center">
          <div className="max-w-md space-y-3">
            <Sparkles className="mx-auto size-8 text-sky-300" />
            <h3 className="text-lg font-semibold">Simulation workspace</h3>
            <p className="text-sm leading-6 text-muted-foreground">
              The structure is ready for saved simulations, creation, and the
              active run view. Functionality can plug into this area next.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
