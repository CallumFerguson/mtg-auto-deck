import assert from "node:assert/strict"
import test from "node:test"

import {
  ArchidektImportError,
  importArchidektDeck,
  normalizeArchidektDeck,
  parseArchidektDeckId,
} from "./archidekt-import.js"

test("parses Archidekt deck IDs from raw IDs and links", () => {
  assert.equal(parseArchidektDeckId("16140836"), "16140836")
  assert.equal(
    parseArchidektDeckId("https://archidekt.com/decks/16140836/go_deck"),
    "16140836"
  )
  assert.equal(
    parseArchidektDeckId("https://www.archidekt.com/api/decks/16140836/"),
    "16140836"
  )
  assert.equal(
    parseArchidektDeckId("archidekt.com/decks/16140836?sort=alpha"),
    "16140836"
  )
  assert.equal(parseArchidektDeckId("not a deck"), null)
  assert.equal(parseArchidektDeckId(""), null)
})

test("imports commanders, main-deck cards, and Quill description", async () => {
  let requestedUrl = ""
  const fetchDeck: typeof fetch = async (input, init) => {
    requestedUrl = String(input)
    assert.deepEqual(init?.headers, {
      Accept: "application/json",
      "User-Agent": "mtg-auto-deck-server/0.0.1",
    })

    return createJsonResponse({
      name: "Go Deck Yourself",
      description: JSON.stringify({
        ops: [{ insert: "First line\n" }, { insert: "Second line" }],
      }),
      cards: [
        createCardEntry("Winter, Cynical Opportunist", {
          categories: ["Commander"],
        }),
        createCardEntry("Sol Ring", {
          categories: ["Ramp"],
        }),
        createCardEntry("Forest", {
          categories: ["Land"],
          quantity: 2,
        }),
        createCardEntry("Wishboard Card", {
          categories: ["Maybeboard"],
        }),
        createCardEntry("Sideboard Card", {
          categories: ["Sideboard"],
        }),
        createCardEntry("Deleted Card", {
          deletedAt: "2026-01-01T00:00:00.000Z",
        }),
        createCardEntry("Companion Card", {
          companion: true,
        }),
        createCardEntry("Spirit Token", {
          layout: "token",
          types: ["Token", "Creature"],
        }),
      ],
    })
  }

  const deck = await importArchidektDeck(
    "https://archidekt.com/decks/16140836/go_deck",
    fetchDeck
  )

  assert.equal(requestedUrl, "https://archidekt.com/api/decks/16140836/")
  assert.deepEqual(deck, {
    deckId: "16140836",
    name: "Go Deck Yourself",
    description: "First line\nSecond line",
    commanders: ["Winter, Cynical Opportunist"],
    cards: [
      {
        name: "Forest",
        quantity: 2,
      },
      {
        name: "Sol Ring",
        quantity: 1,
      },
    ],
  })
})

test("keeps plain description text and merges duplicate cards", () => {
  const deck = normalizeArchidektDeck("123", {
    name: "Plain Description Deck",
    description: "  A normal deck description.  ",
    cards: [
      createCardEntry("Kraum, Ludevic's Opus", {
        categories: ["Commander"],
      }),
      createCardEntry("Tymna the Weaver", {
        categories: ["Commander"],
      }),
      createCardEntry("Island", {
        quantity: 1,
      }),
      createCardEntry("Island", {
        quantity: 2,
      }),
    ],
  })

  assert.deepEqual(deck, {
    deckId: "123",
    name: "Plain Description Deck",
    description: "A normal deck description.",
    commanders: ["Kraum, Ludevic's Opus", "Tymna the Weaver"],
    cards: [
      {
        name: "Island",
        quantity: 3,
      },
    ],
  })
})

test("rejects invalid inputs, missing commanders, malformed payloads, and upstream failures", async () => {
  await assert.rejects(
    () => importArchidektDeck("not a deck", createJsonFetch({})),
    (error: unknown) =>
      error instanceof ArchidektImportError && error.status === 400
  )

  assert.throws(
    () => normalizeArchidektDeck("123", { cards: "not an array" }),
    (error: unknown) =>
      error instanceof ArchidektImportError && error.status === 502
  )

  assert.throws(
    () =>
      normalizeArchidektDeck("123", {
        cards: [{ categories: [], deletedAt: null, quantity: 1 }],
      }),
    (error: unknown) =>
      error instanceof ArchidektImportError && error.status === 502
  )

  assert.throws(
    () =>
      normalizeArchidektDeck("123", {
        cards: [createCardEntry("Sol Ring")],
      }),
    (error: unknown) =>
      error instanceof ArchidektImportError && error.status === 400
  )

  await assert.rejects(
    () => importArchidektDeck("123", createJsonFetch({}, 404)),
    (error: unknown) =>
      error instanceof ArchidektImportError && error.status === 404
  )

  await assert.rejects(
    () =>
      importArchidektDeck(
        "123",
        async () => new Response("{", { status: 200 })
      ),
    (error: unknown) =>
      error instanceof ArchidektImportError && error.status === 502
  )
})

function createJsonFetch(payload: unknown, status = 200): typeof fetch {
  return async () => createJsonResponse(payload, status)
}

function createJsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  })
}

function createCardEntry(
  name: string,
  {
    categories = [],
    companion = false,
    deletedAt = null,
    layout = "normal",
    quantity = 1,
    types = ["Artifact"],
  }: {
    categories?: string[]
    companion?: boolean
    deletedAt?: string | null
    layout?: string
    quantity?: number
    types?: string[]
  } = {}
) {
  return {
    categories,
    companion,
    deletedAt,
    quantity,
    card: {
      oracleCard: {
        layout,
        name,
        types,
      },
    },
  }
}
