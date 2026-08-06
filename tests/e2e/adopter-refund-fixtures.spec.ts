import { expect, test } from "@playwright/test";

import {
  createTestAdopterRefundReadyScenario,
  registerActualRefundEffects,
} from "./helpers/fixtures/adopter-refund-fixtures";
import {
  createTestAdopterJourney,
  createTestApplication,
  createTestContact,
  createTestReceivedPayment,
} from "./helpers/fixtures/adopter-payment-fixtures";
import {
  createE2eFixtureRegistry,
  extractFixtureDeleteOrder,
} from "./helpers/fixtures/fixture-registry";

const ids = {
  org: "11111111-1111-4111-8111-111111111111",
  otherOrg: "12111111-1111-4111-8111-111111111111",
  owner: "21111111-1111-4111-8111-111111111111",
  contact: "31111111-1111-4111-8111-111111111111",
  journey: "71111111-1111-4111-8111-111111111111",
  payment: "81111111-1111-4111-8111-111111111111",
  refund: "82111111-1111-4111-8111-111111111111",
  role: "91111111-1111-4111-8111-111111111111",
  discoveredRole: "a1111111-1111-4111-8111-111111111111",
};

const executor = (calls: string[]) => async (statement: string) => {
  calls.push(statement);
  if (statement.includes("json_build_object") && statement.includes("'refund'")) {
    return JSON.stringify([
      {
        payment_id: ids.refund,
        payment_type: "refund",
        amount_cents: 10_000,
        status: "paid",
        role_id: ids.discoveredRole,
        document_id: null,
        animal_id: null,
      },
    ]);
  }
  return "0";
};

test("refund ready scenario seeds active journey with one received payment without mutating inputs", async () => {
  const calls: string[] = [];
  const registry = createE2eFixtureRegistry(executor(calls), "refund-scenario");
  const input = {
    organizationId: ids.org,
    ownerId: ids.owner,
    amountCents: 25_000,
    displayName: "E2E refund stable",
  };
  const snapshot = JSON.stringify(input);
  const scenario = await createTestAdopterRefundReadyScenario(
    executor(calls),
    registry,
    input,
  );
  expect(JSON.stringify(input)).toBe(snapshot);
  expect(scenario.journeyStatus).toBe("active");
  expect(scenario.amountCents).toBe(25_000);
  expect(scenario.initialRefundedCents).toBe(0);
  expect(scenario.payment.amountCents).toBe(25_000);
  expect(registry.has("reservations", scenario.journey.id)).toBe(true);
  expect(registry.has("contacts", scenario.contact.id)).toBe(true);
  expect(registry.has("applications", scenario.application.id)).toBe(true);
  expect(registry.has("payments", scenario.payment.id)).toBe(true);
  expect(registry.has("contact_roles", scenario.holderRoleId)).toBe(true);
  expect(calls.join("\n")).toContain("'active'");
  expect(calls.join("\n")).toContain("reservation_holder");
  expect(calls.join("\n")).toContain("'paid'");
  expect(calls.join("\n")).toContain("25000");
  expect(calls.filter((call) => call.includes("insert into public.payments"))).toHaveLength(
    1,
  );
  expect(calls.some((call) => call.includes("insert into public.documents"))).toBe(
    false,
  );
  expect(calls.some((call) => call.includes("insert into public.animals"))).toBe(
    false,
  );
  expect(calls.some((call) => call.includes("'refund'"))).toBe(false);
});

test("refund scenario rejects incoherent foreign organization contact linkage", async () => {
  const calls: string[] = [];
  const registry = createE2eFixtureRegistry(executor(calls), "refund-invalid");
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

test("discovered refund effects register refund payment and preserve cleanup order", async () => {
  const calls: string[] = [];
  const registry = createE2eFixtureRegistry(executor(calls), "refund-effects");
  registry.register("payments", ids.payment);
  registry.register("contact_roles", ids.role);
  registry.register("reservations", ids.journey);
  registry.register("applications", "d1111111-1111-4111-8111-111111111111");
  registry.register("contacts", ids.contact);

  expect(registry.has("payments", ids.payment)).toBe(true);
  expect(registry.has("payments", ids.refund)).toBe(false);

  await registerActualRefundEffects(executor(calls), registry, {
    organizationId: ids.org,
    reservationId: ids.journey,
    contactId: ids.contact,
  });
  expect(registry.has("payments", ids.refund)).toBe(true);
  expect(registry.has("contact_roles", ids.discoveredRole)).toBe(true);
  expect(registry.has("payments", ids.payment)).toBe(true);

  const order = registry.cleanupOrder;
  expect(order.indexOf("documents")).toBeLessThan(order.indexOf("reservations"));
  expect(order.indexOf("payments")).toBeLessThan(order.indexOf("reservations"));
  expect(order.indexOf("contact_roles")).toBeLessThan(order.indexOf("contacts"));
  expect(order.indexOf("reservations")).toBeLessThan(order.indexOf("contacts"));

  await registry.cleanup();
  await registry.cleanup();
  const deleted = extractFixtureDeleteOrder(calls);
  expect(deleted.indexOf("payments")).toBeLessThan(deleted.indexOf("reservations"));
  expect(deleted.indexOf("contact_roles")).toBeLessThan(deleted.indexOf("contacts"));
  expect(deleted.indexOf("reservations")).toBeLessThan(deleted.indexOf("contacts"));
  expect(deleted.filter((table) => table === "payments").length).toBeGreaterThanOrEqual(1);
});

test("registry reports leftovers from refund payment after discovery", async () => {
  const registry = createE2eFixtureRegistry(
    async (statement) => (statement.includes("public.payments") ? "1" : "0"),
    "refund-leftover",
  );
  registry.register("payments", ids.refund);
  await expect(registry.assertEmpty()).rejects.toThrow("payments=1");
});

test("received payment fixture remains the refund precondition without creating refunds", async () => {
  const calls: string[] = [];
  const registry = createE2eFixtureRegistry(executor(calls), "refund-compat");
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
  const payment = await createTestReceivedPayment(executor(calls), registry, {
    organizationId: ids.org,
    contactId: contact.id,
    reservationId: journey.id,
    ownerId: ids.owner,
    amountCents: 25_000,
  });
  expect(payment.amountCents).toBe(25_000);
  expect(calls.join("\n")).toContain("'active'");
  expect(calls.join("\n")).toContain("'paid'");
  expect(calls.some((call) => call.includes("'refund'"))).toBe(false);
});
