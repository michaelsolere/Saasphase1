import { expect, test, type Page } from "@playwright/test";

import { getLitterJournalBusinessDateParts } from "@/features/litter-journal/date";
import { isUpcoming } from "@/features/litter-journal/loader";
import { getLitterJournalContextualAge } from "@/features/litter-journal/stage";
import type {
  LitterJournalDetails,
  LitterJournalListItem,
} from "@/features/litter-journal/types";

import {
  E2E_OWNER_EMAIL,
  E2E_OWNER_PASSWORD,
  runE2eSqlSync,
} from "./helpers/supabase";

test.setTimeout(180_000);

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const ownerMembershipId = "30000000-0000-4000-8000-000000000001";
const fixturePrefix = "E2E litter journal";
const ids = {
  mother: "9f180004-0000-4000-8000-000000000001",
  father: "9f180004-0000-4000-8000-000000000002",
  puppyOne: "9f180004-0000-4000-8000-000000000003",
  puppyTwo: "9f180004-0000-4000-8000-000000000004",
  contact: "9f180004-0000-4000-8000-000000000005",
  upcoming: "9f180004-0000-4000-8000-000000000010",
  later: "9f180004-0000-4000-8000-000000000011",
  mated: "9f180004-0000-4000-8000-000000000012",
  born: "9f180004-0000-4000-8000-000000000013",
  closed: "9f180004-0000-4000-8000-000000000014",
  cancelled: "9f180004-0000-4000-8000-000000000015",
  notPregnant: "9f180004-0000-4000-8000-000000000016",
  reservationOne: "9f180004-0000-4000-8000-000000000020",
  reservationTwo: "9f180004-0000-4000-8000-000000000021",
  otherOrganization: "9f180004-0000-4000-8000-000000000090",
  foreignMother: "9f180004-0000-4000-8000-000000000091",
  foreignLitter: "9f180004-0000-4000-8000-000000000092",
} as const;

