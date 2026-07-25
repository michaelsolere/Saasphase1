import { randomUUID } from "node:crypto";

import { type FixtureTable, type SqlExecutor, createE2eFixtureRegistry } from "./fixture-registry";

type Registry = ReturnType<typeof createE2eFixtureRegistry>;
type Contact = { id: string; organizationId: string };
type Application = Contact & { litterGroupId: string | null; litterId: string | null };
type Reservation = Application & { contactId: string };
type Payment = Reservation & { amountCents: number };
type State = {
  contacts: Map<string, Contact>;
  applications: Map<string, Application>;
  reservations: Map<string, Reservation>;
  litters: Map<string, { organizationId: string; litterGroupId: string | null }>;
};

const states = new WeakMap<Registry, State>();
const q = (value: string) => `'${value.replaceAll("'", "''")}'`;
const id = (value?: string) => value ?? randomUUID();
const deterministic = "2026-07-25T10:00:00.000Z";

function state(registry: Registry) {
  let current = states.get(registry);
  if (!current) {
    current = { contacts: new Map(), applications: new Map(), reservations: new Map(), litters: new Map() };
    states.set(registry, current);
  }
  return current;
}

function validateAmount(amountCents: number) {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new Error("E2E payment amountCents must be a positive integer");
  }
}

async function insert(execute: SqlExecutor, registry: Registry, table: FixtureTable, values: Record<string, string | number | null>) {
  const entityId = String(values.id);
  await execute(`insert into public.${table} (${Object.keys(values).join(",")}) values (${Object.values(values).map((value) => value === null ? "null" : typeof value === "number" ? String(value) : q(value)).join(",")})`);
  registry.register(table, entityId);
  return entityId;
}

export async function createTestContact(execute: SqlExecutor, registry: Registry, input: { id?: string; organizationId: string; ownerId: string; displayName?: string; email?: string }) {
  const snapshot = structuredClone(input); const entityId = id(input.id);
  await insert(execute, registry, "contacts", { id: entityId, organization_id: input.organizationId, contact_type: "person", first_name: "E2E", last_name: "Adopter", display_name: input.displayName ?? `E2E adopter ${entityId.slice(0, 8)}`, email: input.email ?? `adopter-${entityId.slice(0, 8)}@example.invalid`, origin_channel: "manual", primary_status: "active", created_by: input.ownerId, updated_by: input.ownerId });
  const row = { id: entityId, organizationId: input.organizationId }; state(registry).contacts.set(entityId, row);
  if (JSON.stringify(input) !== JSON.stringify(snapshot)) throw new Error("E2E contact fixture mutated its input");
  return row;
}

export async function createTestLitterGroup(execute: SqlExecutor, registry: Registry, input: { id?: string; organizationId: string; ownerId: string; name?: string }) {
  const entityId = id(input.id);
  return insert(execute, registry, "litter_groups", { id: entityId, organization_id: input.organizationId, name: input.name ?? `E2E group ${entityId.slice(0, 8)}`, species: "dog", status: "open_for_applications", created_by: input.ownerId, updated_by: input.ownerId });
}

export async function createTestAdopterLitter(execute: SqlExecutor, registry: Registry, input: { id?: string; organizationId: string; ownerId: string; litterGroupId: string; name?: string }) {
  const entityId = id(input.id);
  await insert(execute, registry, "litters", { id: entityId, organization_id: input.organizationId, litter_group_id: input.litterGroupId, name: input.name ?? `E2E litter ${entityId.slice(0, 8)}`, species: "dog", breed: "Golden Retriever", status: "pregnancy_confirmed", created_by: input.ownerId, updated_by: input.ownerId });
  state(registry).litters.set(entityId, { organizationId: input.organizationId, litterGroupId: input.litterGroupId });
  return entityId;
}

