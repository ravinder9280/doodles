'use client'

import React, { useEffect, useRef, useState } from 'react'

export interface ChatMessage {
    user: string
    message: string
    timestamp: number
}

interface ChatProps {
    socket: any
    roomId: string | null
    username: string
    messages: ChatMessage[]
    onMessageSend: (message: string) => void
}

const Chat: React.FC<ChatProps> = ({ socket, roomId, username, messages, onMessageSend }) => {
    const [inputValue, setInputValue] = useState('')
    const messagesEndRef = useRef<HTMLDivElement>(null)

    // Debug: Log messages when they change
    useEffect(() => {
        console.log('Chat component - messages updated:', messages)
    }, [messages])

    // Auto-scroll to bottom when new messages arrive
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    const handleSend = () => {
        if (inputValue.trim() && roomId) {
            onMessageSend(inputValue.trim())
            setInputValue('')
        }
    }

    const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSend()
        }
    }

    const formatTime = (timestamp: number): string => {
        const date = new Date(timestamp)
        const hours = date.getHours().toString().padStart(2, '0')
        const minutes = date.getMinutes().toString().padStart(2, '0')
        return `${hours}:${minutes}`
    }

    return (
        <div className="flex flex-col h-full bg-white">
            {/* Messages List */}
            <div className=" overflow-y-auto p-3 space-y-2" style={{ maxHeight: '180px', minHeight: '120px' }}>
                {!messages || messages.length === 0 ? (
                    <div className="text-center text-gray-400 text-sm py-4">
                        No messages yet. Start chatting!
                    </div>
                ) : (
                    messages.map((msg, index) => (
                        <div
                            key={index}
                            className={`flex flex-col `}
                        >
                            <div
                                className={`max-w-[80%] rounded-lg px-3 py-2 bg-gray-300`}
                            >
                                <div className="flex items-center gap-2 mb-1">
                                    <span className={`text-xs font-semibold `}>
                                        {msg.user}
                                    </span>
                                    <span className={`text-xs ${msg.user === username ? 'text-blue-200' : 'text-gray-400'}`}>
                                        {formatTime(msg.timestamp)}
                                    </span>
                                </div>
                                <p className="text-sm break-words">{msg.message}</p>
                            </div>
                        </div>
                    ))
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="border-t border-gray-200 p-2 flex gap-2">
                <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Type a message..."
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    disabled={!roomId || !socket}
                />
                <button
                    onClick={handleSend}
                    disabled={!inputValue.trim() || !roomId || !socket}
                    className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm font-medium transition-colors"
                >
                    Send
                </button>
            </div>
        </div>
    )
}

export default Chat
