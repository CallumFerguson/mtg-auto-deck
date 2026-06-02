import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import {
  BarChart3,
  BrainCircuit,
  CheckCircle2,
  ExternalLink,
  LoaderCircle,
  RefreshCw,
  X,
  XCircle,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { API_BASE_URL, apiFetch } from "@/lib/api"
import { readApiError } from "@/lib/api-error"
import type {
  AdminBenchmark,
  AdminBenchmarkEvaluationAttentionResult,
  AdminBenchmarkEvaluationSummary,
  AdminBenchmarkEvaluationsResponse,
  StartAdminBenchmarkEvaluationsResponse,
} from "@/lib/admin-types"
import type { LlmProcessingMode } from "@/lib/deck-types"
import {
  getLlmModelPresetLabel,
  type LlmModelPreset,
} from "@/lib/llm-model-preset-types"
import { getDeckSimulationPath } from "@/lib/navigation"
import { FlexServiceTierSwitch } from "../deck-simulation/SimulationSetupControls"

type BenchmarkEvaluationProcessingChoice = "realtime" | "flex" | "openai_batch"

type BenchmarkEvaluationModalProps = {
  benchmark: AdminBenchmark
  modelPresets: LlmModelPreset[]
  onClose: () => void
}

export function BenchmarkEvaluationModal({
  benchmark,
  modelPresets,
  onClose,
}: BenchmarkEvaluationModalProps) {
  const initialPresetId =
    (modelPresets.some((preset) => preset.id === benchmark.llmModelPresetId)
      ? benchmark.llmModelPresetId
      : null) ??
    modelPresets[0]?.id ??
    ""
  const [selectedModelPresetId, setSelectedModelPresetId] =
    useState(initialPresetId)
  const [processingChoice, setProcessingChoice] =
    useState<BenchmarkEvaluationProcessingChoice>("realtime")
  const [summary, setSummary] =
    useState<AdminBenchmarkEvaluationSummary | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isStarting, setIsStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [startMessage, setStartMessage] = useState<string | null>(null)
  const selectedModelPreset =
    modelPresets.find((preset) => preset.id === selectedModelPresetId) ?? null
  const canUseFlex = Boolean(selectedModelPreset?.supportsFlex)
  const canUseBatch = selectedModelPreset?.provider === "openai"
  const hasActiveEvaluations = (summary?.activeEvaluationCount ?? 0) > 0
  const evaluationsUrl = useMemo(
    () =>
      `${API_BASE_URL}/admin/benchmarks/${encodeURIComponent(
        benchmark.id
      )}/evaluations`,
    [benchmark.id]
  )

  const loadSummary = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await apiFetch(evaluationsUrl)

      if (!response.ok) {
        setError(await readApiError(response, "Evaluations could not be loaded."))
        return
      }

      const data = (await response.json()) as AdminBenchmarkEvaluationsResponse
      setSummary(data.summary)
    } catch {
      setError("Evaluations could not be loaded.")
    } finally {
      setIsLoading(false)
    }
  }, [evaluationsUrl])

  useEffect(() => {
    void loadSummary()
  }, [loadSummary])

  useEffect(() => {
    if (!hasActiveEvaluations) {
      return
    }

    const intervalId = window.setInterval(() => {
      void loadSummary()
    }, 1000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [hasActiveEvaluations, loadSummary])

  useEffect(() => {
    if (processingChoice === "flex" && !canUseFlex) {
      setProcessingChoice("realtime")
    }

    if (processingChoice === "openai_batch" && !canUseBatch) {
      setProcessingChoice("realtime")
    }
  }, [canUseBatch, canUseFlex, processingChoice])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose()
      }
    }

    window.addEventListener("keydown", handleKeyDown)

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [onClose])

  async function handleStartEvaluations() {
    if (!selectedModelPresetId || isStarting) {
      return
    }

    setIsStarting(true)
    setError(null)
    setStartMessage(null)

    const llmProcessingMode: LlmProcessingMode =
      processingChoice === "openai_batch" ? "openai_batch" : "realtime"

    try {
      const response = await apiFetch(evaluationsUrl, {
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
          await readApiError(response, "Evaluations could not be started.")
        )
        return
      }

      const data =
        (await response.json()) as StartAdminBenchmarkEvaluationsResponse
      setSummary(data.summary)
      setStartMessage(
        [
          `${data.startedEvaluationCount} ${
            data.startedEvaluationCount === 1 ? "evaluation" : "evaluations"
          } started`,
          `${data.skippedRunCount} ${
            data.skippedRunCount === 1 ? "run" : "runs"
          } skipped`,
          data.errorMessage,
        ]
          .filter(Boolean)
          .join(" / ")
      )
    } catch {
      setError("Evaluations could not be started.")
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
        aria-labelledby="benchmark-evaluation-title"
        className="flex max-h-[calc(100svh-3rem)] w-full max-w-4xl flex-col rounded-lg border border-border bg-card shadow-2xl shadow-black/40"
        role="dialog"
        aria-modal="true"
      >
        <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <BrainCircuit
                className="size-5 shrink-0 text-sky-300"
                aria-hidden
              />
              <h2
                id="benchmark-evaluation-title"
                className="text-xl font-semibold text-foreground"
              >
                Evaluate benchmark
              </h2>
            </div>
            <p className="mt-1 text-sm break-words text-muted-foreground">
              {getBenchmarkEvaluationLabel(benchmark)}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Close benchmark evaluation"
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
                  onClick={() => void handleStartEvaluations()}
                >
                  {isStarting ? (
                    <LoaderCircle
                      className="animate-spin"
                      data-icon="inline-start"
                    />
                  ) : (
                    <BrainCircuit data-icon="inline-start" />
                  )}
                  {isStarting ? "Starting..." : "Start evaluations"}
                </Button>
              </div>

              <div className="grid gap-2">
                <p className="text-sm font-medium text-foreground">
                  Processing
                </p>
                <div className="grid gap-2 sm:grid-cols-3">
                  <BenchmarkEvaluationProcessingChoiceButton
                    checked={processingChoice === "realtime"}
                    disabled={isStarting}
                    label="Realtime"
                    onClick={() => setProcessingChoice("realtime")}
                  />
                  <BenchmarkEvaluationProcessingChoiceButton
                    checked={processingChoice === "flex"}
                    disabled={isStarting || !canUseFlex}
                    label="Flex"
                    onClick={() => setProcessingChoice("flex")}
                  />
                  <BenchmarkEvaluationProcessingChoiceButton
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
            </section>

            {error ? (
              <p
                className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                role="alert"
              >
                {error}
              </p>
            ) : null}

            {startMessage ? (
              <p className="rounded-md border border-sky-300/30 bg-sky-400/10 px-3 py-2 text-sm text-sky-100">
                {startMessage}
              </p>
            ) : null}

            <section className="grid gap-3" aria-label="Benchmark evaluations">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-foreground">
                  Summary
                </h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isLoading}
                  onClick={() => void loadSummary()}
                >
                  <RefreshCw
                    className={isLoading ? "animate-spin" : undefined}
                    data-icon="inline-start"
                  />
                  Refresh
                </Button>
              </div>

              {isLoading && summary === null ? (
                <p className="rounded-md border border-border bg-black/20 px-3 py-3 text-sm text-muted-foreground">
                  Loading evaluations...
                </p>
              ) : summary ? (
                <div className="grid gap-4">
                  <BenchmarkEvaluationSummaryGrid summary={summary} />
                  <BenchmarkEvaluationAttentionResults
                    results={summary.attentionResults}
                  />
                </div>
              ) : null}
            </section>
          </div>
        </div>
      </section>
    </div>
  )
}

