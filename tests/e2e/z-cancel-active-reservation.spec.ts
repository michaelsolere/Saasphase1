import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import {
  createAuthenticatedSupabaseClient,
  expectSupabaseData,
  type SupabaseTestClient,
} from "./helpers/supabase";
import { openDialog } from "./helpers/dialogs";

const organizationId = "20000000-0000-4000-8000-000000000001";

function sqlUuidArray(values: string[]) {
  if (values.length === 0) {
    return "array[]::uuid[]";
  }

  return `array[${values.map((value) => `'${value}'::uuid`).join(",")}]`;
}

function runSql(sql: string) {
  return execFileSync(
    "docker",
    [
      "exec",
      "supabase_db_saasphase1",
      "psql",
      "-X",
      "-A",
      "-t",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-c",
      sql,
    ],
    { encoding: "utf8" },
  ).trim();
}

async function createQualifiedApplicationFixture(supabase: SupabaseTestClient) {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("Unable to read authenticated test user");
  }

  const contactId = randomUUID();
  const applicationId = randomUUID();
  const suffix = applicationId.slice(0, 8);
  const displayName = `Cancellation Smoke ${suffix}`;

  const { error: contactError } = await supabase.from("contacts").insert({
    id: contactId,
    organization_id: organizationId,
    contact_type: "person",
    first_name: "Cancellation",
    last_name: `Smoke ${suffix}`,
    display_name: displayName,
    email: `cancellation-smoke-${suffix}@example.invalid`,
    origin_channel: "manual",
    primary_status: "active",
    created_by: user.id,
    updated_by: user.id,
  });

  if (contactError) {
    throw new Error(`create cancellation contact: ${contactError.message}`);
  }

  const { error: applicationError } = await supabase.from("applications").insert({
    id: applicationId,
    organization_id: organizationId,
    contact_id: contactId,
    species: "dog",
    breed: "Golden Retriever",
    desired_period: "Test cancellation",
    desired_sex_preference: "no_preference",
    desired_quantity: 1,
    project_description:
      "Fixture e2e dédiée à l'annulation manuelle d'une réservation active.",
    status: "qualified",
    submitted_at: "2026-04-03T10:00:00+00:00",
    reviewed_at: "2026-04-03T12:00:00+00:00",
    reviewed_by: user.id,
    created_by: user.id,
    updated_by: user.id,
  });

  if (applicationError) {
    throw new Error(`create cancellation application: ${applicationError.message}`);
  }

  const { error: roleError } = await supabase.from("contact_roles").insert({
    id: randomUUID(),
    organization_id: organizationId,
    contact_id: contactId,
    role: "pre_reservation_holder",
    started_at: "2026-06-03",
    created_by: user.id,
    updated_by: user.id,
  });

  if (roleError) {
    throw new Error(`create cancellation role: ${roleError.message}`);
  }

  return { applicationId, contactId, displayName };
}

async function readReservation(
  supabase: SupabaseTestClient,
  reservationId: string,
) {
  return expectSupabaseData(
    await supabase
      .from("reservations")
      .select(
        "id, status, adoption_completed_at, reservation_confirmed_at, animal_id, animal_assigned_at, updated_at, updated_by, price_cents, internal_comment, pre_reservation_deadline, application_id, contact_id",
      )
      .eq("id", reservationId)
      .is("deleted_at", null)
      .single(),
    "read reservation",
  );
}

async function countRows(
  supabase: SupabaseTestClient,
  table: "documents" | "notes" | "payments",
  reservationId: string,
) {
  const result = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("reservation_id", reservationId);

  if (result.error) {
    throw new Error(`count ${table}: ${result.error.message}`);
  }

  return result.count ?? 0;
}

