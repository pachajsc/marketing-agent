import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SalesMessage } from "@/lib/types";

// Si el módulo de revisión llegara a importar el SDK de Anthropic, este mock
// hace fallar la importación: la revisión nunca puede llamar a Claude.
vi.mock("@anthropic-ai/sdk", () => {
  throw new Error("message-review no debe importar @anthropic-ai/sdk");
});

const {
  canApprove,
  canCopy,
  canGenerate,
  claimsWithPresence,
  initialMessagePanelState,
  messagePanelReducer,
  reviewStatus,
  visibleText,
} = await import("./message-review");
type State = import("./message-review").MessagePanelState;
type Action = import("./message-review").MessagePanelAction;

// Mensaje real generado en la validación de Fase 8 (Pasaje Del Sol).
const salesMessage: SalesMessage = {
  prospectId: "https://maps.google.com/?cid=12406326054384897795",
  channel: "whatsapp",
  message:
    "Hola! ¿Cómo andan? Les escribo por Pasaje Del Sol, la sede de Av. Salvador María del Carril. Los vi en Google figurando como complejo deportivo y lugar de eventos, y por eso les contacto: desarrollamos una plataforma para organizar eventos de pádel, pensada para torneos, canchas abiertas y eventos. ¿Les interesa que les muestre cómo funciona y les pase un ejemplo?",
  cta: "¿Les interesa que les muestre cómo funciona y les pase un ejemplo?",
  claims: [
    { quote: "Pasaje Del Sol, la sede de Av. Salvador María del Carril", about: "prospect", source: "fact", basedOn: ["prospect.name", "prospect.address"] },
    { quote: "Los vi en Google figurando como complejo deportivo y lugar de eventos", about: "prospect", source: "fact", basedOn: ["prospect.types"] },
  ],
  unknowns: ["Quién toma las decisiones de compra."],
};
const otherMessage: SalesMessage = { ...salesMessage, message: "Hola! Otro borrador. ¿Te muestro?", cta: "¿Te muestro?", claims: [{ ...salesMessage.claims[0], quote: "Hola" }] };

const run = (actions: Action[], from: State = initialMessagePanelState) => actions.reduce(messagePanelReducer, from);
const generated = (message = salesMessage) => run([{ type: "generateStart" }, { type: "generateSuccess", salesMessage: message }]);
const EDIT = "Hola! Les escribo por Pasaje Del Sol. ¿Les muestro cómo funciona?";

describe("draft", () => {
  it("generar crea un borrador: original = mensaje de Claude, editedText null, sin aprobar", () => {
    const state = generated();

    expect(state.review).toEqual({ original: salesMessage, editedText: null, decision: "pending", approvedText: null });
    expect(reviewStatus(state.review!)).toBe("draft");
    expect(visibleText(state.review!)).toBe(salesMessage.message);
    expect(state.generating).toBe(false);
  });
});

describe("edit", () => {
  it("editar pasa a 'edited' y el texto visible se deriva de editedText", () => {
    const state = run([{ type: "edit", text: EDIT }], generated());

    expect(reviewStatus(state.review!)).toBe("edited");
    expect(state.review!.editedText).toBe(EDIT);
    expect(visibleText(state.review!)).toBe(EDIT);
  });

  it("volver exactamente al texto original deja de ser edición; restaurar descarta la edición", () => {
    const backToOriginal = run([{ type: "edit", text: EDIT }, { type: "edit", text: salesMessage.message }], generated());
    expect(backToOriginal.review!.editedText).toBeNull();
    expect(reviewStatus(backToOriginal.review!)).toBe("draft");

    const restored = run([{ type: "edit", text: EDIT }, { type: "restoreOriginal" }], generated());
    expect(restored.review!.editedText).toBeNull();
    expect(visibleText(restored.review!)).toBe(salesMessage.message);
  });

  it("con una edición pendiente, generar de nuevo está bloqueado (no descarta la edición)", () => {
    const edited = run([{ type: "edit", text: EDIT }], generated());

    expect(canGenerate(edited)).toBe(false);
    expect(messagePanelReducer(edited, { type: "generateStart" })).toBe(edited);

    const restored = messagePanelReducer(edited, { type: "restoreOriginal" });
    expect(canGenerate(restored)).toBe(true);
  });
});

describe("approved", () => {
  it("aprobar congela exactamente el texto visible; copiar solo en aprobado", () => {
    const draft = generated();
    expect(canCopy(draft.review)).toBe(false);

    const approved = run([{ type: "edit", text: EDIT }, { type: "approve" }], draft);
    expect(reviewStatus(approved.review!)).toBe("approved");
    expect(approved.review!.approvedText).toBe(EDIT);
    expect(canCopy(approved.review)).toBe(true);

    // Aprobado no se edita ni se regenera sin reabrir.
    expect(messagePanelReducer(approved, { type: "edit", text: "otra cosa" })).toBe(approved);
    expect(canGenerate(approved)).toBe(false);
  });

  it("reabrir vuelve a la revisión conservando la edición y limpia approvedText", () => {
    const reopened = run([{ type: "edit", text: EDIT }, { type: "approve" }, { type: "reopen" }], generated());

    expect(reviewStatus(reopened.review!)).toBe("edited");
    expect(reopened.review!.approvedText).toBeNull();
    expect(canCopy(reopened.review)).toBe(false);
  });
});

