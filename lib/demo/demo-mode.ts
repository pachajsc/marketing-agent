// Modo demo (AI_MODE=demo): probar la app sin gastar. Los agentes devuelven
// respuestas REALES ya grabadas (data/demo/fixture.json: estrategia de Claude,
// prospectos de Google Places y mensajes de Claude del caso pádel) en vez de
// llamar a Claude o a Google. La interfaz lo avisa con una franja visible
// (components/DemoBanner.tsx): nunca se presenta como resultado del negocio
// del usuario.
//
// El archivo vive en data/ (ignorado por git): los datos de Google Places no
// se guardan en el repositorio.
import "server-only";

import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { MarketingStrategySchema, ProspectSchema, SalesMessageDraftSchema } from "@/lib/types";

const DemoFixtureSchema = z.object({
  description: z.string().optional(),
  recordedAt: z.string().optional(),
  strategy: MarketingStrategySchema,
  prospects: z.array(ProspectSchema).min(1),
  /** Mensajes grabados, por mapsUrl del prospecto. */
  messages: z.record(z.string(), SalesMessageDraftSchema),
});
export type DemoFixture = z.infer<typeof DemoFixtureSchema>;

export function isDemoMode(): boolean {
  return process.env.AI_MODE === "demo";
}

function fixturePath(): string {
  return process.env.DEMO_FIXTURE_PATH ?? path.join(process.cwd(), "data", "demo", "fixture.json");
}

let cached: DemoFixture | null = null;

/** Carga y valida las respuestas grabadas. Falla con un mensaje claro si no existen. */
export function loadDemoFixture(): DemoFixture {
  if (cached) return cached;
  const file = fixturePath();
  // El archivo demo es local (data/ no se despliega): se excluye del rastreo de archivos del build.
  if (!fs.existsSync(/*turbopackIgnore: true*/ file)) {
    throw new Error(`Modo demo activo pero no existe ${file}. Desactivá AI_MODE=demo o creá el archivo de respuestas grabadas.`);
  }
  cached = DemoFixtureSchema.parse(JSON.parse(fs.readFileSync(/*turbopackIgnore: true*/ file, "utf8")));
  return cached;
}

/**
 * Simula la espera de una respuesta real, corta, para que los estados de
 * carga se vean al probar. DEMO_DELAY_MS la ajusta (0 en tests).
 */
export function demoDelay(ms = 600): Promise<void> {
  const override = process.env.DEMO_DELAY_MS;
  const delay = override !== undefined ? Number(override) : ms;
  return new Promise((resolve) => setTimeout(resolve, delay));
}
