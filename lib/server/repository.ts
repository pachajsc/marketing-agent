// Capa de datos de la app SaaS (repository): única puerta a las tablas
// propias. Todas las funciones reciben el userId y filtran por él: un usuario
// nunca puede leer ni modificar datos de otro.
//
// Las reglas de negocio no viven acá sino en módulos puros que ya existen:
//   - estados del prospecto: lib/workspace/prospect-status.ts
//   - revisión del mensaje:  lib/review/message-review.ts (el mismo reductor
//     que usa la UI, aplicado en el servidor sobre lo guardado: el cliente no
//     puede saltarse una regla, por ejemplo aprobar un mensaje vacío).
//
// `createRepository(db)` permite testear contra una base en memoria.
import "server-only";

import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  MarketingStrategySchema,
  ProspectStatusSchema,
  QualifiedProspectSchema,
  SalesMessageSchema,
  type MarketingStrategy,
  type ProspectStatus,
  type QualifiedProspect,
  type QuestionnaireAnswers,
  type SalesMessage,
} from "@/lib/types";
import {
  messagePanelReducer,
  type MessagePanelAction,
  type MessageReview,
  type ReviewDecision,
} from "@/lib/review/message-review";
import {
  canTransition,
  isMessageLocked,
  statusAfterApproval,
  statusAfterReopen,
} from "@/lib/workspace/prospect-status";
import { getDb } from "@/lib/server/db";

export type ProspectEventType =
  | "found"
  | "message_generated"
  | "message_approved"
  | "message_rejected"
  | "message_reopened"
  | "status_changed";

export interface ProspectEvent {
  id: number;
  prospectId: string;
  prospectName: string;
  type: ProspectEventType;
  detail: string | null;
  createdAt: string;
}

export interface ProspectRecord {
  id: string;
  prospect: QualifiedProspect;
  status: ProspectStatus;
  createdAt: string;
  updatedAt: string;
  lastActivity: { type: ProspectEventType; at: string } | null;
  hasApprovedMessage: boolean;
}

export interface BusinessProfile {
  answers: QuestionnaireAnswers;
  strategy: MarketingStrategy | null;
  updatedAt: string;
}

export interface DashboardStats {
  total: number;
  newCount: number;
  contacted: number;
  responses: number;
}

/** Error de regla de negocio (transición inválida, prospecto inexistente, etc.). */
export class RepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RepositoryError";
  }
}

type Row = Record<string, unknown>;

const now = () => new Date().toISOString();

