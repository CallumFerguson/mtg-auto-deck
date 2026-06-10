# MTG Auto Deck

[Try it for free here](https://mtgautodeck.com/)

## Screenshots

![Simulation screenshot](docs/simulation-screenshot.png)

![Simulation screenshot 2](docs/simulation-screenshot-2.png)

## Local Setup

1. Copy the server example environment file:

   ```sh
   cp mtg-auto-deck-server/.env.example mtg-auto-deck-server/.env
   ```

2. Fill in the variables in `mtg-auto-deck-server/.env`.

   - Set PGHOST, PGPORT, PGDATABASE, PGUSER, and PGPASSWORD
   - Type or generate a random string for BETTER_AUTH_SECRET
   - Set AUTO_ADMIN_EMAIL. When an account is created with that email, it will be promoted to admin
   - Stripe and email verification is off by default
   - Optionally set api keys OPENAI_API_KEY, ANTHROPIC_API_KEY, and OPENROUTER_API_KEY
   - Optionally configure LLAMACPP vars for local models
   - Optionally set OPENING_HAND_MCP_PUBLIC_URL and TURN_SIMULATION_MCP_PUBLIC_URL for running OpenAI and Anthropic api models

3. Configure the frontend public URLs for each Vite mode.

   Use localhost for development:

   ```sh
   cp .env.example .env.development
   ```

   Vite automatically loads `.env.development` for `npm run dev` and
   `.env.production` for `npm run build`. `VITE_*` values are exposed to the
   browser, so use them only for public configuration like app, API, and
   public data origins.

4. Install dependencies:

   ```sh
   npm install
   ```

## Local Running

Start the app and server:

```sh
npm run dev
```

```sh
npm run server:watch
```

Optionally start ngrok when using openai or anthropic and running local mcp server:

```sh
npm run ngrok
```

After creating the first account (as admin with AUTO_ADMIN_EMAIL), go to the admin dashboard /admin

   - On users tab, give yourself the Super Max tier for nearly unlimited usage limits
   - On the model presets tab, add a model preset

## Deployment

Deployment instructions: [`deploy/README.md`](deploy/README.md).
