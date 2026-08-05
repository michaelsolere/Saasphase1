import { expect, test, type Page } from "@playwright/test";

import { createTestOrganization } from "./helpers/fixtures/breeding-fixtures";
import {
  createTestAdopterFinalizationReadyScenario,
  registerActualFinalizationEffects,
} from "./helpers/fixtures/adopter-finalization-fixtures";
import {
  createTestAdopterAnimalAssignmentScenario,
} from "./helpers/fixtures/adopter-animal-assignment-fixtures";
import { withE2eFixtures } from "./helpers/fixtures/fixture-registry";
import { registerPostAdoptionQuestionnaireEffects } from "./helpers/fixtures/post-adoption-questionnaire-fixtures";
import { openDialog } from "./helpers/dialogs";
import {
  E2E_OWNER_EMAIL,
  E2E_OWNER_PASSWORD,
  createAuthenticatedSupabaseClient,
  expectSupabaseData,
  runE2eSqlSync,
} from "./helpers/supabase";

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const sql = (statement: string) => runE2eSqlSync(statement);

test.use({ deviceScaleFactor: 2 });

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_OWNER_EMAIL);
  await page.getByLabel("Mot de passe").fill(E2E_OWNER_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/connexion=success/, { timeout: 30_000 });
}

test("finalizes an animal-assigned adopter journey through the reservation page", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await withE2eFixtures(sql, async (fixtures) => {
    const supabase = await createAuthenticatedSupabaseClient();
    const suffix = fixtures.namespace.slice(-8);

    const scenario = await createTestAdopterFinalizationReadyScenario(sql, fixtures, {
      organizationId,
      ownerId,
      displayName: `E2E finalisation pilote ${suffix}`,
      animalCallName: `Chiot finalisation ${suffix}`,
    });

    const incomplete = await createTestAdopterAnimalAssignmentScenario(sql, fixtures, {
      organizationId,
      ownerId,
      displayName: `E2E finalisation incomplète ${suffix}`,
      animalCallName: `Chiot incomplet ${suffix}`,
      journeyStatus: "active",
    });

    const foreignOrganizationId = await createTestOrganization(sql, fixtures, {
      name: `E2E organisation finalisation étrangère ${suffix}`,
    });
    const foreign = await createTestAdopterFinalizationReadyScenario(sql, fixtures, {
      organizationId: foreignOrganizationId,
      ownerId,
      displayName: `E2E finalisation étrangère ${suffix}`,
      animalCallName: `Chiot étranger ${suffix}`,
    });

    try {
    const before = expectSupabaseData(
      await supabase
        .from("reservations")
        .select("id, status, animal_id, contact_id, application_id, adoption_completed_at")
        .eq("id", scenario.journey.id)
        .maybeSingle(),
      "read journey before finalization",
    );
    expect(before).toMatchObject({
      id: scenario.journey.id,
      status: "animal_assigned",
      animal_id: scenario.animal.id,
      contact_id: scenario.contact.id,
      application_id: scenario.application.id,
      adoption_completed_at: null,
    });

    const animalBefore = expectSupabaseData(
      await supabase
        .from("animals")
        .select("id, status, ownership_status")
        .eq("id", scenario.animal.id)
        .maybeSingle(),
      "read animal before finalization",
    );
    expect(animalBefore).toMatchObject({
      id: scenario.animal.id,
      status: "reserved",
      ownership_status: "produced",
    });

    const paymentsBefore = expectSupabaseData(
      await supabase
        .from("payments")
        .select("id")
        .eq("reservation_id", scenario.journey.id),
      "count payments before",
    );
    const documentsBefore = expectSupabaseData(
      await supabase
        .from("documents")
        .select("id")
        .eq("reservation_id", scenario.journey.id),
      "count documents before",
    );
    expect(paymentsBefore).toHaveLength(0);
    expect(documentsBefore).toHaveLength(0);

    await login(page);

    await page.goto(`/reservations/${incomplete.journey.id}`);
    await expect(page.getByRole("button", { name: "Finaliser l’adoption" })).toHaveCount(0);

    const hiddenForeign = await supabase
      .from("reservations")
      .select("id")
      .eq("id", foreign.journey.id)
      .maybeSingle();
    expect(hiddenForeign.error).toBeNull();
    expect(hiddenForeign.data).toBeNull();

    await page.goto(`/reservations/${scenario.journey.id}`);
    await expect(
      page.getByRole("heading", { name: `Parcours adoptant de E2E finalisation pilote ${suffix}` }),
    ).toBeVisible();
    await expect(page.getByText(`E2E finalisation étrangère ${suffix}`)).toHaveCount(0);
    await expect(
      page.locator("#dossier-summary").getByText("Chiot attribué", { exact: true }),
    ).toBeVisible();

    await openDialog(
      page.getByRole("button", { name: "Finaliser l’adoption" }).first(),
      page.getByRole("heading", { name: "Confirmer le départ réel" }),
    );
    await expect(page.getByText("Exceptions sensibles à accepter")).toBeVisible();
    for (const checkbox of await page.getByRole("checkbox").all()) {
      await checkbox.check();
    }
    await page
      .getByLabel("Justification de la décision")
      .fill("E2E validation responsable d’un départ volontairement incomplet.");
    await page.getByTestId("adoption-handover-dialog").screenshot({
      path: "/tmp/adoption-handover-dialog@2x.png",
    });
    const expectedUpdatedAt = await page
      .locator('input[name="expected_reservation_updated_at"]')
      .inputValue();
    const actualUpdatedAt = sql(
      `select updated_at::text from public.reservations where id='${scenario.journey.id}'::uuid`,
    );
    expect(new Date(expectedUpdatedAt).toISOString()).toBe(
      new Date(actualUpdatedAt).toISOString(),
    );
    sql(`
      update public.reservations
      set updated_at = clock_timestamp()
      where id='${scenario.journey.id}'::uuid
    `);
    await page.getByRole("button", { name: "Confirmer le départ" }).click();
    await expect(page).toHaveURL(/adoption_reason=reservation_stale/, {
      timeout: 30_000,
    });
    await expect(
      page.getByText(/Le dossier a changé depuis l’ouverture de la confirmation/),
    ).toBeVisible();

    await openDialog(
      page.getByRole("button", { name: "Finaliser l’adoption" }).first(),
      page.getByRole("heading", { name: "Confirmer le départ réel" }),
    );
    for (const checkbox of await page.getByRole("checkbox").all()) {
      await checkbox.check();
    }
    await page
      .getByLabel("Justification de la décision")
      .fill("E2E validation responsable après relecture du dossier actualisé.");
    await page.getByRole("button", { name: "Confirmer le départ" }).click();
    await expect(page).toHaveURL(/adoption_status=success/, {
      timeout: 30_000,
    });
    const adoptionEventId = sql(`
      select id
      from public.adoption_handover_events
      where reservation_id='${scenario.journey.id}'::uuid
        and event_type='finalized'
      order by occurred_at desc
      limit 1
    `);
    fixtures.register("adoption_handover_events", adoptionEventId);
    await registerActualFinalizationEffects(sql, fixtures, {
      organizationId,
      reservationId: scenario.journey.id,
      contactId: scenario.contact.id,
      animalId: scenario.animal.id,
    });
    await registerPostAdoptionQuestionnaireEffects(sql, fixtures, {
      reservationIds: [scenario.journey.id],
    });
    await expect(
      page.getByText(/L’adoption a été finalisée\. Le parcours/),
    ).toBeVisible();

    const after = expectSupabaseData(
      await supabase
        .from("reservations")
        .select("id, status, animal_id, contact_id, application_id, adoption_completed_at")
        .eq("id", scenario.journey.id)
        .maybeSingle(),
      "read journey after finalization",
    );
    expect(after).toMatchObject({
      id: scenario.journey.id,
      status: "adopted",
      animal_id: scenario.animal.id,
      contact_id: scenario.contact.id,
      application_id: scenario.application.id,
    });
    expect(after?.adoption_completed_at).not.toBeNull();

    const animalAfter = expectSupabaseData(
      await supabase
        .from("animals")
        .select("id, status, ownership_status")
        .eq("id", scenario.animal.id)
        .maybeSingle(),
      "read animal after finalization",
    );
    expect(animalAfter).toMatchObject({
      id: scenario.animal.id,
      status: "adopted",
      ownership_status: "adopted_out",
    });

    const roles = expectSupabaseData(
      await supabase
        .from("contact_roles")
        .select("id, role, is_active, ended_at")
        .eq("contact_id", scenario.contact.id)
        .is("deleted_at", null)
        .order("created_at"),
      "read contact roles after finalization",
    );
    const activeRoles = roles.filter((role) => role.is_active).map((role) => role.role);
    expect(activeRoles).toEqual(["adopter"]);
    expect(roles.find((role) => role.role === "reservation_holder")).toMatchObject({
      is_active: false,
    });
    expect(roles.find((role) => role.role === "reservation_holder")?.ended_at).not.toBeNull();

    expect(
      expectSupabaseData(
        await supabase.from("reservations").select("id").eq("contact_id", scenario.contact.id),
        "count reservations for contact",
      ),
    ).toHaveLength(1);
    expect(
      expectSupabaseData(
        await supabase.from("animals").select("id").eq("id", scenario.animal.id),
        "count exact animal",
      ),
    ).toHaveLength(1);
    expect(
      expectSupabaseData(
        await supabase.from("payments").select("id").eq("reservation_id", scenario.journey.id),
        "count payments after",
      ),
    ).toHaveLength(0);
    expect(
      expectSupabaseData(
        await supabase.from("documents").select("id").eq("reservation_id", scenario.journey.id),
        "count documents after",
      ),
    ).toHaveLength(0);

    await page.reload();
    await expect(
      page.locator("#dossier-summary").getByText("Adopté", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Finaliser l’adoption" })).toHaveCount(0);
    await expect(page.getByText("Historique du départ")).toBeVisible();
    await expect(page.getByRole("button", { name: "Rectifier la date" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Adoption enregistrée par erreur" }),
    ).toBeVisible();

    await openDialog(
      page.getByRole("button", { name: "Rectifier la date" }),
      page.getByRole("heading", { name: "Rectifier la date réelle ?" }),
    );
    await page
      .getByLabel("Nouvelle date et heure réelles")
      .fill("2026-08-04T10:00");
    await page
      .getByLabel("Motif obligatoire")
      .fill("E2E rectification de la date réelle après contrôle du registre.");
    await page
      .getByRole("button", { name: "Enregistrer la rectification" })
      .click();
    await expect(page).toHaveURL(/adoption_correction_status=success/, {
      timeout: 30_000,
    });
    const correctionEventId = sql(`
      select id
      from public.adoption_handover_events
      where reservation_id='${scenario.journey.id}'::uuid
        and event_type='date_corrected'
      order by occurred_at desc
      limit 1
    `);
    fixtures.register("adoption_handover_events", correctionEventId);
    await registerPostAdoptionQuestionnaireEffects(sql, fixtures, {
      reservationIds: [scenario.journey.id],
    });
    await expect(page.getByText("Date réelle rectifiée")).toBeVisible();
    await page.getByTestId("adoption-handover-history").screenshot({
      path: "/tmp/adoption-handover-history@2x.png",
    });

    const afterReload = expectSupabaseData(
      await supabase
        .from("reservations")
        .select("id, status, animal_id")
        .eq("id", scenario.journey.id)
        .maybeSingle(),
      "read journey after reload",
    );
    expect(afterReload).toEqual({
      id: scenario.journey.id,
      status: "adopted",
      animal_id: scenario.animal.id,
    });
    } finally {
      await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
      const generated = JSON.parse(
        sql(`
          select json_build_object(
            'events', coalesce((
              select json_agg(id)
              from public.adoption_handover_events
              where reservation_id='${scenario.journey.id}'::uuid
            ), '[]'::json),
            'roles', coalesce((
              select json_agg(id)
              from public.contact_roles
              where contact_id='${scenario.contact.id}'::uuid
            ), '[]'::json)
          )::text
        `),
      ) as { events: string[]; roles: string[] };
      for (const eventId of generated.events) {
        if (!fixtures.has("adoption_handover_events", eventId)) {
          fixtures.register("adoption_handover_events", eventId);
        }
      }
      for (const roleId of generated.roles) {
        if (!fixtures.has("contact_roles", roleId)) {
          fixtures.register("contact_roles", roleId);
        }
      }
      await registerPostAdoptionQuestionnaireEffects(sql, fixtures, {
        reservationIds: [scenario.journey.id],
      });
    }
  });
});
