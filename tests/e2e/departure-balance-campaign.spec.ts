import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

import {
  createAuthenticatedSupabaseClient,
  expectSupabaseData,
  runE2eSql,
  E2E_OWNER_EMAIL,
  E2E_OWNER_PASSWORD,
  type SupabaseTestClient,
} from "./helpers/supabase";

const organizationId = "20000000-0000-4000-8000-000000000001";

type Fixture = {
  suffix: string;
  groupId: string;
  litterId: string;
  groupOnlyLitterId: string;
  contactIds: string[];
  reservationIds: {
    due: string;
    sold: string;
    activeRequest: string;
    missingPrice: string;
    draft: string;
    groupDue: string;
  };
  paymentIds: string[];
};

async function login(page: Page) {
  await page.goto("/login");

  const email = page.getByLabel("Email");
  const loginAlert = page.locator("form").getByRole("alert");
  const outcome = await Promise.race([
    page.waitForURL(/\/candidatures(?:\?|$)/).then(() => "authenticated" as const),
    email.waitFor({ state: "visible" }).then(() => "form" as const),
  ]);

  if (outcome === "authenticated") {
    return;
  }

  await email.fill(E2E_OWNER_EMAIL);
  await page.getByLabel("Mot de passe").fill(E2E_OWNER_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();

  const result = await Promise.race([
    page.waitForURL(/\/candidatures(?:\?|$)/).then(() => "authenticated" as const),
    loginAlert.waitFor({ state: "visible" }).then(() => "error" as const),
  ]);

  if (result === "error") {
    const message = (await loginAlert.textContent())?.trim() || "alerte inconnue";
    throw new Error(`Owner E2E login failed: ${message}`);
  }
}

async function confirmDepartureBalanceCampaign(page: Page) {
  const button = page.getByRole("button", {
    name: "Campagne solde envoyée",
    exact: true,
  });

  if (!(await button.isVisible({ timeout: 1_000 }).catch(() => false))) {
    await page.getByText("Campagnes d’e-mails", { exact: true }).click();
  }

  await expect(button).toBeVisible();
  await expect(button).toBeEnabled();
  await Promise.all([
    page.waitForURL(/departure_balance_campaign_status=/),
    button.click(),
  ]);
}

async function cleanupFixture(fixture: Fixture | null) {
  if (!fixture) {
    return;
  }

  const reservationIds = Object.values(fixture.reservationIds);
  const reservationUuidArray = sqlUuidArray(reservationIds);
  const contactUuidArray = sqlUuidArray(fixture.contactIds);
  const litterUuidArray = sqlUuidArray([fixture.litterId, fixture.groupOnlyLitterId]);
  const paymentUuidArray = sqlUuidArray(fixture.paymentIds);
  const groupId = sqlUuid(fixture.groupId);
  const organization = sqlUuid(organizationId);

  const cleanupSql = `
begin;
create temporary table fixture_reservations (id uuid primary key) on commit drop;
insert into fixture_reservations select unnest(${reservationUuidArray});
create temporary table fixture_payments (id uuid primary key) on commit drop;
insert into fixture_payments
select id from public.payments
where organization_id = ${organization}
  and (reservation_id in (select id from fixture_reservations) or id = any(${paymentUuidArray}));
create temporary table fixture_documents (id uuid primary key) on commit drop;
insert into fixture_documents
select id from public.documents
where organization_id = ${organization}
  and (contact_id = any(${contactUuidArray})
    or reservation_id in (select id from fixture_reservations)
    or litter_id = any(${litterUuidArray})
    or payment_id in (select id from fixture_payments));

delete from public.events
where organization_id = ${organization}
  and (contact_id = any(${contactUuidArray})
    or reservation_id in (select id from fixture_reservations)
    or litter_id = any(${litterUuidArray})
    or payment_id in (select id from fixture_payments)
    or document_id in (select id from fixture_documents));
delete from public.notes
where organization_id = ${organization}
  and (contact_id = any(${contactUuidArray})
    or reservation_id in (select id from fixture_reservations)
    or litter_id = any(${litterUuidArray})
    or payment_id in (select id from fixture_payments)
    or document_id in (select id from fixture_documents));
delete from public.email_delivery_attempts
where organization_id = ${organization}
  and (contact_id = any(${contactUuidArray})
    or reservation_id in (select id from fixture_reservations)
    or litter_id = any(${litterUuidArray})
    or litter_group_id = ${groupId});
delete from public.media
where organization_id = ${organization}
  and (contact_id = any(${contactUuidArray})
    or reservation_id in (select id from fixture_reservations)
    or litter_id = any(${litterUuidArray}));
delete from public.credit_usages
where organization_id = ${organization}
  and (contact_id = any(${contactUuidArray})
    or target_reservation_id in (select id from fixture_reservations)
    or target_payment_id in (select id from fixture_payments));
delete from public.credits
where organization_id = ${organization}
  and (contact_id = any(${contactUuidArray})
    or origin_reservation_id in (select id from fixture_reservations)
    or origin_payment_id in (select id from fixture_payments));
update public.payments set document_id = null
where organization_id = ${organization} and id in (select id from fixture_payments);
delete from public.documents
where organization_id = ${organization} and id in (select id from fixture_documents);
delete from public.payments
where organization_id = ${organization} and id in (select id from fixture_payments);
delete from public.contact_roles
where organization_id = ${organization} and contact_id = any(${contactUuidArray});
delete from public.applications
where organization_id = ${organization} and contact_id = any(${contactUuidArray});
delete from public.reservations
where organization_id = ${organization} and id in (select id from fixture_reservations);
delete from public.contacts
where organization_id = ${organization} and id = any(${contactUuidArray});
delete from public.litters
where organization_id = ${organization} and id = any(${litterUuidArray});
delete from public.litter_groups
where organization_id = ${organization} and id = ${groupId};
commit;
`;

  await runE2eSql(cleanupSql);

  const remaining = JSON.parse(
    (await runE2eSql(`
select json_build_object(
  'payments', (select count(*) from public.payments where organization_id = ${organization} and (reservation_id = any(${reservationUuidArray}) or id = any(${paymentUuidArray}))),
  'reservations', (select count(*) from public.reservations where organization_id = ${organization} and id = any(${reservationUuidArray})),
  'contacts', (select count(*) from public.contacts where organization_id = ${organization} and id = any(${contactUuidArray})),
  'litters', (select count(*) from public.litters where organization_id = ${organization} and id = any(${litterUuidArray})),
  'group', (select count(*) from public.litter_groups where organization_id = ${organization} and id = ${groupId}),
  'traces', (select count(*) from public.notes where organization_id = ${organization} and (contact_id = any(${contactUuidArray}) or reservation_id = any(${reservationUuidArray}) or litter_id = any(${litterUuidArray}) or payment_id = any(${paymentUuidArray}))
              ) + (select count(*) from public.events where organization_id = ${organization} and (contact_id = any(${contactUuidArray}) or reservation_id = any(${reservationUuidArray}) or litter_id = any(${litterUuidArray}) or payment_id = any(${paymentUuidArray}))),
  'prefixes', (select count(*) from public.contacts where organization_id = ${organization} and display_name like 'E2E %solde%')
    + (select count(*) from public.litters where organization_id = ${organization} and name like 'E2E portée%solde%')
    + (select count(*) from public.litter_groups where organization_id = ${organization} and name like 'E2E solde départ%')
    + (select count(*) from public.payments where organization_id = ${organization} and notes like 'Demande de solde avant départ%')
)::text;
`)).trim(),
  ) as Record<string, number>;

  for (const [name, count] of Object.entries(remaining)) {
    expect(count, `${name} departure-balance fixtures must be hard-deleted`).toBe(0);
  }
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function sqlUuid(value: string) {
  if (!uuidPattern.test(value)) {
    throw new Error(`Invalid fixture UUID: ${value}`);
  }
  return `'${value}'::uuid`;
}

function sqlUuidArray(values: string[]) {
  return values.length === 0
    ? "array[]::uuid[]"
    : `array[${values.map(sqlUuid).join(", ")}]`;
}

function allocateFixture(): Fixture {
  const groupId = randomUUID();

  return {
    suffix: groupId.slice(0, 8),
    groupId,
    litterId: randomUUID(),
    groupOnlyLitterId: randomUUID(),
    contactIds: Array.from({ length: 6 }, () => randomUUID()),
    reservationIds: {
      due: randomUUID(),
      sold: randomUUID(),
      activeRequest: randomUUID(),
      missingPrice: randomUUID(),
      draft: randomUUID(),
      groupDue: randomUUID(),
    },
    paymentIds: [],
  };
}

async function createFixture(
  supabase: SupabaseTestClient,
  fixture: Fixture,
): Promise<void> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("Unable to read authenticated test user");
  }

  const {
    groupId,
    litterId,
    groupOnlyLitterId,
    suffix,
    contactIds,
    reservationIds,
  } = fixture;

  const { error: groupError } = await supabase.from("litter_groups").insert({
    id: groupId,
    organization_id: organizationId,
    name: `E2E solde départ ${suffix}`,
    species: "dog",
    status: "born",
    created_by: user.id,
    updated_by: user.id,
  });

  if (groupError) {
    throw new Error(`create group: ${groupError.message}`);
  }

  const { error: litterError } = await supabase.from("litters").insert([
    {
      id: litterId,
      organization_id: organizationId,
      litter_group_id: groupId,
      name: `E2E portée solde ${suffix}`,
      species: "dog",
      breed: "Golden Retriever",
      status: "ready_to_leave",
      created_by: user.id,
      updated_by: user.id,
    },
    {
      id: groupOnlyLitterId,
      organization_id: organizationId,
      litter_group_id: groupId,
      name: `E2E portée groupe solde ${suffix}`,
      species: "dog",
      breed: "Golden Retriever",
      status: "ready_to_leave",
      created_by: user.id,
      updated_by: user.id,
    },
  ]);

  if (litterError) {
    throw new Error(`create litters: ${litterError.message}`);
  }

  const contactLabels = [
    "solde restant",
    "deja solde",
    "demande active",
    "prix manquant",
    "non eligible",
    "groupe solde",
  ];
  const { error: contactsError } = await supabase.from("contacts").insert(
    contactIds.map((contactId, index) => ({
      id: contactId,
      organization_id: organizationId,
      contact_type: "person",
      first_name: "E2E",
      last_name: `Solde ${suffix} ${index + 1}`,
      display_name: `E2E ${contactLabels[index]} ${suffix}`,
      email: `departure-balance-e2e-${suffix}-${index + 1}@example.invalid`,
      origin_channel: "manual",
      primary_status: "active",
      created_by: user.id,
      updated_by: user.id,
    })),
  );

  if (contactsError) {
    throw new Error(`create contacts: ${contactsError.message}`);
  }

  const { error: reservationsError } = await supabase
    .from("reservations")
    .insert([
      {
        id: reservationIds.due,
        organization_id: organizationId,
        contact_id: contactIds[0],
        litter_group_id: groupId,
        litter_id: litterId,
        species: "dog",
        breed: "Golden Retriever",
        reserved_sex_preference: "no_preference",
        status: "active",
        price_cents: 100000,
        currency: "EUR",
        created_by: user.id,
        updated_by: user.id,
      },
      {
        id: reservationIds.sold,
        organization_id: organizationId,
        contact_id: contactIds[1],
        litter_group_id: groupId,
        litter_id: litterId,
        species: "dog",
        breed: "Golden Retriever",
        reserved_sex_preference: "no_preference",
        status: "active",
        price_cents: 100000,
        currency: "EUR",
        created_by: user.id,
        updated_by: user.id,
      },
      {
        id: reservationIds.activeRequest,
        organization_id: organizationId,
        contact_id: contactIds[2],
        litter_group_id: groupId,
        litter_id: litterId,
        species: "dog",
        breed: "Golden Retriever",
        reserved_sex_preference: "no_preference",
        status: "active",
        price_cents: 100000,
        currency: "EUR",
        created_by: user.id,
        updated_by: user.id,
      },
      {
        id: reservationIds.missingPrice,
        organization_id: organizationId,
        contact_id: contactIds[3],
        litter_group_id: groupId,
        litter_id: litterId,
        species: "dog",
        breed: "Golden Retriever",
        reserved_sex_preference: "no_preference",
        status: "active",
        price_cents: null,
        currency: "EUR",
        created_by: user.id,
        updated_by: user.id,
      },
      {
        id: reservationIds.draft,
        organization_id: organizationId,
        contact_id: contactIds[4],
        litter_group_id: groupId,
        litter_id: litterId,
        species: "dog",
        breed: "Golden Retriever",
        reserved_sex_preference: "no_preference",
        status: "draft",
        price_cents: 100000,
        currency: "EUR",
        created_by: user.id,
        updated_by: user.id,
      },
      {
        id: reservationIds.groupDue,
        organization_id: organizationId,
        contact_id: contactIds[5],
        litter_group_id: groupId,
        litter_id: groupOnlyLitterId,
        species: "dog",
        breed: "Golden Retriever",
        reserved_sex_preference: "no_preference",
        status: "active",
        price_cents: 120000,
        currency: "EUR",
        created_by: user.id,
        updated_by: user.id,
      },
    ]);

  if (reservationsError) {
    throw new Error(`create reservations: ${reservationsError.message}`);
  }

  const { error: paymentsError } = await supabase.from("payments").insert([
    {
      organization_id: organizationId,
      contact_id: contactIds[0],
      reservation_id: reservationIds.due,
      amount_cents: 20000,
      currency: "EUR",
      payment_type: "arrhes",
      status: "paid",
      payment_method: "bank_transfer",
      requested_at: "2026-07-01T10:00:00+00:00",
      paid_at: "2026-07-02T10:00:00+00:00",
      created_by: user.id,
      updated_by: user.id,
    },
    {
      organization_id: organizationId,
      contact_id: contactIds[1],
      reservation_id: reservationIds.sold,
      amount_cents: 100000,
      currency: "EUR",
      payment_type: "balance",
      status: "paid",
      payment_method: "bank_transfer",
      requested_at: "2026-07-01T10:00:00+00:00",
      paid_at: "2026-07-02T10:00:00+00:00",
      created_by: user.id,
      updated_by: user.id,
    },
    {
      organization_id: organizationId,
      contact_id: contactIds[2],
      reservation_id: reservationIds.activeRequest,
      amount_cents: 20000,
      currency: "EUR",
      payment_type: "arrhes",
      status: "paid",
      payment_method: "bank_transfer",
      requested_at: "2026-07-01T10:00:00+00:00",
      paid_at: "2026-07-02T10:00:00+00:00",
      created_by: user.id,
      updated_by: user.id,
    },
    {
      organization_id: organizationId,
      contact_id: contactIds[2],
      reservation_id: reservationIds.activeRequest,
      amount_cents: 80000,
      currency: "EUR",
      payment_type: "balance",
      status: "requested",
      payment_method: "bank_transfer",
      requested_at: "2026-07-03T10:00:00+00:00",
      created_by: user.id,
      updated_by: user.id,
    },
    {
      organization_id: organizationId,
      contact_id: contactIds[5],
      reservation_id: reservationIds.groupDue,
      amount_cents: 30000,
      currency: "EUR",
      payment_type: "arrhes",
      status: "paid",
      payment_method: "bank_transfer",
      requested_at: "2026-07-01T10:00:00+00:00",
      paid_at: "2026-07-02T10:00:00+00:00",
      created_by: user.id,
      updated_by: user.id,
    },
  ]);

  if (paymentsError) {
    throw new Error(`create payments: ${paymentsError.message}`);
  }

}

