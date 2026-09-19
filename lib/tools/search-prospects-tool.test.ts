import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prospect } from "@/lib/types";

const mockSearchBusinessesViaMcp = vi.fn();

vi.mock("@/lib/mcp/prospecting-mcp-client", () => ({
  searchBusinessesViaMcp: mockSearchBusinessesViaMcp,
}));

// Import dinámico (no estático): un `import` estático se resuelve antes que
// cualquier `const` de nivel superior de este archivo, aunque esté escrito
// después — eso dejaría a `mockSearchBusinessesViaMcp` en TDZ cuando el
// factory de vi.mock la referencia. El dinámico corre en el orden textual real.
const { runSearchProspectsTool } = await import("./search-prospects-tool");

const mockProspect: Prospect = {
  name: "Club de Padel Norte",
  address: "Av. Siempre Viva 123, CABA",
  mapsUrl: "https://maps.google.com/?cid=123",
};

describe("runSearchProspectsTool", () => {
  beforeEach(() => {
    mockSearchBusinessesViaMcp.mockReset();
  });

  it("rechaza un input inválido sin llamar al cliente MCP", async () => {
    await expect(runSearchProspectsTool({ area: "CABA" })).rejects.toThrow(
      /input inválido/i
    );
    expect(mockSearchBusinessesViaMcp).not.toHaveBeenCalled();
  });

  it("rechaza un input que no es un objeto", async () => {
    await expect(runSearchProspectsTool("clubes de padel")).rejects.toThrow();
    expect(mockSearchBusinessesViaMcp).not.toHaveBeenCalled();
  });

  it("con un input válido, delega en searchBusinessesViaMcp con los datos parseados", async () => {
    mockSearchBusinessesViaMcp.mockResolvedValueOnce([mockProspect]);

    const result = await runSearchProspectsTool({
      category: "  clubes de padel  ",
      area: "  Ciudad de Buenos Aires  ",
    });

    expect(mockSearchBusinessesViaMcp).toHaveBeenCalledTimes(1);
    expect(mockSearchBusinessesViaMcp).toHaveBeenCalledWith({
      category: "clubes de padel",
      area: "Ciudad de Buenos Aires",
    });
    expect(result).toEqual([mockProspect]);
  });

  it("devuelve exactamente lo que resuelve searchBusinessesViaMcp, sin transformarlo", async () => {
    const prospects: Prospect[] = [mockProspect];
    mockSearchBusinessesViaMcp.mockResolvedValueOnce(prospects);

    const result = await runSearchProspectsTool({ category: "gimnasios", area: "Rosario" });

    // Misma referencia, no una copia/reconstrucción.
    expect(result).toBe(prospects);
  });

  it("propaga los errores que lance searchBusinessesViaMcp (ej. McpProspectingConfigError/RequestError) sin ocultarlos", async () => {
    const mcpError = new Error("El servidor MCP respondió con un error.");
    mockSearchBusinessesViaMcp.mockRejectedValueOnce(mcpError);

    await expect(
      runSearchProspectsTool({ category: "gimnasios", area: "Rosario" })
    ).rejects.toBe(mcpError);
  });
});
