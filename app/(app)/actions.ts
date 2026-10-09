"use server";

// Server Actions de la app autenticada: el borde entre la UI y los agentes /
// la base. Cada una verifica la sesión (requireUser) — no se confía en
// proxy.ts — y opera solo sobre datos del usuario.
//
// Los agentes son los mismos de siempre (lib/agent/*): acá solo se los invoca
// con el perfil guardado del usuario y se persiste el resultado. Antes de
// gastar una llamada a Claude se verifica que la acción esté permitida.
//
// Los errores se devuelven como texto para el usuario; el detalle técnico
// queda solo en el log del servidor (mismo criterio que los Route Handlers).
import { revalidatePath } from "next/cache";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { runMarketingAgent } from "@/lib/agent/marketing-agent";
import { runProspectingAgent } from "@/lib/agent/prospecting-agent";
import { runSalesMessageAgent, SalesMessageValidationError } from "@/lib/agent/sales-message-agent";
import { McpProspectingConfigError, McpProspectingRequestError } from "@/lib/mcp/prospecting-mcp-client";
import { qualifyProspect, qualifyProspects } from "@/lib/qualification/qualify-prospects";
import { canGenerate, type MessageReview } from "@/lib/review/message-review";
import { SearchProximitySchema } from "@/lib/tools/search-prospects-types";
import { ProspectSchema, ProspectStatusSchema, type ProspectStatus, type QuestionnaireAnswers } from "@/lib/types";
import { isMessageLocked } from "@/lib/workspace/prospect-status";
import { getRepository, RepositoryError } from "@/lib/server/repository";
import { requireUser } from "@/lib/server/session";

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

function toUserError(error: unknown, context: string): string {
  if (error instanceof RepositoryError) return error.message;
  if (error instanceof SalesMessageValidationError) {
    console.error("Mensaje rechazado por la validación de factualidad:", error.violations);
    return "El mensaje generado no pasó la validación de factualidad. Probá generarlo de nuevo.";
  }
  if (error instanceof McpProspectingConfigError) {
    console.error("Búsqueda mal configurada (vía MCP):", error.message);
    return "La búsqueda de prospectos no está disponible en este momento.";
  }
  if (error instanceof McpProspectingRequestError) {
    console.error("Error de la búsqueda (vía MCP):", error.status, error.message);
    return error.status === 429
      ? "Se alcanzó el límite de búsquedas. Probá de nuevo en un momento."
      : "No se pudo completar la búsqueda de prospectos.";
  }
  if (error instanceof Anthropic.RateLimitError) return "Se alcanzó el límite de uso de la IA. Probá de nuevo en un momento.";
  if (error instanceof Anthropic.APIError) {
    console.error("Anthropic API error:", error.status, error.message);
    return "La IA no pudo procesar la solicitud. Probá de nuevo.";
  }
  console.error(`Error inesperado (${context}):`, error);
  return "Ocurrió un error inesperado. Probá de nuevo.";
}

// Mismos campos que valida /api/sales-message: los que usan los agentes.
const ProfileAnswersSchema = z.object({
  offering: z.string().trim().min(1),
  problem: z.string().trim().min(1),
  mainGoal: z.enum(["first_customers", "increase_sales", "recurring_customers", "higher_value_upsell"]),
  businessType: z.enum(["b2b", "b2c"]),
  hasCustomersToday: z.enum(["none", "some", "stable"]),
  targetArea: z.string().trim().min(1),
  businessCategoryToTarget: z.string().trim().min(1),
  idealCustomerDescription: z.string().optional(),
  knownCompetitors: z.string().optional(),
  priceRange: z.string().optional(),
});

export async function saveProfileAction(answers: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = ProfileAnswersSchema.safeParse(answers);
  if (!parsed.success) return { ok: false, error: "Faltan respuestas obligatorias del cuestionario." };
  getRepository().saveProfileAnswers(user.id, parsed.data as QuestionnaireAnswers);
  revalidatePath("/strategy");
  return { ok: true, data: undefined };
}

