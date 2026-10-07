# AI Marketing Agent — roadmap de arquitectura agentic

Este documento registra, fase por fase, qué se construyó realmente en el roadmap hacia una arquitectura agentic con Tools y MCP. Solo documenta lo que está implementado y verificado (`tsc`, `eslint`, tests) al momento de escribirse — no es una aspiración ni un plan. Cubre las Fases 0 a 8 del roadmap; la Fase 9 (aprobación, dashboard) todavía no está iniciada.

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

## Fase 7 — Calificación de prospectos — IMPLEMENTED

**Objetivo:** priorizar los `Prospect[]` reales que ya devolvió Google Places, explicando por qué cada uno tiene esa prioridad y qué no sabemos de él. No es una probabilidad de conversión, y la UI lo dice explícitamente.

**Dónde vive:** `lib/qualification/qualify-prospects.ts`, con `qualifyProspects(prospects, answers)` como función pura y determinista: sin Claude, sin red, sin `process.env`, sin aleatoriedad. Se invoca desde `app/api/prospects/route.ts` **después** de `runProspectingAgent`, así que el Agent, el Tool, el MCP y Google Places no cambiaron, y siguen vigentes sus garantías (prospectos sin transformar hasta ese punto, grounding de categoría/zona, solo búsquedas `fact`). **Costo de IA adicional: 0 llamadas** (verificado contando requests HTTP a `api.anthropic.com` en un request real: 1, el `ProspectingPlan` ya existente).

**Contrato (`lib/types.ts`):** `QualifiedProspectSchema = ProspectSchema.extend({ qualification })`. La respuesta de `/api/prospects` sigue siendo un array con todos los campos de cada `Prospect` intactos, más `qualification`: `score`, `priority` (`high|medium|low`), `breakdown` por criterio, `evidence[]` (`text`, `source` fact/inference/assumption, `criterion?`, `points`, `basedOn`), `unknowns[]` y `summary`. El schema valida las invariantes: solo una evidencia `fact` puede tener `points > 0`; `score` = suma del `breakdown`; cada criterio del `breakdown` = suma de los puntos de su evidencia.

**Fórmula (máximo 100):**

```
score = relevance (0–30) + location (0–20) + contact (0–20) + completeness (0–15) + signals (0–15)

relevance    = nombre: 2+ términos de businessCategoryToTarget → 20, 1 → 15, 0 → 0
             + primaryType coincide → 10 (los types secundarios no suman)
location     = términos de targetArea en address: todos → 20, algunos → 10, ninguno → 0
contact      = phone → 10 + website → 10
completeness = rating → 5 + userRatingCount → 5 + primaryType → 5
signals      = userRatingCount ≥ 100 → 10, ≥ 20 → 5; + rating ≥ 4.0 con ≥ 20 reseñas → 5

priority: high ≥ 75, medium 50–74, low < 50 (constantes en código)
orden:    score desc → más canales de contacto (phone/website) → orden original de Google
```

"Coincidencia" es siempre textual: minúsculas, sin acentos, sin conectores, plural simple a singular, con tokens iguales o con un prefijo común de al menos 4 letras (`evento` ~ `event`). La de zona se presenta siempre como "coincidencia textual con la zona buscada", nunca como distancia: no hay coordenadas. Por los pesos, un prospecto sin ninguna coincidencia de relevancia suma como máximo 70 y no puede quedar en prioridad alta.

**Fact / inference / assumption:** solo los hechos observables (`Prospect` + `answers`) suman puntos. Las inferencias (por ejemplo, "teléfono y sitio web → más de una vía de contacto") se muestran con 0 puntos y `basedOn` apuntando a los hechos de los que derivan. El calificador no genera supuestos, y un supuesto con puntos no pasa el schema. `unknowns` declara lo que no sabemos: los campos que Google no devolvió más una lista fija (necesidad real, quién decide, presupuesto e intención de compra, tamaño/facturación/clientes, actividad reciente, distancia).

**UI (`ProspectsSection.tsx`):** cada tarjeta muestra "N/100 — Prioridad alta/media/baja", el resumen, hasta 4 señales con badge Hecho/Inferencia y sus puntos, los datos de contacto y un "Qué no sabemos" plegable. Encima de la lista: "El score prioriza prospectos según señales observables disponibles. No representa una probabilidad de conversión." `SourceBadgeRow` se movió de `app/report/page.tsx` a `app/report/components/SourceBadge.tsx` sin cambios para reutilizar el badge.

