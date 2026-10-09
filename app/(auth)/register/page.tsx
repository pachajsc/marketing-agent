"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";
import { ui } from "@/components/app/ui";

const MIN_PASSWORD_LENGTH = 8;

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`La contraseña tiene que tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
      return;
    }

    setPending(true);
    setError(null);
    const { error } = await authClient.signUp.email({ name, email, password });
    if (error) {
      setPending(false);
      setError(
        error.status === 422 || /exist/i.test(error.message ?? "")
          ? "Ya existe una cuenta con ese email."
          : "No pudimos crear la cuenta. Revisá los datos y probá de nuevo."
      );
      return;
    }
    // Better Auth inicia sesión al registrarse: directo al onboarding.
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="indice text-2xl font-extrabold text-tinta">Crear cuenta</h1>
        <p className={ui.muted}>Encontrá prospectos reales y preparales un mensaje.</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className={ui.label}>Nombre</span>
          <input name="name" type="text" autoComplete="name" required className={ui.input} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={ui.label}>Email</span>
          <input name="email" type="email" autoComplete="email" required className={ui.input} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={ui.label}>Contraseña</span>
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            className={ui.input}
          />
          <span className="text-xs text-grafito">Mínimo {MIN_PASSWORD_LENGTH} caracteres.</span>
        </label>

        {error && (
          <p role="alert" className={ui.error}>
            {error}
          </p>
        )}

        <button type="submit" disabled={pending} className={ui.buttonPrimary}>
          {pending ? "Creando cuenta…" : "Crear cuenta"}
        </button>
      </form>

      <p className={ui.muted}>
        ¿Ya tenés cuenta?{" "}
        <Link href="/login" className={ui.link}>
          Iniciá sesión
        </Link>
      </p>
    </div>
  );
}
