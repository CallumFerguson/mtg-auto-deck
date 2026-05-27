import assert from "node:assert/strict"
import test from "node:test"

import {
  STARTER_DECK_COPY_TERMINAL_LLM_RUN_STATUSES,
  STARTER_DECK_COPY_TERMINAL_SIMULATION_STATUSES,
  copyStarterDecksForUserWithClient,
} from "./starter-decks-postgres.js"
import type { LlmRunStatus, SimulationStatus } from "./simulations-postgres.js"

type QueryResult<T> = {
  rowCount: number
  rows: T[]
}

type FakeDeck = {
  id: string
  name: string
  description: string | null
  format: string
  owner_user_id: string | null
  mulligan_guidelines: string | null
  strategy_guidelines: string | null
  is_starter: boolean
  created_at: Date
  updated_at: Date
}

type FakeDeckCard = {
  id: number
  deck_id: string
  oracle_id: string
  zone: "commander" | "library"
  quantity: number
  created_at: Date
  updated_at: Date
}

type FakeSavedSeed = {
  id: string
  deck_id: string
  name: string
  seed: string
  created_at: Date
  updated_at: Date
}

type FakeStartingHand = {
  id: string
  deck_id: string
  name: string
  created_at: Date
  updated_at: Date
}

type FakeStartingHandCard = {
  starting_hand_id: string
  deck_card_id: number
  quantity: number
}

type FakeSimulation = {
  id: string
  deck_id: string
  created_via: "app" | "external_mcp"
  llm_model_preset_id: string | null
  seed: string
  random_state: number
  turns_to_simulate: number
  starting_hand_id: string | null
  library: string[]
  mulligan_count: number
  has_drawn_starting_hand: boolean
  auto_simulate_next_step: boolean
  auto_generate_report: boolean
  status: SimulationStatus
  started_at: Date | null
  completed_at: Date | null
  failed_at: Date | null
  cancel_requested_at: Date | null
  failure_message: string | null
  created_at: Date
  updated_at: Date
}

type FakeLlmRun = {
  id: string
  phase: "opening_hand" | "turn" | "report" | "other"
  provider: string
  model: string
  openrouter_model_provider: string | null
  service_tier: string | null
  reasoning_effort: string | null
  llm_model_preset_id: string | null
  owner_user_id: string | null
  status: LlmRunStatus
  runtime_stream_key: string | null
  queued_at: Date | null
  full_prompt: string
  request_payload: unknown
  response_metadata: unknown
  usage: unknown
  estimated_cost_usd: number | null
  openrouter_reported_cost_usd: number | null
  started_at: Date | null
  completed_at: Date | null
  failed_at: Date | null
  cancel_requested_at: Date | null
  cancelled_at: Date | null
  failure_message: string | null
  created_at: Date
  updated_at: Date
}

type FakeOpeningHandRun = {
  simulation_id: string
  llm_run_id: string
  attempt_number: number
  opening_hand: string[]
  library_snapshot: string[] | null
  opening_hand_is_valid: boolean
  random_state_snapshot: number | null
  created_at: Date
}

type FakeTurnRun = {
  simulation_id: string
  llm_run_id: string
  turn_number: number
  attempt_number: number
  turn_actions: Record<string, string[]> | null
  game_state: Record<string, unknown> | null
  outdated: boolean
  library_snapshot: string[] | null
  random_state_snapshot: number | null
  created_at: Date
}

type FakeReportRun = {
  simulation_id: string
  llm_run_id: string
  attempt_number: number
  report: string | null
  outdated: boolean
  created_at: Date
}

type FakeChunk = {
  id: number
  llm_run_id: string
  sequence: number
  kind: string
  mcp_function_name: string | null
  mcp_function_output: unknown | null
  mcp_function_reason: string | null
  reasoning_delta: string | null
  output_delta: string | null
  payload: unknown
  received_at: Date
}

class FakeStarterDeckCopyClient {
  deckIdSequence = 1
  deckCardIdSequence = 100
  savedSeedIdSequence = 1
  startingHandIdSequence = 1
  simulationIdSequence = 1
  llmRunIdSequence = 1
  chunkIdSequence = 1000
  starterDeckCopyIdSequence = 1

