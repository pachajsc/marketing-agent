// Route Handler — el único punto de entrada server-side para generar una
// MarketingStrategy. Existe porque QuestionnaireAnswers vive en
// sessionStorage (solo el navegador lo tiene), así que el cliente ya tiene
// el dato en mano y simplemente lo POSTea acá para que el servidor (que sí
// puede usar ANTHROPIC_API_KEY) llame a Claude.
//
// Browser → (fetch POST) → este Route Handler → MarketingAgent → Claude API
import Anthropic from "@anthropic-ai/sdk";
import { runMarketingAgent } from "@/lib/agent/marketing-agent";
import type { QuestionnaireAnswers } from "@/lib/types";

export async function POST(request: Request) {
  let answers: QuestionnaireAnswers;
  try {
    // Igual que hoy hace app/report/page.tsx con sessionStorage: confiamos
    // en la forma del body porque solo lo arma nuestro propio wizard, ya
    // validado por isStepValid antes de guardarse (ver app/questionnaire/page.tsx).
    answers = (await request.json()) as QuestionnaireAnswers;
  } catch {
    return Response.json({ error: "Body inválido: se esperaba JSON." }, { status: 400 });
  }

  try {
    const strategy = await runMarketingAgent(answers);
    return Response.json(strategy);
  } catch (error) {
    // Cadena de errores más específico primero, como recomienda el SDK: no
    // perder la distinción entre "reintentable" (red, rate limit) y "no
    // reintentable" (auth, request mal formado).
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

    console.error("Error inesperado generando la estrategia:", error);
    return Response.json({ error: "No se pudo generar la estrategia." }, { status: 500 });
  }
}
