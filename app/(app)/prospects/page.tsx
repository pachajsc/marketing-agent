import Link from "next/link";
import { EmptyState } from "@/components/app/EmptyState";
import { FindProspectsButton } from "@/components/app/FindProspectsButton";
import { ProspectList } from "@/components/app/ProspectList";
import { toIndexEntry } from "@/components/app/index-data";
import { Tapa } from "@/components/app/Tapa";
import { ui } from "@/components/app/ui";
import { getRepository } from "@/lib/server/repository";
import { requireUser } from "@/lib/server/session";

export const metadata = { title: "Prospectos · AI Marketing Agent" };

export default async function ProspectsPage() {
  const user = await requireUser();
  const repo = getRepository();
  const profile = repo.getProfile(user.id);
  const entries = repo.listProspects(user.id).map((record, index) => toIndexEntry(record, index + 1));
  const category = profile?.answers.businessCategoryToTarget;

  return (
    <>
      <Tapa
        title="Prospectos"
        reference={
          profile && category ? (
            <p>
              {category} en {profile.answers.targetArea}
              {entries.length > 0 && <span className="tabular-nums"> · {entries.length} en el índice</span>}
            </p>
          ) : (
            <p>Negocios reales, ordenados por a quién conviene contactar primero.</p>
          )
        }
      >
        {profile && category ? (
          <FindProspectsButton category={category} area={profile.answers.targetArea} />
        ) : (
          <div>
            <Link href="/questionnaire?destino=app" className={ui.buttonPrimary}>
              Completar perfil
            </Link>
          </div>
        )}
      </Tapa>

      <div className={ui.page}>
        {!profile ? (
          <EmptyState
            title="Primero, contanos qué vendés"
            description="Para buscar prospectos necesitamos saber qué tipo de negocio buscar y en qué zona."
          />
        ) : entries.length === 0 ? (
          <EmptyState
            title="Todavía no hay prospectos"
            description={`Tocá "Buscar prospectos" para encontrar "${category}" en ${profile.answers.targetArea}. Los ordenamos por prioridad para que sepas a quién contactar primero.`}
          />
        ) : (
          <>
            <ProspectList entries={entries} />
            <p className="text-xs text-grafito">
              La prioridad ordena según señales observables disponibles. No es una probabilidad de conversión.
            </p>
          </>
        )}
      </div>
    </>
  );
}
