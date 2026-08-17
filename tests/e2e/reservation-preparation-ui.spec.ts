import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

import { withE2eFixtures } from "./helpers/fixtures/fixture-registry";
import {
  E2E_OWNER_EMAIL,
  E2E_OWNER_PASSWORD,
  runE2eSqlSync,
} from "./helpers/supabase";

test.setTimeout(120_000);

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const contactId = "70000000-0000-4000-8000-000000000008";
const applicationId = "80000000-0000-4000-8000-000000000006";
const reservationId = "90000000-0000-4000-8000-000000000003";
const paymentId = "a0000000-0000-4000-8000-000000000004";
const eventId = "98000000-0000-4000-8000-000000000001";
const sql = (statement: string) => runE2eSqlSync(statement);
const q = (value: string) => `'${value.replaceAll("'", "''")}'`;

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_OWNER_EMAIL);
  await page.getByLabel("Mot de passe").fill(E2E_OWNER_PASSWORD);
  await page.getByRole("button", { name: /connexion|se connecter/i }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });
}

test("ouvre la préparation guidée depuis le poste adoptants avec une preuve temporaire nettoyée", async ({
  page,
}) => {
  await withE2eFixtures(sql, async (fixtures) => {
    fixtures.register("candidate_journey_events", eventId);
    sql(`
      insert into public.candidate_journey_events (
        id,
        organization_id,
        application_id,
        contact_id,
        reservation_id,
        payment_id,
        event_type,
        actor_profile_id,
        actor_role,
        previous_state,
        current_state,
        details,
        client_command_id,
        occurred_at
      ) values (
        ${q(eventId)}::uuid,
        ${q(organizationId)}::uuid,
        ${q(applicationId)}::uuid,
        ${q(contactId)}::uuid,
        ${q(reservationId)}::uuid,
        ${q(paymentId)}::uuid,
        'candidate_first_payment_accepted',
        ${q(ownerId)}::uuid,
        'owner',
        '{}'::jsonb,
        '{}'::jsonb,
        '{"source":"reservation_preparation_ui_e2e"}'::jsonb,
        ${q(randomUUID())}::uuid,
        now()
      );
    `);

    await page.setViewportSize({ width: 1800, height: 1000 });
    await login(page);
    await page.goto(`/reservations?selected=${reservationId}`);

    const firstRow = page.locator("tbody tr").first();
    await expect(firstRow).toBeVisible();

    const panel = page.getByRole("complementary", {
      name: "Parcours adoptant sélectionné",
    });
    await panel.getByText("Documents", { exact: true }).click();
    await panel.getByRole("link", { name: "Préparer la réservation" }).click();

    await expect(page).toHaveURL(
      new RegExp(`/reservations/${reservationId}/preparer`),
      { timeout: 30_000 },
    );
    await expect(
      page.getByRole("heading", { name: "Préparer la réservation" }),
    ).toBeVisible();
    await expect(page.getByText("État financier", { exact: true })).toBeVisible();
    await expect(page.getByText("État documentaire", { exact: true })).toBeVisible();
    await expect(page.getByText("État contractuel", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Les deux PDF figés" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Montant et échéance relus" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Contenu éditorial conservé dans Brevo" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Contrôles avant envoi" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Email personnalisé en lecture seule" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Une confirmation, deux effets explicites" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Valider et envoyer via Brevo" }),
    ).toBeDisabled();
    if (process.env.E2E_CAPTURE_VISUAL === "1") {
      await page.screenshot({
        path: "/tmp/hermes-reservation-preparation@2x.png",
        animations: "disabled",
        fullPage: true,
      });
    }

    await page.getByRole("link", { name: /Retour au poste Parcours adoptants/ }).click();
    await expect(page).toHaveURL(new RegExp(`/reservations\\?.*selected=${reservationId}`));
  });

  expect(
    sql(`select count(*) from public.candidate_journey_events where id=${q(eventId)}::uuid;`),
  ).toBe("0");
});
