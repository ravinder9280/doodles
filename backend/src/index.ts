import express from "express"
import http from "http"
import { Server } from "socket.io"
import socketHandler from "./sockets/socket.handler.js"
const app = express()
const server = http.createServer(app)

const io = new Server(server, {
    cors: { origin: "*" }
})

socketHandler(io)

server.listen(3001, () => {
    console.log("Server running")
})