import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

import {
  createAnonymousSupabaseClient,
  createAuthenticatedSupabaseClient,
  expectSupabaseData,
  type SupabaseTestClient,
} from "./helpers/supabase";

const organizationId = "20000000-0000-4000-8000-000000000001";
const nicolasApplicationId = "80000000-0000-4000-8000-000000000004";
const nicolasPaymentId = "a0000000-0000-4000-8000-000000000001";
const nicolasReservationId = "90000000-0000-4000-8000-000000000002";

type RpcFixture = {
  groupId: string;
  litterId: string;
  contactIds: string[];
  contactRoleIds: string[];
  applicationIds: {
    campaign: string;
    insufficient: string;
  };
  insufficientReservationId: string;
  insufficientPaymentId: string;
};

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("owner@saasphase1.invalid");
  await page.getByLabel("Mot de passe").fill("LocalDevOwner-2026!");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/connexion=success/);
}

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

async function cleanupRpcFixture(
  _supabase: SupabaseTestClient,
  fixture: RpcFixture | null,
) {
  if (!fixture) {
    return;
  }

  const applicationIds = Object.values(fixture.applicationIds);
  const cleanupSql = `
    with scope as (
      select
        ${sqlUuidArray(fixture.contactIds)} as contact_ids,
        ${sqlUuidArray(applicationIds)} as application_ids,
        ${sqlUuidArray([
          fixture.insufficientReservationId,
        ])} as reservation_ids,
        ${sqlUuidArray([fixture.insufficientPaymentId])} as payment_ids,
        ${sqlUuidArray([fixture.litterId])} as litter_ids,
        ${sqlUuidArray([fixture.groupId])} as group_ids
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
         or litter_id in (select unnest(litter_ids) from scope)
         or litter_group_id in (select unnest(group_ids) from scope)
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
         or litter_id in (select unnest(litter_ids) from scope)
      returning id
    ),
    del_notes as (
      delete from public.notes
      where document_id in (select id from target_documents)
         or reservation_id in (select id from target_reservations)
         or application_id in (select id from target_applications)
         or contact_id in (select id from target_contacts)
         or litter_id in (select unnest(litter_ids) from scope)
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
      where id in (select unnest(payment_ids) from scope)
         or reservation_id in (select id from target_reservations)
         or contact_id in (select id from target_contacts)
      returning id
    ),
    del_reservations as (
      delete from public.reservations
      where id in (select id from target_reservations)
         or application_id in (select id from target_applications)
         or contact_id in (select id from target_contacts)
         or litter_id in (select unnest(litter_ids) from scope)
         or litter_group_id in (select unnest(group_ids) from scope)
      returning id
    ),
    del_roles as (
      delete from public.contact_roles
      where id in (select unnest(${sqlUuidArray(fixture.contactRoleIds)}))
         or contact_id in (select id from target_contacts)
      returning id
    ),
    del_applications as (
      delete from public.applications
      where id in (select id from target_applications)
         or contact_id in (select id from target_contacts)
         or desired_litter_id in (select unnest(litter_ids) from scope)
         or desired_litter_group_id in (select unnest(group_ids) from scope)
      returning id
    ),
    del_contacts as (
      delete from public.contacts
      where id in (select id from target_contacts)
      returning id
    ),
    del_animals as (
      delete from public.animals
      where litter_id in (select unnest(litter_ids) from scope)
      returning id
    ),
    del_litters as (
      delete from public.litters
      where id in (select unnest(litter_ids) from scope)
      returning id
    ),
    del_groups as (
      delete from public.litter_groups
      where id in (select unnest(group_ids) from scope)
      returning id
    )
    select 1;
  `;
  runSql(cleanupSql);

  const remaining = Number(
    runSql(`
      with scope as (
        select
          ${sqlUuidArray(fixture.contactIds)} as contact_ids,
          ${sqlUuidArray(applicationIds)} as application_ids,
          ${sqlUuidArray([
            fixture.insufficientReservationId,
          ])} as reservation_ids,
          ${sqlUuidArray([fixture.insufficientPaymentId])} as payment_ids,
          ${sqlUuidArray([fixture.litterId])} as litter_ids,
          ${sqlUuidArray([fixture.groupId])} as group_ids
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
           or litter_id in (select unnest(litter_ids) from scope)
        union all
        select id::text from public.notes
        where reservation_id in (select id from target_reservations)
           or application_id in (select id from target_applications)
           or contact_id in (select id from target_contacts)
           or litter_id in (select unnest(litter_ids) from scope)
        union all
        select id::text from public.documents
        where reservation_id in (select id from target_reservations)
           or application_id in (select id from target_applications)
           or contact_id in (select id from target_contacts)
        union all
        select id::text from public.payments
        where id in (select unnest(payment_ids) from scope)
           or reservation_id in (select id from target_reservations)
           or contact_id in (select id from target_contacts)
        union all
        select id::text from public.reservations
        where id in (select id from target_reservations)
           or application_id in (select id from target_applications)
           or contact_id in (select id from target_contacts)
           or litter_id in (select unnest(litter_ids) from scope)
           or litter_group_id in (select unnest(group_ids) from scope)
        union all
        select id::text from public.contact_roles
        where id in (select unnest(${sqlUuidArray(fixture.contactRoleIds)}))
           or contact_id in (select id from target_contacts)
        union all
        select id::text from public.applications
        where id in (select id from target_applications)
           or contact_id in (select id from target_contacts)
           or desired_litter_id in (select unnest(litter_ids) from scope)
           or desired_litter_group_id in (select unnest(group_ids) from scope)
        union all
        select id::text from public.contacts
        where id in (select id from target_contacts)
        union all
        select id::text from public.animals
        where litter_id in (select unnest(litter_ids) from scope)
        union all
        select id::text from public.litters
        where id in (select unnest(litter_ids) from scope)
        union all
        select id::text from public.litter_groups
        where id in (select unnest(group_ids) from scope)
      ) remaining;
    `),
  );

  if (remaining !== 0) {
    throw new Error(`cleanup transactional RPC fixtures: ${remaining} row(s) remain`);
  }
}

