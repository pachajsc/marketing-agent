// Crea/actualiza el esquema de la base local: tablas de Better Auth (user,
// session, account, verification) y tablas propias (lib/server/db.ts).
// Idempotente: se puede correr las veces que haga falta.
//
//   npm run db:migrate
//
// Corre con la condición "react-server" porque importa módulos marcados con
// "server-only" (lib/server/*).
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd(), false, { info() {}, error() {} });

async function main() {
  const { getMigrations } = await import("better-auth/db/migration");
  const { authOptions } = await import("../lib/server/auth");

  const { toBeCreated, toBeAdded, runMigrations } = await getMigrations(authOptions);
  if (toBeCreated.length === 0 && toBeAdded.length === 0) {
    console.log("Tablas de auth: al día.");
  } else {
    await runMigrations();
    console.log(
      `Tablas de auth: creadas ${toBeCreated.map((t) => t.table).join(", ") || "-"}; actualizadas ${toBeAdded.map((t) => t.table).join(", ") || "-"}.`
    );
  }
  // getDb() (importado por auth) ya aplicó el esquema propio al abrir la base.
  console.log("Tablas propias: al día.");
}

main().catch((error) => {
  console.error("Falló la migración:", error);
  process.exit(1);
});
