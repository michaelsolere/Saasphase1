import { randomUUID } from "node:crypto";

import {
  createTestAdopterAnimalAssignmentScenario,
} from "./adopter-animal-assignment-fixtures";
import {
  createTestContactRole,
  getAdopterFixtureReservation,
} from "./adopter-payment-fixtures";
import { type SqlExecutor, createE2eFixtureRegistry } from "./fixture-registry";

type Registry = ReturnType<typeof createE2eFixtureRegistry>;

const q = (value: string) => `'${value.replaceAll("'", "''")}'`;
const id = (value?: string) => value ?? randomUUID();

export async function seedAnimalAssignedAdopterJourney(
  execute: SqlExecutor,
  registry: Registry,
  input: {
    organizationId: string;
    reservationId: string;
    animalId: string;
    ownerId: string;
    assignedAt?: string;
  },
) {
  const snapshot = structuredClone(input);
  const reservation = getAdopterFixtureReservation(registry, input.reservationId);
  if (!reservation || reservation.organizationId !== input.organizationId) {
    throw new Error("E2E finalization reservation belongs to another organization");
  }
  if (!registry.has("animals", input.animalId)) {
    throw new Error("E2E finalization animal is not registered");
  }

  const assignedAt = input.assignedAt ?? "2026-07-25T11:00:00.000Z";
  await execute(
    `update public.reservations
     set animal_id = ${q(input.animalId)}::uuid,
         animal_assigned_at = ${q(assignedAt)}::timestamptz,
         status = 'animal_assigned',
         updated_by = ${q(input.ownerId)}::uuid,
         updated_at = ${q(assignedAt)}::timestamptz
     where id = ${q(input.reservationId)}::uuid
       and organization_id = ${q(input.organizationId)}::uuid
       and animal_id is null
       and status = 'active'`,
  );
  await execute(
    `update public.animals
     set status = 'reserved',
         updated_by = ${q(input.ownerId)}::uuid,
         updated_at = ${q(assignedAt)}::timestamptz
     where id = ${q(input.animalId)}::uuid
       and organization_id = ${q(input.organizationId)}::uuid
       and status = 'available'`,
  );

  if (JSON.stringify(input) !== JSON.stringify(snapshot)) {
    throw new Error("E2E finalization seed mutated its input");
  }
}

export async function registerActualFinalizationEffects(
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
          'animal_id', r.animal_id,
          'role_id', cr.id
        ) order by cr.created_at nulls last), '[]'::json)::text
       from public.reservations r
       left join public.contact_roles cr
         on cr.organization_id = r.organization_id
        and cr.contact_id = r.contact_id
        and cr.role = 'adopter'
       where r.organization_id = ${q(input.organizationId)}::uuid
         and r.id = ${q(input.reservationId)}::uuid
         and r.contact_id = ${q(input.contactId)}::uuid
         and r.animal_id = ${q(input.animalId)}::uuid
         and r.status = 'adopted'`,
    ),
  ) as { reservation_id: string; animal_id: string; role_id: string | null }[];

  for (const row of rows) {
    if (!registry.has("reservations", row.reservation_id)) {
      registry.register("reservations", row.reservation_id);
    }
    if (row.animal_id && !registry.has("animals", row.animal_id)) {
      registry.register("animals", row.animal_id);
    }
    if (row.role_id && !registry.has("contact_roles", row.role_id)) {
      registry.register("contact_roles", row.role_id);
    }
  }
  return rows;
}

export async function createTestAdopterFinalizationReadyScenario(
  execute: SqlExecutor,
  registry: Registry,
  input: {
    organizationId: string;
    ownerId: string;
    displayName?: string;
    animalCallName?: string;
  },
) {
  const snapshot = structuredClone(input);
  const scenario = await createTestAdopterAnimalAssignmentScenario(execute, registry, {
    ...input,
    journeyStatus: "active",
  });
  await seedAnimalAssignedAdopterJourney(execute, registry, {
    organizationId: input.organizationId,
    reservationId: scenario.journey.id,
    animalId: scenario.animal.id,
    ownerId: input.ownerId,
  });
  const holderRoleId = await createTestContactRole(execute, registry, {
    id: id(),
    organizationId: input.organizationId,
    contactId: scenario.contact.id,
    ownerId: input.ownerId,
    role: "reservation_holder",
  });

  if (JSON.stringify(input) !== JSON.stringify(snapshot)) {
    throw new Error("E2E finalization scenario mutated its input");
  }

  return {
    ...scenario,
    holderRoleId,
    journeyStatus: "animal_assigned" as const,
  };
}
