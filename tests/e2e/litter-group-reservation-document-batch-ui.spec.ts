import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

const root = resolve(process.cwd());
const page = readFileSync(resolve(root, "src/app/litter-groups/[id]/page.tsx"), "utf8");
const section = readFileSync(resolve(root, "src/features/litters/litter-group-reservation-document-batch-section.tsx"), "utf8");
const panel = readFileSync(resolve(root, "src/features/litters/litter-group-reservation-document-batch-panel.tsx"), "utf8");

test("garde-fou provisoire : ordre JSX et périmètre serveur du groupe", () => {
  const reservations = page.indexOf('id="reservations-liees"');
  const generation = page.lastIndexOf("LitterGroupReservationDocumentBatchSection");
  const campaigns = page.indexOf("Campagnes d’e-mails");
  expect(reservations).toBeGreaterThan(-1);
  expect(reservations).toBeLessThan(generation);
  expect(generation).toBeLessThan(campaigns);
  expect(page).not.toMatch(/\border-[345]\b/);
  expect(section).toContain("classifyLitterGroupDocumentBatchReservations");
  expect(section).toContain("litter_group_id.eq.${group.id},litter_id.in.");
  expect(section).toContain("const reservationLitterIds");
  expect(section).toContain("exactLittersResult");
  expect(section).toContain("classificationLitters");
  expect(section).toContain(".eq(\"organization_id\", group.organization_id)");
  expect(section).toContain('.order("created_at", { ascending: true })');
  expect(section).toContain('.order("id", { ascending: true })');
  expect(section).toContain('WRITABLE_ROLES.has(membershipResult.data.role)');
  expect(panel).toContain("readOnly = false");
  expect(panel).toContain("Cette fonctionnalité est disponible en lecture seule");
  expect(panel).toContain('name="batch_confirmation"');
  expect(panel).toContain('"reservation_ids[]"');
  expect(panel).toContain('name="taxonomy_template_selections[]"');
  for (const forbidden of ["organization_id", "litter_group_id", "operation_id", "captured_at", "litter_id", "species", "breed", "document_id", "variant_id", "storage_path"]) {
    expect(panel).not.toContain(`name="${forbidden}"`);
  }
});

test("contrat UI groupe : limite globale, confirmation et rejeu fidèle", () => {
  expect(panel).toContain("const MAX_SELECTION = 30");
  expect(panel).toContain("eligibleIds.slice(0, MAX_SELECTION)");
  expect(panel).toContain("AlertDialog");
  expect(panel).toContain("Aucun e-mail, paiement, remplacement ou nouvelle version automatique");
  expect(panel).toContain("const actionRef = useRef(action)");
  expect(panel).toContain("const [reservations] = useState(() => inputReservations)");
  expect(panel).toContain("Rejouer exactement cette opération");
  expect(panel).toContain("Nouvelle opération");
  expect(panel).toContain("Sous-totaux par portée");
});
