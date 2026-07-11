import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { expect, test, type Page } from "@playwright/test";

const execFileAsync = promisify(execFile);

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";

const qaContacts = [
  {
    id: "71000000-0000-4000-8000-000000000101",
    firstName: "QA Statut",
    lastName: "New",
    displayName: "QA Statut New",
    email: "qa-dashboard-new@example.invalid",
  },
  {
    id: "71000000-0000-4000-8000-000000000102",
    firstName: "QA Statut",
    lastName: "Review",
    displayName: "QA Statut Review",
    email: "qa-dashboard-review@example.invalid",
  },
  {
    id: "71000000-0000-4000-8000-000000000103",
    firstName: "QA Statut",
    lastName: "Call",
    displayName: "QA Statut Call",
    email: "qa-dashboard-call@example.invalid",
  },
  {
    id: "71000000-0000-4000-8000-000000000104",
    firstName: "QA Arrhes",
    lastName: "Custom",
    displayName: "QA Arrhes Custom",
    email: "qa-dashboard-arrhes@example.invalid",
  },
] as const;

const candidateApplications = [
  {
    id: "81000000-0000-4000-8000-000000000101",
    contactId: qaContacts[0].id,
    status: "new",
    name: qaContacts[0].displayName,
  },
  {
    id: "81000000-0000-4000-8000-000000000102",
    contactId: qaContacts[1].id,
    status: "to_review",
    name: qaContacts[1].displayName,
  },
  {
    id: "81000000-0000-4000-8000-000000000103",
    contactId: qaContacts[2].id,
    status: "to_call",
    name: qaContacts[2].displayName,
  },
] as const;

const depositApplication = {
  id: "81000000-0000-4000-8000-000000000104",
  contactId: qaContacts[3].id,
  status: "qualified",
  name: qaContacts[3].displayName,
} as const;

const qaReservationId = "91000000-0000-4000-8000-000000000101";
const qaPaymentId = "a1000000-0000-4000-8000-000000000101";

const qaContactIds = qaContacts.map((contact) => contact.id);
const qaApplicationIds = [
  ...candidateApplications.map((application) => application.id),
  depositApplication.id,
];
const qaReservationIds = [qaReservationId];
const qaPaymentIds = [qaPaymentId];

type SettingsSnapshot = {
  default_pre_reservation_deposit_cents: number;
  default_arrhes_second_payment_cents: number;
  updated_at: string;
};

type CleanupReport = {
  settings_restored: boolean;
  qa_contacts: number;
  qa_applications: number;
  qa_reservations: number;
  qa_payments: number;
};

function sqlUuidArray(ids: readonly string[]) {
  return `array[${ids.map((id) => `'${id}'::uuid`).join(", ")}]`;
}

