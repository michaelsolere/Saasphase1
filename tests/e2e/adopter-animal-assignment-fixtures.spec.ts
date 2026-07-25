import { expect, test } from "@playwright/test";

import {
  createTestAdopterAnimalAssignmentScenario,
  createTestAssignableProducedAnimal,
  registerActualAnimalAssignmentEffects,
} from "./helpers/fixtures/adopter-animal-assignment-fixtures";
import {
  createTestAdopterJourney,
  createTestApplication,
  createTestContact,
  createTestAdopterLitter,
  createTestLitterGroup,
} from "./helpers/fixtures/adopter-payment-fixtures";
import { createE2eFixtureRegistry } from "./helpers/fixtures/fixture-registry";

const ids = {
  org: "11111111-1111-4111-8111-111111111111",
  otherOrg: "12111111-1111-4111-8111-111111111111",
  owner: "21111111-1111-4111-8111-111111111111",
  contact: "31111111-1111-4111-8111-111111111111",
  otherContact: "32111111-1111-4111-8111-111111111111",
  group: "41111111-1111-4111-8111-111111111111",
  otherGroup: "42111111-1111-4111-8111-111111111111",
  litter: "51111111-1111-4111-8111-111111111111",
  otherLitter: "52111111-1111-4111-8111-111111111111",
  application: "61111111-1111-4111-8111-111111111111",
  journey: "71111111-1111-4111-8111-111111111111",
  animal: "81111111-1111-4111-8111-111111111111",
  otherAnimal: "82111111-1111-4111-8111-111111111111",
};

const executor = (calls: string[]) => async (statement: string) => {
  calls.push(statement);
  if (statement.includes("json_build_object")) {
    return JSON.stringify([{ reservation_id: ids.journey, animal_id: ids.animal }]);
  }
  return "0";
};

test("assignable animal fixtures preserve litter coherence and explicit IDs", async () => {
  const calls: string[] = [];
  const registry = createE2eFixtureRegistry(executor(calls), "assignment-fixture");
  await createTestLitterGroup(executor(calls), registry, {
    id: ids.group,
    organizationId: ids.org,
    ownerId: ids.owner,
  });
  await createTestAdopterLitter(executor(calls), registry, {
    id: ids.litter,
    organizationId: ids.org,
    ownerId: ids.owner,
    litterGroupId: ids.group,
  });
  const input = {
    id: ids.animal,
    organizationId: ids.org,
    litterId: ids.litter,
    ownerId: ids.owner,
    callName: "Nova E2E",
  };
  const snapshot = JSON.stringify(input);
  const animal = await createTestAssignableProducedAnimal(executor(calls), registry, input);
  expect(JSON.stringify(input)).toBe(snapshot);
  expect(animal).toEqual({
    id: ids.animal,
    organizationId: ids.org,
    litterId: ids.litter,
    status: "available",
    ownershipStatus: "produced",
    callName: "Nova E2E",
  });
  expect(calls.join("\n")).toContain("ownership_status");
  expect(calls.join("\n")).toContain("produced");
  expect(calls.join("\n")).toContain("available");
});

test("assignable animal fixtures reject another organization and unknown litter", async () => {
  const calls: string[] = [];
  const registry = createE2eFixtureRegistry(executor(calls), "assignment-invalid");
  await createTestLitterGroup(executor(calls), registry, {
    id: ids.group,
    organizationId: ids.org,
    ownerId: ids.owner,
  });
  await createTestAdopterLitter(executor(calls), registry, {
    id: ids.litter,
    organizationId: ids.org,
    ownerId: ids.owner,
    litterGroupId: ids.group,
  });
  await expect(
    createTestAssignableProducedAnimal(executor(calls), registry, {
      organizationId: ids.otherOrg,
      litterId: ids.litter,
      ownerId: ids.owner,
    }),
  ).rejects.toThrow(/another organization/);
  await expect(
    createTestAssignableProducedAnimal(executor(calls), registry, {
      organizationId: ids.org,
      litterId: ids.otherLitter,
      ownerId: ids.owner,
    }),
  ).rejects.toThrow(/another organization/);
});

