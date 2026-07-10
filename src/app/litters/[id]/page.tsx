import Link from "next/link";
import { redirect } from "next/navigation";

import {
  updateProducedOffspringAvailability,
} from "@/features/animals/actions";
import {
  formatAnimalCoat,
  formatAnimalDate,
  getAnimalDisplayName,
  getAnimalSexLabel,
  getAnimalStatusLabel,
  getBornOffspringLabel,
  getOwnershipStatusLabel,
} from "@/features/animals/formatters";
import { getSexPreferenceLabel } from "@/features/applications/formatters";
import {
  CampaignEmailTemplatePicker,
} from "@/features/documents/campaign-email-template-picker";
import {
  getCampaignEmailTemplateOptions,
  isCampaignEmailTemplateCategory,
} from "@/features/documents/campaign-email-template-options";
import {
  getDocumentStatusLabel,
  getDocumentTypeLabel,
  getSignatureRequiredLabel,
} from "@/features/documents/formatters";
import {
  createLitterEvent,
  updateLitterDetails,
  updateLitterGroupAssignment,
} from "@/features/litters/actions";
import {
  LitterFields,
  type LitterAnimalOption,
} from "@/features/litters/litter-fields";
import { filterEligibleLitterParents } from "@/features/litters/parent-eligibility";
import { OffspringCreationForm } from "@/features/litters/offspring-creation-form";
import {
  LinkedApplicationsSection,
  type LinkedApplication,
} from "@/features/litters/linked-records";
import {
  formatLitterCount,
  formatLitterDate,
  getLitterDisplayName,
  getLitterStatusLabel,
  getSpeciesLabel,
} from "@/features/litters/formatters";
import type { LitterOverview } from "@/features/litters/types";
import {
  readDepositSettingsForOrganization,
  resolveDepositSettings,
  type ResolvedDepositSettings,
} from "@/features/payments/deposit-thresholds";
import {
  formatPrice,
  getPreReservationDepositBadgeClassName,
  getReservationStatusLabel,
} from "@/features/reservations/formatters";
import {
  ChoiceAppointmentCampaignList,
  type ChoiceAppointmentCampaignReservation,
} from "@/features/reservations/choice-appointment-campaign-list";
import {
  confirmChoiceAppointmentsAdoptionBookletCampaign,
  launchLitterDepartureBalanceCampaign,
  launchLitterPreReservationBalanceCampaign,
  launchPreReservationCampaign,
} from "@/features/reservations/actions";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

export const dynamic = "force-dynamic";

type DBLitter = Database["public"]["Tables"]["litters"]["Row"];
type RelatedAnimal = Pick<
  Database["public"]["Tables"]["animals"]["Row"],
  | "id"
  | "display_name"
  | "temporary_name"
  | "call_name"
  | "official_name"
  | "species"
  | "sex"
  | "status"
  | "ownership_status"
  | "litter_id"
  | "is_breeder"
  | "is_external"
  | "is_retired"
  | "birth_date"
  | "birth_order"
  | "identification_number"
  | "color"
  | "coat_color"
  | "created_at"
>;
type RelatedDocument = Pick<
  Database["public"]["Tables"]["documents"]["Row"],
  | "id"
  | "title"
  | "document_type"
  | "status"
  | "created_at"
  | "updated_at"
  | "sent_at"
  | "received_at"
  | "signed_at"
  | "file_name"
  | "signature_required"
>;
type RelatedReservation = Pick<
  Database["public"]["Views"]["reservation_overview"]["Row"],
  | "id"
  | "contact_id"
  | "contact_display_name"
  | "status"
  | "price_cents"
  | "paid_cents"
  | "currency"
  | "animal_id"
  | "animal_display_name"
  | "reserved_sex_preference"
  | "created_at"
>;
type LitterCampaignReservation = Pick<
  Database["public"]["Tables"]["reservations"]["Row"],
  "id" | "contact_id" | "status" | "animal_id" | "created_at"
>;
type RelatedReservationPayment = Pick<
  Database["public"]["Tables"]["payments"]["Row"],
  "reservation_id" | "amount_cents" | "payment_type" | "status"
>;
type ReservationFinancialBadge = {
  label: string;
  className: string;
};
type QualifiedApplication = Pick<
  Database["public"]["Tables"]["applications"]["Row"],
  | "id"
  | "contact_id"
  | "desired_sex_preference"
  | "status"
  | "active_rank"
  | "initial_rank"
> & {
  contacts: { display_name: string | null } | null;
};
type RelatedNote = Pick<
  Database["public"]["Tables"]["notes"]["Row"],
  | "id"
  | "title"
  | "body"
  | "note_type"
  | "visibility"
  | "created_at"
  | "created_by"
> & {
  profiles: { display_name: string | null } | null;
};
type RelatedEvent = Pick<
  Database["public"]["Tables"]["events"]["Row"],
  | "id"
  | "title"
  | "description"
  | "event_type"
  | "status"
  | "priority"
  | "planned_at"
  | "planned_date"
  | "actual_at"
  | "created_at"
>;
type ChoiceCampaignDocument = Pick<
  Database["public"]["Tables"]["documents"]["Row"],
  "reservation_id" | "document_type" | "status" | "received_at" | "signed_at"
>;
type ChoiceCampaignAppointment = Pick<
  Database["public"]["Tables"]["events"]["Row"],
  "reservation_id" | "event_type" | "planned_at"
>;
type ChoiceCampaignTrace = Pick<
  Database["public"]["Tables"]["events"]["Row"],
  "reservation_id" | "description"
>;
type ChoiceCampaignContact = Pick<
  Database["public"]["Tables"]["contacts"]["Row"],
  "id" | "first_name" | "display_name"
>;
type ChoiceCampaignAnimal = Pick<
  Database["public"]["Tables"]["animals"]["Row"],
  "id" | "display_name" | "temporary_name" | "call_name" | "official_name"
>;
type LitterSummary = Pick<
  LitterOverview,
  | "id"
  | "litter_group_name"
  | "mother_display_name"
  | "father_display_name"
  | "animal_count"
  | "reservation_count"
>;

const FINAL_RESERVATION_STATUSES = new Set([
  "adopted",
  "withdrawn",
  "cancelled",
  "expired",
  "archived",
]);

const DEPOSIT_PAYMENT_TYPES = new Set([
  "arrhes",
  "pre_reservation_deposit_refundable",
]);

const CHOICE_APPOINTMENT_ADOPTION_BOOKLET_TEMPLATE_KEY =
  "choice_appointment_adoption_booklet";
const CHOICE_APPOINTMENTS_CAMPAIGN_TRACE_TITLE =
  "Créneaux proposés et livret d’adoption envoyés";
const CHOICE_APPOINTMENTS_ELIGIBLE_STATUSES = new Set([
  "pre_reservation_paid",
  "active",
  "confirmed_after_birth",
  "animal_assigned",
  "adoption_ready",
]);

function getChoiceCampaignAnimalName(
  animal: ChoiceCampaignAnimal | undefined,
) {
  if (!animal) {
    return null;
  }

  return (
    animal.display_name ||
    animal.call_name ||
    animal.temporary_name ||
    animal.official_name ||
    null
  );
}

function isChoiceCampaignDocumentSigned(
  document: ChoiceCampaignDocument,
) {
  return document.status === "signed";
}

function traceDescriptionMatchesChoiceAppointments({
  description,
  choiceAppointmentAt,
  adoptionAppointmentAt,
}: {
  description: string | null;
  choiceAppointmentAt: string;
  adoptionAppointmentAt: string;
}) {
  return (
    Boolean(description) &&
    description?.includes(`Créneau de choix ISO : ${choiceAppointmentAt}`) &&
    description?.includes(`Créneau de départ ISO : ${adoptionAppointmentAt}`)
  );
}

function getReservationFinancialBadge({
  reservation,
  payments,
  depositSettings,
}: {
  reservation: RelatedReservation;
  payments: RelatedReservationPayment[];
  depositSettings: ResolvedDepositSettings;
}): ReservationFinancialBadge | null {
  if (
    reservation.status &&
    FINAL_RESERVATION_STATUSES.has(reservation.status)
  ) {
    return null;
  }

  const depositPayments = payments.filter((payment) =>
    DEPOSIT_PAYMENT_TYPES.has(payment.payment_type),
  );
  const paidDepositCents = depositPayments
    .filter((payment) => payment.status === "paid")
    .reduce((total, payment) => total + payment.amount_cents, 0);

  if (paidDepositCents >= depositSettings.completeDepositCents) {
    return {
      label: "Arrhes complètes réglées",
      className: getPreReservationDepositBadgeClassName("paid"),
    };
  }

  if (paidDepositCents > 0) {
    return {
      label: "Pré-réservation réglée",
      className: getPreReservationDepositBadgeClassName("paid"),
    };
  }

  const hasPendingPreReservationRequest = depositPayments.some(
    (payment) =>
      payment.status === "requested" ||
      payment.status === "pending" ||
      payment.status === "partially_paid",
  );

  if (hasPendingPreReservationRequest) {
    return {
      label: "Pré-réservation à régler",
      className: getPreReservationDepositBadgeClassName("requested"),
    };
  }

  if (reservation.status === "draft") {
    return {
      label: "Aucun paiement demandé",
      className: getPreReservationDepositBadgeClassName("absent"),
    };
  }

  return null;
}

const litterEventTypeOptions = [
  ["mating", "Saillie"],
  ["pregnancy_check", "Contrôle de gestation"],
  ["ultrasound", "Échographie"],
  ["vaccination", "Vaccination"],
  ["xray", "Radiographie"],
  ["birth_expected", "Naissance prévue"],
  ["birth_actual", "Naissance réelle"],
  ["puppy_choice", "Choix du chiot"],
  ["adoption", "Adoption"],
  ["contact_follow_up", "Suivi contact"],
  ["application_review", "Relecture candidature"],
  ["payment_due", "Paiement attendu"],
  ["document_due", "Document attendu"],
  ["post_adoption_follow_up", "Suivi post-adoption"],
  ["other", "Autre"],
] as const;

const eventStatusOptions = [
  ["planned", "Planifié"],
  ["todo", "À faire"],
  ["in_progress", "En cours"],
  ["done", "Fait"],
  ["late", "En retard"],
  ["cancelled", "Annulé"],
  ["postponed", "Reporté"],
  ["not_applicable", "Sans objet"],
] as const;

const eventPriorityOptions = [
  ["low", "Basse"],
  ["normal", "Normale"],
  ["high", "Haute"],
  ["urgent", "Urgente"],
] as const;

