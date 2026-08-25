import { expect, test, type Page } from "@playwright/test";

import { createTestOrganization } from "./helpers/fixtures/breeding-fixtures";
import {
  createTestContact,
  createTestApplication,
  createTestAdopterJourney,
} from "./helpers/fixtures/adopter-payment-fixtures";
import {
  RESERVATION_NOTE_TYPE,
  RESERVATION_NOTE_VISIBILITY,
} from "./helpers/fixtures/adopter-note-fixtures";
import { withE2eFixtures } from "./helpers/fixtures/fixture-registry";
import {
  E2E_OWNER_EMAIL,
  E2E_OWNER_PASSWORD,
  runE2eSqlSync,
} from "./helpers/supabase";

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const sql = (statement: string) => runE2eSqlSync(statement);

const q = (value: string) => `'${value.replaceAll("'", "''")}'`;

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_OWNER_EMAIL);
  await page.getByLabel("Mot de passe").fill(E2E_OWNER_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

test("veterinarian contact shows a chronology and hides empty journey sections", async ({ page }) => {
  test.setTimeout(90_000);
  await withE2eFixtures(sql, async (fixtures) => {
    const suffix = fixtures.namespace.slice(-8);
    const org = await createTestOrganization(sql, fixtures, {
      name: `E2E contact-360 vétérinaire ${suffix}`,
    });
    void org;

    const contactId = crypto.randomUUID();
    const vetName = `Vétérinaire ${suffix}`;
    await sql(`insert into public.contacts (
        id, organization_id, contact_type, first_name, last_name, display_name,
        email, origin_channel, primary_status, created_by, updated_by
      ) values (
        '${contactId}'::uuid, '${organizationId}'::uuid, 'person', 'Dr E2E', ${q(vetName)},
        ${q(`Dr E2E ${vetName}`)}, ${q(`vet-${suffix}@example.invalid`)}, 'manual', 'active',
        '${ownerId}'::uuid, '${ownerId}'::uuid
      )`);
    fixtures.register("contacts", contactId);

    const noteId = crypto.randomUUID();
    await sql(`insert into public.notes (id, organization_id, contact_id, note_type, body, visibility, created_by)
      values ('${noteId}'::uuid, '${organizationId}'::uuid, '${contactId}'::uuid, '${RESERVATION_NOTE_TYPE}',
      ${q("Vaccination de rappel planifiée pour le troupeau.")}, '${RESERVATION_NOTE_VISIBILITY}', '${ownerId}'::uuid)`);
    fixtures.register("notes", noteId);

    const eventId = crypto.randomUUID();
    await sql(`insert into public.events (id, organization_id, contact_id, event_type, title, description, planned_at, status, priority, is_task, created_by)
      values ('${eventId}'::uuid, '${organizationId}'::uuid, '${contactId}'::uuid, 'vaccination', 'Visite vétérinaire', null,
      '2026-08-20T09:00:00Z', 'planned', 'normal', false, '${ownerId}'::uuid)`);
    fixtures.register("events", eventId);

    await login(page);
    await page.goto(`/contacts/${contactId}`);

    await expect(page.getByText(`Dr E2E Vétérinaire ${suffix}`)).toBeVisible();

    // Chronology present with both sources aggregated. The kind badge and the
    // entry label can share the same wording: assert on first occurrences.
    const chronology = page.getByTestId("contact-chronology");
    await expect(chronology).toBeVisible();
    await expect(chronology.getByText("Note interne").first()).toBeVisible();
    await expect(chronology.getByText("Visite vétérinaire")).toBeVisible();
    await expect(chronology.getByText("Vaccination de rappel planifiée pour le troupeau.")).toBeVisible();

    // Journey-only sections stay hidden for a contact outside the adopter journey.
    await expect(page.getByText("Dossiers parcours adoptant")).toHaveCount(0);
    await expect(page.getByTestId("journey-dossier-card")).toHaveCount(0);
    await expect(page.getByText("Aucune réservation liée à ce contact.")).toHaveCount(0);
    await expect(page.getByText("Aucun paiement lié")).toHaveCount(0);
    await expect(page.getByText("Aucun document lié")).toHaveCount(0);

    // Final count-based verification of the fixture cleanup.
    await fixtures.cleanup();
    const counts = await fixtures.counts();
    for (const [table, count] of Object.entries(counts)) {
      expect(count, `${table} rows remaining`).toBe(0);
    }
  });
});

test("prospect contact with a journey dossier shows dossier cards instead of a chronology", async ({ page }) => {
  test.setTimeout(120_000);
  await withE2eFixtures(sql, async (fixtures) => {
    const suffix = fixtures.namespace.slice(-8);
    const contact = await createTestContact(sql, fixtures, {
      organizationId,
      ownerId,
      displayName: `E2E famille prospect ${suffix}`,
    });
    const application = await createTestApplication(sql, fixtures, {
      organizationId,
      contactId: contact.id,
      ownerId,
    });
    const journey = await createTestAdopterJourney(sql, fixtures, {
      id: crypto.randomUUID(),
      organizationId,
      contactId: contact.id,
      applicationId: application.id,
      ownerId,
      status: "active",
    });

    await login(page);
    await page.goto(`/contacts/${contact.id}`);

    // Journey mode: link cards first, no duplicated chronology.
    const dossiers = page.getByTestId("journey-dossiers");
    await expect(dossiers).toBeVisible();
    const card = page.getByTestId("journey-dossier-card");
    await expect(card).toHaveCount(1);
    await expect(card).toContainText("Dossier en cours");

    await expect(page.getByTestId("contact-chronology")).toHaveCount(0);

    // The card links to the reservation dossier. The first visit of the
    // reservations detail page compiles on demand in dev: allow a generous
    // navigation timeout before asserting the destination URL.
    await card.first().click();
    await expect(page).toHaveURL(new RegExp(`/reservations/${journey.id}`), {
      timeout: 60_000,
    });

    await fixtures.cleanup();
    const counts = await fixtures.counts();
    for (const [table, count] of Object.entries(counts)) {
      expect(count, `${table} rows remaining`).toBe(0);
    }
  });
});
