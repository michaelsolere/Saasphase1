import { expect, test, type Page } from "@playwright/test";

import { createTestOrganization } from "./helpers/fixtures/breeding-fixtures";
import {
  createTestAdopterDocumentScenario,
  registerActualDocumentEffects,
} from "./helpers/fixtures/adopter-document-fixtures";
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

test("adopter document transitions through sent then signed on the real document page", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await withE2eFixtures(sql, async (fixtures) => {
    const supabase = await createAuthenticatedSupabaseClient();
    const suffix = fixtures.namespace.slice(-8);
    const scenario = await createTestAdopterDocumentScenario(sql, fixtures, {
      organizationId,
      ownerId,
      displayName: `E2E document pilote ${suffix}`,
      title: `Contrat pilote ${suffix}`,
    });
    const foreignOrganizationId = await createTestOrganization(sql, fixtures, {
      name: `E2E organisation document étrangère ${suffix}`,
    });
    const foreignScenario = await createTestAdopterDocumentScenario(sql, fixtures, {
      organizationId: foreignOrganizationId,
      ownerId,
      displayName: `E2E document étranger ${suffix}`,
      title: `Contrat étranger ${suffix}`,
    });

    await login(page);

    await page.goto("/documents");
    await expect(page.getByText(`Contrat pilote ${suffix}`)).toBeVisible();
    await expect(page.getByText(`Contrat étranger ${suffix}`)).toHaveCount(0);
    await expect(page.getByText(`E2E document étranger ${suffix}`)).toHaveCount(0);

    const hiddenForeignDocument = await supabase
      .from("documents")
      .select("id")
      .eq("id", foreignScenario.document.id)
      .maybeSingle();
    expect(hiddenForeignDocument.error).toBeNull();
    expect(hiddenForeignDocument.data).toBeNull();

    await page.goto(`/documents/${scenario.document.id}`);
    await expect(page.getByRole("heading", { name: `Contrat pilote ${suffix}` })).toBeVisible();
    await expect(page.getByText("État actuel : À générer")).toBeVisible();
    await page.getByRole("button", { name: "Marquer comme envoyé" }).click();
    await page.getByRole("button", { name: "Confirmer l’envoi" }).click();
    await expect(page).toHaveURL(
      new RegExp(`/documents/${scenario.document.id}\\?document_action_status=success`),
    );
    await expect(page.getByText("État actuel : Envoyé")).toBeVisible();

    const afterSent = expectSupabaseData(
      await supabase
        .from("documents")
        .select("id, status, sent_at, signed_at")
        .eq("reservation_id", scenario.journey.id)
        .is("deleted_at", null)
        .is("superseded_at", null),
      "read document after sent",
    );
    expect(afterSent).toHaveLength(1);
    expect(afterSent[0]).toMatchObject({
      id: scenario.document.id,
      status: "sent",
    });
    expect(afterSent[0].sent_at).not.toBeNull();
    expect(afterSent[0].signed_at).toBeNull();

    await page.getByRole("button", { name: "Marquer comme reçu signé" }).click();
    await page.getByRole("button", { name: "Confirmer reçu signé" }).click();
    await expect(page).toHaveURL(
      new RegExp(`/documents/${scenario.document.id}\\?document_action_status=success`),
    );
    await expect(page.getByText("État actuel : Reçu signé")).toBeVisible();

    const afterSigned = expectSupabaseData(
      await supabase
        .from("documents")
        .select("id, status, sent_at, signed_at")
        .eq("reservation_id", scenario.journey.id)
        .is("deleted_at", null)
        .is("superseded_at", null),
      "read document after signed",
    );
    expect(afterSigned).toHaveLength(1);
    expect(afterSigned[0]).toMatchObject({
      id: scenario.document.id,
      status: "signed",
    });
    expect(afterSigned[0].sent_at).not.toBeNull();
    expect(afterSigned[0].signed_at).not.toBeNull();

    await registerActualDocumentEffects(sql, fixtures, {
      organizationId,
      reservationId: scenario.journey.id,
      contactId: scenario.contact.id,
      documentId: scenario.document.id,
    });

    await page.reload();
    await expect(page.getByRole("heading", { name: `Contrat pilote ${suffix}` })).toBeVisible();
    await expect(page.getByText("État actuel : Reçu signé")).toBeVisible();
    const afterReload = expectSupabaseData(
      await supabase
        .from("documents")
        .select("id, status")
        .eq("reservation_id", scenario.journey.id)
        .is("deleted_at", null)
        .is("superseded_at", null),
      "read document after reload",
    );
    expect(afterReload).toEqual([{ id: scenario.document.id, status: "signed" }]);
  });
});
