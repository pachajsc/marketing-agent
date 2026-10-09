import Link from "next/link";
import { ActivityList } from "@/components/app/ActivityList";
import { EmptyState } from "@/components/app/EmptyState";
import { Greeting } from "@/components/app/Greeting";
import { IndexEntry } from "@/components/app/IndexEntry";
import { toIndexEntry } from "@/components/app/index-data";
import { Tapa } from "@/components/app/Tapa";
import { ui } from "@/components/app/ui";
import { getRepository } from "@/lib/server/repository";
import { requireUser } from "@/lib/server/session";

export const metadata = { title: "Hoy · AI Marketing Agent" };

const NEXT_UP = 3;
const RECENT_EVENTS = 8;

/**
 * "Hoy": la tapa dice qué hay pendiente y la página responde una sola
 * pregunta, ¿a quién contacto primero? Sin tarjetas de KPIs: los conteos son
 * una línea de referencia, como las de una guía.
 */
export default async function TodayPage() {
  const user = await requireUser();
  const repo = getRepository();
  const profile = repo.getProfile(user.id);
  const stats = repo.getStats(user.id);
  const events = repo.listRecentEvents(user.id, RECENT_EVENTS);
  // El número de orden es la posición en el índice completo (por prioridad).
  const ranked = repo.listProspects(user.id).map((record, index) => toIndexEntry(record, index + 1));
  const nextUp = ranked.filter((entry) => entry.status === "new" || entry.status === "ready").slice(0, NEXT_UP);
  const readyCount = ranked.filter((entry) => entry.status === "ready").length;
  const category = profile?.answers.businessCategoryToTarget;

  return (
    <>
      <Tapa
        title={<Greeting name={user.name} />}
        reference={
          profile ? (
            <>
              <p>
                {category ? `${category} en ` : ""}
                {profile.answers.targetArea}
              </p>
              {stats.total > 0 && (
                <p className="mt-1 tabular-nums text-tinta">
                  <strong>{stats.newCount}</strong> por revisar · <strong>{readyCount}</strong> listos para mandar ·{" "}
                  <strong>{stats.contacted}</strong> contactados · <strong>{stats.responses}</strong> respondieron
                </p>
              )}
            </>
          ) : (
            <p>Empezá contándonos qué vendés, a quién y dónde.</p>
          )
        }
      >
        <div className="flex flex-wrap gap-2">
          {!profile ? (
            <Link href="/questionnaire?destino=app" className={ui.buttonPrimary}>
              Completar perfil
            </Link>
          ) : stats.total === 0 ? (
            <Link href="/prospects" className={ui.buttonPrimary}>
              Buscar prospectos
            </Link>
          ) : (
            <Link href="/prospects" className={ui.buttonPrimary}>
              Ver todos los prospectos
            </Link>
          )}
        </div>
      </Tapa>

      <div className={`${ui.page} lg:grid lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start lg:gap-8`}>
        <section aria-labelledby="next-up" className="flex flex-col gap-3">
          <h2 id="next-up" className={ui.sectionTitle}>
            Para contactar primero
          </h2>
          {nextUp.length > 0 ? (
            <ol className={`${ui.hoja} divide-y divide-renglon overflow-hidden`}>
              {nextUp.map((entry, index) => (
                <IndexEntry key={entry.id} entry={entry} order={index} />
              ))}
            </ol>
          ) : ranked.length > 0 ? (
            <EmptyState
              title="No queda nadie por contactar"
              description="Todos tus prospectos ya están contactados o descartados. Buscá de nuevo para sumar negocios a la lista."
              action={
                <Link href="/prospects" className={ui.buttonSecondary}>
                  Ir a prospectos
                </Link>
              }
            />
          ) : (
            <EmptyState
              title="Todavía no hay prospectos"
              description={
                profile
                  ? "Hacé tu primera búsqueda: encontramos negocios reales en tu zona y los ordenamos por prioridad."
                  : "Primero completá tu perfil: con eso sabemos qué tipo de negocio buscar y dónde."
              }
            />
          )}
        </section>

        <section aria-labelledby="registro" className="mt-8 flex flex-col gap-3 lg:mt-0">
          <h2 id="registro" className={ui.sectionTitle}>
            Registro
          </h2>
          <div className={ui.hojaPadded}>
            {events.length > 0 ? (
              <ActivityList events={events} showProspect />
            ) : (
              <p className={ui.muted}>Acá queda anotado lo que pasa: búsquedas, mensajes y cambios de estado.</p>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
