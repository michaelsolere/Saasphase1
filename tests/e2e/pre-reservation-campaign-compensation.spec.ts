import { expect, test } from "@playwright/test";

import {
  sendPreReservationEmailForApplication,
  type PreReservationEmailTransport,
} from "../../src/features/communications/pre-reservation-email-core";
import {
  createAuthenticatedSupabaseClient,
  runE2eSqlSync,
} from "./helpers/supabase";
import { runPreReservationCampaignForApplications } from "../../src/features/reservations/pre-reservation-campaign";

const org = "20000000-0000-4000-8000-000000000001";
const owner = "10000000-0000-4000-8000-000000000001";
const ids = {
  group: "98000000-0000-4000-8000-000000000001",
  litter: "98000000-0000-4000-8000-000000000002",
  template: "98000000-0000-4000-8000-000000000003",
  contact: "98000000-0000-4000-8000-000000000004",
  application: "98000000-0000-4000-8000-000000000005",
  draftReservation: "98000000-0000-4000-8000-000000000006",
};
const marker = "2099-01-01 00:00:00+00";
const q = (value: string) => `'${value.replaceAll("'", "''")}'`;
const sql = (value: string) => runE2eSqlSync(value);

function cleanup() {
  sql(`
    delete from public.email_delivery_attempts where contact_id=${q(ids.contact)}::uuid or litter_id=${q(ids.litter)}::uuid;
    delete from public.payments where reservation_id in (select id from public.reservations where application_id=${q(ids.application)}::uuid) or contact_id=${q(ids.contact)}::uuid;
    delete from public.reservations where application_id=${q(ids.application)}::uuid or contact_id=${q(ids.contact)}::uuid;
    delete from public.contact_roles where contact_id=${q(ids.contact)}::uuid;
    delete from public.applications where id=${q(ids.application)}::uuid;
    delete from public.contacts where id=${q(ids.contact)}::uuid;
    delete from public.email_templates where id=${q(ids.template)}::uuid;
    delete from public.litters where id=${q(ids.litter)}::uuid;
    delete from public.litter_groups where id=${q(ids.group)}::uuid;
    update public.email_templates set deleted_at=null where organization_id=${q(org)}::uuid and template_key='pre_reservation' and deleted_at=${q(marker)}::timestamptz;
  `);
}

function remaining() {
  return Number(sql(`select count(*) from (
    select id from public.email_delivery_attempts where contact_id=${q(ids.contact)}::uuid or litter_id=${q(ids.litter)}::uuid
    union all select id from public.payments where contact_id=${q(ids.contact)}::uuid
    union all select id from public.reservations where application_id=${q(ids.application)}::uuid or contact_id=${q(ids.contact)}::uuid
    union all select id from public.contact_roles where contact_id=${q(ids.contact)}::uuid
    union all select id from public.applications where id=${q(ids.application)}::uuid
    union all select id from public.contacts where id=${q(ids.contact)}::uuid
    union all select id from public.email_templates where id=${q(ids.template)}::uuid
    union all select id from public.litters where id=${q(ids.litter)}::uuid
    union all select id from public.litter_groups where id=${q(ids.group)}::uuid
  ) rows;`));
}

function fixture() {
  cleanup();
  sql(`
    update public.email_templates set deleted_at=${q(marker)}::timestamptz where organization_id=${q(org)}::uuid and template_key='pre_reservation' and deleted_at is null;
    insert into public.litter_groups(id,organization_id,name,species,status,created_by,updated_by) values(${q(ids.group)},${q(org)},'E2E transaction pré-réservation groupe','dog','open_for_applications',${q(owner)},${q(owner)});
    insert into public.litters(id,organization_id,litter_group_id,name,species,breed,status,created_by,updated_by) values(${q(ids.litter)},${q(org)},${q(ids.group)},'E2E transaction pré-réservation portée','dog','Golden Retriever','pregnancy_confirmed',${q(owner)},${q(owner)});
    insert into public.contacts(id,organization_id,contact_type,first_name,last_name,display_name,email,origin_channel,primary_status,created_by,updated_by) values(${q(ids.contact)},${q(org)},'person','Alice','Transaction','Alice Transaction','alice.transaction@example.invalid','manual','active',${q(owner)},${q(owner)});
    insert into public.contact_roles(organization_id,contact_id,role,started_at,created_by,updated_by) values(${q(org)},${q(ids.contact)},'candidate','2026-07-12',${q(owner)},${q(owner)});
    insert into public.applications(id,organization_id,contact_id,species,breed,desired_litter_id,desired_litter_group_id,desired_sex_preference,desired_quantity,status,created_by,updated_by) values(${q(ids.application)},${q(org)},${q(ids.contact)},'dog','Golden Retriever',${q(ids.litter)},${q(ids.group)},'no_preference',1,'qualified',${q(owner)},${q(owner)});
    insert into public.email_templates(id,organization_id,template_key,title,category,subject,body,is_active,brevo_template_id,created_by,updated_by) values(${q(ids.template)},${q(org)},'pre_reservation','E2E pré-réservation transactionnelle','candidate_journey','Pré-réservation E2E','Brevo',true,765434,${q(owner)},${q(owner)});
  `);
}

