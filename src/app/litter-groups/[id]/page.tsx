import Link from "next/link";
import { redirect } from "next/navigation";

import {
  CampaignEmailTemplatePicker,
} from "@/features/documents/campaign-email-template-picker";
import {
  formatPreReservationContactFullName,
  formatPreReservationEuros,
  formatPreReservationParisDate,
} from "@/features/communications/pre-reservation-email-core";
import {
  getCampaignEmailTemplateOptions,
  isCampaignEmailTemplateCategory,
} from "@/features/documents/campaign-email-template-options";
import {
  AttachApplicationForm,
  AttachReservationForm,
  LinkedApplicationsSection,
  type AttachableApplication,
  type AttachableReservation,
  type LinkedApplication,
} from "@/features/litters/linked-records";
import {
  formatLitterDate,
  getLitterDisplayName,
  getLitterGroupStatusLabel,
  getLitterStatusLabel,
  getSpeciesLabel,
} from "@/features/litters/formatters";
import {
  addDaysAsIsoDate,
  readDepositSettingsForOrganization,
  resolveDepositSettings,
} from "@/features/payments/deposit-thresholds";
import {
  getPreReservationDepositBadgeClassName,
  getPreReservationDepositLabel,
  getPreReservationDepositStateFromStatus,
  getReservationStatusLabel,
} from "@/features/reservations/formatters";
import {
  PreReservationCampaignConfirmDialog,
} from "@/features/reservations/pre-reservation-campaign-confirm-dialog";
import { updateLitterGroupDetails } from "@/features/litters/actions";
import {
  launchGroupDepartureBalanceCampaign,
  launchGroupPreReservationBalanceCampaign,
  launchGroupPreReservationCampaign,
} from "@/features/reservations/actions";
import { getBrevoConfigurationStatus } from "@/lib/brevo/server";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

export const dynamic = "force-dynamic";

type DBLitterGroup = Pick<
  Database["public"]["Tables"]["litter_groups"]["Row"],
  | "id"
  | "organization_id"
  | "name"
  | "description"
  | "species"
  | "status"
  | "expected_period_start"
  | "expected_period_end"
  | "created_at"
  | "updated_at"
>;
type GroupLitter = Pick<
  Database["public"]["Views"]["litter_overview"]["Row"],
  | "id"
  | "name"
  | "status"
  | "mother_display_name"
  | "father_display_name"
  | "expected_birth_date"
  | "actual_birth_date"
>;
type GroupReservation = Pick<
  Database["public"]["Views"]["reservation_overview"]["Row"],
  | "id"
  | "contact_id"
  | "contact_display_name"
  | "status"
  | "litter_id"
  | "litter_name"
  | "animal_id"
  | "animal_display_name"
>;
type GroupQualifiedApplication = Pick<
  Database["public"]["Tables"]["applications"]["Row"],
  | "id"
  | "contact_id"
  | "desired_sex_preference"
  | "desired_litter_id"
  | "desired_litter_group_id"
  | "status"
  | "active_rank"
  | "initial_rank"
> & {
  contacts: {
    display_name: string | null;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  } | null;
};

function NotFoundOrUnauthorized() {
  return (
    <section className="rounded-2xl border border-dashed bg-surface px-6 py-16 text-center">
      <h1 className="text-2xl font-semibold">
        Groupe de portées introuvable ou inaccessible.
      </h1>
      <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-muted">
        Ce groupe n’existe pas ou vous n’êtes pas autorisé à le consulter.
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
        Impossible de charger le groupe de portées
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
      <dd className="mt-1.5 text-sm leading-6">{value || "Non renseigné"}</dd>
    </div>
  );
}

function formatPeriod(start: string | null, end: string | null) {
  if (start && end) {
    return `Du ${formatLitterDate(start)} au ${formatLitterDate(end)}`;
  }

  if (start) {
    return `À partir du ${formatLitterDate(start)}`;
  }

  if (end) {
    return `Jusqu’au ${formatLitterDate(end)}`;
  }

  return "Non renseignée";
}

const groupStatusEditValues = [
  "planned",
  "open_for_applications",
  "pregnancy_pending",
  "births_in_progress",
  "born",
  "closed",
  "cancelled",
  "archived",
] as const;

const groupSpeciesEditOptions = [
  ["dog", "Chien"],
  ["cat", "Chat"],
] as const;

const groupDetailEditErrors: Record<string, string> = {
  name_required: "Le nom du groupe est obligatoire.",
  invalid_species: "L’espèce sélectionnée est invalide.",
  invalid_status: "Le statut sélectionné est invalide.",
  invalid_dates:
    "La date de fin ne peut pas être antérieure à la date de début.",
  error: "Impossible de modifier le groupe pour le moment.",
};