async function createRpcFixture(
  supabase: SupabaseTestClient,
): Promise<RpcFixture> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("Unable to read authenticated test user");
  }

  const groupId = randomUUID();
  const litterId = randomUUID();
  const suffix = groupId.slice(0, 8);
  const contactIds = [randomUUID(), randomUUID()];
  const contactRoleIds = [randomUUID(), randomUUID()];
  const applicationIds = {
    campaign: randomUUID(),
    insufficient: randomUUID(),
  };
  const insufficientReservationId = randomUUID();
  const insufficientPaymentId = randomUUID();

  const { error: groupError } = await supabase.from("litter_groups").insert({
    id: groupId,
    organization_id: organizationId,
    name: `E2E RPC pré-réservation ${suffix}`,
    species: "dog",
    status: "open_for_applications",
    created_by: user.id,
    updated_by: user.id,
  });
  if (groupError) throw new Error(`create group: ${groupError.message}`);

  const { error: litterError } = await supabase.from("litters").insert({
    id: litterId,
    organization_id: organizationId,
    litter_group_id: groupId,
    name: `E2E RPC portée ${suffix}`,
    species: "dog",
    breed: "Golden Retriever",
    status: "pregnancy_confirmed",
    created_by: user.id,
    updated_by: user.id,
  });
  if (litterError) throw new Error(`create litter: ${litterError.message}`);

  const { error: contactsError } = await supabase.from("contacts").insert([
    {
      id: contactIds[0],
      organization_id: organizationId,
      contact_type: "person",
      first_name: "E2E RPC",
      last_name: `Campagne ${suffix}`,
      display_name: `E2E RPC campagne ${suffix}`,
      email: `rpc-campaign-${suffix}@example.invalid`,
      origin_channel: "manual",
      primary_status: "active",
      created_by: user.id,
      updated_by: user.id,
    },
    {
      id: contactIds[1],
      organization_id: organizationId,
      contact_type: "person",
      first_name: "E2E RPC",
      last_name: `Insuffisant ${suffix}`,
      display_name: `E2E RPC insuffisant ${suffix}`,
      email: `rpc-insufficient-${suffix}@example.invalid`,
      origin_channel: "manual",
      primary_status: "active",
      created_by: user.id,
      updated_by: user.id,
    },
  ]);
  if (contactsError) throw new Error(`create contacts: ${contactsError.message}`);

  const { error: rolesError } = await supabase.from("contact_roles").insert([
    {
      id: contactRoleIds[0],
      organization_id: organizationId,
      contact_id: contactIds[0],
      role: "candidate",
      started_at: "2026-07-10",
      created_by: user.id,
      updated_by: user.id,
    },
    {
      id: contactRoleIds[1],
      organization_id: organizationId,
      contact_id: contactIds[1],
      role: "candidate",
      started_at: "2026-07-10",
      created_by: user.id,
      updated_by: user.id,
    },
  ]);
  if (rolesError) throw new Error(`create contact roles: ${rolesError.message}`);

  const { error: applicationsError } = await supabase.from("applications").insert([
    {
      id: applicationIds.campaign,
      organization_id: organizationId,
      contact_id: contactIds[0],
      species: "dog",
      breed: "Golden Retriever",
      desired_litter_id: litterId,
      desired_litter_group_id: groupId,
      desired_sex_preference: "no_preference",
      desired_quantity: 1,
      project_description: "Fixture RPC campagne.",
      status: "qualified",
      reviewed_at: "2026-07-10T10:00:00+00:00",
      reviewed_by: user.id,
      created_by: user.id,
      updated_by: user.id,
    },
    {
      id: applicationIds.insufficient,
      organization_id: organizationId,
      contact_id: contactIds[1],
      species: "dog",
      breed: "Golden Retriever",
      desired_litter_id: litterId,
      desired_litter_group_id: groupId,
      desired_sex_preference: "no_preference",
      desired_quantity: 1,
      project_description: "Fixture RPC paiement insuffisant.",
      status: "qualified",
      reviewed_at: "2026-07-10T10:00:00+00:00",
      reviewed_by: user.id,
      created_by: user.id,
      updated_by: user.id,
    },
  ]);
  if (applicationsError) {
    throw new Error(`create applications: ${applicationsError.message}`);
  }

  const { error: insufficientReservationError } = await supabase
    .from("reservations")
    .insert({
      id: insufficientReservationId,
      organization_id: organizationId,
      contact_id: contactIds[1],
      application_id: applicationIds.insufficient,
      litter_group_id: groupId,
      litter_id: litterId,
      species: "dog",
      breed: "Golden Retriever",
      reserved_sex_preference: "no_preference",
      status: "pre_reservation_requested",
      created_by: user.id,
      updated_by: user.id,
    });
  if (insufficientReservationError) {
    throw new Error(
      `create insufficient reservation: ${insufficientReservationError.message}`,
    );
  }

  const { error: insufficientPaymentError } = await supabase.from("payments").insert({
    id: insufficientPaymentId,
    organization_id: organizationId,
    contact_id: contactIds[1],
    reservation_id: insufficientReservationId,
    amount_cents: 1000,
    currency: "EUR",
    payment_type: "arrhes",
    status: "requested",
    payment_method: "bank_transfer",
    requested_at: new Date().toISOString(),
    due_date: "2026-07-25",
    created_by: user.id,
    updated_by: user.id,
  });
  if (insufficientPaymentError) {
    throw new Error(`create insufficient payment: ${insufficientPaymentError.message}`);
  }

  return {
    groupId,
    litterId,
    contactIds,
    contactRoleIds,
    applicationIds,
    insufficientReservationId,
    insufficientPaymentId,
  };
}

