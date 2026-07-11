import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";

import { expect, test, type Page } from "@playwright/test";

import {
  createAuthenticatedSupabaseClient,
  expectSupabaseData,
} from "./helpers/supabase";

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const litterId = "c0000000-0000-4000-8000-000000000001";
const execFileAsync = promisify(execFile);
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const animalCallNameCleanupPrefixes = [
  "QA reproductrice maison ",
  "QA male reproducteur maison ",
  "QA etalon exterieur ",
  "QA femelle exterieure ",
  "QA animal retraite ",
  "QA animal historique ",
  "QA ancien reproducteur ",
  "QA produced force ",
  "QA status breeding force ",
  "QA edition legere ",
  "QA edition mere ",
  "QA edition pere ",
  "QA edition modifiee ",
  "QA edition chiot ",
  "QA edition chiot modifie ",
  "QA garder disponible ",
  "QA garder reproducteur ",
  "QA promotion repro maison ",
  "QA sante vide ",
  "QA evenement sante ",
] as const;
const eventTitleCleanupPrefixes = ["Vaccination animal e2e "] as const;

type ManualAnimalCase = {
  label: string;
  expected: {
    sex: "female" | "male" | "unknown";
    status: string;
    ownership_status: string;
    is_breeder: boolean;
    is_external: boolean;
    is_retired: boolean;
    litter_id: null;
  };
  fill: (page: Page) => Promise<void>;
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

function sqlLikeClauses(columnName: string, prefixes: readonly string[]) {
  return prefixes
    .map((prefix) => `${columnName} like '${prefix.replaceAll("'", "''")}%'`)
    .join(" or ");
}

async function cleanupAnimalManualFixtures(label: string, animalIds: string[]) {
  const explicitAnimalIds = sqlUuidArray(Array.from(new Set(animalIds)));
  const animalPrefixClauses = sqlLikeClauses(
    "call_name",
    animalCallNameCleanupPrefixes,
  );
  const eventTitlePrefixClauses = sqlLikeClauses(
    "title",
    eventTitleCleanupPrefixes,
  );

  const sql = `
begin;

create temp table fixture_animals(id uuid primary key) on commit drop;
create temp table related_reservations(id uuid primary key) on commit drop;
create temp table related_documents(id uuid primary key) on commit drop;
create temp table related_payments(id uuid primary key) on commit drop;
create temp table cleanup_counts(table_name text primary key, deleted_count integer not null) on commit drop;

insert into fixture_animals
select unnest(${explicitAnimalIds})
on conflict do nothing;

insert into fixture_animals
select id
from public.animals
where organization_id = '${organizationId}'::uuid
  and (${animalPrefixClauses})
on conflict do nothing;

insert into related_reservations
select id
from public.reservations
where animal_id in (select id from fixture_animals)
on conflict do nothing;

insert into related_payments
select id
from public.payments
where reservation_id in (select id from related_reservations)
on conflict do nothing;

insert into related_documents
select id
from public.documents
where animal_id in (select id from fixture_animals)
   or reservation_id in (select id from related_reservations)
   or payment_id in (select id from related_payments)
   or id in (
     select document_id
     from public.payments
     where id in (select id from related_payments)
       and document_id is not null
   )
on conflict do nothing;

with deleted as (
  delete from public.events
  where animal_id in (select id from fixture_animals)
     or reservation_id in (select id from related_reservations)
     or payment_id in (select id from related_payments)
     or document_id in (select id from related_documents)
     or (${eventTitlePrefixClauses})
  returning id
)
insert into cleanup_counts select 'events', count(*) from deleted;

with deleted as (
  delete from public.notes
  where animal_id in (select id from fixture_animals)
     or reservation_id in (select id from related_reservations)
     or payment_id in (select id from related_payments)
     or document_id in (select id from related_documents)
  returning id
)
insert into cleanup_counts select 'notes', count(*) from deleted;

with deleted as (
  delete from public.media
  where animal_id in (select id from fixture_animals)
     or reservation_id in (select id from related_reservations)
  returning id
)
insert into cleanup_counts select 'media', count(*) from deleted;

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
  where id in (select id from related_reservations)
  returning id
)
insert into cleanup_counts select 'reservations', count(*) from deleted;

with deleted as (
  delete from public.animals
  where id in (select id from fixture_animals)
  returning id
)
insert into cleanup_counts select 'animals', count(*) from deleted;

select json_build_object(
  'deleted', (select json_object_agg(table_name, deleted_count) from cleanup_counts),
  'createdAnimalIds', (select coalesce(json_agg(id::text order by id::text), '[]'::json) from fixture_animals),
  'remaining', json_build_object(
    'events', (
      select count(*)
      from public.events
      where animal_id in (select id from fixture_animals)
         or reservation_id in (select id from related_reservations)
         or payment_id in (select id from related_payments)
         or document_id in (select id from related_documents)
         or (${eventTitlePrefixClauses})
    ),
    'notes', (
      select count(*)
      from public.notes
      where animal_id in (select id from fixture_animals)
         or reservation_id in (select id from related_reservations)
         or payment_id in (select id from related_payments)
         or document_id in (select id from related_documents)
    ),
    'media', (
      select count(*)
      from public.media
      where animal_id in (select id from fixture_animals)
         or reservation_id in (select id from related_reservations)
    ),
    'documents', (select count(*) from public.documents where id in (select id from related_documents)),
    'payments', (select count(*) from public.payments where id in (select id from related_payments)),
    'reservations', (select count(*) from public.reservations where id in (select id from related_reservations)),
    'animals', (select count(*) from public.animals where id in (select id from fixture_animals)),
    'animal_prefixes', (
      select count(*)
      from public.animals
      where organization_id = '${organizationId}'::uuid
        and (${animalPrefixClauses})
    ),
    'event_title_prefixes', (
      select count(*)
      from public.events
      where ${eventTitlePrefixClauses}
    )
  )
)::text;

commit;
`;

  const { stdout } = await execFileAsync(
    "docker",
    [
      "exec",
      "supabase_db_saasphase1",
      "psql",
      "-X",
      "-q",
      "-t",
      "-A",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-c",
      sql,
    ],
    { maxBuffer: 1024 * 1024 },
  );

  const report = JSON.parse(stdout.trim()) as {
    deleted: Record<string, number>;
    createdAnimalIds: string[];
    remaining: Record<string, number>;
  };

  for (const [table, count] of Object.entries(report.remaining)) {
    expect(count, `${label} cleanup remaining ${table}`).toBe(0);
  }

  console.info(
    JSON.stringify({
      fixtureCleanup: {
        label,
        created: { animals: Array.from(new Set(animalIds)) },
        matchedAnimalIds: report.createdAnimalIds,
        deleted: report.deleted,
        remaining: report.remaining,
      },
    }),
  );
}

function extractAnimalIdFromUrl(page: Page) {
  const match = page.url().match(/\/animals\/([0-9a-f-]{36})(?:$|[?#])/i);

  if (!match) {
    throw new Error(`Unable to read animal id from URL: ${page.url()}`);
  }

  return match[1];
}

test("creates manual animals without confusing them with litter offspring", async ({
  page,
}) => {
  test.setTimeout(150_000);

  const supabase = await createAuthenticatedSupabaseClient();
  const suffix = Date.now().toString(36);
  const sccUrl = `https://www.centrale-canine.fr/chien/${suffix}`;
  const createdAnimalIds: string[] = [];

  const cases: ManualAnimalCase[] = [
    {
      label: `QA reproductrice maison ${suffix}`,
      expected: {
        sex: "female",
        status: "active",
        ownership_status: "owned",
        is_breeder: true,
        is_external: false,
        is_retired: false,
        litter_id: null,
      },
      fill: async (formPage) => {
        await formPage.getByLabel("Sexe", { exact: true }).selectOption("female");
        await formPage.locator('input[name="is_breeder"]').check();
        await formPage.getByLabel("Numéro LOF").fill(`LOF QA ${suffix}`);
        await formPage.getByLabel("Robe").fill("Fauve clair QA");
        await formPage
          .getByLabel("Lien vers la page SCC de l’animal")
          .fill(sccUrl);
      },
    },
    {
      label: `QA male reproducteur maison ${suffix}`,
      expected: {
        sex: "male",
        status: "active",
        ownership_status: "owned",
        is_breeder: true,
        is_external: false,
        is_retired: false,
        litter_id: null,
      },
      fill: async (formPage) => {
        await formPage.getByLabel("Sexe", { exact: true }).selectOption("male");
        await formPage.locator('input[name="is_breeder"]').check();
      },
    },
    {
      label: `QA etalon exterieur ${suffix}`,
      expected: {
        sex: "male",
        status: "active",
        ownership_status: "external_stud",
        is_breeder: true,
        is_external: true,
        is_retired: false,
        litter_id: null,
      },
      fill: async (formPage) => {
        await formPage
          .getByLabel("Origine", { exact: true })
          .selectOption("external_stud");
      },
    },
    {
      label: `QA femelle exterieure ${suffix}`,
      expected: {
        sex: "female",
        status: "active",
        ownership_status: "external_female",
        is_breeder: true,
        is_external: true,
        is_retired: false,
        litter_id: null,
      },
      fill: async (formPage) => {
        await formPage
          .getByLabel("Origine", { exact: true })
          .selectOption("external_female");
      },
    },
    {
      label: `QA animal retraite ${suffix}`,
      expected: {
        sex: "unknown",
        status: "retired",
        ownership_status: "owned",
        is_breeder: false,
        is_external: false,
        is_retired: true,
        litter_id: null,
      },
      fill: async (formPage) => {
        await formPage.locator('input[name="is_retired"]').check();
      },
    },
    {
      label: `QA animal historique ${suffix}`,
      expected: {
        sex: "unknown",
        status: "archived",
        ownership_status: "unknown",
        is_breeder: false,
        is_external: false,
        is_retired: false,
        litter_id: null,
      },
      fill: async (formPage) => {
        await formPage
          .getByLabel("Statut", { exact: true })
          .selectOption("archived");
        await formPage
          .getByLabel("Origine", { exact: true })
          .selectOption("unknown");
      },
    },
  ];

  try {
    await page.goto("/login");
    await page.getByLabel("Email").fill("owner@saasphase1.invalid");
    await page.getByLabel("Mot de passe").fill("LocalDevOwner-2026!");
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page).toHaveURL(/\/candidatures/);

    for (const manualCase of cases) {
      await page.goto("/animals/new");
      await expect(
        page.getByText("ce formulaire ne crée pas de chiot/chaton"),
      ).toBeVisible();
      await expect(page.getByLabel("Numéro LOF")).toBeVisible();
      await expect(page.getByLabel("Robe")).toBeVisible();
      await expect(page.getByText("Reproducteur maison", { exact: true })).toBeVisible();
      await expect(page.getByLabel("Numéro d’identification")).toBeVisible();
      await expect(
        page.getByLabel("Lien vers la page SCC de l’animal"),
      ).toBeVisible();
      await expect(
        page.locator('input[name="official_name"]'),
      ).toHaveCount(1);
      await expect(page.locator('input[name="call_name"]')).toHaveCount(1);
      const identityFieldOrder = await page
        .locator('input[name="official_name"], input[name="call_name"]')
        .evaluateAll((inputs) =>
          inputs.map((input) => (input as HTMLInputElement).name),
        );
      expect(identityFieldOrder).toEqual(["official_name", "call_name"]);
      await expect(page.getByLabel("Couleur", { exact: true })).toHaveCount(0);
      await expect(
        page.locator('select[name="status"] option[value="breeding"]'),
      ).toHaveCount(0);
      await expect(
        page.getByLabel("Statut", { exact: true }).locator("option", {
          hasText: "Reproducteur",
        }),
      ).toHaveCount(0);
      await page.getByLabel("Nom d’usage").fill(manualCase.label);
      await manualCase.fill(page);
      await page.getByRole("button", { name: "Créer l’animal" }).click();
      await expect(page).toHaveURL(/\/animals\/[0-9a-f-]{36}$/);
      createdAnimalIds.push(extractAnimalIdFromUrl(page));
      await expect(
        page.getByRole("heading", { name: manualCase.label }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Renseigner l’identité définitive" }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("heading", {
          name: "Naissance, filiation et suivi de portée",
        }),
      ).toHaveCount(0);

      const animal = expectSupabaseData(
        await supabase
          .from("animals")
          .select(
            "call_name, sex, status, ownership_status, is_breeder, is_external, is_retired, litter_id, lof_number, color, coat_color, pedigree_url",
          )
          .eq("call_name", manualCase.label)
          .single(),
        `read ${manualCase.label}`,
      );

      expect(animal).toMatchObject({
        call_name: manualCase.label,
        ...manualCase.expected,
      });

      if (manualCase.label === cases[0].label) {
        expect(animal).toMatchObject({
          lof_number: `LOF QA ${suffix}`,
          color: null,
          coat_color: "Fauve clair QA",
          pedigree_url: sccUrl,
        });
        const identitySection = page.locator("section").filter({
          has: page.getByRole("heading", {
            name: "Fiche d’identité",
            exact: true,
          }),
        });
        await expect(identitySection).toContainText(`LOF QA ${suffix}`);
        await expect(identitySection).toContainText("Fauve clair QA");
        const sccLink = identitySection.getByRole("link", { name: sccUrl });
        await expect(identitySection).toContainText(
          "Lien vers la page SCC de l’animal",
        );
        await expect(sccLink).toHaveAttribute("href", sccUrl);
        await expect(sccLink).toHaveAttribute("target", "_blank");
        await expect(sccLink).toHaveAttribute("rel", "noreferrer");
      }
    }

    await page.goto("/animals");
    for (const manualCase of cases) {
      const row = page.locator("tbody tr").filter({ hasText: manualCase.label });
      await expect(row).toBeVisible();
      await expect(row).toContainText("Portée : Non renseigné");
    }
    const modernHomeBreederRow = page
      .locator("tbody tr")
      .filter({ hasText: cases[0].label });
    await expect(modernHomeBreederRow).toContainText("Actif");
    await expect(modernHomeBreederRow).toContainText(
      "Rôle : Reproducteur maison",
    );

    await page.goto("/animals?filter=home_breeders");
    await expect(page.getByText(cases[0].label)).toBeVisible();
    await expect(page.getByText(cases[1].label)).toBeVisible();
    await expect(page.getByText(cases[2].label)).not.toBeVisible();

    await page.goto("/animals?filter=external_breeders");
    await expect(page.getByText(cases[2].label)).toBeVisible();
    await expect(page.getByText(cases[3].label)).toBeVisible();
    await expect(page.getByText(cases[0].label)).not.toBeVisible();

    await page.goto("/animals?filter=retired");
    await expect(page.getByText(cases[4].label)).toBeVisible();
    await expect(page.getByText(cases[5].label)).not.toBeVisible();

    await page.goto("/animals?origin=external");
    await expect(page.getByText(cases[2].label)).toBeVisible();
    await expect(page.getByText(cases[3].label)).toBeVisible();
    await expect(page.getByText(cases[1].label)).not.toBeVisible();

    const forcedProducedName = `QA produced force ${suffix}`;
    await page.goto("/animals/new");
    await page.getByLabel("Nom d’usage").fill(forcedProducedName);
    await page.locator('select[name="ownership_status"]').evaluate((select) => {
      const option = document.createElement("option");
      option.value = "produced";
      option.textContent = "Né à l’élevage";
      select.append(option);
      (select as HTMLSelectElement).value = "produced";
    });
    await page.getByRole("button", { name: "Créer l’animal" }).click();
    await expect(page).toHaveURL(/\/animals\/new\?status=invalid$/);

    const { count, error } = await supabase
      .from("animals")
      .select("id", { count: "exact", head: true })
      .eq("call_name", forcedProducedName);

    expect(error).toBeNull();
    expect(count).toBe(0);

    const forcedBreedingStatusName = `QA status breeding force ${suffix}`;
    await page.goto("/animals/new");
    await page.getByLabel("Nom d’usage").fill(forcedBreedingStatusName);
    await page.locator('select[name="status"]').evaluate((select) => {
      const option = document.createElement("option");
      option.value = "breeding";
      option.textContent = "Reproducteur";
      select.append(option);
      (select as HTMLSelectElement).value = "breeding";
    });
    await page.getByRole("button", { name: "Créer l’animal" }).click();
    await expect(page).toHaveURL(/\/animals\/new\?status=invalid$/);

    const { count: forcedBreedingStatusCount, error: forcedBreedingStatusError } =
      await supabase
        .from("animals")
        .select("id", { count: "exact", head: true })
        .eq("call_name", forcedBreedingStatusName);

    expect(forcedBreedingStatusError).toBeNull();
    expect(forcedBreedingStatusCount).toBe(0);
  } finally {
    await cleanupAnimalManualFixtures(
      "manual animal creation variants",
      createdAnimalIds,
    );
  }
});

test("normalizes a legacy breeding administrative status without losing breeder role", async ({
  page,
}) => {
  test.setTimeout(60_000);

  const supabase = await createAuthenticatedSupabaseClient();
  const animalId = randomUUID();
  const suffix = animalId.slice(0, 8);
  const animalName = `QA ancien reproducteur ${suffix}`;
  const createdAnimalIds = [animalId];

  try {
    const { error: animalInsertError } = await supabase.from("animals").insert({
      id: animalId,
      organization_id: organizationId,
      call_name: animalName,
      species: "dog",
      breed: "Golden Retriever",
      sex: "female",
      status: "breeding",
      ownership_status: "owned",
      is_breeder: true,
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

    await page.goto("/animals");
    const legacyRow = page.locator("tbody tr").filter({ hasText: animalName });
    await expect(legacyRow).toBeVisible();
    await expect(legacyRow).toContainText("Reproducteur");
    await expect(legacyRow).toContainText("Rôle : Reproducteur maison");

    await page.goto(`/animals/${animalId}/edit`);
    const statusSelect = page.getByLabel("Statut administratif");
    await expect(
      statusSelect.locator("option", {
        hasText: "Reproducteur — ancien statut",
      }),
    ).toHaveCount(1);
    await expect(statusSelect).toHaveValue("breeding");
    await statusSelect.selectOption("active");
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page).toHaveURL(`/animals/${animalId}?identity_status=success`);

    let animal = expectSupabaseData(
      await supabase
        .from("animals")
        .select("id, status, is_breeder, is_retired")
        .eq("id", animalId)
        .single(),
      "read normalized legacy breeding animal",
    );
    expect(animal).toMatchObject({
      id: animalId,
      status: "active",
      is_breeder: true,
      is_retired: false,
    });

    await page.goto(`/animals/${animalId}/edit`);
    await page.getByLabel("Statut administratif").selectOption("retired");
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page).toHaveURL(`/animals/${animalId}?identity_status=success`);
    animal = expectSupabaseData(
      await supabase
        .from("animals")
        .select("id, status, is_breeder, is_retired")
        .eq("id", animalId)
        .single(),
      "read retired administrative status animal",
    );
    expect(animal).toMatchObject({
      id: animalId,
      status: "retired",
      is_breeder: true,
      is_retired: true,
    });

    await page.goto(`/animals/${animalId}/edit`);
    await page.getByLabel("Statut administratif").selectOption("active");
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page).toHaveURL(`/animals/${animalId}?identity_status=success`);
    animal = expectSupabaseData(
      await supabase
        .from("animals")
        .select("id, status, is_breeder, is_retired")
        .eq("id", animalId)
        .single(),
      "read unretired administrative status animal",
    );
    expect(animal).toMatchObject({
      id: animalId,
      status: "active",
      is_breeder: true,
      is_retired: false,
    });

    await page.goto(`/animals/${animalId}/edit`);
    await expect(
      page.locator('select[name="status"] option[value="breeding"]'),
    ).toHaveCount(0);
    await page.getByLabel("Nom d’usage").fill(`QA ancien reproducteur forge ${suffix}`);
    await page.locator('select[name="status"]').evaluate((select) => {
      const forgedOption = document.createElement("option");
      forgedOption.value = "reserved";
      forgedOption.textContent = "Réservé forgé";
      select.append(forgedOption);
      (select as HTMLSelectElement).value = forgedOption.value;
    });
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page).toHaveURL(`/animals/${animalId}/edit?status=invalid`);

    animal = expectSupabaseData(
      await supabase
        .from("animals")
        .select("id, call_name, status, is_breeder")
        .eq("id", animalId)
        .single(),
      "read rejected normalized forged-status animal",
    );
    expect(animal).toMatchObject({
      id: animalId,
      call_name: animalName,
      status: "active",
      is_breeder: true,
    });
  } finally {
    await cleanupAnimalManualFixtures(
      "legacy breeding normalization",
      createdAnimalIds,
    );
  }
});

