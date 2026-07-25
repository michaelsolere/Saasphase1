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

export const RESERVATION_NOTE_MAX_BODY_LENGTH = 2_000;
export const RESERVATION_NOTE_TYPE = "internal" as const;
export const RESERVATION_NOTE_VISIBILITY = "internal" as const;

const q = (value: string) => `'${value.replaceAll("'", "''")}'`;
const id = (value?: string) => value ?? randomUUID();

function assertNonEmptyBody(body: string) {
  const trimmed = body.trim();
  if (!trimmed) {
    throw new Error("E2E reservation note body must not be empty");
  }
  if (trimmed.length > RESERVATION_NOTE_MAX_BODY_LENGTH) {
    throw new Error(
      `E2E reservation note body exceeds max length of ${RESERVATION_NOTE_MAX_BODY_LENGTH}`,
    );
  }
  return trimmed;
}

/**
 * Active adopter journey with a reservation_holder role and no notes,
 * payments, documents, animals or appointment events. Composes existing
 * contact / application / journey / role fixtures.
 */
export async function createTestAdopterNoteReadyScenario(
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
    throw new Error("E2E note journey belongs to another organization");
  }

  if (JSON.stringify(input) !== JSON.stringify(snapshot)) {
    throw new Error("E2E note scenario mutated its input");
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
 * Optional direct seed of a reservation-scoped internal note. The integrated
 * UI workflow prefers creating rows through `createReservationNote`; this
 * constructor exists for pure fixture validation and explicit ID registration.
 *
 * Mirrors the server action: reservation + organization + body + author,
 * with `contact_id` / `application_id` left null unless provided for fixture
 * scenarios that need explicit linkage.
 */
export async function createTestReservationNote(
  execute: SqlExecutor,
  registry: Registry,
  input: {
    id?: string;
    organizationId: string;
    reservationId: string;
    ownerId: string;
    body: string;
    contactId?: string | null;
    applicationId?: string | null;
    title?: string | null;
  },
) {
  const snapshot = structuredClone(input);

  if (!input.ownerId?.trim()) {
    throw new Error("E2E reservation note author (ownerId) is required");
  }

  const body = assertNonEmptyBody(input.body);
  const reservation = getAdopterFixtureReservation(registry, input.reservationId);
  if (!reservation || reservation.organizationId !== input.organizationId) {
    throw new Error("E2E reservation note does not match its adopter journey or organization");
  }

  if (
    input.contactId != null &&
    input.contactId !== "" &&
    reservation.contactId !== input.contactId
  ) {
    throw new Error("E2E reservation note contact does not match its adopter journey");
  }

  const entityId = id(input.id);
  await execute(
    `insert into public.notes (
      id, organization_id, reservation_id, contact_id, application_id,
      note_type, title, body, visibility, created_by, updated_by
    ) values (
      ${q(entityId)}::uuid,
      ${q(input.organizationId)}::uuid,
      ${q(input.reservationId)}::uuid,
      ${input.contactId == null || input.contactId === "" ? "null" : `${q(input.contactId)}::uuid`},
      ${input.applicationId == null || input.applicationId === "" ? "null" : `${q(input.applicationId)}::uuid`},
      ${q(RESERVATION_NOTE_TYPE)},
      ${input.title == null ? "null" : q(input.title)},
      ${q(body)},
      ${q(RESERVATION_NOTE_VISIBILITY)},
      ${q(input.ownerId)}::uuid,
      ${q(input.ownerId)}::uuid
    )`,
  );
  registry.register("notes", entityId);

  if (JSON.stringify(input) !== JSON.stringify(snapshot)) {
    throw new Error("E2E reservation note fixture mutated its input");
  }

  return {
    id: entityId,
    organizationId: input.organizationId,
    reservationId: input.reservationId,
    contactId: input.contactId ?? null,
    applicationId: input.applicationId ?? null,
    body,
    noteType: RESERVATION_NOTE_TYPE,
    visibility: RESERVATION_NOTE_VISIBILITY,
    createdBy: input.ownerId,
  };
}

/**
 * Discovers notes created by the real reservation UI action and any
 * accidental parasites so cleanup stays complete.
 */
export async function registerActualNoteEffects(
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
          'note_id', n.id,
          'body', n.body,
          'note_type', n.note_type,
          'visibility', n.visibility,
          'created_by', n.created_by,
          'contact_id', n.contact_id,
          'application_id', n.application_id,
          'deleted_at', n.deleted_at,
          'role_id', cr.id,
          'payment_id', p.id,
          'document_id', d.id,
          'event_id', e.id,
          'animal_id', r.animal_id
        ) order by n.created_at desc nulls last, cr.created_at nulls last), '[]'::json)::text
       from public.reservations r
       left join public.notes n
         on n.organization_id = r.organization_id
        and n.reservation_id = r.id
       left join public.contact_roles cr
         on cr.organization_id = r.organization_id
        and cr.contact_id = r.contact_id
       left join public.payments p
         on p.organization_id = r.organization_id
        and p.reservation_id = r.id
       left join public.documents d
         on d.organization_id = r.organization_id
        and d.reservation_id = r.id
       left join public.events e
         on e.organization_id = r.organization_id
        and e.reservation_id = r.id
       where r.organization_id = ${q(input.organizationId)}::uuid
         and r.id = ${q(input.reservationId)}::uuid
         and r.contact_id = ${q(input.contactId)}::uuid`,
    ),
  ) as {
    note_id: string | null;
    body: string | null;
    note_type: string | null;
    visibility: string | null;
    created_by: string | null;
    contact_id: string | null;
    application_id: string | null;
    deleted_at: string | null;
    role_id: string | null;
    payment_id: string | null;
    document_id: string | null;
    event_id: string | null;
    animal_id: string | null;
  }[];

  for (const row of rows) {
    if (row.note_id && !registry.has("notes", row.note_id)) {
      registry.register("notes", row.note_id);
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
    if (row.event_id && !registry.has("events", row.event_id)) {
      registry.register("events", row.event_id);
    }
    if (row.animal_id && !registry.has("animals", row.animal_id)) {
      registry.register("animals", row.animal_id);
    }
  }
  return rows;
}
