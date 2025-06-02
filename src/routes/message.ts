import { Router } from "express";
import passport from "passport";

const router = Router();

router.get("/", passport.authenticate("jwt", { session: false }))
router.get("/:id", passport.authenticate("jwt", { session: false }))
router.post("/:conversationId", passport.authenticate("jwt", { session: false }))
router.put("/:conversationId/message/:messageId", passport.authenticate("jwt", { session: false }))
router.delete("/:conversationId/message/:messageId", passport.authenticate("jwt", { session: false }))

export default router;