// Route Handler — boundary HTTP para buscar prospectos. No llama a Google
// directamente: valida el input y delega en searchProspects()
// (lib/prospecting/google-places.ts), que es quien sabe hablar con Google
// Places. Mismo rol que app/api/marketing-strategy/route.ts cumple para
// MarketingAgent: este archivo no conoce nada de Google Places más allá de
// los tipos de error que puede lanzar.
import {
  searchProspects,
  GooglePlacesConfigError,
  GooglePlacesRequestError,
} from "@/lib/prospecting/google-places";
import { SearchProspectsInputSchema } from "@/lib/prospecting/types";

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Body inválido: se esperaba JSON." }, { status: 400 });
  }

  const parsed = SearchProspectsInputSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: "Input inválido.", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  try {
    const prospects = await searchProspects(parsed.data);
    return Response.json(prospects);
  } catch (error) {
    // Mismo criterio que marketing-strategy/route.ts: loguear el detalle
    // server-side, pero nunca devolverlo al cliente tal cual (podría
    // incluir fragmentos de la respuesta interna de Google).
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

    console.error("Error inesperado buscando prospectos:", error);
    return Response.json({ error: "No se pudo completar la búsqueda de prospectos." }, { status: 500 });
  }
}
