import { Server, Socket } from "socket.io"
import { roomManager } from "../rooms/roomManager.js"

export default function socketHandler(io: Server) {
  io.on("connection", (socket: Socket) => {
    console.log("User connected:", socket.id)

    // Store current room ID in socket data
    socket.data.currentRoom = null

    // Create room event
    socket.on("create_room", (data: { username: string; image: string }) => {
      try {
        const { username, image } = data

        // Store user data in socket
        socket.data.username = username
        socket.data.image = image

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
        roomManager.addPlayerToRoom(roomId, { socketId: socket.id, username, image })
        socket.data.currentRoom = roomId

        // Get all players in the room
        const players = roomManager.getRoomPlayers(roomId)

        // Send room created confirmation with players list
        socket.emit("room_created", { roomId, players })

        // Notify all players in the room about the update
        io.to(roomId).emit("players_updated", { players })

        console.log(`User ${socket.id} created and joined room ${roomId}`)
      } catch (error) {
        console.error("Error creating room:", error)
        socket.emit("room_error", { message: "Failed to create room" })
      }
    })

    // Join room event
    socket.on("join_room", (data: { roomId: string; username: string; image: string }) => {
      const { roomId, username, image } = data

      if (!roomId) {
        socket.emit("room_error", { message: "Room ID is required" })
        return
      }

      if (!roomManager.roomExists(roomId)) {
        socket.emit("room_error", { message: "Room not found" })
        return
      }

      // Store user data in socket
      socket.data.username = username
      socket.data.image = image

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
      roomManager.addPlayerToRoom(roomId, { socketId: socket.id, username, image })
      socket.data.currentRoom = roomId

      // Get existing strokes for the room
      const strokes = roomManager.getRoomStrokes(roomId)

      // Get all players in the room
      const players = roomManager.getRoomPlayers(roomId)

      // Send room joined confirmation with existing strokes and players
      socket.emit("room_joined", { roomId, strokes, players })

      // Notify all players in the room about the update
      io.to(roomId).emit("players_updated", { players })

      console.log(`User ${socket.id} joined room ${roomId}`)
    })

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

      // Broadcast to all users in the room (except sender)
      socket.to(roomId).emit("drawEnd", { userId })
    })

    // Chat message event
    socket.on("chat_message", (data: { roomId: string; user: string; message: string }) => {
      const { roomId, user, message } = data

      if (!roomId || !user || !message) {
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

      // Create chat message object with timestamp
      const chatData = {
        user,
        message: message.trim(),
        timestamp: Date.now()
      }

      // Broadcast to all users in the room (including sender)
      io.to(roomId).emit("chat_message", chatData)

      console.log(`Chat message from ${user} in room ${roomId}: ${message}`)
    })

    // Leave room event
    socket.on("leave_room", (data: { roomId: string }) => {
      const { roomId } = data

      if (roomId && socket.data.currentRoom === roomId) {
        socket.leave(roomId)
        roomManager.removePlayerFromRoom(roomId, socket.id)
        socket.data.currentRoom = null

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
        socket.leave(roomId)
        roomManager.removePlayerFromRoom(roomId, socket.id)

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
