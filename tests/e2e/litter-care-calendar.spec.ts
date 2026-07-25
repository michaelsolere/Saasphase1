import { expect, test, type Page } from "@playwright/test";

import { formatLitterJournalBusinessDate } from "../../src/features/litter-journal/date";
import { E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD, runE2eSqlSync } from "./helpers/supabase";

test.setTimeout(240_000);

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const ownerMembershipId = "30000000-0000-4000-8000-000000000001";
const prefix = "9f260003-0000-4000-8000-0000000000";
const namePrefix = "E2E calendrier portée";
const ids = { mother: `${prefix}01`, litter: `${prefix}10`, milestone: `${prefix}20`, timed: `${prefix}21`, recurring: `${prefix}22`, window: `${prefix}23`, done: `${prefix}24`, other: `${prefix}25` };
const todayDate = formatLitterJournalBusinessDate(new Date());
const currentMonth = todayDate.slice(0, 7);

function dateInMonth(month: string, day: number) { return `${month}-${day.toString().padStart(2, "0")}`; }
function formatMonthLabel(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));
}
function adjacentMonth(month: string, difference: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + difference, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}
function weekStart(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day));
  return new Date(value.getTime() - ((value.getUTCDay() + 6) % 7) * 86_400_000).toISOString().slice(0, 10);
}
function addDays(date: string, difference: number) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + difference)).toISOString().slice(0, 10);
}
function nextWeek(date: string, difference: number) { return addDays(date, difference * 7); }
function weekEnd(date: string) { return addDays(date, 6); }

