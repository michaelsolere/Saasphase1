import { expect, test, type Page } from "@playwright/test";

import { createTestOrganization } from "./helpers/fixtures/breeding-fixtures";
import {
  createTestAdopterNoteReadyScenario,
  registerActualNoteEffects,
} from "./helpers/fixtures/adopter-note-fixtures";
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

const NOTE_BODY =
  "Préférence exprimée pour un chiot calme ; disponibilité surtout le samedi matin.";
const NOTE_BODY_SECOND =
  "Relance téléphonique prévue la semaine prochaine si pas de retour.";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_OWNER_EMAIL);
  await page.getByLabel("Mot de passe").fill(E2E_OWNER_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/connexion=success/);
}

async function createReservationNoteViaUi(page: Page, reservationId: string, body: string) {
  if (new URL(page.url()).searchParams.has("note_status")) {
    await page.goto(`/reservations/${reservationId}#notes`);
    await expect(page.getByRole("heading", { name: "Notes internes" })).toBeVisible();
  }

  await openDialog(
    page.getByRole("button", { name: "+ Ajouter une note interne" }),
    page.getByRole("dialog").getByRole("heading", { name: "Ajouter une note interne" }),
  );
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Contenu de la note interne").fill(body);
  await Promise.all([
    page.waitForURL((url) => url.searchParams.get("note_status") === "success"),
    dialog.getByRole("button", { name: "Ajouter une note interne" }).click(),
  ]);
  await expect(page.getByRole("heading", { name: "Notes internes" })).toBeVisible();
}

