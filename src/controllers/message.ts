import { PrismaClient } from "@prisma/client";
import { Request, Response } from "express";
import { getIO } from "../webSocket/socket";

type MessageData = {
    content: string;
}

const prisma = new PrismaClient();

//----------------------------------------------------------------
// GET Handlers
//----------------------------------------------------------------

/**
 * GET /message/all
 * Retrieve all messages authored by the authenticated user
 */

export const retrieveMessages = async (req: Request, res: Response): Promise<void> => {
    const userId = (req.user as { id: string }).id;
    const messages = await prisma.message.findMany(
        {
            where: {
                senderId: userId
            },
            select: {
                conversationId: true,
                content: true,
                createdAt: true,
            },
            orderBy: {
                createdAt: "desc"
            }
        }
    )
    res.json(messages);
}

/**
 * GET /message/:id
 * Retrieve a message by its ID only if the authenticated user is the sender
 */
export const retrieveMessageById = async (req: Request<{ id: string }>, res: Response): Promise<void> => {
    const userId = (req.user as { id: string }).id;
    const messageId = req.params.id;

    const message = await prisma.message.findUnique(
        {
            where: {
                id: messageId,
            },
            select: {
                senderId: true,
                conversationId: true,
                content: true,
                createdAt: true,
            }
        }
    )

    if (!message ||
        message.senderId !== userId
    ) {
        res.status(404).json({ error: "Message not found or not authorized." });
        return;
    }
    res.json(message);
}

//----------------------------------------------------------------
// POST Handler(s)
//----------------------------------------------------------------

/**
 * POST /message/:conversationId
 * Create a new message in a conversation
 */

export const sendMessage = async (req: Request<{ conversationId: string }, {}, MessageData>, res: Response): Promise<void> => {
    const senderId = (req.user as { id: string }).id;
    const { conversationId } = req.params;
    const { content } = req.body;

    // ── 1. Verify the sender is actually a participant ────────────────────────
    const convo = await prisma.conversation.findFirst({
        where: {
            id: conversationId,
            participants: { some: { id: senderId } },
        },
        select: { id: true },
    });

    if (!convo) {
        res.status(403).json({ error: "You are not a participant in this conversation." });
        return;
    }

    // ── 2. Create the message now that we know they’re allowed ─────────────────
    const message = await prisma.message.create({
        data: {
            content,
            sender: { connect: { id: senderId } },
            conversation: { connect: { id: conversationId } },
        },
        include: {
            sender: { select: { id: true, name: true, email: true } },
        },
    });

    // ── 3. Emit to everyone in that conversation room ─────────────────────────
    getIO().to(conversationId).emit("newMessage", message);

    res.status(201).json(message);

}


//----------------------------------------------------------------
// PUT Handler(s)
//----------------------------------------------------------------

/**
 * PUT /message/:conversationId/message/:messageId
 * Update a message in a conversation only if the authenticated user is the sender
 */

export const updateMessage = async (req: Request<{ conversationId: string, messageId: string }, {}, MessageData>, res: Response): Promise<void> => {
    const userId = (req.user as { id: string }).id;
    const { conversationId, messageId } = req.params;
    const { content } = req.body;

    // 1) Fetch the existing message by ID, check ownership & conversation
    const existing = await prisma.message.findUnique({
        where: { id: messageId },
        select: { senderId: true, conversationId: true },
    });

    if (
        !existing ||
        existing.senderId !== userId ||
        existing.conversationId !== conversationId
    ) {
        res.status(404).json({ error: "Message not found or not authorized" });
        return;
    }

    // 2) Perform the update
    const updated = await prisma.message.update({
        where: { id: messageId },
        data: { content },
        include: {
            sender: { select: { id: true, name: true, email: true } },
        },
    });

    // 3) Broadcast the updated message to everyone in the room
    getIO().to(conversationId).emit("updateMessage", updated);

    res.json(updated);
}



//----------------------------------------------------------------
// DELETE Handler(s)
//----------------------------------------------------------------

/**
 * DELETE /message/:conversationId/message/:messageId
 * Delete a message in a conversation only if the authenticated user is the sender
 */

export const deleteMessage = async (req: Request<{ conversationId: string, messageId: string }>, res: Response): Promise<void> => {
    const userId = (req.user as { id: string }).id;
    const { conversationId, messageId } = req.params;

    // 1) Fetch to verify ownership & conversation match
    const existing = await prisma.message.findUnique({
        where: { id: messageId },
        select: { senderId: true, conversationId: true },
    });

    if (
        !existing ||
        existing.senderId !== userId ||
        existing.conversationId !== conversationId
    ) {
        res.status(404).json({ error: "Message not found or not authorized" });
        return;
    }

    // 2) Delete the message
    await prisma.message.delete({ where: { id: messageId } });

    // 3) Broadcast a “delete” event (clients can remove it from their UI)
    getIO().to(conversationId).emit("deleteMessage", { id: messageId });

    res.status(204).send();
}