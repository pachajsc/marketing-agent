# AI Marketing Agent — roadmap de arquitectura agentic

Este documento registra, fase por fase, qué se construyó realmente en el roadmap hacia una arquitectura agentic con Tools y MCP. Solo documenta lo que está implementado y verificado (`tsc`, `eslint`, tests) al momento de escribirse — no es una aspiración ni un plan. Cubre las Fases 0 a 6 del roadmap; las Fases 7-9 (Qualification, mensajes de venta, dashboard) todavía no están iniciadas.

## Fase 0 — Auditoría

Estado relevado antes de tocar código: ver historial de commits para el detalle completo. En resumen, existía un `ProspectingAgent` con tool_use real (primer ejemplo de Agent+Tool del proyecto), pero con una decisión trivial ("¿llamo a `search_prospects`?") y una segunda llamada a Claude que reconstruía el resultado final en vez de devolver los datos reales del tool sin tocarlos. No existía ningún MCP ni ningún test runner.

## Fase 1 — Estabilizar Prospecting

### 1.1 Grounding de entrada

`category`/`area` en la llamada al tool dependían enteramente de que Claude respetara una instrucción de prompt. Se corrigió recalculando ambos valores siempre desde `answers` en el propio código, nunca desde lo que Claude proponía — ver evolución completa de este mecanismo en la Fase 3 más abajo (el `tool_use` original fue reemplazado por un plan validado).

### 1.2 Grounding de salida

Se eliminó la segunda llamada a Claude que reconstruía el resultado final a partir del `tool_result`. El array final pasó a construirse directamente en código a partir de lo que devolvía la búsqueda real — misma referencia, sin serializar/deserializar ni volver a pasar por el modelo.

### 1.3 Validación del endpoint

`app/api/prospects/route.ts` validaba `answers` solo con `typeof === "object"`, lo que permitía un `{"answers": {}}` que explotaba más abajo con un 500. Se agregó `ProspectingAnswersSchema` (Zod, local a `route.ts`) que valida los campos que `ProspectingAgent` efectivamente lee.

## Fase 2 — Testing

Se incorporó **Vitest** como test runner (soporte nativo de TS/ESM, encaja con `moduleResolution: "bundler"` del proyecto, sin necesitar Babel/ts-jest). Se agregó `@types/node@^24` (antes `^20`) para poder usar `vitest@5` sin una vulnerabilidad moderada conocida en versiones anteriores del paquete — bump de tipos puro, sin efecto en runtime.

Toda la suite corre con Google Places y Anthropic mockeados — **cero llamadas de red reales a servicios externos** — con una única excepción documentada en la Fase 6.

## Fase 3 — Redefinir el Agent (`ProspectingPlan`)

**Problema:** la única decisión real del Agent era un booleano ("¿llamo al tool o no?"), ya resuelto por código antes de llegar a Claude — no aportaba razonamiento real.

**Cambio de mecanismo:** se reemplazó `tool_use`/`tool_result` por Structured Output puro. `runProspectingAgent` (`lib/agent/prospecting-agent.ts`) ahora le pide a Claude un `ProspectingPlan` (`lib/types.ts`): una lista de `ProspectingSearch` (`category`, `area`, `limit?`, `source: fact|inference|assumption`, `basedOnField`, `rationale`) más un `rationale` general. Claude ya no ejecuta nada directamente — solo propone.

**Grounding del plan (`groundProspectingSearch`):** cada búsqueda propuesta se recalcula contra `answers` según su `basedOnField` (cerrado a dos valores por un enum Zod: `"businessCategoryToTarget+targetArea"` e `"idealCustomerDescription"` — deliberadamente **sin** `knownCompetitors`, porque un competidor no es un cliente potencial). Reglas de código, no de prompt:
- `"businessCategoryToTarget+targetArea"` solo puede sustentar `source: "fact"`, y fuerza `category`/`area` a los valores literales de `answers` — si Claude propuso otros, se descartan.
- `"idealCustomerDescription"` nunca puede sustentar `source: "fact"` (es interpretación de texto libre); su `area` también se fuerza siempre a `targetArea`, nunca se infiere.
- Si el dato de respaldo no está presente, la búsqueda se descarta enteramente — nunca se ejecuta con datos parcialmente inventados.

**Política de ejecución:** de las búsquedas groundeadas, solo las de `source: "fact"` disparan una búsqueda real (`EXECUTABLE_SOURCES` en el código) — mismo comportamiento por default que existía antes de esta fase. Las `inference`/`assumption` quedan groundeadas pero no se ejecutan automáticamente contra Google Places (evita gastar cuota real en una interpretación de texto libre sin revisión humana — esa revisión es trabajo de una fase futura de dashboard, no de este Agent). Búsquedas groundeadas que colapsan al mismo `category`+`area` se de-duplican antes de ejecutarse.

