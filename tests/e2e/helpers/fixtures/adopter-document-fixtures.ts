import { randomUUID } from "node:crypto";

import {
  createTestAdopterJourney,
  createTestApplication,
  createTestContact,
  createTestAdopterLitter,
  createTestLitterGroup,
  getAdopterFixtureContact,
  getAdopterFixtureReservation,
} from "./adopter-payment-fixtures";
import { type FixtureTable, type SqlExecutor, createE2eFixtureRegistry } from "./fixture-registry";

type Registry = ReturnType<typeof createE2eFixtureRegistry>;
type DocumentType = "reservation_contract" | "commitment_certificate" | "sale_certificate";
type Document = {
  id: string;
  organizationId: string;
  contactId: string;
  reservationId: string;
  applicationId: string | null;
  documentType: DocumentType;
  status: "to_generate";
};

const q = (value: string) => `'${value.replaceAll("'", "''")}'`;
const id = (value?: string) => value ?? randomUUID();

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

export async function createTestAdopterDocument(
  execute: SqlExecutor,
  registry: Registry,
  input: {
    id?: string;
    organizationId: string;
    contactId: string;
    reservationId: string;
    applicationId?: string | null;
    ownerId: string;
    documentType?: DocumentType;
    title?: string;
  },
) {
  const snapshot = structuredClone(input);
  const contact = getAdopterFixtureContact(registry, input.contactId);
  const reservation = getAdopterFixtureReservation(registry, input.reservationId);
  if (!contact || contact.organizationId !== input.organizationId) {
    throw new Error("E2E adopter document contact belongs to another organization");
  }
  if (
    !reservation ||
    reservation.organizationId !== input.organizationId ||
    reservation.contactId !== input.contactId
  ) {
    throw new Error("E2E adopter document does not match its adopter journey or contact");
  }

  const entityId = id(input.id);
  const documentType = input.documentType ?? "reservation_contract";
  const applicationId = input.applicationId ?? null;
  await insert(execute, registry, "documents", {
    id: entityId,
    organization_id: input.organizationId,
    contact_id: input.contactId,
    application_id: applicationId,
    reservation_id: input.reservationId,
    document_type: documentType,
    status: "to_generate",
    title: input.title ?? `E2E document ${entityId.slice(0, 8)}`,
    generated_from_template: false,
    signature_required: true,
    created_by: input.ownerId,
    updated_by: input.ownerId,
  });

  if (JSON.stringify(input) !== JSON.stringify(snapshot)) {
    throw new Error("E2E adopter document fixture mutated its input");
  }

  return {
    id: entityId,
    organizationId: input.organizationId,
    contactId: input.contactId,
    reservationId: input.reservationId,
    applicationId,
    documentType,
    status: "to_generate",
  } satisfies Document;
}

export async function registerActualDocumentEffects(
  execute: SqlExecutor,
  registry: Registry,
  input: {
    organizationId: string;
    reservationId: string;
    contactId: string;
    documentId: string;
  },
) {
  const rows = JSON.parse(
    await execute(
      `select coalesce(json_agg(json_build_object('document_id', d.id) order by d.created_at), '[]'::json)::text
       from public.documents d
       where d.organization_id = ${q(input.organizationId)}::uuid
         and d.id = ${q(input.documentId)}::uuid
         and d.reservation_id = ${q(input.reservationId)}::uuid
         and d.contact_id = ${q(input.contactId)}::uuid`,
    ),
  ) as { document_id: string }[];

  for (const row of rows) {
    if (!registry.has("documents", row.document_id)) {
      registry.register("documents", row.document_id);
    }
  }
  return rows;
}

export async function createTestAdopterDocumentScenario(
  execute: SqlExecutor,
  registry: Registry,
  input: {
    organizationId: string;
    ownerId: string;
    displayName?: string;
    documentType?: DocumentType;
    title?: string;
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
    status: "active",
  });
  const document = await createTestAdopterDocument(execute, registry, {
    ...input,
    contactId: contact.id,
    reservationId: journey.id,
    applicationId: application.id,
    documentType: input.documentType,
    title: input.title,
  });
  if (JSON.stringify(input) !== JSON.stringify(snapshot)) {
    throw new Error("E2E adopter document scenario mutated its input");
  }
  return { groupId, litterId, contact, application, journey, document };
}
