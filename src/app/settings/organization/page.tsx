import Link from "next/link";
import { redirect } from "next/navigation";

import {
  updateOrganizationDocumentSettings,
  updateOrganizationIdentity,
  upsertDefaultRepresentative,
} from "@/features/settings/actions";
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

function Field({
  id,
  label,
  name,
  defaultValue,
  disabled,
  type = "text",
  autoComplete,
}: {
  id: string;
  label: string;
  name: string;
  defaultValue?: string | null;
  disabled?: boolean;
  type?: string;
  autoComplete?: string;
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

export default async function OrganizationSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    identity_status?: StatusValue;
    representative_status?: StatusValue;
    document_settings_status?: StatusValue;
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
          value={query.document_settings_status}
          success="Les paramètres documentaires ont bien été mis à jour."
          error="Impossible de mettre à jour les paramètres documentaires."
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
