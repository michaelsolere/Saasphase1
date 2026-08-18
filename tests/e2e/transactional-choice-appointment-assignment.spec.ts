import { createHash, randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  createTestAdopterAnimalAssignmentScenario,
  createTestAssignableProducedAnimal,
} from "./helpers/fixtures/adopter-animal-assignment-fixtures";
import { withE2eFixtures } from "./helpers/fixtures/fixture-registry";
import {
  E2E_MEMBER_EMAIL,
  E2E_MEMBER_PASSWORD,
  E2E_OWNER_EMAIL,
  E2E_OWNER_PASSWORD,
  createAnonymousSupabaseClient,
  createAuthenticatedSupabaseClient,
  expectSupabaseData,
  runE2eSqlSync,
} from "./helpers/supabase";

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const sql = (statement: string) => runE2eSqlSync(statement);
const q = (value: string) => `'${value.replaceAll("'", "''")}'`;

test.use({ deviceScaleFactor: 2 });

test("creates an eligible plan and assigns one puppy atomically through owner-admin RPCs", async ({ page }) => {
  test.setTimeout(120_000);
  await withE2eFixtures(sql, async (fixtures) => {
    const supabase = await createAuthenticatedSupabaseClient();
    const scenario = await createTestAdopterAnimalAssignmentScenario(sql, fixtures, {
      organizationId,
      ownerId,
      journeyStatus: "active",
      displayName: `E2E choix atomique ${fixtures.namespace.slice(-8)}`,
      animalCallName: `E2E choix A ${fixtures.namespace.slice(-8)}`,
    });
    const secondAnimal = await createTestAssignableProducedAnimal(sql, fixtures, {
      organizationId,
      ownerId,
      litterId: scenario.litterId,
      callName: `E2E choix B ${fixtures.namespace.slice(-8)}`,
    });
    const capacityId = randomUUID();
    const draftId = randomUUID();
    const waveId = randomUUID();
    const lineId = randomUUID();
    const positionId = randomUUID();
    const decisionId = randomUUID();
    const documentIds = [randomUUID(), randomUUID()];
    const paymentId = randomUUID();

    await sql(`
      insert into public.post_birth_capacity_states(id,organization_id,litter_id,male_total,female_total,male_preserved,female_preserved,male_uncertain,female_uncertain,updated_by)
      values(${q(capacityId)},${q(organizationId)},${q(scenario.litterId)},0,2,0,0,0,0,${q(ownerId)});
      insert into public.post_birth_positioning_drafts(id,organization_id,litter_group_id,status,opened_by)
      values(${q(draftId)},${q(organizationId)},${q(scenario.groupId)},'completed',${q(ownerId)});
      insert into public.post_birth_positioning_waves(id,organization_id,draft_id,litter_id,status,sequence_no,created_by)
      values(${q(waveId)},${q(organizationId)},${q(draftId)},${q(scenario.litterId)},'completed',1,${q(ownerId)});
      insert into public.post_birth_positioning_lines(id,organization_id,wave_id,reservation_id,proposed_sex,proposed_outcome,rank_snapshot,reservation_updated_at_snapshot,capacity_version_snapshot,updated_by)
      select ${q(lineId)},${q(organizationId)},${q(waveId)},id,'female','place',1,updated_at,1,${q(ownerId)} from public.reservations where id=${q(scenario.journey.id)};
      insert into public.post_birth_positions(id,organization_id,reservation_id,litter_id,sex,status,historical_rank)
      values(${q(positionId)},${q(organizationId)},${q(scenario.journey.id)},${q(scenario.litterId)},'female','confirmed',1);
      insert into public.post_birth_position_decisions(id,organization_id,position_id,reservation_id,litter_id,wave_id,decision_type,sex,historical_rank,actor_profile_id,actor_role,client_command_id)
      values(${q(decisionId)},${q(organizationId)},${q(positionId)},${q(scenario.journey.id)},${q(scenario.litterId)},${q(waveId)},'confirmed','female',1,${q(ownerId)},'owner',${q(randomUUID())});
      update public.post_birth_positions set current_decision_id=${q(decisionId)} where id=${q(positionId)};
      insert into public.documents(id,organization_id,contact_id,reservation_id,litter_id,document_type,status,title,signature_required,sent_at,signed_at,created_by,updated_by)
      values
      (${q(documentIds[0]!)},${q(organizationId)},${q(scenario.contact.id)},${q(scenario.journey.id)},${q(scenario.litterId)},'commitment_certificate','signed','E2E CEC choix',true,now(),now(),${q(ownerId)},${q(ownerId)}),
      (${q(documentIds[1]!)},${q(organizationId)},${q(scenario.contact.id)},${q(scenario.journey.id)},${q(scenario.litterId)},'reservation_contract','signed','E2E contrat choix',true,now(),now(),${q(ownerId)},${q(ownerId)});
      insert into public.payments(id,organization_id,contact_id,reservation_id,amount_cents,payment_type,status,payment_method,paid_at,created_by,updated_by)
      values(${q(paymentId)},${q(organizationId)},${q(scenario.contact.id)},${q(scenario.journey.id)},50000,'arrhes','paid','bank_transfer',now(),${q(ownerId)},${q(ownerId)});
    `);
    fixtures.register("post_birth_capacity_states", capacityId);
    fixtures.register("post_birth_positioning_drafts", draftId);
    fixtures.register("post_birth_positioning_waves", waveId);
    fixtures.register("post_birth_positioning_lines", lineId);
    fixtures.register("post_birth_positions", positionId);
    fixtures.register("post_birth_position_decisions", decisionId);
    documentIds.forEach((id) => fixtures.register("documents", id));
    fixtures.register("payments", paymentId);

    const startsAt = "2026-09-10T08:00:00.000Z";
    const planCommand = randomUUID();
    const planResult = await (supabase as unknown as { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: Array<{ outcome: string; plan_id: string }> | null; error: unknown }> }).rpc("create_choice_appointment_plan", {
      p_litter_id: scenario.litterId,
      p_starts_at: startsAt,
      p_duration_minutes: 45,
      p_slots: [{ reservationId: scenario.journey.id, sex: "female", activeOrder: 1, historicalRank: 1, sequence: 1, plannedAt: startsAt }],
      p_client_command_id: planCommand,
    });
    expect(planResult.error).toBeNull();
    expect(planResult.data?.[0]?.outcome).toBe("created");
    const planId = planResult.data![0]!.plan_id;
    fixtures.register("choice_appointment_plans", planId);
    const planEffects = JSON.parse(sql(`select json_build_object('slot',slot.id,'event',event.id,'command',command.id)::text from public.choice_appointment_slots slot join public.choice_appointment_events event on event.plan_id=slot.plan_id join public.choice_appointment_commands command on command.target_id=slot.plan_id where slot.plan_id=${q(planId)} limit 1`)) as { slot: string; event: string; command: string };
    fixtures.register("choice_appointment_slots", planEffects.slot);
    fixtures.register("choice_appointment_events", planEffects.event);
    fixtures.register("choice_appointment_commands", planEffects.command);

    const validateCommand = randomUUID();
    const validated = await (supabase as unknown as { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: Array<{ outcome: string }> | null; error: unknown }> }).rpc("validate_choice_appointment_plan", {
      p_plan_id: planId,
      p_expected_version: 1,
      p_client_command_id: validateCommand,
    });
    expect(validated.error).toBeNull();
    expect(validated.data?.[0]?.outcome).toBe("validated");
    const validationEffects = JSON.parse(sql(`select json_build_object('event',event.id,'command',command.id)::text from public.choice_appointment_events event join public.choice_appointment_commands command on command.client_command_id=event.client_command_id where event.client_command_id=${q(validateCommand)} limit 1`)) as { event: string; command: string };
    fixtures.register("choice_appointment_events", validationEffects.event);
    fixtures.register("choice_appointment_commands", validationEffects.command);
    // Fixture-only preparation: provider delivery and the public response have
    // their own focused tests; assignment requires their durable outcomes.
    await sql(`update public.choice_appointment_plans set status='sent',sent_at=now() where id=${q(planId)};
      update public.choice_appointment_slots set response_kind='in_person',responded_at=now(),status='responded' where id=${q(planEffects.slot)}`);

    await page.goto("/login");
    await page.getByLabel("Email").fill(E2E_OWNER_EMAIL);
    await page.getByLabel("Mot de passe").fill(E2E_OWNER_PASSWORD);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page).toHaveURL(/\/candidatures(?:\?|$)/);
    await page.goto(`/litters/${scenario.litterId}/choice-appointments`);
    await expect(page.getByRole("heading", { name: /Planning de/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Familles et attribution" })).toBeVisible();
    await page.screenshot({ path: "/tmp/choice-planning-desktop-2x.png" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("heading", { name: "Familles et attribution" }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: "/tmp/choice-planning-mobile-2x.png" });

    const member = createAnonymousSupabaseClient();
    expect((await member.auth.signInWithPassword({ email: E2E_MEMBER_EMAIL, password: E2E_MEMBER_PASSWORD })).error).toBeNull();
    const directAssignment = await (member as unknown as SupabaseClient)
      .from("reservations")
      .update({ animal_id: scenario.animal.id })
      .eq("id", scenario.journey.id);
    expect(directAssignment.error).toBeTruthy();
    const anonymous = createAnonymousSupabaseClient();
    const bearerRead = await (anonymous as unknown as SupabaseClient)
      .from("choice_appointment_accesses")
      .select("id")
      .limit(1);
    expect(bearerRead.error).toBeTruthy();
    const forbidden = await (member as unknown as { rpc: (name: string, args: Record<string, unknown>) => Promise<{ error: unknown }> }).rpc("assign_choice_appointment_animal", {
      p_slot_id: planEffects.slot,
      p_animal_id: scenario.animal.id,
      p_presentation_media_id: null,
      p_reason: null,
      p_payload_hash: createHash("sha256").update("member").digest("hex"),
      p_client_command_id: randomUUID(),
    });
    expect(forbidden.error).toBeTruthy();

    const assignCommand = randomUUID();
    const payloadHash = createHash("sha256").update("owner-assignment").digest("hex");
    const assigned = await (supabase as unknown as { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: Array<{ outcome: string; assignment_event_id: string; replayed: boolean }> | null; error: unknown }> }).rpc("assign_choice_appointment_animal", {
      p_slot_id: planEffects.slot,
      p_animal_id: scenario.animal.id,
      p_presentation_media_id: null,
      p_reason: null,
      p_payload_hash: payloadHash,
      p_client_command_id: assignCommand,
    });
    expect(assigned.error).toBeNull();
    expect(assigned.data?.[0]).toMatchObject({ outcome: "assigned", replayed: false });
    const assignmentEventId = assigned.data![0]!.assignment_event_id;
    fixtures.register("animal_assignment_events", assignmentEventId);
    const assignmentCommandId = sql(`select id::text from public.animal_assignment_commands where client_command_id=${q(assignCommand)}`);
    fixtures.register("animal_assignment_commands", assignmentCommandId);

    const replay = await (supabase as unknown as { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: Array<{ outcome: string; assignment_event_id: string; replayed: boolean }> | null; error: unknown }> }).rpc("assign_choice_appointment_animal", {
      p_slot_id: planEffects.slot,
      p_animal_id: scenario.animal.id,
      p_presentation_media_id: null,
      p_reason: null,
      p_payload_hash: payloadHash,
      p_client_command_id: assignCommand,
    });
    expect(replay.data?.[0]).toMatchObject({ outcome: "assigned", assignment_event_id: assignmentEventId, replayed: true });

    const reservation = expectSupabaseData(await supabase.from("reservations").select("animal_id,status").eq("id", scenario.journey.id).single(), "assigned reservation");
    const animal = expectSupabaseData(await supabase.from("animals").select("status").eq("id", scenario.animal.id).single(), "reserved animal") as { status: string };
    expect(reservation).toEqual({ animal_id: scenario.animal.id, status: "animal_assigned" });
    expect(animal.status).toBe("reserved");
    expect(sql(`select status||'|'||(assignment_event_id is not null)::text from public.choice_appointment_slots where id=${q(planEffects.slot)}`)).toBe("assigned|true");
    expect(sql(`select count(*)::text from public.reservations where animal_id=${q(scenario.animal.id)} and deleted_at is null`)).toBe("1");
    expect(sql(`select count(*)::text from public.reservations where animal_id=${q(secondAnimal.id)} and deleted_at is null`)).toBe("0");

    const individualDocumentId = randomUUID();
    await sql(`insert into public.documents(id,organization_id,contact_id,reservation_id,litter_id,animal_id,document_type,status,title,signature_required,created_by,updated_by)
      values(${q(individualDocumentId)},${q(organizationId)},${q(scenario.contact.id)},${q(scenario.journey.id)},${q(scenario.litterId)},${q(scenario.animal.id)},'sale_certificate','to_generate','E2E document individuel',false,${q(ownerId)},${q(ownerId)})`);
    fixtures.register("documents", individualDocumentId);
    expect(sql(`select animal_assignment_locked::text from public.reservations where id=${q(scenario.journey.id)}`)).toBe("true");
    const lockedChange = await (supabase as unknown as { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: Array<{ outcome: string; reason: string }> | null; error: unknown }> }).rpc("assign_choice_appointment_animal", {
      p_slot_id: planEffects.slot,
      p_animal_id: secondAnimal.id,
      p_presentation_media_id: null,
      p_reason: "Changement après document",
      p_payload_hash: createHash("sha256").update("locked-change").digest("hex"),
      p_client_command_id: randomUUID(),
    });
    expect(lockedChange.error).toBeNull();
    expect(lockedChange.data?.[0]).toMatchObject({ outcome: "not_eligible", reason: "assignment_locked" });
    const finalizedReport = await (supabase as unknown as { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: Array<{ outcome: string; reason: string }> | null; error: unknown }> }).rpc("report_choice_appointment_slot", {
      p_slot_id: planEffects.slot,
      p_reason: "Tentative après attribution",
      p_client_command_id: randomUUID(),
    });
    expect(finalizedReport.error).toBeNull();
    expect(finalizedReport.data?.[0]).toMatchObject({ outcome: "not_eligible", reason: "slot_finalized" });
  });
});
