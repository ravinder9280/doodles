import { Server, Socket } from "socket.io"
import { roomManager, type Room, roomToConfigWire } from "../rooms/roomManager.js"
import { getRandomWord } from "../constant/words.js"

function clearRoomRoundTimers(room: Room): void {
  if (room.roundTimerRef) {
    clearTimeout(room.roundTimerRef)
    room.roundTimerRef = null
  }
  if (room.roundTickIntervalRef) {
    clearInterval(room.roundTickIntervalRef)
    room.roundTickIntervalRef = null
  }
}

const PICK_DURATION_MS = 10_000

function clearPickingTimers(room: Room): void {
  if (room.pickingTimerRef) {
    clearTimeout(room.pickingTimerRef)
    room.pickingTimerRef = null
  }
  if (room.pickingTickIntervalRef) {
    clearInterval(room.pickingTickIntervalRef)
    room.pickingTickIntervalRef = null
  }
}

function takeWordChoices(room: Room, count: number): string[] {
  const n = Math.max(2, Math.min(8, Math.floor(count)))
  const out: string[] = []
  const pushUnique = (w: string) => {
    const t = w.trim()
    const lower = t.toLowerCase()
    if (!lower || out.some(o => o.toLowerCase() === lower)) return
    out.push(t)
  }
  while (out.length < n) {
    if (room.wordPool.length > 0) {
      const w = room.wordPool.pop()
      if (w) pushUnique(w)
      else {
        const rw = getRandomWord()
        if (rw) pushUnique(rw)
      }
    } else {
      const rw = getRandomWord()
      if (rw) pushUnique(rw)
      else pushUnique(`word${out.length + 1}`)
    }
  }
  return out
}

const CONFIG_MIN_MAX = {
  maxPlayers: [2, 12] as const,
  rounds: [1, 10] as const,
  wordCount: [2, 8] as const,
  drawTimeSec: [30, 120] as const,
}

function clampConfigValue(v: number, [min, max]: readonly [number, number]): number {
  return Math.min(max, Math.max(min, v))
}

/**
 * After drawer picks (or timeout), start drawing timer and hints.
 */
function beginDrawingPhase(roomId: string, io: Server, word: string): void {
  const room = roomManager.getRoom(roomId)
  if (!room || !room.gameStarted) {
    return
  }
  if (room.gamePhase !== "picking") {
    return
  }

  clearPickingTimers(room)
  room.pendingWordChoices = []
  room.pickPhaseEndsAt = 0
  room.currentWord = word.trim() || (getRandomWord() || "draw")
  room.gamePhase = "drawing"
  room.roundStartTime = Date.now()

  room.players.forEach(p => {
    p.scoreAtDrawingStart = p.score
  })

  clearRoomRoundTimers(room)

  const drawer = roomManager.getCurrentDrawer(roomId)
  if (!drawer) {
    console.error(`No drawer found for room ${roomId}`)
    return
  }

  io.to(roomId).emit("drawer_selected", {
    drawerSocketId: drawer.socketId,
    drawerUsername: drawer.username,
    round: room.round,
    timeLimit: room.roundDurationMs / 1000
  })

  io.to(drawer.socketId).emit("your_word", {
    word: room.currentWord
  })

  const wordLength = room.currentWord.length
  const hint = "_ ".repeat(wordLength).trim()

  room.players.forEach(player => {
    if (player.socketId !== drawer.socketId) {
      io.to(player.socketId).emit("word_hint", {
        hint,
        wordLength
      })
    }
  })

  let secondsLeft = Math.floor(room.roundDurationMs / 1000)
  io.to(roomId).emit("timer_update", { secondsLeft })

  room.roundTickIntervalRef = setInterval(() => {
    secondsLeft--
    if (secondsLeft >= 0) {
      io.to(roomId).emit("timer_update", { secondsLeft })
    }
  }, 1000) as unknown as NodeJS.Timeout

  room.roundTimerRef = setTimeout(() => {
    clearRoomRoundTimers(room)
    endRound(roomId, io, "time_up")
  }, room.roundDurationMs) as any

  console.log(`Round ${room.round} drawing in room ${roomId}, drawer: ${drawer.username}, word: ${room.currentWord}`)
}

