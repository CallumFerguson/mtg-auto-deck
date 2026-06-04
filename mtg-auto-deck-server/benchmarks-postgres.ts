import { queryDatabase, withDatabaseTransaction } from "./db.js"
import type { LlmProcessingMode } from "./simulations-postgres.js"
import type {
  BenchmarkEvaluationLatestEvaluationSnapshot,
  BenchmarkEvaluationLatestRunSnapshot,
  BenchmarkEvaluationRunPhase,
} from "./benchmark-evaluations.js"

export const MAX_BENCHMARK_SIMULATIONS_PER_DECK = 100

export type BenchmarkRunStatus =
  | "running"
  | "stopped"
  | "completed"
  | "failed"

export type AdminBenchmarkDeck = {
  id: string
  name: string
}

export type AdminBenchmarkRun = {
  id: string
  llmModelPresetId: string
  llmModelPresetName: string | null
  llmModelPresetModel: string | null
  llmModelPresetProvider: string | null
  llmModelPresetReasoningEffort: string | null
  llmModelPresetOpenrouterModelProvider: string | null
  simulationsPerDeck: number
  turnsToSimulate: number
  llmProcessingMode: LlmProcessingMode
  useFlexServiceTier: boolean
  status: BenchmarkRunStatus
  decks: AdminBenchmarkDeck[]
  totalSimulationCount: number
  pendingSimulationCount: number
  runningSimulationCount: number
  completedSimulationCount: number
  failedSimulationCount: number
  cancelledSimulationCount: number
  activeSimulationCount: number
  averageSimulatedTurnCount: number
  totalEstimatedCostUsd: number
  startedAt: string
  completedAt: string | null
  stoppedAt: string | null
  createdAt: string
  updatedAt: string
}

export type BenchmarkChildSimulation = {
  benchmarkRunId: string
  deckId: string
  deckIndex: number
  deckName: string
  simulationId: string
  simulationIndex: number
  seed: string
}

type AdminBenchmarkRunRow = {
  id: string
  llm_model_preset_id: string
  llm_model_preset_name: string | null
  llm_model_preset_model: string | null
  llm_model_preset_provider: string | null
  llm_model_preset_reasoning_effort: string | null
  llm_model_preset_openrouter_model_provider: string | null
  simulations_per_deck: number
  turns_to_simulate: number
  llm_processing_mode: LlmProcessingMode
  use_flex_service_tier: boolean
  stored_status: BenchmarkRunStatus
  decks: unknown
  total_simulation_count: string | number
  pending_simulation_count: string | number
  running_simulation_count: string | number
  completed_simulation_count: string | number
  failed_simulation_count: string | number
  cancelled_simulation_count: string | number
  average_simulated_turn_count: string | number
  total_estimated_cost_usd: string | number
  started_at: Date
  completed_at: Date | null
  stopped_at: Date | null
  created_at: Date
  updated_at: Date
}

