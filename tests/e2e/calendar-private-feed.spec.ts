import { createHash } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

import { formatLitterJournalBusinessDate } from "../../src/features/litter-journal/date";
import {
  createTestAdopterAppointmentReadyScenario,
  createTestReservationAppointment,
} from "./helpers/fixtures/adopter-appointment-fixtures";
import { createTestReservationNote } from "./helpers/fixtures/adopter-note-fixtures";
import { getAdopterFixtureReservation } from "./helpers/fixtures/adopter-payment-fixtures";
import {
  createPlannedLitterCareTask,
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

test.setTimeout(360_000);

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const ownerMembershipId = "30000000-0000-4000-8000-000000000001";
const sql = (value: string) => runE2eSqlSync(value);
const q = (value: string) => `'${value.replaceAll("'", "''")}'`;

function unfoldICalendar(value: string) {
  return value.replace(/\r\n[ \t]/g, "");
}

function expectedCycleUid(cycleId: string) {
  return `${createHash("sha256").update(`reproductive-cycle:${cycleId}`).digest("hex")}@saas-elevage`;
}

function parisTodayIso(today: string, hour: number, minute: number) {
  const utcHour = hour - 2;
  const dayOffset = utcHour < 0 ? -1 : 0;
  const normalizedHour = (utcHour + 24) % 24;
  const [year, month, day] = today.split("-").map(Number);
  const date = new Date(
    Date.UTC(year, month - 1, day + dayOffset, normalizedHour, minute, 0),
  );
  return date.toISOString();
}

function setOwnerRole(role: "owner" | "admin" | "member" | "viewer") {
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
      where id = ${q(ownerMembershipId)}::uuid and role = 'owner' and status = 'active'
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

function feedCounts(ids: string[]) {
  if (ids.length === 0) return 0;
  return Number(
    sql(
      `select count(*)::text from public.organization_calendar_feeds where id in (${ids.map((id) => `${q(id)}::uuid`).join(",")})`,
    ),
  );
}

test("abonnement iCalendar privé : création, sources, rotation, révocation", async ({
  page,
  browser,
}) => {
  await withE2eFixtures(sql, async (fixtures) => {
    sql(`
      set session_replication_role = replica;
      delete from public.organization_calendar_feeds
      where organization_id = ${q(organizationId)}::uuid;
      set session_replication_role = origin;
    `);

    const label = fixtures.namespace.slice(-8);
    const today = formatLitterJournalBusinessDate(new Date());
    const litterTitle = `E2E feed portée ${label}`;
    const contactName = `E2E feed adoptant ${label}`;
    const noteTitle = `E2E feed note secrète ${label}`;
    const foreignLitterTitle = `E2E feed étrangère ${label}`;
    const foreignContactName = `E2E feed étranger ${label}`;
    const cycleNotes = `E2E feed notes cycle ${label}`;

    const mother = await createTestAnimal(sql, fixtures, {
      organizationId,
      ownerId,
      callName: `E2E feed mère ${fixtures.namespace}`,
    });
    const litter = await createTestLitter(sql, fixtures, {
      organizationId,
      ownerId,
      motherId: mother,
      name: `E2E feed litter ${label}`,
    });
    const taskId = await createPlannedLitterCareTask(sql, fixtures, {
      organizationId,
      ownerId,
      litterId: litter,
      day: today,
      title: litterTitle,
    });

    const cycleId = await createTestReproductiveCycle(sql, fixtures, {
      organizationId,
      ownerId,
      motherId: mother,
      status: "in_progress",
      startedOn: today,
      notes: cycleNotes,
    });

    const scenario = await createTestAdopterAppointmentReadyScenario(sql, fixtures, {
      organizationId,
      ownerId,
      displayName: contactName,
    });
    const reservation = getAdopterFixtureReservation(fixtures, scenario.journey.id)!;
    const appointment = await createTestReservationAppointment(sql, fixtures, {
      organizationId,
      reservationId: reservation.id,
      ownerId,
      kind: "puppy_choice",
      status: "planned",
      plannedAt: parisTodayIso(today, 11, 0),
      description: "Commentaire interne confidentiel feed",
    });
    await createTestReservationNote(sql, fixtures, {
      organizationId,
      reservationId: reservation.id,
      ownerId,
      title: noteTitle,
      body: "Note interne confidentielle feed",
    });

    const foreignOrg = await createTestOrganization(sql, fixtures);
    const foreignMother = await createTestAnimal(sql, fixtures, {
      organizationId: foreignOrg,
      ownerId,
      callName: `E2E feed étrangère mère ${fixtures.namespace}`,
    });
    const foreignLitter = await createTestLitter(sql, fixtures, {
      organizationId: foreignOrg,
      ownerId,
      motherId: foreignMother,
      name: `E2E feed litter étrangère ${label}`,
    });
    await createPlannedLitterCareTask(sql, fixtures, {
      organizationId: foreignOrg,
      ownerId,
      litterId: foreignLitter,
      day: today,
      title: foreignLitterTitle,
    });
    await createTestReproductiveCycle(sql, fixtures, {
      organizationId: foreignOrg,
      ownerId,
      motherId: foreignMother,
      status: "planned",
      startedOn: today,
      notes: "secret foreign cycle",
    });
    const foreignScenario = await createTestAdopterAppointmentReadyScenario(
      sql,
      fixtures,
      {
        organizationId: foreignOrg,
        ownerId,
        displayName: foreignContactName,
      },
    );
    const foreignReservation = getAdopterFixtureReservation(
      fixtures,
      foreignScenario.journey.id,
    )!;
    await createTestReservationAppointment(sql, fixtures, {
      organizationId: foreignOrg,
      reservationId: foreignReservation.id,
      ownerId,
      kind: "adoption",
      status: "planned",
      plannedAt: parisTodayIso(today, 16, 0),
    });

    const beforeFeeds = Number(
      sql(`select count(*)::text from public.organization_calendar_feeds`),
    );
    const beforeTasks = Number(
      sql(`select count(*)::text from public.litter_care_tasks`),
    );
    const beforeCycles = Number(
      sql(`select count(*)::text from public.reproductive_cycles`),
    );
    const beforeEvents = Number(sql(`select count(*)::text from public.events`));

    await login(page);
    await page.goto("/calendar");
    const panel = page.locator("[data-calendar-feed-panel]");
    await expect(panel.getByRole("heading", { name: "Abonnement calendrier externe" })).toBeVisible();
    await expect(panel.getByRole("checkbox", { name: "Portées" })).toBeVisible();
    await expect(panel.getByRole("checkbox", { name: "Cheptel — reproduction" })).toBeVisible();
    await expect(panel.getByRole("checkbox", { name: "Rendez-vous adoptants" })).toBeVisible();
    await expect(
      panel.getByText(/inclut le nom du contact/),
    ).toBeVisible();

    await panel.getByRole("button", { name: "Créer un lien d’abonnement" }).click();
    const urlInput = panel.locator("[data-calendar-feed-url]");
    await expect(urlInput).toBeVisible();
    const feedUrl = await urlInput.inputValue();
    expect(feedUrl).toMatch(/^http:\/\/127\.0\.0\.1:3100\/calendar\/feed\/[A-Za-z0-9_-]{43}$/);
    expect(feedUrl).not.toContain("attacker.invalid");
    expect(feedUrl).not.toMatch(/x-forwarded-host/i);
    const token = feedUrl.split("/calendar/feed/")[1]!;
    expect(feedUrl).toBe(`http://127.0.0.1:3100/calendar/feed/${token}`);
    await expect(
      panel.getByText("Ce lien ne sera pas réaffiché après rechargement de la page."),
    ).toBeVisible();
    await panel.getByRole("button", { name: "Copier le lien" }).click();

    const feedRow = JSON.parse(
      sql(`
        select json_build_object(
          'id', id::text,
          'token_hash', token_hash,
          'token_hint', token_hint,
          'revision_no', revision_no
        )::text
        from public.organization_calendar_feeds
        where organization_id = ${q(organizationId)}::uuid
          and revoked_at is null
        limit 1
      `),
    ) as { id: string; token_hash: string; token_hint: string; revision_no: number };
    fixtures.register("organization_calendar_feeds", feedRow.id);
    expect(feedRow.token_hash).toBe(
      createHash("sha256").update(token, "utf8").digest("hex"),
    );
    expect(feedRow.token_hash).not.toContain(token);
    expect(JSON.stringify(feedRow)).not.toContain(token);

    await page.reload();
    await expect(page.locator("[data-calendar-feed-panel]")).toBeVisible();
    await expect(page.locator("[data-calendar-feed-url]")).toHaveCount(0);
    await expect(page.getByText(`…${feedRow.token_hint}`)).toBeVisible();
    await expect(page.getByText(token)).toHaveCount(0);

    const anon = await browser.newContext();
    const anonPage = await anon.newPage();
    const feedResponse = await anonPage.request.get(feedUrl);
    expect(feedResponse.status()).toBe(200);
    expect(feedResponse.headers()["content-type"]).toBe("text/calendar; charset=utf-8");
    expect(feedResponse.headers()["content-disposition"]).toBe(
      'inline; filename="calendrier-elevage.ics"',
    );
    expect(feedResponse.headers()["cache-control"]).toBe("private, no-store, max-age=0");
    expect(feedResponse.url()).not.toContain("/login");
    const ics = await feedResponse.text();
    const unfolded = unfoldICalendar(ics);
    expect(unfolded).toContain(litterTitle);
    expect(unfolded).toContain(contactName);
    expect(unfolded).toContain(`UID:${expectedCycleUid(cycleId)}`);
    expect(unfolded).toContain("REFRESH-INTERVAL;VALUE=DURATION:PT1H");
    for (const secret of [
      foreignLitterTitle,
      foreignContactName,
      noteTitle,
      cycleNotes,
      token,
      taskId,
      appointment.id,
      cycleId,
      "Commentaire interne confidentiel feed",
      "secret foreign cycle",
    ]) {
      expect(unfolded).not.toContain(secret);
    }

    const unknownResponse = await anonPage.request.get(
      "http://127.0.0.1:3100/calendar/feed/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    );
    expect(unknownResponse.status()).toBe(404);
    const unknownBody = await unknownResponse.text();

    await page.getByRole("button", { name: "Modifier les sources" }).click();
    await page.getByRole("checkbox", { name: "Cheptel — reproduction" }).uncheck();
    await page.getByRole("checkbox", { name: "Rendez-vous adoptants" }).uncheck();
    await page.getByRole("button", { name: "Enregistrer les sources" }).click();
    await expect(page.getByRole("button", { name: "Modifier les sources" })).toBeVisible();
    await expect(
      page.locator("[data-calendar-feed-panel]").getByText("Portées", { exact: true }),
    ).toBeVisible();

    const filtered = await anonPage.request.get(feedUrl);
    expect(filtered.status()).toBe(200);
    const filteredIcs = unfoldICalendar(await filtered.text());
    expect(filteredIcs).toContain(litterTitle);
    expect(filteredIcs).not.toContain(contactName);
    expect(filteredIcs).not.toContain(`UID:${expectedCycleUid(cycleId)}`);

    await page.getByRole("button", { name: "Modifier les sources" }).click();
    await page.getByRole("checkbox", { name: "Cheptel — reproduction" }).check();
    await page.getByRole("checkbox", { name: "Rendez-vous adoptants" }).check();
    await page.getByRole("button", { name: "Enregistrer les sources" }).click();
    await expect(page.getByRole("button", { name: "Modifier les sources" })).toBeVisible();

    const restored = unfoldICalendar(await (await anonPage.request.get(feedUrl)).text());
    expect(restored).toContain(litterTitle);
    expect(restored).toContain(contactName);
    expect(restored).toContain(`UID:${expectedCycleUid(cycleId)}`);

    const movedDay = formatLitterJournalBusinessDate(
      new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
    );
    sql(`
      update public.litter_care_tasks
      set planned_for = ${q(movedDay)}::date, revision_no = revision_no + 1
      where id = ${q(taskId)}::uuid;
      update public.reproductive_cycles
      set started_on = ${q(movedDay)}::date
      where id = ${q(cycleId)}::uuid;
    `);
    const movedIcs = unfoldICalendar(await (await anonPage.request.get(feedUrl)).text());
    expect(movedIcs).toContain(litterTitle);
    expect(movedIcs).toContain(movedDay.replaceAll("-", ""));
    expect(movedIcs).toContain(`UID:${expectedCycleUid(cycleId)}`);

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Générer un nouveau lien" }).click();
    const newUrlInput = page.locator("[data-calendar-feed-url]");
    await expect(newUrlInput).toBeVisible();
    const newFeedUrl = await newUrlInput.inputValue();
    expect(newFeedUrl).not.toBe(feedUrl);
    expect(newFeedUrl).toMatch(/^http:\/\/127\.0\.0\.1:3100\/calendar\/feed\/[A-Za-z0-9_-]{43}$/);
    expect(newFeedUrl).not.toContain("attacker.invalid");
    const newToken = newFeedUrl.split("/calendar/feed/")[1]!;
    const newFeedRow = JSON.parse(
      sql(`
        select json_build_object('id', id::text)::text
        from public.organization_calendar_feeds
        where organization_id = ${q(organizationId)}::uuid
          and revoked_at is null
        limit 1
      `),
    ) as { id: string };
    fixtures.register("organization_calendar_feeds", newFeedRow.id);

    const oldAfterRotate = await anonPage.request.get(feedUrl);
    expect(oldAfterRotate.status()).toBe(404);
    const oldAfterRotateBody = await oldAfterRotate.text();
    expect(oldAfterRotateBody).toBe(unknownBody);

    const newFeedResponse = await anonPage.request.get(newFeedUrl);
    expect(newFeedResponse.status()).toBe(200);
    expect(unfoldICalendar(await newFeedResponse.text())).toContain(litterTitle);

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Révoquer le lien" }).click();
    await expect(
      page.getByRole("button", { name: "Créer un lien d’abonnement" }),
    ).toBeVisible();
    const revokedResponse = await anonPage.request.get(newFeedUrl);
    expect(revokedResponse.status()).toBe(404);
    expect(await revokedResponse.text()).toBe(unknownBody);
    expect(await revokedResponse.text()).not.toContain(newToken);

    const exportResponse = await page.request.get("/calendar/export");
    expect(exportResponse.status()).toBe(200);
    expect(exportResponse.headers()["content-disposition"]).toBe(
      'attachment; filename="calendrier-elevage.ics"',
    );

    for (const role of ["member", "viewer"] as const) {
      setOwnerRole(role);
      await page.goto("/calendar");
      await expect(page.locator("[data-calendar-feed-panel]")).toHaveCount(0);
      await expect(page.getByText("Calendrier de l’élevage")).toBeVisible();
      if (role === "viewer") {
        await expect(page.getByText(litterTitle)).toBeVisible();
      }
      restoreOwnerRole();
    }

    expect(Number(sql(`select count(*)::text from public.litter_care_tasks`))).toBe(
      beforeTasks,
    );
    expect(
      Number(sql(`select count(*)::text from public.reproductive_cycles`)),
    ).toBe(beforeCycles);
    expect(Number(sql(`select count(*)::text from public.events`))).toBe(beforeEvents);

    const allFeedIds = JSON.parse(
      sql(`
        select coalesce(json_agg(id::text), '[]'::json)::text
        from public.organization_calendar_feeds
        where organization_id = ${q(organizationId)}::uuid
          and id in (${q(feedRow.id)}::uuid, ${q(newFeedRow.id)}::uuid)
      `),
    ) as string[];
    for (const id of allFeedIds) {
      if (!fixtures.has("organization_calendar_feeds", id)) {
        fixtures.register("organization_calendar_feeds", id);
      }
    }
    expect(feedCounts([feedRow.id, newFeedRow.id])).toBe(2);
    expect(
      Number(sql(`select count(*)::text from public.organization_calendar_feeds`)) -
        beforeFeeds,
    ).toBe(2);
    await anon.close();
  });
});