test("assignment effects are registered and cleanup keeps reservations before animals", async () => {
  const calls: string[] = [];
  const registry = createE2eFixtureRegistry(executor(calls), "assignment-effects");
  registry.register("animals", ids.animal);
  registry.register("reservations", ids.journey);
  registry.register("applications", ids.application);
  registry.register("contacts", ids.contact);
  registry.register("litter_groups", ids.group);
  registry.register("litters", ids.litter);

  await registerActualAnimalAssignmentEffects(executor(calls), registry, {
    organizationId: ids.org,
    reservationId: ids.journey,
    contactId: ids.contact,
    animalId: ids.animal,
  });
  expect(registry.has("animals", ids.animal)).toBe(true);
  expect(registry.has("reservations", ids.journey)).toBe(true);

  const order = registry.cleanupOrder;
  expect(order.indexOf("reservations")).toBeLessThan(order.indexOf("animals"));
  expect(order.indexOf("reservations")).toBeLessThan(order.indexOf("litters"));
  expect(order.indexOf("documents")).toBeLessThan(order.indexOf("reservations"));
  expect(order.indexOf("payments")).toBeLessThan(order.indexOf("reservations"));

  await registry.cleanup();
  await registry.cleanup();
  const deleted = calls
    .filter((call) => call.startsWith("delete") || call.includes("delete from"))
    .map((call) => call.match(/public\.([a-z_]+)/)?.[1]);
  expect(deleted.indexOf("reservations")).toBeLessThan(deleted.indexOf("animals"));
});

test("registry reports leftovers from animals", async () => {
  const registry = createE2eFixtureRegistry(
    async (statement) => (statement.includes("public.animals") ? "1" : "0"),
    "assignment-leftover",
  );
  registry.register("animals", ids.animal);
  await expect(registry.assertEmpty()).rejects.toThrow("animals=1");
});

test("assignment scenario stays compatible with contact journey fixtures without mutating inputs", async () => {
  const calls: string[] = [];
  const registry = createE2eFixtureRegistry(executor(calls), "assignment-scenario");
  const input = {
    organizationId: ids.org,
    ownerId: ids.owner,
    displayName: "E2E assignment stable",
    animalCallName: "Chiot stable",
  };
  const snapshot = JSON.stringify(input);
  const scenario = await createTestAdopterAnimalAssignmentScenario(executor(calls), registry, input);
  expect(JSON.stringify(input)).toBe(snapshot);
  expect(registry.has("animals", scenario.animal.id)).toBe(true);
  expect(registry.has("reservations", scenario.journey.id)).toBe(true);
  expect(registry.has("contacts", scenario.contact.id)).toBe(true);
  expect(scenario.animal.litterId).toBe(scenario.litterId);
  expect(scenario.journey.litterId).toBe(scenario.litterId);

  await createTestContact(executor(calls), registry, {
    id: ids.otherContact,
    organizationId: ids.org,
    ownerId: ids.owner,
  });
  await createTestLitterGroup(executor(calls), registry, {
    id: ids.otherGroup,
    organizationId: ids.org,
    ownerId: ids.owner,
  });
  const otherLitter = await createTestAdopterLitter(executor(calls), registry, {
    id: ids.otherLitter,
    organizationId: ids.org,
    ownerId: ids.owner,
    litterGroupId: ids.otherGroup,
  });
  const otherApplication = await createTestApplication(executor(calls), registry, {
    id: ids.application,
    organizationId: ids.org,
    contactId: ids.otherContact,
    ownerId: ids.owner,
    litterGroupId: ids.otherGroup,
    litterId: otherLitter,
  });
  await createTestAdopterJourney(executor(calls), registry, {
    id: "72111111-1111-4111-8111-111111111111",
    organizationId: ids.org,
    contactId: ids.otherContact,
    applicationId: otherApplication.id,
    ownerId: ids.owner,
    litterGroupId: ids.otherGroup,
    litterId: otherLitter,
    status: "active",
  });
  await createTestAssignableProducedAnimal(executor(calls), registry, {
    id: ids.otherAnimal,
    organizationId: ids.org,
    litterId: otherLitter,
    ownerId: ids.owner,
  });
  expect(registry.has("animals", ids.otherAnimal)).toBe(true);
});
