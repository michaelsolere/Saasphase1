import { expect, test, type Page } from "@playwright/test";
import { sendBirthDocumentsDepositEmailForReservation, type BirthDocumentsDepositEmailTransport } from "../../src/features/communications/birth-documents-deposit-email-core";
import { runBirthDocumentsDepositCampaign } from "../../src/features/reservations/birth-documents-deposit-campaign";
import { getBrevoTransactionalTemplateConfig } from "../../src/features/settings/brevo-template-registry";
import { createAuthenticatedSupabaseClient, E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD, runE2eSqlSync } from "./helpers/supabase";

const org = "20000000-0000-4000-8000-000000000001"; const owner = "10000000-0000-4000-8000-000000000001";
const ids = { group: "97000000-0000-4000-8000-000000000001", litter: "97000000-0000-4000-8000-000000000002", template: "97000000-0000-4000-8000-000000000003", contact: "97000000-0000-4000-8000-000000000004", app: "97000000-0000-4000-8000-000000000005", reservation: "97000000-0000-4000-8000-000000000006", paid: "97000000-0000-4000-8000-000000000007", active: "97000000-0000-4000-8000-000000000008", unrelatedPaid: "97000000-0000-4000-8000-000000000009" };
const q = (v: string) => `'${v.replaceAll("'", "''")}'`;
const sql = (value: string) => runE2eSqlSync(value);

function cleanup() {
  sql(`delete from public.email_delivery_attempts where litter_id=${q(ids.litter)}::uuid;
    delete from public.payments where reservation_id=${q(ids.reservation)}::uuid;
    delete from public.reservations where id=${q(ids.reservation)}::uuid;
    delete from public.applications where id=${q(ids.app)}::uuid;
    delete from public.contacts where id=${q(ids.contact)}::uuid;
    delete from public.email_templates where id=${q(ids.template)}::uuid;
    delete from public.litters where id=${q(ids.litter)}::uuid;
    delete from public.litter_groups where id=${q(ids.group)}::uuid;`);
}
function remaining() { return Number(sql(`select count(*) from (select id from public.email_delivery_attempts where litter_id=${q(ids.litter)}::uuid union all select id from public.payments where reservation_id=${q(ids.reservation)}::uuid union all select id from public.reservations where id=${q(ids.reservation)}::uuid union all select id from public.applications where id=${q(ids.app)}::uuid union all select id from public.contacts where id=${q(ids.contact)}::uuid union all select id from public.email_templates where id=${q(ids.template)}::uuid union all select id from public.litters where id=${q(ids.litter)}::uuid union all select id from public.litter_groups where id=${q(ids.group)}::uuid) x;`)); }
function fixture({ active = false, email = "camille.birth@example.invalid" } = {}) {
  cleanup(); sql(`insert into public.litter_groups(id,organization_id,name,species,status,created_by,updated_by) values(${q(ids.group)},${q(org)},'E2E naissance groupe','dog','born',${q(owner)},${q(owner)});
    insert into public.litters(id,organization_id,litter_group_id,name,species,breed,status,actual_birth_date,created_by,updated_by) values(${q(ids.litter)},${q(org)},${q(ids.group)},'E2E naissance portée','dog','Golden Retriever','born','2026-07-10',${q(owner)},${q(owner)});
    insert into public.contacts(id,organization_id,contact_type,first_name,last_name,display_name,email,origin_channel,primary_status,created_by,updated_by) values(${q(ids.contact)},${q(org)},'person','Camille','Naissance','Camille Naissance',${email ? q(email) : "null"},'manual','active',${q(owner)},${q(owner)});
    insert into public.applications(id,organization_id,contact_id,species,breed,desired_litter_id,desired_litter_group_id,desired_sex_preference,desired_quantity,status,created_by,updated_by) values(${q(ids.app)},${q(org)},${q(ids.contact)},'dog','Golden Retriever',${q(ids.litter)},${q(ids.group)},'female_preferred_male_possible',1,'qualified',${q(owner)},${q(owner)});
    insert into public.reservations(id,organization_id,application_id,contact_id,litter_id,litter_group_id,species,breed,reserved_sex_preference,status,currency,created_by,updated_by) values(${q(ids.reservation)},${q(org)},${q(ids.app)},${q(ids.contact)},${q(ids.litter)},${q(ids.group)},'dog','Golden Retriever','female_preferred_male_possible','pre_reservation_paid','EUR',${q(owner)},${q(owner)});
    insert into public.payments(id,organization_id,contact_id,reservation_id,amount_cents,currency,payment_type,status,paid_at,payment_method,notes,created_by,updated_by) values(${q(ids.paid)},${q(org)},${q(ids.contact)},${q(ids.reservation)},25000,'EUR','pre_reservation_deposit_refundable','paid',now(),'bank_transfer','Demande 1/2 réglée',${q(owner)},${q(owner)});
    insert into public.email_templates(id,organization_id,template_key,title,category,subject,body,is_active,brevo_template_id,created_by,updated_by) values(${q(ids.template)},${q(org)},'birth_documents_deposit','Contrat + certificat et complément d’arrhes','adopter_journey','Registre technique','Registre technique',true,765432,${q(owner)},${q(owner)});
    ${active ? `insert into public.payments(id,organization_id,contact_id,reservation_id,amount_cents,currency,payment_type,status,payment_method,due_date,notes,created_by,updated_by) values(${q(ids.active)},${q(org)},${q(ids.contact)},${q(ids.reservation)},25000,'EUR','arrhes','requested','bank_transfer','2031-02-03','Demande 2/2 — complément d’arrhes',${q(owner)},${q(owner)});` : ""}`);
}
function transport(mode: "success" | "failed" | "unconfigured" = "success") {
  const sends: unknown[] = []; const value: BirthDocumentsDepositEmailTransport = { isConfigured: () => mode !== "unconfigured", getTemplate: async (id) => ({ ok: true, template: { id, name: "QA", subject: "Sujet Brevo QA", isActive: true, modifiedAt: "2026-07-12T10:00:00Z", sender: null, replyTo: null } }), sendEmail: async (input) => { sends.push(input); return mode === "failed" ? { ok: false, reason: "invalid_request" } : { ok: true, messageId: "qa-birth-1" }; } }; return { value, sends };
}
async function login(page: Page) { await page.goto("/login"); await page.getByLabel("Email").fill(E2E_OWNER_EMAIL); await page.getByLabel("Mot de passe").fill(E2E_OWNER_PASSWORD); await page.getByRole("button", { name: "Se connecter" }).click(); await expect(page).toHaveURL(/\/candidatures/); }

