import { expect, test } from "@playwright/test";

import {
  createTestAdopterDocument,
  createTestAdopterDocumentScenario,
  registerActualDocumentEffects,
} from "./helpers/fixtures/adopter-document-fixtures";
import {
  createTestApplication,
  createTestContact,
  createTestAdopterJourney,
  createTestExpectedPayment,
} from "./helpers/fixtures/adopter-payment-fixtures";
import { createE2eFixtureRegistry } from "./helpers/fixtures/fixture-registry";

const ids = {
  org: "11111111-1111-4111-8111-111111111111",
  otherOrg: "12111111-1111-4111-8111-111111111111",
  owner: "21111111-1111-4111-8111-111111111111",
  contact: "31111111-1111-4111-8111-111111111111",
  otherContact: "32111111-1111-4111-8111-111111111111",
  group: "41111111-1111-4111-8111-111111111111",
  litter: "51111111-1111-4111-8111-111111111111",
  application: "61111111-1111-4111-8111-111111111111",
  journey: "71111111-1111-4111-8111-111111111111",
  document: "81111111-1111-4111-8111-111111111111",
  payment: "91111111-1111-4111-8111-111111111111",
};

const executor = (calls: string[]) => async (statement: string) => {
  calls.push(statement);
  if (statement.includes("json_build_object('document_id'")) {
    return JSON.stringify([{ document_id: ids.document }]);
  }
  return "0";
};

test("adopter document fixtures preserve relationships, explicit IDs and to_generate insert", async () => {
  const calls: string[] = [];
  const registry = createE2eFixtureRegistry(executor(calls), "adopter-document-fixture");
  const contactInput = {
    id: ids.contact,
    organizationId: ids.org,
    ownerId: ids.owner,
    displayName: "E2E Document Contact",
  };
  const snapshot = JSON.stringify(contactInput);
  await createTestContact(executor(calls), registry, contactInput);
  expect(JSON.stringify(contactInput)).toBe(snapshot);

  registry.register("litter_groups", ids.group);
  registry.register("litters", ids.litter);
  const application = await createTestApplication(executor(calls), registry, {
    id: ids.application,
    organizationId: ids.org,
    contactId: ids.contact,
    ownerId: ids.owner,
    litterGroupId: ids.group,
    litterId: ids.litter,
  });
  const journey = await createTestAdopterJourney(executor(calls), registry, {
    id: ids.journey,
    organizationId: ids.org,
    contactId: ids.contact,
    applicationId: application.id,
    ownerId: ids.owner,
    litterGroupId: ids.group,
    litterId: ids.litter,
    status: "active",
  });
  const documentInput = {
    id: ids.document,
    organizationId: ids.org,
    contactId: ids.contact,
    reservationId: journey.id,
    applicationId: application.id,
    ownerId: ids.owner,
    title: "Contrat E2E",
  };
  const documentSnapshot = JSON.stringify(documentInput);
  const document = await createTestAdopterDocument(executor(calls), registry, documentInput);
  expect(JSON.stringify(documentInput)).toBe(documentSnapshot);
  expect(document).toEqual({
    id: ids.document,
    organizationId: ids.org,
    contactId: ids.contact,
    reservationId: ids.journey,
    applicationId: ids.application,
    documentType: "reservation_contract",
    status: "to_generate",
  });
  expect(calls.join("\n")).toContain("generated_from_template");
  expect(calls.join("\n")).toContain("false");
  expect(calls.join("\n")).toContain("to_generate");
  expect(calls.join("\n")).not.toContain("template_id");
});