export async function generateStrategyAction(): Promise<ActionResult> {
  const user = await requireUser();
  const repo = getRepository();
  const profile = repo.getProfile(user.id);
  if (!profile) return { ok: false, error: "Primero completá el cuestionario." };
  try {
    repo.saveStrategy(user.id, await runMarketingAgent(profile.answers));
    revalidatePath("/strategy");
    revalidatePath("/dashboard");
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toUserError(error, "estrategia") };
  }
}

export async function findProspectsAction(proximity?: unknown): Promise<ActionResult<{ inserted: number; updated: number }>> {
  const user = await requireUser();
  const repo = getRepository();
  const profile = repo.getProfile(user.id);
  if (!profile) return { ok: false, error: "Primero completá el cuestionario: necesitamos saber qué buscar y dónde." };

  const parsedProximity = proximity === undefined ? undefined : SearchProximitySchema.safeParse(proximity);
  if (parsedProximity && !parsedProximity.success) return { ok: false, error: "La ubicación recibida no es válida." };

  try {
    const result = await runProspectingAgent(profile.answers, profile.strategy ?? undefined, {
      proximity: parsedProximity?.data,
    });
    const counts = repo.upsertProspects(user.id, qualifyProspects(result.prospects, profile.answers));
    revalidatePath("/prospects");
    revalidatePath("/dashboard");
    return { ok: true, data: counts };
  } catch (error) {
    return { ok: false, error: toUserError(error, "búsqueda") };
  }
}

export async function changeStatusAction(prospectId: string, to: ProspectStatus): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = ProspectStatusSchema.safeParse(to);
  if (!parsed.success) return { ok: false, error: "Estado inválido." };
  try {
    getRepository().changeStatus(user.id, prospectId, parsed.data);
    revalidatePath(`/prospects/${prospectId}`);
    revalidatePath("/prospects");
    revalidatePath("/dashboard");
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toUserError(error, "estado") };
  }
}

export async function generateMessageAction(prospectId: string): Promise<ActionResult<MessageReview>> {
  const user = await requireUser();
  const repo = getRepository();
  const profile = repo.getProfile(user.id);
  if (!profile?.strategy) return { ok: false, error: "Para generar mensajes primero generá tu estrategia." };

  const record = repo.getProspect(user.id, prospectId);
  if (!record) return { ok: false, error: "El prospecto no existe." };
  // Mismas reglas que se aplican al guardar, chequeadas ANTES de pagar la llamada a Claude.
  if (isMessageLocked(record.status)) return { ok: false, error: "El mensaje de un prospecto contactado no se puede regenerar." };
  if (!canGenerate({ review: record.review, generating: false, error: null })) {
    return { ok: false, error: "Para generar de nuevo, primero restaurá el original o reabrí el mensaje." };
  }

  try {
    // La calificación se recalcula con las respuestas actuales (pura, sin costo),
    // igual que hace /api/sales-message: Claude nunca ve evidencia desactualizada.
    const prospect = qualifyProspect(ProspectSchema.parse(record.prospect), profile.answers);
    const salesMessage = await runSalesMessageAgent(prospect, profile.answers, profile.strategy);
    const review = repo.saveGeneratedMessage(user.id, prospectId, salesMessage);
    revalidatePath(`/prospects/${prospectId}`);
    revalidatePath("/dashboard");
    return { ok: true, data: review };
  } catch (error) {
    return { ok: false, error: toUserError(error, "mensaje") };
  }
}

const ReviewActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("edit"), text: z.string().max(2000) }),
  z.object({ type: z.literal("restoreOriginal") }),
  z.object({ type: z.literal("approve") }),
  z.object({ type: z.literal("reject") }),
  z.object({ type: z.literal("reopen") }),
]);

export async function reviewMessageAction(prospectId: string, action: unknown): Promise<ActionResult<MessageReview>> {
  const user = await requireUser();
  const parsed = ReviewActionSchema.safeParse(action);
  if (!parsed.success) return { ok: false, error: "Acción inválida." };
  try {
    const review = getRepository().applyReviewAction(user.id, prospectId, parsed.data);
    revalidatePath(`/prospects/${prospectId}`);
    revalidatePath("/prospects");
    revalidatePath("/dashboard");
    return { ok: true, data: review };
  } catch (error) {
    return { ok: false, error: toUserError(error, "revisión") };
  }
}
