import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { readDepositSettingsForOrganization } from "@/features/payments/deposit-thresholds";
import {
  buildChoiceAppointmentDraft,
  evaluateChoiceAppointmentEligibility,
} from "@/features/reservations/choice-appointment-planning-core";
import { createClient } from "@/lib/supabase/server";

export type ChoicePlanningCandidate = {
  reservationId: string;
  familyName: string;
  sex: "male" | "female";
  activeOrder: number;
  historicalRank: number;
  eligible: boolean;
  blockers: string[];
};

export type ChoicePlanningSnapshot = {
  litter: { id: string; organizationId: string; name: string };
  role: string;
  canMutate: boolean;
  candidates: ChoicePlanningCandidate[];
  suggestedSlots: Array<{
    reservationId: string;
    sex: "male" | "female";
    activeOrder: number;
    historicalRank: number;
    sequence: number;
    plannedAt: string;
  }>;
  plan: null | {
    id: string;
    status: string;
    startsAt: string;
    durationMinutes: number;
    version: number;
    slots: Array<{
      id: string;
      reservationId: string;
      familyName: string;
      sex: string;
      historicalRank: number;
      activeOrder: number;
      sequence: number;
      plannedAt: string;
      responseKind: string | null;
      status: string;
      reportReason: string | null;
      animalId: string | null;
      assignmentEventId: string | null;
    }>;
  };
  animals: Array<{
    id: string;
    name: string;
    sex: string;
    isBreeder: boolean;
    status: string;
    photos: Array<{ id: string; url: string; isPrimary: boolean }>;
  }>;
};

type Loose = SupabaseClient;