test("edits the full descriptive identity of a manual animal", async ({ page }) => {
  const supabase = await createAuthenticatedSupabaseClient();
  const manualAnimalId = randomUUID();
  const motherId = randomUUID();
  const fatherId = randomUUID();
  const litterAnimalId = randomUUID();
  const litterMotherId = randomUUID();
  const litterFatherId = randomUUID();
  const suffix = manualAnimalId.slice(0, 8);
  const createdAnimalIds = [
    manualAnimalId,
    motherId,
    fatherId,
    litterAnimalId,
    litterMotherId,
    litterFatherId,
  ];

  try {
    const { error: manualInsertError } = await supabase.from("animals").insert([
      {
        id: motherId,
        organization_id: organizationId,
        call_name: `QA edition mere ${suffix}`,
        species: "dog",
        breed: "Golden Retriever",
        sex: "female",
        status: "active",
        ownership_status: "owned",
        is_breeder: true,
        is_external: false,
        is_retired: false,
        created_by: ownerId,
        updated_by: ownerId,
      },
      {
        id: fatherId,
        organization_id: organizationId,
        call_name: `QA edition pere ${suffix}`,
        species: "dog",
        breed: "Golden Retriever",
        sex: "male",
        status: "active",
        ownership_status: "owned",
        is_breeder: true,
        is_external: false,
        is_retired: false,
        created_by: ownerId,
        updated_by: ownerId,
      },
      {
        id: litterMotherId,
        organization_id: organizationId,
        call_name: `QA edition mere portee ${suffix}`,
        species: "dog",
        breed: "Golden Retriever",
        sex: "female",
        status: "active",
        ownership_status: "owned",
        is_breeder: true,
        is_external: false,
        is_retired: false,
        created_by: ownerId,
        updated_by: ownerId,
      },
      {
        id: litterFatherId,
        organization_id: organizationId,
        call_name: `QA edition pere portee ${suffix}`,
        species: "dog",
        breed: "Golden Retriever",
        sex: "male",
        status: "active",
        ownership_status: "owned",
        is_breeder: true,
        is_external: false,
        is_retired: false,
        created_by: ownerId,
        updated_by: ownerId,
      },
      {
        id: manualAnimalId,
        organization_id: organizationId,
        call_name: `QA edition legere ${suffix}`,
        official_name: `QA officiel ancien ${suffix}`,
        species: "dog",
        breed: "Golden Retriever",
        sex: "female",
        status: "active",
        ownership_status: "owned",
        is_breeder: false,
        is_external: false,
        is_retired: false,
        birth_date: "2023-01-10",
        identification_number: "OLD-ID",
        pedigree_url: "https://www.centrale-canine.fr/chien/old-scc",
        lof_number: "OLD-LOF",
        color: "Sable",
        coat_color: "Claire",
        created_by: ownerId,
        updated_by: ownerId,
      },
    ]);

    expect(manualInsertError).toBeNull();

    const { error: litterAnimalInsertError } = await supabase
      .from("animals")
      .insert({
        id: litterAnimalId,
        organization_id: organizationId,
        litter_id: litterId,
        call_name: `QA edition chiot ${suffix}`,
        species: "dog",
        breed: "Golden Retriever",
        sex: "male",
        status: "born",
        ownership_status: "produced",
        is_breeder: false,
        is_external: false,
        is_retired: false,
        birth_date: "2026-04-15",
        mother_id: litterMotherId,
        father_id: litterFatherId,
        created_by: ownerId,
        updated_by: ownerId,
      });

    expect(litterAnimalInsertError).toBeNull();

    await page.goto("/login");
    await page.getByLabel("Email").fill("owner@saasphase1.invalid");
    await page.getByLabel("Mot de passe").fill("LocalDevOwner-2026!");
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page).toHaveURL(/\/candidatures/);

    await page.goto(`/animals/${manualAnimalId}`);
    await page.getByRole("link", { name: "Modifier les informations" }).click();
    await expect(page).toHaveURL(`/animals/${manualAnimalId}/edit`);
    await expect(
      page.getByText("Informations structurelles en lecture seule"),
    ).toHaveCount(0);
    await expect(page.getByText("Animal · Édition légère")).toHaveCount(0);
    await expect(page.getByText("Animal · Modification")).toBeVisible();
    await expect(
      page.getByText("Corrigez les informations descriptives de la fiche de l’animal."),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Modifier la fiche de l’animal" }),
    ).toHaveCount(1);
    await expect(
      page.locator("section, form").filter({
        has: page.getByRole("heading", {
          name: "Modifier la fiche de l’animal",
        }),
      }),
    ).toHaveCount(1);
    await expect(
      page.locator(`select[name="mother_id"] option[value="${manualAnimalId}"]`),
    ).toHaveCount(0);
    await expect(
      page.locator(`select[name="father_id"] option[value="${manualAnimalId}"]`),
    ).toHaveCount(0);
    await expect(page.locator('select[name="mother_id"]')).not.toContainText(
      `QA edition legere ${suffix}`,
    );
    await expect(page.locator('select[name="father_id"]')).not.toContainText(
      `QA edition legere ${suffix}`,
    );
    await expect(page.locator('input[name="official_name"]')).toHaveValue(
      `QA officiel ancien ${suffix}`,
    );
    await page.getByLabel("Nom d’usage").fill(`QA edition modifiee ${suffix}`);
    await page
      .getByLabel("Nom complet")
      .fill(`QA officiel modifie ${suffix}`);
    await page.getByLabel("Espèce").selectOption("cat");
    await page.getByLabel("Race").fill("Maine Coon QA");
    await page.getByLabel("Sexe", { exact: true }).selectOption("male");
    await expect(page.getByLabel("Numéro d’identification")).toHaveValue("OLD-ID");
    await expect(page.getByLabel("Lien vers la page SCC de l’animal")).toHaveValue(
      "https://www.centrale-canine.fr/chien/old-scc",
    );
    await expect(page.getByLabel("Numéro LOF")).toHaveValue("OLD-LOF");
    await expect(page.getByLabel("Robe")).toHaveValue("Claire");
    await expect(page.getByLabel("Couleur", { exact: true })).toHaveCount(0);
    await page.getByLabel("Numéro d’identification").fill("NEW-ID");
    await page
      .getByLabel("Lien vers la page SCC de l’animal")
      .fill("https://www.centrale-canine.fr/chien/new-scc");
    await page.getByLabel("Numéro LOF").fill("LOF-NEW-123");
    await page.getByLabel("Robe").fill("Fauve clair");
    await page.getByLabel("Date de naissance").fill("2023-02-11");
    await page.getByLabel("Mère").selectOption(motherId);
    await page.getByLabel("Père").selectOption(fatherId);
    await page.locator("form").evaluate((form) => {
      for (const [name, value] of [
        ["ownership_status", "adopted_out"],
        ["litter_id", "c0000000-0000-4000-8000-000000000001"],
        ["is_breeder", "yes"],
        ["is_external", "yes"],
        ["is_retired", "yes"],
      ]) {
        const input = document.createElement("input");
        input.name = name;
        input.value = value;
        form.append(input);
      }
    });
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page).toHaveURL(
      `/animals/${manualAnimalId}?identity_status=success`,
    );
    await expect(
      page.getByText("Les informations de l’animal ont été mises à jour."),
    ).toBeVisible();

    const updatedManualAnimal = expectSupabaseData(
      await supabase
        .from("animals")
        .select(
          "call_name, official_name, identification_number, pedigree_url, lof_number, color, coat_color, birth_date, status, ownership_status, sex, species, breed, litter_id, mother_id, father_id, is_breeder, is_external, is_retired",
        )
        .eq("id", manualAnimalId)
        .single(),
      "read updated manual animal",
    );

    expect(updatedManualAnimal).toMatchObject({
      call_name: `QA edition modifiee ${suffix}`,
      official_name: `QA officiel modifie ${suffix}`,
      identification_number: "NEW-ID",
      pedigree_url: "https://www.centrale-canine.fr/chien/new-scc",
      lof_number: "LOF-NEW-123",
      color: "Sable",
      coat_color: "Fauve clair",
      birth_date: "2023-02-11",
      status: "active",
      ownership_status: "owned",
      sex: "male",
      species: "cat",
      breed: "Maine Coon QA",
      litter_id: null,
      mother_id: motherId,
      father_id: fatherId,
      is_breeder: false,
      is_external: false,
      is_retired: false,
    });
    await expect(
      page.locator("section").filter({
        has: page.getByRole("heading", {
          name: "Fiche d’identité",
          exact: true,
        }),
      }),
    ).toContainText("LOF-NEW-123");
    await expect(
      page.locator("section").filter({
        has: page.getByRole("heading", {
          name: "Fiche d’identité",
          exact: true,
        }),
      }),
    ).toContainText("Maine Coon QA");
    await expect(
      page.locator("section").filter({
        has: page.getByRole("heading", {
          name: "Fiche d’identité",
          exact: true,
        }),
      }),
    ).toContainText("Chat");
    await expect(
      page.locator("section").filter({
        has: page.getByRole("heading", {
          name: "Fiche d’identité",
          exact: true,
        }),
      }),
    ).toContainText("Mâle");
    const identitySccLink = page
      .locator("section")
      .filter({
        has: page.getByRole("heading", {
          name: "Fiche d’identité",
          exact: true,
        }),
      })
      .getByRole("link", {
        name: "https://www.centrale-canine.fr/chien/new-scc",
      });
    await expect(identitySccLink).toHaveAttribute(
      "href",
      "https://www.centrale-canine.fr/chien/new-scc",
    );
    await page.goto(`/animals/${manualAnimalId}/edit`);
    await expect(page.getByLabel("Race")).toHaveValue("Maine Coon QA");
    await expect(page.getByLabel("Race")).toHaveAttribute("required", "");
    await page.getByLabel("Nom d’usage").fill(`QA edition race vide ${suffix}`);
    await page.getByLabel("Race").fill("");
    await page.locator("form").evaluate((form) => {
      (form as HTMLFormElement).noValidate = true;
    });
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page).toHaveURL(`/animals/${manualAnimalId}/edit?status=invalid`);
    const rejectedEmptyBreedAnimal = expectSupabaseData(
      await supabase
        .from("animals")
        .select("call_name, breed")
        .eq("id", manualAnimalId)
        .single(),
      "read rejected empty breed animal",
    );
    expect(rejectedEmptyBreedAnimal).toMatchObject({
      call_name: `QA edition modifiee ${suffix}`,
      breed: "Maine Coon QA",
    });

    await page.goto(`/animals/${manualAnimalId}/edit`);
    await page.getByLabel("Nom d’usage").fill(`QA edition statut forge ${suffix}`);
    await page.locator('select[name="status"]').evaluate((select) => {
      const forgedOption = document.createElement("option");
      forgedOption.value = "reserved";
      forgedOption.textContent = "Réservé forgé";
      select.append(forgedOption);
      (select as HTMLSelectElement).value = forgedOption.value;
    });
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page).toHaveURL(`/animals/${manualAnimalId}/edit?status=invalid`);
    const rejectedForgedStatusAnimal = expectSupabaseData(
      await supabase
        .from("animals")
        .select("call_name, status, is_breeder")
        .eq("id", manualAnimalId)
        .single(),
      "read rejected forged-status animal",
    );
    expect(rejectedForgedStatusAnimal).toMatchObject({
      call_name: `QA edition modifiee ${suffix}`,
      status: "active",
      is_breeder: false,
    });

    await page.goto(`/animals/${manualAnimalId}/edit`);
    await page
      .getByLabel("Lien vers la page SCC de l’animal")
      .evaluate((input) => {
        (input as HTMLInputElement).value = "javascript:alert(1)";
      });
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page).toHaveURL(`/animals/${manualAnimalId}/edit?status=invalid`);
    const rejectedUrlAnimal = expectSupabaseData(
      await supabase
        .from("animals")
        .select("pedigree_url, call_name, mother_id, father_id")
        .eq("id", manualAnimalId)
        .single(),
      "read rejected SCC URL animal",
    );
    expect(rejectedUrlAnimal.pedigree_url).toBe(
      "https://www.centrale-canine.fr/chien/new-scc",
    );
    expect(rejectedUrlAnimal.call_name).toBe(`QA edition modifiee ${suffix}`);
    expect(rejectedUrlAnimal.mother_id).toBe(motherId);
    expect(rejectedUrlAnimal.father_id).toBe(fatherId);

    await page.goto(`/animals/${manualAnimalId}/edit`);
    await expect(page.getByLabel("Numéro LOF")).toHaveValue("LOF-NEW-123");
    await expect(page.getByLabel("Robe")).toHaveValue("Fauve clair");
    await expect(page.getByLabel("Lien vers la page SCC de l’animal")).toHaveValue(
      "https://www.centrale-canine.fr/chien/new-scc",
    );
    await page.getByLabel("Nom d’usage").fill(`QA edition same parent ${suffix}`);
    await page.getByLabel("Mère").selectOption(motherId);
    await page.getByLabel("Père").selectOption(motherId);
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page).toHaveURL(`/animals/${manualAnimalId}/edit?status=invalid`);
    let rejectedParentAnimal = expectSupabaseData(
      await supabase
        .from("animals")
        .select("call_name, mother_id, father_id")
        .eq("id", manualAnimalId)
        .single(),
      "read rejected same-parent animal",
    );
    expect(rejectedParentAnimal).toMatchObject({
      call_name: `QA edition modifiee ${suffix}`,
      mother_id: motherId,
      father_id: fatherId,
    });

    await page.goto(`/animals/${manualAnimalId}/edit`);
    await page.getByLabel("Nom d’usage").fill(`QA edition forged parent ${suffix}`);
    await page.locator('select[name="mother_id"]').evaluate((select) => {
      const forgedOption = document.createElement("option");
      forgedOption.value = "c0000000-0000-4000-8000-999999999999";
      forgedOption.textContent = "Parent forge";
      select.append(forgedOption);
      (select as HTMLSelectElement).value = forgedOption.value;
    });
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page).toHaveURL(`/animals/${manualAnimalId}/edit?status=invalid`);
    rejectedParentAnimal = expectSupabaseData(
      await supabase
        .from("animals")
        .select("call_name, mother_id, father_id")
        .eq("id", manualAnimalId)
        .single(),
      "read rejected forged-parent animal",
    );
    expect(rejectedParentAnimal).toMatchObject({
      call_name: `QA edition modifiee ${suffix}`,
      mother_id: motherId,
      father_id: fatherId,
    });

    await page.goto(`/animals/${litterAnimalId}/edit`);
    await expect(page.locator('select[name="status"]')).toHaveCount(0);
    await expect(page.getByText("Statut administratif")).toBeVisible();
    await expect(
      page.getByText(
        "Ce statut est piloté par le parcours de l’animal et se modifie avec les actions dédiées.",
      ),
    ).toBeVisible();
    await page.getByLabel("Nom d’usage").fill(`QA edition statut chiot ${suffix}`);
    await page.locator("form").evaluate((form) => {
      const input = document.createElement("input");
      input.name = "status";
      input.value = "adopted";
      form.append(input);
    });
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page).toHaveURL(`/animals/${litterAnimalId}/edit?status=invalid`);
    const rejectedWorkflowStatusAnimal = expectSupabaseData(
      await supabase
        .from("animals")
        .select("call_name, status")
        .eq("id", litterAnimalId)
        .single(),
      "read rejected workflow-status animal",
    );
    expect(rejectedWorkflowStatusAnimal).toMatchObject({
      call_name: `QA edition chiot ${suffix}`,
      status: "born",
    });

    await page.goto(`/animals/${litterAnimalId}/edit`);
    await expect(page.locator('input[name="birth_date"]')).toHaveCount(0);
    await expect(page.locator('select[name="mother_id"]')).toHaveCount(0);
    await expect(page.locator('select[name="father_id"]')).toHaveCount(0);
    await expect(page.getByText("QA edition mere portee")).toBeVisible();
    await expect(page.getByText("QA edition pere portee")).toBeVisible();
    await expect(
      page.getByText(
        "Ces informations proviennent de la portée liée et doivent être corrigées depuis la fiche de la portée.",
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "fiche de la portée" }),
    ).toHaveAttribute("href", `/litters/${litterId}`);
    await page.getByLabel("Nom d’usage").fill(`QA edition chiot modifie ${suffix}`);
    await page.locator("form").evaluate((form) => {
      for (const [name, value] of [
        ["birth_date", "2026-05-20"],
        ["mother_id", "c0000000-0000-4000-8000-999999999998"],
        ["father_id", "c0000000-0000-4000-8000-999999999997"],
        ["litter_id", ""],
      ]) {
        const input = document.createElement("input");
        input.name = name;
        input.value = value;
        form.append(input);
      }
    });
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page).toHaveURL(
      `/animals/${litterAnimalId}?identity_status=success`,
    );

    const updatedLitterAnimal = expectSupabaseData(
      await supabase
        .from("animals")
        .select("call_name, birth_date, litter_id, mother_id, father_id, status, ownership_status")
        .eq("id", litterAnimalId)
        .single(),
      "read updated litter animal",
    );

    expect(updatedLitterAnimal).toMatchObject({
      call_name: `QA edition chiot modifie ${suffix}`,
      birth_date: "2026-04-15",
      litter_id: litterId,
      mother_id: litterMotherId,
      father_id: litterFatherId,
      status: "born",
      ownership_status: "produced",
    });
  } finally {
    await cleanupAnimalManualFixtures(
      "full descriptive identity edit",
      createdAnimalIds,
    );
  }
});

