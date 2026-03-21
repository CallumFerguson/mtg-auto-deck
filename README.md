# MTG Auto Goldfish

A dark-mode React app for turning a Commander decklist into AI-ready gameplay text.

The current UI focuses on deck intake:

- Enter `1` or `2` commanders in separate boxes.
- Paste a plain-text main deck list in standard MTG mass-entry format.
- Validate the deck shape as either `1 commander + 99 cards` or `2 commanders + 98 cards`.
- Look up cards through the Scryfall API.
- Accept exact matches automatically.
- Require manual approval for fuzzy matches.
- Fall back to manual rules-text entry for cards Scryfall cannot resolve.

## Current behavior

- Commander fields accept plain names like `Pantlaza, Sun-Favored` and single-copy entry style like `1 Pantlaza, Sun-Favored`.
- Commander fields reject duplicate commanders and quantities above `1` in a single commander slot.
- The process action stays disabled until the commander setup and deck count are valid.
- The app uses Scryfall's `/cards/collection` endpoint for batched exact-name lookups.
- If an exact match is not found, the app asks Scryfall for a fuzzy match suggestion, but the user must explicitly accept it before it is used.
- If no acceptable match is found, the user can paste gameplay-relevant card text manually.

## Scripts

```bash
npm run dev
npm run build
npm run typecheck
npm run lint
npm run mcp:dev
npm run mcp:build
```

## MCP Server

This repo now includes a standalone HTTP MCP server for deck goldfishing experiments.

Current tools:

- `create_game`: creates a new in-memory game and returns a `gameId`.
- `draw_card`: draws one or more cards from the preloaded deck for the supplied `gameId` and `count`.

Behavior:

- Each new game starts with the same preloaded deck.
- Games are stored in memory only.
- Any game older than 1 hour is automatically removed.
- The MCP endpoint is served over HTTP at `/mcp`.

### Run locally

Development:

```bash
npm run mcp:dev
```

Production-style local run:

```bash
npm run mcp:build
npm run mcp:server
```

By default the server listens on `http://127.0.0.1:3001/mcp`.

Optional environment variables:

```bash
PORT=3001
HOST=127.0.0.1
```

### LM Studio configuration

Configure LM Studio to connect to the running HTTP MCP server instead of spawning it.

```json
{
  "mtg-auto-goldfish": {
    "url": "http://127.0.0.1:3001/mcp"
  }
}
```

### OpenAI API path

This HTTP MCP shape is also a better fit for later OpenAI API usage, because the model can connect to a remote MCP server over HTTP instead of requiring a locally spawned stdio process.

## Development

1. Install dependencies:

```bash
npm install
```

2. Start the Vite dev server:

```bash
npm run dev
```

3. Open the local app URL shown in the terminal.

## Tech

- React 19
- TypeScript
- Vite
- Tailwind CSS v4
- shadcn/ui
- Scryfall API