const ADMIN_BENCHMARK_SELECT_SQL = `
  WITH child_metrics AS (
    SELECT
      benchmark_simulation.benchmark_run_id,
      COUNT(*)::integer AS total_simulation_count,
      COUNT(*) FILTER (WHERE simulation.status = 'pending')::integer AS pending_simulation_count,
      COUNT(*) FILTER (WHERE simulation.status = 'running')::integer AS running_simulation_count,
      COUNT(*) FILTER (WHERE simulation.status = 'completed')::integer AS completed_simulation_count,
      COUNT(*) FILTER (WHERE simulation.status = 'failed')::integer AS failed_simulation_count,
      COUNT(*) FILTER (WHERE simulation.status = 'cancelled')::integer AS cancelled_simulation_count,
      COALESCE(AVG(turn_counts.simulated_turn_count), 0) AS average_simulated_turn_count
    FROM benchmark_run_simulations benchmark_simulation
    JOIN simulations simulation
      ON simulation.id = benchmark_simulation.simulation_id
    LEFT JOIN LATERAL (
      SELECT COUNT(DISTINCT turn_run.turn_number)::integer AS simulated_turn_count
      FROM simulation_turn_llm_runs turn_run
      JOIN llm_runs llm_run
        ON llm_run.id = turn_run.llm_run_id
      WHERE turn_run.simulation_id = simulation.id
        AND turn_run.outdated = false
        AND llm_run.status = 'completed'
    ) turn_counts ON true
    GROUP BY benchmark_simulation.benchmark_run_id
  ),
  run_costs AS (
    SELECT
      benchmark_simulation.benchmark_run_id,
      COALESCE(
        SUM(COALESCE(llm_run.openrouter_reported_cost_usd, llm_run.estimated_cost_usd)),
        0
      ) AS total_estimated_cost_usd
    FROM benchmark_run_simulations benchmark_simulation
    LEFT JOIN (
      SELECT simulation_id, llm_run_id
      FROM simulation_opening_hand_llm_runs
      UNION ALL
      SELECT simulation_id, llm_run_id
      FROM simulation_turn_llm_runs
    ) linked_run
      ON linked_run.simulation_id = benchmark_simulation.simulation_id
    LEFT JOIN llm_runs llm_run
      ON llm_run.id = linked_run.llm_run_id
    GROUP BY benchmark_simulation.benchmark_run_id
  )
  SELECT
    benchmark_run.id,
    benchmark_run.llm_model_preset_id,
    preset.name AS llm_model_preset_name,
    preset.model AS llm_model_preset_model,
    preset.provider AS llm_model_preset_provider,
    preset.reasoning_effort AS llm_model_preset_reasoning_effort,
    preset.openrouter_model_provider AS llm_model_preset_openrouter_model_provider,
    benchmark_run.simulations_per_deck,
    benchmark_run.turns_to_simulate,
    benchmark_run.llm_processing_mode,
    benchmark_run.use_flex_service_tier,
    benchmark_run.status AS stored_status,
    (
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object('id', deck.id, 'name', deck.name)
          ORDER BY benchmark_deck.deck_index
        ),
        '[]'::jsonb
      )
      FROM benchmark_run_decks benchmark_deck
      JOIN decks deck
        ON deck.id = benchmark_deck.deck_id
      WHERE benchmark_deck.benchmark_run_id = benchmark_run.id
    ) AS decks,
    COALESCE(child_metrics.total_simulation_count, 0) AS total_simulation_count,
    COALESCE(child_metrics.pending_simulation_count, 0) AS pending_simulation_count,
    COALESCE(child_metrics.running_simulation_count, 0) AS running_simulation_count,
    COALESCE(child_metrics.completed_simulation_count, 0) AS completed_simulation_count,
    COALESCE(child_metrics.failed_simulation_count, 0) AS failed_simulation_count,
    COALESCE(child_metrics.cancelled_simulation_count, 0) AS cancelled_simulation_count,
    COALESCE(child_metrics.average_simulated_turn_count, 0) AS average_simulated_turn_count,
    COALESCE(run_costs.total_estimated_cost_usd, 0) AS total_estimated_cost_usd,
    benchmark_run.started_at,
    benchmark_run.completed_at,
    benchmark_run.stopped_at,
    benchmark_run.created_at,
    benchmark_run.updated_at
  FROM benchmark_runs benchmark_run
  LEFT JOIN llm_model_presets preset
    ON preset.id = benchmark_run.llm_model_preset_id
  LEFT JOIN child_metrics
    ON child_metrics.benchmark_run_id = benchmark_run.id
  LEFT JOIN run_costs
    ON run_costs.benchmark_run_id = benchmark_run.id
`

export async function ensureBenchmarkRunsSchema() {
  await queryDatabase(`
    CREATE TABLE IF NOT EXISTS benchmark_runs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

      created_by_admin_user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      llm_model_preset_id uuid NOT NULL REFERENCES llm_model_presets(id) ON DELETE RESTRICT,
      simulations_per_deck integer NOT NULL CHECK (
        simulations_per_deck >= 1
        AND simulations_per_deck <= ${MAX_BENCHMARK_SIMULATIONS_PER_DECK}
      ),
      turns_to_simulate integer NOT NULL CHECK (turns_to_simulate >= 0),
      llm_processing_mode llm_processing_mode NOT NULL DEFAULT 'realtime',
      use_flex_service_tier boolean NOT NULL DEFAULT false,
      status text NOT NULL DEFAULT 'running' CHECK (
        status IN ('running', 'stopped', 'completed', 'failed')
      ),

      started_at timestamptz NOT NULL DEFAULT now(),
      completed_at timestamptz,
      stopped_at timestamptz,

      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `)
  await queryDatabase(`
    CREATE TABLE IF NOT EXISTS benchmark_run_decks (
      benchmark_run_id uuid NOT NULL REFERENCES benchmark_runs(id) ON DELETE CASCADE,
      deck_id uuid NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
      deck_index integer NOT NULL CHECK (deck_index >= 0),
      created_at timestamptz NOT NULL DEFAULT now(),

      PRIMARY KEY (benchmark_run_id, deck_id),
      UNIQUE (benchmark_run_id, deck_index)
    )
  `)
  await queryDatabase(`
    CREATE TABLE IF NOT EXISTS benchmark_run_simulations (
      benchmark_run_id uuid NOT NULL REFERENCES benchmark_runs(id) ON DELETE CASCADE,
      deck_id uuid NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
      simulation_id uuid NOT NULL REFERENCES simulations(id) ON DELETE CASCADE,
      simulation_index integer NOT NULL CHECK (simulation_index >= 1),
      seed text NOT NULL CHECK (btrim(seed) <> ''),
      created_at timestamptz NOT NULL DEFAULT now(),

      PRIMARY KEY (benchmark_run_id, deck_id, simulation_index),
      UNIQUE (benchmark_run_id, simulation_id),
      UNIQUE (simulation_id)
    )
  `)
  await queryDatabase(`
    CREATE INDEX IF NOT EXISTS benchmark_runs_admin_created_at_idx
      ON benchmark_runs (created_by_admin_user_id, created_at DESC, id)
  `)
  await queryDatabase(`
    CREATE INDEX IF NOT EXISTS benchmark_run_simulations_benchmark_idx
      ON benchmark_run_simulations (benchmark_run_id, deck_id, simulation_index)
  `)
}

