// Route Handler — boundary HTTP para buscar prospectos. No llama a Google ni
// a Claude directamente: valida el input y delega en ProspectingAgent
// (lib/agent/prospecting-agent.ts), que arma un plan de búsquedas y ejecuta
// (vía el Tool en lib/tools/, que a su vez habla con el servidor MCP en
// mcp/prospecting-server/) solo las que quedan groundeadas contra Google
// Places. Mismo rol que app/api/marketing-strategy/route.ts cumple para
// MarketingAgent: este archivo no conoce el detalle de cómo se genera el
// resultado, solo los tipos de error que puede lanzar la cadena.
//
// Los errores de Google Places ya no llegan acá como GooglePlacesConfigError
// /GooglePlacesRequestError (esas clases viven del lado del servidor MCP,
// en otro proceso — una excepción tipada no cruza ese límite tal cual):
// llegan como McpProspectingConfigError/McpProspectingRequestError,
// reconstruidas por lib/mcp/prospecting-mcp-client.ts a partir del payload
// de error del tool. La distinción 500/429/502 que existía antes de MCP se
// preserva igual, solo cambia de qué módulo vienen las clases.
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { runProspectingAgent } from "@/lib/agent/prospecting-agent";
import { McpProspectingConfigError, McpProspectingRequestError } from "@/lib/mcp/prospecting-mcp-client";
import { MarketingStrategySchema, type QuestionnaireAnswers } from "@/lib/types";

// Valida únicamente los campos de QuestionnaireAnswers que ProspectingAgent
// efectivamente lee (ver buildPrompt en prospecting-agent.ts). No reemplaza
// la decisión de que QuestionnaireAnswers no tiene un schema Zod propio
// (interface, deliberado — ver lib/types.ts): esto es una validación de
// boundary acotada a lo que este endpoint necesita para no romper, no un
// schema paralelo de todo el cuestionario.
const ProspectingAnswersSchema = z.object({
  offering: z.string().trim().min(1),
  businessType: z.enum(["b2b", "b2c"]),
  targetArea: z.string().trim().min(1),
  businessCategoryToTarget: z.string().trim().min(1).optional(),
});

export async function POST(request: Request) {
  let body: { answers?: unknown; strategy?: unknown };
  try {
    body = (await request.json()) as { answers?: unknown; strategy?: unknown };
  } catch {
    return Response.json({ error: "Body inválido: se esperaba JSON." }, { status: 400 });
  }

  const parsedAnswers = ProspectingAnswersSchema.safeParse(body.answers);
  if (!parsedAnswers.success) {
    return Response.json(
      {
        error: "Input inválido: 'answers' no tiene los campos necesarios.",
        details: parsedAnswers.error.flatten().fieldErrors,
      },
      { status: 400 }
    );
  }
  // Más allá de los campos validados arriba, confiamos en la forma del
  // resto de `answers` porque solo lo arma nuestro propio wizard, ya
  // validado por isStepValid antes de guardarse.
  const answers = body.answers as QuestionnaireAnswers;

  // `strategy` sí llega validada: a diferencia de `answers`, no es un dato
  // que el propio wizard haya validado antes — viene de una respuesta
  // anterior de /api/marketing-strategy que el cliente reenvía tal cual.
  let strategy;
  if (body.strategy !== undefined) {
    const parsedStrategy = MarketingStrategySchema.safeParse(body.strategy);
    if (!parsedStrategy.success) {
      return Response.json(
        { error: "Input inválido: 'strategy' no tiene la forma esperada." },
        { status: 400 }
      );
    }
    strategy = parsedStrategy.data;
  }

  try {
    const result = await runProspectingAgent(answers, strategy);
    return Response.json(result.prospects);
  } catch (error) {
    // Mismo criterio que marketing-strategy/route.ts: loguear el detalle
    // server-side, pero nunca devolverlo al cliente tal cual (podría
    // incluir fragmentos de la respuesta interna de Google o de Claude).
    if (error instanceof McpProspectingConfigError) {
      console.error("Google Places mal configurado (vía MCP):", error.message);
      return Response.json(
        { error: "El servicio de prospecting no está disponible en este momento." },
        { status: 500 }
      );
    }

    if (error instanceof McpProspectingRequestError) {
      console.error("Error de Google Places (vía MCP):", error.status, error.message);
      if (error.status === 429) {
        return Response.json(
          { error: "Se alcanzó el límite de uso de Google Places. Probá de nuevo en un momento." },
          { status: 429 }
        );
      }
      return Response.json({ error: "No se pudo completar la búsqueda de prospectos." }, { status: 502 });
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

    console.error("Error inesperado buscando prospectos:", error);
    return Response.json({ error: "No se pudo completar la búsqueda de prospectos." }, { status: 500 });
  }
}