export async function loadChoicePlanningSnapshot(
  litterId: string,
  providedClient?: Awaited<ReturnType<typeof createClient>>,
): Promise<ChoicePlanningSnapshot | null> {
  const typed = providedClient ?? (await createClient());
  const supabase = typed as unknown as Loose;
  const { data: { user } } = await typed.auth.getUser();
  if (!user) return null;

  const litterResult = await supabase.from("litters")
    .select("id, organization_id, name")
    .eq("id", litterId).is("deleted_at", null).maybeSingle();
  const litter = litterResult.data as { id: string; organization_id: string; name: string | null } | null;
  if (litterResult.error || !litter) return null;

  const [membershipResult, positionsResult, reservationsResult, linesResult, documentsResult, paymentsResult, planResult, animalsResult, mediaResult, settings] = await Promise.all([
    supabase.from("memberships").select("role").eq("organization_id", litter.organization_id).eq("profile_id", user.id).eq("status", "active").is("deleted_at", null).maybeSingle(),
    supabase.from("post_birth_positions").select("id,reservation_id,sex,status,historical_rank,current_decision_id").eq("organization_id", litter.organization_id).eq("litter_id", litter.id).eq("status", "confirmed"),
    supabase.from("reservations").select("id,contact_id,animal_id").eq("organization_id", litter.organization_id).eq("litter_id", litter.id).is("deleted_at", null),
    supabase.from("post_birth_positioning_lines").select("id,reservation_id,proposed_sex,proposed_outcome,active_order,updated_at").eq("organization_id", litter.organization_id).eq("proposed_outcome", "place").not("active_order", "is", null).order("updated_at", { ascending: false }),
    supabase.from("documents").select("reservation_id,document_type,status").eq("organization_id", litter.organization_id).eq("litter_id", litter.id).in("document_type", ["commitment_certificate", "reservation_contract"]).is("deleted_at", null).is("superseded_at", null),
    supabase.from("payments").select("reservation_id,amount_cents,payment_type,status").eq("organization_id", litter.organization_id).in("payment_type", ["arrhes", "pre_reservation_deposit_refundable"]).is("deleted_at", null),
    supabase.from("choice_appointment_plans").select("id,status,starts_at,duration_minutes,version").eq("organization_id", litter.organization_id).eq("litter_id", litter.id).in("status", ["draft", "validated", "sending", "sent"]).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("animals").select("id,call_name,official_name,sex,status,is_breeder").eq("organization_id", litter.organization_id).eq("litter_id", litter.id).eq("ownership_status", "produced").is("deleted_at", null).order("birth_order"),
    supabase.from("media").select("id,animal_id,file_path,is_primary").eq("organization_id", litter.organization_id).eq("litter_id", litter.id).eq("media_type", "photo").is("deleted_at", null),
    readDepositSettingsForOrganization({ supabase: typed, organizationId: litter.organization_id }),
  ]);

  const reservationRows = (reservationsResult.data ?? []) as Array<{ id: string; contact_id: string; animal_id: string | null }>;
  const contactIds = reservationRows.map((row) => row.contact_id);
  const contactsResult = contactIds.length
    ? await supabase.from("contacts").select("id,display_name,first_name,last_name").in("id", contactIds)
    : { data: [], error: null };
  const contacts = new Map(((contactsResult.data ?? []) as Array<{ id: string; display_name: string | null; first_name: string | null; last_name: string | null }>).map((row) => [row.id, row]));
  const reservations = new Map(reservationRows.map((row) => [row.id, row]));
  const documents = (documentsResult.data ?? []) as Array<{ reservation_id: string; document_type: string; status: string }>;
  const payments = (paymentsResult.data ?? []) as Array<{ reservation_id: string; amount_cents: number; status: string }>;
  const latestLine = new Map<string, { active_order: number; proposed_sex: string }>();
  for (const raw of linesResult.data ?? []) {
    const line = raw as { reservation_id: string; active_order: number; proposed_sex: string };
    if (!latestLine.has(line.reservation_id)) latestLine.set(line.reservation_id, line);
  }

  const candidates: ChoicePlanningCandidate[] = [];
  for (const raw of positionsResult.data ?? []) {
    const position = raw as { id: string; reservation_id: string; sex: string; status: string; historical_rank: number };
    const line = latestLine.get(position.reservation_id);
    const reservation = reservations.get(position.reservation_id);
    if (!reservation || (position.sex !== "male" && position.sex !== "female")) continue;
    const contact = contacts.get(reservation.contact_id);
    const eligibility = evaluateChoiceAppointmentEligibility({
      positionStatus: position.status,
      sex: position.sex,
      activeOrder: line?.proposed_sex === position.sex ? line.active_order : null,
      historicalRank: position.historical_rank,
      requiredDocuments: documents.filter((document) => document.reservation_id === position.reservation_id).map((document) => ({ type: document.document_type, status: document.status })),
      paidDepositCents: payments.filter((payment) => payment.reservation_id === position.reservation_id && payment.status === "paid").reduce((sum, payment) => sum + payment.amount_cents, 0),
      completeDepositCents: settings.completeDepositCents,
    });
    candidates.push({
      reservationId: position.reservation_id,
      familyName:
        contact?.display_name ??
        ([contact?.first_name, contact?.last_name].filter(Boolean).join(" ") ||
          "Famille"),
      sex: position.sex,
      activeOrder: line?.active_order ?? 0,
      historicalRank: position.historical_rank,
      eligible: eligibility.eligible,
      blockers: eligibility.blockers,
    });
  }

  const eligible = candidates.filter((candidate) => candidate.eligible);
  const defaultStartsAt = new Date();
  defaultStartsAt.setUTCDate(defaultStartsAt.getUTCDate() + 7);
  defaultStartsAt.setUTCHours(8, 0, 0, 0);
  const suggestedSlots = eligible.length
    ? buildChoiceAppointmentDraft({
        startsAt: defaultStartsAt.toISOString(),
        durationMinutes: 45,
        male: eligible.filter((candidate) => candidate.sex === "male"),
        female: eligible.filter((candidate) => candidate.sex === "female"),
      })
    : [];

  const planRow = planResult.data as { id: string; status: string; starts_at: string; duration_minutes: number; version: number } | null;
  let plan: ChoicePlanningSnapshot["plan"] = null;
  if (planRow) {
    const slotsResult = await supabase.from("choice_appointment_slots").select("id,reservation_id,sex,historical_rank,active_order,sequence,planned_at,response_kind,status,report_reason,assignment_event_id").eq("plan_id", planRow.id).order("sequence");
    plan = {
      id: planRow.id,
      status: planRow.status,
      startsAt: planRow.starts_at,
      durationMinutes: planRow.duration_minutes,
      version: planRow.version,
      slots: ((slotsResult.data ?? []) as Array<{ id: string; reservation_id: string; sex: string; historical_rank: number; active_order: number; sequence: number; planned_at: string; response_kind: string | null; status: string; report_reason: string | null; assignment_event_id: string | null }>).map((slot) => {
        const reservation = reservations.get(slot.reservation_id);
        const contact = reservation ? contacts.get(reservation.contact_id) : null;
        return {
          id: slot.id,
          reservationId: slot.reservation_id,
          familyName: contact?.display_name ?? "Famille",
          sex: slot.sex,
          historicalRank: slot.historical_rank,
          activeOrder: slot.active_order,
          sequence: slot.sequence,
          plannedAt: slot.planned_at,
          responseKind: slot.response_kind,
          status: slot.status,
          reportReason: slot.report_reason,
          animalId: reservation?.animal_id ?? null,
          assignmentEventId: slot.assignment_event_id,
        };
      }),
    };
  }

  const mediaRows = (mediaResult.data ?? []) as Array<{ id: string; animal_id: string; file_path: string; is_primary: boolean }>;
  const signed = mediaRows.length
    ? await typed.storage.from("animal-media").createSignedUrls(mediaRows.map((row) => row.file_path), 3600)
    : { data: [], error: null };
  const signedByPath = new Map((signed.data ?? []).map((row) => [row.path, row.signedUrl]));
  const animals = ((animalsResult.data ?? []) as Array<{ id: string; call_name: string | null; official_name: string | null; sex: string; status: string; is_breeder: boolean }>).map((animal) => ({
    id: animal.id,
    name: animal.call_name ?? animal.official_name ?? `Chiot ${animal.id.slice(0, 8)}`,
    sex: animal.sex,
    isBreeder: animal.is_breeder,
    status: animal.status,
    photos: mediaRows.filter((media) => media.animal_id === animal.id).flatMap((media) => {
      const url = signedByPath.get(media.file_path);
      return url ? [{ id: media.id, url, isPrimary: media.is_primary }] : [];
    }),
  }));

  const role = String((membershipResult.data as { role?: string } | null)?.role ?? "viewer");
  return {
    litter: { id: litter.id, organizationId: litter.organization_id, name: litter.name ?? "Portée" },
    role,
    canMutate: role === "owner" || role === "admin",
    candidates,
    suggestedSlots,
    plan,
    animals,
  };
}
