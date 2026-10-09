import Link from "next/link";
import { notFound } from "next/navigation";
import { SourceBadge } from "@/app/report/components/SourceBadge";
import { ActivityList } from "@/components/app/ActivityList";
import { GeneratedMessageCard } from "@/components/app/GeneratedMessageCard";
import { StatusActions } from "@/components/app/StatusActions";
import { Placa, Tapa } from "@/components/app/Tapa";
import { humanizeType, shortAddress, ui } from "@/components/app/ui";
import { STATUS_LABEL, isMessageLocked } from "@/lib/workspace/prospect-status";
import { getRepository } from "@/lib/server/repository";
import { requireUser } from "@/lib/server/session";

const PRIORITY_LABEL = { high: "alta", medium: "media", low: "baja" } as const;

/** Sello de goma: aparece cuando el prospecto ya fue contactado (o más). Se estampa una vez. */
function Sello({ label }: { label: string }) {
  return (
    <span
      className="indice inline-flex shrink-0 rotate-[-6deg] items-center rounded-[4px] border-[2.5px] border-agua px-2.5 py-1 text-base font-extrabold uppercase tracking-[0.04em] text-agua animate-[sello_380ms_cubic-bezier(0.16,1,0.3,1)_both]"
      aria-label={`Estado: ${label}`}
    >
      {label}
    </span>
  );
}

export default async function ProspectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const repo = getRepository();
  const record = repo.getProspect(user.id, id);
  if (!record) notFound();

  const rank = repo.listProspects(user.id).findIndex((item) => item.id === record.id) + 1;
  const { prospect, status } = record;
  const { qualification } = prospect;
  const hasStrategy = Boolean(repo.getProfile(user.id)?.strategy);
  const signals = qualification.evidence.filter((evidence) => evidence.points > 0 || evidence.source !== "fact");
  const category = humanizeType(prospect.primaryType);
  const stamped = status === "contacted" || status === "replied" || status === "qualified";

  return (
    <>
      <Tapa
        title={prospect.name}
        reference={
          <>
            <p>
              {category ? `${category} · ` : ""}
              {shortAddress(prospect.address)}
            </p>
            <p className="mt-1 text-tinta">
              <strong className="tabular-nums">{qualification.score}</strong> · prioridad {PRIORITY_LABEL[qualification.priority]}
            </p>
          </>
        }
        aside={<Placa rank={rank > 0 ? rank : 1} size="lg" />}
      >
        <div className="flex items-center justify-between gap-3">
          <Link href="/prospects" className="text-sm font-semibold text-tinta underline decoration-tinta/40 hover:decoration-tinta">
            ← Volver al índice
          </Link>
          {stamped && <Sello label={STATUS_LABEL[status]} />}
        </div>
      </Tapa>

      <div className={`${ui.page} lg:grid lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start lg:gap-8`}>
        <div className="flex flex-col gap-6">
          <GeneratedMessageCard
            prospectId={record.id}
            initialReview={record.review}
            hasStrategy={hasStrategy}
            locked={isMessageLocked(status)}
          />

          <section className={`${ui.hojaPadded} flex flex-col gap-3`} aria-labelledby="porque">
            <h2 id="porque" className={ui.sectionTitle}>
              Por qué esta prioridad
            </h2>
            <ul className="flex flex-col gap-2 text-sm">
              {signals.map((evidence, index) => (
                <li key={index} className="flex items-start gap-2">
                  <SourceBadge source={evidence.source} />
                  <span className="text-tinta">
                    {evidence.text}
                    {evidence.points > 0 && <span className="font-bold tabular-nums"> +{evidence.points}</span>}
                  </span>
                </li>
              ))}
            </ul>
            <details className="text-sm">
              <summary className="cursor-pointer font-semibold text-grafito">Qué no sabemos</summary>
              <ul className="mt-2 list-disc pl-5 text-grafito">
                {qualification.unknowns.map((unknown, index) => (
                  <li key={index}>{unknown}</li>
                ))}
              </ul>
            </details>
            <p className="text-xs text-grafito">La prioridad ordena según señales observables. No es una probabilidad de conversión.</p>
          </section>
        </div>

        <div className="mt-6 flex flex-col gap-6 lg:mt-0">
          <section className={`${ui.hojaPadded} flex flex-col gap-3`} aria-labelledby="datos">
            <h2 id="datos" className={ui.sectionTitle}>
              Datos del negocio
            </h2>
            <dl className="flex flex-col gap-3 text-sm">
              <div>
                <dt className={ui.label}>Dirección</dt>
                <dd className="text-tinta">{prospect.address}</dd>
              </div>
              <div>
                <dt className={ui.label}>Teléfono</dt>
                <dd>
                  {prospect.phone ? (
                    <a href={`tel:${prospect.phone.replace(/[^\d+]/g, "")}`} className={ui.link}>
                      {prospect.phone}
                    </a>
                  ) : (
                    <span className="text-grafito">No disponible</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className={ui.label}>Sitio web</dt>
                <dd>
                  {prospect.website ? (
                    <a href={prospect.website} target="_blank" rel="noreferrer" className={`break-all ${ui.link}`}>
                      {prospect.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
                    </a>
                  ) : (
                    <span className="text-grafito">No disponible</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className={ui.label}>Rating</dt>
                <dd className="tabular-nums text-tinta">
                  {typeof prospect.rating === "number"
                    ? `★ ${prospect.rating}${typeof prospect.userRatingCount === "number" ? ` · ${prospect.userRatingCount} reseñas` : ""}`
                    : "No disponible"}
                </dd>
              </div>
            </dl>
            <a href={prospect.mapsUrl} target="_blank" rel="noreferrer" className={`${ui.buttonSecondary} w-full`}>
              Ver en Google Maps
            </a>
          </section>

          <section className={`${ui.hojaPadded} flex flex-col gap-3`} aria-labelledby="estado">
            <h2 id="estado" className={ui.sectionTitle}>
              Estado
            </h2>
            <StatusActions prospectId={record.id} status={status} hasApprovedMessage={record.hasApprovedMessage} />
          </section>

          <section className={`${ui.hojaPadded} flex flex-col gap-3`} aria-labelledby="registro">
            <h2 id="registro" className={ui.sectionTitle}>
              Registro
            </h2>
            <ActivityList events={record.events} showProspect={false} />
          </section>
        </div>
      </div>
    </>
  );
}
