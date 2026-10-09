import { describe, expect, it } from "vitest";
import {
  STATUS_ORDER,
  canTransition,
  isMessageLocked,
  manualTransitions,
  statusAfterApproval,
  statusAfterReopen,
} from "./prospect-status";

const withMessage = { hasApprovedMessage: true };
const withoutMessage = { hasApprovedMessage: false };

describe("estados del prospecto", () => {
  it("cubre los 6 estados del embudo", () => {
    expect(STATUS_ORDER).toEqual(["new", "ready", "contacted", "replied", "qualified", "rejected"]);
  });

  it("'Listo para contactar' no es una marca manual: llega por la aprobación del mensaje", () => {
    for (const from of STATUS_ORDER) {
      expect(canTransition(from, "ready", withMessage)).toBe(false);
    }
    expect(statusAfterApproval("new")).toBe("ready");
    expect(statusAfterApproval("contacted")).toBe("contacted");
  });

  it("'Contactado' exige un mensaje aprobado", () => {
    expect(canTransition("ready", "contacted", withMessage)).toBe(true);
    expect(canTransition("ready", "contacted", withoutMessage)).toBe(false);
    expect(manualTransitions("ready", withoutMessage)).toEqual(["rejected"]);
  });

  it("sigue el embudo: contactado → respondió → calificado; no se saltean pasos", () => {
    expect(canTransition("contacted", "replied", withMessage)).toBe(true);
    expect(canTransition("replied", "qualified", withMessage)).toBe(true);
    expect(canTransition("new", "replied", withMessage)).toBe(false);
    expect(canTransition("contacted", "qualified", withMessage)).toBe(false);
  });

  it("se puede descartar desde cualquier estado y restaurar a Nuevo", () => {
    for (const from of STATUS_ORDER.filter((status) => status !== "rejected")) {
      expect(canTransition(from, "rejected", withoutMessage)).toBe(true);
    }
    expect(manualTransitions("rejected", withMessage)).toEqual(["new"]);
  });

  it("reabrir el mensaje devuelve 'Listo para contactar' a 'Nuevo'; contactado en adelante bloquea el mensaje", () => {
    expect(statusAfterReopen("ready")).toBe("new");
    expect(statusAfterReopen("new")).toBe("new");
    expect(isMessageLocked("contacted")).toBe(true);
    expect(isMessageLocked("qualified")).toBe(true);
    expect(isMessageLocked("ready")).toBe(false);
  });
});
