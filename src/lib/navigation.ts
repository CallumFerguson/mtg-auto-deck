export function navigateTo(pathname: string) {
  window.history.pushState(null, "", pathname)
  window.dispatchEvent(new Event("app:navigate"))
}

export type DeckPageTab = "details" | "simulation"

export function getDeckIdFromPathname(pathname: string) {
  const match = pathname.match(/^\/decks\/([^/]+)$/)

  return match?.[1] ? decodeURIComponent(match[1]) : null
}

export function getDeckPageTabFromSearch(search: string): DeckPageTab {
  const tab = new URLSearchParams(search).get("tab")

  return tab === "simulation" ? "simulation" : "details"
}

export function getDeckSimulationIdFromSearch(search: string) {
  const simulationId = new URLSearchParams(search).get("simulation")?.trim()

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
