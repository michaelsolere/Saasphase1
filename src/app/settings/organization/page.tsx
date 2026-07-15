import Link from "next/link";
import { redirect } from "next/navigation";

import {
  testOrganizationBrevoConnection,
  updateBrevoTransactionalTemplateId,
  updateOrganizationAnimalPrices,
  updateOrganizationDocumentSettings,
  updateOrganizationIdentity,
  upsertDefaultRepresentative,
} from "@/features/settings/actions";
import { brevoTransactionalTemplateConfigs } from "@/features/settings/brevo-template-registry";
import { OrganizationLogoSettings } from "@/features/settings/organization-logo-settings";
import { getBrevoConfigurationStatus } from "@/lib/brevo/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const legalFormOptions = [
  ["", "Non renseignée"],
  ["individual", "EI / entrepreneur individuel"],
  ["earl", "EARL"],
  ["company", "Société"],
  ["association", "Association"],
  ["other", "Autre structure"],
] as const;

type StatusValue = "success" | "error" | undefined;
type BrevoStatusValue =
  | "success"
  | "not_configured"
  | "unauthorized"
  | "timeout"
  | "error"
  | undefined;

function StatusMessage({
  value,
  success,
  error,
}: {
  value: StatusValue;
  success: string;
  error: string;
}) {
  if (!value) {
    return null;
  }

  const isSuccess = value === "success";

  return (
    <section
      role={isSuccess ? "status" : "alert"}
      className={`rounded-2xl border px-6 py-5 text-sm ${
        isSuccess
          ? "border-emerald-200 bg-emerald-50 text-emerald-950"
          : "border-amber-200 bg-amber-50 text-amber-950"
      }`}
    >
      {isSuccess ? success : error}
    </section>
  );
}

function BrevoStatusMessage({
  value,
}: {
  value: BrevoStatusValue;
}) {
  if (!value) {
    return null;
  }

  const isSuccess = value === "success";
  const messages = {
    success: "Connexion Brevo réussie.",
    not_configured: "La clé API Brevo n’est pas configurée côté serveur.",
    unauthorized: "Brevo a refusé l’accès. Vérifiez la clé API côté serveur.",
    timeout:
      "Brevo n’a pas répondu dans le délai prévu. Réessayez dans quelques instants.",
    error:
      "Erreur de connexion à Brevo. Aucune donnée Brevo n’a été modifiée.",
  };

  return (
    <section
      role={isSuccess ? "status" : "alert"}
      className={`rounded-2xl border px-6 py-5 text-sm ${
        isSuccess
          ? "border-emerald-200 bg-emerald-50 text-emerald-950"
          : "border-amber-200 bg-amber-50 text-amber-950"
      }`}
    >
      {messages[value]}
    </section>
  );
}

function Field({
  id,
  label,
  name,
  defaultValue,
  disabled,
  type = "text",
  autoComplete,
  inputMode,
}: {
  id: string;
  label: string;
  name: string;
  defaultValue?: string | null;
  disabled?: boolean;
  type?: string;
  autoComplete?: string;
  inputMode?: "decimal" | "numeric" | "text";
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="text-xs font-semibold uppercase tracking-wide text-muted"
      >
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        inputMode={inputMode}
        defaultValue={defaultValue ?? ""}
        disabled={disabled}
        className="mt-2 w-full rounded-xl border bg-background px-4 py-3 text-sm focus:border-accent focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
      />
    </div>
  );
}

function TextArea({
  id,
  label,
  name,
  defaultValue,
  disabled,
  rows = 4,
}: {
  id: string;
  label: string;
  name: string;
  defaultValue?: string | null;
  disabled?: boolean;
  rows?: number;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="text-xs font-semibold uppercase tracking-wide text-muted"
      >
        {label}
      </label>
      <textarea
        id={id}
        name={name}
        rows={rows}
        defaultValue={defaultValue ?? ""}
        disabled={disabled}
        className="mt-2 w-full rounded-xl border bg-background px-4 py-3 text-sm leading-6 focus:border-accent focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
      />
    </div>
  );
}

