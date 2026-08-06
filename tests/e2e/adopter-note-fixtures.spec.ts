import { expect, test } from "@playwright/test";

import {
  RESERVATION_NOTE_MAX_BODY_LENGTH,
  createTestAdopterNoteReadyScenario,
  createTestReservationNote,
  registerActualNoteEffects,
} from "./helpers/fixtures/adopter-note-fixtures";
import {
  createTestAdopterJourney,
  createTestApplication,
  createTestContact,
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
  role: "91111111-1111-4111-8111-111111111111",
  note: "c1111111-1111-4111-8111-111111111111",
  noteTwo: "c2111111-1111-4111-8111-111111111111",
  discoveredNote: "c3111111-1111-4111-8111-111111111111",
  discoveredRole: "b1111111-1111-4111-8111-111111111111",
};

const NOTE_BODY =
  "Préférence exprimée pour un chiot calme ; disponibilité surtout le samedi matin.";

const executor = (calls: string[]) => async (statement: string) => {
  calls.push(statement);
  if (statement.includes("json_build_object") && statement.includes("'note_id'")) {
    return JSON.stringify([
      {
        note_id: ids.discoveredNote,
        body: NOTE_BODY,
        note_type: "internal",
        visibility: "internal",
        created_by: ids.owner,
        contact_id: null,
        application_id: null,
        deleted_at: null,
        role_id: ids.discoveredRole,
        payment_id: null,
        document_id: null,
        event_id: null,
        animal_id: null,
      },
    ]);
  }
  return "0";
};

test("note ready scenario seeds active journey without notes or side tables", async () => {
  const calls: string[] = [];
  const registry = createE2eFixtureRegistry(executor(calls), "note-scenario");
  const input = {
    organizationId: ids.org,
    ownerId: ids.owner,
    displayName: "E2E note stable",
  };
  const snapshot = JSON.stringify(input);
  const scenario = await createTestAdopterNoteReadyScenario(
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
  expect(calls.some((call) => call.includes("insert into public.notes"))).toBe(false);
  expect(calls.some((call) => call.includes("insert into public.events"))).toBe(false);
  expect(calls.some((call) => call.includes("insert into public.payments"))).toBe(false);
  expect(calls.some((call) => call.includes("insert into public.documents"))).toBe(false);
  expect(calls.some((call) => call.includes("insert into public.animals"))).toBe(false);
});

test("reservation note constructor validates org, journey, author, body and max length", async () => {
  const calls: string[] = [];
  const registry = createE2eFixtureRegistry(executor(calls), "note-seed");
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
    createTestReservationNote(executor(calls), registry, {
      organizationId: ids.org,
      reservationId: journey.id,
      ownerId: "   ",
      body: NOTE_BODY,
    }),
  ).rejects.toThrow(/author \(ownerId\) is required/);

  await expect(
    createTestReservationNote(executor(calls), registry, {
      organizationId: ids.org,
      reservationId: journey.id,
      ownerId: ids.owner,
      body: "   ",
    }),
  ).rejects.toThrow(/body must not be empty/);

  await expect(
    createTestReservationNote(executor(calls), registry, {
      organizationId: ids.org,
      reservationId: journey.id,
      ownerId: ids.owner,
      body: "x".repeat(RESERVATION_NOTE_MAX_BODY_LENGTH + 1),
    }),
  ).rejects.toThrow(/exceeds max length/);

  await expect(
    createTestReservationNote(executor(calls), registry, {
      organizationId: ids.otherOrg,
      reservationId: journey.id,
      ownerId: ids.owner,
      body: NOTE_BODY,
    }),
  ).rejects.toThrow(/does not match its adopter journey or organization/);

  await expect(
    createTestReservationNote(executor(calls), registry, {
      organizationId: ids.org,
      reservationId: journey.id,
      ownerId: ids.owner,
      body: NOTE_BODY,
      contactId: "32111111-1111-4111-8111-111111111111",
    }),
  ).rejects.toThrow(/contact does not match its adopter journey/);

  const noteInput = {
    id: ids.note,
    organizationId: ids.org,
    reservationId: journey.id,
    ownerId: ids.owner,
    body: `  ${NOTE_BODY}  `,
  };
  const noteSnapshot = JSON.stringify(noteInput);
  const note = await createTestReservationNote(executor(calls), registry, noteInput);
  expect(JSON.stringify(noteInput)).toBe(noteSnapshot);
  expect(note).toMatchObject({
    id: ids.note,
    organizationId: ids.org,
    reservationId: journey.id,
    contactId: null,
    applicationId: null,
    body: NOTE_BODY,
    noteType: "internal",
    visibility: "internal",
    createdBy: ids.owner,
  });
  expect(registry.has("notes", ids.note)).toBe(true);

  const second = await createTestReservationNote(executor(calls), registry, {
    id: ids.noteTwo,
    organizationId: ids.org,
    reservationId: journey.id,
    ownerId: ids.owner,
    body: "Seconde note interne distincte.",
    contactId: contact.id,
    applicationId: application.id,
  });
  expect(second.contactId).toBe(contact.id);
  expect(second.applicationId).toBe(application.id);
  expect(registry.has("notes", ids.noteTwo)).toBe(true);

  const inserts = calls.filter((call) => call.includes("insert into public.notes"));
  expect(inserts).toHaveLength(2);
  expect(inserts[0]).toContain("'internal'");
  expect(inserts[0]).toContain(NOTE_BODY);
  expect(inserts[0]).toContain(ids.owner);
  expect(inserts[1]).toContain("Seconde note interne distincte.");
});

