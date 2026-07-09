import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

import {
  createAuthenticatedSupabaseClient,
  expectSupabaseData,
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
};

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("owner@saasphase1.invalid");
  await page.getByLabel("Mot de passe").fill("LocalDevOwner-2026!");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/connexion=success/);
}

async function confirmDepartureBalanceCampaign(page: Page) {
  const button = page.getByRole("button", { name: "Campagne solde envoyée" });

  if (!(await button.isVisible({ timeout: 1_000 }).catch(() => false))) {
    await page.getByText("Campagnes d’e-mails").click();
  }

  await button.click({ force: true, timeout: 5_000 });
}

async function cleanupFixture(
  supabase: SupabaseTestClient,
  fixture: Fixture | null,
) {
  if (!fixture) {
    return;
  }

  const reservationIds = Object.values(fixture.reservationIds);
  const now = new Date().toISOString();

  const { error: paymentsError } = await supabase
    .from("payments")
    .update({ deleted_at: now })
    .in("reservation_id", reservationIds)
    .is("deleted_at", null);
  if (paymentsError) {
    throw new Error(`cleanup departure balance payments: ${paymentsError.message}`);
  }

  const { error: reservationsError } = await supabase
    .from("reservations")
    .update({ deleted_at: now })
    .in("id", reservationIds)
    .is("deleted_at", null);
  if (reservationsError) {
    throw new Error(
      `cleanup departure balance reservations: ${reservationsError.message}`,
    );
  }

  const { error: contactsError } = await supabase
    .from("contacts")
    .update({ deleted_at: now })
    .in("id", fixture.contactIds)
    .is("deleted_at", null);
  if (contactsError) {
    throw new Error(`cleanup departure balance contacts: ${contactsError.message}`);
  }

  const { error: littersError } = await supabase
    .from("litters")
    .update({ deleted_at: now })
    .in("id", [fixture.litterId, fixture.groupOnlyLitterId])
    .is("deleted_at", null);
  if (littersError) {
    throw new Error(`cleanup departure balance litters: ${littersError.message}`);
  }

  const { error: groupError } = await supabase
    .from("litter_groups")
    .update({ deleted_at: now })
    .eq("id", fixture.groupId)
    .is("deleted_at", null);
  if (groupError) {
    throw new Error(`cleanup departure balance group: ${groupError.message}`);
  }
}

async function createFixture(
  supabase: SupabaseTestClient,
): Promise<Fixture> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("Unable to read authenticated test user");
  }

  const groupId = randomUUID();
  const litterId = randomUUID();
  const groupOnlyLitterId = randomUUID();
  const suffix = groupId.slice(0, 8);
  const contactIds = Array.from({ length: 6 }, () => randomUUID());
  const reservationIds = {
    due: randomUUID(),
    sold: randomUUID(),
    activeRequest: randomUUID(),
    missingPrice: randomUUID(),
    draft: randomUUID(),
    groupDue: randomUUID(),
  };

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

  return {
    suffix,
    groupId,
    litterId,
    groupOnlyLitterId,
    contactIds,
    reservationIds,
  };
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
  let fixture: Fixture | null = null;

  try {
    fixture = await createFixture(supabase);
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
    expect(
      await readBalanceRequests(supabase, fixture.reservationIds.groupDue),
    ).toMatchObject([{ amount_cents: 90000, status: "requested" }]);

    await confirmDepartureBalanceCampaign(page);
    await expect(page).toHaveURL(
      /departure_balance_campaign_status=success&departure_balance_campaign_count=6&departure_balance_campaign_payment_count=0/,
    );
    expect(
      await readBalanceRequests(supabase, fixture.reservationIds.groupDue),
    ).toHaveLength(1);

    await page.goto("/payments?filter=expected");
    await expect(
      page.getByRole("link", { name: `E2E solde restant ${fixture.suffix}` }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: `E2E groupe solde ${fixture.suffix}` }),
    ).toBeVisible();
  } finally {
    await cleanupFixture(supabase, fixture);
  }
});
