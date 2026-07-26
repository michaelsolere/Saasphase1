import { createHash } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

import { formatLitterJournalBusinessDate } from "../../src/features/litter-journal/date";
import {
  createTestAdopterAppointmentReadyScenario,
  createTestReservationAppointment,
} from "./helpers/fixtures/adopter-appointment-fixtures";
import { getAdopterFixtureReservation } from "./helpers/fixtures/adopter-payment-fixtures";
import {
  createPlannedLitterCareTask,
  createTestAnimal,
  createTestLitter,
  createTestOrganization,
  createTestProgesteroneMeasurement,
  createTestReproductiveCycle,
} from "./helpers/fixtures/breeding-fixtures";
import { withE2eFixtures } from "./helpers/fixtures/fixture-registry";
import {
  E2E_OWNER_EMAIL,
  E2E_OWNER_PASSWORD,
  runE2eSqlSync,
} from "./helpers/supabase";

test.setTimeout(300_000);

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const ownerMembershipId = "30000000-0000-4000-8000-000000000001";
const sql = (value: string) => runE2eSqlSync(value);
const q = (value: string) => `'${value.replaceAll("'", "''")}'`;

function unfoldICalendar(value: string) {
  return value.replace(/\r\n[ \t]/g, "");
}

function addCivilDays(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return [
    date.getUTCFullYear().toString().padStart(4, "0"),
    (date.getUTCMonth() + 1).toString().padStart(2, "0"),
    date.getUTCDate().toString().padStart(2, "0"),
  ].join("-");
}

function ymd(value: string) {
  return value.replaceAll("-", "");
}

function expectedCycleUid(cycleId: string) {
  return `${createHash("sha256").update(`reproductive-cycle:${cycleId}`).digest("hex")}@saas-elevage`;
}

function parisTodayIso(today: string, hour: number, minute: number) {
  const utcHour = hour - 2;
  const dayOffset = utcHour < 0 ? -1 : 0;
  const normalizedHour = (utcHour + 24) % 24;
  const [year, month, day] = today.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + dayOffset, normalizedHour, minute, 0));
  return date.toISOString();
}

function setOwnerRole(role: "owner" | "viewer") {
  sql(`
    set session_replication_role = replica;
    update public.memberships
    set role = ${q(role)}
    where id = ${q(ownerMembershipId)}::uuid
      and organization_id = ${q(organizationId)}::uuid
      and profile_id = ${q(ownerId)}::uuid;
    set session_replication_role = origin;
  `);
}

function restoreOwnerRole() {
  setOwnerRole("owner");
  expect(
    sql(`
      select count(*)::text from public.memberships
      where id = ${q(ownerMembershipId)}::uuid
        and role = 'owner'
        and status = 'active'
    `),
  ).toBe("1");
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_OWNER_EMAIL);
  await page.getByLabel("Mot de passe").fill(E2E_OWNER_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}

function cycleCounts(ids: string[]) {
  if (ids.length === 0) return 0;
  return Number(
    sql(
      `select count(*)::text from public.reproductive_cycles where id in (${ids.map((id) => `${q(id)}::uuid`).join(",")})`,
    ),
  );
}

