export function navigateTo(pathname: string) {
  const currentUrl = new URL(window.location.href)
  const nextUrl = new URL(pathname, currentUrl)
  const nextPath = `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`
  const isQueryOnlyNavigation = currentUrl.pathname === nextUrl.pathname

  if (
    currentUrl.pathname === nextUrl.pathname &&
    currentUrl.search === nextUrl.search &&
    currentUrl.hash === nextUrl.hash
  ) {
    return
  }

  if (isQueryOnlyNavigation) {
    window.history.replaceState(null, "", nextPath)
  } else {
    window.history.pushState(null, "", nextPath)
  }

  window.dispatchEvent(new Event("app:navigate"))
}

export type DeckPageTab = "details" | "simulation"
export type AdminDashboardSectionId = "users"

export function isAdminPathname(pathname: string) {
  return pathname === "/admin" || pathname.startsWith("/admin/")
}

export function getAdminDashboardSectionIdFromPathname(
  pathname: string
): AdminDashboardSectionId | null {
  if (pathname === "/admin" || pathname === "/admin/users") {
    return "users"
  }

  return null
}

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
