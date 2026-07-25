import { expect, test, type Locator, type Page } from "@playwright/test";

import { createTestOrganization } from "./helpers/fixtures/breeding-fixtures";
import {
  createTestAdopterAppointmentReadyScenario,
  registerActualAppointmentEffects,
} from "./helpers/fixtures/adopter-appointment-fixtures";
import { withE2eFixtures } from "./helpers/fixtures/fixture-registry";
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

/** Fixed Europe/Paris local wall times, far from execution day. */
const CHOICE_LOCAL = "2026-09-10T10:00";
const CHOICE_ISO = "2026-09-10T08:00:00.000Z";
const CHOICE_DISPLAY = "10 septembre 2026 à 10:00";
const CHOICE_MODIFIED_LOCAL = "2026-09-11T11:00";
const CHOICE_MODIFIED_ISO = "2026-09-11T09:00:00.000Z";
const CHOICE_MODIFIED_DISPLAY = "11 septembre 2026 à 11:00";
const ADOPTION_LOCAL = "2026-09-20T14:30";
const ADOPTION_ISO = "2026-09-20T12:30:00.000Z";
const ADOPTION_DISPLAY = "20 septembre 2026 à 14:30";
const CONFIRM_LOCAL = "2026-09-05T16:00";
const CONFIRM_ISO = "2026-09-05T14:00:00.000Z";
const CONFIRM_DISPLAY = "5 septembre 2026 à 16:00";

function expectInstant(actual: string | null | undefined, expectedIso: string) {
  expect(actual).toEqual(expect.any(String));
  expect(new Date(actual!).toISOString()).toBe(expectedIso);
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_OWNER_EMAIL);
  await page.getByLabel("Mot de passe").fill(E2E_OWNER_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/connexion=success/);
}

function appointmentCard(page: Page, label: string) {
  return page.locator("#appointments .rounded-xl.border").filter({
    has: page.getByRole("heading", { level: 3, name: label }),
  });
}

async function upsertAppointment(
  page: Page,
  reservationId: string,
  card: Locator,
  title: string,
  triggerLabel: "Renseigner" | "Modifier",
  values: {
    plannedAt: string;
    actualAt?: string;
    status: "planned" | "done" | "postponed";
    description?: string;
  },
) {
  if (new URL(page.url()).searchParams.has("appointment_status")) {
    await page.goto(`/reservations/${reservationId}#appointments`);
    await expect(page.getByRole("heading", { name: "Créneaux de rendez-vous" })).toBeVisible();
  }

  await openDialog(
    card.getByRole("button", { name: triggerLabel }),
    page.getByRole("dialog").getByRole("heading", { name: title }),
  );
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Créneau proposé").fill(values.plannedAt);
  if (values.actualAt !== undefined) {
    await dialog.getByLabel("Date de confirmation du créneau").fill(values.actualAt);
  }
  await dialog.locator('select[name="status"]').selectOption(values.status);
  if (values.description !== undefined) {
    await dialog.getByLabel("Commentaire court").fill(values.description);
  }
  await Promise.all([
    page.waitForURL((url) => url.searchParams.get("appointment_status") === "success"),
    dialog.getByRole("button", { name: "Enregistrer" }).click(),
  ]);
  await expect(page.getByRole("heading", { name: "Créneaux de rendez-vous" })).toBeVisible();
}

