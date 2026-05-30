const BUNDLED_PUBLIC_SIMULATIONS_BASE_PATH = "/simulations"
const MISSING_PUBLIC_SIMULATIONS_BASE_URL_MESSAGE =
  "Missing VITE_PUBLIC_SIMULATIONS_BASE_URL."

export function getPublicSimulationJsonUrl({
  bundled,
  simulationId,
}: {
  bundled: boolean
  simulationId: string
}) {
  const encodedSimulationId = encodeURIComponent(simulationId)

  if (bundled) {
    return getBundledPublicSimulationJsonUrl(encodedSimulationId)
  }

  const publicSimulationsBaseUrl = getPublicSimulationsBaseUrl()

  return `${publicSimulationsBaseUrl}/${encodedSimulationId}.json`
}

export function getPublicSimulationLoadFailureMessage(error: unknown) {
  return error instanceof Error &&
    error.message === MISSING_PUBLIC_SIMULATIONS_BASE_URL_MESSAGE
    ? error.message
    : "Public simulation could not be loaded."
}

function getPublicSimulationsBaseUrl() {
  const configuredPublicSimulationsBaseUrl =
    import.meta.env.VITE_PUBLIC_SIMULATIONS_BASE_URL

  if (configuredPublicSimulationsBaseUrl) {
    return stripTrailingSlashes(configuredPublicSimulationsBaseUrl)
  }

  throw new Error(MISSING_PUBLIC_SIMULATIONS_BASE_URL_MESSAGE)
}

function getBundledPublicSimulationJsonUrl(encodedSimulationId: string) {
  return `${BUNDLED_PUBLIC_SIMULATIONS_BASE_PATH}/${encodedSimulationId}.json`
}

function stripTrailingSlashes(url: string) {
  return url.replace(/\/+$/, "")
}