test("keeps then makes an eligible animal available again", async ({ page }) => {
  test.setTimeout(60_000);

  const supabase = await createAuthenticatedSupabaseClient();
  const animalId = randomUUID();
  const breederAnimalId = randomUUID();
  const suffix = animalId.slice(0, 8);
  const animalName = `QA garder disponible ${suffix}`;
  const breederAnimalName = `QA garder reproducteur ${suffix}`;
  const createdAnimalIds = [animalId, breederAnimalId];

  try {
    const { error: animalInsertError } = await supabase.from("animals").insert({
      id: animalId,
      organization_id: organizationId,
      call_name: animalName,
      species: "dog",
      breed: "Golden Retriever",
      sex: "unknown",
      status: "available",
      ownership_status: "owned",
      is_breeder: false,
      is_external: false,
      is_retired: false,
      created_by: ownerId,
      updated_by: ownerId,
    });

    expect(animalInsertError).toBeNull();

    const { error: breederAnimalInsertError } = await supabase
      .from("animals")
      .insert({
        id: breederAnimalId,
        organization_id: organizationId,
        call_name: breederAnimalName,
        species: "dog",
        breed: "Golden Retriever",
        sex: "female",
        status: "active",
        ownership_status: "owned",
        is_breeder: true,
        is_external: false,
        is_retired: false,
        created_by: ownerId,
        updated_by: ownerId,
      });

    expect(breederAnimalInsertError).toBeNull();

    await page.goto("/login");
    await page.getByLabel("Email").fill("owner@saasphase1.invalid");
    await page.getByLabel("Mot de passe").fill("LocalDevOwner-2026!");
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page).toHaveURL(/\/candidatures/);

    await page.goto(`/animals/${breederAnimalId}`);
    await expect(
      page.getByRole("heading", { name: breederAnimalName }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Garder à l’élevage" }),
    ).toHaveCount(0);
    await expect(page.getByText("Je confirme que cet animal doit rester")).toHaveCount(
      0,
    );

    await page.goto(`/animals/${animalId}`);
    await expect(page.getByRole("heading", { name: animalName })).toBeVisible();
    const statusSection = page.locator("section").filter({
      has: page.getByRole("heading", {
        name: "Fiche d’identité",
        exact: true,
      }),
    });
    await expect(
      page.getByRole("button", { name: "Garder à l’élevage" }),
    ).toBeVisible();

    const keepForm = page.locator("form").filter({
      has: page.getByRole("button", { name: "Garder à l’élevage" }),
    });
    const forgedResponse = await keepForm.evaluate(
      async (form, forgedAnimalId) => {
        const htmlForm = form as HTMLFormElement;
        const formData = new FormData(htmlForm);
        formData.set("animal_id", forgedAnimalId);
        formData.set("confirm_keep_at_kennel", "yes");

        return fetch(htmlForm.action, {
          method: htmlForm.method || "POST",
          body: formData,
        }).then((response) => response.status);
      },
      breederAnimalId,
    );
    expect(forgedResponse).toBeGreaterThanOrEqual(200);

    const forgedBreederAnimal = expectSupabaseData(
      await supabase
        .from("animals")
        .select("id, status, is_breeder")
        .eq("id", breederAnimalId)
        .single(),
      "read forged keep breeder animal",
    );
    expect(forgedBreederAnimal).toMatchObject({
      id: breederAnimalId,
      status: "active",
      is_breeder: true,
    });

    await page.locator("#confirm-keep-at-kennel").check();
    await page.getByRole("button", { name: "Garder à l’élevage" }).click();
    await expect(page).toHaveURL(
      new RegExp(`/animals/${animalId}.*keep_at_kennel_status=success`),
    );
    await expect(
      page.getByText("L’animal est maintenant gardé à l’élevage."),
    ).toBeVisible();
    await expect(statusSection).toContainText("Gardé à l’élevage");
    await expect(
      page.getByRole("button", { name: "Remettre disponible" }),
    ).toBeVisible();

    let animal = expectSupabaseData(
      await supabase
        .from("animals")
        .select("id, status")
        .eq("id", animalId)
        .single(),
      "read kept animal",
    );
    expect(animal).toMatchObject({ id: animalId, status: "kept" });

    await page.goto("/cheptel");
    const keptSection = page.locator("section.rounded-2xl").filter({
      has: page.getByRole("heading", {
        name: "Restent à l’élevage",
        exact: true,
      }),
    });
    await expect(keptSection).toContainText(animalName);

    await page.goto(`/animals/${animalId}`);
    await page.locator("#confirm-make-available").check();
    await page.getByRole("button", { name: "Remettre disponible" }).click();
    await expect(page).toHaveURL(
      new RegExp(`/animals/${animalId}.*make_available_status=success`),
    );
    await expect(page.getByText("L’animal est maintenant disponible.")).toBeVisible();
    await expect(statusSection).toContainText("Disponible");
    await expect(
      page.getByRole("button", { name: "Garder à l’élevage" }),
    ).toBeVisible();

    animal = expectSupabaseData(
      await supabase
        .from("animals")
        .select("id, status")
        .eq("id", animalId)
        .single(),
      "read available animal",
    );
    expect(animal).toMatchObject({ id: animalId, status: "available" });

    await page.goto("/cheptel");
    await expect(keptSection).not.toContainText(animalName);
  } finally {
    await cleanupAnimalManualFixtures("keep and make available", createdAnimalIds);
  }
});

