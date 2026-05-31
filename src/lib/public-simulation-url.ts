const BUNDLED_PUBLIC_SIMULATIONS_BASE_PATH = "/simulations"
const MISSING_PUBLIC_DATA_BASE_URL_MESSAGE =
  "Missing VITE_PUBLIC_DATA_BASE_URL."

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

  const publicDataBaseUrl = getPublicDataBaseUrl()

  return `${publicDataBaseUrl}/simulations/${encodedSimulationId}.json`
}

export function getPublicBenchmarkIndexJsonUrl({
  benchmarkId,
}: {
  benchmarkId: string
}) {
  const encodedBenchmarkId = encodeURIComponent(benchmarkId)

  return `${getPublicDataBaseUrl()}/benchmarks/${encodedBenchmarkId}/index.json`
}

export function getPublicBenchmarkSimulationJsonUrl({
  benchmarkId,
  filePath,
  simulationId,
}: {
  benchmarkId: string
  filePath: string
  simulationId: string
}) {
  const relativeFilePath = getPublicBenchmarkSimulationRelativeFilePath({
    benchmarkId,
    filePath,
    simulationId,
  })
  const encodedBenchmarkId = encodeURIComponent(benchmarkId)
  const encodedRelativeFilePath = encodeRelativePath(relativeFilePath)

  return `${getPublicDataBaseUrl()}/benchmarks/${encodedBenchmarkId}/${encodedRelativeFilePath}`
}

export function getPublicSimulationLoadFailureMessage(error: unknown) {
  return error instanceof Error &&
    error.message === MISSING_PUBLIC_DATA_BASE_URL_MESSAGE
    ? error.message
    : "Public simulation could not be loaded."
}

export function getPublicBenchmarkLoadFailureMessage(error: unknown) {
  return error instanceof Error &&
    error.message === MISSING_PUBLIC_DATA_BASE_URL_MESSAGE
    ? error.message
    : "Public benchmark could not be loaded."
}

export function getPublicBenchmarkSimulationLoadFailureMessage(error: unknown) {
  return error instanceof Error &&
    error.message === MISSING_PUBLIC_DATA_BASE_URL_MESSAGE
    ? error.message
    : "Public benchmark simulation could not be loaded."
}

function getPublicDataBaseUrl() {
  const configuredPublicDataBaseUrl = import.meta.env.VITE_PUBLIC_DATA_BASE_URL

  if (configuredPublicDataBaseUrl) {
    return stripTrailingSlashes(configuredPublicDataBaseUrl)
  }

  throw new Error(MISSING_PUBLIC_DATA_BASE_URL_MESSAGE)
}

function getBundledPublicSimulationJsonUrl(encodedSimulationId: string) {
  return `${BUNDLED_PUBLIC_SIMULATIONS_BASE_PATH}/${encodedSimulationId}.json`
}

function stripTrailingSlashes(url: string) {
  return url.replace(/\/+$/, "")
}

function getPublicBenchmarkSimulationRelativeFilePath({
  benchmarkId,
  filePath,
  simulationId,
}: {
  benchmarkId: string
  filePath: string
  simulationId: string
}) {
  const fallbackFilePath = `simulations/${simulationId}.json`
  const normalizedFilePath = filePath.trim().replaceAll("\\", "/")

  if (!isSafeRelativePath(normalizedFilePath)) {
    return fallbackFilePath
  }

  const benchmarkPrefix = `${benchmarkId}/`
  const relativeFilePath = normalizedFilePath.startsWith(benchmarkPrefix)
    ? normalizedFilePath.slice(benchmarkPrefix.length)
    : normalizedFilePath

  if (
    !isSafeRelativePath(relativeFilePath) ||
    !relativeFilePath.startsWith("simulations/")
  ) {
    return fallbackFilePath
  }

  return relativeFilePath
}

function isSafeRelativePath(path: string) {
  const pathSegments = path.split("/")

  return (
    path.length > 0 &&
    !path.startsWith("/") &&
    pathSegments.every(
      (pathSegment) =>
        pathSegment.length > 0 &&
        pathSegment !== "." &&
        pathSegment !== ".."
    )
  )
}

function encodeRelativePath(path: string) {
  return path.split("/").map(encodeURIComponent).join("/")
}