function BenchmarkEvaluationProcessingChoiceButton({
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

function BenchmarkEvaluationSummaryGrid({
  summary,
}: {
  summary: AdminBenchmarkEvaluationSummary
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <BenchmarkEvaluationMetric
        label="Eligible target runs"
        value={summary.targetRunCount}
      />
      <BenchmarkEvaluationMetric
        label="Evaluations found"
        value={summary.evaluationCount}
      />
      <BenchmarkEvaluationMetric
        label="Completed"
        value={summary.completedEvaluationCount}
      />
      <BenchmarkEvaluationMetric
        label="Running"
        value={summary.activeEvaluationCount}
      />
      <BenchmarkEvaluationMetric
        label="Average quality"
        value={
          summary.averageSimulationQualityScore === null
            ? "-"
            : `${summary.averageSimulationQualityScore.toFixed(1)} / 10`
        }
        icon={<BarChart3 className="size-4" aria-hidden />}
      />
      <BenchmarkEvaluationMetric
        label="Total cost"
        value={formatBenchmarkEvaluationCost(summary.totalEvaluationCostUsd)}
      />
      <BenchmarkEvaluationPassFailMetric
        failCount={summary.legalFailCount}
        label="Legal"
        passCount={summary.legalPassCount}
      />
      <BenchmarkEvaluationPassFailMetric
        failCount={summary.strategicFailCount}
        label="Strategic"
        passCount={summary.strategicPassCount}
      />
    </div>
  )
}

function BenchmarkEvaluationAttentionResults({
  results,
}: {
  results: AdminBenchmarkEvaluationAttentionResult[]
}) {
  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold text-foreground">
          Attention results
        </h4>
        <span className="text-xs text-muted-foreground">
          {results.length} {results.length === 1 ? "result" : "results"}
        </span>
      </div>
      {results.length === 0 ? (
        <p className="rounded-md border border-border bg-black/20 px-3 py-3 text-sm text-muted-foreground">
          No latest evaluations need attention.
        </p>
      ) : (
        <div className="grid gap-3">
          {results.map((result) => (
            <BenchmarkEvaluationAttentionResultCard
              key={`${result.targetLlmRunId}-${result.attemptNumber}`}
              result={result}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function BenchmarkEvaluationAttentionResultCard({
  result,
}: {
  result: AdminBenchmarkEvaluationAttentionResult
}) {
  return (
    <article className="grid gap-3 rounded-md border border-border bg-background/35 px-4 py-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">
            {getBenchmarkEvaluationRunLabel(result)}
          </p>
          <p className="mt-1 text-xs break-words text-muted-foreground">
            Evaluation {result.attemptNumber}
          </p>
        </div>
        <a
          className="inline-flex w-fit items-center gap-1 rounded-md border border-sky-300/35 bg-sky-400/10 px-2.5 py-1.5 text-xs font-medium text-sky-100 transition-colors hover:bg-sky-400/20"
          href={getBenchmarkEvaluationSimulationHref(result)}
          target="_blank"
          rel="noreferrer"
        >
          Open simulation
          <ExternalLink className="size-3.5" aria-hidden />
        </a>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <BenchmarkEvaluationPassBadge label="Legal" value={result.legalPass} />
        <BenchmarkEvaluationPassBadge
          label="Strategic"
          value={result.strategicPass}
        />
        <div className="rounded-md border border-border bg-black/20 px-3 py-2">
          <p className="text-xs text-muted-foreground">Quality</p>
          <p className="mt-1 text-lg font-semibold text-foreground">
            {result.simulationQualityScore?.toFixed(1) ?? "-"} / 10
          </p>
        </div>
      </div>

      <BenchmarkEvaluationTextValue
        label="Quality score reasoning"
        value={result.simulationQualityScoreReasoning}
      />
      <BenchmarkEvaluationIssueList
        label="Illegal actions"
        values={result.illegalActions}
      />
      <BenchmarkEvaluationIssueList
        label="Strategic mistakes"
        values={result.strategicMistakes}
      />
    </article>
  )
}

function BenchmarkEvaluationPassBadge({
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

function BenchmarkEvaluationTextValue({
  label,
  value,
}: {
  label: string
  value: string | null
}) {
  return (
    <div className="grid gap-1 rounded-md border border-border bg-black/20 px-3 py-2">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-sm break-words text-foreground">{value ?? "None"}</p>
    </div>
  )
}

function BenchmarkEvaluationIssueList({
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

function getBenchmarkEvaluationRunLabel(
  result: AdminBenchmarkEvaluationAttentionResult
) {
  if (result.targetRunPhase === "opening_hand") {
    return "Opening hand"
  }

  return typeof result.turnNumber === "number"
    ? `Turn ${result.turnNumber}`
    : "Turn"
}

function getBenchmarkEvaluationSimulationHref(
  result: AdminBenchmarkEvaluationAttentionResult
) {
  return getDeckSimulationPath(
    result.deckId,
    result.simulationId,
    result.targetRunPhase === "opening_hand" ? 0 : result.turnNumber
  )
}

function formatBenchmarkEvaluationCost(value: number) {
  return `$${(Number.isFinite(value) ? value : 0).toFixed(2)}`
}

function BenchmarkEvaluationMetric({
  icon = null,
  label,
  value,
}: {
  icon?: ReactNode
  label: string
  value: number | string
}) {
  return (
    <div className="rounded-md border border-border bg-black/20 px-3 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 flex items-center gap-2 text-lg font-semibold text-foreground">
        {icon}
        {value}
      </p>
    </div>
  )
}

function BenchmarkEvaluationPassFailMetric({
  failCount,
  label,
  passCount,
}: {
  failCount: number
  label: string
  passCount: number
}) {
  return (
    <div className="rounded-md border border-border bg-black/20 px-3 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-2 grid gap-1 text-sm">
        <p className="flex items-center gap-1 font-medium text-emerald-100">
          <CheckCircle2 className="size-4" aria-hidden />
          {passCount} pass
        </p>
        <p className="flex items-center gap-1 font-medium text-destructive">
          <XCircle className="size-4" aria-hidden />
          {failCount} fail
        </p>
      </div>
    </div>
  )
}

function getBenchmarkEvaluationLabel(benchmark: AdminBenchmark) {
  return [
    benchmark.llmModelPresetName ?? benchmark.llmModelPresetModel ?? "Benchmark",
    `${benchmark.totalSimulationCount} simulations`,
  ].join(" / ")
}