**Tests:** `lib/qualification/qualify-prospects.test.ts` (score máximo/mínimo, sin teléfono, sin website, datos completos/incompletos, thresholds high/medium/low, inferencias y supuestos sin puntos, determinismo y no mutación, sin claims comerciales, orden y desempates, compatibilidad con `Prospect`). Se ajustó el test (12) de `route.test.ts`: ahora verifica que los campos de `Prospect` llegan intactos y que se agrega `qualification`.

**Validación real (caso pádel, Buenos Aires):** 20 prospectos reales de Google Places, todos con `qualification` válida contra el schema, ordenados, sin claims prohibidos y sin inferencias/supuestos con puntos. Distribución: 19 alta (75–100) y 1 media (Delpa Excursionistas, 55). Después de la corrección de `types` secundarios, "Pasaje Del Sol" (primaryType `service`) pasó de 75 (alta) a 70 (media). Verificado también en la UI real (Chrome).

## Fase 8 — Mensajes comerciales personalizados — COMPLETA

**Qué genera:** un borrador de mensaje de primer contacto, en formato WhatsApp (corto, conversacional, con CTA de baja fricción), para UN prospecto calificado. **No envía nada:** no hay integración con WhatsApp, email ni ningún canal; el usuario lo revisa y lo copia. `channel: "whatsapp"` describe solo el formato.

**Componentes:** `lib/agent/sales-message-agent.ts` (Sales Message Agent, `server-only`), `POST /api/sales-message` (`app/api/sales-message/route.ts`), `SalesMessagePanel` en cada tarjeta de `ProspectsSection`, y el contrato en `lib/types.ts`: `SalesMessageDraftSchema` (lo que devuelve Claude) y `SalesMessageSchema` (resultado estricto: `prospectId`, `channel`, `message`, `cta`, `claims`, `unknowns`). `prospectId` es el `mapsUrl` de Google: el proyecto no tenía un id de prospecto y no se inventó uno.

**Bajo demanda, una llamada a Claude por generación:** nada se genera al cargar el reporte ni para todos los prospectos; cada click en "Generar mensaje" es exactamente una llamada a Claude (verificado contando requests HTTP a `api.anthropic.com`: 1, y 0 a Google), sin reintentos automáticos, sin polling, con el botón oculto mientras hay una generación en curso. Si el mensaje no pasa la validación, el endpoint responde 502 y el usuario decide si vuelve a generar.

**Contexto que recibe Claude** (armado por código, cada dato con un id citable):
- `prospect.*`: campos del `Prospect` real que existan (name, address, phone, website, rating, userRatingCount, primaryType, types, mapsUrl), todos `fact`.
- `answers.*`: offering, problem, businessType, idealCustomerDescription, businessCategoryToTarget, targetArea, priceRange (si existen). `knownCompetitors`, `mainGoal` y `hasCustomersToday` quedan afuera: son información interna del usuario.
- `strategy.*`: `valueProposition`, `idealCustomerProfile` y `problemOrNeed`, **sin los supuestos**. Canales, estrategia inicial y próxima acción no entran: son planes internos.
- `qualification.evidence.*` (sin supuestos), más score/prioridad solo como contexto de tono (no citable, nunca como probabilidad) y `unknowns` como lista de lo que está prohibido afirmar.
- La `qualification` la recalcula el servidor con `qualifyProspect`: Claude nunca ve evidencia que haya mandado el cliente.

**Anti-hallucination en código (no solo prompt):** Claude devuelve, junto al mensaje, cada afirmación con el fragmento literal y los ids que la respaldan. `validateSalesMessageDraft` rechaza el mensaje entero si:
- cita un id inexistente o un supuesto;
- afirma algo del prospecto (`about: "prospect"`) sin un hecho real del `Prospect` o evidencia `fact` de su qualification;
- el fragmento citado o el CTA no aparecen literalmente en el mensaje, o el CTA no es pregunta;
- contiene números (en cifras) que no están en los datos, o cantidades escritas en palabras ("en dos minutos");
- contiene porcentajes, garantías, urgencia, "probabilidad" o menciones al score;
- le atribuye al prospecto necesidades, búsquedas o problemas ("vi que necesitan", "están buscando", "tienen problemas");
- menciona herramientas o procesos que el producto "reemplazaría" (planillas, papel, mensajes sueltos, grupos de WhatsApp, "a mano"), afirma tracción del producto ("estamos sumando clubes", "ya lo usan") o dice haber visitado el sitio/redes/reseñas del prospecto.

