# OpenAI Rate Limit MCP Repro

Minimal repro for debugging OpenAI Responses API rate-limit headers and token usage when calling an MCP tool many times.

## Setup

```sh
npm install
cp .env.example .env
```

Set only these values in `.env`:

```env
OPENAI_API_KEY=
MCP_PUBLIC_URL=
```

`MCP_PUBLIC_URL` should point at the MCP endpoint exposed by this project, for example:

```env
MCP_PUBLIC_URL=https://example.ngrok-free.app/mcp
```

## Run

Start the minimal MCP echo server:

```sh
npm run mcp
```

Expose `http://localhost:3001/mcp` with your tunnel of choice, set `MCP_PUBLIC_URL`, then run the debug request:

```sh
npm run debug
```

The debug script streams the response, logs MCP events, usage, request IDs, and rate-limit related response headers.