function transport(mode: "success" | "certain" | "timeout" = "success") {
  const sends: Array<{ params: Record<string, string> }> = [];
  const value: PreReservationEmailTransport = {
    isConfigured: () => true,
    getTemplate: async (id) => ({ ok: true, template: { id, name: "E2E", subject: "Pré-réservation E2E", isActive: true, modifiedAt: "2026-07-12T10:00:00Z", sender: null, replyTo: null } }),
    sendEmail: async (input) => {
      sends.push({ params: input.params });
      if (mode === "certain") return { ok: false, reason: "invalid_request" };
      if (mode === "timeout") return { ok: false, reason: "timeout" };
      return { ok: true, messageId: "e2e-pre-reservation" };
    },
  };
  return { value, sends };
}

const input = { applicationId: ids.application, targetLitterId: ids.litter, targetLitterGroupId: ids.group };

test("success creates one request, uses real values, and attaches the attempt late", async () => {
  fixture(); const supabase = await createAuthenticatedSupabaseClient(); const t = transport();
  try {
    const result = await sendPreReservationEmailForApplication(input, { supabase, transport: t.value });
    expect(result).toMatchObject({ status: "success", rpcOutcome: "created", reservationPrepared: true, paymentCreated: true });
    const row = sql(`select r.id::text||'|'||p.amount_cents||'|'||p.due_date::text||'|'||a.reservation_id::text from public.reservations r join public.payments p on p.reservation_id=r.id and p.deleted_at is null join public.email_delivery_attempts a on a.reservation_id=r.id where r.application_id=${q(ids.application)} and r.deleted_at is null;`);
    const [reservationId, amount, dueDate, attachedReservationId] = row.split("|");
    expect(attachedReservationId).toBe(reservationId);
    expect(t.sends[0].params.montant_pre_reservation).toBe("250,00 €");
    expect(t.sends[0].params.echeance_pre_reservation).toContain(new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "Europe/Paris" }).format(new Date(dueDate)));
    expect(amount).toBe("25000");
  } finally { cleanup(); expect(remaining()).toBe(0); }
});

test("success retry and parallel launches have one owner, request, and send", async () => {
  fixture(); const supabase = await createAuthenticatedSupabaseClient(); const t = transport();
  try {
    const delayed = { ...t.value, sendEmail: async (value: Parameters<PreReservationEmailTransport["sendEmail"]>[0]) => { await new Promise(resolve => setTimeout(resolve, 80)); return t.value.sendEmail(value); } };
    const launch = () => sendPreReservationEmailForApplication(input, { supabase, transport: delayed });
    const parallel = await Promise.all([launch(), launch()]);
    expect(parallel.filter(result => result.status === "success")).toHaveLength(1);
    expect(parallel.filter(result => result.status === "in_progress")).toHaveLength(1);
    const retry = await launch();
    expect(retry.status).toBe("already_sent");
    expect(t.sends).toHaveLength(1);
    expect(Number(sql(`select count(*) from public.reservations where application_id=${q(ids.application)} and deleted_at is null;`))).toBe(1);
    expect(Number(sql(`select count(*) from public.payments where contact_id=${q(ids.contact)} and deleted_at is null;`))).toBe(1);
  } finally { cleanup(); expect(remaining()).toBe(0); }
});

test("certain failure compensates created resources, fails attempt, and can retry", async () => {
  fixture(); const supabase = await createAuthenticatedSupabaseClient();
  try {
    const failed = await sendPreReservationEmailForApplication(input, { supabase, transport: transport("certain").value });
    expect(failed).toMatchObject({ deliveryState: "not_sent", compensated: true });
    expect(sql(`select status from public.email_delivery_attempts where contact_id=${q(ids.contact)};`)).toBe("failed");
    expect(Number(sql(`select count(*) from public.reservations where application_id=${q(ids.application)} and deleted_at is null;`))).toBe(0);
    const retried = await sendPreReservationEmailForApplication(input, { supabase, transport: transport().value });
    expect(retried.status).toBe("success");
  } finally { cleanup(); expect(remaining()).toBe(0); }
});

