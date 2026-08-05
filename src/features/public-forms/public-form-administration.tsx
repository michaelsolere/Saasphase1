import Link from "next/link";

import { PublicFormShare } from "@/features/public-forms/public-form-share";

import { buildPublicApplicationPath } from "./core";

type PublicFormLifecycleStatus = "draft" | "published" | "withdrawn";

type FormAction = (formData: FormData) => void | Promise<void>;

export type PublicFormHistoryRow = {
  event_type: "published" | "withdrawn" | "reactivated";
  version_no: number | null;
  occurred_at: string;
  actor_name: string;
};

export type PublicFormAdministrationModel = {
  id: string;
  internalName: string;
  slug: string;
  title: string;
  description: string;
  successMessage: string;
  breed: string;
  lifecycleStatus: PublicFormLifecycleStatus;
  draftRevision: number;
  publishedVersionNo: number | null;
};

type PublicFormAdministrationProps = {
  canManage: boolean;
  canShare: boolean;
  organizationSlug: string;
  form: PublicFormAdministrationModel | null;
  history: PublicFormHistoryRow[];
  feedback?: { tone: "success" | "warning" | "error"; message: string };
  saveAction: FormAction;
  lifecycleAction: FormAction;
};

const stateLabel: Record<PublicFormLifecycleStatus, string> = {
  draft: "Brouillon",
  published: "Publié",
  withdrawn: "Retiré",
};

const eventLabel: Record<PublicFormHistoryRow["event_type"], string> = {
  published: "Publication",
  withdrawn: "Retrait",
  reactivated: "Réactivation",
};

