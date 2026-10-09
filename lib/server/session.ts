// Data Access Layer de sesión (patrón recomendado por la guía de auth de
// Next.js): toda página o Server Action privada verifica la sesión acá, en el
// servidor, contra la base. proxy.ts solo hace un chequeo optimista.
import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/server/auth";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
}

/** Usuario de la sesión actual, o null. Memoizado por render. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  return { id: session.user.id, name: session.user.name, email: session.user.email };
});

/** Para páginas y Server Actions privadas: redirige a /login si no hay sesión. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