function sqlString(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

async function runSql<T>(sql: string) {
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

  return stdout.trim() ? (JSON.parse(stdout.trim()) as T) : null;
}

async function deleteQaRows() {
  await runSql<null>(`
begin;

delete from public.payments
where id = any(${sqlUuidArray(qaPaymentIds)});

delete from public.reservations
where id = any(${sqlUuidArray(qaReservationIds)});

delete from public.applications
where id = any(${sqlUuidArray(qaApplicationIds)});

delete from public.contacts
where id = any(${sqlUuidArray(qaContactIds)});

commit;
`);
}

async function prepareFixture() {
  await deleteQaRows();

  return runSql<SettingsSnapshot>(`
begin;
set local session_replication_role = replica;

with original_settings as (
  select
    default_pre_reservation_deposit_cents,
    default_arrhes_second_payment_cents,
    updated_at
  from public.organization_settings
  where organization_id = '${organizationId}'::uuid
),
settings_update as (
  update public.organization_settings
  set
    default_pre_reservation_deposit_cents = 40000,
    default_arrhes_second_payment_cents = 35000
  where organization_id = '${organizationId}'::uuid
  returning id
),
contacts_insert as (
  insert into public.contacts (
    id,
    organization_id,
    contact_type,
    first_name,
    last_name,
    display_name,
    email,
    phone,
    country,
    origin_channel,
    primary_status,
    internal_comment,
    last_interaction_at,
    created_at,
    updated_at,
    created_by,
    updated_by
  )
  values
    (
      '${qaContacts[0].id}'::uuid,
      '${organizationId}'::uuid,
      'person',
      ${sqlString(qaContacts[0].firstName)},
      ${sqlString(qaContacts[0].lastName)},
      ${sqlString(qaContacts[0].displayName)},
      ${sqlString(qaContacts[0].email)},
      '+33900000101',
      'FR',
      'manual',
      'active',
      'QA dashboard attention candidate new',
      '2026-07-11 08:01:00+00',
      '2026-07-11 08:01:00+00',
      '2026-07-11 08:01:00+00',
      '${ownerId}'::uuid,
      '${ownerId}'::uuid
    ),
    (
      '${qaContacts[1].id}'::uuid,
      '${organizationId}'::uuid,
      'person',
      ${sqlString(qaContacts[1].firstName)},
      ${sqlString(qaContacts[1].lastName)},
      ${sqlString(qaContacts[1].displayName)},
      ${sqlString(qaContacts[1].email)},
      '+33900000102',
      'FR',
      'manual',
      'active',
      'QA dashboard attention candidate to_review',
      '2026-07-11 08:02:00+00',
      '2026-07-11 08:02:00+00',
      '2026-07-11 08:02:00+00',
      '${ownerId}'::uuid,
      '${ownerId}'::uuid
    ),
    (
      '${qaContacts[2].id}'::uuid,
      '${organizationId}'::uuid,
      'person',
      ${sqlString(qaContacts[2].firstName)},
      ${sqlString(qaContacts[2].lastName)},
      ${sqlString(qaContacts[2].displayName)},
      ${sqlString(qaContacts[2].email)},
      '+33900000103',
      'FR',
      'manual',
      'active',
      'QA dashboard attention candidate to_call',
      '2026-07-11 08:03:00+00',
      '2026-07-11 08:03:00+00',
      '2026-07-11 08:03:00+00',
      '${ownerId}'::uuid,
      '${ownerId}'::uuid
    ),
    (
      '${qaContacts[3].id}'::uuid,
      '${organizationId}'::uuid,
      'person',
      ${sqlString(qaContacts[3].firstName)},
      ${sqlString(qaContacts[3].lastName)},
      ${sqlString(qaContacts[3].displayName)},
      ${sqlString(qaContacts[3].email)},
      '+33900000104',
      'FR',
      'manual',
      'active',
      'QA dashboard attention deposit threshold',
      '2026-07-11 08:04:00+00',
      '2026-07-11 08:04:00+00',
      '2026-07-11 08:04:00+00',
      '${ownerId}'::uuid,
      '${ownerId}'::uuid
    )
  returning id
),
applications_insert as (
  insert into public.applications (
    id,
    organization_id,
    contact_id,
    species,
    breed,
    desired_period,
    desired_sex_preference,
    desired_quantity,
    project_description,
    internal_comment,
    housing_type,
    has_garden,
    garden_fenced,
    adults_count,
    status,
    submitted_at,
    created_at,
    updated_at,
    created_by,
    updated_by
  )
  values
    (
      '${candidateApplications[0].id}'::uuid,
      '${organizationId}'::uuid,
      '${candidateApplications[0].contactId}'::uuid,
      'dog',
      'Golden Retriever',
      'QA dashboard attention',
      'no_preference',
      1,
      'QA dashboard attention candidature new',
      'QA fixture isolated from seed',
      'house',
      true,
      true,
      2,
      '${candidateApplications[0].status}',
      '2026-07-11 08:11:00+00',
      '2026-07-11 08:11:00+00',
      '2026-07-11 08:11:00+00',
      '${ownerId}'::uuid,
      '${ownerId}'::uuid
    ),
    (
      '${candidateApplications[1].id}'::uuid,
      '${organizationId}'::uuid,
      '${candidateApplications[1].contactId}'::uuid,
      'dog',
      'Golden Retriever',
      'QA dashboard attention',
      'no_preference',
      1,
      'QA dashboard attention candidature to_review',
      'QA fixture isolated from seed',
      'house',
      true,
      true,
      2,
      '${candidateApplications[1].status}',
      '2026-07-11 08:12:00+00',
      '2026-07-11 08:12:00+00',
      '2026-07-11 08:12:00+00',
      '${ownerId}'::uuid,
      '${ownerId}'::uuid
    ),
    (
      '${candidateApplications[2].id}'::uuid,
      '${organizationId}'::uuid,
      '${candidateApplications[2].contactId}'::uuid,
      'dog',
      'Golden Retriever',
      'QA dashboard attention',
      'no_preference',
      1,
      'QA dashboard attention candidature to_call',
      'QA fixture isolated from seed',
      'house',
      true,
      true,
      2,
      '${candidateApplications[2].status}',
      '2026-07-11 08:13:00+00',
      '2026-07-11 08:13:00+00',
      '2026-07-11 08:13:00+00',
      '${ownerId}'::uuid,
      '${ownerId}'::uuid
    ),
    (
      '${depositApplication.id}'::uuid,
      '${organizationId}'::uuid,
      '${depositApplication.contactId}'::uuid,
      'dog',
      'Golden Retriever',
      'QA dashboard attention',
      'no_preference',
      1,
      'QA dashboard attention candidature deposit threshold',
      'QA fixture isolated from seed',
      'house',
      true,
      true,
      2,
      '${depositApplication.status}',
      '2026-07-11 08:14:00+00',
      '2026-07-11 08:14:00+00',
      '2026-07-11 08:14:00+00',
      '${ownerId}'::uuid,
      '${ownerId}'::uuid
    )
  returning id
),
reservation_insert as (
  insert into public.reservations (
    id,
    organization_id,
    contact_id,
    application_id,
    species,
    breed,
    reserved_sex_preference,
    rank_initial,
    rank_active,
    rank_assigned_at,
    status,
    price_cents,
    currency,
    internal_comment,
    created_at,
    updated_at,
    created_by,
    updated_by
  )
  values (
    '${qaReservationId}'::uuid,
    '${organizationId}'::uuid,
    '${depositApplication.contactId}'::uuid,
    '${depositApplication.id}'::uuid,
    'dog',
    'Golden Retriever',
    'no_preference',
    1,
    1,
    '2026-07-11 08:20:00+00',
    'active',
    180000,
    'EUR',
    'QA dashboard attention reservation deposit threshold',
    '2026-07-11 08:20:00+00',
    '2026-07-11 08:20:00+00',
    '${ownerId}'::uuid,
    '${ownerId}'::uuid
  )
  returning id
),
payment_insert as (
  insert into public.payments (
    id,
    organization_id,
    contact_id,
    reservation_id,
    amount_cents,
    currency,
    payment_type,
    status,
    requested_at,
    due_date,
    paid_at,
    payment_method,
    external_reference,
    notes,
    created_at,
    updated_at,
    created_by,
    updated_by
  )
  values (
    '${qaPaymentId}'::uuid,
    '${organizationId}'::uuid,
    '${depositApplication.contactId}'::uuid,
    '${qaReservationId}'::uuid,
    50000,
    'EUR',
    'arrhes',
    'paid',
    '2026-07-11 08:21:00+00',
    '2026-07-11',
    '2026-07-11 08:22:00+00',
    'bank_transfer',
    'QA-DASHBOARD-ATTENTION-ARRHES',
    'QA dashboard attention paid arrhes threshold',
    '2026-07-11 08:21:00+00',
    '2026-07-11 08:21:00+00',
    '${ownerId}'::uuid,
    '${ownerId}'::uuid
  )
  returning id
)
select row_to_json(original_settings)::text from original_settings;

commit;
`);
}

async function setCompleteDepositCents(
  preReservationCents: number,
  secondPaymentCents: number,
) {
  await runSql<null>(`
begin;

update public.organization_settings
set
  default_pre_reservation_deposit_cents = ${preReservationCents},
  default_arrhes_second_payment_cents = ${secondPaymentCents}
where organization_id = '${organizationId}'::uuid;

commit;
`);
}

async function restoreSettingsAndDeleteQaRows(settings: SettingsSnapshot | null) {
  return runSql<CleanupReport>(`
begin;
set local session_replication_role = replica;

delete from public.payments
where id = any(${sqlUuidArray(qaPaymentIds)});

delete from public.reservations
where id = any(${sqlUuidArray(qaReservationIds)});

delete from public.applications
where id = any(${sqlUuidArray(qaApplicationIds)});

delete from public.contacts
where id = any(${sqlUuidArray(qaContactIds)});

${
  settings
    ? `update public.organization_settings
set
  default_pre_reservation_deposit_cents = ${settings.default_pre_reservation_deposit_cents},
  default_arrhes_second_payment_cents = ${settings.default_arrhes_second_payment_cents},
  updated_at = ${sqlString(settings.updated_at)}::timestamptz
where organization_id = '${organizationId}'::uuid;`
    : ""
}

select jsonb_build_object(
  'settings_restored', ${
    settings
      ? `exists (
    select 1
    from public.organization_settings
    where organization_id = '${organizationId}'::uuid
      and default_pre_reservation_deposit_cents = ${settings.default_pre_reservation_deposit_cents}
      and default_arrhes_second_payment_cents = ${settings.default_arrhes_second_payment_cents}
      and updated_at = ${sqlString(settings.updated_at)}::timestamptz
  )`
      : "false"
  },
  'qa_contacts', (
    select count(*)
    from public.contacts
    where id = any(${sqlUuidArray(qaContactIds)})
  ),
  'qa_applications', (
    select count(*)
    from public.applications
    where id = any(${sqlUuidArray(qaApplicationIds)})
  ),
  'qa_reservations', (
    select count(*)
    from public.reservations
    where id = any(${sqlUuidArray(qaReservationIds)})
  ),
  'qa_payments', (
    select count(*)
    from public.payments
    where id = any(${sqlUuidArray(qaPaymentIds)})
  )
)::text;

commit;
`);
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("owner@saasphase1.invalid");
  await page.getByLabel("Mot de passe").fill("LocalDevOwner-2026!");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/candidatures/);
}

