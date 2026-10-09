"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";
import { safeNextPath, ui } from "@/components/app/ui";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    const { error } = await authClient.signIn.email({
      email: String(form.get("email") ?? "").trim(),
      password: String(form.get("password") ?? ""),
      rememberMe: true,
    });
    if (error) {
      setPending(false);
      setError(error.status === 401 ? "Email o contraseña incorrectos." : "No pudimos iniciar sesión. Probá de nuevo.");
      return;
    }
    // ?next= se lee recién acá (evento del usuario), así la página puede renderizarse estática.
    router.replace(safeNextPath(new URLSearchParams(window.location.search).get("next")));
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="indice text-2xl font-extrabold text-tinta">Iniciar sesión</h1>
        <p className={ui.muted}>Entrá para ver tus prospectos.</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className={ui.label}>Email</span>
          <input name="email" type="email" autoComplete="email" required className={ui.input} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={ui.label}>Contraseña</span>
          <input name="password" type="password" autoComplete="current-password" required className={ui.input} />
        </label>

        {error && (
          <p role="alert" className={ui.error}>
            {error}
          </p>
        )}

        <button type="submit" disabled={pending} className={ui.buttonPrimary}>
          {pending ? "Entrando…" : "Entrar"}
        </button>
      </form>

      <p className={ui.muted}>
        ¿No tenés cuenta?{" "}
        <Link href="/register" className={ui.link}>
          Creá una
        </Link>
      </p>
    </div>
  );
}
