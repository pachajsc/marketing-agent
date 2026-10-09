// Endpoints de Better Auth (registro, login, logout, sesión) bajo /api/auth/*.
import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/server/auth";

export const { GET, POST } = toNextJsHandler(auth);
