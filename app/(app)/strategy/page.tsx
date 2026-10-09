import Link from "next/link";
import { ClaimCard, NextBestActionCard, STRATEGY_SECTIONS } from "@/app/report/components/StrategyCards";
import { EmptyState } from "@/components/app/EmptyState";
import { EditProfileButton, GenerateStrategyButton } from "@/components/app/ProfileActions";
import { Tapa } from "@/components/app/Tapa";
import { ui } from "@/components/app/ui";
import { getRepository } from "@/lib/server/repository";
import { requireUser } from "@/lib/server/session";

export const metadata = { title: "Estrategia · AI Marketing Agent" };

export default async function StrategyPage() {
  const user = await requireUser();
  const profile = getRepository().getProfile(user.id);

  if (!profile) {
    return (
      <>
        <Tapa title="Estrategia" reference={<p>A quién apuntar, con qué propuesta y cuál es el próximo paso.</p>} />
        <div className={ui.page}>
          <EmptyState
            title="Todavía no hay un perfil de negocio"
            description="Contanos qué vendés, a quién y dónde: con eso armamos tu estrategia y buscamos prospectos."
            action={
              <Link href="/questionnaire?destino=app" className={ui.buttonPrimary}>
                Completar perfil
              </Link>
            }
          />
        </div>
      </>
    );
  }

  const { answers, strategy } = profile;

  return (
    <>
      <Tapa
        title="Estrategia"
        reference={
          <p>
            {answers.offering} · para {answers.businessCategoryToTarget ?? "tu cliente"} en {answers.targetArea}
          </p>
        }
      >
        <div className="flex flex-wrap items-start gap-2">
          <GenerateStrategyButton hasStrategy={Boolean(strategy)} />
          <EditProfileButton answers={answers} />
        </div>
      </Tapa>

      <div className={ui.page}>
        {!strategy ? (
          <EmptyState
            title="Todavía no generaste tu estrategia"
            description="Define tu cliente ideal y tu propuesta de valor, y la usamos para escribir los mensajes."
          />
        ) : (
          <>
            <section className="flex flex-col gap-3" aria-labelledby="proxima">
              <h2 id="proxima" className={ui.sectionTitle}>
                Próxima mejor acción
              </h2>
              <NextBestActionCard nextBestAction={strategy.nextBestAction} />
            </section>

            <p className="text-xs text-grafito">
              Hecho: viene de tus respuestas. Inferencia: una conclusión razonable. Supuesto: una hipótesis que conviene validar.
            </p>

            <div className="grid gap-8 lg:grid-cols-2">
              {STRATEGY_SECTIONS.map(({ key, title }) => (
                <section key={key} className="flex flex-col gap-2">
                  <h2 className={ui.sectionTitle}>{title}</h2>
                  {strategy[key].map((claim, index) => (
                    <ClaimCard key={index} claim={claim} />
                  ))}
                </section>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
