import { expect, test } from "@playwright/test";

import {
  createTestAdopterAppointmentReadyScenario,
  createTestReservationAppointment,
  registerActualAppointmentEffects,
} from "./helpers/fixtures/adopter-appointment-fixtures";
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
  choiceEvent: "a1111111-1111-4111-8111-111111111111",
  adoptionEvent: "a2111111-1111-4111-8111-111111111111",
  discoveredEvent: "a3111111-1111-4111-8111-111111111111",
  discoveredRole: "b1111111-1111-4111-8111-111111111111",
};

const CHOICE_AT = "2026-09-10T08:00:00.000Z";
const ADOPTION_AT = "2026-09-20T12:30:00.000Z";

const executor = (calls: string[]) => async (statement: string) => {
  calls.push(statement);
  if (statement.includes("json_build_object") && statement.includes("'event_id'")) {
    return JSON.stringify([
      {
        event_id: ids.discoveredEvent,
        event_type: "puppy_choice",
        status: "planned",
        planned_at: CHOICE_AT,
        actual_at: null,
        title: "Rendez-vous de choix du chiot/chaton",
        role_id: ids.discoveredRole,
        payment_id: null,
        document_id: null,
        animal_id: null,
      },
    ]);
  }
  return "0";
};

test("appointment ready scenario seeds active journey without appointments or side tables", async () => {
  const calls: string[] = [];
  const registry = createE2eFixtureRegistry(executor(calls), "appointment-scenario");
  const input = {
    organizationId: ids.org,
    ownerId: ids.owner,
    displayName: "E2E appointment stable",
  };
  const snapshot = JSON.stringify(input);
  const scenario = await createTestAdopterAppointmentReadyScenario(
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
  expect(calls.some((call) => call.includes("insert into public.events"))).toBe(false);
  expect(calls.some((call) => call.includes("insert into public.payments"))).toBe(false);
  expect(calls.some((call) => call.includes("insert into public.documents"))).toBe(false);
  expect(calls.some((call) => call.includes("insert into public.animals"))).toBe(false);
});

test("reservation appointment constructor validates kind, dates and journey organization", async () => {
  const calls: string[] = [];
  const registry = createE2eFixtureRegistry(executor(calls), "appointment-seed");
  const contact = await createTestContact(executor(calls), registry, {
    id: ids.contact,
    organizationId: ids.org,
    ownerId: ids.owner,
  });
  const application = await createTestApplication(executor(calls), registry, {
    organizationId: ids.org,
    contactId: contact.id,
    ownerId: ids.owner,
  });
  const journey = await createTestAdopterJourney(executor(calls), registry, {
    id: ids.journey,
    organizationId: ids.org,
    contactId: contact.id,
    applicationId: application.id,
    ownerId: ids.owner,
    status: "active",
  });

  await expect(
    createTestReservationAppointment(executor(calls), registry, {
      organizationId: ids.org,
      reservationId: journey.id,
      ownerId: ids.owner,
      kind: "invalid_kind" as "puppy_choice",
      plannedAt: CHOICE_AT,
    }),
  ).rejects.toThrow(/appointment kind is invalid/);

  await expect(
    createTestReservationAppointment(executor(calls), registry, {
      organizationId: ids.org,
      reservationId: journey.id,
      ownerId: ids.owner,
      kind: "puppy_choice",
      status: "cancelled" as "planned",
      plannedAt: CHOICE_AT,
    }),
  ).rejects.toThrow(/appointment status is invalid/);

  await expect(
    createTestReservationAppointment(executor(calls), registry, {
      organizationId: ids.org,
      reservationId: journey.id,
      ownerId: ids.owner,
      kind: "puppy_choice",
    }),
  ).rejects.toThrow(/requires plannedAt or actualAt/);

  await expect(
    createTestReservationAppointment(executor(calls), registry, {
      organizationId: ids.org,
      reservationId: journey.id,
      ownerId: ids.owner,
      kind: "puppy_choice",
      plannedAt: "not-a-date",
    }),
  ).rejects.toThrow(/plannedAt must be a valid timestamptz/);

  await expect(
    createTestReservationAppointment(executor(calls), registry, {
      organizationId: ids.otherOrg,
      reservationId: journey.id,
      ownerId: ids.owner,
      kind: "puppy_choice",
      plannedAt: CHOICE_AT,
    }),
  ).rejects.toThrow(/does not match its adopter journey or organization/);

  const choiceInput = {
    id: ids.choiceEvent,
    organizationId: ids.org,
    reservationId: journey.id,
    ownerId: ids.owner,
    kind: "puppy_choice" as const,
    status: "planned" as const,
    plannedAt: CHOICE_AT,
  };
  const choiceSnapshot = JSON.stringify(choiceInput);
  const choice = await createTestReservationAppointment(
    executor(calls),
    registry,
    choiceInput,
  );
  expect(JSON.stringify(choiceInput)).toBe(choiceSnapshot);
  expect(choice).toMatchObject({
    id: ids.choiceEvent,
    kind: "puppy_choice",
    status: "planned",
    plannedAt: CHOICE_AT,
    title: "Rendez-vous de choix du chiot/chaton",
  });
  expect(registry.has("events", ids.choiceEvent)).toBe(true);

  const adoption = await createTestReservationAppointment(executor(calls), registry, {
    id: ids.adoptionEvent,
    organizationId: ids.org,
    reservationId: journey.id,
    ownerId: ids.owner,
    kind: "adoption",
    status: "done",
    plannedAt: ADOPTION_AT,
    actualAt: ADOPTION_AT,
  });
  expect(adoption.kind).toBe("adoption");
  expect(adoption.title).toBe("Rendez-vous d’adoption / départ");
  expect(registry.has("events", ids.adoptionEvent)).toBe(true);

  const inserts = calls.filter((call) => call.includes("insert into public.events"));
  expect(inserts).toHaveLength(2);
  expect(inserts[0]).toContain("'puppy_choice'");
  expect(inserts[0]).toContain(CHOICE_AT);
  expect(inserts[1]).toContain("'adoption'");
  expect(inserts[1]).toContain("'done'");
});

test("appointment scenario rejects incoherent foreign organization contact linkage", async () => {
  const calls: string[] = [];
  const registry = createE2eFixtureRegistry(executor(calls), "appointment-invalid");
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

test("discovered appointment effects register events and preserve cleanup order", async () => {
  const calls: string[] = [];
  const registry = createE2eFixtureRegistry(executor(calls), "appointment-effects");
  registry.register("events", ids.choiceEvent);
  registry.register("contact_roles", ids.role);
  registry.register("reservations", ids.journey);
  registry.register("applications", "d1111111-1111-4111-8111-111111111111");
  registry.register("contacts", ids.contact);

  expect(registry.has("events", ids.choiceEvent)).toBe(true);
  expect(registry.has("events", ids.discoveredEvent)).toBe(false);

  await registerActualAppointmentEffects(executor(calls), registry, {
    organizationId: ids.org,
    reservationId: ids.journey,
    contactId: ids.contact,
  });
  expect(registry.has("events", ids.discoveredEvent)).toBe(true);
  expect(registry.has("contact_roles", ids.discoveredRole)).toBe(true);
  expect(registry.has("events", ids.choiceEvent)).toBe(true);

  const order = registry.cleanupOrder;
  expect(order.indexOf("events")).toBeLessThan(order.indexOf("reservations"));
  expect(order.indexOf("events")).toBeLessThan(order.indexOf("payments"));
  expect(order.indexOf("events")).toBeLessThan(order.indexOf("documents"));
  expect(order.indexOf("contact_roles")).toBeLessThan(order.indexOf("contacts"));
  expect(order.indexOf("reservations")).toBeLessThan(order.indexOf("contacts"));

  await registry.cleanup();
  await registry.cleanup();
  const deleted = calls
    .filter((call) => call.includes("delete from"))
    .map((call) => call.match(/public\.([a-z_]+)/)?.[1]);
  expect(deleted.indexOf("events")).toBeLessThan(deleted.indexOf("reservations"));
  expect(deleted.indexOf("contact_roles")).toBeLessThan(deleted.indexOf("contacts"));
  expect(deleted.indexOf("reservations")).toBeLessThan(deleted.indexOf("contacts"));
  expect(deleted.filter((table) => table === "events").length).toBeGreaterThanOrEqual(1);
});

test("registry reports leftovers from appointment events after discovery", async () => {
  const registry = createE2eFixtureRegistry(
    async (statement) => (statement.includes("public.events") ? "1" : "0"),
    "appointment-leftover",
  );
  registry.register("events", ids.discoveredEvent);
  await expect(registry.assertEmpty()).rejects.toThrow("events=1");
});