  decks: FakeDeck[] = []
  deckCards: FakeDeckCard[] = []
  savedSeeds: FakeSavedSeed[] = []
  startingHands: FakeStartingHand[] = []
  startingHandCards: FakeStartingHandCard[] = []
  simulations: FakeSimulation[] = []
  llmRuns: FakeLlmRun[] = []
  openingHandRuns: FakeOpeningHandRun[] = []
  turnRuns: FakeTurnRun[] = []
  reportRuns: FakeReportRun[] = []
  chunks: FakeChunk[] = []
  starterDeckCopies: {
    copied_deck_id: string | null
    id: number
    owner_user_id: string
    source_deck_id: string
  }[] = []
  openrouterGenerations: { llm_run_id: string }[] = []
  mcpTokens: { llm_run_id: string }[] = []

  async query<T>(text: string, values: unknown[] = []): Promise<QueryResult<T>> {
    const operation = getStarterCopyOperation(text)

    switch (operation) {
      case "list-starter-decks":
        return this.result<T>(
          this.decks
            .filter((deck) => deck.is_starter)
            .map((deck) => ({
              description: deck.description,
              format: deck.format,
              id: deck.id,
              mulligan_guidelines: deck.mulligan_guidelines,
              name: deck.name,
              strategy_guidelines: deck.strategy_guidelines,
            }))
        )

      case "reserve-starter-deck-copy":
        return this.reserveStarterDeckCopy<T>(values) as QueryResult<T>

      case "copy-deck-shell":
        return this.copyDeckShell<T>(values) as QueryResult<T>

      case "mark-starter-deck-copy-created":
        return this.markStarterDeckCopyCreated<T>(values)

      case "copy-deck-cards":
        return this.copyDeckCards<T>(values) as QueryResult<T>

      case "copy-saved-seeds":
        return this.copySavedSeeds<T>(values)

      case "copy-starting-hands":
        return this.copyStartingHands<T>(values) as QueryResult<T>

      case "list-starting-hand-cards":
        return this.result<T>(
          this.startingHandCards.filter((card) =>
            getStringArray(values[0]).includes(card.starting_hand_id)
          )
        )

      case "copy-starting-hand-card":
        return this.copyStartingHandCard<T>(values)

      case "list-copyable-simulations":
        return this.listCopyableSimulations<T>(values) as QueryResult<T>

      case "copy-simulation-shell":
        return this.copySimulationShell<T>(values) as QueryResult<T>

      case "list-linked-llm-runs":
        return this.listLinkedLlmRuns<T>(values) as QueryResult<T>

      case "copy-llm-run":
        return this.copyLlmRun<T>(values) as QueryResult<T>

      case "list-opening-hand-llm-runs":
        return this.result<T>(
          this.openingHandRuns.filter((run) => run.simulation_id === values[0])
        )

      case "copy-opening-hand-llm-run":
        return this.copyOpeningHandRun<T>(values)

      case "list-turn-llm-runs":
        return this.result<T>(
          this.turnRuns.filter((run) => run.simulation_id === values[0])
        )

      case "copy-turn-llm-run":
        return this.copyTurnRun<T>(values)

      case "list-report-llm-runs":
        return this.result<T>(
          this.reportRuns.filter((run) => run.simulation_id === values[0])
        )

      case "copy-report-llm-run":
        return this.copyReportRun<T>(values)

      case "copy-llm-run-chunks":
        return this.copyLlmRunChunks<T>(values) as QueryResult<T>

      default:
        throw new Error(`Unhandled fake query operation: ${operation}`)
    }
  }

  result<T>(rows: readonly unknown[]): QueryResult<T> {
    return {
      rowCount: rows.length,
      rows: rows as T[],
    }
  }

  reserveStarterDeckCopy<T>(values: unknown[]) {
    const ownerUserId = getString(values[0])
    const sourceDeckId = getString(values[1])
    const existingCopy = this.starterDeckCopies.find(
      (copy) =>
        copy.owner_user_id === ownerUserId &&
        copy.source_deck_id === sourceDeckId
    )

    if (existingCopy) {
      return this.result<T>([])
    }

    const copy = {
      copied_deck_id: null,
      id: this.starterDeckCopyIdSequence,
      owner_user_id: ownerUserId,
      source_deck_id: sourceDeckId,
    }

    this.starterDeckCopyIdSequence += 1
    this.starterDeckCopies.push(copy)

    return this.result([{ id: copy.id }] as T[])
  }

