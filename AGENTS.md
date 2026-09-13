# Marketing Agent

## 1. Qué es este proyecto

Agente que convierte las respuestas de un cuestionario guiado en una estrategia de marketing inicial (`MarketingStrategy`), generada con Claude. Para detalle de producto y estado del roadmap, ver `README.md`.

## 2. Arquitectura y flujo de datos

```
Wizard (app/questionnaire/)
  → QuestionnaireAnswers             (lib/types.ts)
  → fetch → Route Handler            (app/api/marketing-strategy/route.ts)
  → MarketingAgent                   (lib/agent/marketing-agent.ts)
  → Claude API (Structured Output)
  → Zod (MarketingStrategySchema) valida y tipa la respuesta
  → MarketingStrategy
  → Report                           (app/report/page.tsx)
```

## 3. Límites entre capas

- La UI (`app/questionnaire/`, `app/report/page.tsx`) nunca llama a Claude directamente ni conoce `ANTHROPIC_API_KEY`: siempre pasa por `fetch` al Route Handler.
- El `MarketingAgent` (`lib/agent/marketing-agent.ts`) se invoca únicamente desde `app/api/marketing-strategy/route.ts`.
- `import "server-only"` en `marketing-agent.ts` hace fallar el build si ese módulo se importara desde un Client Component — es la barrera que garantiza que la API key nunca llega al navegador.
- No mezclar lógica de UI, Route Handler y Agent/dominio en un mismo archivo.
- No mover lógica entre capas sin una razón arquitectónica clara.

## 4. Contrato de datos

- `lib/types.ts` es la fuente de verdad del contrato de datos del proyecto.
- `MarketingStrategySchema` (Zod) define el contrato en runtime; `MarketingStrategy` deriva su tipo con `z.infer` — nunca al revés.
- `Claim.source` es `"fact" | "inference" | "assumption"`; `confidence` y `basedOn` son opcionales y aportan procedencia/trazabilidad.
- `nextBestAction` es un objeto único (no un `Claim[]`); su `source` solo admite `"inference" | "assumption"` (nunca `"fact"`).
- `QuestionnaireAnswers` es una `interface` sin schema Zod propio — decisión deliberada, no un olvido.
- Al cambiar este archivo, revisar los consumidores: `lib/agent/marketing-agent.ts` (Structured Output) y `app/report/page.tsx` (renderiza `Claim[]` y `NextBestAction` de forma distinta).

## 5. SYSTEM_PROMPT

Resumen de orientación rápida de las reglas vigentes en el prompt del agente:

- No inventar cifras, porcentajes ni benchmarks de mercado.
- Declarar inconsistencias entre respuestas del usuario en vez de "corregirlas" silenciosamente.
- Respetar literalmente los valores de campos cerrados del cuestionario.
- Distinguir siempre `fact` / `inference` / `assumption` en cada Claim.
- Mantener `nextBestAction` coherente con `initialStrategy` (destilar su primer paso relevante, no inventar uno nuevo).

La fuente normativa de estas reglas es `lib/agent/marketing-agent.ts`; esta sección de AGENTS.md es solamente una guía rápida.

## 6. Convenciones de trabajo

- Ejecutar `npx tsc --noEmit` y `npx eslint .` después de cualquier cambio.
- No agregar dependencias sin justificar por qué hacen falta.
- No usar `any` para silenciar errores de tipos, ni casts inseguros.
- Preferir cambios mínimos y locales sobre refactors amplios.
- No modificar archivos que no estén relacionados con la tarea pedida.
- Antes de crear una abstracción nueva, verificar si ya hace falta o si algo existente alcanza.

## 7. Variables de entorno

- `ANTHROPIC_API_KEY`: obligatoria, debe existir en `.env.local` (nunca commiteado).
- Nunca debe exponerse al cliente ni llevar el prefijo `NEXT_PUBLIC_`.
- No incluir valores reales de secrets en este archivo, en `README.md`, en código ni en logs.

---

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