function q(value: string) { return `'${value.replaceAll("'", "''")}'`; }
function sql(statement: string) { return runE2eSqlSync(statement); }
function cleanup() {
  sql(`
    set session_replication_role = replica;
    update public.memberships set role = 'owner' where id = ${q(ownerMembershipId)}::uuid and organization_id = ${q(organizationId)}::uuid and profile_id = ${q(ownerId)}::uuid;
    set session_replication_role = origin;
    delete from public.litter_care_tasks where id::text like '9f260003-%' or litter_id::text like '9f260003-%' or creation_command_id::text like '9f260003-%' or title like ${q(`${namePrefix}%`)};
    delete from public.litters where id::text like '9f260003-%' or name like ${q(`${namePrefix}%`)};
    delete from public.animals where id::text like '9f260003-%';
  `);
}
function remaining() {
  return JSON.parse(sql(`select json_build_object(
    'tasks', (select count(*) from public.litter_care_tasks where id::text like '9f260003-%' or litter_id::text like '9f260003-%' or creation_command_id::text like '9f260003-%' or title like ${q(`${namePrefix}%`)}),
    'litters', (select count(*) from public.litters where id::text like '9f260003-%' or name like ${q(`${namePrefix}%`)}),
    'animals', (select count(*) from public.animals where id::text like '9f260003-%'),
    'membership_role_changes', (select count(*) from public.memberships where id = ${q(ownerMembershipId)}::uuid and role <> 'owner')
  )::text;`)) as Record<string, number>;
}
function expectClean() { for (const [name, value] of Object.entries(remaining())) expect(value, `${name} must be zero`).toBe(0); }
function fixtures() {
  sql(`
    insert into public.animals (id, organization_id, call_name, species, breed, sex, status, ownership_status, created_by, updated_by)
    values (${q(ids.mother)}::uuid, ${q(organizationId)}::uuid, 'Mère calendrier E2E', 'dog', 'Golden Retriever', 'female', 'breeding', 'owned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);
    insert into public.litters (id, organization_id, name, species, breed, mother_id, status, created_by, updated_by)
    values (${q(ids.litter)}::uuid, ${q(organizationId)}::uuid, ${q(`${namePrefix} active`)}, 'dog', 'Golden Retriever', ${q(ids.mother)}::uuid, 'birth_expected', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);
    insert into public.litter_care_tasks (id, organization_id, litter_id, source, occurrence_no, item_kind, category, target_scope, title, planned_for, scheduled_local_time, schedule_timezone_name, suggested_starts_on, suggested_ends_on, retained_starts_on, retained_starts_local_time, retained_ends_on, retained_ends_local_time, priority, schedule_source, is_schedule_locked, schedule_locked_at, schedule_locked_by, status, creation_command_id, created_by, updated_by) values
    (${q(ids.milestone)}::uuid, ${q(organizationId)}::uuid, ${q(ids.litter)}::uuid, 'manual', 1, 'milestone', 'preparation', 'litter', ${q(`${namePrefix} jalon`)}, ${q(dateInMonth(currentMonth, 8))}, null, 'Europe/Paris', null, null, null, null, null, null, 'normal', 'suggested', false, null, null, 'planned', ${q(`${prefix}40`)}::uuid, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
    (${q(ids.timed)}::uuid, ${q(organizationId)}::uuid, ${q(ids.litter)}::uuid, 'manual', 1, 'task', 'veterinary', 'litter', ${q(`${namePrefix} tâche importante`)}, ${q(dateInMonth(currentMonth, 10))}, '09:30', 'Europe/Paris', null, null, null, null, null, null, 'important', 'manual', false, null, null, 'planned', ${q(`${prefix}41`)}::uuid, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
    (${q(ids.recurring)}::uuid, ${q(organizationId)}::uuid, ${q(ids.litter)}::uuid, 'manual', 2, 'recurring_task', 'offspring_weight', 'all_offspring', ${q(`${namePrefix} occurrence`)}, ${q(dateInMonth(currentMonth, 12))}, null, 'Europe/Paris', null, null, null, null, null, null, 'normal', 'suggested', false, null, null, 'planned', ${q(`${prefix}42`)}::uuid, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
    (${q(ids.window)}::uuid, ${q(organizationId)}::uuid, ${q(ids.litter)}::uuid, 'manual', 1, 'window', 'veterinary', 'litter', ${q(`${namePrefix} fenêtre vétérinaire`)}, null, null, 'Europe/Paris', ${q(dateInMonth(currentMonth, 13))}, ${q(dateInMonth(currentMonth, 15))}, ${q(dateInMonth(currentMonth, 13))}, '08:00', ${q(dateInMonth(currentMonth, 15))}, '18:00', 'important', 'manual', true, '2026-01-01T09:00:00Z', ${q(ownerId)}::uuid, 'planned', ${q(`${prefix}43`)}::uuid, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
    (${q(ids.done)}::uuid, ${q(organizationId)}::uuid, ${q(ids.litter)}::uuid, 'manual', 1, 'task', 'veterinary', 'litter', ${q(`${namePrefix} terminée`)}, ${q(dateInMonth(currentMonth, 17))}, null, 'Europe/Paris', null, null, null, null, null, null, 'normal', 'suggested', false, null, null, 'planned', ${q(`${prefix}44`)}::uuid, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
    (${q(ids.other)}::uuid, ${q(organizationId)}::uuid, ${q(ids.litter)}::uuid, 'manual', 1, 'task', 'other', 'litter', ${q(`${namePrefix} autre catégorie`)}, ${q(dateInMonth(currentMonth, 20))}, null, 'Europe/Paris', null, null, null, null, null, null, 'normal', 'suggested', false, null, null, 'planned', ${q(`${prefix}45`)}::uuid, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);
    update public.litter_care_tasks set status = 'done', resolution_command_id = ${q(`${prefix}46`)}::uuid, resolved_at = ${q(`${dateInMonth(currentMonth, 17)}T10:00:00Z`)}::timestamptz, resolved_timezone_name = 'Europe/Paris', resolved_by = ${q(ownerId)}::uuid where id = ${q(ids.done)}::uuid;
  `);
}
async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_OWNER_EMAIL);
  await page.getByLabel("Mot de passe").fill(E2E_OWNER_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).not.toHaveURL(/\/login$/, { timeout: 30_000 });
}