test("adopter document fixtures reject mismatched organizations and preserve journey coherence", async () => {
  const calls: string[] = [];
  const registry = createE2eFixtureRegistry(executor(calls), "adopter-document-invalid");
  await createTestContact(executor(calls), registry, {
    id: ids.contact,
    organizationId: ids.org,
    ownerId: ids.owner,
  });
  await createTestContact(executor(calls), registry, {
    id: ids.otherContact,
    organizationId: ids.otherOrg,
    ownerId: ids.owner,
  });
  registry.register("litter_groups", ids.group);
  registry.register("litters", ids.litter);
  const application = await createTestApplication(executor(calls), registry, {
    id: ids.application,
    organizationId: ids.org,
    contactId: ids.contact,
    ownerId: ids.owner,
    litterGroupId: ids.group,
    litterId: ids.litter,
  });
  await createTestAdopterJourney(executor(calls), registry, {
    id: ids.journey,
    organizationId: ids.org,
    contactId: ids.contact,
    applicationId: application.id,
    ownerId: ids.owner,
    litterGroupId: ids.group,
    litterId: ids.litter,
    status: "active",
  });

  await expect(
    createTestAdopterDocument(executor(calls), registry, {
      organizationId: ids.org,
      contactId: ids.otherContact,
      reservationId: ids.journey,
      ownerId: ids.owner,
    }),
  ).rejects.toThrow(/another organization/);

  await expect(
    createTestAdopterDocument(executor(calls), registry, {
      organizationId: ids.org,
      contactId: ids.contact,
      reservationId: "72111111-1111-4111-8111-111111111111",
      ownerId: ids.owner,
    }),
  ).rejects.toThrow(/adopter journey or contact/);
});

test("discovered document effects are registered and cleanup covers documents before payments", async () => {
  const calls: string[] = [];
  const registry = createE2eFixtureRegistry(executor(calls), "adopter-document-effects");
  registry.register("documents", ids.document);
  registry.register("payments", ids.payment);
  registry.register("reservations", ids.journey);
  registry.register("applications", ids.application);
  registry.register("contacts", ids.contact);
  registry.register("litter_groups", ids.group);
  registry.register("litters", ids.litter);

  await registerActualDocumentEffects(executor(calls), registry, {
    organizationId: ids.org,
    reservationId: ids.journey,
    contactId: ids.contact,
    documentId: ids.document,
  });
  expect(registry.has("documents", ids.document)).toBe(true);
  expect(registry.cleanupOrder.slice(0, 6)).toEqual([
    "documents",
    "payments",
    "contact_roles",
    "reservations",
    "applications",
    "contacts",
  ]);

  await registry.cleanup();
  await registry.cleanup();
  const deletedTables = calls
    .filter((call) => call.startsWith("delete"))
    .map((call) => call.match(/public\.([a-z_]+)/)?.[1]);
  expect(deletedTables.indexOf("documents")).toBeLessThan(deletedTables.indexOf("payments"));
  expect(deletedTables.indexOf("documents")).toBeLessThan(deletedTables.indexOf("reservations"));
  expect(deletedTables).toContain("litter_groups");
});

test("registry reports leftovers from documents", async () => {
  const registry = createE2eFixtureRegistry(
    async (statement) => (statement.includes("public.documents") ? "1" : "0"),
    "adopter-document-leftover",
  );
  registry.register("documents", ids.document);
  await expect(registry.assertEmpty()).rejects.toThrow("documents=1");
});

test("document scenario stays compatible with payment fixtures without mutating inputs", async () => {
  const calls: string[] = [];
  const registry = createE2eFixtureRegistry(executor(calls), "adopter-document-scenario");
  const input = {
    organizationId: ids.org,
    ownerId: ids.owner,
    displayName: "E2E document stable",
    title: "Contrat stable",
  };
  const snapshot = JSON.stringify(input);
  const scenario = await createTestAdopterDocumentScenario(executor(calls), registry, input);
  expect(JSON.stringify(input)).toBe(snapshot);

  const paymentInput = {
    organizationId: ids.org,
    contactId: scenario.contact.id,
    reservationId: scenario.journey.id,
    ownerId: ids.owner,
    amountCents: 25_000,
  };
  const paymentSnapshot = JSON.stringify(paymentInput);
  const payment = await createTestExpectedPayment(executor(calls), registry, {
    ...paymentInput,
    id: ids.payment,
  });
  expect(JSON.stringify(paymentInput)).toBe(paymentSnapshot);
  expect(registry.has("documents", scenario.document.id)).toBe(true);
  expect(registry.has("payments", payment.id)).toBe(true);
  expect(registry.has("reservations", scenario.journey.id)).toBe(true);
  expect(registry.has("contacts", scenario.contact.id)).toBe(true);
});
