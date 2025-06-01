import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken'
import bcrypt from "bcryptjs";
import passport from "passport";
import { Request, Response, NextFunction } from 'express';
import { IVerifyOptions } from 'passport-local';

dotenv.config();
const prisma = new PrismaClient();

const signup = async (req: Request, res: Response): Promise<void> => {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
        res.status(400).json({ error: 'Please include email, password and name' });
        return;
    }

    const existingUser = await prisma.user.findUnique(
        {
            where: { email: email }
        }
    )

    if (existingUser) {
        res.status(400).json(
            {
                error: `An account with ${email} already exists`
            }
        )
        return;
    }

    const hashedPassword = await bcrypt.hash(password, 11)
    const newUser = await prisma.user.create(
        {
            data: {
                name: name,
                email: email,
                password: hashedPassword
            }
        }
    )

    res.status(201).json({ newUser })
}

const login = (
    req: Request,
    res: Response,
    next: NextFunction
): void => {
    passport.authenticate(
        'local',
        { session: false },
        (err: Error, user: any /* or `User` */, info: IVerifyOptions) => {
            if (err) {
                return next(err)
            }
            if (!user) {
                return res.status(400).json({ error: info.message })
            }

            // build your JWT
            const payload = { userId: user.id }
            const secret = process.env.JWT_SECRET as string
            const token = jwt.sign(payload, secret, { expiresIn: '1h' })

            res.json({ user, token })
        }
    )(req, res, next)
}


export default {
    signup,
    login
}