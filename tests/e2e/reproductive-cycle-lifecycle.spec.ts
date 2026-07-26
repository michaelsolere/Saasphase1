import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

import {
  addProgesteroneMeasurementCore,
  createReproductiveCycleCore,
  recordReproductiveCycleMatingCore,
  updateReproductiveCycleCore,
} from "../../src/features/reproduction/reproductive-cycles-core";
import {
  createTestAnimal,
  createTestOrganization,
  createTestReproductiveCycle,
} from "./helpers/fixtures/breeding-fixtures";
import { withE2eFixtures } from "./helpers/fixtures/fixture-registry";
import {
  createAuthenticatedSupabaseClient,
  E2E_OWNER_EMAIL,
  E2E_OWNER_PASSWORD,
  runE2eSqlSync,
} from "./helpers/supabase";

test.setTimeout(240_000);

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const ownerMembershipId = "30000000-0000-4000-8000-000000000001";
const sql = (value: string) => runE2eSqlSync(value);
const q = (value: string) => `'${value.replaceAll("'", "''")}'`;

function setOwnerRole(role: "owner" | "admin" | "member" | "viewer") {
  sql(`
    set session_replication_role = replica;
    update public.memberships set role = ${q(role)}
    where id = ${q(ownerMembershipId)}::uuid
      and organization_id = ${q(organizationId)}::uuid
      and profile_id = ${q(ownerId)}::uuid;
    set session_replication_role = origin;
  `);
}

function cycleRow(cycleId: string) {
  return JSON.parse(
    sql(`
      select json_build_object(
        'id', id::text,
        'status', status,
        'started_on', started_on::text,
        'ended_on', ended_on::text,
        'notes', notes,
        'litter_id', litter_id::text,
        'updated_at', updated_at
      )::text
      from public.reproductive_cycles
      where id = ${q(cycleId)}::uuid;
    `),
  ) as {
    id: string;
    status: string;
    started_on: string;
    ended_on: string | null;
    notes: string | null;
    litter_id: string | null;
    updated_at: string;
  };
}

function countForMother(motherId: string) {
  return JSON.parse(
    sql(`
      select json_build_object(
        'cycles', (select count(*) from public.reproductive_cycles where mother_id = ${q(motherId)}::uuid),
        'measurements', (
          select count(*) from public.progesterone_measurements measurement
          join public.reproductive_cycles cycle on cycle.id = measurement.cycle_id
          where cycle.mother_id = ${q(motherId)}::uuid
        ),
        'matings', (
          select count(*) from public.reproductive_cycle_matings mating
          join public.reproductive_cycles cycle on cycle.id = mating.cycle_id
          where cycle.mother_id = ${q(motherId)}::uuid
        ),
        'litters', (select count(*) from public.litters where mother_id = ${q(motherId)}::uuid)
      )::text;
    `),
  ) as Record<string, number>;
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_OWNER_EMAIL);
  await page.getByLabel("Mot de passe").fill(E2E_OWNER_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).not.toHaveURL(/\/login$/, { timeout: 30_000 });
}