## Fase 4 — Separación Agent / Tools / Integrations

Reorganización mecánica de carpetas (sin cambiar lógica), con `git mv` para preservar historial:

```
lib/prospecting/google-places.ts   → lib/integrations/google-places.ts
lib/prospecting/types.ts           → lib/tools/search-prospects-types.ts
lib/agent/tools/search-prospects-tool.ts → lib/tools/search-prospects-tool.ts
```

`lib/agent/` contiene únicamente reasoning; `lib/tools/` son las capabilities que un Agent puede invocar; `lib/integrations/` son los conectores reales contra servicios externos. Esta separación es lo que permitió, en la Fase 6, reemplazar la implementación de `runSearchProspectsTool` (de "llama a Google Places directo" a "le habla a un servidor MCP") **sin tocar una sola línea de `prospecting-agent.ts`**.

## Fase 5 — Preparar MCP (evaluación)

MCP se justifica cuando una capability tiene más de un consumidor real y no se quiere duplicar su lógica entre ellos. Hoy `search_businesses` tiene un solo consumidor (este mismo Agent), así que MCP no resuelve un problema de producto urgente — se decidió construirlo igual, explícitamente por su valor de aprendizaje (arquitectura Host/Client/Server, stdio transport), no como palabra de moda. Esta decisión y su costo real (latencia de un subproceso, nueva superficie de falla) se planteó al usuario antes de wirearlo al request path en vivo, quien confirmó proceder.

Mapeo Host/Client/Server:
```
Host   = el backend Next.js (donde vive prospecting-agent.ts)
Client = lib/mcp/prospecting-mcp-client.ts (Client de @modelcontextprotocol/sdk)
Server = mcp/prospecting-server/server.ts (proceso Node standalone, stdio)
```

## Fase 6 — Primer MCP

**Servidor** (`mcp/prospecting-server/server.ts`): expone un único tool, `search_businesses`, vía `McpServer.registerTool`. `inputSchema`/`outputSchema` reutilizan directamente `SearchProspectsInputSchema` y `ProspectingResultSchema` (no se duplica ningún schema). El handler llama a `searchProspects()` (`lib/integrations/google-places.ts`) — el servidor no importa nada de Anthropic ni conoce ninguna regla de negocio del dominio (grounding, fact/inference/assumption): esas responsabilidades siguen del lado del Host. Corre vía `npx tsx` (dependencia agregada: `tsx`, necesaria para ejecutar TypeScript directamente sin paso de build separado; se agregó como dependency, no devDependency, porque ahora se invoca en el request path en producción) y se comunica por stdio, no por HTTP.

**Cliente** (`lib/mcp/prospecting-mcp-client.ts`, dependencia agregada: `@modelcontextprotocol/sdk`): conexión singleton lazy (un subproceso por proceso del servidor Next.js, reutilizado entre requests, reconectado si se cae). `searchBusinessesViaMcp()` es la única función que sabe que la capability cruza un proceso; para el resto del código se ve como cualquier función async. El `structuredContent` que vuelve del proceso hijo se re-valida con `ProspectingResultSchema.safeParse` antes de confiar en él — **MCP no es una vía para saltarse validaciones**: cruzar un límite de proceso no exime del mismo principio de grounding que rige el resto del proyecto.

**Preservación de la clasificación de errores:** antes de MCP, `route.ts` distinguía `GooglePlacesConfigError`/`GooglePlacesRequestError` (para devolver 500/429/502 apropiados). Una excepción tipada no cruza un límite de proceso tal cual, así que el servidor serializa la clasificación como JSON (`{kind: "config"|"request"|"unexpected", message, status?}`) en el resultado de error del tool, y el cliente la reconstruye como `McpProspectingConfigError`/`McpProspectingRequestError` (validado con Zod, no duck-typing). `route.ts` ahora catchea estas últimas — la distinción 500/429/502 se preserva exactamente igual que antes de que existiera el servidor MCP.

**Wireo al request path real:** `lib/tools/search-prospects-tool.ts` (el Tool que el Agent invoca) fue actualizado para llamar a `searchBusinessesViaMcp()` en vez de a `searchProspects()` directamente — el cambio real es:

