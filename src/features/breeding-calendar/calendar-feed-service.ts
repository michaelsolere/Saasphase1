import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  calendarFeedTokenHint,
  generateCalendarFeedToken,
  hashCalendarFeedToken,
  normalizeCalendarFeedSources,
  buildCalendarFeedPath,
  type CalendarFeedSources,
  DEFAULT_CALENDAR_FEED_SOURCES,
} from "@/features/breeding-calendar/calendar-feed-token";
import type {
  CalendarFeedActionErrorCode,
  OrganizationCalendarFeedMetadata,
} from "@/features/breeding-calendar/calendar-feed-types";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

type Supabase = SupabaseClient<Database>;

export type { OrganizationCalendarFeedMetadata } from "./calendar-feed-types";

type ErrorResult = {
  outcome: "error";
  error: { code: CalendarFeedActionErrorCode; message: string };
};

export type ActiveCalendarFeedResult =
  | { outcome: "success"; feed: OrganizationCalendarFeedMetadata | null; role: "owner" | "admin" | "member" | "viewer" }
  | ErrorResult
  | { outcome: "hidden"; role: "member" | "viewer" | null };

export type CreateOrRotateCalendarFeedResult =
  | {
      outcome: "success";
      feed: OrganizationCalendarFeedMetadata;
      /** Relative path only — never includes a host from request headers. */
      feedPath: string;
      token: string;
    }
  | ErrorResult;

export type UpdateCalendarFeedSourcesResult =
  | { outcome: "success"; feed: OrganizationCalendarFeedMetadata }
  | ErrorResult;

export type RevokeCalendarFeedResult =
  | { outcome: "success"; feed: OrganizationCalendarFeedMetadata; alreadyRevoked: boolean }
  | ErrorResult;

function mapFeedRow(row: {
  id: string;
  organization_id: string;
  token_hint: string;
  include_litter_care: boolean;
  include_reproductive_cycle: boolean;
  include_adopter_appointment: boolean;
  revision_no: number;
  created_at: string;
  updated_at: string;
  revoked_at: string | null;
}): OrganizationCalendarFeedMetadata {
  return {
    id: row.id,
    organizationId: row.organization_id,
    tokenHint: row.token_hint,
    includeLitterCare: row.include_litter_care,
    includeReproductiveCycle: row.include_reproductive_cycle,
    includeAdopterAppointment: row.include_adopter_appointment,
    revisionNo: row.revision_no,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    revokedAt: row.revoked_at,
  };
}

async function resolveActiveMembership(supabase: Supabase) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const membership = await supabase
    .from("memberships")
    .select("organization_id, role")
    .eq("profile_id", user.id)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membership.error || !membership.data?.organization_id) return null;
  const role = membership.data.role;
  if (role !== "owner" && role !== "admin" && role !== "member" && role !== "viewer") {
    return null;
  }
  return {
    organizationId: membership.data.organization_id as string,
    role,
    userId: user.id,
  };
}

function mapRpcReason(reason: string | null | undefined): CalendarFeedActionErrorCode {
  switch (reason) {
    case "not_authenticated":
      return "unauthenticated";
    case "forbidden":
      return "forbidden";
    case "invalid_input":
      return "invalid_input";
    case "no_sources_selected":
      return "no_sources_selected";
    case "stale_revision":
      return "stale_revision";
    case "feed_not_found":
      return "feed_not_found";
    case "feed_revoked":
      return "feed_revoked";
    case "organization_unavailable":
      return "organization_unavailable";
    case "conflict":
      return "conflict";
    case "already_revoked":
      return "feed_revoked";
    default:
      return "database_error";
  }
}

function errorMessage(code: CalendarFeedActionErrorCode): string {
  switch (code) {
    case "unauthenticated":
      return "Vous devez être connecté pour continuer.";
    case "forbidden":
      return "Seuls le propriétaire et les administrateurs peuvent gérer l’abonnement calendrier.";
    case "invalid_input":
      return "Les paramètres fournis sont invalides.";
    case "no_sources_selected":
      return "Sélectionnez au moins une source de calendrier.";
    case "stale_revision":
      return "Le flux a été modifié ailleurs. Rechargez la page puis réessayez.";
    case "feed_not_found":
      return "Aucun flux d’abonnement actif n’a été trouvé.";
    case "feed_revoked":
      return "Ce lien d’abonnement a déjà été révoqué.";
    case "organization_unavailable":
      return "L’organisation active est introuvable.";
    case "conflict":
      return "Impossible de créer le lien pour le moment. Réessayez.";
    default:
      return "La gestion de l’abonnement est momentanément indisponible.";
  }
}

function failure(code: CalendarFeedActionErrorCode): ErrorResult {
  return { outcome: "error", error: { code, message: errorMessage(code) } };
}

export async function getActiveOrganizationCalendarFeed(
  suppliedClient?: Supabase,
): Promise<ActiveCalendarFeedResult> {
  const supabase = suppliedClient ?? (await createClient());
  const membership = await resolveActiveMembership(supabase);
  if (!membership) return failure("unauthenticated");

  if (membership.role !== "owner" && membership.role !== "admin") {
    return {
      outcome: "hidden",
      role: membership.role as "member" | "viewer",
    };
  }

  const result = await supabase
    .from("organization_calendar_feeds")
    .select(
      "id, organization_id, token_hint, include_litter_care, include_reproductive_cycle, include_adopter_appointment, revision_no, created_at, updated_at, revoked_at",
    )
    .eq("organization_id", membership.organizationId)
    .is("revoked_at", null)
    .maybeSingle();

  if (result.error) return failure("database_error");

  return {
    outcome: "success",
    role: membership.role,
    feed: result.data ? mapFeedRow(result.data) : null,
  };
}

