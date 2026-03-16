import { getRandomWords } from '../constant/words.js'

export interface StrokeData {
  x: number
  y: number
  color: string
  userId: string
  isDrawing: boolean
  timestamp: number
}
export interface playerData {
  socketId: string
  username: string
  image: string
  score: number
  guessedCorrectly: boolean   // reset to false each round
  isHost: boolean             // first player to create the room
}

export interface Room {
  roomId: string
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
  wordPool: string[]           // shuffled words available this game
}

class RoomManager {
  private rooms: Map<string, Room>
  private readonly ROOM_ID_LENGTH = 6
  private readonly ROOM_ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

  constructor() {
    this.rooms = new Map()
  }

  /**
   * Generate a unique room ID
   */
  private generateRoomId(): string {
    let roomId: string
    let attempts = 0
    const maxAttempts = 100

    do {
      roomId = ''
      for (let i = 0; i < this.ROOM_ID_LENGTH; i++) {
        roomId += this.ROOM_ID_CHARS.charAt(
          Math.floor(Math.random() * this.ROOM_ID_CHARS.length)
        )
      }
      attempts++
    } while (this.rooms.has(roomId) && attempts < maxAttempts)

    if (attempts >= maxAttempts) {
      throw new Error('Failed to generate unique room ID')
    }

    return roomId
  }

  /**
   * Create a new room
   */
  createRoom(): Room {
    const roomId = this.generateRoomId()
    const room: Room = {
      roomId,
      players: [],
      strokes: [],
      createdAt: Date.now(),
      currentWord: '',
      gameStarted: false,
      gamePhase: 'waiting',
      currentDrawerIndex: 0,
      round: 0,
      maxRounds: 3,
      roundStartTime: 0,
      roundDurationMs: 80000, // 80 seconds
      roundTimerRef: null,
      wordPool: []
    }
    this.rooms.set(roomId, room)
    console.log(`Room created: ${roomId}`)
    return room
  }

  /**
   * Get room by ID
   */
  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId)
  }

  /**
   * Check if room exists
   */
  roomExists(roomId: string): boolean {
    return this.rooms.has(roomId)
  }

  /**
   * Add player to room
   */
  addPlayerToRoom(roomId: string, playerData: playerData): boolean {
    const room = this.rooms.get(roomId)
    if (!room) {
      return false
    }

    if (!room.players.some(player => player.socketId === playerData.socketId)) {
      // Ensure all required fields are set
      const fullPlayerData: playerData = {
        socketId: playerData.socketId,
        username: playerData.username,
        image: playerData.image,
        score: playerData.score ?? 0,
        guessedCorrectly: playerData.guessedCorrectly ?? false,
        isHost: playerData.isHost ?? false
      }
      room.players.push(fullPlayerData)
      console.log(`Player ${fullPlayerData.socketId} joined room ${roomId}`)
    }
    return true
  }

  /**
   * Remove player from room
   * Returns true if room was deleted (empty), false otherwise
   */
  removePlayerFromRoom(roomId: string, socketId: string): boolean {
    const room = this.rooms.get(roomId)
    if (!room) {
      return false
    }

    room.players = room.players.filter(player => player.socketId !== socketId)
    console.log(`Player ${socketId} left room ${roomId}`)

    // Clean up empty rooms immediately
    if (room.players.length === 0) {
      this.rooms.delete(roomId)
      console.log(`Room ${roomId} deleted (empty)`)
      return true
    }

    return false
  }

  /**
   * Add stroke to room
   */
  addStrokeToRoom(roomId: string, strokeData: StrokeData): boolean {
    const room = this.rooms.get(roomId)
    if (!room) {
      return false
    }

    // Add timestamp if not provided
    if (!strokeData.timestamp) {
      strokeData.timestamp = Date.now()
    }

    room.strokes.push(strokeData)
    return true
  }

  /**
   * Get all strokes for a room
   */
  getRoomStrokes(roomId: string): StrokeData[] {
    const room = this.rooms.get(roomId)
    if (!room) {
      return []
    }
    return room.strokes
  }

  /**
   * Get all players in a room
   */
  getRoomPlayers(roomId: string): playerData[] {
    const room = this.rooms.get(roomId)
    if (!room) {
      return []
    }
    return room.players
  }

  /**
   * Clear all strokes in a room
   */
  clearRoomStrokes(roomId: string): boolean {
    const room = this.rooms.get(roomId)
    if (!room) {
      return false
    }
    room.strokes = []
    console.log(`Cleared strokes for room ${roomId}`)
    return true
  }

  /**
   * Get room count (for debugging)
   */
  getRoomCount(): number {
    return this.rooms.size
  }

  /**
   * Initialize game - set gameStarted = true, reset scores, pick word pool
   */
  initGame(roomId: string, maxRounds: number = 3): boolean {
    const room = this.rooms.get(roomId)
    if (!room) {
      return false
    }

    if (room.players.length < 2) {
      console.log(`Cannot start game in room ${roomId}: need at least 2 players`)
      return false
    }

    room.gameStarted = true
    room.gamePhase = 'waiting'
    room.maxRounds = maxRounds
    room.round = 0
    room.currentDrawerIndex = 0
    room.wordPool = getRandomWords(maxRounds * room.players.length + 10) // Extra words for safety

    // Reset all player scores and guesses
    room.players.forEach(player => {
      player.score = 0
      player.guessedCorrectly = false
    })

    console.log(`Game initialized in room ${roomId} with ${maxRounds} rounds`)
    return true
  }

  /**
   * Reset all players' guessedCorrectly flag to false
   */
  resetRoundGuesses(roomId: string): boolean {
    const room = this.rooms.get(roomId)
    if (!room) {
      return false
    }

    room.players.forEach(player => {
      player.guessedCorrectly = false
    })

    return true
  }

  /**
   * Award points to a player
   */
  awardPoints(roomId: string, socketId: string, points: number): boolean {
    const room = this.rooms.get(roomId)
    if (!room) {
      return false
    }

    const player = room.players.find(p => p.socketId === socketId)
    if (player) {
      player.score += points
      console.log(`Awarded ${points} points to ${player.username} in room ${roomId}`)
      return true
    }

    return false
  }

  /**
   * Check if all non-drawers have guessed correctly
   */
  allNonDrawersGuessed(roomId: string): boolean {
    const room = this.rooms.get(roomId)
    if (!room || !room.gameStarted) {
      return false
    }

    const drawer = room.players[room.currentDrawerIndex]
    if (!drawer) {
      return false
    }

    const nonDrawers = room.players.filter(p => p.socketId !== drawer.socketId)
    if (nonDrawers.length === 0) {
      return false // No one to guess
    }

    return nonDrawers.every(player => player.guessedCorrectly)
  }

  /**
   * Get the current drawer player data
   */
  getCurrentDrawer(roomId: string): playerData | undefined {
    const room = this.rooms.get(roomId)
    if (!room) {
      return undefined
    }

    return room.players[room.currentDrawerIndex]
  }

  /**
   * Advance to the next drawer
   * Returns true if round was incremented, false otherwise
   */
  advanceDrawer(roomId: string): boolean {
    const room = this.rooms.get(roomId)
    if (!room) {
      return false
    }

    room.currentDrawerIndex = (room.currentDrawerIndex + 1) % room.players.length

    // If we've cycled back to the first player, increment round
    if (room.currentDrawerIndex === 0) {
      room.round++
      return true
    }

    return false
  }
}

// Export singleton instance
export const roomManager = new RoomManager()
