import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getBrevoConfigurationStatus } from "@/lib/brevo/server";
import { createClient } from "@/lib/supabase/server";
import { runPostAdoptionAutomatedDelivery } from "./automated-delivery-service";
import { selectPostAdoptionOrganization } from "./automated-delivery-core";
import { getPostAdoptionEncryptionConfig } from "./token-encryption";

const TEMPLATE_KEYS = [
  "post_adoption_t1",
  "post_adoption_t2",
  "post_adoption_reminder_7",
  "post_adoption_reminder_14",
] as const;

type UntypedClient = SupabaseClient;

function hasValidEncryptionConfiguration() {
  try {
    getPostAdoptionEncryptionConfig();
    return true;
  } catch {
    return false;
  }
}

export type PostAdoptionAutomationOverviewRow = {
  organizationId: string;
  instanceId: string;
  reservationId: string;
  animalId: string;
  animalName: string;
  contactName: string;
  milestone: "t1" | "t2";
  instanceStatus: string;
  automationState: string;
  reasonCode: string | null;
  scheduledAt: string | null;
  lastDispatchStatus: string | null;
  lastErrorCode: string | null;
};

async function context(
  requestedOrganizationId: string | null,
  suppliedClient?: SupabaseClient,
) {
  const client = (suppliedClient ?? await createClient()) as unknown as UntypedClient;
  const { data: { user } } = await client.auth.getUser();
  if (!user) return null;
  const memberships = await client.from("memberships")
    .select("organization_id, role")
    .eq("profile_id", user.id).eq("status", "active").is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (memberships.error || !memberships.data?.length) return null;
  const membershipRows = memberships.data.map((membership) => ({
    organizationId: String(membership.organization_id),
    role: String(membership.role),
  }));
  const organizations = await client.from("organizations")
    .select("id, name")
    .in("id", membershipRows.map((membership) => membership.organizationId))
    .is("deleted_at", null);
  if (organizations.error) return null;
  const names = new Map(
    (organizations.data ?? []).map((organization) => [String(organization.id), String(organization.name)]),
  );
  const availableOrganizations = membershipRows
    .filter((membership) => names.has(membership.organizationId))
    .map((membership) => ({
      ...membership,
      name: names.get(membership.organizationId) ?? "Organisation",
    }));
  if (availableOrganizations.length === 0) return null;
  const selected = selectPostAdoptionOrganization(availableOrganizations, requestedOrganizationId);
  return {
    client,
    userId: user.id,
    organizations: availableOrganizations.map(({ organizationId, name }) => ({ id: organizationId, name })),
    organizationId: selected?.organizationId ?? null,
    organizationName: selected?.name ?? null,
    role: selected?.role ?? null,
  };
}

