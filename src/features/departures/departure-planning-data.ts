import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

export type DeparturePlanningSnapshot = {
  canMutate: boolean;
  activeOrganizationId: string | null;
  organizations: Array<{ id: string; name: string; role: string }>;
  litters: Array<{ id: string; organizationId: string; name: string; actualBirthDate: string | null }>;
  plans: Array<{ id: string; organizationId: string; title: string; status: string; version: number; responseDeadlineAt: string | null }>;
  selectedPlan: null | {
    id: string;
    organizationId: string;
    title: string;
    status: string;
    version: number;
    defaultDurationMinutes: number;
    responseDeadlineAt: string | null;
    litters: Array<{ litterId: string; name: string; earliestDepartureAt: string }>;
    families: Array<{ reservationId: string; familyName: string; litterId: string }>;
    slots: Array<{
      id: string;
      startsAt: string;
      durationMinutes: number;
      visibility: "public" | "exceptional";
      status: string;
      reservationId: string | null;
      familyName: string | null;
      version: number;
    }>;
  };
};

type Loose = SupabaseClient;

export async function loadDeparturePlanningSnapshot(planId?: string | null, requestedOrganizationId?: string | null): Promise<DeparturePlanningSnapshot | null> {
  const typed = await createClient();
  const supabase = typed as unknown as Loose;
  const { data: { user } } = await typed.auth.getUser();
  if (!user) return null;
  const memberships = await supabase.from("memberships").select("organization_id,role").eq("profile_id", user.id).eq("status", "active").is("deleted_at", null);
  if (memberships.error) throw memberships.error;
  const writable = ((memberships.data ?? []) as Array<{ organization_id: string; role: string }>).filter((row) => ["owner", "admin"].includes(row.role));
  const organizationIds = writable.map((row) => row.organization_id);
  if (!organizationIds.length) return { canMutate: false, activeOrganizationId: null, organizations: [], litters: [], plans: [], selectedPlan: null };
  const [organizationsResult, littersResult, plansResult] = await Promise.all([
    supabase.from("organizations").select("id,name").in("id", organizationIds).is("deleted_at", null),
    supabase.from("litters").select("id,organization_id,name,actual_birth_date").in("organization_id", organizationIds).not("status", "in", "(cancelled,archived)").is("deleted_at", null).order("actual_birth_date", { ascending: false }),
    supabase.from("departure_plans").select("id,organization_id,title,status,version,response_deadline_at").in("organization_id", organizationIds).in("status", ["draft", "published", "closed"]).order("created_at", { ascending: false }),
  ]);
  const failed = [organizationsResult, littersResult, plansResult].find((result) => result.error);
  if (failed?.error) throw failed.error;
  const roleByOrg = new Map(writable.map((row) => [row.organization_id, row.role]));
  const organizationName = new Map(((organizationsResult.data ?? []) as Array<{ id: string; name: string }>).map((row) => [row.id, row.name]));
  const allLitters = ((littersResult.data ?? []) as Array<{ id: string; organization_id: string; name: string | null; actual_birth_date: string | null }>).map((row) => ({ id: row.id, organizationId: row.organization_id, name: row.name ?? "Portée", actualBirthDate: row.actual_birth_date }));
  const allPlans = ((plansResult.data ?? []) as Array<{ id: string; organization_id: string; title: string; status: string; version: number; response_deadline_at: string | null }>).map((row) => ({ id: row.id, organizationId: row.organization_id, title: row.title, status: row.status, version: row.version, responseDeadlineAt: row.response_deadline_at }));
  const planOrganizationId = planId ? allPlans.find((plan) => plan.id === planId)?.organizationId : null;
  const activeOrganizationId = requestedOrganizationId && organizationIds.includes(requestedOrganizationId)
    ? requestedOrganizationId
    : planOrganizationId ?? organizationIds[0]!;
  const litters = allLitters.filter((litter) => litter.organizationId === activeOrganizationId);
  const plans = allPlans.filter((plan) => plan.organizationId === activeOrganizationId);
  const chosen = planId ? plans.find((plan) => plan.id === planId) : plans[0];
  let selectedPlan: DeparturePlanningSnapshot["selectedPlan"] = null;
  if (chosen) {
    const [planResult, linksResult, slotsResult] = await Promise.all([
      supabase.from("departure_plans").select("id,organization_id,title,status,version,default_duration_minutes,response_deadline_at").eq("id", chosen.id).eq("organization_id", chosen.organizationId).single(),
      supabase.from("departure_plan_litters").select("litter_id,earliest_departure_at").eq("plan_id", chosen.id),
      supabase.from("departure_slots").select("id,starts_at,duration_minutes,visibility,status,reservation_id,version").eq("plan_id", chosen.id).order("starts_at"),
    ]);
    if (planResult.error || linksResult.error || slotsResult.error) throw planResult.error ?? linksResult.error ?? slotsResult.error;
    const selectedLitterIds = ((linksResult.data ?? []) as Array<{ litter_id: string }>).map((row) => row.litter_id);
    const reservations = selectedLitterIds.length ? await supabase.from("reservations").select("id,contact_id,litter_id").eq("organization_id", chosen.organizationId).in("litter_id", selectedLitterIds).eq("status", "animal_assigned").not("animal_id", "is", null).is("deleted_at", null) : { data: [], error: null };
    const contactIds = ((reservations.data ?? []) as Array<{ contact_id: string }>).map((row) => row.contact_id);
    const contacts = contactIds.length ? await supabase.from("contacts").select("id,display_name").in("id", contactIds) : { data: [], error: null };
    const contactById = new Map(((contacts.data ?? []) as Array<{ id: string; display_name: string | null }>).map((row) => [row.id, row.display_name ?? "Famille"]));
    const reservationRows = (reservations.data ?? []) as Array<{ id: string; contact_id: string; litter_id: string }>;
    const reservationName = new Map(reservationRows.map((row) => [row.id, contactById.get(row.contact_id) ?? "Famille"]));
    const litterName = new Map(litters.map((litter) => [litter.id, litter.name]));
    const row = planResult.data as { id: string; organization_id: string; title: string; status: string; version: number; default_duration_minutes: number; response_deadline_at: string | null };
    selectedPlan = {
      id: row.id, organizationId: row.organization_id, title: row.title, status: row.status, version: row.version, defaultDurationMinutes: row.default_duration_minutes, responseDeadlineAt: row.response_deadline_at,
      litters: ((linksResult.data ?? []) as Array<{ litter_id: string; earliest_departure_at: string }>).map((link) => ({ litterId: link.litter_id, name: litterName.get(link.litter_id) ?? "Portée", earliestDepartureAt: link.earliest_departure_at })),
      families: reservationRows.map((reservation) => ({ reservationId: reservation.id, familyName: reservationName.get(reservation.id) ?? "Famille", litterId: reservation.litter_id })),
      slots: ((slotsResult.data ?? []) as Array<{ id: string; starts_at: string; duration_minutes: number; visibility: "public" | "exceptional"; status: string; reservation_id: string | null; version: number }>).map((slot) => ({ id: slot.id, startsAt: slot.starts_at, durationMinutes: slot.duration_minutes, visibility: slot.visibility, status: slot.status, reservationId: slot.reservation_id, familyName: slot.reservation_id ? reservationName.get(slot.reservation_id) ?? "Famille" : null, version: slot.version })),
    };
  }
  return {
    canMutate: true,
    activeOrganizationId,
    organizations: organizationIds.map((id) => ({ id, name: organizationName.get(id) ?? "Organisation", role: roleByOrg.get(id) ?? "viewer" })),
    litters,
    plans,
    selectedPlan,
  };
}