test("note scenario rejects incoherent foreign organization contact linkage", async () => {
  const calls: string[] = [];
  const registry = createE2eFixtureRegistry(executor(calls), "note-invalid");
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

test("discovered note effects register notes and preserve cleanup order", async () => {
  const calls: string[] = [];
  const registry = createE2eFixtureRegistry(executor(calls), "note-effects");
  registry.register("notes", ids.note);
  registry.register("contact_roles", ids.role);
  registry.register("reservations", ids.journey);
  registry.register("applications", "d1111111-1111-4111-8111-111111111111");
  registry.register("contacts", ids.contact);

  expect(registry.has("notes", ids.note)).toBe(true);
  expect(registry.has("notes", ids.discoveredNote)).toBe(false);

  await registerActualNoteEffects(executor(calls), registry, {
    organizationId: ids.org,
    reservationId: ids.journey,
    contactId: ids.contact,
  });
  expect(registry.has("notes", ids.discoveredNote)).toBe(true);
  expect(registry.has("contact_roles", ids.discoveredRole)).toBe(true);
  expect(registry.has("notes", ids.note)).toBe(true);

  const order = registry.cleanupOrder;
  expect(order.indexOf("notes")).toBeLessThan(order.indexOf("reservations"));
  expect(order.indexOf("notes")).toBeLessThan(order.indexOf("contacts"));
  expect(order.indexOf("notes")).toBeLessThan(order.indexOf("organizations"));
  expect(order.indexOf("notes")).toBeLessThan(order.indexOf("payments"));
  expect(order.indexOf("notes")).toBeLessThan(order.indexOf("documents"));
  expect(order.indexOf("notes")).toBeLessThan(order.indexOf("events"));
  expect(order.indexOf("reservations")).toBeLessThan(order.indexOf("contacts"));

  await registry.cleanup();
  await registry.cleanup();
  const deleted = extractFixtureDeleteOrder(calls);
  expect(deleted.indexOf("notes")).toBeLessThan(deleted.indexOf("reservations"));
  expect(deleted.indexOf("notes")).toBeLessThan(deleted.indexOf("contacts"));
  expect(deleted.indexOf("reservations")).toBeLessThan(deleted.indexOf("contacts"));
  expect(deleted.filter((table) => table === "notes").length).toBeGreaterThanOrEqual(1);
});

test("registry reports leftovers from notes after discovery", async () => {
  const registry = createE2eFixtureRegistry(
    async (statement) => (statement.includes("public.notes") ? "1" : "0"),
    "note-leftover",
  );
  registry.register("notes", ids.discoveredNote);
  await expect(registry.assertEmpty()).rejects.toThrow("notes=1");
});
