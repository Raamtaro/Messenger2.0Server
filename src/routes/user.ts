import { Router } from "express";
import passport from "passport";
import {retrieveAllUsers} from "../controllers/user";

const router = Router();

router.get("/", passport.authenticate("jwt", {session: false}), retrieveAllUsers);

export default router;