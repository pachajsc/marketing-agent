// Cliente de Better Auth para Client Components (formularios de login/registro
// y logout). Solo habla con /api/auth/* del mismo origen: no maneja secretos.
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();
