import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
  type ReactNode,
  type UIEvent,
} from "react"
import ReactMarkdown from "react-markdown"
import { useNavigate } from "react-router-dom"
import tapIconUrl from "mana-font/svg/tap.svg"
import {
  Check,
  Dices,
  Eye,
  EyeOff,
  Gauge,
  Hand,
  Hourglass,
  LoaderCircle,
  MoreVertical,
  Moon,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
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
import { loadApiHelpers } from "@/lib/api-lazy"
import { useOptionalBillingTier } from "@/lib/billing-tier-state"
import type {
  CreateSimulationResponse,
  CreateStartingHandResponse,
  DeckCard,
  PublicSimulationExportV1,
  SavedSeed,
  SavedSeedsResponse,
  Simulation,
  SimulationDebugLlmRun,
  SimulationMcpFunctionCall,
  SimulationResultsInfo,
  SimulationResultsStreamEvent,
  SimulationsResponse,
  StartingHand,
  StartingHandsResponse,
  StopSimulationResponse,
  UpdateSimulationResponse,
} from "@/lib/deck-types"
import {
  getLlmModelPresetLabel,
  type LlmModelPreset,
  type LlmModelPresetsResponse,
} from "@/lib/llm-model-preset-types"
import { getDeckSimulationPath } from "@/lib/navigation"
import {
  getPresetStartingHandLibraryCardCount,
  getSimulationRunLibraryCardCount,
} from "@/lib/simulation-game-state-library"
import {
  getSimulationFinalParsedOutput,
  hasTurnActions,
  type ParsedSimulationFinalOutput,
} from "@/lib/simulation-final-output"
import { applySimulationResultsStreamEvent } from "@/lib/simulation-results-stream"
import {
  buildSimulationResultsTimelineSteps,
  isActiveSimulationResultsTimelineStep,
  resolveSimulationResultsTimelineSelection,
  shouldPreserveFinishedSimulationResultsTimelineSelection,
  type SimulationResultsTimelineDefaultSelection,
  type SimulationResultsTimelineSelectionSnapshot,
  type SimulationResultsTimelineStep,
} from "@/lib/simulation-results-timeline"
import { getSimulationRunStartTimeMs } from "@/lib/simulation-run-timing"
import {
  TURN_PHASE_CHANGES,
  type LoggedTurnAction,
  type TurnPhaseChange,
} from "@/lib/simulation-turn-actions"
import {
  EMPTY_SIMULATION_CARD_LOOKUP,
  createSimulationCardLookup,
  getSimulationResultToolCardNames,
  resolveSimulationCard,
  type SimulationCardLookup,
} from "@/lib/simulation-card-resolution"
import {
  getKnownSimulationResultToolLabel,
  getSimulationResultToolReason,
} from "@/lib/simulation-result-tool-labels"
import { useOptionalUsageLimits } from "@/lib/usage-limits"
import {
  formatMinutesSeconds,
  getLlmRunEstimatedPriceText,
  getSimulationRunFinishedDurationText,
  getSimulationRunFinishedTimeMs,
  isActiveLlmRunStatus,
} from "./deck-simulation/simulationRunFormatting"
import { SimulationDetailsModal } from "./deck-simulation/SimulationDetailsModal"
import {
  FlexServiceTierSwitch,
  SimulationSetupChoiceCard,
} from "./deck-simulation/SimulationSetupControls"
import { CardPreviewPill } from "./deck-simulation/CardPreviewPill"
import {
  ChooseSavedSeedModal,
  ChooseStartingHandModal,
  CreateSavedSeedModal,
  CreateStartingHandModal,
  type OpeningHandCardOption,
} from "./deck-simulation/SimulationSetupModals"

type SimulationResultEntry = {
  id: string
  type: "mcp_function_call"
  call: SimulationMcpFunctionCall
}

async function refreshNoUsageLimits() {
  return []
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

type SimulationResultsDemoRevealTimelineStep = {
  id: string
  kind: "demo_reveal"
  label: string
  detailLabel: string
  status: "next_turn"
  targetStepId: string
}

type SimulationResultsDisplayTimelineStep =
  | SimulationResultsTimelineStep
  | SimulationResultsDemoRevealTimelineStep
  | SimulationResultsNextTurnTimelineStep

const MIN_TURNS_TO_SIMULATE = 0
const MAX_TURNS_TO_SIMULATE = 8
const TURNS_TO_SIMULATE_STEP = 1
const DEFAULT_TURNS_TO_SIMULATE = "1"
const TURNS_TO_SIMULATE_OPTIONS = Array.from(
  { length: MAX_TURNS_TO_SIMULATE - MIN_TURNS_TO_SIMULATE + 1 },
  (_, index) => MIN_TURNS_TO_SIMULATE + index
)
const USAGE_LIMIT_FAILURE_MESSAGE_PATTERN = /\bout of usage limits\b/i
const CREATE_SIMULATION_USE_FLEX_STORAGE_KEY =
  "mtg-auto-deck:create-simulation-use-flex-service-tier"
const CREATE_SIMULATION_LAST_SAVED_SEED_STORAGE_KEY_PREFIX =
  "mtg-auto-deck:create-simulation-last-saved-seed:"
const CREATE_SIMULATION_LAST_STARTING_HAND_STORAGE_KEY_PREFIX =
  "mtg-auto-deck:create-simulation-last-starting-hand:"
const MANA_SYMBOL_TEXT_PATTERN = /(\{[^{}\s]+\})/g
const DEMO_STARTED_PARENT_MESSAGE_TYPE = "mtg-auto-deck:demo-started"
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

function getSimulationLabel(simulation: Simulation) {
  const turnLabel =
    simulation.simulatedTurnCount === 1
      ? "1 turn"
      : `${simulation.simulatedTurnCount} turns`

  return `${simulation.id.slice(0, 8)} - ${turnLabel}`
}

function getSimulationRunCountFromResults(resultsInfo: SimulationResultsInfo) {
  return (
    getCurrentOpeningHandRunCount(resultsInfo) +
    resultsInfo.turnLlmRuns.filter(isCountedTurnRun).length
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
  return [...resultsInfo.openingHandLlmRuns, ...resultsInfo.turnLlmRuns].filter(
    (run) => isActiveLlmRunStatus(run.status)
  ).length
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
    [...resultsInfo.openingHandLlmRuns, ...resultsInfo.turnLlmRuns].find(
      (run) => run.llmRunId === llmRunId
    ) ?? null
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

function getCreateSimulationDeckStorageKey(
  storageKeyPrefix: string,
  deckId: string
) {
  return `${storageKeyPrefix}${encodeURIComponent(deckId)}`
}

function getStoredCreateSimulationDeckItemId(
  storageKeyPrefix: string,
  deckId: string
) {
  try {
    return (
      window.localStorage.getItem(
        getCreateSimulationDeckStorageKey(storageKeyPrefix, deckId)
      ) ?? ""
    )
  } catch {
    return ""
  }
}

function storeCreateSimulationDeckItemId(
  storageKeyPrefix: string,
  deckId: string,
  itemId: string
) {
  try {
    const storageKey = getCreateSimulationDeckStorageKey(
      storageKeyPrefix,
      deckId
    )

    if (itemId) {
      window.localStorage.setItem(storageKey, itemId)
    } else {
      window.localStorage.removeItem(storageKey)
    }
  } catch {
    // Local storage is only a convenience for remembered saved items.
  }
}

function getStoredCreateSimulationSavedSeedId(deckId: string) {
  return getStoredCreateSimulationDeckItemId(
    CREATE_SIMULATION_LAST_SAVED_SEED_STORAGE_KEY_PREFIX,
    deckId
  )
}

function storeCreateSimulationSavedSeedId(deckId: string, savedSeedId: string) {
  storeCreateSimulationDeckItemId(
    CREATE_SIMULATION_LAST_SAVED_SEED_STORAGE_KEY_PREFIX,
    deckId,
    savedSeedId
  )
}

function getStoredCreateSimulationStartingHandId(deckId: string) {
  return getStoredCreateSimulationDeckItemId(
    CREATE_SIMULATION_LAST_STARTING_HAND_STORAGE_KEY_PREFIX,
    deckId
  )
}

function storeCreateSimulationStartingHandId(
  deckId: string,
  startingHandId: string
) {
  storeCreateSimulationDeckItemId(
    CREATE_SIMULATION_LAST_STARTING_HAND_STORAGE_KEY_PREFIX,
    deckId,
    startingHandId
  )
}

function resolveCreateSimulationDeckItemId<TItem extends { id: string }>(
  items: readonly TItem[],
  currentItemId: string,
  storedItemId: string
) {
  if (currentItemId && items.some((item) => item.id === currentItemId)) {
    return currentItemId
  }

  if (storedItemId && items.some((item) => item.id === storedItemId)) {
    return storedItemId
  }

  return items[0]?.id ?? ""
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
        defaultImageUrl: card.defaultImageUrl,
        name: card.name,
        scryfallUri: card.scryfallUri,
      }))
    )
    .sort((firstCard, secondCard) =>
      firstCard.name.localeCompare(secondCard.name)
    )
}

function mergeStartingHandLists(
  primaryHands: readonly StartingHand[],
  secondaryHands: readonly StartingHand[]
) {
  const handsById = new Map<string, StartingHand>()

  for (const hand of [...primaryHands, ...secondaryHands]) {
    if (!handsById.has(hand.id)) {
      handsById.set(hand.id, hand)
    }
  }

  return Array.from(handsById.values())
}

