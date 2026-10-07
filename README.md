# Marketing Agent

Agente que, a partir de un producto o servicio que querés vender, identifica tu
público objetivo y te dice dónde y cómo encontrar clientes potenciales.

El flujo es un **cuestionario guiado** (no un chat abierto). Con tus
respuestas, el sistema genera una estrategia de marketing inicial con Claude:

- perfil del cliente ideal
- problema/necesidad que tiene
- propuesta de valor
- canales de adquisición recomendados
- estrategia inicial de captación
- próxima mejor acción

Cada afirmación de la estrategia indica de dónde sale: **hecho** (viene de tus
respuestas), **inferencia** (conclusión razonable) o **supuesto** (hipótesis a
validar).

El primer canal de adquisición integrado es **Google Maps**: busca negocios
reales que coincidan con la categoría de cliente dentro de tu zona, y devuelve
información útil para prospectarlos (nombre, dirección, teléfono, sitio web,
rating, link a Google Maps). Cada prospecto llega **calificado y ordenado por
prioridad** (score 0–100), con las señales observables que lo justifican y lo
que no sabemos de él. El score es prioridad de prospección, no una
probabilidad de conversión.

Para cada prospecto podés generar, a pedido, un **borrador de mensaje de
primer contacto** (formato WhatsApp) para copiar. El mensaje solo usa datos
reales del prospecto, tus respuestas y la estrategia, y muestra de dónde sale
cada afirmación. **No se envía nada**: no hay integración con WhatsApp ni email.

## Por qué existe este README paso a paso

Este proyecto también es un **laboratorio para aprender Claude Code**. Se
construye de forma incremental: cada paso se implementa, se corre y se
verifica antes de pasar al siguiente. Este README se va actualizando para
reflejar en qué paso está el proyecto.

## Estado actual

- [x] **Cuestionario guiado** (`app/questionnaire/`): wizard de 4 pasos con
  barra de progreso y resumen editable. Las preguntas se definen como datos en
  `lib/questionnaire-schema.ts`.
- [x] **Estrategia de marketing con IA** (`app/api/marketing-strategy` →
  `lib/agent/marketing-agent.ts`): Claude devuelve una `MarketingStrategy`
  como Structured Output, validada con Zod (`lib/types.ts`).
- [x] **Reporte** (`app/report/page.tsx`): muestra la estrategia, distinguiendo
  hecho / inferencia / supuesto y la próxima mejor acción.
- [x] **Prospección** (`app/api/prospects` → `lib/agent/prospecting-agent.ts`):
  Claude propone un `ProspectingPlan`; el código fuerza categoría y zona a los
  valores literales del cuestionario y solo ejecuta las búsquedas `fact`. La
  búsqueda se dispara manualmente desde el reporte (botón "Buscar prospectos").
- [x] **MCP**: la búsqueda cruza un límite de proceso real. Un servidor MCP
  standalone (`mcp/prospecting-server/server.ts`, stdio) expone el tool
  `search_businesses`; el cliente (`lib/mcp/prospecting-mcp-client.ts`) lo
  levanta y reutiliza. Los parámetros y resultados se validan en ambos lados.
- [x] **Google Places integrado** (`lib/integrations/google-places.ts`): Text
  Search (New), excluye negocios cerrados y nunca completa campos que Google
  no devolvió.
- [x] **Calificación de prospectos** (`lib/qualification/qualify-prospects.ts`):
  función pura y determinista, sin Claude ni llamadas externas, que se ejecuta
  después de obtener los prospectos reales. Score 0–100 = relevancia (30) +
  zona (20) + contacto (20) + completitud (15) + señales (15), con prioridad
  alta (≥75), media (50–74) o baja (<50). Solo los hechos observables suman
  puntos. Detalle de la fórmula en `docs/agent-roadmap.md`, Fase 7.
- [x] **Mensajes comerciales** (`lib/agent/sales-message-agent.ts`,
  `app/api/sales-message`): bajo demanda, una llamada a Claude por mensaje.
  El código valida que cada afirmación cite datos reales y rechaza números,
  necesidades o promesas sin respaldo. Detalle en `docs/agent-roadmap.md`,
  Fase 8.
- [x] **Tests** (Vitest): suite con Google Places y Anthropic mockeados, más un
  test de integración que levanta el servidor MCP real (sin llamar a Google).

### Roadmap

El detalle de cada fase, con sus decisiones y garantías, está en
[`docs/agent-roadmap.md`](docs/agent-roadmap.md) (fuente de verdad).

| Fase | Contenido | Estado |
| --- | --- | --- |
| 0 | Auditoría | ✅ |
| 1 | Estabilizar Prospecting (grounding de entrada/salida, validación del endpoint) | ✅ |
| 2 | Testing con Vitest | ✅ |
| 3 | `ProspectingPlan` + grounding + política de ejecución (solo `fact`) | ✅ |
| 4 | Separación Agent / Tools / Integrations | ✅ |
| 5 | Evaluación de MCP | ✅ |
| 6 | Primer MCP (`search_businesses`) en el request path real | ✅ |
| 7 | Calificación de prospectos (scoring determinista, sin IA) | ✅ |
| 8 | Mensajes comerciales personalizados (borrador, sin envío) | ✅ |
| 9 | Dashboard | ⏳ no iniciada |

### Limitaciones conocidas

- Las búsquedas `inference`/`assumption` del plan se groundean pero no se
  ejecutan: todavía no hay UI para que una persona las revise y apruebe.
- La prospección necesita `businessCategoryToTarget`; sin ese dato no hay
  búsqueda.
- La relevancia de la calificación es coincidencia textual (nombre y tipo
  principal de Google; los tipos secundarios no suman), no semántica: no reconoce sinónimos, y la zona se compara como
  texto contra la dirección, sin medir distancia.
- Sin persistencia: las respuestas viven en `sessionStorage` del navegador.
- El servidor MCP se ejecuta con `npx tsx` sobre un archivo `.ts`. Hoy funciona
  con `next dev` y `next build`/`next start` desde el repo, pero un build con
  `output: "standalone"` no incluiría sus dependencias (`tsx`, `lib/` en `.ts`,
  `tsconfig.json`), así que habría que resolverlo antes de un deploy así.
- Otros canales de adquisición, outreach automatizado y base de datos quedan
  fuera de alcance por ahora.

## Requisitos

- Node.js 20+
- `.env.local` (nunca se commitea) con:
  - `ANTHROPIC_API_KEY`: para la estrategia, el plan de prospección y los mensajes.
  - `GOOGLE_MAPS_API_KEY`: con la Places API (New) habilitada en Google Cloud
    (requiere billing activo).

Ninguna de las dos debe llevar el prefijo `NEXT_PUBLIC_`: se usan solo del
lado del servidor.

## Cómo correrlo

```bash
npm install
npm run dev
```

Abrí http://localhost:3000.

## Verificación

```bash
npx tsc --noEmit
npm run lint
npm test
npm run build
```