async function readDashboardCandidateCount(page: Page) {
  await page.goto("/");
  const card = page
    .locator("section")
    .filter({ hasText: "Candidats à valider" })
    .first();
  await expect(card).toBeVisible();
  await expect(
    card.getByRole("link", { name: /Voir les candidats à valider/ }),
  ).toHaveAttribute("href", "/candidatures");

  return Number(
    await card
      .locator("div")
      .filter({ hasText: "Candidats à valider" })
      .first()
      .locator("span")
      .first()
      .innerText(),
  );
}

test("aligns dashboard attention with candidate and adopter journey lists", async ({
  page,
}) => {
  test.setTimeout(120_000);

  let settingsSnapshot: SettingsSnapshot | null = null;
  let cleanupReport: CleanupReport | null = null;

  try {
    settingsSnapshot = await prepareFixture();

    await login(page);

    const dashboardCandidateCount = await readDashboardCandidateCount(page);

    await page.goto("/candidatures");
    await expect(page.getByRole("heading", { name: "Candidats" })).toBeVisible();
    for (const application of candidateApplications) {
      const row = page.locator("tr", { hasText: application.name });
      await expect(row).toContainText("À valider");
    }
    await expect(page.getByText("À appeler")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /À appeler/ })).toHaveCount(0);
    await expect(page.locator("tbody tr")).toHaveCount(dashboardCandidateCount);

    await page.goto("/");
    await expect(page.getByText("À appeler")).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: /Voir les paiements attendus/ }),
    ).toHaveAttribute("href", "/payments?filter=expected");
    await expect(
      page.getByRole("link", { name: /Voir les documents à traiter/ }),
    ).toHaveAttribute("href", "/documents?filter=to_process");
    await expect(
      page.getByRole("link", { name: /Voir les portées en cours/ }),
    ).toHaveAttribute("href", "/litters?filter=active");

    await page.goto("/");
    await expect(page.getByText(depositApplication.name)).toHaveCount(0);
    await page.goto("/reservations?filter=attention");
    await expect(page.getByText(depositApplication.name)).toHaveCount(0);

    await setCompleteDepositCents(25000, 25000);

    await page.goto("/");
    await expect(page.getByText(depositApplication.name)).toBeVisible();
    await page.goto("/reservations?filter=attention");
    await expect(page.getByText(depositApplication.name)).toBeVisible();
  } finally {
    cleanupReport = await restoreSettingsAndDeleteQaRows(settingsSnapshot);
  }

  expect(cleanupReport).toMatchObject({
    settings_restored: true,
    qa_contacts: 0,
    qa_applications: 0,
    qa_reservations: 0,
    qa_payments: 0,
  });
});
