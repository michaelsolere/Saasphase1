import { expect, test } from "@playwright/test";

import {
  createTestApplication,
  createTestContact,
  createTestContactRole,
  createTestExpectedPayment,
  createTestPaidPreReservationScenario,
  createTestPreReservationScenario,
  createTestReceivedPayment,
  createTestAdopterJourney,
  registerActualDepositEffects,
  registerActualPaymentEffects,
} from "./helpers/fixtures/adopter-payment-fixtures";
import { createE2eFixtureRegistry } from "./helpers/fixtures/fixture-registry";

const ids = { org: "11111111-1111-4111-8111-111111111111", otherOrg: "12111111-1111-4111-8111-111111111111", owner: "21111111-1111-4111-8111-111111111111", contact: "31111111-1111-4111-8111-111111111111", otherContact: "32111111-1111-4111-8111-111111111111", group: "41111111-1111-4111-8111-111111111111", litter: "51111111-1111-4111-8111-111111111111", application: "61111111-1111-4111-8111-111111111111", journey: "71111111-1111-4111-8111-111111111111", payment: "81111111-1111-4111-8111-111111111111", received: "82111111-1111-4111-8111-111111111111", candidate: "91111111-1111-4111-8111-111111111111", holder: "a1111111-1111-4111-8111-111111111111" };
const executor = (calls: string[]) => async (statement: string) => { calls.push(statement); return statement.includes("json_build_object") ? JSON.stringify([{ payment_id: ids.payment, role_id: ids.holder }]) : "0"; };

test("adopter payment fixtures preserve cents, relationships and explicit IDs", async () => {
  const calls: string[] = []; const registry = createE2eFixtureRegistry(executor(calls), "adopter-fixture");
  const input = { id: ids.contact, organizationId: ids.org, ownerId: ids.owner, displayName: "E2E Contact" }; const snapshot = JSON.stringify(input);
  const contact = await createTestContact(executor(calls), registry, input);
  expect(contact).toEqual({ id: ids.contact, organizationId: ids.org }); expect(JSON.stringify(input)).toBe(snapshot);
  registry.register("litter_groups", ids.group);
  await executor(calls)(`insert into public.litters (id) values ('${ids.litter}')`); registry.register("litters", ids.litter);
  const application = await createTestApplication(executor(calls), registry, { id: ids.application, organizationId: ids.org, contactId: ids.contact, ownerId: ids.owner, litterGroupId: ids.group, litterId: ids.litter });
  const journey = await createTestAdopterJourney(executor(calls), registry, { id: ids.journey, organizationId: ids.org, contactId: ids.contact, applicationId: application.id, ownerId: ids.owner, litterGroupId: ids.group, litterId: ids.litter });
  const expected = await createTestExpectedPayment(executor(calls), registry, { id: ids.payment, organizationId: ids.org, contactId: ids.contact, reservationId: journey.id, ownerId: ids.owner, amountCents: 25_000 });
  const received = await createTestReceivedPayment(executor(calls), registry, { id: ids.received, organizationId: ids.org, contactId: ids.contact, reservationId: journey.id, ownerId: ids.owner, amountCents: 25_000 });
  expect(expected.amountCents).toBe(25_000); expect(received.amountCents).toBe(25_000); expect(calls.join("\n")).toContain("25000");
});

test("adopter payment fixtures reject non-positive amounts and mismatched organizations", async () => {
  const calls: string[] = []; const registry = createE2eFixtureRegistry(executor(calls), "adopter-invalid");
  await createTestContact(executor(calls), registry, { id: ids.contact, organizationId: ids.org, ownerId: ids.owner });
  await createTestContact(executor(calls), registry, { id: ids.otherContact, organizationId: ids.otherOrg, ownerId: ids.owner });
  await expect(createTestApplication(executor(calls), registry, { organizationId: ids.org, contactId: ids.otherContact, ownerId: ids.owner })).rejects.toThrow(/another organization/);
  await expect(createTestContactRole(executor(calls), registry, { organizationId: ids.org, contactId: ids.otherContact, ownerId: ids.owner, role: "candidate" })).rejects.toThrow(/another organization/);
  await expect(createTestExpectedPayment(executor(calls), registry, { organizationId: ids.org, contactId: ids.contact, reservationId: ids.journey, ownerId: ids.owner, amountCents: 0 })).rejects.toThrow(/positive/);
  await expect(createTestExpectedPayment(executor(calls), registry, { organizationId: ids.org, contactId: ids.contact, reservationId: ids.journey, ownerId: ids.owner, amountCents: -1 })).rejects.toThrow(/positive/);
});

