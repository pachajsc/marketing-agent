import Link from "next/link";
import { EditProfileButton } from "@/components/app/ProfileActions";
import { SignOutButton } from "@/components/app/SignOutButton";
import { Tapa } from "@/components/app/Tapa";
import { initials, ui } from "@/components/app/ui";
import { getRepository } from "@/lib/server/repository";
import { requireUser } from "@/lib/server/session";

export const metadata = { title: "Ajustes · AI Marketing Agent" };

export default async function SettingsPage() {
  const user = await requireUser();
  const profile = getRepository().getProfile(user.id);

  return (
    <>
      <Tapa title="Ajustes" reference={<p>Tu cuenta y tu perfil de negocio.</p>} />

      <div className={ui.page}>
        <section className={`${ui.hojaPadded} flex flex-col gap-4`} aria-labelledby="cuenta">
          <h2 id="cuenta" className={ui.sectionTitle}>
            Cuenta
          </h2>
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="flex h-11 w-11 items-center justify-center rounded-full bg-tinta text-sm font-bold text-tapa"
            >
              {initials(user.name)}
            </span>
            <div className="min-w-0">
              <p className="truncate font-semibold text-tinta">{user.name}</p>
              <p className="truncate text-sm text-grafito">{user.email}</p>
            </div>
          </div>
        </section>

        <section className={`${ui.hojaPadded} flex flex-col gap-4`} aria-labelledby="perfil">
          <h2 id="perfil" className={ui.sectionTitle}>
            Perfil de negocio
          </h2>
          {profile ? (
            <>
              <dl className="grid gap-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className={ui.label}>Qué vendés</dt>
                  <dd className="text-tinta">{profile.answers.offering}</dd>
                </div>
                <div>
                  <dt className={ui.label}>Problema que resolvés</dt>
                  <dd className="text-tinta">{profile.answers.problem}</dd>
                </div>
                <div>
                  <dt className={ui.label}>A quién</dt>
                  <dd className="text-tinta">{profile.answers.businessCategoryToTarget ?? "—"}</dd>
                </div>
                <div>
                  <dt className={ui.label}>Dónde</dt>
                  <dd className="text-tinta">{profile.answers.targetArea}</dd>
                </div>
              </dl>
              <p className="text-xs text-grafito">
                Si cambiás las respuestas, la estrategia anterior se descarta y hay que generarla de nuevo. Los prospectos ya
                guardados se conservan.
              </p>
              <div>
                <EditProfileButton answers={profile.answers} />
              </div>
            </>
          ) : (
            <div className="flex flex-col items-start gap-3">
              <p className={ui.muted}>Todavía no completaste tu perfil.</p>
              <Link href="/questionnaire?destino=app" className={ui.buttonPrimary}>
                Completar perfil
              </Link>
            </div>
          )}
        </section>

        <section className={`${ui.hojaPadded} flex flex-col gap-3`} aria-labelledby="sesion">
          <h2 id="sesion" className={ui.sectionTitle}>
            Sesión
          </h2>
          <p className={ui.muted}>La sesión dura 30 días en este dispositivo.</p>
          <div>
            <SignOutButton />
          </div>
        </section>
      </div>
    </>
  );
}
