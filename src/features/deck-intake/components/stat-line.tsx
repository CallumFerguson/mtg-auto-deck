import type { ResolvedCard } from "../types"

type StatLineProps = Pick<ResolvedCard, "power" | "toughness" | "loyalty">

export function StatLine({ power, toughness, loyalty }: StatLineProps) {
  if (power && toughness) {
    return (
      <p>
        <span className="font-medium text-stone-100">Power/Toughness:</span>{" "}
        {power}/{toughness}
      </p>
    )
  }

  if (loyalty) {
    return (
      <p>
        <span className="font-medium text-stone-100">Loyalty:</span> {loyalty}
      </p>
    )
  }

  return null
}
