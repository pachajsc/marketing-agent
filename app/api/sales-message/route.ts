// Route Handler — Fase 8: genera (NO envía) un mensaje comercial para un
// prospecto calificado. Valida el input con Zod y delega en
// SalesMessageAgent (lib/agent/sales-message-agent.ts): una llamada a Claude
// por request, sin reintentos automáticos.
//
// La qualification que llega con el prospecto se valida contra su schema,
// pero el agente usa la recalculada acá con qualifyProspect (pura,
// determinista, sin costo): la evidencia que ve Claude siempre sale del
// código del servidor, nunca de lo que mande el cliente.
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { runSalesMessageAgent, SalesMessageValidationError } from "@/lib/agent/sales-message-agent";
import { qualifyProspect } from "@/lib/qualification/qualify-prospects";
import {
  MarketingStrategySchema,
  ProspectSchema,
  QualifiedProspectSchema,
  type QuestionnaireAnswers,
} from "@/lib/types";

// Mismo criterio que ProspectingAnswersSchema en /api/prospects: valida los
// campos de QuestionnaireAnswers que este endpoint usa, sin crear un schema
// paralelo de todo el cuestionario.
const SalesMessageAnswersSchema = z.object({
  offering: z.string().trim().min(1),
  problem: z.string().trim().min(1),
  businessType: z.enum(["b2b", "b2c"]),
  targetArea: z.string().trim().min(1),
  businessCategoryToTarget: z.string().trim().min(1).optional(),
  idealCustomerDescription: z.string().optional(),
  priceRange: z.string().optional(),
});

const SalesMessageRequestSchema = z.object({
  answers: SalesMessageAnswersSchema,
  strategy: MarketingStrategySchema,
  prospect: QualifiedProspectSchema,
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body inválido: se esperaba JSON." }, { status: 400 });
  }

  const parsed = SalesMessageRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        error: "Input inválido: se esperaba 'answers', 'strategy' y 'prospect' (con su qualification) válidos.",
        details: parsed.error.flatten().fieldErrors,
      },
      { status: 400 }
    );
  }

  // Más allá de los campos validados, la forma del resto de `answers` la
  // arma nuestro propio wizard (mismo criterio que /api/prospects).
  const answers = (body as { answers: QuestionnaireAnswers }).answers;
  // ProspectSchema.parse descarta `qualification` (claves desconocidas): queda el Prospect real.
  const prospect = qualifyProspect(ProspectSchema.parse(parsed.data.prospect), answers);

  try {
    const salesMessage = await runSalesMessageAgent(prospect, answers, parsed.data.strategy);
    return Response.json(salesMessage);
  } catch (error) {
    // Detalle solo en el log del servidor; nunca la respuesta cruda de Claude al cliente.
    if (error instanceof SalesMessageValidationError) {
      console.error("Mensaje rechazado por la validación de factualidad:", error.violations);
      return Response.json(
        { error: "El mensaje generado no pasó la validación de factualidad. Probá generarlo de nuevo." },
        { status: 502 }
      );
    }
    if (error instanceof Anthropic.AuthenticationError) {
      console.error("Anthropic authentication error:", error.message);
      return Response.json(
        { error: "Falló la autenticación con Claude. Revisá ANTHROPIC_API_KEY." },
        { status: 500 }
      );
    }
    if (error instanceof Anthropic.RateLimitError) {
      console.error("Anthropic rate limit error:", error.message);
      return Response.json(
        { error: "Se alcanzó el límite de uso de Claude. Probá de nuevo en un momento." },
        { status: 429 }
      );
    }
    if (error instanceof Anthropic.APIError) {
      console.error("Anthropic API error:", error.status, error.message);
      return Response.json({ error: "Claude no pudo procesar la solicitud." }, { status: 502 });
    }

    console.error("Error inesperado generando el mensaje:", error);
    return Response.json({ error: "No se pudo generar el mensaje." }, { status: 500 });
  }
}