function q(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function sql(statement: string) {
  return runE2eSqlSync(statement);
}

function idsSql(values: readonly string[]) {
  return values.map((id) => `${q(id)}::uuid`).join(", ");
}

const localLitterIds = [
  ids.upcoming,
  ids.later,
  ids.mated,
  ids.born,
  ids.closed,
  ids.cancelled,
  ids.notPregnant,
] as const;

const midnightParisInstant = new Date("2026-07-18T22:30:00.000Z");

let originalOrganizationLitterStatuses: Array<{ id: string; status: string }> = [];

function cleanup() {
  sql(`
    delete from public.reservations
    where id in (${idsSql([ids.reservationOne, ids.reservationTwo])})
       or internal_comment like ${q(`${fixturePrefix}%`)};

    delete from public.animals
    where litter_id in (${idsSql(localLitterIds)})
       or id in (${idsSql([ids.puppyOne, ids.puppyTwo])});

    delete from public.litters
    where id in (${idsSql([...localLitterIds, ids.foreignLitter])})
       or name like ${q(`${fixturePrefix}%`)};

    delete from public.contacts
    where id = ${q(ids.contact)}::uuid
       or display_name like ${q(`${fixturePrefix}%`)};

    delete from public.animals
    where id in (${idsSql([ids.mother, ids.father, ids.foreignMother])});

    delete from public.organizations where id = ${q(ids.otherOrganization)}::uuid;

    set session_replication_role = replica;
    update public.memberships set role = 'owner'
    where id = ${q(ownerMembershipId)}::uuid
      and organization_id = ${q(organizationId)}::uuid
      and profile_id = ${q(ownerId)}::uuid;
    set session_replication_role = origin;
  `);
}

function remainingFixtureCounts() {
  return JSON.parse(
    sql(`
      select json_build_object(
        'reservations', (
          select count(*) from public.reservations
          where id in (${idsSql([ids.reservationOne, ids.reservationTwo])})
             or internal_comment like ${q(`${fixturePrefix}%`)}
        ),
        'litters', (
          select count(*) from public.litters
          where id in (${idsSql([...localLitterIds, ids.foreignLitter])})
             or name like ${q(`${fixturePrefix}%`)}
        ),
        'animals', (
          select count(*) from public.animals
          where id in (${idsSql([ids.mother, ids.father, ids.puppyOne, ids.puppyTwo, ids.foreignMother])})
             or litter_id in (${idsSql(localLitterIds)})
        ),
        'contacts', (
          select count(*) from public.contacts
          where id = ${q(ids.contact)}::uuid
             or display_name like ${q(`${fixturePrefix}%`)}
        ),
        'organizations', (
          select count(*) from public.organizations
          where id = ${q(ids.otherOrganization)}::uuid
        ),
        'events', (
          select count(*) from public.events
          where litter_id in (${idsSql(localLitterIds)})
             or animal_id in (${idsSql([ids.mother, ids.father, ids.puppyOne, ids.puppyTwo])})
        ),
        'notes', (
          select count(*) from public.notes
          where litter_id in (${idsSql(localLitterIds)})
             or animal_id in (${idsSql([ids.mother, ids.father, ids.puppyOne, ids.puppyTwo])})
        ),
        'documents', (
          select count(*) from public.documents
          where litter_id in (${idsSql(localLitterIds)})
             or animal_id in (${idsSql([ids.mother, ids.father, ids.puppyOne, ids.puppyTwo])})
        ),
        'payments', (
          select count(*) from public.payments
          where reservation_id in (${idsSql([ids.reservationOne, ids.reservationTwo])})
        ),
        'membership_role_changes', (
          select count(*) from public.memberships
          where id = ${q(ownerMembershipId)}::uuid and role <> 'owner'
        )
      )::text;
    `),
  ) as Record<string, number>;
}

function expectCleanupAtZero() {
  const remaining = remainingFixtureCounts();
  for (const [table, count] of Object.entries(remaining)) {
    expect(count, `${table} fixtures must be hard-deleted or restored`).toBe(0);
  }
  return remaining;
}

function createFixtures() {
  sql(`
    insert into public.organizations (id, name, slug)
    values (${q(ids.otherOrganization)}::uuid, 'Organisation E2E journal isolée', 'e2e-journal-isolee');

    insert into public.animals (
      id, organization_id, call_name, species, breed, sex, status,
      ownership_status, is_breeder, created_by, updated_by
    ) values
      (${q(ids.mother)}::uuid, ${q(organizationId)}::uuid, 'Mère Journal E2E', 'dog', 'Golden Retriever', 'female', 'breeding', 'owned', true, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.father)}::uuid, ${q(organizationId)}::uuid, 'Père Journal E2E', 'dog', 'Golden Retriever', 'male', 'breeding', 'owned', true, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.foreignMother)}::uuid, ${q(ids.otherOrganization)}::uuid, 'Mère étrangère Journal E2E', 'dog', 'Golden Retriever', 'female', 'breeding', 'owned', true, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);

    insert into public.litters (
      id, organization_id, name, species, breed, mother_id, father_id, status,
      mating_date, mating_date_2, estimated_ovulation_date, expected_birth_date,
      actual_birth_date, pregnancy_confirmed_at, pregnancy_confirmation_method,
      expected_puppy_count, born_total_count, alive_count, created_by, updated_by
    ) values
      (${q(ids.upcoming)}::uuid, ${q(organizationId)}::uuid, '${fixturePrefix} échéance proche', 'dog', 'Golden Retriever', ${q(ids.mother)}::uuid, ${q(ids.father)}::uuid, 'pregnancy_confirmed', current_date - 21, current_date - 19, current_date - 20, current_date + 2, null, current_date - 7, 'Échographie', 8, null, null, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.later)}::uuid, ${q(organizationId)}::uuid, '${fixturePrefix} échéance ultérieure', 'dog', 'Golden Retriever', ${q(ids.mother)}::uuid, ${q(ids.father)}::uuid, 'birth_expected', current_date - 17, null, null, current_date + 7, null, null, null, 7, null, null, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.mated)}::uuid, ${q(organizationId)}::uuid, '${fixturePrefix} saillie', 'dog', 'Golden Retriever', ${q(ids.mother)}::uuid, ${q(ids.father)}::uuid, 'mating_done', current_date - 10, null, null, null, null, null, null, null, null, null, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.born)}::uuid, ${q(organizationId)}::uuid, '${fixturePrefix} née', 'dog', 'Golden Retriever', ${q(ids.mother)}::uuid, ${q(ids.father)}::uuid, 'born', current_date - 70, null, null, current_date - 7, current_date - 3, current_date - 45, 'Échographie', null, 2, 2, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.closed)}::uuid, ${q(organizationId)}::uuid, '${fixturePrefix} clôturée', 'dog', 'Golden Retriever', ${q(ids.mother)}::uuid, ${q(ids.father)}::uuid, 'closed', null, null, null, null, null, null, null, null, null, null, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.cancelled)}::uuid, ${q(organizationId)}::uuid, '${fixturePrefix} annulée', 'dog', 'Golden Retriever', ${q(ids.mother)}::uuid, ${q(ids.father)}::uuid, 'cancelled', null, null, null, null, null, null, null, null, null, null, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.notPregnant)}::uuid, ${q(organizationId)}::uuid, '${fixturePrefix} non gestante', 'dog', 'Golden Retriever', ${q(ids.mother)}::uuid, ${q(ids.father)}::uuid, 'not_pregnant', null, null, null, null, null, null, null, null, null, null, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.foreignLitter)}::uuid, ${q(ids.otherOrganization)}::uuid, '${fixturePrefix} étrangère', 'dog', 'Golden Retriever', ${q(ids.foreignMother)}::uuid, null, 'birth_expected', null, null, null, current_date + 1, null, null, null, null, null, null, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);

    insert into public.animals (
      id, organization_id, call_name, species, breed, sex, status, ownership_status,
      litter_id, mother_id, father_id, created_by, updated_by
    ) values
      (${q(ids.puppyOne)}::uuid, ${q(organizationId)}::uuid, 'Chiot Journal E2E 1', 'dog', 'Golden Retriever', 'female', 'born', 'produced', ${q(ids.born)}::uuid, ${q(ids.mother)}::uuid, ${q(ids.father)}::uuid, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.puppyTwo)}::uuid, ${q(organizationId)}::uuid, 'Chiot Journal E2E 2', 'dog', 'Golden Retriever', 'male', 'born', 'produced', ${q(ids.born)}::uuid, ${q(ids.mother)}::uuid, ${q(ids.father)}::uuid, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);

    insert into public.contacts (id, organization_id, display_name, created_by, updated_by)
    values (${q(ids.contact)}::uuid, ${q(organizationId)}::uuid, '${fixturePrefix} contact', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);

    insert into public.reservations (
      id, organization_id, contact_id, litter_id, species, breed, status,
      internal_comment, created_by, updated_by
    ) values
      (${q(ids.reservationOne)}::uuid, ${q(organizationId)}::uuid, ${q(ids.contact)}::uuid, ${q(ids.upcoming)}::uuid, 'dog', 'Golden Retriever', 'active', '${fixturePrefix} reservation 1', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.reservationTwo)}::uuid, ${q(organizationId)}::uuid, ${q(ids.contact)}::uuid, ${q(ids.upcoming)}::uuid, 'dog', 'Golden Retriever', 'active', '${fixturePrefix} reservation 2', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);
  `);
}

function setOwnerRole(role: "owner" | "viewer") {
  sql(`
    set session_replication_role = replica;
    update public.memberships set role = ${q(role)}
    where id = ${q(ownerMembershipId)}::uuid
      and organization_id = ${q(organizationId)}::uuid
      and profile_id = ${q(ownerId)}::uuid;
    set session_replication_role = origin;
  `);
}

function snapshotOrganizationLitterStatuses() {
  originalOrganizationLitterStatuses = JSON.parse(
    sql(`
      select coalesce(
        json_agg(json_build_object('id', id::text, 'status', status) order by id),
        '[]'::json
      )::text
      from public.litters
      where organization_id = ${q(organizationId)}::uuid;
    `),
  ) as Array<{ id: string; status: string }>;
}

function restoreOrganizationLitterStatuses() {
  for (const litter of originalOrganizationLitterStatuses) {
    sql(`update public.litters set status = ${q(litter.status)} where id = ${q(litter.id)}::uuid;`);
  }
}

function journalDataState() {
  return JSON.parse(
    sql(`
      select json_build_object(
        'litters', (select count(*) from public.litters where id in (${idsSql(localLitterIds)})),
        'animals', (select count(*) from public.animals where id in (${idsSql([ids.mother, ids.father, ids.puppyOne, ids.puppyTwo])})),
        'reservations', (select count(*) from public.reservations where id in (${idsSql([ids.reservationOne, ids.reservationTwo])})),
        'events', (select count(*) from public.events where litter_id in (${idsSql(localLitterIds)})),
        'notes', (select count(*) from public.notes where litter_id in (${idsSql(localLitterIds)})),
        'documents', (select count(*) from public.documents where litter_id in (${idsSql(localLitterIds)}))
      )::text;
    `),
  );
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_OWNER_EMAIL);
  await page.getByLabel("Mot de passe").fill(E2E_OWNER_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).not.toHaveURL(/\/login$/, { timeout: 30_000 });
}

