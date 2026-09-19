import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GooglePlacesConfigError,
  GooglePlacesRequestError,
  searchProspects,
} from "./google-places";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("searchProspects", () => {
  const originalApiKey = process.env.GOOGLE_MAPS_API_KEY;

  beforeEach(() => {
    process.env.GOOGLE_MAPS_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    process.env.GOOGLE_MAPS_API_KEY = originalApiKey;
    vi.unstubAllGlobals();
  });

  it("lanza GooglePlacesConfigError si falta GOOGLE_MAPS_API_KEY, sin llamar a fetch", async () => {
    delete process.env.GOOGLE_MAPS_API_KEY;

    await expect(searchProspects({ category: "gimnasios", area: "CABA" })).rejects.toBeInstanceOf(
      GooglePlacesConfigError
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("mapea un place completo (incluyendo enrichment) a Prospect y descarta places sin campos obligatorios", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({
        places: [
          {
            displayName: { text: "Club de Padel Norte" },
            formattedAddress: "Av. Siempre Viva 123, CABA",
            nationalPhoneNumber: "+54 11 1234-5678",
            websiteUri: "https://clubnorte.com",
            rating: 4.7,
            userRatingCount: 152,
            primaryType: "gym",
            types: ["gym", "point_of_interest"],
            googleMapsUri: "https://maps.google.com/?cid=123",
            businessStatus: "OPERATIONAL",
          },
          {
            // Sin displayName -> no prospectable, se descarta.
            formattedAddress: "Calle Falsa 456",
            googleMapsUri: "https://maps.google.com/?cid=456",
          },
        ],
      })
    );

    const result = await searchProspects({ category: "clubes de padel", area: "CABA" });

    expect(result).toEqual([
      {
        name: "Club de Padel Norte",
        address: "Av. Siempre Viva 123, CABA",
        mapsUrl: "https://maps.google.com/?cid=123",
        phone: "+54 11 1234-5678",
        website: "https://clubnorte.com",
        rating: 4.7,
        primaryType: "gym",
        types: ["gym", "point_of_interest"],
        userRatingCount: 152,
      },
    ]);
  });

  it("no completa con datos inventados los campos opcionales ausentes", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({
        places: [
          {
            displayName: { text: "Club Sin Datos Extra" },
            formattedAddress: "Calle 1",
            googleMapsUri: "https://maps.google.com/?cid=1",
          },
        ],
      })
    );

    const [prospect] = await searchProspects({ category: "clubes de padel", area: "CABA" });

    expect(prospect.phone).toBeUndefined();
    expect(prospect.website).toBeUndefined();
    expect(prospect.rating).toBeUndefined();
    expect(prospect.primaryType).toBeUndefined();
    expect(prospect.types).toBeUndefined();
    expect(prospect.userRatingCount).toBeUndefined();
  });

  it("filtra negocios cerrados (CLOSED_PERMANENTLY / CLOSED_TEMPORARILY)", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({
        places: [
          {
            displayName: { text: "Cerrado para siempre" },
            formattedAddress: "Calle 1",
            googleMapsUri: "https://maps.google.com/?cid=1",
            businessStatus: "CLOSED_PERMANENTLY",
          },
          {
            displayName: { text: "Cerrado temporalmente" },
            formattedAddress: "Calle 2",
            googleMapsUri: "https://maps.google.com/?cid=2",
            businessStatus: "CLOSED_TEMPORARILY",
          },
          {
            displayName: { text: "Abierto" },
            formattedAddress: "Calle 3",
            googleMapsUri: "https://maps.google.com/?cid=3",
            businessStatus: "OPERATIONAL",
          },
        ],
      })
    );

    const result = await searchProspects({ category: "gimnasios", area: "CABA" });

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Abierto");
  });

  it("una respuesta sin `places` es una búsqueda válida sin resultados (no un error)", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({}));

    const result = await searchProspects({ category: "gimnasios", area: "CABA" });

    expect(result).toEqual([]);
  });

  it("lanza GooglePlacesRequestError con el status de Google si la respuesta no es ok", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ error: { message: "quota exceeded" } }, 429)
    );

    await expect(searchProspects({ category: "gimnasios", area: "CABA" })).rejects.toMatchObject({
      status: 429,
    });
  });

  it("lanza GooglePlacesRequestError (status 0) si fetch rechaza por un error de red", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("network down"));

    const promise = searchProspects({ category: "gimnasios", area: "CABA" });
    await expect(promise).rejects.toBeInstanceOf(GooglePlacesRequestError);
    await expect(promise).rejects.toMatchObject({ status: 0 });
  });
});
