# MTG Auto Deck

![Simulation screenshot](docs/simulation-screenshot.png)

![Simulation screenshot 2](docs/simulation-screenshot-2.png)

## Setup

1. Copy the server example environment file:

   ```sh
   cp mtg-auto-deck-server/.env.example mtg-auto-deck-server/.env
   ```

2. Fill in the variables in `mtg-auto-deck-server/.env`.

   For user accounts, set `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`,
   `APP_PUBLIC_URL`, and the `SMTP_*` variables used for auth email.
   In local development, open the app at the same host configured in
   `APP_PUBLIC_URL` so auth cookies are sent consistently.
   The standalone `/mcp/simulation` server is test-only and is disabled by
   default; set `SIMULATION_MCP_SERVER_ENABLED=true` only when intentionally
   testing that endpoint.

3. Configure the frontend API URL for each Vite mode.

   Use localhost for development:

   ```sh
   cp .env.example .env.development
   ```

   Create the production env file from the same example:

   ```sh
   cp .env.example .env.production
   ```

   Then update `.env.production` with your deployed API URL:

   ```env
   VITE_API_BASE_URL=https://api.example.com
   ```

   Vite automatically loads `.env.development` for `npm run dev` and
   `.env.production` for `npm run build`. `VITE_API_BASE_URL` is exposed to the
   browser, so use it only for public configuration like the API origin.

4. Install dependencies:

   ```sh
   npm install
   ```

## Running

Start the app and server in separate terminals:

```sh
npm run dev
```

```sh
npm run server:watch
```

Optionally start ngrok when using openai and locally running mcp server:

```sh
npm run ngrok
```