test("registry, settings and preview expose the existing request values", async ({ page }) => { test.setTimeout(60_000); fixture({ active: true }); try { expect(getBrevoTransactionalTemplateConfig("birth_documents_deposit")).toMatchObject({ category: "adopter_journey" }); await login(page); await page.goto("/settings/organization#brevo-templates"); await expect(page.getByText("birth_documents_deposit", { exact: true })).toBeVisible(); await page.goto(`/litters/${ids.litter}`); await page.getByText("Campagnes d’e-mails").click(); await expect(page.getByText("Contrat + certificat", { exact: true })).toBeVisible(); const button = page.getByRole("button", { name: "Préparer le complément et envoyer via Brevo" }); await expect(button).toBeVisible(); await button.evaluate((element) => element.removeAttribute("disabled")); await button.click(); const dialog = page.getByRole("dialog"); await expect(dialog).toBeVisible(); await dialog.getByText(/Camille Naissance — variables prévisualisées/).click(); await expect(dialog.getByText("Femelle préférée, mâle possible", { exact: true })).toBeVisible(); await expect(dialog.getByText("3 février 2031", { exact: true })).toBeVisible(); await expect(dialog.getByText("250,00 €", { exact: true }).first()).toBeVisible(); } finally { cleanup(); expect(remaining()).toBe(0); } });

test("parallel launches keep one active payment and one Brevo send", async () => { fixture(); const supabase = await createAuthenticatedSupabaseClient(); const t = transport(); const delayedTransport: BirthDocumentsDepositEmailTransport = { ...t.value, sendEmail: async (input) => { await new Promise((resolve) => setTimeout(resolve, 75)); return t.value.sendEmail(input); } }; try { const launch = () => runBirthDocumentsDepositCampaign({ supabase, litterId: ids.litter, reservationIds: [ids.reservation], userId: owner, sendEmail: (input) => sendBirthDocumentsDepositEmailForReservation(input, { supabase, transport: delayedTransport }) }); const results = await Promise.all([launch(), launch()]); expect(results.reduce((total, result) => total + result.paymentsCreatedCount, 0)).toBe(1); expect(results.reduce((total, result) => total + result.paymentsReusedCount, 0)).toBe(0); expect(results.reduce((total, result) => total + result.emailsInProgressCount, 0)).toBe(1); expect(t.sends).toHaveLength(1); expect(Number(sql(`select count(*) from public.payments where reservation_id=${q(ids.reservation)} and payment_type='arrhes' and status in ('requested','pending','partially_paid') and deleted_at is null;`))).toBe(1); expect(Number(sql(`select count(*) from public.email_delivery_attempts where reservation_id=${q(ids.reservation)} and status='sent' and deleted_at is null;`))).toBe(1); } finally { cleanup(); expect(remaining()).toBe(0); } });