  copyDeckShell<T>(values: unknown[]) {
    const sourceDeck = this.getDeck(getString(values[0]))
    const copiedDeck: FakeDeck = {
      ...sourceDeck,
      id: `copied-deck-${this.deckIdSequence}`,
      is_starter: false,
      owner_user_id: getString(values[1]),
    }

    this.deckIdSequence += 1
    this.decks.push(copiedDeck)

    return this.result([{ id: copiedDeck.id }] as T[])
  }

  markStarterDeckCopyCreated<T>(values: unknown[]) {
    const ownerUserId = getString(values[0])
    const sourceDeckId = getString(values[1])
    const copiedDeckId = getString(values[2])
    const copy = this.starterDeckCopies.find(
      (starterCopy) =>
        starterCopy.owner_user_id === ownerUserId &&
        starterCopy.source_deck_id === sourceDeckId
    )

    assert.ok(copy)
    copy.copied_deck_id = copiedDeckId

    return this.result<T>([])
  }

  copyDeckCards<T>(values: unknown[]) {
    const sourceDeckId = getString(values[0])
    const copiedDeckId = getString(values[1])
    const rows = this.deckCards
      .filter((card) => card.deck_id === sourceDeckId)
      .map((sourceCard) => {
        const copiedCard: FakeDeckCard = {
          ...sourceCard,
          deck_id: copiedDeckId,
          id: this.deckCardIdSequence,
        }

        this.deckCardIdSequence += 1
        this.deckCards.push(copiedCard)

        return {
          copied_deck_card_id: copiedCard.id,
          source_deck_card_id: sourceCard.id,
        }
      })

    return this.result(rows as T[])
  }

  copySavedSeeds<T>(values: unknown[]) {
    const sourceDeckId = getString(values[0])
    const copiedDeckId = getString(values[1])

    for (const sourceSeed of this.savedSeeds.filter(
      (seed) => seed.deck_id === sourceDeckId
    )) {
      this.savedSeeds.push({
        ...sourceSeed,
        deck_id: copiedDeckId,
        id: `copied-seed-${this.savedSeedIdSequence}`,
      })
      this.savedSeedIdSequence += 1
    }

    return this.result<T>([])
  }

  copyStartingHands<T>(values: unknown[]) {
    const sourceDeckId = getString(values[0])
    const copiedDeckId = getString(values[1])
    const rows = this.startingHands
      .filter((hand) => hand.deck_id === sourceDeckId)
      .map((sourceHand) => {
        const copiedHand = {
          ...sourceHand,
          deck_id: copiedDeckId,
          id: `copied-hand-${this.startingHandIdSequence}`,
        }

        this.startingHandIdSequence += 1
        this.startingHands.push(copiedHand)

        return {
          copied_starting_hand_id: copiedHand.id,
          source_starting_hand_id: sourceHand.id,
        }
      })

    return this.result(rows as T[])
  }

  copyStartingHandCard<T>(values: unknown[]) {
    this.startingHandCards.push({
      deck_card_id: getNumber(values[1]),
      quantity: getNumber(values[2]),
      starting_hand_id: getString(values[0]),
    })

    return this.result<T>([])
  }

  listCopyableSimulations<T>(values: unknown[]) {
    const sourceDeckId = getString(values[0])
    const terminalSimulationStatuses = getStringArray(values[1])
    const terminalRunStatuses = getStringArray(values[2])
    const rows = this.simulations.filter((simulation) => {
      if (
        simulation.deck_id !== sourceDeckId ||
        !terminalSimulationStatuses.includes(simulation.status)
      ) {
        return false
      }

      return this.getLinkedRunIds(simulation.id).every((runId) => {
        const run = this.getLlmRun(runId)

        return terminalRunStatuses.includes(run.status)
      })
    })

    return this.result(rows as T[])
  }

  copySimulationShell<T>(values: unknown[]) {
    const copiedSimulation: FakeSimulation = {
      auto_generate_report: getBoolean(values[11]),
      auto_simulate_next_step: getBoolean(values[10]),
      cancel_requested_at: getDateOrNull(values[16]),
      completed_at: getDateOrNull(values[14]),
      created_at: getDate(values[18]),
      created_via: getCreatedVia(values[1]),
      deck_id: getString(values[0]),
      failed_at: getDateOrNull(values[15]),
      failure_message: getStringOrNull(values[17]),
      has_drawn_starting_hand: getBoolean(values[9]),
      id: `copied-simulation-${this.simulationIdSequence}`,
      library: getJsonStringArray(values[7]),
      llm_model_preset_id: getStringOrNull(values[2]),
      mulligan_count: getNumber(values[8]),
      random_state: getNumber(values[4]),
      seed: getString(values[3]),
      started_at: getDateOrNull(values[13]),
      starting_hand_id: getStringOrNull(values[6]),
      status: getSimulationStatus(values[12]),
      turns_to_simulate: getNumber(values[5]),
      updated_at: getDate(values[19]),
    }

    this.simulationIdSequence += 1
    this.simulations.push(copiedSimulation)

    return this.result([{ id: copiedSimulation.id }] as T[])
  }

