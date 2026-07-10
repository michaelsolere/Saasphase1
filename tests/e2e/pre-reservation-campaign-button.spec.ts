import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

import {
  createAuthenticatedSupabaseClient,
  expectSupabaseData,
  type SupabaseTestClient,
} from "./helpers/supabase";

const organizationId = "20000000-0000-4000-8000-000000000001";

type Fixture = {
  groupId: string;
  litterId: string;
  contactIds: string[];
  applicationIds: {
    litter: string;
    draftConflict: string;
    group: string;
  };
  draftConflictReservationId: string;
};

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("owner@saasphase1.invalid");
  await page.getByLabel("Mot de passe").fill("LocalDevOwner-2026!");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/connexion=success/);
}

async function cleanupFixture(
  supabase: SupabaseTestClient,
  fixture: Fixture | null,
) {
  if (!fixture) {
    return;
  }

  const reservationIds = expectSupabaseData(
    await supabase
      .from("reservations")
      .select("id")
      .in("application_id", Object.values(fixture.applicationIds)),
    "read pre-reservation campaign reservations for cleanup",
  ).map((reservation) => reservation.id);
  const now = new Date().toISOString();

  if (reservationIds.length > 0) {
    const { error: paymentsError } = await supabase
      .from("payments")
      .update({ deleted_at: now })
      .in("reservation_id", reservationIds)
      .is("deleted_at", null);
    if (paymentsError) {
      throw new Error(`cleanup payments: ${paymentsError.message}`);
    }

    const { error: reservationsError } = await supabase
      .from("reservations")
      .update({ deleted_at: now })
      .in("id", reservationIds)
      .is("deleted_at", null);
    if (reservationsError) {
      throw new Error(`cleanup reservations: ${reservationsError.message}`);
    }
  }

  const { error: applicationsError } = await supabase
    .from("applications")
    .update({ deleted_at: now })
    .in("id", Object.values(fixture.applicationIds))
    .is("deleted_at", null);
  if (applicationsError) {
    throw new Error(`cleanup applications: ${applicationsError.message}`);
  }

  const { error: contactsError } = await supabase
    .from("contacts")
    .update({ deleted_at: now })
    .in("id", fixture.contactIds)
    .is("deleted_at", null);
  if (contactsError) {
    throw new Error(`cleanup contacts: ${contactsError.message}`);
  }

  const { error: litterError } = await supabase
    .from("litters")
    .update({ deleted_at: now })
    .eq("id", fixture.litterId)
    .is("deleted_at", null);
  if (litterError) {
    throw new Error(`cleanup litter: ${litterError.message}`);
  }

  const { error: groupError } = await supabase
    .from("litter_groups")
    .update({ deleted_at: now })
    .eq("id", fixture.groupId)
    .is("deleted_at", null);
  if (groupError) {
    throw new Error(`cleanup group: ${groupError.message}`);
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
  const suffix = groupId.slice(0, 8);
  const contactIds = [randomUUID(), randomUUID(), randomUUID()];
  const applicationIds = {
    litter: randomUUID(),
    draftConflict: randomUUID(),
    group: randomUUID(),
  };
  const draftConflictReservationId = randomUUID();

  const { error: groupError } = await supabase.from("litter_groups").insert({
    id: groupId,
    organization_id: organizationId,
    name: `E2E bouton pré-réservation ${suffix}`,
    species: "dog",
    status: "open_for_applications",
    created_by: user.id,
    updated_by: user.id,
  });
  if (groupError) {
    throw new Error(`create group: ${groupError.message}`);
  }

  const { error: litterError } = await supabase.from("litters").insert({
    id: litterId,
    organization_id: organizationId,
    litter_group_id: groupId,
    name: `E2E portée pré-réservation ${suffix}`,
    species: "dog",
    breed: "Golden Retriever",
    status: "pregnancy_confirmed",
    created_by: user.id,
    updated_by: user.id,
  });
  if (litterError) {
    throw new Error(`create litter: ${litterError.message}`);
  }

  const { error: contactsError } = await supabase.from("contacts").insert([
    {
      id: contactIds[0],
      organization_id: organizationId,
      contact_type: "person",
      first_name: "E2E",
      last_name: `PreRes Litter ${suffix}`,
      display_name: `E2E pré-réservation portée ${suffix}`,
      email: `pre-res-button-litter-${suffix}@example.invalid`,
      origin_channel: "manual",
      primary_status: "active",
      created_by: user.id,
      updated_by: user.id,
    },
    {
      id: contactIds[1],
      organization_id: organizationId,
      contact_type: "person",
      first_name: "E2E",
      last_name: `PreRes Draft ${suffix}`,
      display_name: `E2E brouillon pré-réservation ${suffix}`,
      email: `pre-res-button-draft-${suffix}@example.invalid`,
      origin_channel: "manual",
      primary_status: "active",
      created_by: user.id,
      updated_by: user.id,
    },
    {
      id: contactIds[2],
      organization_id: organizationId,
      contact_type: "person",
      first_name: "E2E",
      last_name: `PreRes Group ${suffix}`,
      display_name: `E2E pré-réservation groupe ${suffix}`,
      email: `pre-res-button-group-${suffix}@example.invalid`,
      origin_channel: "manual",
      primary_status: "active",
      created_by: user.id,
      updated_by: user.id,
    },
  ]);
  if (contactsError) {
    throw new Error(`create contacts: ${contactsError.message}`);
  }

  const { error: applicationsError } = await supabase
    .from("applications")
    .insert([
      {
        id: applicationIds.litter,
        organization_id: organizationId,
        contact_id: contactIds[0],
        species: "dog",
        breed: "Golden Retriever",
        desired_litter_id: litterId,
        desired_litter_group_id: groupId,
        desired_period: "Test bouton campagne portée",
        desired_sex_preference: "no_preference",
        desired_quantity: 1,
        project_description: "Fixture e2e bouton pré-réservation portée.",
        status: "qualified",
        reviewed_at: "2026-07-09T10:00:00+00:00",
        reviewed_by: user.id,
        created_by: user.id,
        updated_by: user.id,
      },
      {
        id: applicationIds.draftConflict,
        organization_id: organizationId,
        contact_id: contactIds[1],
        species: "dog",
        breed: "Golden Retriever",
        desired_litter_id: litterId,
        desired_litter_group_id: groupId,
        desired_period: "Test conflit brouillon campagne portée",
        desired_sex_preference: "no_preference",
        desired_quantity: 1,
        project_description: "Fixture e2e conflit brouillon pré-réservation.",
        status: "qualified",
        reviewed_at: "2026-07-09T10:00:00+00:00",
        reviewed_by: user.id,
        created_by: user.id,
        updated_by: user.id,
      },
      {
        id: applicationIds.group,
        organization_id: organizationId,
        contact_id: contactIds[2],
        species: "dog",
        breed: "Golden Retriever",
        desired_litter_group_id: groupId,
        desired_period: "Test bouton campagne groupe",
        desired_sex_preference: "no_preference",
        desired_quantity: 1,
        project_description: "Fixture e2e bouton pré-réservation groupe.",
        status: "qualified",
        reviewed_at: "2026-07-09T10:00:00+00:00",
        reviewed_by: user.id,
        created_by: user.id,
        updated_by: user.id,
      },
    ]);
  if (applicationsError) {
    throw new Error(`create applications: ${applicationsError.message}`);
  }

  const { error: draftReservationError } = await supabase
    .from("reservations")
    .insert({
      id: draftConflictReservationId,
      organization_id: organizationId,
      contact_id: contactIds[1],
      application_id: applicationIds.draftConflict,
      litter_group_id: groupId,
      litter_id: litterId,
      species: "dog",
      breed: "Golden Retriever",
      reserved_sex_preference: "no_preference",
      status: "draft",
      created_by: user.id,
      updated_by: user.id,
    });
  if (draftReservationError) {
    throw new Error(`create draft conflict reservation: ${draftReservationError.message}`);
  }

  return {
    groupId,
    litterId,
    contactIds,
    applicationIds,
    draftConflictReservationId,
  };
}

async function countActivePreReservationPayments(
  supabase: SupabaseTestClient,
  applicationId: string,
) {
  const reservations = expectSupabaseData(
    await supabase
      .from("reservations")
      .select("id")
      .eq("application_id", applicationId)
      .is("deleted_at", null),
    "read campaign reservations",
  );
  const reservationIds = reservations.map((reservation) => reservation.id);

  if (reservationIds.length === 0) {
    return 0;
  }

  const result = await supabase
    .from("payments")
    .select("id", { count: "exact", head: true })
    .in("reservation_id", reservationIds)
    .in("payment_type", ["arrhes", "pre_reservation_deposit_refundable"])
    .in("status", ["requested", "pending", "partially_paid", "paid"])
    .is("deleted_at", null);

  if (result.error) {
    throw new Error(`count pre-reservation payments: ${result.error.message}`);
  }

  return result.count ?? 0;
}

async function countActiveReservations(
  supabase: SupabaseTestClient,
  applicationId: string,
) {
  const result = await supabase
    .from("reservations")
    .select("id", { count: "exact", head: true })
    .eq("application_id", applicationId)
    .is("deleted_at", null);

  if (result.error) {
    throw new Error(`count reservations: ${result.error.message}`);
  }

  return result.count ?? 0;
}

async function readOnlyReservation(
  supabase: SupabaseTestClient,
  reservationId: string,
) {
  return expectSupabaseData(
    await supabase
      .from("reservations")
      .select("id, status")
      .eq("id", reservationId)
      .is("deleted_at", null)
      .maybeSingle(),
    "read reservation",
  );
}

test("pre-reservation campaign action stays visible and avoids duplicates", async ({
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
    await expect(
      page.getByRole("button", { name: "Campagne de pré-réservation envoyée" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Campagne contrat + certificat envoyée" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Campagne solde envoyée" }),
    ).toBeVisible();

    await page
      .getByRole("button", { name: "Campagne de pré-réservation envoyée" })
      .click();
    await expect(page).toHaveURL(/campaign_status=success/);
    await expect(page.getByRole("status")).toContainText(
      "Campagne confirmée — 1 dossier(s), 1 demande(s) de paiement créée(s). 1 dossier brouillon à vérifier.",
    );
    expect(await countActiveReservations(supabase, fixture.applicationIds.litter)).toBe(1);
    expect(
      await countActivePreReservationPayments(
        supabase,
        fixture.applicationIds.litter,
      ),
    ).toBe(1);
    expect(
      await countActivePreReservationPayments(
        supabase,
        fixture.applicationIds.draftConflict,
      ),
    ).toBe(0);
    await expect
      .poll(async () => {
        const reservation = await readOnlyReservation(
          supabase,
          fixture!.draftConflictReservationId,
        );
        return reservation?.status;
      })
      .toBe("draft");

    await page.getByText("Campagnes d’e-mails").click();
    await page
      .getByRole("button", { name: "Campagne de pré-réservation envoyée" })
      .click();
    await expect(page).toHaveURL(/campaign_status=success/);
    expect(await countActiveReservations(supabase, fixture.applicationIds.litter)).toBe(1);
    expect(
      await countActivePreReservationPayments(
        supabase,
        fixture.applicationIds.litter,
      ),
    ).toBe(1);

    await page.goto(`/litter-groups/${fixture.groupId}`);
    await expect(
      page.getByRole("button", { name: "Campagne de pré-réservation envoyée" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Campagne contrat + certificat envoyée" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Campagne solde envoyée" }),
    ).toBeVisible();

    await page
      .getByRole("button", { name: "Campagne de pré-réservation envoyée" })
      .click();
    await expect(page).toHaveURL(/group_campaign_status=success/);
    await expect(page.getByRole("status")).toContainText(
      "Campagne confirmée — 1 dossier(s), 1 demande(s) de paiement créée(s).",
    );
    expect(
      await countActivePreReservationPayments(
        supabase,
        fixture.applicationIds.group,
      ),
    ).toBe(1);

    await page
      .getByRole("button", { name: "Campagne de pré-réservation envoyée" })
      .click();
    await expect(page).toHaveURL(/group_campaign_status=success/);
    expect(
      await countActivePreReservationPayments(
        supabase,
        fixture.applicationIds.group,
      ),
    ).toBe(1);
  } finally {
    await cleanupFixture(supabase, fixture);
  }
});
