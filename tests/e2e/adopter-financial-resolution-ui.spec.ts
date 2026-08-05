import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

import { createTestAdopterCancellationReadyScenario } from "./helpers/fixtures/adopter-cancellation-fixtures";
import { createTestReceivedPayment } from "./helpers/fixtures/adopter-payment-fixtures";
import { registerActualRefundEffects } from "./helpers/fixtures/adopter-refund-fixtures";
import { withE2eFixtures } from "./helpers/fixtures/fixture-registry";
import {
  E2E_OWNER_EMAIL,
  E2E_OWNER_PASSWORD,
  runE2eSql,
  runE2eSqlSync,
} from "./helpers/supabase";

test.setTimeout(300_000);
test.use({ deviceScaleFactor: 2 });

const sql = (statement: string) => runE2eSqlSync(statement);
const q = (value: string) => `'${value.replaceAll("'", "''")}'`;
const ownerId = "10000000-0000-4000-8000-000000000001";
const organizationId = "20000000-0000-4000-8000-000000000001";

function jsonSql(statement: string) {
  const line = sql(statement)
    .split(/\r?\n/)
    .find((value) => value.trimStart().startsWith("{"));
  if (!line) throw new Error("Expected a JSON SQL result");
  return JSON.parse(line) as Record<string, unknown>;
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_OWNER_EMAIL);
  await page.getByLabel("Mot de passe").fill(E2E_OWNER_PASSWORD);
  await page.getByRole("button", { name: /connexion|se connecter/i }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

async function registerResolutionEvents(
  fixtures: Parameters<Parameters<typeof withE2eFixtures>[1]>[0],
  reservationId: string,
) {
  const eventIds = JSON.parse(
    sql(`
      select coalesce(json_agg(id order by occurred_at), '[]'::json)::text
      from public.adopter_financial_resolution_events
      where reservation_id = ${q(reservationId)}::uuid;
    `),
  ) as string[];
  for (const eventId of eventIds) {
    if (!fixtures.has("adopter_financial_resolution_events", eventId)) {
      fixtures.register("adopter_financial_resolution_events", eventId);
    }
  }
}

test("lets an owner resolve a negative journey from the product interface", async ({
  page,
}) => {
  await withE2eFixtures(runE2eSql, async (fixtures) => {
    const scenario = await createTestAdopterCancellationReadyScenario(
      runE2eSql,
      fixtures,
      {
        organizationId,
        ownerId,
        displayName: "E2E UI résolution financière",
      },
    );
    await createTestReceivedPayment(runE2eSql, fixtures, {
      organizationId,
      ownerId,
      reservationId: scenario.journey.id,
      contactId: scenario.contact.id,
      amountCents: 25_000,
    });
    const expectedUpdatedAt = sql(`
      select updated_at::text
      from public.reservations
      where id = ${q(scenario.journey.id)}::uuid;
    `).trim();
    const opened = jsonSql(`
      begin;
      set local role authenticated;
      set local request.jwt.claim.sub = ${q(ownerId)};
      select json_build_object(
        'event_id', response.event_id,
        'outcome', response.outcome
      )::text
      from public.transition_adopter_journey_exit(
        ${q(scenario.journey.id)}::uuid,
        ${q(randomUUID())}::uuid,
        'withdrawn',
        ${q(expectedUpdatedAt)}::timestamptz
      ) response;
      commit;
    `);
    expect(opened.outcome).toBe("success");
    fixtures.register(
      "adopter_financial_resolution_events",
      String(opened.event_id),
    );

    try {
      await login(page);
      await page.goto(`/reservations/${scenario.journey.id}#financial-resolution`);

      const section = page.locator("#financial-resolution");
      await expect(section).toBeVisible();
      await expect(section).toContainText("Résolution financière à traiter");
      await expect(section.getByText("Reste à décider", { exact: true })).toBeVisible();
      await expect(section).toContainText("250,00 €");
      await section.screenshot({
        path: "/tmp/adopter-financial-resolution-pending-2x.png",
      });

      await section.getByLabel("Décision finale").selectOption("partial_refund");
      await section.getByLabel("Montant remboursé maintenant").fill("100,00");
      await section.getByLabel("Moyen").selectOption("bank_transfer");
      await section.getByLabel("Date réelle").fill(
        new Date().toISOString().slice(0, 10),
      );
      await section
        .getByLabel("Motif financier obligatoire")
        .fill("Remboursement partiel validé depuis la fiche adoptant.");
      await section
        .getByRole("button", { name: "Finaliser la résolution" })
        .click();

      await expect
        .poll(
          () =>
            sql(`
              select financial_resolution
              from public.reservations
              where id = ${q(scenario.journey.id)}::uuid;
            `).trim(),
          { timeout: 20_000 },
        )
        .toBe("partial_refund");
      await page.reload();
      await expect(section).toContainText("Remboursement partiel — solde conservé");
      await expect(section.getByText("Somme conservée", { exact: true })).toBeVisible();
      await expect(section).toContainText(
        "Remboursement partiel validé depuis la fiche adoptant.",
      );
      await section.screenshot({
        path: "/tmp/adopter-financial-resolution-resolved-2x.png",
      });

      const persisted = jsonSql(`
        select json_build_object(
          'status', financial_resolution,
          'refunds', (
            select count(*)::integer
            from public.payments
            where reservation_id = ${q(scenario.journey.id)}::uuid
              and payment_type in ('refund', 'partial_refund')
              and status = 'paid'
              and deleted_at is null
          )
        )::text
        from public.reservations
        where id = ${q(scenario.journey.id)}::uuid;
      `);
      expect(persisted).toEqual({ status: "partial_refund", refunds: 1 });
    } finally {
      await registerActualRefundEffects(runE2eSql, fixtures, {
        organizationId,
        reservationId: scenario.journey.id,
        contactId: scenario.contact.id,
      });
      await registerResolutionEvents(fixtures, scenario.journey.id);
    }
  });
});