```
Agent (prospecting-agent.ts)
  → Tool (search-prospects-tool.ts) — valida con SearchProspectsInputSchema
    → Cliente MCP (prospecting-mcp-client.ts) — spawnea/reusa el proceso hijo
      → [límite de proceso, stdio]
      → Servidor MCP (mcp/prospecting-server/server.ts) — valida de nuevo con el mismo schema
        → google-places.ts (searchProspects) → Google Places API real
      ← Prospect[] real, o payload de error clasificado
    ← Prospect[] revalidado con ProspectingResultSchema, o McpProspecting*Error
  ← Prospect[] (misma referencia, sin transformar)
← { prospects }
```

**Testing (sin llamadas reales a Google ni Anthropic):** `lib/mcp/prospecting-mcp-client.test.ts` es la única excepción documentada a "todo mockeado" — es un test de integración real que spawnea el proceso MCP de verdad (vía `npx tsx`) y le habla con un Client real, verificando `tools/list` y el camino de error de configuración (sin `GOOGLE_MAPS_API_KEY`, que nunca llega a tocar la red). No viola la regla de "no llamadas a servicios externos": no se llama a Google Places ni a Anthropic, solo se prueba que el protocolo MCP en sí funciona de punta a punta entre dos procesos propios. `lib/mcp/prospecting-mcp-client.unit.test.ts` cubre la lógica de reconstrucción de errores y validación de `structuredContent` con el SDK de MCP mockeado (sin subproceso).

## Qué responsabilidad tiene cada capa (estado actual)

- **Claude (LLM reasoning):** propone un `ProspectingPlan` — qué buscar y por qué, distinguiendo `fact`/`inference`/`assumption`. No decide qué se ejecuta finalmente, no ve los prospectos reales antes de que el código responda, no reconstruye nada.
- **Código (`prospecting-agent.ts`):** grounding del plan completo (fuerza valores reales o descarta la búsqueda), política de ejecución (solo `fact` dispara una llamada real), de-duplicado, construcción de la respuesta final directamente desde los resultados reales.
- **Tool (`lib/tools/search-prospects-tool.ts`):** valida el input con Zod y delega la ejecución. Sin lógica de IA, sin saber si la ejecución real es local o vía MCP.
- **MCP (`mcp/prospecting-server/` + `lib/mcp/`):** transporta la invocación de `search_businesses` a través de un límite de proceso real, revalidando en ambos extremos. No conoce reglas de negocio del dominio (grounding, provenance) — esas viven exclusivamente en el Agent.
- **Integración externa (`lib/integrations/google-places.ts`):** única fuente de los datos de un `Prospect`. Nunca inventa campos opcionales ausentes. Sigue siendo el único código que le habla a Google.

## Garantías actuales

- Los prospectos que llegan al cliente son exactamente los que devolvió Google Places — verificado por test de identidad referencial en la capa Tool, y por revalidación Zod explícita al cruzar el límite de proceso MCP.
- `category`/`area` de cada búsqueda ejecutada siempre son datos reales de `answers`, nunca los que proponga el modelo — verificado con casos adversariales explícitos (Claude proponiendo valores inventados, o `source: "fact"` sobre un `basedOnField` que no lo permite).
- Ninguna búsqueda basada en interpretación de texto libre (`idealCustomerDescription`) se ejecuta automáticamente contra Google Places.
- Un body malformado al endpoint no puede tumbar el proceso con un 500 evitable.
- La distinción de errores (config/rate-limit/request/inesperado) se preserva de punta a punta aunque la ejecución real ahora cruce un proceso separado.

## Limitaciones que quedan

- El plan de Claude puede proponer como máximo dos ángulos de búsqueda (el literal y uno inferido de `idealCustomerDescription`) — no hay research de mercado, análisis de competencia, ni variaciones geográficas.
- Las búsquedas `inference`/`assumption` quedan groundeadas pero nunca llegan a ejecutarse: no existe todavía ningún mecanismo (UI/dashboard) para que un humano las revise y apruebe.
- El servidor MCP se spawnea vía `npx tsx` apuntando a un archivo `.ts` fuente — en un deploy de producción que podara agresivamente el árbol de archivos (ej. Next.js `output: "standalone"`), ese archivo y sus dependencias (`lib/integrations/`, `lib/tools/`, `lib/types.ts`) podrían no incluirse, porque Next.js no rastrea un `child_process.spawn` como una dependencia real. No se resolvió en este roadmap — es un riesgo operacional conocido, no bloqueante para este proyecto en su estado actual (sin ese modo de build configurado).
- No hay qualification, mensajes de venta ni dashboard conectado (Fases 7-9, no iniciadas).