test("calendrier global projette les chaleurs planned/in_progress sans dosages ni saillies", async ({
  page,
}) => {
  restoreOwnerRole();

  try {
    await withE2eFixtures(sql, async (fixtures) => {
      const label = fixtures.namespace.slice(-8);
      const today = formatLitterJournalBusinessDate(new Date());
      const past = addCivilDays(today, -5);
      const future = addCivilDays(today, 10);
      const inProgressStart = addCivilDays(today, -3);

      const litterTitle = `E2E portée repro cal ${label}`;
      const contactName = `E2E adoptant repro cal ${label}`;
      const plannedTodayName = `E2E chaleurs prévues ${label}`;
      const inProgressName = `E2E chaleurs en cours ${label}`;
      const plannedFutureName = `E2E chaleurs futures ${label}`;
      const plannedPastName = `E2E chaleurs passées ${label}`;
      const matedName = `E2E chaleurs mated ${label}`;
      const closedName = `E2E chaleurs closed ${label}`;
      const cancelledName = `E2E chaleurs cancelled ${label}`;
      const foreignName = `E2E chaleurs étrangère ${label}`;
      const secretNote = `Note cycle secrète ${label}`;
      const labName = `Labo secret ${label}`;

      const litterMother = await createTestAnimal(sql, fixtures, {
        organizationId,
        ownerId,
        callName: `E2E mère portée cal ${label}`,
      });
      const litter = await createTestLitter(sql, fixtures, {
        organizationId,
        ownerId,
        motherId: litterMother,
        name: `E2E litter repro cal ${label}`,
      });
      await createPlannedLitterCareTask(sql, fixtures, {
        organizationId,
        ownerId,
        litterId: litter,
        day: today,
        title: litterTitle,
      });

      const scenario = await createTestAdopterAppointmentReadyScenario(sql, fixtures, {
        organizationId,
        ownerId,
        displayName: contactName,
      });
      const reservation = getAdopterFixtureReservation(fixtures, scenario.journey.id)!;
      await createTestReservationAppointment(sql, fixtures, {
        organizationId,
        reservationId: reservation.id,
        ownerId,
        kind: "puppy_choice",
        status: "planned",
        plannedAt: parisTodayIso(today, 10, 0),
      });

      const motherPlannedToday = await createTestAnimal(sql, fixtures, {
        organizationId,
        ownerId,
        callName: plannedTodayName,
      });
      const motherInProgress = await createTestAnimal(sql, fixtures, {
        organizationId,
        ownerId,
        callName: inProgressName,
      });
      const motherPlannedFuture = await createTestAnimal(sql, fixtures, {
        organizationId,
        ownerId,
        callName: plannedFutureName,
      });
      const motherPlannedPast = await createTestAnimal(sql, fixtures, {
        organizationId,
        ownerId,
        callName: plannedPastName,
      });
      const motherMated = await createTestAnimal(sql, fixtures, {
        organizationId,
        ownerId,
        callName: matedName,
      });
      const motherClosed = await createTestAnimal(sql, fixtures, {
        organizationId,
        ownerId,
        callName: closedName,
      });
      const motherCancelled = await createTestAnimal(sql, fixtures, {
        organizationId,
        ownerId,
        callName: cancelledName,
      });

      const plannedTodayCycle = await createTestReproductiveCycle(sql, fixtures, {
        organizationId,
        ownerId,
        motherId: motherPlannedToday,
        status: "planned",
        startedOn: today,
        notes: secretNote,
      });
      const inProgressCycle = await createTestReproductiveCycle(sql, fixtures, {
        organizationId,
        ownerId,
        motherId: motherInProgress,
        status: "in_progress",
        startedOn: inProgressStart,
        notes: secretNote,
      });
      const plannedFutureCycle = await createTestReproductiveCycle(sql, fixtures, {
        organizationId,
        ownerId,
        motherId: motherPlannedFuture,
        status: "planned",
        startedOn: future,
        notes: secretNote,
      });
      const plannedPastCycle = await createTestReproductiveCycle(sql, fixtures, {
        organizationId,
        ownerId,
        motherId: motherPlannedPast,
        status: "planned",
        startedOn: past,
        notes: secretNote,
      });
      const matedCycle = await createTestReproductiveCycle(sql, fixtures, {
        organizationId,
        ownerId,
        motherId: motherMated,
        status: "mated",
        startedOn: past,
        notes: secretNote,
      });
      const closedCycle = await createTestReproductiveCycle(sql, fixtures, {
        organizationId,
        ownerId,
        motherId: motherClosed,
        status: "closed",
        startedOn: past,
        endedOn: today,
        notes: secretNote,
      });
      const cancelledCycle = await createTestReproductiveCycle(sql, fixtures, {
        organizationId,
        ownerId,
        motherId: motherCancelled,
        status: "cancelled",
        startedOn: past,
        notes: secretNote,
      });

      await createTestProgesteroneMeasurement(sql, fixtures, {
        organizationId,
        ownerId,
        cycleId: plannedTodayCycle,
        measuredAt: `${today}T08:00:00.000Z`,
        value: "12.5",
        note: `Dosage secret ${label}`,
      });
      sql(`
        update public.progesterone_measurements
        set laboratory_name = ${q(labName)}
        where cycle_id = ${q(plannedTodayCycle)}::uuid
      `);

      const foreignOrg = await createTestOrganization(sql, fixtures);
      const foreignMother = await createTestAnimal(sql, fixtures, {
        organizationId: foreignOrg,
        ownerId,
        callName: foreignName,
      });
      const foreignCycle = await createTestReproductiveCycle(sql, fixtures, {
        organizationId: foreignOrg,
        ownerId,
        motherId: foreignMother,
        status: "in_progress",
        startedOn: today,
        notes: `Foreign note ${label}`,
      });

      const allCycleIds = [
        plannedTodayCycle,
        inProgressCycle,
        plannedFutureCycle,
        plannedPastCycle,
        matedCycle,
        closedCycle,
        cancelledCycle,
        foreignCycle,
      ];
      const countsBefore = {
        cycles: cycleCounts(allCycleIds),
        measurements: Number(
          sql(
            `select count(*)::text from public.progesterone_measurements where cycle_id = ${q(plannedTodayCycle)}::uuid`,
          ),
        ),
        litters: Number(
          sql(`select count(*)::text from public.litters where id = ${q(litter)}::uuid`),
        ),
      };
      expect(countsBefore.cycles).toBe(8);
      expect(countsBefore.measurements).toBe(1);

      await login(page);
      await page.goto("/calendar");

      await expect(page.getByLabel("Planning")).toBeVisible();
      await expect(page.getByRole("option", { name: "Cheptel — reproduction" })).toBeAttached();
      await expect(page.getByText(litterTitle)).toBeVisible();
      await expect(page.getByText("Choix du chiot/chaton").first()).toBeVisible();

      const cycleCards = page.locator('[data-calendar-source="reproductive_cycle"]');
      await expect(cycleCards).toHaveCount(4);
      await expect(
        cycleCards.filter({ hasText: plannedTodayName }).getByText("Chaleurs prévues"),
      ).toBeVisible();
      await expect(
        cycleCards.filter({ hasText: inProgressName }).getByText("Chaleurs en cours"),
      ).toBeVisible();
      await expect(page.getByText(plannedFutureName)).toBeVisible();
      await expect(page.getByText(plannedPastName)).toBeVisible();
      await expect(page.getByText(matedName)).toHaveCount(0);
      await expect(page.getByText(closedName)).toHaveCount(0);
      await expect(page.getByText(cancelledName)).toHaveCount(0);
      await expect(page.getByText(foreignName)).toHaveCount(0);
      await expect(page.getByText(secretNote)).toHaveCount(0);
      await expect(page.getByText(labName)).toHaveCount(0);
      await expect(cycleCards.getByText("Jalon")).toHaveCount(0);
      await expect(cycleCards.getByText("Tâche")).toHaveCount(0);
      await expect(cycleCards.getByText("En retard")).toHaveCount(0);

      await page.goto("/calendar?source=reproductive_cycle");
      await expect(page.getByText(litterTitle)).toHaveCount(0);
      await expect(page.getByText("Choix du chiot/chaton")).toHaveCount(0);
      await expect(page.getByLabel("Type (portées)")).toHaveCount(0);
      await expect(page.getByLabel("Catégorie (portées)")).toHaveCount(0);
      await expect(page.locator('[data-calendar-source="reproductive_cycle"]')).toHaveCount(4);
      await expect(page.locator('[data-calendar-source="litter_care"]')).toHaveCount(0);
      await expect(page.locator('[data-calendar-source="adopter_appointment"]')).toHaveCount(0);

      await page.getByRole("link", { name: "Semaine" }).click();
      await expect(page).toHaveURL(/source=reproductive_cycle/);
      await expect(page.getByText(plannedTodayName)).toBeVisible();
      await page.getByRole("link", { name: "Agenda" }).click();
      await expect(page).toHaveURL(/source=reproductive_cycle/);
      await expect(page.getByText("Chaleurs prévues").first()).toBeVisible();
      await expect(page.getByText("Chaleurs en cours").first()).toBeVisible();

      await page.goto("/calendar?source=reproductive_cycle");
      await page
        .locator('[data-calendar-source="reproductive_cycle"]')
        .filter({ hasText: plannedTodayName })
        .first()
        .click();
      await expect(page).toHaveURL(
        new RegExp(`/animals/${motherPlannedToday}/reproduction(?:\\?.*)?#cycle-${plannedTodayCycle}`),
      );
      await expect(page.locator(`#cycle-${plannedTodayCycle}`)).toBeVisible();
      await expect(page.getByRole("button", { name: "Modifier le cycle" }).first()).toBeVisible();

      await page.goto("/calendar/today");
      const reproductionSection = page.getByRole("region", { name: "Reproduction du cheptel" });
      await expect(reproductionSection).toBeVisible();
      await expect(reproductionSection.getByText(plannedTodayName)).toBeVisible();
      await expect(reproductionSection.getByText(inProgressName)).toBeVisible();
      await expect(reproductionSection.getByText(plannedFutureName)).toHaveCount(0);
      await expect(reproductionSection.getByText(plannedPastName)).toHaveCount(0);
      await expect(reproductionSection.getByText(matedName)).toHaveCount(0);
      await expect(reproductionSection.getByText(closedName)).toHaveCount(0);
      await expect(reproductionSection.getByText(cancelledName)).toHaveCount(0);
      await expect(reproductionSection.getByRole("button", { name: "Modifier le cycle" })).toHaveCount(
        0,
      );
      await expect(
        reproductionSection.getByRole("link", { name: "Ouvrir la reproduction" }).first(),
      ).toBeVisible();

      const exportBefore = await page.request.get("/calendar/export");
      expect(exportBefore.ok()).toBeTruthy();
      const icsBefore = unfoldICalendar(await exportBefore.text());
      expect(icsBefore).toContain(`${plannedTodayName} — Chaleurs prévues`);
      expect(icsBefore).toContain(`${inProgressName} — Chaleurs en cours`);
      expect(icsBefore).toContain(`${plannedFutureName} — Chaleurs prévues`);
      expect(icsBefore).toContain(`${plannedPastName} — Chaleurs prévues`);
      expect(icsBefore).toContain(`DTSTART;VALUE=DATE:${ymd(today)}`);
      expect(icsBefore).toContain(`DTSTART;VALUE=DATE:${ymd(inProgressStart)}`);
      expect(icsBefore).toContain("X-SAAS-ELEVAGE-SOURCE:reproductive_cycle");
      expect(icsBefore).toContain("X-SAAS-ELEVAGE-KIND:heat_cycle");
      expect(icsBefore).toContain("CATEGORIES:reproduction");
      expect(icsBefore).toContain(litterTitle);
      expect(icsBefore).toContain("Choix du chiot/chaton");
      expect(icsBefore).not.toContain(matedName);
      expect(icsBefore).not.toContain(closedName);
      expect(icsBefore).not.toContain(cancelledName);
      expect(icsBefore).not.toContain(foreignName);
      expect(icsBefore).not.toContain(secretNote);
      expect(icsBefore).not.toContain(labName);
      expect(icsBefore).not.toContain("12.5");
      expect(icsBefore).not.toContain(plannedTodayCycle);
      expect(icsBefore).not.toContain(motherPlannedToday);
      expect(icsBefore.toLowerCase()).not.toContain("description:");
      expect(icsBefore.toLowerCase()).not.toContain("dosage");
      expect(icsBefore.toLowerCase()).not.toContain("saillie");
      const plannedUid = expectedCycleUid(plannedTodayCycle);
      expect(icsBefore).toContain(`UID:${plannedUid}`);
      const sequenceBefore = Number(
        /SEQUENCE:(\d+)/.exec(
          icsBefore.split(`UID:${plannedUid}`)[1]?.split("END:VEVENT")[0] ?? "",
        )?.[1] ?? "NaN",
      );
      expect(Number.isFinite(sequenceBefore)).toBeTruthy();

      await page.goto(`/animals/${motherPlannedToday}/reproduction`);
      await page.getByRole("button", { name: "Modifier le cycle" }).click();
      const dialog = page.getByRole("dialog");
      const movedDate = addCivilDays(today, 1);
      await dialog.getByLabel("Date de début").fill(movedDate);
      await dialog.getByLabel("Notes").fill(`Note mise à jour ${label}`);
      await dialog.getByRole("button", { name: "Enregistrer" }).click();
      await expect(page.getByText("Le cycle reproductif a été mis à jour.")).toBeVisible();

      await page.goto("/calendar?source=reproductive_cycle");
      await expect(
        page
          .locator(`[data-calendar-date="${movedDate}"]`)
          .locator('[data-calendar-source="reproductive_cycle"]')
          .filter({ hasText: plannedTodayName }),
      ).toBeVisible();

      const exportAfter = await page.request.get("/calendar/export");
      expect(exportAfter.ok()).toBeTruthy();
      const icsAfter = unfoldICalendar(await exportAfter.text());
      expect(icsAfter).toContain(`UID:${plannedUid}`);
      expect(icsAfter).toContain(`DTSTART;VALUE=DATE:${ymd(movedDate)}`);
      const sequenceAfter = Number(
        /SEQUENCE:(\d+)/.exec(
          icsAfter.split(`UID:${plannedUid}`)[1]?.split("END:VEVENT")[0] ?? "",
        )?.[1] ?? "NaN",
      );
      expect(sequenceAfter).toBeGreaterThan(sequenceBefore);
      expect(icsAfter).not.toContain(`Note mise à jour ${label}`);

      setOwnerRole("viewer");
      await page.goto("/calendar?source=reproductive_cycle");
      await expect(page.getByText(inProgressName)).toBeVisible();
      await expect(page.getByRole("button", { name: "Modifier le cycle" })).toHaveCount(0);
      await page
        .locator('[data-calendar-source="reproductive_cycle"]')
        .filter({ hasText: inProgressName })
        .first()
        .click();
      await expect(page).toHaveURL(
        new RegExp(`/animals/${motherInProgress}/reproduction(?:\\?.*)?#cycle-${inProgressCycle}`),
      );
      await expect(page.getByText("Lecture seule")).toBeVisible();
      await expect(page.getByRole("button", { name: "Modifier le cycle" })).toHaveCount(0);

      setOwnerRole("owner");

      expect(cycleCounts(allCycleIds)).toBe(countsBefore.cycles);
      expect(
        Number(
          sql(
            `select count(*)::text from public.progesterone_measurements where cycle_id = ${q(plannedTodayCycle)}::uuid`,
          ),
        ),
      ).toBe(countsBefore.measurements);
      expect(
        Number(sql(`select count(*)::text from public.litters where id = ${q(litter)}::uuid`)),
      ).toBe(countsBefore.litters);
      expect(
        Number(
          sql(
            `select count(*)::text from public.reproductive_cycles where id = ${q(plannedTodayCycle)}::uuid and started_on = ${q(movedDate)}::date`,
          ),
        ),
      ).toBe(1);
    });
  } finally {
    restoreOwnerRole();
  }
});