test("promotes an eligible identified adult female to home breeder", async ({
  page,
}) => {
  test.setTimeout(60_000);

  const supabase = await createAuthenticatedSupabaseClient();
  const animalId = randomUUID();
  const suffix = animalId.slice(0, 8);
  const animalName = `QA promotion repro maison ${suffix}`;
  const createdAnimalIds = [animalId];

  try {
    const { error: animalInsertError } = await supabase.from("animals").insert({
      id: animalId,
      organization_id: organizationId,
      call_name: animalName,
      species: "dog",
      breed: "Golden Retriever",
      sex: "female",
      status: "kept",
      ownership_status: "owned",
      birth_date: "2024-01-10",
      identification_number: `QA-ID-${suffix}`,
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

    await page.goto(`/animals/${animalId}`);
    await expect(page.getByRole("heading", { name: animalName })).toBeVisible();

    const promotionForm = page.locator("form").filter({
      has: page.getByRole("button", {
        name: "Promouvoir en reproductrice maison",
      }),
    });
    await expect(
      page.getByRole("button", { name: "Promouvoir en reproductrice maison" }),
    ).toBeVisible();
    await expect(promotionForm).toContainText("LOF");
    await expect(promotionForm).toContainText("confirmation");
    await expect(promotionForm).toContainText("radios hanches-coudes");
    await expect(promotionForm).toContainText("tests ADN");

    await page.locator("#confirm-home-breeder-promotion").check();
    await page
      .getByRole("button", { name: "Promouvoir en reproductrice maison" })
      .click();
    await expect(page).toHaveURL(
      new RegExp(`/animals/${animalId}.*home_breeder_promotion_status=success`),
    );
    await expect(
      page.getByText("L’animal est maintenant reproductrice maison."),
    ).toBeVisible();

    const statusSection = page.locator("section").filter({
      has: page.getByRole("heading", {
        name: "Fiche d’identité",
        exact: true,
      }),
    });
    await expect(
      statusSection.locator("div").filter({ hasText: "Reproducteur" }),
    ).toContainText("Oui");

    const promotedAnimal = expectSupabaseData(
      await supabase
        .from("animals")
        .select("id, is_breeder")
        .eq("id", animalId)
        .single(),
      "read promoted home breeder",
    );
    expect(promotedAnimal).toMatchObject({ id: animalId, is_breeder: true });

    await page.goto("/cheptel");
    const homeFemalesSection = page.locator("section.rounded-2xl").filter({
      has: page.getByRole("heading", {
        name: "Reproductrices",
        exact: true,
      }),
    });
    await expect(homeFemalesSection).toContainText(animalName);
  } finally {
    await cleanupAnimalManualFixtures("home breeder promotion", createdAnimalIds);
  }
});

test("shows an empty health section on animal detail", async ({
  page,
}) => {
  const supabase = await createAuthenticatedSupabaseClient();
  const animalId = randomUUID();
  const suffix = animalId.slice(0, 8);
  const createdAnimalIds = [animalId];

  try {
    const { error: animalInsertError } = await supabase.from("animals").insert({
      id: animalId,
      organization_id: organizationId,
      call_name: `QA sante vide ${suffix}`,
      species: "dog",
      breed: "Golden Retriever",
      sex: "female",
      status: "active",
      ownership_status: "owned",
      created_by: ownerId,
      updated_by: ownerId,
    });

    expect(animalInsertError).toBeNull();

    await page.goto("/login");
    await page.getByLabel("Email").fill("owner@saasphase1.invalid");
    await page.getByLabel("Mot de passe").fill("LocalDevOwner-2026!");
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page).toHaveURL(/\/candidatures/);

    await page.goto(`/animals/${animalId}`);
    await expect(
      page.getByRole("heading", { name: `QA sante vide ${suffix}` }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Santé", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Aucune donnée santé clairement identifiable pour cet animal."),
    ).toBeVisible();
  } finally {
    await cleanupAnimalManualFixtures("empty health section", createdAnimalIds);
  }
});

test("creates a health event from an animal detail page", async ({ page }) => {
  const supabase = await createAuthenticatedSupabaseClient();
  const animalId = randomUUID();
  const suffix = animalId.slice(0, 8);
  const eventTitle = `Vaccination animal e2e ${suffix}`;
  const createdAnimalIds = [animalId];

  try {
    const { error: animalInsertError } = await supabase.from("animals").insert({
      id: animalId,
      organization_id: organizationId,
      call_name: `QA evenement sante ${suffix}`,
      species: "dog",
      breed: "Golden Retriever",
      sex: "female",
      status: "active",
      ownership_status: "owned",
      created_by: ownerId,
      updated_by: ownerId,
    });

    expect(animalInsertError).toBeNull();

    await page.goto("/login");
    await page.getByLabel("Email").fill("owner@saasphase1.invalid");
    await page.getByLabel("Mot de passe").fill("LocalDevOwner-2026!");
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page).toHaveURL(/\/candidatures/);

    await page.goto(`/animals/${animalId}#sante`);

    const healthSection = page.locator("#sante");
    await expect(
      healthSection.getByRole("heading", { name: "Santé", exact: true }),
    ).toBeVisible();
    await expect(
      healthSection.getByRole("heading", { name: "Ajouter un événement santé" }),
    ).toBeVisible();

    await healthSection.locator("#animal-health-event-title").fill(eventTitle);
    await healthSection.locator("#animal-health-event-date").fill("2026-06-30");
    await healthSection
      .locator("#animal-health-event-type")
      .selectOption("vaccination");
    await healthSection
      .locator("#animal-health-event-status")
      .selectOption("planned");
    await healthSection
      .locator("#animal-health-event-priority")
      .selectOption("normal");
    await healthSection
      .locator("#animal-health-event-description")
      .fill("Evenement sante cree depuis le test e2e.");

    await healthSection
      .getByRole("button", { name: "Ajouter l’événement" })
      .click();

    await expect(page).toHaveURL(
      new RegExp(`/animals/${animalId}.*health_event_status=success`),
    );
    await expect(page).toHaveURL(/#sante/);
    await expect(healthSection).toContainText("L’événement santé a été ajouté.");
    await expect(
      healthSection.getByRole("heading", { name: "Événements santé" }),
    ).toBeVisible();
    await expect(healthSection).toContainText(eventTitle);
    await expect(healthSection).toContainText("Type : vaccination");
    await expect(healthSection).toContainText("planned");
    await expect(healthSection).toContainText("Date utile : 30 juin 2026");
    await expect(healthSection).toContainText(
      "Evenement sante cree depuis le test e2e.",
    );
  } finally {
    await cleanupAnimalManualFixtures("health event creation", createdAnimalIds);
  }
});
