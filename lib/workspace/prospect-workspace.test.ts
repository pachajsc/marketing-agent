import { afterEach, describe, expect, it, vi } from "vitest";
import type { SalesMessage } from "@/lib/types";

// El espacio de trabajo nunca puede llamar a Claude: si importara el SDK, falla.
vi.mock("@anthropic-ai/sdk", () => {
  throw new Error("prospect-workspace no debe importar @anthropic-ai/sdk");
});

const {
  canMarkContacted,
  initialWorkspaceState,
  prospectStage,
  stageCounts,
  workFor,
  workspaceReducer,
} = await import("./prospect-workspace");
type State = import("./prospect-workspace").WorkspaceState;
type Action = import("./prospect-workspace").WorkspaceAction;

const A = "https://maps.google.com/?cid=1";
const B = "https://maps.google.com/?cid=2";

const salesMessage: SalesMessage = {
  prospectId: A,
  channel: "whatsapp",
  message: "Hola! Les escribo por el club. ¿Les muestro cómo funciona?",
  cta: "¿Les muestro cómo funciona?",
  claims: [{ quote: "Les escribo por el club", about: "prospect", source: "fact", basedOn: ["prospect.name"] }],
  unknowns: [],
};

const run = (actions: Action[], from: State = initialWorkspaceState) => actions.reduce(workspaceReducer, from);
const panel = (prospectId: string, action: Extract<Action, { type: "panel" }>["action"]): Action => ({ type: "panel", prospectId, action });
const generated = (id = A) => run([panel(id, { type: "generateStart" }), panel(id, { type: "generateSuccess", salesMessage })]);
const approved = (id = A) => run([panel(id, { type: "approve" })], generated(id));
const stageOf = (state: State, id = A) => prospectStage(workFor(state, id));

describe("etapas del prospecto", () => {
  it("sin trabajo es Nuevo; marcar revisado → Revisado", () => {
    expect(stageOf(initialWorkspaceState)).toBe("new");
    expect(stageOf(run([{ type: "markReviewed", prospectId: A }]))).toBe("reviewed");
  });

  it("con un mensaje en borrador o editado → Mensaje generado", () => {
    expect(stageOf(generated())).toBe("message");
    expect(stageOf(run([panel(A, { type: "edit", text: "Hola, otro texto. ¿Te muestro?" })], generated()))).toBe("message");
  });

  it("mensaje aprobado → Aprobado; rechazado → Revisado", () => {
    expect(stageOf(approved())).toBe("approved");
    expect(stageOf(run([panel(A, { type: "reject" })], generated()))).toBe("reviewed");
  });

  it("marcar contactado solo con el mensaje aprobado → Contactado", () => {
    expect(canMarkContacted(workFor(generated(), A))).toBe(false);
    expect(run([{ type: "markContacted", prospectId: A }], generated())).toEqual(generated());

    const contacted = run([{ type: "markContacted", prospectId: A }], approved());
    expect(stageOf(contacted)).toBe("contacted");
  });

  it("marcar revisado no hace nada si el prospecto ya avanzó", () => {
    const state = generated();
    expect(workspaceReducer(state, { type: "markReviewed", prospectId: A })).toBe(state);
  });
});

describe("contactado bloquea el mensaje", () => {
  it("no se puede reabrir, editar ni regenerar; desmarcar vuelve a Aprobado con el mismo texto", () => {
    const contacted = run([{ type: "markContacted", prospectId: A }], approved());

    for (const action of [{ type: "reopen" }, { type: "generateStart" }, { type: "edit", text: "x" }] as const) {
      expect(workspaceReducer(contacted, panel(A, action))).toBe(contacted);
    }

    const unmarked = workspaceReducer(contacted, { type: "unmarkContacted", prospectId: A });
    expect(stageOf(unmarked)).toBe("approved");
    expect(workFor(unmarked, A).panel.review?.approvedText).toBe(salesMessage.message);
  });
});

describe("independencia, conteos y reinicio", () => {
  it("el trabajo de un prospecto no afecta a otro", () => {
    const state = run([{ type: "markReviewed", prospectId: B }], approved(A));
    expect(stageOf(state, A)).toBe("approved");
    expect(stageOf(state, B)).toBe("reviewed");
  });

  it("stageCounts cuenta todos los prospectos, los que no tienen trabajo como Nuevo", () => {
    const state = run([{ type: "markReviewed", prospectId: B }], approved(A));
    expect(stageCounts(state, [A, B, "https://maps.google.com/?cid=3"])).toEqual({
      new: 1,
      reviewed: 1,
      message: 0,
      approved: 1,
      contacted: 0,
    });
  });

  it("reset (nueva búsqueda) vuelve todo a Nuevo", () => {
    expect(workspaceReducer(approved(), { type: "reset" })).toEqual(initialWorkspaceState);
  });
});

describe("sin red ni efectos", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("ninguna acción del espacio de trabajo hace llamadas de red", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    run([
      { type: "markReviewed", prospectId: B },
      panel(A, { type: "generateStart" }),
      panel(A, { type: "generateSuccess", salesMessage }),
      panel(A, { type: "approve" }),
      { type: "markContacted", prospectId: A },
      { type: "unmarkContacted", prospectId: A },
      { type: "reset" },
    ]);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("no muta el estado de entrada", () => {
    const state = approved();
    const snapshot = structuredClone(state);
    workspaceReducer(state, { type: "markContacted", prospectId: A });
    expect(state).toEqual(snapshot);
  });
});
