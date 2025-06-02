import express, { Express, Request, Response, NextFunction } from "express";
import passport from "passport";
import { localStrategy } from "./src/passport/passportLocal";
import { jwtStrategy } from "./src/passport/passportJwt";
import session from "express-session";
import { PrismaSessionStore } from "@quixo3/prisma-session-store";
import { PrismaClient } from "@prisma/client";
import cors from "cors";
import { createServer } from "http";
import dotenv from "dotenv";
import router from "./src/routes";
import { initSocket } from "./src/webSocket/socket";

dotenv.config();

const PORT = 3000;

const app: Express = express();
const httpServer = createServer(app);
const io = initSocket(httpServer);



/**
 * Middlewares
 */

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
    session(
        {
            store: new PrismaSessionStore(
                new PrismaClient(), //Compiler error on this line
                {
                    checkPeriod: 2 * 60 * 1000,  //ms
                    dbRecordIdIsSessionId: true,
                    dbRecordIdFunction: undefined,
                }
            ),
            secret: process.env.SESSION_SECRET as string,
            resave: false,
            saveUninitialized: false,
            cookie: { maxAge: 1000 * 60 * 60 * 24 }
        }
    )
)

passport.use(localStrategy)
passport.use(jwtStrategy)
app.use(passport.initialize())
app.use(passport.session())

/**
 * Routes
 */
app.use("/auth", router.auth);
app.use("/conversation", router.conversation);
app.use("/message", router.message);


/**
 * WebSocket Setup
 */

io.on("connection", (socket) => {
    console.log("A user connected");

    socket.on("joinConversation", (conversationId: string) => {
        socket.join(conversationId);
    });

    socket.on("disconnect", () => {
        console.log("A user disconnected");
    });
    // Handle other socket events here
});

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error(err.stack);
    res.status(500).send("Something Broke!")
})

httpServer.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});