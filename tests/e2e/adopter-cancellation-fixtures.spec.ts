import { expect, test } from "@playwright/test";

import {
  createTestAdopterCancellationReadyScenario,
  registerActualCancellationEffects,
} from "./helpers/fixtures/adopter-cancellation-fixtures";
import {
  createTestAdopterJourney,
  createTestApplication,
  createTestContact,
} from "./helpers/fixtures/adopter-payment-fixtures";
import { createE2eFixtureRegistry } from "./helpers/fixtures/fixture-registry";

const ids = {
  org: "11111111-1111-4111-8111-111111111111",
  otherOrg: "12111111-1111-4111-8111-111111111111",
  owner: "21111111-1111-4111-8111-111111111111",
  contact: "31111111-1111-4111-8111-111111111111",
  journey: "71111111-1111-4111-8111-111111111111",
  role: "91111111-1111-4111-8111-111111111111",
  discoveredRole: "a1111111-1111-4111-8111-111111111111",
};

const executor = (calls: string[]) => async (statement: string) => {
  calls.push(statement);
  if (statement.includes("json_build_object")) {
    return JSON.stringify([
      {
        reservation_id: ids.journey,
        status: "cancelled",
        animal_id: null,
        role_id: ids.discoveredRole,
        payment_id: null,
        document_id: null,
      },
    ]);
  }
  return "0";
};

test("cancellation ready scenario seeds active journey without mutating inputs", async () => {
  const calls: string[] = [];
  const registry = createE2eFixtureRegistry(executor(calls), "cancellation-scenario");
  const input = {
    organizationId: ids.org,
    ownerId: ids.owner,
    displayName: "E2E cancellation stable",
  };
  const snapshot = JSON.stringify(input);
  const scenario = await createTestAdopterCancellationReadyScenario(
    executor(calls),
    registry,
    input,
  );
  expect(JSON.stringify(input)).toBe(snapshot);
  expect(scenario.journeyStatus).toBe("active");
  expect(registry.has("reservations", scenario.journey.id)).toBe(true);
  expect(registry.has("contacts", scenario.contact.id)).toBe(true);
  expect(registry.has("applications", scenario.application.id)).toBe(true);
  expect(registry.has("contact_roles", scenario.holderRoleId)).toBe(true);
  expect(calls.join("\n")).toContain("'active'");
  expect(calls.join("\n")).toContain("reservation_holder");
  expect(calls.some((call) => call.includes("insert into public.payments"))).toBe(
    false,
  );
  expect(calls.some((call) => call.includes("insert into public.documents"))).toBe(
    false,
  );
  expect(calls.some((call) => call.includes("insert into public.animals"))).toBe(
    false,
  );
});

test("cancellation scenario rejects incoherent foreign organization contact linkage", async () => {
  const calls: string[] = [];
  const registry = createE2eFixtureRegistry(executor(calls), "cancellation-invalid");
  await createTestContact(executor(calls), registry, {
    id: ids.contact,
    organizationId: ids.otherOrg,
    ownerId: ids.owner,
  });
  await expect(
    createTestApplication(executor(calls), registry, {
      organizationId: ids.org,
      contactId: ids.contact,
      ownerId: ids.owner,
    }),
  ).rejects.toThrow(/another organization/);
});

test("discovered cancellation effects register no parasites and preserve cleanup order", async () => {
  const calls: string[] = [];
  const registry = createE2eFixtureRegistry(executor(calls), "cancellation-effects");
  registry.register("contact_roles", ids.role);
  registry.register("reservations", ids.journey);
  registry.register("applications", "d1111111-1111-4111-8111-111111111111");
  registry.register("contacts", ids.contact);

  await registerActualCancellationEffects(executor(calls), registry, {
    organizationId: ids.org,
    reservationId: ids.journey,
    contactId: ids.contact,
  });
  expect(registry.has("contact_roles", ids.discoveredRole)).toBe(true);
  expect(registry.has("reservations", ids.journey)).toBe(true);

  const order = registry.cleanupOrder;
  expect(order.indexOf("documents")).toBeLessThan(order.indexOf("reservations"));
  expect(order.indexOf("payments")).toBeLessThan(order.indexOf("reservations"));
  expect(order.indexOf("contact_roles")).toBeLessThan(order.indexOf("contacts"));
  expect(order.indexOf("reservations")).toBeLessThan(order.indexOf("contacts"));

  await registry.cleanup();
  await registry.cleanup();
  const deleted = calls
    .filter((call) => call.includes("delete from"))
    .map((call) => call.match(/public\.([a-z_]+)/)?.[1]);
  expect(deleted.indexOf("contact_roles")).toBeLessThan(deleted.indexOf("contacts"));
  expect(deleted.indexOf("reservations")).toBeLessThan(deleted.indexOf("contacts"));
});

test("registry reports leftovers from contact_roles after cancellation discovery", async () => {
  const registry = createE2eFixtureRegistry(
    async (statement) => (statement.includes("public.contact_roles") ? "1" : "0"),
    "cancellation-leftover",
  );
  registry.register("contact_roles", ids.discoveredRole);
  await expect(registry.assertEmpty()).rejects.toThrow("contact_roles=1");
});

test("active journey fixture remains the cancel precondition without payments", async () => {
  const calls: string[] = [];
  const registry = createE2eFixtureRegistry(executor(calls), "cancellation-compat");
  const contact = await createTestContact(executor(calls), registry, {
    organizationId: ids.org,
    ownerId: ids.owner,
  });
  const application = await createTestApplication(executor(calls), registry, {
    organizationId: ids.org,
    contactId: contact.id,
    ownerId: ids.owner,
  });
  const journey = await createTestAdopterJourney(executor(calls), registry, {
    organizationId: ids.org,
    contactId: contact.id,
    applicationId: application.id,
    ownerId: ids.owner,
    status: "active",
  });
  expect(journey.id).toBeTruthy();
  expect(calls.join("\n")).toContain("'active'");
});
