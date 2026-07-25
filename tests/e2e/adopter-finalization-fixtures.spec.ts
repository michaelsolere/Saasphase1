import { expect, test } from "@playwright/test";

import {
  createTestAdopterFinalizationReadyScenario,
  registerActualFinalizationEffects,
  seedAnimalAssignedAdopterJourney,
} from "./helpers/fixtures/adopter-finalization-fixtures";
import {
  createTestAdopterAnimalAssignmentScenario,
} from "./helpers/fixtures/adopter-animal-assignment-fixtures";
import { createE2eFixtureRegistry } from "./helpers/fixtures/fixture-registry";

const ids = {
  org: "11111111-1111-4111-8111-111111111111",
  otherOrg: "12111111-1111-4111-8111-111111111111",
  owner: "21111111-1111-4111-8111-111111111111",
  contact: "31111111-1111-4111-8111-111111111111",
  journey: "71111111-1111-4111-8111-111111111111",
  animal: "81111111-1111-4111-8111-111111111111",
  role: "91111111-1111-4111-8111-111111111111",
  adopterRole: "a1111111-1111-4111-8111-111111111111",
};

const executor = (calls: string[]) => async (statement: string) => {
  calls.push(statement);
  if (statement.includes("json_build_object")) {
    return JSON.stringify([
      {
        reservation_id: ids.journey,
        animal_id: ids.animal,
        role_id: ids.adopterRole,
      },
    ]);
  }
  return "0";
};

test("finalization ready scenario seeds animal_assigned without mutating inputs", async () => {
  const calls: string[] = [];
  const registry = createE2eFixtureRegistry(executor(calls), "finalization-scenario");
  const input = {
    organizationId: ids.org,
    ownerId: ids.owner,
    displayName: "E2E finalization stable",
    animalCallName: "Chiot finalisation",
  };
  const snapshot = JSON.stringify(input);
  const scenario = await createTestAdopterFinalizationReadyScenario(executor(calls), registry, input);
  expect(JSON.stringify(input)).toBe(snapshot);
  expect(scenario.journeyStatus).toBe("animal_assigned");
  expect(registry.has("animals", scenario.animal.id)).toBe(true);
  expect(registry.has("reservations", scenario.journey.id)).toBe(true);
  expect(registry.has("contact_roles", scenario.holderRoleId)).toBe(true);
  expect(calls.join("\n")).toContain("animal_assigned");
  expect(calls.join("\n")).toContain("reserved");
  expect(calls.join("\n")).toContain("reservation_holder");
});

test("finalization seed rejects foreign organization reservations", async () => {
  const calls: string[] = [];
  const registry = createE2eFixtureRegistry(executor(calls), "finalization-invalid");
  const scenario = await createTestAdopterAnimalAssignmentScenario(executor(calls), registry, {
    organizationId: ids.org,
    ownerId: ids.owner,
  });
  await expect(
    seedAnimalAssignedAdopterJourney(executor(calls), registry, {
      organizationId: ids.otherOrg,
      reservationId: scenario.journey.id,
      animalId: scenario.animal.id,
      ownerId: ids.owner,
    }),
  ).rejects.toThrow(/another organization/);
});

test("discovered finalization effects register adopter roles and preserve cleanup order", async () => {
  const calls: string[] = [];
  const registry = createE2eFixtureRegistry(executor(calls), "finalization-effects");
  registry.register("documents", "b1111111-1111-4111-8111-111111111111");
  registry.register("payments", "c1111111-1111-4111-8111-111111111111");
  registry.register("contact_roles", ids.role);
  registry.register("reservations", ids.journey);
  registry.register("applications", "d1111111-1111-4111-8111-111111111111");
  registry.register("contacts", ids.contact);
  registry.register("animals", ids.animal);
  registry.register("litters", "e1111111-1111-4111-8111-111111111111");
  registry.register("litter_groups", "f1111111-1111-4111-8111-111111111111");

  await registerActualFinalizationEffects(executor(calls), registry, {
    organizationId: ids.org,
    reservationId: ids.journey,
    contactId: ids.contact,
    animalId: ids.animal,
  });
  expect(registry.has("contact_roles", ids.adopterRole)).toBe(true);

  const order = registry.cleanupOrder;
  expect(order.indexOf("documents")).toBeLessThan(order.indexOf("reservations"));
  expect(order.indexOf("payments")).toBeLessThan(order.indexOf("reservations"));
  expect(order.indexOf("contact_roles")).toBeLessThan(order.indexOf("contacts"));
  expect(order.indexOf("reservations")).toBeLessThan(order.indexOf("animals"));
  expect(order.indexOf("reservations")).toBeLessThan(order.indexOf("litters"));

  await registry.cleanup();
  await registry.cleanup();
  const deleted = calls
    .filter((call) => call.includes("delete from"))
    .map((call) => call.match(/public\.([a-z_]+)/)?.[1]);
  expect(deleted.indexOf("reservations")).toBeLessThan(deleted.indexOf("animals"));
  expect(deleted.indexOf("contact_roles")).toBeLessThan(deleted.indexOf("contacts"));
});

test("registry reports leftovers from contact_roles after finalization", async () => {
  const registry = createE2eFixtureRegistry(
    async (statement) => (statement.includes("public.contact_roles") ? "1" : "0"),
    "finalization-leftover",
  );
  registry.register("contact_roles", ids.adopterRole);
  await expect(registry.assertEmpty()).rejects.toThrow("contact_roles=1");
});

test("assignment scenario remains compatible before finalization seed", async () => {
  const calls: string[] = [];
  const registry = createE2eFixtureRegistry(executor(calls), "finalization-compat");
  const input = {
    organizationId: ids.org,
    ownerId: ids.owner,
    displayName: "E2E compat",
  };
  const snapshot = JSON.stringify(input);
  const scenario = await createTestAdopterAnimalAssignmentScenario(executor(calls), registry, input);
  expect(JSON.stringify(input)).toBe(snapshot);
  await seedAnimalAssignedAdopterJourney(executor(calls), registry, {
    organizationId: ids.org,
    reservationId: scenario.journey.id,
    animalId: scenario.animal.id,
    ownerId: ids.owner,
  });
  expect(calls.some((call) => call.includes("update public.reservations"))).toBe(true);
  expect(calls.some((call) => call.includes("update public.animals"))).toBe(true);
});