function journalLitterForDateTest(
  actualBirthDate: string | null,
): LitterJournalListItem {
  return {
    id: "litter-date-test",
    name: "Portée date test",
    species: "dog",
    breed: "Golden Retriever",
    status: "born",
    mother_id: null,
    mother_display_name: null,
    father_id: null,
    father_display_name: null,
    expected_birth_date: null,
    actual_birth_date: actualBirthDate,
    expected_puppy_count: null,
    born_total_count: null,
    alive_count: null,
    animal_count: null,
    reservation_count: null,
    created_at: null,
  };
}

test("utilise le jour civil Europe/Paris après minuit, même lorsque UTC est encore la veille", () => {
  expect(getLitterJournalBusinessDateParts(midnightParisInstant)).toEqual({
    year: 2026,
    month: 7,
    day: 19,
  });

  expect(
    getLitterJournalContextualAge(
      journalLitterForDateTest("2026-07-18"),
      null,
      midnightParisInstant,
    ),
  ).toBe("J+1 depuis la naissance");

  const beforeBirthLitter = journalLitterForDateTest(null);
  const ovulationDetails: LitterJournalDetails = {
    id: "litter-date-test",
    mating_date: null,
    mating_date_2: null,
    estimated_ovulation_date: "2026-07-18",
    pregnancy_confirmed_at: null,
    pregnancy_confirmation_method: null,
  };
  expect(
    getLitterJournalContextualAge(
      beforeBirthLitter,
      ovulationDetails,
      midnightParisInstant,
    ),
  ).toBe("J+1 depuis l’ovulation estimée");

  const matingDetails: LitterJournalDetails = {
    ...ovulationDetails,
    estimated_ovulation_date: null,
    mating_date: "2026-07-18",
  };
  expect(
    getLitterJournalContextualAge(
      beforeBirthLitter,
      matingDetails,
      midnightParisInstant,
    ),
  ).toBe("J+1 depuis la première saillie");

  expect(isUpcoming("2026-07-18", midnightParisInstant)).toBe(false);
  expect(isUpcoming("2026-07-19", midnightParisInstant)).toBe(true);
});

