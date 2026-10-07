# AI Prospecting Agent

> Decime qué vendés y a quién querés venderle. Encontramos prospectos reales,
> identificamos cuáles tienen mayor potencial y te preparamos un mensaje
> personalizado para contactarlos.

MVP de un agente de prospección. El usuario no necesita saber nada de agentes,
MCP ni APIs: completa un cuestionario corto y trabaja sobre una lista de
negocios reales, priorizada, con un mensaje listo para revisar y copiar.
**No se envía nada automáticamente.**

## Cómo se usa

1. **¿Qué vendés?** Producto o servicio y el problema que resuelve.
2. **¿A quién querés venderle?** El tipo de negocio a buscar (ej: "clubes de
   pádel") y, opcionalmente, una descripción del cliente ideal.
3. **¿Dónde?** La zona (ej: "Buenos Aires").
4. **Estrategia.** Claude genera cliente ideal, problema, propuesta de valor,
   canales, estrategia inicial y próxima mejor acción. Cada afirmación indica
   si es **hecho** (viene de tus respuestas), **inferencia** o **supuesto**.
5. **¿A quién contactar primero?** "Buscar prospectos" trae negocios reales de
   Google Maps (nombre, dirección, teléfono, sitio web, rating, tipo, link),
   calificados con un score 0–100 y ordenados por prioridad, con las señales
   que lo justifican y lo que no sabemos de cada uno. El score es prioridad de
   prospección, **no** una probabilidad de conversión.
6. **Mensaje.** Por prospecto, a pedido: un borrador de primer contacto en
   formato WhatsApp, basado solo en datos reales, que muestra de dónde sale
   cada afirmación. Se revisa, se edita, se aprueba o se rechaza.
7. **Copiar y contactar.** Solo un mensaje aprobado se puede copiar. Después
   de usarlo, el prospecto se marca como **contactado**.

Cada prospecto tiene una etapa: Nuevo → Revisado → Mensaje generado →
Aprobado → Contactado.

## Arquitectura

```
Cuestionario (app/questionnaire/)  →  sessionStorage
  → /api/marketing-strategy  → Marketing Agent (Claude, Structured Output + Zod)
  → /api/prospects           → Prospecting Agent (Claude propone; el código groundea)
                                → Tool → cliente MCP → servidor MCP (stdio) → Google Places
                              → qualifyProspects (determinista, sin IA)
  → /api/sales-message       → Sales Message Agent (1 llamada a Claude, validación en código)
  → Reporte (app/report/): revisión y etapas en el navegador (lib/review/, lib/workspace/)
```

- `lib/agent/`: agentes (estrategia, plan de prospección, mensajes).
- `lib/tools/`, `lib/mcp/`, `mcp/prospecting-server/`: el tool
  `search_businesses`, expuesto por un servidor MCP propio.
- `lib/integrations/google-places.ts`: único código que habla con Google.
- `lib/qualification/`: score determinista.
- `lib/review/`, `lib/workspace/`: revisión del mensaje y etapas del
  prospecto, como módulos puros (sin red ni IA).
- `lib/types.ts`: contrato de datos (Zod).

**Costos de IA por acción:** generar la estrategia, 1 llamada; buscar
prospectos, 1 llamada (el plan) + Google Places; generar un mensaje, 1
llamada. Calificar, editar, aprobar, rechazar, copiar y cambiar etapas no
llaman a Claude ni a ninguna API. Nada se genera automáticamente para todos
los prospectos.

**Factualidad:** los prospectos son exactamente los que devolvió Google; la
categoría y la zona de búsqueda siempre salen de tus respuestas; el mensaje
solo puede afirmar sobre el prospecto hechos reales, y el código rechaza
números, necesidades, procesos, integraciones, tracción o ubicaciones sin
respaldo. Detalle en [`docs/agent-roadmap.md`](docs/agent-roadmap.md).

## Estado

MVP implementado (fases 0 a 15 de
[`docs/agent-roadmap.md`](docs/agent-roadmap.md)) y validado con Claude, MCP
y Google Places reales por API en dos nichos: plataforma de eventos de pádel
(Buenos Aires) y software de turnos para consultorios odontológicos (Córdoba).
La validación completa de la interfaz en el navegador quedó pendiente (ver
abajo).

### Limitaciones conocidas

- **Sin persistencia:** las respuestas viven en `sessionStorage`; los
  prospectos, la revisión de mensajes y las etapas, en memoria. Se pierden al
  recargar o al buscar de nuevo (la interfaz lo avisa).
- **Validación de factualidad por patrones:** bloquea las clases de invención
  detectadas en validaciones reales, pero no entiende semántica. Por eso la
  aprobación humana es obligatoria y cada afirmación muestra su fuente.
- **Relevancia textual:** la calificación compara texto (nombre y tipo
  principal de Google), no reconoce sinónimos ni mide distancias.
- La prospección necesita el tipo de negocio a buscar.
- Las búsquedas que el plan infiere de la descripción libre del cliente ideal
  no se ejecutan: solo la búsqueda literal.
- El servidor MCP corre con `npx tsx` sobre un `.ts`: funciona con
  `next dev` y `next build`/`next start` desde el repo, pero un build con
  `output: "standalone"` no incluiría sus dependencias.
- En desarrollo, la estrategia se pide dos veces al cargar el reporte
  (StrictMode de React); en producción, una.

### Fuera del MVP

Envío automático (WhatsApp, email), envío masivo, campañas, seguimiento,
CRM, múltiples usuarios, billing, scraping de redes y analytics.

### Próximos pasos

1. Validar la interfaz completa en el navegador (pendiente por falta de
   memoria en el equipo de desarrollo).
2. Decidir la persistencia mínima de prospectos, mensajes y etapas (propuesta:
   `localStorage` del navegador, sin servidor ni dependencias).
3. Más adelante: mensaje aprobado → WhatsApp Business → envío → respuesta →
   seguimiento.

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

## Origen

El proyecto empezó como un laboratorio para aprender Claude Code construyendo
un agente real (Next.js, TypeScript, Claude, Zod, Structured Outputs, Tools y
MCP), fase por fase. El historial de decisiones está en
[`docs/agent-roadmap.md`](docs/agent-roadmap.md).
