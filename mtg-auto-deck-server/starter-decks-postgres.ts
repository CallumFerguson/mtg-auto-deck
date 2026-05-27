import type { QueryResultRow } from "pg"

import { queryDatabase, withDatabaseTransaction } from "./db.js"
import type { LlmRunStatus, SimulationStatus } from "./simulations-postgres.js"

type Queryable = {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[]
  ): Promise<{
    rowCount: number | null
    rows: T[]
  }>
}

export type StarterDeckCopyResult = {
  copiedDeckIds: string[]
  skippedStarterDeckIds: string[]
}

export const STARTER_DECK_COPY_TERMINAL_SIMULATION_STATUSES = [
  "completed",
  "failed",
  "cancelled",
] as const satisfies readonly SimulationStatus[]

export const STARTER_DECK_COPY_TERMINAL_LLM_RUN_STATUSES = [
  "completed",
  "failed",
  "cancelled",
] as const satisfies readonly LlmRunStatus[]

type SourceDeckRow = {
  id: string
  name: string
  description: string | null
  mulligan_guidelines: string | null
  strategy_guidelines: string | null
  format: string
}

type IdRow = {
  id: string
}

type CopiedDeckCardRow = {
  source_deck_card_id: string | number
  copied_deck_card_id: string | number
}

type CopiedStartingHandRow = {
  source_starting_hand_id: string
  copied_starting_hand_id: string
}

type StartingHandCardRow = {
  starting_hand_id: string
  deck_card_id: string | number
  quantity: number
}

type SimulationRow = {
  id: string
  created_via: string
  llm_model_preset_id: string | null
  seed: string
  random_state: string | number
  turns_to_simulate: number
  starting_hand_id: string | null
  library: unknown
  mulligan_count: number
  has_drawn_starting_hand: boolean
  auto_simulate_next_step: boolean
  status: SimulationStatus
  started_at: Date | null
  completed_at: Date | null
  failed_at: Date | null
  cancel_requested_at: Date | null
  failure_message: string | null
  created_at: Date
  updated_at: Date
}

type LlmRunRow = {
  id: string
  phase: string
  provider: string
  model: string
  openrouter_model_provider: string | null
  service_tier: string | null
  reasoning_effort: string | null
  llm_model_preset_id: string | null
  status: LlmRunStatus
  full_prompt: string
  request_payload: unknown
  final_output_text: string | null
  raw_response: unknown
  response_metadata: unknown
  usage: unknown
  started_at: Date | null
  completed_at: Date | null
  failed_at: Date | null
  cancel_requested_at: Date | null
  cancelled_at: Date | null
  failure_message: string | null
  created_at: Date
  updated_at: Date
}

type OpeningHandLlmRunRow = {
  simulation_id: string
  llm_run_id: string
  attempt_number: number
  opening_hand: unknown
  summary: string | null
  library_snapshot: unknown | null
  opening_hand_is_valid: boolean
  random_state_snapshot: string | number | null
  created_at: Date
}

type TurnLlmRunRow = {
  simulation_id: string
  llm_run_id: string
  turn_number: number
  attempt_number: number
  turn_actions: unknown | null
  game_state: unknown | null
  outdated: boolean
  library_snapshot: unknown | null
  random_state_snapshot: string | number | null
  created_at: Date
}

export async function ensureStarterDeckCopiesSchema() {
  await queryDatabase(`
    CREATE TABLE IF NOT EXISTS starter_deck_copies (
      id bigserial PRIMARY KEY,

      owner_user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      source_deck_id uuid NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
      copied_deck_id uuid REFERENCES decks(id) ON DELETE SET NULL,

      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),

      UNIQUE (owner_user_id, source_deck_id)
    )
  `)
  await queryDatabase(`
    CREATE INDEX IF NOT EXISTS starter_deck_copies_owner_user_id_idx
      ON starter_deck_copies (owner_user_id, created_at)
  `)
}