export function createBenchmarkSimulationSeed(simulationIndex: number) {
  if (!Number.isInteger(simulationIndex) || simulationIndex < 1) {
    throw new Error("Benchmark simulation index must be a positive integer.")
  }

  return `mtg-auto-deck-benchmark-v1-${simulationIndex}`
}

export async function createBenchmarkRun({
  adminUserId,
  deckIds,
  llmModelPresetId,
  llmProcessingMode,
  simulationsPerDeck,
  turnsToSimulate,
  useFlexServiceTier,
}: {
  adminUserId: string
  deckIds: readonly string[]
  llmModelPresetId: string
  llmProcessingMode: LlmProcessingMode
  simulationsPerDeck: number
  turnsToSimulate: number
  useFlexServiceTier: boolean
}) {
  return withDatabaseTransaction(async (client) => {
    const benchmarkResult = await client.query<{ id: string }>(
      `
        INSERT INTO benchmark_runs (
          created_by_admin_user_id,
          llm_model_preset_id,
          simulations_per_deck,
          turns_to_simulate,
          llm_processing_mode,
          use_flex_service_tier
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
      `,
      [
        adminUserId,
        llmModelPresetId,
        simulationsPerDeck,
        turnsToSimulate,
        llmProcessingMode,
        useFlexServiceTier,
      ]
    )
    const benchmarkRunId = benchmarkResult.rows[0].id

    for (const [deckIndex, deckId] of deckIds.entries()) {
      await client.query(
        `
          INSERT INTO benchmark_run_decks (
            benchmark_run_id,
            deck_id,
            deck_index
          )
          VALUES ($1, $2, $3)
        `,
        [benchmarkRunId, deckId, deckIndex]
      )
    }

    return benchmarkRunId
  })
}

export async function linkBenchmarkSimulation({
  benchmarkRunId,
  deckId,
  seed,
  simulationId,
  simulationIndex,
}: {
  benchmarkRunId: string
  deckId: string
  seed: string
  simulationId: string
  simulationIndex: number
}) {
  await queryDatabase(
    `
      INSERT INTO benchmark_run_simulations (
        benchmark_run_id,
        deck_id,
        simulation_id,
        simulation_index,
        seed
      )
      VALUES ($1, $2, $3, $4, $5)
    `,
    [benchmarkRunId, deckId, simulationId, simulationIndex, seed]
  )
}

export async function listAdminBenchmarks(adminUserId: string) {
  const result = await queryDatabase<AdminBenchmarkRunRow>(
    `
      ${ADMIN_BENCHMARK_SELECT_SQL}
      WHERE benchmark_run.created_by_admin_user_id = $1
      ORDER BY benchmark_run.created_at DESC, benchmark_run.id DESC
    `,
    [adminUserId]
  )

  return result.rows.map(mapAdminBenchmarkRunRow)
}

export async function getAdminBenchmark(
  benchmarkRunId: string,
  adminUserId: string
) {
  const result = await queryDatabase<AdminBenchmarkRunRow>(
    `
      ${ADMIN_BENCHMARK_SELECT_SQL}
      WHERE benchmark_run.id = $1
        AND benchmark_run.created_by_admin_user_id = $2
    `,
    [benchmarkRunId, adminUserId]
  )
  const row = result.rows[0]

  return row ? mapAdminBenchmarkRunRow(row) : null
}

