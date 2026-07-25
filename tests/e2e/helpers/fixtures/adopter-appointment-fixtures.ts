import { randomUUID } from "node:crypto";

import {
  createTestAdopterJourney,
  createTestApplication,
  createTestContact,
  createTestContactRole,
  getAdopterFixtureReservation,
} from "./adopter-payment-fixtures";
import { type SqlExecutor, createE2eFixtureRegistry } from "./fixture-registry";

type Registry = ReturnType<typeof createE2eFixtureRegistry>;

export const RESERVATION_APPOINTMENT_KINDS = ["puppy_choice", "adoption"] as const;
export type ReservationAppointmentKind = (typeof RESERVATION_APPOINTMENT_KINDS)[number];

export const RESERVATION_APPOINTMENT_STATUSES = ["planned", "done", "postponed"] as const;
export type ReservationAppointmentStatus = (typeof RESERVATION_APPOINTMENT_STATUSES)[number];

const q = (value: string) => `'${value.replaceAll("'", "''")}'`;
const id = (value?: string) => value ?? randomUUID();

const appointmentTitles: Record<ReservationAppointmentKind, string> = {
  puppy_choice: "Rendez-vous de choix du chiot/chaton",
  adoption: "Rendez-vous d’adoption / départ",
};

function assertAppointmentKind(kind: string): asserts kind is ReservationAppointmentKind {
  if (!RESERVATION_APPOINTMENT_KINDS.includes(kind as ReservationAppointmentKind)) {
    throw new Error(`E2E appointment kind is invalid: ${kind}`);
  }
}

function assertAppointmentStatus(
  status: string,
): asserts status is ReservationAppointmentStatus {
  if (!RESERVATION_APPOINTMENT_STATUSES.includes(status as ReservationAppointmentStatus)) {
    throw new Error(`E2E appointment status is invalid: ${status}`);
  }
}

function assertIsoTimestamptz(value: string, field: string) {
  if (!Number.isFinite(Date.parse(value))) {
    throw new Error(`E2E appointment ${field} must be a valid timestamptz`);
  }
}

/**
 * Active adopter journey with a reservation_holder role and no appointments,
 * payments, documents or animal. Composes existing contact / application /
 * journey / role fixtures.
 */
export async function createTestAdopterAppointmentReadyScenario(
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

  const reservation = getAdopterFixtureReservation(registry, journey.id);
  if (!reservation || reservation.organizationId !== input.organizationId) {
    throw new Error("E2E appointment journey belongs to another organization");
  }

  if (JSON.stringify(input) !== JSON.stringify(snapshot)) {
    throw new Error("E2E appointment scenario mutated its input");
  }

  return {
    contact,
    application,
    journey,
    holderRoleId,
    journeyStatus: "active" as const,
  };
}

/**
 * Optional direct seed of a reservation appointment event (`puppy_choice` or
 * `adoption`). The integrated UI workflow prefers creating rows through
 * `upsertReservationAppointment`; this constructor exists for pure fixture
 * validation and for registering explicit IDs when useful.
 */
export async function createTestReservationAppointment(
  execute: SqlExecutor,
  registry: Registry,
  input: {
    id?: string;
    organizationId: string;
    reservationId: string;
    ownerId: string;
    kind: ReservationAppointmentKind;
    status?: ReservationAppointmentStatus;
    plannedAt?: string | null;
    actualAt?: string | null;
    description?: string | null;
  },
) {
  const snapshot = structuredClone(input);
  assertAppointmentKind(input.kind);
  const status = input.status ?? "planned";
  assertAppointmentStatus(status);

  const reservation = getAdopterFixtureReservation(registry, input.reservationId);
  if (!reservation || reservation.organizationId !== input.organizationId) {
    throw new Error("E2E appointment does not match its adopter journey or organization");
  }

  const plannedAt = input.plannedAt ?? null;
  const actualAt = input.actualAt ?? null;
  if (!plannedAt && !actualAt) {
    throw new Error("E2E appointment requires plannedAt or actualAt");
  }
  if (plannedAt) assertIsoTimestamptz(plannedAt, "plannedAt");
  if (actualAt) assertIsoTimestamptz(actualAt, "actualAt");

  const entityId = id(input.id);
  await execute(
    `insert into public.events (
      id, organization_id, reservation_id, event_type, title, description,
      planned_at, planned_date, actual_at, status, priority, is_task,
      created_by, updated_by
    ) values (
      ${q(entityId)}::uuid,
      ${q(input.organizationId)}::uuid,
      ${q(input.reservationId)}::uuid,
      ${q(input.kind)},
      ${q(appointmentTitles[input.kind])},
      ${input.description == null ? "null" : q(input.description)},
      ${plannedAt == null ? "null" : `${q(plannedAt)}::timestamptz`},
      null,
      ${actualAt == null ? "null" : `${q(actualAt)}::timestamptz`},
      ${q(status)},
      'normal',
      ${status !== "done" ? "true" : "false"},
      ${q(input.ownerId)}::uuid,
      ${q(input.ownerId)}::uuid
    )`,
  );
  registry.register("events", entityId);

  if (JSON.stringify(input) !== JSON.stringify(snapshot)) {
    throw new Error("E2E appointment fixture mutated its input");
  }

  return {
    id: entityId,
    organizationId: input.organizationId,
    reservationId: input.reservationId,
    kind: input.kind,
    status,
    plannedAt,
    actualAt,
    title: appointmentTitles[input.kind],
  };
}

/**
 * Discovers appointment events created by the real reservation UI action and
 * any accidental parasites so cleanup stays complete.
 */
export async function registerActualAppointmentEffects(
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
          'event_id', e.id,
          'event_type', e.event_type,
          'status', e.status,
          'planned_at', e.planned_at,
          'actual_at', e.actual_at,
          'title', e.title,
          'role_id', cr.id,
          'payment_id', p.id,
          'document_id', d.id,
          'animal_id', r.animal_id
        ) order by e.planned_at nulls last, e.created_at nulls last, cr.created_at nulls last), '[]'::json)::text
       from public.reservations r
       left join public.events e
         on e.organization_id = r.organization_id
        and e.reservation_id = r.id
        and e.deleted_at is null
       left join public.contact_roles cr
         on cr.organization_id = r.organization_id
        and cr.contact_id = r.contact_id
       left join public.payments p
         on p.organization_id = r.organization_id
        and p.reservation_id = r.id
       left join public.documents d
         on d.organization_id = r.organization_id
        and d.reservation_id = r.id
       where r.organization_id = ${q(input.organizationId)}::uuid
         and r.id = ${q(input.reservationId)}::uuid
         and r.contact_id = ${q(input.contactId)}::uuid`,
    ),
  ) as {
    event_id: string | null;
    event_type: string | null;
    status: string | null;
    planned_at: string | null;
    actual_at: string | null;
    title: string | null;
    role_id: string | null;
    payment_id: string | null;
    document_id: string | null;
    animal_id: string | null;
  }[];

  for (const row of rows) {
    if (row.event_id && !registry.has("events", row.event_id)) {
      registry.register("events", row.event_id);
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