export async function createTestApplication(execute: SqlExecutor, registry: Registry, input: { id?: string; organizationId: string; contactId: string; ownerId: string; litterGroupId?: string | null; litterId?: string | null }) {
  const snapshot = structuredClone(input); const contact = state(registry).contacts.get(input.contactId); const litter = input.litterId ? state(registry).litters.get(input.litterId) : undefined;
  if (!contact || contact.organizationId !== input.organizationId) throw new Error("E2E application contact belongs to another organization");
  if (litter && (litter.organizationId !== input.organizationId || (input.litterGroupId && litter.litterGroupId !== input.litterGroupId))) throw new Error("E2E application litter or group is incoherent");
  const entityId = id(input.id);
  await insert(execute, registry, "applications", { id: entityId, organization_id: input.organizationId, contact_id: input.contactId, species: "dog", breed: "Golden Retriever", desired_litter_group_id: input.litterGroupId ?? null, desired_litter_id: input.litterId ?? null, desired_sex_preference: "no_preference", desired_quantity: 1, project_description: "Fixture paiement pré-réservation.", status: "qualified", submitted_at: deterministic, reviewed_at: deterministic, reviewed_by: input.ownerId, created_by: input.ownerId, updated_by: input.ownerId });
  const row = { id: entityId, organizationId: input.organizationId, litterGroupId: input.litterGroupId ?? null, litterId: input.litterId ?? null }; state(registry).applications.set(entityId, row);
  if (JSON.stringify(input) !== JSON.stringify(snapshot)) throw new Error("E2E application fixture mutated its input"); return row;
}

export async function createTestAdopterJourney(execute: SqlExecutor, registry: Registry, input: { id?: string; organizationId: string; contactId: string; applicationId: string; ownerId: string; litterGroupId?: string | null; litterId?: string | null; status?: "pre_reservation_requested" | "active" }) {
  const snapshot = structuredClone(input); const contact = state(registry).contacts.get(input.contactId); const application = state(registry).applications.get(input.applicationId);
  if (!contact || contact.organizationId !== input.organizationId || !application || application.organizationId !== input.organizationId || application.id !== input.applicationId) throw new Error("E2E adopter journey contact or application belongs to another organization");
  if (application.litterId !== (input.litterId ?? null) || application.litterGroupId !== (input.litterGroupId ?? null)) throw new Error("E2E adopter journey litter or group is incoherent");
  const entityId = id(input.id);
  await insert(execute, registry, "reservations", { id: entityId, organization_id: input.organizationId, contact_id: input.contactId, application_id: input.applicationId, litter_group_id: input.litterGroupId ?? null, litter_id: input.litterId ?? null, species: "dog", breed: "Golden Retriever", reserved_sex_preference: "no_preference", status: input.status ?? "pre_reservation_requested", pre_reservation_deadline: "2026-07-30T12:00:00.000Z", created_by: input.ownerId, updated_by: input.ownerId });
  const row = { id: entityId, organizationId: input.organizationId, contactId: input.contactId, litterGroupId: input.litterGroupId ?? null, litterId: input.litterId ?? null }; state(registry).reservations.set(entityId, row);
  if (JSON.stringify(input) !== JSON.stringify(snapshot)) throw new Error("E2E adopter journey fixture mutated its input"); return row;
}

export async function createTestExpectedPayment(execute: SqlExecutor, registry: Registry, input: { id?: string; organizationId: string; contactId: string; reservationId: string; ownerId: string; amountCents: number; paymentType?: "arrhes" | "pre_reservation_deposit_refundable" }) {
  validateAmount(input.amountCents); const snapshot = structuredClone(input); const reservation = state(registry).reservations.get(input.reservationId);
  if (!reservation || reservation.organizationId !== input.organizationId || reservation.contactId !== input.contactId) throw new Error("E2E expected payment does not match its adopter journey or contact");
  const entityId = id(input.id);
  await insert(execute, registry, "payments", { id: entityId, organization_id: input.organizationId, contact_id: input.contactId, reservation_id: input.reservationId, amount_cents: input.amountCents, currency: "EUR", payment_type: input.paymentType ?? "pre_reservation_deposit_refundable", status: "requested", payment_method: "bank_transfer", requested_at: deterministic, due_date: "2026-07-30", created_by: input.ownerId, updated_by: input.ownerId });
  if (JSON.stringify(input) !== JSON.stringify(snapshot)) throw new Error("E2E expected payment fixture mutated its input"); return { ...reservation, id: entityId, amountCents: input.amountCents } satisfies Payment;
}

