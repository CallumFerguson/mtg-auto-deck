import { queryDatabase } from "./db.js"

export type DeckSummary = {
  id: string
  name: string
  description: string | null
  format: string
  createdAt: string
  updatedAt: string
}

export async function ensureDecksSchema() {
  await queryDatabase("CREATE EXTENSION IF NOT EXISTS pgcrypto")
  await queryDatabase(`
    DO $$
    BEGIN
      CREATE TYPE deck_card_zone AS ENUM ('commander', 'library');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END
    $$;
  `)
  await queryDatabase(`
    CREATE TABLE IF NOT EXISTS decks (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

      name text NOT NULL,
      description text,
      format text NOT NULL DEFAULT 'commander',

      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `)
  await queryDatabase(`
    CREATE TABLE IF NOT EXISTS deck_cards (
      id bigserial PRIMARY KEY,

      deck_id uuid NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
      oracle_id uuid NOT NULL REFERENCES scryfall_oracle_cards(oracle_id),

      zone deck_card_zone NOT NULL,
      quantity integer NOT NULL CHECK (quantity > 0),

      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),

      UNIQUE (deck_id, oracle_id, zone)
    )
  `)
  await queryDatabase(`
    CREATE INDEX IF NOT EXISTS deck_cards_deck_id_idx
      ON deck_cards (deck_id)
  `)
  await queryDatabase(`
    CREATE INDEX IF NOT EXISTS deck_cards_oracle_id_idx
      ON deck_cards (oracle_id)
  `)
  await queryDatabase(`
    CREATE INDEX IF NOT EXISTS deck_cards_deck_id_zone_idx
      ON deck_cards (deck_id, zone)
  `)
}

export async function listDecks(): Promise<DeckSummary[]> {
  const result = await queryDatabase<{
    id: string
    name: string
    description: string | null
    format: string
    created_at: Date
    updated_at: Date
  }>(`
    SELECT id, name, description, format, created_at, updated_at
    FROM decks
    ORDER BY updated_at DESC, name ASC
  `)

  return result.rows.map((deck) => ({
    id: deck.id,
    name: deck.name,
    description: deck.description,
    format: deck.format,
    createdAt: deck.created_at.toISOString(),
    updatedAt: deck.updated_at.toISOString(),
  }))
}