export async function copyStarterDecksForUser(
  ownerUserId: string
): Promise<StarterDeckCopyResult> {
  const normalizedOwnerUserId = ownerUserId.trim()

  if (!normalizedOwnerUserId) {
    throw new Error("Owner user ID is required to copy starter decks.")
  }

  return withDatabaseTransaction((client) =>
    copyStarterDecksForUserWithClient(client, normalizedOwnerUserId)
  )
}

export async function copyStarterDecksForUserWithClient(
  client: Queryable,
  ownerUserId: string
): Promise<StarterDeckCopyResult> {
  const starterDecks = await listStarterDecksForCopy(client)
  const copiedDeckIds: string[] = []
  const skippedStarterDeckIds: string[] = []

  for (const sourceDeck of starterDecks) {
    const reservedCopy = await reserveStarterDeckCopy({
      client,
      ownerUserId,
      sourceDeckId: sourceDeck.id,
    })

    if (!reservedCopy) {
      skippedStarterDeckIds.push(sourceDeck.id)
      continue
    }

    const copiedDeckId = await copyDeckShell({
      client,
      ownerUserId,
      sourceDeckId: sourceDeck.id,
    })

    await markStarterDeckCopyCreated({
      client,
      copiedDeckId,
      ownerUserId,
      sourceDeckId: sourceDeck.id,
    })

    const deckCardIdMap = await copyDeckCards({
      client,
      copiedDeckId,
      sourceDeckId: sourceDeck.id,
    })

    await copySavedSeeds({
      client,
      copiedDeckId,
      sourceDeckId: sourceDeck.id,
    })

    const startingHandIdMap = await copyStartingHands({
      client,
      copiedDeckId,
      sourceDeckId: sourceDeck.id,
    })

    await copyStartingHandCards({
      client,
      deckCardIdMap,
      startingHandIdMap,
    })

    await copySimulations({
      client,
      copiedDeckId,
      ownerUserId,
      sourceDeckId: sourceDeck.id,
      startingHandIdMap,
    })

    copiedDeckIds.push(copiedDeckId)
  }

  return {
    copiedDeckIds,
    skippedStarterDeckIds,
  }
}

async function listStarterDecksForCopy(client: Queryable) {
  const result = await client.query<SourceDeckRow>(`
    /* starter-copy:list-starter-decks */
    SELECT
      id,
      name,
      description,
      mulligan_guidelines,
      strategy_guidelines,
      format
    FROM decks
    WHERE is_starter = true
    ORDER BY updated_at DESC, name ASC, id ASC
  `)

  return result.rows
}

async function reserveStarterDeckCopy({
  client,
  ownerUserId,
  sourceDeckId,
}: {
  client: Queryable
  ownerUserId: string
  sourceDeckId: string
}) {
  const result = await client.query(
    `
      /* starter-copy:reserve-starter-deck-copy */
      INSERT INTO starter_deck_copies (
        owner_user_id,
        source_deck_id
      )
      VALUES ($1, $2)
      ON CONFLICT (owner_user_id, source_deck_id) DO NOTHING
      RETURNING id
    `,
    [ownerUserId, sourceDeckId]
  )

  return (result.rowCount ?? 0) > 0
}

async function copyDeckShell({
  client,
  ownerUserId,
  sourceDeckId,
}: {
  client: Queryable
  ownerUserId: string
  sourceDeckId: string
}) {
  const result = await client.query<IdRow>(
    `
      /* starter-copy:copy-deck-shell */
      INSERT INTO decks (
        name,
        description,
        format,
        owner_user_id,
        mulligan_guidelines,
        strategy_guidelines,
        is_starter
      )
      SELECT
        name,
        description,
        format,
        $2,
        mulligan_guidelines,
        strategy_guidelines,
        false
      FROM decks
      WHERE id = $1
      RETURNING id
    `,
    [sourceDeckId, ownerUserId]
  )

  const copiedDeck = result.rows[0]

  if (!copiedDeck) {
    throw new Error("Starter deck could not be copied.")
  }

  return copiedDeck.id
}

