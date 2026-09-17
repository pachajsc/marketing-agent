// Route Handler — boundary HTTP para buscar prospectos. No llama a Google ni
// a Claude directamente: valida el input y delega en ProspectingAgent
// (lib/agent/prospecting-agent.ts), que a su vez decide si corresponde
// invocar el tool search_prospects (que llama a searchProspects() →
// Google Places). Mismo rol que app/api/marketing-strategy/route.ts cumple
// para MarketingAgent: este archivo no conoce el detalle de cómo se genera
// el resultado, solo los tipos de error que puede lanzar la cadena.
import Anthropic from "@anthropic-ai/sdk";
import { runProspectingAgent } from "@/lib/agent/prospecting-agent";
import { GooglePlacesConfigError, GooglePlacesRequestError } from "@/lib/prospecting/google-places";
import { MarketingStrategySchema, type QuestionnaireAnswers } from "@/lib/types";

export async function POST(request: Request) {
  let body: { answers?: unknown; strategy?: unknown };
  try {
    body = (await request.json()) as { answers?: unknown; strategy?: unknown };
  } catch {
    return Response.json({ error: "Body inválido: se esperaba JSON." }, { status: 400 });
  }

  // Igual que marketing-strategy/route.ts: confiamos en la forma de
  // `answers` porque solo lo arma nuestro propio wizard, ya validado por
  // isStepValid antes de guardarse (QuestionnaireAnswers es una interface
  // sin schema Zod propio, decisión deliberada — ver lib/types.ts).
  if (!body.answers || typeof body.answers !== "object") {
    return Response.json({ error: "Input inválido: falta 'answers'." }, { status: 400 });
  }
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
    if (error instanceof GooglePlacesConfigError) {
      console.error("Google Places mal configurado:", error.message);
      return Response.json(
        { error: "El servicio de prospecting no está disponible en este momento." },
        { status: 500 }
      );
    }

    if (error instanceof GooglePlacesRequestError) {
      console.error("Error de Google Places:", error.status, error.message);
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
