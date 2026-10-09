// Tokens de la app en el mundo "Guía de calles" (ver app/globals.css y
// DESIGN.md). Clases Tailwind compartidas: tapa amarilla, papel de plano,
// hojas blancas con filete, tinta. Esquinas casi rectas, como un impreso.

export const ui = {
  /** Contenido de página. Abajo deja lugar para la barra de navegación del celular. */
  page: "mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pb-28 pt-5 sm:px-6 lg:max-w-5xl lg:pb-12 lg:pt-8",
  /** Hoja impresa sobre el papel de plano. */
  hoja: "rounded-md border border-renglon bg-hoja",
  hojaPadded: "rounded-md border border-renglon bg-hoja p-4 sm:p-5",
  /** Título de sección: condensado, en tinta. */
  sectionTitle: "indice text-lg font-bold leading-tight text-tinta",
  muted: "text-sm text-grafito",
  label: "text-xs font-semibold uppercase tracking-[0.06em] text-grafito",
  input:
    "w-full rounded-md border border-renglon bg-hoja px-3 py-2.5 text-base text-tinta outline-none placeholder:text-lapiz focus:border-tinta sm:text-sm",
  buttonPrimary:
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-tinta px-4 py-2 text-sm font-semibold text-hoja transition-[background-color,transform] duration-150 hover:bg-black active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40",
  buttonSecondary:
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-tinta bg-hoja px-4 py-2 text-sm font-semibold text-tinta transition-colors duration-150 hover:bg-plano active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40",
  buttonGhost:
    "inline-flex min-h-11 items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-grafito transition-colors duration-150 hover:bg-plano hover:text-tinta disabled:cursor-not-allowed disabled:opacity-40",
  link: "font-semibold text-agua underline decoration-agua/40 hover:decoration-agua",
  error: "rounded-md border border-avenida/30 bg-avenida/5 px-3 py-2 text-sm text-avenida",
} as const;

/** Iniciales para el avatar (sin imágenes externas). */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

/** Fecha relativa simple en español ("hace 5 min", "hace 2 d"). */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const seconds = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "recién";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  return `hace ${days} d`;
}

/** Solo rutas internas relativas: evita redirecciones abiertas con ?next=. */
export function safeNextPath(next: string | null | undefined, fallback = "/dashboard"): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : fallback;
}

/**
 * Referencia corta de una dirección de Google: la calle y el barrio o ciudad,
 * sin código postal ni país ("Av. Cabildo 2160 · Cdad. Autónoma de Buenos Aires").
 */
export function shortAddress(address: string): string {
  const parts = address
    .split(",")
    .map((part) => part.trim().replace(/\b[A-Z]\d{4}[A-Z]{0,3}\b/g, "").replace(/\s{2,}/g, " ").trim())
    .filter((part) => part && part !== "Argentina");
  return parts.slice(0, 2).join(" · ");
}

/** "sports_club" → "Sports club" (tipo de negocio según Google, legible). */
export function humanizeType(type: string | undefined): string | undefined {
  if (!type) return undefined;
  const text = type.replaceAll("_", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** El porqué de la prioridad en una línea: el resumen sin el prefijo "Prioridad alta (N/100): ". */
export function priorityReason(summary: string): string {
  const reason = summary.replace(/^Prioridad \w+ \(\d+\/100\):\s*/, "");
  return reason.charAt(0).toUpperCase() + reason.slice(1);
}
