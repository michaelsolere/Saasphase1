import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

import {
  runE2eSql,
  createAuthenticatedSupabaseClient,
  expectSupabaseData,
} from "./helpers/supabase";

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type PriceSettings = {
  default_male_puppy_price_cents: number | null;
  default_female_puppy_price_cents: number | null;
  default_puppy_price_cents: number | null;
};

type FixtureCleanupInput = {
  label: string;
  contactIds: string[];
  reservationIds: string[];
  applicationIds?: string[];
  animalIds: string[];
  litterIds: string[];
  restorePriceSettings?: PriceSettings;
};

function sqlUuidArray(ids: string[]) {
  if (ids.length === 0) {
    return "array[]::uuid[]";
  }

  for (const id of ids) {
    if (!uuidPattern.test(id)) {
      throw new Error(`Invalid fixture UUID: ${id}`);
    }
  }

  return `array[${ids.map((id) => `'${id}'::uuid`).join(", ")}]`;
}

function sqlNullableInteger(value: number | null) {
  return value === null ? "null::integer" : `${value}::integer`;
}

async function runFixtureCleanupWithSql(fixture: FixtureCleanupInput) {
  const contactIds = sqlUuidArray(fixture.contactIds);
  const reservationIds = sqlUuidArray(fixture.reservationIds);
  const applicationIds = sqlUuidArray(fixture.applicationIds ?? []);
  const animalIds = sqlUuidArray(fixture.animalIds);
  const litterIds = sqlUuidArray(fixture.litterIds);
  const restorePriceSettingsSql = fixture.restorePriceSettings
    ? `
update public.organization_settings
set
  default_male_puppy_price_cents = ${sqlNullableInteger(
    fixture.restorePriceSettings.default_male_puppy_price_cents,
  )},
  default_female_puppy_price_cents = ${sqlNullableInteger(
    fixture.restorePriceSettings.default_female_puppy_price_cents,
  )},
  default_puppy_price_cents = ${sqlNullableInteger(
    fixture.restorePriceSettings.default_puppy_price_cents,
  )}
where organization_id = '${organizationId}'::uuid;
`
    : "";

  const sql = `
begin;

create temp table fixture_contacts(id uuid primary key) on commit drop;
create temp table fixture_reservations(id uuid primary key) on commit drop;
create temp table fixture_applications(id uuid primary key) on commit drop;
create temp table fixture_animals(id uuid primary key) on commit drop;
create temp table fixture_litters(id uuid primary key) on commit drop;
create temp table cleanup_counts(table_name text primary key, deleted_count integer not null) on commit drop;

insert into fixture_contacts select unnest(${contactIds}) on conflict do nothing;
insert into fixture_reservations select unnest(${reservationIds}) on conflict do nothing;
insert into fixture_applications select unnest(${applicationIds}) on conflict do nothing;
insert into fixture_animals select unnest(${animalIds}) on conflict do nothing;
insert into fixture_litters select unnest(${litterIds}) on conflict do nothing;

create temp table related_payments on commit drop as
select id
from public.payments
where contact_id in (select id from fixture_contacts)
   or reservation_id in (select id from fixture_reservations);

create temp table related_documents on commit drop as
select id
from public.documents
where contact_id in (select id from fixture_contacts)
   or application_id in (select id from fixture_applications)
   or reservation_id in (select id from fixture_reservations)
   or litter_id in (select id from fixture_litters)
   or animal_id in (select id from fixture_animals)
   or payment_id in (select id from related_payments)
   or id in (
     select document_id
     from public.payments
     where id in (select id from related_payments)
       and document_id is not null
   );

with deleted as (
  delete from public.events
  where contact_id in (select id from fixture_contacts)
     or application_id in (select id from fixture_applications)
     or reservation_id in (select id from fixture_reservations)
     or litter_id in (select id from fixture_litters)
     or animal_id in (select id from fixture_animals)
     or payment_id in (select id from related_payments)
     or document_id in (select id from related_documents)
  returning id
)
insert into cleanup_counts select 'events', count(*) from deleted;

with deleted as (
  delete from public.notes
  where contact_id in (select id from fixture_contacts)
     or application_id in (select id from fixture_applications)
     or reservation_id in (select id from fixture_reservations)
     or litter_id in (select id from fixture_litters)
     or animal_id in (select id from fixture_animals)
     or payment_id in (select id from related_payments)
     or document_id in (select id from related_documents)
  returning id
)
insert into cleanup_counts select 'notes', count(*) from deleted;

with deleted as (
  delete from public.media
  where contact_id in (select id from fixture_contacts)
     or reservation_id in (select id from fixture_reservations)
     or litter_id in (select id from fixture_litters)
     or animal_id in (select id from fixture_animals)
  returning id
)
insert into cleanup_counts select 'media', count(*) from deleted;

with deleted as (
  delete from public.credit_usages
  where contact_id in (select id from fixture_contacts)
     or target_reservation_id in (select id from fixture_reservations)
     or target_payment_id in (select id from related_payments)
  returning id
)
insert into cleanup_counts select 'credit_usages', count(*) from deleted;

with deleted as (
  delete from public.credits
  where contact_id in (select id from fixture_contacts)
     or origin_reservation_id in (select id from fixture_reservations)
     or origin_payment_id in (select id from related_payments)
  returning id
)
insert into cleanup_counts select 'credits', count(*) from deleted;

update public.payments
set document_id = null
where id in (select id from related_payments);

with deleted as (
  delete from public.documents
  where id in (select id from related_documents)
  returning id
)
insert into cleanup_counts select 'documents', count(*) from deleted;

with deleted as (
  delete from public.payments
  where id in (select id from related_payments)
  returning id
)
insert into cleanup_counts select 'payments', count(*) from deleted;

with deleted as (
  delete from public.reservations
  where id in (select id from fixture_reservations)
  returning id
)
insert into cleanup_counts select 'reservations', count(*) from deleted;

with deleted as (
  delete from public.animals
  where id in (select id from fixture_animals)
  returning id
)
insert into cleanup_counts select 'animals', count(*) from deleted;

with deleted as (
  delete from public.applications
  where id in (select id from fixture_applications)
  returning id
)
insert into cleanup_counts select 'applications', count(*) from deleted;

with deleted as (
  delete from public.contact_roles
  where contact_id in (select id from fixture_contacts)
  returning id
)
insert into cleanup_counts select 'contact_roles', count(*) from deleted;

with deleted as (
  delete from public.contacts
  where id in (select id from fixture_contacts)
  returning id
)
insert into cleanup_counts select 'contacts', count(*) from deleted;

with deleted as (
  delete from public.litters
  where id in (select id from fixture_litters)
  returning id
)
insert into cleanup_counts select 'litters', count(*) from deleted;

${restorePriceSettingsSql}

select json_build_object(
  'deleted', (select json_object_agg(table_name, deleted_count) from cleanup_counts),
  'remaining', json_build_object(
    'events', (
      select count(*) from public.events
      where contact_id in (select id from fixture_contacts)
         or application_id in (select id from fixture_applications)
         or reservation_id in (select id from fixture_reservations)
         or litter_id in (select id from fixture_litters)
         or animal_id in (select id from fixture_animals)
    ),
    'notes', (
      select count(*) from public.notes
      where contact_id in (select id from fixture_contacts)
         or application_id in (select id from fixture_applications)
         or reservation_id in (select id from fixture_reservations)
         or litter_id in (select id from fixture_litters)
         or animal_id in (select id from fixture_animals)
    ),
    'documents', (select count(*) from public.documents where id in (select id from related_documents)),
    'payments', (select count(*) from public.payments where id in (select id from related_payments)),
    'reservations', (select count(*) from public.reservations where id in (select id from fixture_reservations)),
    'applications', (select count(*) from public.applications where id in (select id from fixture_applications)),
    'contact_roles', (select count(*) from public.contact_roles where contact_id in (select id from fixture_contacts)),
    'contacts', (select count(*) from public.contacts where id in (select id from fixture_contacts)),
    'animals', (select count(*) from public.animals where id in (select id from fixture_animals)),
    'litters', (select count(*) from public.litters where id in (select id from fixture_litters)),
    'media', (
      select count(*) from public.media
      where contact_id in (select id from fixture_contacts)
         or reservation_id in (select id from fixture_reservations)
         or litter_id in (select id from fixture_litters)
         or animal_id in (select id from fixture_animals)
    ),
    'credits', (
      select count(*) from public.credits
      where contact_id in (select id from fixture_contacts)
         or origin_reservation_id in (select id from fixture_reservations)
    ),
    'credit_usages', (
      select count(*) from public.credit_usages
      where contact_id in (select id from fixture_contacts)
         or target_reservation_id in (select id from fixture_reservations)
    )
  ),
  'prefixRemaining', json_build_object(
    'litters_portee_prix', (select count(*) from public.litters where name like 'Portee prix %'),
    'litters_portee_disponibilite', (select count(*) from public.litters where name like 'Portee disponibilite %'),
    'litters_portee_attribution', (select count(*) from public.litters where name like 'Portee attribution %'),
    'contacts_prix', (select count(*) from public.contacts where display_name like 'Prix %'),
    'contacts_disponibilite', (select count(*) from public.contacts where display_name like 'Disponibilite %'),
    'contacts_attribution_coherence', (select count(*) from public.contacts where display_name like 'Attribution Coherence %'),
    'animals_prix', (select count(*) from public.animals where call_name like 'Animal prix %'),
    'animals_qa', (
      select count(*) from public.animals
      where call_name like 'QA Ne %'
         or call_name like 'QA Disponible %'
         or call_name like 'QA Reserve %'
         or call_name like 'QA Adopte %'
         or call_name like 'QA Garde %'
    ),
    'animals_attribution', (select count(*) from public.animals where call_name like 'Attribution animal %')
  ),
  'settings', (
    select row_to_json(settings)
    from (
      select
        default_male_puppy_price_cents,
        default_female_puppy_price_cents,
        default_puppy_price_cents
      from public.organization_settings
      where organization_id = '${organizationId}'::uuid
    ) settings
  )
)::text;

commit;
`;

  const stdout = await runE2eSql(sql);

  const report = JSON.parse(stdout.trim()) as {
    deleted: Record<string, number>;
    remaining: Record<string, number>;
    prefixRemaining: Record<string, number>;
    settings: PriceSettings;
  };

  for (const [table, count] of Object.entries(report.remaining)) {
    expect(count, `${fixture.label} cleanup remaining ${table}`).toBe(0);
  }

  for (const [prefix, count] of Object.entries(report.prefixRemaining)) {
    expect(count, `${fixture.label} cleanup prefix ${prefix}`).toBe(0);
  }

  if (fixture.restorePriceSettings) {
    expect(report.settings).toMatchObject(fixture.restorePriceSettings);
  }

  console.info(
    JSON.stringify({
      fixtureCleanup: {
        label: fixture.label,
        created: {
          contacts: fixture.contactIds,
          reservations: fixture.reservationIds,
          applications: fixture.applicationIds ?? [],
          animals: fixture.animalIds,
          litters: fixture.litterIds,
        },
        deleted: report.deleted,
        remaining: report.remaining,
        prefixRemaining: report.prefixRemaining,
        settings: report.settings,
      },
    }),
  );
}

