import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { Bug, Download, LoaderCircle, RefreshCw, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { loadApiHelpers } from "@/lib/api-lazy"
import { useOptionalBillingTier } from "@/lib/billing-tier-state"
import type {
  LlmProcessingMode,
  Simulation,
  SimulationDebugInfo,
  SimulationDebugResponse,
  StartingHand,
  UpdateSimulationResponse,
} from "@/lib/deck-types"
import {
  formatProviderLabel,
  getLlmModelPresetLabel,
  type LlmModelPreset,
} from "@/lib/llm-model-preset-types"
import {
  getLlmRunEstimatedPriceText,
  getSimulationRunFinishedDurationText,
} from "./simulationRunFormatting"
import {
  FlexServiceTierRequiredModal,
  FlexServiceTierSwitch,
  FreeTierModelPresetRequiredModal,
} from "./SimulationSetupControls"

export function SimulationDetailsModal({
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
  const [isExportingSimulation, setIsExportingSimulation] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const isLoadingDebugInfoRef = useRef(false)
  const shouldSimulateOpeningHand = simulation.startingHandId === null
  const selectedModelPreset =
    modelPresets.find((preset) => preset.id === simulation.llmModelPresetId) ??
    null

  const handleRefreshDebugInfo = useCallback(async () => {
    if (isLoadingDebugInfoRef.current) {
      return
    }

    isLoadingDebugInfoRef.current = true
    setIsLoadingDebugInfo(true)
    setDebugInfoError(null)

    try {
      const { API_BASE_URL, apiFetch, readApiError } = await loadApiHelpers()
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
    setExportError(null)
  }, [simulation.id])

  useEffect(() => {
    if (!isDebugModalOpen) {
      return
    }

    void handleRefreshDebugInfo()
  }, [handleRefreshDebugInfo, isDebugModalOpen])

  async function handleExportSimulation() {
    if (isExportingSimulation) {
      return
    }

    setIsExportingSimulation(true)
    setExportError(null)

    try {
      const { API_BASE_URL, apiFetch, readApiError } = await loadApiHelpers()
      const response = await apiFetch(
        `${API_BASE_URL}/decks/${deckId}/simulations/${simulation.id}/export`
      )

      if (!response.ok) {
        setExportError(
          await readApiError(response, "Simulation JSON could not be exported.")
        )
        return
      }

      const blob = await response.blob()
      const downloadUrl = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = downloadUrl
      link.download = `${simulation.id}.json`
      document.body.append(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(downloadUrl)
    } catch {
      setExportError("Simulation JSON could not be exported.")
    } finally {
      setIsExportingSimulation(false)
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
                <div className="rounded-md border border-border bg-background/35 p-3 sm:col-span-2">
                  <dt className="text-muted-foreground">LLM options</dt>
                  <dd className="mt-2 grid gap-3">
                    <SimulationModelPresetSelector
                      deckId={deckId}
                      modelPresets={modelPresets}
                      onSimulationUpdated={onSimulationUpdated}
                      selectedModelPreset={selectedModelPreset}
                      simulation={simulation}
                    />
                    <SimulationLlmOptionsSetting
                      deckId={deckId}
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
                    disabled={isExportingSimulation}
                    onClick={() => void handleExportSimulation()}
                  >
                    {isExportingSimulation ? (
                      <LoaderCircle
                        className="animate-spin"
                        data-icon="inline-start"
                      />
                    ) : (
                      <Download data-icon="inline-start" />
                    )}
                    {isExportingSimulation ? "Exporting..." : "Export JSON"}
                  </Button>
                </div>
                {exportError ? (
                  <p
                    className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                    role="alert"
                  >
                    {exportError}
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

function SimulationLlmOptionsSetting({
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
  const billingTierContext = useOptionalBillingTier()
  const isFreeBillingTier = billingTierContext
    ? billingTierContext.hasLoadedBillingTier &&
      billingTierContext.billingTier === "free"
    : true
  const [selectedProcessingMode, setSelectedProcessingMode] =
    useState<LlmProcessingMode>(simulation.llmProcessingMode)
  const [selectedUseFlexServiceTier, setSelectedUseFlexServiceTier] = useState(
    simulation.useFlexServiceTier
  )
  const [isSaving, setIsSaving] = useState(false)
  const [isFlexRequiredModalOpen, setIsFlexRequiredModalOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supportsFlex = Boolean(selectedModelPreset?.supportsFlex)
  const isLocked =
    simulation.status === "running" || simulation.activeLlmRunCount > 0
  const isBatchEnabled = selectedProcessingMode === "openai_batch"
  const isFreeTierFlexRestricted = isFreeBillingTier && supportsFlex
  const flexChecked =
    selectedProcessingMode === "realtime" && selectedUseFlexServiceTier
  const shouldShowFreeTierFlexWarning = isFreeTierFlexRestricted && !flexChecked

  useEffect(() => {
    setSelectedProcessingMode(simulation.llmProcessingMode)
    setSelectedUseFlexServiceTier(simulation.useFlexServiceTier)
    setError(null)
  }, [
    simulation.id,
    simulation.llmProcessingMode,
    simulation.useFlexServiceTier,
  ])

  async function handleFlexServiceTierChange(nextUseFlexServiceTier: boolean) {
    const nextProcessingMode: LlmProcessingMode = "realtime"

    if (isFreeTierFlexRestricted && flexChecked && !nextUseFlexServiceTier) {
      setSelectedProcessingMode(nextProcessingMode)
      setSelectedUseFlexServiceTier(true)
      setIsFlexRequiredModalOpen(true)
      return
    }

    if (
      isSaving ||
      isLocked ||
      (nextUseFlexServiceTier && !supportsFlex) ||
      (nextProcessingMode === simulation.llmProcessingMode &&
        nextUseFlexServiceTier === simulation.useFlexServiceTier)
    ) {
      return
    }

    setSelectedProcessingMode(nextProcessingMode)
    setSelectedUseFlexServiceTier(nextUseFlexServiceTier)
    setIsSaving(true)
    setError(null)

    try {
      const { API_BASE_URL, apiFetch, readApiError } = await loadApiHelpers()
      const response = await apiFetch(
        `${API_BASE_URL}/decks/${deckId}/simulations/${simulation.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            llmProcessingMode: nextProcessingMode,
            useFlexServiceTier: nextUseFlexServiceTier,
          }),
        }
      )

      if (!response.ok) {
        setSelectedProcessingMode(simulation.llmProcessingMode)
        setSelectedUseFlexServiceTier(simulation.useFlexServiceTier)
        setError(
          await readApiError(
            response,
            "LLM processing options could not be updated."
          )
        )
        return
      }

      const data = (await response.json()) as UpdateSimulationResponse
      onSimulationUpdated(data.simulation)
    } catch {
      setSelectedProcessingMode(simulation.llmProcessingMode)
      setSelectedUseFlexServiceTier(simulation.useFlexServiceTier)
      setError("LLM processing options could not be updated.")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <>
      <div className="grid gap-2">
        {isBatchEnabled ? (
          <p className="rounded-md border border-sky-300/35 bg-sky-400/10 px-3 py-2 text-sm font-medium text-sky-100">
            Batch processing enabled
          </p>
        ) : null}
        <FlexServiceTierSwitch
          checked={flexChecked}
          disabled={isSaving || isLocked || !supportsFlex}
          label="Flex processing"
          activeWarning="Less usage, but simulation may be slower and has a higher chance of failing."
          onCheckedChange={(nextEnabled) =>
            void handleFlexServiceTierChange(nextEnabled)
          }
        />
        {shouldShowFreeTierFlexWarning ? (
          <p className="rounded-md border border-amber-300/35 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
            Free tier users must use flex processing before starting LLM calls.
          </p>
        ) : null}
        {isLocked ? (
          <p className="text-sm text-muted-foreground">
            Processing options are locked while this simulation is running.
          </p>
        ) : null}
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

      {isFlexRequiredModalOpen ? (
        <FlexServiceTierRequiredModal
          onClose={() => setIsFlexRequiredModalOpen(false)}
        />
      ) : null}
    </>
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
  const billingTierContext = useOptionalBillingTier()
  const isFreeBillingTier = billingTierContext
    ? billingTierContext.hasLoadedBillingTier &&
      billingTierContext.billingTier === "free"
    : true
  const [selectedPresetId, setSelectedPresetId] = useState(
    simulation.llmModelPresetId ?? ""
  )
  const [isSaving, setIsSaving] = useState(false)
  const [
    isFreeTierModelPresetRequiredModalOpen,
    setIsFreeTierModelPresetRequiredModalOpen,
  ] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const currentPresetUnavailable =
    Boolean(simulation.llmModelPresetId) && selectedModelPreset === null
  const shouldShowFreeTierModelPresetWarning =
    isFreeBillingTier &&
    selectedModelPreset !== null &&
    !selectedModelPreset.isFreeTier

  useEffect(() => {
    setSelectedPresetId(simulation.llmModelPresetId ?? "")
    setError(null)
  }, [simulation.id, simulation.llmModelPresetId])

  async function handleModelPresetChange(nextPresetId: string) {
    setError(null)

    if (!nextPresetId || nextPresetId === simulation.llmModelPresetId) {
      setSelectedPresetId(nextPresetId)
      return
    }

    const nextPreset =
      modelPresets.find((preset) => preset.id === nextPresetId) ?? null

    if (isFreeBillingTier && nextPreset && !nextPreset.isFreeTier) {
      setSelectedPresetId(simulation.llmModelPresetId ?? "")
      setIsFreeTierModelPresetRequiredModalOpen(true)
      return
    }

    setSelectedPresetId(nextPresetId)

    const nextLlmProcessingMode =
      simulation.llmProcessingMode === "openai_batch" &&
      nextPreset?.provider !== "openai"
        ? "realtime"
        : undefined
    const nextUseFlexServiceTier =
      simulation.useFlexServiceTier && !nextPreset?.supportsFlex
        ? false
        : undefined

    setIsSaving(true)

    try {
      const { API_BASE_URL, apiFetch, readApiError } = await loadApiHelpers()
      const response = await apiFetch(
        `${API_BASE_URL}/decks/${deckId}/simulations/${simulation.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            llmModelPresetId: nextPresetId,
            ...(nextLlmProcessingMode
              ? { llmProcessingMode: nextLlmProcessingMode }
              : {}),
            ...(nextUseFlexServiceTier !== undefined
              ? { useFlexServiceTier: nextUseFlexServiceTier }
              : {}),
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
    <>
      <div className="grid gap-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <label
            className="text-sm font-medium text-foreground"
            htmlFor={`simulation-model-preset-${simulation.id}`}
          >
            Intellegence level
          </label>
          <select
            id={`simulation-model-preset-${simulation.id}`}
            className="h-9 min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-3 focus:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 sm:w-80"
            value={selectedPresetId}
            disabled={isSaving || modelPresets.length === 0}
            onChange={(event) =>
              void handleModelPresetChange(event.target.value)
            }
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
              </option>
            ))}
          </select>
        </div>
        {!selectedModelPreset && simulation.llmModelPresetId ? (
          <p className="rounded-md border border-amber-300/35 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
            The selected preset is disabled or unavailable. Future LLM calls are
            blocked until an enabled preset is selected.
          </p>
        ) : !selectedModelPreset ? (
          <p className="rounded-md border border-amber-300/35 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
            Select a model preset before starting future LLM calls.
          </p>
        ) : null}
        {shouldShowFreeTierModelPresetWarning ? (
          <p className="rounded-md border border-amber-300/35 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
            Free tier users must choose a free tier model preset before starting
            LLM calls.
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
      </div>

      {isFreeTierModelPresetRequiredModalOpen ? (
        <FreeTierModelPresetRequiredModal
          onClose={() => setIsFreeTierModelPresetRequiredModalOpen(false)}
        />
      ) : null}
    </>
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
            label="Intellegence level"
            value={getDebugModelPresetLabel(
              debugInfo.llmModelPresetId,
              null,
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
            label="Reasoning summaries"
            value={formatDebugBoolean(debugInfo.reasoningSummariesEnabled)}
          />
          <DebugMetadataItem
            label="Processing mode"
            value={formatDebugProcessingMode(debugInfo.llmProcessingMode)}
          />
          <DebugMetadataItem
            label="Flex service tier"
            value={formatDebugBoolean(debugInfo.useFlexServiceTier)}
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
              <DebugMetadataItem
                label="Provider"
                value={formatProviderLabel(run.provider)}
              />
              <DebugMetadataItem label="Model" value={run.model} />
              <DebugMetadataItem
                label="Intellegence level"
                value={getDebugModelPresetLabel(
                  run.llmModelPresetId,
                  run.llmModelPresetName,
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
  presetName: string | null,
  modelPresets: readonly LlmModelPreset[]
) {
  if (presetName) {
    return presetName
  }

  if (!presetId) {
    return "N/A"
  }

  const preset = modelPresets.find((candidate) => candidate.id === presetId)

  return preset ? getLlmModelPresetLabel(preset) : presetId
}

function formatDebugBoolean(value: boolean) {
  return value ? "Yes" : "No"
}

function formatDebugProcessingMode(value: LlmProcessingMode) {
  return value === "openai_batch" ? "OpenAI Batch" : "Realtime"
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