  listLinkedLlmRuns<T>(values: unknown[]) {
    const sourceSimulationId = getString(values[0])
    const linkedRunIds = new Set(this.getLinkedRunIds(sourceSimulationId))

    return this.result(
      this.llmRuns.filter((run) => linkedRunIds.has(run.id)) as T[]
    )
  }

  copyLlmRun<T>(values: unknown[]) {
    const copiedRun: FakeLlmRun = {
      cancel_requested_at: getDateOrNull(values[16]),
      cancelled_at: getDateOrNull(values[17]),
      completed_at: getDateOrNull(values[14]),
      created_at: getDate(values[19]),
      estimated_cost_usd: null,
      failed_at: getDateOrNull(values[15]),
      failure_message: getStringOrNull(values[18]),
      full_prompt: getString(values[9]),
      id: `copied-run-${this.llmRunIdSequence}`,
      llm_model_preset_id: getStringOrNull(values[6]),
      model: getString(values[2]),
      openrouter_model_provider: getStringOrNull(values[3]),
      openrouter_reported_cost_usd: null,
      owner_user_id: getString(values[7]),
      phase: getLlmRunPhase(values[0]),
      provider: getString(values[1]),
      queued_at: null,
      reasoning_effort: getStringOrNull(values[5]),
      request_payload: getJsonObject(values[10]),
      response_metadata: getJsonObject(values[11]),
      runtime_stream_key: null,
      service_tier: getStringOrNull(values[4]),
      started_at: getDateOrNull(values[13]),
      status: getLlmRunStatus(values[8]),
      updated_at: getDate(values[20]),
      usage: getJsonObject(values[12]),
    }

    this.llmRunIdSequence += 1
    this.llmRuns.push(copiedRun)

    return this.result([{ id: copiedRun.id }] as T[])
  }

  copyOpeningHandRun<T>(values: unknown[]) {
    this.openingHandRuns.push({
      attempt_number: getNumber(values[2]),
      created_at: getDate(values[7]),
      library_snapshot: getJsonStringArrayOrNull(values[4]),
      llm_run_id: getString(values[1]),
      opening_hand: getJsonStringArray(values[3]),
      opening_hand_is_valid: getBoolean(values[5]),
      random_state_snapshot: getNumberOrNull(values[6]),
      simulation_id: getString(values[0]),
    })

    return this.result<T>([])
  }

  copyTurnRun<T>(values: unknown[]) {
    this.turnRuns.push({
      attempt_number: getNumber(values[3]),
      created_at: getDate(values[9]),
      game_state: getJsonObjectOrNull(values[5]),
      library_snapshot: getJsonStringArrayOrNull(values[7]),
      llm_run_id: getString(values[1]),
      outdated: getBoolean(values[6]),
      random_state_snapshot: getNumberOrNull(values[8]),
      simulation_id: getString(values[0]),
      turn_actions: getJsonObjectOrNull(values[4]) as Record<
        string,
        string[]
      > | null,
      turn_number: getNumber(values[2]),
    })

    return this.result<T>([])
  }

  copyReportRun<T>(values: unknown[]) {
    this.reportRuns.push({
      attempt_number: getNumber(values[2]),
      created_at: getDate(values[5]),
      llm_run_id: getString(values[1]),
      outdated: getBoolean(values[4]),
      report: getStringOrNull(values[3]),
      simulation_id: getString(values[0]),
    })

    return this.result<T>([])
  }

  copyLlmRunChunks<T>(values: unknown[]) {
    const sourceLlmRunId = getString(values[0])
    const copiedLlmRunId = getString(values[1])
    const rows = this.chunks
      .filter((chunk) => chunk.llm_run_id === sourceLlmRunId)
      .map((sourceChunk) => {
        const copiedChunk = {
          ...sourceChunk,
          id: this.chunkIdSequence,
          llm_run_id: copiedLlmRunId,
        }

        this.chunkIdSequence += 1
        this.chunks.push(copiedChunk)

        return {
          copied_llm_run_chunk_id: copiedChunk.id,
          source_llm_run_chunk_id: sourceChunk.id,
        }
      })

    return this.result(rows as T[])
  }