async function loginOwner(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("e2e-owner@saasphase1.invalid");
  await page.getByLabel("Mot de passe").fill("LocalE2EOwner-2026!");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/candidatures/);
}

test("keeps reservation and animal statuses coherent when assigning and unassigning", async ({
  page,
}) => {
  const supabase = await createAuthenticatedSupabaseClient();
  const contactId = randomUUID();
  const reservationId = randomUUID();
  const litterId = randomUUID();
  const animalId = randomUUID();
  const suffix = reservationId.slice(0, 8);

  try {
    const { error: litterError } = await supabase.from("litters").insert({
      id: litterId,
      organization_id: organizationId,
      name: `Portee attribution ${suffix}`,
      species: "dog",
      breed: "Golden Retriever",
      status: "born",
      actual_birth_date: "2026-06-24",
      created_by: ownerId,
      updated_by: ownerId,
    });

    expect(litterError).toBeNull();

    const { error: contactError } = await supabase.from("contacts").insert({
      id: contactId,
      organization_id: organizationId,
      contact_type: "person",
      first_name: "Attribution",
      last_name: `Coherence ${suffix}`,
      display_name: `Attribution Coherence ${suffix}`,
      email: `attribution-coherence-${suffix}@example.invalid`,
      origin_channel: "manual",
      primary_status: "active",
      created_by: ownerId,
      updated_by: ownerId,
    });

    expect(contactError).toBeNull();

    const { error: reservationError } = await supabase.from("reservations").insert({
      id: reservationId,
      organization_id: organizationId,
      contact_id: contactId,
      species: "dog",
      breed: "Golden Retriever",
      litter_id: litterId,
      reserved_sex_preference: "female_only",
      status: "draft",
      created_by: ownerId,
      updated_by: ownerId,
    });

    expect(reservationError).toBeNull();

    const { error: animalInsertError } = await supabase.from("animals").insert({
      id: animalId,
      organization_id: organizationId,
      litter_id: litterId,
      call_name: `Attribution animal ${suffix}`,
      species: "dog",
      breed: "Golden Retriever",
      sex: "female",
      status: "available",
      ownership_status: "produced",
      is_breeder: false,
      is_external: false,
      is_retired: false,
      created_by: ownerId,
      updated_by: ownerId,
    });

    expect(animalInsertError).toBeNull();

    await page.goto("/login");
    await page.getByLabel("Email").fill("e2e-owner@saasphase1.invalid");
    await page.getByLabel("Mot de passe").fill("LocalE2EOwner-2026!");
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page).toHaveURL(/\/candidatures/);

    await page.goto(`/reservations/${reservationId}`);
    await page.getByLabel("Attribuer un animal").selectOption(animalId);
    await page.getByRole("button", { name: "Attribuer l’animal" }).click();
    await expect(page).toHaveURL(/animal_assign_status=success/, {
      timeout: 15_000,
    });

    const assignedReservation = expectSupabaseData(
      await supabase
        .from("reservations")
        .select("id, animal_id, animal_assigned_at, status")
        .eq("id", reservationId)
        .single(),
      "read assigned reservation",
    );
    expect(assignedReservation).toMatchObject({
      id: reservationId,
      animal_id: animalId,
      status: "animal_assigned",
    });
    expect(assignedReservation?.animal_assigned_at).not.toBeNull();

    const reservedAnimal = expectSupabaseData(
      await supabase
        .from("animals")
        .select("id, status")
        .eq("id", animalId)
        .single(),
      "read reserved animal",
    );
    expect(reservedAnimal).toMatchObject({
      id: animalId,
      status: "reserved",
    });

    await page.goto(`/reservations/${reservationId}`);
    await page
      .getByRole("button", { name: "Retirer l’attribution" })
      .first()
      .click();
    await expect(page).toHaveURL(/animal_unassign_status=success/);

    const unassignedReservation = expectSupabaseData(
      await supabase
        .from("reservations")
        .select("id, animal_id, animal_assigned_at, status")
        .eq("id", reservationId)
        .single(),
      "read unassigned reservation",
    );
    expect(unassignedReservation).toMatchObject({
      id: reservationId,
      animal_id: null,
      animal_assigned_at: null,
      status: "animal_assigned",
    });

    const availableAnimal = expectSupabaseData(
      await supabase
        .from("animals")
        .select("id, status")
        .eq("id", animalId)
        .single(),
      "read available animal",
    );
    expect(availableAnimal).toMatchObject({
      id: animalId,
      status: "available",
    });
  } finally {
    await runFixtureCleanupWithSql({
      label: "animal attribution coherence",
      contactIds: [contactId],
      reservationIds: [reservationId],
      animalIds: [animalId],
      litterIds: [litterId],
    });
  }
});