test("reused resources are never compensated on certain failure", async () => {
  fixture(); const supabase = await createAuthenticatedSupabaseClient();
  try {
    const { data, error } = await supabase.rpc("create_pre_reservation_request_for_application", { p_application_id: ids.application, p_target_litter_id: ids.litter, p_target_litter_group_id: ids.group });
    expect(error).toBeNull(); expect(data?.[0]?.outcome).toBe("created");
    const result = await sendPreReservationEmailForApplication(input, { supabase, transport: transport("certain").value });
    expect(result).toMatchObject({ rpcOutcome: "already_exists", compensated: false });
    expect(Number(sql(`select count(*) from public.reservations where application_id=${q(ids.application)} and deleted_at is null;`))).toBe(1);
  } finally { cleanup(); expect(remaining()).toBe(0); }
});

test("timeout and markSent failure keep resources and attempt sending", async () => {
  fixture(); const supabase = await createAuthenticatedSupabaseClient();
  try {
    const timeout = await sendPreReservationEmailForApplication(input, { supabase, transport: transport("timeout").value });
    expect(timeout.deliveryState).toBe("uncertain");
    expect(sql(`select status from public.email_delivery_attempts where contact_id=${q(ids.contact)};`)).toBe("sending");
    expect(Number(sql(`select count(*) from public.reservations where application_id=${q(ids.application)} and deleted_at is null;`))).toBe(1);
    cleanup(); fixture();
    const markSent = await sendPreReservationEmailForApplication(input, { supabase, transport: transport().value, transitions: { markSent: async () => ({ outcome: "error", error: { code: "database_error", message: "E2E" } }) } });
    expect(markSent.deliveryState).toBe("uncertain");
    expect(sql(`select status from public.email_delivery_attempts where contact_id=${q(ids.contact)};`)).toBe("sending");
    expect(Number(sql(`select count(*) from public.reservations where application_id=${q(ids.application)} and deleted_at is null;`))).toBe(1);
  } finally { cleanup(); expect(remaining()).toBe(0); }
});

test("compensation failure restores payment and leaves attempt sending", async () => {
  fixture(); const supabase = await createAuthenticatedSupabaseClient(); const t = transport("certain");
  try {
    t.value.sendEmail = async () => {
      sql(`update public.reservations set status='active' where application_id=${q(ids.application)} and deleted_at is null;`);
      return { ok: false, reason: "invalid_request" };
    };
    const result = await sendPreReservationEmailForApplication(input, { supabase, transport: t.value });
    expect(result).toMatchObject({ deliveryState: "uncertain", errorCode: "reservation_compensation_failed" });
    expect(sql(`select status from public.email_delivery_attempts where contact_id=${q(ids.contact)};`)).toBe("sending");
    expect(Number(sql(`select count(*) from public.payments where contact_id=${q(ids.contact)} and deleted_at is null;`))).toBe(1);
  } finally { cleanup(); expect(remaining()).toBe(0); }
});

test("ineligible application creates neither attempt nor business resource", async () => {
  fixture(); const supabase = await createAuthenticatedSupabaseClient();
  try {
    sql(`update public.applications set status='rejected' where id=${q(ids.application)};`);
    const result = await sendPreReservationEmailForApplication(input, { supabase, transport: transport().value });
    expect(result.status).toBe("not_eligible");
    expect(Number(sql(`select count(*) from public.email_delivery_attempts where contact_id=${q(ids.contact)};`))).toBe(0);
    expect(Number(sql(`select count(*) from public.reservations where application_id=${q(ids.application)};`))).toBe(0);
  } finally { cleanup(); expect(remaining()).toBe(0); }
});

test("draft reservation conflict remains ignored by campaign aggregation", async () => {
  fixture(); const supabase = await createAuthenticatedSupabaseClient();
  try {
    sql(`insert into public.reservations(id,organization_id,application_id,contact_id,litter_id,litter_group_id,species,breed,reserved_sex_preference,status,currency,created_by,updated_by) values(${q(ids.draftReservation)},${q(org)},${q(ids.application)},${q(ids.contact)},${q(ids.litter)},${q(ids.group)},'dog','Golden Retriever','no_preference','draft','EUR',${q(owner)},${q(owner)});`);
    const result = await runPreReservationCampaignForApplications({
      supabase,
      applications: [{ id: ids.application, species: "dog", breed: "Golden Retriever", desired_sex_preference: "no_preference", target_litter_id: ids.litter, target_litter_group_id: ids.group }],
      sendEmail: (campaignInput) => sendPreReservationEmailForApplication({ applicationId: campaignInput.applicationId, targetLitterId: campaignInput.targetLitterId, targetLitterGroupId: campaignInput.targetLitterGroupId }, { supabase, transport: transport().value }),
    });
    expect(result).toMatchObject({ ignoredDraftConflictCount: 1, reservationsPreparedCount: 0, paymentsCreatedCount: 0 });
    expect(Number(sql(`select count(*) from public.reservations where id=${q(ids.draftReservation)} and deleted_at is null;`))).toBe(1);
  } finally { cleanup(); expect(remaining()).toBe(0); }
});
