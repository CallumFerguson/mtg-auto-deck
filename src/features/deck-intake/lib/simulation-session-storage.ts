import type {
  GameCardPayload,
  SimulationPromptRun,
  SimulationPayload,
} from "@/features/deck-intake/lib/simulation-session"

const SIMULATION_SESSION_STORAGE_KEY = "goldfish-simulation-session"
const SIMULATION_SESSION_STORAGE_VERSION = 1

export type StoredSimulationSession = {
  version: 1
  simulationPayload: SimulationPayload | null
  gameId: string
  currentSimulationSeed: number | null
  simulationError: string
  promptRuns: SimulationPromptRun[]
}

const DEFAULT_SIMULATION_SESSION: StoredSimulationSession = {
  version: SIMULATION_SESSION_STORAGE_VERSION,
  simulationPayload: null,
  gameId: "",
  currentSimulationSeed: null,
  simulationError: "",
  promptRuns: [],
}

export function loadStoredSimulationSession(): StoredSimulationSession {
  if (typeof window === "undefined") {
    return DEFAULT_SIMULATION_SESSION
  }

  try {
    const rawValue = window.localStorage.getItem(SIMULATION_SESSION_STORAGE_KEY)

    if (!rawValue) {
      return DEFAULT_SIMULATION_SESSION
    }

    const parsedValue = JSON.parse(rawValue) as Partial<StoredSimulationSession>

    if (parsedValue.version !== SIMULATION_SESSION_STORAGE_VERSION) {
      return DEFAULT_SIMULATION_SESSION
    }

    return {
      version: SIMULATION_SESSION_STORAGE_VERSION,
      simulationPayload: parseSimulationPayload(parsedValue.simulationPayload),
      gameId: typeof parsedValue.gameId === "string" ? parsedValue.gameId : "",
      currentSimulationSeed:
        typeof parsedValue.currentSimulationSeed === "number" &&
        Number.isFinite(parsedValue.currentSimulationSeed)
          ? parsedValue.currentSimulationSeed
          : null,
      simulationError:
        typeof parsedValue.simulationError === "string"
          ? parsedValue.simulationError
          : "",
      promptRuns: Array.isArray(parsedValue.promptRuns)
        ? (parsedValue.promptRuns as SimulationPromptRun[])
        : [],
    }
  } catch {
    return DEFAULT_SIMULATION_SESSION
  }
}

export function saveStoredSimulationSession(
  simulationSession: StoredSimulationSession
) {
  if (typeof window === "undefined") {
    return
  }

  try {
    window.localStorage.setItem(
      SIMULATION_SESSION_STORAGE_KEY,
      JSON.stringify(simulationSession)
    )
  } catch {
    // Ignore storage failures so simulation still works.
  }
}

export function clearStoredSimulationSession() {
  if (typeof window === "undefined") {
    return
  }

  try {
    window.localStorage.removeItem(SIMULATION_SESSION_STORAGE_KEY)
  } catch {
    // Ignore storage failures so simulation still works.
  }
}

function parseSimulationPayload(
  value: unknown
): StoredSimulationSession["simulationPayload"] {
  if (!value || typeof value !== "object") {
    return null
  }

  const parsedValue = value as Partial<SimulationPayload>

  if (
    !Array.isArray(parsedValue.commanders) ||
    !Array.isArray(parsedValue.deck) ||
    !parsedValue.commanders.every(isGameCardPayload) ||
    !parsedValue.deck.every(isGameCardPayload)
  ) {
    return null
  }

  return {
    commanders: parsedValue.commanders,
    deck: parsedValue.deck,
  }
}

function isGameCardPayload(value: unknown): value is GameCardPayload {
  return (
    value !== null &&
    typeof value === "object" &&
    "name" in value &&
    typeof value.name === "string" &&
    "cardText" in value &&
    typeof value.cardText === "string"
  )
}
