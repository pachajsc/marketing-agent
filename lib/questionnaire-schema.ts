// Definición del cuestionario guiado (Paso 1) como datos, no como JSX.
//
// La idea: cada pregunta se declara una sola vez acá (label, tipo de input,
// si es obligatoria, ejemplo, ayuda adicional, etc.) y tanto el wizard como
// el resumen final leen de esta misma fuente. Así evitamos duplicar la
// lógica de "qué se ve" y "qué es obligatorio" en varios componentes.

import type { QuestionnaireAnswers } from "./types";

export type FieldType = "text" | "textarea" | "choice";

export interface QuestionOption {
  value: string;
  label: string;
}

export interface QuestionFieldDef {
  /** Debe coincidir con una clave de QuestionnaireAnswers. */
  id: keyof QuestionnaireAnswers;
  /** Texto fijo, o una función si el enunciado cambia según respuestas previas. */
  label: string | ((answers: Partial<QuestionnaireAnswers>) => string);
  type: FieldType;
  /** Ejemplo de respuesta, visible dentro del input mientras está vacío. Solo aplica a "text"/"textarea". */
  placeholder?: string;
  /**
   * Ayuda adicional (por qué preguntamos esto, cómo interpretarlo, o un
   * ejemplo cuando el campo no tiene placeholder por ser "choice").
   * Se muestra detrás de un ícono informativo, no ocupa espacio fijo.
   */
  helpText?: string;
  /** Solo para type "choice". */
  options?: QuestionOption[];
  /** Booleano fijo, o condicional (ej: obligatorio solo si es B2B). */
  required?: boolean | ((answers: Partial<QuestionnaireAnswers>) => boolean);
  /** Si no está definido, el campo siempre es visible dentro de su paso. */
  visibleIf?: (answers: Partial<QuestionnaireAnswers>) => boolean;
}

export interface QuestionnaireStepDef {
  id: string;
  title: string;
  description?: string;
  fields: QuestionFieldDef[];
}

export const questionnaireSteps: QuestionnaireStepDef[] = [
  {
    id: "goal-and-offering",
    title: "Tu objetivo y tu producto",
    fields: [
      {
        id: "mainGoal",
        type: "choice",
        label: "¿Qué querés lograr principalmente con este producto o servicio?",
        helpText: "Ej: conseguir mis primeros clientes durante el próximo mes.",
        required: true,
        options: [
          { value: "first_customers", label: "Conseguir mis primeros clientes" },
          { value: "increase_sales", label: "Aumentar mis ventas actuales" },
          { value: "recurring_customers", label: "Conseguir clientes recurrentes" },
          {
            value: "higher_value_upsell",
            label: "Vender servicios de mayor valor a los clientes que ya tengo",
          },
        ],
      },
      {
        id: "offering",
        type: "text",
        label: "¿Qué producto o servicio ofrecés?",
        placeholder: "Ej: diseño de sitios web para pequeñas empresas",
        required: true,
      },
      {
        id: "problem",
        type: "textarea",
        label: "¿Qué problema concreto resolvés o qué necesidad cubre tu producto o servicio?",
        placeholder: "Ej: los clubes tardan mucho tiempo en organizar las inscripciones y pagos de sus torneos",
        required: true,
      },
    ],
  },
  {
    id: "ideal-customer",
    title: "Tu cliente ideal",
    fields: [
      {
        id: "idealCustomerDescription",
        type: "textarea",
        label: "¿Quién es el cliente ideal para tu producto o servicio? Describilo con tus palabras.",
        placeholder:
          "Ej: dueños de clubes de pádel que organizan torneos y hoy gestionan las inscripciones por WhatsApp",
        helpText: "Contá cómo es hoy, qué hace, cómo resuelve este problema actualmente.",
        required: false,
      },
      {
        id: "businessCategoryToTarget",
        type: "text",
        label: "¿Qué tipo de negocios, profesionales o personas querés encontrar para ofrecerles tu producto?",
        placeholder: "Ej: clubes de pádel, organizadores de torneos, complejos deportivos",
        helpText:
          "A diferencia de la pregunta anterior, esto es una categoría corta: nos sirve para poder buscar y agrupar a ese tipo de cliente más adelante (por ejemplo, en Google Maps).",
        required: true,
      },
      {
        id: "businessType",
        type: "choice",
        label: "¿A quién le vendés?",
        required: true,
        options: [
          { value: "b2c", label: "Personas (B2C)" },
          { value: "b2b", label: "Empresas (B2B)" },
        ],
      },
    ],
  },
  {
    id: "current-status",
    title: "Tu situación actual",
    fields: [
      {
        id: "hasCustomersToday",
        type: "choice",
        label: "¿Ya tenés clientes actualmente?",
        required: true,
        options: [
          { value: "none", label: "No, todavía no" },
          { value: "some", label: "Sí, algunos" },
          { value: "stable", label: "Sí, tengo una base de clientes estable" },
        ],
      },
      {
        id: "targetArea",
        type: "text",
        label: "¿En qué zona querés conseguir clientes?",
        placeholder: "Ej: Ciudad de Buenos Aires",
        helpText:
          "Puede ser una ciudad, una región o un país (ej: \"Buenos Aires y alrededores\", \"Argentina\", \"Estados Unidos\"). Contanos un lugar geográfico, no un canal — no \"Instagram\" o \"redes sociales\".",
        required: true,
      },
    ],
  },
  {
    id: "context",
    title: "Competencia y precio",
    fields: [
      {
        id: "knownCompetitors",
        type: "textarea",
        label: "¿Conocés productos o servicios similares que tus clientes podrían elegir en lugar del tuyo?",
        placeholder: "Ej: Canva, Wix y agencias de diseño web (o \"no conozco competidores directos\")",
        required: false,
      },
      {
        id: "priceRange",
        type: "text",
        label: "¿Cuánto cobrás o cuánto pensás cobrar por tu producto o servicio?",
        placeholder: "Ej: USD 300 por sitio web (o \"todavía no definí el precio\")",
        required: false,
      },
    ],
  },
];

export function resolveLabel(
  field: QuestionFieldDef,
  answers: Partial<QuestionnaireAnswers>
): string {
  return typeof field.label === "function" ? field.label(answers) : field.label;
}

export function isFieldVisible(
  field: QuestionFieldDef,
  answers: Partial<QuestionnaireAnswers>
): boolean {
  return field.visibleIf ? field.visibleIf(answers) : true;
}

export function isFieldRequired(
  field: QuestionFieldDef,
  answers: Partial<QuestionnaireAnswers>
): boolean {
  return typeof field.required === "function" ? field.required(answers) : !!field.required;
}

export function getVisibleFields(
  step: QuestionnaireStepDef,
  answers: Partial<QuestionnaireAnswers>
): QuestionFieldDef[] {
  return step.fields.filter((field) => isFieldVisible(field, answers));
}

function hasValue(answers: Partial<QuestionnaireAnswers>, id: keyof QuestionnaireAnswers): boolean {
  const value = answers[id];
  return typeof value === "string" && value.trim().length > 0;
}

/** Un paso es válido si todo campo visible y obligatorio tiene un valor cargado. */
export function isStepValid(
  step: QuestionnaireStepDef,
  answers: Partial<QuestionnaireAnswers>
): boolean {
  return getVisibleFields(step, answers).every(
    (field) => !isFieldRequired(field, answers) || hasValue(answers, field.id)
  );
}
