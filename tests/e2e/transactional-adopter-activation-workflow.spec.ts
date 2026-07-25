import { expect, test, type Page } from "@playwright/test";

import { createTestOrganization } from "./helpers/fixtures/breeding-fixtures";
import {
  createTestAdopterActivationReadyScenario,
  registerActualActivationEffects,
} from "./helpers/fixtures/adopter-activation-fixtures";
import {
  createTestAdopterCancellationReadyScenario,
} from "./helpers/fixtures/adopter-cancellation-fixtures";
import { withE2eFixtures } from "./helpers/fixtures/fixture-registry";
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

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_OWNER_EMAIL);
  await page.getByLabel("Mot de passe").fill(E2E_OWNER_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/connexion=success/);
}

test("activates a draft adopter journey through the reservation page", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await withE2eFixtures(sql, async (fixtures) => {
    const supabase = await createAuthenticatedSupabaseClient();
    const suffix = fixtures.namespace.slice(-8);

    const scenario = await createTestAdopterActivationReadyScenario(sql, fixtures, {
      organizationId,
      ownerId,
      displayName: `E2E activation pilote ${suffix}`,
    });

    const alreadyActive = await createTestAdopterCancellationReadyScenario(
      sql,
      fixtures,
      {
        organizationId,
        ownerId,
        displayName: `E2E activation déjà active ${suffix}`,
      },
    );

    const foreignOrganizationId = await createTestOrganization(sql, fixtures, {
      name: `E2E organisation activation étrangère ${suffix}`,
    });
    const foreign = await createTestAdopterActivationReadyScenario(sql, fixtures, {
      organizationId: foreignOrganizationId,
      ownerId,
      displayName: `E2E activation étrangère ${suffix}`,
    });

    const before = expectSupabaseData(
      await supabase
        .from("reservations")
        .select(
          "id, status, contact_id, application_id, animal_id, reservation_confirmed_at, price_cents, updated_at, updated_by",
        )
        .eq("id", scenario.journey.id)
        .maybeSingle(),
      "read journey before activation",
    );
    expect(before).toMatchObject({
      id: scenario.journey.id,
      status: "draft",
      contact_id: scenario.contact.id,
      application_id: scenario.application.id,
      animal_id: null,
      reservation_confirmed_at: null,
      price_cents: null,
    });

    const contactBefore = expectSupabaseData(
      await supabase
        .from("contacts")
        .select("id, display_name, primary_status")
        .eq("id", scenario.contact.id)
        .maybeSingle(),
      "read contact before activation",
    );
    const applicationBefore = expectSupabaseData(
      await supabase
        .from("applications")
        .select("id, status, contact_id")
        .eq("id", scenario.application.id)
        .maybeSingle(),
      "read application before activation",
    );
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
        await supabase
          .from("contact_roles")
          .select("id")
          .eq("contact_id", scenario.contact.id)
          .is("deleted_at", null),
        "count roles before",
      ),
    ).toHaveLength(0);

    await login(page);

    await page.goto(`/reservations/${alreadyActive.journey.id}`);
    await expect(
      page.locator("#dossier-summary").getByText("Active", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Confirmer le dossier" })).toHaveCount(0);

    const hiddenForeign = await supabase
      .from("reservations")
      .select("id")
      .eq("id", foreign.journey.id)
      .maybeSingle();
    expect(hiddenForeign.error).toBeNull();
    expect(hiddenForeign.data).toBeNull();

    await page.goto(`/reservations/${scenario.journey.id}`);
    await expect(
      page.getByRole("heading", {
        name: `Parcours adoptant de E2E activation pilote ${suffix}`,
      }),
    ).toBeVisible();
    await expect(page.getByText(`E2E activation étrangère ${suffix}`)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Confirmer le dossier" })).toBeVisible();
    await expect(
      page.getByText(
        "Cette action confirme manuellement le dossier adoptant. Elle ne crée ni paiement, ni document, ni attribution d’animal.",
      ),
    ).toBeVisible();

    await page.getByRole("button", { name: "Confirmer le dossier" }).click();
    await expect(page).toHaveURL(/activation_status=success/);
    await expect(page.getByText("Le dossier adoptant a été confirmé.")).toBeVisible();
    await expect(
      page.locator("#reservation-details").getByText("Active", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Confirmer le dossier" })).toHaveCount(0);

    const after = expectSupabaseData(
      await supabase
        .from("reservations")
        .select(
          "id, status, contact_id, application_id, animal_id, reservation_confirmed_at, price_cents, updated_at, updated_by",
        )
        .eq("id", scenario.journey.id)
        .maybeSingle(),
      "read journey after activation",
    );
    expect(after).toMatchObject({
      id: scenario.journey.id,
      status: "active",
      contact_id: scenario.contact.id,
      application_id: scenario.application.id,
      animal_id: null,
      price_cents: before?.price_cents ?? null,
    });
    expect(after?.reservation_confirmed_at).not.toBeNull();
    expect(after?.updated_by).toBe(ownerId);
    expect(after?.updated_at).not.toBe(before?.updated_at);

    expect(
      expectSupabaseData(
        await supabase
          .from("contacts")
          .select("id, display_name, primary_status")
          .eq("id", scenario.contact.id)
          .maybeSingle(),
        "contact unchanged",
      ),
    ).toEqual(contactBefore);
    expect(
      expectSupabaseData(
        await supabase
          .from("applications")
          .select("id, status, contact_id")
          .eq("id", scenario.application.id)
          .maybeSingle(),
        "application unchanged",
      ),
    ).toEqual(applicationBefore);
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
        await supabase
          .from("contact_roles")
          .select("id, role")
          .eq("contact_id", scenario.contact.id)
          .is("deleted_at", null),
        "roles after activation",
      ),
    ).toHaveLength(0);
    expect(
      expectSupabaseData(
        await supabase.from("reservations").select("id").eq("contact_id", scenario.contact.id),
        "single journey preserved",
      ),
    ).toHaveLength(1);

    const emailCount = Number(
      sql(
        `select count(*)::text from public.email_delivery_attempts where reservation_id = '${scenario.journey.id}'::uuid`,
      ),
    );
    expect(emailCount).toBe(0);

    await registerActualActivationEffects(sql, fixtures, {
      organizationId,
      reservationId: scenario.journey.id,
      contactId: scenario.contact.id,
    });

    await page.reload();
    await expect(
      page.locator("#reservation-details").getByText("Active", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Confirmer le dossier" })).toHaveCount(0);

    const afterReload = expectSupabaseData(
      await supabase
        .from("reservations")
        .select("id, status, contact_id, application_id, animal_id")
        .eq("id", scenario.journey.id)
        .maybeSingle(),
      "read journey after reload",
    );
    expect(afterReload).toEqual({
      id: scenario.journey.id,
      status: "active",
      contact_id: scenario.contact.id,
      application_id: scenario.application.id,
      animal_id: null,
    });
  });
});
