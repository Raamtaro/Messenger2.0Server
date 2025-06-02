/**
 * Intended to be imported into other modules for WebSocket communication with client.
 */

// src/socket.ts
import { Server as IOServer } from "socket.io";
let io: IOServer | null = null;

export function initSocket(server: any) {
  io = new IOServer(server, {
    cors: { origin: process.env.CLIENT_ORIGIN },
  });
  return io;
}

export function getIO(): IOServer {
  if (!io) {
    throw new Error("Socket.IO has not been initialized!");
  }
  return io;
}