function SubmitRow({
  cancelHref,
  disabled,
  label,
}: {
  cancelHref: string;
  disabled: boolean;
  label: string;
}) {
  return (
    <div className="mt-8 flex flex-wrap items-center justify-end gap-4 border-t pt-6">
      <Link
        href={cancelHref}
        className="text-sm font-semibold text-muted hover:text-foreground hover:underline"
      >
        Annuler
      </Link>
      <button
        type="submit"
        disabled={disabled}
        className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {label}
      </button>
    </div>
  );
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Non renseignée";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatEuroInputValue(valueCents: number | null | undefined) {
  return valueCents === null || valueCents === undefined
    ? ""
    : (valueCents / 100).toFixed(2);
}

function formatAttemptStatus(status: string) {
  const labels: Record<string, string> = {
    pending: "En attente",
    sending: "En cours",
    sent: "Envoyé",
    failed: "Échec",
  };

  return labels[status] ?? status;
}

export default async function OrganizationSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    identity_status?: StatusValue;
    animal_prices_status?: StatusValue;
    representative_status?: StatusValue;
    document_settings_status?: StatusValue;
    brevo_templates_status?: StatusValue;
    brevo_status?: BrevoStatusValue;
    branding_status?: "success" | "removed" | "error";
  }>;
}) {
  const query = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: membership, error: membershipError } = await supabase
    .from("memberships")
    .select("organization_id, role")
    .eq("profile_id", user.id)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membershipError || !membership?.organization_id) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-5xl px-6 py-10 sm:px-10 lg:px-12">
        <Link href="/" className="text-sm font-medium text-accent hover:underline">
          Tableau de bord
        </Link>
        <section
          role="alert"
          className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 px-6 py-12 text-center text-amber-950"
        >
          <h1 className="text-xl font-semibold">
            Paramètres organisation indisponibles
          </h1>
          <p className="mt-2 text-sm">
            Aucune organisation active n’a été trouvée pour ce compte.
          </p>
        </section>
      </main>
    );
  }

  const canEdit = membership.role === "owner" || membership.role === "admin";
  const brevoConfiguration = getBrevoConfigurationStatus();

  const { data: organization, error: organizationError } = await supabase
    .from("organizations")
    .select(
      "id, name, legal_name, legal_form, email, phone, website_url, address_line1, address_line2, postal_code, city, country, siret, affix_name, dog_affix_name, cat_affix_name",
    )
    .eq("id", membership.organization_id)
    .is("deleted_at", null)
    .maybeSingle();

  const { data: representative } = await supabase
    .from("organization_representatives")
    .select(
      "id, first_name, last_name, display_name, representative_role, email, phone, is_default_signatory",
    )
    .eq("organization_id", membership.organization_id)
    .eq("is_default_signatory", true)
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle();

  const { data: documentSettings } = await supabase
    .from("organization_document_settings")
    .select(
      "mediator_name, mediator_contact, mediator_website_url, deposit_terms, refund_terms, postponement_terms, credit_terms, withholding_terms, reservation_contract_terms, commitment_certificate_text, legal_mentions, signature_city_default",
    )
    .eq("organization_id", membership.organization_id)
    .is("deleted_at", null)
    .maybeSingle();

  const { data: animalPriceSettings } = await supabase
    .from("organization_settings")
    .select(
      "default_male_puppy_price_cents, default_female_puppy_price_cents, default_puppy_price_cents",
    )
    .eq("organization_id", membership.organization_id)
    .is("deleted_at", null)
    .maybeSingle();

  const { data: activeLogo } = await supabase
    .from("organization_brand_assets")
    .select("id, created_at, width_px, height_px")
    .eq("organization_id", membership.organization_id)
    .eq("asset_type", "logo")
    .is("retired_at", null)
    .maybeSingle();

  const { data: emailDeliveryAttempts } = await supabase
    .from("email_delivery_attempts")
    .select(
      "id, created_at, message_type, recipient_email, recipient_name, status, attempt_count, sent_at",
    )
    .eq("organization_id", membership.organization_id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(10);

  const { data: brevoEmailTemplates } = await supabase
    .from("email_templates")
    .select("id, template_key, brevo_template_id, updated_at")
    .eq("organization_id", membership.organization_id)
    .in(
      "template_key",
      brevoTransactionalTemplateConfigs.map((config) => config.templateKey),
    )
    .eq("is_active", true)
    .is("deleted_at", null);

  if (organizationError || !organization) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-5xl px-6 py-10 sm:px-10 lg:px-12">
        <Link href="/" className="text-sm font-medium text-accent hover:underline">
          Tableau de bord
        </Link>
        <section
          role="alert"
          className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 px-6 py-12 text-center text-amber-950"
        >
          <h1 className="text-xl font-semibold">
            Impossible de charger l’organisation
          </h1>
          <p className="mt-2 text-sm">
            Réessayez dans quelques instants. Aucune donnée n’a été modifiée.
          </p>
        </section>
      </main>
    );
  }

  const diagnostics = [
    !organization.legal_form ? "Forme juridique non renseignée" : null,
    !organization.siret ? "SIRET ou identifiant légal non renseigné" : null,
    !organization.address_line1 || !organization.postal_code || !organization.city
      ? "Adresse de la structure incomplète"
      : null,
    !representative ? "Aucun représentant signataire par défaut" : null,
    !documentSettings?.mediator_name
      ? "Médiateur de la consommation non renseigné"
      : null,
    !documentSettings?.deposit_terms
      ? "Conditions d’arrhes non renseignées"
      : null,
  ].filter(Boolean) as string[];
  const brevoTemplatesByKey = new Map(
    (brevoEmailTemplates ?? []).map((template) => [
      template.template_key,
      template,
    ]),
  );
  const configuredBrevoTemplateCount = brevoTransactionalTemplateConfigs.filter(
    (config) => brevoTemplatesByKey.get(config.templateKey)?.brevo_template_id,
  ).length;

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-6 py-10 sm:px-10 lg:px-12">
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <Link href="/" className="text-sm font-medium text-accent hover:underline">
          Tableau de bord
        </Link>
      </div>

      <header className="mt-8 border-b pb-7">
        <p className="text-sm font-semibold uppercase tracking-wide text-accent">
          Paramètres · Organisation
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          Élevage, vendeur et documents
        </h1>
        <p className="mt-3 max-w-2xl leading-7 text-muted">
          Configurez les informations de structure, de signataire et de
          paramètres documentaires utilisées plus tard par les documents.
        </p>
        {!canEdit ? (
          <p className="mt-4 rounded-xl border bg-surface px-4 py-3 text-sm text-muted">
            Votre rôle actuel permet la consultation, mais pas la modification
            de ces paramètres.
          </p>
        ) : null}
      </header>

      <div className="mt-8 space-y-4">
        <StatusMessage
          value={query.identity_status}
          success="Les informations de l’élevage ont bien été mises à jour."
          error="Impossible de mettre à jour l’identité de l’élevage. Vérifiez les informations saisies."
        />
        <StatusMessage
          value={query.representative_status}
          success="Le représentant signataire a bien été enregistré."
          error="Impossible d’enregistrer le représentant signataire."
        />
        <StatusMessage
          value={query.animal_prices_status}
          success="Les tarifs des animaux ont bien été mis à jour."
          error="Impossible de mettre à jour les tarifs des animaux. Vérifiez les montants saisis."
        />
        <StatusMessage
          value={query.document_settings_status}
          success="Les paramètres documentaires ont bien été mis à jour."
          error="Impossible de mettre à jour les paramètres documentaires."
        />
        <StatusMessage
          value={query.brevo_templates_status}
          success="Le modèle transactionnel Brevo a bien été mis à jour."
          error="Impossible de mettre à jour le modèle transactionnel Brevo."
        />
        <BrevoStatusMessage value={query.brevo_status} />
        <StatusMessage
          value={query.branding_status === "removed" ? "success" : query.branding_status}
          success={query.branding_status === "removed" ? "Le logo actif a été retiré. Les versions précédentes et les PDF existants sont conservés." : "Le logo de l’organisation a bien été importé."}
          error="Impossible de modifier le logo. Vérifiez le format, les dimensions et la taille du fichier, puis réessayez."
        />
      </div>

      {diagnostics.length > 0 ? (
        <section className="mt-8 rounded-2xl border border-amber-200 bg-amber-50/60 p-6">
          <h2 className="text-sm font-semibold text-amber-950">
            Données à compléter
          </h2>
          <ul className="mt-3 list-inside list-disc space-y-1.5 text-sm text-amber-900">
            {diagnostics.map((diagnostic) => (
              <li key={diagnostic}>{diagnostic}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <OrganizationLogoSettings
        organizationId={organization.id}
        canEdit={canEdit}
        logo={activeLogo ? {
          id: activeLogo.id,
          createdAt: activeLogo.created_at,
          widthPx: activeLogo.width_px,
          heightPx: activeLogo.height_px,
        } : null}
      />

      <form
        id="animal-prices"
        action={updateOrganizationAnimalPrices}
        className="mt-8 rounded-2xl border bg-surface p-6 sm:p-8"
      >
        <input type="hidden" name="organization_id" value={organization.id} />
        <h2 className="text-xl font-semibold">Tarifs des animaux</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">
          Les tarifs mâle et femelle alimentent les propositions selon le sexe
          de l’animal ou la préférence du futur adoptant. Le tarif générique
          sert lorsqu’aucune préférence n’est exploitable ou lorsque le tarif
          sexué attendu manque.
        </p>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
          Ces paramètres actualisent uniquement les propositions informatives :
          ils ne modifient jamais automatiquement un prix convenu, un snapshot
          ou un PDF existant.
        </p>
        <div className="mt-6 grid gap-5 sm:grid-cols-3">
          <Field
            id="animal-male-price"
            label="Tarif mâle"
            name="male_price"
            inputMode="decimal"
            autoComplete="off"
            defaultValue={formatEuroInputValue(
              animalPriceSettings?.default_male_puppy_price_cents,
            )}
            disabled={!canEdit}
          />
          <Field
            id="animal-female-price"
            label="Tarif femelle"
            name="female_price"
            inputMode="decimal"
            autoComplete="off"
            defaultValue={formatEuroInputValue(
              animalPriceSettings?.default_female_puppy_price_cents,
            )}
            disabled={!canEdit}
          />
          <Field
            id="animal-generic-price"
            label="Tarif générique de secours"
            name="generic_price"
            inputMode="decimal"
            autoComplete="off"
            defaultValue={formatEuroInputValue(
              animalPriceSettings?.default_puppy_price_cents,
            )}
            disabled={!canEdit}
          />
        </div>
        <p className="mt-4 text-xs leading-5 text-muted">
          Montants en euros, avec au maximum deux décimales. Un champ vide
          retire le tarif correspondant.
        </p>
        <SubmitRow
          cancelHref="#animal-prices"
          disabled={!canEdit}
          label="Enregistrer les tarifs"
        />
      </form>

      <section className="mt-8 rounded-2xl border bg-surface p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">Connexion Brevo</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
              Brevo sera utilisé ultérieurement pour les campagnes et les
              e-mails. Dans ce premier lot, la clé API reste uniquement côté
              serveur : elle n’est ni affichée ni modifiable depuis
              l’application.
            </p>
          </div>
          <span
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${
              brevoConfiguration.isConfigured
                ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                : "border-amber-200 bg-amber-50 text-amber-950"
            }`}
          >
            {brevoConfiguration.isConfigured ? "Configuré" : "Non configuré"}
          </span>
        </div>

        <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-3">
          <div className="rounded-xl border bg-background px-4 py-3">
            <dt className="font-semibold text-foreground">Expéditeur</dt>
            <dd className="mt-1 text-muted">
              {brevoConfiguration.senderEmail
                ? "Renseigné côté serveur"
                : "Non renseigné"}
            </dd>
          </div>
          <div className="rounded-xl border bg-background px-4 py-3">
            <dt className="font-semibold text-foreground">Nom expéditeur</dt>
            <dd className="mt-1 text-muted">
              {brevoConfiguration.senderName
                ? "Renseigné côté serveur"
                : "Non renseigné"}
            </dd>
          </div>
          <div className="rounded-xl border bg-background px-4 py-3">
            <dt className="font-semibold text-foreground">Adresse de réponse</dt>
            <dd className="mt-1 text-muted">
              {brevoConfiguration.replyToEmail
                ? "Renseignée côté serveur"
                : "Non renseignée"}
            </dd>
          </div>
        </dl>

        {canEdit ? (
          <form action={testOrganizationBrevoConnection} className="mt-6">
            <button
              type="submit"
              className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
            >
              Tester la connexion Brevo
            </button>
          </form>
        ) : (
          <p className="mt-6 rounded-xl border bg-background px-4 py-3 text-sm text-muted">
            Votre rôle actuel permet la consultation de cette configuration,
            mais pas le test de connexion.
          </p>
        )}

        <section id="brevo-templates" className="mt-8 border-t pt-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold">
                Modèles transactionnels Brevo
              </h3>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
                Le contenu, le sujet, l’expéditeur et l’adresse de réponse des
                e-mails transactionnels restent configurés dans Brevo.
              </p>
            </div>
            <span
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                configuredBrevoTemplateCount === brevoTransactionalTemplateConfigs.length
                  ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                  : "border-amber-200 bg-amber-50 text-amber-950"
              }`}
            >
              {configuredBrevoTemplateCount} /{" "}
              {brevoTransactionalTemplateConfigs.length} configurés
            </span>
          </div>

          <div className="mt-5 grid gap-4">
            {brevoTransactionalTemplateConfigs.map((config) => {
              const template = brevoTemplatesByKey.get(config.templateKey);
              const configured = Boolean(template?.brevo_template_id);

              return (
                <form
                  key={config.templateKey}
                  action={updateBrevoTransactionalTemplateId}
                  className="rounded-xl border bg-background p-4"
                >
                  <input
                    type="hidden"
                    name="organization_id"
                    value={organization.id}
                  />
                  <input
                    type="hidden"
                    name="template_key"
                    value={config.templateKey}
                  />
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-semibold">{config.title}</h4>
                      <p className="mt-1 font-mono text-xs text-muted">
                        {config.templateKey}
                      </p>
                    </div>
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                        configured
                          ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                          : "border-amber-200 bg-amber-50 text-amber-950"
                      }`}
                    >
                      {configured ? "Configuré" : "Non configuré"}
                    </span>
                  </div>
                  <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                    <Field
                      id={`${config.templateKey}-brevo-template-id`}
                      name="brevo_template_id"
                      label="Identifiant numérique Brevo"
                      type="number"
                      defaultValue={template?.brevo_template_id?.toString() ?? ""}
                      disabled={!canEdit}
                    />
                    <button
                      type="submit"
                      disabled={!canEdit}
                      className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Enregistrer
                    </button>
                  </div>
                  <p className="mt-3 text-xs text-muted">
                    Dernière mise à jour :{" "}
                    {template?.updated_at
                      ? formatDateTime(template.updated_at)
                      : "Non renseignée"}
                  </p>
                </form>
              );
            })}
          </div>
        </section>

        <section className="mt-8 border-t pt-6">
          <h3 className="text-base font-semibold">Dernières tentatives d’e-mail</h3>
          {emailDeliveryAttempts && emailDeliveryAttempts.length > 0 ? (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th scope="col" className="py-3 pr-4 font-semibold">
                      Préparation
                    </th>
                    <th scope="col" className="px-4 py-3 font-semibold">
                      Type
                    </th>
                    <th scope="col" className="px-4 py-3 font-semibold">
                      Destinataire
                    </th>
                    <th scope="col" className="px-4 py-3 font-semibold">
                      Statut
                    </th>
                    <th scope="col" className="px-4 py-3 font-semibold">
                      Tentatives
                    </th>
                    <th scope="col" className="py-3 pl-4 font-semibold">
                      Envoi
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {emailDeliveryAttempts.map((attempt) => (
                    <tr key={attempt.id}>
                      <td className="py-3 pr-4 align-top text-muted">
                        {formatDateTime(attempt.created_at)}
                      </td>
                      <td className="px-4 py-3 align-top font-medium">
                        {attempt.message_type}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <span className="block font-medium">
                          {attempt.recipient_name || attempt.recipient_email}
                        </span>
                        {attempt.recipient_name ? (
                          <span className="mt-1 block text-muted">
                            {attempt.recipient_email}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 align-top">
                        {formatAttemptStatus(attempt.status)}
                      </td>
                      <td className="px-4 py-3 align-top">
                        {attempt.attempt_count}
                      </td>
                      <td className="py-3 pl-4 align-top text-muted">
                        {formatDateTime(attempt.sent_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-4 rounded-xl border bg-background px-4 py-3 text-sm text-muted">
              Aucune tentative d’e-mail enregistrée pour cette organisation.
            </p>
          )}
        </section>
      </section>

      <form
        action={updateOrganizationIdentity}
        className="mt-8 rounded-2xl border bg-surface p-6 sm:p-8"
      >
        <input type="hidden" name="organization_id" value={organization.id} />
        <h2 className="text-xl font-semibold">Identité élevage</h2>
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <Field
            id="organization-name"
            label="Nom commercial"
            name="name"
            defaultValue={organization.name}
            disabled={!canEdit}
          />
          <Field
            id="organization-legal-name"
            label="Raison sociale"
            name="legal_name"
            defaultValue={organization.legal_name}
            disabled={!canEdit}
          />
          <Field
            id="organization-email"
            label="Email public"
            name="email"
            type="email"
            autoComplete="email"
            defaultValue={organization.email}
            disabled={!canEdit}
          />
          <Field
            id="organization-phone"
            label="Téléphone public"
            name="phone"
            type="tel"
            autoComplete="tel"
            defaultValue={organization.phone}
            disabled={!canEdit}
          />
          <Field
            id="organization-website"
            label="Site"
            name="website_url"
            type="url"
            defaultValue={organization.website_url}
            disabled={!canEdit}
          />
          <Field
            id="organization-siret"
            label="SIRET / identifiant"
            name="siret"
            defaultValue={organization.siret}
            disabled={!canEdit}
          />
          <div>
            <label
              htmlFor="organization-legal-form"
              className="text-xs font-semibold uppercase tracking-wide text-muted"
            >
              Forme juridique
            </label>
            <select
              id="organization-legal-form"
              name="legal_form"
              defaultValue={organization.legal_form ?? ""}
              disabled={!canEdit}
              className="mt-2 w-full rounded-xl border bg-background px-4 py-3 text-sm focus:border-accent focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
            >
              {legalFormOptions.map(([value, label]) => (
                <option key={value || "empty"} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <Field
            id="organization-address-line1"
            label="Adresse ligne 1"
            name="address_line1"
            autoComplete="address-line1"
            defaultValue={organization.address_line1}
            disabled={!canEdit}
          />
          <Field
            id="organization-address-line2"
            label="Adresse ligne 2"
            name="address_line2"
            autoComplete="address-line2"
            defaultValue={organization.address_line2}
            disabled={!canEdit}
          />
          <Field
            id="organization-postal-code"
            label="Code postal"
            name="postal_code"
            autoComplete="postal-code"
            defaultValue={organization.postal_code}
            disabled={!canEdit}
          />
          <Field
            id="organization-city"
            label="Ville"
            name="city"
            autoComplete="address-level2"
            defaultValue={organization.city}
            disabled={!canEdit}
          />
          <Field
            id="organization-country"
            label="Pays"
            name="country"
            autoComplete="country"
            defaultValue={organization.country}
            disabled={!canEdit}
          />
          <Field
            id="organization-affix"
            label="Affixe"
            name="affix_name"
            defaultValue={organization.affix_name}
            disabled={!canEdit}
          />
          <Field
            id="organization-dog-affix"
            label="Affixe chien"
            name="dog_affix_name"
            defaultValue={organization.dog_affix_name}
            disabled={!canEdit}
          />
          <Field
            id="organization-cat-affix"
            label="Affixe chat"
            name="cat_affix_name"
            defaultValue={organization.cat_affix_name}
            disabled={!canEdit}
          />
        </div>
        <SubmitRow
          cancelHref="/"
          disabled={!canEdit}
          label="Enregistrer l’identité"
        />
      </form>

      <form
        action={upsertDefaultRepresentative}
        className="mt-8 rounded-2xl border bg-surface p-6 sm:p-8"
      >
        <input type="hidden" name="organization_id" value={organization.id} />
        <h2 className="text-xl font-semibold">Représentant / signataire</h2>
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <Field
            id="representative-first-name"
            label="Prénom"
            name="first_name"
            autoComplete="given-name"
            defaultValue={representative?.first_name}
            disabled={!canEdit}
          />
          <Field
            id="representative-last-name"
            label="Nom"
            name="last_name"
            autoComplete="family-name"
            defaultValue={representative?.last_name}
            disabled={!canEdit}
          />
          <Field
            id="representative-display-name"
            label="Nom affichable"
            name="display_name"
            autoComplete="name"
            defaultValue={representative?.display_name}
            disabled={!canEdit}
          />
          <Field
            id="representative-role"
            label="Qualité"
            name="representative_role"
            defaultValue={representative?.representative_role}
            disabled={!canEdit}
          />
          <Field
            id="representative-email"
            label="Email"
            name="representative_email"
            type="email"
            autoComplete="email"
            defaultValue={representative?.email}
            disabled={!canEdit}
          />
          <Field
            id="representative-phone"
            label="Téléphone"
            name="representative_phone"
            type="tel"
            autoComplete="tel"
            defaultValue={representative?.phone}
            disabled={!canEdit}
          />
          <div className="sm:col-span-2 rounded-xl border bg-background px-4 py-3 text-sm text-muted">
            Ce représentant sera utilisé comme signataire par défaut en Phase 1.
          </div>
        </div>
        <SubmitRow
          cancelHref="/"
          disabled={!canEdit}
          label="Enregistrer le signataire"
        />
      </form>

      <form
        action={updateOrganizationDocumentSettings}
        className="mt-8 rounded-2xl border bg-surface p-6 sm:p-8"
      >
        <input type="hidden" name="organization_id" value={organization.id} />
        <h2 className="text-xl font-semibold">Médiateur</h2>
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <Field
            id="mediator-name"
            label="Nom"
            name="mediator_name"
            defaultValue={documentSettings?.mediator_name}
            disabled={!canEdit}
          />
          <Field
            id="mediator-website"
            label="Site"
            name="mediator_website_url"
            type="url"
            defaultValue={documentSettings?.mediator_website_url}
            disabled={!canEdit}
          />
          <div className="sm:col-span-2">
            <TextArea
              id="mediator-contact"
              label="Contact"
              name="mediator_contact"
              defaultValue={documentSettings?.mediator_contact}
              disabled={!canEdit}
              rows={3}
            />
          </div>
        </div>

        <h2 className="mt-10 text-xl font-semibold">
          Conditions documentaires
        </h2>
        <div className="mt-6 grid gap-5">
          <TextArea
            id="deposit-terms"
            label="Arrhes"
            name="deposit_terms"
            defaultValue={documentSettings?.deposit_terms}
            disabled={!canEdit}
          />
          <TextArea
            id="refund-terms"
            label="Remboursement"
            name="refund_terms"
            defaultValue={documentSettings?.refund_terms}
            disabled={!canEdit}
          />
          <TextArea
            id="postponement-terms"
            label="Report"
            name="postponement_terms"
            defaultValue={documentSettings?.postponement_terms}
            disabled={!canEdit}
          />
          <TextArea
            id="credit-terms"
            label="Avoir"
            name="credit_terms"
            defaultValue={documentSettings?.credit_terms}
            disabled={!canEdit}
          />
          <TextArea
            id="withholding-terms"
            label="Retenue"
            name="withholding_terms"
            defaultValue={documentSettings?.withholding_terms}
            disabled={!canEdit}
          />
          <TextArea
            id="reservation-contract-terms"
            label="Clauses contrat de réservation"
            name="reservation_contract_terms"
            defaultValue={documentSettings?.reservation_contract_terms}
            disabled={!canEdit}
          />
          <TextArea
            id="commitment-certificate-text"
            label="Texte certificat d’engagement"
            name="commitment_certificate_text"
            defaultValue={documentSettings?.commitment_certificate_text}
            disabled={!canEdit}
          />
          <TextArea
            id="legal-mentions"
            label="Mentions légales"
            name="legal_mentions"
            defaultValue={documentSettings?.legal_mentions}
            disabled={!canEdit}
          />
          <Field
            id="signature-city"
            label="Ville de signature par défaut"
            name="signature_city_default"
            defaultValue={documentSettings?.signature_city_default}
            disabled={!canEdit}
          />
        </div>
        <SubmitRow
          cancelHref="/"
          disabled={!canEdit}
          label="Enregistrer les paramètres"
        />
      </form>
    </main>
  );
}