async function rememberPaymentIds(
  supabase: SupabaseTestClient,
  fixture: Fixture,
) {
  const { data, error } = await supabase
    .from("payments")
    .select("id")
    .eq("organization_id", organizationId)
    .in("reservation_id", Object.values(fixture.reservationIds));

  if (error) {
    throw new Error(`read departure balance payment ids: ${error.message}`);
  }

  fixture.paymentIds = [
    ...new Set([...fixture.paymentIds, ...(data ?? []).map(({ id }) => id)]),
  ];
}

async function readBalanceRequests(
  supabase: SupabaseTestClient,
  reservationId: string,
) {
  return expectSupabaseData(
    await supabase
      .from("payments")
      .select("id, amount_cents, status, payment_type")
      .eq("reservation_id", reservationId)
      .eq("payment_type", "balance")
      .in("status", ["requested", "pending", "partially_paid"])
      .is("deleted_at", null)
      .order("created_at", { ascending: true }),
    "read balance requests",
  );
}

test("departure balance campaigns create only missing balance requests", async ({
  page,
}) => {
  test.setTimeout(90_000);

  const supabase = await createAuthenticatedSupabaseClient();
  const fixture = allocateFixture();

  try {
    await createFixture(supabase, fixture);
    await login(page);

    await page.goto(`/litters/${fixture.litterId}`);
    await page.getByText("Campagnes d’e-mails").click();
    await confirmDepartureBalanceCampaign(page);
    await expect(page).toHaveURL(
      /departure_balance_campaign_status=success&departure_balance_campaign_count=5&departure_balance_campaign_payment_count=1/,
    );
    await expect(page.getByRole("status")).toContainText(
      "Campagne confirmée — 5 dossier(s), 1 demande(s) de solde créée(s).",
    );
    await expect(page.getByRole("status")).toContainText(
      "1 aucun solde restant dû",
    );
    await expect(page.getByRole("status")).toContainText(
      "1 demande de solde active déjà existante",
    );
    await expect(page.getByRole("status")).toContainText("1 prix manquant");
    await expect(page.getByRole("status")).toContainText(
      "1 dossier non éligible",
    );

    expect(
      await readBalanceRequests(supabase, fixture.reservationIds.due),
    ).toMatchObject([{ amount_cents: 80000, status: "requested" }]);
    await rememberPaymentIds(supabase, fixture);
    expect(
      await readBalanceRequests(supabase, fixture.reservationIds.sold),
    ).toHaveLength(0);
    expect(
      await readBalanceRequests(supabase, fixture.reservationIds.activeRequest),
    ).toHaveLength(1);
    expect(
      await readBalanceRequests(supabase, fixture.reservationIds.missingPrice),
    ).toHaveLength(0);
    expect(
      await readBalanceRequests(supabase, fixture.reservationIds.draft),
    ).toHaveLength(0);

    await confirmDepartureBalanceCampaign(page);
    await expect(page).toHaveURL(
      /departure_balance_campaign_status=success&departure_balance_campaign_count=5&departure_balance_campaign_payment_count=0/,
    );
    expect(
      await readBalanceRequests(supabase, fixture.reservationIds.due),
    ).toHaveLength(1);

    await page.goto(`/litter-groups/${fixture.groupId}`);
    await confirmDepartureBalanceCampaign(page);
    await expect(page).toHaveURL(
      /departure_balance_campaign_status=success&departure_balance_campaign_count=6&departure_balance_campaign_payment_count=1/,
    );
    await expect(page.getByRole("status")).toContainText(
      "Campagne confirmée — 6 dossier(s), 1 demande(s) de solde créée(s).",
    );
    await rememberPaymentIds(supabase, fixture);
    expect(
      await readBalanceRequests(supabase, fixture.reservationIds.groupDue),
    ).toMatchObject([{ amount_cents: 90000, status: "requested" }]);

    await confirmDepartureBalanceCampaign(page);
    await expect(page).toHaveURL(
      /departure_balance_campaign_status=success&departure_balance_campaign_count=6&departure_balance_campaign_payment_count=0/,
    );
    await rememberPaymentIds(supabase, fixture);
    expect(
      await readBalanceRequests(supabase, fixture.reservationIds.groupDue),
    ).toHaveLength(1);

    await page.goto("/payments?filter=expected");
    await expect(
      page.getByRole("link", { name: `E2E solde restant ${fixture.suffix}` }),
    ).toBeVisible();
  } finally {
    await cleanupFixture(fixture);
  }
});
