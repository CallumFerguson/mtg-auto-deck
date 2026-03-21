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
```

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
