import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

import { withE2eFixtures } from "./helpers/fixtures/fixture-registry";
import {
  createAnonymousSupabaseClient,
  E2E_OWNER_EMAIL,
  E2E_OWNER_PASSWORD,
  E2E_MEMBER_EMAIL,
  E2E_MEMBER_PASSWORD,
  createAuthenticatedSupabaseClient,
  runE2eSqlSync,
} from "./helpers/supabase";

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const sql = (statement: string) => runE2eSqlSync(statement);
const q = (value: string) => `'${value.replaceAll("'", "''")}'`;
type RpcRow = Record<string, unknown>;
type Rpc = (name: string, args: Record<string, unknown>) => Promise<{ data: RpcRow[] | RpcRow | null; error: { message: string } | null }>;

function row(result: Awaited<ReturnType<Rpc>>, label: string) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  const value = Array.isArray(result.data) ? result.data[0] : result.data;
  if (!value) throw new Error(`${label}: missing row`);
  return value;
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_OWNER_EMAIL);
  await page.getByLabel("Mot de passe").fill(E2E_OWNER_PASSWORD);
  await page.getByRole("button", { name: /connexion|se connecter/i }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });
}

test("the adopter workbench reorders, moves and audits post-birth proposals", async ({ page }) => {
  await withE2eFixtures(sql, async (fixtures) => {
    const groupId = fixtures.register("litter_groups", randomUUID());
    const litterA = fixtures.register("litters", randomUUID());
    const litterB = fixtures.register("litters", randomUUID());
    const contacts = Array.from({ length: 4 }, () => fixtures.register("contacts", randomUUID()));
    const applications = Array.from({ length: 4 }, () => fixtures.register("applications", randomUUID()));
    const reservations = Array.from({ length: 4 }, () => fixtures.register("reservations", randomUUID()));
    const payments = Array.from({ length: 4 }, () => fixtures.register("payments", randomUUID()));
    const openingEvents = Array.from({ length: 4 }, () => fixtures.register("candidate_journey_events", randomUUID()));

    const registerGenerated = () => {
      const scopes: Array<[Parameters<typeof fixtures.register>[0], string]> = [
        ["post_birth_capacity_states", `litter_id in(${q(litterA)}::uuid,${q(litterB)}::uuid)`],
        ["post_birth_capacity_revisions", `litter_id in(${q(litterA)}::uuid,${q(litterB)}::uuid)`],
        ["post_birth_positioning_drafts", `litter_group_id=${q(groupId)}::uuid`],
        ["post_birth_positioning_waves", `litter_id in(${q(litterA)}::uuid,${q(litterB)}::uuid)`],
        ["post_birth_positioning_lines", `reservation_id in(${reservations.map((id) => `${q(id)}::uuid`).join(",")})`],
        ["post_birth_positioning_events", `reservation_id in(${reservations.map((id) => `${q(id)}::uuid`).join(",")}) or litter_id in(${q(litterA)}::uuid,${q(litterB)}::uuid)`],
        ["post_birth_positioning_commands", `organization_id=${q(organizationId)}::uuid and target_id in(select id from public.post_birth_positioning_lines where reservation_id in(${reservations.map((id) => `${q(id)}::uuid`).join(",")}) union select id from public.post_birth_positioning_waves where litter_id in(${q(litterA)}::uuid,${q(litterB)}::uuid) union select id from public.post_birth_positioning_drafts where litter_group_id=${q(groupId)}::uuid union select id from public.post_birth_capacity_states where litter_id in(${q(litterA)}::uuid,${q(litterB)}::uuid))`],
        ["email_delivery_attempts", `reservation_id in(${reservations.map((id) => `${q(id)}::uuid`).join(",")})`],
        ["adopter_profile_questionnaire_instances", `reservation_id in(${reservations.map((id) => `${q(id)}::uuid`).join(",")})`],
        ["adopter_profile_questionnaire_events", `reservation_id in(${reservations.map((id) => `${q(id)}::uuid`).join(",")})`],
        ["adopter_profile_questionnaire_commands", `instance_id in(select id from public.adopter_profile_questionnaire_instances where reservation_id in(${reservations.map((id) => `${q(id)}::uuid`).join(",")}))`],
        ["adopter_profile_questionnaire_sessions", `instance_id in(select id from public.adopter_profile_questionnaire_instances where reservation_id in(${reservations.map((id) => `${q(id)}::uuid`).join(",")}))`],
        ["adopter_profile_questionnaire_accesses", `instance_id in(select id from public.adopter_profile_questionnaire_instances where reservation_id in(${reservations.map((id) => `${q(id)}::uuid`).join(",")}))`],
        ["adopter_profile_questionnaire_reconciliation_attempts", `reservation_id in(${reservations.map((id) => `${q(id)}::uuid`).join(",")})`],
      ];
      for (const [table, where] of scopes) {
        const ids = JSON.parse(sql(`select coalesce(json_agg(id),'[]'::json)::text from public.${table} where ${where}`)) as string[];
        for (const id of ids) if (!fixtures.has(table, id)) fixtures.register(table, id);
      }
    };

    try {
      sql(`
        insert into public.litter_groups(id,organization_id,name,species,status,created_by,updated_by) values(${q(groupId)}::uuid,${q(organizationId)}::uuid,'E2E Poste positionnement','dog','born',${q(ownerId)}::uuid,${q(ownerId)}::uuid);
        insert into public.litters(id,organization_id,litter_group_id,name,species,breed,status,actual_birth_date,born_total_count,born_male_count,born_female_count,alive_count,created_by,updated_by) values
        (${q(litterA)}::uuid,${q(organizationId)}::uuid,${q(groupId)}::uuid,'Alba E2E','dog','Golden Retriever','born',current_date,4,2,2,4,${q(ownerId)}::uuid,${q(ownerId)}::uuid),
        (${q(litterB)}::uuid,${q(organizationId)}::uuid,${q(groupId)}::uuid,'Naya E2E','dog','Golden Retriever','born',current_date,3,2,1,3,${q(ownerId)}::uuid,${q(ownerId)}::uuid);
        ${contacts.map((id, index) => `insert into public.contacts(id,organization_id,contact_type,first_name,last_name,display_name,email,origin_channel,primary_status,created_by,updated_by) values(${q(id)}::uuid,${q(organizationId)}::uuid,'person','Famille','Position ${index + 1}','Famille Position ${index + 1}','position-${index + 1}@example.invalid','manual','active',${q(ownerId)}::uuid,${q(ownerId)}::uuid);`).join("\n")}
        ${applications.map((id, index) => `insert into public.applications(id,organization_id,contact_id,species,breed,desired_timing_mode,desired_litter_group_id,desired_sex_preference,desired_quantity,status,initial_rank,active_rank,submitted_at,rank_payment_accepted_at,rank_payment_late,created_by,updated_by) values(${q(id)}::uuid,${q(organizationId)}::uuid,${q(contacts[index]!)}::uuid,'dog','Golden Retriever','unknown',${q(groupId)}::uuid,${q(index === 0 ? "female_only" : index === 3 ? "male_only" : "no_preference")},1,'qualified',${index + 1},${index + 1},now()-interval '10 day',now()-interval '2 day',false,${q(ownerId)}::uuid,${q(ownerId)}::uuid);`).join("\n")}
        ${reservations.map((id, index) => `insert into public.reservations(id,organization_id,contact_id,application_id,litter_group_id,status,reserved_sex_preference,rank_initial,rank_active,created_by,updated_by) values(${q(id)}::uuid,${q(organizationId)}::uuid,${q(contacts[index]!)}::uuid,${q(applications[index]!)}::uuid,${q(groupId)}::uuid,'pre_reservation_paid',${q(index === 0 ? "female_only" : index === 3 ? "male_only" : "no_preference")},${index + 1},${index + 1},${q(ownerId)}::uuid,${q(ownerId)}::uuid);`).join("\n")}
        ${payments.map((id, index) => `insert into public.payments(id,organization_id,contact_id,reservation_id,amount_cents,payment_type,status,paid_at,payment_method,created_by,updated_by) values(${q(id)}::uuid,${q(organizationId)}::uuid,${q(contacts[index]!)}::uuid,${q(reservations[index]!)}::uuid,25000,'pre_reservation_deposit_refundable','paid',now(),'bank_transfer',${q(ownerId)}::uuid,${q(ownerId)}::uuid);`).join("\n")}
        ${openingEvents.map((id, index) => `insert into public.candidate_journey_events(id,organization_id,application_id,contact_id,reservation_id,payment_id,event_type,actor_profile_id,actor_role,previous_state,current_state,details,client_command_id,occurred_at) values(${q(id)}::uuid,${q(organizationId)}::uuid,${q(applications[index]!)}::uuid,${q(contacts[index]!)}::uuid,${q(reservations[index]!)}::uuid,${q(payments[index]!)}::uuid,'candidate_first_payment_accepted',${q(ownerId)}::uuid,'owner','{}'::jsonb,'{}'::jsonb,'{}'::jsonb,gen_random_uuid(),now());`).join("\n")}
      `);

      const owner = await createAuthenticatedSupabaseClient();
      const rpc = owner.rpc.bind(owner) as unknown as Rpc;
      await rpc("publish_post_birth_capacity", { p_litter_id: litterA, p_expected_version: 0, p_male_preserved: 0, p_female_preserved: 0, p_male_uncertain: 0, p_female_uncertain: 0, p_reason: "Capacité Alba publiée", p_client_command_id: randomUUID() });
      await rpc("publish_post_birth_capacity", { p_litter_id: litterB, p_expected_version: 0, p_male_preserved: 0, p_female_preserved: 1, p_male_uncertain: 0, p_female_uncertain: 0, p_reason: "Capacité Naya publiée", p_client_command_id: randomUUID() });
      const draft = row(await rpc("open_post_birth_positioning_draft", { p_litter_group_id: groupId, p_exception_reason: "Mises bas vérifiées pour le test", p_client_command_id: randomUUID() }), "open draft");
      const waveA = row(await rpc("open_post_birth_wave", { p_draft_id: draft.draft_id, p_litter_id: litterA, p_wave_kind: "ordinary", p_expected_draft_version: 1, p_client_command_id: randomUUID() }), "wave A");
      const draftVersion = Number(sql(`select version::text from public.post_birth_positioning_drafts where id=${q(String(draft.draft_id))}::uuid`));
      const waveB = row(await rpc("open_post_birth_wave", { p_draft_id: draft.draft_id, p_litter_id: litterB, p_wave_kind: "ordinary", p_expected_draft_version: draftVersion, p_client_command_id: randomUUID() }), "wave B");
      let versionA = Number(waveA.version);
      let versionB = Number(waveB.version);
      const lineIds: string[] = [];
      for (let index = 0; index < 3; index += 1) {
        const proposal = row(await rpc("upsert_post_birth_proposal", { p_wave_id: waveA.wave_id, p_reservation_id: reservations[index], p_proposed_sex: "female", p_proposed_outcome: "place", p_blocker_code: null, p_expected_wave_version: versionA, p_client_command_id: randomUUID() }), `proposal A${index}`);
        versionA = Number(proposal.version); lineIds.push(String(proposal.line_id));
      }
      const proposalB = row(await rpc("upsert_post_birth_proposal", { p_wave_id: waveB.wave_id, p_reservation_id: reservations[3], p_proposed_sex: "male", p_proposed_outcome: "place", p_blocker_code: null, p_expected_wave_version: versionB, p_client_command_id: randomUUID() }), "proposal B");
      versionB = Number(proposalB.version); lineIds.push(String(proposalB.line_id));

      const unauthorized = createAnonymousSupabaseClient() as unknown as { rpc: (name: string, args: Record<string, unknown>) => Promise<{ error: unknown }> };
      const anonymousAttempt = await unauthorized.rpc("override_post_birth_active_order", { p_line_id: lineIds[2], p_target_order: 1, p_reason: "Tentative non autorisée", p_expected_wave_version: versionA, p_client_command_id: randomUUID() });
      expect(anonymousAttempt.error).toBeTruthy();
      const memberClient = createAnonymousSupabaseClient();
      const memberLogin = await memberClient.auth.signInWithPassword({ email: E2E_MEMBER_EMAIL, password: E2E_MEMBER_PASSWORD });
      expect(memberLogin.error).toBeNull();
      const memberAttempt = await (memberClient as unknown as { rpc: (name: string, args: Record<string, unknown>) => Promise<{ error: unknown }> }).rpc("override_post_birth_active_order", { p_line_id: lineIds[2], p_target_order: 1, p_reason: "Tentative non autorisée", p_expected_wave_version: versionA, p_client_command_id: randomUUID() });
      expect(memberAttempt.error).toBeTruthy();

      const missingReason = row(await rpc("override_post_birth_active_order", { p_line_id: lineIds[2], p_target_order: 1, p_reason: "", p_expected_wave_version: versionA, p_client_command_id: randomUUID() }), "missing reason");
      expect(missingReason).toMatchObject({ outcome: "not_eligible", reason: "reason_required" });
      const firstOverride = row(await rpc("override_post_birth_active_order", { p_line_id: lineIds[2], p_target_order: 1, p_reason: "Priorité familiale confirmée", p_expected_wave_version: versionA, p_client_command_id: randomUUID() }), "first override");
      versionA = Number(firstOverride.version);
      const secondOverride = row(await rpc("override_post_birth_active_order", { p_line_id: lineIds[2], p_target_order: 2, p_reason: "Second ajustement documenté", p_expected_wave_version: versionA, p_client_command_id: randomUUID() }), "second override");
      versionA = Number(secondOverride.version);
      expect(sql(`select rank_snapshot::text||'|'||active_order::text||'|'||has_order_override::text from public.post_birth_positioning_lines where id=${q(lineIds[2]!)}::uuid`)).toBe("3|2|true");
      expect(sql(`select count(*)::text from public.post_birth_positioning_events where reservation_id=${q(reservations[2]!)}::uuid and event_type='post_birth_active_order_overridden'`)).toBe("2");

      const moved = row(await rpc("move_post_birth_proposal", { p_line_id: lineIds[1], p_destination_litter_id: litterB, p_destination_sex: "male", p_reason: null, p_manual_contact_id: null, p_expected_wave_version: versionA, p_client_command_id: randomUUID() }), "compatible move");
      versionA = Number(sql(`select version::text from public.post_birth_positioning_waves where id=${q(String(waveA.wave_id))}::uuid`));
      versionB = Number(moved.version);
      expect(sql(`select rank_snapshot::text||'|'||active_order::text||'|'||has_order_override::text from public.post_birth_positioning_lines where id=${q(lineIds[1]!)}::uuid`)).toBe("2|1|false");

      const rejected = row(await rpc("move_post_birth_proposal", { p_line_id: lineIds[0], p_destination_litter_id: litterB, p_destination_sex: "male", p_reason: null, p_manual_contact_id: null, p_expected_wave_version: versionA, p_client_command_id: randomUUID() }), "incompatible rejected");
      expect(rejected).toMatchObject({ outcome: "not_eligible", reason: "reason_required" });
      expect(sql(`select wave_id::text from public.post_birth_positioning_lines where id=${q(lineIds[0]!)}::uuid`)).toBe(String(waveA.wave_id));

      const updatedAt = sql(`select updated_at::text from public.reservations where id=${q(reservations[0]!)}::uuid`);
      const contact = row(await rpc("record_adopter_manual_contact", { p_reservation_id: reservations[0], p_expected_reservation_updated_at: updatedAt, p_channel: "phone", p_summary: "Accord familial explicite pour un mâle", p_contacted_at: new Date().toISOString(), p_client_command_id: randomUUID() }), "manual contact");
      fixtures.register("adopter_manual_contacts", String(contact.manual_contact_id));
      const incompatible = row(await rpc("move_post_birth_proposal", { p_line_id: lineIds[0], p_destination_litter_id: litterB, p_destination_sex: "male", p_reason: "Accord familial malgré la préférence", p_manual_contact_id: contact.manual_contact_id, p_expected_wave_version: versionA, p_client_command_id: randomUUID() }), "incompatible move");
      versionB = Number(incompatible.version);
      expect(sql(`select preference_exception_active::text||'|'||active_order::text from public.post_birth_positioning_lines where id=${q(lineIds[0]!)}::uuid`)).toBe("true|1");
      expect(sql(`select count(*)::text from public.post_birth_positioning_events where reservation_id=${q(reservations[0]!)}::uuid and event_type='post_birth_preference_exception_recorded' and reason is not null and details->>'manualContactId'=${q(String(contact.manual_contact_id))}`)).toBe("1");
      expect(sql(`select count(*)::text from public.reservations where id=any(array[${reservations.map((id) => `${q(id)}::uuid`).join(",")}]) and status<>'pre_reservation_paid'`)).toBe("0");
      expect(row(await rpc("complete_post_birth_wave", { p_wave_id: waveB.wave_id, p_expected_version: versionB, p_client_command_id: randomUUID() }), "overflow completion")).toMatchObject({ outcome: "not_eligible", reason: "capacity_overflow" });

      await login(page);
      await page.goto("/reservations");
      await expect(page.getByRole("columnheader", { name: "Priorité" }).first()).toBeVisible();
      const overrideRow = page.getByTestId(`positioning-row-${reservations[2]}`);
      await expect(overrideRow.getByText("Dérogation", { exact: true })).toHaveCount(1);
      await expect(overrideRow.getByText("Prête", { exact: true })).toBeVisible();
      await expect(overrideRow.getByLabel(/Proposition/)).toHaveClass(/rose/);
      const incompatibleRow = page.getByTestId(`positioning-row-${reservations[0]}`);
      const overflowRow = page.getByTestId(`positioning-row-${reservations[3]}`);
      await expect(overflowRow.getByText("Dépassement provisoire", { exact: true })).toBeVisible();
      await expect(page.getByRole("region", { name: "Capacités publiées" }).getByText("Dépassement de 1")).toBeVisible();
      await expect(incompatibleRow.getByText("Préférence incompatible", { exact: true })).toBeVisible();
      await expect(incompatibleRow.getByLabel(/Proposition/)).toHaveClass(/sky/);
      expect(await page.locator("main").evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
      if (process.env.E2E_CAPTURE_VISUAL === "1") await page.locator("main").screenshot({ path: "/tmp/hermes-positioning-workbench@2x.png", animations: "disabled" });
      await incompatibleRow.getByLabel(/Proposition/).selectOption(`${litterA}:male`);
      const exceptionEditor = page.getByTestId("preference-exception-editor");
      await expect(exceptionEditor).toBeVisible();
      if (process.env.E2E_CAPTURE_VISUAL === "1") await exceptionEditor.screenshot({ path: "/tmp/hermes-positioning-exception@2x.png", animations: "disabled" });
      await exceptionEditor.getByRole("button", { name: "Annuler" }).click();
      await expect(page.getByTestId("preference-exception-editor")).toHaveCount(0);
      await incompatibleRow.focus();
      await incompatibleRow.press("Enter");
      await expect(page.getByRole("heading", { name: "Famille Position 1", exact: true })).toBeVisible();
      await expect(incompatibleRow).toHaveAttribute("aria-selected", "true");

      await page.keyboard.press("Escape");
      await page.setViewportSize({ width: 1800, height: 1000 });
      await page.reload();
      const uiMutationRow = page.getByTestId(`positioning-row-${reservations[3]}`);
      await uiMutationRow.focus();
      await uiMutationRow.press("Enter");
      await uiMutationRow.getByLabel(/Ordre actif/).selectOption("1");
      const orderEditor = page.getByTestId("active-order-editor");
      await orderEditor.getByLabel("Motif obligatoire").fill("Besoin familial documenté par l’éleveur");
      await orderEditor.getByRole("button", { name: "Appliquer" }).click();
      await expect.poll(() => sql(`select active_order::text from public.post_birth_positioning_lines where id=${q(lineIds[3]!)}::uuid`)).toBe("1");
      await expect(uiMutationRow.getByLabel(/Ordre actif/)).toHaveValue("1");
      await expect(uiMutationRow.getByText("Dérogation", { exact: true })).toHaveCount(1);
      await expect(page.getByRole("heading", { name: "Famille Position 4", exact: true })).toBeVisible();
      await expect(uiMutationRow).toHaveAttribute("aria-selected", "true");

      console.info("POSITIONING_WORKBENCH_E2E_FIXTURE_IDS", JSON.stringify({ groupId, litterA, litterB, contacts, applications, reservations, payments, openingEvents, lineIds, manualContactId: contact.manual_contact_id }));
    } finally {
      registerGenerated();
    }
  });
});
