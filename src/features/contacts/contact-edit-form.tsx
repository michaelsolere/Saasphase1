"use client";

import Link from "next/link";
import type { Ref } from "react";
import { useActionState, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  updateContact,
  type ContactEditActionState,
} from "@/features/contacts/actions";
import {
  CONTACT_EDIT_NO_EMAIL_VALUE,
  CONTACT_TYPES,
} from "@/features/contacts/contact-form-core";

type EditableContact = {
  id: string;
  contact_type: string;
  first_name: string | null;
  last_name: string | null;
  family_or_structure_name: string | null;
  display_name: string;
  email: string | null;
  phone: string | null;
  secondary_phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  postal_code: string | null;
  city: string | null;
  country: string;
};

const contactTypeLabels: Record<string, string> = {
  person: "Personne",
  family: "Famille",
  organization: "Structure",
  professional: "Professionnel",
  other: "Autre",
};

const inputClass =
  "mt-2 w-full rounded-xl border bg-background px-4 py-3 text-sm focus:border-accent focus:outline-none";
const labelClass = "text-xs font-semibold uppercase tracking-wide text-muted";

function SubmitButton({
  duplicateWarning,
}: {
  duplicateWarning: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending
        ? "Enregistrement..."
        : duplicateWarning
          ? "Enregistrer malgré l’avertissement"
          : "Enregistrer"}
    </button>
  );
}

function TextField({
  id,
  label,
  name,
  defaultValue,
  type = "text",
  autoComplete,
  inputRef,
}: {
  id: string;
  label: string;
  name: string;
  defaultValue: string;
  type?: string;
  autoComplete?: string;
  inputRef?: Ref<HTMLInputElement>;
}) {
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        ref={inputRef}
        className={inputClass}
      />
    </div>
  );
}

function normalizeEmailForComparison(value: string | null) {
  const trimmed = value?.trim().toLowerCase() ?? "";

  return trimmed || null;
}