function NotFoundOrUnauthorized() {
  return (
    <section className="rounded-2xl border border-dashed bg-surface px-6 py-16 text-center">
      <h1 className="text-2xl font-semibold">
        Portée introuvable ou inaccessible.
      </h1>
      <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-muted">
        Cette portée n’existe pas ou vous n’êtes pas autorisé à la consulter.
      </p>
      <Link
        href="/litters"
        className="mt-6 inline-flex rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white"
      >
        Retour aux portées
      </Link>
    </section>
  );
}

function ErrorMessage() {
  return (
    <section
      role="alert"
      className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-12 text-center text-amber-950"
    >
      <h1 className="text-xl font-semibold">
        Impossible de charger la portée
      </h1>
      <p className="mt-2 text-sm">
        Réessayez dans quelques instants. Aucune donnée n’a été modifiée.
      </p>
      <Link
        href="/litters"
        className="mt-6 inline-flex text-sm font-semibold underline"
      >
        Retour aux portées
      </Link>
    </section>
  );
}

function DetailItem({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </dt>
      <dd className="mt-1.5 text-sm leading-6">
        {value || "Non renseigné"}
      </dd>
    </div>
  );
}

function CompactDetailItem({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 border-b py-3 last:border-b-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </dt>
      <dd className="text-sm leading-6 text-foreground sm:text-right">
        {value || "Non renseigné"}
      </dd>
    </div>
  );
}

function formatBirthOrder(value: number | null) {
  if (value === null || value === undefined) {
    return "Non renseigné";
  }

  return new Intl.NumberFormat("fr-FR").format(value);
}

function getUsefulDocumentDate(document: RelatedDocument) {
  if (document.signed_at) {
    return { label: "Signé le", value: document.signed_at };
  }

  if (document.received_at) {
    return { label: "Reçu le", value: document.received_at };
  }

  if (document.sent_at) {
    return { label: "Envoyé le", value: document.sent_at };
  }

  if (document.updated_at) {
    return { label: "Mis à jour le", value: document.updated_at };
  }

  return { label: "Créé le", value: document.created_at };
}

function getUsefulEventDate(event: RelatedEvent) {
  return event.actual_at ?? event.planned_at ?? event.planned_date ?? event.created_at;
}

function getEventTypeLabel(value: string) {
  return (
    litterEventTypeOptions.find(([optionValue]) => optionValue === value)?.[1] ??
    value.replaceAll("_", " ")
  );
}

function getEventStatusLabel(value: string) {
  return (
    eventStatusOptions.find(([optionValue]) => optionValue === value)?.[1] ??
    value
  );
}

function getEventPriorityLabel(value: string) {
  return (
    eventPriorityOptions.find(([optionValue]) => optionValue === value)?.[1] ??
    value
  );
}

function getPrimaryBirthDate(litter: DBLitter) {
  if (litter.actual_birth_date) {
    return {
      label: "Naissance réelle",
      value: formatLitterDate(litter.actual_birth_date),
    };
  }

  if (litter.expected_birth_date) {
    return {
      label: "Naissance prévue",
      value: formatLitterDate(litter.expected_birth_date),
    };
  }

  return { label: "Naissance", value: "Non renseignée" };
}

function getBirthCountSummary(litter: DBLitter, hasSexBreakdown: boolean) {
  const parts = [];

  if (litter.expected_puppy_count !== null) {
    parts.push(`${formatLitterCount(litter.expected_puppy_count)} attendu(s)`);
  }

  if (!hasSexBreakdown && litter.born_total_count !== null) {
    parts.push(`${formatLitterCount(litter.born_total_count)} né(s)`);
  }

  if (!hasSexBreakdown && litter.alive_count !== null) {
    parts.push(`${formatLitterCount(litter.alive_count)} vivant(s)`);
  }

  return parts.length > 0 ? parts.join(" · ") : null;
}

function formatKnownParts(parts: Array<string | null>) {
  const knownParts = parts.filter((part): part is string => Boolean(part));

  return knownParts.length > 0 ? knownParts.join(" · ") : "Non renseigné";
}

function formatDatePart(label: string, value: string | null) {
  return value ? `${label} ${formatLitterDate(value)}` : null;
}

function formatCountPart(label: string, value: number | null) {
  return value !== null && value !== undefined
    ? `${label} ${formatLitterCount(value)}`
    : null;
}

function countRelatedAnimalsBySex(
  animals: RelatedAnimal[] | null,
  sex: "male" | "female",
) {
  if (!animals) {
    return null;
  }

  return animals.filter((animal) => animal.sex === sex).length;
}

function getBirthCounterCards(
  litter: DBLitter,
  animals: RelatedAnimal[] | null,
) {
  const animalMaleCount = countRelatedAnimalsBySex(animals, "male");
  const animalFemaleCount = countRelatedAnimalsBySex(animals, "female");
  const maleCount = animalMaleCount ?? litter.born_male_count;
  const femaleCount = animalFemaleCount ?? litter.born_female_count;
  const calculatedTotalFromSex =
    maleCount !== null && femaleCount !== null ? maleCount + femaleCount : null;
  const calculatedTotalFromAnimals =
    animals ? animals.length : null;
  const totalBornCount =
    calculatedTotalFromAnimals ?? calculatedTotalFromSex ?? litter.born_total_count;
  const hasSexBreakdown = maleCount !== null && femaleCount !== null;

  const cards = hasSexBreakdown
    ? [
        { label: "Mâles", value: maleCount },
        { label: "Femelles", value: femaleCount },
      ]
    : [
        { label: "Total né", value: totalBornCount },
        { label: "Vivants", value: litter.alive_count },
      ];

  return {
    cards: cards.filter((item) => item.value !== null && item.value !== undefined),
    hasSexBreakdown,
  };
}

function SummaryCard({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-background px-3 py-2">
      <dt className="text-[0.65rem] font-semibold uppercase leading-4 tracking-wide text-muted">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm font-semibold leading-5 text-foreground">
        {value || "Non renseigné"}
      </dd>
    </div>
  );
}

function CollapsibleSection({
  id,
  title,
  children,
}: {
  id?: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <details id={id} className="rounded-2xl border bg-surface p-6 sm:p-8">
      <summary className="cursor-pointer text-xl font-semibold">
        {title}
      </summary>
      <div className="mt-5">{children}</div>
    </details>
  );
}

function LitterTopSummary({
  litter,
  summary,
  animals,
  linkedApplications,
}: {
  litter: DBLitter;
  summary: LitterSummary | null;
  animals: RelatedAnimal[] | null;
  linkedApplications: LinkedApplication[] | null;
}) {
  const birthDate = getPrimaryBirthDate(litter);
  const birthCounters = getBirthCounterCards(litter, animals);
  const birthCountSummary = getBirthCountSummary(
    litter,
    birthCounters.hasSexBreakdown,
  );

  return (
    <section className="rounded-2xl border bg-surface p-6 sm:p-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-accent">
            Résumé
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">
            {getLitterDisplayName(litter.name, litter.id)}
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="inline-flex rounded-full border px-3 py-1 text-xs font-semibold text-muted">
              {getLitterStatusLabel(litter.status)}
            </span>
            <span className="inline-flex rounded-full border px-3 py-1 text-xs font-semibold text-muted">
              {getSpeciesLabel(litter.species)} ·{" "}
              {litter.breed || "Race non renseignée"}
            </span>
          </div>
        </div>

        {litter.litter_group_id ? (
          <Link
            href={`/litter-groups/${litter.litter_group_id}`}
            className="inline-flex self-start rounded-lg border px-3 py-2 text-sm font-semibold text-accent transition hover:border-accent/40 hover:bg-accent-soft"
          >
            {summary?.litter_group_name ?? "Groupe de portées"}
          </Link>
        ) : null}
      </div>

      <dl className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          label="Mère"
          value={
            litter.mother_id ? (
              <Link
                href={`/animals/${litter.mother_id}`}
                className="text-accent hover:underline"
              >
                {summary?.mother_display_name ?? "Mère"}
              </Link>
            ) : (
              summary?.mother_display_name ?? null
            )
          }
        />
        <SummaryCard
          label="Père"
          value={
            litter.father_id ? (
              <Link
                href={`/animals/${litter.father_id}`}
                className="text-accent hover:underline"
              >
                {summary?.father_display_name ?? "Père"}
              </Link>
            ) : (
              summary?.father_display_name ?? null
            )
          }
        />
        <SummaryCard label={birthDate.label} value={birthDate.value} />
        {birthCountSummary ? (
          <SummaryCard label="Portée" value={birthCountSummary} />
        ) : null}
        {birthCounters.cards.map((item) => (
          <SummaryCard
            key={item.label}
            label={item.label}
            value={formatLitterCount(item.value)}
          />
        ))}
        <SummaryCard
          label="Réservations"
          value={formatLitterCount(summary?.reservation_count ?? null)}
        />
        <SummaryCard
          label="Candidatures"
          value={
            linkedApplications
              ? formatLitterCount(linkedApplications.length)
              : "Non renseigné"
          }
        />
      </dl>
    </section>
  );
}

