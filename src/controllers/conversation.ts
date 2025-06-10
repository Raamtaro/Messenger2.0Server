// src/controllers/conversationController.ts

import { PrismaClient } from "@prisma/client";
import { Request, Response } from "express";
import { getIO } from "../webSocket/socket";


const prisma = new PrismaClient();

// Types for incoming bodies (adjust as needed)
type CreateConversationBody = {
    title?: string;
    participantEmails: string[];
};

type UpdateConversationBody = {
    title?: string;
    addParticipantEmails?: string[];
    removeParticipantEmails?: string[];
};

type CreateWithMessageBody = {
  title?: string;
  participantEmails: string[];
  initialMessage: string;
};

//----------------------------------------------------------------
// GET Handlers
//----------------------------------------------------------------

/**
 * GET /conversation/all
 * List every conversation where the authenticated user is a participant
 */
export const listUserConversations = async (req: Request, res: Response) => {
  const userId = (req.user as { id: string }).id;

  // 1) Fetch each conversation + its most recent message
  const convos = await prisma.conversation.findMany({
    where: { participants: { some: { id: userId } } },
    select: {
      id: true,
      title: true,
      createdAt: true,
      // aggregate “most recent” message content & createdAt
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { content: true, createdAt: true },
      },
      // optional: participants/authors if you need them
    },
  });

  // 2) Map into the shape the client expects:
  //    { id, title, lastMessage, updatedAt }
  const result = convos.map((c) => {
    const last = c.messages[0];
    return {
      id: c.id,
      title: c.title,
      lastMessage: last ? last.content : "",
      updatedAt: last ? last.createdAt.toISOString() : c.createdAt.toISOString(),
    };
  });

  // 3) Sort by updatedAt descending so most recently‐spoken convos come first
  result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  res.json(result);
};

/**
 * GET /conversation/:id
 * Return a conversation only if the authenticated user is a participant
 */
export const getConversationById = async (
    req: Request<{ id: string }>,
    res: Response
): Promise<void> => {
    const userId = (req.user as { id: string }).id;
    const convoId = req.params.id;

    // Fetch conversation with participants & author & messages
    const convo = await prisma.conversation.findUnique({
        where: { id: convoId },
        include: {
            participants: { select: { id: true, email: true, name: true } },
            author: { select: { id: true, email: true, name: true } },
            messages: {
                orderBy: { createdAt: "asc" },
                include: { sender: { select: { id: true, email: true, name: true } } },
            },
        },
    });

    if (!convo) {
        res.status(404).json({ error: "Conversation not found" });
        return;
    }

    // Check that this user is a participant
    const isParticipant = convo.participants.some((p) => p.id === userId);
    if (!isParticipant) {
        res.status(403).json({ error: "Not authorized to view this conversation" });
        return;
    }

    res.json(convo);
};

//----------------------------------------------------------------
// POST Handler(s)
//----------------------------------------------------------------

/**
 * POST /conversation
 * Body:
 *   - title?: string
 *   - participantEmails: string[]
 *
 * Creates a new Conversation, sets the authenticated user as `author`,
 * and connects all users found by email (plus the author).
 */
export const createConversation = async (
    req: Request<{}, {}, CreateConversationBody>,
    res: Response
): Promise<void> => {
    const authorId = (req.user as { id: string }).id;
    const { title, participantEmails } = req.body;

    // We’ll run an interactive transaction so that lookup + create are atomic.
    const newConvo = await prisma.$transaction(async (prismaTx) => {
        // 1) Find all users matching the provided emails.
        //    (We assume email is unique on User)
        const users = await prismaTx.user.findMany({
            where: { email: { in: participantEmails } },
            select: { id: true },
        });

        // If you want to validate “all emails exist,” you could check:
        // if (users.length !== participantEmails.length) throw new Error("Some emails not found");
        // (Omitted for brevity.)

        // Extract their IDs, and make sure the author is included exactly once
        const participantIdsSet = new Set(users.map((u) => u.id));
        participantIdsSet.add(authorId);
        const finalParticipantIds = Array.from(participantIdsSet);

        // 2) Create the conversation, connecting participants & setting author
        const convo = await prismaTx.conversation.create({
            data: {
                title: title || null,
                author: { connect: { id: authorId } },
                participants: {
                    connect: finalParticipantIds.map((id) => ({ id })),
                },
            },
            include: {
                participants: { select: { id: true, email: true, name: true } },
                author: { select: { id: true, email: true, name: true } },
            },
        });

        return convo;
    });

    res.status(201).json(newConvo);
};


/**
 * POST /with-message
 * Body: CreateWithMessageBody (type defined at top of the module)
 *
 * Does everything as `createConversation` but also requires an initial message to start the conversation.
 * This is so that the socket can immediately emit the `newMessage` event and send the notification to all users in the room.
 */

