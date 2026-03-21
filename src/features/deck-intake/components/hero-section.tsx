import { Sparkles } from "lucide-react"

type HeroSectionProps = {
  totalCards: number
  expectedDecklistCount: number
  commanderCount: number
  deckCountDelta: number
  fuzzyMatchCount: number
}

export function HeroSection({
  totalCards,
  expectedDecklistCount,
  commanderCount,
  deckCountDelta,
  fuzzyMatchCount,
}: HeroSectionProps) {
  return (
    <section className="overflow-hidden rounded-[28px] border border-black/10 bg-stone-950 text-stone-100 shadow-2xl shadow-amber-950/20">
      <div className="grid gap-8 px-6 py-8 lg:grid-cols-[1.1fr_0.9fr] lg:px-8">
        <div className="space-y-5">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-200/15 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.24em] text-amber-100/80">
            <Sparkles className="size-3.5" />
            AI Goldfish Setup
          </div>
          <div className="space-y-3">
            <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
              Turn a raw decklist into AI-ready gameplay text.
            </h1>
            <p className="max-w-2xl text-sm leading-7 text-stone-300 sm:text-base">
              Paste a standard mass-entry list, add your commander, and we will
              pull the relevant rules text from Scryfall so the agent has clean
              card context to goldfish with.
            </p>
          </div>
        </div>

        <div className="grid gap-4 rounded-[24px] border border-white/10 bg-white/6 p-5 backdrop-blur">
          <div className="grid gap-1">
            <span className="text-xs uppercase tracking-[0.2em] text-stone-400">
              Current input
            </span>
            <span className="text-3xl font-semibold">{totalCards}</span>
            <span className="text-sm text-stone-300">
              cards parsed from the main deck box
            </span>
            <span className="text-sm text-stone-400">
              Target: {expectedDecklistCount} cards with {commanderCount}{" "}
              commander{commanderCount === 1 ? "" : "s"}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-white/10 bg-black/15 p-4">
              <div className="text-2xl font-semibold">{commanderCount}</div>
              <div className="text-sm text-stone-300">commanders set</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/15 p-4">
              <div className="text-2xl font-semibold">
                {deckCountDelta === 0
                  ? "On target"
                  : deckCountDelta > 0
                    ? `+${deckCountDelta}`
                    : deckCountDelta}
              </div>
              <div className="text-sm text-stone-300">deck count delta</div>
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/15 p-4">
            <div className="text-2xl font-semibold">{fuzzyMatchCount}</div>
            <div className="text-sm text-stone-300">need fuzzy review</div>
          </div>
        </div>
      </div>
    </section>
  )
}