async function markStarterDeckCopyCreated({
  client,
  copiedDeckId,
  ownerUserId,
  sourceDeckId,
}: {
  client: Queryable
  copiedDeckId: string
  ownerUserId: string
  sourceDeckId: string
}) {
  await client.query(
    `
      /* starter-copy:mark-starter-deck-copy-created */
      UPDATE starter_deck_copies
      SET copied_deck_id = $3,
          updated_at = now()
      WHERE owner_user_id = $1
        AND source_deck_id = $2
    `,
    [ownerUserId, sourceDeckId, copiedDeckId]
  )
}

async function copyDeckCards({
  client,
  copiedDeckId,
  sourceDeckId,
}: {
  client: Queryable
  copiedDeckId: string
  sourceDeckId: string
}) {
  const result = await client.query<CopiedDeckCardRow>(
    `
      /* starter-copy:copy-deck-cards */
      WITH source_cards AS (
        SELECT
          id AS source_deck_card_id,
          oracle_id,
          zone,
          quantity,
          created_at,
          updated_at
        FROM deck_cards
        WHERE deck_id = $1
      ),
      inserted_cards AS (
        INSERT INTO deck_cards (
          deck_id,
          oracle_id,
          zone,
          quantity,
          created_at,
          updated_at
        )
        SELECT
          $2,
          oracle_id,
          zone,
          quantity,
          created_at,
          updated_at
        FROM source_cards
        ORDER BY source_deck_card_id
        RETURNING id AS copied_deck_card_id, oracle_id, zone
      )
      SELECT
        source_cards.source_deck_card_id,
        inserted_cards.copied_deck_card_id
      FROM source_cards
      JOIN inserted_cards
        ON inserted_cards.oracle_id = source_cards.oracle_id
       AND inserted_cards.zone = source_cards.zone
      ORDER BY source_cards.source_deck_card_id
    `,
    [sourceDeckId, copiedDeckId]
  )

  return new Map(
    result.rows.map((row) => [
      String(row.source_deck_card_id),
      String(row.copied_deck_card_id),
    ])
  )
}

async function copySavedSeeds({
  client,
  copiedDeckId,
  sourceDeckId,
}: {
  client: Queryable
  copiedDeckId: string
  sourceDeckId: string
}) {
  await client.query(
    `
      /* starter-copy:copy-saved-seeds */
      INSERT INTO saved_seeds (
        deck_id,
        name,
        seed,
        is_enabled,
        created_at,
        updated_at
      )
      SELECT
        $2,
        name,
        seed,
        is_enabled,
        created_at,
        updated_at
      FROM saved_seeds
      WHERE deck_id = $1
      ORDER BY created_at ASC, name ASC
      ON CONFLICT DO NOTHING
    `,
    [sourceDeckId, copiedDeckId]
  )
}

async function copyStartingHands({
  client,
  copiedDeckId,
  sourceDeckId,
}: {
  client: Queryable
  copiedDeckId: string
  sourceDeckId: string
}) {
  const result = await client.query<CopiedStartingHandRow>(
    `
      /* starter-copy:copy-starting-hands */
      WITH source_hands AS (
        SELECT
          id AS source_starting_hand_id,
          name,
          is_enabled,
          created_at,
          updated_at
        FROM starting_hands
        WHERE deck_id = $1
      ),
      inserted_hands AS (
        INSERT INTO starting_hands (
          deck_id,
          name,
          is_enabled,
          created_at,
          updated_at
        )
        SELECT
          $2,
          name,
          is_enabled,
          created_at,
          updated_at
        FROM source_hands
        ORDER BY created_at ASC, name ASC
        RETURNING
          id AS copied_starting_hand_id,
          name,
          is_enabled,
          created_at,
          updated_at
      )
      SELECT
        source_hands.source_starting_hand_id,
        inserted_hands.copied_starting_hand_id
      FROM source_hands
      JOIN inserted_hands
        ON inserted_hands.name = source_hands.name
       AND inserted_hands.is_enabled = source_hands.is_enabled
       AND inserted_hands.created_at = source_hands.created_at
       AND inserted_hands.updated_at = source_hands.updated_at
      ORDER BY source_hands.created_at ASC, source_hands.name ASC
    `,
    [sourceDeckId, copiedDeckId]
  )

  return new Map(
    result.rows.map((row) => [
      row.source_starting_hand_id,
      row.copied_starting_hand_id,
    ])
  )
}