export async function listBenchmarkRunSimulationsForAdmin(
  benchmarkRunId: string,
  adminUserId: string
): Promise<BenchmarkChildSimulation[] | null> {
  const benchmarkResult = await queryDatabase(
    `
      SELECT id
      FROM benchmark_runs
      WHERE id = $1
        AND created_by_admin_user_id = $2
    `,
    [benchmarkRunId, adminUserId]
  )

  if (benchmarkResult.rowCount === 0) {
    return null
  }

  const result = await queryDatabase<{
    benchmark_run_id: string
    deck_id: string
    deck_index: number
    deck_name: string
    simulation_id: string
    simulation_index: number
    seed: string
  }>(
    `
      SELECT
        benchmark_simulation.benchmark_run_id,
        benchmark_simulation.deck_id,
        benchmark_deck.deck_index,
        deck.name AS deck_name,
        benchmark_simulation.simulation_id,
        benchmark_simulation.simulation_index,
        benchmark_simulation.seed
      FROM benchmark_run_simulations benchmark_simulation
      JOIN benchmark_run_decks benchmark_deck
        ON benchmark_deck.benchmark_run_id = benchmark_simulation.benchmark_run_id
        AND benchmark_deck.deck_id = benchmark_simulation.deck_id
      JOIN decks deck
        ON deck.id = benchmark_simulation.deck_id
      WHERE benchmark_simulation.benchmark_run_id = $1
      ORDER BY benchmark_deck.deck_index ASC, benchmark_simulation.simulation_index ASC
    `,
    [benchmarkRunId]
  )

  return result.rows.map((row) => ({
    benchmarkRunId: row.benchmark_run_id,
    deckId: row.deck_id,
    deckIndex: row.deck_index,
    deckName: row.deck_name,
    simulationId: row.simulation_id,
    simulationIndex: row.simulation_index,
    seed: row.seed,
  }))
}

export async function listBenchmarkEvaluationLatestRunsForAdmin(
  benchmarkRunId: string,
  adminUserId: string
): Promise<BenchmarkEvaluationLatestRunSnapshot[] | null> {
  const benchmarkResult = await queryDatabase(
    `
      SELECT id
      FROM benchmark_runs
      WHERE id = $1
        AND created_by_admin_user_id = $2
    `,
    [benchmarkRunId, adminUserId]
  )

  if (benchmarkResult.rowCount === 0) {
    return null
  }

  const result = await queryDatabase<{
    deck_id: string
    simulation_id: string
    target_llm_run_id: string
    target_run_phase: BenchmarkEvaluationRunPhase
    turn_number: number | null
    status: BenchmarkEvaluationLatestRunSnapshot["status"]
    failure_message: string | null
    final_output_text: string | null
    opening_hand_is_valid: boolean | null
    game_state: unknown | null
    turn_actions: unknown | null
  }>(
    `
      WITH latest_opening_hand_run AS (
        SELECT DISTINCT ON (opening_run.simulation_id)
          benchmark_simulation.deck_id,
          opening_run.simulation_id,
          opening_run.llm_run_id AS target_llm_run_id,
          'opening_hand'::text AS target_run_phase,
          NULL::integer AS turn_number,
          llm_run.status,
          llm_run.failure_message,
          llm_run.final_output_text,
          opening_run.opening_hand_is_valid,
          NULL::jsonb AS game_state,
          NULL::jsonb AS turn_actions
        FROM benchmark_run_simulations benchmark_simulation
        JOIN simulations simulation
          ON simulation.id = benchmark_simulation.simulation_id
        JOIN simulation_opening_hand_llm_runs opening_run
          ON opening_run.simulation_id = benchmark_simulation.simulation_id
        JOIN llm_runs llm_run
          ON llm_run.id = opening_run.llm_run_id
        WHERE benchmark_simulation.benchmark_run_id = $1
          AND simulation.starting_hand_id IS NULL
        ORDER BY
          opening_run.simulation_id ASC,
          opening_run.attempt_number DESC,
          opening_run.created_at DESC,
          opening_run.llm_run_id DESC
      ),
      latest_turn_run AS (
        SELECT DISTINCT ON (turn_run.simulation_id, turn_run.turn_number)
          benchmark_simulation.deck_id,
          turn_run.simulation_id,
          turn_run.llm_run_id AS target_llm_run_id,
          'turn'::text AS target_run_phase,
          turn_run.turn_number,
          llm_run.status,
          llm_run.failure_message,
          llm_run.final_output_text,
          NULL::boolean AS opening_hand_is_valid,
          turn_run.game_state,
          turn_run.turn_actions
        FROM benchmark_run_simulations benchmark_simulation
        JOIN simulation_turn_llm_runs turn_run
          ON turn_run.simulation_id = benchmark_simulation.simulation_id
        JOIN llm_runs llm_run
          ON llm_run.id = turn_run.llm_run_id
        WHERE benchmark_simulation.benchmark_run_id = $1
          AND turn_run.outdated = false
        ORDER BY
          turn_run.simulation_id ASC,
          turn_run.turn_number ASC,
          turn_run.attempt_number DESC,
          turn_run.created_at DESC,
          turn_run.llm_run_id DESC
      )
      SELECT *
      FROM latest_opening_hand_run
      UNION ALL
      SELECT *
      FROM latest_turn_run
      ORDER BY deck_id ASC, simulation_id ASC, target_run_phase ASC, turn_number ASC NULLS FIRST
    `,
    [benchmarkRunId]
  )

  return result.rows.map((row) => ({
    deckId: row.deck_id,
    simulationId: row.simulation_id,
    targetLlmRunId: row.target_llm_run_id,
    targetRunPhase: row.target_run_phase,
    turnNumber: row.turn_number,
    status: row.status,
    failureMessage: row.failure_message,
    finalOutputText: row.final_output_text,
    openingHandIsValid: row.opening_hand_is_valid,
    gameState: row.game_state,
    turnActions: row.turn_actions,
  }))
}

