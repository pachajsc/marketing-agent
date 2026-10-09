// Autenticación (email + contraseña) con Better Auth. Usuarios y sesiones se
// guardan en el mismo SQLite local (lib/server/db.ts). La sesión vive en una
// cookie httpOnly que maneja Better Auth; `nextCookies` permite que las
// Server Actions la escriban.
//
// Telemetría desactivada explícitamente (por defecto también está apagada).
import "server-only";

import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { getDb } from "@/lib/server/db";

export const authOptions = {
  database: getDb(),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },
  session: {
    // 30 días, renovada al usarse a diario: "sesión persistente".
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
  telemetry: { enabled: false },
  plugins: [nextCookies()],
};

export const auth = betterAuth(authOptions);
