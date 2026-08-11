import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

import { withE2eFixtures } from "./helpers/fixtures/fixture-registry";
import {
  E2E_MEMBER_EMAIL,
  E2E_MEMBER_PASSWORD,
  E2E_OWNER_EMAIL,
  E2E_OWNER_PASSWORD,
  createAnonymousSupabaseClient,
  createAuthenticatedSupabaseClient,
  runE2eSqlSync,
} from "./helpers/supabase";

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const sql = (statement: string) => runE2eSqlSync(statement);
const q = (value: string) => `'${value.replaceAll("'", "''")}'`;

type RpcRow = Record<string, unknown>;
type Rpc = (name: string, args: Record<string, unknown>) => Promise<{ data: RpcRow[] | RpcRow | null; error: { message: string } | null }>;

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_OWNER_EMAIL);
  await page.getByLabel("Mot de passe").fill(E2E_OWNER_PASSWORD);
  await page.getByRole("button", { name: /connexion|se connecter/i }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });
}

function row(result: Awaited<ReturnType<Rpc>>, label: string) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  const value = Array.isArray(result.data) ? result.data[0] : result.data;
  if (!value) throw new Error(`${label}: missing row`);
  return value;
}

test("post-birth positioning and direct late sale are atomic, private and recoverable", async ({ page, browser }) => {
  await withE2eFixtures(sql, async (fixtures) => {
    const groupId = fixtures.register("litter_groups", randomUUID());
    const litterId = fixtures.register("litters", randomUUID());
    const priorityContactId = fixtures.register("contacts", randomUUID());
    const priorityApplicationId = fixtures.register("applications", randomUUID());
    const priorityReservationId = fixtures.register("reservations", randomUUID());
    const directContactId = fixtures.register("contacts", randomUUID());
    const directApplicationId = fixtures.register("applications", randomUUID());
    const animalId = fixtures.register("animals", randomUUID());
    const generatedReservationIds: string[] = [];

    const registerGeneratedEffects = () => {
      const directReservationIds = JSON.parse(sql(`select coalesce(json_agg(id), '[]'::json)::text from public.reservations where application_id=${q(directApplicationId)}::uuid`)) as string[];
      for (const id of directReservationIds) {
        if (!fixtures.has("reservations", id)) fixtures.register("reservations", id);
        if (!generatedReservationIds.includes(id)) generatedReservationIds.push(id);
      }
      const scopes: Array<[Parameters<typeof fixtures.register>[0], string]> = [
        ["post_birth_capacity_states", `litter_id=${q(litterId)}::uuid`],
        ["post_birth_capacity_revisions", `litter_id=${q(litterId)}::uuid`],
        ["post_birth_positioning_drafts", `litter_group_id=${q(groupId)}::uuid`],
        ["post_birth_positioning_waves", `litter_id=${q(litterId)}::uuid`],
        ["post_birth_positioning_lines", `reservation_id=${q(priorityReservationId)}::uuid`],
        ["post_birth_positions", `reservation_id=${q(priorityReservationId)}::uuid`],
        ["post_birth_position_decisions", `reservation_id=${q(priorityReservationId)}::uuid`],
        ["post_birth_incidents", `litter_id=${q(litterId)}::uuid`],
        ["post_birth_positioning_events", `litter_id=${q(litterId)}::uuid`],
        ["post_birth_positioning_commands", `organization_id=${q(organizationId)}::uuid and target_id in (select id from public.post_birth_capacity_states where litter_id=${q(litterId)}::uuid union select id from public.post_birth_positioning_drafts where litter_group_id=${q(groupId)}::uuid union select id from public.post_birth_positioning_waves where litter_id=${q(litterId)}::uuid union select id from public.post_birth_positioning_lines where reservation_id=${q(priorityReservationId)}::uuid union select id from public.post_birth_incidents where litter_id=${q(litterId)}::uuid)`],
        ["direct_late_sales", `application_id=${q(directApplicationId)}::uuid`],
        ["direct_late_sale_email_drafts", `direct_sale_id in(select id from public.direct_late_sales where application_id=${q(directApplicationId)}::uuid)`],
        ["direct_late_sale_events", `direct_sale_id in(select id from public.direct_late_sales where application_id=${q(directApplicationId)}::uuid)`],
        ["direct_late_sale_commands", `target_id in(select id from public.direct_late_sales where application_id=${q(directApplicationId)}::uuid)`],
      ];
      for (const reservationId of directReservationIds) {
        scopes.push(
          ["documents", `reservation_id=${q(reservationId)}::uuid`],
          ["payments", `reservation_id=${q(reservationId)}::uuid`],
          ["email_delivery_attempts", `reservation_id=${q(reservationId)}::uuid`],
          ["adopter_profile_questionnaire_instances", `reservation_id=${q(reservationId)}::uuid`],
          ["adopter_profile_questionnaire_events", `reservation_id=${q(reservationId)}::uuid`],
          ["adopter_profile_questionnaire_commands", `instance_id in(select id from public.adopter_profile_questionnaire_instances where reservation_id=${q(reservationId)}::uuid)`],
          ["adopter_profile_questionnaire_sessions", `instance_id in(select id from public.adopter_profile_questionnaire_instances where reservation_id=${q(reservationId)}::uuid)`],
          ["adopter_profile_questionnaire_accesses", `instance_id in(select id from public.adopter_profile_questionnaire_instances where reservation_id=${q(reservationId)}::uuid)`],
          ["adopter_profile_questionnaire_reconciliation_attempts", `reservation_id=${q(reservationId)}::uuid`],
          ["contact_roles", `contact_id=${q(directContactId)}::uuid and role='pre_reservation_holder'`],
        );
      }
      for (const [table, where] of scopes) {
        const ids = JSON.parse(sql(`select coalesce(json_agg(id), '[]'::json)::text from public.${table} where ${where}`)) as string[];
        for (const id of ids) if (!fixtures.has(table, id)) fixtures.register(table, id);
      }
    };

    try {
      sql(`
        insert into public.litter_groups(id,organization_id,name,species,status,created_by,updated_by)
        values(${q(groupId)}::uuid,${q(organizationId)}::uuid,'E2E Positionnement post-naissance','dog','born',${q(ownerId)}::uuid,${q(ownerId)}::uuid);
        insert into public.litters(id,organization_id,litter_group_id,name,species,breed,status,actual_birth_date,born_total_count,born_male_count,born_female_count,alive_count,created_by,updated_by)
        values(${q(litterId)}::uuid,${q(organizationId)}::uuid,${q(groupId)}::uuid,'E2E Portée née','dog','Golden Retriever','born',current_date,3,2,1,3,${q(ownerId)}::uuid,${q(ownerId)}::uuid);
        insert into public.contacts(id,organization_id,contact_type,first_name,last_name,display_name,email,origin_channel,primary_status,created_by,updated_by) values
        (${q(priorityContactId)}::uuid,${q(organizationId)}::uuid,'person','Famille','Prioritaire','Famille Prioritaire','priority@example.invalid','manual','active',${q(ownerId)}::uuid,${q(ownerId)}::uuid),
        (${q(directContactId)}::uuid,${q(organizationId)}::uuid,'person','Famille','Directe','Famille Directe','direct@example.invalid','manual','active',${q(ownerId)}::uuid,${q(ownerId)}::uuid);
        insert into public.applications(id,organization_id,contact_id,species,breed,desired_timing_mode,desired_litter_group_id,desired_litter_id,desired_sex_preference,desired_quantity,status,initial_rank,active_rank,submitted_at,rank_payment_accepted_at,rank_payment_late,created_by,updated_by) values
        (${q(priorityApplicationId)}::uuid,${q(organizationId)}::uuid,${q(priorityContactId)}::uuid,'dog','Golden Retriever','unknown',${q(groupId)}::uuid,null,'male_only',1,'qualified',1,1,now()-interval '10 day',now()-interval '2 day',false,${q(ownerId)}::uuid,${q(ownerId)}::uuid),
        (${q(directApplicationId)}::uuid,${q(organizationId)}::uuid,${q(directContactId)}::uuid,'dog','Golden Retriever','unknown',${q(groupId)}::uuid,${q(litterId)}::uuid,'male_only',1,'qualified',2,2,now()-interval '5 day',null,false,${q(ownerId)}::uuid,${q(ownerId)}::uuid);
        insert into public.reservations(id,organization_id,contact_id,application_id,litter_group_id,litter_id,status,reserved_sex_preference,rank_initial,rank_active,pre_reservation_deadline,created_by,updated_by)
        values(${q(priorityReservationId)}::uuid,${q(organizationId)}::uuid,${q(priorityContactId)}::uuid,${q(priorityApplicationId)}::uuid,${q(groupId)}::uuid,null,'pre_reservation_paid','male_only',1,1,now()+interval '1 day',${q(ownerId)}::uuid,${q(ownerId)}::uuid);
        insert into public.animals(id,organization_id,litter_id,species,breed,call_name,sex,status,ownership_status,is_breeder,is_external,is_retired,birth_date,birth_order,created_by,updated_by)
        values(${q(animalId)}::uuid,${q(organizationId)}::uuid,${q(litterId)}::uuid,'dog','Golden Retriever','Chiot restant E2E','male','available','produced',false,false,false,current_date,1,${q(ownerId)}::uuid,${q(ownerId)}::uuid);
      `);

      const owner = await createAuthenticatedSupabaseClient();
      const rpc = owner.rpc.bind(owner) as unknown as Rpc;
      const capacityCommand = randomUUID();
      const capacity = row(await rpc("publish_post_birth_capacity", { p_litter_id: litterId, p_expected_version: 0, p_male_preserved: 0, p_female_preserved: 0, p_male_uncertain: 0, p_female_uncertain: 0, p_reason: "Capacité réelle après naissance", p_client_command_id: capacityCommand }), "publish capacity");
      expect(capacity).toMatchObject({ outcome: "updated", version: 1 });
      expect(row(await rpc("publish_post_birth_capacity", { p_litter_id: litterId, p_expected_version: 0, p_male_preserved: 0, p_female_preserved: 0, p_male_uncertain: 0, p_female_uncertain: 0, p_reason: "Capacité réelle après naissance", p_client_command_id: capacityCommand }), "retry capacity").outcome).toBe("already_applied");

      const draft = row(await rpc("open_post_birth_positioning_draft", { p_litter_group_id: groupId, p_exception_reason: "Mise bas vérifiée sans journal clôturé", p_client_command_id: randomUUID() }), "open draft");
      const wave = row(await rpc("open_post_birth_wave", { p_draft_id: draft.draft_id, p_litter_id: litterId, p_wave_kind: "ordinary", p_expected_draft_version: draft.version, p_client_command_id: randomUUID() }), "open wave");
      const firstProposal = row(await rpc("upsert_post_birth_proposal", { p_wave_id: wave.wave_id, p_reservation_id: priorityReservationId, p_proposed_sex: "male", p_proposed_outcome: "place", p_blocker_code: null, p_expected_wave_version: wave.version, p_client_command_id: randomUUID() }), "proposal");
      sql(`update public.reservations set price_cents=250000 where id=${q(priorityReservationId)}::uuid`);
      const refreshed = row(await rpc("refresh_post_birth_positioning_lines", { p_wave_id: wave.wave_id, p_expected_wave_version: firstProposal.version, p_client_command_id: randomUUID() }), "refresh stale lines");
      expect(refreshed.stale_line_ids).toHaveLength(1);
      const secondProposal = row(await rpc("upsert_post_birth_proposal", { p_wave_id: wave.wave_id, p_reservation_id: priorityReservationId, p_proposed_sex: "male", p_proposed_outcome: "place", p_blocker_code: null, p_expected_wave_version: refreshed.version, p_client_command_id: randomUUID() }), "refresh proposal");
      const confirmed = row(await rpc("confirm_post_birth_places", { p_wave_id: wave.wave_id, p_line_ids: [secondProposal.line_id], p_expected_wave_version: secondProposal.version, p_client_command_id: randomUUID() }), "confirm place");
      expect(confirmed).toMatchObject({ outcome: "updated" });
      expect(sql(`select litter_id::text||'|'||status from public.reservations where id=${q(priorityReservationId)}::uuid`)).toBe(`${litterId}|confirmed_after_birth`);
      const completed = row(await rpc("complete_post_birth_wave", { p_wave_id: wave.wave_id, p_expected_version: confirmed.version, p_client_command_id: randomUUID() }), "complete wave");
      expect(completed.outcome).toBe("updated");

      const reduced = row(await rpc("publish_post_birth_capacity", { p_litter_id: litterId, p_expected_version: 1, p_male_preserved: 2, p_female_preserved: 0, p_male_uncertain: 0, p_female_uncertain: 0, p_reason: "Réduction humaine après incident constaté", p_client_command_id: randomUUID() }), "reduce capacity");
      expect(reduced.incident_id).toBeTruthy();
      expect(row(await rpc("resolve_post_birth_incident", { p_incident_id: reduced.incident_id, p_resolution: "Décision humaine documentée avant reprise du corridor.", p_client_command_id: randomUUID() }), "resolve incident").outcome).toBe("updated");

      const sale = row(await rpc("create_direct_late_sale", { p_application_id: directApplicationId, p_litter_id: litterId, p_animal_id: animalId, p_hold_deadline: new Date(Date.now() + 172_800_000).toISOString(), p_required_amount_cents: 150000, p_email_subject: "Votre réservation directe", p_email_body_preview: "Voici le dossier individuel complet pour la réservation du chiot restant.", p_client_command_id: randomUUID() }), "create direct sale");
      expect(sale.outcome).toBe("created");
      let emailVersion = 1;
      for (const [action, messageId] of [["preview", null], ["review", null], ["sending", null], ["sent", "e2e-brevo-message"]] as const) {
        const transition = row(await rpc("transition_direct_late_sale_email", { p_direct_sale_id: sale.direct_sale_id, p_action: action, p_expected_version: emailVersion, p_brevo_message_id: messageId, p_client_command_id: randomUUID() }), `email ${action}`);
        emailVersion = Number(transition.version);
      }
      const contract = row(await rpc("record_direct_late_sale_document_received", { p_direct_sale_id: sale.direct_sale_id, p_document_id: sale.contract_document_id, p_signed_at: new Date().toISOString(), p_expected_version: sale.version, p_client_command_id: randomUUID() }), "contract received");
      expect(row(await rpc("record_direct_late_sale_document_received", { p_direct_sale_id: sale.direct_sale_id, p_document_id: sale.contract_document_id, p_signed_at: new Date().toISOString(), p_expected_version: contract.version, p_client_command_id: randomUUID() }), "duplicate contract")).toMatchObject({ outcome: "not_eligible", reason: "document_already_signed" });
      const paymentCommand = randomUUID();
      const payment = row(await rpc("record_direct_late_sale_full_payment", { p_direct_sale_id: sale.direct_sale_id, p_paid_at: new Date().toISOString(), p_payment_method: "bank_transfer", p_external_reference: "E2E-FULL", p_expected_version: contract.version, p_client_command_id: paymentCommand }), "full payment");
      expect(row(await rpc("record_direct_late_sale_full_payment", { p_direct_sale_id: sale.direct_sale_id, p_paid_at: new Date().toISOString(), p_payment_method: "bank_transfer", p_external_reference: "E2E-FULL", p_expected_version: contract.version, p_client_command_id: paymentCommand }), "retry full payment").outcome).toBe("already_applied");
      expect(row(await rpc("record_direct_late_sale_full_payment", { p_direct_sale_id: sale.direct_sale_id, p_paid_at: new Date().toISOString(), p_payment_method: "cash", p_external_reference: "E2E-OVERWRITE", p_expected_version: payment.version, p_client_command_id: randomUUID() }), "duplicate full payment")).toMatchObject({ outcome: "not_eligible", reason: "payment_already_recorded" });
      const certificate = row(await rpc("record_direct_late_sale_document_received", { p_direct_sale_id: sale.direct_sale_id, p_document_id: sale.certificate_document_id, p_signed_at: new Date().toISOString(), p_expected_version: payment.version, p_client_command_id: randomUUID() }), "certificate received");
      expect(certificate.ready_to_assign).toBe(true);
      const finalizeCommand = randomUUID();
      const finalized = row(await rpc("finalize_direct_late_sale_assignment", { p_direct_sale_id: sale.direct_sale_id, p_expected_version: certificate.version, p_client_command_id: finalizeCommand }), "finalize sale");
      expect(finalized).toMatchObject({ outcome: "updated", animal_id: animalId });
      expect(row(await rpc("finalize_direct_late_sale_assignment", { p_direct_sale_id: sale.direct_sale_id, p_expected_version: certificate.version, p_client_command_id: finalizeCommand }), "retry finalize").outcome).toBe("already_applied");

      const directReservationId = String(finalized.reservation_id);
      generatedReservationIds.push(directReservationId);
      expect(sql(`select count(*)::text from public.adopter_profile_questionnaire_instances where reservation_id=${q(directReservationId)}::uuid`)).toBe("1");
      sql(`update public.adopter_profile_questionnaire_instances set final_answers='{"private":"strictly hidden"}'::jsonb, final_submitted_at=now() where reservation_id=${q(directReservationId)}::uuid`);
      const member = createAnonymousSupabaseClient();
      const memberLogin = await member.auth.signInWithPassword({ email: E2E_MEMBER_EMAIL, password: E2E_MEMBER_PASSWORD });
      expect(memberLogin.error).toBeNull();
      const memberRpc = member.rpc.bind(member) as unknown as Rpc;
      const limited = row(await memberRpc("read_post_birth_positioning_snapshot", { p_litter_group_id: groupId }), "member projection");
      expect(limited).toMatchObject({ canMutate: false, drafts: [], candidates: [], incidents: [] });
      const privateAnswers = await (member as unknown as { from: (table: string) => { select: (columns: string) => { eq: (column: string, value: string) => Promise<{ data: unknown[] | null; error: unknown }> } } }).from("adopter_profile_questionnaire_instances").select("final_answers").eq("reservation_id", directReservationId);
      expect(privateAnswers.error).toBeNull();
      expect(privateAnswers.data).toEqual([]);

      await login(page);
      await page.goto(`/litter-groups/${groupId}/positioning`);
      await expect(page.getByRole("heading", { name: "Positionnement après naissance" })).toBeVisible();
      await expect(page.getByRole("cell", { name: "Famille Prioritaire", exact: true })).toBeVisible();
      await expect(page.getByText("Famille Directe · Chiot restant E2E", { exact: true })).toBeVisible();

      const captureDir = "/tmp/post-birth-positioning-captures";
      mkdirSync(captureDir, { recursive: true });
      for (const target of [
        { name: "desktop", viewport: { width: 1440, height: 1100 } },
        { name: "mobile", viewport: { width: 390, height: 844 } },
      ]) {
        const context = await browser.newContext({ viewport: target.viewport, deviceScaleFactor: 2 });
        const capturePage = await context.newPage();
        await login(capturePage);
        await capturePage.goto(`/litter-groups/${groupId}/positioning`);
        await capturePage.getByTestId("post-birth-workbench").screenshot({
          path: `${captureDir}/post-birth-positioning-${target.name}@2x.png`,
        });
        await context.close();
      }
      console.info("POST_BIRTH_E2E_FIXTURE_IDS", JSON.stringify({
        groupId, litterId, animalId, priorityContactId, priorityApplicationId,
        priorityReservationId, directContactId, directApplicationId, generatedReservationIds,
      }));
    } finally {
      registerGeneratedEffects();
    }
  });
});