export async function createTestReceivedPayment(execute: SqlExecutor, registry: Registry, input: { id?: string; organizationId: string; contactId: string; reservationId: string; ownerId: string; amountCents: number; paymentType?: "arrhes" | "pre_reservation_deposit_refundable" }) {
  validateAmount(input.amountCents); const snapshot = structuredClone(input); const reservation = state(registry).reservations.get(input.reservationId);
  if (!reservation || reservation.organizationId !== input.organizationId || reservation.contactId !== input.contactId) throw new Error("E2E received payment does not match its adopter journey or contact");
  const entityId = id(input.id);
  await insert(execute, registry, "payments", { id: entityId, organization_id: input.organizationId, contact_id: input.contactId, reservation_id: input.reservationId, amount_cents: input.amountCents, currency: "EUR", payment_type: input.paymentType ?? "pre_reservation_deposit_refundable", status: "paid", payment_method: "bank_transfer", requested_at: deterministic, paid_at: deterministic, created_by: input.ownerId, updated_by: input.ownerId });
  if (JSON.stringify(input) !== JSON.stringify(snapshot)) throw new Error("E2E received payment fixture mutated its input"); return { ...reservation, id: entityId, amountCents: input.amountCents } satisfies Payment;
}

export async function createTestContactRole(execute: SqlExecutor, registry: Registry, input: { id?: string; organizationId: string; contactId: string; ownerId: string; role: "candidate" | "pre_reservation_holder"; isActive?: boolean }) {
  const contact = state(registry).contacts.get(input.contactId); if (!contact || contact.organizationId !== input.organizationId) throw new Error("E2E contact role belongs to another organization");
  const entityId = id(input.id); await insert(execute, registry, "contact_roles", { id: entityId, organization_id: input.organizationId, contact_id: input.contactId, role: input.role, started_at: "2026-07-10", is_active: input.isActive ?? true ? "true" : "false", created_by: input.ownerId, updated_by: input.ownerId }); return entityId;
}

export async function registerActualPaymentEffects(execute: SqlExecutor, registry: Registry, input: { organizationId: string; reservationId: string; contactId: string; paymentId: string }) {
  const rows = JSON.parse(await execute(`select coalesce(json_agg(json_build_object('payment_id',p.id,'role_id',cr.id) order by cr.created_at),'[]'::json)::text from public.payments p left join public.contact_roles cr on cr.organization_id=p.organization_id and cr.contact_id=p.contact_id and cr.role='pre_reservation_holder' where p.organization_id=${q(input.organizationId)}::uuid and p.id=${q(input.paymentId)}::uuid and p.reservation_id=${q(input.reservationId)}::uuid and p.contact_id=${q(input.contactId)}::uuid`)) as { payment_id: string; role_id: string | null }[];
  for (const row of rows) { if (!registry.has("payments", row.payment_id)) registry.register("payments", row.payment_id); if (row.role_id && !registry.has("contact_roles", row.role_id)) registry.register("contact_roles", row.role_id); }
  return rows;
}

export async function createTestPreReservationScenario(execute: SqlExecutor, registry: Registry, input: { organizationId: string; ownerId: string; amountCents?: number; displayName?: string }) {
  const snapshot = structuredClone(input); const groupId = await createTestLitterGroup(execute, registry, input); const litterId = await createTestAdopterLitter(execute, registry, { ...input, litterGroupId: groupId }); const contact = await createTestContact(execute, registry, { ...input, displayName: input.displayName }); const application = await createTestApplication(execute, registry, { ...input, contactId: contact.id, litterGroupId: groupId, litterId }); const journey = await createTestAdopterJourney(execute, registry, { ...input, contactId: contact.id, applicationId: application.id, litterGroupId: groupId, litterId }); const candidateRoleId = await createTestContactRole(execute, registry, { ...input, contactId: contact.id, role: "candidate" }); const payment = await createTestExpectedPayment(execute, registry, { ...input, contactId: contact.id, reservationId: journey.id, amountCents: input.amountCents ?? 25_000 });
  if (JSON.stringify(input) !== JSON.stringify(snapshot)) throw new Error("E2E pre-reservation scenario mutated its input"); return { groupId, litterId, contact, application, journey, candidateRoleId, payment };
}