export default async function LitterGroupDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    attach_status?: string;
    reservation_attach_status?: string;
    group_detail_status?: string;
    group_campaign_status?: string;
    group_campaign_count?: string;
    group_campaign_payment_count?: string;
    group_campaign_draft_conflict_count?: string;
    pre_reservation_email_sent_count?: string;
    pre_reservation_email_already_sent_count?: string;
    pre_reservation_email_failed_count?: string;
    pre_reservation_email_missing_count?: string;
    pre_reservation_email_in_progress_count?: string;
    pre_reservation_missing_template_count?: string;
    pre_reservation_brevo_not_configured_count?: string;
    pre_reservation_conflict_count?: string;
    pre_reservation_error_count?: string;
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
  }>;
}) {
  const { id } = await params;
  const {
    attach_status,
    reservation_attach_status,
    group_detail_status,
    group_campaign_status,
    group_campaign_count,
    group_campaign_payment_count,
    group_campaign_draft_conflict_count,
    pre_reservation_email_sent_count,
    pre_reservation_email_already_sent_count,
    pre_reservation_email_failed_count,
    pre_reservation_email_missing_count,
    pre_reservation_email_in_progress_count,
    pre_reservation_missing_template_count,
    pre_reservation_brevo_not_configured_count,
    pre_reservation_conflict_count,
    pre_reservation_error_count,
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
  } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: rawGroup, error: readError } = await supabase
    .from("litter_groups")
    .select(
      "id, organization_id, name, description, species, status, expected_period_start, expected_period_end, created_at, updated_at",
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  const group = rawGroup as DBLitterGroup | null;
  const depositSettings =
    group?.organization_id
      ? await readDepositSettingsForOrganization({
          supabase,
          organizationId: group.organization_id,
        })
      : resolveDepositSettings(null);

  const { data: organizationForCampaign } = group?.organization_id
    ? await supabase
        .from("organizations")
        .select("name, affix_name, dog_affix_name")
        .eq("id", group.organization_id)
        .is("deleted_at", null)
        .maybeSingle()
    : { data: null };

  // Portées du groupe.
  const { data: rawGroupLitters, error: littersError } = group
    ? await supabase
        .from("litter_overview")
        .select(
          "id, name, status, mother_display_name, father_display_name, expected_birth_date, actual_birth_date",
        )
        .eq("litter_group_id", id)
        .order("expected_birth_date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
    : { data: null, error: null };

  const groupLitters = rawGroupLitters as GroupLitter[] | null;
  const groupLitterIds = (groupLitters ?? [])
    .map((litter) => litter.id)
    .filter((litterId): litterId is string => Boolean(litterId));

  // Réservations rattachées au groupe.
  const { data: rawGroupReservations, error: reservationsError } = group
    ? await supabase
        .from("reservation_overview")
        .select(
          "id, contact_id, contact_display_name, status, litter_id, litter_name, animal_id, animal_display_name",
        )
        .eq("litter_group_id", id)
        .neq("status", "pre_reservation_requested")
        .order("created_at", { ascending: false })
    : { data: null, error: null };

  const groupReservations = rawGroupReservations as GroupReservation[] | null;

  const { data: rawCampaignEmailTemplates, error: campaignEmailTemplatesError } =
    group && group.organization_id
      ? await supabase
          .from("email_templates")
          .select(
            "id, template_key, title, category, subject, body, brevo_template_id, is_active",
          )
          .eq("organization_id", group.organization_id)
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
        brevoTemplateId: template.brevo_template_id,
        isActive: template.is_active,
      }];
    }),
  );
  const preReservationCampaignTemplate =
    campaignEmailTemplates.find(
      (template) => template.templateKey === "pre_reservation",
    ) ?? null;
  const brevoConfiguration = getBrevoConfigurationStatus();
  const preReservationDeadlineLabel = formatPreReservationParisDate(
    addDaysAsIsoDate(depositSettings.preReservationResponseDelayDays),
  );
  const preReservationAmountLabel = formatPreReservationEuros(
    depositSettings.preReservationDepositCents,
  );
  const organizationCampaignName =
    organizationForCampaign?.dog_affix_name ??
    organizationForCampaign?.affix_name ??
    organizationForCampaign?.name ??
    "";
  const preReservationLitterNameById = new Map(
    (groupLitters ?? []).map((litter) => [litter.id, litter.name ?? ""]),
  );
  const preReservationGroupName = group?.name ?? "";

  // Candidatures souhaitant ce groupe (lecture seule).
  const { data: rawLinkedApplications, error: linkedAppsError } =
    group && group.organization_id
      ? await supabase
          .from("applications")
          .select(
            "id, contact_id, species, breed, desired_sex_preference, status, created_at",
          )
          .eq("organization_id", group.organization_id)
          .eq("desired_litter_group_id", id)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
      : { data: null, error: null };

  let linkedApplications: LinkedApplication[] | null = null;

  if (
    rawLinkedApplications &&
    rawLinkedApplications.length > 0 &&
    group &&
    group.organization_id
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
        .eq("organization_id", group.organization_id)
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

  // Candidatures qualifiées éligibles à la campagne du groupe :
  // souhait groupe direct OU portée souhaitée appartenant au groupe.
  const groupCampaignApplicationsQuery =
    group && group.organization_id
      ? supabase
          .from("applications")
          .select(
            "id, contact_id, desired_sex_preference, desired_litter_id, desired_litter_group_id, status, active_rank, initial_rank, created_at",
          )
          .eq("organization_id", group.organization_id)
          .eq("status", "qualified")
          .is("deleted_at", null)
          .order("active_rank", { ascending: true, nullsFirst: false })
          .order("initial_rank", { ascending: true, nullsFirst: false })
          .order("created_at", { ascending: true })
      : null;

  const { data: rawQualifiedApplications, error: qualifiedAppsError } =
    groupCampaignApplicationsQuery
      ? groupLitterIds.length > 0
        ? await groupCampaignApplicationsQuery.or(
            `desired_litter_group_id.eq.${id},desired_litter_id.in.(${groupLitterIds.join(",")})`,
          )
        : await groupCampaignApplicationsQuery.eq("desired_litter_group_id", id)
      : { data: null, error: null };

  let qualifiedApplications: GroupQualifiedApplication[] | null = null;

  if (
    rawQualifiedApplications &&
    rawQualifiedApplications.length > 0 &&
    group &&
    group.organization_id
  ) {
    const qualifiedApplicationIds = rawQualifiedApplications.map((app) => app.id);
    const applicationIdsWithPreReservationRequest = new Set<string>();
    const { data: existingPreReservationRequests } = await supabase
      .from("reservations")
      .select("application_id")
      .eq("organization_id", group.organization_id)
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

    const qualifiedContactIds = Array.from(
      new Set(
        campaignApplications
          .map((app) => app.contact_id)
          .filter((cid): cid is string => Boolean(cid)),
      ),
    );

    const contactMap = new Map<
      string,
      {
        display_name: string | null;
        first_name: string | null;
        last_name: string | null;
        email: string | null;
      }
    >();

    if (qualifiedContactIds.length > 0) {
      const { data: qualifiedContacts } = await supabase
        .from("contacts")
        .select("id, display_name, first_name, last_name, email")
        .eq("organization_id", group.organization_id)
        .in("id", qualifiedContactIds);

      qualifiedContacts?.forEach((contact) => {
        contactMap.set(contact.id, {
          display_name: contact.display_name,
          first_name: contact.first_name,
          last_name: contact.last_name,
          email: contact.email,
        });
      });
    }

    qualifiedApplications = campaignApplications.map((app) => ({
      id: app.id,
      contact_id: app.contact_id,
      desired_sex_preference: app.desired_sex_preference,
      desired_litter_id: app.desired_litter_id,
      desired_litter_group_id: app.desired_litter_group_id,
      status: app.status,
      active_rank: app.active_rank,
      initial_rank: app.initial_rank,
      contacts: app.contact_id ? (contactMap.get(app.contact_id) ?? null) : null,
    }));
  } else if (rawQualifiedApplications) {
    qualifiedApplications = [];
  }

  // Candidatures rattachables à ce groupe (hors archivées, hors déjà liées
  // à ce groupe), pour l'action manuelle de rattachement.
  const { data: rawAttachableApplications } =
    group && group.organization_id
      ? await supabase
          .from("applications")
          .select(
            "id, contact_id, status, created_at, desired_litter_id, desired_litter_group_id",
          )
          .eq("organization_id", group.organization_id)
          .neq("status", "archived")
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(50)
      : { data: null };

  let attachableApplications: AttachableApplication[] = [];

  if (
    rawAttachableApplications &&
    rawAttachableApplications.length > 0 &&
    group &&
    group.organization_id
  ) {
    const candidates = rawAttachableApplications.filter(
      (app) => app.desired_litter_group_id !== id,
    );

    const attachableContactIds = Array.from(
      new Set(
        candidates
          .map((app) => app.contact_id)
          .filter((cid): cid is string => Boolean(cid)),
      ),
    );

    const attachableContactMap = new Map<string, string | null>();

    if (attachableContactIds.length > 0) {
      const { data: attachableContacts } = await supabase
        .from("contacts")
        .select("id, display_name")
        .eq("organization_id", group.organization_id)
        .in("id", attachableContactIds);

      attachableContacts?.forEach((contact) => {
        attachableContactMap.set(contact.id, contact.display_name);
      });
    }

    attachableApplications = candidates.map((app) => ({
      id: app.id,
      contact_display_name: app.contact_id
        ? (attachableContactMap.get(app.contact_id) ?? null)
        : null,
      status: app.status,
      created_at: app.created_at,
      already_attached_elsewhere: Boolean(
        app.desired_litter_id || app.desired_litter_group_id,
      ),
    }));
  }

  const attachBanner =
    attach_status === "success" ? (
      <p
        role="status"
        className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
      >
        La candidature a été rattachée à ce groupe. Son statut n’a pas été
        modifié et aucune réservation n’a été créée.
      </p>
    ) : attach_status === "error" ? (
      <p
        role="alert"
        className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
      >
        Impossible de rattacher la candidature. Aucune modification n’a été
        appliquée.
      </p>
    ) : null;

  // Réservations rattachables à ce groupe (même organisation, hors déjà liées
  // à ce groupe). Celles avec animal attribué restent visibles mais désactivées.
  const { data: rawAttachableReservations } =
    group && group.organization_id
      ? await supabase
          .from("reservation_overview")
          .select(
            "id, contact_display_name, status, litter_id, litter_name, litter_group_id, litter_group_name, animal_id",
          )
          .eq("organization_id", group.organization_id)
          .order("created_at", { ascending: false })
          .limit(50)
      : { data: null };

  const attachableReservations: AttachableReservation[] = (
    rawAttachableReservations ?? []
  )
    .filter((reservation) => reservation.litter_group_id !== id)
    .map((reservation) => ({
      id: reservation.id as string,
      contact_display_name: reservation.contact_display_name,
      status: reservation.status,
      litter_name: reservation.litter_name,
      litter_group_name: reservation.litter_group_name,
      has_animal: Boolean(reservation.animal_id),
    }));

  const reservationAttachBanner =
    reservation_attach_status === "success" ? (
      <p
        role="status"
        className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
      >
        La réservation a été rattachée à ce groupe. Son statut, ses paiements,
        documents et son animal éventuel n’ont pas été modifiés.
      </p>
    ) : reservation_attach_status === "animal_attributed" ? (
      <p
        role="alert"
        className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
      >
        Cette réservation a déjà un animal attribué. Retirez ou traitez d’abord
        cette attribution avant de changer la portée ou le groupe.
      </p>
    ) : reservation_attach_status === "error" ? (
      <p
        role="alert"
        className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
      >
        Impossible de rattacher la réservation. Aucune modification n’a été
        appliquée.
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

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-6 py-10 sm:px-10 lg:px-12">
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <Link
          href="/"
          className="text-sm font-medium text-accent hover:underline"
        >
          Tableau de bord
        </Link>
        <span className="text-muted text-sm select-none" aria-hidden="true">
          |
        </span>
        <Link
          href="/litter-groups"
          className="text-sm font-medium text-accent hover:underline"
        >
          ← Retour aux groupes
        </Link>
        <span className="text-muted text-sm select-none" aria-hidden="true">
          |
        </span>
        <Link
          href="/litters"
          className="text-sm font-medium text-accent hover:underline"
        >
          Portées
        </Link>
      </div>

      <div className="mt-8">
        {readError ? (
          <ErrorMessage />
        ) : !group ? (
          <NotFoundOrUnauthorized />
        ) : (
          <>
            <header className="flex flex-col justify-between gap-5 border-b pb-8 sm:flex-row sm:items-end">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-accent">
                  Groupe de portées
                </p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
                  {group.name || `Groupe ${group.id.slice(0, 8)}`}
                </h1>
                <p className="mt-3 text-sm text-muted">
                  Créé le {formatLitterDate(group.created_at)}
                </p>
              </div>
            </header>

            {group_campaign_status === "success" && (
              <div
                role="status"
                className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-800"
              >
                Campagne Brevo traitée — {group_campaign_count ?? "0"} dossier(s)
                préparé(s), {group_campaign_payment_count ?? "0"} paiement(s)
                créé(s), {pre_reservation_email_sent_count ?? "0"} e-mail(s)
                envoyé(s), {pre_reservation_email_already_sent_count ?? "0"} déjà
                envoyé(s), {pre_reservation_email_in_progress_count ?? "0"} en
                cours, {pre_reservation_email_missing_count ?? "0"} e-mail(s)
                manquant(s), {pre_reservation_email_failed_count ?? "0"} échec(s).
                {Number(group_campaign_draft_conflict_count ?? "0") > 0
                  ? ` ${group_campaign_draft_conflict_count} dossier brouillon à vérifier.`
                  : ""}
                {Number(pre_reservation_conflict_count ?? "0") > 0
                  ? ` ${pre_reservation_conflict_count} conflit(s) à vérifier.`
                  : ""}
                {Number(pre_reservation_missing_template_count ?? "0") > 0
                  ? ` ${pre_reservation_missing_template_count} modèle(s) Brevo absent(s).`
                  : ""}
                {Number(pre_reservation_brevo_not_configured_count ?? "0") > 0
                  ? ` ${pre_reservation_brevo_not_configured_count} envoi(s) sans configuration Brevo serveur.`
                  : ""}
                {Number(pre_reservation_error_count ?? "0") > 0
                  ? ` ${pre_reservation_error_count} erreur(s) technique(s).`
                  : ""}
              </div>
            )}
            {group_campaign_status === "no_selection" && (
              <div
                role="alert"
                className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800"
              >
                Aucune candidature sélectionnée. Cochez au moins une case avant
                de lancer la campagne.
              </div>
            )}
            {group_campaign_status === "no_eligible" && (
              <div
                role="alert"
                className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800"
              >
                Aucune candidature validée trouvée pour ce groupe parmi les
                sélections.
              </div>
            )}
            {group_campaign_status === "confirmation_required" && (
              <div
                role="alert"
                className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800"
              >
                Confirmation explicite requise avant de préparer et envoyer la
                campagne de pré-réservation.
              </div>
            )}
            {group_campaign_status === "error" && (
              <div
                role="alert"
                className="mt-6 rounded-xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-800"
              >
                Une erreur est survenue lors du lancement de la campagne. Aucune
                modification n&apos;a été appliquée pour les candidatures en erreur.
              </div>
            )}
            {balance_campaign_status === "success" && (
              <div
                role="status"
                className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-800"
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
                className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800"
              >
                Aucun dossier adoptant lié à ce groupe.
              </div>
            )}
            {balance_campaign_status === "error" && (
              <div
                role="alert"
                className="mt-6 rounded-xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-800"
              >
                Une erreur est survenue lors de la confirmation de campagne.
                Aucune donnée n’a été modifiée pour les dossiers en erreur.
              </div>
            )}
            {departure_balance_campaign_status === "success" && (
              <div
                role="status"
                className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-800"
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
                className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800"
              >
                Aucun dossier adoptant lié à ce groupe.
              </div>
            )}
            {departure_balance_campaign_status === "error" && (
              <div
                role="alert"
                className="mt-6 rounded-xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-800"
              >
                Une erreur est survenue lors de la confirmation de campagne
                solde. Aucune donnée n’a été modifiée pour les dossiers en erreur.
              </div>
            )}

            <div className="space-y-6 py-8">
              <section className="rounded-2xl border bg-surface p-6 sm:p-8">
                <h2 className="text-xl font-semibold">Informations</h2>
                <dl className="mt-6 grid gap-6 sm:grid-cols-2">
                  <DetailItem
                    label="Nom"
                    value={group.name || `Groupe ${group.id.slice(0, 8)}`}
                  />
                  <DetailItem
                    label="Espèce"
                    value={getSpeciesLabel(group.species)}
                  />
                  <DetailItem
                    label="Statut"
                    value={getLitterGroupStatusLabel(group.status)}
                  />
                  <DetailItem
                    label="Période prévue"
                    value={formatPeriod(
                      group.expected_period_start,
                      group.expected_period_end,
                    )}
                  />
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
                      Description
                    </dt>
                    <dd className="mt-1.5 whitespace-pre-wrap text-sm leading-6">
                      {group.description || "Non renseignée"}
                    </dd>
                  </div>
                </dl>
              </section>

              <section
                id="modifier-groupe"
                className="rounded-2xl border bg-surface p-6 sm:p-8"
              >
                <h2 className="text-xl font-semibold">
                  Modifier les informations du groupe
                </h2>
                <p className="mt-1 text-sm text-muted">
                  Mettez à jour le nom, l’espèce, le statut, la période prévue et
                  la description. Aucune portée, candidature ou réservation liée
                  n’est modifiée par cette action.
                </p>

                {group_detail_status === "success" ? (
                  <p
                    role="status"
                    className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
                  >
                    Les informations du groupe ont été mises à jour.
                  </p>
                ) : null}

                {group_detail_status &&
                group_detail_status !== "success" ? (
                  <p
                    role="alert"
                    className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
                  >
                    {groupDetailEditErrors[group_detail_status] ??
                      groupDetailEditErrors.error}
                  </p>
                ) : null}

                <details className="mt-5 rounded-xl border bg-background px-4 py-3">
                  <summary className="cursor-pointer text-sm font-semibold text-accent">
                    Modifier les informations du groupe
                  </summary>

                  <form
                    action={updateLitterGroupDetails}
                    className="mt-4 grid gap-5 sm:grid-cols-2"
                  >
                    <input type="hidden" name="group_id" value={group.id} />

                    <div className="sm:col-span-2">
                      <label
                        htmlFor="group-edit-name"
                        className="text-xs font-semibold uppercase tracking-wide text-muted"
                      >
                        Nom du groupe <span className="text-accent">*</span>
                      </label>
                      <input
                        id="group-edit-name"
                        name="name"
                        type="text"
                        required
                        defaultValue={group.name ?? ""}
                        className="mt-2 w-full rounded-xl border bg-surface px-4 py-3 text-sm focus:border-accent focus:outline-none"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="group-edit-status"
                        className="text-xs font-semibold uppercase tracking-wide text-muted"
                      >
                        Statut
                      </label>
                      <select
                        id="group-edit-status"
                        name="status"
                        defaultValue={group.status ?? "planned"}
                        className="mt-2 w-full rounded-xl border bg-surface px-4 py-3 text-sm focus:border-accent focus:outline-none"
                      >
                        {groupStatusEditValues.map((value) => (
                          <option key={value} value={value}>
                            {getLitterGroupStatusLabel(value)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label
                        htmlFor="group-edit-species"
                        className="text-xs font-semibold uppercase tracking-wide text-muted"
                      >
                        Espèce
                      </label>
                      <select
                        id="group-edit-species"
                        name="species"
                        defaultValue={group.species ?? "dog"}
                        className="mt-2 w-full rounded-xl border bg-surface px-4 py-3 text-sm focus:border-accent focus:outline-none"
                      >
                        {groupSpeciesEditOptions.map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label
                        htmlFor="group-edit-period-start"
                        className="text-xs font-semibold uppercase tracking-wide text-muted"
                      >
                        Période prévue — début
                      </label>
                      <input
                        id="group-edit-period-start"
                        name="expected_period_start"
                        type="date"
                        defaultValue={group.expected_period_start ?? ""}
                        className="mt-2 w-full rounded-xl border bg-surface px-4 py-3 text-sm focus:border-accent focus:outline-none"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="group-edit-period-end"
                        className="text-xs font-semibold uppercase tracking-wide text-muted"
                      >
                        Période prévue — fin
                      </label>
                      <input
                        id="group-edit-period-end"
                        name="expected_period_end"
                        type="date"
                        defaultValue={group.expected_period_end ?? ""}
                        className="mt-2 w-full rounded-xl border bg-surface px-4 py-3 text-sm focus:border-accent focus:outline-none"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label
                        htmlFor="group-edit-description"
                        className="text-xs font-semibold uppercase tracking-wide text-muted"
                      >
                        Description
                      </label>
                      <textarea
                        id="group-edit-description"
                        name="description"
                        rows={4}
                        defaultValue={group.description ?? ""}
                        className="mt-2 w-full rounded-xl border bg-surface px-4 py-3 text-sm focus:border-accent focus:outline-none"
                      />
                    </div>

                    <div className="sm:col-span-2 flex justify-end border-t pt-5">
                      <button
                        type="submit"
                        className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
                      >
                        Enregistrer les informations
                      </button>
                    </div>
                  </form>
                </details>
              </section>

              <section className="rounded-2xl border bg-surface p-6 sm:p-8">
                <h2 className="text-xl font-semibold">Portées du groupe</h2>

                {littersError ? (
                  <p role="alert" className="mt-5 text-sm text-amber-800">
                    Impossible de charger les portées du groupe.
                  </p>
                ) : !groupLitters || groupLitters.length === 0 ? (
                  <p className="mt-5 text-sm text-muted">
                    Aucune portée rattachée à ce groupe.
                  </p>
                ) : (
                  <div className="mt-6 divide-y divide-border">
                    {groupLitters.map((litter) => {
                      const birthDate =
                        litter.actual_birth_date || litter.expected_birth_date;
                      const birthLabel = litter.actual_birth_date
                        ? "Naissance réelle"
                        : "Naissance prévue";

                      return (
                        <div
                          key={litter.id ?? litter.name}
                          className="py-5 first:pt-0 last:pb-0"
                        >
                          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-3">
                                <span className="text-sm font-semibold text-foreground">
                                  {getLitterDisplayName(litter.name, litter.id)}
                                </span>
                                <span className="inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold text-muted">
                                  {getLitterStatusLabel(litter.status)}
                                </span>
                                {litter.id ? (
                                  <Link
                                    href={`/litters/${litter.id}`}
                                    className="inline-flex rounded-md border border-border px-2.5 py-1 text-xs font-semibold leading-none text-accent transition hover:border-accent hover:bg-accent-soft"
                                  >
                                    Fiche
                                  </Link>
                                ) : null}
                              </div>
                              <p className="text-xs text-muted">
                                Mère :{" "}
                                {litter.mother_display_name || "Non renseignée"}
                              </p>
                              <p className="text-xs text-muted">
                                Père :{" "}
                                {litter.father_display_name || "Non renseigné"}
                              </p>
                              <p className="text-xs text-muted">
                                {birthLabel} :{" "}
                                {birthDate
                                  ? formatLitterDate(birthDate)
                                  : "Non renseignée"}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              <LinkedApplicationsSection
                title="Candidatures liées à ce groupe"
                emptyLabel="Aucune candidature ne souhaite ce groupe."
                applications={linkedApplications}
                hasError={Boolean(linkedAppsError)}
                sectionId="candidatures-liees"
                banner={attachBanner}
                footer={
                  <AttachApplicationForm
                    scope={{
                      kind: "group",
                      groupId: group.id,
                      label:
                        "Rattacher une candidature existante à ce groupe",
                      warning:
                        "Cette action modifiera la période souhaitée de la candidature vers ce groupe, sans imposer de portée.",
                    }}
                    applications={attachableApplications}
                  />
                }
              />

              <section className="rounded-2xl border bg-surface p-6 sm:p-8">
                <h2 className="text-xl font-semibold">
                  Campagnes d’e-mails
                </h2>
                <div className="mt-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-accent">
                    Parcours candidat
                  </p>
                  <p className="mt-4 text-sm font-medium text-foreground">
                    Demande de pré-réservation
                  </p>
                  <p className="mt-2 text-sm text-muted">
                    L’envoi utilise le modèle transactionnel Brevo configuré
                    pour pre_reservation. Le sujet, le corps, l’expéditeur et
                    le reply-to restent gérés dans Brevo.
                  </p>
                  <div className="mt-4 rounded-xl border bg-background p-4 text-sm">
                    <p className="font-semibold text-foreground">
                      Modèle Brevo
                    </p>
                    <p className="mt-2 text-muted">
                      {preReservationCampaignTemplate?.brevoTemplateId
                        ? `${preReservationCampaignTemplate.title} (#${preReservationCampaignTemplate.brevoTemplateId})`
                        : "pre_reservation non configuré"}
                    </p>
                  </div>
                </div>

                {campaignEmailTemplatesError || qualifiedAppsError ? (
                  <p role="alert" className="mt-5 text-sm text-amber-800">
                    Impossible de charger toutes les données de campagne.
                  </p>
                ) : (
                  <PreReservationCampaignConfirmDialog
                    action={launchGroupPreReservationCampaign}
                    hiddenFieldName="litter_group_id"
                    hiddenFieldValue={id}
                    applications={(qualifiedApplications ?? []).map((app) => ({
                      id: app.id,
                      contactName:
                        formatPreReservationContactFullName({
                          first_name: app.contacts?.first_name ?? null,
                          last_name: app.contacts?.last_name ?? null,
                          display_name: app.contacts?.display_name ?? null,
                        }) || "Contact inconnu",
                      contactEmail: app.contacts?.email ?? null,
                      desiredSexPreference: app.desired_sex_preference,
                      rank: app.active_rank ?? app.initial_rank,
                      scopeLabel: app.desired_litter_id
                        ? "Portée du groupe"
                        : "Groupe",
                      variables: {
                        prenom: app.contacts?.first_name ?? "",
                        nom: app.contacts?.last_name ?? "",
                        nom_complet: formatPreReservationContactFullName({
                          first_name: app.contacts?.first_name ?? null,
                          last_name: app.contacts?.last_name ?? null,
                          display_name: app.contacts?.display_name ?? null,
                        }),
                        portee: app.desired_litter_id
                          ? (preReservationLitterNameById.get(
                              app.desired_litter_id,
                            ) ?? "")
                          : "",
                        groupe_portees: preReservationGroupName,
                        montant_pre_reservation: preReservationAmountLabel,
                        echeance_pre_reservation: preReservationDeadlineLabel,
                        nom_elevage: organizationCampaignName,
                      },
                    }))}
                    template={
                      preReservationCampaignTemplate
                        ? {
                            title: preReservationCampaignTemplate.title,
                            brevoTemplateId:
                              preReservationCampaignTemplate.brevoTemplateId,
                          }
                        : null
                    }
                    scopeLabel={group.name || `Groupe ${group.id.slice(0, 8)}`}
                    amountLabel={preReservationAmountLabel}
                    deadlineLabel={preReservationDeadlineLabel}
                    brevoConfiguration={{
                      senderEmail: brevoConfiguration.senderEmail,
                      senderName: brevoConfiguration.senderName,
                      replyToEmail: brevoConfiguration.replyToEmail,
                    }}
                  />
                )}

                <div className="mt-8 border-t pt-8">
                  <p className="text-xs font-semibold uppercase tracking-wide text-accent">
                    Parcours adoptant
                  </p>
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
                      instanceId="group-birth-documents-deposit-template"
                    />
                  )}

                  <form
                    action={launchGroupPreReservationBalanceCampaign}
                    className="mt-6"
                  >
                    <input type="hidden" name="litter_group_id" value={id} />
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
                    Modèle à personnaliser et envoyer depuis chaque fiche
                    portée, lorsque les créneaux individuels sont renseignés.
                    Aucun e-mail réel n’est envoyé par l’application.
                  </p>
                  {campaignEmailTemplatesError ? (
                    <p role="alert" className="mt-5 text-sm text-amber-800">
                      Impossible de charger les modèles d’e-mails pour cette
                      campagne.
                    </p>
                  ) : (
                    <div className="mt-5 rounded-xl border bg-background p-4">
                      <p className="text-sm font-semibold text-foreground">
                        Modèle d’e-mail
                      </p>
                      <p className="mt-2 rounded-md border bg-surface px-3 py-2 text-sm text-foreground">
                        {campaignEmailTemplates.find(
                          (template) =>
                            template.templateKey ===
                            "choice_appointment_adoption_booklet",
                        )?.title ??
                          "choice_appointment_adoption_booklet"}{" "}
                        - Parcours adoptant
                      </p>
                      <p className="mt-3 text-xs text-muted">
                        La copie se fait depuis les e-mails personnalisés sur
                        les fiches portées.
                      </p>
                    </div>
                  )}
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
                      instanceId="group-departure-preparation-template"
                    />
                  )}

                  <form
                    action={launchGroupDepartureBalanceCampaign}
                    className="mt-6"
                  >
                    <input type="hidden" name="litter_group_id" value={id} />
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
              </section>

              <section
                id="reservations-liees"
                className="rounded-2xl border bg-surface p-6 sm:p-8"
              >
                <h2 className="text-xl font-semibold">
                  Réservations liées à ce groupe
                </h2>

                {reservationAttachBanner}

                {reservationsError ? (
                  <p role="alert" className="mt-5 text-sm text-amber-800">
                    Impossible de charger les réservations liées.
                  </p>
                ) : !groupReservations || groupReservations.length === 0 ? (
                  <p className="mt-5 text-sm text-muted">
                    Aucune réservation rattachée à ce groupe.
                  </p>
                ) : (
                  <div className="mt-6 divide-y divide-border">
                    {groupReservations.map((reservation, index) => {
                      const preReservationDepositState =
                        getPreReservationDepositStateFromStatus(
                          reservation.status,
                        );

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
                              <span className="inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold text-muted">
                                {getReservationStatusLabel(reservation.status)}
                              </span>
                              <span
                                className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getPreReservationDepositBadgeClassName(
                                  preReservationDepositState,
                                )}`}
                              >
                                {getPreReservationDepositLabel(
                                  preReservationDepositState,
                                )}
                              </span>
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
                              Portée :{" "}
                              {reservation.litter_id ? (
                                <Link
                                  href={`/litters/${reservation.litter_id}`}
                                  className="font-medium text-accent hover:underline"
                                >
                                  {reservation.litter_name ?? "Portée"}
                                </Link>
                              ) : (
                                "Aucune portée précise"
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
                                (reservation.animal_display_name ??
                                "Non attribué")
                              )}
                            </p>
                          </div>
                        </div>
                      </div>
                      );
                    })}
                  </div>
                )}

                <AttachReservationForm
                  scope={{
                    kind: "group",
                    groupId: group.id,
                    label: "Rattacher une réservation existante à ce groupe",
                    warning:
                      "Cette action modifiera le rattachement de la réservation vers ce groupe et retirera toute portée précise.",
                  }}
                  reservations={attachableReservations}
                />
              </section>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