export async function listLatestBenchmarkEvaluationSnapshotsForTargets(
  targetLlmRunIds: readonly string[]
): Promise<BenchmarkEvaluationLatestEvaluationSnapshot[]> {
  if (targetLlmRunIds.length === 0) {
    return []
  }

  const result = await queryDatabase<{
    target_llm_run_id: string
    attempt_number: number
    status: BenchmarkEvaluationLatestEvaluationSnapshot["status"]
    failure_message: string | null
    result_status: BenchmarkEvaluationLatestEvaluationSnapshot["resultStatus"]
    result_failure_message: string | null
    legal_pass: boolean | null
    strategic_pass: boolean | null
    simulation_quality_score: string | number | null
    simulation_quality_score_reasoning: string | null
    illegal_actions: unknown
    strategic_mistakes: unknown
    cost_usd: string | number | null
  }>(
    `
      SELECT DISTINCT ON (evaluation.target_llm_run_id)
        evaluation.target_llm_run_id,
        evaluation.attempt_number,
        llm_run.status,
        llm_run.failure_message,
        evaluation.result_status,
        evaluation.result_failure_message,
        evaluation.legal_pass,
        evaluation.strategic_pass,
        evaluation.simulation_quality_score,
        evaluation.simulation_quality_score_reasoning,
        evaluation.illegal_actions,
        evaluation.strategic_mistakes,
        COALESCE(llm_run.openrouter_reported_cost_usd, llm_run.estimated_cost_usd) AS cost_usd
      FROM simulation_run_evaluations evaluation
      JOIN llm_runs llm_run
        ON llm_run.id = evaluation.llm_run_id
      WHERE evaluation.target_llm_run_id = ANY($1::uuid[])
      ORDER BY
        evaluation.target_llm_run_id ASC,
        evaluation.attempt_number DESC,
        evaluation.created_at DESC,
        evaluation.id DESC
    `,
    [targetLlmRunIds]
  )

  return result.rows.map((row) => ({
    targetLlmRunId: row.target_llm_run_id,
    attemptNumber: row.attempt_number,
    status: row.status,
    failureMessage: row.failure_message,
    resultStatus: row.result_status,
    resultFailureMessage: row.result_failure_message,
    legalPass: row.legal_pass,
    strategicPass: row.strategic_pass,
    simulationQualityScore: toOptionalNumber(row.simulation_quality_score),
    simulationQualityScoreReasoning:
      row.simulation_quality_score_reasoning || null,
    illegalActions: parseBenchmarkEvaluationStringArray(row.illegal_actions),
    strategicMistakes: parseBenchmarkEvaluationStringArray(
      row.strategic_mistakes
    ),
    costUsd: toOptionalNumber(row.cost_usd),
  }))
}