test("creates internal adopter notes through the reservation cockpit without side effects", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await withE2eFixtures(sql, async (fixtures) => {
    const supabase = await createAuthenticatedSupabaseClient();
    const suffix = fixtures.namespace.slice(-8);

    const ownerProfile = expectSupabaseData(
      await supabase
        .from("profiles")
        .select("id, display_name")
        .eq("id", ownerId)
        .maybeSingle(),
      "read owner profile display name",
    );
    const authorLabel = ownerProfile?.display_name || "Auteur inconnu";

    const scenario = await createTestAdopterNoteReadyScenario(sql, fixtures, {
      organizationId,
      ownerId,
      displayName: `E2E notes pilote ${suffix}`,
    });

    const foreignOrganizationId = await createTestOrganization(sql, fixtures, {
      name: `E2E organisation notes étrangère ${suffix}`,
    });
    const foreign = await createTestAdopterNoteReadyScenario(sql, fixtures, {
      organizationId: foreignOrganizationId,
      ownerId,
      displayName: `E2E notes étranger ${suffix}`,
    });

    const beforeNotes = expectSupabaseData(
      await supabase
        .from("notes")
        .select("id")
        .eq("reservation_id", scenario.journey.id)
        .is("deleted_at", null),
      "count notes before",
    );
    expect(beforeNotes).toHaveLength(0);

    const beforeOverview = expectSupabaseData(
      await supabase
        .from("reservation_overview")
        .select("id, status, contact_id, application_id, animal_id, paid_cents, refunded_cents")
        .eq("id", scenario.journey.id)
        .maybeSingle(),
      "read overview before notes",
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
      "read roles before notes",
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
    expect(
      expectSupabaseData(
        await supabase.from("events").select("id").eq("reservation_id", scenario.journey.id),
        "count events before",
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
    await expect(page.locator("#notes")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "+ Ajouter une note interne" }),
    ).toHaveCount(0);

    const hiddenForeign = await supabase
      .from("reservations")
      .select("id")
      .eq("id", foreign.journey.id)
      .maybeSingle();
    expect(hiddenForeign.error).toBeNull();
    expect(hiddenForeign.data).toBeNull();

    await page.goto(`/reservations/${scenario.journey.id}#notes`);
    await expect(
      page.getByRole("heading", {
        name: `Parcours adoptant de E2E notes pilote ${suffix}`,
      }),
    ).toBeVisible();
    await expect(page.getByText(`E2E notes étranger ${suffix}`)).toHaveCount(0);
    await expect(
      page.locator("#dossier-summary").getByText("Active", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Notes internes" })).toBeVisible();
    await expect(page.getByText("Aucune note interne pour ce dossier.")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "+ Ajouter une note interne" }),
    ).toBeVisible();
    // No edit / archive / delete controls exist for reservation notes.
    await expect(page.getByRole("button", { name: /Modifier|Supprimer|Archiver/i })).toHaveCount(0);

    await createReservationNoteViaUi(page, scenario.journey.id, NOTE_BODY);

    const afterFirst = expectSupabaseData(
      await supabase
        .from("notes")
        .select(
          "id, organization_id, reservation_id, contact_id, application_id, body, note_type, visibility, created_by, updated_by, created_at, updated_at, deleted_at, title",
        )
        .eq("reservation_id", scenario.journey.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
      "read notes after first create",
    );
    expect(afterFirst).toHaveLength(1);
    const firstNote = afterFirst[0]!;
    fixtures.register("notes", firstNote.id);
    expect(firstNote).toMatchObject({
      organization_id: organizationId,
      reservation_id: scenario.journey.id,
      contact_id: null,
      application_id: null,
      body: NOTE_BODY,
      note_type: "internal",
      visibility: "internal",
      created_by: ownerId,
      updated_by: ownerId,
      deleted_at: null,
      title: null,
    });
    expect(firstNote.created_at).toEqual(expect.any(String));
    expect(firstNote.updated_at).toEqual(expect.any(String));

    const firstNoteCard = page.locator("#notes .divide-y > div").first();
    await expect(firstNoteCard.getByText(NOTE_BODY)).toBeVisible();
    await expect(firstNoteCard.getByText("Note interne", { exact: true })).toBeVisible();
    await expect(firstNoteCard.getByText(`Par ${authorLabel}`)).toBeVisible();
    await expect(page.getByText("Aucune note interne pour ce dossier.")).toHaveCount(0);

    await createReservationNoteViaUi(page, scenario.journey.id, NOTE_BODY_SECOND);

    const afterSecond = expectSupabaseData(
      await supabase
        .from("notes")
        .select(
          "id, body, created_at, created_by, organization_id, reservation_id, contact_id, application_id, note_type, visibility, deleted_at",
        )
        .eq("reservation_id", scenario.journey.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
      "read notes after second create",
    );
    expect(afterSecond).toHaveLength(2);
    const secondNote = afterSecond[0]!;
    const firstStill = afterSecond.find((row) => row.id === firstNote.id)!;
    fixtures.register("notes", secondNote.id);
    expect(secondNote.id).not.toBe(firstNote.id);
    expect(secondNote).toMatchObject({
      body: NOTE_BODY_SECOND,
      organization_id: organizationId,
      reservation_id: scenario.journey.id,
      contact_id: null,
      application_id: null,
      note_type: "internal",
      visibility: "internal",
      created_by: ownerId,
      deleted_at: null,
    });
    expect(firstStill).toMatchObject({
      id: firstNote.id,
      body: NOTE_BODY,
    });
    expect(new Date(secondNote.created_at).getTime()).toBeGreaterThanOrEqual(
      new Date(firstStill.created_at).getTime(),
    );

    // UI order: newest first (created_at descending).
    const noteBodies = page.locator("#notes .divide-y > div");
    await expect(noteBodies).toHaveCount(2);
    await expect(noteBodies.nth(0).getByText(NOTE_BODY_SECOND)).toBeVisible();
    await expect(noteBodies.nth(1).getByText(NOTE_BODY)).toBeVisible();
    await expect(noteBodies.nth(0).getByText(`Par ${authorLabel}`)).toBeVisible();
    await expect(noteBodies.nth(1).getByText(`Par ${authorLabel}`)).toBeVisible();

    await page.reload();
    await expect(page.getByRole("heading", { name: "Notes internes" })).toBeVisible();
    const afterReloadBodies = page.locator("#notes .divide-y > div");
    await expect(afterReloadBodies).toHaveCount(2);
    await expect(afterReloadBodies.nth(0).getByText(NOTE_BODY_SECOND)).toBeVisible();
    await expect(afterReloadBodies.nth(1).getByText(NOTE_BODY)).toBeVisible();
    await expect(afterReloadBodies.nth(0).getByText(`Par ${authorLabel}`)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Modifier|Supprimer|Archiver/i }),
    ).toHaveCount(0);

    const persisted = expectSupabaseData(
      await supabase
        .from("notes")
        .select("id, body, deleted_at")
        .eq("reservation_id", scenario.journey.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
      "read notes after reload",
    );
    expect(persisted).toHaveLength(2);
    expect(persisted.map((row) => row.id)).toEqual([secondNote.id, firstNote.id]);
    expect(persisted.map((row) => row.body)).toEqual([NOTE_BODY_SECOND, NOTE_BODY]);

    const overviewAfter = expectSupabaseData(
      await supabase
        .from("reservation_overview")
        .select("id, status, contact_id, application_id, animal_id, paid_cents, refunded_cents")
        .eq("id", scenario.journey.id)
        .maybeSingle(),
      "read overview after notes",
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
      "read roles after notes",
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
    expect(
      expectSupabaseData(
        await supabase.from("events").select("id").eq("reservation_id", scenario.journey.id),
        "count events after",
      ),
    ).toHaveLength(0);

    const emailsAfter = Number(
      await sql(
        `select count(*)::text from public.email_delivery_attempts
         where organization_id = '${organizationId}'::uuid`,
      ),
    );
    expect(emailsAfter).toBe(emailsBefore);

    const foreignNotes = Number(
      await sql(
        `select count(*)::text from public.notes
         where reservation_id = '${foreign.journey.id}'::uuid
           and organization_id = '${foreignOrganizationId}'::uuid`,
      ),
    );
    expect(foreignNotes).toBe(0);

    await registerActualNoteEffects(sql, fixtures, {
      organizationId,
      reservationId: scenario.journey.id,
      contactId: scenario.contact.id,
    });
    expect(fixtures.has("notes", firstNote.id)).toBe(true);
    expect(fixtures.has("notes", secondNote.id)).toBe(true);

    const remainingBeforeCleanup = await fixtures.counts();
    expect(remainingBeforeCleanup.notes).toBe(2);
    expect(remainingBeforeCleanup.reservations).toBeGreaterThanOrEqual(2);
  });
});
