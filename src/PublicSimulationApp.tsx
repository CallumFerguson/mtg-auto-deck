import { PublicSimulationPage } from "@/pages/DeckSimulation"

const PUBLIC_SIMULATION_PATH_PREFIX = "/public/simulations/"

export function PublicSimulationApp() {
  const simulationId = getPublicSimulationIdFromPathname(
    window.location.pathname
  )

  if (!simulationId) {
    return (
      <main className="flex min-h-svh items-center justify-center bg-background px-4 text-sm text-muted-foreground">
        Public simulation could not be found.
      </main>
    )
  }

  return <PublicSimulationPage simulationId={simulationId} />
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