export async function markBenchmarkRunFailed(
  benchmarkRunId: string,
  failureMessage: string
) {
  await queryDatabase(
    `
      UPDATE benchmark_runs
      SET status = 'failed',
          completed_at = COALESCE(completed_at, now()),
          updated_at = now()
      WHERE id = $1
    `,
    [benchmarkRunId]
  )

  console.error(
    `Benchmark run ${benchmarkRunId} failed during creation: ${failureMessage}`
  )
}

export async function markBenchmarkRunStopped(benchmarkRunId: string) {
  await queryDatabase(
    `
      UPDATE benchmark_runs
      SET status = 'stopped',
          stopped_at = COALESCE(stopped_at, now()),
          updated_at = now()
      WHERE id = $1
    `,
    [benchmarkRunId]
  )
}

function mapAdminBenchmarkRunRow(
  row: AdminBenchmarkRunRow
): AdminBenchmarkRun {
  const totalSimulationCount = toInteger(row.total_simulation_count)
  const pendingSimulationCount = toInteger(row.pending_simulation_count)
  const runningSimulationCount = toInteger(row.running_simulation_count)
  const completedSimulationCount = toInteger(row.completed_simulation_count)
  const failedSimulationCount = toInteger(row.failed_simulation_count)
  const cancelledSimulationCount = toInteger(row.cancelled_simulation_count)
  const activeSimulationCount = pendingSimulationCount + runningSimulationCount
  const terminalSimulationCount =
    completedSimulationCount + failedSimulationCount + cancelledSimulationCount

  return {
    id: row.id,
    llmModelPresetId: row.llm_model_preset_id,
    llmModelPresetName: row.llm_model_preset_name,
    llmModelPresetModel: row.llm_model_preset_model,
    llmModelPresetProvider: row.llm_model_preset_provider,
    llmModelPresetReasoningEffort: row.llm_model_preset_reasoning_effort,
    llmModelPresetOpenrouterModelProvider:
      row.llm_model_preset_openrouter_model_provider,
    simulationsPerDeck: row.simulations_per_deck,
    turnsToSimulate: row.turns_to_simulate,
    llmProcessingMode: row.llm_processing_mode,
    useFlexServiceTier: row.use_flex_service_tier,
    status: getBenchmarkRunStatus({
      activeSimulationCount,
      stoppedAt: row.stopped_at,
      storedStatus: row.stored_status,
      terminalSimulationCount,
      totalSimulationCount,
    }),
    decks: parseBenchmarkDecks(row.decks),
    totalSimulationCount,
    pendingSimulationCount,
    runningSimulationCount,
    completedSimulationCount,
    failedSimulationCount,
    cancelledSimulationCount,
    activeSimulationCount,
    averageSimulatedTurnCount: toNumber(row.average_simulated_turn_count),
    totalEstimatedCostUsd: toNumber(row.total_estimated_cost_usd),
    startedAt: row.started_at.toISOString(),
    completedAt: row.completed_at?.toISOString() ?? null,
    stoppedAt: row.stopped_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }
}

function getBenchmarkRunStatus({
  activeSimulationCount,
  stoppedAt,
  storedStatus,
  terminalSimulationCount,
  totalSimulationCount,
}: {
  activeSimulationCount: number
  stoppedAt: Date | null
  storedStatus: BenchmarkRunStatus
  terminalSimulationCount: number
  totalSimulationCount: number
}) {
  if (storedStatus === "failed") {
    return "failed"
  }

  if (stoppedAt || storedStatus === "stopped") {
    return "stopped"
  }

  if (
    totalSimulationCount > 0 &&
    activeSimulationCount === 0 &&
    terminalSimulationCount >= totalSimulationCount
  ) {
    return "completed"
  }

  return "running"
}

function parseBenchmarkDecks(value: unknown): AdminBenchmarkDeck[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return []
    }

    const record = item as Record<string, unknown>
    const id = typeof record.id === "string" ? record.id : ""
    const name = typeof record.name === "string" ? record.name : ""

    return id && name ? [{ id, name }] : []
  })
}

function parseBenchmarkEvaluationStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return value.filter((item): item is string => typeof item === "string")
}

function toInteger(value: string | number) {
  return Math.trunc(toNumber(value))
}

function toOptionalNumber(value: string | number | null) {
  return value === null ? null : toNumber(value)
}

function toNumber(value: string | number) {
  const parsedValue = typeof value === "number" ? value : Number(value)

  return Number.isFinite(parsedValue) ? parsedValue : 0
}