test("transactional RPCs serialize campaign creation and payment transition", async () => {
  const supabase = await createAuthenticatedSupabaseClient();
  let fixture: RpcFixture | null = null;

  try {
    fixture = await createRpcFixture(supabase);

    const campaignCalls = await Promise.all([
      supabase.rpc("create_pre_reservation_request_for_application", {
        p_application_id: fixture.applicationIds.campaign,
        p_target_litter_id: fixture.litterId,
        p_target_litter_group_id: fixture.groupId,
      }),
      supabase.rpc("create_pre_reservation_request_for_application", {
        p_application_id: fixture.applicationIds.campaign,
        p_target_litter_id: fixture.litterId,
        p_target_litter_group_id: fixture.groupId,
      }),
    ]);

    for (const call of campaignCalls) {
      expect(call.error).toBeNull();
    }

    const outcomes = campaignCalls.map((call) => call.data?.[0]?.outcome).sort();
    expect(outcomes).toEqual(["already_exists", "created"]);

    const reservations = expectSupabaseData(
      await supabase
        .from("reservations")
        .select("id, status")
        .eq("application_id", fixture.applicationIds.campaign)
        .is("deleted_at", null),
      "read concurrent campaign reservations",
    );
    expect(reservations).toHaveLength(1);
    expect(reservations[0].status).toBe("pre_reservation_requested");

    const payments = expectSupabaseData(
      await supabase
        .from("payments")
        .select("id, status, payment_type, amount_cents")
        .eq("reservation_id", reservations[0].id)
        .is("deleted_at", null),
      "read concurrent campaign payments",
    );
    expect(payments).toHaveLength(1);
    expect(payments[0].status).toBe("requested");
    expect(payments[0].payment_type).toBe("arrhes");

    const paymentTransitionCalls = await Promise.all([
      supabase.rpc("mark_pre_reservation_payment_paid", {
        p_payment_id: payments[0].id,
      }),
      supabase.rpc("mark_pre_reservation_payment_paid", {
        p_payment_id: payments[0].id,
      }),
    ]);

    for (const call of paymentTransitionCalls) {
      expect(call.error).toBeNull();
    }

    const transitionOutcomes = paymentTransitionCalls
      .map((call) => call.data?.[0]?.outcome)
      .sort();
    expect(transitionOutcomes).toEqual(["already_paid", "paid"]);

    const activeRoles = expectSupabaseData(
      await supabase
        .from("contact_roles")
        .select("role")
        .eq("contact_id", fixture.contactIds[0])
        .eq("is_active", true)
        .is("deleted_at", null),
      "read active roles after transition",
    ).map((role) => role.role);

    expect(activeRoles).toEqual(["pre_reservation_holder"]);
  } finally {
    await cleanupRpcFixture(supabase, fixture);
  }
});

