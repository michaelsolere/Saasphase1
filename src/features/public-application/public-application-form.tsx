"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { getSupabaseConfig } from "@/lib/supabase/config";
import type { Tables } from "@/types/database.types";

import {
  type ApplicationFormErrors,
  type ApplicationFormValues,
  desiredSexOptions,
} from "./types";
import { validateApplicationForm } from "./validation";

type PublicForm = Tables<"public_form_public_view">;

const initialValues: ApplicationFormValues = {
  firstName: "",
  lastName: "",
  familyOrStructureName: "",
  email: "",
  phone: "",
  addressLine1: "",
  addressLine2: "",
  postalCode: "",
  city: "",
  country: "FR",
  desiredSexPreference: "",
  projectDescription: "",
  consentDataProcessing: false,
  consentContact: false,
};

type PublicApplicationFormProps = {
  formSlug: string;
};

export function PublicApplicationForm({
  formSlug,
}: PublicApplicationFormProps) {
  const [publicForm, setPublicForm] = useState<PublicForm | null>(null);
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<ApplicationFormErrors>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [publicReference, setPublicReference] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadPublicForm() {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("public_form_public_view")
          .select(
            "slug, title, description, species, breed, success_message",
          )
          .eq("slug", formSlug)
          .limit(1)
          .maybeSingle();

        if (!isMounted) {
          return;
        }

        if (error || !data) {
          setErrors({
            form: "Ce formulaire n’est pas disponible pour le moment.",
          });
        } else {
          setPublicForm(data);
        }
      } catch {
        if (isMounted) {
          setErrors({
            form: "Ce formulaire n’est pas disponible pour le moment.",
          });
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadPublicForm();

    return () => {
      isMounted = false;
    };
  }, [formSlug]);

  function updateValue<Key extends keyof ApplicationFormValues>(
    key: Key,
    value: ApplicationFormValues[Key],
  ) {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined, form: undefined }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const validationErrors = validateApplicationForm(values);
    setErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    try {
      setIsSubmitting(true);

      const { organizationSlug } = getSupabaseConfig();
      const supabase = createClient();
      const { data, error } = await supabase.rpc("submit_public_application", {
        p_organization_slug: organizationSlug,
        p_form_slug: formSlug,
        p_first_name: values.firstName.trim(),
        p_last_name: values.lastName.trim(),
        p_family_or_structure_name:
          values.familyOrStructureName.trim() || undefined,
        p_email: values.email.trim(),
        p_phone: values.phone.trim(),
        p_address_line1: values.addressLine1.trim(),
        p_address_line2: values.addressLine2.trim() || undefined,
        p_postal_code: values.postalCode.trim(),
        p_city: values.city.trim(),
        p_country: values.country,
        p_desired_sex_preference: values.desiredSexPreference,
        p_project_description: values.projectDescription.trim(),
        p_source_channel: "website",
        p_consent_data_processing: values.consentDataProcessing,
        p_consent_contact: values.consentContact,
        p_user_agent:
          typeof navigator === "undefined" ? undefined : navigator.userAgent,
        p_raw_data: {
          submitted_from: "public_application_form",
          form_slug: formSlug,
        },
      });

      if (error || !data?.[0] || data[0].status !== "accepted") {
        throw new Error("Public application submission failed");
      }

      setPublicReference(data[0].public_submission_reference);
      setIsSubmitted(true);
    } catch {
      setErrors({
        form: "Votre candidature n’a pas pu être envoyée. Réessayez dans quelques instants.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return <LoadingState />;
  }

  if (!publicForm) {
    return <UnavailableState message={errors.form} />;
  }

  if (isSubmitted) {
    return (
      <SuccessState
        message={
          publicForm.success_message ??
          "Merci, votre candidature a bien été enregistrée."
        }
        publicReference={publicReference}
      />
    );
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-4xl px-5 py-8 sm:px-8 sm:py-12">
        <Link
          href="/"
          className="text-sm font-medium text-accent hover:underline"
        >
          ← SaaS Élevage
        </Link>

        <header className="mt-8 max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-accent">
            Formulaire de candidature
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-5xl">
            {publicForm.title ?? "Candidature Golden Retriever 2026"}
          </h1>
          <p className="mt-5 text-base leading-7 text-muted sm:text-lg">
            {publicForm.description ??
              "Parlez-nous de votre projet afin que nous puissions préparer un premier échange."}
          </p>
          <div className="mt-5 flex flex-wrap gap-2 text-sm text-muted">
            <span className="rounded-full border bg-surface px-3 py-1">
              {publicForm.species === "dog" ? "Chien" : publicForm.species}
            </span>
            <span className="rounded-full border bg-surface px-3 py-1">
              {publicForm.breed ?? "Golden Retriever"}
            </span>
          </div>
        </header>

        <form
          className="mt-10 space-y-8"
          noValidate
          onSubmit={handleSubmit}
        >
          <FormSection
            title="Vos coordonnées"
            description="Ces informations créent votre fiche de contact unique."
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField
                autoComplete="given-name"
                error={errors.firstName}
                label="Prénom"
                name="firstName"
                onChange={(value) => updateValue("firstName", value)}
                required
                value={values.firstName}
              />
              <TextField
                autoComplete="family-name"
                error={errors.lastName}
                label="Nom"
                name="lastName"
                onChange={(value) => updateValue("lastName", value)}
                required
                value={values.lastName}
              />
            </div>

            <TextField
              autoComplete="organization"
              label="Famille, structure ou organisme"
              name="familyOrStructureName"
              onChange={(value) =>
                updateValue("familyOrStructureName", value)
              }
              optional
              value={values.familyOrStructureName}
            />

            <div className="grid gap-5 sm:grid-cols-2">
              <TextField
                autoComplete="email"
                error={errors.email}
                inputMode="email"
                label="Email"
                name="email"
                onChange={(value) => updateValue("email", value)}
                required
                type="email"
                value={values.email}
              />
              <TextField
                autoComplete="tel"
                error={errors.phone}
                inputMode="tel"
                label="Téléphone"
                name="phone"
                onChange={(value) => updateValue("phone", value)}
                required
                type="tel"
                value={values.phone}
              />
            </div>
          </FormSection>

          <FormSection
            title="Votre adresse"
            description="L’adresse est conservée de manière structurée sur votre fiche."
          >
            <TextField
              autoComplete="address-line1"
              error={errors.addressLine1}
              label="Adresse"
              name="addressLine1"
              onChange={(value) => updateValue("addressLine1", value)}
              required
              value={values.addressLine1}
            />
            <TextField
              autoComplete="address-line2"
              label="Complément d’adresse"
              name="addressLine2"
              onChange={(value) => updateValue("addressLine2", value)}
              optional
              value={values.addressLine2}
            />
            <div className="grid gap-5 sm:grid-cols-[0.7fr_1.3fr]">
              <TextField
                autoComplete="postal-code"
                error={errors.postalCode}
                inputMode="numeric"
                label="Code postal"
                name="postalCode"
                onChange={(value) => updateValue("postalCode", value)}
                required
                value={values.postalCode}
              />
              <TextField
                autoComplete="address-level2"
                error={errors.city}
                label="Ville"
                name="city"
                onChange={(value) => updateValue("city", value)}
                required
                value={values.city}
              />
            </div>
          </FormSection>

          <FormSection
            title="Votre projet"
            description="Ces éléments alimentent votre candidature et pourront être complétés lors d’un échange."
          >
            <fieldset>
              <legend className="text-sm font-semibold">
                Sexe souhaité <span className="text-accent">*</span>
              </legend>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {desiredSexOptions.map((option) => (
                  <label
                    key={option.value}
                    className="flex cursor-pointer items-start gap-3 rounded-xl border bg-surface p-4 transition has-[:checked]:border-accent has-[:checked]:bg-accent-soft"
                  >
                    <input
                      checked={values.desiredSexPreference === option.value}
                      className="mt-1 size-4 accent-accent"
                      name="desiredSexPreference"
                      onChange={() =>
                        updateValue("desiredSexPreference", option.value)
                      }
                      type="radio"
                      value={option.value}
                    />
                    <span className="text-sm leading-6">{option.label}</span>
                  </label>
                ))}
              </div>
              <FieldError message={errors.desiredSexPreference} />
            </fieldset>

            <label className="block">
              <span className="text-sm font-semibold">
                Description de votre projet{" "}
                <span className="text-accent">*</span>
              </span>
              <textarea
                aria-describedby={
                  errors.projectDescription
                    ? "projectDescription-error"
                    : undefined
                }
                aria-invalid={Boolean(errors.projectDescription)}
                className="mt-2 min-h-40 w-full resize-y rounded-xl border bg-surface px-4 py-3 text-base outline-none transition placeholder:text-muted/70 focus:border-accent focus:ring-3 focus:ring-accent/10"
                id="projectDescription"
                name="projectDescription"
                onChange={(event) =>
                  updateValue("projectDescription", event.target.value)
                }
                placeholder="Votre rythme de vie, votre expérience avec les chiens, vos attentes et le foyer qui accueillera le chiot…"
                value={values.projectDescription}
              />
              <FieldError
                id="projectDescription-error"
                message={errors.projectDescription}
              />
            </label>
          </FormSection>

          <FormSection title="Vos consentements">
            <CheckboxField
              checked={values.consentDataProcessing}
              error={errors.consentDataProcessing}
              label="J’accepte que mes données soient traitées afin d’étudier ma candidature."
              name="consentDataProcessing"
              onChange={(checked) =>
                updateValue("consentDataProcessing", checked)
              }
            />
            <CheckboxField
              checked={values.consentContact}
              error={errors.consentContact}
              label="J’accepte d’être recontacté au sujet de mon projet d’adoption."
              name="consentContact"
              onChange={(checked) => updateValue("consentContact", checked)}
            />
          </FormSection>

          {errors.form ? (
            <div
              className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
              role="alert"
            >
              {errors.form}
            </div>
          ) : null}

          <div className="flex flex-col gap-4 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm leading-6 text-muted">
              Les champs marqués d’un astérisque sont obligatoires.
            </p>
            <button
              className="inline-flex min-h-12 items-center justify-center rounded-xl bg-accent px-6 font-semibold text-white transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting
                ? "Envoi de la candidature…"
                : "Envoyer ma candidature"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}

function FormSection({
  children,
  description,
  title,
}: {
  children: React.ReactNode;
  description?: string;
  title: string;
}) {
  return (
    <section className="rounded-2xl border bg-surface p-5 shadow-sm sm:p-7">
      <h2 className="text-xl font-semibold">{title}</h2>
      {description ? (
        <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
      ) : null}
      <div className="mt-6 space-y-5">{children}</div>
    </section>
  );
}

type TextFieldProps = {
  autoComplete?: string;
  error?: string;
  inputMode?: "email" | "numeric" | "tel" | "text";
  label: string;
  name: string;
  onChange: (value: string) => void;
  optional?: boolean;
  required?: boolean;
  type?: "email" | "tel" | "text";
  value: string;
};

function TextField({
  autoComplete,
  error,
  inputMode,
  label,
  name,
  onChange,
  optional,
  required,
  type = "text",
  value,
}: TextFieldProps) {
  const errorId = `${name}-error`;

  return (
    <label className="block">
      <span className="text-sm font-semibold">
        {label} {required ? <span className="text-accent">*</span> : null}
        {optional ? (
          <span className="ml-2 font-normal text-muted">(optionnel)</span>
        ) : null}
      </span>
      <input
        aria-describedby={error ? errorId : undefined}
        aria-invalid={Boolean(error)}
        autoComplete={autoComplete}
        className="mt-2 min-h-12 w-full rounded-xl border bg-surface px-4 text-base outline-none transition focus:border-accent focus:ring-3 focus:ring-accent/10"
        id={name}
        inputMode={inputMode}
        name={name}
        onChange={(event) => onChange(event.target.value)}
        type={type}
        value={value}
      />
      <FieldError id={errorId} message={error} />
    </label>
  );
}

function CheckboxField({
  checked,
  error,
  label,
  name,
  onChange,
}: {
  checked: boolean;
  error?: string;
  label: string;
  name: string;
  onChange: (checked: boolean) => void;
}) {
  const errorId = `${name}-error`;

  return (
    <div>
      <label className="flex cursor-pointer items-start gap-3">
        <input
          aria-describedby={error ? errorId : undefined}
          aria-invalid={Boolean(error)}
          checked={checked}
          className="mt-1 size-4 accent-accent"
          id={name}
          name={name}
          onChange={(event) => onChange(event.target.checked)}
          type="checkbox"
        />
        <span className="text-sm leading-6">
          {label} <span className="text-accent">*</span>
        </span>
      </label>
      <FieldError id={errorId} message={error} />
    </div>
  );
}

function FieldError({
  id,
  message,
}: {
  id?: string;
  message?: string;
}) {
  if (!message) {
    return null;
  }

  return (
    <p className="mt-2 text-sm text-red-700" id={id}>
      {message}
    </p>
  );
}

function LoadingState() {
  return (
    <main className="grid min-h-screen place-items-center px-6">
      <div className="text-center">
        <p className="text-sm font-semibold text-accent">
          Chargement du formulaire
        </p>
        <p className="mt-2 text-sm text-muted">
          Nous préparons votre candidature…
        </p>
      </div>
    </main>
  );
}

function UnavailableState({ message }: { message?: string }) {
  return (
    <main className="grid min-h-screen place-items-center px-6">
      <div className="max-w-lg rounded-2xl border bg-surface p-8 text-center">
        <h1 className="text-2xl font-semibold">Formulaire indisponible</h1>
        <p className="mt-3 leading-7 text-muted">
          {message ?? "Ce formulaire n’est pas disponible pour le moment."}
        </p>
        <Link
          className="mt-6 inline-flex font-medium text-accent hover:underline"
          href="/"
        >
          Revenir à l’accueil
        </Link>
      </div>
    </main>
  );
}

function SuccessState({
  message,
  publicReference,
}: {
  message: string;
  publicReference: string | null;
}) {
  return (
    <main className="grid min-h-screen place-items-center px-6 py-12">
      <div className="w-full max-w-xl rounded-2xl border bg-surface p-8 text-center shadow-sm sm:p-10">
        <div className="mx-auto grid size-12 place-items-center rounded-full bg-accent-soft text-2xl text-accent">
          ✓
        </div>
        <p className="mt-6 text-sm font-semibold uppercase tracking-[0.18em] text-accent">
          Candidature envoyée
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          Merci pour votre confiance.
        </h1>
        <p className="mt-4 leading-7 text-muted">{message}</p>
        {publicReference ? (
          <p className="mt-5 text-xs text-muted">
            Référence publique :{" "}
            <span className="font-mono">{publicReference}</span>
          </p>
        ) : null}
        <Link
          className="mt-8 inline-flex min-h-11 items-center justify-center rounded-xl border px-5 font-medium transition hover:border-accent/40 hover:bg-accent-soft"
          href="/"
        >
          Revenir à l’accueil
        </Link>
      </div>
    </main>
  );
}