export async function createOrRotateOrganizationCalendarFeed(input: {
  sources?: Partial<CalendarFeedSources>;
  suppliedClient?: Supabase;
}): Promise<CreateOrRotateCalendarFeedResult> {
  const supabase = input.suppliedClient ?? (await createClient());
  const membership = await resolveActiveMembership(supabase);
  if (!membership) return failure("unauthenticated");
  if (membership.role !== "owner" && membership.role !== "admin") {
    return failure("forbidden");
  }

  const sources =
    normalizeCalendarFeedSources(input.sources ?? DEFAULT_CALENDAR_FEED_SOURCES) ??
    null;
  if (!sources) return failure("no_sources_selected");

  const token = generateCalendarFeedToken();
  const tokenHash = hashCalendarFeedToken(token);
  const tokenHint = calendarFeedTokenHint(token);

  const rpc = await supabase.rpc("create_or_rotate_organization_calendar_feed", {
    p_token_hash: tokenHash,
    p_token_hint: tokenHint,
    p_include_litter_care: sources.includeLitterCare,
    p_include_reproductive_cycle: sources.includeReproductiveCycle,
    p_include_adopter_appointment: sources.includeAdopterAppointment,
  });

  if (rpc.error) return failure("database_error");
  const row = rpc.data?.[0];
  if (!row || row.outcome !== "success" || !row.feed_id) {
    return failure(mapRpcReason(row?.reason));
  }

  return {
    outcome: "success",
    token,
    feedPath: buildCalendarFeedPath(token),
    feed: {
      id: row.feed_id,
      organizationId: row.organization_id as string,
      tokenHint: row.token_hint as string,
      includeLitterCare: row.include_litter_care === true,
      includeReproductiveCycle: row.include_reproductive_cycle === true,
      includeAdopterAppointment: row.include_adopter_appointment === true,
      revisionNo: Number(row.revision_no),
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
      revokedAt: row.revoked_at,
    },
  };
}

export async function updateOrganizationCalendarFeedSources(input: {
  feedId: string;
  expectedRevisionNo: number;
  sources: CalendarFeedSources;
  suppliedClient?: Supabase;
}): Promise<UpdateCalendarFeedSourcesResult> {
  const supabase = input.suppliedClient ?? (await createClient());
  const membership = await resolveActiveMembership(supabase);
  if (!membership) return failure("unauthenticated");
  if (membership.role !== "owner" && membership.role !== "admin") {
    return failure("forbidden");
  }

  const sources = normalizeCalendarFeedSources(input.sources);
  if (!sources) return failure("no_sources_selected");

  const rpc = await supabase.rpc("update_organization_calendar_feed_sources", {
    p_feed_id: input.feedId,
    p_expected_revision_no: input.expectedRevisionNo,
    p_include_litter_care: sources.includeLitterCare,
    p_include_reproductive_cycle: sources.includeReproductiveCycle,
    p_include_adopter_appointment: sources.includeAdopterAppointment,
  });

  if (rpc.error) return failure("database_error");
  const row = rpc.data?.[0];
  if (!row || row.outcome !== "success" || !row.feed_id) {
    return failure(mapRpcReason(row?.reason));
  }

  return {
    outcome: "success",
    feed: {
      id: row.feed_id,
      organizationId: row.organization_id as string,
      tokenHint: row.token_hint as string,
      includeLitterCare: row.include_litter_care === true,
      includeReproductiveCycle: row.include_reproductive_cycle === true,
      includeAdopterAppointment: row.include_adopter_appointment === true,
      revisionNo: Number(row.revision_no),
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
      revokedAt: row.revoked_at,
    },
  };
}

export async function revokeOrganizationCalendarFeed(input: {
  feedId: string;
  expectedRevisionNo: number;
  suppliedClient?: Supabase;
}): Promise<RevokeCalendarFeedResult> {
  const supabase = input.suppliedClient ?? (await createClient());
  const membership = await resolveActiveMembership(supabase);
  if (!membership) return failure("unauthenticated");
  if (membership.role !== "owner" && membership.role !== "admin") {
    return failure("forbidden");
  }

  const rpc = await supabase.rpc("revoke_organization_calendar_feed", {
    p_feed_id: input.feedId,
    p_expected_revision_no: input.expectedRevisionNo,
  });

  if (rpc.error) return failure("database_error");
  const row = rpc.data?.[0];
  if (!row || row.outcome !== "success" || !row.feed_id) {
    return failure(mapRpcReason(row?.reason));
  }

  return {
    outcome: "success",
    alreadyRevoked: row.reason === "already_revoked",
    feed: {
      id: row.feed_id,
      organizationId: row.organization_id as string,
      tokenHint: row.token_hint as string,
      includeLitterCare: row.include_litter_care === true,
      includeReproductiveCycle: row.include_reproductive_cycle === true,
      includeAdopterAppointment: row.include_adopter_appointment === true,
      revisionNo: Number(row.revision_no),
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
      revokedAt: row.revoked_at,
    },
  };
}
