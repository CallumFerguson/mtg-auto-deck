import { randomUUID } from 'node:crypto'

import { PRELOADED_DECK } from './preloaded-deck.js'

const ONE_HOUR_IN_MS = 60 * 60 * 1000

type GameRecord = {
  id: string
  createdAt: number
  library: string[]
}

export type DrawResult =
  | {
      ok: true
      cards: string[]
      cardsRemaining: number
    }
  | {
      ok: false
      reason: 'game_not_found' | 'empty_library'
    }

export class GameStore {
  private readonly games = new Map<string, GameRecord>()

  constructor() {
    const cleanupTimer = setInterval(() => {
      this.deleteExpiredGames()
    }, ONE_HOUR_IN_MS)

    cleanupTimer.unref()
  }

  createGame() {
    this.deleteExpiredGames()

    const id = randomUUID()
    const game: GameRecord = {
      id,
      createdAt: Date.now(),
      library: shuffle(PRELOADED_DECK),
    }

    this.games.set(id, game)

    return {
      gameId: game.id,
      createdAt: new Date(game.createdAt).toISOString(),
      cardsRemaining: game.library.length,
      totalGames: this.games.size,
    }
  }

  drawCards(gameId: string, count: number): DrawResult {
    this.deleteExpiredGames()

    const game = this.games.get(gameId)

    if (!game) {
      return { ok: false, reason: 'game_not_found' }
    }

    if (game.library.length === 0) {
      return { ok: false, reason: 'empty_library' }
    }

    const cards = game.library.splice(0, count)

    return {
      ok: true,
      cards,
      cardsRemaining: game.library.length,
    }
  }

  private deleteExpiredGames() {
    const expirationCutoff = Date.now() - ONE_HOUR_IN_MS

    for (const [gameId, game] of this.games.entries()) {
      if (game.createdAt < expirationCutoff) {
        this.games.delete(gameId)
      }
    }
  }
}

function shuffle(cards: readonly string[]) {
  const shuffledCards = [...cards]

  for (let index = shuffledCards.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    const currentCard = shuffledCards[index]

    shuffledCards[index] = shuffledCards[swapIndex]
    shuffledCards[swapIndex] = currentCard
  }

  return shuffledCards
}
