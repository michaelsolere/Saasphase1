import { expect, test, type Page } from "@playwright/test";

import {
  runE2eSqlSync,
  createAuthenticatedSupabaseClient,
  expectSupabaseData,
  type SupabaseTestClient,
} from "./helpers/supabase";

const organizationId = "20000000-0000-4000-8000-000000000001";
const fixedFixture = {
  groupId: "93000000-0000-4000-8000-000000000001",
  litterId: "93000000-0000-4000-8000-000000000002",
  standaloneLitterId: "93000000-0000-4000-8000-000000000010",
  contactIds: [
    "93000000-0000-4000-8000-000000000003",
    "93000000-0000-4000-8000-000000000004",
    "93000000-0000-4000-8000-000000000005",
    "93000000-0000-4000-8000-000000000011",
  ],
  applicationIds: {
    litter: "93000000-0000-4000-8000-000000000006",
    draftConflict: "93000000-0000-4000-8000-000000000007",
    group: "93000000-0000-4000-8000-000000000008",
    litterOnly: "93000000-0000-4000-8000-000000000012",
  },
  draftConflictReservationId: "93000000-0000-4000-8000-000000000009",
};

type Fixture = {
  groupId: string;
  litterId: string;
  standaloneLitterId: string;
  contactIds: string[];
  applicationIds: {
    litter: string;
    draftConflict: string;
    group: string;
    litterOnly: string;
  };
  draftConflictReservationId: string;
};

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("e2e-owner@saasphase1.invalid");
  await page.getByLabel("Mot de passe").fill("LocalE2EOwner-2026!");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/connexion=success/);
}

function sqlQuote(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function runSql(sql: string) {
  return runE2eSqlSync(sql);
}

function formatEuros(cents: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

function expectedPreReservationDeadline() {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 15);
  const isoDate = date.toISOString().slice(0, 10);

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "long",
    timeZone: "Europe/Paris",
  }).format(new Date(isoDate));
}