test("250 euros paid creates 250 euros complement and sends only once", async () => { fixture(); const supabase = await createAuthenticatedSupabaseClient(); const t = transport(); try { const first = await runBirthDocumentsDepositCampaign({ supabase, litterId: ids.litter, reservationIds: [ids.reservation], userId: owner, sendEmail: (input) => sendBirthDocumentsDepositEmailForReservation(input, { supabase, transport: t.value }) }); expect(first).toMatchObject({ status: "success", paymentsCreatedCount: 1, emailsSentCount: 1 }); const second = await runBirthDocumentsDepositCampaign({ supabase, litterId: ids.litter, reservationIds: [ids.reservation], userId: owner, sendEmail: (input) => sendBirthDocumentsDepositEmailForReservation(input, { supabase, transport: t.value }) }); expect(second).toMatchObject({ emailsAlreadySentCount: 1, paymentsCreatedCount: 0, paymentsReusedCount: 0 }); expect(t.sends).toHaveLength(1); expect(t.sends[0]).toMatchObject({ params: { montant_deja_regle: "250,00 €", montant_complement_arrhes: "250,00 €", arrhes_totales: "500,00 €", date_naissance: "10 juillet 2026", sexe_souhaite: "Femelle préférée, mâle possible", payment_request_id: expect.any(String) } }); expect(t.sends[0]).not.toHaveProperty("attachments"); expect(Number(sql(`select amount_cents from public.payments where reservation_id=${q(ids.reservation)} and status='requested' and deleted_at is null;`))).toBe(25000); } finally { cleanup(); expect(remaining()).toBe(0); } });

test("paid non-deposit payment is excluded from paid arrhes and complement", async () => {
  fixture();
  const supabase = await createAuthenticatedSupabaseClient();
  const t = transport();
  try {
    sql(`insert into public.payments(id,organization_id,contact_id,reservation_id,amount_cents,currency,payment_type,status,paid_at,payment_method,notes,created_by,updated_by) values(${q(ids.unrelatedPaid)},${q(org)},${q(ids.contact)},${q(ids.reservation)},30000,'EUR','balance','paid',now(),'bank_transfer','Paiement de solde sans rapport avec les arrhes',${q(owner)},${q(owner)});`);
    const result = await runBirthDocumentsDepositCampaign({
      supabase,
      litterId: ids.litter,
      reservationIds: [ids.reservation],
      userId: owner,
      sendEmail: (input) => sendBirthDocumentsDepositEmailForReservation(input, { supabase, transport: t.value }),
    });
    expect(result).toMatchObject({ completeCount: 0, paymentsCreatedCount: 1, emailsSentCount: 1 });
    expect(t.sends[0]).toMatchObject({ params: { montant_deja_regle: "250,00 €", montant_complement_arrhes: "250,00 €" } });
    expect(Number(sql(`select amount_cents from public.payments where reservation_id=${q(ids.reservation)} and payment_type='arrhes' and status='requested' and deleted_at is null;`))).toBe(25000);
  } finally {
    cleanup();
    expect(remaining()).toBe(0);
  }
});

