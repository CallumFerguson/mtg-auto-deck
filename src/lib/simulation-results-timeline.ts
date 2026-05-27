import type { SimulationDebugLlmRun, SimulationResultsInfo } from "./deck-types"

export type SimulationResultsTimelineStepKind =
  | "preset_opening_hand"
  | "opening_hand"
  | "turn"

export type SimulationResultsTimelineStepStatus =
  | "preset"
  | "pending"
  | "streaming"
  | "cancel_requested"
  | "completed"
  | "failed"
  | "cancelled"
  | "unknown"

export type SimulationResultsTimelineStep =
  | {
      id: "preset-opening-hand"
      kind: "preset_opening_hand"
      label: string
      detailLabel: string
      status: "preset"
      run: null
    }
  | {
      id: string
      kind: Exclude<SimulationResultsTimelineStepKind, "preset_opening_hand">
      label: string
      detailLabel: string
      status: SimulationResultsTimelineStepStatus
      run: SimulationDebugLlmRun
    }

export type SimulationResultsTimelineSelectionSnapshot = {
  id: string
  kind: SimulationResultsTimelineStepKind
  status: SimulationResultsTimelineStepStatus
}

export function buildSimulationResultsTimelineSteps({
  hasPresetStartingHand,
  resultsInfo,
}: {
  hasPresetStartingHand: boolean
  resultsInfo: SimulationResultsInfo
}) {
  const steps: SimulationResultsTimelineStep[] = []

  if (hasPresetStartingHand) {
    steps.push({
      id: "preset-opening-hand",
      kind: "preset_opening_hand",
      label: "Opening hand",
      detailLabel: "Preset",
      status: "preset",
      run: null,
    })
  } else {
    for (const run of [...resultsInfo.openingHandLlmRuns].sort(
      compareOpeningHandRuns
    )) {
      steps.push(createRunStep(run, "opening_hand"))
    }
  }

  for (const run of [...resultsInfo.turnLlmRuns].sort(compareTurnRuns)) {
    steps.push(createRunStep(run, "turn"))
  }

  return steps
}

export function getFallbackSimulationResultsTimelineStepId(
  steps: readonly SimulationResultsTimelineStep[]
) {
  return getPreferredSimulationResultsTimelineStep(steps)?.id ?? null
}

export function resolveSimulationResultsTimelineSelection(
  steps: readonly SimulationResultsTimelineStep[],
  selectedStepId: string | null,
  previousSelection: SimulationResultsTimelineSelectionSnapshot | null = null
) {
  if (selectedStepId && steps.some((step) => step.id === selectedStepId)) {
    return selectedStepId
  }

  const preservedStepId = getPreservedFinishedTimelineStepId(
    steps,
    previousSelection
  )

  if (preservedStepId) {
    return preservedStepId
  }

  return getFallbackSimulationResultsTimelineStepId(steps)
}

export function shouldPreserveFinishedSimulationResultsTimelineSelection(
  previousSelection: SimulationResultsTimelineSelectionSnapshot | null,
  currentStep: SimulationResultsTimelineStep | null
) {
  return Boolean(
    previousSelection &&
    currentStep &&
    previousSelection.id === currentStep.id &&
    (previousSelection.kind === "opening_hand" ||
      previousSelection.kind === "turn") &&
    isActiveSimulationResultsTimelineStatus(previousSelection.status) &&
    !isActiveSimulationResultsTimelineStep(currentStep)
  )
}

export function isActiveSimulationResultsTimelineStep(
  step: SimulationResultsTimelineStep
) {
  return isActiveSimulationResultsTimelineStatus(step.status)
}

function getPreferredSimulationResultsTimelineStep(
  steps: readonly SimulationResultsTimelineStep[]
) {
  const activeStep = steps.find(isActiveSimulationResultsTimelineStep)

  if (activeStep) {
    return activeStep
  }

  return (
    findLastStepByKind(steps, "turn") ??
    findLastStepByKind(steps, "opening_hand") ??
    findLastStepByKind(steps, "preset_opening_hand") ??
    null
  )
}

function findLastStepByKind(
  steps: readonly SimulationResultsTimelineStep[],
  kind: SimulationResultsTimelineStepKind
) {
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    if (steps[index].kind === kind) {
      return steps[index]
    }
  }

  return null
}

function getPreservedFinishedTimelineStepId(
  steps: readonly SimulationResultsTimelineStep[],
  previousSelection: SimulationResultsTimelineSelectionSnapshot | null
) {
  if (!previousSelection) {
    return null
  }

  const currentStep =
    steps.find((step) => step.id === previousSelection.id) ?? null

  return shouldPreserveFinishedSimulationResultsTimelineSelection(
    previousSelection,
    currentStep
  )
    ? previousSelection.id
    : null
}

function isActiveSimulationResultsTimelineStatus(
  status: SimulationResultsTimelineStepStatus
) {
  return (
    status === "pending" ||
    status === "streaming" ||
    status === "cancel_requested"
  )
}

function createRunStep(
  run: SimulationDebugLlmRun,
  kind: Exclude<SimulationResultsTimelineStepKind, "preset_opening_hand">
): SimulationResultsTimelineStep {
  return {
    id: getSimulationResultsTimelineRunStepId(run.llmRunId),
    kind,
    label: getRunStepLabel(run, kind),
    detailLabel: `Attempt ${run.attemptNumber}`,
    status: getRunStepStatus(run.status),
    run,
  }
}

function getSimulationResultsTimelineRunStepId(llmRunId: string) {
  return `run:${llmRunId}`
}

function getRunStepLabel(
  run: SimulationDebugLlmRun,
  kind: Exclude<SimulationResultsTimelineStepKind, "preset_opening_hand">
) {
  if (kind === "opening_hand") {
    return "Opening hand"
  }

  return `Turn ${run.turnNumber ?? "?"}`
}

function getRunStepStatus(status: string): SimulationResultsTimelineStepStatus {
  if (
    status === "pending" ||
    status === "streaming" ||
    status === "cancel_requested" ||
    status === "completed" ||
    status === "failed" ||
    status === "cancelled"
  ) {
    return status
  }

  return "unknown"
}

function compareOpeningHandRuns(
  firstRun: SimulationDebugLlmRun,
  secondRun: SimulationDebugLlmRun
) {
  return firstRun.attemptNumber - secondRun.attemptNumber
}

function compareTurnRuns(
  firstRun: SimulationDebugLlmRun,
  secondRun: SimulationDebugLlmRun
) {
  return (
    (firstRun.turnNumber ?? 0) - (secondRun.turnNumber ?? 0) ||
    firstRun.attemptNumber - secondRun.attemptNumber
  )
}
