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
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  created_at: string | null;
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

const MAX_CONTACT_RESULTS = 20;

function toDayString(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dayStringDaysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return toDayString(date);
}

export function NewReservationForm({
  contacts,
  applications,
}: {
  contacts: NewReservationContact[];
  applications: NewReservationApplication[];
}) {
  const [search, setSearch] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedContactId, setSelectedContactId] = useState<string | null>(
    null,
  );
  const [selectedApplicationId, setSelectedApplicationId] = useState<string>("");

  const trimmedSearch = search.trim();
  const hasActiveFilter = Boolean(
    trimmedSearch || startDate || endDate,
  );

  const sortedContacts = useMemo(() => {
    return [...contacts].sort((a, b) => {
      const aDate = a.created_at ?? "";
      const bDate = b.created_at ?? "";
      if (aDate === bDate) {
        return 0;
      }
      return aDate < bDate ? 1 : -1;
    });
  }, [contacts]);

  const matchingContacts = useMemo(() => {
    const term = trimmedSearch.toLowerCase();

    return sortedContacts.filter((contact) => {
      if (term) {
        const haystack = [
          contact.display_name,
          contact.first_name,
          contact.last_name,
          contact.email,
          contact.phone,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(term)) {
          return false;
        }
      }

      if (startDate || endDate) {
        const createdDay = contact.created_at
          ? contact.created_at.slice(0, 10)
          : null;
        if (!createdDay) {
          return false;
        }
        if (startDate && createdDay < startDate) {
          return false;
        }
        if (endDate && createdDay > endDate) {
          return false;
        }
      }

      return true;
    });
  }, [sortedContacts, trimmedSearch, startDate, endDate]);

  const visibleContacts = matchingContacts.slice(0, MAX_CONTACT_RESULTS);
  const hiddenResultsCount = matchingContacts.length - visibleContacts.length;

  const selectedContact = useMemo(
    () =>
      selectedContactId
        ? contacts.find((contact) => contact.id === selectedContactId) ?? null
        : null,
    [contacts, selectedContactId],
  );

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

  function handleResetFilters() {
    setSearch("");
    setStartDate("");
    setEndDate("");
  }

  function handleChangeContact() {
    setSelectedContactId(null);
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
          Recherchez un contact existant. La création d’un nouveau contact se
          fait depuis le module Contacts.
        </p>

        <input type="hidden" name="contact_id" value={selectedContactId ?? ""} />

        {selectedContact ? (
          <div className="mt-5 flex flex-col gap-4 rounded-xl border border-accent bg-accent-soft px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-accent">
                Contact sélectionné
              </p>
              <p className="mt-1 text-base font-semibold text-foreground">
                {selectedContact.display_name ?? "Contact sans nom"}
              </p>
              <dl className="mt-1 space-y-0.5 text-xs text-muted">
                {selectedContact.email ? (
                  <div>
                    <dt className="inline font-medium">Email : </dt>
                    <dd className="inline">{selectedContact.email}</dd>
                  </div>
                ) : null}
                {selectedContact.phone ? (
                  <div>
                    <dt className="inline font-medium">Téléphone : </dt>
                    <dd className="inline">{selectedContact.phone}</dd>
                  </div>
                ) : null}
                {selectedContact.created_at ? (
                  <div>
                    <dt className="inline font-medium">Créé le : </dt>
                    <dd className="inline">
                      {formatApplicationDate(selectedContact.created_at)}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </div>
            <button
              type="button"
              onClick={handleChangeContact}
              className="shrink-0 rounded-xl border bg-background px-4 py-2 text-sm font-semibold text-accent transition hover:bg-surface"
            >
              Changer de contact
            </button>
          </div>
        ) : (
          <>
            <div className="mt-5">
              <label
                htmlFor="contact-search"
                className="text-xs font-semibold uppercase tracking-wide text-muted"
              >
                Rechercher un contact
              </label>
              <input
                id="contact-search"
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Nom, prénom, email ou téléphone"
                className="mt-2 w-full rounded-xl border bg-background px-4 py-3 text-sm focus:border-accent focus:outline-none"
              />
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="contact-created-start"
                  className="text-xs font-semibold uppercase tracking-wide text-muted"
                >
                  Créé entre
                </label>
                <input
                  id="contact-created-start"
                  type="date"
                  value={startDate}
                  max={endDate || undefined}
                  onChange={(event) => setStartDate(event.target.value)}
                  className="mt-2 w-full rounded-xl border bg-background px-4 py-3 text-sm focus:border-accent focus:outline-none"
                />
              </div>
              <div>
                <label
                  htmlFor="contact-created-end"
                  className="text-xs font-semibold uppercase tracking-wide text-muted"
                >
                  et
                </label>
                <input
                  id="contact-created-end"
                  type="date"
                  value={endDate}
                  min={startDate || undefined}
                  onChange={(event) => setEndDate(event.target.value)}
                  className="mt-2 w-full rounded-xl border bg-background px-4 py-3 text-sm focus:border-accent focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setStartDate(dayStringDaysAgo(7));
                  setEndDate(toDayString(new Date()));
                }}
                className="rounded-full border px-3 py-1 text-xs font-medium text-muted transition hover:bg-background"
              >
                7 derniers jours
              </button>
              <button
                type="button"
                onClick={() => {
                  setStartDate(dayStringDaysAgo(30));
                  setEndDate(toDayString(new Date()));
                }}
                className="rounded-full border px-3 py-1 text-xs font-medium text-muted transition hover:bg-background"
              >
                30 derniers jours
              </button>
              {hasActiveFilter ? (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="rounded-full border px-3 py-1 text-xs font-medium text-muted transition hover:bg-background"
                >
                  Réinitialiser les filtres
                </button>
              ) : null}
            </div>

            {matchingContacts.length === 0 ? (
              <div className="mt-5 rounded-xl border border-dashed bg-background px-4 py-6 text-center text-sm text-muted">
                <p className="font-medium text-foreground">
                  Aucun contact trouvé
                </p>
                <p className="mt-1">
                  Aucun contact ne correspond à ces critères.
                </p>
                <Link
                  href="/contacts/new"
                  className="mt-4 inline-flex rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
                >
                  Créer un contact
                </Link>
              </div>
            ) : (
              <>
                <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted">
                  {hasActiveFilter
                    ? "Résultats"
                    : "Contacts les plus récents"}
                </p>
                <ul className="mt-2 divide-y divide-border overflow-hidden rounded-xl border bg-background">
                  {visibleContacts.map((contact) => (
                    <li key={contact.id}>
                      <button
                        type="button"
                        onClick={() => handleSelectContact(contact.id)}
                        className="flex w-full flex-col items-start gap-0.5 px-4 py-3 text-left text-sm transition hover:bg-surface"
                      >
                        <span className="font-medium text-foreground">
                          {contact.display_name ?? "Contact sans nom"}
                        </span>
                        <span className="text-xs text-muted">
                          {[contact.email, contact.phone]
                            .filter(Boolean)
                            .join(" · ") || "Coordonnées non renseignées"}
                        </span>
                        {contact.created_at ? (
                          <span className="text-xs text-muted">
                            Créé le {formatApplicationDate(contact.created_at)}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
                {hiddenResultsCount > 0 ? (
                  <p className="mt-2 text-xs text-muted">
                    {hiddenResultsCount} autre
                    {hiddenResultsCount > 1 ? "s" : ""} résultat
                    {hiddenResultsCount > 1 ? "s" : ""} non affiché
                    {hiddenResultsCount > 1 ? "s" : ""}. Précisez votre recherche.
                  </p>
                ) : null}
              </>
            )}
          </>
        )}
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