export async function readPostAdoptionAutomationDashboard(
  requestedOrganizationId: string | null,
  suppliedClient?: SupabaseClient,
) {
  const current = await context(requestedOrganizationId, suppliedClient);
  if (!current) return null;
  if (!current.organizationId) {
    return {
      organizationId: null,
      organizationName: null,
      organizations: current.organizations,
      role: null,
      canDecide: false,
      activatedAt: null,
      timezone: "Europe/Paris",
      missingTemplates: [...TEMPLATE_KEYS],
      environment: {},
      ready: false,
      rows: [] as PostAdoptionAutomationOverviewRow[],
    };
  }
  const [settings, templates, overview, organization] = await Promise.all([
    current.client.from("organization_settings")
      .select("post_adoption_automation_activated_at, post_adoption_automation_timezone")
      .eq("organization_id", current.organizationId).maybeSingle(),
    current.client.from("email_templates")
      .select("template_key, brevo_template_id, is_active")
      .eq("organization_id", current.organizationId)
      .in("template_key", [...TEMPLATE_KEYS]).is("deleted_at", null),
    current.client.rpc("list_post_adoption_questionnaire_automation_overview", {
      p_organization_id: current.organizationId,
    }),
    current.client.from("organizations")
      .select("name")
      .eq("id", current.organizationId)
      .maybeSingle(),
  ]);
  if (settings.error || templates.error || overview.error || organization.error || !Array.isArray(overview.data)) return null;
  const configured = new Set(
    (templates.data ?? [])
      .filter((row) => row.is_active && Number(row.brevo_template_id) > 0)
      .map((row) => String(row.template_key)),
  );
  const environment = {
    brevo: getBrevoConfigurationStatus().isConfigured,
    encryption: hasValidEncryptionConfiguration(),
    publicBaseUrl: Boolean(
      process.env.POST_ADOPTION_PUBLIC_BASE_URL?.trim()
      || process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim(),
    ),
    cronSecret: Boolean(process.env.CRON_SECRET?.trim()),
  };
  const rows = overview.data.map((value) => {
    const row = value as Record<string, unknown>;
    return {
      organizationId: String(row.organization_id),
      instanceId: String(row.instance_id),
      reservationId: String(row.reservation_id),
      animalId: String(row.animal_id),
      animalName: String(row.animal_name),
      contactName: String(row.contact_name),
      milestone: row.milestone === "t2" ? "t2" : "t1",
      instanceStatus: String(row.instance_status),
      automationState: String(row.automation_state),
      reasonCode: row.reason_code ? String(row.reason_code) : null,
      scheduledAt: row.scheduled_at ? String(row.scheduled_at) : null,
      lastDispatchStatus: row.last_dispatch_status ? String(row.last_dispatch_status) : null,
      lastErrorCode: row.last_error_code ? String(row.last_error_code) : null,
    } satisfies PostAdoptionAutomationOverviewRow;
  });
  return {
    organizationId: current.organizationId,
    organizationName: String(organization.data?.name ?? "Organisation"),
    organizations: current.organizations,
    role: current.role,
    canDecide: current.role === "owner" || current.role === "admin",
    activatedAt: settings.data?.post_adoption_automation_activated_at
      ? String(settings.data.post_adoption_automation_activated_at)
      : null,
    timezone: String(settings.data?.post_adoption_automation_timezone ?? "Europe/Paris"),
    missingTemplates: TEMPLATE_KEYS.filter((key) => !configured.has(key)),
    environment,
    ready: configured.size === TEMPLATE_KEYS.length && Object.values(environment).every(Boolean),
    rows,
  };
}

export async function activatePostAdoptionAutomation(timezone: string, organizationId: string) {
  const current = await context(organizationId);
  if (!current?.organizationId || !current.role) return "not_authenticated";
  if (!new Set(["owner", "admin"]).has(current.role)) return "forbidden";
  const dashboard = await readPostAdoptionAutomationDashboard(current.organizationId, current.client);
  if (!dashboard?.ready) return "not_ready";
  const result = await current.client.rpc("activate_post_adoption_questionnaire_automation", {
    p_organization_id: current.organizationId,
    p_timezone: timezone,
  });
  if (result.error || !Array.isArray(result.data)) return "technical_error";
  return String((result.data[0] as Record<string, unknown> | undefined)?.outcome ?? "technical_error");
}

export async function decidePostAdoptionAutomationException(input: {
  organizationId: string;
  instanceId: string;
  decision: "suspend" | "resume" | "authorize_late_send" | "authorize_retry" | "non_applicable";
  reason: string;
}) {
  const current = await context(input.organizationId);
  if (!current?.organizationId || !current.role) return "not_authenticated";
  const instance = await current.client.from("post_adoption_questionnaire_instances")
    .select("id")
    .eq("organization_id", current.organizationId)
    .eq("id", input.instanceId)
    .maybeSingle();
  if (instance.error || !instance.data) return "forbidden";
  const result = await current.client.rpc(
    "decide_post_adoption_questionnaire_automation_exception",
    {
      p_instance_id: input.instanceId,
      p_decision: input.decision,
      p_reason: input.reason,
    },
  );
  if (result.error) return "technical_error";
  const outcome = String(result.data ?? "technical_error");
  if (outcome === "success" && ["resume", "authorize_late_send", "authorize_retry"].includes(input.decision)) {
    await runPostAdoptionAutomatedDelivery(2, current.organizationId).catch(() => null);
  }
  return outcome;
}