test("pilote le cycle de vie d’un cycle reproductif sans duplication", async ({ page, context }) => {
  setOwnerRole("owner");

  try {
    await withE2eFixtures(sql, async (fixtures) => {
    const owner = await createAuthenticatedSupabaseClient();
    const label = fixtures.namespace.slice(-8);

    const mother = await createTestAnimal(sql, fixtures, {
      organizationId,
      ownerId,
      callName: `E2E lifecycle mère ${label}`,
      sex: "female",
    });
    const father = await createTestAnimal(sql, fixtures, {
      organizationId,
      ownerId,
      callName: `E2E lifecycle père ${label}`,
      sex: "male",
    });
    sql(`
      update public.animals
      set is_breeder = true
      where id in (${q(mother)}::uuid, ${q(father)}::uuid);
    `);

    const foreignOrganization = await createTestOrganization(sql, fixtures, {
      name: `E2E lifecycle org étrangère ${label}`,
      slug: `e2e-lifecycle-foreign-${label}`,
    });
    const foreignMother = await createTestAnimal(sql, fixtures, {
      organizationId: foreignOrganization,
      ownerId,
      callName: `E2E lifecycle mère étrangère ${label}`,
      sex: "female",
    });
    const foreignCycle = await createTestReproductiveCycle(sql, fixtures, {
      organizationId: foreignOrganization,
      ownerId,
      motherId: foreignMother,
      status: "planned",
      startedOn: "2026-06-01",
      notes: `E2E lifecycle foreign ${label}`,
    });

    const createdPlanned = await createReproductiveCycleCore(
      {
        motherId: mother,
        status: "planned",
        startedOn: "2026-07-01",
        notes: `E2E lifecycle planned ${label}`,
      },
      owner,
    );
    expect(createdPlanned.outcome).toBe("success");
    if (createdPlanned.outcome !== "success") throw new Error("planned cycle required");
    fixtures.register("reproductive_cycles", createdPlanned.cycle.id);
    const plannedId = createdPlanned.cycle.id;

    const moved = await updateReproductiveCycleCore(
      {
        cycleId: plannedId,
        expectedUpdatedAt: createdPlanned.cycle.updatedAt,
        status: "planned",
        startedOn: "2026-07-05",
        notes: `E2E lifecycle planned moved ${label}`,
      },
      owner,
    );
    expect(moved, JSON.stringify(moved)).toMatchObject({ outcome: "success" });
    if (moved.outcome !== "success") throw new Error("moved cycle required");
    expect(moved.cycle.startedOn).toBe("2026-07-05");
    expect(moved.cycle.notes).toBe(`E2E lifecycle planned moved ${label}`);
    expect(moved.cycle.id).toBe(plannedId);

    const started = await updateReproductiveCycleCore(
      {
        cycleId: plannedId,
        expectedUpdatedAt: moved.cycle.updatedAt,
        status: "in_progress",
        startedOn: "2026-07-05",
        notes: `E2E lifecycle in progress ${label}`,
      },
      owner,
    );
    expect(started.outcome).toBe("success");
    if (started.outcome !== "success") throw new Error("in_progress cycle required");
    expect(started.cycle.status).toBe("in_progress");

    const measurement = await addProgesteroneMeasurementCore(
      {
        cycleId: plannedId,
        measuredAt: "2026-07-06T08:00:00.000Z",
        value: 3.25,
        unit: "ng_ml",
        note: `E2E lifecycle dosage ${label}`,
      },
      owner,
    );
    expect(measurement.outcome).toBe("success");
    if (measurement.outcome !== "success") throw new Error("measurement required");
    fixtures.register("progesterone_measurements", measurement.measurement.id);
    const measurementSnapshot = JSON.parse(
      sql(`
        select json_build_object(
          'value', value::text,
          'unit', unit,
          'note', note,
          'measured_at', measured_at
        )::text
        from public.progesterone_measurements
        where id = ${q(measurement.measurement.id)}::uuid;
      `),
    );

    const afterMeasurement = await updateReproductiveCycleCore(
      {
        cycleId: plannedId,
        expectedUpdatedAt: started.cycle.updatedAt,
        status: "in_progress",
        startedOn: "2026-07-04",
        notes: `E2E lifecycle after dosage ${label}`,
      },
      owner,
    );
    expect(afterMeasurement.outcome).toBe("success");
    if (afterMeasurement.outcome !== "success") throw new Error("post-measurement update required");
    expect(
      JSON.parse(
        sql(`
          select json_build_object(
            'value', value::text,
            'unit', unit,
            'note', note,
            'measured_at', measured_at
          )::text
          from public.progesterone_measurements
          where id = ${q(measurement.measurement.id)}::uuid;
        `),
      ),
    ).toEqual(measurementSnapshot);

    const closed = await updateReproductiveCycleCore(
      {
        cycleId: plannedId,
        expectedUpdatedAt: afterMeasurement.cycle.updatedAt,
        status: "closed",
        startedOn: "2026-07-04",
        endedOn: "2026-07-18",
        notes: `E2E lifecycle closed ${label}`,
      },
      owner,
    );
    expect(closed.outcome).toBe("success");
    if (closed.outcome !== "success") throw new Error("closed cycle required");
    expect(closed.cycle.status).toBe("closed");
    expect(closed.cycle.endedOn).toBe("2026-07-18");

    const terminalDenied = await updateReproductiveCycleCore(
      {
        cycleId: plannedId,
        expectedUpdatedAt: closed.cycle.updatedAt,
        status: "closed",
        startedOn: "2026-07-04",
        endedOn: "2026-07-19",
        notes: "should fail",
      },
      owner,
    );
    expect(terminalDenied).toMatchObject({
      outcome: "error",
      error: { code: "invalid_transition" },
    });

    const nextActive = await createReproductiveCycleCore(
      {
        motherId: mother,
        status: "planned",
        startedOn: "2026-08-01",
        notes: `E2E lifecycle next active ${label}`,
      },
      owner,
    );
    expect(nextActive.outcome).toBe("success");
    if (nextActive.outcome !== "success") throw new Error("next active cycle required");
    fixtures.register("reproductive_cycles", nextActive.cycle.id);

    const cancelled = await updateReproductiveCycleCore(
      {
        cycleId: nextActive.cycle.id,
        expectedUpdatedAt: nextActive.cycle.updatedAt,
        status: "cancelled",
        startedOn: "2026-08-01",
        notes: `E2E lifecycle cancelled ${label}`,
      },
      owner,
    );
    expect(cancelled.outcome).toBe("success");
    if (cancelled.outcome !== "success") throw new Error("cancelled cycle required");
    expect(cancelled.cycle.status).toBe("cancelled");

    const matingCycle = await createReproductiveCycleCore(
      {
        motherId: mother,
        status: "in_progress",
        startedOn: "2026-09-01",
        notes: `E2E lifecycle mating cycle ${label}`,
      },
      owner,
    );
    expect(matingCycle.outcome).toBe("success");
    if (matingCycle.outcome !== "success") throw new Error("mating cycle required");
    fixtures.register("reproductive_cycles", matingCycle.cycle.id);

    const mating = await recordReproductiveCycleMatingCore(
      {
        cycleId: matingCycle.cycle.id,
        clientCommandId: randomUUID(),
        fatherId: father,
        occurredAt: "2026-09-03T10:00:00.000Z",
        timezoneName: "Europe/Paris",
        method: "natural",
        litterName: `E2E lifecycle litter ${label}`,
      },
      owner,
    );
    expect(mating.outcome).toBe("success");
    if (mating.outcome !== "success") throw new Error("mating required");
    fixtures.register("reproductive_cycle_matings", mating.matingId);
    fixtures.register("litters", mating.litterId);

    const matedRow = cycleRow(matingCycle.cycle.id);
    expect(matedRow.status).toBe("mated");
    expect(matedRow.litter_id).toBe(mating.litterId);

    const cancelWithMating = await updateReproductiveCycleCore(
      {
        cycleId: matingCycle.cycle.id,
        expectedUpdatedAt: matedRow.updated_at,
        status: "cancelled",
        startedOn: "2026-09-01",
        notes: "should not cancel",
      },
      owner,
    );
    expect(cancelWithMating).toMatchObject({
      outcome: "error",
      error: { code: "invalid_transition" },
    });

    const cancelBlockedByLitter = await updateReproductiveCycleCore(
      {
        cycleId: matingCycle.cycle.id,
        expectedUpdatedAt: matedRow.updated_at,
        status: "mated",
        startedOn: "2026-09-01",
        notes: `E2E lifecycle keep mated ${label}`,
      },
      owner,
    );
    expect(cancelBlockedByLitter.outcome).toBe("success");
    if (cancelBlockedByLitter.outcome !== "success") throw new Error("mated self-update required");

    const closedMated = await updateReproductiveCycleCore(
      {
        cycleId: matingCycle.cycle.id,
        expectedUpdatedAt: cancelBlockedByLitter.cycle.updatedAt,
        status: "closed",
        startedOn: "2026-09-01",
        endedOn: "2026-09-20",
        notes: `E2E lifecycle mated closed ${label}`,
      },
      owner,
    );
    expect(closedMated.outcome).toBe("success");
    if (closedMated.outcome !== "success") throw new Error("mated closed required");
    expect(closedMated.cycle.status).toBe("closed");
    expect(closedMated.cycle.litterId).toBe(mating.litterId);
    expect(cycleRow(matingCycle.cycle.id).litter_id).toBe(mating.litterId);
    expect(
      Number(
        sql(`select count(*)::text from public.reproductive_cycle_matings where id = ${q(mating.matingId)}::uuid`),
      ),
    ).toBe(1);

    const litterOnlyCycle = await createReproductiveCycleCore(
      {
        motherId: mother,
        status: "planned",
        startedOn: "2026-10-01",
        notes: `E2E lifecycle litter-only ${label}`,
      },
      owner,
    );
    expect(litterOnlyCycle.outcome).toBe("success");
    if (litterOnlyCycle.outcome !== "success") throw new Error("litter-only cycle required");
    fixtures.register("reproductive_cycles", litterOnlyCycle.cycle.id);

    const linkedLitterId = randomUUID();
    fixtures.register("litters", linkedLitterId);
    sql(`
      insert into public.litters (
        id, organization_id, name, species, breed, mother_id, status, created_by, updated_by
      ) values (
        ${q(linkedLitterId)}::uuid, ${q(organizationId)}::uuid,
        ${q(`E2E lifecycle linked litter ${label}`)}, 'dog', 'Golden Retriever',
        ${q(mother)}::uuid, 'birth_expected', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
      );
      update public.reproductive_cycles
      set litter_id = ${q(linkedLitterId)}::uuid
      where id = ${q(litterOnlyCycle.cycle.id)}::uuid;
    `);

    const litterLinkedRow = cycleRow(litterOnlyCycle.cycle.id);
    const cancelWithLitter = await updateReproductiveCycleCore(
      {
        cycleId: litterOnlyCycle.cycle.id,
        expectedUpdatedAt: litterLinkedRow.updated_at,
        status: "cancelled",
        startedOn: "2026-10-01",
        notes: "should not cancel with litter",
      },
      owner,
    );
    expect(cancelWithLitter).toMatchObject({
      outcome: "error",
      error: { code: "cancellation_blocked" },
    });

    const concurrencyMother = await createTestAnimal(sql, fixtures, {
      organizationId,
      ownerId,
      callName: `E2E lifecycle concurrente ${label}`,
      sex: "female",
    });
    const concurrent = await createReproductiveCycleCore(
      {
        motherId: concurrencyMother,
        status: "planned",
        startedOn: "2026-11-01",
        notes: `E2E lifecycle concurrent ${label}`,
      },
      owner,
    );
    expect(concurrent.outcome).toBe("success");
    if (concurrent.outcome !== "success") throw new Error("concurrent cycle required");
    fixtures.register("reproductive_cycles", concurrent.cycle.id);

    const firstWrite = await updateReproductiveCycleCore(
      {
        cycleId: concurrent.cycle.id,
        expectedUpdatedAt: concurrent.cycle.updatedAt,
        status: "planned",
        startedOn: "2026-11-02",
        notes: `E2E lifecycle first tab ${label}`,
      },
      owner,
    );
    expect(firstWrite.outcome).toBe("success");
    if (firstWrite.outcome !== "success") throw new Error("first tab write required");

    const staleWrite = await updateReproductiveCycleCore(
      {
        cycleId: concurrent.cycle.id,
        expectedUpdatedAt: concurrent.cycle.updatedAt,
        status: "planned",
        startedOn: "2026-11-03",
        notes: `E2E lifecycle stale tab ${label}`,
      },
      owner,
    );
    expect(staleWrite).toMatchObject({
      outcome: "error",
      error: { code: "stale" },
    });
    expect(cycleRow(concurrent.cycle.id).notes).toBe(`E2E lifecycle first tab ${label}`);
    expect(cycleRow(concurrent.cycle.id).started_on).toBe("2026-11-02");

    const closedConcurrent = await updateReproductiveCycleCore(
      {
        cycleId: concurrent.cycle.id,
        expectedUpdatedAt: firstWrite.cycle.updatedAt,
        status: "cancelled",
        startedOn: "2026-11-02",
        notes: `E2E lifecycle concurrent cancelled ${label}`,
      },
      owner,
    );
    expect(closedConcurrent.outcome).toBe("success");

    const foreignDenied = await updateReproductiveCycleCore(
      {
        cycleId: foreignCycle,
        expectedUpdatedAt: cycleRow(foreignCycle).updated_at,
        status: "planned",
        startedOn: "2026-06-02",
        notes: "foreign",
      },
      owner,
    );
    expect(foreignDenied).toMatchObject({
      outcome: "error",
      error: { code: "not_found" },
    });

    const missingDenied = await updateReproductiveCycleCore(
      {
        cycleId: randomUUID(),
        expectedUpdatedAt: new Date().toISOString(),
        status: "planned",
        startedOn: "2026-06-02",
        notes: "missing",
      },
      owner,
    );
    expect(missingDenied).toMatchObject({
      outcome: "error",
      error: { code: "not_found" },
    });

    setOwnerRole("member");
    const memberCycle = await createReproductiveCycleCore(
      {
        motherId: concurrencyMother,
        status: "planned",
        startedOn: "2026-12-01",
        notes: `E2E lifecycle member ${label}`,
      },
      owner,
    );
    expect(memberCycle.outcome).toBe("success");
    if (memberCycle.outcome !== "success") throw new Error("member cycle required");
    fixtures.register("reproductive_cycles", memberCycle.cycle.id);
    const memberUpdate = await updateReproductiveCycleCore(
      {
        cycleId: memberCycle.cycle.id,
        expectedUpdatedAt: memberCycle.cycle.updatedAt,
        status: "in_progress",
        startedOn: "2026-12-01",
        notes: `E2E lifecycle member updated ${label}`,
      },
      owner,
    );
    expect(memberUpdate.outcome).toBe("success");

    setOwnerRole("viewer");
    const viewerDenied = await updateReproductiveCycleCore(
      {
        cycleId: memberCycle.cycle.id,
        expectedUpdatedAt:
          memberUpdate.outcome === "success"
            ? memberUpdate.cycle.updatedAt
            : memberCycle.cycle.updatedAt,
        status: "cancelled",
        startedOn: "2026-12-01",
        notes: "viewer denied",
      },
      owner,
    );
    expect(viewerDenied).toMatchObject({
      outcome: "error",
      error: { code: "forbidden" },
    });

    setOwnerRole("owner");
    const uiMother = await createTestAnimal(sql, fixtures, {
      organizationId,
      ownerId,
      callName: `E2E lifecycle UI ${label}`,
      sex: "female",
    });
    const uiCycle = await createReproductiveCycleCore(
      {
        motherId: uiMother,
        status: "planned",
        startedOn: "2026-07-20",
        notes: `E2E lifecycle ui base ${label}`,
      },
      owner,
    );
    expect(uiCycle.outcome).toBe("success");
    if (uiCycle.outcome !== "success") throw new Error("ui cycle required");
    fixtures.register("reproductive_cycles", uiCycle.cycle.id);

    setOwnerRole("viewer");
    await login(page);
    await page.goto(`/animals/${uiMother}/reproduction`);
    await expect(page.getByText("Lecture seule")).toBeVisible();
    await expect(page.getByRole("button", { name: "Modifier le cycle" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Ajouter un cycle" })).toHaveCount(0);

    setOwnerRole("owner");
    await page.goto(`/animals/${uiMother}/reproduction`);
    await expect(page.getByRole("button", { name: "Modifier le cycle" })).toBeVisible();
    await page.getByRole("button", { name: "Modifier le cycle" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("État courant")).toBeVisible();
    await dialog.getByLabel("Date de début").fill("2026-07-22");
    await dialog.getByLabel("Notes").fill(`E2E lifecycle ui notes ${label}`);
    await dialog.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByText("Le cycle reproductif a été mis à jour.")).toBeVisible();
    await expect(page.getByText(`E2E lifecycle ui notes ${label}`)).toBeVisible();

    const secondPage = await context.newPage();
    await secondPage.goto(`/animals/${uiMother}/reproduction`);
    await secondPage.getByRole("button", { name: "Modifier le cycle" }).click();
    const secondDialog = secondPage.getByRole("dialog");
    await secondDialog.getByLabel("Notes").fill(`E2E lifecycle second tab lost ${label}`);

    await page.getByRole("button", { name: "Modifier le cycle" }).click();
    const firstDialog = page.getByRole("dialog");
    await firstDialog.getByLabel("Notes").fill(`E2E lifecycle first tab wins ${label}`);
    await firstDialog.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByText("Le cycle reproductif a été mis à jour.")).toBeVisible();

    await secondDialog.getByRole("button", { name: "Enregistrer" }).click();
    await expect(
      secondDialog.getByText(
        "Le cycle a été modifié depuis votre dernière lecture. Rechargez la page avant de réessayer.",
      ),
    ).toBeVisible();
    await secondPage.close();

    await expect(page.getByText(`E2E lifecycle first tab wins ${label}`)).toBeVisible();
    await expect(page.getByText(`E2E lifecycle second tab lost ${label}`)).toHaveCount(0);

    await page.goto(`/animals/${uiMother}/reproduction`);
    await expect(page.getByText(`E2E lifecycle first tab wins ${label}`)).toBeVisible();
    await expect(page.getByText(`E2E lifecycle second tab lost ${label}`)).toHaveCount(0);

    expect(countForMother(mother)).toEqual({
      cycles: 4,
      measurements: 1,
      matings: 1,
      litters: 2,
    });
    expect(countForMother(concurrencyMother).cycles).toBe(2);
    expect(countForMother(uiMother)).toEqual({
      cycles: 1,
      measurements: 0,
      matings: 0,
      litters: 0,
    });
    expect(
      Number(
        sql(
          `select count(*)::text from public.progesterone_measurements where id = ${q(measurement.measurement.id)}::uuid`,
        ),
      ),
    ).toBe(1);
    });
  } finally {
    setOwnerRole("owner");
  }
});
