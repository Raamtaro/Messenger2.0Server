import { Router } from "express";
import passport from "passport";
import { listUserConversations, getConversationById, createConversation, updateConversation, deleteConversation } from "../controllers/conversation";

const router = Router()

router.get("/all", passport.authenticate("jwt", {session: false}), listUserConversations);
router.get("/:id", passport.authenticate("jwt", {session: false}), getConversationById);
router.post("/", passport.authenticate("jwt", {session: false}), createConversation);
router.put("/:id", passport.authenticate("jwt", {session: false}), updateConversation);
router.delete("/:id", passport.authenticate("jwt", {session: false}), deleteConversation);

export default router;