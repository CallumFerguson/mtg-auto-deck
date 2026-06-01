import { getSimulationResultsTimelineTurnFromSearchParams } from "./simulation-results-timeline"

export type DeckPageTab = "details" | "simulation"
export type AdminDashboardSectionId = "users" | "model-presets" | "benchmarks"

export function getAdminDashboardSectionIdFromPathname(
  pathname: string
): AdminDashboardSectionId | null {
  if (pathname === "/admin" || pathname === "/admin/users") {
    return "users"
  }

  if (pathname === "/admin/model-presets") {
    return "model-presets"
  }

  if (pathname === "/admin/benchmarks") {
    return "benchmarks"
  }

  return null
}

export function getDeckPageTabFromSearchParams(
  searchParams: URLSearchParams
): DeckPageTab {
  const tab = searchParams.get("tab")

  return tab === "simulation" ? "simulation" : "details"
}

export function getDeckSimulationIdFromSearchParams(
  searchParams: URLSearchParams
) {
  const simulationId = searchParams.get("simulation")?.trim()

  return simulationId || null
}

export function getDeckSimulationTurnFromSearchParams(
  searchParams: URLSearchParams
) {
  return getSimulationResultsTimelineTurnFromSearchParams(searchParams)
}

export function getDeckSimulationPath(
  deckId: string,
  simulationId?: string,
  turnNumber?: number | null
) {
  const searchParams = new URLSearchParams({
    tab: "simulation",
  })

  if (simulationId) {
    searchParams.set("simulation", simulationId)
  }

  if (typeof turnNumber === "number") {
    searchParams.set("turn", String(turnNumber))
  }

  return `/decks/${encodeURIComponent(deckId)}?${searchParams.toString()}`
}