async function cleanupFixture(
  supabase: SupabaseTestClient,
  fixture: Fixture | null,
) {
  if (!fixture) {
    return;
  }

  void supabase;

  const applicationIds = Object.values(fixture.applicationIds)
    .map((id) => `${sqlQuote(id)}::uuid`)
    .join(",");
  const contactIds = fixture.contactIds.map((id) => `${sqlQuote(id)}::uuid`).join(",");

  runSql(`
    with target_reservations as (
      select id
      from public.reservations
      where application_id in (${applicationIds})
    )
    delete from public.email_delivery_attempts
    where reservation_id in (select id from target_reservations);

    with target_reservations as (
      select id
      from public.reservations
      where application_id in (${applicationIds})
    )
    delete from public.payments
    where reservation_id in (select id from target_reservations);

    delete from public.reservations
    where application_id in (${applicationIds});

    delete from public.applications
    where id in (${applicationIds});

    delete from public.contacts
    where id in (${contactIds});

    delete from public.litters
    where id in (
      ${sqlQuote(fixture.litterId)}::uuid,
      ${sqlQuote(fixture.standaloneLitterId)}::uuid
    );

    delete from public.litter_groups
    where id = ${sqlQuote(fixture.groupId)}::uuid;
  `);

  const remaining = Number(
    runSql(`
      select count(*)
      from (
        select id::text from public.email_delivery_attempts
        where reservation_id in (
          select id from public.reservations where application_id in (${applicationIds})
        )
        union all
        select id::text from public.payments
        where reservation_id in (
          select id from public.reservations where application_id in (${applicationIds})
        )
        union all
        select id::text from public.reservations
        where application_id in (${applicationIds})
        union all
        select id::text from public.applications
        where id in (${applicationIds})
        union all
        select id::text from public.contacts
        where id in (${contactIds})
        union all
        select id::text from public.litters
        where id in (
          ${sqlQuote(fixture.litterId)}::uuid,
          ${sqlQuote(fixture.standaloneLitterId)}::uuid
        )
        union all
        select id::text from public.litter_groups
        where id = ${sqlQuote(fixture.groupId)}::uuid
      ) remaining;
    `),
  );

  if (remaining !== 0) {
    throw new Error(`cleanup pre-reservation campaign: ${remaining} row(s) remain`);
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

  await cleanupFixture(supabase, fixedFixture);

  const groupId = fixedFixture.groupId;
  const litterId = fixedFixture.litterId;
  const standaloneLitterId = fixedFixture.standaloneLitterId;
  const suffix = groupId.slice(0, 8);
  const contactIds = fixedFixture.contactIds;
  const applicationIds = fixedFixture.applicationIds;
  const draftConflictReservationId = fixedFixture.draftConflictReservationId;

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

  const { error: standaloneLitterError } = await supabase.from("litters").insert({
    id: standaloneLitterId,
    organization_id: organizationId,
    litter_group_id: null,
    name: `E2E portée seule pré-réservation ${suffix}`,
    species: "dog",
    breed: "Golden Retriever",
    status: "pregnancy_confirmed",
    created_by: user.id,
    updated_by: user.id,
  });
  if (standaloneLitterError) {
    throw new Error(`create standalone litter: ${standaloneLitterError.message}`);
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
      email: null,
      origin_channel: "manual",
      primary_status: "active",
      created_by: user.id,
      updated_by: user.id,
    },
    {
      id: contactIds[3],
      organization_id: organizationId,
      contact_type: "person",
      first_name: "E2E",
      last_name: `PreRes Solo ${suffix}`,
      display_name: `E2E pré-réservation portée seule ${suffix}`,
      email: `pre-res-button-solo-${suffix}@example.invalid`,
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
      {
        id: applicationIds.litterOnly,
        organization_id: organizationId,
        contact_id: contactIds[3],
        species: "dog",
        breed: "Golden Retriever",
        desired_litter_id: standaloneLitterId,
        desired_litter_group_id: null,
        desired_period: "Test bouton campagne portée seule",
        desired_sex_preference: "no_preference",
        desired_quantity: 1,
        project_description: "Fixture e2e bouton pré-réservation portée seule.",
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
    standaloneLitterId,
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

async function countEmailDeliveryAttemptsForApplication(
  supabase: SupabaseTestClient,
  applicationId: string,
) {
  const reservations = expectSupabaseData(
    await supabase
      .from("reservations")
      .select("id")
      .eq("application_id", applicationId),
    "read campaign reservations for attempts",
  );
  const reservationIds = reservations.map((reservation) => reservation.id);

  if (reservationIds.length === 0) {
    return 0;
  }

  const result = await supabase
    .from("email_delivery_attempts")
    .select("id", { count: "exact", head: true })
    .in("reservation_id", reservationIds);

  if (result.error) {
    throw new Error(`count email attempts: ${result.error.message}`);
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

async function expectBrevoCampaignDialogData({
  page,
  expected,
}: {
  page: Page;
  expected: {
    prenom: string;
    nom: string;
    nomComplet: string;
    portee: string;
    groupePortees: string;
    montant: string;
    echeance: string;
    nomElevage: string;
  };
}) {
  const dialog = page.getByRole("dialog", {
    name: "Confirmer l’envoi Brevo de pré-réservation",
  });

  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(
    "Les Golden du Pays Pourpre <contact@lepayspourpre.fr>",
  );
  await expect(dialog).toContainText("Adresse de réponse : contact@lepayspourpre.fr");

  for (const variableName of [
    "prenom",
    "nom",
    "nom_complet",
    "portee",
    "groupe_portees",
    "montant_pre_reservation",
    "echeance_pre_reservation",
    "nom_elevage",
  ]) {
    await expect(dialog).toContainText(variableName);
  }

  await expect(dialog).toContainText(expected.prenom);
  await expect(dialog).toContainText(expected.nom);
  await expect(dialog).toContainText(expected.nomComplet);
  await expect(dialog).toContainText(expected.portee);
  if (expected.groupePortees) {
    await expect(dialog).toContainText(expected.groupePortees);
  } else {
    await expect(dialog).toContainText("Chaîne vide");
  }
  await expect(dialog).toContainText(expected.montant);
  await expect(dialog).toContainText(expected.echeance);
  await expect(dialog).toContainText(expected.nomElevage);

  const html = await page.content();
  expect(html).not.toContain("xkeysib");
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
    const suffix = fixture.groupId.slice(0, 8);
    const expectedAmount = formatEuros(25000);
    const expectedDeadline = expectedPreReservationDeadline();

    await page.goto(`/litters/${fixture.standaloneLitterId}`);
    await page.getByText("Campagnes d’e-mails").click();
    await page
      .getByRole("button", { name: "Préparer et envoyer via Brevo" })
      .click();
    await expectBrevoCampaignDialogData({
      page,
      expected: {
        prenom: "E2E",
        nom: `PreRes Solo ${suffix}`,
        nomComplet: `E2E PreRes Solo ${suffix}`,
        portee: `E2E portée seule pré-réservation ${suffix}`,
        groupePortees: "",
        montant: expectedAmount,
        echeance: expectedDeadline,
        nomElevage: "du Val de Démo",
      },
    });
    await page.getByRole("button", { name: "Annuler" }).click();

    await page.goto(`/litters/${fixture.litterId}`);
    await page.getByText("Campagnes d’e-mails").click();
    await expect(
      page.getByRole("button", { name: "Préparer et envoyer via Brevo" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Campagne contrat + certificat envoyée" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Campagne solde envoyée" }),
    ).toBeVisible();

    await page.evaluate((targetLitterId) => {
      const form = Array.from(document.forms).find(
        (candidate) =>
          new FormData(candidate).get("litter_id") === targetLitterId &&
          new FormData(candidate).has("application_ids[]"),
      );

      if (!form) {
        throw new Error("Pre-reservation campaign form not found");
      }

      HTMLFormElement.prototype.submit.call(form);
    }, fixture.litterId);
    await expect(page).toHaveURL(/campaign_status=confirmation_required/);
    await expect(page.getByRole("alert")).toContainText(
      "Confirmation explicite requise",
    );
    expect(await countActiveReservations(supabase, fixture.applicationIds.litter)).toBe(0);
    expect(
      await countActivePreReservationPayments(
        supabase,
        fixture.applicationIds.litter,
      ),
    ).toBe(0);
    expect(
      await countEmailDeliveryAttemptsForApplication(
        supabase,
        fixture.applicationIds.litter,
      ),
    ).toBe(0);

    await page.goto(`/litters/${fixture.litterId}`);
    await page.getByText("Campagnes d’e-mails").click();
    await page
      .getByRole("button", { name: "Préparer et envoyer via Brevo" })
      .click();
    await expect(
      page.getByRole("dialog", {
        name: "Confirmer l’envoi Brevo de pré-réservation",
      }),
    ).toBeVisible();
    await expectBrevoCampaignDialogData({
      page,
      expected: {
        prenom: "E2E",
        nom: `PreRes Litter ${suffix}`,
        nomComplet: `E2E PreRes Litter ${suffix}`,
        portee: `E2E portée pré-réservation ${suffix}`,
        groupePortees: `E2E bouton pré-réservation ${suffix}`,
        montant: expectedAmount,
        echeance: expectedDeadline,
        nomElevage: "du Val de Démo",
      },
    });
    expect(await countActiveReservations(supabase, fixture.applicationIds.litter)).toBe(0);
    await page.getByRole("button", { name: "Confirmer et envoyer" }).click();
    await expect(page).toHaveURL(/campaign_status=error/);
    expect(await countActiveReservations(supabase, fixture.applicationIds.litter)).toBe(0);
    expect(
      await countActivePreReservationPayments(
        supabase,
        fixture.applicationIds.litter,
      ),
    ).toBe(0);
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

    await page.goto(`/litters/${fixture.litterId}`);
    await page.getByText("Campagnes d’e-mails").click();
    await page
      .getByRole("button", { name: "Préparer et envoyer via Brevo" })
      .click();
    await page.getByRole("button", { name: "Confirmer et envoyer" }).click();
    await expect(page).toHaveURL(/campaign_status=error/);
    expect(await countActiveReservations(supabase, fixture.applicationIds.litter)).toBe(0);
    expect(
      await countActivePreReservationPayments(
        supabase,
        fixture.applicationIds.litter,
      ),
    ).toBe(0);

    await page.goto(`/litter-groups/${fixture.groupId}`);
    await expect(
      page.getByRole("button", { name: "Préparer et envoyer via Brevo" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Campagne contrat + certificat envoyée" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Campagne solde envoyée" }),
    ).toBeVisible();

    await page.evaluate((targetGroupId) => {
      const form = Array.from(document.forms).find(
        (candidate) =>
          new FormData(candidate).get("litter_group_id") === targetGroupId &&
          new FormData(candidate).has("application_ids[]"),
      );

      if (!form) {
        throw new Error("Group pre-reservation campaign form not found");
      }

      HTMLFormElement.prototype.submit.call(form);
    }, fixture.groupId);
    await expect(page).toHaveURL(/group_campaign_status=confirmation_required/);
    await expect(page.getByRole("alert")).toContainText(
      "Confirmation explicite requise",
    );
    expect(await countActiveReservations(supabase, fixture.applicationIds.group)).toBe(0);
    expect(
      await countActivePreReservationPayments(
        supabase,
        fixture.applicationIds.group,
      ),
    ).toBe(0);
    expect(
      await countEmailDeliveryAttemptsForApplication(
        supabase,
        fixture.applicationIds.group,
      ),
    ).toBe(0);

    await page.goto(`/litter-groups/${fixture.groupId}`);
    await page
      .getByRole("button", { name: "Préparer et envoyer via Brevo" })
      .click();
    await expectBrevoCampaignDialogData({
      page,
      expected: {
        prenom: "E2E",
        nom: `PreRes Group ${suffix}`,
        nomComplet: `E2E PreRes Group ${suffix}`,
        portee: "",
        groupePortees: `E2E bouton pré-réservation ${suffix}`,
        montant: expectedAmount,
        echeance: expectedDeadline,
        nomElevage: "du Val de Démo",
      },
    });
    await page.getByRole("button", { name: "Confirmer et envoyer" }).click();
    await expect(page).toHaveURL(/group_campaign_status=error/);
    expect(
      await countActivePreReservationPayments(
        supabase,
        fixture.applicationIds.group,
      ),
    ).toBe(0);

    await page.goto(`/litter-groups/${fixture.groupId}`);
    await page
      .getByRole("button", { name: "Préparer et envoyer via Brevo" })
      .click();
    await page.getByRole("button", { name: "Confirmer et envoyer" }).click();
    await expect(page).toHaveURL(/group_campaign_status=error/);
    expect(
      await countActivePreReservationPayments(
        supabase,
        fixture.applicationIds.group,
      ),
    ).toBe(0);
  } finally {
    await cleanupFixture(supabase, fixture);
  }
});