test("RPC guards reject anon, invalid payment methods and insufficient amounts", async () => {
  const supabase = await createAuthenticatedSupabaseClient();
  const anonymousSupabase = createAnonymousSupabaseClient();
  let fixture: RpcFixture | null = null;

  try {
    fixture = await createRpcFixture(supabase);

    const anonCampaign = await anonymousSupabase.rpc(
      "create_pre_reservation_request_for_application",
      {
        p_application_id: fixture.applicationIds.campaign,
        p_target_litter_id: fixture.litterId,
        p_target_litter_group_id: fixture.groupId,
      },
    );
    expect(anonCampaign.error).not.toBeNull();

    const invalidMethod = await supabase.rpc("mark_pre_reservation_payment_paid", {
      p_payment_id: fixture.insufficientPaymentId,
      p_payment_method: "wire-with-glitter",
    });
    expect(invalidMethod.error).toBeNull();
    expect(invalidMethod.data?.[0]?.outcome).toBe("ineligible");
    expect(invalidMethod.data?.[0]?.reason).toBe("invalid_payment_method");

    const insufficient = await supabase.rpc("mark_pre_reservation_payment_paid", {
      p_payment_id: fixture.insufficientPaymentId,
    });
    expect(insufficient.error).toBeNull();
    expect(insufficient.data?.[0]?.outcome).toBe("ineligible");
    expect(insufficient.data?.[0]?.reason).toBe("insufficient_amount");

    const unchangedPayment = expectSupabaseData(
      await supabase
        .from("payments")
        .select("status, paid_at")
        .eq("id", fixture.insufficientPaymentId)
        .maybeSingle(),
      "read insufficient payment after refused transition",
    );
    expect(unchangedPayment?.status).toBe("requested");
    expect(unchangedPayment?.paid_at).toBeNull();
  } finally {
    await cleanupRpcFixture(supabase, fixture);
  }
});