function RelatedAnimalsSection({
  animals,
  hasError,
  banner,
  footer,
}: {
  animals: RelatedAnimal[] | null;
  hasError: boolean;
  banner?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  function canToggleOffspringAvailability(animal: RelatedAnimal) {
    return (
      Boolean(animal.litter_id) &&
      animal.ownership_status === "produced" &&
      (animal.status === "born" || animal.status === "available") &&
      !animal.is_breeder &&
      !animal.is_external &&
      !animal.is_retired
    );
  }

  return (
    <section id="animaux-lies" className="rounded-2xl border bg-surface p-6 sm:p-8">
      <h2 className="text-xl font-semibold">Animaux liés</h2>

      {banner}
      {footer}

      {hasError ? (
        <p role="alert" className="mt-5 text-sm text-amber-800">
          Impossible de charger les animaux liés.
        </p>
      ) : !animals || animals.length === 0 ? (
        <p className="mt-5 text-sm text-muted">
          Aucun animal lié à cette portée.
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border bg-background">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="border-b bg-muted-soft text-xs font-semibold uppercase tracking-wide text-muted">
              <tr>
                <th scope="col" className="px-4 py-3">
                  Animal
                </th>
                <th scope="col" className="px-4 py-3">
                  Statut
                </th>
                <th scope="col" className="px-4 py-3">
                  Naissance
                </th>
                <th scope="col" className="px-4 py-3">
                  Identification
                </th>
                <th scope="col" className="px-4 py-3">
                  Couleur / robe
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {animals.map((animal) => (
                <tr key={animal.id}>
                  <td className="min-w-56 px-4 py-4">
                    <div className="flex flex-col items-start gap-1.5">
                      <p className="font-semibold text-foreground">
                        {getAnimalDisplayName(animal)}
                      </p>
                      <Link
                        href={`/animals/${animal.id}`}
                        className="inline-flex rounded-md border border-border px-2.5 py-1 text-xs font-semibold leading-none text-accent transition hover:border-accent hover:bg-accent-soft"
                      >
                        Fiche
                      </Link>
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      Sexe : {getAnimalSexLabel(animal.sex)}
                    </p>
                    {getBornOffspringLabel(animal) ? (
                      <p className="mt-1 text-xs text-muted">
                        {getBornOffspringLabel(animal)}
                      </p>
                    ) : null}
                    <p className="mt-1 text-xs text-muted">
                      Ordre : {formatBirthOrder(animal.birth_order)}
                    </p>
                  </td>
                  <td className="whitespace-nowrap px-4 py-4">
                    <span className="inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold text-muted">
                      {getAnimalStatusLabel(animal.status)}
                    </span>
                    {canToggleOffspringAvailability(animal) ? (
                      <form
                        action={updateProducedOffspringAvailability}
                        className="mt-3 flex min-w-52 flex-wrap items-end gap-2"
                      >
                        <input type="hidden" name="animal_id" value={animal.id} />
                        <input
                          type="hidden"
                          name="source_litter_id"
                          value={animal.litter_id ?? ""}
                        />
                        <label
                          htmlFor={`animal-availability-${animal.id}`}
                          className="sr-only"
                        >
                          Statut de disponibilité
                        </label>
                        <select
                          id={`animal-availability-${animal.id}`}
                          name="next_status"
                          defaultValue={animal.status ?? "born"}
                          className="rounded-lg border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground outline-none transition focus:border-accent"
                        >
                          <option value="born">Né</option>
                          <option value="available">Disponible</option>
                        </select>
                        <button
                          type="submit"
                          className="rounded-lg border px-2.5 py-1.5 text-xs font-semibold text-accent transition hover:border-accent/40 hover:bg-accent-soft"
                        >
                          Mettre à jour
                        </button>
                      </form>
                    ) : null}
                    <p className="mt-2 text-xs text-muted">
                      Origine : {getOwnershipStatusLabel(animal.ownership_status)}
                    </p>
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 text-muted">
                    {formatAnimalDate(animal.birth_date)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 text-muted">
                    {animal.identification_number || "Non renseignée"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 text-muted">
                    {formatAnimalCoat(animal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function RelatedReservationsSection({
  reservations,
  paymentsByReservationId,
  depositSettings,
  hasError,
  sectionId,
  banner,
  footer,
}: {
  reservations: RelatedReservation[] | null;
  paymentsByReservationId: Map<string, RelatedReservationPayment[]>;
  depositSettings: ResolvedDepositSettings;
  hasError: boolean;
  sectionId?: string;
  banner?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <section id={sectionId} className="rounded-2xl border bg-surface p-6 sm:p-8">
      <h2 className="text-xl font-semibold">
        Dossiers adoptants liés à cette portée
      </h2>

      {banner}

      {hasError ? (
        <p role="alert" className="mt-5 text-sm text-amber-800">
          Impossible de charger les dossiers adoptants liés.
        </p>
      ) : !reservations || reservations.length === 0 ? (
        <p className="mt-5 text-sm text-muted">
          Aucun dossier adoptant lié à cette portée.
        </p>
      ) : (
        <div className="mt-6 divide-y divide-border">
          {reservations.map((reservation, index) => {
            const dateText = formatLitterDate(reservation.created_at);
            const reservationStatusLabel = getReservationStatusLabel(
              reservation.status,
            );
            const financialBadge = getReservationFinancialBadge({
              reservation,
              payments: reservation.id
                ? (paymentsByReservationId.get(reservation.id) ?? [])
                : [],
              depositSettings,
            });

            return (
              <div
                key={reservation.id ?? `${reservation.contact_id}-${index}`}
                className="py-5 first:pt-0 last:pb-0"
              >
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-sm font-semibold text-foreground">
                        {reservation.contact_id ? (
                          <Link
                            href={`/contacts/${reservation.contact_id}`}
                            className="text-accent hover:underline"
                          >
                            {reservation.contact_display_name ??
                              "Contact non renseigné"}
                          </Link>
                        ) : (
                          reservation.contact_display_name ??
                            "Contact non renseigné"
                        )}
                      </span>
                      {financialBadge?.label !== reservationStatusLabel ? (
                        <span className="inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold text-muted">
                          {reservationStatusLabel}
                        </span>
                      ) : null}
                      {financialBadge ? (
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${financialBadge.className}`}
                        >
                          {financialBadge.label}
                        </span>
                      ) : null}
                      {reservation.id ? (
                        <Link
                          href={`/reservations/${reservation.id}`}
                          className="inline-flex rounded-md border border-border px-2.5 py-1 text-xs font-semibold leading-none text-accent transition hover:border-accent hover:bg-accent-soft"
                        >
                          Fiche
                        </Link>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted">
                      Préférence :{" "}
                      {getSexPreferenceLabel(
                        reservation.reserved_sex_preference,
                      )}
                    </p>
                    <p className="text-xs text-muted">
                      Animal :{" "}
                      {reservation.animal_id ? (
                        <Link
                          href={`/animals/${reservation.animal_id}`}
                          className="font-medium text-accent hover:underline"
                        >
                          {reservation.animal_display_name}
                        </Link>
                      ) : (
                        reservation.animal_display_name ?? "Non attribué"
                      )}
                    </p>
                    <p className="text-xs text-muted">
                      Tarif :{" "}
                      {formatPrice(
                        reservation.price_cents,
                        reservation.currency,
                      )}
                      {reservation.paid_cents !== null &&
                      reservation.paid_cents !== undefined &&
                      reservation.paid_cents > 0 ? (
                        <span className="ml-2 font-medium text-emerald-700">
                          (Payé :{" "}
                          {formatPrice(
                            reservation.paid_cents,
                            reservation.currency,
                          )}
                          )
                        </span>
                      ) : (
                        <span className="ml-2 font-medium text-muted">
                          (Non payé)
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted">Créée le {dateText}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {footer}
    </section>
  );
}

function RelatedEventsSection({
  events,
  hasError,
  banner,
  footer,
}: {
  events: RelatedEvent[] | null;
  hasError: boolean;
  banner?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <CollapsibleSection
      id="evenements-lies"
      title="Événements liés et ajout d’événement"
    >
      {banner}

      {hasError ? (
        <p role="alert" className="text-sm text-amber-800">
          Impossible de charger les événements liés.
        </p>
      ) : !events || events.length === 0 ? (
        <p className="text-sm text-muted">
          Aucun événement lié à cette portée.
        </p>
      ) : (
        <div className="divide-y divide-border">
          {events.map((event) => (
            <div key={event.id} className="py-5 first:pt-0 last:pb-0">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-sm font-semibold text-foreground">
                    {event.title || getEventTypeLabel(event.event_type)}
                  </span>
                  <span className="inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold text-muted">
                    {getEventStatusLabel(event.status)}
                  </span>
                  <span className="inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold text-muted">
                    Priorité : {getEventPriorityLabel(event.priority)}
                  </span>
                </div>
                <p className="text-xs text-muted">
                  Type : {getEventTypeLabel(event.event_type)}
                </p>
                <p className="text-xs text-muted">
                  Date utile : {formatLitterDate(getUsefulEventDate(event))}
                </p>
                <p className="text-xs text-muted">
                  Créé le {formatLitterDate(event.created_at)}
                </p>
                {event.description ? (
                  <p className="whitespace-pre-wrap text-sm leading-6 text-muted">
                    {event.description}
                  </p>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}

      {footer}
    </CollapsibleSection>
  );
}

function LitterEventCreationForm({ litterId }: { litterId: string }) {
  return (
    <details className="mt-6 rounded-xl border bg-background px-4 py-3">
      <summary className="cursor-pointer text-sm font-semibold text-accent">
        Ajouter un événement
      </summary>

      <form action={createLitterEvent} className="mt-5 space-y-5">
        <input type="hidden" name="litter_id" value={litterId} />

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="litter-event-title"
              className="text-xs font-semibold uppercase tracking-wide text-muted"
            >
              Titre <span className="text-accent">*</span>
            </label>
            <input
              id="litter-event-title"
              name="title"
              type="text"
              required
              maxLength={255}
              className="mt-2 w-full rounded-xl border bg-background px-4 py-3 text-sm focus:border-accent focus:outline-none"
            />
          </div>

        <div>
          <label
            htmlFor="litter-event-date"
            className="text-xs font-semibold uppercase tracking-wide text-muted"
          >
            Date prévue / échéance <span className="text-accent">*</span>
          </label>
          <input
            id="litter-event-date"
            name="event_date"
            type="date"
            required
            className="mt-2 w-full rounded-xl border bg-background px-4 py-3 text-sm focus:border-accent focus:outline-none"
          />
          <p className="mt-1.5 text-xs leading-5 text-muted">
            Cette date sert à planifier l’événement ou l’échéance.
          </p>
        </div>

        <div>
          <label
            htmlFor="litter-event-type"
            className="text-xs font-semibold uppercase tracking-wide text-muted"
          >
            Type
          </label>
          <select
            id="litter-event-type"
            name="event_type"
            defaultValue="other"
            className="mt-2 w-full rounded-xl border bg-background px-4 py-3 text-sm focus:border-accent focus:outline-none"
          >
            {litterEventTypeOptions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="litter-event-status"
            className="text-xs font-semibold uppercase tracking-wide text-muted"
          >
            Statut
          </label>
          <select
            id="litter-event-status"
            name="status"
            defaultValue="planned"
            className="mt-2 w-full rounded-xl border bg-background px-4 py-3 text-sm focus:border-accent focus:outline-none"
          >
            {eventStatusOptions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="litter-event-priority"
            className="text-xs font-semibold uppercase tracking-wide text-muted"
          >
            Priorité
          </label>
          <select
            id="litter-event-priority"
            name="priority"
            defaultValue="normal"
            className="mt-2 w-full rounded-xl border bg-background px-4 py-3 text-sm focus:border-accent focus:outline-none"
          >
            {eventPriorityOptions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className="self-end">
          <label
            htmlFor="litter-event-is-task"
            className="flex items-center gap-3 rounded-xl border bg-background px-4 py-3 text-sm text-muted"
          >
            <input
              id="litter-event-is-task"
              name="is_task"
              type="checkbox"
              className="h-4 w-4 rounded border-border accent-accent"
            />
            Marquer comme tâche
          </label>
          <p className="mt-1.5 text-xs leading-5 text-muted">
            À cocher quand l’événement demande une action à suivre.
          </p>
        </div>

        <div className="sm:col-span-2">
          <label
            htmlFor="litter-event-description"
            className="text-xs font-semibold uppercase tracking-wide text-muted"
          >
            Note / observation
          </label>
          <textarea
            id="litter-event-description"
            name="description"
            rows={3}
            className="mt-2 w-full rounded-xl border bg-background px-4 py-3 text-sm focus:border-accent focus:outline-none"
          />
        </div>
      </div>

      <div className="mt-5 flex justify-end">
        <button
          type="submit"
          className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
        >
          Ajouter l’événement
        </button>
      </div>
      </form>
    </details>
  );
}

function RelatedNotesSection({
  notes,
  hasError,
}: {
  notes: RelatedNote[] | null;
  hasError: boolean;
}) {
  return (
    <CollapsibleSection title="Notes liées">
      {hasError ? (
        <p role="alert" className="text-sm text-amber-800">
          Impossible de charger les notes liées.
        </p>
      ) : !notes || notes.length === 0 ? (
        <p className="text-sm text-muted">
          Aucune note liée à cette portée.
        </p>
      ) : (
        <div className="divide-y divide-border">
          {notes.map((note) => {
            const authorName =
              note.profiles?.display_name || "Auteur inconnu";

            return (
              <div key={note.id} className="py-5 first:pt-0 last:pb-0">
                <div className="space-y-2">
                  {note.title ? (
                    <p className="text-sm font-semibold text-foreground">
                      {note.title}
                    </p>
                  ) : null}
                  <p className="whitespace-pre-wrap text-sm leading-6 text-muted">
                    {note.body}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                    <span>{formatLitterDate(note.created_at)}</span>
                    <span aria-hidden="true">•</span>
                    <span>Type : {note.note_type}</span>
                    <span aria-hidden="true">•</span>
                    <span>Visibilité : {note.visibility}</span>
                    <span aria-hidden="true">•</span>
                    <span>Par {authorName}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </CollapsibleSection>
  );
}

function RelatedDocumentsSection({
  documents,
  hasError,
}: {
  documents: RelatedDocument[] | null;
  hasError: boolean;
}) {
  return (
    <CollapsibleSection title="Documents liés">
      {hasError ? (
        <p role="alert" className="text-sm text-amber-800">
          Impossible de charger les documents liés.
        </p>
      ) : !documents || documents.length === 0 ? (
        <p className="text-sm text-muted">
          Aucun document lié à cette portée.
        </p>
      ) : (
        <div className="divide-y divide-border">
          {documents.map((document) => {
            const usefulDate = getUsefulDocumentDate(document);

            return (
              <div key={document.id} className="py-5 first:pt-0 last:pb-0">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-sm font-semibold text-foreground">
                      {document.title}
                    </span>
                    <span className="inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold text-muted">
                      {getDocumentStatusLabel(document.status)}
                    </span>
                    <Link
                      href={`/documents/${document.id}`}
                      className="inline-flex rounded-md border border-border px-2.5 py-1 text-xs font-semibold leading-none text-accent transition hover:border-accent hover:bg-accent-soft"
                    >
                      Fiche
                    </Link>
                  </div>
                  <p className="text-xs text-muted">
                    Type : {getDocumentTypeLabel(document.document_type)}
                  </p>
                  <p className="text-xs text-muted">
                    {usefulDate.label} {formatLitterDate(usefulDate.value)}
                  </p>
                  <p className="text-xs text-muted">
                    Fichier : {document.file_name || "Non renseigné"}
                  </p>
                  <p className="text-xs text-muted">
                    Signature requise :{" "}
                    {getSignatureRequiredLabel(document.signature_required)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </CollapsibleSection>
  );
}

export default async function LitterDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    campaign_status?: string;
    campaign_count?: string;
    campaign_payment_count?: string;
    campaign_draft_conflict_count?: string;
    balance_campaign_status?: string;
    balance_campaign_count?: string;
    balance_campaign_payment_count?: string;
    balance_campaign_complete_count?: string;
    balance_campaign_active_request_count?: string;
    balance_campaign_unpaid_count?: string;
    balance_campaign_ineligible_count?: string;
    balance_campaign_error_count?: string;
    departure_balance_campaign_status?: string;
    departure_balance_campaign_count?: string;
    departure_balance_campaign_payment_count?: string;
    departure_balance_campaign_no_balance_count?: string;
    departure_balance_campaign_active_request_count?: string;
    departure_balance_campaign_missing_price_count?: string;
    departure_balance_campaign_ineligible_count?: string;
    departure_balance_campaign_error_count?: string;
    choice_appointments_campaign_status?: string;
    choice_appointments_campaign_selected_count?: string;
    choice_appointments_campaign_confirmed_count?: string;
    choice_appointments_campaign_already_count?: string;
    choice_appointments_campaign_not_found_count?: string;
    choice_appointments_campaign_not_in_journey_count?: string;
    choice_appointments_campaign_final_status_count?: string;
    choice_appointments_campaign_missing_documents_count?: string;
    choice_appointments_campaign_deposit_incomplete_count?: string;
    choice_appointments_campaign_missing_choice_count?: string;
    choice_appointments_campaign_missing_adoption_count?: string;
    choice_appointments_campaign_error_count?: string;
    group_assignment_status?: string;
    detail_status?: string;
    offspring_status?: string;
    offspring_count?: string;
    animal_availability_status?: string;
    event_status?: string;
  }>;
}) {
  const { id } = await params;
  const {
    campaign_status,
    campaign_count,
    campaign_payment_count,
    campaign_draft_conflict_count,
    balance_campaign_status,
    balance_campaign_count,
    balance_campaign_payment_count,
    balance_campaign_complete_count,
    balance_campaign_active_request_count,
    balance_campaign_unpaid_count,
    balance_campaign_ineligible_count,
    balance_campaign_error_count,
    departure_balance_campaign_status,
    departure_balance_campaign_count,
    departure_balance_campaign_payment_count,
    departure_balance_campaign_no_balance_count,
    departure_balance_campaign_active_request_count,
    departure_balance_campaign_missing_price_count,
    departure_balance_campaign_ineligible_count,
    departure_balance_campaign_error_count,
    choice_appointments_campaign_status,
    choice_appointments_campaign_selected_count,
    choice_appointments_campaign_confirmed_count,
    choice_appointments_campaign_already_count,
    choice_appointments_campaign_not_found_count,
    choice_appointments_campaign_not_in_journey_count,
    choice_appointments_campaign_final_status_count,
    choice_appointments_campaign_missing_documents_count,
    choice_appointments_campaign_deposit_incomplete_count,
    choice_appointments_campaign_missing_choice_count,
    choice_appointments_campaign_missing_adoption_count,
    choice_appointments_campaign_error_count,
    group_assignment_status,
    detail_status,
    offspring_status,
    offspring_count,
    animal_availability_status,
    event_status,
  } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: rawLitter, error: readError } = await supabase
    .from("litters")
    .select(
      "id, organization_id, name, species, breed, status, litter_group_id, mother_id, father_id, mating_date, mating_date_2, estimated_ovulation_date, expected_birth_date, actual_birth_date, pregnancy_confirmed_at, pregnancy_confirmation_method, expected_puppy_count, born_total_count, born_male_count, born_female_count, alive_count, notes, created_at, updated_at, deleted_at",
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  const litter = rawLitter as DBLitter | null;

  const depositSettings =
    litter?.organization_id
      ? await readDepositSettingsForOrganization({
          supabase,
          organizationId: litter.organization_id,
        })
      : resolveDepositSettings(null);

  const { data: rawSummary, error: summaryError } = litter
    ? await supabase
        .from("litter_overview")
        .select(
          "id, litter_group_name, mother_display_name, father_display_name, animal_count, reservation_count",
        )
        .eq("id", id)
        .maybeSingle()
    : { data: null, error: null };

  const summary = rawSummary as LitterSummary | null;

  // Groupes de portées disponibles pour le rattachement (même organisation).
  const { data: rawGroupOptions } =
    litter && litter.organization_id
      ? await supabase
          .from("litter_groups")
          .select("id, name")
          .eq("organization_id", litter.organization_id)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
      : { data: null };

  const groupOptions = (rawGroupOptions ?? []) as {
    id: string;
    name: string | null;
  }[];

  // Animaux de l'organisation pour les selects mère/père du formulaire d'édition.
  const { data: rawAnimalOptions } =
    litter && litter.organization_id
      ? await supabase
          .from("animals")
          .select(
            "id, display_name, sex, species, breed, status, ownership_status, is_breeder, is_external, is_retired, litter_id, deleted_at",
          )
          .eq("organization_id", litter.organization_id)
          .is("deleted_at", null)
          .order("display_name", { ascending: true })
      : { data: null };

  const animalOptions = (rawAnimalOptions ?? []) as LitterAnimalOption[];
  const motherOptions = filterEligibleLitterParents(
    animalOptions,
    "mother",
    litter?.species ?? "dog",
  );
  const fatherOptions = filterEligibleLitterParents(
    animalOptions,
    "father",
    litter?.species ?? "dog",
  );

  const detailEditErrorMessages: Record<string, string> = {
    name_required: "Le nom de la portée est obligatoire.",
    invalid_species: "L’espèce sélectionnée est invalide.",
    invalid_status: "Le statut sélectionné est invalide.",
    same_parents: "La mère et le père doivent être différents.",
    invalid_mother:
      "La mère sélectionnée est introuvable, inaccessible ou non éligible pour cette portée.",
    invalid_father:
      "Le père sélectionné est introuvable, inaccessible ou non éligible pour cette portée.",
    error: "Impossible de modifier la portée pour le moment.",
  };

  const detailEditError =
    detail_status && detail_status !== "success"
      ? (detailEditErrorMessages[detail_status] ?? detailEditErrorMessages.error)
      : undefined;

  const { data: rawAnimals, error: animalsError } = litter
    ? await supabase
        .from("animals")
        .select(
          "id, display_name, temporary_name, call_name, official_name, species, sex, status, ownership_status, litter_id, is_breeder, is_external, is_retired, birth_date, birth_order, identification_number, color, coat_color, created_at",
        )
        .eq("litter_id", id)
        .is("deleted_at", null)
        .order("birth_order", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true })
    : { data: null, error: null };

  const litterAnimals = rawAnimals as RelatedAnimal[] | null;

  const { data: rawReservations, error: reservationsError } = litter
    ? await supabase
        .from("reservation_overview")
        .select(
          "id, contact_id, contact_display_name, status, price_cents, paid_cents, currency, animal_id, animal_display_name, reserved_sex_preference, created_at",
        )
        .eq("litter_id", id)
        .neq("status", "pre_reservation_requested")
        .order("created_at", { ascending: false })
    : { data: null, error: null };

  const litterReservations = rawReservations as RelatedReservation[] | null;
  const reservationIds = (litterReservations ?? []).flatMap((reservation) =>
    reservation.id ? [reservation.id] : [],
  );

  const { data: rawReservationPayments, error: reservationPaymentsError } =
    reservationIds.length > 0
      ? await supabase
          .from("payments")
          .select("reservation_id, amount_cents, payment_type, status")
          .in("reservation_id", reservationIds)
          .in("payment_type", ["arrhes", "pre_reservation_deposit_refundable"])
          .in("status", ["requested", "pending", "partially_paid", "paid"])
          .is("deleted_at", null)
      : { data: null, error: null };

  const reservationPayments =
    (rawReservationPayments ?? []) as RelatedReservationPayment[];
  const paymentsByReservationId = new Map<string, RelatedReservationPayment[]>();

  for (const payment of reservationPayments) {
    if (!payment.reservation_id) {
      continue;
    }

    const existing = paymentsByReservationId.get(payment.reservation_id) ?? [];
    existing.push(payment);
    paymentsByReservationId.set(payment.reservation_id, existing);
  }

  const { data: rawNotes, error: notesError } = litter
    ? await supabase
        .from("notes")
        .select("id, title, body, note_type, visibility, created_at, created_by, profiles!created_by ( display_name )")
        .eq("litter_id", id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
    : { data: null, error: null };

  const litterNotes = rawNotes as RelatedNote[] | null;

  const { data: rawEvents, error: eventsError } = litter
    ? await supabase
        .from("events")
        .select("id, title, description, event_type, status, priority, planned_at, planned_date, actual_at, created_at")
        .eq("litter_id", id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
    : { data: null, error: null };

  const litterEvents = rawEvents as RelatedEvent[] | null;

  const { data: rawDocuments, error: documentsError } = litter
    ? await supabase
        .from("documents")
        .select(
          "id, title, document_type, status, created_at, updated_at, sent_at, received_at, signed_at, file_name, signature_required",
        )
        .eq("litter_id", id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
    : { data: null, error: null };

  const litterDocuments = rawDocuments as RelatedDocument[] | null;

  const { data: rawCampaignEmailTemplates, error: campaignEmailTemplatesError } =
    litter && litter.organization_id
      ? await supabase
          .from("email_templates")
          .select("id, template_key, title, category, subject, body, is_active")
          .eq("organization_id", litter.organization_id)
          .eq("is_active", true)
          .is("deleted_at", null)
          .order("created_at", { ascending: true })
      : { data: null, error: null };

  const campaignEmailTemplates = getCampaignEmailTemplateOptions(
    (rawCampaignEmailTemplates ?? []).flatMap((template) => {
      if (!isCampaignEmailTemplateCategory(template.category)) {
        return [];
      }

      return [{
        id: template.id,
        templateKey: template.template_key,
        title: template.title,
        category: template.category,
        subject: template.subject,
        body: template.body,
        isActive: template.is_active,
      }];
    }),
  );
  const choiceAppointmentCampaignTemplate =
    campaignEmailTemplates.find(
      (template) =>
        template.templateKey === CHOICE_APPOINTMENT_ADOPTION_BOOKLET_TEMPLATE_KEY,
    ) ?? null;

  const { data: rawChoiceCampaignReservations } =
    litter && litter.organization_id
      ? await supabase
          .from("reservations")
          .select("id, contact_id, status, animal_id, created_at")
          .eq("organization_id", litter.organization_id)
          .eq("litter_id", id)
          .is("deleted_at", null)
          .order("created_at", { ascending: true })
      : { data: null };

  const choiceCampaignReservations =
    (rawChoiceCampaignReservations ?? []) as LitterCampaignReservation[];
  const choiceCampaignReservationIds = choiceCampaignReservations.map(
    (reservation) => reservation.id,
  );
  const choiceCampaignContactIds = Array.from(
    new Set(
      choiceCampaignReservations
        .map((reservation) => reservation.contact_id)
        .filter((contactId): contactId is string => Boolean(contactId)),
    ),
  );
  const choiceCampaignAnimalIds = Array.from(
    new Set(
      choiceCampaignReservations
        .map((reservation) => reservation.animal_id)
        .filter((animalId): animalId is string => Boolean(animalId)),
    ),
  );

  const { data: rawChoiceCampaignDocuments } =
    choiceCampaignReservationIds.length > 0 && litter?.organization_id
      ? await supabase
          .from("documents")
          .select("reservation_id, document_type, status, received_at, signed_at")
          .eq("organization_id", litter.organization_id)
          .in("reservation_id", choiceCampaignReservationIds)
          .in("document_type", ["commitment_certificate", "reservation_contract"])
          .is("deleted_at", null)
      : { data: null };

  const { data: rawChoiceCampaignAppointments } =
    choiceCampaignReservationIds.length > 0 && litter?.organization_id
      ? await supabase
          .from("events")
          .select("reservation_id, event_type, planned_at")
          .eq("organization_id", litter.organization_id)
          .in("reservation_id", choiceCampaignReservationIds)
          .in("event_type", ["puppy_choice", "adoption"])
          .is("deleted_at", null)
      : { data: null };

  const { data: rawChoiceCampaignTraces } =
    choiceCampaignReservationIds.length > 0 && litter?.organization_id
      ? await supabase
          .from("events")
          .select("reservation_id, description")
          .eq("organization_id", litter.organization_id)
          .in("reservation_id", choiceCampaignReservationIds)
          .eq("title", CHOICE_APPOINTMENTS_CAMPAIGN_TRACE_TITLE)
          .eq("status", "done")
          .eq("is_task", false)
          .is("deleted_at", null)
      : { data: null };

  const { data: rawChoiceCampaignContacts } =
    choiceCampaignContactIds.length > 0 && litter?.organization_id
      ? await supabase
          .from("contacts")
          .select("id, first_name, display_name")
          .eq("organization_id", litter.organization_id)
          .in("id", choiceCampaignContactIds)
          .is("deleted_at", null)
      : { data: null };

  const { data: rawChoiceCampaignAnimals } =
    choiceCampaignAnimalIds.length > 0 && litter?.organization_id
      ? await supabase
          .from("animals")
          .select("id, display_name, temporary_name, call_name, official_name")
          .eq("organization_id", litter.organization_id)
          .in("id", choiceCampaignAnimalIds)
          .is("deleted_at", null)
      : { data: null };

  const choiceCampaignPaymentsByReservationId = paymentsByReservationId;
  const choiceCampaignDocuments =
    (rawChoiceCampaignDocuments ?? []) as ChoiceCampaignDocument[];
  const choiceCampaignAppointments =
    (rawChoiceCampaignAppointments ?? []) as ChoiceCampaignAppointment[];
  const choiceCampaignTraceReservationIds = new Set(
    ((rawChoiceCampaignTraces ?? []) as ChoiceCampaignTrace[])
      .map((trace) => trace.reservation_id)
      .filter((reservationId): reservationId is string => Boolean(reservationId)),
  );
  const choiceCampaignTracesByReservationId = new Map(
    ((rawChoiceCampaignTraces ?? []) as ChoiceCampaignTrace[])
      .filter((trace) => trace.reservation_id)
      .map((trace) => [trace.reservation_id as string, trace]),
  );
  const choiceCampaignContactsById = new Map(
    ((rawChoiceCampaignContacts ?? []) as ChoiceCampaignContact[]).map(
      (contact) => [contact.id, contact],
    ),
  );
  const choiceCampaignAnimalsById = new Map(
    ((rawChoiceCampaignAnimals ?? []) as ChoiceCampaignAnimal[]).map(
      (animal) => [animal.id, animal],
    ),
  );
  const choiceAppointmentCampaignReservations: ChoiceAppointmentCampaignReservation[] =
    choiceCampaignReservations.flatMap((reservation) => {
      if (
        !reservation.contact_id ||
        !reservation.status ||
        !CHOICE_APPOINTMENTS_ELIGIBLE_STATUSES.has(reservation.status) ||
        FINAL_RESERVATION_STATUSES.has(reservation.status)
      ) {
        return [];
      }

      const documents = choiceCampaignDocuments.filter(
        (document) => document.reservation_id === reservation.id,
      );
      const commitmentDocument = documents.find(
        (document) => document.document_type === "commitment_certificate",
      );
      const reservationContract = documents.find(
        (document) => document.document_type === "reservation_contract",
      );

      if (
        !commitmentDocument ||
        !reservationContract ||
        !isChoiceCampaignDocumentSigned(commitmentDocument) ||
        !isChoiceCampaignDocumentSigned(reservationContract)
      ) {
        return [];
      }

      const paidDepositCents = (
        choiceCampaignPaymentsByReservationId.get(reservation.id) ?? []
      )
        .filter((payment) => payment.status === "paid")
        .reduce((total, payment) => total + payment.amount_cents, 0);

      if (paidDepositCents < depositSettings.completeDepositCents) {
        return [];
      }

      const choiceAppointment = choiceCampaignAppointments.find(
        (event) =>
          event.reservation_id === reservation.id &&
          event.event_type === "puppy_choice" &&
          event.planned_at,
      );
      const adoptionAppointment = choiceCampaignAppointments.find(
        (event) =>
          event.reservation_id === reservation.id &&
          event.event_type === "adoption" &&
          event.planned_at,
      );

      if (!choiceAppointment?.planned_at || !adoptionAppointment?.planned_at) {
        return [];
      }

      const existingTrace = choiceCampaignTracesByReservationId.get(
        reservation.id,
      );
      const hasCurrentTrace = traceDescriptionMatchesChoiceAppointments({
        description: existingTrace?.description ?? null,
        choiceAppointmentAt: choiceAppointment.planned_at,
        adoptionAppointmentAt: adoptionAppointment.planned_at,
      });

      if (hasCurrentTrace) {
        return [];
      }

      const contact = choiceCampaignContactsById.get(reservation.contact_id);
      const contactName = contact?.display_name ?? "Contact inconnu";
      const contactFirstName =
        contact?.first_name?.trim() || contactName.split(/\s+/)[0] || contactName;

      return [{
        id: reservation.id,
        contactName,
        contactFirstName,
        litterName: getLitterDisplayName(litter?.name ?? null, id),
        choiceAppointmentAt: choiceAppointment.planned_at,
        adoptionAppointmentAt: adoptionAppointment.planned_at,
        hasObsoleteTrace: choiceCampaignTraceReservationIds.has(reservation.id),
        animalName: reservation.animal_id
          ? getChoiceCampaignAnimalName(
              choiceCampaignAnimalsById.get(reservation.animal_id),
            )
          : null,
      }];
    });

  // Candidatures qualifiées liées à cette portée (pour la campagne de pré-réservation)
  const shouldLoadApps = litter && litter.id && litter.organization_id;
  const { data: rawQualifiedApplications, error: qualifiedAppsError } = shouldLoadApps
    ? await supabase
        .from("applications")
        .select(
          "id, contact_id, desired_sex_preference, status, active_rank, initial_rank",
        )
        .eq("organization_id", litter.organization_id)
        .eq("desired_litter_id", id)
        .eq("status", "qualified")
        .is("deleted_at", null)
        .order("active_rank", { ascending: true, nullsFirst: false })
        .order("initial_rank", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true })
    : { data: null, error: null };

  if (qualifiedAppsError) {
    console.error("QUALIFIED_APPS_ERROR_DETAILS:", {
      message: qualifiedAppsError.message,
      details: qualifiedAppsError.details,
      hint: qualifiedAppsError.hint,
      code: qualifiedAppsError.code,
    });
  }

  let qualifiedApplications: QualifiedApplication[] | null = null;
  const applicationIdsWithPreReservationRequest = new Set<string>();

  if (litter && rawQualifiedApplications && rawQualifiedApplications.length > 0) {
    const qualifiedApplicationIds = rawQualifiedApplications.map((app) => app.id);
    const { data: existingPreReservationRequests } = await supabase
      .from("reservations")
      .select("application_id")
      .eq("organization_id", litter.organization_id)
      .eq("status", "pre_reservation_requested")
      .is("deleted_at", null)
      .in("application_id", qualifiedApplicationIds);

    existingPreReservationRequests?.forEach((reservation) => {
      if (reservation.application_id) {
        applicationIdsWithPreReservationRequest.add(reservation.application_id);
      }
    });

    const campaignApplications = rawQualifiedApplications.filter(
      (app) => !applicationIdsWithPreReservationRequest.has(app.id),
    );
    const contactIds = Array.from(
      new Set(
        campaignApplications
          .map((app) => app.contact_id)
          .filter((cid): cid is string => Boolean(cid)),
      ),
    );

    if (contactIds.length > 0 && litter.organization_id) {
      const { data: contactsData, error: contactsError } = await supabase
        .from("contacts")
        .select("id, display_name")
        .eq("organization_id", litter.organization_id)
        .in("id", contactIds);

      if (contactsError) {
        console.error("QUALIFIED_APPS_CONTACTS_ERROR:", contactsError);
        qualifiedApplications = campaignApplications.map((app) => ({
          ...app,
          contacts: { display_name: "Contact non chargé" },
        }));
      } else {
        const contactMap = new Map<string, { display_name: string | null }>();
        contactsData?.forEach((c) => {
          contactMap.set(c.id, { display_name: c.display_name });
        });

        qualifiedApplications = campaignApplications.map((app) => ({
          ...app,
          contacts: app.contact_id ? (contactMap.get(app.contact_id) ?? null) : null,
        }));
      }
    } else {
      qualifiedApplications = campaignApplications.map((app) => ({
        ...app,
        contacts: null,
      }));
    }
  } else if (rawQualifiedApplications) {
    qualifiedApplications = [];
  }

  // Candidats liés à cette portée (tous statuts, lecture seule).
  const { data: rawLinkedApplications, error: linkedAppsError } = shouldLoadApps
    ? await supabase
        .from("applications")
        .select(
          "id, contact_id, species, breed, desired_sex_preference, status, created_at",
        )
        .eq("organization_id", litter.organization_id)
        .eq("desired_litter_id", id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
    : { data: null, error: null };

  let linkedApplications: LinkedApplication[] | null = null;

  if (
    rawLinkedApplications &&
    rawLinkedApplications.length > 0 &&
    litter &&
    litter.organization_id
  ) {
    const linkedContactIds = Array.from(
      new Set(
        rawLinkedApplications
          .map((app) => app.contact_id)
          .filter((cid): cid is string => Boolean(cid)),
      ),
    );

    const contactNameMap = new Map<string, string | null>();

    if (linkedContactIds.length > 0) {
      const { data: linkedContacts } = await supabase
        .from("contacts")
        .select("id, display_name")
        .eq("organization_id", litter.organization_id)
        .in("id", linkedContactIds);

      linkedContacts?.forEach((contact) => {
        contactNameMap.set(contact.id, contact.display_name);
      });
    }

    linkedApplications = rawLinkedApplications.map((app) => ({
      id: app.id,
      contact_id: app.contact_id,
      contact_display_name: app.contact_id
        ? (contactNameMap.get(app.contact_id) ?? null)
        : null,
      species: app.species,
      breed: app.breed,
      desired_sex_preference: app.desired_sex_preference,
      status: app.status,
      created_at: app.created_at,
    }));
  } else if (rawLinkedApplications) {
    linkedApplications = [];
  }

  const offspringBanner =
    offspring_status === "success" ? (
      <p
        role="status"
        className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
      >
        {offspring_count ?? "0"} animal(aux) ont été créés dans cette portée.
        Aucune réservation n’a été modifiée.
      </p>
    ) : offspring_status === "empty" ? (
      <p
        role="alert"
        className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
      >
        Aucun animal à créer : renseignez au moins une ligne.
      </p>
    ) : offspring_status === "duplicate" ? (
      <p
        role="alert"
        className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
      >
        Un ordre de naissance ou un nom principal est déjà utilisé ou présent
        plusieurs fois. Aucune création n’a été appliquée.
      </p>
    ) : offspring_status === "missing_confirmation" ? (
      <p
        role="alert"
        className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
      >
        La création doit être confirmée avant insertion.
      </p>
    ) : offspring_status === "invalid" || offspring_status === "error" ? (
      <p
        role="alert"
        className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
      >
        Impossible de créer les animaux. Aucune réservation n’a été modifiée.
      </p>
    ) : null;

  const animalAvailabilityBanner =
    animal_availability_status === "success" ? (
      <p
        role="status"
        className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
      >
        Le statut de disponibilité de l’animal a été mis à jour.
      </p>
    ) : animal_availability_status ? (
      <p
        role="alert"
        className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
      >
        Impossible de modifier le statut de disponibilité de cet animal.
      </p>
    ) : null;

  const eventBanner =
    event_status === "success" ? (
      <p
        role="status"
        className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
      >
        L’événement a été ajouté à cette portée.
      </p>
    ) : event_status === "title_required" ? (
      <p
        role="alert"
        className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
      >
        Le titre de l’événement est obligatoire.
      </p>
    ) : event_status === "invalid_date" ? (
      <p
        role="alert"
        className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
      >
        La date de l’événement est obligatoire.
      </p>
    ) : event_status === "error" ? (
      <p
        role="alert"
        className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
      >
        Impossible d’ajouter l’événement. Aucune modification n’a été appliquée.
      </p>
    ) : null;

  const balanceCampaignIgnoredSummary = [
    balance_campaign_complete_count &&
    balance_campaign_complete_count !== "0"
      ? `${balance_campaign_complete_count} déjà arrhes complètes`
      : null,
    balance_campaign_active_request_count &&
    balance_campaign_active_request_count !== "0"
      ? `${balance_campaign_active_request_count} demande active déjà existante`
      : null,
    balance_campaign_unpaid_count && balance_campaign_unpaid_count !== "0"
      ? `${balance_campaign_unpaid_count} pré-réservation non réglée`
      : null,
    balance_campaign_ineligible_count &&
    balance_campaign_ineligible_count !== "0"
      ? `${balance_campaign_ineligible_count} dossier non éligible`
      : null,
    balance_campaign_error_count && balance_campaign_error_count !== "0"
      ? `${balance_campaign_error_count} erreur`
      : null,
  ].filter(Boolean);

  const departureBalanceCampaignIgnoredSummary = [
    departure_balance_campaign_no_balance_count &&
    departure_balance_campaign_no_balance_count !== "0"
      ? `${departure_balance_campaign_no_balance_count} aucun solde restant dû`
      : null,
    departure_balance_campaign_active_request_count &&
    departure_balance_campaign_active_request_count !== "0"
      ? `${departure_balance_campaign_active_request_count} demande de solde active déjà existante`
      : null,
    departure_balance_campaign_missing_price_count &&
    departure_balance_campaign_missing_price_count !== "0"
      ? `${departure_balance_campaign_missing_price_count} prix manquant`
      : null,
    departure_balance_campaign_ineligible_count &&
    departure_balance_campaign_ineligible_count !== "0"
      ? `${departure_balance_campaign_ineligible_count} dossier non éligible`
      : null,
    departure_balance_campaign_error_count &&
    departure_balance_campaign_error_count !== "0"
      ? `${departure_balance_campaign_error_count} erreur`
      : null,
  ].filter(Boolean);
  const choiceAppointmentsCampaignIgnoredSummary = [
    choice_appointments_campaign_not_found_count &&
    choice_appointments_campaign_not_found_count !== "0"
      ? `${choice_appointments_campaign_not_found_count} introuvable`
      : null,
    choice_appointments_campaign_not_in_journey_count &&
    choice_appointments_campaign_not_in_journey_count !== "0"
      ? `${choice_appointments_campaign_not_in_journey_count} hors parcours adoptant`
      : null,
    choice_appointments_campaign_final_status_count &&
    choice_appointments_campaign_final_status_count !== "0"
      ? `${choice_appointments_campaign_final_status_count} statut final`
      : null,
    choice_appointments_campaign_missing_documents_count &&
    choice_appointments_campaign_missing_documents_count !== "0"
      ? `${choice_appointments_campaign_missing_documents_count} documents non signés`
      : null,
    choice_appointments_campaign_deposit_incomplete_count &&
    choice_appointments_campaign_deposit_incomplete_count !== "0"
      ? `${choice_appointments_campaign_deposit_incomplete_count} arrhes incomplètes`
      : null,
    choice_appointments_campaign_missing_choice_count &&
    choice_appointments_campaign_missing_choice_count !== "0"
      ? `${choice_appointments_campaign_missing_choice_count} créneau de choix manquant`
      : null,
    choice_appointments_campaign_missing_adoption_count &&
    choice_appointments_campaign_missing_adoption_count !== "0"
      ? `${choice_appointments_campaign_missing_adoption_count} créneau de départ manquant`
      : null,
    choice_appointments_campaign_error_count &&
    choice_appointments_campaign_error_count !== "0"
      ? `${choice_appointments_campaign_error_count} erreur`
      : null,
  ].filter(Boolean);

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-6 py-10 sm:px-10 lg:px-12">
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <Link
          href="/"
          className="text-sm font-medium text-accent hover:underline"
        >
          Tableau de bord
        </Link>
        <span className="text-muted text-sm select-none" aria-hidden="true">|</span>
        <Link
          href="/litters"
          className="text-sm font-medium text-accent hover:underline"
        >
          ← Retour aux portées
        </Link>
      </div>

      <div className="mt-8">
        {readError || summaryError ? (
          <ErrorMessage />
        ) : !litter ? (
          <NotFoundOrUnauthorized />
        ) : (
          <>
            <header className="flex flex-col justify-between gap-5 border-b pb-8 sm:flex-row sm:items-end">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-accent">
                  Portée
                </p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
                  {getLitterDisplayName(litter.name, litter.id)}
                </h1>
                <p className="mt-3 text-sm text-muted">
                  Créée le {formatLitterDate(litter.created_at)}
                </p>
              </div>
            </header>

            {campaign_status === "success" && (
              <div
                role="status"
                className="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-800"
              >
                Campagne confirmée — {campaign_count ?? "0"} dossier(s),{" "}
                {campaign_payment_count ?? "0"} demande(s) de paiement créée(s).
                {Number(campaign_draft_conflict_count ?? "0") > 0
                  ? ` ${campaign_draft_conflict_count} dossier brouillon à vérifier.`
                  : " "}
                Aucun e-mail réel n’a été envoyé par l’application.
              </div>
            )}
            {campaign_status === "no_selection" && (
              <div
                role="alert"
                className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800"
              >
                Aucune candidature sélectionnée. Cochez au moins une case avant de lancer la campagne.
              </div>
            )}
            {campaign_status === "no_eligible" && (
              <div
                role="alert"
                className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800"
              >
                Aucune candidature validée trouvée pour cette portée parmi les sélections.
              </div>
            )}
            {campaign_status === "error" && (
              <div
                role="alert"
                className="rounded-xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-800"
              >
                Une erreur est survenue lors du lancement de la campagne. Aucune modification n&apos;a été appliquée pour les candidatures en erreur.
              </div>
            )}
            {balance_campaign_status === "success" && (
              <div
                role="status"
                className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-800"
              >
                Campagne confirmée — {balance_campaign_count ?? "0"} dossier(s),{" "}
                {balance_campaign_payment_count ?? "0"} demande(s) de complément
                créée(s). Aucun e-mail réel n’a été envoyé par l’application.
                {balanceCampaignIgnoredSummary.length > 0 ? (
                  <span className="mt-2 block text-emerald-900">
                    Ignorés : {balanceCampaignIgnoredSummary.join(" · ")}.
                  </span>
                ) : null}
              </div>
            )}
            {balance_campaign_status === "no_eligible" && (
              <div
                role="alert"
                className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800"
              >
                Aucun dossier adoptant lié à cette portée.
              </div>
            )}
            {balance_campaign_status === "error" && (
              <div
                role="alert"
                className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-800"
              >
                Une erreur est survenue lors de la confirmation de campagne.
                Aucune donnée n’a été modifiée pour les dossiers en erreur.
              </div>
            )}
            {departure_balance_campaign_status === "success" && (
              <div
                role="status"
                className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-800"
              >
                Campagne confirmée — {departure_balance_campaign_count ?? "0"} dossier(s),{" "}
                {departure_balance_campaign_payment_count ?? "0"} demande(s) de solde
                créée(s).
                {departureBalanceCampaignIgnoredSummary.length > 0 ? (
                  <span className="mt-2 block text-emerald-900">
                    Ignorés : {departureBalanceCampaignIgnoredSummary.join(" · ")}.
                  </span>
                ) : null}
              </div>
            )}
            {departure_balance_campaign_status === "no_eligible" && (
              <div
                role="alert"
                className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800"
              >
                Aucun dossier adoptant lié à cette portée.
              </div>
            )}
            {departure_balance_campaign_status === "error" && (
              <div
                role="alert"
                className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-800"
              >
                Une erreur est survenue lors de la confirmation de campagne
                solde. Aucune donnée n’a été modifiée pour les dossiers en erreur.
              </div>
            )}
            {choice_appointments_campaign_status === "success" && (
              <div
                role="status"
                className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-800"
              >
                Campagne confirmée — {choice_appointments_campaign_confirmed_count ?? "0"} envoi(s)
                confirmé(s), {choice_appointments_campaign_already_count ?? "0"} déjà
                confirmé(s), {choice_appointments_campaign_selected_count ?? "0"} dossier(s)
                sélectionné(s). Aucun e-mail réel n’a été envoyé par l’application.
                {choiceAppointmentsCampaignIgnoredSummary.length > 0 ? (
                  <span className="mt-2 block text-emerald-900">
                    Ignorés : {choiceAppointmentsCampaignIgnoredSummary.join(" · ")}.
                  </span>
                ) : null}
              </div>
            )}
            {choice_appointments_campaign_status === "no_selection" && (
              <div
                role="alert"
                className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800"
              >
                Aucun dossier sélectionné pour la campagne créneaux + livret.
              </div>
            )}
            {choice_appointments_campaign_status === "error" && (
              <div
                role="alert"
                className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-800"
              >
                Une erreur est survenue lors de la confirmation des créneaux
                proposés. Aucun e-mail réel n’a été envoyé.
              </div>
            )}

            <div className="space-y-6 py-8">
              <LitterTopSummary
                litter={litter}
                summary={summary}
                animals={litterAnimals}
                linkedApplications={linkedApplications}
              />

              <section className="rounded-2xl border bg-surface p-6 sm:p-8">
                <h2 className="text-xl font-semibold">
                  Reproduction et gestation
                </h2>
                <dl className="mt-4 divide-y divide-border">
                  <CompactDetailItem
                    label="Saillies"
                    value={formatKnownParts([
                      formatDatePart("principale", litter.mating_date),
                      formatDatePart("2e", litter.mating_date_2),
                    ])}
                  />
                  <CompactDetailItem
                    label="Cycle"
                    value={formatKnownParts([
                      formatDatePart(
                        "ovulation estimée",
                        litter.estimated_ovulation_date,
                      ),
                    ])}
                  />
                  <CompactDetailItem
                    label="Gestation"
                    value={formatKnownParts([
                      formatDatePart(
                        "confirmée",
                        litter.pregnancy_confirmed_at,
                      ),
                      litter.pregnancy_confirmation_method
                        ? `méthode ${litter.pregnancy_confirmation_method}`
                        : null,
                    ])}
                  />
                  <CompactDetailItem
                    label="Naissance"
                    value={formatKnownParts([
                      formatDatePart("prévue", litter.expected_birth_date),
                      formatDatePart("réelle", litter.actual_birth_date),
                    ])}
                  />
                  <CompactDetailItem
                    label="Estimation"
                    value={formatKnownParts([
                      formatCountPart("attendus", litter.expected_puppy_count),
                    ])}
                  />
                </dl>
              </section>

              <RelatedAnimalsSection
                animals={litterAnimals}
                hasError={Boolean(animalsError)}
                banner={
                  <>
                    {offspringBanner}
                    {animalAvailabilityBanner}
                  </>
                }
                footer={
                  <OffspringCreationForm
                    litterId={litter.id}
                    species={litter.species}
                    birthDate={formatLitterDate(
                      litter.actual_birth_date ?? litter.expected_birth_date,
                    )}
                  />
                }
              />

              <LinkedApplicationsSection
                title="Candidats liés à cette portée"
                description="Vue de suivi : candidats actuellement liés à cette portée, quel que soit le statut de leur dossier."
                emptyLabel="Aucun candidat ne souhaite cette portée."
                applications={linkedApplications}
                hasError={Boolean(linkedAppsError)}
                sectionId="candidatures-liees"
              />

              <RelatedReservationsSection
                reservations={litterReservations}
                paymentsByReservationId={paymentsByReservationId}
                depositSettings={depositSettings}
                hasError={Boolean(reservationsError || reservationPaymentsError)}
                sectionId="reservations-liees"
              />

              <CollapsibleSection title="Campagnes d’e-mails">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Pré-réservation
                  </p>
                  <p className="mt-2 text-sm text-muted">
                    Copiez le modèle d’e-mail, envoyez-le manuellement, puis
                    confirmez l’envoi dans le SaaS.
                  </p>
                  <p className="mt-2 text-sm text-muted">
                    Aucun e-mail réel n’est envoyé par l’application.
                  </p>
                </div>
                {campaignEmailTemplatesError ? (
                  <p role="alert" className="mt-5 text-sm text-amber-800">
                    Impossible de charger les modèles d’e-mails pour cette
                    campagne.
                  </p>
                ) : (
                  <CampaignEmailTemplatePicker
                    templates={campaignEmailTemplates}
                    preferredTemplateKey="pre_reservation"
                    exactTemplateKey="pre_reservation"
                    instanceId="litter-pre-reservation-template"
                  />
                )}

                <form action={launchPreReservationCampaign} className="mt-6">
                  <input type="hidden" name="litter_id" value={id} />

                  {qualifiedAppsError ? (
                    <p role="alert" className="text-sm text-amber-800">
                      Impossible de charger les candidatures validées.
                    </p>
                  ) : !qualifiedApplications || qualifiedApplications.length === 0 ? (
                    <p className="text-sm text-muted">
                      Aucune candidature validée liée à cette portée.
                    </p>
                  ) : (
                    <fieldset>
                      <legend className="sr-only">
                        Candidatures validées
                      </legend>
                      <div className="divide-y divide-border rounded-xl border bg-background">
                        {qualifiedApplications.map((app) => {
                          const contactName =
                            app.contacts?.display_name ?? "Contact inconnu";
                          const sexPref = getSexPreferenceLabel(
                            app.desired_sex_preference,
                          );
                          const rank = app.active_rank ?? app.initial_rank;

                          return (
                            <label
                              key={app.id}
                              htmlFor={`app-${app.id}`}
                              className="flex cursor-pointer items-start gap-4 px-4 py-4 hover:bg-muted-soft"
                            >
                              <input
                                type="checkbox"
                                id={`app-${app.id}`}
                                name="application_ids[]"
                                value={app.id}
                                defaultChecked
                                className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-accent"
                              />
                              <div className="min-w-0 flex-1 space-y-0.5">
                                <p className="text-sm font-semibold text-foreground">
                                  {contactName}
                                </p>
                                <p className="text-xs text-muted">
                                  Préférence : {sexPref}
                                  {rank ? ` · Rang : ${rank}` : ""}
                                </p>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </fieldset>
                  )}

                  <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
                    <button
                      type="submit"
                      disabled={
                        Boolean(qualifiedAppsError) ||
                        !qualifiedApplications ||
                        qualifiedApplications.length === 0
                      }
                      className="inline-flex rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-accent/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
                    >
                      Campagne de pré-réservation envoyée
                    </button>
                    <p className="text-xs text-muted">
                      À utiliser après l’envoi manuel du message. Cette action
                      crée les demandes de paiement de pré-réservation pour les
                      candidats concernés. Aucun e-mail réel n’est envoyé.
                    </p>
                  </div>
                </form>

                <div className="mt-8 border-t pt-8">
                  <p className="text-sm font-medium text-foreground">
                    Contrat + certificat
                  </p>
                  <p className="mt-2 text-sm text-muted">
                    À utiliser après l’envoi manuel du message. Cette action
                    crée les demandes de complément d’arrhes pour les dossiers
                    éligibles. Aucun e-mail réel n’est envoyé.
                  </p>
                  {campaignEmailTemplatesError ? (
                    <p role="alert" className="mt-5 text-sm text-amber-800">
                      Impossible de charger les modèles d’e-mails pour cette
                      campagne.
                    </p>
                  ) : (
                    <CampaignEmailTemplatePicker
                      templates={campaignEmailTemplates}
                      preferredTemplateKey="birth_documents_deposit"
                      exactTemplateKey="birth_documents_deposit"
                      instanceId="litter-birth-documents-deposit-template"
                    />
                  )}

                  <form
                    action={launchLitterPreReservationBalanceCampaign}
                    className="mt-6"
                  >
                    <input type="hidden" name="litter_id" value={id} />
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                      <button
                        type="submit"
                        className="inline-flex rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-accent/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                      >
                        Campagne contrat + certificat envoyée
                      </button>
                      <p className="text-xs text-muted">
                        Crée uniquement les demandes de complément d’arrhes
                        manquantes. Aucun document, animal ou statut de dossier
                        n’est modifié automatiquement.
                      </p>
                    </div>
                  </form>
                </div>

                <div className="mt-8 border-t pt-8">
                  <p className="text-sm font-medium text-foreground">
                    Créneaux de choix + livret d’adoption
                  </p>
                  <p className="mt-2 text-sm text-muted">
                    Prévisualisez chaque e-mail personnalisé, envoyez-le
                    manuellement avec le livret, puis confirmez la trace
                    d’envoi des créneaux proposés.
                  </p>
                  {campaignEmailTemplatesError ? (
                    <p role="alert" className="mt-5 text-sm text-amber-800">
                      Impossible de charger les modèles d’e-mails pour cette
                      campagne.
                    </p>
                  ) : choiceAppointmentCampaignTemplate ? (
                    <div
                      data-testid="choice-appointments-template-summary"
                      className="mt-5 rounded-xl border bg-background p-4"
                    >
                      <p className="text-sm font-semibold text-foreground">
                        Modèle d’e-mail
                      </p>
                      <p className="mt-2 rounded-md border bg-surface px-3 py-2 text-sm text-foreground">
                        {choiceAppointmentCampaignTemplate.title} - Parcours adoptant
                      </p>
                      <p className="mt-3 text-xs text-muted">
                        Le sujet et le corps sont rendus séparément pour chaque
                        destinataire ci-dessous avant copie.
                      </p>
                    </div>
                  ) : (
                    <p role="alert" className="mt-5 text-sm text-amber-800">
                      Le modèle choice_appointment_adoption_booklet est
                      introuvable ou inactif.
                    </p>
                  )}

                  <form
                    action={confirmChoiceAppointmentsAdoptionBookletCampaign}
                    className="mt-6"
                  >
                    <input type="hidden" name="litter_id" value={id} />
                    <ChoiceAppointmentCampaignList
                      reservations={choiceAppointmentCampaignReservations}
                      template={choiceAppointmentCampaignTemplate}
                    />
                    <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
                      <button
                        type="submit"
                        disabled={
                          campaignEmailTemplatesError !== null ||
                          choiceAppointmentCampaignReservations.length === 0 ||
                          !choiceAppointmentCampaignTemplate
                        }
                        className="inline-flex rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-accent/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
                      >
                        Confirmer l’envoi des créneaux proposés et du livret
                      </button>
                      <p className="text-xs text-muted">
                        Crée uniquement une trace d’événement par réservation
                        toujours éligible. Aucun paiement, statut de réservation
                        ou rendez-vous n’est modifié. Aucun e-mail réel n’est
                        envoyé.
                      </p>
                    </div>
                  </form>
                </div>

                <div className="mt-8 border-t pt-8">
                  <p className="text-sm font-medium text-foreground">
                    Solde avant départ
                  </p>
                  <p className="mt-2 text-sm text-muted">
                    À utiliser après l’envoi manuel du message. Cette action
                    crée les demandes de paiement du solde restant pour les
                    dossiers éligibles. Aucun e-mail réel n’est envoyé.
                  </p>
                  {campaignEmailTemplatesError ? (
                    <p role="alert" className="mt-5 text-sm text-amber-800">
                      Impossible de charger les modèles d’e-mails pour cette
                      campagne.
                    </p>
                  ) : (
                    <CampaignEmailTemplatePicker
                      templates={campaignEmailTemplates}
                      preferredTemplateKey="departure_preparation"
                      exactTemplateKey="departure_preparation"
                      instanceId="litter-departure-preparation-template"
                    />
                  )}

                  <form
                    action={launchLitterDepartureBalanceCampaign}
                    className="mt-6"
                  >
                    <input type="hidden" name="litter_id" value={id} />
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                      <button
                        type="submit"
                        className="inline-flex rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-accent/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                      >
                        Campagne solde envoyée
                      </button>
                      <p className="text-xs text-muted">
                        Crée uniquement les demandes de solde restant. Aucun
                        statut, animal, document ou adoption n’est modifié
                        automatiquement.
                      </p>
                    </div>
                  </form>
                </div>
              </CollapsibleSection>

              <CollapsibleSection id="modifier-portee" title="Modifier la portée">
                <p className="text-sm text-muted">
                  Mettez à jour les informations principales de la portée. Le
                  rattachement à un groupe se gère dans la section dédiée
                  ci-dessous. Aucun animal, réservation ou document n’est créé ou
                  modifié par cette action.
                </p>

                {detail_status === "success" ? (
                  <p
                    role="status"
                    className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
                  >
                    Les informations de la portée ont été mises à jour.
                  </p>
                ) : null}

                {detailEditError ? (
                  <p
                    role="alert"
                    className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
                  >
                    {detailEditError}
                  </p>
                ) : null}

                <form action={updateLitterDetails} className="mt-6">
                  <input type="hidden" name="litter_id" value={litter.id} />
                  <LitterFields
                    idPrefix="litter-edit"
                    defaults={{
                      name: litter.name,
                      species: litter.species,
                      breed: litter.breed,
                      status: litter.status,
                      motherId: litter.mother_id,
                      fatherId: litter.father_id,
                      matingDate: litter.mating_date,
                      matingDate2: litter.mating_date_2,
                      estimatedOvulationDate: litter.estimated_ovulation_date,
                      expectedBirthDate: litter.expected_birth_date,
                      actualBirthDate: litter.actual_birth_date,
                      notes: litter.notes,
                    }}
                    motherOptions={motherOptions}
                    fatherOptions={fatherOptions}
                  />

                  <div className="mt-8 flex flex-wrap items-center justify-end gap-4 border-t pt-6">
                    <button
                      type="submit"
                      className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
                    >
                      Enregistrer la portée
                    </button>
                  </div>
                </form>
              </CollapsibleSection>

              <CollapsibleSection id="groupe-portees" title="Groupe de portées">
                <p className="text-sm text-muted">
                  Rattachez cette portée à un groupe de portées (période),
                  changez de groupe, ou détachez-la. Le statut de la portée
                  n’est pas modifié et les réservations liées ne sont pas
                  déplacées automatiquement.
                </p>

                {group_assignment_status === "success" ? (
                  <p
                    role="status"
                    className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
                  >
                    Le groupe de portées a été mis à jour.
                  </p>
                ) : null}

                {group_assignment_status === "invalid_group" ? (
                  <p
                    role="alert"
                    className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
                  >
                    Le groupe de portées sélectionné est invalide. Aucune
                    modification n’a été appliquée.
                  </p>
                ) : null}

                {group_assignment_status === "error" ? (
                  <p
                    role="alert"
                    className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
                  >
                    Impossible de mettre à jour le groupe pour le moment.
                  </p>
                ) : null}

                <p className="mt-4 rounded-xl border bg-background px-4 py-3 text-sm text-muted">
                  Groupe actuel :{" "}
                  {litter.litter_group_id ? (
                    <Link
                      href={`/litter-groups/${litter.litter_group_id}`}
                      className="font-medium text-accent hover:underline"
                    >
                      {summary?.litter_group_name ?? "Groupe de portées"}
                    </Link>
                  ) : (
                    "Aucun groupe"
                  )}
                </p>

                <form
                  action={updateLitterGroupAssignment}
                  className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end"
                >
                  <input type="hidden" name="litter_id" value={litter.id} />
                  <div className="flex-1">
                    <label
                      htmlFor="litter-group-assignment"
                      className="text-xs font-semibold uppercase tracking-wide text-muted"
                    >
                      Groupe de portées
                    </label>
                    <select
                      id="litter-group-assignment"
                      name="litter_group_id"
                      defaultValue={litter.litter_group_id ?? ""}
                      className="mt-2 w-full rounded-xl border bg-background px-4 py-3 text-sm focus:border-accent focus:outline-none"
                    >
                      <option value="">Aucun groupe</option>
                      {groupOptions.map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.name ?? `Groupe ${group.id.slice(0, 8)}`}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="submit"
                    className="inline-flex shrink-0 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
                  >
                    Enregistrer le groupe
                  </button>
                </form>
              </CollapsibleSection>

              <RelatedDocumentsSection
                documents={litterDocuments}
                hasError={Boolean(documentsError)}
              />

              <RelatedEventsSection
                events={litterEvents}
                hasError={Boolean(eventsError)}
                banner={eventBanner}
                footer={<LitterEventCreationForm litterId={litter.id} />}
              />

              <RelatedNotesSection
                notes={litterNotes}
                hasError={Boolean(notesError)}
              />

              <CollapsibleSection title="Notes de la portée">
                <p className="whitespace-pre-wrap leading-7 text-muted">
                  {litter.notes || "Aucune note renseignée."}
                </p>
              </CollapsibleSection>

              <CollapsibleSection title="Dates techniques">
                <dl className="grid gap-6 sm:grid-cols-2">
                  <DetailItem
                    label="Création"
                    value={formatLitterDate(litter.created_at)}
                  />
                  <DetailItem
                    label="Mise à jour"
                    value={formatLitterDate(litter.updated_at)}
                  />
                </dl>
              </CollapsibleSection>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