test("initializes reservation price from animal sex defaults during attribution", async ({
  page,
}) => {
  test.setTimeout(120_000);

  const supabase = await createAuthenticatedSupabaseClient();
  const createdLitterIds: string[] = [];
  const createdContactIds: string[] = [];
  const createdReservationIds: string[] = [];
  const createdAnimalIds: string[] = [];

  const originalSettings = expectSupabaseData(
    await supabase
      .from("organization_settings")
      .select(
        "default_male_puppy_price_cents, default_female_puppy_price_cents, default_puppy_price_cents",
      )
      .eq("organization_id", organizationId)
      .single(),
    "read original price settings",
  );

  async function updatePriceSettings({
    male,
    female,
    fallback,
  }: {
    male: number | null;
    female: number | null;
    fallback: number | null;
  }) {
    const { error } = await supabase
      .from("organization_settings")
      .update({
        default_male_puppy_price_cents: male,
        default_female_puppy_price_cents: female,
        default_puppy_price_cents: fallback,
      })
      .eq("organization_id", organizationId);

    expect(error).toBeNull();
  }

  async function createAttributionFixture({
    label,
    animalSex,
    initialPriceCents = null,
  }: {
    label: string;
    animalSex: "male" | "female" | "unknown";
    initialPriceCents?: number | null;
  }) {
    const suffix = `${label}-${randomUUID().slice(0, 8)}`;
    const litterId = randomUUID();
    const contactId = randomUUID();
    const reservationId = randomUUID();
    const animalId = randomUUID();

    createdLitterIds.push(litterId);
    createdContactIds.push(contactId);
    createdReservationIds.push(reservationId);
    createdAnimalIds.push(animalId);

    const { error: litterError } = await supabase.from("litters").insert({
      id: litterId,
      organization_id: organizationId,
      name: `Portee prix ${suffix}`,
      species: "dog",
      breed: "Golden Retriever",
      status: "born",
      actual_birth_date: "2026-06-28",
      created_by: ownerId,
      updated_by: ownerId,
    });
    expect(litterError).toBeNull();

    const { error: contactError } = await supabase.from("contacts").insert({
      id: contactId,
      organization_id: organizationId,
      contact_type: "person",
      first_name: "Prix",
      last_name: suffix,
      display_name: `Prix ${suffix}`,
      email: `prix-attribution-${suffix}@example.invalid`,
      origin_channel: "manual",
      primary_status: "active",
      created_by: ownerId,
      updated_by: ownerId,
    });
    expect(contactError).toBeNull();

    const { error: reservationError } = await supabase
      .from("reservations")
      .insert({
        id: reservationId,
        organization_id: organizationId,
        contact_id: contactId,
        species: "dog",
        breed: "Golden Retriever",
        litter_id: litterId,
        reserved_sex_preference:
          animalSex === "male" ? "female_only" : "male_only",
        status: "draft",
        price_cents: initialPriceCents,
        created_by: ownerId,
        updated_by: ownerId,
      });
    expect(reservationError).toBeNull();

    const { error: animalError } = await supabase.from("animals").insert({
      id: animalId,
      organization_id: organizationId,
      litter_id: litterId,
      call_name: `Animal prix ${suffix}`,
      species: "dog",
      breed: "Golden Retriever",
      sex: animalSex,
      status: "available",
      ownership_status: "produced",
      is_breeder: false,
      is_external: false,
      is_retired: false,
      created_by: ownerId,
      updated_by: ownerId,
    });
    expect(animalError).toBeNull();

    return { reservationId, animalId };
  }

  async function assignAndExpectPrice(
    fixture: { reservationId: string; animalId: string },
    expectedPriceCents: number | null,
  ) {
    await page.goto(`/reservations/${fixture.reservationId}`);
    await page.getByLabel("Attribuer un animal").selectOption(fixture.animalId);
    await page.getByRole("button", { name: "Attribuer l’animal" }).click();
    await expect(page).toHaveURL(/animal_assign_status=success/, {
      timeout: 15_000,
    });

    const reservation = expectSupabaseData(
      await supabase
        .from("reservations")
        .select("id, animal_id, status, price_cents")
        .eq("id", fixture.reservationId)
        .single(),
      "read priced reservation",
    );

    expect(reservation).toMatchObject({
      id: fixture.reservationId,
      animal_id: fixture.animalId,
      status: "animal_assigned",
      price_cents: expectedPriceCents,
    });

    const { count, error: paymentsError } = await supabase
      .from("payments")
      .select("id", { count: "exact", head: true })
      .eq("reservation_id", fixture.reservationId);

    expect(paymentsError).toBeNull();
    expect(count).toBe(0);
  }

  try {
    await loginOwner(page);

    await updatePriceSettings({
      male: 181000,
      female: 202000,
      fallback: 190000,
    });
    await assignAndExpectPrice(
      await createAttributionFixture({ label: "male", animalSex: "male" }),
      181000,
    );
    await assignAndExpectPrice(
      await createAttributionFixture({ label: "female", animalSex: "female" }),
      202000,
    );

    await updatePriceSettings({
      male: null,
      female: 202000,
      fallback: 190000,
    });
    await assignAndExpectPrice(
      await createAttributionFixture({
        label: "male-fallback",
        animalSex: "male",
      }),
      190000,
    );

    await updatePriceSettings({
      male: null,
      female: null,
      fallback: null,
    });
    await assignAndExpectPrice(
      await createAttributionFixture({ label: "no-price", animalSex: "unknown" }),
      null,
    );

    await updatePriceSettings({
      male: 181000,
      female: 202000,
      fallback: 190000,
    });
    await assignAndExpectPrice(
      await createAttributionFixture({
        label: "existing-price",
        animalSex: "male",
        initialPriceCents: 199000,
      }),
      199000,
    );
  } finally {
    await runFixtureCleanupWithSql({
      label: "animal attribution prices",
      contactIds: createdContactIds,
      reservationIds: createdReservationIds,
      animalIds: createdAnimalIds,
      litterIds: createdLitterIds,
      restorePriceSettings: originalSettings,
    });
  }
});

