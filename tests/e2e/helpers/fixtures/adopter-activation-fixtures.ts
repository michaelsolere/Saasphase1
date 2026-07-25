import { randomUUID } from "node:crypto";

import {
  createTestAdopterJourney,
  createTestApplication,
  createTestContact,
  getAdopterFixtureReservation,
} from "./adopter-payment-fixtures";
import { type SqlExecutor, createE2eFixtureRegistry } from "./fixture-registry";

type Registry = ReturnType<typeof createE2eFixtureRegistry>;

const q = (value: string) => `'${value.replaceAll("'", "''")}'`;
const id = (value?: string) => value ?? randomUUID();

export async function createTestAdopterActivationReadyScenario(
  execute: SqlExecutor,
  registry: Registry,
  input: {
    organizationId: string;
    ownerId: string;
    displayName?: string;
  },
) {
  const snapshot = structuredClone(input);
  const contact = await createTestContact(execute, registry, {
    organizationId: input.organizationId,
    ownerId: input.ownerId,
    displayName: input.displayName,
  });
  const application = await createTestApplication(execute, registry, {
    organizationId: input.organizationId,
    contactId: contact.id,
    ownerId: input.ownerId,
  });
  const journey = await createTestAdopterJourney(execute, registry, {
    id: id(),
    organizationId: input.organizationId,
    contactId: contact.id,
    applicationId: application.id,
    ownerId: input.ownerId,
    status: "draft",
  });

  const reservation = getAdopterFixtureReservation(registry, journey.id);
  if (!reservation || reservation.organizationId !== input.organizationId) {
    throw new Error("E2E activation journey belongs to another organization");
  }

  if (JSON.stringify(input) !== JSON.stringify(snapshot)) {
    throw new Error("E2E activation scenario mutated its input");
  }

  return {
    contact,
    application,
    journey,
    journeyStatus: "draft" as const,
  };
}

/**
 * Activation only updates the existing reservation row (draft → active).
 * No payment, document, animal or contact_role rows are created by the action.
 */
export async function registerActualActivationEffects(
  execute: SqlExecutor,
  registry: Registry,
  input: {
    organizationId: string;
    reservationId: string;
    contactId: string;
  },
) {
  const rows = JSON.parse(
    await execute(
      `select coalesce(json_agg(json_build_object(
          'reservation_id', r.id,
          'status', r.status,
          'animal_id', r.animal_id,
          'role_id', cr.id,
          'payment_id', p.id,
          'document_id', d.id,
          'email_id', e.id
        ) order by cr.created_at nulls last, p.created_at nulls last, d.created_at nulls last), '[]'::json)::text
       from public.reservations r
       left join public.contact_roles cr
         on cr.organization_id = r.organization_id
        and cr.contact_id = r.contact_id
       left join public.payments p
         on p.organization_id = r.organization_id
        and p.reservation_id = r.id
       left join public.documents d
         on d.organization_id = r.organization_id
        and d.reservation_id = r.id
       left join public.email_delivery_attempts e
         on e.reservation_id = r.id
       where r.organization_id = ${q(input.organizationId)}::uuid
         and r.id = ${q(input.reservationId)}::uuid
         and r.contact_id = ${q(input.contactId)}::uuid
         and r.status = 'active'`,
    ),
  ) as {
    reservation_id: string;
    status: string;
    animal_id: string | null;
    role_id: string | null;
    payment_id: string | null;
    document_id: string | null;
    email_id: string | null;
  }[];

  for (const row of rows) {
    if (!registry.has("reservations", row.reservation_id)) {
      registry.register("reservations", row.reservation_id);
    }
    if (row.role_id && !registry.has("contact_roles", row.role_id)) {
      registry.register("contact_roles", row.role_id);
    }
    if (row.payment_id && !registry.has("payments", row.payment_id)) {
      registry.register("payments", row.payment_id);
    }
    if (row.document_id && !registry.has("documents", row.document_id)) {
      registry.register("documents", row.document_id);
    }
    if (row.animal_id && !registry.has("animals", row.animal_id)) {
      registry.register("animals", row.animal_id);
    }
  }
  return rows;
}