  getDeck(deckId: string) {
    const deck = this.decks.find((candidate) => candidate.id === deckId)

    assert.ok(deck, `Missing deck ${deckId}`)

    return deck
  }

  getLlmRun(llmRunId: string) {
    const run = this.llmRuns.find((candidate) => candidate.id === llmRunId)

    assert.ok(run, `Missing LLM run ${llmRunId}`)

    return run
  }

  getLinkedRunIds(simulationId: string) {
    return [
      ...this.openingHandRuns.flatMap((run) =>
        run.simulation_id === simulationId ? [run.llm_run_id] : []
      ),
      ...this.turnRuns.flatMap((run) =>
        run.simulation_id === simulationId ? [run.llm_run_id] : []
      ),
      ...this.reportRuns.flatMap((run) =>
        run.simulation_id === simulationId ? [run.llm_run_id] : []
      ),
    ]
  }
}

test("starter deck copy clones deck data, presets, terminal history, and remaps IDs", async () => {
  const db = createStarterDeckFixture()

  const result = await copyStarterDecksForUserWithClient(db, "new-user")

  assert.equal(result.copiedDeckIds.length, 1)
  assert.deepEqual(result.skippedStarterDeckIds, [])

  const copiedDeck = db.decks.find((deck) => deck.id === result.copiedDeckIds[0])

  assert.ok(copiedDeck)
  assert.equal(copiedDeck.owner_user_id, "new-user")
  assert.equal(copiedDeck.is_starter, false)
  assert.equal(copiedDeck.name, "Starter Deck")

  const copiedSeed = db.savedSeeds.find(
    (seed) => seed.deck_id === copiedDeck.id
  )

  assert.ok(copiedSeed)
  assert.equal(copiedSeed.name, "Keepable opener")
  assert.equal(copiedSeed.seed, "seed-1")

  const copiedHand = db.startingHands.find(
    (hand) => hand.deck_id === copiedDeck.id
  )

  assert.ok(copiedHand)

  const copiedDeckCardIds = db.deckCards
    .filter((card) => card.deck_id === copiedDeck.id)
    .map((card) => card.id)
  const copiedHandCards = db.startingHandCards.filter(
    (card) => card.starting_hand_id === copiedHand.id
  )

  assert.equal(copiedHandCards.length, 2)
  assert.equal(
    copiedHandCards.every((card) => copiedDeckCardIds.includes(card.deck_card_id)),
    true
  )
  assert.equal(
    copiedHandCards.some((card) => [1, 2, 3].includes(card.deck_card_id)),
    false
  )

  const copiedSimulations = db.simulations.filter(
    (simulation) => simulation.deck_id === copiedDeck.id
  )

  assert.equal(copiedSimulations.length, 1)
  assert.equal(copiedSimulations[0].status, "completed")
  assert.equal(copiedSimulations[0].starting_hand_id, copiedHand.id)

  const copiedRuns = db.llmRuns.filter(
    (run) => run.owner_user_id === "new-user"
  )

  assert.equal(copiedRuns.length, 3)

  for (const run of copiedRuns) {
    assert.equal(run.runtime_stream_key, null)
    assert.equal(run.queued_at, null)
    assert.equal(run.estimated_cost_usd, null)
    assert.equal(run.openrouter_reported_cost_usd, null)
    assert.equal(run.service_tier, "priority")
    assert.equal(run.status, "completed")
  }

  const copiedOpeningRun = db.openingHandRuns.find(
    (run) => run.simulation_id === copiedSimulations[0].id
  )
  const copiedTurnRun = db.turnRuns.find(
    (run) => run.simulation_id === copiedSimulations[0].id
  )
  const copiedReportRun = db.reportRuns.find(
    (run) => run.simulation_id === copiedSimulations[0].id
  )

  assert.ok(copiedOpeningRun)
  assert.ok(copiedTurnRun)
  assert.ok(copiedReportRun)
  assert.equal(copiedOpeningRun.llm_run_id.startsWith("copied-run-"), true)
  assert.equal(copiedTurnRun.llm_run_id.startsWith("copied-run-"), true)
  assert.equal(copiedReportRun.llm_run_id.startsWith("copied-run-"), true)
  assert.deepEqual(copiedTurnRun.turn_actions, {
    untap: [],
    upkeep: [],
    draw: ["Draw *Sol Ring*."],
    precombat_main: ["Play *Command Tower*."],
    combat: [],
    postcombat_main: [],
    end_step_cleanup: [],
  })

  const copiedChunk = db.chunks.find(
    (chunk) => chunk.llm_run_id === copiedOpeningRun.llm_run_id
  )

  assert.ok(copiedChunk)
  assert.equal(copiedChunk.sequence, 1)
  assert.equal(copiedChunk.mcp_function_name, "draw_starting_hand")

  assert.equal(
    db.openrouterGenerations.some((generation) =>
      copiedRuns.some((run) => run.id === generation.llm_run_id)
    ),
    false
  )
  assert.equal(
    db.mcpTokens.some((token) =>
      copiedRuns.some((run) => run.id === token.llm_run_id)
    ),
    false
  )
})

