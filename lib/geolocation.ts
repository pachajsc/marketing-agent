// Ubicación del dispositivo para la búsqueda de prospectos (refinamiento
// opcional: preferencia de cercanía con radio). Extraído de
// app/report/components/ProspectsSection.tsx para reutilizarlo en la app
// (/prospects) sin duplicarlo. Solo se usa en el navegador.
import type { SearchProximity } from "@/lib/tools/search-prospects-types";

// Límites del radio de búsqueda: mismo tope que SearchProximitySchema
// (lib/tools/search-prospects-types.ts) — el límite real del radio de
// locationBias.circle en la API de Google (50 km).
export const MIN_RADIUS_KM = 1;
export const MAX_RADIUS_KM = 50;
export const DEFAULT_RADIUS_KM = 10;

export type LocationNote = null | "unsupported" | "denied" | "unavailable";

export const LOCATION_NOTE_MESSAGE: Record<Exclude<LocationNote, null>, string> = {
  unsupported: "Tu navegador no permite compartir tu ubicación: buscamos solo por la zona del cuestionario.",
  denied: "No compartiste tu ubicación: buscamos solo por la zona del cuestionario.",
  unavailable: "No pudimos obtener tu ubicación: buscamos solo por la zona del cuestionario.",
};

/** Sentinel — no hay un tipo de error nativo para "este navegador no tiene Geolocation API". */
class GeolocationUnsupportedError extends Error {}

/** Promesa sobre la Geolocation API. Rechaza con el GeolocationPositionError real (para distinguir permiso denegado de otras fallas) o con GeolocationUnsupportedError si la API no existe. */
function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new GeolocationUnsupportedError());
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: 8_000,
      maximumAge: 5 * 60_000,
    });
  });
}

export function clampRadiusKm(value: number): number {
  return Math.min(Math.max(value, MIN_RADIUS_KM), MAX_RADIUS_KM);
}

/**
 * La ubicación es un refinamiento, no un requisito: si el navegador no la
 * soporta, el usuario la niega, o falla por cualquier otro motivo, la
 * búsqueda sigue funcionando igual que siempre (solo por categoría+zona).
 */
export async function readProximity(radiusKm: number): Promise<{ proximity?: SearchProximity; note: LocationNote }> {
  try {
    const position = await getCurrentPosition();
    return { proximity: { lat: position.coords.latitude, lng: position.coords.longitude, radiusKm }, note: null };
  } catch (error) {
    if (error instanceof GeolocationUnsupportedError) return { note: "unsupported" };
    if (error instanceof GeolocationPositionError && error.code === error.PERMISSION_DENIED) return { note: "denied" };
    return { note: "unavailable" };
  }
}
