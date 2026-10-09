"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { changeStatusAction } from "@/app/(app)/actions";
import type { ProspectStatus } from "@/lib/types";
import { TRANSITION_LABEL, manualTransitions } from "@/lib/workspace/prospect-status";
import { StatusBadge } from "./StatusBadge";
import { ui } from "./ui";

/** Estado actual y solo las transiciones permitidas; el servidor las vuelve a validar. */
export function StatusActions({
  prospectId,
  status,
  hasApprovedMessage,
}: {
  prospectId: string;
  status: ProspectStatus;
  hasApprovedMessage: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<ProspectStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const options = manualTransitions(status, { hasApprovedMessage });

  async function handleChange(to: ProspectStatus) {
    setPending(to);
    setError(null);
    const result = await changeStatusAction(prospectId, to);
    setPending(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <StatusBadge status={status} />
      {options.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {options.map((to) => (
            <button
              key={to}
              type="button"
              onClick={() => handleChange(to)}
              disabled={pending !== null}
              className={to === "rejected" ? ui.buttonGhost : ui.buttonSecondary}
            >
              {pending === to ? "Guardando…" : TRANSITION_LABEL[to]}
            </button>
          ))}
        </div>
      )}
      {status === "new" && !hasApprovedMessage && (
        <p className="text-xs text-grafito">Aprobá un mensaje y queda listo para contactar.</p>
      )}
      {(status === "contacted" || status === "replied") && (
        <p className="text-xs text-grafito">Las respuestas se marcan a mano: la app todavía no está conectada a WhatsApp.</p>
      )}
      {error && <p className="text-xs font-semibold text-avenida">{error}</p>}
    </div>
  );
}