async function copyStartingHandCards({
  client,
  deckCardIdMap,
  startingHandIdMap,
}: {
  client: Queryable
  deckCardIdMap: Map<string, string>
  startingHandIdMap: Map<string, string>
}) {
  const sourceStartingHandIds = Array.from(startingHandIdMap.keys())

  if (sourceStartingHandIds.length === 0) {
    return
  }

  const result = await client.query<StartingHandCardRow>(
    `
      /* starter-copy:list-starting-hand-cards */
      SELECT
        starting_hand_id,
        deck_card_id,
        quantity
      FROM starting_hand_cards
      WHERE starting_hand_id = ANY($1::uuid[])
      ORDER BY starting_hand_id ASC, deck_card_id ASC
    `,
    [sourceStartingHandIds]
  )

  for (const card of result.rows) {
    const copiedStartingHandId = getMappedId(
      startingHandIdMap,
      card.starting_hand_id,
      "starting hand"
    )
    const copiedDeckCardId = getMappedId(
      deckCardIdMap,
      card.deck_card_id,
      "deck card"
    )

    await client.query(
      `
        /* starter-copy:copy-starting-hand-card */
        INSERT INTO starting_hand_cards (
          starting_hand_id,
          deck_card_id,
          quantity
        )
        VALUES ($1, $2, $3)
        ON CONFLICT (starting_hand_id, deck_card_id) DO NOTHING
      `,
      [copiedStartingHandId, copiedDeckCardId, card.quantity]
    )
  }
}

async function copySimulations({
  client,
  copiedDeckId,
  ownerUserId,
  sourceDeckId,
  startingHandIdMap,
}: {
  client: Queryable
  copiedDeckId: string
  ownerUserId: string
  sourceDeckId: string
  startingHandIdMap: Map<string, string>
}) {
  const sourceSimulations = await listCopyableSimulations({
    client,
    sourceDeckId,
  })

  for (const sourceSimulation of sourceSimulations) {
    const copiedStartingHandId =
      sourceSimulation.starting_hand_id === null
        ? null
        : getMappedId(
            startingHandIdMap,
            sourceSimulation.starting_hand_id,
            "simulation starting hand"
          )
    const copiedSimulationId = await copySimulationShell({
      client,
      copiedDeckId,
      copiedStartingHandId,
      sourceSimulation,
    })
    const llmRunIdMap = await copyLinkedLlmRuns({
      client,
      ownerUserId,
      sourceSimulationId: sourceSimulation.id,
    })

    await copyOpeningHandLlmRuns({
      client,
      copiedSimulationId,
      llmRunIdMap,
      sourceSimulationId: sourceSimulation.id,
    })
    await copyTurnLlmRuns({
      client,
      copiedSimulationId,
      llmRunIdMap,
      sourceSimulationId: sourceSimulation.id,
    })
    await copyLlmRunChildren({
      client,
      llmRunIdMap,
    })
  }
}

async function listCopyableSimulations({
  client,
  sourceDeckId,
}: {
  client: Queryable
  sourceDeckId: string
}) {
  const result = await client.query<SimulationRow>(
    `
      /* starter-copy:list-copyable-simulations */
      SELECT
        simulation.id,
        simulation.created_via,
        simulation.llm_model_preset_id,
        simulation.seed,
        simulation.random_state,
        simulation.turns_to_simulate,
        simulation.starting_hand_id,
        simulation.library,
        simulation.mulligan_count,
        simulation.has_drawn_starting_hand,
        simulation.auto_simulate_next_step,
        simulation.status,
        simulation.started_at,
        simulation.completed_at,
        simulation.failed_at,
        simulation.cancel_requested_at,
        simulation.failure_message,
        simulation.created_at,
        simulation.updated_at
      FROM simulations simulation
      WHERE simulation.deck_id = $1
        AND simulation.status::text = ANY($2::text[])
        AND NOT EXISTS (
          SELECT 1
          FROM (
            SELECT llm_run_id
            FROM simulation_opening_hand_llm_runs
            WHERE simulation_id = simulation.id
            UNION ALL
            SELECT llm_run_id
            FROM simulation_turn_llm_runs
            WHERE simulation_id = simulation.id
          ) linked_run
          JOIN llm_runs llm_run
            ON llm_run.id = linked_run.llm_run_id
          WHERE llm_run.status::text <> ALL($3::text[])
        )
      ORDER BY simulation.created_at ASC, simulation.id ASC
    `,
    [
      sourceDeckId,
      STARTER_DECK_COPY_TERMINAL_SIMULATION_STATUSES,
      STARTER_DECK_COPY_TERMINAL_LLM_RUN_STATUSES,
    ]
  )

  return result.rows
}

