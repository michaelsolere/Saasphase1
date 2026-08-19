import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

import { createTestAdopterNoteReadyScenario } from "./helpers/fixtures/adopter-note-fixtures";
import { createTestReceivedPayment } from "./helpers/fixtures/adopter-payment-fixtures";
import { createTestReservationNote } from "./helpers/fixtures/adopter-note-fixtures";
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
const displayName = "E2E chronologie unifiée";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_OWNER_EMAIL);
  await page.getByLabel("Mot de passe").fill(E2E_OWNER_PASSWORD);
  await page.getByRole("button", { name: /connexion|se connecter/i }).click();
  // Le conteneur auth peut être lent juste après le boot de la pile E2E.
  await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });
}

test("shows the unified chronology with collapsible email details and pagination", async ({
  page,
}) => {
  await withE2eFixtures(runE2eSql, async (fixtures) => {
    const scenario = await createTestAdopterNoteReadyScenario(runE2eSql, fixtures, {
      organizationId,
      ownerId,
      displayName,
    });

    await createTestReceivedPayment(runE2eSql, fixtures, {
      organizationId,
      ownerId,
      reservationId: scenario.journey.id,
      contactId: scenario.contact.id,
      amountCents: 25_000,
    });

    await createTestReservationNote(runE2eSql, fixtures, {
      organizationId,
      reservationId: scenario.journey.id,
      ownerId,
      body: "Note interne de recette chronologie.",
    });

    // 35 décisions de phase candidat : l'ouverture (preuve) + 34 événements pour dépasser la page de 30.
    const eventIds: string[] = [];
    for (let index = 0; index < 35; index += 1) {
      const eventId = randomUUID();
      eventIds.push(eventId);
      const occurredAt =
        index === 0
          ? `now() - interval '36 hours'`
          : `now() - interval '${index} hours'`;
      const eventType =
        index === 0
          ? "candidate_first_payment_accepted"
          : "candidate_positioning_updated";
      sql(`
        insert into public.candidate_journey_events (
          id, organization_id, application_id, contact_id, reservation_id,
          event_type, actor_profile_id, actor_role, client_command_id,
          previous_state, current_state, details, occurred_at
        ) values (
          ${q(eventId)}::uuid, ${q(organizationId)}::uuid,
          ${q(scenario.application.id)}::uuid, ${q(scenario.contact.id)}::uuid,
          ${q(scenario.journey.id)}::uuid, ${q(eventType)},
          ${q(ownerId)}::uuid, 'owner', ${q(randomUUID())}::uuid,
          '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, ${occurredAt}
        );
      `);
      fixtures.register("candidate_journey_events", eventId);
    }

    // Un email envoyé récent, avec détails techniques repliables.
    const emailId = randomUUID();
    sql(`
      insert into public.email_delivery_attempts (
        id, organization_id, contact_id, reservation_id, message_type,
        recipient_email, recipient_name, subject_snapshot, variables_snapshot,
        idempotency_key, status, attempt_count, created_by, sent_at, created_at
      ) values (
        ${q(emailId)}::uuid, ${q(organizationId)}::uuid,
        ${q(scenario.contact.id)}::uuid, ${q(scenario.journey.id)}::uuid,
        'pre_reservation_invitation', 'famille@example.test', 'Famille E2E',
        'Invitation à la pré-réservation', '{}'::jsonb,
        ${q(emailId)}::uuid, 'sent', 1, ${q(ownerId)}::uuid,
        now() - interval '2 hours', now() - interval '2 hours'
      );
    `);
    fixtures.register("email_delivery_attempts", emailId);

    // Un échange manuel récent.
    const manualContactId = randomUUID();
    sql(`
      insert into public.adopter_manual_contacts (
        id, organization_id, reservation_id, contact_id, channel, summary,
        contacted_at, actor_profile_id, actor_role, client_command_id
      ) values (
        ${q(manualContactId)}::uuid, ${q(organizationId)}::uuid,
        ${q(scenario.journey.id)}::uuid, ${q(scenario.contact.id)}::uuid,
        'phone', 'Appel au sujet du choix du chiot.',
        now() - interval '90 minutes', ${q(ownerId)}::uuid, 'owner',
        ${q(randomUUID())}::uuid
      );
    `);
    fixtures.register("adopter_manual_contacts", manualContactId);

    await login(page);
    await page.goto(`/reservations?view=current&selected=${scenario.journey.id}`);

    // Le panneau est rendu deux fois (une copie cachée pour l'accessibilité) :
    // toutes les assertions sont scopées sur le dialogue visible.
    const panel = page.getByRole("dialog", {
      name: `Parcours adoptant de ${displayName}`,
    });

    // La section « Chronologie » remplace « Activité récente ».
    await expect(panel.getByText("Chronologie", { exact: true })).toBeVisible();
    await expect(page.getByText("Activité récente")).toHaveCount(0);

    // Pagination : 30 entrées visibles, bouton « Afficher plus ».
    const entries = panel.locator('[data-testid="journey-chronology"] > li');
    await expect(entries).toHaveCount(30);
    const showMore = panel.getByTestId("chronology-show-more");
    await expect(showMore).toBeVisible();
    await expect(showMore).toContainText("Afficher plus (9)");

    // Les entrées récentes sont visibles avant expansion.
    await expect(entries.filter({ hasText: "Note interne" })).toBeVisible();
    await expect(entries.filter({ hasText: "Échange manuel · Appel" })).toBeVisible();
    await expect(
      entries.filter({ hasText: "Invitation à la pré-réservation" }),
    ).toBeVisible();

    // Déplier les détails techniques de l'email.
    const emailEntry = entries.filter({ hasText: "Invitation à la pré-réservation" });
    await expect(emailEntry.locator("span").getByText("Envoyé", { exact: true })).toBeVisible();
    await emailEntry.getByText("Détails techniques").click();
    await expect(emailEntry.getByText("Destinataire")).toBeVisible();
    await expect(emailEntry.getByText("famille@example.test")).toBeVisible();
    await expect(emailEntry.getByText("Envoyé le")).toBeVisible();
    await expect(emailEntry.getByText("Tentatives")).toBeVisible();
    await expect(emailEntry.getByText("1", { exact: true })).toBeVisible();

    // Afficher plus révèle les entrées plus anciennes (39 au total).
    await showMore.click();
    await expect(entries).toHaveCount(39);
    await expect(entries.filter({ hasText: "Premier versement accepté" })).toBeVisible();
    await expect(entries.filter({ hasText: "Paiement · paid" })).toBeVisible();

    await panel
      .getByTestId("journey-chronology")
      .screenshot({ path: "/tmp/unified-journey-history-chronology-2x.png" });
    await panel.screenshot({ path: "/tmp/unified-journey-history-panel-2x.png" });

    // Le formulaire « Communications » reste fonctionnel après l'arrivée de la chronologie.
    await panel.getByText("Communications", { exact: true }).click();
    await panel.getByLabel("Canal").selectOption("sms");
    await panel.getByLabel("Résumé").fill("SMS de confirmation de recette.");
    await panel.getByRole("button", { name: "Tracer le contact manuel" }).click();
    // La page normalise l'URL après le retour de l'action : la preuve de succès
    // est l'apparition du nouvel échange dans la chronologie, pas le paramètre.
    await expect(
      panel.locator('[data-testid="journey-chronology"]').filter({ hasText: "Échange manuel · SMS" }),
    ).toBeVisible({ timeout: 20_000 });

    // L'échange créé via l'interface doit être enregistré pour le nettoyage final.
    const createdManualContactIds = JSON.parse(
      sql(`
        select coalesce(json_agg(id order by created_at desc), '[]'::json)::text
        from public.adopter_manual_contacts
        where organization_id = ${q(organizationId)}::uuid
          and summary = 'SMS de confirmation de recette.';
      `),
    ) as string[];
    for (const id of createdManualContactIds) {
      if (!fixtures.has("adopter_manual_contacts", id)) {
        fixtures.register("adopter_manual_contacts", id);
      }
    }

    const remaining = await fixtures.counts();
    expect(remaining.candidate_journey_events ?? 0).toBe(eventIds.length);
  });
});
