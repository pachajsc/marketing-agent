import { describe, expect, it } from "vitest";
import { SearchProspectsInputSchema } from "./search-prospects-types";

describe("SearchProspectsInputSchema", () => {
  it("acepta category y area válidas sin limit", () => {
    const result = SearchProspectsInputSchema.safeParse({
      category: "clubes de padel",
      area: "Ciudad de Buenos Aires",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        category: "clubes de padel",
        area: "Ciudad de Buenos Aires",
      });
    }
  });

  it("acepta un limit dentro de rango (1-20)", () => {
    const result = SearchProspectsInputSchema.safeParse({
      category: "gimnasios",
      area: "Rosario",
      limit: 10,
    });

    expect(result.success).toBe(true);
  });

  it("recorta espacios en category y area", () => {
    const result = SearchProspectsInputSchema.safeParse({
      category: "  clubes de padel  ",
      area: "  CABA  ",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.category).toBe("clubes de padel");
      expect(result.data.area).toBe("CABA");
    }
  });

  it("rechaza category vacía", () => {
    const result = SearchProspectsInputSchema.safeParse({
      category: "",
      area: "CABA",
    });

    expect(result.success).toBe(false);
  });

  it("rechaza area vacía", () => {
    const result = SearchProspectsInputSchema.safeParse({
      category: "gimnasios",
      area: "   ",
    });

    expect(result.success).toBe(false);
  });

  it("rechaza limit fuera de rango (0, negativo, > 20, no entero)", () => {
    for (const limit of [0, -1, 21, 1.5]) {
      const result = SearchProspectsInputSchema.safeParse({
        category: "gimnasios",
        area: "CABA",
        limit,
      });
      expect(result.success, `limit=${limit} debería ser inválido`).toBe(false);
    }
  });

  it("rechaza cuando falta category o area", () => {
    expect(SearchProspectsInputSchema.safeParse({ area: "CABA" }).success).toBe(false);
    expect(SearchProspectsInputSchema.safeParse({ category: "gimnasios" }).success).toBe(false);
  });
});