export function PublicFormAdministration({
  canManage,
  canShare,
  organizationSlug,
  form,
  history,
  feedback,
  saveAction,
  lifecycleAction,
}: PublicFormAdministrationProps) {
  const slug = form?.slug ?? "candidature";
  const lifecycleStatus = form?.lifecycleStatus ?? "draft";

  return (
    <main className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-950">Formulaire public</h1>
        <p className="mt-1 text-sm text-slate-600">
          Préparez l’adresse générique que vous transmettrez aux familles avant tout contact.
        </p>
      </header>

      {feedback ? (
        <div
          role={feedback.tone === "error" ? "alert" : "status"}
          className={
            feedback.tone === "success"
              ? "rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950"
              : feedback.tone === "warning"
                ? "rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"
                : "rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-950"
          }
        >
          {feedback.message}
        </div>
      ) : null}

      {!canManage ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          Vous pouvez consulter ce formulaire, mais seuls un propriétaire ou un administrateur peuvent le modifier.
        </div>
      ) : null}

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-slate-950">État et diffusion</h2>
            <p className="mt-1 text-sm text-slate-600">
              État actuel : <strong>{stateLabel[lifecycleStatus]}</strong>
              {form?.publishedVersionNo ? ` · version publique n°${form.publishedVersionNo}` : ""}
            </p>
          </div>
          {form && canShare ? (
            <PublicFormShare path={buildPublicApplicationPath(organizationSlug, slug)} />
          ) : null}
        </div>

        {canManage && form ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {lifecycleStatus === "draft" ? (
              <form action={lifecycleAction}>
                <LifecycleFields form={form} operation="publish" />
                <button className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white">Publier</button>
              </form>
            ) : null}
            {lifecycleStatus === "published" ? (
              <>
                <form action={lifecycleAction}>
                  <LifecycleFields form={form} operation="publish" />
                  <button className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white">
                    Publier une nouvelle version
                  </button>
                </form>
                <form action={lifecycleAction}>
                  <LifecycleFields form={form} operation="withdraw" />
                  <button className="rounded-md border border-rose-300 px-4 py-2 text-sm font-medium text-rose-800">
                    Retirer le formulaire
                  </button>
                </form>
              </>
            ) : null}
            {lifecycleStatus === "withdrawn" ? (
              <form action={lifecycleAction}>
                <LifecycleFields form={form} operation="reactivate" />
                <button className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white">Réactiver</button>
              </form>
            ) : null}
          </div>
        ) : null}
      </section>

      <form action={saveAction} className="space-y-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <input type="hidden" name="expected_revision" value={form?.draftRevision ?? 0} />
        <div>
          <h2 className="font-semibold text-slate-950">Contenu du formulaire</h2>
          <p className="mt-1 text-sm text-slate-600">Les questions métier restent communes à tous les élevages.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Nom interne" name="name" defaultValue={form?.internalName ?? "Candidature générale"} disabled={!canManage} />
          <Field
            label="Adresse courte"
            name="slug"
            defaultValue={slug}
            disabled={!canManage}
            readOnly={Boolean(form?.publishedVersionNo)}
          />
        </div>
        <Field label="Titre présenté aux familles" name="title" defaultValue={form?.title ?? "Présentez-nous votre projet"} disabled={!canManage} />
        <TextArea label="Texte d’introduction" name="description" defaultValue={form?.description ?? "Parlez-nous de votre projet afin que nous puissions préparer un premier échange."} disabled={!canManage} />
        <TextArea label="Message après envoi" name="success_message" defaultValue={form?.successMessage ?? "Merci, votre candidature a bien été transmise et sera relue avec attention."} disabled={!canManage} />
        <Field label="Race concernée" name="breed" defaultValue={form?.breed ?? "Golden Retriever"} disabled={!canManage} />
        {canManage ? (
          <button className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white">Enregistrer le brouillon</button>
        ) : null}
      </form>

      <details className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <summary className="cursor-pointer font-semibold text-slate-950">Prévisualiser le brouillon enregistré</summary>
        <div className="mx-auto mt-5 max-w-2xl rounded-2xl border border-slate-200 bg-slate-50 p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Candidature · {form?.breed ?? "Golden Retriever"}</p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-950">{form?.title ?? "Présentez-nous votre projet"}</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">{form?.description ?? "Parlez-nous de votre projet afin que nous puissions préparer un premier échange."}</p>
          <div className="mt-5 rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">
            Les coordonnées, le foyer et le projet d’adoption apparaîtront ici avec les questions fixes du formulaire public.
          </div>
        </div>
      </details>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-slate-950">Historique de diffusion</h2>
        {history.length ? (
          <ol className="mt-4 divide-y divide-slate-100">
            {history.map((event) => (
              <li key={`${event.occurred_at}-${event.event_type}`} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                <span className="font-medium text-slate-900">
                  {eventLabel[event.event_type]}
                  {event.version_no ? ` · version n°${event.version_no}` : ""}
                </span>
                <span className="text-slate-500">
                  {event.actor_name} · {new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.occurred_at))}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-2 text-sm text-slate-600">Aucune publication pour le moment.</p>
        )}
      </section>

      <p className="text-sm text-slate-600">
        Les candidatures reçues restent traitées dans la <Link href="/form-submissions" className="font-medium text-slate-900 underline">file des soumissions</Link>.
      </p>
    </main>
  );
}

function Field({
  label,
  name,
  defaultValue,
  disabled,
  readOnly = false,
}: {
  label: string;
  name: string;
  defaultValue: string;
  disabled: boolean;
  readOnly?: boolean;
}) {
  return (
    <label className="block text-sm font-medium text-slate-800">
      {label}
      <input
        name={name}
        defaultValue={defaultValue}
        disabled={disabled}
        readOnly={readOnly}
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-950 read-only:bg-slate-100 disabled:bg-slate-100"
      />
    </label>
  );
}

function TextArea({ label, name, defaultValue, disabled }: { label: string; name: string; defaultValue: string; disabled: boolean }) {
  return (
    <label className="block text-sm font-medium text-slate-800">
      {label}
      <textarea name={name} defaultValue={defaultValue} disabled={disabled} rows={4} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-950 disabled:bg-slate-100" />
    </label>
  );
}

function LifecycleFields({
  form,
  operation,
}: {
  form: PublicFormAdministrationModel;
  operation: "publish" | "withdraw" | "reactivate";
}) {
  return (
    <>
      <input type="hidden" name="expected_revision" value={form.draftRevision} />
      <input type="hidden" name="operation" value={operation} />
    </>
  );
}