test("existing request is reused; certain failure compensates only a new request; uncertainty retains it", async () => { const supabase = await createAuthenticatedSupabaseClient(); fixture({ active: true }); try { const reused = await runBirthDocumentsDepositCampaign({ supabase, litterId: ids.litter, reservationIds: [ids.reservation], userId: owner, sendEmail: (input) => sendBirthDocumentsDepositEmailForReservation(input, { supabase, transport: transport().value }) }); expect(reused).toMatchObject({ paymentsReusedCount: 1, paymentsCreatedCount: 0 }); cleanup(); fixture(); const failedTransport = transport("failed"); const failed = await runBirthDocumentsDepositCampaign({ supabase, litterId: ids.litter, reservationIds: [ids.reservation], userId: owner, sendEmail: (input) => sendBirthDocumentsDepositEmailForReservation(input, { supabase, transport: failedTransport.value }) }); expect(failed).toMatchObject({ paymentsCreatedCount: 1, paymentsCompensatedCount: 1 }); expect(Number(sql(`select count(*) from public.payments where reservation_id=${q(ids.reservation)} and status='requested' and deleted_at is null;`))).toBe(0); cleanup(); fixture(); const uncertainTransport = transport(); uncertainTransport.value.sendEmail = async () => ({ ok: false, reason: "timeout" }); const uncertain = await runBirthDocumentsDepositCampaign({ supabase, litterId: ids.litter, reservationIds: [ids.reservation], userId: owner, sendEmail: (input) => sendBirthDocumentsDepositEmailForReservation(input, { supabase, transport: uncertainTransport.value }) }); expect(uncertain).toMatchObject({ paymentsCreatedCount: 1, uncertainCount: 1, paymentsCompensatedCount: 0 }); expect(Number(sql(`select count(*) from public.payments where reservation_id=${q(ids.reservation)} and status='requested' and deleted_at is null;`))).toBe(1); } finally { cleanup(); expect(remaining()).toBe(0); } });

test("complete, unpaid, missing email, missing model and unconfigured Brevo create no lasting request or email", async () => { const supabase = await createAuthenticatedSupabaseClient(); fixture(); try { sql(`update public.payments set amount_cents=50000 where id=${q(ids.paid)};`); let result = await runBirthDocumentsDepositCampaign({ supabase, litterId: ids.litter, reservationIds: [ids.reservation], userId: owner, sendEmail: (input) => sendBirthDocumentsDepositEmailForReservation(input, { supabase, transport: transport().value }) }); expect(result.completeCount).toBe(1); sql(`update public.payments set amount_cents=10000 where id=${q(ids.paid)};`); result = await runBirthDocumentsDepositCampaign({ supabase, litterId: ids.litter, reservationIds: [ids.reservation], userId: owner, sendEmail: (input) => sendBirthDocumentsDepositEmailForReservation(input, { supabase, transport: transport().value }) }); expect(result.preReservationUnpaidCount).toBe(1); cleanup(); fixture({ email: "" }); result = await runBirthDocumentsDepositCampaign({ supabase, litterId: ids.litter, reservationIds: [ids.reservation], userId: owner, sendEmail: (input) => sendBirthDocumentsDepositEmailForReservation(input, { supabase, transport: transport().value }) }); expect(result).toMatchObject({ emailsMissingCount: 1, paymentsCreatedCount: 0 }); cleanup(); fixture(); sql(`delete from public.email_templates where id=${q(ids.template)};`); result = await runBirthDocumentsDepositCampaign({ supabase, litterId: ids.litter, reservationIds: [ids.reservation], userId: owner, sendEmail: (input) => sendBirthDocumentsDepositEmailForReservation(input, { supabase, transport: transport().value }) }); expect(result).toMatchObject({ missingTemplateCount: 1, paymentsCreatedCount: 0 }); cleanup(); fixture(); result = await runBirthDocumentsDepositCampaign({ supabase, litterId: ids.litter, reservationIds: [ids.reservation], userId: owner, sendEmail: (input) => sendBirthDocumentsDepositEmailForReservation(input, { supabase, transport: transport("unconfigured").value }) }); expect(result).toMatchObject({ brevoNotConfiguredCount: 1, paymentsCreatedCount: 0 }); expect(Number(sql(`select count(*) from public.documents where reservation_id=${q(ids.reservation)};`))).toBe(0); } finally { cleanup(); expect(remaining()).toBe(0); } });

test("incompatible active request is refused and an existing request keeps its real deadline", async () => {
  const supabase = await createAuthenticatedSupabaseClient();
  fixture({ active: true });
  try {
    const existingTransport = transport();
    const reused = await sendBirthDocumentsDepositEmailForReservation(
      { reservationId: ids.reservation, litterId: ids.litter },
      { supabase, transport: existingTransport.value },
    );
    expect(reused.paymentAction).toBe("reused");
    expect(existingTransport.sends[0]).toMatchObject({ params: { echeance_complement_arrhes: "3 février 2031" } });
    cleanup(); fixture({ active: true });
    sql(`update public.payments set amount_cents=24000 where id=${q(ids.active)};`);
    const refused = await sendBirthDocumentsDepositEmailForReservation(
      { reservationId: ids.reservation, litterId: ids.litter },
      { supabase, transport: transport().value },
    );
    expect(refused).toMatchObject({ status: "incompatible_request", deliveryState: "not_sent" });
  } finally { cleanup(); expect(remaining()).toBe(0); }
});