describe("rejected", () => {
  it("rechazar conserva original y edición, sin copia; desde ahí se regenera o se reabre", () => {
    const rejected = run([{ type: "edit", text: EDIT }, { type: "reject" }], generated());

    expect(reviewStatus(rejected.review!)).toBe("rejected");
    expect(rejected.review!.original).toEqual(salesMessage);
    expect(rejected.review!.editedText).toBe(EDIT);
    expect(canCopy(rejected.review)).toBe(false);
    expect(canGenerate(rejected)).toBe(true);

    const reopened = messagePanelReducer(rejected, { type: "reopen" });
    expect(reviewStatus(reopened.review!)).toBe("edited");
  });

  it("regenerar después de rechazar reemplaza el original y limpia la edición", () => {
    const rejected = run([{ type: "edit", text: EDIT }, { type: "reject" }], generated());
    const regenerated = run([{ type: "generateStart" }, { type: "generateSuccess", salesMessage: otherMessage }], rejected);

    expect(regenerated.review).toEqual({ original: otherMessage, editedText: null, decision: "pending", approvedText: null });
  });
});

describe("mensaje vacío", () => {
  it.each(["", "   ", "\n\t "])("no se puede aprobar un texto vacío (%j)", (text) => {
    const edited = run([{ type: "edit", text }], generated());

    expect(canApprove(edited)).toBe(false);
    expect(messagePanelReducer(edited, { type: "approve" })).toBe(edited);
    expect(edited.review!.decision).toBe("pending");
  });
});

describe("preservación de original y edición", () => {
  it("ninguna transición modifica el mensaje original", () => {
    const snapshot = structuredClone(salesMessage);
    const actions: Action[] = [
      { type: "edit", text: EDIT },
      { type: "approve" },
      { type: "reopen" },
      { type: "edit", text: `${EDIT} 🎾` },
      { type: "reject" },
      { type: "reopen" },
      { type: "restoreOriginal" },
    ];

    let state = generated();
    for (const action of actions) {
      state = messagePanelReducer(state, action);
      expect(state.review!.original).toEqual(snapshot);
    }
    expect(salesMessage).toEqual(snapshot);
  });

  it("la edición se conserva al rechazar y reabrir, y solo se descarta al restaurar", () => {
    const state = run([{ type: "edit", text: EDIT }, { type: "reject" }, { type: "reopen" }], generated());
    expect(state.review!.editedText).toBe(EDIT);
    expect(run([{ type: "restoreOriginal" }], state).review!.editedText).toBeNull();
  });

  it("un error al generar no pierde la revisión existente", () => {
    const rejected = run([{ type: "edit", text: EDIT }, { type: "reject" }], generated());
    const failed = run([{ type: "generateStart" }, { type: "generateFailure", error: "Claude no pudo procesar la solicitud." }], rejected);

    expect(failed.review).toEqual(rejected.review);
    expect(failed.error).toBe("Claude no pudo procesar la solicitud.");
    expect(failed.generating).toBe(false);
  });

  it("mientras se genera no se puede editar, aprobar, rechazar ni pedir otra generación", () => {
    const generating = messagePanelReducer(generated(), { type: "generateStart" });

    for (const action of [{ type: "edit", text: EDIT }, { type: "approve" }, { type: "reject" }, { type: "generateStart" }] as Action[]) {
      expect(messagePanelReducer(generating, action)).toBe(generating);
    }
  });
});

describe("claims después de editar", () => {
  it("marca los claims cuyo fragmento ya no está en el texto visible", () => {
    const edited = run([{ type: "edit", text: EDIT }], generated());
    const claims = claimsWithPresence(edited.review!);

    expect(claims.map((claim) => claim.stillPresent)).toEqual([false, false]);
    expect(claimsWithPresence(generated().review!).every((claim) => claim.stillPresent)).toBe(true);
  });
});

describe("sin Anthropic ni envío externo", () => {
  const fetchSpy = vi.fn();
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchSpy);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    fetchSpy.mockReset();
  });

  it("editar, restaurar, aprobar, rechazar y reabrir no hacen ninguna llamada de red", () => {
    run(
      [
        { type: "edit", text: EDIT },
        { type: "restoreOriginal" },
        { type: "edit", text: EDIT },
        { type: "approve" },
        { type: "reopen" },
        { type: "reject" },
        { type: "reopen" },
      ],
      generated()
    );

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("el reductor es puro: mismo estado y acción → mismo resultado, sin mutar la entrada", () => {
    const state = generated();
    const snapshot = structuredClone(state);

    expect(messagePanelReducer(state, { type: "edit", text: EDIT })).toEqual(messagePanelReducer(state, { type: "edit", text: EDIT }));
    expect(state).toEqual(snapshot);
  });
});