test("starter deck copy skips nonterminal simulations and is idempotent", async () => {
  const db = createStarterDeckFixture()
  const firstCopy = await copyStarterDecksForUserWithClient(db, "new-user")
  const deckCountAfterFirstCopy = db.decks.length
  const secondCopy = await copyStarterDecksForUserWithClient(db, "new-user")

  assert.equal(firstCopy.copiedDeckIds.length, 1)
  assert.deepEqual(secondCopy.copiedDeckIds, [])
  assert.deepEqual(secondCopy.skippedStarterDeckIds, ["starter-deck"])
  assert.equal(db.decks.length, deckCountAfterFirstCopy)
  assert.equal(
    db.simulations.some(
      (simulation) =>
        simulation.deck_id === firstCopy.copiedDeckIds[0] &&
        simulation.seed === "pending-run-seed"
    ),
    false
  )
  assert.equal(
    db.simulations.some(
      (simulation) =>
        simulation.deck_id === firstCopy.copiedDeckIds[0] &&
        simulation.seed === "running-simulation-seed"
    ),
    false
  )
})

test("starter deck copy terminal status sets are explicit", () => {
  assert.deepEqual(STARTER_DECK_COPY_TERMINAL_SIMULATION_STATUSES, [
    "completed",
    "failed",
    "cancelled",
  ])
  assert.deepEqual(STARTER_DECK_COPY_TERMINAL_LLM_RUN_STATUSES, [
    "completed",
    "failed",
    "cancelled",
  ])
})

