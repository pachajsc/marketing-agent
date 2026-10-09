import type { ReactNode } from "react";
import { AppShell } from "@/components/app/AppShell";
import { requireUser } from "@/lib/server/session";

/** Layout de las rutas privadas: verifica la sesión en el servidor (no solo en proxy.ts). */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  return <AppShell user={{ name: user.name, email: user.email }}>{children}</AppShell>;
}