async function copySimulationShell({
  client,
  copiedDeckId,
  copiedStartingHandId,
  sourceSimulation,
}: {
  client: Queryable
  copiedDeckId: string
  copiedStartingHandId: string | null
  sourceSimulation: SimulationRow
}) {
  const result = await client.query<IdRow>(
    `
      /* starter-copy:copy-simulation-shell */
      INSERT INTO simulations (
        deck_id,
        created_via,
        llm_model_preset_id,
        seed,
        random_state,
        turns_to_simulate,
        starting_hand_id,
        library,
        mulligan_count,
        has_drawn_starting_hand,
        auto_simulate_next_step,
        status,
        started_at,
        completed_at,
        failed_at,
        cancel_requested_at,
        failure_message,
        created_at,
        updated_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8::jsonb,
        $9,
        $10,
        $11,
        $12,
        $13,
        $14,
        $15,
        $16,
        $17,
        $18,
        $19
      )
      RETURNING id
    `,
    [
      copiedDeckId,
      sourceSimulation.created_via,
      sourceSimulation.llm_model_preset_id,
      sourceSimulation.seed,
      sourceSimulation.random_state,
      sourceSimulation.turns_to_simulate,
      copiedStartingHandId,
      toJsonParameter(sourceSimulation.library),
      sourceSimulation.mulligan_count,
      sourceSimulation.has_drawn_starting_hand,
      sourceSimulation.auto_simulate_next_step,
      sourceSimulation.status,
      sourceSimulation.started_at,
      sourceSimulation.completed_at,
      sourceSimulation.failed_at,
      sourceSimulation.cancel_requested_at,
      sourceSimulation.failure_message,
      sourceSimulation.created_at,
      sourceSimulation.updated_at,
    ]
  )

  const copiedSimulation = result.rows[0]

  if (!copiedSimulation) {
    throw new Error("Starter simulation could not be copied.")
  }

  return copiedSimulation.id
}

async function copyLinkedLlmRuns({
  client,
  ownerUserId,
  sourceSimulationId,
}: {
  client: Queryable
  ownerUserId: string
  sourceSimulationId: string
}) {
  const sourceRuns = await listLinkedLlmRuns({
    client,
    sourceSimulationId,
  })
  const llmRunIdMap = new Map<string, string>()

  for (const sourceRun of sourceRuns) {
    const copiedRunId = await copyLlmRun({
      client,
      ownerUserId,
      sourceRun,
    })

    llmRunIdMap.set(sourceRun.id, copiedRunId)
  }

  return llmRunIdMap
}