/**
 * Start a new round — word choice overlay (10s) then drawing.
 */
function startRound(roomId: string, io: Server): void {
  const room = roomManager.getRoom(roomId)
  if (!room || !room.gameStarted) {
    return
  }

  roomManager.clearRoomStrokes(roomId)
  io.to(roomId).emit("clear_canvas", {})

  roomManager.resetRoundGuesses(roomId)

  room.currentWord = ""
  const drawer = roomManager.getCurrentDrawer(roomId)
  if (!drawer) {
    console.error(`No drawer found for room ${roomId}`)
    return
  }

  room.gamePhase = "picking"
  clearRoomRoundTimers(room)
  clearPickingTimers(room)

  const words = takeWordChoices(room, room.wordCount)
  room.pendingWordChoices = words
  room.pickPhaseEndsAt = Date.now() + PICK_DURATION_MS

  io.to(roomId).emit("word_picking_start", {
    drawerSocketId: drawer.socketId,
    drawerUsername: drawer.username,
    round: room.round,
    maxRounds: room.maxRounds,
    pickSeconds: Math.floor(PICK_DURATION_MS / 1000)
  })
  io.to(drawer.socketId).emit("pick_word_options", { words })

  let pickSecondsLeft = Math.floor(PICK_DURATION_MS / 1000)
  io.to(roomId).emit("pick_timer_tick", { secondsLeft: pickSecondsLeft })

  room.pickingTickIntervalRef = setInterval(() => {
    pickSecondsLeft--
    if (pickSecondsLeft >= 0) {
      io.to(roomId).emit("pick_timer_tick", { secondsLeft: pickSecondsLeft })
    }
  }, 1000) as unknown as NodeJS.Timeout

  room.pickingTimerRef = setTimeout(() => {
    const r = roomManager.getRoom(roomId)
    if (!r || r.gamePhase !== "picking") {
      return
    }
    clearPickingTimers(r)
    const fallback = r.pendingWordChoices[0] || getRandomWord() || "draw"
    beginDrawingPhase(roomId, io, fallback)
  }, PICK_DURATION_MS) as any

  console.log(`Word picking started in room ${roomId}, drawer: ${drawer.username}`)
}

/**
 * End the current round
 */
function endRound(roomId: string, io: Server, reason: 'time_up' | 'all_guessed'): void {
  const room = roomManager.getRoom(roomId)
  if (!room || !room.gameStarted) {
    return
  }

  clearRoomRoundTimers(room)

  room.gamePhase = 'round_end'

  // Get final scores + points gained this drawing round
  const players = roomManager.getRoomPlayers(roomId)
  const scores = players.map(p => ({ socketId: p.socketId, username: p.username, score: p.score }))
  const roundScores = players.map(p => ({
    socketId: p.socketId,
    username: p.username,
    pointsThisRound: Math.max(0, p.score - p.scoreAtDrawingStart)
  }))

  // Emit round end to all
  io.to(roomId).emit("round_end", {
    word: room.currentWord,
    scores,
    roundScores,
    round: room.round,
    reason
  })

  console.log(`Round ${room.round} ended in room ${roomId}, reason: ${reason}`)

  // Wait 3 seconds, then start next round or end game
  setTimeout(() => {
    const updatedRoom = roomManager.getRoom(roomId)
    if (!updatedRoom || !updatedRoom.gameStarted) {
      return
    }

    // Check if game should end
    const roundIncremented = roomManager.advanceDrawer(roomId)
    const finalRoom = roomManager.getRoom(roomId)

    if (!finalRoom) {
      return
    }

    if (roundIncremented && finalRoom.round > finalRoom.maxRounds) {
      // Game over
      endGame(roomId, io)
    } else {
      // Start next round
      startRound(roomId, io)
    }
  }, 5000)
}

/**
 * End the game
 */
