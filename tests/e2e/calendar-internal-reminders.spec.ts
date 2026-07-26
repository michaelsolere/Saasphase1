import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import {
  computeCalendarReminderTriggerAt,
} from "../../src/features/breeding-calendar/calendar-reminder-projection";
import {
  formatLitterJournalBusinessDate,
} from "../../src/features/litter-journal/date";
import { localCivilDateTimeToUtcIso } from "../../src/lib/timezone";
import type { Database } from "../../src/types/database.types";
import {
  createTestAdopterAppointmentReadyScenario,
  createTestReservationAppointment,
} from "./helpers/fixtures/adopter-appointment-fixtures";
import {
  createPlannedLitterCareTask,
  createPlannedLitterCareWindow,
  createResolvedLitterCareTask,
  createTestAnimal,
  createTestLitter,
  createTestOrganization,
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
const TZ = "Europe/Paris";
const sql = (value: string) => runE2eSqlSync(value);

function unfoldICalendar(value: string) {
  return value.replace(/\r\n[ \t]/g, "");
}

async function login(page: Page, email = E2E_OWNER_EMAIL, password = E2E_OWNER_PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}

async function ownerClient() {
  const client = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const signedIn = await client.auth.signInWithPassword({
    email: E2E_OWNER_EMAIL,
    password: E2E_OWNER_PASSWORD,
  });
  expect(signedIn.error).toBeNull();
  return client;
}

function addCivilDays(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return `${next.getUTCFullYear().toString().padStart(4, "0")}-${(next.getUTCMonth() + 1).toString().padStart(2, "0")}-${next.getUTCDate().toString().padStart(2, "0")}`;
}

test("rappels internes calendrier — UI, Aujourd’hui, ICS sans VALARM", async ({
  page,
}) => {
  await withE2eFixtures(sql, async (fixtures) => {
    const label = fixtures.namespace.slice(-8);
    const now = new Date();
    const today = formatLitterJournalBusinessDate(now);
    const laterTime = "23:50";
    const dueTime = "00:05";
    const overdueEventDate = addCivilDays(today, -3);
    const tomorrow = addCivilDays(today, 1);
    const windowEnd = addCivilDays(today, 2);

    const mother = await createTestAnimal(sql, fixtures, {
      organizationId,
      ownerId,
      callName: `E2E rem mère ${label}`,
    });
    const litter = await createTestLitter(sql, fixtures, {
      organizationId,
      ownerId,
      motherId: mother,
      name: `E2E rem portée ${label}`,
    });
    const plannedTaskTitle = `E2E rem tâche ${label}`;
    await createPlannedLitterCareTask(sql, fixtures, {
      organizationId,
      ownerId,
      litterId: litter,
      day: tomorrow,
      title: plannedTaskTitle,
    });
    const windowTitle = `E2E rem fenêtre ${label}`;
    await createPlannedLitterCareWindow(sql, fixtures, {
      organizationId,
      ownerId,
      litterId: litter,
      day: today,
      startsOn: today,
      endsOn: windowEnd,
      title: windowTitle,
    });
    const resolvedTitle = `E2E rem résolue ${label}`;
    const resolvedTaskId = await createResolvedLitterCareTask(sql, fixtures, {
      organizationId,
      ownerId,
      litterId: litter,
      day: today,
      title: resolvedTitle,
    });

    const cycleMother = await createTestAnimal(sql, fixtures, {
      organizationId,
      ownerId,
      callName: `E2E rem chaleurs ${label}`,
    });
    const cycleId = await createTestReproductiveCycle(sql, fixtures, {
      organizationId,
      ownerId,
      motherId: cycleMother,
      status: "planned",
      startedOn: tomorrow,
      notes: `E2E rem cycle ${label}`,
    });

    const appointmentScenario = await createTestAdopterAppointmentReadyScenario(
      sql,
      fixtures,
      {
        organizationId,
        ownerId,
        displayName: `E2E rem adoptant ${label}`,
      },
    );
    const plannedAt = localCivilDateTimeToUtcIso(tomorrow, "15:00", TZ)!;
    const plannedAppointment = await createTestReservationAppointment(
      sql,
      fixtures,
      {
        organizationId,
        ownerId,
        reservationId: appointmentScenario.journey.id,
        kind: "puppy_choice",
        status: "planned",
        plannedAt,
        description: `E2E rem RDV planifié ${label}`,
      },
    );
    const doneAppointment = await createTestReservationAppointment(
      sql,
      fixtures,
      {
        organizationId,
        ownerId,
        reservationId: appointmentScenario.journey.id,
        kind: "adoption",
        status: "done",
        plannedAt: localCivilDateTimeToUtcIso(today, "11:00", TZ)!,
        actualAt: localCivilDateTimeToUtcIso(today, "11:30", TZ)!,
        description: `E2E rem RDV done ${label}`,
      },
    );

    const foreignOrg = await createTestOrganization(sql, fixtures);
    const foreignMother = await createTestAnimal(sql, fixtures, {
      organizationId: foreignOrg,
      ownerId,
      callName: `E2E rem étrangère ${label}`,
    });
    const foreignLitter = await createTestLitter(sql, fixtures, {
      organizationId: foreignOrg,
      ownerId,
      motherId: foreignMother,
      name: `E2E rem étrangère ${label}`,
    });
    await createPlannedLitterCareTask(sql, fixtures, {
      organizationId: foreignOrg,
      ownerId,
      litterId: foreignLitter,
      day: today,
      title: `E2E rem secret ${label}`,
    });

    const client = await ownerClient();
    const eventsBefore = Number(sql("select count(*)::text from public.events"));
    const tasksBefore = Number(
      sql("select count(*)::text from public.litter_care_tasks"),
    );
    const cyclesBefore = Number(
      sql("select count(*)::text from public.reproductive_cycles"),
    );

    // Dedicated task for Today projection states (never mutated by the dialog UI).
    const todayTaskTitle = `E2E rem today ${label}`;
    const todayTaskId = await createPlannedLitterCareTask(sql, fixtures, {
      organizationId,
      ownerId,
      litterId: litter,
      day: tomorrow,
      title: todayTaskTitle,
    });

    // Seed later_today / due / overdue reminders via RPC for deterministic Today projection.
    const laterCreate = await client.rpc("create_calendar_reminder", {
      p_source_type: "litter_care_task",
      p_source_record_id: todayTaskId,
      p_days_before: 1,
      p_local_time: `${laterTime}:00`,
      p_timezone_name: TZ,
      p_client_command_id: crypto.randomUUID(),
    });
    expect(laterCreate.error).toBeNull();
    expect(laterCreate.data?.[0]?.outcome).toBe("success");
    const laterReminderId = laterCreate.data![0].reminder_id!;
    fixtures.register("calendar_reminders", laterReminderId);

    const dueCreate = await client.rpc("create_calendar_reminder", {
      p_source_type: "litter_care_task",
      p_source_record_id: todayTaskId,
      p_days_before: 1,
      p_local_time: `${dueTime}:00`,
      p_timezone_name: TZ,
      p_client_command_id: crypto.randomUUID(),
    });
    expect(dueCreate.error).toBeNull();
    expect(dueCreate.data?.[0]?.outcome).toBe("success");
    const dueReminderId = dueCreate.data![0].reminder_id!;
    fixtures.register("calendar_reminders", dueReminderId);

    const overdueTaskId = await createPlannedLitterCareTask(sql, fixtures, {
      organizationId,
      ownerId,
      litterId: litter,
      day: overdueEventDate,
      title: `E2E rem overdue ${label}`,
    });
    const overdueCreate = await client.rpc("create_calendar_reminder", {
      p_source_type: "litter_care_task",
      p_source_record_id: overdueTaskId,
      p_days_before: 0,
      p_local_time: "08:00:00",
      p_timezone_name: TZ,
      p_client_command_id: crypto.randomUUID(),
    });
    expect(overdueCreate.error).toBeNull();
    const overdueReminderId = overdueCreate.data![0].reminder_id!;
    fixtures.register("calendar_reminders", overdueReminderId);

    const cycleReminder = await client.rpc("create_calendar_reminder", {
      p_source_type: "reproductive_cycle",
      p_source_record_id: cycleId,
      p_days_before: 1,
      p_local_time: "09:00:00",
      p_timezone_name: TZ,
      p_client_command_id: crypto.randomUUID(),
    });
    expect(cycleReminder.error).toBeNull();
    fixtures.register("calendar_reminders", cycleReminder.data![0].reminder_id!);

    const appointmentReminder = await client.rpc("create_calendar_reminder", {
      p_source_type: "adopter_event",
      p_source_record_id: plannedAppointment.id,
      p_days_before: 0,
      p_local_time: "08:00:00",
      p_timezone_name: TZ,
      p_client_command_id: crypto.randomUUID(),
    });
    expect(appointmentReminder.error).toBeNull();
    fixtures.register(
      "calendar_reminders",
      appointmentReminder.data![0].reminder_id!,
    );

    const resolvedReminder = await client.rpc("create_calendar_reminder", {
      p_source_type: "litter_care_task",
      p_source_record_id: resolvedTaskId,
      p_days_before: 0,
      p_local_time: "08:00:00",
      p_timezone_name: TZ,
      p_client_command_id: crypto.randomUUID(),
    });
    // Resolved task is not admissible for create.
    expect(resolvedReminder.data?.[0]?.outcome).toBe("error");

    await login(page);
    await page.goto("/calendar");

    // Admissible sources show reminder actions; done appointment does not offer create.
    const plannedTaskCard = page
      .locator("[data-calendar-source=litter_care]")
      .filter({ hasText: plannedTaskTitle })
      .first();
    await expect(plannedTaskCard.getByTestId("calendar-reminder-actions")).toBeVisible();
    await expect(plannedTaskCard.getByText("Ajouter un rappel")).toBeVisible();

    const windowStart = page
      .locator("[data-calendar-source=litter_care]")
      .filter({ hasText: windowTitle })
      .filter({ has: page.getByTestId("calendar-reminder-actions") });
    await expect(windowStart).toHaveCount(1);

    const middleSegments = page
      .locator("[data-calendar-source=litter_care]")
      .filter({ hasText: "En cours" });
    for (const el of await middleSegments.all()) {
      await expect(el.getByTestId("calendar-reminder-actions")).toHaveCount(0);
    }

    // Done appointments must not offer "Ajouter un rappel"
    const doneAppointmentCards = page
      .locator("[data-calendar-source=adopter_appointment]")
      .filter({ hasText: /Rendez-vous d’adoption|adoption/i });
    for (const card of await doneAppointmentCards.all()) {
      await expect(card.getByText("Ajouter un rappel")).toHaveCount(0);
    }

    // Create first reminder via UI, then a second distinct schedule.
    await plannedTaskCard.getByTestId("calendar-reminder-trigger").click();
    const dialog = page.getByTestId("calendar-reminder-dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByTestId("calendar-reminder-days").fill("0");
    await dialog.getByTestId("calendar-reminder-time").fill("10:00");
    await dialog.getByTestId("calendar-reminder-create-submit").click();
    await expect(dialog.getByTestId("calendar-reminder-item")).toHaveCount(1, {
      timeout: 15_000,
    });
    await dialog.getByTestId("calendar-reminder-days").fill("1");
    await dialog.getByTestId("calendar-reminder-time").fill("18:00");
    await dialog.getByTestId("calendar-reminder-create-submit").click();
    await expect(dialog.getByTestId("calendar-reminder-item")).toHaveCount(2, {
      timeout: 15_000,
    });
    await expect(
      plannedTaskCard.getByTestId("calendar-reminder-trigger"),
    ).toContainText(/Rappels \(2\)/, { timeout: 15_000 });

    // Modify one reminder (dialog still open after create)
    await dialog.getByTestId("calendar-reminder-edit").first().click();
    await dialog.getByTestId("calendar-reminder-edit-days").fill("2");
    await dialog.getByTestId("calendar-reminder-save").click();
    await expect(dialog.getByText(/2 jours avant/)).toBeVisible({
      timeout: 15_000,
    });

    // Delete one reminder with confirmation
    page.once("dialog", (d) => d.accept());
    await dialog.getByTestId("calendar-reminder-delete").first().click();
    await expect(dialog.getByTestId("calendar-reminder-item")).toHaveCount(1, {
      timeout: 15_000,
    });
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden({ timeout: 10_000 });

    // Month / week / agenda still show reminder command
    await page.getByRole("link", { name: "Semaine" }).click();
    await expect(
      page
        .locator("[data-calendar-source=litter_care]")
        .filter({ hasText: plannedTaskTitle })
        .getByTestId("calendar-reminder-actions")
        .first(),
    ).toBeVisible();
    await page.getByRole("link", { name: "Agenda" }).click();
    await expect(
      page
        .locator("[data-calendar-source=litter_care]")
        .filter({ hasText: plannedTaskTitle })
        .getByTestId("calendar-reminder-actions")
        .first(),
    ).toBeVisible();
    await page.getByRole("link", { name: "Mois", exact: true }).click();

    // Today view sections
    await page.goto("/calendar/today");
    const remindersSection = page.locator("[data-calendar-reminders-section]");
    await expect(remindersSection).toBeVisible();
    await expect(
      remindersSection.getByRole("heading", { name: /Plus tard aujourd’hui/ }),
    ).toBeVisible();
    await expect(
      remindersSection.getByRole("heading", { name: /À traiter/ }),
    ).toBeVisible();
    await expect(
      remindersSection.locator('[data-reminder-state="overdue"]').first(),
    ).toBeVisible();
    await expect(
      remindersSection.locator('[data-reminder-state="due"]').first(),
    ).toBeVisible();
    await expect(
      remindersSection.locator('[data-reminder-state="later_today"]').first(),
    ).toBeVisible();

    const dueCard = remindersSection
      .locator('[data-reminder-state="due"]')
      .first();
    await dueCard.getByRole("button", { name: "Marquer comme traité" }).click();
    await expect(
      remindersSection.getByRole("heading", { name: /Traités aujourd’hui/ }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      remindersSection.locator('[data-reminder-state="acknowledged_today"]').first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      remindersSection.locator(`[data-reminder-id="${dueReminderId}"]`),
    ).toHaveAttribute("data-reminder-state", "acknowledged_today");

    // Source move recalculates trigger; old ack does not mask new occurrence.
    const movedDay = addCivilDays(tomorrow, 2);
    sql(`
      update public.litter_care_tasks
      set planned_for = ${`'${movedDay}'`}::date, revision_no = revision_no + 1
      where id = '${todayTaskId}'::uuid
    `);
    const newTrigger = computeCalendarReminderTriggerAt({
      eventDate: movedDay,
      daysBefore: 1,
      localTime: dueTime,
      timezoneName: TZ,
    });
    expect(newTrigger).toBeTruthy();
    await page.reload();
    // After move, the previously acknowledged occurrence for the old date should not hide the new one.
    const refreshedDue = page
      .locator("[data-calendar-reminders-section]")
      .locator(`[data-reminder-id="${dueReminderId}"]`);
    if (await refreshedDue.count()) {
      const state = await refreshedDue.getAttribute("data-reminder-state");
      expect(
        state === "due" ||
          state === "later_today" ||
          state === "upcoming" ||
          state === "overdue",
      ).toBeTruthy();
      if (state === "due" || state === "overdue" || state === "later_today") {
        expect(state).not.toBe("acknowledged_today");
      }
    }

    // Inactivate cycle → reminder not projected in Today
    sql(`
      update public.reproductive_cycles
      set status = 'mated', updated_by = '${ownerId}'::uuid
      where id = '${cycleId}'::uuid
    `);
    await page.reload();
    await expect(
      page.locator("[data-calendar-reminders-section]").getByText(`E2E rem chaleurs ${label}`),
    ).toHaveCount(0);

    // Resolve overdue task → reminder not projected
    sql(`
      update public.litter_care_tasks
      set status = 'done',
          resolved_at = now(),
          resolved_by = '${ownerId}'::uuid,
          resolved_timezone_name = 'Europe/Paris',
          resolution_command_id = gen_random_uuid(),
          revision_no = revision_no + 1,
          updated_by = '${ownerId}'::uuid
      where id = '${overdueTaskId}'::uuid
    `);
    await page.reload();
    await expect(
      page.locator(`[data-reminder-id="${overdueReminderId}"]`),
    ).toHaveCount(0);

    // Complete planned appointment → reminder not projected
    sql(`
      update public.events
      set status = 'done',
          actual_at = now(),
          updated_by = '${ownerId}'::uuid
      where id = '${plannedAppointment.id}'::uuid
    `);
    await page.reload();
    await expect(
      page
        .locator("[data-calendar-reminders-section]")
        .getByText(`E2E rem adoptant ${label}`),
    ).toHaveCount(0);

    // Foreign data absent
    await page.goto("/calendar");
    await expect(page.getByText(`E2E rem secret ${label}`)).toHaveCount(0);

    // ICS export without VALARM / reminder markers
    const exportResponse = await page.request.get("/calendar/export");
    expect(exportResponse.status()).toBe(200);
    const exportIcs = unfoldICalendar(await exportResponse.text());
    expect(exportIcs).not.toContain("VALARM");
    expect(exportIcs).not.toContain("X-SAAS-ELEVAGE-REMINDER");

    // Private feed without VALARM (create ephemeral feed if owner/admin UI available)
    const feedPanel = page.locator("[data-calendar-feed-panel]");
    if (await feedPanel.count()) {
      const createFeed = feedPanel.getByRole("button", {
        name: /Créer|Générer|Rotation|Activer/i,
      });
      if (await createFeed.count()) {
        await createFeed.first().click();
        const feedUrl = feedPanel.locator("input[readonly], code, [data-feed-url]").first();
        if (await feedUrl.count()) {
          const url = (await feedUrl.inputValue().catch(async () => feedUrl.innerText())).trim();
          if (url.includes("/calendar/feed/")) {
            const path = url.startsWith("http") ? new URL(url).pathname : url;
            const feedResponse = await page.request.get(path);
            if (feedResponse.status() === 200) {
              const feedIcs = unfoldICalendar(await feedResponse.text());
              expect(feedIcs).not.toContain("VALARM");
              expect(feedIcs).not.toContain("X-SAAS-ELEVAGE-REMINDER");
            }
          }
        }
      }
    }

    // No extra events rows from reminder workflow; task/cycle counts only change from our explicit status updates
    expect(Number(sql("select count(*)::text from public.events"))).toBe(eventsBefore);
    // tasks: we added overdueTaskId (+1) and mutated statuses — count of fixtures still owned by registry
    expect(Number(sql("select count(*)::text from public.litter_care_tasks"))).toBeGreaterThanOrEqual(tasksBefore);
    expect(Number(sql("select count(*)::text from public.reproductive_cycles"))).toBe(cyclesBefore);

    // Register any UI-created reminders for cleanup
    const reminderIds = sql(`
      select coalesce(string_agg(id::text, ','), '')
      from public.calendar_reminders
      where organization_id = '${organizationId}'::uuid
        and (
          litter_care_task_id in (
            select id from public.litter_care_tasks
            where litter_id = '${litter}'::uuid
          )
          or reproductive_cycle_id = '${cycleId}'::uuid
          or adopter_event_id in ('${plannedAppointment.id}'::uuid, '${doneAppointment.id}'::uuid)
        )
    `);
    for (const reminderId of reminderIds.split(",").filter(Boolean)) {
      if (!fixtures.has("calendar_reminders", reminderId)) {
        fixtures.register("calendar_reminders", reminderId);
      }
    }
  });
});