async function listLinkedLlmRuns({
  client,
  sourceSimulationId,
}: {
  client: Queryable
  sourceSimulationId: string
}) {
  const result = await client.query<LlmRunRow>(
    `
      /* starter-copy:list-linked-llm-runs */
      SELECT DISTINCT
        llm_run.id,
        llm_run.phase,
        llm_run.provider,
        llm_run.model,
        llm_run.openrouter_model_provider,
        llm_run.service_tier,
        llm_run.reasoning_effort,
        llm_run.llm_model_preset_id,
        llm_run.status,
        llm_run.full_prompt,
        llm_run.request_payload,
        llm_run.final_output_text,
        llm_run.raw_response,
        llm_run.response_metadata,
        llm_run.usage,
        llm_run.started_at,
        llm_run.completed_at,
        llm_run.failed_at,
        llm_run.cancel_requested_at,
        llm_run.cancelled_at,
        llm_run.failure_message,
        llm_run.created_at,
        llm_run.updated_at
      FROM (
        SELECT llm_run_id
        FROM simulation_opening_hand_llm_runs
        WHERE simulation_id = $1
        UNION
        SELECT llm_run_id
        FROM simulation_turn_llm_runs
        WHERE simulation_id = $1
      ) linked_run
      JOIN llm_runs llm_run
        ON llm_run.id = linked_run.llm_run_id
      ORDER BY llm_run.created_at ASC, llm_run.id ASC
    `,
    [sourceSimulationId]
  )

  return result.rows
}

async function copyLlmRun({
  client,
  ownerUserId,
  sourceRun,
}: {
  client: Queryable
  ownerUserId: string
  sourceRun: LlmRunRow
}) {
  const result = await client.query<IdRow>(
    `
      /* starter-copy:copy-llm-run */
      INSERT INTO llm_runs (
        phase,
        provider,
        model,
        openrouter_model_provider,
        service_tier,
        reasoning_effort,
        llm_model_preset_id,
        owner_user_id,
        status,
        runtime_stream_key,
        queued_at,
        full_prompt,
        request_payload,
        final_output_text,
        raw_response,
        response_metadata,
        usage,
        estimated_cost_usd,
        openrouter_reported_cost_usd,
        started_at,
        completed_at,
        failed_at,
        cancel_requested_at,
        cancelled_at,
        failure_message,
        created_at,
        updated_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        NULL,
        NULL,
        $10,
        $11::jsonb,
        $12,
        $13::jsonb,
        $14::jsonb,
        $15::jsonb,
        NULL,
        NULL,
        $16,
        $17,
        $18,
        $19,
        $20,
        $21,
        $22,
        $23
      )
      RETURNING id
    `,
    [
      sourceRun.phase,
      sourceRun.provider,
      sourceRun.model,
      sourceRun.openrouter_model_provider,
      sourceRun.service_tier,
      sourceRun.reasoning_effort,
      sourceRun.llm_model_preset_id,
      ownerUserId,
      sourceRun.status,
      sourceRun.full_prompt,
      toJsonParameter(sourceRun.request_payload),
      sourceRun.final_output_text,
      toJsonParameter(sourceRun.raw_response),
      toJsonParameter(sourceRun.response_metadata),
      toJsonParameter(sourceRun.usage),
      sourceRun.started_at,
      sourceRun.completed_at,
      sourceRun.failed_at,
      sourceRun.cancel_requested_at,
      sourceRun.cancelled_at,
      sourceRun.failure_message,
      sourceRun.created_at,
      sourceRun.updated_at,
    ]
  )

  const copiedRun = result.rows[0]

  if (!copiedRun) {
    throw new Error("Starter LLM run could not be copied.")
  }

  return copiedRun.id
}

async function copyOpeningHandLlmRuns({
  client,
  copiedSimulationId,
  llmRunIdMap,
  sourceSimulationId,
}: {
  client: Queryable
  copiedSimulationId: string
  llmRunIdMap: Map<string, string>
  sourceSimulationId: string
}) {
  const result = await client.query<OpeningHandLlmRunRow>(
    `
      /* starter-copy:list-opening-hand-llm-runs */
      SELECT
        simulation_id,
        llm_run_id,
        attempt_number,
        opening_hand,
        summary,
        library_snapshot,
        opening_hand_is_valid,
        random_state_snapshot,
        created_at
      FROM simulation_opening_hand_llm_runs
      WHERE simulation_id = $1
      ORDER BY attempt_number ASC
    `,
    [sourceSimulationId]
  )

  for (const run of result.rows) {
    await client.query(
      `
        /* starter-copy:copy-opening-hand-llm-run */
        INSERT INTO simulation_opening_hand_llm_runs (
          simulation_id,
          llm_run_id,
          attempt_number,
          opening_hand,
          summary,
          library_snapshot,
          opening_hand_is_valid,
          random_state_snapshot,
          created_at
        )
        VALUES ($1, $2, $3, $4::jsonb, $5, $6::jsonb, $7, $8, $9)
      `,
      [
        copiedSimulationId,
        getMappedId(llmRunIdMap, run.llm_run_id, "opening-hand LLM run"),
        run.attempt_number,
        toJsonParameter(run.opening_hand),
        run.summary,
        toNullableJsonParameter(run.library_snapshot),
        run.opening_hand_is_valid,
        run.random_state_snapshot,
        run.created_at,
      ]
    )
  }
}

