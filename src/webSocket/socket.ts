/**
 * Intended to be imported into other modules for WebSocket communication with client.
 */

// src/socket.ts
import { Server as IOServer } from "socket.io";
import jwt from "jsonwebtoken";
let io: IOServer | null = null;

export function initSocket(server: any) {
  io = new IOServer(server, {
    cors: { origin: process.env.CLIENT_ORIGIN },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error("No token"));
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET!);
      // assume payload.userId
      socket.data.userId = (payload as any).userId;
      return next();
    } catch (e) {
      return next(new Error("Invalid token"));
    }
  });

  /**
   * WebSocket Setup
   */

  io.on("connection", (socket) => {
    console.log("A user connected");

    const userId = socket.data.userId as string;
    // join their personal room
    socket.join(userId);

    socket.on("joinConversation", (conversationId: string) => {
      socket.join(conversationId);
    });

    socket.on("leaveConversation", (conversationId: string) => {
      socket.leave(conversationId);
    });

    socket.on("disconnect", () => {
      console.log("A user disconnected");
    });
    // Handle other socket events here
  });

  return io;
}

export function getIO(): IOServer {
  if (!io) {
    throw new Error("Socket.IO has not been initialized!");
  }
  return io;
}