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

export function getDeckSimulationPath(deckId: string, simulationId?: string) {
  const searchParams = new URLSearchParams({
    tab: "simulation",
  })

  if (simulationId) {
    searchParams.set("simulation", simulationId)
  }

  return `/decks/${encodeURIComponent(deckId)}?${searchParams.toString()}`
}
