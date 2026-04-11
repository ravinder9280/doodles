'use client'

import React, { useEffect, useState, useRef, useMemo } from 'react'
import { io } from 'socket.io-client'
import { Stage, Layer, Line } from 'react-konva'
import Chat, { ChatMessage } from '../components/Chat'
import { Brush, Copy, Link, LogOut, MoreVertical, Paintbrush, RefreshCcw, Trash, Undo2 } from 'lucide-react'
import { toast } from "sonner"
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
interface Point {
  x: number
  y: number
}

interface Stroke {
  points: number[]
  color: string
  userId: string
  isComplete?: boolean
}

interface PlayerData {
  socketId: string
  username: string
  image: string
  score?: number
  isHost?: boolean
  guessedCorrectly?: boolean
}

type RoomMode = 'create' | 'join' | 'drawing'

const Page = () => {
  const [socket, setSocket] = useState<any>(null)
  const [connected, setConnected] = useState(false)
  const [socketId, setSocketId] = useState<string>('')
  const [userId, setUserId] = useState<string>('') // stable anonymous id (localStorage)
  const [isDrawing, setIsDrawing] = useState(false)
  const [currentStroke, setCurrentStroke] = useState<Point[]>([])
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [selectedColor, setSelectedColor] = useState('#000000')
  const [roomId, setRoomId] = useState<string | null>(null)
  const [roomMode, setRoomMode] = useState<RoomMode>('create')
  const [inputRoomId, setInputRoomId] = useState<string>('')
  const [roomError, setRoomError] = useState<string>('')
  const [username, setUsername] = useState<string>('')
  const [players, setPlayers] = useState<PlayerData[]>([])
  const [isHost, setIsHost] = useState<boolean>(false)
  const [showUsernameInput, setShowUsernameInput] = useState<boolean>(true)
  const [avatar, setAvatar] = useState<string>('') // current avatar URL
  const prevPlayersRef = useRef<PlayerData[]>([])

  function generateRandomString(length: number) {
    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    return Array.from({ length }, () =>
      characters.charAt(Math.floor(Math.random() * characters.length))
    ).join('');
  }

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([])

  // Game state
  const [gameStarted, setGameStarted] = useState(false)
  const [isDrawer, setIsDrawer] = useState(false)
  const [currentDrawerSocketId, setCurrentDrawerSocketId] = useState<string>('')
  const [wordHint, setWordHint] = useState<string>('')   // e.g. "_ _ _ _ _"
  const [secretWord, setSecretWord] = useState<string>('')   // only if isDrawer
  const [timeLeft, setTimeLeft] = useState<number>(80)
  const [round, setRound] = useState<number>(1)
  const [maxRounds, setMaxRounds] = useState<number>(3)
  /** True only while server gamePhase is drawing (so guessers can chat between rounds). */
  const [isDrawingPhase, setIsDrawingPhase] = useState(false)

  // Canvas size state for mobile layout
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 })
  const canvasContainerRef = useRef<HTMLDivElement>(null)

  const colors = [
    '#000000', '#FF0000', '#00FF00', '#0000FF',
    '#FFFF00'
  ]
  const currentDrawerName = players.find(
    (player) => player.socketId === currentDrawerSocketId
  )?.username || 'Unknown player'

  const chatLockedAfterGuess = useMemo(
    () =>
      isDrawingPhase &&
      gameStarted &&
      !isDrawer &&
      Boolean(players.find(p => p.socketId === socketId)?.guessedCorrectly),
    [isDrawingPhase, gameStarted, isDrawer, players, socketId]
  )

  // Generate avatar URL using DiceBear API
  const generateAvatarUrl = (seed: string): string => {
    return `https://api.dicebear.com/9.x/pixel-art/svg?seed=${encodeURIComponent(seed)}`
  }

  // Canvas size update effect
  useEffect(() => {
    const updateCanvasSize = () => {
      const screenWidth = window.innerWidth

      if (screenWidth < 768) {
        // Mobile
        setCanvasSize({
          width: screenWidth - 20,
          height: (screenWidth - 20) * 0.75
        })
      } else {
        // Desktop
        setCanvasSize({
          width: 900,
          height: 600
        })
      }
    }

    // Only update if we're in drawing mode
    if (roomMode === 'drawing') {
      updateCanvasSize()
      window.addEventListener('resize', updateCanvasSize)
      return () => window.removeEventListener('resize', updateCanvasSize)
    }
  }, [roomMode])

  // Initial setup: username + avatar + socket
  useEffect(() => {
    // Stable userId setup (anonymous). Persist across refresh/reconnect.
    if (typeof window !== 'undefined') {
      const storedUserId = localStorage.getItem('userId')
      if (storedUserId) {
        setUserId(storedUserId)
      } else {
        const newId =
          typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `u_${generateRandomString(16)}`
        localStorage.setItem('userId', newId)
        setUserId(newId)
      }
    }

    // Restore username from localStorage if available
    const storedUsername = typeof window !== 'undefined' ? localStorage.getItem('username') : null
    if (storedUsername) {
      setUsername(storedUsername)
    }

    // Avatar setup: use stored avatar URL or generate a new one
    if (typeof window !== 'undefined') {
      const storedAvatar = localStorage.getItem('avatar')
      if (storedAvatar) {
        setAvatar(storedAvatar)
      } else {
        const seed = generateRandomString(8)
        const url = generateAvatarUrl(seed)
        localStorage.setItem('avatar', url)
        setAvatar(url)
      }
    }


    const newSocket = io(process.env.NEXT_PUBLIC_BACKEND_URL as string, {
      transports: ["websocket"],
    })
    newSocket.on('connect', () => {
      console.log('✅ Connected to server!')
      setConnected(true)
      setSocketId(newSocket.id || '')
    })

    // Room created event
    newSocket.on('room_created', (data: { roomId: string; players: PlayerData[] }) => {
      console.log('Room created:', data.roomId)
      setRoomId(data.roomId)
      setRoomMode('drawing')
      setStrokes([]) // Clear canvas for new room
      setRoomError('')
      setPlayers(data.players || [])
      setShowUsernameInput(false)
    })

    // Room joined event
    newSocket.on('room_joined', (data: { roomId: string; strokes: any[]; players: PlayerData[]; gameState?: any }) => {
      console.log('Room joined:', data.roomId)
      setRoomId(data.roomId)
      setRoomMode('drawing')
      setRoomError('')
      setPlayers(data.players || [])
      setShowUsernameInput(false)

      // Handle game state if game is active
      if (data.gameState) {
        setGameStarted(true)
        setRound(data.gameState.round || 1)
        setMaxRounds(data.gameState.maxRounds || 3)
        setCurrentDrawerSocketId(data.gameState.drawerSocketId || '')
        setIsDrawer(data.gameState.isDrawer || false)
        setWordHint(data.gameState.wordHint || '')
        setTimeLeft(data.gameState.secondsLeft || 80)
        setIsDrawingPhase(true)
      } else {
        setGameStarted(false)
        setIsDrawer(false)
        setWordHint('')
        setSecretWord('')
        setTimeLeft(80)
        setIsDrawingPhase(false)
      }

      // Reconstruct strokes from room data
      if (data.strokes && data.strokes.length > 0) {
        reconstructStrokes(data.strokes)
      } else {
        setStrokes([])
      }
    })

    newSocket.on('players_updated', (data: { players: PlayerData[] }) => {
      const newPlayers = data.players || []
      const prevPlayers = prevPlayersRef.current

      console.log('Players updated:', newPlayers)

      // Detect joined players
      const joinedPlayers = newPlayers.filter(
        p => !prevPlayers.some(prev => prev.socketId === p.socketId)
      )

      // Detect left players
      const leftPlayers = prevPlayers.filter(
        p => !newPlayers.some(n => n.socketId === p.socketId)
      )

      // Show join toasts
      joinedPlayers.forEach(player => {
        if (player.socketId !== socketId) {
          toast.success(`${player.username} joined the room`)
        }
      })

      // Show leave toasts
      leftPlayers.forEach(player => {
        if (player.socketId !== socketId) {
          toast(`${player.username} left the room`)
        }
      })

      // Update state
      prevPlayersRef.current = newPlayers
      setPlayers(newPlayers)
    })

    // Room error event
    newSocket.on('room_error', (data: { message: string }) => {
      console.error('Room error:', data.message)
      setRoomError(data.message)
    })

    // Room left event
    newSocket.on('room_left', () => {
      setRoomId(null)
      setRoomMode('create')
      setStrokes([])
      setPlayers([])
      setMessages([]) // Clear chat messages
      setShowUsernameInput(true)
      setIsDrawingPhase(false)
    })

    // Chat message event
    newSocket.on('chat_message', (data: ChatMessage) => {
      console.log('Chat message received:', data)
      setMessages(prev => {
        console.log('Previous messages:', prev)
        const updated = [...prev, data]
        console.log('Updated messages:', updated)
        return updated
      })
    })


    newSocket.on("correct_guess", (chatData: ChatMessage) => {
      toast.success(`${chatData.user} guessed the word!`)
    })

    // Game started event
    newSocket.on('game_started', (data: { round: number; maxRounds: number; players: PlayerData[] }) => {
      console.log('Game started:', data)
      setGameStarted(true)
      setRound(data.round)
      setMaxRounds(data.maxRounds)
      setPlayers(data.players || [])
      setIsDrawer(false)
      setWordHint('')
      setSecretWord('')
      setTimeLeft(80)
      setIsDrawingPhase(false)
    })

    // Drawer selected event
    newSocket.on('drawer_selected', (data: { drawerSocketId: string; drawerUsername: string; round: number; timeLimit: number }) => {
      console.log('Drawer selected:', data)
      setCurrentDrawerSocketId(data.drawerSocketId)
      setIsDrawer(data.drawerSocketId === newSocket.id)
      setRound(data.round)
      setTimeLeft(data.timeLimit)
      setWordHint('')
      setSecretWord('')
      setPlayers(prev => prev.map(p => ({ ...p, guessedCorrectly: false })))
      setIsDrawingPhase(true)
    })

    // Your word event (drawer only)
    newSocket.on('your_word', (data: { word: string }) => {
      console.log('Your word:', data.word)
      setSecretWord(data.word)
      setWordHint('')
    })

    // Word hint event (non-drawers)
    newSocket.on('word_hint', (data: { hint: string; wordLength: number }) => {
      console.log('Word hint:', data)
      setWordHint(data.hint)
      setSecretWord('')
    })

    // Timer update event
    newSocket.on('timer_update', (data: { secondsLeft: number }) => {
      setTimeLeft(data.secondsLeft)
    })

    // Round end event
    newSocket.on('round_end', (data: { word: string; scores: any[]; round: number; reason: string }) => {
      console.log('Round ended:', data)
      toast.info(`Round ${data.round} ended! The word was: ${data.word}`)
      setIsDrawer(false)
      setSecretWord('')
      setWordHint('')

      // Update player scores
      if (data.scores) {
        setPlayers(prev => prev.map(p => {
          const scoreData = data.scores.find((s: any) => s.socketId === p.socketId)
          return scoreData ? { ...p, score: scoreData.score } : p
        }))
      }
      setIsDrawingPhase(false)
    })

    // Game over event
    newSocket.on('game_over', (data: { scores: any[]; winner: any; winners: any[] }) => {
      console.log('Game over:', data)
      if (data.winner) {
        toast.success(`Game Over! ${data.winner.username} wins with ${data.winner.score} points!`)
      } else if (data.winners && data.winners.length > 0) {
        const winnerNames = data.winners.map((w: any) => w.username).join(', ')
        toast.success(`Game Over! Tie between: ${winnerNames}`)
      } else {
        toast.info('Game Over!')
      }

      setGameStarted(false)
      setIsDrawer(false)
      setSecretWord('')
      setWordHint('')
      setTimeLeft(80)
      setIsDrawingPhase(false)

      // Update final scores
      if (data.scores) {
        setPlayers(prev => prev.map(p => {
          const scoreData = data.scores.find((s: any) => s.socketId === p.socketId)
          return scoreData ? { ...p, score: scoreData.score } : p
        }))
      }
    })

    // Clear canvas event
    newSocket.on('clear_canvas', () => {
      console.log('Canvas cleared')
      setStrokes([])
      setCurrentStroke([])
      setIsDrawing(false)
    })

    // Score update event
    newSocket.on('score_update', (data: { players: PlayerData[] }) => {
      console.log('Score updated:', data)
      setPlayers(data.players || [])
    })


    // Draw event - modified to handle room-based drawing
    newSocket.on('draw', (data: { x: number; y: number; color: string; userId: string; isDrawing: boolean }) => {
      // Only process events from other users
      if (data.userId !== newSocket.id) {
        if (data.isDrawing) {
          // Add point to existing stroke or create new one
          setStrokes(prev => {
            const lastStroke = prev[prev.length - 1]
            // Check if last stroke belongs to same user and is NOT complete
            if (lastStroke && lastStroke.userId === data.userId && !lastStroke.isComplete) {
              // Append to existing stroke - preserve color from original stroke
              const updatedStrokes = [...prev]
              updatedStrokes[updatedStrokes.length - 1] = {
                ...lastStroke,
                points: [...lastStroke.points, data.x, data.y],
                color: lastStroke.color // Preserve original color
              }
              return updatedStrokes
            } else {
              // Create new stroke with the color from the event
              return [...prev, {
                points: [data.x, data.y],
                color: data.color || '#000000', // Use provided color or default
                userId: data.userId,
                isComplete: false
              }]
            }
          })
        }
      }
    })

    newSocket.on('drawEnd', (data: { userId: string }) => {
      // Mark stroke as complete for other users
      if (data.userId !== newSocket.id) {
        setStrokes(prev => {
          const updated = [...prev]
          // Find the last incomplete stroke from this user and mark it complete
          for (let i = updated.length - 1; i >= 0; i--) {
            if (updated[i].userId === data.userId && !updated[i].isComplete) {
              updated[i] = {
                ...updated[i],
                isComplete: true
              }
              break
            }
          }
          return updated
        })
      }
    })

    // Clear board event
    newSocket.on('clear_board', (data: { roomId: string }) => {
      console.log('Board cleared')
      setStrokes([])
      setCurrentStroke([])
      setIsDrawing(false)
    })

    // Undo latest stroke event
    newSocket.on('undo_stroke', (data: { roomId: string }) => {
      console.log('Undo stroke:', data.roomId)
      setStrokes(prev => prev.slice(0, -1))
      setCurrentStroke([])
      setIsDrawing(false)
    })

    newSocket.on('disconnect', () => {
      console.log('❌ Disconnected from server')
      setConnected(false)
    })

    newSocket.on('connect_error', (error) => {
      console.error('❌ Connection error:', error)
    })

    setSocket(newSocket)

    return () => {
      newSocket.close()
    }
  }, [])

  // Reconstruct strokes from room stroke data
  const reconstructStrokes = (roomStrokes: any[]) => {
    const reconstructed: Stroke[] = []
    let currentStroke: Stroke | null = null

    const addCurrentStroke = (stroke: Stroke) => {
      reconstructed.push({
        points: [...stroke.points],
        color: stroke.color,
        userId: stroke.userId,
        isComplete: true
      })
    }

    roomStrokes.forEach((strokeData: any) => {
      if (strokeData.isDrawing) {
        if (currentStroke !== null && currentStroke.userId === strokeData.userId) {
          // Append to existing stroke
          currentStroke.points.push(strokeData.x, strokeData.y)
        } else {
          // Start new stroke
          if (currentStroke !== null) {
            addCurrentStroke(currentStroke)
          }
          currentStroke = {
            points: [strokeData.x, strokeData.y],
            color: strokeData.color || '#000000',
            userId: strokeData.userId,
            isComplete: false
          }
        }
      } else {
        // Stroke ended
        if (currentStroke !== null) {
          addCurrentStroke(currentStroke)
          currentStroke = null
        }
      }
    })

    // Add final stroke if exists
    if (currentStroke !== null) {
      addCurrentStroke(currentStroke)
    }

    setStrokes(reconstructed)
  }

  const handleCreateRoom = () => {
    localStorage.setItem('username', username.trim())

    if (socket && connected && username.trim()) {
      // Use the persisted avatar URL, or fall back to a generated one
      const avatarUrl = avatar || generateAvatarUrl(username.trim() || generateRandomString(8))
      socket.emit('create_room', {
        username: username.trim(),
        image: avatarUrl,
        userId
      })
      setRoomMode('create')
      setIsHost(true)
    } else if (!username.trim()) {
      setRoomError('Please enter your name')
    }
  }

  const handleJoinRoom = () => {
    localStorage.setItem('username', username.trim())

    if (socket && connected && inputRoomId.trim() && username.trim()) {
      const avatarUrl = avatar || generateAvatarUrl(username.trim() || generateRandomString(8))
      socket.emit('join_room', {
        roomId: inputRoomId.trim().toUpperCase(),
        username: username.trim(),
        image: avatarUrl,
        userId
      })
      setRoomMode('join')
    } else if (!username.trim()) {
      setRoomError('Please enter your name')
    } else if (!inputRoomId.trim()) {
      setRoomError('Please enter a room ID')
    }
  }

  const handleLeaveRoom = () => {
    if (socket && roomId) {
      socket.emit('leave_room', { roomId })
      setRoomId(null)
      setRoomMode('create')
      setStrokes([])
      setPlayers([])
      prevPlayersRef.current = []
      setMessages([]) // Clear chat messages
      setShowUsernameInput(true)
      setIsDrawingPhase(false)
    }
  }

  const handleSendMessage = (message: string) => {
    if (!socket || !roomId || !username || !message.trim()) return
    if (chatLockedAfterGuess) return
    socket.emit('chat_message', {
      roomId,
      message: message.trim(),
      userId
    })
  }

  const copyRoomId = () => {
    if (roomId) {
      navigator.clipboard.writeText(roomId)
      toast.success('Room ID copied to clipboard',{
        position:'bottom-right'
      })
    }
  }

  const handleClearBoard = () => {
    if (socket && roomId && connected) {
      socket.emit('clear_board', { roomId })
      // Clear local state immediately for better UX
      setStrokes([])
      setCurrentStroke([])
      setIsDrawing(false)
    }
  }

  const handleUndoBoard = () => {
    if (socket && roomId && connected) {
      socket.emit('undo_stroke', { roomId })
    }
  }

  const handleMouseDown = (e: any) => {
    if (!connected || !socket || !roomId) return
    if (gameStarted && !isDrawer) return // Only drawer can draw when game is active

    const stage = e.target.getStage()
    const point = stage.getPointerPosition()

    setIsDrawing(true)
    const newStroke: Point[] = [{ x: point.x, y: point.y }]
    setCurrentStroke(newStroke)

    // Create new stroke
    const stroke: Stroke = {
      points: [point.x, point.y],
      color: selectedColor,
      userId: socketId,
      isComplete: false
    }
    setStrokes(prev => [...prev, stroke])

    // Emit draw start with roomId
    socket.emit('draw', {
      roomId,
      x: point.x,
      y: point.y,
      color: selectedColor,
      userId: socketId,
      isDrawing: true
    })
  }

  const handleMouseMove = (e: any) => {
    if (!isDrawing || !connected || !socket || !roomId) return
    if (gameStarted && !isDrawer) return // Only drawer can draw when game is active

    const stage = e.target.getStage()
    const point = stage.getPointerPosition()

    setCurrentStroke(prev => [...prev, point])

    // Update last stroke - create new array to trigger re-render
    setStrokes(prev => {
      const updated = [...prev]
      const lastStroke = updated[updated.length - 1]
      if (lastStroke && lastStroke.userId === socketId) {
        // Create new points array instead of mutating
        updated[updated.length - 1] = {
          ...lastStroke,
          points: [...lastStroke.points, point.x, point.y]
        }
      }
      return updated
    })

    // Emit draw move with roomId
    socket.emit('draw', {
      roomId,
      x: point.x,
      y: point.y,
      color: selectedColor,
      userId: socketId,
      isDrawing: true
    })
  }

  const handleMouseUp = () => {
    if (!isDrawing || !connected || !socket || !roomId) return
    if (gameStarted && !isDrawer) return // Only drawer can draw when game is active

    setIsDrawing(false)
    setCurrentStroke([])

    // Emit draw end with roomId
    socket.emit('drawEnd', {
      roomId,
      userId: socketId
    })
  }

  // Room selection UI
  if (roomMode !== 'drawing') {
    return (
      <div className="flex flex-col items-center  min-h-screen p-4 ">

        <div className="my-10 max-w-md text-center">
          <h1 className="text-6xl font-bold bg-gradient-to-r from-yellow-600 via-green-400 to-red-400 bg-clip-text text-transparent">
            DOODLES
          </h1>
          <p className="mt-3 text-gray-400 md:text-lg">
            Draw, guess, and compete with friends in this fast-paced real-time doodle game.
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
          <div className="mb-4 flex items-center justify-center gap-4">
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`}></div>
              <span className="text-sm font-medium ">
                {connected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
          </div>

          {roomError && (
            <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
              {roomError}
            </div>
          )}

          {/* Username Input */}
          {showUsernameInput && (
            <div className="mb-4 flex items-center gap-2">
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter Your name"
                className="max-w-[65%] md:max-w-fit flex-1 px-4 py-2 border border-gray-300 rounded focus:outline-none font-bold focus:ring-2 focus:ring-blue-500"
                maxLength={20}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && username.trim()) {
                    // Auto-focus next action
                  }
                }}
              />
              <div className=" flex items-center gap-2 bg-gray-100 p-2 rounded-lg">
                <img
                  src={avatar || generateAvatarUrl(username.trim() || 'guest')}
                  alt="Avatar preview"
                  className="w-8 h-8 rounded"
                />
              </div>
              <button
                onClick={() => {
                  const seed = generateRandomString(8)
                  const url = generateAvatarUrl(seed)
                  localStorage.setItem('avatar', url)
                  setAvatar(url)
                }}
                className=" flex items-center gap-2 bg-gray-100 p-2 rounded-lg"
              >
                <RefreshCcw size={14} />
              </button>
            </div>
          )}

          <div className="space-y-4">
            {/* Create Room */}




            {/* Join Room */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Join Existing Room
              </label>
              <div className="">
                <input
                  type="text"
                  value={inputRoomId}
                  onChange={(e) => setInputRoomId(e.target.value.toUpperCase())}
                  placeholder="Enter Room ID"
                  className=" w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  maxLength={8}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      handleJoinRoom()
                    }
                  }}
                />
                <div className="mt-2">

                  <button
                    onClick={handleJoinRoom}
                    disabled={!connected || !inputRoomId.trim() || !username.trim()}
                    className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 w-full disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
                  >
                    Join
                  </button>
                </div>
              </div>
            </div>
            {/* Divider */}
            <div className="flex items-center gap-4">
              <div className="flex-1 h-px bg-gray-300"></div>
              <span className="text-gray-500 text-sm">OR</span>
              <div className="flex-1 h-px bg-gray-300"></div>
            </div>
            <div>
              <button
                onClick={handleCreateRoom}
                disabled={!connected || !username.trim()}
                className="w-full px-4 py-3 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
              >
                Create New Room
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Drawing UI - Mobile Layout
  return (
    <div className='h-screen bg-gray-100 flex flex-col max-w-4xl border mx-auto overflow-hidden'>
      {/* Top Bar - Mobile */}

      {/* Canvas Section - Top */}
      <div className=' flex flex-col bg-white overflow-hidden flex-1'>
        <div className='bg-white border-b border-black p-1 z-10 flex items-center justify-between flex-shrink-0'>
          {/* <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`}></div> */}


          {gameStarted ? (
            <>
              <div className='flex items-center flex-col'>

                <div className='bg-gray-200 rounded-full h-5 w-5 flex items-center justify-center'>

                  <p className="text-[11px] font-medium text-gray-700 mb-1">
                    {timeLeft}s
                  </p>
                </div>
                <p className="text-[11px] font-medium text-gray-700 ">
                  Round {round} of {maxRounds}
                </p>
              </div>
              {gameStarted ? (
                <div className='flex items-center flex-col'>
                  <p className="text-[11px] font-medium text-gray-700 ">{isDrawer ? 'Draw This:' : 'Guess the word:'}</p>
                  <p className="text-[11px] relative font-bold text-black">{isDrawer ? secretWord : wordHint || '_ _ _ _ _'}
                    <span className='absolute top-[-6px] right-[-10px] text-[11px] font-medium text-gray-700'>
                      {isDrawer ? secretWord.length : (wordHint || '').replace(/\s/g, '').length}
                    </span>
                  </p>
                </div>
              ) : null}

            </>

          ) : <>
            <h2 className='text-lg font-bold text-gray-800'>DOODLES</h2>
            <p className='text-sm'>Waiting</p>
          </>
          }

          {roomId && (
            <div className="flex items-center gap-2">


              <Popover>
                <PopoverTrigger
                  className=''
                >
                  <button className='p-1  rounded-full  hover:bg-gray-300'>

                    <MoreVertical size={20} />
                  </button>

                </PopoverTrigger>
                <PopoverContent className='bg-white w-40' align='end'>
                  <div className='flex items-center justify-between'>
                    <span className="text-xs text-gray-600">Room Id: {roomId}</span>
                    <button
                      onClick={copyRoomId}
                      className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                    >
                      <Copy size={14} />
                    </button>


                  </div>
                  <Button
                    onClick={copyRoomId}
                    className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
                  >
                    Invite
                    <Link size={14} />
                  </Button>
                  <Button
                    onClick={handleLeaveRoom}
                    className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600"
                  >
                    Leave
                    <LogOut size={14} />
                  </Button>
                </PopoverContent>
              </Popover>
            </div>
          )}
        </div>
        {/* Word hint / secret word display */}

        <div
          ref={canvasContainerRef}
          className="flex items-center justify-center w-full h-full bg-gray-100 overflow-hidden"
        >
          <div>

            {canvasSize.width > 0 && canvasSize.height > 0 && (
              <Stage
                width={900}
                height={600}
                pixelRatio={1}
                onMouseDown={handleMouseDown}
                onTouchStart={(e) => {
                  e.evt.preventDefault()
                  const stage = e.target.getStage()
                  if (stage) {
                    const point = stage.getPointerPosition()
                    if (point) {
                      const syntheticEvent = {
                        ...e,
                        target: stage
                      }
                      handleMouseDown(syntheticEvent as any)
                    }
                  }
                }}
                onMouseMove={handleMouseMove}
                onTouchMove={(e) => {
                  e.evt.preventDefault()
                  const stage = e.target.getStage()
                  if (stage && isDrawing) {
                    const point = stage.getPointerPosition()
                    if (point) {
                      const syntheticEvent = {
                        ...e,
                        target: stage
                      }
                      handleMouseMove(syntheticEvent as any)
                    }
                  }
                }}
                onMouseUp={handleMouseUp}
                onTouchEnd={handleMouseUp}
                onMouseLeave={handleMouseUp}
                className={`border-2 border-gray-300 rounded ${gameStarted && !isDrawer ? 'cursor-not-allowed' : 'cursor-crosshair'}`}
              >
                <Layer>
                  {strokes.map((stroke, index) => (
                    <Line
                      key={index}
                      points={stroke.points}
                      stroke={stroke.color}
                      strokeWidth={3}
                      tension={0.5}
                      lineCap="round"
                      lineJoin="round"
                      globalCompositeOperation="source-over"
                    />
                  ))}
                </Layer>
              </Stage>
            )}
          </div>
        </div>
        {!gameStarted && (
          <div className=' flex items-center gap-0 justify-between border-t border-black  flex-shrink-0'>
            <Button
              disabled={!isHost}
              onClick={() => {
                if (players.length < 2) {
                  toast.error('Need at least 2 players to start the game')
                  return
                }
                if (socket && roomId) {
                  socket.emit('start_game', { roomId, maxRounds: 3 })
                }
              }}
              className="px-3 py-1 text-xs bg-green-500 text-white rounded-none border-none hover:bg-green-600 font-medium flex-1"
            >
              Start Game
            </Button>
            <Button
              onClick={copyRoomId}

              className="px-3 py-1 text-xs bg-blue-500 text-white rounded-none border-none hover:bg-blue-600 font-medium md:w-[300px] "
            >
              <Link size={14} />
              Invite

            </Button>
          </div>
        )}

        {/* Color Picker - Below Canvas */}
        {
          gameStarted && isDrawer && (

            <div className='bg-white border-t border-black p-1 flex-shrink-0'>
              <div className="flex gap-2 justify-between max-w-xl mx-auto items-center">
                <div className='flex  items-center'>

                  {colors.map((color) => (
                    <button
                      key={color}
                      onClick={() => setSelectedColor(color)}
                      className={`w-8 h-8   transition-all ${selectedColor === color
                        ? 'border-gray-800 border scale-110'
                        : ' hover:border-gray-500'
                        }`}
                      style={{ backgroundColor: color }}
                      title={color}
                    />
                  ))}
                </div>
                <div className='flex items-center '>

                  <button
                    onClick={handleClearBoard}
                    disabled={!connected || !roomId}
                    className="ml-2 p-1  text-white rounded bg-gray-400  disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-1.5 transition-all"
                    title="Clear Board"
                  >
                    <Trash size={24} />
                  </button>
                  <button
                    onClick={handleUndoBoard}
                    disabled={!connected || !roomId}
                    className="ml-2 p-1  text-white rounded bg-gray-400  disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-1.5 transition-all"
                    title="Undo Stroke"
                  >
                    <Undo2 size={24} />
                  </button>
                </div>
              </div>
            </div>
          )}
      </div>
      <div className='flex-1 grid grid-cols-2 border-t border-black h-[50%]'>

        {/* Chat Panel - Between Color Picker and Players List */}
        <Chat
          socket={socket}
          roomId={roomId}
          username={username}
          userId={userId}
          messages={messages}
          onMessageSend={handleSendMessage}
          inputLocked={chatLockedAfterGuess}
          inputLockedPlaceholder="You guessed it — no chat until the next round"
        />

        {/* Players List - Bottom */}
        <div className='p-1  flex-shrink-0 overflow-y-auto' >
          <div className=' bg-white'>
            {players.map((player, idx) => {
              const isCurrentDrawer = gameStarted && player.socketId === currentDrawerSocketId
              return (
                <div
                  key={player.socketId}
                  className={`flex items-center justify-between gap-2 p-1 overflow-hidden ${
                    gameStarted && player.guessedCorrectly
                      ? 'bg-green-500'
                      : idx % 2 !== 0
                        ? 'bg-gray-200'
                        : ''
                  }`}
                >
                  <div className='flex items-center min-w-[40px] '>

                    <img
                      src={player.image}
                      alt={player.username}
                      className="w-6 h-6 rounded flex-shrink-0"
                    />
                    {isCurrentDrawer && <span className='ml-1'><Brush size={16} className='text-yellow-600' /></span>}
                  </div>
                  <div className="flex items-center gap-2 flex-1 ">
                    <div className="flex items-center justify-center ">
                      <span className={`text-[11px] font-medium  ${player.socketId === socketId ? 'text-blue-500' : 'text-gray-700'} line-clamp-1`}>
                        {player.username}{player.socketId === socketId && <span className=''> (You)</span>}

                        {/* {player.isHost && (
                          <span className="text-purple-500 ml-1 text-xs">👑 Host</span>
                        )} */}
                      </span>
                    </div>
                  </div>
                  {gameStarted && (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-[11px] font-bold text-gray-800">
                        {player.score || 0} pts
                      </span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

export default Page
