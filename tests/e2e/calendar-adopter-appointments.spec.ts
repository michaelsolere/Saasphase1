import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

import { formatLitterJournalBusinessDate } from "../../src/features/litter-journal/date";
import {
  createTestAdopterAppointmentReadyScenario,
  createTestReservationAppointment,
} from "./helpers/fixtures/adopter-appointment-fixtures";
import { createTestReservationNote } from "./helpers/fixtures/adopter-note-fixtures";
import {
  createTestExpectedPayment,
  getAdopterFixtureReservation,
} from "./helpers/fixtures/adopter-payment-fixtures";
import {
  createPlannedLitterCareTask,
  createTestAnimal,
  createTestLitter,
  createTestOrganization,
} from "./helpers/fixtures/breeding-fixtures";
import { withE2eFixtures } from "./helpers/fixtures/fixture-registry";
import { openDialog } from "./helpers/dialogs";
import {
  E2E_OWNER_EMAIL,
  E2E_OWNER_PASSWORD,
  runE2eSqlSync,
} from "./helpers/supabase";

test.setTimeout(240_000);

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const sql = (value: string) => runE2eSqlSync(value);

function unfoldICalendar(value: string) {
  return value.replace(/\r\n[ \t]/g, "");
}

/** July 2026 is CEST (UTC+2): local wall clock → timestamptz. */
function parisTodayIso(today: string, hour: number, minute: number) {
  const utcHour = hour - 2;
  const dayOffset = utcHour < 0 ? -1 : 0;
  const normalizedHour = (utcHour + 24) % 24;
  const [year, month, day] = today.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + dayOffset, normalizedHour, minute, 0));
  return date.toISOString();
}