test("affiche le calendrier mensuel en lecture seule et nettoie ses fixtures", async ({ page }) => {
  cleanup(); expectClean();
  try {
    fixtures();
    await login(page);
    const journalUrl = `/litters/journal?litter=${ids.litter}`;
    const calendarUrl = `/litters/journal/calendar?litter=${ids.litter}`;
    await page.goto(calendarUrl);
    await page.waitForURL((url) =>
      url.pathname === "/litters/journal/calendar" && url.searchParams.get("litter") === ids.litter,
    );
    await expect(page.getByRole("heading", { name: "Calendrier de la portée" })).toBeVisible();
    await page.goto(journalUrl);
    await page.waitForURL((url) =>
      url.pathname === "/litters/journal" && url.searchParams.get("litter") === ids.litter,
    );
    const calendarLink = page.getByRole("link", { name: "Ouvrir le calendrier" });
    await expect(calendarLink).toHaveAttribute("href", calendarUrl);
    await calendarLink.click();
    await page.waitForURL((url) =>
      url.pathname === "/litters/journal/calendar" && url.searchParams.get("litter") === ids.litter,
    );
    await expect(page.getByRole("heading", { name: `${namePrefix} active` })).toBeVisible();
    const exportLink = page.getByRole("link", { name: "Télécharger le fichier iCalendar" });
    await expect(exportLink).toBeVisible();
    await expect(exportLink).toHaveAttribute("href", new RegExp(`^/litters/journal/calendar/export\\?litter=${ids.litter}&kind=all&category=all$`));
    await expect(page.getByText("Fichier à importer manuellement dans un agenda externe ; l’abonnement synchronisé n’est pas encore disponible.")).toBeVisible();
    const download = await page.request.get(await exportLink.getAttribute("href")!);
    expect(download.status()).toBe(200);
    expect(download.headers()["content-type"]).toBe("text/calendar; charset=utf-8");
    expect(download.headers()["cache-control"]).toBe("private, no-store");
    expect(download.headers()["content-disposition"]).toMatch(/^attachment; filename="e2e-calendrier-portee-active-journal\.ics"$/);
    const ical = await download.text();
    expect(ical).toContain(`${namePrefix} jalon`); expect(ical).toContain(`${namePrefix} occurrence`);
    expect(ical).toContain(`${namePrefix} fenêtre vétérinaire`); expect(ical.match(/BEGIN:VEVENT/g)).toHaveLength(5);
    expect(ical).not.toContain(`${namePrefix} terminée`); expect(ical).not.toContain(ids.litter);
    await expect(page.getByText(formatMonthLabel(currentMonth))).toBeVisible();
    await expect(page.getByText("Lun")).toBeVisible(); await expect(page.getByText("Dim")).toBeVisible();
    await expect(page.getByText(`${namePrefix} jalon`)).toBeVisible();
    await expect(page.getByText(`${namePrefix} occurrence`)).toBeVisible();
    const windowCards = page.getByRole("link").filter({ hasText: `${namePrefix} fenêtre vétérinaire` });
    await expect(windowCards).toHaveCount(2);
    await expect(windowCards.filter({ hasText: "Début" })).toHaveCount(1);
    await expect(windowCards.filter({ hasText: "Fin" })).toHaveCount(1);
    const lockedWindowLabels = page.getByText("🔒 Verrouillée", { exact: true });
    await expect(lockedWindowLabels).toHaveCount(3);
    const lockedWindowCards = page.getByRole("link").filter({ hasText: "🔒 Verrouillée" });
    await expect(lockedWindowCards).toHaveCount(3);
    await expect(lockedWindowCards.getByText("Ajustée", { exact: true })).toHaveCount(3);
    await expect(lockedWindowCards.filter({ hasText: "Début" })).toHaveCount(1);
    await expect(lockedWindowCards.filter({ hasText: "En cours" })).toHaveCount(1);
    await expect(lockedWindowCards.filter({ hasText: "Fin" })).toHaveCount(1);
    const adjustedPointCard = page.getByRole("link").filter({ hasText: `${namePrefix} tâche importante` });
    await expect(adjustedPointCard).toHaveCount(1);
    await expect(adjustedPointCard.getByText("Ajustée", { exact: true })).toHaveCount(1);
    await expect(page.getByText(`${namePrefix} terminée`)).toHaveCount(0);
    await page.getByLabel("Catégorie").selectOption("other"); await page.getByRole("button", { name: "Appliquer" }).click();
    await expect(page.getByText(`${namePrefix} autre catégorie`)).toBeVisible(); await expect(page.getByText(`${namePrefix} jalon`)).toHaveCount(0);
    await expect(exportLink).toHaveAttribute("href", new RegExp(`litter=${ids.litter}&kind=all&category=other`));
    await page.getByLabel("Type d’élément").selectOption("recurring_task"); await page.getByRole("button", { name: "Appliquer" }).click();
    await expect(page.getByText("Aucun élément ne correspond aux filtres sélectionnés.")).toBeVisible();
    await page.getByRole("link", { name: "Réinitialiser" }).click(); await expect(page.getByText(`${namePrefix} occurrence`)).toBeVisible();
    const nextMonth = adjacentMonth(currentMonth, 1);
    await page.getByRole("link", { name: "Mois suivant" }).click(); await page.waitForURL((url) => url.searchParams.get("month") === nextMonth); await expect(page.getByText(formatMonthLabel(nextMonth))).toBeVisible(); await page.getByRole("link", { name: "Mois précédent" }).click();
    await expect(page.getByText(formatMonthLabel(currentMonth))).toBeVisible(); await page.getByRole("link", { name: "Aujourd’hui" }).click();
    await expect(page.getByText(formatMonthLabel(currentMonth))).toBeVisible();
    const weekDate = dateInMonth(currentMonth, 13);
    const weekStartDate = weekStart(weekDate);
    await page.goto(`${calendarUrl}&view=week&date=${weekDate}&kind=window&category=veterinary`);
    const weekSection = page.getByRole("region", { name: `Semaine du ${weekStartDate} au ${weekEnd(weekStartDate)}` });
    await expect(weekSection).toBeVisible();
    await expect(page.getByRole("link", { name: "Mois" })).toHaveAttribute("href", new RegExp(`litter=${ids.litter}.*kind=window.*category=veterinary`));
    await expect(weekSection.getByText(`${namePrefix} fenêtre vétérinaire`, { exact: true })).toHaveCount(2);
    await expect(weekSection.getByText("08:00", { exact: true })).toHaveCount(1);
    await page.getByRole("link", { name: "Semaine suivante" }).click();
    await page.waitForURL((url) => url.searchParams.get("date") === nextWeek(weekStartDate, 1));
    await page.getByRole("link", { name: "Semaine précédente" }).click();
    await page.waitForURL((url) => url.searchParams.get("date") === weekStartDate);
    await page.getByRole("link", { name: "Agenda" }).click();
    await page.waitForURL((url) => url.searchParams.get("view") === "agenda" && url.searchParams.get("date") === weekStartDate);
    const agendaSection = page.getByRole("region", { name: `Agenda du ${weekStartDate} au ${weekEnd(weekStartDate)}` });
    await expect(agendaSection).toBeVisible();
    await expect(agendaSection.getByText(`${namePrefix} fenêtre vétérinaire`, { exact: true })).toHaveCount(1);
    await expect(agendaSection.getByText(`Du ${dateInMonth(currentMonth, 13)} à 08:00 au ${dateInMonth(currentMonth, 15)} à 18:00`, { exact: true })).toBeVisible();
    const agendaDates = await agendaSection.locator("[data-agenda-date]").evaluateAll((elements) => elements.map((element) => element.getAttribute("data-agenda-date")));
    expect(agendaDates).toEqual([...agendaDates].sort());
    await page.setViewportSize({ width: 375, height: 800 }); await page.goto(`${calendarUrl}&view=agenda&date=${weekDate}`);
    const agendaMobileLayout = await page.evaluate(() => ({ bodyClientWidth: document.body.clientWidth, bodyScrollWidth: document.body.scrollWidth }));
    expect(agendaMobileLayout.bodyScrollWidth).toBeLessThanOrEqual(agendaMobileLayout.bodyClientWidth + 1);
    await page.goto(calendarUrl); await page.getByText(`${namePrefix} jalon`).click();
    await expect(page).toHaveURL(/#litter-care-tasks$/);
    await page.setViewportSize({ width: 375, height: 800 }); await page.goto(calendarUrl);
    const mobileLayout = await page.evaluate(() => {
      const calendar = document.querySelector<HTMLElement>('section[aria-label^="Calendrier "]');
      if (!calendar) throw new Error("Calendar scroll container not found.");
      const rect = calendar.getBoundingClientRect();
      const style = window.getComputedStyle(calendar);
      return { viewportWidth: window.innerWidth, bodyClientWidth: document.body.clientWidth, bodyScrollWidth: document.body.scrollWidth, calendarLeft: rect.left, calendarRight: rect.right, calendarClientWidth: calendar.clientWidth, calendarScrollWidth: calendar.scrollWidth, calendarOverflowX: style.overflowX };
    });
    expect(mobileLayout.viewportWidth).toBe(375);
    expect(mobileLayout.bodyScrollWidth).toBeLessThanOrEqual(mobileLayout.bodyClientWidth + 1);
    expect(mobileLayout.calendarLeft).toBeGreaterThanOrEqual(0);
    expect(mobileLayout.calendarRight).toBeLessThanOrEqual(mobileLayout.viewportWidth + 1);
    expect(mobileLayout.calendarOverflowX).toBe("auto");
    expect(mobileLayout.calendarScrollWidth).toBeGreaterThan(mobileLayout.calendarClientWidth);
  } finally { cleanup(); expectClean(); }
});
