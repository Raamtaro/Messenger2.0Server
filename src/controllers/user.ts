import { PrismaClient } from "@prisma/client";
import { Request, Response } from "express";

const prisma = new PrismaClient();

/**
 * Retrieves all users from the database.
 * GET /user 
 */

export const retrieveAllUsers = async (req: Request, res: Response): Promise<void> => {
    const users = await prisma.user.findMany(
        {
            select: {
                id: true,
                email: true,
                name: true
            }
        }
    )

    res.status(200).json(users);
}