export function createRepository(db: DatabaseSync) {
  function addEvent(userId: string, prospectId: string, type: ProspectEventType, detail: string | null = null) {
    db.prepare(
      "INSERT INTO prospect_events (prospect_id, user_id, type, detail, created_at) VALUES (?, ?, ?, ?, ?)"
    ).run(prospectId, userId, type, detail, now());
  }

  function readReview(prospectId: string): MessageReview | null {
    const row = db.prepare("SELECT * FROM prospect_messages WHERE prospect_id = ?").get(prospectId) as Row | undefined;
    if (!row) return null;
    return {
      original: SalesMessageSchema.parse(JSON.parse(String(row.original_json))),
      editedText: row.edited_text === null ? null : String(row.edited_text),
      decision: String(row.decision) as ReviewDecision,
      approvedText: row.approved_text === null ? null : String(row.approved_text),
    };
  }

  function writeReview(prospectId: string, review: MessageReview) {
    db.prepare(
      `INSERT INTO prospect_messages (prospect_id, original_json, edited_text, decision, approved_text, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (prospect_id) DO UPDATE SET
         original_json = excluded.original_json, edited_text = excluded.edited_text,
         decision = excluded.decision, approved_text = excluded.approved_text, updated_at = excluded.updated_at`
    ).run(prospectId, JSON.stringify(review.original), review.editedText, review.decision, review.approvedText, now());
  }

  function ownedProspectRow(userId: string, prospectId: string): Row {
    const row = db.prepare("SELECT * FROM prospects WHERE id = ? AND user_id = ?").get(prospectId, userId) as Row | undefined;
    if (!row) throw new RepositoryError("El prospecto no existe.");
    return row;
  }

  function setStatusRow(userId: string, prospectId: string, from: ProspectStatus, to: ProspectStatus) {
    if (from === to) return;
    db.prepare("UPDATE prospects SET status = ?, updated_at = ? WHERE id = ?").run(to, now(), prospectId);
    addEvent(userId, prospectId, "status_changed", `${from}→${to}`);
  }

  function toRecord(row: Row): ProspectRecord {
    return {
      id: String(row.id),
      prospect: QualifiedProspectSchema.parse(JSON.parse(String(row.data_json))),
      status: ProspectStatusSchema.parse(row.status),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      lastActivity: row.last_type ? { type: String(row.last_type) as ProspectEventType, at: String(row.last_at) } : null,
      hasApprovedMessage: row.decision === "approved",
    };
  }

  const PROSPECT_SELECT = `
    SELECT p.*, m.decision AS decision,
      (SELECT type FROM prospect_events e WHERE e.prospect_id = p.id ORDER BY e.id DESC LIMIT 1) AS last_type,
      (SELECT created_at FROM prospect_events e WHERE e.prospect_id = p.id ORDER BY e.id DESC LIMIT 1) AS last_at
    FROM prospects p LEFT JOIN prospect_messages m ON m.prospect_id = p.id`;

  function getProfile(userId: string): BusinessProfile | null {
    const row = db.prepare("SELECT * FROM business_profiles WHERE user_id = ?").get(userId) as Row | undefined;
    if (!row) return null;
    return {
      answers: JSON.parse(String(row.answers_json)) as QuestionnaireAnswers,
      strategy: row.strategy_json ? MarketingStrategySchema.parse(JSON.parse(String(row.strategy_json))) : null,
      updatedAt: String(row.updated_at),
    };
  }

  return {
    getProfile,

    /** Guarda las respuestas. Si cambiaron, la estrategia anterior deja de corresponder y se borra. */
    saveProfileAnswers(userId: string, answers: QuestionnaireAnswers): void {
      const current = getProfile(userId);
      const unchanged = current && JSON.stringify(current.answers) === JSON.stringify(answers);
      db.prepare(
        `INSERT INTO business_profiles (user_id, answers_json, strategy_json, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (user_id) DO UPDATE SET answers_json = excluded.answers_json,
           strategy_json = excluded.strategy_json, updated_at = excluded.updated_at`
      ).run(userId, JSON.stringify(answers), unchanged && current.strategy ? JSON.stringify(current.strategy) : null, now());
    },

    saveStrategy(userId: string, strategy: MarketingStrategy): void {
      const result = db
        .prepare("UPDATE business_profiles SET strategy_json = ?, updated_at = ? WHERE user_id = ?")
        .run(JSON.stringify(MarketingStrategySchema.parse(strategy)), now(), userId);
      if (result.changes === 0) throw new RepositoryError("Primero completá el cuestionario.");
    },

    /**
     * Guarda prospectos reales de una búsqueda. Clave: el mapsUrl de Google
     * por usuario. Los nuevos entran como "Nuevo" con un evento "found"; los
     * que ya existían actualizan sus datos y calificación, pero conservan su
     * estado, su mensaje y su historial.
     */
    upsertProspects(userId: string, prospects: QualifiedProspect[]): { inserted: number; updated: number } {
      let inserted = 0;
      let updated = 0;
      for (const prospect of prospects) {
        const data = JSON.stringify(QualifiedProspectSchema.parse(prospect));
        const existing = db
          .prepare("SELECT id FROM prospects WHERE user_id = ? AND maps_url = ?")
          .get(userId, prospect.mapsUrl) as Row | undefined;
        if (existing) {
          db.prepare("UPDATE prospects SET data_json = ?, updated_at = ? WHERE id = ?").run(data, now(), String(existing.id));
          updated += 1;
        } else {
          const id = randomUUID();
          const at = now();
          db.prepare(
            "INSERT INTO prospects (id, user_id, maps_url, data_json, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'new', ?, ?)"
          ).run(id, userId, prospect.mapsUrl, data, at, at);
          addEvent(userId, id, "found");
          inserted += 1;
        }
      }
      return { inserted, updated };
    },

    /** Prospectos del usuario, ordenados por score (desc) y después por más reciente. */
    listProspects(userId: string): ProspectRecord[] {
      const rows = db.prepare(`${PROSPECT_SELECT} WHERE p.user_id = ? ORDER BY p.created_at DESC`).all(userId) as Row[];
      return rows
        .map(toRecord)
        .sort((a, b) => b.prospect.qualification.score - a.prospect.qualification.score);
    },

    getProspect(userId: string, prospectId: string): (ProspectRecord & { review: MessageReview | null; events: ProspectEvent[] }) | null {
      const row = db.prepare(`${PROSPECT_SELECT} WHERE p.id = ? AND p.user_id = ?`).get(prospectId, userId) as Row | undefined;
      if (!row) return null;
      const record = toRecord(row);
      const events = (
        db.prepare("SELECT * FROM prospect_events WHERE prospect_id = ? AND user_id = ? ORDER BY id DESC").all(prospectId, userId) as Row[]
      ).map((event) => ({
        id: Number(event.id),
        prospectId,
        prospectName: record.prospect.name,
        type: String(event.type) as ProspectEventType,
        detail: event.detail === null ? null : String(event.detail),
        createdAt: String(event.created_at),
      }));
      return { ...record, review: readReview(prospectId), events };
    },

    /** Cambio manual de estado, validado contra las transiciones permitidas. */
    changeStatus(userId: string, prospectId: string, to: ProspectStatus): void {
      const row = ownedProspectRow(userId, prospectId);
      const from = ProspectStatusSchema.parse(row.status);
      const hasApprovedMessage = readReview(prospectId)?.decision === "approved";
      if (!canTransition(from, to, { hasApprovedMessage })) {
        throw new RepositoryError("Ese cambio de estado no está permitido.");
      }
      setStatusRow(userId, prospectId, from, to);
    },

    /** Guarda un mensaje recién generado (reemplaza el anterior, si las reglas de revisión lo permiten). */
    saveGeneratedMessage(userId: string, prospectId: string, salesMessage: SalesMessage): MessageReview {
      const row = ownedProspectRow(userId, prospectId);
      const status = ProspectStatusSchema.parse(row.status);
      if (isMessageLocked(status)) throw new RepositoryError("El mensaje de un prospecto contactado no se puede regenerar.");
      const current = readReview(prospectId);
      // Mismas reglas que en la UI: no se regenera con una edición pendiente ni con el mensaje aprobado.
      const state = messagePanelReducer({ review: current, generating: false, error: null }, { type: "generateStart" });
      if (!state.generating) {
        throw new RepositoryError("Para generar de nuevo, primero restaurá el original o reabrí el mensaje.");
      }
      const next = messagePanelReducer(state, { type: "generateSuccess", salesMessage: SalesMessageSchema.parse(salesMessage) });
      writeReview(prospectId, next.review!);
      addEvent(userId, prospectId, "message_generated");
      return next.review!;
    },

    /**
     * Aplica una acción de revisión (editar, restaurar, aprobar, rechazar,
     * reabrir) con el mismo reductor que la UI, y actualiza el estado del
     * prospecto cuando corresponde (aprobar → "Listo para contactar",
     * reabrir → vuelve a "Nuevo").
     */
    applyReviewAction(
      userId: string,
      prospectId: string,
      action: Extract<MessagePanelAction, { type: "edit" | "restoreOriginal" | "approve" | "reject" | "reopen" }>
    ): MessageReview {
      const row = ownedProspectRow(userId, prospectId);
      const status = ProspectStatusSchema.parse(row.status);
      if (isMessageLocked(status)) throw new RepositoryError("El mensaje de un prospecto contactado no se puede modificar.");
      const current = readReview(prospectId);
      if (!current) throw new RepositoryError("Todavía no hay un mensaje generado.");

      const before = { review: current, generating: false, error: null };
      const after = messagePanelReducer(before, action);
      if (after === before) throw new RepositoryError("Esa acción no está permitida en el estado actual del mensaje.");
      writeReview(prospectId, after.review!);

      if (action.type === "approve") {
        addEvent(userId, prospectId, "message_approved");
        setStatusRow(userId, prospectId, status, statusAfterApproval(status));
      } else if (action.type === "reject") {
        addEvent(userId, prospectId, "message_rejected");
      } else if (action.type === "reopen") {
        addEvent(userId, prospectId, "message_reopened");
        setStatusRow(userId, prospectId, status, statusAfterReopen(status));
      }
      return after.review!;
    },

    listRecentEvents(userId: string, limit: number): ProspectEvent[] {
      const rows = db
        .prepare(
          `SELECT e.*, p.data_json AS data_json FROM prospect_events e JOIN prospects p ON p.id = e.prospect_id
           WHERE e.user_id = ? ORDER BY e.id DESC LIMIT ?`
        )
        .all(userId, limit) as Row[];
      return rows.map((row) => ({
        id: Number(row.id),
        prospectId: String(row.prospect_id),
        prospectName: (JSON.parse(String(row.data_json)) as QualifiedProspect).name,
        type: String(row.type) as ProspectEventType,
        detail: row.detail === null ? null : String(row.detail),
        createdAt: String(row.created_at),
      }));
    },

    /** "Contactados" y "Respuestas" cuentan también a los que avanzaron más en el embudo. */
    getStats(userId: string): DashboardStats {
      const rows = db.prepare("SELECT status, COUNT(*) AS n FROM prospects WHERE user_id = ? GROUP BY status").all(userId) as Row[];
      const count = (statuses: ProspectStatus[]) =>
        rows.filter((row) => statuses.includes(row.status as ProspectStatus)).reduce((sum, row) => sum + Number(row.n), 0);
      return {
        total: rows.reduce((sum, row) => sum + Number(row.n), 0),
        newCount: count(["new"]),
        contacted: count(["contacted", "replied", "qualified"]),
        responses: count(["replied", "qualified"]),
      };
    },
  };
}

export type Repository = ReturnType<typeof createRepository>;

export function getRepository(): Repository {
  return createRepository(getDb());
}