function createStarterDeckFixture() {
  const now = new Date("2026-01-01T00:00:00.000Z")
  const db = new FakeStarterDeckCopyClient()

  db.decks.push(
    {
      created_at: now,
      description: "Starter description",
      format: "commander",
      id: "starter-deck",
      is_starter: true,
      mulligan_guidelines: "Keep two lands.",
      name: "Starter Deck",
      owner_user_id: null,
      strategy_guidelines: "Ramp first.",
      updated_at: now,
    },
    {
      created_at: now,
      description: null,
      format: "commander",
      id: "regular-deck",
      is_starter: false,
      mulligan_guidelines: null,
      name: "Regular Deck",
      owner_user_id: null,
      strategy_guidelines: null,
      updated_at: now,
    }
  )
  db.deckCards.push(
    {
      created_at: now,
      deck_id: "starter-deck",
      id: 1,
      oracle_id: "11111111-1111-4111-8111-111111111111",
      quantity: 1,
      updated_at: now,
      zone: "commander",
    },
    {
      created_at: now,
      deck_id: "starter-deck",
      id: 2,
      oracle_id: "22222222-2222-4222-8222-222222222222",
      quantity: 1,
      updated_at: now,
      zone: "library",
    },
    {
      created_at: now,
      deck_id: "starter-deck",
      id: 3,
      oracle_id: "33333333-3333-4333-8333-333333333333",
      quantity: 10,
      updated_at: now,
      zone: "library",
    }
  )
  db.savedSeeds.push({
    created_at: now,
    deck_id: "starter-deck",
    id: "seed-id",
    name: "Keepable opener",
    seed: "seed-1",
    updated_at: now,
  })
  db.startingHands.push({
    created_at: now,
    deck_id: "starter-deck",
    id: "hand-1",
    name: "Preset hand",
    updated_at: now,
  })
  db.startingHandCards.push(
    {
      deck_card_id: 2,
      quantity: 1,
      starting_hand_id: "hand-1",
    },
    {
      deck_card_id: 3,
      quantity: 6,
      starting_hand_id: "hand-1",
    }
  )

  db.simulations.push(
    createSimulation({
      id: "sim-completed",
      seed: "copied-seed",
      startingHandId: "hand-1",
      status: "completed",
    }),
    createSimulation({
      id: "sim-completed-with-pending-run",
      seed: "pending-run-seed",
      startingHandId: null,
      status: "completed",
    }),
    createSimulation({
      id: "sim-running",
      seed: "running-simulation-seed",
      startingHandId: null,
      status: "running",
    })
  )
  db.llmRuns.push(
    createLlmRun({
      id: "run-opening",
      phase: "opening_hand",
      status: "completed",
    }),
    createLlmRun({
      id: "run-turn",
      phase: "turn",
      status: "completed",
    }),
    createLlmRun({
      id: "run-report",
      phase: "report",
      status: "completed",
    }),
    createLlmRun({
      id: "run-pending",
      phase: "opening_hand",
      status: "pending",
    }),
    createLlmRun({
      id: "run-running-simulation",
      phase: "opening_hand",
      status: "completed",
    })
  )
  db.openingHandRuns.push(
    {
      attempt_number: 1,
      created_at: now,
      library_snapshot: ["Forest"],
      llm_run_id: "run-opening",
      opening_hand: ["Sol Ring"],
      opening_hand_is_valid: true,
      random_state_snapshot: 124,
      simulation_id: "sim-completed",
    },
    {
      attempt_number: 1,
      created_at: now,
      library_snapshot: null,
      llm_run_id: "run-pending",
      opening_hand: [],
      opening_hand_is_valid: false,
      random_state_snapshot: null,
      simulation_id: "sim-completed-with-pending-run",
    },
    {
      attempt_number: 1,
      created_at: now,
      library_snapshot: ["Forest"],
      llm_run_id: "run-running-simulation",
      opening_hand: ["Sol Ring"],
      opening_hand_is_valid: true,
      random_state_snapshot: 124,
      simulation_id: "sim-running",
    }
  )
  db.turnRuns.push({
    attempt_number: 1,
    created_at: now,
    turn_actions: {
      untap: [],
      upkeep: [],
      draw: ["Draw *Sol Ring*."],
      precombat_main: ["Play *Command Tower*."],
      combat: [],
      postcombat_main: [],
      end_step_cleanup: [],
    },
    game_state: {
      zones: {
        battlefield: [{ name: "Command Tower", tapped: false, notes: null }],
      },
    },
    library_snapshot: ["Forest"],
    llm_run_id: "run-turn",
    outdated: false,
    random_state_snapshot: 125,
    simulation_id: "sim-completed",
    turn_number: 1,
  })
  db.reportRuns.push({
    attempt_number: 1,
    created_at: now,
    llm_run_id: "run-report",
    outdated: false,
    report: "Good keep.",
    simulation_id: "sim-completed",
  })
  db.chunks.push({
    id: 10,
    kind: "mcp_call_complete",
    llm_run_id: "run-opening",
    mcp_function_name: "draw_starting_hand",
    mcp_function_output: { cards: ["Sol Ring"] },
    mcp_function_reason: "Opening hand",
    output_delta: null,
    payload: { type: "tool" },
    reasoning_delta: null,
    received_at: now,
    sequence: 1,
  })
  db.openrouterGenerations.push({ llm_run_id: "run-opening" })
  db.mcpTokens.push({ llm_run_id: "run-opening" })

  return db
}

function createSimulation({
  id,
  seed,
  startingHandId,
  status,
}: {
  id: string
  seed: string
  startingHandId: string | null
  status: SimulationStatus
}): FakeSimulation {
  const now = new Date("2026-01-01T00:00:00.000Z")

  return {
    auto_generate_report: true,
    auto_simulate_next_step: false,
    cancel_requested_at: null,
    completed_at: status === "completed" ? now : null,
    created_at: now,
    created_via: "app",
    deck_id: "starter-deck",
    failed_at: null,
    failure_message: null,
    has_drawn_starting_hand: true,
    id,
    library: ["Forest"],
    llm_model_preset_id: "55555555-5555-4555-8555-555555555555",
    mulligan_count: 0,
    random_state: 123,
    seed,
    started_at: now,
    starting_hand_id: startingHandId,
    status,
    turns_to_simulate: 1,
    updated_at: now,
  }
}

