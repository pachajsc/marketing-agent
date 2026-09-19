// Cobertura unitaria (mockeada) de prospecting-mcp-client.ts: la conexión
// real vía stdio ya está probada en prospecting-mcp-client.test.ts
// (integración real, sin red externa). Acá se aísla la lógica de esta
// capa — reconstrucción de errores tipados y validación del
// structuredContent — sin spawnear ningún proceso.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCallTool = vi.fn();
const mockConnect = vi.fn().mockResolvedValue(undefined);
const mockClose = vi.fn().mockResolvedValue(undefined);

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: vi.fn(function MockClient() {
    return { callTool: mockCallTool, connect: mockConnect, close: mockClose };
  }),
}));

vi.mock("@modelcontextprotocol/sdk/client/stdio.js", () => ({
  StdioClientTransport: vi.fn(function MockStdioClientTransport() {
    return { onclose: undefined };
  }),
  getDefaultEnvironment: () => ({}),
}));

const {
  searchBusinessesViaMcp,
  closeProspectingMcpClient,
  McpProspectingConfigError,
  McpProspectingRequestError,
} = await import("./prospecting-mcp-client");

const validInput = { category: "clubes de padel", area: "Ciudad de Buenos Aires" };

describe("searchBusinessesViaMcp", () => {
  beforeEach(async () => {
    mockCallTool.mockReset();
    await closeProspectingMcpClient();
  });

  it("devuelve los prospects cuando structuredContent es válido", async () => {
    mockCallTool.mockResolvedValueOnce({
      structuredContent: {
        prospects: [
          { name: "Club Norte", address: "Calle 1, CABA", mapsUrl: "https://maps.google.com/?cid=1" },
        ],
      },
    });

    const result = await searchBusinessesViaMcp(validInput);

    expect(result).toEqual([
      { name: "Club Norte", address: "Calle 1, CABA", mapsUrl: "https://maps.google.com/?cid=1" },
    ]);
  });

  it("lanza un error si structuredContent no tiene la forma esperada (no confía ciegamente en el proceso hijo)", async () => {
    mockCallTool.mockResolvedValueOnce({ structuredContent: { prospects: "no es un array" } });

    await expect(searchBusinessesViaMcp(validInput)).rejects.toThrow(/forma inesperada/i);
  });

  it("reconstruye McpProspectingConfigError desde un payload kind='config'", async () => {
    mockCallTool.mockResolvedValueOnce({
      isError: true,
      content: [{ type: "text", text: JSON.stringify({ kind: "config", message: "sin API key" }) }],
    });

    await expect(searchBusinessesViaMcp(validInput)).rejects.toBeInstanceOf(McpProspectingConfigError);
  });

  it("reconstruye McpProspectingRequestError con status desde un payload kind='request'", async () => {
    mockCallTool.mockResolvedValueOnce({
      isError: true,
      content: [{ type: "text", text: JSON.stringify({ kind: "request", message: "rate limited", status: 429 }) }],
    });

    const promise = searchBusinessesViaMcp(validInput);
    await expect(promise).rejects.toBeInstanceOf(McpProspectingRequestError);
    await expect(promise).rejects.toMatchObject({ status: 429 });
  });

  it("cae a un Error genérico si el texto de error no es JSON parseable", async () => {
    mockCallTool.mockResolvedValueOnce({
      isError: true,
      content: [{ type: "text", text: "un error inesperado, no json" }],
    });

    await expect(searchBusinessesViaMcp(validInput)).rejects.toThrow("un error inesperado, no json");
  });
});
