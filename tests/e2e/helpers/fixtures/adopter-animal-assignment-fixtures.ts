import { randomUUID } from "node:crypto";

import {
  createTestAdopterJourney,
  createTestApplication,
  createTestContact,
  createTestAdopterLitter,
  createTestLitterGroup,
  getAdopterFixtureContact,
  getAdopterFixtureLitter,
  getAdopterFixtureReservation,
} from "./adopter-payment-fixtures";
import { type FixtureTable, type SqlExecutor, createE2eFixtureRegistry } from "./fixture-registry";

type Registry = ReturnType<typeof createE2eFixtureRegistry>;
type AssignableAnimal = {
  id: string;
  organizationId: string;
  litterId: string;
  status: "available";
  ownershipStatus: "produced";
  callName: string;
};

const q = (value: string) => `'${value.replaceAll("'", "''")}'`;
const id = (value?: string) => value ?? randomUUID();

const animalStates = new WeakMap<Registry, Map<string, AssignableAnimal>>();

function animals(registry: Registry) {
  let current = animalStates.get(registry);
  if (!current) {
    current = new Map();
    animalStates.set(registry, current);
  }
  return current;
}

async function insert(
  execute: SqlExecutor,
  registry: Registry,
  table: FixtureTable,
  values: Record<string, string | number | boolean | null>,
) {
  const entityId = String(values.id);
  await execute(
    `insert into public.${table} (${Object.keys(values).join(",")}) values (${Object.values(values)
      .map((value) =>
        value === null
          ? "null"
          : typeof value === "number"
            ? String(value)
            : typeof value === "boolean"
              ? value
                ? "true"
                : "false"
              : q(value),
      )
      .join(",")})`,
  );
  registry.register(table, entityId);
  return entityId;
}

export async function createTestAssignableProducedAnimal(
  execute: SqlExecutor,
  registry: Registry,
  input: {
    id?: string;
    organizationId: string;
    litterId: string;
    ownerId: string;
    callName?: string;
    sex?: "female" | "male";
    birthDate?: string | null;
  },
) {
  const snapshot = structuredClone(input);
  const litter = getAdopterFixtureLitter(registry, input.litterId);
  if (!litter || litter.organizationId !== input.organizationId) {
    throw new Error("E2E assignable animal litter belongs to another organization");
  }

  const entityId = id(input.id);
  const callName = input.callName ?? `E2E chiot ${entityId.slice(0, 8)}`;
  await insert(execute, registry, "animals", {
    id: entityId,
    organization_id: input.organizationId,
    litter_id: input.litterId,
    call_name: callName,
    species: "dog",
    breed: "Golden Retriever",
    sex: input.sex ?? "female",
    birth_date: input.birthDate ?? null,
    status: "available",
    ownership_status: "produced",
    is_breeder: false,
    is_external: false,
    is_retired: false,
    created_by: input.ownerId,
    updated_by: input.ownerId,
  });

  const row = {
    id: entityId,
    organizationId: input.organizationId,
    litterId: input.litterId,
    status: "available" as const,
    ownershipStatus: "produced" as const,
    callName,
  };
  animals(registry).set(entityId, row);
  if (JSON.stringify(input) !== JSON.stringify(snapshot)) {
    throw new Error("E2E assignable animal fixture mutated its input");
  }
  return row;
}

export function getAssignableAnimal(registry: Registry, animalId: string) {
  return animals(registry).get(animalId);
}

export async function registerActualAnimalAssignmentEffects(
  execute: SqlExecutor,
  registry: Registry,
  input: {
    organizationId: string;
    reservationId: string;
    contactId: string;
    animalId: string;
  },
) {
  const rows = JSON.parse(
    await execute(
      `select coalesce(json_agg(json_build_object(
          'reservation_id', r.id,
          'animal_id', r.animal_id
        ) order by r.created_at), '[]'::json)::text
       from public.reservations r
       where r.organization_id = ${q(input.organizationId)}::uuid
         and r.id = ${q(input.reservationId)}::uuid
         and r.contact_id = ${q(input.contactId)}::uuid
         and r.animal_id = ${q(input.animalId)}::uuid`,
    ),
  ) as { reservation_id: string; animal_id: string }[];

  for (const row of rows) {
    if (!registry.has("reservations", row.reservation_id)) {
      registry.register("reservations", row.reservation_id);
    }
    if (row.animal_id && !registry.has("animals", row.animal_id)) {
      registry.register("animals", row.animal_id);
    }
  }
  return rows;
}

export async function createTestAdopterAnimalAssignmentScenario(
  execute: SqlExecutor,
  registry: Registry,
  input: {
    organizationId: string;
    ownerId: string;
    displayName?: string;
    animalCallName?: string;
    birthDate?: string | null;
    journeyStatus?: "pre_reservation_requested" | "active";
  },
) {
  const snapshot = structuredClone(input);
  const groupId = await createTestLitterGroup(execute, registry, input);
  const litterId = await createTestAdopterLitter(execute, registry, {
    ...input,
    litterGroupId: groupId,
  });
  const contact = await createTestContact(execute, registry, {
    ...input,
    displayName: input.displayName,
  });
  const application = await createTestApplication(execute, registry, {
    ...input,
    contactId: contact.id,
    litterGroupId: groupId,
    litterId,
  });
  const journey = await createTestAdopterJourney(execute, registry, {
    ...input,
    contactId: contact.id,
    applicationId: application.id,
    litterGroupId: groupId,
    litterId,
    status: input.journeyStatus ?? "active",
  });
  const animal = await createTestAssignableProducedAnimal(execute, registry, {
    ...input,
    litterId,
    callName: input.animalCallName,
  });

  const contactCheck = getAdopterFixtureContact(registry, contact.id);
  const reservationCheck = getAdopterFixtureReservation(registry, journey.id);
  if (
    !contactCheck ||
    !reservationCheck ||
    reservationCheck.litterId !== litterId ||
    animal.litterId !== litterId
  ) {
    throw new Error("E2E animal assignment scenario litter coherence failed");
  }

  if (JSON.stringify(input) !== JSON.stringify(snapshot)) {
    throw new Error("E2E animal assignment scenario mutated its input");
  }

  return { groupId, litterId, contact, application, journey, animal };
}
