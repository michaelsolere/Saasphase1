"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  formatApplicationDate,
  getApplicationStatusLabel,
} from "@/features/applications/formatters";
import { createReservationDirect } from "@/features/reservations/actions";

export type NewReservationContact = {
  id: string;
  display_name: string | null;
  email: string | null;
  phone: string | null;
};

export type NewReservationApplication = {
  id: string;
  contact_id: string;
  status: string | null;
  species: string | null;
  breed: string | null;
  created_at: string | null;
};

const sexPreferenceOptions = [
  ["unknown", "Non précisé"],
  ["male_only", "Mâle uniquement"],
  ["female_only", "Femelle uniquement"],
  ["male_preferred_female_possible", "Mâle préféré, femelle possible"],
  ["female_preferred_male_possible", "Femelle préférée, mâle possible"],
  ["no_preference", "Sans préférence"],
] as const;

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Création…" : "Créer la réservation"}
    </button>
  );
}

export function NewReservationForm({
  contacts,
  applications,
}: {
  contacts: NewReservationContact[];
  applications: NewReservationApplication[];
}) {
  const [search, setSearch] = useState("");
  const [selectedContactId, setSelectedContactId] = useState<string | null>(
    null,
  );
  const [selectedApplicationId, setSelectedApplicationId] = useState<string>("");

  const filteredContacts = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) {
      return contacts;
    }
    return contacts.filter((contact) => {
      const haystack = [contact.display_name, contact.email, contact.phone]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [contacts, search]);

  const contactApplications = useMemo(() => {
    if (!selectedContactId) {
      return [];
    }
    return applications.filter(
      (application) => application.contact_id === selectedContactId,
    );
  }, [applications, selectedContactId]);

  function handleSelectContact(contactId: string) {
    setSelectedContactId(contactId);
    setSelectedApplicationId("");
  }

  return (
    <form
      action={createReservationDirect}
      className="mt-8 space-y-8"
    >
      <section className="rounded-2xl border bg-surface p-6 sm:p-8">
        <h2 className="text-lg font-semibold">1. Choisir un contact</h2>
        <p className="mt-1 text-sm text-muted">
          Sélectionnez un contact existant. La création d’un nouveau contact se
          fait depuis le module Contacts.
        </p>

        <div className="mt-5">
          <label
            htmlFor="contact-search"
            className="text-xs font-semibold uppercase tracking-wide text-muted"
          >
            Rechercher
          </label>
          <input
            id="contact-search"
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Nom, email ou téléphone"
            className="mt-2 w-full rounded-xl border bg-background px-4 py-3 text-sm focus:border-accent focus:outline-none"
          />
        </div>

        <div className="mt-5 max-h-80 overflow-y-auto rounded-xl border bg-background">
          {filteredContacts.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted">
              Aucun contact ne correspond à votre recherche.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {filteredContacts.map((contact) => {
                const isSelected = selectedContactId === contact.id;
                return (
                  <li key={contact.id}>
                    <label
                      className={`flex cursor-pointer items-start gap-3 px-4 py-3 text-sm transition ${
                        isSelected ? "bg-accent-soft" : "hover:bg-surface"
                      }`}
                    >
                      <input
                        type="radio"
                        name="contact_id"
                        value={contact.id}
                        checked={isSelected}
                        onChange={() => handleSelectContact(contact.id)}
                        className="mt-1"
                      />
                      <span>
                        <span className="block font-medium text-foreground">
                          {contact.display_name ?? "Contact sans nom"}
                        </span>
                        <span className="block text-xs text-muted">
                          {contact.email ??
                            contact.phone ??
                            "Coordonnées non renseignées"}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      <section className="rounded-2xl border bg-surface p-6 sm:p-8">
        <h2 className="text-lg font-semibold">
          2. Rattacher une candidature (optionnel)
        </h2>
        <p className="mt-1 text-sm text-muted">
          Sélectionnez une candidature existante de ce contact, ou laissez «
          Aucune candidature pour l’instant ».
        </p>

        {!selectedContactId ? (
          <p className="mt-5 rounded-xl border border-dashed bg-background px-4 py-6 text-center text-sm text-muted">
            Choisissez d’abord un contact pour voir ses candidatures.
          </p>
        ) : (
          <div className="mt-5 space-y-3">
            <label
              className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 text-sm transition ${
                selectedApplicationId === ""
                  ? "border-accent bg-accent-soft"
                  : "bg-background hover:bg-surface"
              }`}
            >
              <input
                type="radio"
                name="application_id"
                value=""
                checked={selectedApplicationId === ""}
                onChange={() => setSelectedApplicationId("")}
                className="mt-1"
              />
              <span className="font-medium text-foreground">
                Aucune candidature pour l’instant
              </span>
            </label>

            {contactApplications.length === 0 ? (
              <p className="rounded-xl border border-dashed bg-background px-4 py-4 text-sm text-muted">
                Ce contact n’a aucune candidature enregistrée.
              </p>
            ) : (
              contactApplications.map((application) => {
                const isSelected = selectedApplicationId === application.id;
                return (
                  <label
                    key={application.id}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 text-sm transition ${
                      isSelected
                        ? "border-accent bg-accent-soft"
                        : "bg-background hover:bg-surface"
                    }`}
                  >
                    <input
                      type="radio"
                      name="application_id"
                      value={application.id}
                      checked={isSelected}
                      onChange={() => setSelectedApplicationId(application.id)}
                      className="mt-1"
                    />
                    <span>
                      <span className="block font-medium text-foreground">
                        {[application.species, application.breed]
                          .filter(Boolean)
                          .join(" · ") || "Candidature"}
                      </span>
                      <span className="block text-xs text-muted">
                        {getApplicationStatusLabel(application.status)} ·{" "}
                        {formatApplicationDate(application.created_at)}
                      </span>
                    </span>
                  </label>
                );
              })
            )}
          </div>
        )}
      </section>

      <section className="rounded-2xl border bg-surface p-6 sm:p-8">
        <h2 className="text-lg font-semibold">
          3. Informations minimales de réservation
        </h2>
        <p className="mt-1 text-sm text-muted">
          La réservation est créée en statut brouillon. Vous pourrez tout
          compléter ensuite depuis la fiche réservation.
        </p>

        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label
              htmlFor="reservation-sex-preference"
              className="text-xs font-semibold uppercase tracking-wide text-muted"
            >
              Préférence de sexe
            </label>
            <select
              id="reservation-sex-preference"
              name="reserved_sex_preference"
              defaultValue="unknown"
              className="mt-2 w-full rounded-xl border bg-background px-4 py-3 text-sm focus:border-accent focus:outline-none"
            >
              {sexPreferenceOptions.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-muted">
              Si une candidature est sélectionnée, sa préférence de sexe est
              utilisée à la place.
            </p>
          </div>

          <div>
            <label
              htmlFor="reservation-price"
              className="text-xs font-semibold uppercase tracking-wide text-muted"
            >
              Tarif convenu (€, optionnel)
            </label>
            <input
              id="reservation-price"
              name="price"
              type="text"
              inputMode="decimal"
              placeholder="Ex. 2500"
              className="mt-2 w-full rounded-xl border bg-background px-4 py-3 text-sm focus:border-accent focus:outline-none"
            />
          </div>
        </div>

        <div className="mt-5">
          <label
            htmlFor="reservation-internal-comment"
            className="text-xs font-semibold uppercase tracking-wide text-muted"
          >
            Commentaire interne (optionnel)
          </label>
          <textarea
            id="reservation-internal-comment"
            name="internal_comment"
            rows={4}
            className="mt-2 w-full rounded-xl border bg-background px-4 py-3 text-sm leading-6 focus:border-accent focus:outline-none"
          />
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-end gap-4 border-t pt-6">
        <Link
          href="/reservations"
          className="text-sm font-semibold text-muted hover:text-foreground hover:underline"
        >
          Annuler
        </Link>
        <SubmitButton disabled={!selectedContactId} />
      </div>
    </form>
  );
}
