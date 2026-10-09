# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Emprendedor o profesional independiente que vende solo, sin equipo comercial. Prospecta él mismo, entre muchas otras tareas, y necesita resolver rápido "¿a quién le escribo hoy y qué le digo?". Usa la app **principalmente desde el celular**: en la calle o entre reuniones, cerca de la zona donde busca clientes, y el mensaje termina en WhatsApp del mismo teléfono.

## Product Purpose

Convertir "qué vendo, a quién y dónde" en una lista de negocios reales, priorizada, con un mensaje de primer contacto listo para revisar, aprobar y copiar. Éxito: el usuario sabe a quién contactar primero y sale con un mensaje aprobado que puede mandar él mismo, sin haber investigado a mano.

## Positioning

No inventa. Los prospectos son negocios reales de Google Maps; la prioridad sale de un score determinista con su evidencia (hecho / inferencia / supuesto) y una lista explícita de lo que no se sabe; cada afirmación del mensaje cita su fuente y el código rechaza números, necesidades, procesos o promesas sin respaldo. La aprobación humana es obligatoria y la app nunca envía nada por su cuenta.

## Operating Context

- Flujo: perfil de negocio (cuestionario: qué vendés → a quién → dónde → contexto) → estrategia con IA → búsqueda de prospectos (con preferencia de cercanía opcional según la ubicación del dispositivo y un radio) → prospectos calificados y ordenados → mensaje por prospecto → revisar / editar / aprobar → copiar → marcar contactado → marcar respuesta a mano.
- Estados del prospecto: Nuevo, Listo para contactar (al aprobar el mensaje), Contactado, Respondió, Calificado, Descartado. "Respondió" y "Calificado" son marcas manuales.
- Cada generación con IA (estrategia ~30 s, búsqueda 10–30 s, mensaje ~6–10 s) tiene costo: todo se dispara a pedido, nunca automáticamente.
- El contacto real ocurre fuera de la app (WhatsApp del usuario).

## Capabilities and Constraints

- Next.js App Router + TypeScript + Tailwind v4; Claude (Structured Outputs + Zod); MCP propio para la búsqueda; Google Places; Better Auth (email y contraseña); SQLite local.
- Un perfil de negocio por cuenta. Flujo público sin cuenta (`/questionnaire` → `/report`) que no guarda nada.
- Fuera de alcance hoy: envío automático (WhatsApp, email), campañas, CRM, múltiples usuarios por cuenta, billing.
- Idioma: español rioplatense (voseo).

## Brand Commitments

- Nombre: **AI Marketing Agent**.
- Voz: directa, honesta y concreta; dice lo que no sabe en lugar de rellenar. Nunca presenta el score como probabilidad de conversión ni promete resultados.

## Evidence on Hand

- Validaciones reales con dos nichos (plataforma de eventos de pádel en Buenos Aires; software de turnos para consultorios odontológicos en Córdoba), documentadas en `docs/agent-roadmap.md`.
- No hay testimonios, clientes, métricas de uso ni casos de éxito: no deben inventarse.

## Product Principles

1. **Real antes que lindo:** todo dato mostrado proviene de una fuente verificable o se marca como inferencia o supuesto.
2. **Decidir rápido:** cada pantalla responde una pregunta (¿a quién contacto primero?, ¿qué le digo?, ¿en qué quedó?).
3. **El humano aprueba:** la IA propone, el usuario revisa y decide; nada sale sin aprobación.
4. **Costo visible:** las acciones que consumen IA son explícitas y a pedido.
5. **Hecho para el bolsillo:** la experiencia principal se completa con una mano, en el celular.