async function cleanupReservationFixture(
  _supabase: SupabaseTestClient,
  contactId: string | null,
  applicationId: string | null,
  reservationId: string | null,
) {
  const contactIds = contactId ? [contactId] : [];
  const applicationIds = applicationId ? [applicationId] : [];
  const reservationIds = reservationId ? [reservationId] : [];

  runSql(`
    with scope as (
      select
        ${sqlUuidArray(contactIds)} as contact_ids,
        ${sqlUuidArray(applicationIds)} as application_ids,
        ${sqlUuidArray(reservationIds)} as reservation_ids
    ),
    target_contacts as (
      select unnest(contact_ids) as id from scope
    ),
    target_applications as (
      select unnest(application_ids) as id from scope
      union
      select id from public.applications
      where contact_id in (select id from target_contacts)
    ),
    target_reservations as (
      select unnest(reservation_ids) as id from scope
      union
      select id from public.reservations
      where application_id in (select id from target_applications)
         or contact_id in (select id from target_contacts)
    ),
    target_documents as (
      select id from public.documents
      where reservation_id in (select id from target_reservations)
         or application_id in (select id from target_applications)
         or contact_id in (select id from target_contacts)
    ),
    del_email as (
      delete from public.email_delivery_attempts
      where reservation_id in (select id from target_reservations)
      returning id
    ),
    del_events as (
      delete from public.events
      where document_id in (select id from target_documents)
         or reservation_id in (select id from target_reservations)
         or application_id in (select id from target_applications)
         or contact_id in (select id from target_contacts)
      returning id
    ),
    del_notes as (
      delete from public.notes
      where document_id in (select id from target_documents)
         or reservation_id in (select id from target_reservations)
         or application_id in (select id from target_applications)
         or contact_id in (select id from target_contacts)
      returning id
    ),
    del_documents as (
      delete from public.documents
      where id in (select id from target_documents)
         or reservation_id in (select id from target_reservations)
         or application_id in (select id from target_applications)
         or contact_id in (select id from target_contacts)
      returning id
    ),
    del_payments as (
      delete from public.payments
      where document_id in (select id from target_documents)
         or reservation_id in (select id from target_reservations)
         or contact_id in (select id from target_contacts)
      returning id
    ),
    del_reservations as (
      delete from public.reservations
      where id in (select id from target_reservations)
         or application_id in (select id from target_applications)
         or contact_id in (select id from target_contacts)
      returning id
    ),
    del_roles as (
      delete from public.contact_roles
      where contact_id in (select id from target_contacts)
      returning id
    ),
    del_applications as (
      delete from public.applications
      where id in (select id from target_applications)
         or contact_id in (select id from target_contacts)
      returning id
    ),
    del_contacts as (
      delete from public.contacts
      where id in (select id from target_contacts)
      returning id
    )
    select 1;
  `);

  const remaining = Number(
    runSql(`
      with scope as (
        select
          ${sqlUuidArray(contactIds)} as contact_ids,
          ${sqlUuidArray(applicationIds)} as application_ids,
          ${sqlUuidArray(reservationIds)} as reservation_ids
      ),
      target_contacts as (
        select unnest(contact_ids) as id from scope
      ),
      target_applications as (
        select unnest(application_ids) as id from scope
      ),
      target_reservations as (
        select unnest(reservation_ids) as id from scope
      )
      select count(*)
      from (
        select id::text from public.email_delivery_attempts
        where reservation_id in (select id from target_reservations)
        union all
        select id::text from public.events
        where reservation_id in (select id from target_reservations)
           or application_id in (select id from target_applications)
           or contact_id in (select id from target_contacts)
        union all
        select id::text from public.notes
        where reservation_id in (select id from target_reservations)
           or application_id in (select id from target_applications)
           or contact_id in (select id from target_contacts)
        union all
        select id::text from public.documents
        where reservation_id in (select id from target_reservations)
           or application_id in (select id from target_applications)
           or contact_id in (select id from target_contacts)
        union all
        select id::text from public.payments
        where reservation_id in (select id from target_reservations)
           or contact_id in (select id from target_contacts)
        union all
        select id::text from public.reservations
        where id in (select id from target_reservations)
           or application_id in (select id from target_applications)
           or contact_id in (select id from target_contacts)
        union all
        select id::text from public.contact_roles
        where contact_id in (select id from target_contacts)
        union all
        select id::text from public.applications
        where id in (select id from target_applications)
           or contact_id in (select id from target_contacts)
        union all
        select id::text from public.contacts
        where id in (select id from target_contacts)
      ) remaining;
    `),
  );

  if (remaining !== 0) {
    throw new Error(`cleanup cancellation fixtures: ${remaining} row(s) remain`);
  }
}

