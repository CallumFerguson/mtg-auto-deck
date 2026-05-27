import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
  type ReactNode,
  type UIEvent,
} from "react"
import ReactMarkdown from "react-markdown"
import { createPortal } from "react-dom"
import { useNavigate } from "react-router-dom"
import tapIconUrl from "mana-font/svg/tap.svg"
import {
  BookCopy,
  Bug,
  Check,
  ClipboardCheck,
  Dices,
  Eye,
  EyeOff,
  Gauge,
  Globe2,
  Hand,
  Hourglass,
  Link2,
  LoaderCircle,
  MoreVertical,
  Moon,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Shuffle,
  Sparkles,
  Square,
  Sunrise,
  Sunset,
  Swords,
  Trash2,
  X,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { UsageLimitRows } from "@/components/UsageLimitRows"
import { API_BASE_URL, apiFetch } from "@/lib/api"
import { readApiError } from "@/lib/api-error"
import { useBillingTier } from "@/lib/billing-tier-state"
import type {
  CreateSavedSeedResponse,
  CreateSimulationResponse,
  UpdateSimulationResponse,
  CreateStartingHandResponse,
  DeckCard,
  PublicSimulationResponse,
  SavedSeed,
  SavedSeedsResponse,
  Simulation,
  SimulationDebugInfo,
  SimulationDebugLlmRun,
  SimulationDebugLlmRunChunk,
  SimulationResultsInfo,
  SimulationResultsStreamEvent,
  SimulationsResponse,
  SimulationDebugResponse,
  StartingHand,
  StartingHandsResponse,
  StopSimulationResponse,
} from "@/lib/deck-types"
import {
  getLlmModelPresetLabel,
  type LlmModelPreset,
  type LlmModelPresetsResponse,
} from "@/lib/llm-model-preset-types"
import {
  getDeckSimulationPath,
  getPublicSimulationPath,
} from "@/lib/navigation"
import {
  getPresetStartingHandLibraryCardCount,
  getSimulationRunLibraryCardCount,
} from "@/lib/simulation-game-state-library"
import {
  getSimulationFinalParsedOutput,
  getSimulationFinalParsedOutputFromPayload,
  hasTurnActions,
  type ParsedSimulationFinalOutput,
} from "@/lib/simulation-final-output"
import { applySimulationResultsStreamEvent } from "@/lib/simulation-results-stream"
import {
  buildSimulationResultsTimelineSteps,
  isActiveSimulationResultsTimelineStep,
  resolveSimulationResultsTimelineSelection,
  shouldPreserveFinishedSimulationResultsTimelineSelection,
  type SimulationResultsTimelineSelectionSnapshot,
  type SimulationResultsTimelineStep,
} from "@/lib/simulation-results-timeline"
import {
  getSimulationRunStartTimeMs,
  parseTimestampMs,
} from "@/lib/simulation-run-timing"
import {
  TURN_PHASE_CHANGES,
  getSimulationRunActiveToolCallName,
  getSimulationResultEntries,
  hasSimulationRunFinalParsedOutputChunk,
  isSimulationRunLatestChunkOutputDelta,
  type LoggedTurnAction,
  type SimulationResultEntry,
  type TurnPhaseChange,
} from "@/lib/simulation-result-chunks"
import {
  EMPTY_SIMULATION_CARD_LOOKUP,
  createSimulationCardLookup,
  getSimulationResultToolCardNames,
  resolveSimulationCard,
  type SimulationCardLookup,
} from "@/lib/simulation-card-resolution"
import {
  getKnownSimulationResultToolLabel,
  getKnownSimulationResultToolLabelForChunk,
  getSimulationResultToolReasonForChunk,
} from "@/lib/simulation-result-tool-labels"
import { useUsageLimits } from "@/lib/usage-limits"

type OpeningHandCardOption = {
  id: string
  deckCardId: number
  name: string
}

type SimulationResultsAction =
  | {
      kind: "opening_hand"
    }
  | {
      kind: "turn"
      turnNumber: number
    }

type SimulationResultsNextTurnTimelineStep = {
  id: string
  kind: "simulate_turn"
  label: string
  detailLabel: string
  status: "next_turn" | "starting_turn"
  turnNumber: number
}

type SimulationResultsReportTimelineStep = {
  id: "action:report"
  kind: "generate_report"
  label: string
  detailLabel: string
  status: "report"
}

type SimulationResultsDisplayTimelineStep =
  | SimulationResultsTimelineStep
  | SimulationResultsNextTurnTimelineStep
  | SimulationResultsReportTimelineStep

const DEFAULT_TURNS_TO_SIMULATE = "1"
const USAGE_LIMIT_FAILURE_MESSAGE_PATTERN = /\bout of usage limits\b/i
const CREATE_SIMULATION_USE_FLEX_STORAGE_KEY =
  "mtg-auto-deck:create-simulation-use-flex-service-tier"
const MANA_SYMBOL_TEXT_PATTERN = /(\{[^{}\s]+\})/g
const MANA_SYMBOL_CLASS_NAMES = new Set([
  "0",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "11",
  "12",
  "13",
  "14",
  "15",
  "16",
  "17",
  "18",
  "19",
  "20",
  "100",
  "1000000",
  "b",
  "bg",
  "bgp",
  "bp",
  "br",
  "brp",
  "c",
  "cb",
  "cg",
  "cr",
  "cu",
  "cw",
  "e",
  "g",
  "gp",
  "gu",
  "gup",
  "gw",
  "gwp",
  "infinity",
  "p",
  "r",
  "rg",
  "rgp",
  "rp",
  "rw",
  "rwp",
  "s",
  "tap",
  "u",
  "ub",
  "ubp",
  "untap",
  "up",
  "ur",
  "urp",
  "w",
  "wb",
  "wbp",
  "wp",
  "wu",
  "wup",
  "x",
  "y",
  "z",
  "2b",
  "2g",
  "2r",
  "2u",
  "2w",
  "1-2",
  "chaos",
])

async function writePlainTextToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch {
      // Fall through to the textarea path for browsers that block Clipboard API.
    }
  }

  const textarea = document.createElement("textarea")
  textarea.value = text
  textarea.setAttribute("readonly", "")
  textarea.style.left = "0"
  textarea.style.opacity = "0"
  textarea.style.position = "fixed"
  textarea.style.top = "0"

  document.body.append(textarea)
  textarea.focus()
  textarea.select()

  try {
    if (!document.execCommand("copy")) {
      throw new Error("Clipboard copy failed.")
    }
  } finally {
    textarea.remove()
  }
}

function getSimulationLabel(simulation: Simulation) {
  const turnLabel =
    simulation.simulatedTurnCount === 1
      ? "1 turn"
      : `${simulation.simulatedTurnCount} turns`

  return `${simulation.id.slice(0, 8)} - ${turnLabel}`
}

function getPublicSimulationUrl(simulationId: string) {
  return `${window.location.origin}${getPublicSimulationPath(simulationId)}`
}

function getSimulationRunCountFromResults(resultsInfo: SimulationResultsInfo) {
  return (
    getCurrentOpeningHandRunCount(resultsInfo) +
    resultsInfo.turnLlmRuns.filter(isCountedTurnRun).length +
    resultsInfo.reportLlmRuns.filter(isCountedReportRun).length
  )
}

function getSimulationTurnCountFromResults(resultsInfo: SimulationResultsInfo) {
  return resultsInfo.turnLlmRuns.reduce((turnCount, run) => {
    if (run.outdated === true || typeof run.turnNumber !== "number") {
      return turnCount
    }

    return Math.max(turnCount, run.turnNumber)
  }, 0)
}

function getActiveLlmRunCountFromResults(resultsInfo: SimulationResultsInfo) {
  return [
    ...resultsInfo.openingHandLlmRuns,
    ...resultsInfo.turnLlmRuns,
    ...resultsInfo.reportLlmRuns,
  ].filter((run) => isActiveLlmRunStatus(run.status)).length
}

function isActiveLlmRunStatus(status: string) {
  return (
    status === "pending" ||
    status === "streaming" ||
    status === "cancel_requested"
  )
}

function getLlmRunEstimatedPriceText(
  run: Pick<SimulationDebugLlmRun, "estimatedPriceCents" | "status">
) {
  if (isActiveLlmRunStatus(run.status) || !run.estimatedPriceCents) {
    return null
  }

  return `${run.estimatedPriceCents} cents`
}

function isTerminalLlmRunStatus(status: string) {
  return status === "completed" || status === "failed" || status === "cancelled"
}

function findSimulationResultsRun(
  resultsInfo: SimulationResultsInfo | null,
  llmRunId: string
) {
  if (!resultsInfo) {
    return null
  }

  return (
    [
      ...resultsInfo.openingHandLlmRuns,
      ...resultsInfo.turnLlmRuns,
      ...resultsInfo.reportLlmRuns,
    ].find((run) => run.llmRunId === llmRunId) ?? null
  )
}

function shouldRefreshUsageLimitsForFinishedStreamRun(
  streamEvent: SimulationResultsStreamEvent,
  previousResultsInfo: SimulationResultsInfo | null,
  refreshedRunIds: Set<string>
) {
  if (streamEvent.type !== "llm_run_updated") {
    return false
  }

  if (!isTerminalLlmRunStatus(streamEvent.run.status)) {
    return false
  }

  if (refreshedRunIds.has(streamEvent.run.llmRunId)) {
    return false
  }

  const previousRun = findSimulationResultsRun(
    previousResultsInfo,
    streamEvent.run.llmRunId
  )

  if (previousRun && isTerminalLlmRunStatus(previousRun.status)) {
    return false
  }

  refreshedRunIds.add(streamEvent.run.llmRunId)
  return true
}

function getSimulationRunFinishedTimeMs(
  run: Pick<
    SimulationDebugLlmRun,
    "completedAt" | "failedAt" | "cancelledAt"
  >
) {
  return (
    parseTimestampMs(run.completedAt) ??
    parseTimestampMs(run.failedAt) ??
    parseTimestampMs(run.cancelledAt)
  )
}

function getSimulationRunFinishedDurationText(
  run: Pick<
    SimulationDebugLlmRun,
    "startedAt" | "completedAt" | "failedAt" | "cancelledAt"
  >
) {
  const startTimeMs = getSimulationRunStartTimeMs(run)
  const finishedTimeMs = getSimulationRunFinishedTimeMs(run)

  if (startTimeMs === null || finishedTimeMs === null) {
    return null
  }

  return formatMinutesSeconds(finishedTimeMs - startTimeMs)
}

function formatMinutesSeconds(durationMs: number) {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  if (minutes === 0) {
    return `${seconds}s`
  }

  return `${minutes}m ${seconds}s`
}

function getCurrentOpeningHandRunCount(resultsInfo: SimulationResultsInfo) {
  const maxAttemptNumber = Math.max(
    0,
    ...resultsInfo.openingHandLlmRuns.map((run) => run.attemptNumber)
  )

  return resultsInfo.openingHandLlmRuns.filter(
    (run) =>
      run.attemptNumber === maxAttemptNumber && isCountedOpeningHandRun(run)
  ).length
}

function isCountedOpeningHandRun(
  run: SimulationResultsInfo["openingHandLlmRuns"][number]
) {
  return (
    isActiveLlmRunStatus(run.status) ||
    run.status === "failed" ||
    run.status === "cancelled" ||
    (run.status === "completed" && run.openingHandIsValid === true)
  )
}

function isCountedTurnRun(run: SimulationResultsInfo["turnLlmRuns"][number]) {
  return (
    run.outdated !== true &&
    (isActiveLlmRunStatus(run.status) ||
      run.status === "failed" ||
      run.status === "cancelled" ||
      (run.status === "completed" &&
        hasGameState(run.gameState) &&
        hasTurnActions(run.turnActions)))
  )
}

function isSuccessfulOpeningHandRun(
  run: SimulationResultsInfo["openingHandLlmRuns"][number]
) {
  return run.status === "completed" && run.openingHandIsValid === true
}

function isSuccessfulTurnRun(
  run: SimulationResultsInfo["turnLlmRuns"][number]
) {
  return (
    run.status === "completed" &&
    run.outdated !== true &&
    hasGameState(run.gameState) &&
    hasTurnActions(run.turnActions)
  )
}

function canGenerateReportFromVisibleResults(
  simulation: Simulation,
  resultsInfo: SimulationResultsInfo
) {
  if (simulation.startingHandId === null) {
    const latestOpeningHandRun = resultsInfo.openingHandLlmRuns.reduce<
      SimulationResultsInfo["openingHandLlmRuns"][number] | null
    >((latestRun, run) => {
      if (!latestRun || run.attemptNumber > latestRun.attemptNumber) {
        return run
      }

      return latestRun
    }, null)

    if (
      !latestOpeningHandRun ||
      latestOpeningHandRun.status !== "completed" ||
      latestOpeningHandRun.openingHandIsValid !== true
    ) {
      return false
    }

    const openingHandFinalOutput =
      getSimulationFinalParsedOutput(latestOpeningHandRun)

    if (
      openingHandFinalOutput?.type !== "opening_hand" ||
      openingHandFinalOutput.keptHand.length === 0 ||
      !openingHandFinalOutput.summary.trim()
    ) {
      return false
    }
  }

  const sortedTurnRuns = [...resultsInfo.turnLlmRuns].sort(
    (firstRun, secondRun) =>
      (firstRun.turnNumber ?? 0) - (secondRun.turnNumber ?? 0) ||
      firstRun.attemptNumber - secondRun.attemptNumber
  )
  const seenTurnNumbers = new Set<number>()

  for (const run of sortedTurnRuns) {
    if (
      run.status !== "completed" ||
      run.outdated === true ||
      typeof run.turnNumber !== "number" ||
      seenTurnNumbers.has(run.turnNumber)
    ) {
      return false
    }

    seenTurnNumbers.add(run.turnNumber)
  }

  for (
    let turnNumber = 1;
    turnNumber <= sortedTurnRuns.length;
    turnNumber += 1
  ) {
    const run = sortedTurnRuns[turnNumber - 1]

    if (run?.turnNumber !== turnNumber) {
      return false
    }

    const turnFinalOutput = getSimulationFinalParsedOutput(run)

    if (
      turnFinalOutput?.type !== "turn" ||
      !hasGameState(turnFinalOutput.gameState) ||
      !hasGameState(run.gameState) ||
      !hasTurnActions(run.turnActions)
    ) {
      return false
    }
  }

  return true
}

function hasGameState(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function getRandomDigit(maxExclusive: number) {
  const maxUnbiasedValue = 256 - (256 % maxExclusive)
  const randomBytes = new Uint8Array(1)

  do {
    crypto.getRandomValues(randomBytes)
  } while (randomBytes[0] >= maxUnbiasedValue)

  return randomBytes[0] % maxExclusive
}

function createRandomSimulationSeed() {
  const digits = [String(getRandomDigit(9) + 1)]

  for (let digitIndex = 1; digitIndex < 20; digitIndex += 1) {
    digits.push(String(getRandomDigit(10)))
  }

  return digits.join("")
}

function getStoredCreateSimulationUseFlexServiceTier() {
  try {
    const storedValue = window.localStorage.getItem(
      CREATE_SIMULATION_USE_FLEX_STORAGE_KEY
    )

    return storedValue === null ? true : storedValue === "true"
  } catch {
    return true
  }
}

function storeCreateSimulationUseFlexServiceTier(isEnabled: boolean) {
  try {
    window.localStorage.setItem(
      CREATE_SIMULATION_USE_FLEX_STORAGE_KEY,
      String(isEnabled)
    )
  } catch {
    // Local storage is only a convenience for this form preference.
  }
}

function isUsageLimitFailureMessage(message: string | null) {
  return Boolean(message && USAGE_LIMIT_FAILURE_MESSAGE_PATTERN.test(message))
}

function getOpeningHandCardOptions(
  cards: readonly DeckCard[]
): OpeningHandCardOption[] {
  return cards
    .flatMap((card) =>
      Array.from({ length: card.quantity }, (_, copyIndex) => ({
        id: `${card.deckCardId}-${copyIndex}`,
        deckCardId: card.deckCardId,
        name: card.name,
      }))
    )
    .sort((firstCard, secondCard) =>
      firstCard.name.localeCompare(secondCard.name)
    )
}

function UsageLimitReachedNotice({
  onUpgradeUsage,
  shouldShowUsageUpgradeAction,
}: {
  onUpgradeUsage: () => void
  shouldShowUsageUpgradeAction: boolean
}) {
  const { refreshBillingTier } = useBillingTier()
  const { refreshUsageLimits } = useUsageLimits()

  useEffect(() => {
    void refreshBillingTier()
    void refreshUsageLimits()
  }, [refreshBillingTier, refreshUsageLimits])

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <Gauge className="mt-0.5 size-4 shrink-0 text-amber-200" aria-hidden />
        <div className="min-w-0">
          <p className="font-semibold text-foreground">Usage limit reached</p>
          <p className="mt-1 text-xs text-amber-100/80">
            Try again after your available usage refreshes
          </p>
          <UsageLimitRows
            className="mt-3 max-w-xl"
            rowClassName="text-amber-100/80"
          />
        </div>
      </div>
      {shouldShowUsageUpgradeAction ? (
        <Button
          type="button"
          className="w-fit sm:self-center"
          onClick={onUpgradeUsage}
        >
          <Sparkles data-icon="inline-start" />
          Upgrade
        </Button>
      ) : null}
    </div>
  )
}

export function PublicSimulationPage({
  simulationId,
}: {
  simulationId: string
}) {
  const [publicSimulation, setPublicSimulation] =
    useState<PublicSimulationResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const loadPublicSimulation = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)

    try {
      const response = await apiFetch(
        `${API_BASE_URL}/public/simulations/${encodeURIComponent(simulationId)}`
      )

      if (!response.ok) {
        setLoadError(
          response.status === 404
            ? "Public simulation could not be found."
            : await readApiError(
                response,
                "Public simulation could not be loaded."
              )
        )
        return
      }

      const data = (await response.json()) as PublicSimulationResponse
      setPublicSimulation(data)
    } catch {
      setLoadError("Public simulation could not be loaded.")
    } finally {
      setIsLoading(false)
    }
  }, [simulationId])

  useEffect(() => {
    void loadPublicSimulation()
  }, [loadPublicSimulation])

  return (
    <main className="flex h-svh flex-col overflow-hidden bg-background text-foreground">
      <header className="shrink-0 border-b border-border px-4 py-4 sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-2">
          <p className="text-sm font-medium tracking-[0.18em] text-sky-300 uppercase">
            Public simulation
          </p>
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">
              {publicSimulation?.deck.name ?? "Simulation"}
            </h1>
            <p className="text-sm break-all text-muted-foreground">
              {simulationId}
            </p>
          </div>
        </div>
      </header>

      <section className="min-h-0 flex-1 overflow-hidden">
        {isLoading ? (
          <div className="mx-4 mt-6 rounded-lg border border-border bg-card/70 px-4 py-8 text-sm text-muted-foreground sm:mx-6 lg:mx-8">
            Loading public simulation...
          </div>
        ) : loadError ? (
          <div className="mx-4 mt-6 flex flex-col gap-3 rounded-lg border border-border bg-card/70 px-4 py-8 sm:mx-6 sm:flex-row sm:items-center sm:justify-between lg:mx-8">
            <p className="text-sm text-destructive">{loadError}</p>
            <Button
              type="button"
              variant="outline"
              onClick={() => void loadPublicSimulation()}
            >
              <RefreshCw data-icon="inline-start" />
              Try again
            </Button>
          </div>
        ) : publicSimulation ? (
          <SimulationDetails
            canUpgradeUsage={false}
            cards={publicSimulation.deck.cards}
            commanders={publicSimulation.deck.commanders}
            deckId={publicSimulation.deck.id}
            initialResultsInfo={publicSimulation.results}
            isLoadingStartingHand={false}
            modelPresets={[]}
            onOpenDetails={() => {}}
            onSimulationUpdated={(simulation) =>
              setPublicSimulation((currentSimulation) =>
                currentSimulation
                  ? {
                      ...currentSimulation,
                      simulation,
                    }
                  : currentSimulation
              )
            }
            onUpgradeUsage={() => {}}
            readOnly={true}
            shouldStreamResults={false}
            simulation={publicSimulation.simulation}
            startingHand={publicSimulation.startingHand}
            startingHandLoadError={null}
          />
        ) : null}
      </section>
    </main>
  )
}

