'use client'

import { SendIcon } from 'lucide-react'
import React, { useEffect, useRef, useState } from 'react'

export interface ChatMessage {
    user: string
    userId?: string
    message: string
    timestamp: number
}

interface ChatProps {
    socket: any
    roomId: string | null
    username: string
    userId?: string
    messages: ChatMessage[]
    onMessageSend: (message: string) => void
}

const Chat: React.FC<ChatProps> = ({ socket, roomId, username, userId, messages, onMessageSend }) => {
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
        <div className="flex flex-col  overflow-hidden bg-white">
            {/* Messages List */}
            <div className=" overflow-y-auto  divide-y divide-gray-200 flex-1 bg-gray-50" >
                {!messages || messages.length === 0 ? (
                    <>
                    </>
                ) : (
                    messages.map((msg, index) => (

                        <div
                            className={`px-3 py-2 ${msg.userId && userId && msg.userId === userId ? 'bg-blue-100' : 'bg-gray-200'}`}
                        >

                            <p className="text-sm break-words">  <span className="font-bold">
                                {msg.user}
                            </span>
                                : {msg.message}</p>
                        </div>
                    ))
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="border-t border-r border-gray-200 bg-gray-100 p-2 flex gap-2">
                <div className="relative w-full">

                    <input
                        type="text"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyPress={handleKeyPress}
                        placeholder="Type Here..."
                        className="flex-1 px-3 py-2 pl-4 border border-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-full text-sm"
                        disabled={!roomId || !socket}
                    />
                    <button
                        onClick={handleSend}
                        disabled={!inputValue.trim() || !roomId || !socket}
                        className="px-4 py-2  text-blue-400 rounded-lg absolute right-0 h-full  disabled:text-gray-300 disabled:cursor-not-allowed text-sm font-medium transition-colors"
                    >
                        <SendIcon className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    )
}

export default Chat
