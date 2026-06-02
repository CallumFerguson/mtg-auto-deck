import { useCallback, useEffect, useMemo, useState } from "react"
import {
  CheckCircle2,
  ClipboardCheck,
  LoaderCircle,
  RefreshCw,
  X,
  XCircle,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { loadApiHelpers } from "@/lib/api-lazy"
import type {
  CreateSimulationRunEvaluationResponse,
  LlmProcessingMode,
  SimulationRunEvaluation,
  SimulationRunEvaluationsResponse,
} from "@/lib/deck-types"
import {
  getLlmModelPresetLabel,
  type LlmModelPreset,
} from "@/lib/llm-model-preset-types"
import { FlexServiceTierSwitch } from "./SimulationSetupControls"

type EvaluationProcessingChoice = "realtime" | "flex" | "openai_batch"

type EvaluationTargetRun = {
  llmRunId: string
  resultKind: "opening_hand" | "turn"
  resultLabel: string
}

type SimulationRunEvaluationModalProps = {
  deckId: string
  defaultModelPresetId: string | null
  modelPresets: LlmModelPreset[]
  onClose: () => void
  run: EvaluationTargetRun
  simulationId: string
}

const ACTIVE_EVALUATION_STATUSES = new Set([
  "pending",
  "batch_pending",
  "batch_submitted",
  "streaming",
  "cancel_requested",
])

export function SimulationRunEvaluationModal({
  deckId,
  defaultModelPresetId,
  modelPresets,
  onClose,
  run,
  simulationId,
}: SimulationRunEvaluationModalProps) {
  const initialPresetId =
    (defaultModelPresetId &&
      modelPresets.some((preset) => preset.id === defaultModelPresetId)
      ? defaultModelPresetId
      : null) ??
    modelPresets[0]?.id ??
    ""
  const [evaluations, setEvaluations] = useState<SimulationRunEvaluation[]>([])
  const [selectedModelPresetId, setSelectedModelPresetId] =
    useState(initialPresetId)
  const [processingChoice, setProcessingChoice] =
    useState<EvaluationProcessingChoice>("realtime")
  const [isLoading, setIsLoading] = useState(true)
  const [isStarting, setIsStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const selectedModelPreset =
    modelPresets.find((preset) => preset.id === selectedModelPresetId) ?? null
  const canUseFlex = Boolean(selectedModelPreset?.supportsFlex)
  const canUseBatch = selectedModelPreset?.provider === "openai"
  const hasActiveEvaluation = evaluations.some((evaluation) =>
    ACTIVE_EVALUATION_STATUSES.has(evaluation.status)
  )

  const evaluationsUrl = useMemo(
    () =>
      `/decks/${encodeURIComponent(deckId)}/simulations/${encodeURIComponent(
        simulationId
      )}/runs/${encodeURIComponent(run.llmRunId)}/evaluations`,
    [deckId, run.llmRunId, simulationId]
  )

  const loadEvaluations = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const { API_BASE_URL, apiFetch, readApiError } = await loadApiHelpers()
      const response = await apiFetch(`${API_BASE_URL}${evaluationsUrl}`)

      if (!response.ok) {
        setError(
          await readApiError(response, "Evaluations could not be loaded.")
        )
        return
      }

      const data = (await response.json()) as SimulationRunEvaluationsResponse
      setEvaluations(data.evaluations)
    } catch {
      setError("Evaluations could not be loaded.")
    } finally {
      setIsLoading(false)
    }
  }, [evaluationsUrl])

  useEffect(() => {
    void loadEvaluations()
  }, [loadEvaluations])

  useEffect(() => {
    if (!hasActiveEvaluation) {
      return
    }

    const intervalId = window.setInterval(() => {
      void loadEvaluations()
    }, 1000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [hasActiveEvaluation, loadEvaluations])

  useEffect(() => {
    if (processingChoice === "flex" && !canUseFlex) {
      setProcessingChoice("realtime")
    }

    if (processingChoice === "openai_batch" && !canUseBatch) {
      setProcessingChoice("realtime")
    }
  }, [canUseBatch, canUseFlex, processingChoice])

  async function handleStartEvaluation() {
    if (!selectedModelPresetId || isStarting) {
      return
    }

    setIsStarting(true)
    setError(null)

    const llmProcessingMode: LlmProcessingMode =
      processingChoice === "openai_batch" ? "openai_batch" : "realtime"

    try {
      const { API_BASE_URL, apiFetch, readApiError } = await loadApiHelpers()
      const response = await apiFetch(`${API_BASE_URL}${evaluationsUrl}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          llmModelPresetId: selectedModelPresetId,
          llmProcessingMode,
          useFlexServiceTier: processingChoice === "flex",
        }),
      })

      if (!response.ok) {
        setError(
          await readApiError(response, "Evaluation could not be started.")
        )
        return
      }

      const data =
        (await response.json()) as CreateSimulationRunEvaluationResponse
      setEvaluations(data.evaluations)
    } catch {
      setError("Evaluation could not be started.")
    } finally {
      setIsStarting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 py-6 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <section
        aria-labelledby="simulation-run-evaluation-title"
        className="flex max-h-[calc(100svh-3rem)] w-full max-w-3xl flex-col rounded-lg border border-border bg-card shadow-2xl shadow-black/40"
        role="dialog"
        aria-modal="true"
      >
        <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <ClipboardCheck
                className="size-5 shrink-0 text-sky-300"
                aria-hidden
              />
              <h2
                id="simulation-run-evaluation-title"
                className="text-xl font-semibold text-foreground"
              >
                Evaluate {run.resultLabel}
              </h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {run.resultKind === "opening_hand" ? "Opening hand" : "Turn"} run
              audit
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Close evaluation"
            title="Close"
            onClick={onClose}
          >
            <X />
          </Button>
        </header>

        <div className="simulation-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <div className="grid gap-5">
            <section className="grid gap-3 rounded-md border border-border bg-background/35 px-4 py-4">
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <label className="grid gap-1 text-sm font-medium text-foreground">
                  Model preset
                  <select
                    className="h-9 min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-3 focus:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 sm:w-80"
                    value={selectedModelPresetId}
                    disabled={isStarting || modelPresets.length === 0}
                    onChange={(event) =>
                      setSelectedModelPresetId(event.target.value)
                    }
                  >
                    {modelPresets.length === 0 ? (
                      <option value="">No presets available</option>
                    ) : null}
                    {modelPresets.map((preset) => (
                      <option key={preset.id} value={preset.id}>
                        {getLlmModelPresetLabel(preset)}
                      </option>
                    ))}
                  </select>
                </label>
                <Button
                  type="button"
                  disabled={
                    isStarting ||
                    isLoading ||
                    !selectedModelPresetId ||
                    modelPresets.length === 0
                  }
                  onClick={() => void handleStartEvaluation()}
                >
                  {isStarting ? (
                    <LoaderCircle
                      className="animate-spin"
                      data-icon="inline-start"
                    />
                  ) : (
                    <ClipboardCheck data-icon="inline-start" />
                  )}
                  {isStarting ? "Starting..." : "Start evaluation"}
                </Button>
              </div>

              <div className="grid gap-2">
                <p className="text-sm font-medium text-foreground">
                  Processing
                </p>
                <div className="grid gap-2 sm:grid-cols-3">
                  <ProcessingChoiceButton
                    checked={processingChoice === "realtime"}
                    disabled={isStarting}
                    label="Realtime"
                    onClick={() => setProcessingChoice("realtime")}
                  />
                  <ProcessingChoiceButton
                    checked={processingChoice === "flex"}
                    disabled={isStarting || !canUseFlex}
                    label="Flex"
                    onClick={() => setProcessingChoice("flex")}
                  />
                  <ProcessingChoiceButton
                    checked={processingChoice === "openai_batch"}
                    disabled={isStarting || !canUseBatch}
                    label="Batch"
                    onClick={() => setProcessingChoice("openai_batch")}
                  />
                </div>
                {processingChoice === "flex" ? (
                  <FlexServiceTierSwitch
                    checked
                    disabled
                    label="Flex processing"
                    activeWarning="Less usage, slower processing."
                    onCheckedChange={() => undefined}
                  />
                ) : null}
              </div>

              {hasActiveEvaluation ? (
                <p className="rounded-md border border-sky-300/30 bg-sky-400/10 px-3 py-2 text-sm text-sky-100">
                  An evaluation is active for this run.
                </p>
              ) : null}
            </section>

            {error ? (
              <p
                className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                role="alert"
              >
                {error}
              </p>
            ) : null}

            <section className="grid gap-3" aria-label="Evaluation results">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-foreground">
                  Results
                </h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isLoading}
                  onClick={() => void loadEvaluations()}
                >
                  <RefreshCw
                    className={isLoading ? "animate-spin" : undefined}
                    data-icon="inline-start"
                  />
                  Refresh
                </Button>
              </div>

              {isLoading && evaluations.length === 0 ? (
                <p className="rounded-md border border-border bg-black/20 px-3 py-3 text-sm text-muted-foreground">
                  Loading evaluations...
                </p>
              ) : evaluations.length === 0 ? (
                <p className="rounded-md border border-border bg-black/20 px-3 py-3 text-sm text-muted-foreground">
                  No evaluations yet.
                </p>
              ) : (
                <div className="grid gap-3">
                  {[...evaluations].reverse().map((evaluation) => (
                    <EvaluationResultCard
                      key={evaluation.id}
                      evaluation={evaluation}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </section>
    </div>
  )
}

function ProcessingChoiceButton({
  checked,
  disabled,
  label,
  onClick,
}: {
  checked: boolean
  disabled: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={checked}
      className={`flex h-10 items-center justify-center rounded-md border px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        checked
          ? "border-sky-300/55 bg-sky-400/15 text-sky-100"
          : "border-border bg-background/50 text-muted-foreground hover:bg-muted/45 hover:text-foreground"
      }`}
      onClick={onClick}
    >
      {label}
    </button>
  )
}

function EvaluationResultCard({
  evaluation,
}: {
  evaluation: SimulationRunEvaluation
}) {
  const isCompleted = evaluation.status === "completed"
  const isActive = ACTIVE_EVALUATION_STATUSES.has(evaluation.status)
  const metadata = [
    `Attempt ${evaluation.attemptNumber}`,
    evaluation.llmModelPresetName ?? evaluation.model,
    evaluation.processingMode === "openai_batch" ? "batch" : null,
    evaluation.serviceTier === "flex" ? "flex" : null,
    evaluation.estimatedPriceCents
      ? `${evaluation.estimatedPriceCents} cents`
      : null,
  ].filter(Boolean)

  return (
    <article className="grid gap-3 rounded-md border border-border bg-background/35 px-4 py-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">
            Evaluation {evaluation.attemptNumber}
          </p>
          <p className="mt-1 text-xs break-words text-muted-foreground">
            {metadata.join(" / ")}
          </p>
        </div>
        <EvaluationStatusBadge
          isActive={isActive}
          status={evaluation.status}
        />
      </div>

      {isCompleted ? (
        <>
          <div className="grid gap-2 sm:grid-cols-3">
            <EvaluationPassBadge
              label="Legal"
              value={evaluation.legalPass}
            />
            <EvaluationPassBadge
              label="Strategic"
              value={evaluation.strategicPass}
            />
            <div className="rounded-md border border-border bg-black/20 px-3 py-2">
              <p className="text-xs text-muted-foreground">Quality</p>
              <p className="mt-1 text-lg font-semibold text-foreground">
                {evaluation.simulationQualityScore?.toFixed(1) ?? "-"} / 10
              </p>
            </div>
          </div>
          <EvaluationTextValue
            label="Quality score reasoning"
            value={evaluation.simulationQualityScoreReasoning}
          />
          <EvaluationIssueList
            label="Illegal actions"
            values={evaluation.illegalActions}
          />
          <EvaluationIssueList
            label="Strategic mistakes"
            values={evaluation.strategicMistakes}
          />
        </>
      ) : evaluation.failureMessage ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {evaluation.failureMessage}
        </p>
      ) : isActive ? (
        <p className="rounded-md border border-sky-300/30 bg-sky-400/10 px-3 py-2 text-sm text-sky-100">
          Evaluation in progress.
        </p>
      ) : null}
    </article>
  )
}

function EvaluationStatusBadge({
  isActive,
  status,
}: {
  isActive: boolean
  status: string
}) {
  return (
    <span
      className={`inline-flex w-fit items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${
        status === "completed"
          ? "border-emerald-300/35 bg-emerald-400/10 text-emerald-100"
          : status === "failed" || status === "cancelled"
            ? "border-destructive/40 bg-destructive/10 text-destructive"
            : "border-sky-300/35 bg-sky-400/10 text-sky-100"
      }`}
    >
      {isActive ? (
        <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
      ) : status === "completed" ? (
        <CheckCircle2 className="size-3.5" aria-hidden />
      ) : (
        <XCircle className="size-3.5" aria-hidden />
      )}
      {formatEvaluationStatus(status)}
    </span>
  )
}

function EvaluationPassBadge({
  label,
  value,
}: {
  label: string
  value: boolean | null
}) {
  return (
    <div
      className={`rounded-md border px-3 py-2 ${
        value
          ? "border-emerald-300/35 bg-emerald-400/10"
          : "border-destructive/40 bg-destructive/10"
      }`}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`mt-1 flex items-center gap-1 text-sm font-semibold ${
          value ? "text-emerald-100" : "text-destructive"
        }`}
      >
        {value ? (
          <CheckCircle2 className="size-4" aria-hidden />
        ) : (
          <XCircle className="size-4" aria-hidden />
        )}
        {value ? "Pass" : "Fail"}
      </p>
    </div>
  )
}

function EvaluationTextValue({
  label,
  value,
}: {
  label: string
  value: string | null
}) {
  return (
    <div className="grid gap-1 rounded-md border border-border bg-black/20 px-3 py-2">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-sm break-words text-foreground">
        {value ?? "None"}
      </p>
    </div>
  )
}

function EvaluationIssueList({
  label,
  values,
}: {
  label: string
  values: string[]
}) {
  return (
    <div className="grid gap-1 rounded-md border border-border bg-black/20 px-3 py-2">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {values.length === 0 ? (
        <p className="text-sm text-foreground">None</p>
      ) : (
        <ul className="grid gap-1 text-sm text-foreground">
          {values.map((value, index) => (
            <li key={`${label}-${index}`} className="break-words">
              {value}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function formatEvaluationStatus(status: string) {
  if (status === "streaming") {
    return "Running"
  }

  if (status === "batch_pending") {
    return "Waiting for batch"
  }

  if (status === "batch_submitted") {
    return "Submitted to batch"
  }

  if (status === "cancel_requested") {
    return "Stopping"
  }

  return status
}