function createLlmRun({
  id,
  phase,
  status,
}: {
  id: string
  phase: FakeLlmRun["phase"]
  status: LlmRunStatus
}): FakeLlmRun {
  const now = new Date("2026-01-01T00:00:00.000Z")

  return {
    cancel_requested_at: null,
    cancelled_at: null,
    completed_at: status === "completed" ? now : null,
    created_at: now,
    estimated_cost_usd: 0.01,
    failed_at: null,
    failure_message: null,
    full_prompt: "Prompt",
    id,
    llm_model_preset_id: "55555555-5555-4555-8555-555555555555",
    model: "test-model",
    openrouter_model_provider: null,
    openrouter_reported_cost_usd: 0.02,
    owner_user_id: "starter-owner",
    phase,
    provider: "openai",
    queued_at: new Date("2026-01-01T00:01:00.000Z"),
    reasoning_effort: "medium",
    service_tier: "priority",
    request_payload: { request: true },
    response_metadata: { metadata: true },
    runtime_stream_key: `stream-${id}`,
    started_at: now,
    status,
    updated_at: now,
    usage: { inputTokens: 1, outputTokens: 2 },
  }
}

function getStarterCopyOperation(text: string) {
  const match = text.match(/\/\*\s*starter-copy:([a-z-]+)\s*\*\//)

  return match?.[1] ?? "unknown"
}

function getString(value: unknown) {
  if (typeof value !== "string") {
    assert.fail(`Expected string, received ${typeof value}`)
  }

  return value
}

function getStringOrNull(value: unknown) {
  if (value === null) {
    return null
  }

  return getString(value)
}

function getNumber(value: unknown) {
  if (typeof value === "string") {
    return Number(value)
  }

  if (typeof value !== "number") {
    assert.fail(`Expected number, received ${typeof value}`)
  }

  return value
}

function getNumberOrNull(value: unknown) {
  if (value === null) {
    return null
  }

  return getNumber(value)
}

function getBoolean(value: unknown) {
  if (typeof value !== "boolean") {
    assert.fail(`Expected boolean, received ${typeof value}`)
  }

  return value
}

function getDate(value: unknown) {
  if (!(value instanceof Date)) {
    assert.fail("Expected Date value")
  }

  return value
}

function getDateOrNull(value: unknown) {
  if (value === null) {
    return null
  }

  return getDate(value)
}

function getStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    assert.fail("Expected string array")
  }

  return value.map(getString)
}

function getJsonObject(value: unknown) {
  if (typeof value !== "string") {
    assert.fail(`Expected JSON string, received ${typeof value}`)
  }

  return JSON.parse(value)
}

function getJsonObjectOrNull(value: unknown) {
  if (value === null) {
    return null
  }

  const parsed = getJsonObject(value)

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    assert.fail("Expected JSON object")
  }

  return parsed as Record<string, unknown>
}

function getJsonStringArray(value: unknown) {
  const parsed = getJsonObject(value)

  if (!Array.isArray(parsed)) {
    assert.fail("Expected JSON string array")
  }

  return parsed.map(getString)
}

function getJsonStringArrayOrNull(value: unknown) {
  if (value === null) {
    return null
  }

  return getJsonStringArray(value)
}

function getSimulationStatus(value: unknown): SimulationStatus {
  const status = getString(value)

  assert.equal(
    ["pending", "unmanaged", "running", "completed", "failed", "cancelled"].includes(
      status
    ),
    true
  )

  return status as SimulationStatus
}

function getLlmRunStatus(value: unknown): LlmRunStatus {
  const status = getString(value)

  assert.equal(
    [
      "pending",
      "streaming",
      "completed",
      "failed",
      "cancel_request",
      "cancel_requested",
      "cancelled",
    ].includes(status),
    true
  )

  return status as LlmRunStatus
}

function getCreatedVia(value: unknown) {
  const createdVia = getString(value)

  assert.equal(["app", "external_mcp"].includes(createdVia), true)

  return createdVia as "app" | "external_mcp"
}

function getLlmRunPhase(value: unknown) {
  const phase = getString(value)

  assert.equal(["opening_hand", "turn", "report", "other"].includes(phase), true)

  return phase as FakeLlmRun["phase"]
}

