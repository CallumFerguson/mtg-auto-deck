import { Button } from "@/components/ui/button"

import { toManaCost, toOracleText, toTypeLine } from "../lib/scryfall"
import type { FuzzyMatch } from "../types"

type FuzzyMatchesPanelProps = {
  fuzzyMatches: FuzzyMatch[]
  onAcceptMatch: (match: FuzzyMatch) => void
  onRejectMatch: (match: FuzzyMatch) => void
}

export function FuzzyMatchesPanel({
  fuzzyMatches,
  onAcceptMatch,
  onRejectMatch,
}: FuzzyMatchesPanelProps) {
  return (
    <div className="rounded-[28px] border border-white/10 bg-white/5 p-5 shadow-lg shadow-black/30 backdrop-blur sm:p-6">
      <div className="mb-5 space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight">
          Review fuzzy matches
        </h2>
        <p className="text-sm leading-6 text-stone-400">
          Exact matches are included automatically. If Scryfall only finds a
          fuzzy match, confirm it here before it gets used.
        </p>
      </div>

      {fuzzyMatches.length ? (
        <div className="grid gap-4">
          {fuzzyMatches.map((match) => (
            <article
              key={match.name}
              className="rounded-2xl border border-amber-400/25 bg-amber-400/8 p-4"
            >
              <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
                <span className="rounded-full bg-amber-400/20 px-2.5 py-1 text-xs font-medium uppercase tracking-[0.18em] text-amber-100">
                  Review
                </span>
                <span className="font-semibold text-stone-100">
                  {match.quantity}x {match.name}
                </span>
                <span className="text-stone-400">suggested as</span>
                <span className="font-semibold text-amber-100">
                  {match.suggestedCard.name}
                </span>
              </div>

              <div className="space-y-2 text-sm leading-6 text-stone-300">
                {toManaCost(match.suggestedCard) ? (
                  <p>
                    <span className="font-medium text-stone-100">
                      Mana cost:
                    </span>{" "}
                    {toManaCost(match.suggestedCard)}
                  </p>
                ) : null}
                {toTypeLine(match.suggestedCard) ? (
                  <p>
                    <span className="font-medium text-stone-100">Type:</span>{" "}
                    {toTypeLine(match.suggestedCard)}
                  </p>
                ) : null}
                <p className="whitespace-pre-wrap">
                  {toOracleText(match.suggestedCard)}
                </p>
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <Button
                  type="button"
                  className="bg-emerald-600 text-white hover:bg-emerald-500"
                  onClick={() => onAcceptMatch(match)}
                >
                  Accept match
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="border-white/10 bg-black/20 text-stone-100 hover:bg-black/35"
                  onClick={() => onRejectMatch(match)}
                >
                  Reject and enter manually
                </Button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-[24px] border border-dashed border-white/10 bg-black/20 px-5 py-10 text-center text-sm leading-6 text-stone-500">
          Any non-exact matches will show up here for review.
        </div>
      )}
    </div>
  )
}
