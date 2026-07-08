import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

import {
  createAuthenticatedSupabaseClient,
  expectSupabaseData,
} from "./helpers/supabase";

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";

async function loginOwner(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("owner@saasphase1.invalid");
  await page.getByLabel("Mot de passe").fill("LocalDevOwner-2026!");
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
    display_name: `Attribution animal ${suffix}`,
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
  await page.getByLabel("Email").fill("owner@saasphase1.invalid");
  await page.getByLabel("Mot de passe").fill("LocalDevOwner-2026!");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/candidatures/);

  await page.goto(`/reservations/${reservationId}`);
  await page.getByLabel("Attribuer un animal").selectOption(animalId);
  await page.getByRole("button", { name: "Attribuer l’animal" }).click();
  await expect(page).toHaveURL(/animal_assign_status=success/);

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
      display_name: `Animal prix ${suffix}`,
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
    await expect(page).toHaveURL(/animal_assign_status=success/);

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
    await supabase
      .from("organization_settings")
      .update(originalSettings)
      .eq("organization_id", organizationId);

    if (createdReservationIds.length > 0) {
      await supabase.from("reservations").delete().in("id", createdReservationIds);
    }
    if (createdAnimalIds.length > 0) {
      await supabase.from("animals").delete().in("id", createdAnimalIds);
    }
    if (createdContactIds.length > 0) {
      await supabase.from("contacts").delete().in("id", createdContactIds);
    }
    if (createdLitterIds.length > 0) {
      await supabase.from("litters").delete().in("id", createdLitterIds);
    }
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
      display_name: `QA Ne ${suffix}`,
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
      display_name: `QA Disponible ${suffix}`,
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
      display_name: `QA Reserve ${suffix}`,
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
      display_name: `QA Adopte ${suffix}`,
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
      display_name: `QA Garde ${suffix}`,
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
  await page.getByLabel("Email").fill("owner@saasphase1.invalid");
  await page.getByLabel("Mot de passe").fill("LocalDevOwner-2026!");
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
  await expect(page).toHaveURL(/animal_assign_status=success/);

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
});
