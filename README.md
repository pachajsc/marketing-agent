# Marketing Agent

Agente que, a partir de un producto o servicio que querés vender, identifica tu
público objetivo y te dice dónde y cómo encontrar clientes potenciales.

El flujo es un **cuestionario guiado** (no un chat abierto). Con tus
respuestas, el sistema genera:

- perfil del cliente ideal
- problema/necesidad que tiene
- propuesta de valor
- canales de adquisición recomendados
- estrategia inicial de captación

El primer canal de adquisición integrado es **Google Maps**: busca negocios
reales que coincidan con el perfil de cliente dentro de una zona, y devuelve
información útil para prospectarlos (nombre, dirección, teléfono, sitio web,
rating).

## Por qué existe este README paso a paso

Este proyecto también es un **laboratorio para aprender Claude Code**. Se
construye de forma incremental: cada paso se implementa, se corre y se
verifica antes de pasar al siguiente. Este README se va actualizando para
reflejar en qué paso está el proyecto.

## Estado actual

- [x] **Paso 0 — Scaffold**: proyecto Next.js + TypeScript inicializado, home
  básica en `app/page.tsx`, tipos compartidos declarados en `lib/types.ts`.
- [ ] **Paso 1 — Cuestionario guiado**: formulario multi-paso que junta
  qué vendés, a quién, qué problema resolvés, precio aproximado y zona.
- [ ] **Paso 2 — Análisis con IA**: llamada real a la API de Claude
  (`app/api/analysis`) que convierte las respuestas del cuestionario en el
  análisis (ICP, propuesta de valor, canales, estrategia).
- [ ] **Paso 3 — Prospección en Google Maps**: llamada real a Google Places
  API (`app/api/prospects`) que busca negocios según el perfil generado en el
  Paso 2, dentro de la zona indicada.

Fuera de alcance por ahora: otros canales de adquisición, persistencia en base
de datos, automatización de outreach. Quedan para más adelante.

## Requisitos

- Node.js 20+
- Para el Paso 2: una `ANTHROPIC_API_KEY` (variable de entorno).
- Para el Paso 3: una `GOOGLE_MAPS_API_KEY` con la Places API habilitada en
  Google Cloud (requiere billing activo en esa cuenta de Google Cloud).

## Cómo correrlo

```bash
npm install
npm run dev
```

Abrí http://localhost:3000.
