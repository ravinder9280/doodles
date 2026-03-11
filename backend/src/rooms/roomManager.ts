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
}

export interface Room {
  roomId: string
  players: playerData[]  // Array of socket IDs
  strokes: StrokeData[]  // All drawing strokes
  createdAt: number  // Timestamp
  word:string
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
      word:'apple'
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
      room.players.push(playerData)
      console.log(`Player ${playerData.socketId} joined room ${roomId}`)
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
   * Get room count (for debugging)
   */
  getRoomCount(): number {
    return this.rooms.size
  }
}

// Export singleton instance
export const roomManager = new RoomManager()