test("certain failure compensates a created request, then a retry reactivates it", async () => {
  const supabase = await createAuthenticatedSupabaseClient(); fixture();
  try {
    const failed = await sendBirthDocumentsDepositEmailForReservation(
      { reservationId: ids.reservation, litterId: ids.litter },
      { supabase, transport: transport("failed").value },
    );
    expect(failed).toMatchObject({ deliveryState: "not_sent", paymentAction: "created", compensated: true });
    expect(sql(`select status from public.email_delivery_attempts where reservation_id=${q(ids.reservation)};`)).toBe("failed");
    const retriedTransport = transport();
    const retried = await sendBirthDocumentsDepositEmailForReservation(
      { reservationId: ids.reservation, litterId: ids.litter },
      { supabase, transport: retriedTransport.value },
    );
    expect(retried).toMatchObject({ status: "success", paymentAction: "reactivated" });
    expect(retriedTransport.sends).toHaveLength(1);
  } finally { cleanup(); expect(remaining()).toBe(0); }
});

test("certain failure never compensates a reused request", async () => {
  const supabase = await createAuthenticatedSupabaseClient(); fixture({ active: true });
  try {
    const result = await sendBirthDocumentsDepositEmailForReservation(
      { reservationId: ids.reservation, litterId: ids.litter },
      { supabase, transport: transport("failed").value },
    );
    expect(result).toMatchObject({ paymentAction: "reused", compensated: false });
    expect(Number(sql(`select count(*) from public.payments where id=${q(ids.active)} and deleted_at is null;`))).toBe(1);
  } finally { cleanup(); expect(remaining()).toBe(0); }
});

test("compensation failure and markSent failure preserve payment and sending attempt", async () => {
  const supabase = await createAuthenticatedSupabaseClient(); fixture();
  try {
    const certain = transport();
    certain.value.sendEmail = async () => {
      sql(`update public.payments set status='pending' where reservation_id=${q(ids.reservation)} and payment_type='arrhes' and deleted_at is null;`);
      return { ok: false, reason: "invalid_request" };
    };
    const compensationFailure = await sendBirthDocumentsDepositEmailForReservation(
      { reservationId: ids.reservation, litterId: ids.litter },
      { supabase, transport: certain.value },
    );
    expect(compensationFailure).toMatchObject({ deliveryState: "uncertain", errorCode: "payment_compensation_failed" });
    expect(sql(`select status from public.email_delivery_attempts where reservation_id=${q(ids.reservation)};`)).toBe("sending");
    cleanup(); fixture();
    const sentTransport = transport();
    const markSentFailure = await sendBirthDocumentsDepositEmailForReservation(
      { reservationId: ids.reservation, litterId: ids.litter },
      { supabase, transport: sentTransport.value, transitions: { markSent: async () => ({ outcome: "error", error: { code: "database_error", message: "QA markSent" } }) } },
    );
    expect(markSentFailure).toMatchObject({ deliveryState: "uncertain", paymentAction: "created" });
    expect(Number(sql(`select count(*) from public.payments where reservation_id=${q(ids.reservation)} and deleted_at is null and payment_type='arrhes';`))).toBe(1);
    expect(sql(`select status from public.email_delivery_attempts where reservation_id=${q(ids.reservation)};`)).toBe("sending");
  } finally { cleanup(); expect(remaining()).toBe(0); }
});

test("template retrieval failure is certain and happens before payment mutation", async () => {
  const supabase = await createAuthenticatedSupabaseClient(); fixture();
  try {
    const t = transport();
    t.value.getTemplate = async () => ({ ok: false, reason: "provider_unavailable" });
    const result = await sendBirthDocumentsDepositEmailForReservation(
      { reservationId: ids.reservation, litterId: ids.litter },
      { supabase, transport: t.value },
    );
    expect(result).toMatchObject({ deliveryState: "not_sent" });
    expect(result.paymentAction).toBeUndefined();
    expect(result.compensated ?? false).toBe(false);
    expect(Number(sql(`select count(*) from public.payments where reservation_id=${q(ids.reservation)} and payment_type='arrhes';`))).toBe(0);
    expect(sql(`select status from public.email_delivery_attempts where reservation_id=${q(ids.reservation)};`)).toBe("failed");
  } finally { cleanup(); expect(remaining()).toBe(0); }
});
