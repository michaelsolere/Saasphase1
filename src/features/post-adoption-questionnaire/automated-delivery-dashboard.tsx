import Link from "next/link";

import {
  activatePostAdoptionAutomationAction,
  decidePostAdoptionAutomationExceptionAction,
} from "./automated-delivery-admin-actions";
import type { PostAdoptionAutomationOverviewRow } from "./automated-delivery-admin";

const reasonLabels: Record<string, string> = {
  birth_date_missing: "Date de naissance manquante",
  t1_age_limit_exceeded: "Le T1 dépasserait les 5 mois du chien",
  t2_due_before_adoption: "Le chien avait déjà dépassé 15 mois lors de l’adoption",
  t2_automatic_catchup_expired: "Le délai de rattrapage automatique du T2 est dépassé",
  legacy_not_automated: "Questionnaire antérieur à l’activation",
  legacy_access_preserved: "Lien existant conservé sans relance automatique",
  member_decision: "Classé non applicable par un responsable",
  member_suspended: "Suspendu volontairement par un responsable",
  questionnaire_incident: "Suspendu par un incident du parcours adoptant",
};

const stateLabels: Record<string, string> = {
  scheduled: "Programmé",
  active: "Invitation envoyée",
  suspended: "Suspendu",
  non_applicable: "Non applicable",
  completed: "Terminé",
  legacy_access_preserved: "Lien existant conservé",
};

const dispatchLabels: Record<string, string> = {
  pending: "En attente",
  claimed: "En cours",
  accepted: "Accepté par Brevo",
  retryable: "À reprendre automatiquement",
  uncertain: "Résultat incertain",
  cancelled: "Annulé",
};

const errorLabels: Record<string, string> = {
  recipient_email_missing: "Adresse email absente ou invalide",
  template_missing: "Modèle Brevo non configuré",
  template_inactive: "Modèle Brevo inactif",
  rate_limited: "Brevo demande de réessayer plus tard",
  provider_unavailable: "Brevo est temporairement indisponible",
  timeout: "La réponse de Brevo est incertaine",
  context_missing: "Données du dossier incomplètes",
  response_or_window_closed: "Réponse reçue ou délai fermé",
};

function formatDate(value: string | null) {
  if (!value) return "Date à définir";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Europe/Paris",
  }).format(new Date(value));
}