test("Nicolas remains candidate until payment, then enters the adopter journey", async ({
  page,
}) => {
  test.setTimeout(90_000);

  const supabase = await createAuthenticatedSupabaseClient();

  await login(page);

  await page.goto("/candidatures?filtre=validees");
  await expect(
    page.getByRole("link", { name: "Nicolas Bernard", exact: true }),
  ).toBeVisible();

  await page.goto(`/candidatures/${nicolasApplicationId}`);
  await expect(
    page.getByText("Pré-réservation en attente de règlement"),
  ).toBeVisible();
  await expect(page.getByText("250,00 €", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("21 juin 2026", { exact: false }).first()).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: /Marquer la pré-réservation de 250,00 € comme payée/,
    }),
  ).toBeVisible();

  await page.goto(`/reservations/${nicolasReservationId}`);
  await expect(page).toHaveURL(new RegExp(`/candidatures/${nicolasApplicationId}`));
  await expect(
    page.getByRole("heading", { name: "Parcours adoptant de Nicolas Bernard" }),
  ).toHaveCount(0);

  const paymentsBeforeDirectPost = expectSupabaseData(
    await supabase
      .from("payments")
      .select("id, status")
      .eq("reservation_id", nicolasReservationId)
      .is("deleted_at", null),
    "read Nicolas payments before guarded direct post",
  );
  expect(paymentsBeforeDirectPost).toHaveLength(1);
  expect(paymentsBeforeDirectPost[0].id).toBe(nicolasPaymentId);
  expect(paymentsBeforeDirectPost[0].status).toBe("requested");

  await page.goto("/reservations/90000000-0000-4000-8000-000000000005");
  await page.getByRole("button", { name: "+ Enregistrer un encaissement" }).click();
  await page.locator('input[name="amount"]').fill("250");
  await page.locator('select[name="payment_type"]').selectOption("arrhes");
  await page.locator('select[name="status"]').selectOption("requested");
  await page.locator('select[name="payment_method"]').selectOption("bank_transfer");
  await page.locator('input[name="payment_date"]').fill("2026-07-10");
  const paymentForm = page.locator('form:has(input[name="amount"])');
  await paymentForm.locator('input[name="reservation_id"]').evaluate((input, value) => {
    (input as HTMLInputElement).value = value;
  }, nicolasReservationId);
  await paymentForm.evaluate((form) => {
    (form as HTMLFormElement).requestSubmit();
  });
  await expect(page).toHaveURL(new RegExp(`/candidatures/${nicolasApplicationId}`));

  const paymentsAfterDirectPost = expectSupabaseData(
    await supabase
      .from("payments")
      .select("id, status")
      .eq("reservation_id", nicolasReservationId)
      .is("deleted_at", null),
    "read Nicolas payments after guarded direct post",
  );
  expect(paymentsAfterDirectPost).toHaveLength(1);
  expect(paymentsAfterDirectPost[0].id).toBe(nicolasPaymentId);
  expect(paymentsAfterDirectPost[0].status).toBe("requested");

  await page.goto(`/payments/${nicolasPaymentId}`);
  await expect(
    page.getByRole("link", { name: "Consulter la fiche du candidat" }),
  ).toHaveAttribute("href", `/candidatures/${nicolasApplicationId}`);
  await expect(
    page.getByRole("link", { name: "Consulter le parcours de l’adoptant" }),
  ).toHaveCount(0);

  await page.goto(`/candidatures/${nicolasApplicationId}`);
  await page
    .getByRole("button", {
      name: /Marquer la pré-réservation de 250,00 € comme payée/,
    })
    .click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await expect(page.getByLabel("Montant")).toHaveCount(0);
  await page.getByRole("button", { name: "Confirmer le règlement" }).click();
  await expect(page).toHaveURL(new RegExp(`/reservations/${nicolasReservationId}`));
  await expect(
    page.getByRole("heading", { name: "Parcours adoptant de Nicolas Bernard" }),
  ).toBeVisible();

  const overviewAfterPayment = expectSupabaseData(
    await supabase
      .from("application_overview")
      .select("has_started_adopter_journey")
      .eq("id", nicolasApplicationId)
      .maybeSingle(),
    "read Nicolas application overview after payment",
  );
  expect(overviewAfterPayment?.has_started_adopter_journey).toBe(true);

  const activeRoles = expectSupabaseData(
    await supabase
      .from("contact_roles")
      .select("role")
      .eq("contact_id", "70000000-0000-4000-8000-000000000004")
      .eq("is_active", true)
      .is("deleted_at", null),
    "read Nicolas active roles after payment",
  ).map((role) => role.role);
  expect(activeRoles).toEqual(["pre_reservation_holder"]);

  await page.goto("/candidatures?filtre=validees");
  await expect(
    page.getByRole("link", { name: "Nicolas Bernard", exact: true }),
  ).toHaveCount(0);

  await page.goto("/candidatures?filtre=toutes");
  await expect(
    page.getByRole("link", { name: "Nicolas Bernard", exact: true }),
  ).toBeVisible();

  await page.goto("/reservations");
  await expect(
    page.getByRole("link", { name: "Nicolas Bernard", exact: true }),
  ).toBeVisible();

  await page.goto(`/payments/${nicolasPaymentId}`);
  await expect(
    page.getByRole("link", { name: "Consulter le parcours de l’adoptant" }),
  ).toHaveAttribute("href", `/reservations/${nicolasReservationId}`);
});