async function copyTurnLlmRuns({
  client,
  copiedSimulationId,
  llmRunIdMap,
  sourceSimulationId,
}: {
  client: Queryable
  copiedSimulationId: string
  llmRunIdMap: Map<string, string>
  sourceSimulationId: string
}) {
  const result = await client.query<TurnLlmRunRow>(
    `
      /* starter-copy:list-turn-llm-runs */
      SELECT
        simulation_id,
        llm_run_id,
        turn_number,
        attempt_number,
        turn_actions,
        game_state,
        outdated,
        library_snapshot,
        random_state_snapshot,
        created_at
      FROM simulation_turn_llm_runs
      WHERE simulation_id = $1
      ORDER BY turn_number ASC, attempt_number ASC
    `,
    [sourceSimulationId]
  )

  for (const run of result.rows) {
    await client.query(
      `
        /* starter-copy:copy-turn-llm-run */
        INSERT INTO simulation_turn_llm_runs (
          simulation_id,
          llm_run_id,
          turn_number,
          attempt_number,
          turn_actions,
          game_state,
          outdated,
          library_snapshot,
          random_state_snapshot,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8::jsonb, $9, $10)
      `,
      [
        copiedSimulationId,
        getMappedId(llmRunIdMap, run.llm_run_id, "turn LLM run"),
        run.turn_number,
        run.attempt_number,
        toNullableJsonParameter(run.turn_actions),
        toNullableJsonParameter(run.game_state),
        run.outdated,
        toNullableJsonParameter(run.library_snapshot),
        run.random_state_snapshot,
        run.created_at,
      ]
    )
  }
}

async function copyLlmRunChildren({
  client,
  llmRunIdMap,
}: {
  client: Queryable
  llmRunIdMap: Map<string, string>
}) {
  for (const [sourceLlmRunId, copiedLlmRunId] of llmRunIdMap.entries()) {
    await copyLlmRunMcpFunctionCalls({
      client,
      copiedLlmRunId,
      sourceLlmRunId,
    })
  }
}

async function copyLlmRunMcpFunctionCalls({
  client,
  copiedLlmRunId,
  sourceLlmRunId,
}: {
  client: Queryable
  copiedLlmRunId: string
  sourceLlmRunId: string
}) {
  await client.query(
    `
      /* starter-copy:copy-llm-run-mcp-function-calls */
      INSERT INTO llm_run_mcp_function_calls (
        llm_run_id,
        mcp_function_name,
        status,
        input_payload,
        output_payload,
        called_at,
        completed_at
      )
      SELECT
        $2,
        mcp_function_name,
        status,
        input_payload,
        output_payload,
        called_at,
        completed_at
      FROM llm_run_mcp_function_calls
      WHERE llm_run_id = $1
      ORDER BY called_at ASC, id ASC
    `,
    [sourceLlmRunId, copiedLlmRunId]
  )
}

function getMappedId(
  map: Map<string, string>,
  sourceId: string | number,
  label: string
) {
  const copiedId = map.get(String(sourceId))

  if (!copiedId) {
    throw new Error(`Missing copied ${label} for source ID ${sourceId}.`)
  }

  return copiedId
}

function toJsonParameter(value: unknown) {
  return JSON.stringify(value)
}

function toNullableJsonParameter(value: unknown | null) {
  return value === null ? null : toJsonParameter(value)
}
