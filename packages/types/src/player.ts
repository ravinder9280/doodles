export interface playerData {
    socketId: string
    username: string
    image: string
    score: number
    guessedCorrectly: boolean   // reset to false each round
    isHost: boolean             // first player to create the room
    /** Total score when current drawing phase began (for round-end delta). */
    scoreAtDrawingStart?: number|null
  }