function localInputValue(today: string, hour: number, minute: number) {
  return `${today}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_OWNER_EMAIL);
  await page.getByLabel("Mot de passe").fill(E2E_OWNER_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}

test("calendrier global agrège portées et rendez-vous adoptants", async ({ page }) => {
  await withE2eFixtures(sql, async (fixtures) => {
    const label = fixtures.namespace.slice(-8);
    const today = formatLitterJournalBusinessDate(new Date());
    const litterTitle = `E2E portée calendrier ${label}`;
    const contactName = `E2E adoptant calendrier ${label}`;
    const noteTitle = `E2E note secrète ${label}`;
    const otherEventTitle = `E2E suivi interdit ${label}`;
    const foreignContactName = `E2E étranger calendrier ${label}`;

    const mother = await createTestAnimal(sql, fixtures, {
      organizationId,
      ownerId,
      callName: `E2E mère calendrier ${fixtures.namespace}`,
    });
    const litter = await createTestLitter(sql, fixtures, {
      organizationId,
      ownerId,
      motherId: mother,
      name: `E2E litter calendrier ${label}`,
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

    const choice = await createTestReservationAppointment(sql, fixtures, {
      organizationId,
      reservationId: reservation.id,
      ownerId,
      kind: "puppy_choice",
      status: "planned",
      plannedAt: parisTodayIso(today, 10, 0),
      description: "Commentaire interne confidentiel",
    });
    const adoption = await createTestReservationAppointment(sql, fixtures, {
      organizationId,
      reservationId: reservation.id,
      ownerId,
      kind: "adoption",
      status: "done",
      plannedAt: parisTodayIso(today, 14, 30),
      actualAt: parisTodayIso(today, 14, 30),
    });

    const postponedScenario = await createTestAdopterAppointmentReadyScenario(sql, fixtures, {
      organizationId,
      ownerId,
      displayName: `E2E reporté calendrier ${label}`,
    });
    const postponedReservation = getAdopterFixtureReservation(
      fixtures,
      postponedScenario.journey.id,
    )!;
    await createTestReservationAppointment(sql, fixtures, {
      organizationId,
      reservationId: postponedReservation.id,
      ownerId,
      kind: "adoption",
      status: "postponed",
      plannedAt: parisTodayIso(today, 16, 0),
      description: "Reporté — ne doit pas apparaître",
    });

    const otherEventId = randomUUID();
    await sql(`
      insert into public.events (
        id, organization_id, reservation_id, event_type, title, description,
        planned_at, status, priority, is_task, created_by, updated_by
      ) values (
        '${otherEventId}'::uuid,
        '${organizationId}'::uuid,
        '${reservation.id}'::uuid,
        'post_adoption_follow_up',
        '${otherEventTitle.replaceAll("'", "''")}',
        'Ne pas projeter',
        '${parisTodayIso(today, 12, 0)}'::timestamptz,
        'planned',
        'normal',
        true,
        '${ownerId}'::uuid,
        '${ownerId}'::uuid
      )
    `);
    fixtures.register("events", otherEventId);

    await createTestExpectedPayment(sql, fixtures, {
      organizationId,
      contactId: scenario.contact.id,
      reservationId: reservation.id,
      ownerId,
      amountCents: 30_000,
    });
    await createTestReservationNote(sql, fixtures, {
      organizationId,
      reservationId: reservation.id,
      ownerId,
      title: noteTitle,
      body: "Note interne hors calendrier",
    });

    const foreignOrg = await createTestOrganization(sql, fixtures);
    const foreign = await createTestAdopterAppointmentReadyScenario(sql, fixtures, {
      organizationId: foreignOrg,
      ownerId,
      displayName: foreignContactName,
    });
    const foreignReservation = getAdopterFixtureReservation(fixtures, foreign.journey.id)!;
    await createTestReservationAppointment(sql, fixtures, {
      organizationId: foreignOrg,
      reservationId: foreignReservation.id,
      ownerId,
      kind: "adoption",
      status: "planned",
      plannedAt: parisTodayIso(today, 11, 0),
    });

    const countsBefore = {
      events: Number(await sql(`select count(*)::text from public.events where id in ('${choice.id}'::uuid, '${adoption.id}'::uuid, '${otherEventId}'::uuid)`)),
      payments: Number(
        await sql(
          `select count(*)::text from public.payments where reservation_id = '${reservation.id}'::uuid`,
        ),
      ),
      notes: Number(
        await sql(
          `select count(*)::text from public.notes where reservation_id = '${reservation.id}'::uuid`,
        ),
      ),
      roles: Number(
        await sql(
          `select count(*)::text from public.contact_roles where contact_id = '${scenario.contact.id}'::uuid`,
        ),
      ),
    };

    await login(page);
    await page.goto("/calendar");

    await expect(page.getByText(litterTitle)).toBeVisible();
    await expect(page.getByText("Choix du chiot/chaton").first()).toBeVisible();
    await expect(page.getByText("Adoption / départ").first()).toBeVisible();
    await expect(page.getByText(contactName).first()).toBeVisible();
    await expect(page.getByText(otherEventTitle)).toHaveCount(0);
    await expect(page.getByText("Reporté — ne doit pas apparaître")).toHaveCount(0);
    await expect(page.getByText(`E2E reporté calendrier ${label}`)).toHaveCount(0);
    await expect(page.getByText(noteTitle)).toHaveCount(0);
    await expect(page.getByText(foreignContactName)).toHaveCount(0);

    const appointmentCards = page.locator('[data-calendar-source="adopter_appointment"]');
    await expect(appointmentCards).toHaveCount(2);

    await page.goto("/calendar?source=litter_care");
    await expect(page.getByText(litterTitle)).toBeVisible();
    await expect(page.locator('[data-calendar-source="adopter_appointment"]')).toHaveCount(0);
    await expect(page.getByText("Choix du chiot/chaton")).toHaveCount(0);

    await page.goto("/calendar?source=adopter_appointment");
    await expect(page.getByText(litterTitle)).toHaveCount(0);
    await expect(page.getByLabel("Type (portées)")).toHaveCount(0);
    await expect(page.getByText("Choix du chiot/chaton").first()).toBeVisible();
    await expect(page.getByText("Adoption / départ").first()).toBeVisible();

    await page.getByRole("link", { name: "Semaine" }).click();
    await expect(page).toHaveURL(/source=adopter_appointment/);
    await expect(page.getByText("Choix du chiot/chaton").first()).toBeVisible();
    await page.getByRole("link", { name: "Agenda" }).click();
    await expect(page).toHaveURL(/source=adopter_appointment/);
    await expect(page.getByText("Adoption / départ").first()).toBeVisible();

    await page.goto("/calendar?source=adopter_appointment");
    await page
      .locator('[data-calendar-source="adopter_appointment"]')
      .filter({ hasText: "Choix du chiot/chaton" })
      .first()
      .locator("[data-calendar-event-link]")
      .click();
    await expect(page).toHaveURL(new RegExp(`/reservations/${reservation.id}(?:\\?.*)?#appointments`));
    await expect(page.getByRole("heading", { name: "Créneaux de rendez-vous" })).toBeVisible();

    await page.goto("/calendar/today");
    const appointmentSection = page.getByRole("region", {
      name: "Rendez-vous adoptants aujourd’hui",
    });
    await expect(appointmentSection).toBeVisible();
    await expect(appointmentSection.getByText("Choix du chiot/chaton")).toBeVisible();
    await expect(appointmentSection.getByText("Adoption / départ")).toBeVisible();
    await expect(appointmentSection.getByText(otherEventTitle)).toHaveCount(0);
    await expect(appointmentSection.getByRole("button", { name: "Réalisé" })).toHaveCount(0);
    await expect(appointmentSection.getByRole("button", { name: "Non applicable" })).toHaveCount(0);
    await expect(appointmentSection.getByText("Ouvrir le parcours adoptant").first()).toBeVisible();

    const dueSection = page.getByRole("region", { name: "À faire aujourd’hui" });
    if ((await dueSection.count()) > 0) {
      await expect(dueSection.getByText("Choix du chiot/chaton")).toHaveCount(0);
      await expect(dueSection.getByText("Adoption / départ")).toHaveCount(0);
    }

    const exportResponse = await page.request.get("/calendar/export");
    expect(exportResponse.ok()).toBeTruthy();
    const ics = await exportResponse.text();
    const unfolded = unfoldICalendar(ics);
    expect(unfolded).toContain("Choix du chiot/chaton");
    expect(unfolded).toContain("Adoption / départ");
    expect(unfolded).toContain(contactName);
    expect(unfolded).toContain(litterTitle);
    expect(unfolded).not.toContain(otherEventTitle);
    expect(unfolded).not.toContain(foreignContactName);
    expect(unfolded).not.toContain(choice.id);
    expect(unfolded).not.toContain(reservation.id);
    expect(unfolded).not.toContain("Commentaire interne");
    expect(unfolded).not.toContain(noteTitle);
    expect(unfolded.toLowerCase()).not.toContain("description:");
    expect([...ics.matchAll(/BEGIN:VEVENT/g)]).toHaveLength(3);

    await page.goto(`/reservations/${reservation.id}#appointments`);
    const choiceCard = page.locator("#appointments .rounded-xl.border").filter({
      has: page.getByRole("heading", { level: 3, name: "Choix du chiot/chaton" }),
    });
    await openDialog(
      choiceCard.getByRole("button", { name: "Modifier" }),
      page.getByRole("dialog").getByRole("heading", { name: "Choix du chiot/chaton" }),
    );
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Créneau proposé").fill(localInputValue(today, 11, 0));
    await Promise.all([
      page.waitForURL((url) => url.searchParams.get("appointment_status") === "success"),
      dialog.getByRole("button", { name: "Enregistrer" }).click(),
    ]);

    await page.goto("/calendar?source=adopter_appointment");
    await expect(
      page
        .locator('[data-calendar-source="adopter_appointment"]')
        .filter({ hasText: "Choix du chiot/chaton" })
        .getByText("11:00"),
    ).toBeVisible();
    await expect(page.locator('[data-calendar-source="adopter_appointment"]')).toHaveCount(2);

    expect(
      Number(
        await sql(
          `select count(*)::text from public.events where id in ('${choice.id}'::uuid, '${adoption.id}'::uuid, '${otherEventId}'::uuid)`,
        ),
      ),
    ).toBe(countsBefore.events);
    expect(
      Number(
        await sql(
          `select count(*)::text from public.payments where reservation_id = '${reservation.id}'::uuid`,
        ),
      ),
    ).toBe(countsBefore.payments);
    expect(
      Number(
        await sql(
          `select count(*)::text from public.notes where reservation_id = '${reservation.id}'::uuid`,
        ),
      ),
    ).toBe(countsBefore.notes);
    expect(
      Number(
        await sql(
          `select count(*)::text from public.contact_roles where contact_id = '${scenario.contact.id}'::uuid`,
        ),
      ),
    ).toBe(countsBefore.roles);
    expect(
      Number(
        await sql(
          `select count(*)::text from public.reservations where id = '${reservation.id}'::uuid and status = 'active'`,
        ),
      ),
    ).toBe(1);
  });
});
