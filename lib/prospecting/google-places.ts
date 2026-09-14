// Conector a Google Places API (New) — Text Search.
//
// Deliberadamente framework-agnostic: no importa nada de Next.js (ni
// "server-only", ni Request/Response, ni next/*), solo usa fetch y
// process.env. Eso lo hace portable — hoy lo llama únicamente
// app/api/prospects/route.ts (que sí es server-side, así que la API key
// nunca sale de ahí), pero el día de mañana esta misma función podría
// exponerse como tool de un MCP server sin reescribirla (ver la
// arquitectura acordada: MCP no se implementa todavía, pero esta función
// ya queda con esa forma).
//
// Referencia: https://developers.google.com/maps/documentation/places/web-service/text-search
import { z } from "zod";
import type { Prospect } from "@/lib/types";
import type { SearchProspectsInput } from "./types";

const TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";

// Límite real de Google para pageSize en un solo request (sin paginar).
// Este MVP no pagina: un solo request, tope duro de resultados.
const MAX_PAGE_SIZE = 20;
const DEFAULT_PAGE_SIZE = 20;

// Campos pedidos vía X-Goog-FieldMask. Cada uno mapea a un campo de
// Prospect o a lógica de filtrado interna (businessStatus) — no se pide
// nada que no se use, porque el tier de costo se define por el campo más
// caro pedido, no por cantidad: agregar campos no usados solo suma riesgo
// de costo sin agregar valor.
//
//   displayName          -> Prospect.name
//   formattedAddress      -> Prospect.address
//   nationalPhoneNumber    -> Prospect.phone
//   websiteUri             -> Prospect.website
//   rating                 -> Prospect.rating
//   googleMapsUri           -> Prospect.mapsUrl
//   businessStatus           -> filtrado interno (excluir negocios cerrados)
const FIELD_MASK = [
  "places.displayName",
  "places.formattedAddress",
  "places.nationalPhoneNumber",
  "places.websiteUri",
  "places.rating",
  "places.googleMapsUri",
  "places.businessStatus",
].join(",");

/** El servidor no tiene configurada la credencial necesaria para llamar a Google. */
export class GooglePlacesConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GooglePlacesConfigError";
  }
}

/**
 * Google Places respondió con un error HTTP, o la respuesta no tiene una
 * forma interpretable. `status` es el status HTTP de la respuesta de
 * Google cuando existe (0 si ni siquiera hubo respuesta, ej. error de red).
 */
export class GooglePlacesRequestError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "GooglePlacesRequestError";
    this.status = status;
  }
}

// Estados de negocio que no sirven para prospecting: un negocio cerrado no
// es un prospecto válido, sea cual sea el resto de sus datos.
const CLOSED_BUSINESS_STATUSES = new Set(["CLOSED_PERMANENTLY", "CLOSED_TEMPORARILY"]);

// Shape mínima y defensiva de un place individual dentro de la respuesta de
// Google. Todo opcional a propósito: Google no garantiza que un campo
// pedido venga poblado (ej. un negocio sin sitio web no trae websiteUri).
const GooglePlaceSchema = z.object({
  displayName: z.object({ text: z.string().optional() }).optional(),
  formattedAddress: z.string().optional(),
  nationalPhoneNumber: z.string().optional(),
  websiteUri: z.string().optional(),
  rating: z.number().optional(),
  googleMapsUri: z.string().optional(),
  businessStatus: z.string().optional(),
});

// `places` puede directamente no venir en la respuesta cuando no hay
// resultados — no es un error, es una búsqueda válida sin matches.
const GooglePlacesSearchResponseSchema = z.object({
  places: z.array(GooglePlaceSchema).optional(),
});

type GooglePlace = z.infer<typeof GooglePlaceSchema>;

function resolvePageSize(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_PAGE_SIZE);
}

function isOperational(place: GooglePlace): boolean {
  return !place.businessStatus || !CLOSED_BUSINESS_STATUSES.has(place.businessStatus);
}

/**
 * Mapea un place crudo de Google a nuestro Prospect. Devuelve null cuando
 * al place le falta algún campo obligatorio de Prospect (name, address o
 * mapsUrl) — ese resultado no es prospectable y se descarta, en vez de
 * inventar un valor para completarlo. Los campos opcionales de Prospect
 * (phone, website, rating) quedan `undefined` tal cual si Google no los
 * devolvió, nunca se completan con datos inventados.
 */
function toProspect(place: GooglePlace): Prospect | null {
  const name = place.displayName?.text?.trim();
  const address = place.formattedAddress?.trim();
  const mapsUrl = place.googleMapsUri?.trim();

  if (!name || !address || !mapsUrl) return null;

  return {
    name,
    address,
    mapsUrl,
    phone: place.nationalPhoneNumber?.trim() || undefined,
    website: place.websiteUri?.trim() || undefined,
    rating: place.rating,
  };
}

/** Intenta leer el mensaje de error que devuelve Google, sin romper si el body no es JSON. */
async function readGoogleErrorMessage(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return body?.error?.message;
  } catch {
    return undefined;
  }
}

/**
 * Busca negocios reales vía Google Places API (New) — Text Search — que
 * matcheen una categoría dentro de una zona, y los devuelve como
 * Prospect[] listos para usar (nunca la respuesta cruda de Google).
 */
export async function searchProspects(input: SearchProspectsInput): Promise<Prospect[]> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    throw new GooglePlacesConfigError("GOOGLE_MAPS_API_KEY no está configurada en el servidor.");
  }

  const pageSize = resolvePageSize(input.limit);
  const textQuery = `${input.category.trim()} en ${input.area.trim()}`;

  let response: Response;
  try {
    response = await fetch(TEXT_SEARCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify({ textQuery, pageSize, languageCode: "es" }),
    });
  } catch (error) {
    throw new GooglePlacesRequestError(
      `No se pudo conectar con Google Places: ${error instanceof Error ? error.message : "error de red desconocido"}`,
      0
    );
  }

  if (!response.ok) {
    const detail = await readGoogleErrorMessage(response);
    throw new GooglePlacesRequestError(
      `Google Places respondió ${response.status}${detail ? `: ${detail}` : ""}`,
      response.status
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await response.json();
  } catch {
    throw new GooglePlacesRequestError("Google Places devolvió una respuesta que no es JSON válido.", response.status);
  }

  const parsed = GooglePlacesSearchResponseSchema.safeParse(rawBody);
  if (!parsed.success) {
    throw new GooglePlacesRequestError("Google Places devolvió una respuesta con forma inesperada.", response.status);
  }

  // Sin `places` en la respuesta = sin resultados. Válido, no es un error.
  const places = parsed.data.places ?? [];

  return places
    .filter(isOperational)
    .map(toProspect)
    .filter((prospect): prospect is Prospect => prospect !== null);
}
