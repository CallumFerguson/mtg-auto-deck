import type { Request, Response } from 'express'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod/v4'

import { GameStore } from './game-store.js'

const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_PORT = 3001

const gameStore = new GameStore()

function createServer() {
  const server = new McpServer(
    {
      name: 'mtg-auto-goldfish-mcp',
      version: '0.0.1',
    },
    {
      capabilities: {
        logging: {},
      },
    },
  )

  server.registerTool(
    'create_game',
    {
      title: 'Create Game',
      description:
        'Create a new in-memory MTG game using the server preloaded deck and return its game ID.',
      outputSchema: {
        gameId: z.uuid(),
        createdAt: z.iso.datetime(),
        cardsRemaining: z.number().int().nonnegative(),
        totalGames: z.number().int().nonnegative(),
      },
    },
    async () => {
      const game = gameStore.createGame()

      logInfo('new', `${shortId(game.gameId)} games=${game.totalGames}`)

      return {
        content: [
          {
            type: 'text',
            text: `Created game ${game.gameId}. Library has ${game.cardsRemaining} cards remaining.`,
          },
        ],
        structuredContent: game,
      }
    },
  )

  server.registerTool(
    'draw_card',
    {
      title: 'Draw Card',
      description:
        'Draw one or more cards from the preloaded library for an existing game ID.',
      inputSchema: {
        gameId: z.uuid().describe('The game ID returned by create_game.'),
        count: z.number().int().positive().describe('How many cards to draw.'),
      },
      outputSchema: {
        gameId: z.uuid(),
        cards: z.array(z.string()),
        cardsRemaining: z.number().int().nonnegative(),
      },
    },
    async ({ gameId, count }) => {
      const drawResult = gameStore.drawCards(gameId, count)

      if (!drawResult.ok) {
        logWarn('draw', `${shortId(gameId)} ${drawResult.reason}`)

        const message =
          drawResult.reason === 'game_not_found'
            ? 'Game not found. It may be invalid or it may have expired after one hour.'
            : 'That game has no cards left in its library.'

        return {
          content: [
            {
              type: 'text',
              text: message,
            },
          ],
          isError: true,
        }
      }

      const response = {
        gameId,
        cards: drawResult.cards,
        cardsRemaining: drawResult.cardsRemaining,
      }

      logInfo(
        'draw',
        `${shortId(gameId)} n=${response.cards.length} left=${response.cardsRemaining}`,
      )

      return {
        content: [
          {
            type: 'text',
            text: `Drew ${response.cards.length} card(s): ${response.cards.join(', ')}. ${response.cardsRemaining} cards remain in the library.`,
          },
        ],
        structuredContent: response,
      }
    },
  )

  return server
}

async function main() {
  const host = process.env.HOST ?? DEFAULT_HOST
  const port = getPort(process.env.PORT)
  const app = createMcpExpressApp({ host })

  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({
      ok: true,
      service: 'mtg-auto-goldfish-mcp',
    })
  })

  app.post('/mcp', async (req: Request, res: Response) => {
    const server = createServer()

    try {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      })

      await server.connect(transport)
      await transport.handleRequest(req, res, req.body)

      res.on('close', () => {
        void transport.close()
        void server.close()
      })
    } catch (error) {
      console.error('Error handling MCP request:', error)

      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error',
          },
          id: null,
        })
      }
    }
  })

  app.get('/mcp', (_req: Request, res: Response) => {
    res.status(405).json({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Method not allowed.',
      },
      id: null,
    })
  })

  app.delete('/mcp', (_req: Request, res: Response) => {
    res.status(405).json({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Method not allowed.',
      },
      id: null,
    })
  })

  app.listen(port, host, (error?: Error) => {
    if (error) {
      console.error('Failed to start MCP server:', error)
      process.exit(1)
    }

    console.error(
      `mtg-auto-goldfish MCP server listening at http://${host}:${port}/mcp`,
    )
  })
}

function getPort(rawPort: string | undefined) {
  if (!rawPort) {
    return DEFAULT_PORT
  }

  const parsedPort = Number.parseInt(rawPort, 10)

  if (Number.isNaN(parsedPort) || parsedPort <= 0) {
    throw new Error(`Invalid PORT value: ${rawPort}`)
  }

  return parsedPort
}

function shortId(gameId: string) {
  return gameId.slice(0, 8)
}

function logInfo(event: string, message: string) {
  console.error(`[${event}] ${message}`)
}

function logWarn(event: string, message: string) {
  console.warn(`[${event}] ${message}`)
}

main().catch(error => {
  console.error('MCP server error:', error)
  process.exit(1)
})
