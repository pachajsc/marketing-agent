// Base de datos local de la app SaaS: SQLite en un archivo, vía `node:sqlite`
// (incluido en Node 24, sin dependencias). Guarda usuarios y sesiones (tablas
// de Better Auth) y, por usuario: perfil de negocio, prospectos reales,
// mensajes y eventos de actividad.
//
// Todo el acceso a las tablas propias pasa por lib/server/repository.ts: si
// mañana se migra a Postgres, cambia esa capa, no la UI.
//
// Limitación conocida: un archivo SQLite sirve para correr en local o en un
// servidor propio, no en plataformas serverless.
import "server-only";

import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

/** Esquema de las tablas propias (las de auth las crea Better Auth: ver scripts/db-migrate.ts). */
export const APP_SCHEMA = `
CREATE TABLE IF NOT EXISTS business_profiles (
  user_id TEXT PRIMARY KEY,
  answers_json TEXT NOT NULL,
  strategy_json TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS prospects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  maps_url TEXT NOT NULL,
  data_json TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (user_id, maps_url)
);
CREATE INDEX IF NOT EXISTS prospects_user_idx ON prospects (user_id, updated_at);

CREATE TABLE IF NOT EXISTS prospect_messages (
  prospect_id TEXT PRIMARY KEY,
  original_json TEXT NOT NULL,
  edited_text TEXT,
  decision TEXT NOT NULL,
  approved_text TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS prospect_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prospect_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS prospect_events_user_idx ON prospect_events (user_id, id);
CREATE INDEX IF NOT EXISTS prospect_events_prospect_idx ON prospect_events (prospect_id, id);
`;

/** Aplica el esquema propio (idempotente). */
export function applyAppSchema(db: DatabaseSync): void {
  db.exec(APP_SCHEMA);
}

function resolveDatabasePath(): string {
  return process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "app.db");
}

// Singleton por proceso (sobrevive al hot reload de `next dev` vía globalThis,
// para no abrir una conexión nueva en cada recompilación).
const globalForDb = globalThis as unknown as { __appDb?: DatabaseSync };

export function getDb(): DatabaseSync {
  if (!globalForDb.__appDb) {
    const file = resolveDatabasePath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const db = new DatabaseSync(file);
    db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    applyAppSchema(db);
    globalForDb.__appDb = db;
  }
  return globalForDb.__appDb;
}