test("discovered RPC effects are registered and cleanup covers adopter tables idempotently", async () => {
  const calls: string[] = []; const registry = createE2eFixtureRegistry(executor(calls), "adopter-effects");
  registry.register("payments", ids.payment); registry.register("reservations", ids.journey); registry.register("applications", ids.application); registry.register("contacts", ids.contact); registry.register("litter_groups", ids.group); registry.register("litters", ids.litter); registry.register("contact_roles", ids.candidate);
  await registerActualPaymentEffects(executor(calls), registry, { organizationId: ids.org, reservationId: ids.journey, contactId: ids.contact, paymentId: ids.payment });
  expect(registry.has("contact_roles", ids.holder)).toBe(true);
  const order = registry.cleanupOrder;
  expect(order.indexOf("notes")).toBeLessThan(order.indexOf("events"));
  expect(order.indexOf("events")).toBeLessThan(order.indexOf("documents"));
  expect(order.indexOf("documents")).toBeLessThan(order.indexOf("payments"));
  expect(order.indexOf("payments")).toBeLessThan(order.indexOf("contact_roles"));
  expect(order.indexOf("contact_roles")).toBeLessThan(order.indexOf("reservations"));
  expect(order.indexOf("reservations")).toBeLessThan(order.indexOf("applications"));
  expect(order.indexOf("applications")).toBeLessThan(order.indexOf("contacts"));
  expect(order.indexOf("contacts")).toBeLessThan(order.indexOf("litter_care_tasks"));
  expect(order.indexOf("litter_care_tasks")).toBeLessThan(order.indexOf("whelping_birth_adjustment_commands"));
  await registry.cleanup(); await registry.cleanup();
  expect(calls.filter((call) => call.startsWith("delete")).map((call) => call.match(/public\.([a-z_]+)/)?.[1])).toContain("payments");
  expect(calls.filter((call) => call.startsWith("delete")).map((call) => call.match(/public\.([a-z_]+)/)?.[1])).toContain("litter_groups");
  expect(registry.cleanupOrder).toContain("litter_care_tasks"); expect(registry.cleanupOrder).toContain("animal_weight_measurements"); expect(registry.cleanupOrder).toContain("whelping_births");
});

test("registry reports leftovers from a new adopter table", async () => {
  const registry = createE2eFixtureRegistry(async (statement) => statement.includes("public.payments") ? "1" : "0", "adopter-leftover"); registry.register("payments", ids.payment);
  await expect(registry.assertEmpty()).rejects.toThrow("payments=1");
});

test("pre-reservation scenario does not mutate provided inputs", async () => {
  const calls: string[] = []; const registry = createE2eFixtureRegistry(executor(calls), "adopter-scenario");
  const input = { organizationId: ids.org, ownerId: ids.owner, amountCents: 25_000, displayName: "E2E stable" }; const snapshot = JSON.stringify(input);
  await createTestPreReservationScenario(executor(calls), registry, input);
  expect(JSON.stringify(input)).toBe(snapshot);
});

test("paid pre-reservation scenario seeds arrhes and discovers deposit effects", async () => {
  const calls: string[] = [];
  const registry = createE2eFixtureRegistry(executor(calls), "paid-pre-reservation");
  const input = {
    organizationId: ids.org,
    ownerId: ids.owner,
    amountCents: 25_000,
    displayName: "E2E paid stable",
  };
  const snapshot = JSON.stringify(input);
  const scenario = await createTestPaidPreReservationScenario(executor(calls), registry, input);
  expect(JSON.stringify(input)).toBe(snapshot);
  expect(scenario.amountCents).toBe(25_000);
  expect(registry.has("payments", scenario.payment.id)).toBe(true);
  expect(registry.has("contact_roles", scenario.holderRoleId)).toBe(true);
  expect(calls.join("\n")).toContain("'pre_reservation_paid'");
  expect(calls.join("\n")).toContain("'arrhes'");

  const depositCalls: string[] = [];
  const depositRegistry = createE2eFixtureRegistry(async (statement) => {
    depositCalls.push(statement);
    if (statement.includes("json_build_object")) {
      return JSON.stringify([
        { payment_id: ids.payment, role_id: ids.holder, document_id: null },
        { payment_id: ids.received, role_id: ids.holder, document_id: null },
      ]);
    }
    return "0";
  }, "deposit-effects");
  depositRegistry.register("reservations", ids.journey);
  depositRegistry.register("contacts", ids.contact);
  await registerActualDepositEffects(async (statement) => {
    depositCalls.push(statement);
    if (statement.includes("json_build_object")) {
      return JSON.stringify([
        { payment_id: ids.payment, role_id: ids.holder, document_id: null },
        { payment_id: ids.received, role_id: ids.holder, document_id: null },
      ]);
    }
    return "0";
  }, depositRegistry, {
    organizationId: ids.org,
    reservationId: ids.journey,
    contactId: ids.contact,
  });
  expect(depositRegistry.has("payments", ids.payment)).toBe(true);
  expect(depositRegistry.has("payments", ids.received)).toBe(true);
  expect(depositRegistry.has("contact_roles", ids.holder)).toBe(true);
});