function UsageLimitReachedNotice({
  detail = "Try again after your available usage refreshes",
  onUpgradeUsage,
  shouldShowUsageUpgradeAction,
}: {
  detail?: string
  onUpgradeUsage: () => void
  shouldShowUsageUpgradeAction: boolean
}) {
  const billingTierContext = useOptionalBillingTier()
  const usageLimitsContext = useOptionalUsageLimits()
  const refreshBillingTier = billingTierContext?.refreshBillingTier
  const refreshUsageLimits = usageLimitsContext?.refreshUsageLimits

  useEffect(() => {
    void refreshBillingTier?.()
    void refreshUsageLimits?.()
  }, [refreshBillingTier, refreshUsageLimits])

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <Gauge className="mt-0.5 size-4 shrink-0 text-amber-200" aria-hidden />
        <div className="min-w-0">
          <p className="font-semibold text-foreground">Usage limit reached</p>
          <p className="mt-1 text-xs whitespace-pre-wrap text-amber-100/80">
            {detail}
          </p>
          {usageLimitsContext ? (
            <UsageLimitRows
              className="mt-3 max-w-xl"
              rowClassName="text-amber-100/80"
            />
          ) : null}
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
  demoMode = false,
  hideHeader = false,
  simulationId,
}: {
  demoMode?: boolean
  hideHeader?: boolean
  simulationId: string
}) {
  const [publicSimulation, setPublicSimulation] =
    useState<PublicSimulationExportV1 | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const loadPublicSimulation = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)

    try {
      const response = await fetch(
        `/simulations/${encodeURIComponent(simulationId)}.json`,
        {
          credentials: "omit",
        }
      )

      if (!response.ok) {
        setLoadError(
          response.status === 404
            ? "Public simulation could not be found."
            : "Public simulation could not be loaded."
        )
        return
      }

      const data = await response.json()

      if (!isPublicSimulationExportV1(data)) {
        setLoadError("Public simulation file is not in the expected format.")
        return
      }

      setPublicSimulation(redactPublicSimulationRunCosts(data))
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
      {hideHeader ? null : (
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
      )}

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
            defaultTimelineSelection="opening_hand"
            demoMode={demoMode}
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
            showRunCost={false}
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
  const [useFlexServiceTier, setUseFlexServiceTier] = useState(
    getStoredCreateSimulationUseFlexServiceTier
  )
  const [useBatchProcessing, setUseBatchProcessing] = useState(false)
  const [openingHandMode, setOpeningHandMode] = useState<
    "simulate" | "provide"
  >("simulate")
  const [selectedOpeningHandId, setSelectedOpeningHandId] = useState("")
  const [isChooseHandModalOpen, setIsChooseHandModalOpen] = useState(false)
  const [isChooseSeedModalOpen, setIsChooseSeedModalOpen] = useState(false)
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
  const enabledStartingHands = useMemo(
    () => startingHands.filter((hand) => hand.isEnabled),
    [startingHands]
  )
  const enabledSavedSeeds = useMemo(
    () => savedSeeds.filter((seed) => seed.isEnabled),
    [savedSeeds]
  )
  const selectedOpeningHand = useMemo(
    () =>
      enabledStartingHands.find((hand) => hand.id === selectedOpeningHandId) ??
      null,
    [enabledStartingHands, selectedOpeningHandId]
  )
  const selectedSavedSeed = useMemo(
    () =>
      enabledSavedSeeds.find((seed) => seed.id === selectedSavedSeedId) ?? null,
    [enabledSavedSeeds, selectedSavedSeedId]
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
  const selectedModelPresetSupportsBatch =
    selectedModelPreset?.provider === "openai"
  const isModelPresetSelectionResolved =
    !isLoadingModelPresets &&
    (modelPresetLoadError !== null ||
      modelPresets.length === 0 ||
      defaultModelPresetId === null ||
      selectedModelPreset !== null)
  const savedSeedSummary = selectedSavedSeed
    ? `${selectedSavedSeed.name} - ${selectedSavedSeed.seed}`
    : savedSeedLoadError
      ? "Saved seeds could not be loaded."
      : isLoadingSavedSeeds
        ? "Loading saved seeds..."
        : "Choose a saved seed"
  const savedSeedActionLabel = selectedSavedSeed ? "Change" : "Choose"
  const savedSeedActionDescription = selectedSavedSeed
    ? "Change saved seed"
    : "Choose saved seed"
  const openingHandSummary = selectedOpeningHand
    ? selectedOpeningHand.name
    : startingHandLoadError
      ? "Starting hands could not be loaded."
      : isLoadingStartingHands
        ? "Loading starting hands..."
        : "Choose a saved hand"
  const openingHandActionLabel = selectedOpeningHand ? "Change" : "Choose"
  const openingHandActionDescription = selectedOpeningHand
    ? "Change saved starting hand"
    : "Choose saved starting hand"
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
  const turnsToSimulateNumber = Number(turnsToSimulate)
  const displayTurnsToSimulate = Number.isFinite(turnsToSimulateNumber)
    ? turnsToSimulateNumber
    : Number(DEFAULT_TURNS_TO_SIMULATE)
  const turnsToSimulateLabel = `${displayTurnsToSimulate} ${
    displayTurnsToSimulate === 1 ? "turn" : "turns"
  }`
  const turnsToSimulateSliderProgress =
    ((displayTurnsToSimulate - MIN_TURNS_TO_SIMULATE) /
      (MAX_TURNS_TO_SIMULATE - MIN_TURNS_TO_SIMULATE)) *
    100
  const canStartSimulation =
    (seedMode === "random" || Boolean(selectedSavedSeed)) &&
    Boolean(selectedModelPreset) &&
    turnsToSimulate.length > 0 &&
    (openingHandMode !== "provide" || Boolean(selectedOpeningHand))

  useEffect(() => {
    if (!selectedModelPresetSupportsBatch && useBatchProcessing) {
      setUseBatchProcessing(false)
    }
  }, [selectedModelPresetSupportsBatch, useBatchProcessing])
  const loadSimulations = useCallback(
    async (options?: { silent?: boolean }) => {
      const isSilent = options?.silent ?? false

      if (!isSilent) {
        setIsLoadingSimulations(true)
        setSimulationLoadError(null)
      }

      try {
        const { API_BASE_URL, apiFetch, readApiError } =
          await loadApiHelpers()
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
      const { API_BASE_URL, apiFetch, readApiError } = await loadApiHelpers()
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
      setStartingHands((currentStartingHands) =>
        mergeStartingHandLists(
          data.startingHands,
          currentStartingHands.filter((hand) => !hand.isEnabled)
        )
      )
      setSelectedOpeningHandId((currentStartingHandId) =>
        resolveCreateSimulationDeckItemId(
          data.startingHands,
          currentStartingHandId,
          getStoredCreateSimulationStartingHandId(deckId)
        )
      )
    } catch {
      setStartingHandLoadError("Starting hands could not be loaded.")
    } finally {
      setIsLoadingStartingHands(false)
    }
  }, [deckId])

  const loadStartingHandById = useCallback(
    async (startingHandId: string) => {
      try {
        const { API_BASE_URL, apiFetch, readApiError } =
          await loadApiHelpers()
        const response = await apiFetch(
          `${API_BASE_URL}/decks/${deckId}/starting-hands/${encodeURIComponent(
            startingHandId
          )}`
        )

        if (!response.ok) {
          setStartingHandLoadError(
            await readApiError(response, "Starting hand could not be loaded.")
          )
          return
        }

        const data = (await response.json()) as CreateStartingHandResponse
        setStartingHands((currentStartingHands) =>
          mergeStartingHandLists([data.startingHand], currentStartingHands)
        )
      } catch {
        setStartingHandLoadError("Starting hand could not be loaded.")
      }
    },
    [deckId]
  )

  const loadSavedSeeds = useCallback(async () => {
    setIsLoadingSavedSeeds(true)
    setSavedSeedLoadError(null)

    try {
      const { API_BASE_URL, apiFetch, readApiError } = await loadApiHelpers()
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
      setSelectedSavedSeedId((currentSavedSeedId) =>
        resolveCreateSimulationDeckItemId(
          data.savedSeeds,
          currentSavedSeedId,
          getStoredCreateSimulationSavedSeedId(deckId)
        )
      )
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
      const { API_BASE_URL, apiFetch, readApiError } = await loadApiHelpers()
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
    if (isLoadingStartingHands) {
      return
    }

    const referencedStartingHandIds = [
      selectedSimulation?.startingHandId,
      detailsSimulation?.startingHandId,
    ].filter((handId): handId is string => Boolean(handId))

    for (const startingHandId of new Set(referencedStartingHandIds)) {
      if (startingHands.some((hand) => hand.id === startingHandId)) {
        continue
      }

      void loadStartingHandById(startingHandId)
    }
  }, [
    detailsSimulation?.startingHandId,
    isLoadingStartingHands,
    loadStartingHandById,
    selectedSimulation?.startingHandId,
    startingHands,
  ])

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
    setStartingHands((currentStartingHands) =>
      mergeStartingHandLists([hand], currentStartingHands)
    )
    storeCreateSimulationStartingHandId(deckId, hand.id)
    setSelectedOpeningHandId(hand.id)
    setOpeningHandMode("provide")
    setIsChooseHandModalOpen(false)
    setIsCreateHandModalOpen(false)
  }

  function selectCreatedSavedSeed(seed: SavedSeed) {
    setSavedSeeds((currentSavedSeeds) => [seed, ...currentSavedSeeds])
    storeCreateSimulationSavedSeedId(deckId, seed.id)
    setSelectedSavedSeedId(seed.id)
    setSeedMode("set")
    setIsChooseSeedModalOpen(false)
    setIsCreateSeedModalOpen(false)
  }

  function applyChosenSavedSeed(seedId: string) {
    storeCreateSimulationSavedSeedId(deckId, seedId)
    setSelectedSavedSeedId(seedId)
    setSeedMode("set")
    setCreateSimulationError(null)
    setIsChooseSeedModalOpen(false)
  }

  function applyChosenStartingHand(handId: string) {
    storeCreateSimulationStartingHandId(deckId, handId)
    setSelectedOpeningHandId(handId)
    setOpeningHandMode("provide")
    setCreateSimulationError(null)
    setIsChooseHandModalOpen(false)
  }

  function handleSavedSeedDeleted(savedSeedId: string) {
    const remainingSavedSeeds = enabledSavedSeeds.filter(
      (seed) => seed.id !== savedSeedId
    )
    const wasSelectedSeed = selectedSavedSeedId === savedSeedId
    const wasRememberedSeed =
      getStoredCreateSimulationSavedSeedId(deckId) === savedSeedId

    setSavedSeeds((currentSavedSeeds) =>
      currentSavedSeeds.filter((seed) => seed.id !== savedSeedId)
    )

    if (wasSelectedSeed || wasRememberedSeed) {
      const nextSavedSeedId = remainingSavedSeeds[0]?.id ?? ""

      storeCreateSimulationSavedSeedId(deckId, nextSavedSeedId)
    }

    if (wasSelectedSeed) {
      const nextSavedSeedId = remainingSavedSeeds[0]?.id ?? ""

      setSelectedSavedSeedId(nextSavedSeedId)

      if (!nextSavedSeedId) {
        setSeedMode("random")
      }
    }

    setCreateSimulationError(null)
  }

  function handleStartingHandDeleted(startingHandId: string) {
    const remainingStartingHands = enabledStartingHands.filter(
      (hand) => hand.id !== startingHandId
    )
    const wasSelectedHand = selectedOpeningHandId === startingHandId
    const wasRememberedHand =
      getStoredCreateSimulationStartingHandId(deckId) === startingHandId

    setStartingHands((currentStartingHands) =>
      currentStartingHands.map((hand) =>
        hand.id === startingHandId
          ? { ...hand, isEnabled: false, updatedAt: new Date().toISOString() }
          : hand
      )
    )

    if (wasSelectedHand || wasRememberedHand) {
      const nextStartingHandId = remainingStartingHands[0]?.id ?? ""

      storeCreateSimulationStartingHandId(deckId, nextStartingHandId)
    }

    if (wasSelectedHand) {
      const nextStartingHandId = remainingStartingHands[0]?.id ?? ""

      setSelectedOpeningHandId(nextStartingHandId)

      if (!nextStartingHandId) {
        setOpeningHandMode("simulate")
      }
    }

    setCreateSimulationError(null)
  }

  function openCreateSeedFromChooser() {
    setIsChooseSeedModalOpen(false)
    setIsCreateSeedModalOpen(true)
  }

  function openCreateHandFromChooser() {
    setIsChooseHandModalOpen(false)
    setIsCreateHandModalOpen(true)
  }

  function resetCreateSimulationForm() {
    setSeedMode("random")
    setSelectedSavedSeedId((currentSavedSeedId) =>
      resolveCreateSimulationDeckItemId(
        enabledSavedSeeds,
        currentSavedSeedId,
        getStoredCreateSimulationSavedSeedId(deckId)
      )
    )
    setSelectedModelPresetId(defaultModelPresetId ?? "")
    setTurnsToSimulate(DEFAULT_TURNS_TO_SIMULATE)
    setOpeningHandMode("simulate")
    setSelectedOpeningHandId((currentStartingHandId) =>
      resolveCreateSimulationDeckItemId(
        enabledStartingHands,
        currentStartingHandId,
        getStoredCreateSimulationStartingHandId(deckId)
      )
    )
  }

  function handleSetSeedModeSelected() {
    const nextSavedSeedId = resolveCreateSimulationDeckItemId(
      enabledSavedSeeds,
      selectedSavedSeedId,
      getStoredCreateSimulationSavedSeedId(deckId)
    )

    if (!nextSavedSeedId) {
      setIsChooseSeedModalOpen(true)
      return
    }

    storeCreateSimulationSavedSeedId(deckId, nextSavedSeedId)
    setSelectedSavedSeedId(nextSavedSeedId)
    setSeedMode("set")
    setCreateSimulationError(null)
  }

  function handleProvideOpeningHandModeSelected() {
    const nextStartingHandId = resolveCreateSimulationDeckItemId(
      enabledStartingHands,
      selectedOpeningHandId,
      getStoredCreateSimulationStartingHandId(deckId)
    )

    if (!nextStartingHandId) {
      setIsChooseHandModalOpen(true)
      return
    }

    storeCreateSimulationStartingHandId(deckId, nextStartingHandId)
    setSelectedOpeningHandId(nextStartingHandId)
    setOpeningHandMode("provide")
    setCreateSimulationError(null)
  }

  function handleCreateSimulationUseFlexChange(nextEnabled: boolean) {
    if (nextEnabled) {
      setUseBatchProcessing(false)
    }

    setUseFlexServiceTier(nextEnabled)
    storeCreateSimulationUseFlexServiceTier(nextEnabled)
  }

  function handleCreateSimulationBatchChange(nextEnabled: boolean) {
    if (nextEnabled && !selectedModelPresetSupportsBatch) {
      return
    }

    setUseBatchProcessing(nextEnabled)

    if (nextEnabled) {
      setUseFlexServiceTier(false)
      storeCreateSimulationUseFlexServiceTier(false)
    }
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
      const { API_BASE_URL, apiFetch, readApiError } = await loadApiHelpers()
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
            llmProcessingMode:
              useBatchProcessing && selectedModelPreset.provider === "openai"
                ? "openai_batch"
                : "realtime",
            useFlexServiceTier:
              selectedModelPreset.supportsFlex &&
              useFlexServiceTier &&
              !useBatchProcessing,
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
      const { API_BASE_URL, apiFetch, readApiError } = await loadApiHelpers()
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
                        <legend className="sr-only">Simulation seed</legend>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <SimulationSetupChoiceCard
                            checked={seedMode === "random"}
                            inputId="seed-mode-random"
                            label="Random seed"
                            name="seed-mode"
                            onChange={() => setSeedMode("random")}
                          />
                          <SimulationSetupChoiceCard
                            action={
                              <Button
                                type="button"
                                variant="outline"
                                className="w-24"
                                aria-label={savedSeedActionDescription}
                                title={savedSeedActionDescription}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  setIsChooseSeedModalOpen(true)
                                }}
                              >
                                <Shuffle data-icon="inline-start" />
                                {savedSeedActionLabel}
                              </Button>
                            }
                            checked={seedMode === "set"}
                            inputId="seed-mode-set"
                            label="Set seed"
                            name="seed-mode"
                            summary={savedSeedSummary}
                            summaryTitle={savedSeedSummary}
                            onChange={handleSetSeedModeSelected}
                          />
                        </div>
                      </fieldset>

                      <fieldset className="grid gap-3">
                        <legend className="sr-only">Opening hand</legend>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <SimulationSetupChoiceCard
                            checked={openingHandMode === "simulate"}
                            inputId="opening-hand-mode-simulate"
                            label="Simulate opening hand"
                            name="opening-hand-mode"
                            onChange={() => setOpeningHandMode("simulate")}
                          />
                          <SimulationSetupChoiceCard
                            action={
                              <Button
                                type="button"
                                variant="outline"
                                className="w-24"
                                aria-label={openingHandActionDescription}
                                title={openingHandActionDescription}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  setIsChooseHandModalOpen(true)
                                }}
                              >
                                <Hand data-icon="inline-start" />
                                {openingHandActionLabel}
                              </Button>
                            }
                            checked={openingHandMode === "provide"}
                            inputId="opening-hand-mode-provide"
                            label="Set opening hand"
                            name="opening-hand-mode"
                            summary={openingHandSummary}
                            summaryTitle={openingHandSummary}
                            onChange={handleProvideOpeningHandModeSelected}
                          />
                        </div>
                      </fieldset>

                      <div className="grid gap-3">
                        <div className="flex items-center justify-between gap-3">
                          <label
                            className="text-sm font-medium text-foreground"
                            htmlFor="turns-to-simulate"
                          >
                            Turns to simulate
                          </label>
                          <span className="rounded-md border border-input bg-background/60 px-2 py-1 text-xs font-medium text-sky-100">
                            {turnsToSimulateLabel}
                          </span>
                        </div>
                        <div className="grid gap-2 px-4 sm:px-7">
                          <div
                            className="turns-to-simulate-slider-control"
                            style={
                              {
                                "--turns-to-simulate-slider-progress": `${turnsToSimulateSliderProgress}%`,
                              } as CSSProperties
                            }
                          >
                            <input
                              id="turns-to-simulate"
                              type="range"
                              min={MIN_TURNS_TO_SIMULATE}
                              max={MAX_TURNS_TO_SIMULATE}
                              step={TURNS_TO_SIMULATE_STEP}
                              className="turns-to-simulate-slider rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
                              value={turnsToSimulate}
                              aria-valuetext={turnsToSimulateLabel}
                              onChange={(event) =>
                                setTurnsToSimulate(event.target.value)
                              }
                            />
                          </div>
                          <div
                            className="relative h-8 text-[0.68rem] font-medium text-muted-foreground"
                            aria-hidden="true"
                          >
                            {TURNS_TO_SIMULATE_OPTIONS.map((turnCount) => (
                              <span
                                key={turnCount}
                                className="absolute top-0 flex -translate-x-1/2 flex-col items-center gap-1"
                                style={
                                  {
                                    left: `${
                                      ((turnCount - MIN_TURNS_TO_SIMULATE) /
                                        (MAX_TURNS_TO_SIMULATE -
                                          MIN_TURNS_TO_SIMULATE)) *
                                      100
                                    }%`,
                                  } as CSSProperties
                                }
                              >
                                <span
                                  className={`h-1.5 w-px rounded-full ${
                                    turnCount <= displayTurnsToSimulate
                                      ? "bg-sky-300/70"
                                      : "bg-border"
                                  }`}
                                />
                                <span
                                  className={
                                    turnCount === displayTurnsToSimulate
                                      ? "text-sky-100"
                                      : undefined
                                  }
                                >
                                  {turnCount}
                                </span>
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

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
                      </div>

                      {isModelPresetSelectionResolved ? (
                        <div className="grid gap-3">
                          <FlexServiceTierSwitch
                            checked={
                              selectedModelPresetSupportsBatch &&
                              useBatchProcessing
                            }
                            disabled={!selectedModelPresetSupportsBatch}
                            label="Batch processing"
                            activeWarning="Less usage, but simulations can take hours to finish. Uses OpenAI batch api"
                            onCheckedChange={
                              handleCreateSimulationBatchChange
                            }
                          />
                          <FlexServiceTierSwitch
                            checked={
                              selectedModelPresetSupportsFlex &&
                              useFlexServiceTier
                            }
                            disabled={!selectedModelPresetSupportsFlex}
                            label="Flex processing"
                            activeWarning="Less usage, but simulation may be slower and has a higher chance of failing."
                            onCheckedChange={
                              handleCreateSimulationUseFlexChange
                            }
                          />
                        </div>
                      ) : null}
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
              showRunCost={isAdmin}
              simulation={selectedSimulation}
              startingHand={selectedSimulationStartingHand}
              startingHandLoadError={startingHandLoadError}
            />
          ) : (
            <EmptySimulationSelection />
          )}
        </section>
      </div>

      {isChooseSeedModalOpen ? (
        <ChooseSavedSeedModal
          deckId={deckId}
          isLoadingSavedSeeds={isLoadingSavedSeeds}
          loadError={savedSeedLoadError}
          onApply={applyChosenSavedSeed}
          onClose={() => setIsChooseSeedModalOpen(false)}
          onCreateSeed={openCreateSeedFromChooser}
          onDeleted={handleSavedSeedDeleted}
          onRetry={() => void loadSavedSeeds()}
          savedSeeds={enabledSavedSeeds}
          selectedSavedSeedId={selectedSavedSeedId}
        />
      ) : null}

      {isChooseHandModalOpen ? (
        <ChooseStartingHandModal
          deckId={deckId}
          isLoadingStartingHands={isLoadingStartingHands}
          loadError={startingHandLoadError}
          onApply={applyChosenStartingHand}
          onClose={() => setIsChooseHandModalOpen(false)}
          onCreateHand={openCreateHandFromChooser}
          onDeleted={handleStartingHandDeleted}
          onRetry={() => void loadStartingHands()}
          selectedStartingHandId={selectedOpeningHandId}
          startingHands={enabledStartingHands}
        />
      ) : null}

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

function SimulationDetails({
  canUpgradeUsage,
  cards,
  commanders,
  defaultTimelineSelection = "latest",
  demoMode = false,
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
  showRunCost,
  shouldStreamResults = true,
  simulation,
  startingHand,
  startingHandLoadError,
}: {
  canUpgradeUsage: boolean
  cards: DeckCard[]
  commanders: DeckCard[]
  defaultTimelineSelection?: SimulationResultsTimelineDefaultSelection
  demoMode?: boolean
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
  showRunCost: boolean
  shouldStreamResults?: boolean
  simulation: Simulation
  startingHand: StartingHand | null
  startingHandLoadError: string | null
}) {
  const usageLimitsContext = useOptionalUsageLimits()
  const refreshUsageLimits =
    usageLimitsContext?.refreshUsageLimits ?? refreshNoUsageLimits
  const [isStartingOpeningHandRun, setIsStartingOpeningHandRun] =
    useState(false)
  const [openingHandRunError, setOpeningHandRunError] = useState<string | null>(
    null
  )
  const [isStartingTurnRun, setIsStartingTurnRun] = useState(false)
  const [turnRunError, setTurnRunError] = useState<string | null>(null)
  const [isStoppingSimulation, setIsStoppingSimulation] = useState(false)
  const [stopSimulationError, setStopSimulationError] = useState<string | null>(
    null
  )
  const [isStoppingFutureTurns, setIsStoppingFutureTurns] = useState(false)
  const [stopFutureTurnsError, setStopFutureTurnsError] = useState<
    string | null
  >(null)
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
    setIsStoppingSimulation(false)
    setStopSimulationError(null)
    setIsStoppingFutureTurns(false)
    setStopFutureTurnsError(null)
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
      isStoppingSimulation
    ) {
      return
    }

    setIsStartingOpeningHandRun(true)
    setOpeningHandRunError(null)
    setTurnRunError(null)

    try {
      const { API_BASE_URL, apiFetch, readApiError } = await loadApiHelpers()
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

    try {
      const { API_BASE_URL, apiFetch, readApiError } = await loadApiHelpers()
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

  async function stopSimulation() {
    if (readOnly) {
      return null
    }

    setIsStoppingSimulation(true)
    setStopSimulationError(null)

    try {
      const { API_BASE_URL, apiFetch, readApiError } = await loadApiHelpers()
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

  async function handleStopFutureTurns() {
    if (readOnly || isStoppingFutureTurns) {
      return
    }

    setIsStoppingFutureTurns(true)
    setStopFutureTurnsError(null)

    try {
      const { API_BASE_URL, apiFetch, readApiError } = await loadApiHelpers()
      const response = await apiFetch(
        `${API_BASE_URL}/decks/${deckId}/simulations/${simulation.id}/stop-auto-advance`,
        {
          method: "POST",
        }
      )

      if (!response.ok) {
        setStopFutureTurnsError(
          await readApiError(response, "Future turns could not be stopped.")
        )
        return
      }

      const data = (await response.json()) as UpdateSimulationResponse
      onSimulationUpdated(data.simulation)
    } catch {
      setStopFutureTurnsError(
        "Stop future turns could not be sent to the server."
      )
    } finally {
      setIsStoppingFutureTurns(false)
    }
  }

  useEffect(() => {
    if (!shouldStreamResults) {
      resultsEventSourceRef.current?.close()
      resultsEventSourceRef.current = null
      setIsLoadingResults(false)
      return
    }

    let eventSource: EventSource | null = null
    let isStreamClosed = false
    let isEffectCancelled = false

    resultsEventSourceRef.current?.close()
    resultsEventSourceRef.current = null
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
      eventSource?.close()

      if (eventSource && resultsEventSourceRef.current === eventSource) {
        resultsEventSourceRef.current = null
      }

      markStreamLoaded()
    }

    async function openStream() {
      try {
        const streamUrl =
          resultsStreamUrl ??
          `${
            (await loadApiHelpers()).API_BASE_URL
          }/decks/${deckId}/simulations/${simulation.id}/results/stream`

        if (isEffectCancelled) {
          return
        }

        eventSource = new EventSource(streamUrl, {
          withCredentials: resultsStreamWithCredentials,
        })
        resultsEventSourceRef.current?.close()
        resultsEventSourceRef.current = eventSource
      } catch {
        if (!isEffectCancelled) {
          setResultsError("Simulation results stream could not be opened.")
          markStreamLoaded()
        }
        return
      }

      const openedEventSource = eventSource

      openedEventSource.onmessage = (messageEvent) => {
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

      openedEventSource.onerror = () => {
        if (openedEventSource.readyState === EventSource.CLOSED) {
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
    }

    void openStream()

    return () => {
      isEffectCancelled = true
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
      defaultTimelineSelection={defaultTimelineSelection}
      demoMode={demoMode}
      hasUsableModelPreset={selectedModelPreset !== null}
      isStartingOpeningHandRun={isStartingOpeningHandRun}
      isStartingTurnRun={isStartingTurnRun}
      isLoadingStartingHand={isLoadingStartingHand}
      isStoppingFutureTurns={isStoppingFutureTurns}
      isStoppingSimulation={isStoppingSimulation}
      onStartOpeningHandRun={() => void handleStartOpeningHandRun()}
      onKeepResultsScrolledToBottom={keepResultsScrolledToBottom}
      onModelPresetRequired={onOpenDetails}
      onResultsScroll={handleResultsScroll}
      onScrollResultsToBottomIfKept={scrollResultsToBottomIfKept}
      onStartTurnRun={(turnNumber) => void handleStartTurnRun(turnNumber)}
      onStopFutureTurns={() => void handleStopFutureTurns()}
      onStopSimulation={() => void handleStopSimulation()}
      onUpgradeUsage={onUpgradeUsage}
      openingHandRunError={openingHandRunError}
      readOnly={readOnly}
      resultsError={resultsError}
      resultsInfo={resultsInfo}
      resultsPanelRef={resultsPanelRef}
      showRunCost={showRunCost}
      simulation={simulation}
      startingHand={startingHand}
      startingHandLoadError={startingHandLoadError}
      stopFutureTurnsError={stopFutureTurnsError}
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
  skipGameStateAnimationKey = 0,
}: {
  cardLookup?: SimulationCardLookup
  children: ReactNode
  gameState: SimulationGameStateDisplay | null
  header?: ReactNode
  skipGameStateAnimationKey?: number
}) {
  return (
    <div className="flex h-full min-h-0 min-w-0 overflow-hidden">
      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {header}
        <div className="grid min-h-0 min-w-0 flex-1 grid-cols-[minmax(0,2fr)_minmax(0,3fr)] grid-rows-1 overflow-hidden">
          <section
            className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden bg-background"
            aria-label="Simulation results"
          >
            {children}
          </section>
          <SimulationGameStatePane
            cardLookup={cardLookup}
            gameState={gameState}
            skipAnimationKey={skipGameStateAnimationKey}
          />
        </div>
      </div>
    </div>
  )
}

function SimulationResultsPanel({
  canUpgradeUsage,
  cards,
  commanders,
  defaultTimelineSelection,
  demoMode,
  hasUsableModelPreset,
  isStartingOpeningHandRun,
  isStartingTurnRun,
  isLoadingStartingHand,
  isStoppingFutureTurns,
  isStoppingSimulation,
  onStartOpeningHandRun,
  onKeepResultsScrolledToBottom,
  onModelPresetRequired,
  onResultsScroll,
  onScrollResultsToBottomIfKept,
  onStartTurnRun,
  onStopFutureTurns,
  onStopSimulation,
  onUpgradeUsage,
  openingHandRunError,
  readOnly,
  resultsError,
  resultsInfo,
  resultsPanelRef,
  showRunCost,
  simulation,
  startingHand,
  startingHandLoadError,
  stopFutureTurnsError,
  stopSimulationError,
  turnRunError,
}: {
  canUpgradeUsage: boolean
  cards: DeckCard[]
  commanders: DeckCard[]
  defaultTimelineSelection: SimulationResultsTimelineDefaultSelection
  demoMode: boolean
  hasUsableModelPreset: boolean
  isStartingOpeningHandRun: boolean
  isStartingTurnRun: boolean
  isLoadingStartingHand: boolean
  isStoppingFutureTurns: boolean
  isStoppingSimulation: boolean
  onStartOpeningHandRun: () => void
  onKeepResultsScrolledToBottom: () => void
  onModelPresetRequired: () => void
  onResultsScroll: (event: UIEvent<HTMLElement>) => void
  onScrollResultsToBottomIfKept: () => void
  onStartTurnRun: (turnNumber: number) => void
  onStopFutureTurns: () => void
  onStopSimulation: () => void
  onUpgradeUsage: () => void
  openingHandRunError: string | null
  readOnly: boolean
  resultsError: string | null
  resultsInfo: SimulationResultsInfo
  resultsPanelRef: RefObject<HTMLElement | null>
  showRunCost: boolean
  simulation: Simulation
  startingHand: StartingHand | null
  startingHandLoadError: string | null
  stopFutureTurnsError: string | null
  stopSimulationError: string | null
  turnRunError: string | null
}) {
  const billingTierContext = useOptionalBillingTier()
  const billingTier = billingTierContext?.billingTier ?? "free"
  const hasLoadedBillingTier =
    billingTierContext?.hasLoadedBillingTier ?? false
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
  const activeTurnNumbers = new Set(
    resultsInfo.turnLlmRuns
      .filter(
        (run) =>
          typeof run.turnNumber === "number" && isActiveLlmRunStatus(run.status)
      )
      .map((run) => run.turnNumber as number)
  )
  const isStartingSimulationRun =
    isStartingOpeningHandRun || isStartingTurnRun || isStoppingSimulation
  const isSimulationActionBlocked =
    readOnly ||
    isStartingSimulationRun ||
    isOpeningHandRunning ||
    isTurnRunning ||
    simulation.activeLlmRunCount > 0
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

  const actionError = openingHandRunError ?? turnRunError
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
      resultEntries: getSimulationResultEntries(run.mcpFunctionCalls),
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
      resultEntries: getSimulationResultEntries(run.mcpFunctionCalls),
    })),
  ]
  const allTimelineSteps = useMemo(
    () =>
      buildSimulationResultsTimelineSteps({
        hasPresetStartingHand,
        resultsInfo,
      }),
    [hasPresetStartingHand, resultsInfo]
  )
  const demoTurnSteps = useMemo(
    () => allTimelineSteps.filter(isSimulationTimelineTurnStep),
    [allTimelineSteps]
  )
  const demoOpeningHandStep =
    allTimelineSteps.find(isSimulationTimelineOpeningHandStep) ?? null
  const hasDemoOpeningHandStep = demoOpeningHandStep !== null
  const demoRootRef = useRef<HTMLDivElement | null>(null)
  const demoStartButtonRef = useRef<HTMLButtonElement | null>(null)
  const [demoHasStarted, setDemoHasStarted] = useState(false)
  const [demoIsReleasingIntroBlur, setDemoIsReleasingIntroBlur] =
    useState(false)
  const [demoHasRevealedOpeningHand, setDemoHasRevealedOpeningHand] =
    useState(false)
  const [demoRevealedTurnCount, setDemoRevealedTurnCount] = useState(0)
  const [
    demoSkipGameStateAnimationKey,
    setDemoSkipGameStateAnimationKey,
  ] = useState(0)
  const [demoCoachMarkVisual, setDemoCoachMarkVisual] =
    useState<DemoCoachMarkVisualState | null>(null)
  const [
    demoRevealAnimationStepId,
    setDemoRevealAnimationStepId,
  ] = useState<string | null>(null)
  const demoAnimatedStepIdsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    demoAnimatedStepIdsRef.current.clear()
    setDemoHasStarted(false)
    setDemoIsReleasingIntroBlur(false)
    setDemoHasRevealedOpeningHand(false)
    setDemoRevealedTurnCount(0)
    setDemoSkipGameStateAnimationKey(0)
    setDemoCoachMarkVisual(null)
    setDemoRevealAnimationStepId(null)
  }, [demoMode, simulation.id])

  useEffect(() => {
    if (!demoRevealAnimationStepId) {
      return
    }

    const clearAnimationStepId = window.setTimeout(() => {
      setDemoRevealAnimationStepId((currentStepId) =>
        currentStepId === demoRevealAnimationStepId ? null : currentStepId
      )
    }, SIMULATION_RESULT_REVEAL_ANIMATION_WINDOW_MS)

    return () => {
      window.clearTimeout(clearAnimationStepId)
    }
  }, [demoRevealAnimationStepId])

  useEffect(() => {
    if (!demoIsReleasingIntroBlur) {
      return
    }

    const animationFrameId = window.requestAnimationFrame(() => {
      setDemoIsReleasingIntroBlur(false)
    })

    return () => {
      window.cancelAnimationFrame(animationFrameId)
    }
  }, [demoIsReleasingIntroBlur])

  const demoNextTurnStep =
    demoMode && demoRevealedTurnCount < demoTurnSteps.length
      ? demoTurnSteps[demoRevealedTurnCount]
      : null
  const isDemoIntroOverlayVisible = demoMode && !demoHasStarted
  const timelineSteps = useMemo(() => {
    if (!demoMode || isDemoIntroOverlayVisible) {
      return allTimelineSteps
    }

    let remainingRevealedTurns = demoRevealedTurnCount

    return allTimelineSteps.filter((step) => {
      if (step.kind !== "turn" && hasDemoOpeningHandStep) {
        return demoHasRevealedOpeningHand
      }

      if (step.kind !== "turn") {
        return true
      }

      if (remainingRevealedTurns <= 0) {
        return false
      }

      remainingRevealedTurns -= 1
      return true
    })
  }, [
    allTimelineSteps,
    demoHasRevealedOpeningHand,
    demoMode,
    demoRevealedTurnCount,
    hasDemoOpeningHandStep,
    isDemoIntroOverlayVisible,
  ])
  const displayedTimelineSteps = useMemo<
    SimulationResultsDisplayTimelineStep[]
  >(() => {
    const steps: SimulationResultsDisplayTimelineStep[] = [...timelineSteps]

    if (demoMode && !isDemoIntroOverlayVisible) {
      if (demoOpeningHandStep && !demoHasRevealedOpeningHand) {
        steps.push(
          createDemoRevealTimelineStep({
            detailLabel: "Add opening hand",
            label: "Opening hand",
            targetStepId: demoOpeningHandStep.id,
          })
        )
        return steps
      }

      const nextTurnStep = demoNextTurnStep
      const turnNumber = nextTurnStep?.run?.turnNumber

      if (nextTurnStep && typeof turnNumber === "number") {
        steps.push(
          createDemoRevealTimelineStep({
            detailLabel: "Add turn",
            label: `Turn ${turnNumber}`,
            targetStepId: nextTurnStep.id,
          })
        )
      }

      return steps
    }

    if (renderedSimulationAction?.kind === "turn") {
      const turnNumber = renderedSimulationAction.turnNumber

      if (!hasSimulationTimelineTurnStep(timelineSteps, turnNumber)) {
        steps.push(createNextTurnTimelineStep(turnNumber, isStartingTurnRun))
      }
    }

    return steps
  }, [
    demoHasRevealedOpeningHand,
    demoMode,
    demoNextTurnStep,
    demoOpeningHandStep,
    isStartingTurnRun,
    isDemoIntroOverlayVisible,
    renderedSimulationAction,
    timelineSteps,
  ])
  const demoRevealTimelineStep =
    displayedTimelineSteps.find(
      (step): step is SimulationResultsDemoRevealTimelineStep =>
        step.kind === "demo_reveal"
    ) ?? null
  const demoFirstTurnStep = demoTurnSteps[0] ?? null
  const shouldShowDemoFirstTurnCoachMark =
    demoRevealTimelineStep !== null &&
    demoFirstTurnStep !== null &&
    demoFirstTurnStep.run?.turnNumber === 1 &&
    demoRevealedTurnCount === 0 &&
    demoRevealTimelineStep.targetStepId === demoFirstTurnStep.id
  const demoCoachMarkTargetStep =
    demoMode && demoHasStarted && shouldShowDemoFirstTurnCoachMark
      ? demoRevealTimelineStep
      : null
  const demoCoachMarkText = demoCoachMarkTargetStep
    ? "Simulate next turn"
    : "Try demo"
  const [
    selectedTimelineStepIdPreference,
    setSelectedTimelineStepIdPreference,
  ] = useState<string | null>(null)
  const previousSelectedTimelineStepIdRef = useRef<string | null>(null)
  const previousSelectedTimelineStepRef =
    useRef<SimulationResultsTimelineSelectionSnapshot | null>(null)
  const timelineScrollerRef = useRef<HTMLDivElement | null>(null)
  const timelineStepButtonRefs = useRef<Map<string, HTMLButtonElement>>(
    new Map()
  )
  useEffect(() => {
    if (demoMode && demoHasStarted && demoCoachMarkTargetStep) {
      return
    }

    setDemoCoachMarkVisual(null)
  }, [demoCoachMarkTargetStep, demoHasStarted, demoMode])

  useEffect(() => {
    if (
      !demoMode ||
      !demoHasStarted ||
      !demoCoachMarkVisual ||
      !demoCoachMarkTargetStep
    ) {
      return
    }

    const animationFrame = window.requestAnimationFrame(() => {
      const targetButton = timelineStepButtonRefs.current.get(
        demoCoachMarkTargetStep.id
      )
      const targetRect = getDemoCoachMarkTargetRect({
        root: demoRootRef.current,
        target: targetButton ?? null,
      })

      if (!targetRect) {
        return
      }

      setDemoCoachMarkVisual((currentVisual) =>
        currentVisual
          ? {
              phase: "coach",
              rect: targetRect,
            }
          : currentVisual
      )
    })

    return () => {
      window.cancelAnimationFrame(animationFrame)
    }
  }, [
    demoCoachMarkTargetStep,
    demoCoachMarkVisual?.phase,
    demoHasStarted,
    demoMode,
    displayedTimelineSteps,
  ])

  const runsByTimelineStepId = new Map(
    runs.map((run) => [getSimulationTimelineRunStepId(run.llmRunId), run])
  )
  const timelineDefaultSelection = isDemoIntroOverlayVisible
    ? "latest"
    : defaultTimelineSelection
  const selectedTimelineStepId = resolveSimulationResultsTimelineSelection(
    timelineSteps,
    selectedTimelineStepIdPreference,
    null,
    timelineDefaultSelection
  )
  const selectedTimelineStep =
    timelineSteps.find((step) => step.id === selectedTimelineStepId) ?? null
  const selectedTimelineStepSnapshot = useMemo(
    () =>
      selectedTimelineStep
        ? getSimulationTimelineStepSelectionSnapshot(selectedTimelineStep)
        : null,
    [selectedTimelineStep]
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

  const shouldAnimateDemoReveal =
    demoMode &&
    selectedTimelineStep !== null &&
    selectedTimelineStep.id === demoRevealAnimationStepId

  useSimulationResultReveal(resultsPanelRef, selectedTimelineRun, {
    forceAnimate: shouldAnimateDemoReveal,
  })

  useEffect(() => {
    if (!selectedTimelineStepId) {
      return
    }

    const timelineScroller = timelineScrollerRef.current
    const selectedTimelineButton =
      timelineStepButtonRefs.current.get(selectedTimelineStepId) ?? null

    if (!timelineScroller || !selectedTimelineButton) {
      return
    }

    const scrollerRect = timelineScroller.getBoundingClientRect()
    const buttonRect = selectedTimelineButton.getBoundingClientRect()
    const targetScrollLeft =
      timelineScroller.scrollLeft +
      buttonRect.left -
      scrollerRect.left +
      buttonRect.width / 2 -
      scrollerRect.width / 2
    const maxScrollLeft =
      timelineScroller.scrollWidth - timelineScroller.clientWidth
    const clampedScrollLeft = Math.max(
      0,
      Math.min(targetScrollLeft, maxScrollLeft)
    )

    timelineScroller.scrollTo({
      left: clampedScrollLeft,
      top: timelineScroller.scrollTop,
    })
  }, [displayedTimelineSteps, selectedTimelineStepId])

  useLayoutEffect(() => {
    const previousSelectedTimelineStepId =
      previousSelectedTimelineStepIdRef.current
    const previousSelectedTimelineStep = previousSelectedTimelineStepRef.current
    const finishedTimelineStep = previousSelectedTimelineStep
      ? (timelineSteps.find(
          (step) => step.id === previousSelectedTimelineStep.id
        ) ?? null)
      : null
    const shouldLockFinishedTimelineStep =
      selectedTimelineStepIdPreference === null &&
      shouldPreserveFinishedSimulationResultsTimelineSelection(
        previousSelectedTimelineStep,
        finishedTimelineStep
      )

    if (shouldLockFinishedTimelineStep && previousSelectedTimelineStep) {
      previousSelectedTimelineStepIdRef.current =
        previousSelectedTimelineStep.id
      previousSelectedTimelineStepRef.current = finishedTimelineStep
        ? getSimulationTimelineStepSelectionSnapshot(finishedTimelineStep)
        : previousSelectedTimelineStep
      setSelectedTimelineStepIdPreference(previousSelectedTimelineStep.id)
      return
    }

    previousSelectedTimelineStepIdRef.current = selectedTimelineStepId
    previousSelectedTimelineStepRef.current = selectedTimelineStepSnapshot

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
    selectedTimelineStepIdPreference,
    timelineSteps,
  ])

  function renderSimulationRunDetail(
    run: (typeof runs)[number],
    panelId: string | undefined,
    tabId: string | undefined
  ) {
    const runStatusMessage = getSimulationRunStatusMessage(run)
    const finishedDurationText = getSimulationRunFinishedDurationText(run)
    const shouldShowFinishedThinkingStatus =
      !run.isActive && getSimulationRunFinishedTimeMs(run) !== null
    const finishedThinkingStatus = shouldShowFinishedThinkingStatus ? (
      <SimulationResultThinkingStatus
        activeLabel={null}
        canStopFutureTurns={false}
        canStopSimulation={false}
        finishedDurationText={finishedDurationText}
        isBatchRun={run.processingMode === "openai_batch"}
        isPending={false}
        isFinishedSuccessfully={
          run.status === "completed" && runStatusMessage === null
        }
        isFinished={true}
        isStoppingFutureTurns={false}
        isStoppingSimulation={false}
        onStopFutureTurns={onStopFutureTurns}
        onUpgradeUsage={onUpgradeUsage}
        onStopSimulation={onStopSimulation}
        runStartTimeMs={null}
        shouldShowUsageUpgradeAction={shouldShowUsageUpgradeAction}
        stopFutureTurnsError={null}
        stopSimulationError={null}
        statusMessage={runStatusMessage}
      />
    ) : null
    const runMetadata = [
      run.status,
      run.model,
      showRunCost ? getLlmRunEstimatedPriceText(run) : null,
      finishedDurationText ? `took ${finishedDurationText}` : null,
      run.processingMode === "openai_batch" ? "batch" : null,
      run.outdated ? "outdated" : null,
    ].filter(Boolean)
    const shouldShowRunMetadata = !run.isActive && runMetadata.length > 0
    const shouldShowRunActions = run.canRerun
    const emptyRunMessage = shouldShowFinishedThinkingStatus
      ? null
      : runStatusMessage
    const isUsageLimitFailure = isUsageLimitFailureMessage(emptyRunMessage)
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
        {run.resultEntries.length > 0 ? (
          <SimulationMcpFunctionCallCards
            cardLookup={cardLookup}
            entries={run.resultEntries}
          />
        ) : null}

        {finishedThinkingStatus}

        {finalParsedOutput ? (
          <SimulationFinalOutputBlock
            cardLookup={cardLookup}
            finalOutput={finalParsedOutput}
          />
        ) : directTurnActions ? (
          <SimulationTurnActionsSurface
            cardLookup={cardLookup}
            turnActions={directTurnActions}
          />
        ) : null}

        {run.isActive ? (
          <SimulationResultThinkingStatus
            activeLabel={getActiveSimulationRunStatusLabel(run.status)}
            canStopFutureTurns={
              !readOnly &&
              run.status === "batch_submitted" &&
              simulation.autoSimulateNextStep
            }
            canStopSimulation={
              !readOnly &&
              run.status !== "cancel_requested" &&
              run.status !== "batch_submitted"
            }
            finishedDurationText={null}
            isBatchRun={run.processingMode === "openai_batch"}
            isPending={
              run.status === "pending" || run.status === "batch_pending"
            }
            isFinishedSuccessfully={false}
            isFinished={false}
            isStoppingFutureTurns={isStoppingFutureTurns}
            isStoppingSimulation={isStoppingSimulation}
            onStopFutureTurns={onStopFutureTurns}
            onUpgradeUsage={onUpgradeUsage}
            onStopSimulation={onStopSimulation}
            runStartTimeMs={getSimulationRunStartTimeMs(run)}
            shouldShowUsageUpgradeAction={shouldShowUsageUpgradeAction}
            stopFutureTurnsError={stopFutureTurnsError}
            stopSimulationError={stopSimulationError}
            statusMessage={runStatusMessage}
          />
        ) : run.resultEntries.length === 0 &&
          directTurnActions === null &&
          finalParsedOutput === null &&
          (run.status === "completed" ||
            emptyRunMessage !== null ||
            !shouldShowFinishedThinkingStatus) ? (
          <div
            className={`rounded-md border px-3 py-2 text-sm ${
              isUsageLimitFailure
                ? "border-amber-300/30 bg-amber-400/10 text-amber-100"
                : emptyRunMessage
                  ? "border-destructive/40 bg-destructive/10 text-destructive"
                  : "border-border bg-black/20 text-muted-foreground"
            }`}
            role={
              isUsageLimitFailure
                ? "status"
                : emptyRunMessage
                  ? "alert"
                  : undefined
            }
          >
            {isUsageLimitFailure ? (
              <UsageLimitReachedNotice
                detail={emptyRunMessage ?? undefined}
                onUpgradeUsage={onUpgradeUsage}
                shouldShowUsageUpgradeAction={shouldShowUsageUpgradeAction}
              />
            ) : (
              <p>
                {emptyRunMessage ??
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
                      : `Rerun turn ${run.turnNumber}`
                  }
                  title={
                    run.resultKind === "opening_hand"
                      ? "Rerun opening hand"
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

  function revealDemoStep(step: SimulationResultsDemoRevealTimelineStep) {
    const targetStep =
      allTimelineSteps.find(
        (timelineStep) => timelineStep.id === step.targetStepId
      ) ?? null

    if (!targetStep) {
      return
    }

    if (targetStep.kind !== "turn") {
      if (!demoAnimatedStepIdsRef.current.has(targetStep.id)) {
        demoAnimatedStepIdsRef.current.add(targetStep.id)
        setDemoRevealAnimationStepId(targetStep.id)
      }

      setDemoHasRevealedOpeningHand(true)
      setSelectedTimelineStepIdPreference(targetStep.id)
      onKeepResultsScrolledToBottom()
      return
    }

    if (!demoNextTurnStep || demoNextTurnStep.id !== targetStep.id) {
      return
    }

    if (!demoAnimatedStepIdsRef.current.has(targetStep.id)) {
      demoAnimatedStepIdsRef.current.add(targetStep.id)
      setDemoRevealAnimationStepId(targetStep.id)
    }

    setDemoRevealedTurnCount((currentCount) =>
      Math.min(currentCount + 1, demoTurnSteps.length)
    )
    setSelectedTimelineStepIdPreference(targetStep.id)
    onKeepResultsScrolledToBottom()
  }

  function handleStartDemo() {
    notifyParentDemoStarted()

    const startRect =
      getElementRectWithinRoot({
        element: demoStartButtonRef.current,
        root: demoRootRef.current,
      }) ?? getFallbackDemoCoachMarkRect(demoRootRef.current)
    const openingHandStepId = demoOpeningHandStep?.id ?? null

    demoAnimatedStepIdsRef.current.clear()
    if (openingHandStepId) {
      demoAnimatedStepIdsRef.current.add(openingHandStepId)
    }

    setDemoCoachMarkVisual(
      startRect
        ? {
            phase: "button",
            rect: startRect,
        }
        : null
    )
    setDemoHasStarted(true)
    setDemoIsReleasingIntroBlur(true)
    setDemoHasRevealedOpeningHand(true)
    setDemoRevealedTurnCount(0)
    setDemoSkipGameStateAnimationKey((currentKey) => currentKey + 1)
    setDemoRevealAnimationStepId(openingHandStepId)
    setSelectedTimelineStepIdPreference(openingHandStepId)
    onKeepResultsScrolledToBottom()
  }

  function renderTimelineHeader() {
    if (displayedTimelineSteps.length === 0) {
      return null
    }

    return (
      <header className="relative w-full shrink-0 bg-background px-5 py-3">
        <div className="w-full">
          <div
            ref={timelineScrollerRef}
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
                      if (step.kind === "demo_reveal") {
                        revealDemoStep(step)
                        return
                      }

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

  const resultsShell = (
    <SimulationResultsShell
      cardLookup={cardLookup}
      gameState={selectedGameState}
      header={renderTimelineHeader()}
      skipGameStateAnimationKey={demoSkipGameStateAnimationKey}
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

          {displayedTimelineSteps.length === 0 ? (
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
  )

  function renderDemoCoachMark() {
    if (!demoMode || !demoCoachMarkVisual) {
      return null
    }

    const isCoachMark = demoCoachMarkVisual.phase === "coach"
    const coachMarkStyle: CSSProperties = {
      height: demoCoachMarkVisual.rect.height,
      left: demoCoachMarkVisual.rect.left,
      top: demoCoachMarkVisual.rect.top,
      width: demoCoachMarkVisual.rect.width,
    }

    return (
      <div
        className={`pointer-events-none absolute z-40 flex items-center justify-center overflow-visible rounded-lg border text-center font-extrabold whitespace-nowrap transition-[top,left,width,height,background-color,border-color,color,box-shadow] duration-750 ease-out ${
          isCoachMark
            ? "border-sky-200 bg-sky-50 text-slate-950 shadow-2xl shadow-black/25"
            : "border-transparent bg-sky-300 text-slate-950 shadow-[0_14px_34px_rgba(56,189,248,0.22)]"
        }`}
        aria-label={isCoachMark ? demoCoachMarkText : "Try demo"}
        role="note"
        style={coachMarkStyle}
      >
        <span
          className={`absolute top-1/2 left-0 size-3 border-b border-l border-sky-200 bg-sky-50 transition-[opacity,transform] duration-300 ${
            isCoachMark
              ? "-translate-x-1/2 -translate-y-1/2 rotate-45 scale-100 opacity-100 delay-300"
              : "translate-x-1 -translate-y-1/2 rotate-45 scale-50 opacity-0"
          }`}
          aria-hidden="true"
        />
        <span
          className="relative grid min-w-0 place-items-center px-3"
          aria-hidden="true"
        >
          <span
            className={`col-start-1 row-start-1 flex items-center justify-center gap-2 text-base ${
              isCoachMark ? "opacity-0" : "opacity-100"
            }`}
          >
            <Play className="size-5" aria-hidden="true" />
            <span>Try demo</span>
          </span>
          <span
            className={`col-start-1 row-start-1 text-sm transition-opacity duration-[375ms] ease-out ${
              isCoachMark ? "opacity-100" : "opacity-0"
            }`}
          >
            {demoCoachMarkText}
          </span>
        </span>
      </div>
    )
  }

  return (
    <div ref={demoRootRef} className="relative h-full min-h-0 overflow-hidden">
      <div
        aria-hidden={isDemoIntroOverlayVisible ? "true" : undefined}
        className={
          isDemoIntroOverlayVisible || demoIsReleasingIntroBlur
            ? "pointer-events-none h-full min-h-0 blur-sm transition-[filter] duration-750 ease-out"
            : "h-full min-h-0 blur-0 transition-[filter] duration-750 ease-out"
        }
      >
        {resultsShell}
      </div>

      {isDemoIntroOverlayVisible ? (
        <div className="absolute inset-0 z-20 grid place-items-center bg-background/70 px-4 backdrop-blur-sm">
          <Button
            ref={demoStartButtonRef}
            type="button"
            size="lg"
            className="min-h-14 !bg-sky-300 !px-8 text-base font-extrabold !text-slate-950 shadow-[0_14px_34px_rgba(56,189,248,0.22)] transition-transform hover:-translate-y-px hover:!bg-sky-200 focus-visible:ring-sky-300/50 [&_svg]:size-5"
            onClick={handleStartDemo}
          >
            <Play data-icon="inline-start" />
            Try demo
          </Button>
        </div>
      ) : null}
      {renderDemoCoachMark()}
    </div>
  )
}

function notifyParentDemoStarted() {
  if (window.parent === window) {
    return
  }

  window.parent.postMessage(
    {
      type: DEMO_STARTED_PARENT_MESSAGE_TYPE,
    },
    "*"
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
  isStartingTurnRun: boolean,
  detailLabel = "Simulate next turn"
): SimulationResultsNextTurnTimelineStep {
  return {
    id: `action:turn:${turnNumber}`,
    kind: "simulate_turn",
    label: `Turn ${turnNumber}`,
    detailLabel,
    status: isStartingTurnRun ? "starting_turn" : "next_turn",
    turnNumber,
  }
}

function createDemoRevealTimelineStep({
  detailLabel,
  label,
  targetStepId,
}: {
  detailLabel: string
  label: string
  targetStepId: string
}): SimulationResultsDemoRevealTimelineStep {
  return {
    id: getDemoRevealTimelineStepId(targetStepId),
    kind: "demo_reveal",
    label,
    detailLabel,
    status: "next_turn",
    targetStepId,
  }
}

function getDemoRevealTimelineStepId(targetStepId: string) {
  return `action:demo-reveal:${targetStepId}`
}

function getElementRectWithinRoot({
  element,
  root,
}: {
  element: HTMLElement | null
  root: HTMLElement | null
}): DemoCoachMarkVisualState["rect"] | null {
  if (!element || !root) {
    return null
  }

  const elementRect = element.getBoundingClientRect()
  const rootRect = root.getBoundingClientRect()

  return {
    height: elementRect.height,
    left: elementRect.left - rootRect.left,
    top: elementRect.top - rootRect.top,
    width: elementRect.width,
  }
}

function getFallbackDemoCoachMarkRect(
  root: HTMLElement | null
): DemoCoachMarkVisualState["rect"] | null {
  if (!root) {
    return null
  }

  const rootRect = root.getBoundingClientRect()

  return {
    height: 56,
    left: Math.max(0, rootRect.width / 2 - DEMO_COACH_MARK_WIDTH_PX / 2),
    top: Math.max(0, rootRect.height / 2 - 28),
    width: DEMO_COACH_MARK_WIDTH_PX,
  }
}

function getDemoCoachMarkTargetRect({
  root,
  target,
}: {
  root: HTMLElement | null
  target: HTMLElement | null
}): DemoCoachMarkVisualState["rect"] | null {
  if (!root || !target) {
    return null
  }

  const rootRect = root.getBoundingClientRect()
  const targetRect = target.getBoundingClientRect()
  const width = Math.min(
    DEMO_COACH_MARK_WIDTH_PX,
    Math.max(0, rootRect.width - DEMO_COACH_MARK_EDGE_PADDING_PX * 2)
  )
  const minLeft = DEMO_COACH_MARK_EDGE_PADDING_PX
  const maxLeft = Math.max(
    minLeft,
    rootRect.width - width - DEMO_COACH_MARK_EDGE_PADDING_PX
  )
  const minTop = DEMO_COACH_MARK_EDGE_PADDING_PX
  const maxTop = Math.max(
    minTop,
    rootRect.height - DEMO_COACH_MARK_HEIGHT_PX - DEMO_COACH_MARK_EDGE_PADDING_PX
  )
  const rightSideLeft =
    targetRect.right - rootRect.left + DEMO_COACH_MARK_OFFSET_PX
  const centeredTop =
    targetRect.top -
    rootRect.top +
    targetRect.height / 2 -
    DEMO_COACH_MARK_HEIGHT_PX / 2

  return {
    height: DEMO_COACH_MARK_HEIGHT_PX,
    left: Math.min(Math.max(rightSideLeft, minLeft), maxLeft),
    top: Math.min(Math.max(centeredTop, minTop), maxTop),
    width,
  }
}

function isSimulationTimelineOpeningHandStep(
  step: SimulationResultsTimelineStep
) {
  return step.kind === "preset_opening_hand" || step.kind === "opening_hand"
}

function isSimulationTimelineTurnStep(step: SimulationResultsTimelineStep) {
  return step.kind === "turn"
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

function isSimulationTimelineResultStep(
  step: SimulationResultsDisplayTimelineStep
): step is SimulationResultsTimelineStep {
  return (
    step.kind === "preset_opening_hand" ||
    step.kind === "opening_hand" ||
    step.kind === "turn"
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

  if (step.status === "preset") {
    return "Preset"
  }

  if (step.status === "pending") {
    return "Queued"
  }

  if (step.status === "batch_pending") {
    return "Batch wait"
  }

  if (step.status === "batch_submitted") {
    return "Batched"
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
  if (step.kind === "demo_reveal") {
    return step.detailLabel
  }

  if (step.kind === "simulate_turn") {
    return step.detailLabel
  }

  if (step.kind === "preset_opening_hand") {
    return "Preset hand"
  }

  if (
    step.status === "pending" ||
    step.status === "batch_pending" ||
    step.status === "batch_submitted" ||
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

  if (step.kind === "demo_reveal" || step.kind === "simulate_turn") {
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

  if (step.kind === "demo_reveal" || step.kind === "simulate_turn") {
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

const simulationResultSurfaceClassName =
  "rounded-md border border-border bg-black/20"
const showSimulationResultCardImageToggle = false
const SIMULATION_RESULT_REVEAL_CLASS_NAME = "simulation-result-reveal"
const SIMULATION_RESULT_REVEAL_VISIBLE_CLASS_NAME =
  "simulation-result-reveal-visible"
const SIMULATION_RESULT_REVEAL_DELAY_PROPERTY =
  "--simulation-result-reveal-delay"
const SHOULD_ANIMATE_SIMULATION_RESULT_REVEAL = false
const SIMULATION_RESULT_REVEAL_STAGGER_MS = 40
const SIMULATION_RESULT_REVEAL_MAX_DELAY_MS = 600
const SIMULATION_RESULT_REVEAL_ANIMATION_WINDOW_MS =
  SIMULATION_RESULT_REVEAL_MAX_DELAY_MS + 250
const DEMO_COACH_MARK_WIDTH_PX = 192
const DEMO_COACH_MARK_HEIGHT_PX = 44
const DEMO_COACH_MARK_OFFSET_PX = 10
const DEMO_COACH_MARK_EDGE_PADDING_PX = 12

type DemoCoachMarkPhase = "button" | "coach"

type DemoCoachMarkVisualState = {
  phase: DemoCoachMarkPhase
  rect: {
    height: number
    left: number
    top: number
    width: number
  }
}

function useSimulationResultReveal(
  resultsPanelRef: RefObject<HTMLElement | null>,
  revealTrigger: unknown,
  {
    forceAnimate = false,
  }: {
    forceAnimate?: boolean
  } = {}
) {
  useLayoutEffect(() => {
    const resultsPanel = resultsPanelRef.current

    if (!resultsPanel) {
      return
    }

    const revealElements = getSimulationResultRevealElements(resultsPanel)

    if (revealElements.length === 0) {
      return
    }

    const shouldAnimateReveal =
      forceAnimate || SHOULD_ANIMATE_SIMULATION_RESULT_REVEAL

    if (!shouldAnimateReveal) {
      showSimulationResultRevealElementsWithoutAnimation(revealElements)
      return
    }

    let animationFrameId: number | null = null
    const scheduleVisibleReveal = () => {
      if (animationFrameId !== null) {
        return
      }

      animationFrameId = window.requestAnimationFrame(() => {
        animationFrameId = null
        revealVisibleSimulationResultElements(resultsPanel)
      })
    }

    const intersectionObserver =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(scheduleVisibleReveal, {
            root: resultsPanel,
          })
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(scheduleVisibleReveal)

    for (const element of revealElements) {
      intersectionObserver?.observe(element)
    }

    resizeObserver?.observe(resultsPanel)
    resultsPanel.addEventListener("scroll", scheduleVisibleReveal, {
      passive: true,
    })
    scheduleVisibleReveal()

    return () => {
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId)
      }

      intersectionObserver?.disconnect()
      resizeObserver?.disconnect()
      resultsPanel.removeEventListener("scroll", scheduleVisibleReveal)
    }
  }, [forceAnimate, resultsPanelRef, revealTrigger])
}

function getSimulationResultRevealElements(resultsPanel: HTMLElement) {
  return Array.from(
    resultsPanel.querySelectorAll<HTMLElement>(
      `.${SIMULATION_RESULT_REVEAL_CLASS_NAME}`
    )
  )
}

function showSimulationResultRevealElementsWithoutAnimation(
  revealElements: HTMLElement[]
) {
  for (const element of revealElements) {
    element.style.opacity = "1"
    element.style.transform = "none"
    element.style.willChange = "auto"
  }
}

function revealVisibleSimulationResultElements(resultsPanel: HTMLElement) {
  const visibleElements = getSimulationResultRevealElements(resultsPanel)
    .filter(
      (element) =>
        !element.classList.contains(
          SIMULATION_RESULT_REVEAL_VISIBLE_CLASS_NAME
        ) && isSimulationResultRevealElementVisible(element, resultsPanel)
    )
    .sort(compareSimulationResultRevealElements)

  visibleElements.forEach((element, index) => {
    element.style.setProperty(
      SIMULATION_RESULT_REVEAL_DELAY_PROPERTY,
      `${getSimulationResultRevealDelayMs(index)}ms`
    )
    element.classList.add(SIMULATION_RESULT_REVEAL_VISIBLE_CLASS_NAME)
  })
}

function isSimulationResultRevealElementVisible(
  element: HTMLElement,
  resultsPanel: HTMLElement
) {
  const elementRect = element.getBoundingClientRect()
  const resultsPanelRect = resultsPanel.getBoundingClientRect()

  return (
    elementRect.bottom > resultsPanelRect.top &&
    elementRect.top < resultsPanelRect.bottom
  )
}

function compareSimulationResultRevealElements(
  firstElement: HTMLElement,
  secondElement: HTMLElement
) {
  const firstRect = firstElement.getBoundingClientRect()
  const secondRect = secondElement.getBoundingClientRect()

  return firstRect.top - secondRect.top || firstRect.left - secondRect.left
}

function getSimulationResultRevealDelayMs(visibleIndex: number) {
  return Math.min(
    Math.max(0, visibleIndex) * SIMULATION_RESULT_REVEAL_STAGGER_MS,
    SIMULATION_RESULT_REVEAL_MAX_DELAY_MS
  )
}

function getSimulationResultEntries(
  mcpFunctionCalls: readonly SimulationMcpFunctionCall[]
): SimulationResultEntry[] {
  return [...mcpFunctionCalls]
    .sort(compareSimulationMcpFunctionCalls)
    .map((call) => ({
      id: `mcp-function-call-${call.id}`,
      type: "mcp_function_call",
      call,
    }))
}

function compareSimulationMcpFunctionCalls(
  firstCall: SimulationMcpFunctionCall,
  secondCall: SimulationMcpFunctionCall
) {
  const calledAtComparison =
    Date.parse(firstCall.calledAt) - Date.parse(secondCall.calledAt)

  return calledAtComparison || firstCall.id - secondCall.id
}

function getMcpFunctionCallReason(payload: unknown) {
  const payloadRecord = asPayloadRecord(payload)
  const argumentsRecord = asPayloadRecord(payloadRecord.arguments)

  return (
    getPayloadString(payloadRecord, "reason") ??
    getPayloadString(argumentsRecord, "reason")
  )
}

function SimulationMcpFunctionCallCards({
  cardLookup,
  entries,
}: {
  cardLookup: SimulationCardLookup
  entries: SimulationResultEntry[]
}) {
  function renderEntry(entry: SimulationResultEntry) {
    return (
      <SimulationMcpFunctionCallEvent
        call={entry.call}
        cardLookup={cardLookup}
      />
    )
  }

  return (
    <div className="grid gap-2">
      {entries.map((entry) => (
        <div key={entry.id} className="simulation-result-reveal">
          {renderEntry(entry)}
        </div>
      ))}
    </div>
  )
}

function SimulationResultThinkingStatus({
  activeLabel = null,
  canStopFutureTurns,
  canStopSimulation,
  finishedDurationText,
  isBatchRun = false,
  isPending,
  isFinished,
  isFinishedSuccessfully,
  isStoppingFutureTurns,
  isStoppingSimulation,
  onStopFutureTurns,
  onUpgradeUsage = () => {},
  onStopSimulation,
  runStartTimeMs,
  shouldShowUsageUpgradeAction = false,
  stopFutureTurnsError,
  stopSimulationError,
  statusMessage = null,
}: {
  activeLabel?: string | null
  canStopFutureTurns: boolean
  canStopSimulation: boolean
  finishedDurationText: string | null
  isBatchRun?: boolean
  isPending: boolean
  isFinished: boolean
  isFinishedSuccessfully: boolean
  isStoppingFutureTurns: boolean
  isStoppingSimulation: boolean
  onStopFutureTurns: () => void
  onUpgradeUsage?: () => void
  onStopSimulation: () => void
  runStartTimeMs: number | null
  shouldShowUsageUpgradeAction?: boolean
  stopFutureTurnsError: string | null
  stopSimulationError: string | null
  statusMessage?: string | null
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

  const activeElapsedText =
    runStartTimeMs === null || isFinished || isPending
      ? null
      : formatMinutesSeconds(currentTimeMs - runStartTimeMs)
  const statusLabel = getSimulationRunThinkingStatusLabel({
    activeLabel,
    finishedDurationText,
    isBatchRun,
    isFinished,
    isPending,
  })
  const isUsageLimitStatusMessage = isUsageLimitFailureMessage(statusMessage)

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
        {canStopFutureTurns ? (
          <Button
            className="h-8 rounded-full border border-amber-300/35 bg-amber-400/10 px-3 text-xs font-medium text-amber-100 hover:border-amber-200/60 hover:bg-amber-300/15 hover:text-amber-50"
            type="button"
            variant="ghost"
            disabled={isStoppingFutureTurns}
            onClick={onStopFutureTurns}
          >
            {isStoppingFutureTurns ? (
              <LoaderCircle data-icon="inline-start" className="animate-spin" />
            ) : (
              <Square data-icon="inline-start" />
            )}
            Stop future turns
          </Button>
        ) : null}
      </div>
      {statusMessage ? (
        <div
          className={`rounded-md border px-3 py-2 text-sm select-text ${
            isUsageLimitStatusMessage
              ? "border-amber-300/30 bg-amber-400/10 text-amber-100"
              : "border-destructive/40 bg-destructive/10 text-destructive"
          }`}
          role={isUsageLimitStatusMessage ? "status" : "alert"}
        >
          {isUsageLimitStatusMessage ? (
            <UsageLimitReachedNotice
              detail={statusMessage}
              onUpgradeUsage={onUpgradeUsage}
              shouldShowUsageUpgradeAction={shouldShowUsageUpgradeAction}
            />
          ) : (
            <p className="break-words whitespace-pre-wrap">{statusMessage}</p>
          )}
        </div>
      ) : null}
      {stopSimulationError ? (
        <p
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {stopSimulationError}
        </p>
      ) : null}
      {stopFutureTurnsError ? (
        <p
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {stopFutureTurnsError}
        </p>
      ) : null}
    </div>
  )
}

function isPublicSimulationExportV1(
  value: unknown
): value is PublicSimulationExportV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false
  }

  const record = value as Record<string, unknown>

  return (
    record.schemaVersion === 1 &&
    typeof record.exportedAt === "string" &&
    isPublicSimulationRecord(record.deck) &&
    isPublicSimulationRecord(record.simulation) &&
    isPublicSimulationRecord(record.results) &&
    (record.startingHand === null ||
      isPublicSimulationRecord(record.startingHand))
  )
}

function isPublicSimulationRecord(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function redactPublicSimulationRunCosts(
  publicSimulation: PublicSimulationExportV1
): PublicSimulationExportV1 {
  return {
    ...publicSimulation,
    results: {
      ...publicSimulation.results,
      openingHandLlmRuns:
        publicSimulation.results.openingHandLlmRuns.map(redactLlmRunCost),
      turnLlmRuns: publicSimulation.results.turnLlmRuns.map(redactLlmRunCost),
    },
  }
}

function redactLlmRunCost(run: SimulationDebugLlmRun): SimulationDebugLlmRun {
  return {
    ...run,
    estimatedPriceCents: null,
  }
}

function getSimulationRunThinkingStatusLabel({
  activeLabel,
  finishedDurationText,
  isBatchRun,
  isFinished,
  isPending,
}: {
  activeLabel: string | null
  finishedDurationText: string | null
  isBatchRun: boolean
  isFinished: boolean
  isPending: boolean
}) {
  if (isFinished) {
    return getFinishedSimulationRunStatusLabel({
      finishedDurationText,
      isBatchRun,
    })
  }

  if (activeLabel) {
    return activeLabel
  }

  return isPending ? "Pending" : "Thinking"
}

function getFinishedSimulationRunStatusLabel({
  finishedDurationText,
  isBatchRun,
}: {
  finishedDurationText: string | null
  isBatchRun: boolean
}) {
  if (isBatchRun) {
    return finishedDurationText
      ? `Batch run complete after ${finishedDurationText}`
      : "Batch run complete"
  }

  return finishedDurationText ? `Thought for ${finishedDurationText}` : "Thought"
}

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
    <div
      className={`simulation-result-reveal grid gap-3 p-3 ${simulationResultSurfaceClassName}`}
    >
      <SimulationResultSummaryMarkdown summary={finalOutput.summary} />
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
    <div className={`grid gap-3 p-3 ${simulationResultSurfaceClassName}`}>
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
  skipAnimationKey,
}: {
  cardLookup: SimulationCardLookup
  gameState: SimulationGameStateDisplay | null
  skipAnimationKey: number
}) {
  const hasRenderableGameState =
    gameState !== null &&
    (getSimulationGameStateZones(gameState.gameState).length > 0 ||
      gameState.libraryCardCount !== null)

  return (
    <aside
      className="simulation-scrollbar min-h-0 min-w-0 overflow-y-auto border-l border-border bg-background/70"
      aria-label="Game state"
    >
      <section className="grid gap-4 p-5">
        {gameState && hasRenderableGameState ? (
          <SimulationGameStateZonesBlock
            cardLookup={cardLookup}
            gameState={gameState.gameState}
            libraryCardCount={gameState.libraryCardCount}
            skipAnimationKey={skipAnimationKey}
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
  skipAnimationKey,
}: {
  cardLookup: SimulationCardLookup
  gameState: unknown
  libraryCardCount: number | null
  skipAnimationKey: number
}) {
  const zones = getSimulationGameStateZones(gameState)
  const syncSignature = getSimulationGameStateZonesCardsSignature(zones)
  const lastSettledSyncSignatureRef = useRef(syncSignature)
  const lastHandledSkipAnimationKeyRef = useRef(skipAnimationKey)
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

  useLayoutEffect(() => {
    if (skipAnimationKey === lastHandledSkipAnimationKeyRef.current) {
      return
    }

    lastHandledSkipAnimationKeyRef.current = skipAnimationKey
    const nextItems = getSimulationGameStateZoneCardPresenceItems({
      isExiting: false,
      zones,
    })

    lastSettledSyncSignatureRef.current = syncSignature
    visibleCardsRef.current = nextItems
    shouldSkipNextPositionAnimationRef.current = true
    previousCardLayoutRectsRef.current = new Map()
    setVisibleCards(nextItems)
  }, [skipAnimationKey, syncSignature, zones])

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
      className={`grid gap-3 p-3 ${simulationResultSurfaceClassName}`}
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
    "gameState" | "librarySnapshot" | "openingHand" | "phase"
  > | null,
  commanders: readonly DeckCard[]
): SimulationGameStateDisplay | null {
  if (!run) {
    return null
  }

  if (run.phase === "opening_hand") {
    if (!Array.isArray(run.openingHand)) {
      return null
    }

    return getOpeningHandGameStateDisplay(
      getCommanderCardNames(commanders),
      run.openingHand,
      getSimulationRunLibraryCardCount(run)
    )
  }

  if (run.phase !== "turn") {
    return null
  }

  if (!hasGameState(run.gameState)) {
    return null
  }

  return {
    gameState: run.gameState,
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
    <div
      className={`simulation-result-reveal grid gap-2 p-2 ${simulationResultSurfaceClassName}`}
    >
      {actions.length > 0 ? (
        <ul className="list-disc space-y-1 pl-4 text-sm leading-6 text-foreground/90">
          {actions.map((action, index) => (
            <li
              key={`${action.action}-${index}`}
              className="simulation-result-reveal"
            >
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
      <CardPreviewPill
        key={`${token.cardName}-${index}`}
        href={href}
        imageUrl={imageUrl}
        label={token.cardName}
        title={
          resolvedCard
            ? resolvedCard.name
            : `${token.cardName} could not be resolved from this deck.`
        }
        variant={resolvedCard ? "default" : "unresolved"}
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
      className={`simulation-result-reveal grid gap-2 px-2 py-1.5 ${simulationResultSurfaceClassName}`}
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
            <li
              key={`${action.action}-${index}`}
              className="simulation-result-reveal"
            >
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

function SimulationMcpFunctionCallEvent({
  call,
  cardLookup,
}: {
  call: SimulationMcpFunctionCall
  cardLookup: SimulationCardLookup
}) {
  const cardNames = getSimulationResultToolCardNames(call)

  if (cardNames.length > 0 && !isMcpFunctionCallFailure(call)) {
    return (
      <SimulationResultCompletedCardToolEvent
        call={call}
        cardLookup={cardLookup}
        cardNames={cardNames}
      />
    )
  }

  return (
    <SimulationResultToolLabelEvent
      icon={getMcpFunctionCallCompleteIcon(call)}
      title={getMcpFunctionCallCompleteTitle(call)}
      reason={getMcpFunctionCallDisplayReason(call)}
    />
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
      className={`${simulationResultSurfaceClassName} flex min-w-0 items-start gap-2 px-3 py-2 text-sm text-muted-foreground`}
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
  call,
  cardLookup,
  cardNames,
}: {
  call: SimulationMcpFunctionCall
  cardLookup: SimulationCardLookup
  cardNames: readonly string[]
}) {
  const [showCardImages, setShowCardImages] = useState(false)

  return (
    <div className={simulationResultSurfaceClassName}>
      <div className="grid gap-1 px-3 py-2 text-muted-foreground">
        <p className="text-sm">{getMcpFunctionCallCompleteTitle(call)}</p>
        <SimulationResultToolReasonText
          reason={getMcpFunctionCallDisplayReason(call)}
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
          <CardPreviewPill
            key={`${cardName}-${index}`}
            href={href}
            imageUrl={imageUrl}
            label={label}
            title={
              resolvedCard
                ? resolvedCard.name
                : `${cardName} could not be resolved from this deck.`
            }
            variant={resolvedCard ? "default" : "unresolved"}
          />
        )
      })}
    </div>
  )
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

function getSimulationRunStatusMessage(
  run: Pick<
    SimulationDebugLlmRun,
    "failureMessage" | "mcpFunctionCalls" | "status"
  >
) {
  const messages = new Set<string>()

  if (run.status === "failed") {
    messages.add(run.failureMessage?.trim() || "LLM run failed.")
  } else if (run.status === "cancelled") {
    messages.add(run.failureMessage?.trim() || "Run was cancelled.")
  }

  for (const call of run.mcpFunctionCalls) {
    const errorMessage = getMcpFunctionCallErrorMessage(call)

    if (errorMessage === null) {
      if (isMcpFunctionCallFailure(call)) {
        messages.add(getMcpFunctionCallCompleteTitle(call))
      }

      continue
    }

    messages.add(`${getMcpFunctionCallCompleteTitle(call)}: ${errorMessage}`)
  }

  return messages.size > 0 ? Array.from(messages).join("\n") : null
}

function getActiveSimulationRunStatusLabel(status: string) {
  if (status === "batch_pending") {
    return "Waiting for batch"
  }

  if (status === "batch_submitted") {
    return "Submitted to batch"
  }

  if (status === "cancel_requested") {
    return "Stopping"
  }

  if (status === "pending") {
    return "Queued"
  }

  return "Thinking"
}

function getMcpFunctionCallCompleteTitle(call: SimulationMcpFunctionCall) {
  const toolName = call.mcpFunctionName
  const knownToolLabel = getKnownSimulationResultToolLabel({
    mcpFunctionName: call.mcpFunctionName,
    mcpFunctionOutput: call.outputPayload,
    state: isMcpFunctionCallFailure(call) ? "failed" : "completed",
  })

  if (knownToolLabel !== null) {
    return knownToolLabel
  }

  if (isMcpFunctionCallFailure(call)) {
    return `Tool failed: ${toolName}`
  }

  return `Tool completed: ${toolName}`
}

function getMcpFunctionCallCompleteIcon(call: SimulationMcpFunctionCall) {
  if (
    call.mcpFunctionName === "shuffle_library" &&
    !isMcpFunctionCallFailure(call)
  ) {
    return <Shuffle className="size-4" />
  }

  return null
}

function getMcpFunctionCallDisplayReason(call: SimulationMcpFunctionCall) {
  return getSimulationResultToolReason({
    mcpFunctionName: call.mcpFunctionName,
    mcpFunctionOutput: call.outputPayload,
    mcpFunctionReason: getMcpFunctionCallReason(call.inputPayload),
  })
}

function isMcpFunctionCallFailure(call: SimulationMcpFunctionCall) {
  return (
    call.status === "failed" || getMcpFunctionCallErrorPayload(call) !== null
  )
}

function getMcpFunctionCallErrorMessage(call: SimulationMcpFunctionCall) {
  const errorPayload = getMcpFunctionCallErrorPayload(call)

  if (errorPayload === null) {
    if (call.status === "failed") {
      const directOutputMessage =
        typeof call.outputPayload === "string"
          ? call.outputPayload.trim() || null
          : (getPayloadTrimmedString(call.outputPayload, "message") ??
            getPayloadTrimmedString(call.outputPayload, "error") ??
            getPayloadTrimmedString(call.outputPayload, "code"))

      return directOutputMessage
    }

    return null
  }

  if (typeof errorPayload === "string") {
    return errorPayload.trim() || null
  }

  const directMessage =
    getPayloadTrimmedString(errorPayload, "message") ??
    getPayloadTrimmedString(errorPayload, "error") ??
    getPayloadTrimmedString(errorPayload, "code")

  if (directMessage !== null) {
    return directMessage
  }

  try {
    const serializedPayload = JSON.stringify(errorPayload)

    return serializedPayload === undefined || serializedPayload === "{}"
      ? null
      : serializedPayload
  } catch {
    return null
  }
}

function getMcpFunctionCallErrorPayload(call: SimulationMcpFunctionCall) {
  const outputRecord = asPayloadRecord(call.outputPayload)
  const errorValue = outputRecord.error

  if (typeof errorValue === "string") {
    return errorValue.trim() || null
  }

  const errorRecord = asPayloadRecord(errorValue)
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

function getPayloadTrimmedString(value: unknown, property: string) {
  const propertyValue = getPayloadString(value, property)?.trim()

  return propertyValue ? propertyValue : null
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
