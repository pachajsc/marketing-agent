---
name: market-analysis
description: Usar cuando se pida auditar la calidad de un MarketingStrategy generado, revisar un problema de provenance o extender las reglas del MarketingAgent para cubrir un caso nuevo.
---

# Market Analysis

## Cuándo se usa

Triggers explícitos:

- revisar la calidad de un análisis generado;
- detectar información inventada;
- revisar fact / inference / assumption;
- revisar fidelidad a respuestas cerradas;
- analizar inconsistencias entre respuestas;
- revisar coherencia entre initialStrategy y nextBestAction;
- agregar o revisar una regla del SYSTEM_PROMPT relacionada con estos casos.

## Qué recibe

La Skill puede recibir:

- `QuestionnaireAnswers`
- `MarketingStrategy`
- evidencia o descripción del caso problemático
- una propuesta de nueva regla para el MarketingAgent

No siempre necesita recibir todos esos elementos; depende de la tarea.

## Checklist de auditoría

Incluir como mínimo:

1. ¿Hay hechos que no fueron proporcionados por el usuario?
2. ¿Hay números, porcentajes, benchmarks o métricas presentados como hechos sin evidencia?
3. ¿Se respetaron literalmente los valores cerrados del questionnaire?
4. ¿Las inconsistencias fueron declaradas o fueron corregidas silenciosamente?
5. ¿Los `fact` corresponden realmente a información proporcionada por el usuario?
6. ¿Las `inference` son deducciones razonables?
7. ¿Los `assumption` están claramente tratados como hipótesis?
8. ¿`nextBestAction` es coherente con `initialStrategy`?
9. ¿`metricToWatch` evita benchmarks inventados?
10. ¿La recomendación sigue siendo accionable a pesar de las incertidumbres?

## Qué producir

La Skill debe producir:

- diagnóstico del problema;
- claims o campos afectados;
- explicación de por qué existe el problema;
- propuesta concreta de corrección;
- propuesta de cambio del SYSTEM_PROMPT cuando corresponda.

La Skill NO debe modificar código automáticamente.

## Qué NO hacer

- No reemplazar `SYSTEM_PROMPT` como fuente normativa.
- No modificar `MarketingAgent` automáticamente.
- No modificar schemas automáticamente.
- No ejecutar cambios sin proponerlos primero.
- No inventar información para completar el análisis.
- No convertir una inferencia en un hecho.
- No convertir una recomendación en un hecho.

## Principio

La Skill es una capacidad reutilizable de Claude Code para auditar y mejorar la calidad del Marketing Agent.

No forma parte del runtime de la aplicación.
No es un API endpoint.
No es un MCP.
No es un Subagent.