test("proposes, confirms and modifies adopter appointment slots through the reservation page", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await withE2eFixtures(sql, async (fixtures) => {
    const supabase = await createAuthenticatedSupabaseClient();
    const suffix = fixtures.namespace.slice(-8);

    const scenario = await createTestAdopterAppointmentReadyScenario(sql, fixtures, {
      organizationId,
      ownerId,
      displayName: `E2E créneaux pilote ${suffix}`,
    });

    const foreignOrganizationId = await createTestOrganization(sql, fixtures, {
      name: `E2E organisation créneaux étrangère ${suffix}`,
    });
    const foreign = await createTestAdopterAppointmentReadyScenario(sql, fixtures, {
      organizationId: foreignOrganizationId,
      ownerId,
      displayName: `E2E créneaux étranger ${suffix}`,
    });

    const beforeEvents = expectSupabaseData(
      await supabase
        .from("events")
        .select("id")
        .eq("reservation_id", scenario.journey.id)
        .is("deleted_at", null),
      "count events before appointments",
    );
    expect(beforeEvents).toHaveLength(0);

    const beforeOverview = expectSupabaseData(
      await supabase
        .from("reservation_overview")
        .select("id, status, contact_id, application_id, animal_id, paid_cents, refunded_cents")
        .eq("id", scenario.journey.id)
        .maybeSingle(),
      "read overview before appointments",
    );
    expect(beforeOverview).toMatchObject({
      id: scenario.journey.id,
      status: "active",
      contact_id: scenario.contact.id,
      application_id: scenario.application.id,
      animal_id: null,
      paid_cents: 0,
      refunded_cents: 0,
    });

    const rolesBefore = expectSupabaseData(
      await supabase
        .from("contact_roles")
        .select("id, role, is_active, ended_at")
        .eq("contact_id", scenario.contact.id)
        .is("deleted_at", null)
        .order("created_at"),
      "read roles before appointments",
    );
    expect(rolesBefore).toHaveLength(1);
    expect(rolesBefore[0]).toMatchObject({
      id: scenario.holderRoleId,
      role: "reservation_holder",
      is_active: true,
      ended_at: null,
    });

    expect(
      expectSupabaseData(
        await supabase.from("payments").select("id").eq("reservation_id", scenario.journey.id),
        "count payments before",
      ),
    ).toHaveLength(0);
    expect(
      expectSupabaseData(
        await supabase.from("documents").select("id").eq("reservation_id", scenario.journey.id),
        "count documents before",
      ),
    ).toHaveLength(0);

    const emailsBefore = Number(
      await sql(
        `select count(*)::text from public.email_delivery_attempts
         where organization_id = '${organizationId}'::uuid`,
      ),
    );

    await login(page);

    const foreignResponse = await page.goto(`/reservations/${foreign.journey.id}`);
    expect(foreignResponse?.status()).toBe(200);
    await expect(
      page.getByRole("heading", { name: "Dossier adoptant introuvable" }),
    ).toBeVisible();
    await expect(page.locator("#appointments")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Renseigner" })).toHaveCount(0);

    const hiddenForeign = await supabase
      .from("reservations")
      .select("id")
      .eq("id", foreign.journey.id)
      .maybeSingle();
    expect(hiddenForeign.error).toBeNull();
    expect(hiddenForeign.data).toBeNull();

    await page.goto(`/reservations/${scenario.journey.id}#appointments`);
    await expect(
      page.getByRole("heading", {
        name: `Parcours adoptant de E2E créneaux pilote ${suffix}`,
      }),
    ).toBeVisible();
    await expect(page.getByText(`E2E créneaux étranger ${suffix}`)).toHaveCount(0);
    await expect(
      page.locator("#dossier-summary").getByText("Active", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Créneaux de rendez-vous" }),
    ).toBeVisible();

    const choiceCard = appointmentCard(page, "Choix du chiot/chaton");
    const adoptionCard = appointmentCard(page, "Adoption / départ");
    await expect(choiceCard.getByText("Non proposé", { exact: true })).toBeVisible();
    await expect(adoptionCard.getByText("Non proposé", { exact: true })).toBeVisible();
    await expect(choiceCard.getByRole("button", { name: "Renseigner" })).toBeVisible();
    await expect(adoptionCard.getByRole("button", { name: "Renseigner" })).toBeVisible();

    await upsertAppointment(page, scenario.journey.id, choiceCard, "Choix du chiot/chaton", "Renseigner", {
      plannedAt: CHOICE_LOCAL,
      status: "planned",
      description: `E2E choix proposé ${suffix}`,
    });

    const afterPropose = expectSupabaseData(
      await supabase
        .from("events")
        .select(
          "id, event_type, status, planned_at, actual_at, title, description, reservation_id, organization_id, deleted_at",
        )
        .eq("reservation_id", scenario.journey.id)
        .is("deleted_at", null)
        .order("created_at"),
      "read events after propose choice",
    );
    expect(afterPropose).toHaveLength(1);
    const choiceEvent = afterPropose[0]!;
    fixtures.register("events", choiceEvent.id);
    expect(choiceEvent).toMatchObject({
      event_type: "puppy_choice",
      status: "planned",
      actual_at: null,
      title: "Rendez-vous de choix du chiot/chaton",
      description: `E2E choix proposé ${suffix}`,
      reservation_id: scenario.journey.id,
      organization_id: organizationId,
      deleted_at: null,
    });
    expectInstant(choiceEvent.planned_at, CHOICE_ISO);

    await expect(choiceCard.getByText("Proposé", { exact: true })).toBeVisible();
    await expect(choiceCard.getByText(CHOICE_DISPLAY)).toBeVisible();
    await expect(choiceCard.getByText(`E2E choix proposé ${suffix}`)).toBeVisible();
    await expect(choiceCard.getByRole("button", { name: "Modifier" })).toBeVisible();
    await expect(adoptionCard.getByText("Non proposé", { exact: true })).toBeVisible();

    await upsertAppointment(page, scenario.journey.id, choiceCard, "Choix du chiot/chaton", "Modifier", {
      plannedAt: CHOICE_LOCAL,
      actualAt: CONFIRM_LOCAL,
      status: "done",
      description: `E2E choix confirmé ${suffix}`,
    });

    const afterConfirm = expectSupabaseData(
      await supabase
        .from("events")
        .select(
          "id, event_type, status, planned_at, actual_at, title, description, reservation_id",
        )
        .eq("reservation_id", scenario.journey.id)
        .is("deleted_at", null)
        .order("created_at"),
      "read events after confirm choice",
    );
    expect(afterConfirm).toHaveLength(1);
    expect(afterConfirm[0]).toMatchObject({
      id: choiceEvent.id,
      event_type: "puppy_choice",
      status: "done",
      title: "Rendez-vous de choix du chiot/chaton",
      description: `E2E choix confirmé ${suffix}`,
      reservation_id: scenario.journey.id,
    });
    expectInstant(afterConfirm[0]?.planned_at, CHOICE_ISO);
    expectInstant(afterConfirm[0]?.actual_at, CONFIRM_ISO);

    await expect(
      choiceCard.getByText("Créneau confirmé par l’adoptant", { exact: true }),
    ).toBeVisible();
    await expect(choiceCard.getByText(CHOICE_DISPLAY)).toBeVisible();
    await expect(choiceCard.getByText(CONFIRM_DISPLAY)).toBeVisible();

    await upsertAppointment(page, scenario.journey.id, adoptionCard, "Adoption / départ", "Renseigner", {
      plannedAt: ADOPTION_LOCAL,
      status: "planned",
      description: `E2E départ proposé ${suffix}`,
    });

    const afterAdoption = expectSupabaseData(
      await supabase
        .from("events")
        .select(
          "id, event_type, status, planned_at, actual_at, title, description, reservation_id",
        )
        .eq("reservation_id", scenario.journey.id)
        .is("deleted_at", null)
        .order("planned_at"),
      "read events after propose adoption",
    );
    expect(afterAdoption).toHaveLength(2);
    expect(afterAdoption.map((row) => row.event_type)).toEqual([
      "puppy_choice",
      "adoption",
    ]);
    const adoptionEvent = afterAdoption.find((row) => row.event_type === "adoption")!;
    const choiceStill = afterAdoption.find((row) => row.event_type === "puppy_choice")!;
    fixtures.register("events", adoptionEvent.id);
    expect(choiceStill.id).toBe(choiceEvent.id);
    expect(adoptionEvent).toMatchObject({
      event_type: "adoption",
      status: "planned",
      actual_at: null,
      title: "Rendez-vous d’adoption / départ",
      description: `E2E départ proposé ${suffix}`,
      reservation_id: scenario.journey.id,
    });
    expectInstant(adoptionEvent.planned_at, ADOPTION_ISO);

    await expect(adoptionCard.getByText("Proposé", { exact: true })).toBeVisible();
    await expect(adoptionCard.getByText(ADOPTION_DISPLAY)).toBeVisible();
    await expect(
      page.locator("#appointments").getByText(
        "Attention : le créneau d’adoption / départ est programmé avant le créneau de choix du chiot/chaton.",
      ),
    ).toHaveCount(0);

    await upsertAppointment(page, scenario.journey.id, choiceCard, "Choix du chiot/chaton", "Modifier", {
      plannedAt: CHOICE_MODIFIED_LOCAL,
      actualAt: CONFIRM_LOCAL,
      status: "done",
      description: `E2E choix modifié ${suffix}`,
    });

    const afterModify = expectSupabaseData(
      await supabase
        .from("events")
        .select("id, event_type, status, planned_at, actual_at, description")
        .eq("reservation_id", scenario.journey.id)
        .is("deleted_at", null)
        .order("planned_at"),
      "read events after modify choice",
    );
    expect(afterModify).toHaveLength(2);
    const modifiedChoice = afterModify.find((row) => row.event_type === "puppy_choice");
    expect(modifiedChoice).toMatchObject({
      id: choiceEvent.id,
      status: "done",
      description: `E2E choix modifié ${suffix}`,
    });
    expectInstant(modifiedChoice?.planned_at, CHOICE_MODIFIED_ISO);
    expectInstant(modifiedChoice?.actual_at, CONFIRM_ISO);
    expect(afterModify.find((row) => row.event_type === "adoption")?.id).toBe(
      adoptionEvent.id,
    );

    await expect(choiceCard.getByText(CHOICE_MODIFIED_DISPLAY)).toBeVisible();

    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Créneaux de rendez-vous" }),
    ).toBeVisible();
    const choiceAfterReload = appointmentCard(page, "Choix du chiot/chaton");
    const adoptionAfterReload = appointmentCard(page, "Adoption / départ");
    await expect(
      choiceAfterReload.getByText("Créneau confirmé par l’adoptant", { exact: true }),
    ).toBeVisible();
    await expect(choiceAfterReload.getByText(CHOICE_MODIFIED_DISPLAY)).toBeVisible();
    await expect(choiceAfterReload.getByText(CONFIRM_DISPLAY)).toBeVisible();
    await expect(choiceAfterReload.getByText(`E2E choix modifié ${suffix}`)).toBeVisible();
    await expect(adoptionAfterReload.getByText("Proposé", { exact: true })).toBeVisible();
    await expect(adoptionAfterReload.getByText(ADOPTION_DISPLAY)).toBeVisible();
    await expect(
      adoptionAfterReload.getByText(`E2E départ proposé ${suffix}`),
    ).toBeVisible();

    const persisted = expectSupabaseData(
      await supabase
        .from("events")
        .select("id, event_type, status, planned_at, actual_at, deleted_at")
        .eq("reservation_id", scenario.journey.id)
        .is("deleted_at", null)
        .order("planned_at"),
      "read events after reload",
    );
    expect(persisted).toHaveLength(2);
    expect(persisted.map((row) => row.id).sort()).toEqual(
      [choiceEvent.id, adoptionEvent.id].sort(),
    );

    const overviewAfter = expectSupabaseData(
      await supabase
        .from("reservation_overview")
        .select("id, status, contact_id, application_id, animal_id, paid_cents, refunded_cents")
        .eq("id", scenario.journey.id)
        .maybeSingle(),
      "read overview after appointments",
    );
    expect(overviewAfter).toMatchObject({
      id: scenario.journey.id,
      status: "active",
      contact_id: scenario.contact.id,
      application_id: scenario.application.id,
      animal_id: null,
      paid_cents: 0,
      refunded_cents: 0,
    });

    const rolesAfter = expectSupabaseData(
      await supabase
        .from("contact_roles")
        .select("id, role, is_active, ended_at")
        .eq("contact_id", scenario.contact.id)
        .is("deleted_at", null)
        .order("created_at"),
      "read roles after appointments",
    );
    expect(rolesAfter).toEqual(rolesBefore);

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

    const campaignTraces = expectSupabaseData(
      await supabase
        .from("events")
        .select("id, event_type, title")
        .eq("reservation_id", scenario.journey.id)
        .eq("event_type", "other")
        .is("deleted_at", null),
      "count campaign trace events",
    );
    expect(campaignTraces).toHaveLength(0);

    const emailsAfter = Number(
      await sql(
        `select count(*)::text from public.email_delivery_attempts
         where organization_id = '${organizationId}'::uuid`,
      ),
    );
    expect(emailsAfter).toBe(emailsBefore);

    const foreignEvents = Number(
      await sql(
        `select count(*)::text from public.events
         where reservation_id = '${foreign.journey.id}'::uuid
           and organization_id = '${foreignOrganizationId}'::uuid`,
      ),
    );
    expect(foreignEvents).toBe(0);

    await registerActualAppointmentEffects(sql, fixtures, {
      organizationId,
      reservationId: scenario.journey.id,
      contactId: scenario.contact.id,
    });
    expect(fixtures.has("events", choiceEvent.id)).toBe(true);
    expect(fixtures.has("events", adoptionEvent.id)).toBe(true);

    const remainingBeforeCleanup = await fixtures.counts();
    expect(remainingBeforeCleanup.events).toBe(2);
    expect(remainingBeforeCleanup.reservations).toBeGreaterThanOrEqual(2);
  });
});