test("affiche le cockpit journal actif en lecture seule sans divulguer les autres organisations", async ({ page }) => {
  cleanup();
  expectCleanupAtZero();

  try {
    createFixtures();
    const beforeReadOnlyNavigation = journalDataState();
    await login(page);

    await page.goto("/litters");
    await expect(page.getByRole("link", { name: "Journal des portées" })).toBeVisible();
    await page.getByRole("link", { name: "Journal des portées" }).click();
    await expect(page).toHaveURL(/\/litters\/journal$/, { timeout: 30_000 });

    const selector = page.getByLabel("Portée affichée");
    await expect(selector).toHaveValue(ids.upcoming);
    await expect(
      selector.getByRole("option").filter({ hasText: fixturePrefix }),
    ).toHaveCount(4);
    await expect(selector).toContainText("échéance proche");
    await expect(selector).toContainText("échéance ultérieure");
    await expect(selector).toContainText("saillie");
    await expect(selector).toContainText("née");
    await expect(selector).not.toContainText("clôturée");
    await expect(selector).not.toContainText("annulée");
    await expect(selector).not.toContainText("non gestante");
    await expect(selector).not.toContainText("étrangère");

    await expect(page.getByRole("heading", { name: `${fixturePrefix} échéance proche` })).toBeVisible();
    await expect(page.getByText("Mère Journal E2E")).toBeVisible();
    await expect(page.getByText("Père Journal E2E")).toBeVisible();
    await expect(page.getByText("Gestation confirmée")).toBeVisible();
    await expect(page.getByText("J+20 depuis l’ovulation estimée")).toBeVisible();
    await expect(page.getByText("Repère indicatif, non diagnostique.")).toBeVisible();
    await expect(page.getByText("Échographie")).toBeVisible();
    await expect(page.getByText("8", { exact: true })).toBeVisible();
    await expect(page.getByText("2", { exact: true })).toHaveCount(1);
    await expect(page.getByText("Non renseigné").first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Ouvrir la fiche de la portée" })).toHaveAttribute("href", `/litters/${ids.upcoming}`);
    await expect(page.getByRole("link", { name: "Reproduction de la mère" })).toHaveAttribute("href", `/animals/${ids.mother}/reproduction`);
    await expect(page.getByRole("link", { name: "Fiche de la mère" })).toHaveAttribute("href", `/animals/${ids.mother}`);
    await expect(page.getByRole("link", { name: "Fiche du père" })).toHaveAttribute("href", `/animals/${ids.father}`);
    await expect(page.getByRole("heading", { name: "Contexte reproductif" })).toHaveCount(1);
    await expect(page.getByRole("heading", { name: "Synthèse de la portée" })).toHaveCount(1);

    await selector.selectOption(ids.mated);
    await expect(page).toHaveURL(new RegExp(`\\?litter=${ids.mated}$`));
    await expect(page.getByText("J+10 depuis la première saillie")).toBeVisible();
    await expect(page.getByText("Saillie réalisée")).toBeVisible();

    await page.goto(`/litters/journal?litter=${ids.born}`);
    await expect(page.getByRole("heading", { name: `${fixturePrefix} née` })).toBeVisible();
    await expect(page.getByText("J+3 depuis la naissance")).toBeVisible();
    await expect(page.getByText("Chiots nés")).toBeVisible();

    await page.goto(`/litters/journal?litter=${ids.foreignLitter}`);
    await expect(page.getByRole("heading", { name: `${fixturePrefix} échéance proche` })).toBeVisible();
    await expect(page.getByText("étrangère")).toHaveCount(0);
    await page.goto("/litters/journal?litter=00000000-0000-4000-8000-000000000099");
    await expect(page.getByRole("heading", { name: `${fixturePrefix} échéance proche` })).toBeVisible();

    setOwnerRole("viewer");
    await page.goto(`/litters/journal?litter=${ids.upcoming}`);
    await expect(page.getByRole("heading", { name: `${fixturePrefix} échéance proche` })).toBeVisible();
    await expect(page.getByText("Gestation confirmée")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Créer|Enregistrer|Modifier|Supprimer/ }),
    ).toHaveCount(0);

    await page.setViewportSize({ width: 375, height: 812 });
    await page.reload();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);

    expect(journalDataState()).toEqual(beforeReadOnlyNavigation);

    setOwnerRole("owner");
    snapshotOrganizationLitterStatuses();
    sql(`update public.litters set status = 'closed' where organization_id = ${q(organizationId)}::uuid;`);
    await page.goto("/litters/journal");
    await expect(page.getByRole("heading", { name: "Aucune portée active" })).toBeVisible();
    restoreOrganizationLitterStatuses();
  } finally {
    const fixtureIds = { ...ids };
    restoreOrganizationLitterStatuses();
    cleanup();
    const remaining = expectCleanupAtZero();
    console.info(JSON.stringify({
      fixtureCleanup: {
        created: fixtureIds,
        deleted: "hard-delete in dependency order; owner membership role restored",
        remaining,
      },
    }));
  }
});
