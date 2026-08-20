import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

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

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_OWNER_EMAIL);
  await page.getByLabel("Mot de passe").fill(E2E_OWNER_PASSWORD);
  await page.getByRole("button", { name: /connexion|se connecter/i }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

const healthEventTypes = ["vaccination", "xray", "ultrasound", "pregnancy_check"];
const eventStatuses = [
  "planned",
  "todo",
  "in_progress",
  "done",
  "late",
  "cancelled",
  "postponed",
  "not_applicable",
];
const documentTypes = [
  "veterinary_certificate",
  "birth_certificate",
  "sale_certificate",
];
const documentStatuses = ["generated", "sent", "received"];
const noteTypes = ["internal", "health", "call_summary"];

test("affiche la chronologie unifiée sur la fiche animal avec pagination", async ({
  page,
}) => {
  await withE2eFixtures(runE2eSql, async (fixtures) => {
    const animalId = randomUUID();
    fixtures.register("animals", animalId);

    const eventCount = 35;
    const eventRows: string[] = [];
    for (let index = 0; index < eventCount; index += 1) {
      const eventId = randomUUID();
      fixtures.register("events", eventId);
      const eventType =
        index < healthEventTypes.length
          ? healthEventTypes[index]
          : index % 2 === 0
            ? "vaccination"
            : "other";
      const status = eventStatuses[index % eventStatuses.length];
      const actualAt = new Date(Date.UTC(2026, 7, 1, 12, 0, index)).toISOString();
      eventRows.push(
        `(${q(eventId)}::uuid, ${q(organizationId)}::uuid, ${q(animalId)}::uuid, ${q(eventType)}, ${q(`Historique animal e2e ${index + 1}`)}, ${q("Description de l'événement")}, ${q(actualAt)}::timestamptz, null, ${q(actualAt)}::timestamptz, ${q(status)}, 'normal', false, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid)`,
      );
    }

    const noteRows: string[] = [];
    for (let index = 0; index < noteTypes.length; index += 1) {
      const noteId = randomUUID();
      fixtures.register("notes", noteId);
      const noteType = noteTypes[index];
      const createdAt = new Date(Date.UTC(2026, 7, 1, 11, 0, index)).toISOString();
      noteRows.push(
        `(${q(noteId)}::uuid, ${q(organizationId)}::uuid, ${q(animalId)}::uuid, null, null, null, null, ${q(noteType)}, ${q(`Note animal e2e ${index + 1}`)}, ${q(`Corps de la note ${noteType}`)}, 'internal', ${q(createdAt)}::timestamptz, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid)`,
      );
    }

    const documentRows: string[] = [];
    for (let index = 0; index < documentTypes.length; index += 1) {
      const documentId = randomUUID();
      fixtures.register("documents", documentId);
      const documentType = documentTypes[index];
      const status = documentStatuses[index];
      const createdAt = new Date(Date.UTC(2026, 7, 1, 10, 0, index)).toISOString();
      documentRows.push(
        `(${q(documentId)}::uuid, ${q(organizationId)}::uuid, null, null, null, ${q(animalId)}::uuid, null, ${q(documentType)}, ${q(status)}, ${q(`Document animal e2e ${index + 1}`)}, false, ${q(createdAt)}::timestamptz, ${q(createdAt)}::timestamptz, null, null, null, null, null, null, null, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid)`,
      );
    }

    sql(`
      insert into public.animals (
        id, organization_id, call_name, species, breed, sex,
        status, ownership_status, created_by, updated_by
      ) values (
        ${q(animalId)}::uuid, ${q(organizationId)}::uuid,
        'Historique animal e2e', 'dog', 'Golden Retriever', 'male',
        'active', 'owned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
      );

      insert into public.events (
        id, organization_id, animal_id, event_type, title, description,
        planned_at, planned_date, actual_at, status, priority, is_task,
        created_by, updated_by
      ) values ${eventRows.join(", ")};

      insert into public.notes (
        id, organization_id, animal_id, contact_id, application_id,
        reservation_id, payment_id, note_type, title, body, visibility,
        created_at, created_by, updated_by
      ) values ${noteRows.join(", ")};

      insert into public.documents (
        id, organization_id, contact_id, reservation_id, application_id,
        animal_id, litter_id, document_type, status, title, signature_required,
        created_at, updated_at, sent_at, signed_at, received_at, file_path,
        file_name, mime_type, file_size_bytes,
        created_by, updated_by
      ) values ${documentRows.join(", ")};
    `);

    try {
      await login(page);
      await page.goto(`/animals/${animalId}`);

      const section = page.locator('[data-testid="animal-history-section"]');
      await expect(section).toBeVisible();
      await expect(section).toContainText("Historique");

      const list = section.locator('[data-testid="animal-history-list"]');
      await expect(list).toBeVisible();

      // Avant le clic « Afficher plus » : seuls les 30 premiers événements sont visibles.
      await expect(section.getByText("Santé", { exact: true }).first()).toBeVisible();
      await expect(section.getByText("Événement", { exact: true }).first()).toBeVisible();
      await expect(section.getByText("Historique animal e2e 35")).toBeVisible();

      const showMore = section.locator('[data-testid="animal-history-show-more"]');
      await expect(showMore).toBeVisible();

      await section.screenshot({
        path: "/tmp/animal-history-initial-2x.png",
      });

      await showMore.click();

      // Après le clic : toutes les entrées sont visibles (notes, documents, dernier événement).
      await expect(section.getByText("Note", { exact: true }).first()).toBeVisible();
      await expect(section.getByText("Document", { exact: true }).first()).toBeVisible();
      await expect(section.getByText("Note interne")).toBeVisible();
      await expect(section.getByText("Certificat vétérinaire")).toBeVisible();
      await expect(section.getByText("Historique animal e2e 1", { exact: true })).toBeVisible();
      await expect(showMore).not.toBeVisible();

      await section.screenshot({
        path: "/tmp/animal-history-expanded-2x.png",
      });

      await expect(page.getByRole("heading", { name: "Santé" }).first()).toBeVisible();
      await expect(page.getByRole("heading", { name: "Événements liés" }).first()).toBeVisible();
      await expect(page.getByRole("heading", { name: "Notes liées" }).first()).toBeVisible();
      await expect(page.getByRole("heading", { name: "Documents liés" }).first()).toBeVisible();
    } finally {
      // Cleanup est géré automatiquement par withE2eFixtures.
    }
  });
});
