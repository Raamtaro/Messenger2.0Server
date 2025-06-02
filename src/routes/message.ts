import { Router } from "express";
import passport from "passport";
import { retrieveMessageById, retrieveMessages, sendMessage, updateMessage, deleteMessage } from "../controllers/message";


const router = Router();

router.get("/", passport.authenticate("jwt", { session: false }), retrieveMessages);
router.get("/:id", passport.authenticate("jwt", { session: false }), retrieveMessageById)
router.post("/:conversationId", passport.authenticate("jwt", { session: false }), sendMessage);
router.put("/:conversationId/message/:messageId", passport.authenticate("jwt", { session: false }), updateMessage);
router.delete("/:conversationId/message/:messageId", passport.authenticate("jwt", { session: false }), deleteMessage)

export default router;