import { PublicSimulationPage } from "@/pages/DeckSimulation"

const PUBLIC_SIMULATION_PATH_PREFIX = "/public/simulations/"

export function PublicSimulationApp() {
  const simulationId = getPublicSimulationIdFromPathname(
    window.location.pathname
  )
  const demoMode = shouldEnablePublicSimulationDemoMode(window.location.search)
  const hideHeader = shouldHidePublicSimulationHeader(window.location.search)

  if (!simulationId) {
    return (
      <main className="flex min-h-svh items-center justify-center bg-background px-4 text-sm text-muted-foreground">
        Public simulation could not be found.
      </main>
    )
  }

  return (
    <PublicSimulationPage
      demoMode={demoMode}
      hideHeader={hideHeader}
      simulationId={simulationId}
    />
  )
}

function getPublicSimulationIdFromPathname(pathname: string) {
  if (!pathname.startsWith(PUBLIC_SIMULATION_PATH_PREFIX)) {
    return null
  }

  const encodedSimulationId = pathname
    .slice(PUBLIC_SIMULATION_PATH_PREFIX.length)
    .split("/")[0]

  if (!encodedSimulationId) {
    return null
  }

  try {
    return decodeURIComponent(encodedSimulationId)
  } catch {
    return null
  }
}

function shouldHidePublicSimulationHeader(search: string) {
  const searchParams = new URLSearchParams(search)
  const hideHeaderValue = searchParams.get("hideHeader")

  return hideHeaderValue === "1" || hideHeaderValue === "true"
}

function shouldEnablePublicSimulationDemoMode(search: string) {
  const searchParams = new URLSearchParams(search)

  return searchParams.get("demo") === "true"
}