test("requires produced offspring to be available before attribution", async ({
  page,
}) => {
  test.setTimeout(90_000);

  const supabase = await createAuthenticatedSupabaseClient();
  const litterId = randomUUID();
  const contactId = randomUUID();
  const reservationId = randomUUID();
  const bornAnimalId = randomUUID();
  const availableAnimalId = randomUUID();
  const reservedAnimalId = randomUUID();
  const adoptedAnimalId = randomUUID();
  const keptAnimalId = randomUUID();
  const suffix = litterId.slice(0, 8);

  try {
    const { error: litterError } = await supabase.from("litters").insert({
      id: litterId,
      organization_id: organizationId,
      name: `Portee disponibilite ${suffix}`,
      species: "dog",
      breed: "Golden Retriever",
      status: "born",
      actual_birth_date: "2026-06-25",
      created_by: ownerId,
      updated_by: ownerId,
    });

    expect(litterError).toBeNull();

    const { error: animalsError } = await supabase.from("animals").insert([
      {
        id: bornAnimalId,
        organization_id: organizationId,
        litter_id: litterId,
        call_name: `QA Ne ${suffix}`,
        species: "dog",
        breed: "Golden Retriever",
        sex: "female",
        status: "born",
        ownership_status: "produced",
        is_breeder: false,
        is_external: false,
        is_retired: false,
        created_by: ownerId,
        updated_by: ownerId,
      },
      {
        id: availableAnimalId,
        organization_id: organizationId,
        litter_id: litterId,
        call_name: `QA Disponible ${suffix}`,
        species: "dog",
        breed: "Golden Retriever",
        sex: "male",
        status: "available",
        ownership_status: "produced",
        is_breeder: false,
        is_external: false,
        is_retired: false,
        created_by: ownerId,
        updated_by: ownerId,
      },
      {
        id: reservedAnimalId,
        organization_id: organizationId,
        litter_id: litterId,
        call_name: `QA Reserve ${suffix}`,
        species: "dog",
        breed: "Golden Retriever",
        sex: "female",
        status: "reserved",
        ownership_status: "produced",
        is_breeder: false,
        is_external: false,
        is_retired: false,
        created_by: ownerId,
        updated_by: ownerId,
      },
      {
        id: adoptedAnimalId,
        organization_id: organizationId,
        litter_id: litterId,
        call_name: `QA Adopte ${suffix}`,
        species: "dog",
        breed: "Golden Retriever",
        sex: "male",
        status: "adopted",
        ownership_status: "adopted_out",
        is_breeder: false,
        is_external: false,
        is_retired: false,
        created_by: ownerId,
        updated_by: ownerId,
      },
      {
        id: keptAnimalId,
        organization_id: organizationId,
        litter_id: litterId,
        call_name: `QA Garde ${suffix}`,
        species: "dog",
        breed: "Golden Retriever",
        sex: "female",
        status: "kept",
        ownership_status: "produced",
        is_breeder: false,
        is_external: false,
        is_retired: false,
        created_by: ownerId,
        updated_by: ownerId,
      },
    ]);

    expect(animalsError).toBeNull();

    const { error: contactError } = await supabase.from("contacts").insert({
      id: contactId,
      organization_id: organizationId,
      contact_type: "person",
      first_name: "Disponibilite",
      last_name: suffix,
      display_name: `Disponibilite ${suffix}`,
      email: `disponibilite-${suffix}@example.invalid`,
      origin_channel: "manual",
      primary_status: "active",
      created_by: ownerId,
      updated_by: ownerId,
    });

    expect(contactError).toBeNull();

    const { error: reservationError } = await supabase.from("reservations").insert({
      id: reservationId,
      organization_id: organizationId,
      contact_id: contactId,
      litter_id: litterId,
      species: "dog",
      breed: "Golden Retriever",
      reserved_sex_preference: "no_preference",
      status: "draft",
      created_by: ownerId,
      updated_by: ownerId,
    });

    expect(reservationError).toBeNull();

    await page.goto("/login");
    await page.getByLabel("Email").fill("e2e-owner@saasphase1.invalid");
    await page.getByLabel("Mot de passe").fill("LocalE2EOwner-2026!");
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page).toHaveURL(/\/candidatures/);

    await page.goto(`/litters/${litterId}`);
    await expect(page.locator("#animaux-lies")).toContainText(`QA Ne ${suffix}`);
    await expect(page.locator("#animaux-lies")).toContainText("Né");
    await expect(page.locator(`#animal-availability-${bornAnimalId}`)).toBeVisible();
    await expect(page.locator(`#animal-availability-${availableAnimalId}`)).toBeVisible();
    await expect(page.locator(`#animal-availability-${reservedAnimalId}`)).toHaveCount(0);
    await expect(page.locator(`#animal-availability-${adoptedAnimalId}`)).toHaveCount(0);
    await expect(page.locator(`#animal-availability-${keptAnimalId}`)).toHaveCount(0);

    await page.locator(`#animal-availability-${bornAnimalId}`).selectOption("available");
    await page
      .locator(`#animal-availability-${bornAnimalId}`)
      .locator("xpath=ancestor::form")
      .getByRole("button", { name: "Mettre à jour" })
      .click();
    await expect(page).toHaveURL(/animal_availability_status=success/);

    let animal = expectSupabaseData(
      await supabase
        .from("animals")
        .select("id, status")
        .eq("id", bornAnimalId)
        .single(),
      "read available offspring",
    );
    expect(animal).toMatchObject({ id: bornAnimalId, status: "available" });

    await page.goto(`/reservations/${reservationId}`);
    await expect(page.locator(`#animal_id option[value="${bornAnimalId}"]`)).toHaveCount(1);

    await page.goto(`/animals/${bornAnimalId}`);
    await page
      .locator("#animal-produced-offspring-availability")
      .selectOption("born");
    await page.getByRole("button", { name: "Mettre à jour" }).click();
    await expect(page).toHaveURL(/availability_status=success/);

    animal = expectSupabaseData(
      await supabase
        .from("animals")
        .select("id, status")
        .eq("id", bornAnimalId)
        .single(),
      "read born offspring",
    );
    expect(animal).toMatchObject({ id: bornAnimalId, status: "born" });

    await page.goto(`/reservations/${reservationId}`);
    await expect(page.locator(`#animal_id option[value="${bornAnimalId}"]`)).toHaveCount(0);

    await page.goto(`/animals/${bornAnimalId}`);
    await page
      .locator("#animal-produced-offspring-availability")
      .selectOption("available");
    await page.getByRole("button", { name: "Mettre à jour" }).click();
    await expect(page).toHaveURL(/availability_status=success/);

    await page.goto(`/reservations/${reservationId}`);
    await page.getByLabel("Attribuer un animal").selectOption(bornAnimalId);
    await page.getByRole("button", { name: "Attribuer l’animal" }).click();
    await expect(page).toHaveURL(/animal_assign_status=success/, {
      timeout: 15_000,
    });

    animal = expectSupabaseData(
      await supabase
        .from("animals")
        .select("id, status")
        .eq("id", bornAnimalId)
        .single(),
      "read reserved offspring",
    );
    expect(animal).toMatchObject({ id: bornAnimalId, status: "reserved" });

    await page.goto(`/litters/${litterId}`);
    await expect(page.locator(`#animal-availability-${bornAnimalId}`)).toHaveCount(0);
  } finally {
    await runFixtureCleanupWithSql({
      label: "animal availability attribution",
      contactIds: [contactId],
      reservationIds: [reservationId],
      animalIds: [
        bornAnimalId,
        availableAnimalId,
        reservedAnimalId,
        adoptedAnimalId,
        keptAnimalId,
      ],
      litterIds: [litterId],
    });
  }
});