function hasValidEmailSyntax(value: string | null) {
  return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function ContactEditForm({ contact }: { contact: EditableContact }) {
  const initialState: ContactEditActionState = { status: "idle" };
  const [state, formAction] = useActionState(updateContact, initialState);
  const [showEmailConfirmation, setShowEmailConfirmation] = useState(false);
  const [confirmedEmailValue, setConfirmedEmailValue] = useState<string | null>(
    null,
  );
  const [
    invalidatedDuplicateWarningToken,
    setInvalidatedDuplicateWarningToken,
  ] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const duplicateWarning =
    state.status === "duplicate_warning" &&
    state.duplicateWarningToken !== invalidatedDuplicateWarningToken;
  const fields = useMemo(
    () => ({
      contact_type: state.fields?.contact_type ?? contact.contact_type,
      first_name: state.fields?.first_name ?? contact.first_name ?? "",
      last_name: state.fields?.last_name ?? contact.last_name ?? "",
      family_or_structure_name:
        state.fields?.family_or_structure_name ??
        contact.family_or_structure_name ??
        "",
      display_name: state.fields?.display_name ?? contact.display_name ?? "",
      email: state.fields?.email ?? contact.email ?? "",
      phone: state.fields?.phone ?? contact.phone ?? "",
      secondary_phone:
        state.fields?.secondary_phone ?? contact.secondary_phone ?? "",
      address_line1: state.fields?.address_line1 ?? contact.address_line1 ?? "",
      address_line2: state.fields?.address_line2 ?? contact.address_line2 ?? "",
      postal_code: state.fields?.postal_code ?? contact.postal_code ?? "",
      city: state.fields?.city ?? contact.city ?? "",
      country: state.fields?.country ?? contact.country ?? "FR",
    }),
    [contact, state.fields],
  );

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    const nextEmail = normalizeEmailForComparison(
      emailInputRef.current?.value ?? "",
    );
    const originalEmail = normalizeEmailForComparison(contact.email);
    const emailChanged = nextEmail !== originalEmail;
    const expectedConfirmedEmail = nextEmail ?? CONTACT_EDIT_NO_EMAIL_VALUE;

    if (
      emailChanged &&
      hasValidEmailSyntax(nextEmail) &&
      confirmedEmailValue !== expectedConfirmedEmail
    ) {
      event.preventDefault();
      setShowEmailConfirmation(true);
    }
  }

  function confirmEmailChange() {
    const nextEmail = normalizeEmailForComparison(
      emailInputRef.current?.value ?? "",
    );

    setConfirmedEmailValue(nextEmail ?? CONTACT_EDIT_NO_EMAIL_VALUE);
    setShowEmailConfirmation(false);
    window.setTimeout(() => formRef.current?.requestSubmit(), 0);
  }

  function handleFormChange(event: React.FormEvent<HTMLFormElement>) {
    const target = event.target;

    if (
      !(target instanceof HTMLInputElement) &&
      !(target instanceof HTMLSelectElement)
    ) {
      return;
    }

    if (state.status === "duplicate_warning") {
      setInvalidatedDuplicateWarningToken(state.duplicateWarningToken ?? null);
    }
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={handleSubmit}
      onChange={handleFormChange}
      noValidate
      className="mt-8 rounded-2xl border bg-surface p-6 sm:p-8"
    >
      <input type="hidden" name="contact_id" value={contact.id} />
      <input
        type="hidden"
        name="confirmed_email_value"
        value={confirmedEmailValue ?? ""}
      />
      <input
        type="hidden"
        name="confirm_duplicates"
        value={duplicateWarning ? "1" : "0"}
      />
      <input
        type="hidden"
        name="duplicate_fingerprint"
        value={duplicateWarning ? (state.duplicateFingerprint ?? "") : ""}
      />

      {state.status === "error" ? (
        <p
          role="alert"
          className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
        >
          {state.message ??
            "Impossible d’enregistrer le contact. Aucune autre donnée n’a été modifiée."}
        </p>
      ) : null}

      {duplicateWarning ? (
        <section
          role="alert"
          className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950"
        >
          <p className="font-semibold">
            Un doublon potentiel a été détecté.
          </p>
          <p className="mt-2">
            Vérifiez les fiches ci-dessous. Aucun contact ne sera fusionné ou
            modifié automatiquement.
          </p>
          <ul className="mt-4 space-y-3">
            {(state.duplicateContacts ?? []).map((duplicate) => (
              <li key={duplicate.id} className="rounded-lg border bg-background p-3">
                <Link
                  href={`/contacts/${duplicate.id}`}
                  className="font-semibold text-accent hover:underline"
                >
                  {duplicate.displayName}
                </Link>
                <p className="mt-1 text-xs text-muted">
                  Correspondance :{" "}
                  {duplicate.reasons
                    .map((reason) =>
                      reason === "email" ? "e-mail" : "téléphone",
                    )
                    .join(", ")}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {[
                    duplicate.email,
                    duplicate.phone,
                    duplicate.secondaryPhone,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {showEmailConfirmation ? (
        <section
          role="alertdialog"
          aria-labelledby="email-change-confirmation-title"
          className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950"
        >
          <p id="email-change-confirmation-title" className="font-semibold">
            Confirmer le changement d’e-mail
          </p>
          <p className="mt-2">
            Les futurs envois utiliseront la nouvelle adresse enregistrée sur
            ce contact.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setShowEmailConfirmation(false)}
              className="rounded-xl border bg-background px-4 py-2.5 text-sm font-semibold text-muted transition hover:text-foreground"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={confirmEmailChange}
              className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
            >
              Confirmer le changement d’e-mail
            </button>
          </div>
        </section>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="contact-edit-type" className={labelClass}>
            Type de contact
          </label>
          <select
            id="contact-edit-type"
            name="contact_type"
            defaultValue={fields.contact_type}
            className={inputClass}
          >
            {CONTACT_TYPES.map((type) => (
              <option key={type} value={type}>
                {contactTypeLabels[type]}
              </option>
            ))}
          </select>
        </div>
        <TextField
          id="contact-edit-family-or-structure-name"
          label="Nom de la famille ou de la structure"
          name="family_or_structure_name"
          defaultValue={fields.family_or_structure_name}
          autoComplete="organization"
        />
        <TextField
          id="contact-edit-first-name"
          label="Prénom"
          name="first_name"
          defaultValue={fields.first_name}
          autoComplete="given-name"
        />
        <TextField
          id="contact-edit-last-name"
          label="Nom"
          name="last_name"
          defaultValue={fields.last_name}
          autoComplete="family-name"
        />
        <TextField
          id="contact-edit-display-name"
          label="Nom affichable"
          name="display_name"
          defaultValue={fields.display_name}
          autoComplete="name"
        />
        <TextField
          id="contact-edit-email"
          label="Email"
          name="email"
          type="email"
          defaultValue={fields.email}
          autoComplete="email"
          inputRef={emailInputRef}
        />
        <TextField
          id="contact-edit-phone"
          label="Téléphone principal"
          name="phone"
          type="tel"
          defaultValue={fields.phone}
          autoComplete="tel"
        />
        <TextField
          id="contact-edit-secondary-phone"
          label="Téléphone secondaire"
          name="secondary_phone"
          type="tel"
          defaultValue={fields.secondary_phone}
        />
        <TextField
          id="contact-edit-address-line1"
          label="Adresse ligne 1"
          name="address_line1"
          defaultValue={fields.address_line1}
          autoComplete="address-line1"
        />
        <TextField
          id="contact-edit-address-line2"
          label="Adresse ligne 2"
          name="address_line2"
          defaultValue={fields.address_line2}
          autoComplete="address-line2"
        />
        <TextField
          id="contact-edit-postal-code"
          label="Code postal"
          name="postal_code"
          defaultValue={fields.postal_code}
          autoComplete="postal-code"
        />
        <TextField
          id="contact-edit-city"
          label="Ville"
          name="city"
          defaultValue={fields.city}
          autoComplete="address-level2"
        />
        <TextField
          id="contact-edit-country"
          label="Pays"
          name="country"
          defaultValue={fields.country}
          autoComplete="country"
        />
      </div>

      <p className="mt-5 text-sm leading-6 text-muted">
        Pour une structure ou un professionnel, prénom et nom peuvent désigner
        l’interlocuteur principal.
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-end gap-4 border-t pt-6">
        <Link
          href={`/contacts/${contact.id}`}
          className="text-sm font-semibold text-muted hover:text-foreground hover:underline"
        >
          Annuler
        </Link>
        <SubmitButton duplicateWarning={duplicateWarning} />
      </div>
    </form>
  );
}
