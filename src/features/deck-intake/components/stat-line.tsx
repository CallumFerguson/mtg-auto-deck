import type { ResolvedCard } from "../types"

type StatLineProps = Pick<ResolvedCard, "power" | "toughness" | "loyalty">

export function StatLine({ power, toughness, loyalty }: StatLineProps) {
  if (power && toughness) {
    return <span>{power}/{toughness}</span>
  }

  if (loyalty) {
    return <span>Loyalty {loyalty}</span>
  }

  return null
}
