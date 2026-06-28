"use client";

import Link from "next/link";
import { type FormEvent, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  formatApplicationDate,
  getApplicationStatusLabel,
} from "@/features/applications/formatters";
import {
  formatLitterDate,
  getLitterDisplayName,
  getLitterStatusLabel,
} from "@/features/litters/formatters";
import { createContactQuickForReservation } from "@/features/contacts/actions";
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
  desired_litter_id: string | null;
  desired_litter_group_id: string | null;
  created_at: string | null;
};

export type NewReservationLitter = {
  id: string;
  name: string | null;
  litter_group_id: string | null;
  litter_group_name: string | null;
  status: string | null;
  mother_display_name: string | null;
  father_display_name: string | null;
  expected_birth_date: string | null;
  actual_birth_date: string | null;
};

export type NewReservationLitterGroup = {
  id: string;
  name: string | null;
  status: string | null;
  expected_period_start: string | null;
  expected_period_end: string | null;
};

type ScopeMode = "none" | "litter" | "group";

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
  litters,
  litterGroups,
  initialSelectedContactId = null,
}: {
  contacts: NewReservationContact[];
  applications: NewReservationApplication[];
  litters: NewReservationLitter[];
  litterGroups: NewReservationLitterGroup[];
  initialSelectedContactId?: string | null;
}) {
  const [search, setSearch] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedContactId, setSelectedContactId] = useState<string | null>(
    initialSelectedContactId,
  );
  const [selectedApplicationId, setSelectedApplicationId] = useState<string>("");
  const [isQuickCreate, setIsQuickCreate] = useState(false);
  const [scopeMode, setScopeMode] = useState<ScopeMode>("none");
  const [selectedLitterId, setSelectedLitterId] = useState<string>("");
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");

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

  const selectedApplication = useMemo(
    () =>
      selectedApplicationId
        ? applications.find(
            (application) => application.id === selectedApplicationId,
          ) ?? null
        : null,
    [applications, selectedApplicationId],
  );

  const desiredLitterUnavailable = Boolean(
    selectedApplication?.desired_litter_id &&
      !litters.some(
        (litter) => litter.id === selectedApplication.desired_litter_id,
      ),
  );
  const desiredGroupUnavailable = Boolean(
    selectedApplication?.desired_litter_group_id &&
      !litterGroups.some(
        (group) => group.id === selectedApplication.desired_litter_group_id,
      ),
  );

  function handleSelectContact(contactId: string) {
    setSelectedContactId(contactId);
    setSelectedApplicationId("");
    setScopeMode("none");
    setSelectedLitterId("");
    setSelectedGroupId("");
  }

  function handleSelectApplication(applicationId: string) {
    setSelectedApplicationId(applicationId);

    if (!applicationId) {
      return;
    }

    const application = applications.find(
      (candidate) => candidate.id === applicationId,
    );

    if (!application) {
      return;
    }

    // Préremplissage exclusif depuis la candidature, uniquement si l'option
    // existe dans les données chargées. L'éleveur reste libre de modifier.
    if (
      application.desired_litter_id &&
      litters.some((litter) => litter.id === application.desired_litter_id)
    ) {
      setScopeMode("litter");
      setSelectedLitterId(application.desired_litter_id);
      setSelectedGroupId("");
      return;
    }

    if (
      application.desired_litter_group_id &&
      litterGroups.some(
        (group) => group.id === application.desired_litter_group_id,
      )
    ) {
      setScopeMode("group");
      setSelectedGroupId(application.desired_litter_group_id);
      setSelectedLitterId("");
    }
  }

  function handleScopeModeChange(mode: ScopeMode) {
    setScopeMode(mode);
    if (mode !== "litter") {
      setSelectedLitterId("");
    }
    if (mode !== "group") {
      setSelectedGroupId("");
    }
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

  function handleUseExistingContact(contactId: string) {
    handleSelectContact(contactId);
    setIsQuickCreate(false);
  }

  if (isQuickCreate && !selectedContact) {
    return (
      <div className="mt-8">
        <QuickContactForm
          contacts={contacts}
          onCancel={() => setIsQuickCreate(false)}
          onUseExisting={handleUseExistingContact}
        />
      </div>
    );
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
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label
                  htmlFor="contact-search"
                  className="text-xs font-semibold uppercase tracking-wide text-muted"
                >
                  Rechercher un contact
                </label>
                <button
                  type="button"
                  onClick={() => setIsQuickCreate(true)}
                  className="text-xs font-semibold text-accent hover:underline"
                >
                  + Nouveau contact rapide
                </button>
              </div>
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
                <button
                  type="button"
                  onClick={() => setIsQuickCreate(true)}
                  className="mt-4 inline-flex rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
                >
                  Créer un contact rapide
                </button>
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
                onChange={() => handleSelectApplication("")}
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
                      onChange={() => handleSelectApplication(application.id)}
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
        <h2 className="text-lg font-semibold">3. Portée ou période (optionnel)</h2>
        <p className="mt-1 text-sm text-muted">
          Rattachez la réservation à une portée précise, à un groupe de portées,
          ou laissez ce choix vide. Une réservation ne peut pas être liée à la
          fois à une portée et à un groupe.
        </p>

        {selectedApplication &&
        (selectedApplication.desired_litter_id ||
          selectedApplication.desired_litter_group_id) ? (
          <p className="mt-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs text-sky-950">
            Prérempli depuis la candidature sélectionnée. Vous pouvez modifier ce
            choix avant de créer la réservation.
          </p>
        ) : null}

        {desiredLitterUnavailable ? (
          <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-950">
            La portée souhaitée dans la candidature n’est pas disponible dans la
            liste. Vous pouvez en choisir une autre ou laisser ce choix vide.
          </p>
        ) : null}

        {desiredGroupUnavailable ? (
          <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-950">
            Le groupe de portées souhaité dans la candidature n’est pas
            disponible dans la liste. Vous pouvez en choisir un autre ou laisser
            ce choix vide.
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-2">
          {(
            [
              ["none", "Aucune portée ou période"],
              ["litter", "Choisir une portée précise"],
              ["group", "Choisir un groupe de portées"],
            ] as const
          ).map(([mode, label]) => {
            const isDisabled =
              (mode === "litter" && litters.length === 0) ||
              (mode === "group" && litterGroups.length === 0);
            return (
              <button
                key={mode}
                type="button"
                onClick={() => handleScopeModeChange(mode)}
                disabled={isDisabled}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  scopeMode === mode
                    ? "border-accent bg-accent text-white"
                    : "text-muted hover:bg-background"
                }`}
              >
                {label}
                {mode === "litter" && litters.length === 0
                  ? " (aucune)"
                  : ""}
                {mode === "group" && litterGroups.length === 0
                  ? " (aucun)"
                  : ""}
              </button>
            );
          })}
        </div>

        {scopeMode === "litter" ? (
          <div className="mt-5 space-y-3">
            {litters.map((litter) => {
              const isSelected = selectedLitterId === litter.id;
              const birthLabel = litter.actual_birth_date
                ? `Née le ${formatLitterDate(litter.actual_birth_date)}`
                : litter.expected_birth_date
                  ? `Naissance prévue le ${formatLitterDate(litter.expected_birth_date)}`
                  : "Date de mise-bas non renseignée";
              return (
                <label
                  key={litter.id}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 text-sm transition ${
                    isSelected
                      ? "border-accent bg-accent-soft"
                      : "bg-background hover:bg-surface"
                  }`}
                >
                  <input
                    type="radio"
                    name="litter_id"
                    value={litter.id}
                    checked={isSelected}
                    onChange={() => setSelectedLitterId(litter.id)}
                    className="mt-1"
                  />
                  <span>
                    <span className="block font-medium text-foreground">
                      {getLitterDisplayName(litter.name, litter.id)}
                    </span>
                    <span className="block text-xs text-muted">
                      {getLitterStatusLabel(litter.status)} · {birthLabel}
                    </span>
                    <span className="block text-xs text-muted">
                      Mère : {litter.mother_display_name ?? "Non renseignée"} ·
                      Père : {litter.father_display_name ?? "Non renseigné"}
                    </span>
                    {litter.litter_group_name ? (
                      <span className="block text-xs text-muted">
                        Groupe : {litter.litter_group_name}
                      </span>
                    ) : null}
                  </span>
                </label>
              );
            })}
          </div>
        ) : null}

        {scopeMode === "group" ? (
          <div className="mt-5 space-y-3">
            {litterGroups.map((group) => {
              const isSelected = selectedGroupId === group.id;
              const linkedLitters = litters.filter(
                (litter) => litter.litter_group_id === group.id,
              ).length;
              const periodLabel =
                group.expected_period_start || group.expected_period_end
                  ? `${
                      group.expected_period_start
                        ? formatLitterDate(group.expected_period_start)
                        : "?"
                    } – ${
                      group.expected_period_end
                        ? formatLitterDate(group.expected_period_end)
                        : "?"
                    }`
                  : "Période non renseignée";
              return (
                <label
                  key={group.id}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 text-sm transition ${
                    isSelected
                      ? "border-accent bg-accent-soft"
                      : "bg-background hover:bg-surface"
                  }`}
                >
                  <input
                    type="radio"
                    name="litter_group_id"
                    value={group.id}
                    checked={isSelected}
                    onChange={() => setSelectedGroupId(group.id)}
                    className="mt-1"
                  />
                  <span>
                    <span className="block font-medium text-foreground">
                      {group.name ?? "Groupe sans nom"}
                    </span>
                    <span className="block text-xs text-muted">
                      {getLitterStatusLabel(group.status)} · {periodLabel}
                    </span>
                    <span className="block text-xs text-muted">
                      {linkedLitters} portée{linkedLitters > 1 ? "s" : ""} liée
                      {linkedLitters > 1 ? "s" : ""}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border bg-surface p-6 sm:p-8">
        <h2 className="text-lg font-semibold">
          4. Informations minimales de réservation
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

const QUICK_CONTACT_USEFUL_FIELDS = [
  "display_name",
  "first_name",
  "last_name",
  "email",
  "phone",
  "secondary_phone",
  "address_line1",
  "postal_code",
  "city",
] as const;

function normalizePhone(value: string) {
  return value.replace(/[\s.\-/()]/g, "");
}

function QuickContactField({
  id,
  label,
  name,
  type = "text",
  defaultValue,
  autoComplete,
}: {
  id: string;
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
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
        defaultValue={defaultValue}
        autoComplete={autoComplete}
        className="mt-2 w-full rounded-xl border bg-background px-4 py-3 text-sm focus:border-accent focus:outline-none"
      />
    </div>
  );
}

function QuickFormButtons({
  hasDuplicates,
  onCancel,
  onPrimaryClick,
  onCreateAnywayClick,
}: {
  hasDuplicates: boolean;
  onCancel: () => void;
  onPrimaryClick: () => void;
  onCreateAnywayClick: () => void;
}) {
  const { pending } = useFormStatus();

  return (
    <div className="mt-6 flex flex-wrap items-center justify-end gap-4 border-t pt-6">
      <button
        type="button"
        onClick={onCancel}
        disabled={pending}
        className="text-sm font-semibold text-muted hover:text-foreground hover:underline disabled:opacity-60"
      >
        Annuler
      </button>
      {hasDuplicates ? (
        <button
          type="submit"
          onClick={onCreateAnywayClick}
          disabled={pending}
          className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-900 transition hover:bg-amber-100 disabled:opacity-60"
        >
          Créer quand même
        </button>
      ) : null}
      <button
        type="submit"
        onClick={onPrimaryClick}
        disabled={pending}
        className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Création…" : "Créer le contact"}
      </button>
    </div>
  );
}

function QuickContactForm({
  contacts,
  onCancel,
  onUseExisting,
}: {
  contacts: NewReservationContact[];
  onCancel: () => void;
  onUseExisting: (contactId: string) => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const bypassDuplicatesRef = useRef(false);
  const [duplicates, setDuplicates] = useState<NewReservationContact[]>([]);
  const [showEmptyError, setShowEmptyError] = useState(false);

  function findDuplicates(formData: FormData): NewReservationContact[] {
    const email = ((formData.get("email") as string) ?? "")
      .trim()
      .toLowerCase();
    const phone = normalizePhone(((formData.get("phone") as string) ?? "").trim());
    const firstName = ((formData.get("first_name") as string) ?? "")
      .trim()
      .toLowerCase();
    const lastName = ((formData.get("last_name") as string) ?? "")
      .trim()
      .toLowerCase();

    return contacts.filter((contact) => {
      if (email && contact.email && contact.email.trim().toLowerCase() === email) {
        return true;
      }
      if (
        phone &&
        contact.phone &&
        normalizePhone(contact.phone) === phone
      ) {
        return true;
      }
      if (
        firstName &&
        lastName &&
        contact.first_name &&
        contact.last_name &&
        contact.first_name.trim().toLowerCase() === firstName &&
        contact.last_name.trim().toLowerCase() === lastName
      ) {
        return true;
      }
      return false;
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const formData = new FormData(event.currentTarget);

    const hasUsefulInformation = QUICK_CONTACT_USEFUL_FIELDS.some((field) =>
      ((formData.get(field) as string) ?? "").trim(),
    );

    if (!hasUsefulInformation) {
      event.preventDefault();
      setShowEmptyError(true);
      setDuplicates([]);
      return;
    }

    setShowEmptyError(false);

    if (!bypassDuplicatesRef.current) {
      const probableDuplicates = findDuplicates(formData);
      if (probableDuplicates.length > 0) {
        event.preventDefault();
        setDuplicates(probableDuplicates);
        return;
      }
    }
    // Aucune anomalie : on laisse l'action serveur s'exécuter.
  }

  return (
    <form
      ref={formRef}
      action={createContactQuickForReservation}
      onSubmit={handleSubmit}
      className="rounded-2xl border bg-surface p-6 sm:p-8"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Créer un contact rapide</h2>
          <p className="mt-1 text-sm text-muted">
            Renseignez au moins une information. Le contact sera créé puis
            sélectionné pour cette réservation. Aucune candidature ni réservation
            n’est créée automatiquement.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm font-semibold text-accent hover:underline"
        >
          ← Revenir à la recherche
        </button>
      </div>

      {showEmptyError ? (
        <p
          role="alert"
          className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
        >
          Renseignez au moins une information pour créer le contact.
        </p>
      ) : null}

      {duplicates.length > 0 ? (
        <div
          role="alert"
          className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950"
        >
          <p className="font-semibold">
            Un contact existant ressemble à celui-ci.
          </p>
          <p className="mt-1">
            Vous pouvez utiliser l’un de ces contacts, ou créer quand même un
            nouveau contact.
          </p>
          <ul className="mt-3 space-y-2">
            {duplicates.map((contact) => (
              <li
                key={contact.id}
                className="flex flex-col gap-2 rounded-lg border bg-background px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="text-sm">
                  <span className="font-medium text-foreground">
                    {contact.display_name ?? "Contact sans nom"}
                  </span>
                  <span className="ml-2 text-xs text-muted">
                    {[contact.email, contact.phone]
                      .filter(Boolean)
                      .join(" · ") || "Coordonnées non renseignées"}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => onUseExisting(contact.id)}
                  className="shrink-0 rounded-lg border bg-surface px-3 py-1.5 text-xs font-semibold text-accent transition hover:bg-background"
                >
                  Utiliser ce contact
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <QuickContactField
          id="quick-first-name"
          label="Prénom"
          name="first_name"
          autoComplete="given-name"
        />
        <QuickContactField
          id="quick-last-name"
          label="Nom"
          name="last_name"
          autoComplete="family-name"
        />
        <QuickContactField
          id="quick-email"
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
        />
        <QuickContactField
          id="quick-phone"
          label="Téléphone"
          name="phone"
          type="tel"
          autoComplete="tel"
        />
        <QuickContactField
          id="quick-secondary-phone"
          label="Téléphone secondaire"
          name="secondary_phone"
          type="tel"
        />
        <QuickContactField
          id="quick-address-line1"
          label="Adresse ligne 1"
          name="address_line1"
          autoComplete="address-line1"
        />
        <QuickContactField
          id="quick-address-line2"
          label="Adresse ligne 2"
          name="address_line2"
          autoComplete="address-line2"
        />
        <QuickContactField
          id="quick-postal-code"
          label="Code postal"
          name="postal_code"
          autoComplete="postal-code"
        />
        <QuickContactField
          id="quick-city"
          label="Ville"
          name="city"
          autoComplete="address-level2"
        />
        <QuickContactField
          id="quick-country"
          label="Pays"
          name="country"
          defaultValue="FR"
          autoComplete="country"
        />
      </div>

      <QuickFormButtons
        hasDuplicates={duplicates.length > 0}
        onCancel={onCancel}
        onPrimaryClick={() => {
          bypassDuplicatesRef.current = false;
        }}
        onCreateAnywayClick={() => {
          bypassDuplicatesRef.current = true;
        }}
      />
    </form>
  );
}