function AutomationCard({
  row,
  canDecide,
}: {
  row: PostAdoptionAutomationOverviewRow;
  canDecide: boolean;
}) {
  const requiresDecision =
    (row.automationState === "suspended" && row.reasonCode !== "questionnaire_incident")
    || row.lastDispatchStatus === "uncertain";
  const uncertain = row.lastDispatchStatus === "uncertain";
  const memberSuspended = row.reasonCode === "member_suspended";
  const canSuspend = canDecide && !uncertain && ["scheduled", "active"].includes(row.automationState);
  const stateLabel = uncertain ? "À vérifier" : stateLabels[row.automationState] ?? row.automationState;
  return (
    <article className="rounded-2xl border bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-accent">
            {row.milestone.toUpperCase()}
          </p>
          <h3 className="mt-1 text-lg font-semibold">{row.animalName}</h3>
          <p className="text-sm text-muted">Famille : {row.contactName}</p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${uncertain ? "border-amber-200 bg-amber-50 text-amber-950" : ""}`}>
          {stateLabel}
        </span>
      </div>
      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        <div><dt className="text-muted">Échéance</dt><dd>{formatDate(row.scheduledAt)}</dd></div>
        <div><dt className="text-muted">Dernier envoi</dt><dd>{row.lastDispatchStatus ? dispatchLabels[row.lastDispatchStatus] ?? "État technique à vérifier" : "Aucune tentative"}</dd></div>
      </dl>
      {row.reasonCode || row.lastErrorCode ? (
        <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-950">
          {row.reasonCode ? reasonLabels[row.reasonCode] ?? "Une décision est nécessaire" : "Une anomalie empêche l’envoi"}
          {row.lastErrorCode ? ` · ${errorLabels[row.lastErrorCode] ?? "Une anomalie technique doit être vérifiée"}` : ""}
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-4 text-sm font-semibold text-accent">
        <Link href={`/reservations/${row.reservationId}`}>Ouvrir le parcours adoptant</Link>
        <Link href={`/post-adoption/animals/${row.animalId}`}>Voir les réponses</Link>
      </div>
      {requiresDecision && canDecide ? (
        <form action={decidePostAdoptionAutomationExceptionAction} className="mt-5 border-t pt-5">
          <input type="hidden" name="organization_id" value={row.organizationId} />
          <input type="hidden" name="instance_id" value={row.instanceId} />
          <label className="block text-sm font-semibold" htmlFor={`reason-${row.instanceId}`}>
            Justification de la décision
          </label>
          <textarea
            id={`reason-${row.instanceId}`}
            name="reason"
            required
            minLength={10}
            maxLength={2000}
            rows={3}
            className="mt-2 w-full rounded-xl border bg-background px-3 py-2 text-sm"
            placeholder={uncertain ? "Expliquez pourquoi une nouvelle tentative peut être autorisée." : "Expliquez pourquoi cet envoi tardif reste pertinent ou doit être clos."}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button name="decision" value={uncertain ? "authorize_retry" : memberSuspended ? "resume" : "authorize_late_send"} className="rounded-xl bg-foreground px-4 py-2 text-sm font-semibold text-background">
              {uncertain ? "Autoriser une nouvelle tentative" : memberSuspended ? "Reprendre le suivi" : "Autoriser l’envoi exceptionnel"}
            </button>
            <button name="decision" value="non_applicable" className="rounded-xl border px-4 py-2 text-sm font-semibold">
              Classer non applicable
            </button>
          </div>
        </form>
      ) : null}
      {canSuspend ? (
        <details className="mt-5 border-t pt-4">
          <summary className="cursor-pointer text-sm font-semibold text-muted">
            Suspendre exceptionnellement ce suivi
          </summary>
          <form action={decidePostAdoptionAutomationExceptionAction} className="mt-3">
            <input type="hidden" name="organization_id" value={row.organizationId} />
            <input type="hidden" name="instance_id" value={row.instanceId} />
            <label className="block text-sm font-semibold" htmlFor={`suspend-reason-${row.instanceId}`}>
              Motif de la suspension
            </label>
            <textarea
              id={`suspend-reason-${row.instanceId}`}
              name="reason"
              required
              minLength={10}
              maxLength={2000}
              rows={3}
              className="mt-2 w-full rounded-xl border bg-background px-3 py-2 text-sm"
            />
            <button name="decision" value="suspend" className="mt-3 rounded-xl border px-4 py-2 text-sm font-semibold">
              Suspendre le suivi
            </button>
          </form>
        </details>
      ) : null}
    </article>
  );
}

export function PostAdoptionAutomatedDeliveryDashboard({
  dashboard,
  automationStatus,
  exceptionStatus,
}: {
  dashboard: {
    organizationId: string | null;
    organizationName: string | null;
    organizations: Array<{ id: string; name: string }>;
    activatedAt: string | null;
    timezone: string;
    missingTemplates: readonly string[];
    environment: Record<string, boolean>;
    ready: boolean;
    canDecide: boolean;
    rows: PostAdoptionAutomationOverviewRow[];
  };
  automationStatus?: string;
  exceptionStatus?: string;
}) {
  if (!dashboard.organizationId) {
    return (
      <section className="border-b py-8" aria-labelledby="post-adoption-organization-heading">
        <h2 id="post-adoption-organization-heading" className="text-xl font-semibold">
          Choisir l’organisation à piloter
        </h2>
        <p className="mt-2 text-sm text-muted">
          Votre compte appartient à plusieurs organisations. Choisissez celle dont vous souhaitez consulter et administrer le suivi.
        </p>
        <form method="get" className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="text-sm font-semibold">
            Organisation
            <select name="organization" required className="mt-1 block w-full rounded-xl border bg-background px-3 py-2 font-normal">
              <option value="">Sélectionner…</option>
              {dashboard.organizations.map((organization) => (
                <option key={organization.id} value={organization.id}>{organization.name}</option>
              ))}
            </select>
          </label>
          <button className="rounded-xl bg-foreground px-4 py-2 text-sm font-semibold text-background">
            Ouvrir le suivi
          </button>
        </form>
      </section>
    );
  }
  const message = automationStatus === "success"
    ? "Les envois automatiques sont activés. Les questionnaires antérieurs ont été classés selon la règle validée."
    : exceptionStatus === "success"
      ? "La décision exceptionnelle a été enregistrée et historisée."
      : automationStatus || exceptionStatus
        ? "L’action n’a pas pu être appliquée. Vérifiez la configuration et vos droits."
        : null;
  return (
    <section className="border-b py-8" aria-labelledby="post-adoption-automation-heading">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-accent">Pilotage</p>
          <h2 id="post-adoption-automation-heading" className="mt-1 text-2xl font-semibold">
            Invitations T1/T2 automatiques
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
            Les envois ordinaires ne demandent aucun clic. Cette vue présente les échéances et les exceptions à traiter.
          </p>
          <p className="mt-1 text-xs font-medium text-muted">
            Organisation pilotée : {dashboard.organizationName}
          </p>
          {dashboard.organizations.length > 1 ? (
            <form method="get" className="mt-3 flex flex-wrap items-end gap-2">
              <label className="text-xs font-semibold text-muted">
                Changer d’organisation
                <select name="organization" defaultValue={dashboard.organizationId} className="mt-1 block rounded-lg border bg-background px-2 py-1.5 text-sm font-normal text-foreground">
                  {dashboard.organizations.map((organization) => (
                    <option key={organization.id} value={organization.id}>{organization.name}</option>
                  ))}
                </select>
              </label>
              <button className="rounded-lg border px-3 py-1.5 text-sm font-semibold">Afficher</button>
            </form>
          ) : null}
        </div>
        {dashboard.activatedAt ? (
          <span className="self-start rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-950">
            Activé
          </span>
        ) : null}
      </div>
      {message ? (
        <p role={automationStatus === "success" || exceptionStatus === "success" ? "status" : "alert"} className="mt-5 rounded-xl border bg-background px-4 py-3 text-sm">
          {message}
        </p>
      ) : null}
      {!dashboard.activatedAt ? (
        <div className="mt-6 rounded-2xl border bg-surface p-5">
          <h3 className="font-semibold">Contrôles avant activation</h3>
          <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <li>{dashboard.missingTemplates.length === 0 ? "✓" : "○"} Quatre modèles Brevo configurés</li>
            <li>{dashboard.environment.brevo ? "✓" : "○"} Connexion Brevo</li>
            <li>{dashboard.environment.encryption ? "✓" : "○"} Chiffrement des liens</li>
            <li>{dashboard.environment.publicBaseUrl ? "✓" : "○"} Adresse publique du questionnaire</li>
            <li>{dashboard.environment.cronSecret ? "✓" : "○"} Secret du moteur planifié</li>
            <li>✓ Fuseau horaire : {dashboard.timezone}</li>
          </ul>
          {dashboard.canDecide ? (
            <form action={activatePostAdoptionAutomationAction} className="mt-5">
              <input type="hidden" name="organization_id" value={dashboard.organizationId} />
              <input type="hidden" name="timezone" value="Europe/Paris" />
              <button disabled={!dashboard.ready} className="rounded-xl bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:cursor-not-allowed disabled:opacity-40">
                Activer les envois automatiques
              </button>
              <p className="mt-2 text-xs text-muted">
                Les questionnaires jamais envoyés avant l’activation seront clos sans campagne rétroactive.
              </p>
            </form>
          ) : (
            <p className="mt-4 text-sm text-muted">Seuls le propriétaire et les administrateurs peuvent activer ce dispositif.</p>
          )}
        </div>
      ) : null}
      {dashboard.rows.length === 0 ? (
        <p className="mt-6 rounded-2xl border bg-surface p-5 text-sm text-muted">
          Aucune échéance automatisée n’est encore enregistrée.
        </p>
      ) : (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {dashboard.rows.map((row) => (
            <AutomationCard key={row.instanceId} row={row} canDecide={dashboard.canDecide} />
          ))}
        </div>
      )}
    </section>
  );
}
