import {
  PublicBenchmarkPage,
  PublicSimulationPage,
} from "@/pages/DeckSimulation"

const PUBLIC_BENCHMARK_PATH_PREFIX = "/public/benchmarks/"
const PUBLIC_SIMULATION_PATH_PREFIX = "/public/simulations/"

export function PublicSimulationApp() {
  if (window.location.pathname.startsWith(PUBLIC_BENCHMARK_PATH_PREFIX)) {
    const benchmarkId = getPublicRouteIdFromPathname(
      window.location.pathname,
      PUBLIC_BENCHMARK_PATH_PREFIX
    )

    if (!benchmarkId) {
      return (
        <main className="flex min-h-svh items-center justify-center bg-background px-4 text-sm text-muted-foreground">
          Public benchmark could not be found.
        </main>
      )
    }

    return <PublicBenchmarkPage benchmarkId={benchmarkId} />
  }

  const simulationId = getPublicSimulationIdFromPathname(
    window.location.pathname
  )
  const demoMode = shouldEnablePublicSimulationDemoMode(window.location.search)
  const hideHeader = shouldHidePublicSimulationHeader(window.location.search)
  const bundled = shouldLoadBundledPublicSimulation(window.location.search)

  if (!simulationId) {
    return (
      <main className="flex min-h-svh items-center justify-center bg-background px-4 text-sm text-muted-foreground">
        Public simulation could not be found.
      </main>
    )
  }

  return (
    <PublicSimulationPage
      bundled={bundled}
      demoMode={demoMode}
      hideHeader={hideHeader}
      simulationId={simulationId}
    />
  )
}

function getPublicSimulationIdFromPathname(pathname: string) {
  return getPublicRouteIdFromPathname(pathname, PUBLIC_SIMULATION_PATH_PREFIX)
}

function getPublicRouteIdFromPathname(pathname: string, pathPrefix: string) {
  if (!pathname.startsWith(pathPrefix)) {
    return null
  }

  const encodedId = pathname.slice(pathPrefix.length).split("/")[0]

  if (!encodedId) {
    return null
  }

  try {
    return decodeURIComponent(encodedId)
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

function shouldLoadBundledPublicSimulation(search: string) {
  const searchParams = new URLSearchParams(search)

  return searchParams.get("bundled") === "true"
}