export function DeckSimulation({
  canUpgradeUsage,
  cards,
  commanders,
  deckId,
  isAdmin,
  onUpgradeUsage,
  selectedSimulationIdFromUrl,
}: {
  canUpgradeUsage: boolean
  cards: DeckCard[]
  commanders: DeckCard[]
  deckId: string
  isAdmin: boolean
  onUpgradeUsage: () => void
  selectedSimulationIdFromUrl: string | null
}) {
  const navigate = useNavigate()
  const [simulations, setSimulations] = useState<Simulation[]>([])
  const [isLoadingSimulations, setIsLoadingSimulations] = useState(true)
  const [startingHands, setStartingHands] = useState<StartingHand[]>([])
  const [isLoadingStartingHands, setIsLoadingStartingHands] = useState(true)
  const [startingHandLoadError, setStartingHandLoadError] = useState<
    string | null
  >(null)
  const [savedSeeds, setSavedSeeds] = useState<SavedSeed[]>([])
  const [isLoadingSavedSeeds, setIsLoadingSavedSeeds] = useState(true)
  const [savedSeedLoadError, setSavedSeedLoadError] = useState<string | null>(
    null
  )
  const [modelPresets, setModelPresets] = useState<LlmModelPreset[]>([])
  const [isLoadingModelPresets, setIsLoadingModelPresets] = useState(true)
  const [modelPresetLoadError, setModelPresetLoadError] = useState<
    string | null
  >(null)
  const [defaultModelPresetId, setDefaultModelPresetId] = useState<
    string | null
  >(null)
  const [selectedModelPresetId, setSelectedModelPresetId] = useState("")
  const [simulationLoadError, setSimulationLoadError] = useState<string | null>(
    null
  )
  const [isNewSimulationSelected, setIsNewSimulationSelected] = useState(true)
  const [selectedSimulationId, setSelectedSimulationId] = useState("")
  const [seedMode, setSeedMode] = useState<"random" | "set">("random")
  const [selectedSavedSeedId, setSelectedSavedSeedId] = useState("")
  const [turnsToSimulate, setTurnsToSimulate] = useState(
    DEFAULT_TURNS_TO_SIMULATE
  )
  const [autoGenerateReport, setAutoGenerateReport] = useState(false)
  const [reasoningSummariesEnabled, setReasoningSummariesEnabled] =
    useState(false)
  const [useFlexServiceTier, setUseFlexServiceTier] = useState(
    getStoredCreateSimulationUseFlexServiceTier
  )
  const [openingHandMode, setOpeningHandMode] = useState<
    "simulate" | "provide"
  >("simulate")
  const [selectedOpeningHandId, setSelectedOpeningHandId] = useState("")
  const [isCreateHandModalOpen, setIsCreateHandModalOpen] = useState(false)
  const [isCreateSeedModalOpen, setIsCreateSeedModalOpen] = useState(false)
  const [createSimulationError, setCreateSimulationError] = useState<
    string | null
  >(null)
  const [isCreatingSimulation, setIsCreatingSimulation] = useState(false)
  const [openSimulationMenuId, setOpenSimulationMenuId] = useState<
    string | null
  >(null)
  const [detailsSimulationId, setDetailsSimulationId] = useState<string | null>(
    null
  )
  const [deleteSimulationId, setDeleteSimulationId] = useState<string | null>(
    null
  )
  const [deletingSimulationId, setDeletingSimulationId] = useState<
    string | null
  >(null)
  const [deleteSimulationError, setDeleteSimulationError] = useState<
    string | null
  >(null)
  const [isSimulationListScrolled, setIsSimulationListScrolled] =
    useState(false)
  const openingHandCardOptions = useMemo(
    () => getOpeningHandCardOptions(cards),
    [cards]
  )
  const selectedOpeningHand = useMemo(
    () =>
      startingHands.find((hand) => hand.id === selectedOpeningHandId) ?? null,
    [startingHands, selectedOpeningHandId]
  )
  const selectedSavedSeed = useMemo(
    () => savedSeeds.find((seed) => seed.id === selectedSavedSeedId) ?? null,
    [savedSeeds, selectedSavedSeedId]
  )
  const selectedModelPreset = useMemo(
    () =>
      modelPresets.find((preset) => preset.id === selectedModelPresetId) ??
      null,
    [modelPresets, selectedModelPresetId]
  )
  const selectedModelPresetSupportsFlex = Boolean(
    selectedModelPreset?.supportsFlex
  )
  const selectedSimulation = useMemo(
    () =>
      simulations.find(
        (simulation) => simulation.id === selectedSimulationId
      ) ?? null,
    [selectedSimulationId, simulations]
  )
  const detailsSimulation = useMemo(
    () =>
      simulations.find((simulation) => simulation.id === detailsSimulationId) ??
      null,
    [detailsSimulationId, simulations]
  )
  const deleteSimulation = useMemo(
    () =>
      simulations.find((simulation) => simulation.id === deleteSimulationId) ??
      null,
    [deleteSimulationId, simulations]
  )
  const detailsSimulationStartingHand = useMemo(
    () =>
      startingHands.find(
        (hand) => hand.id === detailsSimulation?.startingHandId
      ) ?? null,
    [detailsSimulation?.startingHandId, startingHands]
  )
  const selectedSimulationStartingHand = useMemo(
    () =>
      startingHands.find(
        (hand) => hand.id === selectedSimulation?.startingHandId
      ) ?? null,
    [selectedSimulation?.startingHandId, startingHands]
  )
  const canStartSimulation =
    (seedMode === "random" || Boolean(selectedSavedSeed)) &&
    Boolean(selectedModelPreset) &&
    turnsToSimulate.length > 0 &&
    (openingHandMode !== "provide" || Boolean(selectedOpeningHand))
  const parsedTurnsToSimulateForForm = Number(turnsToSimulate)
  const canAutoGenerateReport =
    Number.isInteger(parsedTurnsToSimulateForForm) &&
    parsedTurnsToSimulateForForm > 0

  useEffect(() => {
    if (!canAutoGenerateReport) {
      setAutoGenerateReport(false)
    }
  }, [canAutoGenerateReport])

  const loadSimulations = useCallback(
    async (options?: { silent?: boolean }) => {
      const isSilent = options?.silent ?? false

      if (!isSilent) {
        setIsLoadingSimulations(true)
        setSimulationLoadError(null)
      }

      try {
        const response = await apiFetch(
          `${API_BASE_URL}/decks/${deckId}/simulations`
        )

        if (!response.ok) {
          setSimulationLoadError(
            await readApiError(response, "Simulations could not be loaded.")
          )
          return []
        }

        const data = (await response.json()) as SimulationsResponse
        setSimulations(data.simulations)
        return data.simulations
      } catch {
        setSimulationLoadError("Simulations could not be loaded.")
        return []
      } finally {
        if (!isSilent) {
          setIsLoadingSimulations(false)
        }
      }
    },
    [deckId]
  )

  const updateSimulation = useCallback((updatedSimulation: Simulation) => {
    setSimulations((currentSimulations) => {
      const hasSimulation = currentSimulations.some(
        (simulation) => simulation.id === updatedSimulation.id
      )

      if (!hasSimulation) {
        return [updatedSimulation, ...currentSimulations]
      }

      return currentSimulations.map((simulation) =>
        simulation.id === updatedSimulation.id ? updatedSimulation : simulation
      )
    })
  }, [])

  const loadStartingHands = useCallback(async () => {
    setIsLoadingStartingHands(true)
    setStartingHandLoadError(null)

    try {
      const response = await apiFetch(
        `${API_BASE_URL}/decks/${deckId}/starting-hands`
      )

      if (!response.ok) {
        setStartingHandLoadError(
          await readApiError(response, "Starting hands could not be loaded.")
        )
        return
      }

      const data = (await response.json()) as StartingHandsResponse
      setStartingHands(data.startingHands)
      setSelectedOpeningHandId((currentStartingHandId) => {
        if (
          currentStartingHandId &&
          data.startingHands.some((hand) => hand.id === currentStartingHandId)
        ) {
          return currentStartingHandId
        }

        return data.startingHands[0]?.id ?? ""
      })
    } catch {
      setStartingHandLoadError("Starting hands could not be loaded.")
    } finally {
      setIsLoadingStartingHands(false)
    }
  }, [deckId])

  const loadSavedSeeds = useCallback(async () => {
    setIsLoadingSavedSeeds(true)
    setSavedSeedLoadError(null)

    try {
      const response = await apiFetch(
        `${API_BASE_URL}/decks/${deckId}/saved-seeds`
      )

      if (!response.ok) {
        setSavedSeedLoadError(
          await readApiError(response, "Saved seeds could not be loaded.")
        )
        return
      }

      const data = (await response.json()) as SavedSeedsResponse
      setSavedSeeds(data.savedSeeds)
      setSelectedSavedSeedId((currentSavedSeedId) => {
        if (
          currentSavedSeedId &&
          data.savedSeeds.some((seed) => seed.id === currentSavedSeedId)
        ) {
          return currentSavedSeedId
        }

        return data.savedSeeds[0]?.id ?? ""
      })
    } catch {
      setSavedSeedLoadError("Saved seeds could not be loaded.")
    } finally {
      setIsLoadingSavedSeeds(false)
    }
  }, [deckId])

  const loadModelPresets = useCallback(async () => {
    setIsLoadingModelPresets(true)
    setModelPresetLoadError(null)

    try {
      const response = await apiFetch(`${API_BASE_URL}/llm-model-presets`)

      if (!response.ok) {
        setModelPresetLoadError(
          await readApiError(response, "Model presets could not be loaded.")
        )
        return
      }

      const data = (await response.json()) as LlmModelPresetsResponse
      setModelPresets(data.presets)
      setDefaultModelPresetId(data.defaultPresetId)
      setSelectedModelPresetId((currentPresetId) => {
        if (
          currentPresetId &&
          data.presets.some((preset) => preset.id === currentPresetId)
        ) {
          return currentPresetId
        }

        return data.defaultPresetId ?? ""
      })
    } catch {
      setModelPresetLoadError("Model presets could not be loaded.")
    } finally {
      setIsLoadingModelPresets(false)
    }
  }, [])

  useEffect(() => {
    void loadSimulations()
  }, [loadSimulations])

  useEffect(() => {
    if (!simulations.some((simulation) => simulation.activeLlmRunCount > 0)) {
      return
    }

    let isCancelled = false
    let timeoutId: number | undefined

    async function refreshActiveSimulations() {
      const refreshedSimulations = await loadSimulations({ silent: true })

      if (
        isCancelled ||
        !refreshedSimulations.some(
          (simulation) => simulation.activeLlmRunCount > 0
        )
      ) {
        return
      }

      timeoutId = window.setTimeout(refreshActiveSimulations, 1000)
    }

    timeoutId = window.setTimeout(refreshActiveSimulations, 1000)

    return () => {
      isCancelled = true

      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId)
      }
    }
  }, [loadSimulations, simulations])

  useEffect(() => {
    void loadStartingHands()
  }, [loadStartingHands])

  useEffect(() => {
    void loadSavedSeeds()
  }, [loadSavedSeeds])

  useEffect(() => {
    void loadModelPresets()
  }, [loadModelPresets])

  useEffect(() => {
    if (selectedSimulationIdFromUrl) {
      setSelectedSimulationId(selectedSimulationIdFromUrl)
      setIsNewSimulationSelected(false)
      return
    }

    setSelectedSimulationId("")
    setIsNewSimulationSelected(true)
  }, [selectedSimulationIdFromUrl])

  function selectCreatedStartingHand(hand: StartingHand) {
    setStartingHands((currentStartingHands) => [hand, ...currentStartingHands])
    setSelectedOpeningHandId(hand.id)
    setOpeningHandMode("provide")
    setIsCreateHandModalOpen(false)
  }

  function selectCreatedSavedSeed(seed: SavedSeed) {
    setSavedSeeds((currentSavedSeeds) => [seed, ...currentSavedSeeds])
    setSelectedSavedSeedId(seed.id)
    setSeedMode("set")
    setIsCreateSeedModalOpen(false)
  }

  function resetCreateSimulationForm() {
    setSeedMode("random")
    setSelectedSavedSeedId(savedSeeds[0]?.id ?? "")
    setSelectedModelPresetId(defaultModelPresetId ?? "")
    setTurnsToSimulate(DEFAULT_TURNS_TO_SIMULATE)
    setAutoGenerateReport(false)
    setReasoningSummariesEnabled(false)
    setOpeningHandMode("simulate")
    setSelectedOpeningHandId(startingHands[0]?.id ?? "")
  }

  function handleCreateSimulationUseFlexChange(nextEnabled: boolean) {
    setUseFlexServiceTier(nextEnabled)
    storeCreateSimulationUseFlexServiceTier(nextEnabled)
  }

  async function handleStartSimulation() {
    if (!canStartSimulation || isCreatingSimulation) {
      return
    }

    const parsedTurnsToSimulate = Number(turnsToSimulate)

    if (!Number.isInteger(parsedTurnsToSimulate) || parsedTurnsToSimulate < 0) {
      setCreateSimulationError(
        "Turns to simulate must be a non-negative integer."
      )
      return
    }

    if (!selectedModelPreset) {
      setCreateSimulationError("Choose a model preset.")
      return
    }

    setCreateSimulationError(null)
    setIsCreatingSimulation(true)

    try {
      const response = await apiFetch(
        `${API_BASE_URL}/decks/${deckId}/simulations`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            seed:
              seedMode === "random"
                ? createRandomSimulationSeed()
                : selectedSavedSeed?.seed,
            llmModelPresetId: selectedModelPreset.id,
            turnsToSimulate: parsedTurnsToSimulate,
            autoGenerateReport: autoGenerateReport && canAutoGenerateReport,
            reasoningSummariesEnabled,
            useFlexServiceTier:
              selectedModelPreset.supportsFlex && useFlexServiceTier,
            startingHandId:
              openingHandMode === "provide" && selectedOpeningHand
                ? selectedOpeningHand.id
                : null,
          }),
        }
      )

      if (!response.ok) {
        setCreateSimulationError(
          await readApiError(response, "Simulation could not be saved.")
        )
        return
      }

      const data = (await response.json()) as CreateSimulationResponse
      const refreshedSimulations = await loadSimulations()

      if (
        refreshedSimulations.some(
          (simulation) => simulation.id === data.simulation.id
        )
      ) {
        setSelectedSimulationId(data.simulation.id)
      } else {
        setSimulations((currentSimulations) => [
          data.simulation,
          ...currentSimulations,
        ])
        setSimulationLoadError(null)
        setSelectedSimulationId(data.simulation.id)
      }

      setIsNewSimulationSelected(false)
      resetCreateSimulationForm()
      navigate(getDeckSimulationPath(deckId, data.simulation.id))
    } catch {
      setCreateSimulationError("Simulation could not be sent to the server.")
    } finally {
      setIsCreatingSimulation(false)
    }
  }

  async function handleDeleteSimulation(simulationId: string) {
    if (deletingSimulationId) {
      return
    }

    setDeletingSimulationId(simulationId)
    setDeleteSimulationError(null)

    try {
      const response = await apiFetch(
        `${API_BASE_URL}/decks/${deckId}/simulations/${simulationId}`,
        {
          method: "DELETE",
        }
      )

      if (!response.ok) {
        setDeleteSimulationError(
          await readApiError(response, "Simulation could not be deleted.")
        )
        return
      }

      setSimulations((currentSimulations) =>
        currentSimulations.filter(
          (simulation) => simulation.id !== simulationId
        )
      )
      setOpenSimulationMenuId(null)
      setDeleteSimulationId(null)
      setDetailsSimulationId((currentSimulationId) =>
        currentSimulationId === simulationId ? null : currentSimulationId
      )

      if (!isNewSimulationSelected && selectedSimulationId === simulationId) {
        setSelectedSimulationId("")
        setIsNewSimulationSelected(true)
        navigate(getDeckSimulationPath(deckId))
      }
    } catch {
      setDeleteSimulationError("Simulation could not be deleted.")
    } finally {
      setDeletingSimulationId(null)
    }
  }

  return (
    <>
      <div className="grid h-full min-h-0 min-w-[52rem] grid-cols-[14rem_minmax(0,1fr)] overflow-hidden">
        <aside className="simulation-sidebar-surface min-h-0 min-w-0 border-r border-border">
          <nav
            className="simulation-scrollbar h-full overflow-y-auto"
            aria-label="Simulations"
            onScroll={(event) =>
              setIsSimulationListScrolled(event.currentTarget.scrollTop > 0)
            }
          >
            <div className="simulation-sidebar-surface sticky top-0 z-10 px-2 pt-2 pb-1">
              <button
                className={`flex h-11 w-full items-center gap-2 rounded-md px-3 text-left text-sm font-medium transition-colors ${
                  isNewSimulationSelected
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-muted/45 hover:text-foreground"
                }`}
                type="button"
                aria-pressed={isNewSimulationSelected}
                onClick={() => {
                  setIsNewSimulationSelected(true)
                  setSelectedSimulationId("")
                  navigate(getDeckSimulationPath(deckId))
                }}
              >
                <Plus className="size-4" data-icon="inline-start" />
                New simulation
              </button>
              <div
                className={`absolute right-0 bottom-0 left-0 border-b border-border transition-opacity ${
                  isSimulationListScrolled ? "opacity-100" : "opacity-0"
                }`}
              />
            </div>

            <div className="px-2 pb-2">
              {isLoadingSimulations ? (
                <div className="rounded-md px-3 py-3 text-sm text-muted-foreground">
                  Loading simulations...
                </div>
              ) : simulationLoadError ? (
                <div className="grid gap-3 rounded-md px-3 py-3">
                  <p className="text-sm text-destructive">
                    {simulationLoadError}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void loadSimulations()}
                  >
                    <RefreshCw data-icon="inline-start" />
                    Try again
                  </Button>
                </div>
              ) : simulations.length > 0 ? (
                <ul className="grid gap-1">
                  {simulations.map((simulation) => (
                    <li key={simulation.id} className="group relative">
                      <button
                        className={`h-11 w-full rounded-md pr-11 pl-3 text-left text-sm font-medium transition-colors ${
                          !isNewSimulationSelected &&
                          selectedSimulationId === simulation.id
                            ? "bg-accent text-accent-foreground"
                            : "text-muted-foreground hover:bg-muted/45 hover:text-foreground"
                        }`}
                        type="button"
                        aria-pressed={
                          !isNewSimulationSelected &&
                          selectedSimulationId === simulation.id
                        }
                        onClick={() => {
                          setSelectedSimulationId(simulation.id)
                          setIsNewSimulationSelected(false)
                          navigate(getDeckSimulationPath(deckId, simulation.id))
                        }}
                      >
                        {getSimulationLabel(simulation)}
                      </button>
                      {simulation.activeLlmRunCount > 0 &&
                      (isNewSimulationSelected ||
                        selectedSimulationId !== simulation.id) ? (
                        <div
                          className={`pointer-events-none absolute inset-y-0 right-1 flex items-center px-2 text-muted-foreground transition-opacity group-hover:opacity-0 ${
                            openSimulationMenuId === simulation.id
                              ? "opacity-0"
                              : "opacity-100"
                          }`}
                          aria-hidden="true"
                        >
                          <svg
                            className="size-[1.2rem] animate-spin text-sky-400"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeLinecap="round"
                            strokeWidth="1.6"
                          >
                            <circle
                              cx="12"
                              cy="12"
                              r="9"
                              className="text-muted-foreground/35"
                            />
                            <path d="M12 3 A9 9 0 1 1 3.65 15.37" />
                          </svg>
                        </div>
                      ) : null}
                      <div
                        className={`absolute inset-y-0 right-1 flex items-center opacity-0 transition-opacity group-hover:opacity-100 ${
                          openSimulationMenuId === simulation.id
                            ? "opacity-100"
                            : ""
                        }`}
                      >
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Open actions for simulation ${getSimulationLabel(
                            simulation
                          )}`}
                          aria-expanded={openSimulationMenuId === simulation.id}
                          title="Simulation actions"
                          disabled={deletingSimulationId === simulation.id}
                          onClick={() =>
                            setOpenSimulationMenuId((currentSimulationId) =>
                              currentSimulationId === simulation.id
                                ? null
                                : simulation.id
                            )
                          }
                        >
                          <MoreVertical />
                        </Button>

                        {openSimulationMenuId === simulation.id ? (
                          <>
                            <button
                              className="fixed inset-0 z-10 cursor-default"
                              type="button"
                              aria-label="Close simulation actions"
                              onClick={() => setOpenSimulationMenuId(null)}
                            />
                            <div className="absolute top-9 right-0 z-20 w-48 overflow-hidden rounded-lg border border-border bg-popover py-1 text-popover-foreground shadow-2xl shadow-black/40">
                              <SimulationMenuButton
                                onClick={() => {
                                  setOpenSimulationMenuId(null)
                                  setDetailsSimulationId(simulation.id)
                                }}
                              >
                                <Eye data-icon="inline-start" />
                                View details
                              </SimulationMenuButton>
                              <SimulationMenuButton
                                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                onClick={() => {
                                  setOpenSimulationMenuId(null)
                                  setDeleteSimulationError(null)
                                  setDeleteSimulationId(simulation.id)
                                }}
                              >
                                <Trash2 data-icon="inline-start" />
                                Delete simulation
                              </SimulationMenuButton>
                            </div>
                          </>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="rounded-md px-3 py-3 text-sm text-muted-foreground">
                  No simulations yet.
                </div>
              )}
            </div>
          </nav>
        </aside>

        <section className="h-full min-h-0 min-w-0 overflow-hidden">
          {isNewSimulationSelected ? (
            <div className="simulation-scrollbar h-full min-h-0 overflow-y-auto">
              <div className="grid min-h-full place-items-center px-5 py-10">
                <div className="grid w-full max-w-2xl gap-4">
                  <h3 className="text-center text-lg font-semibold">
                    Create new simulation
                  </h3>
                  <div className="flex flex-col gap-6 rounded-lg border border-border bg-card/70 p-6 shadow-sm">
                    <div className="grid gap-6">
                      <fieldset className="grid gap-3">
                        <legend className="text-sm font-medium text-foreground">
                          Simulation seed
                        </legend>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <label
                            className={`flex items-center gap-2 rounded-md border px-3 py-3 text-sm transition-colors ${
                              seedMode === "random"
                                ? "border-ring bg-accent text-accent-foreground"
                                : "border-border bg-background/35 text-muted-foreground"
                            }`}
                          >
                            <input
                              className="size-4 accent-sky-300"
                              type="radio"
                              name="seed-mode"
                              checked={seedMode === "random"}
                              onChange={() => setSeedMode("random")}
                            />
                            Random seed
                          </label>
                          <label
                            className={`flex items-center gap-2 rounded-md border px-3 py-3 text-sm transition-colors ${
                              seedMode === "set"
                                ? "border-ring bg-accent text-accent-foreground"
                                : "border-border bg-background/35 text-muted-foreground"
                            }`}
                          >
                            <input
                              className="size-4 accent-sky-300"
                              type="radio"
                              name="seed-mode"
                              checked={seedMode === "set"}
                              onChange={() => setSeedMode("set")}
                            />
                            Set seed
                          </label>
                        </div>

                        {seedMode === "set" ? (
                          <div className="grid gap-3 rounded-md border border-border bg-background/35 p-3">
                            {savedSeedLoadError ? (
                              <div className="grid gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2">
                                <p className="text-sm text-destructive">
                                  {savedSeedLoadError}
                                </p>
                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={() => void loadSavedSeeds()}
                                >
                                  <RefreshCw data-icon="inline-start" />
                                  Try again
                                </Button>
                              </div>
                            ) : null}

                            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                              <label
                                className="grid gap-2 text-sm font-medium"
                                htmlFor="saved-seed"
                              >
                                <span>Saved seed</span>
                                <select
                                  id="saved-seed"
                                  className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground transition-colors outline-none focus:border-ring focus:ring-3 focus:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50"
                                  value={selectedSavedSeedId}
                                  disabled={
                                    isLoadingSavedSeeds ||
                                    savedSeeds.length === 0
                                  }
                                  onChange={(event) =>
                                    setSelectedSavedSeedId(event.target.value)
                                  }
                                >
                                  {isLoadingSavedSeeds ? (
                                    <option value="">
                                      Loading saved seeds...
                                    </option>
                                  ) : savedSeeds.length === 0 ? (
                                    <option value="">No saved seeds yet</option>
                                  ) : null}
                                  {savedSeeds.map((seed) => (
                                    <option key={seed.id} value={seed.id}>
                                      {seed.name}
                                    </option>
                                  ))}
                                </select>
                              </label>

                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => setIsCreateSeedModalOpen(true)}
                              >
                                <Plus data-icon="inline-start" />
                                New seed
                              </Button>
                            </div>

                            {selectedSavedSeed ? (
                              <dl className="grid gap-1 text-sm">
                                <dt className="text-muted-foreground">
                                  Seed value
                                </dt>
                                <dd className="rounded-md bg-muted/30 px-3 py-2 font-medium break-all text-foreground">
                                  {selectedSavedSeed.seed}
                                </dd>
                              </dl>
                            ) : !isLoadingSavedSeeds ? (
                              <p className="text-sm text-muted-foreground">
                                Choose a saved seed, or make a new one.
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                      </fieldset>

                      <div className="grid gap-3">
                        <label
                          className="text-sm font-medium text-foreground"
                          htmlFor="model-preset"
                        >
                          Model preset
                        </label>
                        {modelPresetLoadError ? (
                          <div className="grid gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2">
                            <p className="text-sm text-destructive">
                              {modelPresetLoadError}
                            </p>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => void loadModelPresets()}
                            >
                              <RefreshCw data-icon="inline-start" />
                              Try again
                            </Button>
                          </div>
                        ) : null}
                        <select
                          id="model-preset"
                          className="h-9 w-full rounded-md border border-input bg-background/60 px-3 text-sm text-foreground transition-colors outline-none focus:border-ring focus:ring-3 focus:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50"
                          value={selectedModelPresetId}
                          disabled={
                            isLoadingModelPresets || modelPresets.length === 0
                          }
                          onChange={(event) =>
                            setSelectedModelPresetId(event.target.value)
                          }
                        >
                          {isLoadingModelPresets ? (
                            <option value="">Loading model presets...</option>
                          ) : modelPresets.length === 0 ? (
                            <option value="">No enabled model presets</option>
                          ) : defaultModelPresetId === null ? (
                            <option value="">Choose a model preset</option>
                          ) : null}
                          {modelPresets.map((preset) => (
                            <option key={preset.id} value={preset.id}>
                              {getLlmModelPresetLabel(preset)}
                              {preset.isDefault ? " (default)" : ""}
                            </option>
                          ))}
                        </select>
                        {!isLoadingModelPresets && modelPresets.length === 0 ? (
                          <p className="rounded-md border border-amber-300/35 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
                            Ask an admin to add or enable a model preset before
                            creating simulations.
                          </p>
                        ) : null}
                        <FlexServiceTierSwitch
                          checked={
                            selectedModelPresetSupportsFlex &&
                            useFlexServiceTier
                          }
                          disabled={!selectedModelPresetSupportsFlex}
                          label="Flex processing"
                          activeWarning="Simulation may be slower and has a higher chance of failing."
                          onCheckedChange={handleCreateSimulationUseFlexChange}
                        />
                      </div>

                      <div className="grid gap-3">
                        <label
                          className="text-sm font-medium text-foreground"
                          htmlFor="turns-to-simulate"
                        >
                          Turns to simulate
                        </label>
                        <select
                          id="turns-to-simulate"
                          className="no-number-spinner h-9 w-full rounded-md border border-input bg-background/60 px-3 text-sm text-foreground transition-colors outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-3 focus:ring-ring/30 sm:max-w-36"
                          value={turnsToSimulate}
                          onChange={(event) =>
                            setTurnsToSimulate(event.target.value)
                          }
                        >
                          {Array.from({ length: 11 }, (_, turnCount) => (
                            <option key={turnCount} value={turnCount}>
                              {turnCount}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div
                        className={`flex items-center gap-3 rounded-md border px-3 py-3 text-sm transition-colors ${
                          canAutoGenerateReport && autoGenerateReport
                            ? "border-ring bg-accent text-accent-foreground"
                            : "border-border bg-background/35 text-muted-foreground"
                        } ${
                          canAutoGenerateReport
                            ? ""
                            : "cursor-not-allowed opacity-50"
                        }`}
                      >
                        <button
                          className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors focus:ring-3 focus:ring-ring/25 focus:outline-none disabled:cursor-not-allowed ${
                            canAutoGenerateReport && autoGenerateReport
                              ? "border-sky-300/70 bg-sky-500/70"
                              : "border-border bg-muted/55"
                          }`}
                          type="button"
                          role="switch"
                          aria-checked={
                            canAutoGenerateReport && autoGenerateReport
                          }
                          aria-label="Auto-generate report after final turn"
                          disabled={!canAutoGenerateReport}
                          onClick={() =>
                            setAutoGenerateReport(
                              (currentValue) => !currentValue
                            )
                          }
                        >
                          <span
                            className={`absolute top-1/2 left-1 size-4 -translate-y-1/2 rounded-full bg-foreground shadow-sm shadow-black/30 transition-transform ${
                              canAutoGenerateReport && autoGenerateReport
                                ? "translate-x-5"
                                : "translate-x-0"
                            }`}
                          />
                        </button>
                        <span className="font-medium">
                          Auto-generate report after final turn
                        </span>
                      </div>

                      <ReasoningSummariesSwitch
                        checked={reasoningSummariesEnabled}
                        onCheckedChange={setReasoningSummariesEnabled}
                      />

                      <fieldset className="grid gap-3">
                        <legend className="text-sm font-medium text-foreground">
                          Opening hand
                        </legend>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <label
                            className={`flex items-center gap-2 rounded-md border px-3 py-3 text-sm transition-colors ${
                              openingHandMode === "simulate"
                                ? "border-ring bg-accent text-accent-foreground"
                                : "border-border bg-background/35 text-muted-foreground"
                            }`}
                          >
                            <input
                              className="size-4 accent-sky-300"
                              type="radio"
                              name="opening-hand-mode"
                              checked={openingHandMode === "simulate"}
                              onChange={() => setOpeningHandMode("simulate")}
                            />
                            Simulate opening hand
                          </label>
                          <label
                            className={`flex items-center gap-2 rounded-md border px-3 py-3 text-sm transition-colors ${
                              openingHandMode === "provide"
                                ? "border-ring bg-accent text-accent-foreground"
                                : "border-border bg-background/35 text-muted-foreground"
                            }`}
                          >
                            <input
                              className="size-4 accent-sky-300"
                              type="radio"
                              name="opening-hand-mode"
                              checked={openingHandMode === "provide"}
                              onChange={() => setOpeningHandMode("provide")}
                            />
                            Provide opening hand
                          </label>
                        </div>

                        {openingHandMode === "provide" ? (
                          <div className="grid gap-3 rounded-md border border-border bg-background/35 p-3">
                            {startingHandLoadError ? (
                              <div className="grid gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2">
                                <p className="text-sm text-destructive">
                                  {startingHandLoadError}
                                </p>
                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={() => void loadStartingHands()}
                                >
                                  <RefreshCw data-icon="inline-start" />
                                  Try again
                                </Button>
                              </div>
                            ) : null}

                            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                              <label
                                className="grid gap-2 text-sm font-medium"
                                htmlFor="saved-opening-hand"
                              >
                                <span>Starting hand</span>
                                <select
                                  id="saved-opening-hand"
                                  className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground transition-colors outline-none focus:border-ring focus:ring-3 focus:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50"
                                  value={selectedOpeningHandId}
                                  disabled={
                                    isLoadingStartingHands ||
                                    startingHands.length === 0
                                  }
                                  onChange={(event) =>
                                    setSelectedOpeningHandId(event.target.value)
                                  }
                                >
                                  {isLoadingStartingHands ? (
                                    <option value="">
                                      Loading starting hands...
                                    </option>
                                  ) : startingHands.length === 0 ? (
                                    <option value="">
                                      No starting hands yet
                                    </option>
                                  ) : null}
                                  {startingHands.map((hand) => (
                                    <option key={hand.id} value={hand.id}>
                                      {hand.name}
                                    </option>
                                  ))}
                                </select>
                              </label>

                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => setIsCreateHandModalOpen(true)}
                              >
                                <Plus data-icon="inline-start" />
                                New starting hand
                              </Button>
                            </div>

                            {selectedOpeningHand ? (
                              <div className="grid gap-2">
                                <p className="text-sm text-sky-300">
                                  {countStartingHandCards(selectedOpeningHand)}{" "}
                                  cards selected
                                </p>
                                <ul className="grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
                                  {selectedOpeningHand.cards.map((card) => (
                                    <li
                                      key={card.deckCardId}
                                      className="rounded-md bg-muted/30 px-3 py-2"
                                    >
                                      {card.quantity > 1 ? (
                                        <span className="mr-2 text-sky-300">
                                          {card.quantity}x
                                        </span>
                                      ) : null}
                                      {card.name}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ) : !isLoadingStartingHands ? (
                              <p className="text-sm text-muted-foreground">
                                Choose a saved starting hand, or make a new one.
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                      </fieldset>
                    </div>

                    <div>
                      <Button
                        type="button"
                        disabled={!canStartSimulation || isCreatingSimulation}
                        onClick={() => void handleStartSimulation()}
                      >
                        <Dices data-icon="inline-start" />
                        {isCreatingSimulation
                          ? "Creating..."
                          : "Start simulation"}
                      </Button>
                    </div>

                    {createSimulationError ? (
                      <p
                        className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                        role="alert"
                      >
                        {createSimulationError}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          ) : selectedSimulation ? (
            <SimulationDetails
              canUpgradeUsage={canUpgradeUsage}
              cards={cards}
              commanders={commanders}
              deckId={deckId}
              isLoadingStartingHand={isLoadingStartingHands}
              modelPresets={modelPresets}
              onOpenDetails={() =>
                setDetailsSimulationId(selectedSimulation.id)
              }
              onSimulationUpdated={updateSimulation}
              onUpgradeUsage={onUpgradeUsage}
              simulation={selectedSimulation}
              startingHand={selectedSimulationStartingHand}
              startingHandLoadError={startingHandLoadError}
            />
          ) : (
            <EmptySimulationSelection />
          )}
        </section>
      </div>

      {isCreateHandModalOpen ? (
        <CreateStartingHandModal
          cardOptions={openingHandCardOptions}
          deckId={deckId}
          onClose={() => setIsCreateHandModalOpen(false)}
          onSaved={selectCreatedStartingHand}
        />
      ) : null}

      {isCreateSeedModalOpen ? (
        <CreateSavedSeedModal
          deckId={deckId}
          onClose={() => setIsCreateSeedModalOpen(false)}
          onSaved={selectCreatedSavedSeed}
        />
      ) : null}

      {detailsSimulation ? (
        <SimulationDetailsModal
          deckId={deckId}
          isAdmin={isAdmin}
          modelPresets={modelPresets}
          onSimulationUpdated={updateSimulation}
          onClose={() => setDetailsSimulationId(null)}
          simulation={detailsSimulation}
          startingHand={detailsSimulationStartingHand}
        />
      ) : null}

      {deleteSimulation ? (
        <DeleteSimulationModal
          error={deleteSimulationError}
          isDeleting={deletingSimulationId === deleteSimulation.id}
          onClose={() => {
            if (!deletingSimulationId) {
              setDeleteSimulationId(null)
              setDeleteSimulationError(null)
            }
          }}
          onConfirm={() => void handleDeleteSimulation(deleteSimulation.id)}
          simulation={deleteSimulation}
        />
      ) : null}
    </>
  )
}

function SimulationMenuButton({
  children,
  className = "",
  onClick,
}: {
  children: ReactNode
  className?: string
  onClick: () => void
}) {
  return (
    <button
      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/45 hover:text-foreground focus:bg-muted/45 focus:outline-none ${className}`}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function DeleteSimulationModal({
  error,
  isDeleting,
  onClose,
  onConfirm,
  simulation,
}: {
  error: string | null
  isDeleting: boolean
  onClose: () => void
  onConfirm: () => void
  simulation: Simulation
}) {
  const simulationLabel = getSimulationLabel(simulation)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 py-6 backdrop-blur-sm"
      role="presentation"
      onMouseDown={isDeleting ? undefined : onClose}
    >
      <section
        aria-labelledby="delete-simulation-title"
        className="w-full max-w-md rounded-lg border border-border bg-card shadow-2xl shadow-black/40"
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="space-y-1">
            <h2 id="delete-simulation-title" className="text-xl font-semibold">
              Delete simulation
            </h2>
            <p className="text-sm text-muted-foreground">
              This will permanently delete {simulationLabel}.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Close"
            title="Close"
            onClick={onClose}
            disabled={isDeleting}
          >
            <X />
          </Button>
        </header>

        <div className="grid gap-4 px-5 py-5">
          {simulation.activeLlmRunCount > 0 ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              This simulation still has active runs.
            </p>
          ) : null}

          {error ? (
            <p
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={onConfirm}
              disabled={isDeleting}
            >
              <Trash2 data-icon="inline-start" />
              {isDeleting ? "Deleting..." : "Delete simulation"}
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}

function ReasoningSummariesSwitch({
  checked,
  disabled = false,
  onCheckedChange,
}: {
  checked: boolean
  disabled?: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-md border px-3 py-3 text-sm transition-colors ${
        checked
          ? "border-ring bg-accent text-accent-foreground"
          : "border-border bg-background/35 text-muted-foreground"
      } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
    >
      <button
        className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors focus:ring-3 focus:ring-ring/25 focus:outline-none disabled:cursor-not-allowed ${
          checked
            ? "border-sky-300/70 bg-sky-500/70"
            : "border-border bg-muted/55"
        }`}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label="Reasoning summaries"
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
      >
        <span
          className={`absolute top-1/2 left-1 size-4 -translate-y-1/2 rounded-full bg-foreground shadow-sm shadow-black/30 transition-transform ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
      <span className="font-medium">Reasoning summaries</span>
    </div>
  )
}

function FlexServiceTierSwitch({
  checked,
  disabled = false,
  label = "Use flex service tier",
  activeWarning,
  onCheckedChange,
}: {
  checked: boolean
  disabled?: boolean
  label?: string
  activeWarning?: string
  onCheckedChange: (checked: boolean) => void
}) {
  const visibleWarning = checked ? activeWarning : null

  return (
    <div
      className={`flex items-start gap-3 rounded-md border px-3 py-3 text-sm transition-colors ${
        checked
          ? "border-ring bg-accent text-accent-foreground"
          : "border-border bg-background/35 text-muted-foreground"
      } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
    >
      <button
        className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors focus:ring-3 focus:ring-ring/25 focus:outline-none disabled:cursor-not-allowed ${
          checked
            ? "border-sky-300/70 bg-sky-500/70"
            : "border-border bg-muted/55"
        }`}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
      >
        <span
          className={`absolute top-1/2 left-1 size-4 -translate-y-1/2 rounded-full bg-foreground shadow-sm shadow-black/30 transition-transform ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
      <span className="grid gap-1">
        <span className="font-medium">{label}</span>
        {visibleWarning ? (
          <span className="text-xs leading-5 text-amber-100/90" role="alert">
            {visibleWarning}
          </span>
        ) : null}
      </span>
    </div>
  )
}

function SimulationDetailsModal({
  deckId,
  isAdmin,
  modelPresets,
  onSimulationUpdated,
  onClose,
  simulation,
  startingHand,
}: {
  deckId: string
  isAdmin: boolean
  modelPresets: LlmModelPreset[]
  onSimulationUpdated: (simulation: Simulation) => void
  onClose: () => void
  simulation: Simulation
  startingHand: StartingHand | null
}) {
  const [isLoadingDebugInfo, setIsLoadingDebugInfo] = useState(false)
  const [debugInfoError, setDebugInfoError] = useState<string | null>(null)
  const [debugInfo, setDebugInfo] = useState<SimulationDebugInfo | null>(null)
  const [isDebugModalOpen, setIsDebugModalOpen] = useState(false)
  const [isSavingPublicState, setIsSavingPublicState] = useState(false)
  const [publicStateError, setPublicStateError] = useState<string | null>(null)
  const [hasCopiedPublicLink, setHasCopiedPublicLink] = useState(false)
  const isLoadingDebugInfoRef = useRef(false)
  const shouldSimulateOpeningHand = simulation.startingHandId === null
  const selectedModelPreset =
    modelPresets.find((preset) => preset.id === simulation.llmModelPresetId) ??
    null
  const publicSimulationUrl = getPublicSimulationUrl(simulation.id)

  const handleRefreshDebugInfo = useCallback(async () => {
    if (isLoadingDebugInfoRef.current) {
      return
    }

    isLoadingDebugInfoRef.current = true
    setIsLoadingDebugInfo(true)
    setDebugInfoError(null)

    try {
      const response = await apiFetch(
        `${API_BASE_URL}/decks/${deckId}/simulations/${simulation.id}/debug`
      )

      if (!response.ok) {
        setDebugInfoError(
          await readApiError(
            response,
            "Simulation debug info could not be loaded."
          )
        )
        return
      }

      const data = (await response.json()) as SimulationDebugResponse
      setDebugInfo(data.debug)
    } catch {
      setDebugInfoError("Simulation debug info could not be loaded.")
    } finally {
      isLoadingDebugInfoRef.current = false
      setIsLoadingDebugInfo(false)
    }
  }, [deckId, simulation.id])

  useEffect(() => {
    setDebugInfo(null)
    setDebugInfoError(null)
    setIsLoadingDebugInfo(false)
    isLoadingDebugInfoRef.current = false
    setPublicStateError(null)
    setHasCopiedPublicLink(false)
  }, [simulation.id])

  useEffect(() => {
    setHasCopiedPublicLink(false)
  }, [simulation.isPublic])

  useEffect(() => {
    if (!isDebugModalOpen) {
      return
    }

    void handleRefreshDebugInfo()
  }, [handleRefreshDebugInfo, isDebugModalOpen])

  async function handlePublicStateChange(nextIsPublic: boolean) {
    if (isSavingPublicState || nextIsPublic === simulation.isPublic) {
      return
    }

    setIsSavingPublicState(true)
    setPublicStateError(null)
    setHasCopiedPublicLink(false)

    try {
      const response = await apiFetch(
        `${API_BASE_URL}/decks/${deckId}/simulations/${simulation.id}/public`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            isPublic: nextIsPublic,
          }),
        }
      )

      if (!response.ok) {
        setPublicStateError(
          await readApiError(
            response,
            "Simulation public access could not be updated."
          )
        )
        return
      }

      const data = (await response.json()) as UpdateSimulationResponse
      onSimulationUpdated(data.simulation)
    } catch {
      setPublicStateError("Simulation public access could not be updated.")
    } finally {
      setIsSavingPublicState(false)
    }
  }

  async function handleCopyPublicLink() {
    try {
      await writePlainTextToClipboard(publicSimulationUrl)
      setHasCopiedPublicLink(true)
    } catch {
      setPublicStateError("Public link could not be copied.")
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 py-6 backdrop-blur-sm"
        role="presentation"
        onMouseDown={onClose}
      >
        <section
          aria-labelledby="simulation-details-title"
          className="flex max-h-[calc(100svh-3rem)] w-full max-w-2xl flex-col rounded-lg border border-border bg-card shadow-2xl shadow-black/40"
          role="dialog"
          aria-modal="true"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                <h2
                  id="simulation-details-title"
                  className="text-xl font-semibold"
                >
                  Simulation details
                </h2>
                <span className="shrink-0 rounded-md border border-border bg-background/45 px-3 py-1 text-sm text-muted-foreground">
                  {simulation.status}
                </span>
                {simulation.isPublic ? (
                  <span className="shrink-0 rounded-md border border-sky-300/35 bg-sky-400/10 px-3 py-1 text-sm text-sky-100">
                    public
                  </span>
                ) : null}
              </div>
              <p className="text-sm font-medium break-all text-foreground">
                {simulation.id}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Close"
              title="Close"
              onClick={onClose}
            >
              <X />
            </Button>
          </header>

          <div className="simulation-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-5">
            <section className="grid gap-3">
              <h3 className="text-sm font-semibold text-foreground">Setup</h3>
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div className="rounded-md border border-border bg-background/35 p-3 sm:col-span-2">
                  <dt className="text-muted-foreground">Seed</dt>
                  <dd className="mt-1 font-medium break-all text-foreground">
                    {simulation.seed}
                  </dd>
                </div>
                <div className="rounded-md border border-border bg-background/35 p-3">
                  <dt className="text-muted-foreground">Turns to simulate</dt>
                  <dd className="mt-1 font-medium text-foreground">
                    {simulation.turnsToSimulate}
                  </dd>
                </div>
                <div className="rounded-md border border-border bg-background/35 p-3">
                  <dt className="text-muted-foreground">
                    Simulate opening hand
                  </dt>
                  <dd className="mt-1 font-medium text-foreground">
                    {shouldSimulateOpeningHand ? "Yes" : "No"}
                  </dd>
                </div>
                <div className="rounded-md border border-border bg-background/35 p-3">
                  <dt className="text-muted-foreground">
                    Auto-generate report
                  </dt>
                  <dd className="mt-1 font-medium text-foreground">
                    {simulation.autoGenerateReport ? "Yes" : "No"}
                  </dd>
                </div>
                <div className="rounded-md border border-border bg-background/35 p-3 sm:col-span-2">
                  <dt className="text-muted-foreground">LLM options</dt>
                  <dd className="mt-2 grid gap-3">
                    <SimulationReasoningSummariesSetting
                      deckId={deckId}
                      onSimulationUpdated={onSimulationUpdated}
                      simulation={simulation}
                    />
                    <SimulationFlexServiceTierSetting
                      deckId={deckId}
                      onSimulationUpdated={onSimulationUpdated}
                      selectedModelPreset={selectedModelPreset}
                      simulation={simulation}
                    />
                  </dd>
                </div>
                <div className="rounded-md border border-border bg-background/35 p-3 sm:col-span-2">
                  <dt className="text-muted-foreground">Model preset</dt>
                  <dd className="mt-2">
                    <SimulationModelPresetSelector
                      deckId={deckId}
                      modelPresets={modelPresets}
                      onSimulationUpdated={onSimulationUpdated}
                      selectedModelPreset={selectedModelPreset}
                      simulation={simulation}
                    />
                  </dd>
                </div>
              </dl>

              {!shouldSimulateOpeningHand ? (
                <div className="grid gap-2 rounded-md border border-border bg-background/35 p-3">
                  <p className="text-sm font-medium text-foreground">
                    Provided opening hand
                    {startingHand ? (
                      <span className="ml-2 text-muted-foreground">
                        {startingHand.name}
                      </span>
                    ) : null}
                  </p>
                  {startingHand ? (
                    <ul className="grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
                      {startingHand.cards.map((card) => (
                        <li
                          key={card.deckCardId}
                          className="rounded-md bg-muted/30 px-3 py-2"
                        >
                          {card.quantity > 1 ? (
                            <span className="mr-2 text-sky-300">
                              {card.quantity}x
                            </span>
                          ) : null}
                          {card.name}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Opening hand details are loading.
                    </p>
                  )}
                </div>
              ) : null}
            </section>
          </div>

          {isAdmin ? (
            <footer className="flex flex-col gap-3 border-t border-border px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="grid gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    className="w-fit"
                    type="button"
                    variant={simulation.isPublic ? "outline" : "default"}
                    disabled={isSavingPublicState}
                    onClick={() =>
                      void handlePublicStateChange(!simulation.isPublic)
                    }
                  >
                    {isSavingPublicState ? (
                      <LoaderCircle
                        className="animate-spin"
                        data-icon="inline-start"
                      />
                    ) : (
                      <Globe2 data-icon="inline-start" />
                    )}
                    {isSavingPublicState
                      ? "Saving..."
                      : simulation.isPublic
                        ? "Make private"
                        : "Make public"}
                  </Button>
                  {simulation.isPublic ? (
                    <Button
                      className={
                        hasCopiedPublicLink
                          ? "w-fit text-emerald-300 hover:text-emerald-200"
                          : "w-fit"
                      }
                      type="button"
                      variant="outline"
                      onClick={() => void handleCopyPublicLink()}
                    >
                      {hasCopiedPublicLink ? (
                        <ClipboardCheck data-icon="inline-start" />
                      ) : (
                        <Link2 data-icon="inline-start" />
                      )}
                      {hasCopiedPublicLink ? "Copied" : "Copy public link"}
                    </Button>
                  ) : null}
                </div>
                {publicStateError ? (
                  <p
                    className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                    role="alert"
                  >
                    {publicStateError}
                  </p>
                ) : simulation.isPublic ? (
                  <p className="max-w-xl text-xs break-all text-muted-foreground">
                    {publicSimulationUrl}
                  </p>
                ) : null}
              </div>
              <Button
                className="w-fit"
                type="button"
                variant="outline"
                onClick={() => setIsDebugModalOpen(true)}
              >
                <Bug data-icon="inline-start" />
                View debug info
              </Button>
            </footer>
          ) : null}
        </section>
      </div>

      {isAdmin && isDebugModalOpen ? (
        <SimulationDebugModal
          debugInfo={debugInfo}
          error={debugInfoError}
          isLoading={isLoadingDebugInfo}
          modelPresets={modelPresets}
          onClose={() => setIsDebugModalOpen(false)}
          onRefresh={() => void handleRefreshDebugInfo()}
          simulationId={simulation.id}
        />
      ) : null}
    </>
  )
}

function SimulationDetails({
  canUpgradeUsage,
  cards,
  commanders,
  deckId,
  initialResultsInfo = null,
  isLoadingStartingHand,
  modelPresets,
  onOpenDetails,
  onSimulationUpdated,
  onUpgradeUsage,
  readOnly = false,
  resultsStreamUrl,
  resultsStreamWithCredentials = true,
  shouldStreamResults = true,
  simulation,
  startingHand,
  startingHandLoadError,
}: {
  canUpgradeUsage: boolean
  cards: DeckCard[]
  commanders: DeckCard[]
  deckId: string
  initialResultsInfo?: SimulationResultsInfo | null
  isLoadingStartingHand: boolean
  modelPresets: LlmModelPreset[]
  onOpenDetails: () => void
  onSimulationUpdated: (simulation: Simulation) => void
  onUpgradeUsage: () => void
  readOnly?: boolean
  resultsStreamUrl?: string
  resultsStreamWithCredentials?: boolean
  shouldStreamResults?: boolean
  simulation: Simulation
  startingHand: StartingHand | null
  startingHandLoadError: string | null
}) {
  const { refreshUsageLimits } = useUsageLimits()
  const [isStartingOpeningHandRun, setIsStartingOpeningHandRun] =
    useState(false)
  const [openingHandRunError, setOpeningHandRunError] = useState<string | null>(
    null
  )
  const [isStartingTurnRun, setIsStartingTurnRun] = useState(false)
  const [turnRunError, setTurnRunError] = useState<string | null>(null)
  const [isStartingReportRun, setIsStartingReportRun] = useState(false)
  const [reportRunError, setReportRunError] = useState<string | null>(null)
  const [isStoppingSimulation, setIsStoppingSimulation] = useState(false)
  const [stopSimulationError, setStopSimulationError] = useState<string | null>(
    null
  )
  const [isLoadingResults, setIsLoadingResults] = useState(false)
  const [resultsError, setResultsError] = useState<string | null>(null)
  const [resultsInfo, setResultsInfo] = useState<SimulationResultsInfo | null>(
    null
  )
  const resultsInfoRef = useRef<SimulationResultsInfo | null>(null)
  const resultsEventSourceRef = useRef<EventSource | null>(null)
  const resultsStreamErrorTimeoutRef = useRef<number | null>(null)
  const usageLimitRefreshRunIdsRef = useRef<Set<string>>(new Set())
  const simulationRef = useRef(simulation)
  const resultsPanelRef = useRef<HTMLElement | null>(null)
  const keepResultsScrolledDownRef = useRef(true)
  const isProgrammaticResultsScrollRef = useRef(false)
  const previousResultsScrollTopRef = useRef(0)
  const [resultsStreamRestartKey, setResultsStreamRestartKey] = useState(0)
  const shouldSimulateOpeningHand = simulation.startingHandId === null
  const selectedModelPreset =
    modelPresets.find((preset) => preset.id === simulation.llmModelPresetId) ??
    null

  useEffect(() => {
    simulationRef.current = simulation
  }, [simulation])

  useEffect(() => {
    usageLimitRefreshRunIdsRef.current.clear()
  }, [simulation.id])

  const scrollResultsToBottom = useCallback(() => {
    const resultsPanel = resultsPanelRef.current

    if (!resultsPanel) {
      return
    }

    isProgrammaticResultsScrollRef.current = true
    resultsPanel.scrollTo({ top: resultsPanel.scrollHeight })

    window.requestAnimationFrame(() => {
      previousResultsScrollTopRef.current = resultsPanel.scrollTop
      isProgrammaticResultsScrollRef.current = false
    })
  }, [])

  const keepResultsScrolledToBottom = useCallback(() => {
    keepResultsScrolledDownRef.current = true
    scrollResultsToBottom()
  }, [scrollResultsToBottom])

  const scrollResultsToBottomIfKept = useCallback(() => {
    if (keepResultsScrolledDownRef.current) {
      scrollResultsToBottom()
    }
  }, [scrollResultsToBottom])

  useEffect(() => {
    keepResultsScrolledDownRef.current = true
    previousResultsScrollTopRef.current = 0
    scrollResultsToBottom()
    setIsStartingOpeningHandRun(false)
    setOpeningHandRunError(null)
    setIsStartingTurnRun(false)
    setTurnRunError(null)
    setIsStartingReportRun(false)
    setReportRunError(null)
    setIsStoppingSimulation(false)
    setStopSimulationError(null)
    resultsEventSourceRef.current?.close()
    resultsEventSourceRef.current = null

    if (resultsStreamErrorTimeoutRef.current !== null) {
      window.clearTimeout(resultsStreamErrorTimeoutRef.current)
      resultsStreamErrorTimeoutRef.current = null
    }

    setIsLoadingResults(false)
    setResultsError(null)
    setResultsInfo(initialResultsInfo)
    resultsInfoRef.current = initialResultsInfo
    setResultsStreamRestartKey(0)
  }, [initialResultsInfo, scrollResultsToBottom, simulation.id])

  useLayoutEffect(() => {
    if (keepResultsScrolledDownRef.current) {
      scrollResultsToBottom()
    }
  }, [resultsError, resultsInfo, isLoadingResults, scrollResultsToBottom])

  useEffect(() => {
    const resultsPanel = resultsPanelRef.current

    if (!resultsPanel) {
      return
    }

    const resizeObserver = new ResizeObserver(() => {
      if (keepResultsScrolledDownRef.current) {
        scrollResultsToBottom()
      }
    })

    resizeObserver.observe(resultsPanel)

    return () => {
      resizeObserver.disconnect()
    }
  }, [scrollResultsToBottom])

  function handleResultsScroll(event: UIEvent<HTMLElement>) {
    const resultsPanel = event.currentTarget
    const distanceFromBottom =
      resultsPanel.scrollHeight -
      resultsPanel.clientHeight -
      resultsPanel.scrollTop

    if (distanceFromBottom <= 4) {
      keepResultsScrolledDownRef.current = true
    } else if (
      !isProgrammaticResultsScrollRef.current &&
      resultsPanel.scrollTop < previousResultsScrollTopRef.current
    ) {
      keepResultsScrolledDownRef.current = false
    }

    previousResultsScrollTopRef.current = resultsPanel.scrollTop
  }

  async function handleStartOpeningHandRun() {
    if (
      readOnly ||
      !shouldSimulateOpeningHand ||
      isStartingOpeningHandRun ||
      isStartingTurnRun ||
      isStartingReportRun ||
      isStoppingSimulation
    ) {
      return
    }

    setIsStartingOpeningHandRun(true)
    setOpeningHandRunError(null)
    setTurnRunError(null)
    setReportRunError(null)

    try {
      const stopResult = await stopSimulation()

      if (!stopResult) {
        return
      }

      const response = await apiFetch(
        `${API_BASE_URL}/decks/${deckId}/simulations/${simulation.id}/opening-hand-llm-runs`,
        {
          method: "POST",
        }
      )

      if (!response.ok) {
        setOpeningHandRunError(
          await readApiError(response, "Opening hand run could not be started.")
        )
        return
      }

      setResultsStreamRestartKey((currentKey) => currentKey + 1)
    } catch {
      setOpeningHandRunError(
        "Opening hand run could not be sent to the server."
      )
    } finally {
      setIsStartingOpeningHandRun(false)
    }
  }

  async function handleStartTurnRun(turnNumber: number) {
    if (
      readOnly ||
      isStartingTurnRun ||
      isStartingOpeningHandRun ||
      isStartingReportRun ||
      isStoppingSimulation
    ) {
      return
    }

    if (!Number.isInteger(turnNumber) || turnNumber < 1) {
      setTurnRunError("Turn number must be a positive integer.")
      return
    }

    setIsStartingTurnRun(true)
    setTurnRunError(null)
    setOpeningHandRunError(null)
    setReportRunError(null)

    try {
      const stopResult = await stopSimulation()

      if (!stopResult) {
        return
      }

      const response = await apiFetch(
        `${API_BASE_URL}/decks/${deckId}/simulations/${simulation.id}/turn-llm-runs`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            turnNumber,
          }),
        }
      )

      if (!response.ok) {
        setTurnRunError(
          await readApiError(response, "Turn run could not be started.")
        )
        return
      }

      setResultsStreamRestartKey((currentKey) => currentKey + 1)
    } catch {
      setTurnRunError("Turn run could not be sent to the server.")
    } finally {
      setIsStartingTurnRun(false)
    }
  }

  async function handleStartReportRun() {
    if (
      readOnly ||
      isStartingReportRun ||
      isStartingTurnRun ||
      isStartingOpeningHandRun ||
      isStoppingSimulation
    ) {
      return
    }

    setIsStartingReportRun(true)
    setReportRunError(null)
    setTurnRunError(null)
    setOpeningHandRunError(null)

    try {
      const response = await apiFetch(
        `${API_BASE_URL}/decks/${deckId}/simulations/${simulation.id}/report-llm-runs`,
        {
          method: "POST",
        }
      )

      if (!response.ok) {
        setReportRunError(
          await readApiError(response, "Report run could not be started.")
        )
        return
      }

      setResultsStreamRestartKey((currentKey) => currentKey + 1)
    } catch {
      setReportRunError("Report run could not be sent to the server.")
    } finally {
      setIsStartingReportRun(false)
    }
  }

  async function stopSimulation() {
    if (readOnly) {
      return null
    }

    setIsStoppingSimulation(true)
    setStopSimulationError(null)

    try {
      const response = await apiFetch(
        `${API_BASE_URL}/decks/${deckId}/simulations/${simulation.id}/stop`,
        {
          method: "POST",
        }
      )

      if (!response.ok) {
        setStopSimulationError(
          await readApiError(response, "Simulation could not be stopped.")
        )
        return null
      }

      const data = (await response.json()) as StopSimulationResponse
      return data
    } catch {
      setStopSimulationError("Simulation stop could not be sent to the server.")
      return null
    } finally {
      setIsStoppingSimulation(false)
    }
  }

  async function handleStopSimulation() {
    if (readOnly || isStoppingSimulation) {
      return
    }

    await stopSimulation()
  }

  useEffect(() => {
    if (!shouldStreamResults) {
      resultsEventSourceRef.current?.close()
      resultsEventSourceRef.current = null
      setIsLoadingResults(false)
      return
    }

    const streamUrl =
      resultsStreamUrl ??
      `${API_BASE_URL}/decks/${deckId}/simulations/${simulation.id}/results/stream`
    const eventSource = new EventSource(streamUrl, {
      withCredentials: resultsStreamWithCredentials,
    })
    let isStreamClosed = false

    resultsEventSourceRef.current?.close()
    resultsEventSourceRef.current = eventSource
    setIsLoadingResults(true)
    setResultsError(null)

    function clearStreamErrorTimeout() {
      if (resultsStreamErrorTimeoutRef.current === null) {
        return
      }

      window.clearTimeout(resultsStreamErrorTimeoutRef.current)
      resultsStreamErrorTimeoutRef.current = null
    }

    function markStreamLoaded() {
      setIsLoadingResults(false)
    }

    function closeStream() {
      if (isStreamClosed) {
        return
      }

      isStreamClosed = true
      clearStreamErrorTimeout()
      eventSource.close()

      if (resultsEventSourceRef.current === eventSource) {
        resultsEventSourceRef.current = null
      }

      markStreamLoaded()
    }

    eventSource.onmessage = (messageEvent) => {
      clearStreamErrorTimeout()

      try {
        const streamEvent = JSON.parse(
          messageEvent.data
        ) as SimulationResultsStreamEvent

        if (streamEvent.type === "error") {
          setResultsError(streamEvent.message)
          markStreamLoaded()
          closeStream()
          return
        }

        const previousResultsInfo = resultsInfoRef.current
        const updatedResultsInfo = applySimulationResultsStreamEvent(
          previousResultsInfo,
          streamEvent
        )
        resultsInfoRef.current = updatedResultsInfo
        setResultsInfo(updatedResultsInfo)

        if (
          shouldRefreshUsageLimitsForFinishedStreamRun(
            streamEvent,
            previousResultsInfo,
            usageLimitRefreshRunIdsRef.current
          )
        ) {
          void refreshUsageLimits()
        }

        if (
          streamEvent.type === "snapshot" ||
          streamEvent.type === "simulation_updated" ||
          streamEvent.type === "done"
        ) {
          onSimulationUpdated(streamEvent.simulation)
        } else if (updatedResultsInfo) {
          onSimulationUpdated({
            ...simulationRef.current,
            activeLlmRunCount:
              getActiveLlmRunCountFromResults(updatedResultsInfo),
            completedLlmRunCount:
              getSimulationRunCountFromResults(updatedResultsInfo),
            simulatedTurnCount:
              getSimulationTurnCountFromResults(updatedResultsInfo),
          })
        }

        markStreamLoaded()

        if (streamEvent.type === "done") {
          closeStream()
        }
      } catch {
        setResultsError("Simulation results stream sent an invalid event.")
        markStreamLoaded()
      }
    }

    eventSource.onerror = () => {
      if (eventSource.readyState === EventSource.CLOSED) {
        setResultsError("Simulation results stream disconnected.")
        closeStream()
        return
      }

      if (resultsStreamErrorTimeoutRef.current !== null) {
        return
      }

      resultsStreamErrorTimeoutRef.current = window.setTimeout(() => {
        if (isStreamClosed) {
          return
        }

        setResultsError("Simulation results stream is reconnecting.")
        markStreamLoaded()
      }, 10000)
    }

    return () => {
      closeStream()
    }
  }, [
    deckId,
    onSimulationUpdated,
    refreshUsageLimits,
    resultsStreamUrl,
    resultsStreamWithCredentials,
    resultsStreamRestartKey,
    shouldStreamResults,
    simulation.id,
  ])

  return resultsInfo ? (
    <SimulationResultsPanel
      canUpgradeUsage={canUpgradeUsage}
      cards={cards}
      commanders={commanders}
      hasUsableModelPreset={selectedModelPreset !== null}
      isStartingOpeningHandRun={isStartingOpeningHandRun}
      isStartingReportRun={isStartingReportRun}
      isStartingTurnRun={isStartingTurnRun}
      isLoadingStartingHand={isLoadingStartingHand}
      isStoppingSimulation={isStoppingSimulation}
      onStartOpeningHandRun={() => void handleStartOpeningHandRun()}
      onStartReportRun={() => void handleStartReportRun()}
      onKeepResultsScrolledToBottom={keepResultsScrolledToBottom}
      onModelPresetRequired={onOpenDetails}
      onResultsScroll={handleResultsScroll}
      onScrollResultsToBottomIfKept={scrollResultsToBottomIfKept}
      onStartTurnRun={(turnNumber) => void handleStartTurnRun(turnNumber)}
      onStopSimulation={() => void handleStopSimulation()}
      onUpgradeUsage={onUpgradeUsage}
      openingHandRunError={openingHandRunError}
      readOnly={readOnly}
      reportRunError={reportRunError}
      resultsError={resultsError}
      resultsInfo={resultsInfo}
      resultsPanelRef={resultsPanelRef}
      simulation={simulation}
      startingHand={startingHand}
      startingHandLoadError={startingHandLoadError}
      stopSimulationError={stopSimulationError}
      turnRunError={turnRunError}
    />
  ) : (
    <SimulationResultsShell gameState={null}>
      <main
        ref={resultsPanelRef}
        className="simulation-scrollbar h-full min-h-0 min-w-0 flex-1 overflow-y-auto"
        onScroll={handleResultsScroll}
      >
        <section className="grid w-full gap-4 p-5">
          {resultsError ? (
            <p
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {resultsError}
            </p>
          ) : null}

          {isLoadingResults ? (
            <p className="rounded-md border border-border bg-background/35 px-3 py-2 text-sm text-muted-foreground">
              Loading simulation results...
            </p>
          ) : !resultsError ? (
            <p className="rounded-md border border-border bg-background/35 px-3 py-2 text-sm text-muted-foreground">
              Waiting for simulation results.
            </p>
          ) : null}
        </section>
      </main>
    </SimulationResultsShell>
  )
}

function SimulationResultsShell({
  cardLookup = EMPTY_SIMULATION_CARD_LOOKUP,
  children,
  gameState,
  header = null,
}: {
  cardLookup?: SimulationCardLookup
  children: ReactNode
  gameState: SimulationGameStateDisplay | null
  header?: ReactNode
}) {
  return (
    <div className="flex h-full min-h-0 min-w-0 overflow-hidden">
      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {header}
        <div className="grid min-h-0 min-w-0 flex-1 grid-rows-[minmax(12rem,42svh)_minmax(0,1fr)] overflow-hidden lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:grid-rows-1">
          <section
            className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden bg-background"
            aria-label="Simulation results"
          >
            {children}
          </section>
          <SimulationGameStatePane
            cardLookup={cardLookup}
            gameState={gameState}
          />
        </div>
      </div>
    </div>
  )
}

function SimulationReasoningSummariesSetting({
  deckId,
  onSimulationUpdated,
  simulation,
}: {
  deckId: string
  onSimulationUpdated: (simulation: Simulation) => void
  simulation: Simulation
}) {
  const [selectedEnabled, setSelectedEnabled] = useState(
    simulation.reasoningSummariesEnabled
  )
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setSelectedEnabled(simulation.reasoningSummariesEnabled)
    setError(null)
  }, [simulation.id, simulation.reasoningSummariesEnabled])

  async function handleReasoningSummariesChange(nextEnabled: boolean) {
    if (isSaving || nextEnabled === simulation.reasoningSummariesEnabled) {
      setSelectedEnabled(nextEnabled)
      return
    }

    setSelectedEnabled(nextEnabled)
    setError(null)
    setIsSaving(true)

    try {
      const response = await apiFetch(
        `${API_BASE_URL}/decks/${deckId}/simulations/${simulation.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            reasoningSummariesEnabled: nextEnabled,
          }),
        }
      )

      if (!response.ok) {
        setSelectedEnabled(simulation.reasoningSummariesEnabled)
        setError(
          await readApiError(
            response,
            "Reasoning summaries could not be updated."
          )
        )
        return
      }

      const data = (await response.json()) as UpdateSimulationResponse
      onSimulationUpdated(data.simulation)
    } catch {
      setSelectedEnabled(simulation.reasoningSummariesEnabled)
      setError("Reasoning summaries could not be updated.")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="grid gap-2">
      <ReasoningSummariesSwitch
        checked={selectedEnabled}
        disabled={isSaving}
        onCheckedChange={(nextEnabled) =>
          void handleReasoningSummariesChange(nextEnabled)
        }
      />
      {isSaving ? (
        <p className="text-sm text-muted-foreground">Saving...</p>
      ) : null}
      {error ? (
        <p
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </div>
  )
}

function SimulationFlexServiceTierSetting({
  deckId,
  onSimulationUpdated,
  selectedModelPreset,
  simulation,
}: {
  deckId: string
  onSimulationUpdated: (simulation: Simulation) => void
  selectedModelPreset: LlmModelPreset | null
  simulation: Simulation
}) {
  const [selectedEnabled, setSelectedEnabled] = useState(
    simulation.useFlexServiceTier
  )
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supportsFlex = Boolean(selectedModelPreset?.supportsFlex)
  const checked = supportsFlex && selectedEnabled

  useEffect(() => {
    setSelectedEnabled(simulation.useFlexServiceTier)
    setError(null)
  }, [simulation.id, simulation.useFlexServiceTier])

  async function handleFlexServiceTierChange(nextEnabled: boolean) {
    if (
      isSaving ||
      !supportsFlex ||
      nextEnabled === simulation.useFlexServiceTier
    ) {
      return
    }

    setSelectedEnabled(nextEnabled)
    setIsSaving(true)
    setError(null)

    try {
      const response = await apiFetch(
        `${API_BASE_URL}/decks/${deckId}/simulations/${simulation.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            useFlexServiceTier: nextEnabled,
          }),
        }
      )

      if (!response.ok) {
        setSelectedEnabled(simulation.useFlexServiceTier)
        setError(
          await readApiError(
            response,
            "Flex service tier could not be updated."
          )
        )
        return
      }

      const data = (await response.json()) as UpdateSimulationResponse
      onSimulationUpdated(data.simulation)
    } catch {
      setSelectedEnabled(simulation.useFlexServiceTier)
      setError("Flex service tier could not be updated.")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="grid gap-2">
      <FlexServiceTierSwitch
        checked={checked}
        disabled={isSaving || !supportsFlex}
        onCheckedChange={(nextEnabled) =>
          void handleFlexServiceTierChange(nextEnabled)
        }
      />
      {isSaving ? (
        <p className="text-sm text-muted-foreground">Saving...</p>
      ) : null}
      {error ? (
        <p
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </div>
  )
}

function SimulationModelPresetSelector({
  deckId,
  modelPresets,
  onSimulationUpdated,
  selectedModelPreset,
  simulation,
}: {
  deckId: string
  modelPresets: LlmModelPreset[]
  onSimulationUpdated: (simulation: Simulation) => void
  selectedModelPreset: LlmModelPreset | null
  simulation: Simulation
}) {
  const [selectedPresetId, setSelectedPresetId] = useState(
    simulation.llmModelPresetId ?? ""
  )
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const currentPresetUnavailable =
    Boolean(simulation.llmModelPresetId) && selectedModelPreset === null

  useEffect(() => {
    setSelectedPresetId(simulation.llmModelPresetId ?? "")
    setError(null)
  }, [simulation.id, simulation.llmModelPresetId])

  async function handleModelPresetChange(nextPresetId: string) {
    setSelectedPresetId(nextPresetId)
    setError(null)

    if (!nextPresetId || nextPresetId === simulation.llmModelPresetId) {
      return
    }

    setIsSaving(true)

    try {
      const response = await apiFetch(
        `${API_BASE_URL}/decks/${deckId}/simulations/${simulation.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            llmModelPresetId: nextPresetId,
          }),
        }
      )

      if (!response.ok) {
        setSelectedPresetId(simulation.llmModelPresetId ?? "")
        setError(
          await readApiError(response, "Simulation model could not be updated.")
        )
        return
      }

      const data = (await response.json()) as UpdateSimulationResponse
      onSimulationUpdated(data.simulation)
    } catch {
      setSelectedPresetId(simulation.llmModelPresetId ?? "")
      setError("Simulation model could not be updated.")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="grid gap-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <label
          className="text-sm font-medium text-foreground"
          htmlFor={`simulation-model-preset-${simulation.id}`}
        >
          Model preset
        </label>
        <select
          id={`simulation-model-preset-${simulation.id}`}
          className="h-9 min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-3 focus:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 sm:w-80"
          value={selectedPresetId}
          disabled={isSaving || modelPresets.length === 0}
          onChange={(event) => void handleModelPresetChange(event.target.value)}
        >
          {!simulation.llmModelPresetId ? (
            <option value="">Choose a model preset</option>
          ) : currentPresetUnavailable ? (
            <option value={simulation.llmModelPresetId}>
              Current preset unavailable
            </option>
          ) : null}
          {modelPresets.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {getLlmModelPresetLabel(preset)}
              {preset.isDefault ? " (default)" : ""}
            </option>
          ))}
        </select>
      </div>
      {selectedModelPreset ? (
        <p className="text-sm text-muted-foreground">
          {getLlmModelPresetLabel(selectedModelPreset)}
        </p>
      ) : simulation.llmModelPresetId ? (
        <p className="rounded-md border border-amber-300/35 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
          The selected preset is disabled or unavailable. Future LLM calls are
          blocked until an enabled preset is selected.
        </p>
      ) : (
        <p className="rounded-md border border-amber-300/35 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
          Select a model preset before starting future LLM calls.
        </p>
      )}
      {error ? (
        <p
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </div>
  )
}

function SimulationDebugModal({
  debugInfo,
  error,
  isLoading,
  modelPresets,
  onClose,
  onRefresh,
  simulationId,
}: {
  debugInfo: SimulationDebugInfo | null
  error: string | null
  isLoading: boolean
  modelPresets: LlmModelPreset[]
  onClose: () => void
  onRefresh: () => void
  simulationId: string
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 py-6 backdrop-blur-sm"
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        aria-labelledby="simulation-debug-title"
        className="flex max-h-[calc(100svh-3rem)] w-full max-w-6xl flex-col rounded-lg border border-border bg-card shadow-2xl shadow-black/40"
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0 space-y-1">
            <h2 id="simulation-debug-title" className="text-xl font-semibold">
              Simulation debug
            </h2>
            <p className="text-sm break-all text-muted-foreground">
              {simulationId}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isLoading}
              onClick={onRefresh}
            >
              <RefreshCw data-icon="inline-start" />
              {isLoading ? "Refreshing..." : "Refresh debug"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Close"
              title="Close"
              onClick={onClose}
            >
              <X />
            </Button>
          </div>
        </header>

        <div className="debug-scrollbar-neutral min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <div className="grid gap-4">
            {error ? (
              <p
                className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                role="alert"
              >
                {error}
              </p>
            ) : null}

            {isLoading && !debugInfo ? (
              <p className="rounded-md border border-border bg-background/35 px-3 py-2 text-sm text-muted-foreground">
                Loading debug info...
              </p>
            ) : null}

            {debugInfo ? (
              <SimulationDebugPanel
                debugInfo={debugInfo}
                modelPresets={modelPresets}
              />
            ) : !isLoading && !error ? (
              <p className="rounded-md border border-border bg-background/35 px-3 py-2 text-sm text-muted-foreground">
                Debug info has not been loaded yet.
              </p>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  )
}

function SimulationResultsPanel({
  canUpgradeUsage,
  cards,
  commanders,
  hasUsableModelPreset,
  isStartingOpeningHandRun,
  isStartingReportRun,
  isStartingTurnRun,
  isLoadingStartingHand,
  isStoppingSimulation,
  onStartOpeningHandRun,
  onKeepResultsScrolledToBottom,
  onModelPresetRequired,
  onResultsScroll,
  onScrollResultsToBottomIfKept,
  onStartTurnRun,
  onStartReportRun,
  onStopSimulation,
  onUpgradeUsage,
  openingHandRunError,
  readOnly,
  reportRunError,
  resultsError,
  resultsInfo,
  resultsPanelRef,
  simulation,
  startingHand,
  startingHandLoadError,
  stopSimulationError,
  turnRunError,
}: {
  canUpgradeUsage: boolean
  cards: DeckCard[]
  commanders: DeckCard[]
  hasUsableModelPreset: boolean
  isStartingOpeningHandRun: boolean
  isStartingReportRun: boolean
  isStartingTurnRun: boolean
  isLoadingStartingHand: boolean
  isStoppingSimulation: boolean
  onStartOpeningHandRun: () => void
  onKeepResultsScrolledToBottom: () => void
  onModelPresetRequired: () => void
  onResultsScroll: (event: UIEvent<HTMLElement>) => void
  onScrollResultsToBottomIfKept: () => void
  onStartTurnRun: (turnNumber: number) => void
  onStartReportRun: () => void
  onStopSimulation: () => void
  onUpgradeUsage: () => void
  openingHandRunError: string | null
  readOnly: boolean
  reportRunError: string | null
  resultsError: string | null
  resultsInfo: SimulationResultsInfo
  resultsPanelRef: RefObject<HTMLElement | null>
  simulation: Simulation
  startingHand: StartingHand | null
  startingHandLoadError: string | null
  stopSimulationError: string | null
  turnRunError: string | null
}) {
  const { billingTier, hasLoadedBillingTier } = useBillingTier()
  const cardLookup = useMemo(
    () => createSimulationCardLookup({ cards, commanders }),
    [cards, commanders]
  )
  const canStartOpeningHandRun = simulation.startingHandId === null
  const hasPresetStartingHand = simulation.startingHandId !== null
  const shouldShowUsageUpgradeAction =
    !readOnly &&
    canUpgradeUsage &&
    hasLoadedBillingTier &&
    (billingTier === "free" || billingTier === "plus")
  const isOpeningHandRunning = resultsInfo.openingHandLlmRuns.some((run) =>
    isActiveLlmRunStatus(run.status)
  )
  const isTurnRunning = resultsInfo.turnLlmRuns.some((run) =>
    isActiveLlmRunStatus(run.status)
  )
  const isReportRunning = resultsInfo.reportLlmRuns.some((run) =>
    isActiveLlmRunStatus(run.status)
  )
  const activeTurnNumbers = new Set(
    resultsInfo.turnLlmRuns
      .filter(
        (run) =>
          typeof run.turnNumber === "number" && isActiveLlmRunStatus(run.status)
      )
      .map((run) => run.turnNumber as number)
  )
  const isStartingSimulationRun =
    isStartingOpeningHandRun ||
    isStartingTurnRun ||
    isStartingReportRun ||
    isStoppingSimulation
  const isSimulationActionBlocked =
    readOnly ||
    isStartingSimulationRun ||
    isOpeningHandRunning ||
    isTurnRunning ||
    isReportRunning ||
    simulation.activeLlmRunCount > 0
  const canStartReportRun =
    !isSimulationActionBlocked &&
    resultsInfo.reportLlmRuns.length === 0 &&
    canGenerateReportFromVisibleResults(simulation, resultsInfo)
  const latestOpeningHandRun = resultsInfo.openingHandLlmRuns.reduce<
    SimulationResultsInfo["openingHandLlmRuns"][number] | null
  >((latestRun, run) => {
    if (!latestRun || run.attemptNumber > latestRun.attemptNumber) {
      return run
    }

    return latestRun
  }, null)
  const latestTurnRun = resultsInfo.turnLlmRuns.reduce<
    SimulationResultsInfo["turnLlmRuns"][number] | null
  >((latestRun, run) => {
    if (!latestRun) {
      return run
    }

    const runTurnNumber = run.turnNumber ?? 0
    const latestRunTurnNumber = latestRun.turnNumber ?? 0

    if (
      runTurnNumber > latestRunTurnNumber ||
      (runTurnNumber === latestRunTurnNumber &&
        run.attemptNumber > latestRun.attemptNumber)
    ) {
      return run
    }

    return latestRun
  }, null)
  const hasLatestOpeningHandRun = latestOpeningHandRun !== null
  const hasLatestTurnRun = latestTurnRun !== null
  const isLatestOpeningHandRunSuccessful = latestOpeningHandRun
    ? isSuccessfulOpeningHandRun(latestOpeningHandRun)
    : false
  const latestTurnRunNumber = latestTurnRun?.turnNumber
  const isLatestTurnRunSuccessful = latestTurnRun
    ? isSuccessfulTurnRun(latestTurnRun)
    : false
  const simulationAction = useMemo<SimulationResultsAction | null>(() => {
    if (isSimulationActionBlocked) {
      return null
    }

    if (hasLatestTurnRun) {
      if (
        isLatestTurnRunSuccessful &&
        typeof latestTurnRunNumber === "number"
      ) {
        return {
          kind: "turn",
          turnNumber: latestTurnRunNumber + 1,
        } as const
      }

      return null
    }

    if (hasLatestOpeningHandRun) {
      if (isLatestOpeningHandRunSuccessful) {
        return {
          kind: "turn",
          turnNumber: 1,
        } as const
      }

      return null
    }

    if (canStartOpeningHandRun) {
      return {
        kind: "opening_hand",
      } as const
    }

    return {
      kind: "turn",
      turnNumber: 1,
    } as const
  }, [
    canStartOpeningHandRun,
    hasLatestOpeningHandRun,
    hasLatestTurnRun,
    isSimulationActionBlocked,
    isLatestOpeningHandRunSuccessful,
    isLatestTurnRunSuccessful,
    latestTurnRunNumber,
  ])
  const [renderedSimulationAction, setRenderedSimulationAction] =
    useState<SimulationResultsAction | null>(() => simulationAction)

  useEffect(() => {
    if (!simulationAction) {
      if (renderedSimulationAction?.kind === "turn" && isStartingTurnRun) {
        return
      }

      const hideTimeoutId = window.setTimeout(() => {
        setRenderedSimulationAction(null)
      }, 0)

      return () => {
        window.clearTimeout(hideTimeoutId)
      }
    }

    const showTimeoutId = window.setTimeout(() => {
      setRenderedSimulationAction(simulationAction)
    }, 200)

    return () => {
      window.clearTimeout(showTimeoutId)
    }
  }, [isStartingTurnRun, renderedSimulationAction, simulationAction])

  useLayoutEffect(() => {
    if (renderedSimulationAction?.kind === "turn") {
      onScrollResultsToBottomIfKept()
    }
  }, [onScrollResultsToBottomIfKept, renderedSimulationAction])

  const actionError = openingHandRunError ?? turnRunError ?? reportRunError
  function canContinueWithModelPreset() {
    if (hasUsableModelPreset) {
      return true
    }

    onModelPresetRequired()
    return false
  }

  const runs = [
    ...resultsInfo.openingHandLlmRuns.map((run) => ({
      ...run,
      canRerun: !readOnly && canStartOpeningHandRun && !isOpeningHandRunning,
      isActive: isActiveLlmRunStatus(run.status),
      resultKind: "opening_hand" as const,
      resultLabel: `Opening hand attempt ${run.attemptNumber}`,
      resultEntries: getSimulationResultEntries(run.chunks),
      activeToolCallName: getSimulationRunActiveToolCallName(run.chunks),
      hasFinalParsedOutputChunk: hasSimulationRunFinalParsedOutputChunk(
        run.chunks
      ),
    })),
    ...resultsInfo.turnLlmRuns.map((run) => ({
      ...run,
      canRerun:
        !readOnly &&
        typeof run.turnNumber === "number" &&
        !activeTurnNumbers.has(run.turnNumber),
      isActive: isActiveLlmRunStatus(run.status),
      resultKind: "turn" as const,
      resultLabel: `Turn ${run.turnNumber ?? "?"} attempt ${run.attemptNumber}`,
      resultEntries: getSimulationResultEntries(run.chunks),
      activeToolCallName: getSimulationRunActiveToolCallName(run.chunks),
      hasFinalParsedOutputChunk: hasSimulationRunFinalParsedOutputChunk(
        run.chunks
      ),
    })),
    ...resultsInfo.reportLlmRuns.map((run) => ({
      ...run,
      canRerun: false,
      isActive: isActiveLlmRunStatus(run.status),
      resultKind: "report" as const,
      resultLabel: `Report attempt ${run.attemptNumber}`,
      resultEntries: getSimulationResultEntries(run.chunks),
      activeToolCallName: getSimulationRunActiveToolCallName(run.chunks),
      hasFinalParsedOutputChunk: hasSimulationRunFinalParsedOutputChunk(
        run.chunks
      ),
    })),
  ]
  const timelineSteps = useMemo(
    () =>
      buildSimulationResultsTimelineSteps({
        hasPresetStartingHand,
        resultsInfo,
      }),
    [hasPresetStartingHand, resultsInfo]
  )
  const displayedTimelineSteps = useMemo<
    SimulationResultsDisplayTimelineStep[]
  >(() => {
    const steps: SimulationResultsDisplayTimelineStep[] = [...timelineSteps]

    if (renderedSimulationAction?.kind === "turn") {
      const turnNumber = renderedSimulationAction.turnNumber

      if (!hasSimulationTimelineTurnStep(timelineSteps, turnNumber)) {
        steps.push(createNextTurnTimelineStep(turnNumber, isStartingTurnRun))
      }
    }

    const reportTimelineStep = getReportTimelineStep(canStartReportRun)

    if (reportTimelineStep) {
      steps.push(reportTimelineStep)
    }

    return steps
  }, [
    canStartReportRun,
    isStartingTurnRun,
    renderedSimulationAction,
    timelineSteps,
  ])
  const [
    selectedTimelineStepIdPreference,
    setSelectedTimelineStepIdPreference,
  ] = useState<string | null>(null)
  const previousSelectedTimelineStepIdRef = useRef<string | null>(null)
  const previousSelectedTimelineStepRef =
    useRef<SimulationResultsTimelineSelectionSnapshot | null>(null)
  const timelineStepButtonRefs = useRef<Map<string, HTMLButtonElement>>(
    new Map()
  )
  const runsByTimelineStepId = new Map(
    runs.map((run) => [getSimulationTimelineRunStepId(run.llmRunId), run])
  )
  const selectedTimelineStepId = resolveSimulationResultsTimelineSelection(
    timelineSteps,
    selectedTimelineStepIdPreference,
    previousSelectedTimelineStepRef.current
  )
  const selectedTimelineStep =
    timelineSteps.find((step) => step.id === selectedTimelineStepId) ?? null
  const selectedTimelineStepSnapshot = selectedTimelineStep
    ? getSimulationTimelineStepSelectionSnapshot(selectedTimelineStep)
    : null
  const shouldLockFinishedTimelineStep =
    selectedTimelineStepIdPreference === null &&
    shouldPreserveFinishedSimulationResultsTimelineSelection(
      previousSelectedTimelineStepRef.current,
      selectedTimelineStep
    )
  const selectedTimelineRun =
    selectedTimelineStep?.run === null
      ? null
      : selectedTimelineStep
        ? (runsByTimelineStepId.get(selectedTimelineStep.id) ?? null)
        : null
  const selectedTimelinePanelId = selectedTimelineStep
    ? getSimulationTimelineStepPanelId(selectedTimelineStep.id)
    : undefined
  const selectedGameState =
    selectedTimelineStep?.kind === "preset_opening_hand"
      ? getStartingHandGameStateDisplay(startingHand, cards, commanders)
      : getSimulationRunGameStateDisplay(selectedTimelineRun, commanders)

  useEffect(() => {
    if (!selectedTimelineStepId) {
      return
    }

    timelineStepButtonRefs.current.get(selectedTimelineStepId)?.scrollIntoView({
      block: "nearest",
      inline: "center",
    })
  }, [displayedTimelineSteps, selectedTimelineStepId])

  useLayoutEffect(() => {
    const previousSelectedTimelineStepId =
      previousSelectedTimelineStepIdRef.current

    previousSelectedTimelineStepIdRef.current = selectedTimelineStepId
    previousSelectedTimelineStepRef.current = selectedTimelineStepSnapshot

    if (shouldLockFinishedTimelineStep && selectedTimelineStepId) {
      setSelectedTimelineStepIdPreference(selectedTimelineStepId)
    }

    if (previousSelectedTimelineStepId === selectedTimelineStepId) {
      return
    }

    if (!selectedTimelineStepId) {
      return
    }

    onKeepResultsScrolledToBottom()
  }, [
    onKeepResultsScrolledToBottom,
    selectedTimelineStepId,
    selectedTimelineStepSnapshot,
    shouldLockFinishedTimelineStep,
  ])

  function renderSimulationRunDetail(
    run: (typeof runs)[number],
    panelId: string | undefined,
    tabId: string | undefined
  ) {
    const finishedDurationText = getSimulationRunFinishedDurationText(run)
    const shouldShowFinishedThinkingStatus =
      !run.isActive && getSimulationRunFinishedTimeMs(run) !== null
    const finishedThinkingStatus = shouldShowFinishedThinkingStatus ? (
      <SimulationResultThinkingStatus
        activeToolCallName={null}
        canStopSimulation={false}
        finishedDurationText={finishedDurationText}
        isFinalizingTurn={false}
        isPending={false}
        isFinishedSuccessfully={run.status === "completed"}
        isFinished={true}
        isStoppingSimulation={false}
        onStopSimulation={onStopSimulation}
        runStartTimeMs={null}
        stopSimulationError={null}
      />
    ) : null
    const runMetadata = [
      run.status,
      run.model,
      getLlmRunEstimatedPriceText(run),
      finishedDurationText ? `took ${finishedDurationText}` : null,
      run.outdated ? "outdated" : null,
    ].filter(Boolean)
    const shouldShowRunMetadata = !run.isActive && runMetadata.length > 0
    const shouldShowRunActions = run.canRerun
    const hasLiveReport =
      run.resultKind === "report" &&
      !run.hasFinalParsedOutputChunk &&
      getReportTextFromChunks(run.chunks) !== null
    const emptyRunFailureMessage =
      run.status === "failed" ? run.failureMessage?.trim() || null : null
    const isUsageLimitFailure = isUsageLimitFailureMessage(
      emptyRunFailureMessage
    )
    const finalParsedOutput = getSimulationFinalParsedOutput(run)
    const directTurnActions =
      hasGameState(run.gameState) &&
      !finalParsedOutput &&
      hasTurnActions(run.turnActions)
        ? run.turnActions
        : null

    return (
      <section
        key={run.llmRunId}
        id={panelId}
        aria-labelledby={tabId}
        className="grid gap-3"
        role={panelId ? "region" : undefined}
      >
        {directTurnActions ? (
          <SimulationTurnActionsSurface
            cardLookup={cardLookup}
            turnActions={directTurnActions}
          />
        ) : null}

        {run.resultEntries.length > 0 ||
        finishedThinkingStatus ||
        hasLiveReport ? (
          <SimulationResultChunkCards
            cardLookup={cardLookup}
            run={run}
            entries={run.resultEntries}
            finishedThinkingStatus={finishedThinkingStatus}
          />
        ) : null}

        {run.isActive && !run.hasFinalParsedOutputChunk ? (
          <SimulationResultThinkingStatus
            activeToolCallName={run.activeToolCallName}
            canStopSimulation={!readOnly && run.status !== "cancel_requested"}
            finishedDurationText={null}
            isFinalizingTurn={isSimulationRunLatestChunkOutputDelta(run.chunks)}
            isPending={run.status === "pending"}
            isFinishedSuccessfully={false}
            isFinished={false}
            isStoppingSimulation={isStoppingSimulation}
            onStopSimulation={onStopSimulation}
            runStartTimeMs={getSimulationRunStartTimeMs(run)}
            stopSimulationError={stopSimulationError}
          />
        ) : run.resultEntries.length === 0 && directTurnActions === null ? (
          <div
            className={`rounded-md border px-3 py-2 text-sm ${
              isUsageLimitFailure
                ? "border-amber-300/30 bg-amber-400/10 text-amber-100"
                : emptyRunFailureMessage
                  ? "border-destructive/40 bg-destructive/10 text-destructive"
                  : "border-border bg-black/20 text-muted-foreground"
            }`}
            role={
              isUsageLimitFailure
                ? "status"
                : emptyRunFailureMessage
                  ? "alert"
                  : undefined
            }
          >
            {isUsageLimitFailure ? (
              <UsageLimitReachedNotice
                onUpgradeUsage={onUpgradeUsage}
                shouldShowUsageUpgradeAction={shouldShowUsageUpgradeAction}
              />
            ) : (
              <p>
                {emptyRunFailureMessage ??
                  "No user-facing events have been saved for this run yet."}
              </p>
            )}
          </div>
        ) : null}

        {shouldShowRunMetadata || shouldShowRunActions ? (
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
            {shouldShowRunMetadata ? (
              <div className="min-w-0">
                <p className="text-xs break-words text-muted-foreground">
                  {runMetadata.join(" / ")}
                </p>
              </div>
            ) : (
              <div className="min-w-0" aria-hidden="true" />
            )}
            <div className="flex shrink-0 items-center justify-end gap-1">
              {run.canRerun ? (
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  disabled={isStartingSimulationRun}
                  aria-label={
                    run.resultKind === "opening_hand"
                      ? "Rerun opening hand"
                      : run.resultKind === "report"
                        ? "Rerun report"
                        : `Rerun turn ${run.turnNumber}`
                  }
                  title={
                    run.resultKind === "opening_hand"
                      ? "Rerun opening hand"
                      : run.resultKind === "report"
                        ? "Rerun report"
                        : `Rerun turn ${run.turnNumber}`
                  }
                  onClick={() => {
                    if (!canContinueWithModelPreset()) {
                      return
                    }

                    setSelectedTimelineStepIdPreference(null)
                    onKeepResultsScrolledToBottom()

                    if (run.resultKind === "opening_hand") {
                      onStartOpeningHandRun()
                      return
                    }

                    if (run.resultKind === "report") {
                      onStartReportRun()
                      return
                    }

                    if (typeof run.turnNumber === "number") {
                      onStartTurnRun(run.turnNumber)
                    }
                  }}
                >
                  <RefreshCw />
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>
    )
  }

  function renderTimelineHeader() {
    if (displayedTimelineSteps.length === 0) {
      return null
    }

    return (
      <header className="relative w-full shrink-0 bg-background px-5 py-3">
        <div className="w-full">
          <div
            aria-label="Simulation timeline"
            className="simulation-scrollbar simulation-scrollbar-no-gutter overflow-x-auto"
            role="group"
          >
            <div className="flex min-w-max items-start">
              {displayedTimelineSteps.map((step, stepIndex) => {
                const isResultStep = isSimulationTimelineResultStep(step)
                const isSelected =
                  isResultStep && step.id === selectedTimelineStepId
                const panelId = isResultStep
                  ? getSimulationTimelineStepPanelId(step.id)
                  : undefined
                const isFirstStep = stepIndex === 0
                const isLastStep =
                  stepIndex === displayedTimelineSteps.length - 1
                const stepDescription =
                  getSimulationTimelineStepDescription(step)

                return (
                  <button
                    key={step.id}
                    ref={(element) => {
                      if (element) {
                        timelineStepButtonRefs.current.set(step.id, element)
                      } else {
                        timelineStepButtonRefs.current.delete(step.id)
                      }
                    }}
                    aria-label={`${step.label}, ${stepDescription}`}
                    aria-controls={panelId}
                    aria-current={isSelected ? "step" : undefined}
                    className={getSimulationTimelineStepButtonClassName(
                      step,
                      isSelected
                    )}
                    id={
                      isResultStep
                        ? getSimulationTimelineStepTabId(step.id)
                        : undefined
                    }
                    disabled={
                      step.kind === "simulate_turn" &&
                      step.status === "starting_turn"
                    }
                    type="button"
                    onClick={() => {
                      if (step.kind === "simulate_turn") {
                        if (step.status === "starting_turn") {
                          return
                        }

                        if (!canContinueWithModelPreset()) {
                          return
                        }

                        setSelectedTimelineStepIdPreference(null)
                        onKeepResultsScrolledToBottom()
                        onStartTurnRun(step.turnNumber)
                        return
                      }

                      if (isResultStep) {
                        setSelectedTimelineStepIdPreference(step.id)
                        onKeepResultsScrolledToBottom()
                      }
                    }}
                  >
                    <span
                      className="flex w-full items-center"
                      aria-hidden="true"
                    >
                      <span
                        className={getSimulationTimelineStepConnectorClassName({
                          isHidden: isFirstStep,
                        })}
                      />
                      <span
                        className={getSimulationTimelineStepNodeClassName(
                          step,
                          isSelected
                        )}
                      >
                        {getSimulationTimelineStepNodeContent({
                          step,
                          isSelected,
                          stepNumber: stepIndex + 1,
                        })}
                      </span>
                      <span
                        className={getSimulationTimelineStepConnectorClassName({
                          isHidden: isLastStep,
                        })}
                      />
                    </span>
                    <span className="grid w-full justify-items-center gap-0.5 px-1 text-center">
                      <span
                        className={getSimulationTimelineStepLabelClassName(
                          isSelected
                        )}
                      >
                        {step.label}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
        <div
          className="pointer-events-none absolute right-0 bottom-0 left-0 border-b border-border/80"
          aria-hidden="true"
        />
      </header>
    )
  }

  return (
    <>
      <SimulationResultsShell
        cardLookup={cardLookup}
        gameState={selectedGameState}
        header={renderTimelineHeader()}
      >
        <main
          ref={resultsPanelRef}
          className="simulation-scrollbar h-full min-h-0 min-w-0 flex-1 overflow-y-auto"
          onScroll={onResultsScroll}
        >
          <section className="grid w-full gap-3 p-3">
            {resultsError ? (
              <p
                className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                role="alert"
              >
                {resultsError}
              </p>
            ) : null}

            {timelineSteps.length === 0 ? (
              <p className="rounded-md border border-border bg-background/35 px-3 py-2 text-sm text-muted-foreground">
                No opening hand or turn runs have been saved for this simulation
                yet.
              </p>
            ) : null}

            {selectedTimelineStep?.kind === "preset_opening_hand" ? (
              <div
                id={selectedTimelinePanelId}
                aria-labelledby={getSimulationTimelineStepTabId(
                  selectedTimelineStep.id
                )}
                role="region"
              >
                <SimulationPresetStartingHandBlock
                  isLoadingStartingHand={isLoadingStartingHand}
                  startingHand={startingHand}
                  startingHandLoadError={startingHandLoadError}
                />
              </div>
            ) : selectedTimelineRun ? (
              renderSimulationRunDetail(
                selectedTimelineRun,
                selectedTimelinePanelId,
                selectedTimelineStep
                  ? getSimulationTimelineStepTabId(selectedTimelineStep.id)
                  : undefined
              )
            ) : null}

            {actionError ? (
              <p
                className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                role="alert"
              >
                {actionError}
              </p>
            ) : null}
          </section>
        </main>
      </SimulationResultsShell>
    </>
  )
}

function getSimulationTimelineRunStepId(llmRunId: string) {
  return `run:${llmRunId}`
}

function getSimulationTimelineStepSelectionSnapshot(
  step: SimulationResultsTimelineStep
): SimulationResultsTimelineSelectionSnapshot {
  return {
    id: step.id,
    kind: step.kind,
    status: step.status,
  }
}

function createNextTurnTimelineStep(
  turnNumber: number,
  isStartingTurnRun: boolean
): SimulationResultsNextTurnTimelineStep {
  return {
    id: `action:turn:${turnNumber}`,
    kind: "simulate_turn",
    label: `Turn ${turnNumber}`,
    detailLabel: "Simulate next turn",
    status: isStartingTurnRun ? "starting_turn" : "next_turn",
    turnNumber,
  }
}

function hasSimulationTimelineTurnStep(
  steps: readonly SimulationResultsTimelineStep[],
  turnNumber: number
) {
  return steps.some(
    (step) =>
      step.kind === "turn" &&
      step.run !== null &&
      step.run.turnNumber === turnNumber
  )
}

function getReportTimelineStep(
  canStartReportRun: boolean
): SimulationResultsReportTimelineStep | null {
  if (canStartReportRun) {
    return null
  }

  return null
}

function isSimulationTimelineResultStep(
  step: SimulationResultsDisplayTimelineStep
): step is SimulationResultsTimelineStep {
  return (
    step.kind === "preset_opening_hand" ||
    step.kind === "opening_hand" ||
    step.kind === "turn" ||
    step.kind === "report"
  )
}

function getSimulationTimelineStepPanelId(stepId: string) {
  return `simulation-timeline-panel-${getSimulationTimelineDomIdPart(stepId)}`
}

function getSimulationTimelineStepTabId(stepId: string) {
  return `simulation-timeline-tab-${getSimulationTimelineDomIdPart(stepId)}`
}

function getSimulationTimelineDomIdPart(stepId: string) {
  return stepId.replace(/[^A-Za-z0-9_-]/g, "-")
}

function getSimulationTimelineStepStatusLabel(
  step: SimulationResultsDisplayTimelineStep
) {
  if (step.status === "next_turn") {
    return "Next"
  }

  if (step.status === "starting_turn") {
    return "Starting"
  }

  if (step.status === "report") {
    return "Report"
  }

  if (step.status === "preset") {
    return "Preset"
  }

  if (step.status === "pending") {
    return "Queued"
  }

  if (step.status === "streaming") {
    return "Running"
  }

  if (step.status === "cancel_requested") {
    return "Stopping"
  }

  if (step.status === "completed") {
    return "Done"
  }

  if (step.status === "failed") {
    return "Failed"
  }

  if (step.status === "cancelled") {
    return "Cancelled"
  }

  return "Saved"
}

function getSimulationTimelineStepDescription(
  step: SimulationResultsDisplayTimelineStep
) {
  if (step.kind === "simulate_turn" || step.kind === "generate_report") {
    return step.detailLabel
  }

  if (step.kind === "preset_opening_hand") {
    return "Preset hand"
  }

  if (
    step.status === "pending" ||
    step.status === "streaming" ||
    step.status === "cancel_requested" ||
    step.status === "failed" ||
    step.status === "cancelled"
  ) {
    return `${step.detailLabel} - ${getSimulationTimelineStepStatusLabel(step)}`
  }

  return step.detailLabel
}

function getSimulationTimelineStepButtonClassName(
  _step: SimulationResultsDisplayTimelineStep,
  isSelected: boolean
) {
  const baseClassName =
    "group flex w-36 shrink-0 flex-col items-center gap-2 rounded-sm px-0 py-1.5 text-center transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50"

  if (isSelected) {
    return `${baseClassName} text-foreground`
  }

  return `${baseClassName} text-muted-foreground hover:text-foreground`
}

function getSimulationTimelineStepNodeClassName(
  step: SimulationResultsDisplayTimelineStep,
  isSelected: boolean
) {
  const baseClassName =
    "relative z-10 grid size-9 shrink-0 place-items-center rounded-full border-2 bg-background text-xs font-semibold transition-all"

  if (isSelected) {
    if (step.status === "failed") {
      return `${baseClassName} border-destructive bg-destructive text-background shadow-[inset_0_0_0_2px_var(--background)]`
    }

    if (step.status === "cancelled") {
      return `${baseClassName} border-muted-foreground bg-muted-foreground text-background shadow-[inset_0_0_0_2px_var(--background)]`
    }

    return `${baseClassName} border-primary bg-primary text-primary-foreground shadow-[inset_0_0_0_2px_var(--background)]`
  }

  if (step.status === "starting_turn") {
    return `${baseClassName} border-primary text-primary`
  }

  if (step.kind === "simulate_turn" || step.kind === "generate_report") {
    return `${baseClassName} border-border text-muted-foreground group-hover:border-primary/60 group-hover:text-primary`
  }

  if (
    step.status === "completed" ||
    step.status === "preset" ||
    isActiveSimulationResultsTimelineStep(step)
  ) {
    return `${baseClassName} border-primary text-primary`
  }

  if (step.status === "failed") {
    return `${baseClassName} border-destructive text-destructive`
  }

  if (step.status === "cancelled") {
    return `${baseClassName} border-muted-foreground/70 text-muted-foreground`
  }

  return `${baseClassName} border-border text-muted-foreground`
}

function getSimulationTimelineStepNodeContent({
  isSelected,
  step,
  stepNumber,
}: {
  isSelected: boolean
  step: SimulationResultsDisplayTimelineStep
  stepNumber: number
}) {
  if (step.status === "starting_turn") {
    return <LoaderCircle className="size-4 animate-spin" />
  }

  if (step.kind === "simulate_turn" || step.kind === "generate_report") {
    return <Plus className="size-4" />
  }

  if (
    isSimulationTimelineResultStep(step) &&
    isActiveSimulationResultsTimelineStep(step)
  ) {
    if (isSelected) {
      return getSimulationTimelineSelectedActiveStepNodeContent(step)
    }

    return <LoaderCircle className="size-4 animate-spin" />
  }

  if (step.status === "completed" || step.status === "preset") {
    return <Check className="size-4" />
  }

  if (step.status === "failed" || step.status === "cancelled") {
    return <X className="size-4" />
  }

  return stepNumber
}

function getSimulationTimelineSelectedActiveStepNodeContent(
  step: SimulationResultsTimelineStep
) {
  if (step.status === "cancel_requested") {
    return <Square className="size-3.5" fill="currentColor" />
  }

  if (step.kind === "opening_hand") {
    return <Hand className="size-4" />
  }

  if (step.kind === "turn") {
    return <Swords className="size-4" />
  }

  if (step.kind === "report") {
    return <BookCopy className="size-4" />
  }

  return <Hourglass className="size-4" />
}

function getSimulationTimelineStepConnectorClassName({
  isHidden,
}: {
  isHidden: boolean
}) {
  const baseClassName = "h-px flex-1 transition-colors"

  if (isHidden) {
    return `${baseClassName} bg-transparent`
  }

  return `${baseClassName} bg-border`
}

function getSimulationTimelineStepLabelClassName(isSelected: boolean) {
  const baseClassName = "max-w-full truncate text-sm font-medium leading-5"

  return isSelected ? `${baseClassName} text-foreground` : baseClassName
}

const simulationResultChunkSurfaceClassName =
  "rounded-md border border-border bg-black/20"
const simulationResultChunkSummaryClassName =
  "cursor-pointer px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
const simulationResultChunkPreClassName =
  "debug-scrollbar-neutral max-h-64 max-w-full overflow-y-auto border-t border-border p-3 text-xs leading-5 break-words whitespace-pre-wrap text-muted-foreground"
const showSimulationResultCardImageToggle = false

function SimulationResultChunkCards({
  cardLookup,
  entries,
  finishedThinkingStatus,
  run,
}: {
  cardLookup: SimulationCardLookup
  entries: SimulationResultEntry[]
  finishedThinkingStatus: ReactNode | null
  run: SimulationDebugLlmRun
}) {
  const finalParsedOutputEntryIndex = entries.findIndex(
    (entry) =>
      entry.type === "chunk" && entry.chunk.kind === "final_parsed_output"
  )
  const finishedThinkingStatusIndex =
    finishedThinkingStatus === null
      ? -1
      : finalParsedOutputEntryIndex === -1
        ? entries.length > 0
          ? entries.length - 1
          : -1
        : finalParsedOutputEntryIndex
  const shouldAppendFinishedThinkingStatus =
    finishedThinkingStatus !== null && finishedThinkingStatusIndex === -1
  const liveReport =
    run.phase === "report" && finalParsedOutputEntryIndex === -1
      ? getReportTextFromChunks(run.chunks)
      : null

  function renderEntry(entry: SimulationResultEntry) {
    const { chunk } = entry

    if (chunk.kind === "final_parsed_output") {
      const finalOutput = getSimulationFinalParsedOutputFromPayload(
        run.phase,
        chunk.payload
      )

      if (finalOutput) {
        return (
          <SimulationFinalOutputBlock
            cardLookup={cardLookup}
            finalOutput={finalOutput}
          />
        )
      }
    }

    return <SimulationResultEvent cardLookup={cardLookup} chunk={chunk} />
  }

  return (
    <div className="grid gap-2">
      {liveReport ? (
        <div
          className={`grid gap-3 p-3 ${simulationResultChunkSurfaceClassName}`}
        >
          <SimulationReportMarkdown report={liveReport} />
        </div>
      ) : null}
      {entries.map((entry, index) => (
        <Fragment key={entry.id}>
          {index === finishedThinkingStatusIndex
            ? finishedThinkingStatus
            : null}
          {renderEntry(entry)}
        </Fragment>
      ))}
      {shouldAppendFinishedThinkingStatus ? finishedThinkingStatus : null}
    </div>
  )
}

function getReportTextFromChunks(
  chunks: readonly SimulationDebugLlmRunChunk[]
) {
  const report = [...chunks]
    .sort(
      (firstChunk, secondChunk) => firstChunk.sequence - secondChunk.sequence
    )
    .map((chunk) =>
      chunk.kind === "message_delta" ? (chunk.outputDelta ?? "") : ""
    )
    .join("")
    .trim()

  return report.length > 0 ? report : null
}

function SimulationResultThinkingStatus({
  activeToolCallName,
  canStopSimulation,
  finishedDurationText,
  isFinalizingTurn,
  isPending,
  isFinished,
  isFinishedSuccessfully,
  isStoppingSimulation,
  onStopSimulation,
  runStartTimeMs,
  stopSimulationError,
}: {
  activeToolCallName: string | null
  canStopSimulation: boolean
  finishedDurationText: string | null
  isFinalizingTurn: boolean
  isPending: boolean
  isFinished: boolean
  isFinishedSuccessfully: boolean
  isStoppingSimulation: boolean
  onStopSimulation: () => void
  runStartTimeMs: number | null
  stopSimulationError: string | null
}) {
  const [currentTimeMs, setCurrentTimeMs] = useState(() => Date.now())

  useEffect(() => {
    if (isFinished || isPending) {
      return
    }

    const intervalId = window.setInterval(() => {
      setCurrentTimeMs(Date.now())
    }, 1000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [isFinished, isPending])

  const activeToolCallLabel =
    activeToolCallName === null
      ? null
      : getKnownSimulationResultToolLabel({
          mcpFunctionName: activeToolCallName,
          state: "active",
        })
  const activeElapsedText =
    runStartTimeMs === null || isFinished || isPending
      ? null
      : formatMinutesSeconds(currentTimeMs - runStartTimeMs)
  const statusLabel = isFinished
    ? finishedDurationText
      ? `Thought for ${finishedDurationText}`
      : "Thought"
    : isPending
      ? "Pending"
      : activeToolCallName
        ? (activeToolCallLabel ?? `Calling tool: ${activeToolCallName}`)
        : isFinalizingTurn
          ? "Finalizing turn"
          : "Thinking"

  return (
    <div className="grid gap-2 py-1 select-none">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="inline-flex max-w-full min-w-0 flex-1 items-center gap-2 rounded-sm px-0.5 py-1 text-left text-sm font-medium text-sky-200">
          {isFinished ? (
            isFinishedSuccessfully ? (
              <Check className="size-4 shrink-0 text-emerald-300" />
            ) : (
              <X className="size-4 shrink-0 text-destructive" />
            )
          ) : (
            <LoaderCircle className="size-4 shrink-0 animate-spin text-sky-300" />
          )}
          <span className="min-w-0 truncate">{statusLabel}</span>
          {activeElapsedText ? (
            <span className="shrink-0 text-xs font-normal text-sky-100/65 tabular-nums">
              {activeElapsedText}
            </span>
          ) : null}
        </div>
        {canStopSimulation ? (
          <Button
            className="size-8 rounded-full border border-border/80 bg-background/20 text-muted-foreground hover:border-sky-300/50 hover:text-foreground"
            type="button"
            variant="ghost"
            size="icon"
            disabled={isStoppingSimulation}
            aria-label="Stop simulation"
            title="Stop simulation"
            onClick={onStopSimulation}
          >
            {isStoppingSimulation ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <Square fill="currentColor" />
            )}
          </Button>
        ) : null}
      </div>
      {stopSimulationError ? (
        <p
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {stopSimulationError}
        </p>
      ) : null}
    </div>
  )
}

const simulationReportMarkdownClassName =
  "min-w-0 space-y-2 text-sm leading-6 break-words text-foreground/95 [&_a]:text-sky-300 [&_a]:underline [&_code]:rounded-sm [&_code]:bg-muted/45 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-sky-100 [&_ol]:list-decimal [&_ol]:pl-5 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-black/30 [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_strong]:text-foreground [&_ul]:list-disc [&_ul]:pl-5"
const simulationResultSummaryMarkdownClassName =
  "min-w-0 space-y-2 text-sm leading-6 break-words text-muted-foreground [&_a]:text-sky-300 [&_a]:underline [&_code]:rounded-sm [&_code]:bg-muted/45 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-sky-100 [&_ol]:list-decimal [&_ol]:pl-5 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-black/30 [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_strong]:text-foreground/90 [&_ul]:list-disc [&_ul]:pl-5"

type SimulationGameStateZoneCard = {
  index: number
  name: string
  notes: string | null
  tapped: boolean | null
  zoneKey: string
}

type SimulationGameStateZone = {
  cards: SimulationGameStateZoneCard[]
  key: string
  label: string
}

type SimulationGameStateZoneCardPresenceItem = {
  card: SimulationGameStateZoneCard
  isEntering: boolean
  isEnteringPlaceholder: boolean
  isExiting: boolean
  key: string
}

type SimulationGameStateDisplay = {
  gameState: unknown
  libraryCardCount: number | null
}

type SimulationResultCardPreviewPosition = {
  left: number
  placement: "above" | "below"
  top: number
  width: number
}

const GAME_STATE_ZONE_ORDER = [
  "battlefield",
  "hand",
  "command",
  "graveyard",
  "exile",
] as const

const GAME_STATE_ZONE_LABELS: Record<string, string> = {
  battlefield: "Battlefield",
  command: "Command",
  exile: "Exile",
  graveyard: "Graveyard",
  hand: "Hand",
}

const SIMULATION_RESULT_CARD_PREVIEW_GAP_PX = 8
const SIMULATION_RESULT_CARD_PREVIEW_MARGIN_PX = 12
const SIMULATION_RESULT_CARD_PREVIEW_PADDING_PX = 8
const SIMULATION_RESULT_CARD_PREVIEW_WIDTH_PX = 160
const SIMULATION_RESULT_CARD_PREVIEW_WIDTH_SM_PX = 192
const SIMULATION_RESULT_CARD_PREVIEW_IMAGE_HEIGHT_RATIO = 680 / 488
const SIMULATION_GAME_STATE_CARD_ENTER_ANIMATION_MS = 250
const SIMULATION_GAME_STATE_CARD_EXIT_ANIMATION_MS = 250
const SIMULATION_GAME_STATE_CARD_MOVE_ANIMATION_MS = 250
const SIMULATION_GAME_STATE_CARD_TAP_ANIMATION_MS = 250
const SIMULATION_GAME_STATE_CARD_SETTLE_FALLBACK_BUFFER_MS = 50

function SimulationFinalOutputBlock({
  cardLookup,
  finalOutput,
}: {
  cardLookup: SimulationCardLookup
  finalOutput: ParsedSimulationFinalOutput
}) {
  if (finalOutput.type === "turn") {
    return (
      <SimulationTurnActionsSurface
        cardLookup={cardLookup}
        turnActions={finalOutput.turnActions}
      />
    )
  }

  return (
    <div className={`grid gap-3 p-3 ${simulationResultChunkSurfaceClassName}`}>
      {finalOutput.type === "opening_hand" ? (
        <SimulationResultSummaryMarkdown summary={finalOutput.summary} />
      ) : (
        <SimulationReportMarkdown report={finalOutput.report} />
      )}
    </div>
  )
}

function SimulationResultSummaryMarkdown({ summary }: { summary: string }) {
  return (
    <div className={simulationResultSummaryMarkdownClassName}>
      <ReactMarkdown>{summary}</ReactMarkdown>
    </div>
  )
}

function SimulationReportMarkdown({ report }: { report: string }) {
  return (
    <div className={simulationReportMarkdownClassName}>
      <ReactMarkdown>{report}</ReactMarkdown>
    </div>
  )
}

function SimulationPresetStartingHandBlock({
  isLoadingStartingHand,
  startingHand,
  startingHandLoadError,
}: {
  isLoadingStartingHand: boolean
  startingHand: StartingHand | null
  startingHandLoadError: string | null
}) {
  const statusText = startingHand
    ? `Using preset opening hand: ${startingHand.name}.`
    : startingHandLoadError
      ? "Preset opening hand details could not be loaded."
      : isLoadingStartingHand
        ? "Loading preset opening hand..."
        : "Preset opening hand details are unavailable."

  return (
    <div className={`grid gap-3 p-3 ${simulationResultChunkSurfaceClassName}`}>
      <p className="text-sm leading-6 text-muted-foreground">{statusText}</p>

      {!startingHand && startingHandLoadError ? (
        <p
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {startingHandLoadError}
        </p>
      ) : null}
    </div>
  )
}

function SimulationTurnActionsBlock({
  cardLookup,
  turnActions,
}: {
  cardLookup: SimulationCardLookup
  turnActions: Record<TurnPhaseChange, string[]>
}) {
  const phaseEntries = TURN_PHASE_CHANGES.map((phaseChange) => ({
    phaseChange,
    actions: turnActions[phaseChange].map((action) => ({
      action,
      phaseChange: null,
    })),
  }))

  return (
    <section className="grid gap-2">
      <div className="grid gap-2">
        {phaseEntries.map(({ actions, phaseChange }) => (
          <SimulationResultTurnPhaseActionEvent
            cardLookup={cardLookup}
            key={phaseChange}
            actions={actions}
            phaseChange={phaseChange}
          />
        ))}
      </div>
    </section>
  )
}

function SimulationTurnActionsSurface({
  cardLookup,
  turnActions,
}: {
  cardLookup: SimulationCardLookup
  turnActions: Record<TurnPhaseChange, string[]>
}) {
  return (
    <SimulationTurnActionsBlock
      cardLookup={cardLookup}
      turnActions={turnActions}
    />
  )
}

function SimulationGameStatePane({
  cardLookup,
  gameState,
}: {
  cardLookup: SimulationCardLookup
  gameState: SimulationGameStateDisplay | null
}) {
  const hasRenderableGameState =
    gameState !== null &&
    (getSimulationGameStateZones(gameState.gameState).length > 0 ||
      gameState.libraryCardCount !== null)

  return (
    <aside
      className="simulation-scrollbar min-h-0 min-w-0 overflow-y-auto border-t border-border bg-background/70 lg:border-t-0 lg:border-l"
      aria-label="Game state"
    >
      <section className="grid gap-4 p-5">
        {gameState && hasRenderableGameState ? (
          <SimulationGameStateZonesBlock
            cardLookup={cardLookup}
            gameState={gameState.gameState}
            libraryCardCount={gameState.libraryCardCount}
          />
        ) : (
          <div className="grid min-h-40 place-items-center rounded-md border border-border bg-black/20 px-4 py-8 text-center text-sm text-muted-foreground">
            No game state available.
          </div>
        )}
      </section>
    </aside>
  )
}

function SimulationGameStateZonesBlock({
  cardLookup,
  gameState,
  libraryCardCount,
}: {
  cardLookup: SimulationCardLookup
  gameState: unknown
  libraryCardCount: number | null
}) {
  const zones = getSimulationGameStateZones(gameState)
  const syncSignature = getSimulationGameStateZonesCardsSignature(zones)
  const lastSettledSyncSignatureRef = useRef(syncSignature)
  const latestAnimationTargetRef = useRef({ zones })
  const gameStateElementRef = useRef<HTMLElement | null>(null)
  const cardLayoutElementsRef = useRef(new Map<string, HTMLDivElement>())
  const previousGameStateWidthRef = useRef<number | null>(null)
  const previousCardLayoutRectsRef = useRef(new Map<string, DOMRect>())
  const shouldSkipNextPositionAnimationRef = useRef(false)
  const [visibleCards, setVisibleCards] = useState<
    SimulationGameStateZoneCardPresenceItem[]
  >(() =>
    getSimulationGameStateZoneCardPresenceItems({
      isExiting: false,
      zones,
    })
  )
  const visibleCardsRef = useRef(visibleCards)
  const readCurrentCardLayoutRects = useCallback(() => {
    const nextRects = new Map<string, DOMRect>()

    for (const [cardKey, element] of cardLayoutElementsRef.current) {
      nextRects.set(cardKey, element.getBoundingClientRect())
    }

    return nextRects
  }, [])
  const handleCardLayoutElementChange = useCallback(
    (cardKey: string, element: HTMLDivElement | null) => {
      if (element) {
        cardLayoutElementsRef.current.set(cardKey, element)
        return
      }

      cardLayoutElementsRef.current.delete(cardKey)
    },
    []
  )

  useEffect(() => {
    visibleCardsRef.current = visibleCards
  }, [visibleCards])

  useEffect(() => {
    latestAnimationTargetRef.current = { zones }
  }, [zones])

  useEffect(() => {
    const gameStateElement = gameStateElementRef.current

    if (!gameStateElement) {
      return
    }

    previousGameStateWidthRef.current =
      gameStateElement.getBoundingClientRect().width

    let refreshFrameId: number | null = null

    const refreshCardLayoutBaseline = () => {
      if (refreshFrameId !== null) {
        window.cancelAnimationFrame(refreshFrameId)
      }

      refreshFrameId = window.requestAnimationFrame(() => {
        refreshFrameId = null
        previousCardLayoutRectsRef.current = readCurrentCardLayoutRects()
        shouldSkipNextPositionAnimationRef.current = false
      })
    }

    const handleGameStateWidth = (width: number) => {
      const previousWidth = previousGameStateWidthRef.current
      previousGameStateWidthRef.current = width

      if (previousWidth === null || Math.abs(width - previousWidth) < 0.5) {
        return
      }

      shouldSkipNextPositionAnimationRef.current = true
      refreshCardLayoutBaseline()
    }

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === gameStateElement) {
          handleGameStateWidth(entry.contentRect.width)
          break
        }
      }
    })

    resizeObserver.observe(gameStateElement)

    const handleWindowResize = () => {
      handleGameStateWidth(gameStateElement.getBoundingClientRect().width)
    }

    window.addEventListener("resize", handleWindowResize)

    return () => {
      resizeObserver.disconnect()
      window.removeEventListener("resize", handleWindowResize)

      if (refreshFrameId !== null) {
        window.cancelAnimationFrame(refreshFrameId)
      }
    }
  }, [readCurrentCardLayoutRects])

  useEffect(() => {
    const { zones: targetZones } = latestAnimationTargetRef.current
    const nextItems = getSimulationGameStateZoneCardPresenceItems({
      isExiting: false,
      zones: targetZones,
    })

    if (
      lastSettledSyncSignatureRef.current === syncSignature &&
      areSimulationGameStateZoneCardPresenceItemsSettled({
        currentItems: visibleCardsRef.current,
        nextItems,
      })
    ) {
      return
    }

    let syncTimeoutId: number | null = null
    let moveTimeoutId: number | null = null
    let enterPhaseTimeoutId: number | null = null
    let settleEnteredTimeoutId: number | null = null
    let settleTimeoutId: number | null = null
    let didSettle = false

    const setVisibleCardsSnapshot = (
      nextVisibleCards: SimulationGameStateZoneCardPresenceItem[]
    ) => {
      visibleCardsRef.current = nextVisibleCards
      setVisibleCards(nextVisibleCards)
    }

    const settleToTargetState = () => {
      if (didSettle) {
        return
      }

      didSettle = true
      lastSettledSyncSignatureRef.current = syncSignature
      setVisibleCardsSnapshot(nextItems)
    }

    syncTimeoutId = window.setTimeout(() => {
      const currentCards = visibleCardsRef.current
      const currentActiveCardKeys = new Set(
        currentCards
          .filter((card) => !card.isExiting && !card.isEnteringPlaceholder)
          .map((card) => card.key)
      )
      const nextCardKeys = new Set(nextItems.map((card) => card.key))
      const enteringCardKeys = new Set(
        nextItems
          .filter((item) => !currentActiveCardKeys.has(item.key))
          .map((item) => item.key)
      )
      const hasExitingCards = currentCards.some(
        (card) => !card.isEnteringPlaceholder && !nextCardKeys.has(card.key)
      )
      const hasEnteringCards = enteringCardKeys.size > 0

      const startEnterPhase = () => {
        if (didSettle) {
          return
        }

        setVisibleCardsSnapshot(
          getSimulationGameStateZoneCardEnterPhaseItems({
            enteringCardKeys,
            nextItems,
          })
        )

        settleEnteredTimeoutId = window.setTimeout(
          settleToTargetState,
          SIMULATION_GAME_STATE_CARD_ENTER_ANIMATION_MS
        )
      }

      const startMovePhase = () => {
        if (didSettle) {
          return
        }

        const movePhaseItems = getSimulationGameStateZoneCardMovePhaseItems({
          enteringCardKeys,
          nextItems,
        })

        setVisibleCardsSnapshot(movePhaseItems)

        if (!hasEnteringCards) {
          settleToTargetState()
          return
        }

        enterPhaseTimeoutId = window.setTimeout(
          startEnterPhase,
          SIMULATION_GAME_STATE_CARD_MOVE_ANIMATION_MS
        )
      }

      if (!hasExitingCards && !hasEnteringCards) {
        settleToTargetState()
        return
      }

      settleTimeoutId = window.setTimeout(
        settleToTargetState,
        getSimulationGameStateCardSettleFallbackDelay({
          hasEnteringCards,
          hasExitingCards,
        })
      )

      if (hasExitingCards) {
        setVisibleCardsSnapshot(
          getSimulationGameStateZoneCardExitPhaseItems({
            currentCards,
            nextItems,
          })
        )

        moveTimeoutId = window.setTimeout(
          startMovePhase,
          SIMULATION_GAME_STATE_CARD_EXIT_ANIMATION_MS
        )
        return
      }

      if (hasEnteringCards) {
        startMovePhase()
      }
    }, 0)

    return () => {
      if (syncTimeoutId !== null) {
        window.clearTimeout(syncTimeoutId)
      }
      if (moveTimeoutId !== null) {
        window.clearTimeout(moveTimeoutId)
      }
      if (enterPhaseTimeoutId !== null) {
        window.clearTimeout(enterPhaseTimeoutId)
      }
      if (settleEnteredTimeoutId !== null) {
        window.clearTimeout(settleEnteredTimeoutId)
      }
      if (settleTimeoutId !== null) {
        window.clearTimeout(settleTimeoutId)
      }
    }
  }, [syncSignature])

  useLayoutEffect(() => {
    const nextRects = readCurrentCardLayoutRects()

    if (shouldSkipNextPositionAnimationRef.current) {
      previousCardLayoutRectsRef.current = nextRects
      shouldSkipNextPositionAnimationRef.current = false
      return
    }

    for (const card of visibleCards) {
      if (card.isEntering || card.isExiting || card.isEnteringPlaceholder) {
        continue
      }

      const element = cardLayoutElementsRef.current.get(card.key)
      const previousRect = previousCardLayoutRectsRef.current.get(card.key)
      const nextRect = nextRects.get(card.key)

      if (!element || !previousRect || !nextRect) {
        continue
      }

      const translateX = previousRect.left - nextRect.left
      const translateY = previousRect.top - nextRect.top

      if (Math.abs(translateX) < 0.5 && Math.abs(translateY) < 0.5) {
        continue
      }

      element.style.transition = "none"
      element.style.transform = `translate(${translateX}px, ${translateY}px)`

      window.requestAnimationFrame(() => {
        element.style.transition = ""
        element.style.transform = ""
      })
    }

    previousCardLayoutRectsRef.current = nextRects
  }, [readCurrentCardLayoutRects, visibleCards])

  const visibleCardsByZone =
    getSimulationGameStateZoneCardPresenceItemsByZone(visibleCards)
  const renderZones = getSimulationGameStateRenderZones({
    visibleCards,
    zones,
  })
  const commandZone = renderZones.find((zone) => zone.key === "command") ?? null
  const standaloneZones = renderZones.filter((zone) => zone.key !== "command")
  const shouldShowLibraryCommandRow =
    libraryCardCount !== null || commandZone !== null
  const libraryCommandRowInsertIndex =
    getLibraryCommandRowInsertIndex(standaloneZones)
  const zonesBeforeLibraryCommandRow = standaloneZones.slice(
    0,
    libraryCommandRowInsertIndex
  )
  const zonesAfterLibraryCommandRow = standaloneZones.slice(
    libraryCommandRowInsertIndex
  )

  if (standaloneZones.length === 0 && !shouldShowLibraryCommandRow) {
    return null
  }

  return (
    <section
      ref={gameStateElementRef}
      className={`grid gap-3 p-3 ${simulationResultChunkSurfaceClassName}`}
    >
      {zonesBeforeLibraryCommandRow.map((zone) => (
        <SimulationGameStateZoneBlock
          key={zone.key}
          cardLookup={cardLookup}
          onCardLayoutElementChange={handleCardLayoutElementChange}
          visibleCards={visibleCardsByZone.get(zone.key) ?? []}
          zone={zone}
        />
      ))}
      {shouldShowLibraryCommandRow ? (
        <div className="flex min-w-0 flex-wrap items-start gap-3">
          {libraryCardCount !== null ? (
            <SimulationGameStateLibraryZone
              libraryCardCount={libraryCardCount}
            />
          ) : null}
          {commandZone ? (
            <SimulationGameStateZoneBlock
              isCompact={true}
              cardLookup={cardLookup}
              onCardLayoutElementChange={handleCardLayoutElementChange}
              visibleCards={visibleCardsByZone.get(commandZone.key) ?? []}
              zone={commandZone}
            />
          ) : null}
        </div>
      ) : null}
      {zonesAfterLibraryCommandRow.map((zone) => (
        <SimulationGameStateZoneBlock
          key={zone.key}
          cardLookup={cardLookup}
          onCardLayoutElementChange={handleCardLayoutElementChange}
          visibleCards={visibleCardsByZone.get(zone.key) ?? []}
          zone={zone}
        />
      ))}
    </section>
  )
}

function getLibraryCommandRowInsertIndex(
  zones: readonly SimulationGameStateZone[]
) {
  const handZoneIndex = zones.findIndex((zone) => zone.key === "hand")

  if (handZoneIndex !== -1) {
    return handZoneIndex + 1
  }

  const graveyardOrExileIndex = zones.findIndex(
    (zone) => zone.key === "graveyard" || zone.key === "exile"
  )

  return graveyardOrExileIndex === -1 ? zones.length : graveyardOrExileIndex
}

function SimulationGameStateZoneBlock({
  cardLookup,
  isCompact = false,
  onCardLayoutElementChange,
  visibleCards,
  zone,
}: {
  cardLookup: SimulationCardLookup
  isCompact?: boolean
  onCardLayoutElementChange: (
    cardKey: string,
    element: HTMLDivElement | null
  ) => void
  visibleCards: SimulationGameStateZoneCardPresenceItem[]
  zone: SimulationGameStateZone
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {zone.label}
      </p>
      <SimulationGameStateZoneCardGrid
        cardLookup={cardLookup}
        isCompact={isCompact}
        onCardLayoutElementChange={onCardLayoutElementChange}
        visibleCards={visibleCards}
      />
    </div>
  )
}

function SimulationGameStateLibraryZone({
  libraryCardCount,
}: {
  libraryCardCount: number
}) {
  return (
    <div className="w-[5.5rem] min-w-0 sm:w-[6.25rem] 2xl:w-[7rem]">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Library ({libraryCardCount})
      </p>
      <div className="mt-2 min-w-0">
        {libraryCardCount > 0 ? (
          <img
            className="block aspect-[488/680] w-full min-w-0 rounded-[5.75%/4.4%] border border-border bg-black/40 object-cover shadow-lg shadow-black/20 select-none"
            src="/card_back.webp"
            alt={`${libraryCardCount} ${
              libraryCardCount === 1 ? "card" : "cards"
            } in library`}
            draggable={false}
          />
        ) : (
          <SimulationGameStateEmptyCardPlaceholder />
        )}
      </div>
    </div>
  )
}

function SimulationGameStateZoneCardGrid({
  cardLookup,
  isCompact = false,
  onCardLayoutElementChange,
  visibleCards,
}: {
  cardLookup: SimulationCardLookup
  isCompact?: boolean
  onCardLayoutElementChange: (
    cardKey: string,
    element: HTMLDivElement | null
  ) => void
  visibleCards: SimulationGameStateZoneCardPresenceItem[]
}) {
  return (
    <div
      className={
        isCompact
          ? "mt-2 grid min-w-0 auto-cols-[5.5rem] grid-flow-col gap-3 sm:auto-cols-[6.25rem] 2xl:auto-cols-[7rem]"
          : "mt-2 grid min-w-0 grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-3 sm:grid-cols-[repeat(auto-fill,minmax(6.25rem,1fr))] 2xl:grid-cols-[repeat(auto-fill,minmax(7rem,1fr))]"
      }
    >
      {visibleCards.length === 0 ? (
        <SimulationGameStateEmptyCardPlaceholder />
      ) : (
        visibleCards.map((card) => (
          <div
            key={card.key}
            ref={(element) => {
              onCardLayoutElementChange(card.key, element)
            }}
            className="simulation-game-state-card-layout"
          >
            {card.isEnteringPlaceholder ? (
              <SimulationGameStateEnteringCardPlaceholder />
            ) : (
              <div
                className={
                  card.isExiting
                    ? "simulation-game-state-card-presence simulation-game-state-card-exit"
                    : card.isEntering
                      ? "simulation-game-state-card-presence simulation-game-state-card-enter"
                      : "simulation-game-state-card-presence"
                }
              >
                <SimulationGameStateZoneCardView
                  card={card.card}
                  cardLookup={cardLookup}
                />
              </div>
            )}
          </div>
        ))
      )}
    </div>
  )
}

function SimulationGameStateEmptyCardPlaceholder() {
  return (
    <div
      className="flex aspect-[488/680] min-w-0 items-center justify-center rounded-[5.75%/4.4%] border border-dashed border-border bg-black/20 px-2 text-center text-xs font-semibold tracking-wide text-muted-foreground uppercase shadow-lg shadow-black/10 select-none"
      aria-label="Empty zone"
    >
      empty
    </div>
  )
}

function SimulationGameStateEnteringCardPlaceholder() {
  return (
    <div
      className="aspect-[488/680] min-w-0 rounded-[5.75%/4.4%] opacity-0 select-none"
      aria-hidden="true"
    />
  )
}

function SimulationGameStateZoneCardView({
  card,
  cardLookup,
}: {
  card: SimulationGameStateZoneCard
  cardLookup: SimulationCardLookup
}) {
  const isTapped = card.tapped === true
  const previousIsTappedRef = useRef(isTapped)
  const [visualTapState, setVisualTapState] = useState<
    "tapped" | "untapping" | "untapped"
  >(() => (isTapped ? "tapped" : "untapped"))
  const resolvedCard = resolveSimulationCard(cardLookup, card.name)
  const href = resolvedCard?.scryfallUri.trim() || null
  const imageUrl = href ? resolvedCard?.defaultImageUrl?.trim() || null : null
  const shouldShowTapOverlay = visualTapState !== "untapped"
  const title = getSimulationGameStateZoneCardTitle(card)

  useEffect(() => {
    if (previousIsTappedRef.current === isTapped) {
      return
    }

    previousIsTappedRef.current = isTapped

    let finishUntapTimeoutId: number | null = null
    const updateTapStateTimeoutId = window.setTimeout(() => {
      if (isTapped) {
        setVisualTapState("tapped")
        return
      }

      setVisualTapState("untapping")

      finishUntapTimeoutId = window.setTimeout(() => {
        setVisualTapState("untapped")
      }, SIMULATION_GAME_STATE_CARD_TAP_ANIMATION_MS)
    }, 0)

    return () => {
      window.clearTimeout(updateTapStateTimeoutId)
      if (finishUntapTimeoutId !== null) {
        window.clearTimeout(finishUntapTimeoutId)
      }
    }
  }, [isTapped])

  const content = (
    <>
      {imageUrl ? (
        <img
          className="block aspect-[488/680] w-full object-cover"
          src={imageUrl}
          alt={card.name}
          loading="lazy"
        />
      ) : (
        <span className="flex aspect-[488/680] w-full items-center justify-center bg-gradient-to-b from-sky-950/35 to-black/50 px-2 text-center text-xs leading-4 font-semibold break-words text-sky-50">
          {card.name}
        </span>
      )}
      {shouldShowTapOverlay ? (
        <>
          <span
            className={`simulation-game-state-card-tap-dim pointer-events-none absolute inset-0 bg-black/35 ${
              visualTapState === "untapping"
                ? "simulation-game-state-card-tap-overlay-exit"
                : "simulation-game-state-card-tap-overlay-enter"
            }`}
            aria-hidden="true"
          />
          <span
            className={`simulation-game-state-card-tap-icon pointer-events-none absolute inset-0 grid place-items-center text-sky-50/95 drop-shadow-[0_0.25rem_0.75rem_rgba(0,0,0,0.85)] ${
              visualTapState === "untapping"
                ? "simulation-game-state-card-tap-overlay-exit"
                : "simulation-game-state-card-tap-overlay-enter"
            }`}
            aria-hidden="true"
          >
            <img
              className="size-[72%] object-contain opacity-65 brightness-0 invert select-none"
              src={tapIconUrl}
              alt=""
              draggable={false}
            />
          </span>
        </>
      ) : null}
    </>
  )
  const className = [
    "relative block min-w-0 overflow-hidden rounded-[5.75%/4.4%] border border-border bg-black/40 shadow-lg shadow-black/20 outline-none focus-visible:ring-2 focus-visible:ring-sky-400",
    visualTapState === "tapped" ? "simulation-game-state-card-tapped" : null,
    visualTapState === "untapping"
      ? "simulation-game-state-card-untapping"
      : null,
  ]
    .filter(Boolean)
    .join(" ")

  if (href) {
    return (
      <a
        className={className}
        href={href}
        target="_blank"
        rel="noreferrer"
        title={title}
      >
        {content}
      </a>
    )
  }

  return (
    <div className={className} title={title}>
      {content}
    </div>
  )
}

function getSimulationGameStateCardSettleFallbackDelay({
  hasEnteringCards,
  hasExitingCards,
}: {
  hasEnteringCards: boolean
  hasExitingCards: boolean
}) {
  return (
    (hasExitingCards ? SIMULATION_GAME_STATE_CARD_EXIT_ANIMATION_MS : 0) +
    (hasEnteringCards
      ? SIMULATION_GAME_STATE_CARD_MOVE_ANIMATION_MS +
        SIMULATION_GAME_STATE_CARD_ENTER_ANIMATION_MS
      : 0) +
    SIMULATION_GAME_STATE_CARD_SETTLE_FALLBACK_BUFFER_MS
  )
}

function areSimulationGameStateZoneCardPresenceItemsSettled({
  currentItems,
  nextItems,
}: {
  currentItems: readonly SimulationGameStateZoneCardPresenceItem[]
  nextItems: readonly SimulationGameStateZoneCardPresenceItem[]
}) {
  if (currentItems.length !== nextItems.length) {
    return false
  }

  return currentItems.every((currentItem, index) => {
    const nextItem = nextItems[index]

    return (
      nextItem !== undefined &&
      !currentItem.isEntering &&
      !currentItem.isEnteringPlaceholder &&
      !currentItem.isExiting &&
      getSimulationGameStateZoneCardPresenceItemSignature(currentItem) ===
        getSimulationGameStateZoneCardPresenceItemSignature(nextItem)
    )
  })
}

function getSimulationGameStateZoneCardPresenceItemSignature(
  item: SimulationGameStateZoneCardPresenceItem
) {
  return [
    item.key,
    item.card.zoneKey,
    String(item.card.index),
    item.card.name,
    String(item.card.tapped),
    item.card.notes ?? "",
  ].join("\u001f")
}

function getSimulationGameStateZoneCardPresenceItems({
  isExiting,
  zones,
}: {
  isExiting: boolean
  zones: readonly SimulationGameStateZone[]
}): SimulationGameStateZoneCardPresenceItem[] {
  const cardNameCounts = new Map<string, number>()

  return zones.flatMap((zone) =>
    zone.cards.map((card) => {
      const cardNameKey = getSimulationGameStateZoneCardNameKey(card)
      const copyIndex = cardNameCounts.get(cardNameKey) ?? 0

      cardNameCounts.set(cardNameKey, copyIndex + 1)

      return {
        card,
        isEntering: false,
        isEnteringPlaceholder: false,
        isExiting,
        key: getSimulationGameStateZoneCardKey(card, copyIndex),
      }
    })
  )
}

function getSimulationGameStateZoneCardPresenceItemsByZone(
  items: readonly SimulationGameStateZoneCardPresenceItem[]
) {
  const itemsByZone = new Map<
    string,
    SimulationGameStateZoneCardPresenceItem[]
  >()

  for (const item of items) {
    const zoneItems = itemsByZone.get(item.card.zoneKey) ?? []
    zoneItems.push(item)
    itemsByZone.set(item.card.zoneKey, zoneItems)
  }

  return itemsByZone
}

function getSimulationGameStateRenderZones({
  visibleCards,
  zones,
}: {
  visibleCards: readonly SimulationGameStateZoneCardPresenceItem[]
  zones: readonly SimulationGameStateZone[]
}) {
  const zonesByKey = new Map(zones.map((zone) => [zone.key, zone]))

  for (const item of visibleCards) {
    if (!zonesByKey.has(item.card.zoneKey)) {
      zonesByKey.set(item.card.zoneKey, {
        cards: [],
        key: item.card.zoneKey,
        label: getSimulationGameStateZoneLabel(item.card.zoneKey),
      })
    }
  }

  const zoneKeys = Array.from(zonesByKey.keys())
  const zoneKeySet = new Set(zoneKeys)
  const orderedZoneKeys = [
    ...GAME_STATE_ZONE_ORDER.filter((zoneKey) => zoneKeySet.has(zoneKey)),
    ...zoneKeys.filter(
      (zoneKey) =>
        !GAME_STATE_ZONE_ORDER.includes(
          zoneKey as (typeof GAME_STATE_ZONE_ORDER)[number]
        )
    ),
  ]

  return orderedZoneKeys.flatMap((zoneKey) => zonesByKey.get(zoneKey) ?? [])
}

function getSimulationGameStateZoneCardExitPhaseItems({
  currentCards,
  nextItems,
}: {
  currentCards: readonly SimulationGameStateZoneCardPresenceItem[]
  nextItems: readonly SimulationGameStateZoneCardPresenceItem[]
}): SimulationGameStateZoneCardPresenceItem[] {
  const nextItemsByKey = new Map(nextItems.map((item) => [item.key, item]))

  return currentCards.flatMap((item) => {
    const nextItem = nextItemsByKey.get(item.key)

    if (item.isEnteringPlaceholder) {
      return nextItem
        ? [{ ...nextItem, isEntering: false, isEnteringPlaceholder: true }]
        : []
    }

    if (nextItem) {
      if (item.card.zoneKey !== nextItem.card.zoneKey) {
        return [
          {
            ...item,
            isEntering: false,
            isEnteringPlaceholder: false,
            isExiting: false,
          },
        ]
      }

      return [nextItem]
    }

    return [
      item.isExiting
        ? item
        : {
            ...item,
            isEntering: false,
            isEnteringPlaceholder: false,
            isExiting: true,
          },
    ]
  })
}

function getSimulationGameStateZoneCardMovePhaseItems({
  enteringCardKeys,
  nextItems,
}: {
  enteringCardKeys: ReadonlySet<string>
  nextItems: readonly SimulationGameStateZoneCardPresenceItem[]
}): SimulationGameStateZoneCardPresenceItem[] {
  return nextItems.map((item) =>
    enteringCardKeys.has(item.key)
      ? {
          ...item,
          isEntering: false,
          isEnteringPlaceholder: true,
        }
      : item
  )
}

function getSimulationGameStateZoneCardEnterPhaseItems({
  enteringCardKeys,
  nextItems,
}: {
  enteringCardKeys: ReadonlySet<string>
  nextItems: readonly SimulationGameStateZoneCardPresenceItem[]
}): SimulationGameStateZoneCardPresenceItem[] {
  return nextItems.map((item) =>
    enteringCardKeys.has(item.key)
      ? {
          ...item,
          isEntering: true,
          isEnteringPlaceholder: false,
        }
      : item
  )
}

function getSimulationGameStateZoneCardKey(
  card: SimulationGameStateZoneCard,
  copyIndex: number
) {
  return `${getSimulationGameStateZoneCardNameKey(card)}-${copyIndex}`
}

function getSimulationGameStateZoneCardNameKey(
  card: SimulationGameStateZoneCard
) {
  return card.name.trim().toLocaleLowerCase()
}

function getSimulationGameStateZonesCardsSignature(
  zones: readonly SimulationGameStateZone[]
) {
  return getSimulationGameStateZoneCardPresenceItems({
    isExiting: false,
    zones,
  })
    .map((item) =>
      [
        item.key,
        item.card.zoneKey,
        String(item.card.index),
        item.card.name,
        String(item.card.tapped),
        item.card.notes ?? "",
      ].join("\u001f")
    )
    .join("\u001e")
}

function getSimulationGameStateZones(
  gameState: unknown
): SimulationGameStateZone[] {
  const gameStateRecord = getSimulationUnknownRecord(gameState)
  const zonesRecord = getSimulationUnknownRecord(gameStateRecord?.zones)

  if (!zonesRecord) {
    return []
  }

  const zoneKeys = Object.keys(zonesRecord).filter(
    (zoneKey) => zoneKey !== "library" && Array.isArray(zonesRecord[zoneKey])
  )
  const zoneKeySet = new Set(zoneKeys)
  const orderedZoneKeys = [
    ...GAME_STATE_ZONE_ORDER.filter((zoneKey) => zoneKeySet.has(zoneKey)),
    ...zoneKeys.filter(
      (zoneKey) =>
        !GAME_STATE_ZONE_ORDER.includes(
          zoneKey as (typeof GAME_STATE_ZONE_ORDER)[number]
        )
    ),
  ]

  return orderedZoneKeys.map((zoneKey) => ({
    cards: getSimulationGameStateZoneCards(zonesRecord[zoneKey], zoneKey),
    key: zoneKey,
    label: getSimulationGameStateZoneLabel(zoneKey),
  }))
}

function getSimulationGameStateZoneCards(
  value: unknown,
  zoneKey: string
): SimulationGameStateZoneCard[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap((card, index) => {
    const cardRecord = getSimulationUnknownRecord(card)

    if (!cardRecord) {
      return []
    }

    const name = cardRecord.name

    if (typeof name !== "string" || !name.trim()) {
      return []
    }

    const notes = cardRecord.notes

    return [
      {
        index,
        name: name.trim(),
        notes: typeof notes === "string" && notes.trim() ? notes.trim() : null,
        tapped:
          typeof cardRecord.tapped === "boolean" ? cardRecord.tapped : null,
        zoneKey,
      },
    ]
  })
}

function getSimulationUnknownRecord(
  value: unknown
): Record<string, unknown> | null {
  return hasGameState(value) ? value : null
}

function getSimulationGameStateZoneLabel(zoneKey: string) {
  const knownLabel = GAME_STATE_ZONE_LABELS[zoneKey]

  if (knownLabel) {
    return knownLabel
  }

  return zoneKey
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function getSimulationGameStateZoneCardTitle(
  card: SimulationGameStateZoneCard
) {
  const details = [
    card.tapped === true ? "tapped" : card.tapped === false ? "untapped" : null,
    card.notes,
  ].filter(Boolean)

  return details.length > 0
    ? `${card.name} (${details.join(" / ")})`
    : card.name
}

function getSimulationRunGameStateDisplay(
  run: Pick<
    SimulationDebugLlmRun,
    "chunks" | "gameState" | "librarySnapshot" | "phase"
  > | null,
  commanders: readonly DeckCard[]
): SimulationGameStateDisplay | null {
  if (!run) {
    return null
  }

  const finalOutput = getSimulationFinalParsedOutput(run)

  if (run.phase === "opening_hand") {
    if (finalOutput?.type !== "opening_hand") {
      return null
    }

    return getOpeningHandGameStateDisplay(
      getCommanderCardNames(commanders),
      finalOutput.keptHand,
      getSimulationRunLibraryCardCount(run)
    )
  }

  if (run.phase !== "turn") {
    return null
  }

  const gameState =
    finalOutput?.type === "turn" ? finalOutput.gameState : run.gameState

  if (!hasGameState(gameState)) {
    return null
  }

  return {
    gameState,
    libraryCardCount: getSimulationRunLibraryCardCount(run),
  }
}

function getStartingHandGameStateDisplay(
  startingHand: StartingHand | null,
  deckCards: readonly DeckCard[],
  commanders: readonly DeckCard[]
): SimulationGameStateDisplay | null {
  if (!startingHand) {
    return null
  }

  return getOpeningHandGameStateDisplay(
    getCommanderCardNames(commanders),
    getStartingHandCardNames(startingHand),
    getPresetStartingHandLibraryCardCount({
      deckCards,
      startingHand,
    })
  )
}

function getOpeningHandGameStateDisplay(
  commandCards: readonly string[],
  handCards: readonly string[],
  libraryCardCount: number | null
): SimulationGameStateDisplay {
  return {
    gameState: {
      zones: {
        battlefield: [],
        hand: getOpeningHandGameStateCards(handCards),
        command: getOpeningHandGameStateCards(commandCards),
        graveyard: [],
        exile: [],
      },
    },
    libraryCardCount,
  }
}

function getOpeningHandGameStateCards(cardNames: readonly string[]) {
  return cardNames.map((cardName) => ({
    name: cardName,
    notes: null,
    tapped: null,
  }))
}

function SimulationResultLoggedTurnActionEvent({
  actions,
  cardLookup,
}: {
  actions: LoggedTurnAction[]
  cardLookup: SimulationCardLookup
}) {
  if (actions.length === 1 && actions[0].phaseChange !== null) {
    return (
      <SimulationResultPhaseChangeEvent
        action={actions[0]}
        cardLookup={cardLookup}
      />
    )
  }

  return (
    <div className={`grid gap-2 p-2 ${simulationResultChunkSurfaceClassName}`}>
      {actions.length > 0 ? (
        <ul className="list-disc space-y-1 pl-4 text-sm leading-6 text-foreground/90">
          {actions.map((action, index) => (
            <li key={`${action.action}-${index}`}>
              <SimulationLoggedActionText
                cardLookup={cardLookup}
                text={action.action}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm leading-6 text-muted-foreground">
          No turn action details were reported.
        </p>
      )}
    </div>
  )
}

function SimulationLoggedActionText({
  cardLookup,
  text,
}: {
  cardLookup: SimulationCardLookup
  text: string
}) {
  return getSimulationLoggedActionTextTokens(text).map((token, index) => {
    if (token.type === "text") {
      return <Fragment key={`${token.text}-${index}`}>{token.text}</Fragment>
    }

    if (token.type === "mana") {
      return (
        <span
          key={`${token.text}-${index}`}
          aria-label={token.text}
          className={`ms ms-cost ms-shadow ms-${token.className} simulation-mana-symbol`}
          role="img"
          title={token.text}
        />
      )
    }

    const resolvedCard = resolveSimulationCard(cardLookup, token.cardName)
    const href = resolvedCard?.scryfallUri.trim() || null
    const imageUrl = href ? resolvedCard?.defaultImageUrl?.trim() || null : null

    return (
      <SimulationResultCardPill
        key={`${token.cardName}-${index}`}
        href={href}
        imageUrl={imageUrl}
        label={token.cardName}
        title={
          resolvedCard
            ? resolvedCard.name
            : `${token.cardName} could not be resolved from this deck.`
        }
      />
    )
  })
}

type SimulationLoggedActionTextToken =
  | {
      text: string
      type: "text"
    }
  | {
      className: string
      text: string
      type: "mana"
    }
  | {
      cardName: string
      type: "card"
    }

function getSimulationLoggedActionTextTokens(
  text: string
): SimulationLoggedActionTextToken[] {
  const tokens: SimulationLoggedActionTextToken[] = []
  let index = 0

  while (index < text.length) {
    const manaToken = findNextManaSymbolToken(text, index)
    const cardToken = findNextActionCardToken(text, index)
    const nextToken =
      cardToken !== null &&
      (manaToken === null || cardToken.startIndex < manaToken.startIndex)
        ? cardToken
        : manaToken

    if (nextToken === null) {
      tokens.push({
        text: text.slice(index),
        type: "text",
      })
      break
    }

    if (nextToken.startIndex > index) {
      tokens.push({
        text: text.slice(index, nextToken.startIndex),
        type: "text",
      })
    }

    if (nextToken.type === "mana") {
      tokens.push({
        className: nextToken.className,
        text: nextToken.text,
        type: "mana",
      })
    } else {
      tokens.push({
        cardName: nextToken.cardName,
        type: "card",
      })
    }

    index = nextToken.endIndex
  }

  return tokens
}

function findNextManaSymbolToken(text: string, startIndex: number) {
  MANA_SYMBOL_TEXT_PATTERN.lastIndex = startIndex

  while (true) {
    const match = MANA_SYMBOL_TEXT_PATTERN.exec(text)

    if (match === null) {
      return null
    }

    const symbolText = match[0]
    const className = getManaSymbolClassName(symbolText)

    if (className !== null) {
      return {
        className,
        endIndex: match.index + symbolText.length,
        startIndex: match.index,
        text: symbolText,
        type: "mana" as const,
      }
    }
  }
}

function findNextActionCardToken(text: string, startIndex: number) {
  let searchIndex = startIndex

  while (searchIndex < text.length) {
    const cardStartIndex = findNextSingleAsteriskIndex(text, searchIndex)

    if (cardStartIndex === -1) {
      return null
    }

    const cardEndIndex = findNextSingleAsteriskIndex(text, cardStartIndex + 1)

    if (cardEndIndex === -1) {
      return null
    }

    const cardName = text.slice(cardStartIndex + 1, cardEndIndex).trim()

    if (cardName && !cardName.includes("*")) {
      return {
        cardName,
        endIndex: cardEndIndex + 1,
        startIndex: cardStartIndex,
        type: "card" as const,
      }
    }

    searchIndex = cardEndIndex + 1
  }

  return null
}

function findNextSingleAsteriskIndex(text: string, startIndex: number) {
  for (let index = startIndex; index < text.length; index += 1) {
    if (
      text[index] === "*" &&
      text[index - 1] !== "*" &&
      text[index + 1] !== "*"
    ) {
      return index
    }
  }

  return -1
}

function getManaSymbolClassName(text: string) {
  const textWithoutBraces = text.match(/^\{([^{}]+)\}$/)?.[1]

  if (textWithoutBraces === undefined) {
    return null
  }

  const normalizedText = normalizeManaSymbolText(textWithoutBraces)

  return MANA_SYMBOL_CLASS_NAMES.has(normalizedText) ? normalizedText : null
}

function normalizeManaSymbolText(text: string) {
  switch (text.toUpperCase()) {
    case "T":
      return "tap"
    case "Q":
      return "untap"
    case "CHAOS":
      return "chaos"
    case "\u221e":
      return "infinity"
    case "\u00bd":
      return "1-2"
    default:
      return text.toLowerCase().replaceAll("/", "")
  }
}

function SimulationResultPhaseChangeEvent({
  action,
  cardLookup,
}: {
  action: LoggedTurnAction
  cardLookup: SimulationCardLookup
}) {
  const phaseChange = action.phaseChange

  if (phaseChange === null) {
    return (
      <SimulationResultLoggedTurnActionEvent
        actions={[action]}
        cardLookup={cardLookup}
      />
    )
  }

  return (
    <SimulationResultTurnPhaseActionEvent
      actions={[]}
      cardLookup={cardLookup}
      phaseChange={phaseChange}
    />
  )
}

function SimulationResultTurnPhaseActionEvent({
  actions,
  cardLookup,
  phaseChange,
}: {
  actions: LoggedTurnAction[]
  cardLookup: SimulationCardLookup
  phaseChange: TurnPhaseChange
}) {
  return (
    <div
      className={`grid gap-2 px-2 py-1.5 ${simulationResultChunkSurfaceClassName}`}
    >
      <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-sky-100">
        <span
          className="flex size-5 shrink-0 items-center justify-center text-sky-300"
          aria-hidden="true"
        >
          {getTurnPhaseChangeIcon(phaseChange)}
        </span>
        <span className="min-w-0 truncate">
          {getTurnPhaseChangeLabel(phaseChange)}
        </span>
      </div>
      {actions.length > 0 ? (
        <ul className="list-disc space-y-1 pl-6 text-sm leading-6 text-foreground/90">
          {actions.map((action, index) => (
            <li key={`${action.action}-${index}`}>
              <SimulationLoggedActionText
                cardLookup={cardLookup}
                text={action.action}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function getTurnPhaseChangeIcon(phaseChange: TurnPhaseChange) {
  switch (phaseChange) {
    case "untap":
      return <RotateCcw className="size-4" />
    case "upkeep":
      return <Hourglass className="size-4" />
    case "draw":
      return <Hand className="size-4" />
    case "precombat_main":
      return <Sunrise className="size-4" />
    case "combat":
      return <Swords className="size-4" />
    case "postcombat_main":
      return <Sunset className="size-4" />
    case "end_step_cleanup":
      return <Moon className="size-4" />
  }
}

function getTurnPhaseChangeLabel(phaseChange: TurnPhaseChange) {
  switch (phaseChange) {
    case "untap":
      return "Moved to untap step"
    case "upkeep":
      return "Moved to upkeep step"
    case "draw":
      return "Moved to draw step"
    case "precombat_main":
      return "Moved to precombat main phase"
    case "combat":
      return "Moved to combat phase"
    case "postcombat_main":
      return "Moved to postcombat main phase"
    case "end_step_cleanup":
      return "Moved to end step and cleanup"
  }
}

function SimulationResultEvent({
  cardLookup,
  chunk,
}: {
  cardLookup: SimulationCardLookup
  chunk: SimulationDebugLlmRunChunk
}) {
  if (chunk.kind === "mcp_call_start") {
    const title =
      getKnownSimulationResultToolLabelForChunk({
        chunk,
        state: "started",
      }) ?? `Tool started: ${chunk.mcpFunctionName ?? "unknown tool"}`

    return (
      <SimulationResultToolLabelEvent
        title={title}
        reason={getSimulationResultToolReasonForChunk({ chunk })}
      />
    )
  }

  if (chunk.kind === "mcp_call_complete") {
    const cardNames = getSimulationResultToolCardNames(chunk)

    if (cardNames.length > 0 && !isMcpCallFailure(chunk)) {
      return (
        <SimulationResultCompletedCardToolEvent
          cardLookup={cardLookup}
          cardNames={cardNames}
          chunk={chunk}
        />
      )
    }

    return (
      <SimulationResultToolLabelEvent
        icon={getMcpCallCompleteIcon(chunk)}
        title={getMcpCallCompleteTitle(chunk)}
        reason={getSimulationResultToolReasonForChunk({ chunk })}
      />
    )
  }

  if (chunk.kind === "error") {
    return (
      <details className={simulationResultChunkSurfaceClassName}>
        <summary className={simulationResultChunkSummaryClassName}>
          Simulation event failed
        </summary>
        <pre className={simulationResultChunkPreClassName}>
          {formatResultEventPayload(chunk.payload)}
        </pre>
      </details>
    )
  }

  if (chunk.kind === "cancelled") {
    return (
      <div
        className={`${simulationResultChunkSurfaceClassName} px-3 py-2 text-sm text-muted-foreground`}
      >
        Simulation cancelled: {getPayloadMessage(chunk.payload)}
      </div>
    )
  }

  return (
    <details className={simulationResultChunkSurfaceClassName}>
      <summary className={simulationResultChunkSummaryClassName}>
        {getDebugChunkEventLabel(chunk)}
      </summary>
      <pre className={simulationResultChunkPreClassName}>
        {JSON.stringify(chunk, null, 2)}
      </pre>
    </details>
  )
}

function isCountedReportRun(
  run: SimulationResultsInfo["reportLlmRuns"][number]
) {
  return (
    run.outdated !== true &&
    (isActiveLlmRunStatus(run.status) ||
      run.status === "failed" ||
      run.status === "cancelled" ||
      (run.status === "completed" && Boolean(run.report?.trim())))
  )
}

function SimulationResultToolLabelEvent({
  icon,
  reason,
  title,
}: {
  icon?: ReactNode
  reason?: string | null
  title: string
}) {
  return (
    <div
      className={`${simulationResultChunkSurfaceClassName} flex min-w-0 items-start gap-2 px-3 py-2 text-sm text-muted-foreground`}
    >
      {icon ? (
        <span className="mt-0.5 shrink-0 text-sky-300" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span className="grid min-w-0 flex-1 gap-1">
        <span className="min-w-0 truncate">{title}</span>
        <SimulationResultToolReasonText reason={reason ?? null} />
      </span>
    </div>
  )
}

function SimulationResultToolReasonText({ reason }: { reason: string | null }) {
  if (reason === null) {
    return null
  }

  return (
    <span className="text-xs leading-5 break-words text-muted-foreground/80">
      {reason}
    </span>
  )
}

function SimulationResultCompletedCardToolEvent({
  cardLookup,
  cardNames,
  chunk,
}: {
  cardLookup: SimulationCardLookup
  cardNames: readonly string[]
  chunk: SimulationDebugLlmRunChunk
}) {
  const [showCardImages, setShowCardImages] = useState(false)

  return (
    <div className={simulationResultChunkSurfaceClassName}>
      <div className="grid gap-1 px-3 py-2 text-muted-foreground">
        <p className="text-sm">{getMcpCallCompleteTitle(chunk)}</p>
        <SimulationResultToolReasonText
          reason={getSimulationResultToolReasonForChunk({ chunk })}
        />
      </div>
      <div className="grid gap-3 border-t border-border p-3">
        <div className="flex min-w-0 flex-wrap items-start gap-2">
          {showSimulationResultCardImageToggle ? (
            <Button
              className="shrink-0 border-emerald-500/30 bg-emerald-950/20 text-emerald-100 hover:bg-emerald-900/35 hover:text-emerald-50"
              size="xs"
              type="button"
              variant="outline"
              onClick={() => setShowCardImages((currentValue) => !currentValue)}
            >
              {showCardImages ? <EyeOff /> : <Eye />}
              {showCardImages ? "Hide cards" : "Show cards"}
            </Button>
          ) : null}
          {!showCardImages ? (
            <SimulationResultCardTextLinks
              cardLookup={cardLookup}
              cardNames={cardNames}
            />
          ) : null}
        </div>

        {showCardImages ? (
          <SimulationResultCardImageLinks
            cardLookup={cardLookup}
            cardNames={cardNames}
          />
        ) : null}
      </div>
    </div>
  )
}

function SimulationResultCardTextLinks({
  cardLookup,
  cardNames,
}: {
  cardLookup: SimulationCardLookup
  cardNames: readonly string[]
}) {
  return (
    <div className="flex w-max max-w-full min-w-0 shrink-0 flex-wrap items-center gap-2">
      {cardNames.map((cardName, index) => {
        const resolvedCard = resolveSimulationCard(cardLookup, cardName)
        const href = resolvedCard?.scryfallUri.trim() || null
        const imageUrl = href
          ? resolvedCard?.defaultImageUrl?.trim() || null
          : null
        const label = resolvedCard?.name ?? cardName

        return (
          <SimulationResultCardPill
            key={`${cardName}-${index}`}
            href={href}
            imageUrl={imageUrl}
            label={label}
            title={
              resolvedCard
                ? resolvedCard.name
                : `${cardName} could not be resolved from this deck.`
            }
          />
        )
      })}
    </div>
  )
}

function SimulationResultCardPill({
  href,
  imageUrl,
  label,
  title,
}: {
  href: string | null
  imageUrl?: string | null
  label: string
  title: string
}) {
  const [isPreviewVisible, setIsPreviewVisible] = useState(false)
  const [previewPosition, setPreviewPosition] =
    useState<SimulationResultCardPreviewPosition | null>(null)
  const previewTriggerRef = useRef<HTMLSpanElement | null>(null)
  const content = <span className="block truncate">{label}</span>
  const trimmedImageUrl = imageUrl?.trim() || null
  const baseClassName =
    "inline-flex max-w-full items-center rounded-full border px-2.5 py-1 text-xs font-medium align-baseline"

  useLayoutEffect(() => {
    if (!isPreviewVisible || !trimmedImageUrl) {
      return
    }

    function updatePreviewPosition() {
      const triggerElement = previewTriggerRef.current

      if (!triggerElement) {
        setPreviewPosition(null)
        return
      }

      setPreviewPosition(
        getSimulationResultCardPreviewPosition(
          triggerElement.getBoundingClientRect()
        )
      )
    }

    updatePreviewPosition()
    window.addEventListener("resize", updatePreviewPosition)
    window.addEventListener("scroll", updatePreviewPosition, true)

    return () => {
      window.removeEventListener("resize", updatePreviewPosition)
      window.removeEventListener("scroll", updatePreviewPosition, true)
    }
  }, [isPreviewVisible, trimmedImageUrl])

  function hidePreview() {
    setIsPreviewVisible(false)
    setPreviewPosition(null)
  }

  if (!href) {
    return (
      <span
        aria-disabled="true"
        className={`${baseClassName} cursor-default border-sky-500/15 bg-sky-950/15 text-sky-100/55`}
        title={title}
      >
        {content}
      </span>
    )
  }

  const link = (
    <a
      className={`${baseClassName} border-sky-500/30 bg-sky-950/30 text-sky-100 transition-colors hover:border-sky-300/60 hover:bg-sky-900/40 hover:text-sky-50 focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:outline-none`}
      href={href}
      target="_blank"
      rel="noreferrer"
      title={title}
      onBlur={hidePreview}
      onClick={(event) => {
        hidePreview()
        event.currentTarget.blur()
      }}
      onFocus={() => setIsPreviewVisible(true)}
    >
      {content}
    </a>
  )

  if (!trimmedImageUrl) {
    return link
  }

  return (
    <>
      <span
        ref={previewTriggerRef}
        className="inline-flex max-w-full align-baseline"
        onMouseEnter={() => setIsPreviewVisible(true)}
        onMouseLeave={hidePreview}
      >
        {link}
      </span>
      {isPreviewVisible && previewPosition
        ? createPortal(
            <span
              className={`pointer-events-none fixed z-50 rounded-[5.75%/4.4%] bg-black/80 p-1 shadow-2xl shadow-black/70 ${
                previewPosition.placement === "above"
                  ? "origin-bottom"
                  : "origin-top"
              }`}
              style={{
                left: previewPosition.left,
                top: previewPosition.top,
                width: previewPosition.width,
              }}
              aria-hidden="true"
            >
              <img
                className="block aspect-[488/680] w-full rounded-[4.75%/3.4%] object-cover"
                src={trimmedImageUrl}
                alt=""
                loading="lazy"
              />
            </span>,
            document.body
          )
        : null}
    </>
  )
}

function getSimulationResultCardPreviewPosition(
  triggerRect: DOMRect
): SimulationResultCardPreviewPosition {
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const previewWidth = window.matchMedia("(min-width: 640px)").matches
    ? SIMULATION_RESULT_CARD_PREVIEW_WIDTH_SM_PX
    : SIMULATION_RESULT_CARD_PREVIEW_WIDTH_PX
  const previewContentWidth =
    previewWidth - SIMULATION_RESULT_CARD_PREVIEW_PADDING_PX
  const previewHeight =
    previewContentWidth * SIMULATION_RESULT_CARD_PREVIEW_IMAGE_HEIGHT_RATIO +
    SIMULATION_RESULT_CARD_PREVIEW_PADDING_PX
  const spaceBelow =
    viewportHeight -
    triggerRect.bottom -
    SIMULATION_RESULT_CARD_PREVIEW_MARGIN_PX
  const spaceAbove = triggerRect.top - SIMULATION_RESULT_CARD_PREVIEW_MARGIN_PX
  const placement =
    spaceBelow >= previewHeight || spaceBelow >= spaceAbove ? "below" : "above"
  const preferredTop =
    placement === "below"
      ? triggerRect.bottom + SIMULATION_RESULT_CARD_PREVIEW_GAP_PX
      : triggerRect.top - previewHeight - SIMULATION_RESULT_CARD_PREVIEW_GAP_PX
  const maxTop =
    viewportHeight - SIMULATION_RESULT_CARD_PREVIEW_MARGIN_PX - previewHeight
  const preferredLeft =
    triggerRect.left + triggerRect.width / 2 - previewWidth / 2
  const maxLeft =
    viewportWidth - SIMULATION_RESULT_CARD_PREVIEW_MARGIN_PX - previewWidth

  return {
    left: clampSimulationResultCardPreviewValue(
      preferredLeft,
      SIMULATION_RESULT_CARD_PREVIEW_MARGIN_PX,
      maxLeft
    ),
    placement,
    top: clampSimulationResultCardPreviewValue(
      preferredTop,
      SIMULATION_RESULT_CARD_PREVIEW_MARGIN_PX,
      maxTop
    ),
    width: previewWidth,
  }
}

function clampSimulationResultCardPreviewValue(
  value: number,
  min: number,
  max: number
) {
  if (max < min) {
    return min
  }

  return Math.min(Math.max(value, min), max)
}

function SimulationResultCardImageLinks({
  cardLookup,
  cardNames,
}: {
  cardLookup: SimulationCardLookup
  cardNames: readonly string[]
}) {
  const cardImages = cardNames.flatMap((cardName, index) => {
    const resolvedCard = resolveSimulationCard(cardLookup, cardName)
    const imageUrl = resolvedCard?.defaultImageUrl?.trim() || null
    const href = resolvedCard?.scryfallUri.trim() || null

    return resolvedCard && imageUrl
      ? [
          {
            href,
            imageUrl,
            index,
            name: resolvedCard.name,
          },
        ]
      : []
  })

  return (
    <div className="grid grid-cols-7 gap-2 sm:gap-3">
      {cardImages.map((card) => (
        <a
          key={`${card.name}-image-${card.index}`}
          className="block min-w-0 overflow-hidden rounded-sm bg-black/40 focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:outline-none"
          href={card.href ?? undefined}
          target="_blank"
          rel="noreferrer"
          title={card.name}
        >
          <img
            className="aspect-[488/680] w-full object-cover"
            src={card.imageUrl}
            alt={card.name}
            loading="lazy"
          />
        </a>
      ))}
    </div>
  )
}

function getStartingHandCardNames(startingHand: StartingHand) {
  const cardNames: string[] = []

  for (const card of startingHand.cards) {
    for (let copyIndex = 0; copyIndex < card.quantity; copyIndex += 1) {
      cardNames.push(card.name)
    }
  }

  return cardNames
}

function getCommanderCardNames(commanders: readonly DeckCard[]) {
  const cardNames: string[] = []

  for (const card of commanders) {
    for (let copyIndex = 0; copyIndex < card.quantity; copyIndex += 1) {
      cardNames.push(card.name)
    }
  }

  return cardNames
}

function formatResultEventPayload(payload: unknown) {
  if (typeof payload === "string") {
    return payload
  }

  return JSON.stringify(payload, null, 2)
}

function getMcpCallCompleteTitle(chunk: SimulationDebugLlmRunChunk) {
  const toolName = chunk.mcpFunctionName ?? "unknown tool"
  const knownToolLabel = getKnownSimulationResultToolLabelForChunk({
    chunk,
    state: isMcpCallFailure(chunk) ? "failed" : "completed",
  })

  if (knownToolLabel !== null) {
    return knownToolLabel
  }

  if (isMcpCallFailure(chunk)) {
    return `Tool failed: ${toolName}`
  }

  return `Tool completed: ${toolName}`
}

function getMcpCallCompleteIcon(chunk: SimulationDebugLlmRunChunk) {
  if (chunk.mcpFunctionName === "shuffle_library" && !isMcpCallFailure(chunk)) {
    return <Shuffle className="size-4" />
  }

  return null
}

function isMcpCallFailure(chunk: SimulationDebugLlmRunChunk) {
  if (chunk.kind !== "mcp_call_complete") {
    return false
  }

  return (
    getPayloadString(asPayloadRecord(chunk.payload).item, "status") ===
      "failed" || getMcpCallErrorPayload(chunk) !== null
  )
}

function getMcpCallErrorPayload(chunk: SimulationDebugLlmRunChunk) {
  const itemRecord = asPayloadRecord(asPayloadRecord(chunk.payload).item)
  const errorRecord = asPayloadRecord(itemRecord.error)
  const content = errorRecord.content

  if (!Array.isArray(content)) {
    return Object.keys(errorRecord).length > 0 ? errorRecord : null
  }

  const textParts = content.flatMap((part) => {
    const text = getPayloadString(part, "text")

    return text === null ? [] : [text]
  })

  if (textParts.length === 0) {
    return errorRecord
  }

  return textParts.join("\n")
}

function asPayloadRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {}
}

function getPayloadString(value: unknown, property: string) {
  const propertyValue = asPayloadRecord(value)[property]

  return typeof propertyValue === "string" ? propertyValue : null
}

function getPayloadMessage(payload: unknown) {
  if (typeof payload === "string" && payload.trim()) {
    return payload
  }

  if (typeof payload === "object" && payload !== null && "message" in payload) {
    const message = payload.message

    if (typeof message === "string" && message.trim()) {
      return message
    }
  }

  return "The run was cancelled."
}

function SimulationDebugPanel({
  debugInfo,
  modelPresets,
}: {
  debugInfo: SimulationDebugInfo
  modelPresets: LlmModelPreset[]
}) {
  return (
    <div className="grid gap-4">
      <section className="grid gap-2 rounded-md border border-border bg-background/35 p-3">
        <h3 className="text-sm font-semibold text-foreground">
          Simulation metadata
        </h3>
        <DebugMetadataGrid>
          <DebugMetadataItem
            label="Simulation ID"
            value={debugInfo.simulationId}
          />
          <DebugMetadataItem label="Deck ID" value={debugInfo.deckId} />
          <DebugMetadataItem label="Status" value={debugInfo.status} />
          <DebugMetadataItem label="Created via" value={debugInfo.createdVia} />
          <DebugMetadataItem
            label="Model preset"
            value={getDebugModelPresetLabel(
              debugInfo.llmModelPresetId,
              modelPresets
            )}
          />
          <DebugMetadataItem label="Seed" value={debugInfo.seed} />
          <DebugMetadataItem
            label="Turns to simulate"
            value={debugInfo.turnsToSimulate}
          />
          <DebugMetadataItem
            label="Opening hand"
            value={
              debugInfo.startingHandId
                ? `Saved hand ${debugInfo.startingHandId}`
                : "Simulated"
            }
          />
          <DebugMetadataItem
            label="Auto-generate report"
            value={formatDebugBoolean(debugInfo.autoGenerateReport)}
          />
          <DebugMetadataItem
            label="Reasoning summaries"
            value={formatDebugBoolean(debugInfo.reasoningSummariesEnabled)}
          />
          <DebugMetadataItem
            label="Flex service tier"
            value={formatDebugBoolean(debugInfo.useFlexServiceTier)}
          />
          <DebugMetadataItem
            label="Public"
            value={formatDebugBoolean(debugInfo.isPublic)}
          />
          <DebugMetadataItem
            label="Simulated turns"
            value={debugInfo.simulatedTurnCount}
          />
          <DebugMetadataItem
            label="Completed runs"
            value={debugInfo.completedLlmRunCount}
          />
          <DebugMetadataItem
            label="Active runs"
            value={debugInfo.activeLlmRunCount}
          />
          <DebugMetadataItem
            label="Created"
            value={formatDebugDateTime(debugInfo.createdAt)}
          />
          <DebugMetadataItem
            label="Updated"
            value={formatDebugDateTime(debugInfo.updatedAt)}
          />
        </DebugMetadataGrid>
      </section>

      <section className="grid gap-2 rounded-md border border-border bg-background/35 p-3">
        <h3 className="text-sm font-semibold text-foreground">Run counts</h3>
        <DebugMetadataGrid>
          <DebugMetadataItem
            label="Opening hand LLM runs"
            value={debugInfo.openingHandLlmRunCount}
          />
          <DebugMetadataItem
            label="Turn LLM runs"
            value={debugInfo.turnLlmRunCount}
          />
          <DebugMetadataItem
            label="Report LLM runs"
            value={debugInfo.reportLlmRunCount}
          />
        </DebugMetadataGrid>
      </section>

      <SimulationDebugRunGroup
        heading="Opening hand runs"
        modelPresets={modelPresets}
        runs={debugInfo.openingHandLlmRuns}
      />
      <SimulationDebugRunGroup
        heading="Turn runs"
        modelPresets={modelPresets}
        runs={debugInfo.turnLlmRuns}
      />
      <SimulationDebugRunGroup
        heading="Report runs"
        modelPresets={modelPresets}
        runs={debugInfo.reportLlmRuns}
      />
    </div>
  )
}

function SimulationDebugRunGroup({
  heading,
  modelPresets,
  runs,
}: {
  heading: string
  modelPresets: LlmModelPreset[]
  runs: SimulationDebugInfo["openingHandLlmRuns"]
}) {
  return (
    <section className="grid gap-3">
      <h3 className="text-sm font-semibold text-foreground">{heading}</h3>
      {runs.length > 0 ? (
        runs.map((run) => (
          <article
            key={run.llmRunId}
            className="grid gap-2 rounded-md border border-border bg-background/35 p-3"
          >
            <DebugMetadataGrid>
              <DebugMetadataItem label="Run ID" value={run.llmRunId} />
              <DebugMetadataItem label="Phase" value={run.phase} />
              <DebugMetadataItem label="Status" value={run.status} />
              <DebugMetadataItem label="Attempt" value={run.attemptNumber} />
              {run.turnNumber !== undefined ? (
                <DebugMetadataItem label="Turn" value={run.turnNumber} />
              ) : null}
              {run.openingHandIsValid !== undefined ? (
                <DebugMetadataItem
                  label="Valid opening hand"
                  value={formatDebugBoolean(run.openingHandIsValid)}
                />
              ) : null}
              {run.outdated !== undefined ? (
                <DebugMetadataItem
                  label="Outdated"
                  value={formatDebugBoolean(run.outdated)}
                />
              ) : null}
              <DebugMetadataItem label="Provider" value={run.provider} />
              <DebugMetadataItem label="Model" value={run.model} />
              <DebugMetadataItem
                label="Model preset"
                value={getDebugModelPresetLabel(
                  run.llmModelPresetId,
                  modelPresets
                )}
              />
              <DebugMetadataItem
                label="Estimated price"
                value={getLlmRunEstimatedPriceText(run) ?? "N/A"}
              />
              <DebugMetadataItem
                label="Reasoning effort"
                value={run.reasoningEffort || "N/A"}
              />
              <DebugMetadataItem
                label="Service tier"
                value={run.serviceTier || "N/A"}
              />
              <DebugMetadataItem
                label="Runtime key"
                value={run.runtimeStreamKey ?? "none"}
              />
              <DebugMetadataItem
                label="Created"
                value={formatDebugDateTime(run.createdAt)}
              />
              <DebugMetadataItem
                label="Started"
                value={formatDebugDateTime(run.startedAt)}
              />
              <DebugMetadataItem
                label="Completed"
                value={formatDebugDateTime(run.completedAt)}
              />
              <DebugMetadataItem
                label="Failed"
                value={formatDebugDateTime(run.failedAt)}
              />
              <DebugMetadataItem
                label="Cancelled"
                value={formatDebugDateTime(run.cancelledAt)}
              />
              <DebugMetadataItem
                label="Duration"
                value={getSimulationRunFinishedDurationText(run) ?? "N/A"}
              />
              <DebugMetadataItem
                label="Failure"
                value={run.failureMessage?.trim() || "N/A"}
              />
              <DebugMetadataItem
                label="OpenRouter generations"
                value={formatOpenRouterGenerationMetadata(
                  run.openrouterGenerations
                )}
              />
            </DebugMetadataGrid>
          </article>
        ))
      ) : (
        <p className="rounded-md border border-border bg-background/35 px-3 py-2 text-sm text-muted-foreground">
          No runs yet.
        </p>
      )}
    </section>
  )
}

function DebugMetadataGrid({ children }: { children: ReactNode }) {
  return (
    <dl className="grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-2 xl:grid-cols-3">
      {children}
    </dl>
  )
}

function DebugMetadataItem({
  label,
  value,
}: {
  label: string
  value: ReactNode
}) {
  return (
    <div className="min-w-0 leading-6">
      <dt className="inline text-muted-foreground">{label}: </dt>
      <dd className="inline font-medium break-words text-foreground">
        {value}
      </dd>
    </div>
  )
}

function getDebugModelPresetLabel(
  presetId: string | null,
  modelPresets: readonly LlmModelPreset[]
) {
  if (!presetId) {
    return "N/A"
  }

  const preset = modelPresets.find((candidate) => candidate.id === presetId)

  return preset ? getLlmModelPresetLabel(preset) : presetId
}

function formatDebugBoolean(value: boolean) {
  return value ? "Yes" : "No"
}

function formatDebugDateTime(value: string | null) {
  if (!value) {
    return "N/A"
  }

  const timestampMs = Date.parse(value)

  if (Number.isNaN(timestampMs)) {
    return value
  }

  return new Date(timestampMs).toLocaleString()
}

function formatOpenRouterGenerationMetadata(
  generations: SimulationDebugInfo["openingHandLlmRuns"][number]["openrouterGenerations"]
) {
  if (generations.length === 0) {
    return "None"
  }

  return generations
    .map(
      (generation) =>
        `Turn ${generation.openrouterTurnIndex + 1}: ${generation.generationId}`
    )
    .join("; ")
}

function getDebugChunkEventLabel(chunk: SimulationDebugLlmRunChunk) {
  const eventType = getPayloadString(chunk.payload, "type")
  const eventLabel = eventType ?? chunk.kind

  if (chunk.mcpFunctionName) {
    return `${eventLabel}: ${chunk.mcpFunctionName}`
  }

  return eventLabel
}

function EmptySimulationSelection() {
  return (
    <div className="grid flex-1 place-items-center px-5 py-10 text-center">
      <div className="max-w-md space-y-3">
        <Sparkles className="mx-auto size-8 text-sky-300" />
        <h3 className="text-lg font-semibold">Simulation workspace</h3>
        <p className="text-sm leading-6 text-muted-foreground">
          Select a simulation to view its run details here.
        </p>
      </div>
    </div>
  )
}

function countStartingHandCards(hand: StartingHand) {
  return hand.cards.reduce((total, card) => total + card.quantity, 0)
}

function getSelectedStartingHandCards(
  selectedCardIds: readonly string[],
  cardOptions: readonly OpeningHandCardOption[]
) {
  const selectedCardIdSet = new Set(selectedCardIds)
  const cardsByDeckCardId = new Map<
    number,
    { deckCardId: number; quantity: number }
  >()

  for (const cardOption of cardOptions) {
    if (!selectedCardIdSet.has(cardOption.id)) {
      continue
    }

    const existingCard = cardsByDeckCardId.get(cardOption.deckCardId)

    if (existingCard) {
      existingCard.quantity += 1
      continue
    }

    cardsByDeckCardId.set(cardOption.deckCardId, {
      deckCardId: cardOption.deckCardId,
      quantity: 1,
    })
  }

  return Array.from(cardsByDeckCardId.values())
}

function CreateSavedSeedModal({
  deckId,
  onClose,
  onSaved,
}: {
  deckId: string
  onClose: () => void
  onSaved: (seed: SavedSeed) => void
}) {
  const [seedName, setSeedName] = useState("")
  const [seedValue, setSeedValue] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const trimmedSeedName = seedName.trim()
    const trimmedSeedValue = seedValue.trim()

    if (!trimmedSeedName) {
      setError("Seed name is required.")
      return
    }

    if (!trimmedSeedValue) {
      setError("Seed value is required.")
      return
    }

    setError(null)
    setIsSaving(true)

    try {
      const response = await apiFetch(
        `${API_BASE_URL}/decks/${deckId}/saved-seeds`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: trimmedSeedName,
            seed: trimmedSeedValue,
          }),
        }
      )

      if (!response.ok) {
        setError(await readApiError(response, "Seed could not be saved."))
        return
      }

      const data = (await response.json()) as CreateSavedSeedResponse
      onSaved(data.savedSeed)
    } catch {
      setError("Seed could not be sent to the server.")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 py-6 backdrop-blur-sm"
      role="presentation"
      onMouseDown={isSaving ? undefined : onClose}
    >
      <section
        aria-labelledby="create-saved-seed-title"
        className="flex max-h-[calc(100svh-3rem)] w-full max-w-lg flex-col rounded-lg border border-border bg-card shadow-2xl shadow-black/40"
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="space-y-1">
            <h2 id="create-saved-seed-title" className="text-xl font-semibold">
              New seed
            </h2>
            <p className="text-sm text-muted-foreground">
              Name this seed so it can be reused with this deck.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Close"
            title="Close"
            onClick={onClose}
            disabled={isSaving}
          >
            <X />
          </Button>
        </header>

        <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
          <div className="grid min-h-0 gap-4 overflow-y-auto px-5 py-5">
            <label
              className="grid gap-2 text-sm font-medium"
              htmlFor="saved-seed-name"
            >
              <span>Name</span>
              <input
                id="saved-seed-name"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground transition outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-3 focus:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50"
                type="text"
                value={seedName}
                disabled={isSaving}
                onChange={(event) => {
                  setSeedName(event.target.value)
                  setError(null)
                }}
              />
            </label>

            <label
              className="grid gap-2 text-sm font-medium"
              htmlFor="saved-seed-value"
            >
              <span>Seed</span>
              <input
                id="saved-seed-value"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground transition outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-3 focus:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50"
                type="text"
                value={seedValue}
                disabled={isSaving}
                onChange={(event) => {
                  setSeedValue(event.target.value)
                  setError(null)
                }}
              />
            </label>

            {error ? (
              <p
                className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                role="alert"
              >
                {error}
              </p>
            ) : null}
          </div>

          <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              <Save data-icon="inline-start" />
              {isSaving ? "Saving..." : "Save seed"}
            </Button>
          </div>
        </form>
      </section>
    </div>
  )
}

function CreateStartingHandModal({
  cardOptions,
  deckId,
  onClose,
  onSaved,
}: {
  cardOptions: OpeningHandCardOption[]
  deckId: string
  onClose: () => void
  onSaved: (hand: StartingHand) => void
}) {
  const [handName, setHandName] = useState("")
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const selectedCardIdSet = useMemo(
    () => new Set(selectedCardIds),
    [selectedCardIds]
  )
  const hasExactlySevenCards = selectedCardIds.length === 7

  function toggleCard(cardId: string) {
    setSelectedCardIds((currentCardIds) => {
      if (currentCardIds.includes(cardId)) {
        return currentCardIds.filter(
          (currentCardId) => currentCardId !== cardId
        )
      }

      if (currentCardIds.length >= 7) {
        return currentCardIds
      }

      return [...currentCardIds, cardId]
    })
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const trimmedHandName = handName.trim()

    if (!trimmedHandName) {
      setError("Starting hand name is required.")
      return
    }

    if (!hasExactlySevenCards) {
      setError("Select exactly 7 cards.")
      return
    }

    setError(null)
    setIsSaving(true)

    try {
      const response = await apiFetch(
        `${API_BASE_URL}/decks/${deckId}/starting-hands`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: trimmedHandName,
            cards: getSelectedStartingHandCards(selectedCardIds, cardOptions),
          }),
        }
      )

      if (!response.ok) {
        setError(
          await readApiError(response, "Starting hand could not be saved.")
        )
        return
      }

      const data = (await response.json()) as CreateStartingHandResponse
      onSaved(data.startingHand)
    } catch {
      setError("Starting hand could not be sent to the server.")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 py-6 backdrop-blur-sm"
      role="presentation"
      onMouseDown={isSaving ? undefined : onClose}
    >
      <section
        aria-labelledby="create-starting-hand-title"
        className="flex max-h-[calc(100svh-3rem)] w-full max-w-2xl flex-col rounded-lg border border-border bg-card shadow-2xl shadow-black/40"
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="space-y-1">
            <h2
              id="create-starting-hand-title"
              className="text-xl font-semibold"
            >
              New starting hand
            </h2>
            <p className="text-sm text-muted-foreground">
              Name this hand and choose exactly 7 cards.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Close"
            title="Close"
            onClick={onClose}
            disabled={isSaving}
          >
            <X />
          </Button>
        </header>

        <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
          <div className="grid min-h-0 gap-4 overflow-y-auto px-5 py-5">
            <label
              className="grid gap-2 text-sm font-medium"
              htmlFor="starting-hand-name"
            >
              <span>Name</span>
              <input
                id="starting-hand-name"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground transition outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-3 focus:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50"
                type="text"
                value={handName}
                placeholder="Fast Sol Ring hand"
                disabled={isSaving}
                onChange={(event) => {
                  setHandName(event.target.value)
                  setError(null)
                }}
              />
            </label>

            <div className="grid gap-3">
              <div className="flex items-center justify-between gap-3 text-sm">
                <p
                  className={
                    hasExactlySevenCards
                      ? "text-sky-300"
                      : "text-muted-foreground"
                  }
                >
                  {selectedCardIds.length} of 7 selected
                </p>
                {!hasExactlySevenCards ? (
                  <p className="text-muted-foreground">
                    Select exactly 7 cards.
                  </p>
                ) : null}
              </div>

              <div className="max-h-80 overflow-y-auto rounded-md border border-border bg-background/35 p-2">
                <ul className="grid gap-1">
                  {cardOptions.map((card) => {
                    const isSelected = selectedCardIdSet.has(card.id)
                    const isDisabled =
                      isSaving || (!isSelected && selectedCardIds.length >= 7)

                    return (
                      <li key={card.id}>
                        <label
                          className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                            isSelected
                              ? "bg-accent text-accent-foreground"
                              : isDisabled
                                ? "text-muted-foreground/55"
                                : "text-muted-foreground hover:bg-muted/45 hover:text-foreground"
                          }`}
                        >
                          <input
                            className="size-4 accent-sky-300"
                            type="checkbox"
                            checked={isSelected}
                            disabled={isDisabled}
                            onChange={() => {
                              toggleCard(card.id)
                              setError(null)
                            }}
                          />
                          <span>{card.name}</span>
                        </label>
                      </li>
                    )
                  })}
                </ul>
              </div>
            </div>

            {error ? (
              <p
                className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                role="alert"
              >
                {error}
              </p>
            ) : null}
          </div>

          <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving || !hasExactlySevenCards}>
              <Save data-icon="inline-start" />
              {isSaving ? "Saving..." : "Save hand"}
            </Button>
          </div>
        </form>
      </section>
    </div>
  )
}