**Provenance:** la procedencia de cada claim la deriva el código a partir de lo citado (`fact` si todo lo citado es hecho, `inference` si cita alguna inferencia; nunca `assumption`), no la declara Claude. La UI muestra cada claim con su badge y los ids en los que se basa.

**Validación real (caso pádel, Buenos Aires; Claude + MCP + Google Places reales):** se generaron mensajes para 3 prospectos reales (AVANT CLUB Gym & Padel 100/alta, Quality Padel Club y Pilates 90/alta, Pasaje Del Sol 70/media) y uno más desde la UI (First Pádel Center), revisando cada afirmación contra su fuente. Las primeras rondas detectaron afirmaciones sin respaldo suficiente que el validador todavía no cubría ("sin planillas ni mensajes sueltos" —un supuesto de la estrategia que entraba vía una inferencia—, "estamos sumando clubes", "en dos minutos", "entré al sitio"); cada caso se corrigió en el prompt y en el validador, con un test de regresión, y se regeneró hasta que todas las afirmaciones quedaron respaldadas.

**Fuera de alcance (Fase 9, no implementada):** aprobación/rechazo persistente, edición persistente, historial, estados de campaña, CRM, dashboard, tracking y envío.

## Qué responsabilidad tiene cada capa (estado actual)

- **Claude (LLM reasoning):** propone un `ProspectingPlan` — qué buscar y por qué, distinguiendo `fact`/`inference`/`assumption`. No decide qué se ejecuta finalmente, no ve los prospectos reales antes de que el código responda, no reconstruye nada.
- **Código (`prospecting-agent.ts`):** grounding del plan completo (fuerza valores reales o descarta la búsqueda), política de ejecución (solo `fact` dispara una llamada real), de-duplicado, construcción de la respuesta final directamente desde los resultados reales.
- **Tool (`lib/tools/search-prospects-tool.ts`):** valida el input con Zod y delega la ejecución. Sin lógica de IA, sin saber si la ejecución real es local o vía MCP.
- **MCP (`mcp/prospecting-server/` + `lib/mcp/`):** transporta la invocación de `search_businesses` a través de un límite de proceso real, revalidando en ambos extremos. No conoce reglas de negocio del dominio (grounding, provenance) — esas viven exclusivamente en el Agent.
- **Integración externa (`lib/integrations/google-places.ts`):** única fuente de los datos de un `Prospect`. Nunca inventa campos opcionales ausentes. Sigue siendo el único código que le habla a Google.
- **Calificación (`lib/qualification/`):** prioriza los `Prospect[]` ya obtenidos con reglas deterministas. No llama a Claude ni a Google, no descarta prospectos y no modifica sus campos.
- **Sales Message Agent (`lib/agent/sales-message-agent.ts`):** redacta, bajo demanda y con una llamada a Claude, un mensaje para un prospecto calificado. El código arma el contexto permitido y valida la factualidad del resultado. No envía nada.

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
- La relevancia de la calificación es coincidencia textual, no semántica. Los tipos de Google son identificadores en inglés, así que con una categoría en español solo coinciden palabras o prefijos compartidos (`club`, `event`→`evento`). Un sinónimo ("complejo deportivo" para "club de pádel") no suma. Los `types` secundarios no suman relevancia: en la validación real, `event_venue` (un espacio para eventos) coincidía con "organizadores de eventos" y llevaba a "Pasaje Del Sol" a prioridad alta. Un `primaryType` con una coincidencia de prefijo de ese tipo sí sumaría 10.
- La calificación no usa `businessStatus`: los negocios cerrados ya se excluyen en `google-places.ts`, antes de calificar.
- La validación de factualidad de los mensajes es estructural (ids citados, números, patrones prohibidos): no entiende semántica. Una paráfrasis que exagere un hecho citado correctamente (o una afirmación que Claude no declare como claim) puede pasar, por eso la UI muestra cada claim con su fuente para revisión humana antes de copiar.
- Los mensajes no se envían: no hay integración con WhatsApp ni email.
- No hay aprobación persistente, historial ni dashboard (Fase 9, no iniciada).