async function createDraftReservation(
  supabase: SupabaseTestClient,
  applicationId: string,
  contactId: string,
) {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("Unable to read authenticated test user");
  }

  const reservationId = randomUUID();
  const { error } = await supabase.from("reservations").insert({
    id: reservationId,
    organization_id: organizationId,
    contact_id: contactId,
    application_id: applicationId,
    species: "dog",
    breed: "Golden Retriever",
    reserved_sex_preference: "no_preference",
    status: "active",
    reservation_confirmed_at: "2026-06-03T10:00:00+00:00",
    created_by: user.id,
    updated_by: user.id,
  });

  if (error) {
    throw new Error(`create cancellation reservation: ${error.message}`);
  }

  return reservationId;
}

test("cancels an active reservation manually without side effects", async ({
  page,
}) => {
  const supabase = await createAuthenticatedSupabaseClient();
  let contactId: string | null = null;
  let applicationId: string | null = null;
  let reservationId: string | null = null;

  try {
    const fixture = await createQualifiedApplicationFixture(supabase);
    applicationId = fixture.applicationId;
    contactId = fixture.contactId;

    await page.goto("/login");
    await page.getByLabel("Email").fill("owner@saasphase1.invalid");
    await page.getByLabel("Mot de passe").fill("LocalDevOwner-2026!");
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page).toHaveURL(/\/candidatures/);

    await page.goto(`/candidatures/${applicationId}`);
    await expect(page.getByRole("heading", { name: fixture.displayName })).toBeVisible();

    reservationId = await createDraftReservation(
      supabase,
      applicationId,
      contactId,
    );

    const beforeCancellation = await readReservation(supabase, reservationId);
    expect(beforeCancellation.status).toBe("active");
    expect(beforeCancellation.adoption_completed_at).toBeNull();
    expect(beforeCancellation.application_id).toBe(applicationId);
    expect(beforeCancellation.contact_id).toBe(contactId);
    const paymentCountBefore = await countRows(supabase, "payments", reservationId);
    const documentCountBefore = await countRows(supabase, "documents", reservationId);
    const noteCountBefore = await countRows(supabase, "notes", reservationId);
    expect(paymentCountBefore).toBe(0);
    expect(documentCountBefore).toBe(0);
    expect(noteCountBefore).toBe(0);

    await page.goto(`/reservations/${reservationId}`);
    await expect(
      page.getByRole("button", { name: "Annuler la réservation" }),
    ).toBeVisible();

    await openDialog(
      page.getByRole("button", { name: "Annuler la réservation" }),
      page.getByRole("heading", {
        name: "Confirmer l’annulation de cette réservation ?",
      }),
    );
    await expect(
      page.getByText(
        "Cette action modifie le statut du dossier. Aucun paiement, document, email, facture ou remboursement n’est créé automatiquement.",
      ),
    ).toBeVisible();
    await page.getByRole("button", { name: "Confirmer l’annulation" }).click();
    await expect(page).toHaveURL(/cancellation_status=success/);
    await expect(page.getByText("Dossier adoptant annulé.")).toBeVisible();
    await expect(page.getByText("Annulée", { exact: true }).first()).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Annuler la réservation" }),
    ).toHaveCount(0);

    const afterCancellation = await readReservation(supabase, reservationId);
    expect(afterCancellation.status).toBe("cancelled");
    expect(afterCancellation.updated_by).not.toBeNull();
    expect(afterCancellation.updated_at).not.toBe(beforeCancellation.updated_at);
    expect(afterCancellation.reservation_confirmed_at).toBe(
      beforeCancellation.reservation_confirmed_at,
    );
    expect(afterCancellation.adoption_completed_at).toBeNull();
    expect(afterCancellation.animal_id).toBe(beforeCancellation.animal_id);
    expect(afterCancellation.animal_assigned_at).toBe(
      beforeCancellation.animal_assigned_at,
    );
    expect(afterCancellation.price_cents).toBe(beforeCancellation.price_cents);
    expect(afterCancellation.internal_comment).toBe(
      beforeCancellation.internal_comment,
    );
    expect(afterCancellation.pre_reservation_deadline).toBe(
      beforeCancellation.pre_reservation_deadline,
    );
    expect(await countRows(supabase, "payments", reservationId)).toBe(
      paymentCountBefore,
    );
    expect(await countRows(supabase, "documents", reservationId)).toBe(
      documentCountBefore,
    );
    expect(await countRows(supabase, "notes", reservationId)).toBe(
      noteCountBefore,
    );
  } finally {
    await cleanupReservationFixture(
      supabase,
      contactId,
      applicationId,
      reservationId,
    );
  }
});
