'use client'

import React, { useEffect, useState, useRef } from 'react'
import { io } from 'socket.io-client'
import { Stage, Layer, Line } from 'react-konva'
import Chat, { ChatMessage } from '../components/Chat'
import { RefreshCcw } from 'lucide-react'

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
}

type RoomMode = 'create' | 'join' | 'drawing'

const Page = () => {
  const [socket, setSocket] = useState<any>(null)
  const [connected, setConnected] = useState(false)
  const [socketId, setSocketId] = useState<string>('')
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
  const [showUsernameInput, setShowUsernameInput] = useState<boolean>(true)
  const [avatar, setAvatar] = useState<string>('') // current avatar URL


  function generateRandomString(length: number) {
    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    return Array.from({ length }, () =>
      characters.charAt(Math.floor(Math.random() * characters.length))
    ).join('');
  }

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([])

  // Canvas size state for mobile layout
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 })
  const canvasContainerRef = useRef<HTMLDivElement>(null)

  const colors = [
    '#000000', '#FF0000', '#00FF00', '#0000FF',
    '#FFFF00', '#FF00FF', '#00FFFF', '#FFA500',
    '#800080', '#FFC0CB', '#A52A2A', '#808080'
  ]

  // Generate avatar URL using DiceBear API
  const generateAvatarUrl = (seed: string): string => {
    return `https://api.dicebear.com/9.x/pixel-art/svg?seed=${encodeURIComponent(seed)}`
  }

  // Canvas size update effect
  useEffect(() => {
    const updateCanvasSize = () => {
      if (canvasContainerRef.current) {
        const container = canvasContainerRef.current
        const width = Math.min(container.clientWidth, 900)
        const height = Math.floor(width * 0.75)
        setCanvasSize({ width, height })
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

    const newSocket = io('https://doodles-nbmm.onrender.com')

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
    newSocket.on('room_joined', (data: { roomId: string; strokes: any[]; players: PlayerData[] }) => {
      console.log('Room joined:', data.roomId)
      setRoomId(data.roomId)
      setRoomMode('drawing')
      setRoomError('')
      setPlayers(data.players || [])
      setShowUsernameInput(false)

      // Reconstruct strokes from room data
      if (data.strokes && data.strokes.length > 0) {
        reconstructStrokes(data.strokes)
      } else {
        setStrokes([])
      }
    })

    // Players updated event
    newSocket.on('players_updated', (data: { players: PlayerData[] }) => {
      console.log('Players updated:', data.players)
      setPlayers(data.players || [])
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
        image: avatarUrl
      })
      setRoomMode('create')
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
        image: avatarUrl
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
      setMessages([]) // Clear chat messages
      setShowUsernameInput(true)
    }
  }

  const handleSendMessage = (message: string) => {
    if (socket && roomId && username && message.trim()) {
      socket.emit('chat_message', {
        roomId,
        user: username,
        message: message.trim()
      })
    }
  }

  const copyRoomId = () => {
    if (roomId) {
      navigator.clipboard.writeText(roomId)
      alert(`Room ID ${roomId} copied to clipboard!`)
    }
  }

  const handleMouseDown = (e: any) => {
    if (!connected || !socket || !roomId) return

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
      <div className="flex flex-col items-center justify-center min-h-screen p-4 ">
        <div className="mb-4 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`}></div>
            <span className="text-sm font-medium text-white">
              {connected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
          <h1 className="text-2xl font-bold mb-6 text-center text-gray-800">Drawing Room</h1>

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
                <RefreshCcw  size={14}/>
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
        <div className='bg-white border-b border-gray-200 p-2 z-10 flex items-center justify-between flex-shrink-0'>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`}></div>
            <span className="text-xs font-medium text-gray-700">
              {connected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          {roomId && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-600">Room: {roomId}</span>
              <button
                onClick={copyRoomId}
                className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
              >
                Copy
              </button>
              <button
                onClick={handleLeaveRoom}
                className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600"
              >
                Leave
              </button>
            </div>
          )}
        </div>
        <div
          ref={canvasContainerRef}
          className='flex-1 relative bg-gray-100 flex items-center justify-center'
          style={{ minHeight: '300px' }}
        >
          {canvasSize.width > 0 && canvasSize.height > 0 && (
            <Stage
              width={canvasSize.width}
              height={canvasSize.height}
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
              className='border-2 border-gray-300 rounded cursor-crosshair'
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

        {/* Color Picker - Below Canvas */}
        {/* <div className='bg-white border-t border-gray-200 p-3 flex-shrink-0'>
          <h3 className="text-xs font-semibold mb-2 text-gray-700">Color:</h3>
          <div className="flex gap-2 flex-wrap justify-center">
            {colors.map((color) => (
              <button
                key={color}
                onClick={() => setSelectedColor(color)}
                className={`w-8 h-8 rounded border-2 transition-all ${selectedColor === color
                  ? 'border-gray-800 scale-110'
                  : 'border-gray-300 hover:border-gray-500'
                  }`}
                style={{ backgroundColor: color }}
                title={color}
              />
            ))}
          </div>
        </div> */}
      </div>
      <div className='flex-1 grid grid-cols-2 border-t border-gray-200 h-[50%]'>

        {/* Chat Panel - Between Color Picker and Players List */}
        <Chat
          socket={socket}
          roomId={roomId}
          username={username}
          messages={messages}
          onMessageSend={handleSendMessage}
        />

        {/* Players List - Bottom */}
        <div className='bg-white  flex-shrink-0 overflow-y-auto' >
          <div className=''>
            <div className="space-y-2 divide-y divide-gray-200">
              {players.map((player) => (
                <div
                  key={player.socketId}
                  className={`flex items-center gap-2 py-1
                  }`}
                >
                  <img
                    src={player.image}
                    alt={player.username}
                    className="w-10 h-10 rounded flex-shrink-0"
                  />
                  <span className="text-sm font-medium text-gray-700 truncate">
                    {player.username}
                    {player.socketId === socketId && (
                      <span className="text-blue-500 ml-1">(You)</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Page
