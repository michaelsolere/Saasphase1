import { randomUUID } from "node:crypto";

import {
  createTestAdopterJourney,
  createTestApplication,
  createTestContact,
  createTestContactRole,
  createTestReceivedPayment,
  getAdopterFixtureReservation,
} from "./adopter-payment-fixtures";
import { type SqlExecutor, createE2eFixtureRegistry } from "./fixture-registry";

type Registry = ReturnType<typeof createE2eFixtureRegistry>;

const q = (value: string) => `'${value.replaceAll("'", "''")}'`;
const id = (value?: string) => value ?? randomUUID();

/**
 * Active adopter journey with one received payment and no refunds/documents/animal.
 * Composes existing contact / application / journey / payment fixtures.
 */
export async function createTestAdopterRefundReadyScenario(
  execute: SqlExecutor,
  registry: Registry,
  input: {
    organizationId: string;
    ownerId: string;
    amountCents?: number;
    displayName?: string;
  },
) {
  const snapshot = structuredClone(input);
  const amountCents = input.amountCents ?? 25_000;

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
    organizationId: input.organizationId,
    contactId: contact.id,
    applicationId: application.id,
    ownerId: input.ownerId,
    status: "active",
  });
  const holderRoleId = await createTestContactRole(execute, registry, {
    id: id(),
    organizationId: input.organizationId,
    contactId: contact.id,
    ownerId: input.ownerId,
    role: "reservation_holder",
  });
  const payment = await createTestReceivedPayment(execute, registry, {
    organizationId: input.organizationId,
    contactId: contact.id,
    reservationId: journey.id,
    ownerId: input.ownerId,
    amountCents,
  });

  const reservation = getAdopterFixtureReservation(registry, journey.id);
  if (!reservation || reservation.organizationId !== input.organizationId) {
    throw new Error("E2E refund journey belongs to another organization");
  }

  if (JSON.stringify(input) !== JSON.stringify(snapshot)) {
    throw new Error("E2E refund scenario mutated its input");
  }

  return {
    contact,
    application,
    journey,
    holderRoleId,
    payment,
    amountCents,
    journeyStatus: "active" as const,
    initialRefundedCents: 0,
  };
}

/**
 * Discovers refund payment rows created by the real UI/RPC action and any
 * accidental parasites so cleanup stays complete.
 */
export async function registerActualRefundEffects(
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
          'payment_id', p.id,
          'payment_type', p.payment_type,
          'amount_cents', p.amount_cents,
          'status', p.status,
          'role_id', cr.id,
          'document_id', d.id,
          'animal_id', r.animal_id
        ) order by p.created_at nulls last, cr.created_at nulls last, d.created_at nulls last), '[]'::json)::text
       from public.reservations r
       left join public.payments p
         on p.organization_id = r.organization_id
        and p.reservation_id = r.id
        and p.payment_type = 'refund'
        and p.deleted_at is null
       left join public.contact_roles cr
         on cr.organization_id = r.organization_id
        and cr.contact_id = r.contact_id
       left join public.documents d
         on d.organization_id = r.organization_id
        and d.reservation_id = r.id
       where r.organization_id = ${q(input.organizationId)}::uuid
         and r.id = ${q(input.reservationId)}::uuid
         and r.contact_id = ${q(input.contactId)}::uuid`,
    ),
  ) as {
    payment_id: string | null;
    payment_type: string | null;
    amount_cents: number | null;
    status: string | null;
    role_id: string | null;
    document_id: string | null;
    animal_id: string | null;
  }[];

  for (const row of rows) {
    if (row.payment_id && !registry.has("payments", row.payment_id)) {
      registry.register("payments", row.payment_id);
    }
    if (row.role_id && !registry.has("contact_roles", row.role_id)) {
      registry.register("contact_roles", row.role_id);
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
