import type { playerData } from './player.js'
export interface RoomConfig {
    maxPlayers: number
    rounds: number
    wordCount: number
    drawTime: number
  }
  export interface StrokeData {
    x: number
    y: number
    color: string
    userId: string
    isDrawing: boolean
    timestamp: number
  }
  export interface Room {
    roomId: string
    maxPlayers: number
    players: playerData[]  // Array of socket IDs
    strokes: StrokeData[]  // All drawing strokes
    createdAt: number  // Timestamp
    currentWord: string           // rename from word for clarity
    gameStarted: boolean
    gamePhase: 'waiting' | 'picking' | 'drawing' | 'round_end' | 'game_over'
    currentDrawerIndex: number   // index into players[]
    round: number                // current round number (1-based)
    maxRounds: number            // total rounds to play
    roundStartTime: number       // Date.now() when round started
    roundDurationMs: number      // e.g. 80_000
    roundTimerRef: NodeJS.Timeout | null   // server timer handle (never sent to client)
    /** 1s tick that emits timer_update; must be cleared with roundTimerRef or it keeps updating the UI */
    roundTickIntervalRef: NodeJS.Timeout | null
    wordPool: string[]           // shuffled words available this game
    /** Number of word options shown to drawer before each drawing round */
    wordCount: number
    pendingWordChoices: string[]
    /** When pick window ends (ms); 0 if not in picking phase */
    pickPhaseEndsAt: number
    pickingTimerRef: NodeJS.Timeout | null
    pickingTickIntervalRef: NodeJS.Timeout | null
  }