export const createConversationWithMessage = async (req: Request<{}, {}, CreateWithMessageBody>, res: Response): Promise<void> => {
    const authorId = (req.user as { id: string }).id;
    const {title, participantEmails, initialMessage} = req.body;

    const result = await prisma.$transaction(async (tx) => {

        const conversation = await tx.conversation.create(
            {
                data: {
                    title: title || null,
                    author: { connect: {id: authorId} },
                    participants: {
                        connect: [
                            authorId,
                            ...(await tx.user.findMany(
                                    {
                                        where: {email: {in: participantEmails}},
                                        select: {id: true}
                                    }
                                )
                            ).map((user) => user.id),
                        ].map((id) => ({ id}))
                    }
                },
                include: {
                    participants: { select: { id: true, email: true, name: true } },
                    author: { select: { id: true, email: true, name: true } },
                }
            }
        )

        const message = await tx.message.create(
            {
                data: {
                    content: initialMessage,
                    sender: {connect: {id: authorId}},
                    conversation: {connect: {id: conversation.id}}
                },
                include: {
                    sender: {select: {id: true, name: true, email: true}}
                }
            }
        )

        return {conversation: conversation, message: message}

    })

    const io = getIO();
    io.to(result.conversation.id).emit("newMessage", {
        conversationId: result.conversation.id,
        content: result.message.content,
        createdAt: result.message.createdAt. toISOString(),
        sender: result.message.sender,
    });

    //Optional newConversation event - not sure if needed and might delete later.
    result.conversation.participants.forEach((p) => {
        io.to(p.id).emit("newConversation", {
            id: result.conversation.id,
            title: result.conversation.title,
            lastMessage: result.message.content,
            updatedAt: result.message.createdAt.toISOString(),
        })
    })

    res.status(201).json(result);
}


//----------------------------------------------------------------
// PUT Handler
//----------------------------------------------------------------

/**
 * PUT /conversation/:id
 * Body:
 *   - title?: string
 *   - addParticipantEmails?: string[]
 *   - removeParticipantEmails?: string[]
 *
 * Only the author may update metadata (title or participant list).
 */
export const updateConversation = async (
    req: Request<{ id: string }, {}, UpdateConversationBody>,
    res: Response
): Promise<void> => {
    const userId = (req.user as { id: string }).id;
    const convoId = req.params.id;
    const { title, addParticipantEmails = [], removeParticipantEmails = [] } = req.body;

    // Transaction: verify author → lookup any emails → apply updates
    const updatedConvo = await prisma.$transaction(async (prismaTx) => {
        // 1) Fetch conversation to check author
        const existing = await prismaTx.conversation.findUnique({
            where: { id: convoId },
            select: { authorId: true },
        });

        
        // if (!existing) throw new Error("Conversation not found");
        // if (existing.authorId !== userId) throw new Error("Not authorized");

        if (!existing) {
            res.status(404).json({ error: "Conversation not found" });
            return;
        }
        if (existing.authorId !== userId) { 
            res.status(403).json({ error: "Not authorized to update this conversation" });
            return;
        }

        // 2) If there are addParticipantEmails, find those users
        let addIds: string[] = [];
        if (addParticipantEmails.length) {
            const newUsers = await prismaTx.user.findMany({
                where: { email: { in: addParticipantEmails } },
                select: { id: true },
            });
            addIds = newUsers.map((u) => u.id);
        }

        // 3) If there are removeParticipantEmails, find those users
        let removeIds: string[] = [];
        if (removeParticipantEmails.length) {
            const oldUsers = await prismaTx.user.findMany({
                where: { email: { in: removeParticipantEmails } },
                select: { id: true },
            });
            removeIds = oldUsers.map((u) => u.id);
        }

        // 4) Build up the data object for update
        const data: any = {};
        if (typeof title === "string") {
            data.title = title;
        }
        if (addIds.length) {
            data.participants = {
                connect: addIds.map((id) => ({ id })),
            };
        }
        if (removeIds.length) {
            data.participants = {
                disconnect: removeIds.map((id) => ({ id })),
            };
        }

        // 5) Perform the update
        const convo = await prismaTx.conversation.update({
            where: { id: convoId },
            data,
            include: {
                participants: { select: { id: true, email: true, name: true } },
                author: { select: { id: true, email: true, name: true } },
            },
        });

        return convo;
    });

    res.json(updatedConvo);
};

//----------------------------------------------------------------
// DELETE Handler
//----------------------------------------------------------------

/**
 * DELETE /conversation/:id
 * Only the author may delete.
 */
export const deleteConversation = async (
    req: Request<{ id: string }>,
    res: Response
): Promise<void> => {
    const userId = (req.user as { id: string }).id;
    const convoId = req.params.id;

    // Simple check + delete (no need for a full transaction if there's no dependent logic)
    const existing = await prisma.conversation.findUnique({
        where: { id: convoId },
        select: { authorId: true },
    });
    if (!existing) {
        res.status(404).json({ error: "Conversation not found" });
        return;
    }
    if (existing.authorId !== userId) {
        res.status(403).json({ error: "Not authorized to delete" });
        return;
    }

    await prisma.conversation.delete({ where: { id: convoId } });
    res.status(204).send();
};