function endGame(roomId: string, io: Server): void {
  const room = roomManager.getRoom(roomId)
  if (!room) {
    return
  }

  clearRoomRoundTimers(room)
  clearPickingTimers(room)
  room.pendingWordChoices = []
  room.pickPhaseEndsAt = 0

  // Final leaderboard (with avatars for game-end UI)
  const players = roomManager.getRoomPlayers(roomId)
  const scores = players
    .map(p => ({
      socketId: p.socketId,
      username: p.username,
      score: p.score,
      image: p.image
    }))
    .sort((a, b) => b.score - a.score)

  const maxScore = scores.length > 0 ? Math.max(...scores.map(s => s.score)) : 0
  const winners = scores.filter(s => s.score === maxScore)

  // Reset game state
  room.gameStarted = false
  room.gamePhase = 'waiting'
  room.round = 0
  room.currentDrawerIndex = 0
  room.currentWord = ''
  room.wordPool = []

  // Emit game over
  io.to(roomId).emit("game_over", {
    scores,
    winner: winners.length === 1 ? winners[0] : null,
    winners: winners.length > 1 ? winners : null
  })

  console.log(`Game ended in room ${roomId}`)
}

export default function socketHandler(io: Server) {
  io.on("connection", (socket: Socket) => {
    console.log("User connected:", socket.id)

    // Store current room ID in socket data
    socket.data.currentRoom = null
    socket.data.userId = null

    // Create room event
    socket.on("create_room", (data: { username: string; image: string; userId?: string }) => {
      try {
        const { username, image, userId } = data

        // Store user data in socket
        socket.data.username = username
        socket.data.image = image
        if (userId) socket.data.userId = userId

        const room = roomManager.createRoom()
        const roomId = room.roomId

        // Leave previous room if any
        if (socket.data.currentRoom) {
          socket.leave(socket.data.currentRoom)
          roomManager.removePlayerFromRoom(socket.data.currentRoom, socket.id)
          // Notify other players in previous room
          const prevRoomId = socket.data.currentRoom
          if (roomManager.roomExists(prevRoomId)) {
            io.to(prevRoomId).emit("players_updated", {
              players: roomManager.getRoomPlayers(prevRoomId)
            })
          }
        }

        // Join new room
        socket.join(roomId)
        // First player is the host
        roomManager.addPlayerToRoom(roomId, {
          socketId: socket.id,
          username,
          image,
          score: 0,
          guessedCorrectly: false,
          isHost: true,
          scoreAtDrawingStart: 0
        })
        socket.data.currentRoom = roomId

        // Get all players in the room
        const players = roomManager.getRoomPlayers(roomId)

        // Send room created confirmation with players list
        socket.emit("room_created", {
          roomId,
          players,
          roomConfig: roomToConfigWire(room),
        })

        // Notify all players in the room about the update
        io.to(roomId).emit("players_updated", { players })

        console.log(`User ${socket.id} created and joined room ${roomId}`)
      } catch (error) {
        console.error("Error creating room:", error)
        socket.emit("room_error", { message: "Failed to create room" })
      }
    })

    // Join room event
    socket.on("join_room", (data: { roomId: string; username: string; image: string; userId?: string }) => {
      const { roomId, username, image, userId } = data

      if (!roomId) {
        socket.emit("room_error", { message: "Room ID is required" })
        return
      }

      if (!roomManager.roomExists(roomId)) {
        socket.emit("room_error", { message: "Room not found" })
        return
      }

      const joinRoom = roomManager.getRoom(roomId)
      if (
        joinRoom &&
        !joinRoom.gameStarted &&
        joinRoom.players.length >= joinRoom.maxPlayers
      ) {
        socket.emit("room_error", { message: "Room is full" })
        return
      }

      // Store user data in socket
      socket.data.username = username
      socket.data.image = image
      if (userId) socket.data.userId = userId

      // Leave previous room if any
      if (socket.data.currentRoom) {
        socket.leave(socket.data.currentRoom)
        roomManager.removePlayerFromRoom(socket.data.currentRoom, socket.id)
        // Notify other players in previous room
        io.to(socket.data.currentRoom).emit("players_updated", {
          players: roomManager.getRoomPlayers(socket.data.currentRoom)
        })
      }

      // Join new room
      socket.join(roomId)
      // New joiners are not hosts
      roomManager.addPlayerToRoom(roomId, {
        socketId: socket.id,
        username,
        image,
        score: 0,
        guessedCorrectly: false,
        isHost: false,
        scoreAtDrawingStart: 0
      })
      socket.data.currentRoom = roomId

      // Get existing strokes for the room
      const strokes = roomManager.getRoomStrokes(roomId)

      // Get all players in the room
      const players = roomManager.getRoomPlayers(roomId)

      // Get room to check game state
      const room = roomManager.getRoom(roomId)

      // Prepare game state if game is active
      let gameState: any = null
      if (room && room.gameStarted && room.gamePhase === "picking") {
        const drawer = roomManager.getCurrentDrawer(roomId)
        const isDrawer = Boolean(drawer && drawer.socketId === socket.id)
        const pickSecondsLeft = Math.max(
          0,
          Math.ceil((room.pickPhaseEndsAt - Date.now()) / 1000)
        )
        gameState = {
          gameStarted: true,
          gamePhase: "picking",
          drawerSocketId: drawer?.socketId || "",
          drawerUsername: drawer?.username || "",
          round: room.round,
          maxRounds: room.maxRounds,
          isDrawer,
          pickSecondsLeft,
          wordOptions: isDrawer ? [...room.pendingWordChoices] : []
        }
      } else if (room && room.gameStarted && room.gamePhase === 'drawing') {
        const drawer = roomManager.getCurrentDrawer(roomId)
        const isDrawer = drawer && drawer.socketId === socket.id

        // Calculate time remaining
        const elapsed = Date.now() - room.roundStartTime
        const remaining = room.roundDurationMs - elapsed
        const secondsLeft = Math.max(0, Math.floor(remaining / 1000))

        // Create word hint for non-drawers
        let wordHint = ''
        if (!isDrawer && drawer) {
          const wordLength = room.currentWord.length
          wordHint = "_ ".repeat(wordLength).trim()
        }

        gameState = {
          gameStarted: true,
          gamePhase: "drawing",
          drawerSocketId: drawer?.socketId || '',
          drawerUsername: drawer?.username || '',
          wordHint: wordHint,
          wordLength: room.currentWord.length,
          secondsLeft: secondsLeft,
          round: room.round,
          maxRounds: room.maxRounds,
          isDrawer: isDrawer
        }

        // If drawer, send the word
        if (isDrawer) {
          socket.emit("your_word", { word: room.currentWord })
        } else if (wordHint) {
          socket.emit("word_hint", { hint: wordHint, wordLength: room.currentWord.length })
        }
      }

      // Send room joined confirmation with existing strokes, players, and game state
      socket.emit("room_joined", {
        roomId,
        strokes,
        players: players.map(p => ({
          socketId: p.socketId,
          username: p.username,
          image: p.image,
          score: p.score,
          isHost: p.isHost,
          guessedCorrectly: p.guessedCorrectly
        })),
        gameState,
        ...(room && !room.gameStarted
          ? { roomConfig: roomToConfigWire(room) }
          : {}),
      })

      // Notify all players in the room about the update
      io.to(roomId).emit("players_updated", { players })

      console.log(`User ${socket.id} joined room ${roomId}`)
    })

    // Start game event
    socket.on("start_game", (data: { roomId: string; maxRounds?: number }) => {
      const { roomId } = data

      if (!roomId) {
        socket.emit("room_error", { message: "Room ID is required" })
        return
      }

      const room = roomManager.getRoom(roomId)
      if (!room) {
        socket.emit("room_error", { message: "Room not found" })
        return
      }

      // Check if user is in the room
      const player = room.players.find(p => p.socketId === socket.id)
      if (!player) {
        socket.emit("room_error", { message: "You are not in this room" })
        return
      }

      // Check if user is the host
      if (!player.isHost) {
        socket.emit("room_error", { message: "Only the host can start the game" })
        return
      }

      // Check if game is already started
      if (room.gameStarted) {
        socket.emit("room_error", { message: "Game is already in progress" })
        return
      }

      // Check minimum players
      if (room.players.length < 2) {
        socket.emit("room_error", { message: "Need at least 2 players to start" })
        return
      }

      // Initialize game (rounds/draw time/word count come from room state, not client)
      if (!roomManager.initGame(roomId, room.maxRounds)) {
        socket.emit("room_error", { message: "Failed to start game" })
        return
      }

      const updatedRoom = roomManager.getRoom(roomId)
      if (!updatedRoom) {
        return
      }

      // Emit game started to all players
      const players = roomManager.getRoomPlayers(roomId)
      io.to(roomId).emit("game_started", {
        round: updatedRoom.round,
        maxRounds: updatedRoom.maxRounds,
        players: players.map(p => ({
          socketId: p.socketId,
          username: p.username,
          image: p.image,
          score: p.score,
          isHost: p.isHost,
          guessedCorrectly: p.guessedCorrectly
        }))
      })

      // Start first round
      startRound(roomId, io)

      console.log(`Game started in room ${roomId} by ${player.username}`)
    })

    socket.on(
      "update_room_config",
      (data: {
        roomId: string
        maxPlayers?: number
        rounds?: number
        wordCount?: number
        drawTime?: number
      }) => {
        const { roomId, maxPlayers, rounds, wordCount, drawTime } = data
        if (!roomId) {
          socket.emit("room_error", { message: "Room ID is required" })
          return
        }

        const cfgRoom = roomManager.getRoom(roomId)
        if (!cfgRoom) {
          socket.emit("room_error", { message: "Room not found" })
          return
        }

        const actor = cfgRoom.players.find(p => p.socketId === socket.id)
        if (!actor?.isHost) {
          socket.emit("room_error", { message: "Only the host can change room settings" })
          return
        }

        if (cfgRoom.gameStarted || cfgRoom.gamePhase !== "waiting") {
          socket.emit("room_error", { message: "Cannot change settings during a game" })
          return
        }

        if (typeof maxPlayers === "number") {
          const mp = clampConfigValue(maxPlayers, CONFIG_MIN_MAX.maxPlayers)
          if (mp < cfgRoom.players.length) {
            socket.emit("room_error", {
              message: `Max players cannot be below current player count (${cfgRoom.players.length})`,
            })
            return
          }
          cfgRoom.maxPlayers = mp
        }
        if (typeof rounds === "number") {
          cfgRoom.maxRounds = clampConfigValue(rounds, CONFIG_MIN_MAX.rounds)
        }
        if (typeof wordCount === "number") {
          cfgRoom.wordCount = clampConfigValue(wordCount, CONFIG_MIN_MAX.wordCount)
        }
        if (typeof drawTime === "number") {
          const sec = clampConfigValue(drawTime, CONFIG_MIN_MAX.drawTimeSec)
          cfgRoom.roundDurationMs = sec * 1000
        }

        io.to(roomId).emit("room_config_updated", roomToConfigWire(cfgRoom))
      }
    )

    // Draw event - modified to be room-based
    socket.on("draw", (data: { roomId: string; x: number; y: number; color: string; userId: string; isDrawing: boolean }) => {
      const { roomId, x, y, color, userId, isDrawing } = data

      if (!roomId) {
        return
      }

      // Validate room exists and user is in room
      if (!roomManager.roomExists(roomId)) {
        return
      }

      const room = roomManager.getRoom(roomId)
      if (!room || !room.players.some(player => player.socketId === socket.id)) {
        return
      }

      if (room.gameStarted && room.gamePhase !== "drawing") {
        return
      }
      if (room.gameStarted) {
        const drawer = room.players[room.currentDrawerIndex]
        if (!drawer || socket.id !== drawer.socketId) {
          return
        }
      }

      // Store stroke in room
      roomManager.addStrokeToRoom(roomId, {
        x,
        y,
        color,
        userId,
        isDrawing,
        timestamp: Date.now()
      })

      // Broadcast to all users in the room (except sender)
      socket.to(roomId).emit("draw", {
        x,
        y,
        color,
        userId,
        isDrawing
      })
    })

    // Draw end event - modified to be room-based
    socket.on("drawEnd", (data: { roomId: string; userId: string }) => {
      const { roomId, userId } = data

      if (!roomId) {
        return
      }

      // Validate room exists
      if (!roomManager.roomExists(roomId)) {
        return
      }

      const room = roomManager.getRoom(roomId)
      if (!room) {
        return
      }

      if (room.gameStarted && room.gamePhase !== "drawing") {
        return
      }
      if (room.gameStarted) {
        const drawer = room.players[room.currentDrawerIndex]
        if (!drawer || socket.id !== drawer.socketId) {
          return
        }
      }

      roomManager.addStrokeToRoom(roomId, {
        x: 0,
        y: 0,
        color: '',
        userId,
        isDrawing: false,
        timestamp: Date.now()
      })

      // Broadcast to all users in the room (except sender)
      socket.to(roomId).emit("drawEnd", { userId })
    })

    // Clear board event
    socket.on("clear_board", (data: { roomId: string }) => {
      const { roomId } = data

      if (!roomId) {
        return
      }

      // Validate room exists and user is in room
      if (!roomManager.roomExists(roomId)) {
        return
      }

      const room = roomManager.getRoom(roomId)
      if (!room || !room.players.some(player => player.socketId === socket.id)) {
        return
      }

      if (room.gameStarted && room.gamePhase !== "drawing") {
        return
      }
      if (room.gameStarted) {
        const drawer = room.players[room.currentDrawerIndex]
        if (!drawer || socket.id !== drawer.socketId) {
          return
        }
      }

      // Clear strokes in room
      roomManager.clearRoomStrokes(roomId)

      // Broadcast to all users in the room (including sender)
      io.to(roomId).emit("clear_board", { roomId })

      console.log(`User ${socket.id} cleared board in room ${roomId}`)
    })

    // Undo latest stroke event
    socket.on("undo_stroke", (data: { roomId: string }) => {
      const { roomId } = data

      if (!roomId) {
        return
      }

      if (!roomManager.roomExists(roomId)) {
        return
      }

      const room = roomManager.getRoom(roomId)
      if (!room || !room.players.some(player => player.socketId === socket.id)) {
        return
      }

      if (room.gameStarted && room.gamePhase !== "drawing") {
        return
      }
      if (room.gameStarted) {
        const drawer = room.players[room.currentDrawerIndex]
        if (!drawer || socket.id !== drawer.socketId) {
          return
        }
      }

      if (!roomManager.undoLastStrokeInRoom(roomId)) {
        return
      }

      io.to(roomId).emit("undo_stroke", { roomId })
      console.log(`User ${socket.id} undid last stroke in room ${roomId}`)
    })

    socket.on("choose_word", (data: { roomId: string; choiceIndex: number }) => {
      const { roomId, choiceIndex } = data
      if (!roomId || typeof choiceIndex !== "number" || !Number.isInteger(choiceIndex)) {
        return
      }

      if (!roomManager.roomExists(roomId)) {
        return
      }

      const room = roomManager.getRoom(roomId)
      if (!room || !room.players.some(player => player.socketId === socket.id)) {
        return
      }

      if (room.gamePhase !== "picking") {
        return
      }

      const drawer = roomManager.getCurrentDrawer(roomId)
      if (!drawer || drawer.socketId !== socket.id) {
        return
      }

      if (choiceIndex < 0 || choiceIndex > 2) {
        return
      }

      const word = room.pendingWordChoices[choiceIndex]
      if (!word) {
        return
      }

      clearPickingTimers(room)
      beginDrawingPhase(roomId, io, word)
    })

    // Chat message event
    socket.on("chat_message", (data: { roomId: string; message: string; user?: string; userId?: string }) => {
      const { roomId, message } = data

      if (!roomId || !message) {
        return
      }

      // Validate room exists and user is in room
      if (!roomManager.roomExists(roomId)) {
        return
      }

      const room = roomManager.getRoom(roomId)
      if (!room || !room.players.some(player => player.socketId === socket.id)) {
        return
      }

      const resolvedUser = (socket.data.username || "").toString().trim() || "Anonymous"
      const resolvedUserId = (socket.data.userId || "").toString().trim() || socket.id

      // Create chat message object with timestamp
      const chatData = {
        user: resolvedUser,
        userId: resolvedUserId,
        message: message.trim(),
        timestamp: Date.now()
      }

      // Handle guess detection if game is active
      if (room.gameStarted && room.gamePhase === 'drawing') {
        const drawer = room.players[room.currentDrawerIndex]

        // Ignore guesses from the drawer
        if (drawer && socket.id === drawer.socketId) {
          // Drawer can't guess, just broadcast as normal chat
          io.to(roomId).emit("chat_message", chatData)
          console.log(`Chat message from drawer ${resolvedUser} in room ${roomId}: ${message}`)
          return
        }

        // Find the player who sent the message
        const guessingPlayer = room.players.find(p => p.socketId === socket.id)
        if (!guessingPlayer) {
          return
        }

        // Players who already guessed cannot send chat for the rest of this round
        if (guessingPlayer.guessedCorrectly) {
          return
        }

        // Check if message matches the word
        if (chatData.message.toLowerCase() === room.currentWord.toLowerCase()) {
          // Mark player as having guessed correctly
          guessingPlayer.guessedCorrectly = true

          // Calculate points based on time remaining
          const elapsed = Date.now() - room.roundStartTime
          const remaining = room.roundDurationMs - elapsed
          const secondsLeft = Math.max(0, Math.floor(remaining / 1000))

          // Award points: more points for faster guesses
          // Base points: 100, plus time bonus (up to 50 points)
          const timeBonus = Math.floor(secondsLeft / 2) // Up to 40 points if 80 seconds left
          const points = 100 + timeBonus

          roomManager.awardPoints(roomId, socket.id, points)

          // Emit score update
          const players = roomManager.getRoomPlayers(roomId)
          io.to(roomId).emit("score_update", {
            players: players.map(p => ({
              socketId: p.socketId,
              username: p.username,
              image: p.image,
              score: p.score,
              isHost: p.isHost,
              guessedCorrectly: p.guessedCorrectly
            }))
          })

          // Emit system message about correct guess
          const systemMessage = {
            user: "System",
            userId: "system",
            message: `${resolvedUser} guessed the word!`,
            timestamp: Date.now()
          }
          io.to(roomId).emit("chat_message", systemMessage)
          // Do not put the secret word in the room-wide payload (toasts only need the name)
          io.to(roomId).emit("correct_guess", {
            user: resolvedUser,
            userId: resolvedUserId,
            message: "",
            timestamp: Date.now()
          })

          // Only the guesser and drawer see the actual guess text in chat
          socket.emit("chat_message", chatData)
          if (drawer && drawer.socketId !== socket.id) {
            io.to(drawer.socketId).emit("chat_message", chatData)
          }

          console.log(`${resolvedUser} guessed correctly in room ${roomId}, awarded ${points} points`)

          // Check if all non-drawers have guessed
          if (roomManager.allNonDrawersGuessed(roomId)) {
            // Award drawer bonus points (50 points)
            if (drawer) {
              roomManager.awardPoints(roomId, drawer.socketId, 50)

              // Emit updated scores
              const updatedPlayers = roomManager.getRoomPlayers(roomId)
              io.to(roomId).emit("score_update", {
                players: updatedPlayers.map(p => ({
                  socketId: p.socketId,
                  username: p.username,
                  image: p.image,
                  score: p.score,
                  isHost: p.isHost,
                  guessedCorrectly: p.guessedCorrectly
                }))
              })
            }

            clearRoomRoundTimers(room)

            endRound(roomId, io, 'all_guessed')
            return
          }

          // Correct guess handled — never broadcast the word to the whole room
          return
        }
      }

      // Broadcast to all users in the room (including sender)
      io.to(roomId).emit("chat_message", chatData)

      console.log(`Chat message from ${resolvedUser} in room ${roomId}: ${message}`)
    })

    // Leave room event
    socket.on("leave_room", (data: { roomId: string }) => {
      const { roomId } = data

      if (roomId && socket.data.currentRoom === roomId) {
        socket.leave(roomId)
        const room = roomManager.getRoom(roomId)

        if (room && room.gameStarted) {
          const drawer = room.players[room.currentDrawerIndex]
          const wasDrawer = drawer && drawer.socketId === socket.id

          // Remove player
          roomManager.removePlayerFromRoom(roomId, socket.id)
          socket.data.currentRoom = null

          const updatedRoom = roomManager.getRoom(roomId)
          if (!updatedRoom) {
            socket.emit("room_left", { roomId })
            return
          }

          // Handle game state if drawer left
          if (wasDrawer) {
            clearRoomRoundTimers(updatedRoom)

            // Check if enough players remain
            if (updatedRoom.players.length < 2) {
              endGame(roomId, io)
            } else {
              // Adjust drawer index if needed
              if (updatedRoom.currentDrawerIndex >= updatedRoom.players.length) {
                updatedRoom.currentDrawerIndex = 0
                updatedRoom.round++
              }

              // Start new round immediately
              startRound(roomId, io)
            }
          } else {
            // Non-drawer left - check if all remaining non-drawers have guessed
            if (roomManager.allNonDrawersGuessed(roomId)) {
              clearRoomRoundTimers(updatedRoom)
              endRound(roomId, io, 'all_guessed')
            }
          }
        } else {
          // Game not started, just remove player
          roomManager.removePlayerFromRoom(roomId, socket.id)
          socket.data.currentRoom = null
        }

        // Notify remaining players in the room
        if (roomManager.roomExists(roomId)) {
          io.to(roomId).emit("players_updated", {
            players: roomManager.getRoomPlayers(roomId)
          })
        }

        socket.emit("room_left", { roomId })
        console.log(`User ${socket.id} left room ${roomId}`)
      }
    })

    // Handle disconnect
    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id)

      // Remove from current room
      if (socket.data.currentRoom) {
        const roomId = socket.data.currentRoom
        const room = roomManager.getRoom(roomId)

        if (room && room.gameStarted) {
          const drawer = room.players[room.currentDrawerIndex]
          const wasDrawer = drawer && drawer.socketId === socket.id

          socket.leave(roomId)
          roomManager.removePlayerFromRoom(roomId, socket.id)

          const updatedRoom = roomManager.getRoom(roomId)
          if (!updatedRoom) {
            socket.data.currentRoom = null
            return
          }

          // Handle game state if drawer disconnected
          if (wasDrawer) {
            clearRoomRoundTimers(updatedRoom)

            // Check if enough players remain
            if (updatedRoom.players.length < 2) {
              endGame(roomId, io)
            } else {
              // Adjust drawer index if needed
              if (updatedRoom.currentDrawerIndex >= updatedRoom.players.length) {
                updatedRoom.currentDrawerIndex = 0
                updatedRoom.round++
              }

              // Start new round immediately
              startRound(roomId, io)
            }
          } else {
            // Non-drawer disconnected - check if all remaining non-drawers have guessed
            if (roomManager.allNonDrawersGuessed(roomId)) {
              clearRoomRoundTimers(updatedRoom)
              endRound(roomId, io, 'all_guessed')
            }
          }
        } else {
          // Game not started, just remove player
          socket.leave(roomId)
          roomManager.removePlayerFromRoom(roomId, socket.id)
        }

        // Notify remaining players in the room
        if (roomManager.roomExists(roomId)) {
          io.to(roomId).emit("players_updated", {
            players: roomManager.getRoomPlayers(roomId)
          })
        }

        socket.data.currentRoom = null
      }
    })
  })
}
