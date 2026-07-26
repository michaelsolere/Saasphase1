import { expect, test } from "@playwright/test";

import { buildLitterCareICalendar } from "../../src/features/litter-journal/litter-care-icalendar";
import type { LitterCareTaskSummary } from "../../src/features/litter-journal/litter-care-tasks";

const litterId = "11111111-1111-4111-8111-111111111111";
const taskId = "22222222-2222-4222-8222-222222222222";
const generatedAt = new Date("2026-07-25T12:34:56Z");

function task(overrides: Partial<LitterCareTaskSummary> = {}): LitterCareTaskSummary {
  return { id: taskId, litterId, source: "manual", litterPlanItemId: null, organizationTemplateId: null, systemTemplateCode: null, occurrenceNo: 1, category: "veterinary", targetScope: "litter", title: "Visite vétérinaire", description: "Note privée", anchorType: null, anchorDate: null, offsetDays: null, itemKind: "task", priority: "normal", suggestedFor: null, suggestedLocalTime: null, plannedFor: "2026-01-15", scheduledLocalTime: null, scheduleTimezoneName: "Europe/Paris", suggestedStartsOn: null, suggestedStartsLocalTime: null, suggestedEndsOn: null, suggestedEndsLocalTime: null, retainedStartsOn: null, retainedStartsLocalTime: null, retainedEndsOn: null, retainedEndsLocalTime: null, scheduleSource: "suggested", isScheduleLocked: false, scheduleLockedAt: null, scheduleLockedBy: null, revisionNo: 3, status: "planned", resolvedAt: null, resolvedTimezoneName: null, resolvedBy: null, resolutionNote: "Ne pas exporter", createdAt: "2026-01-01T00:00:00Z", ...overrides };
}
function calendar(tasks: readonly LitterCareTaskSummary[], filters = { kind: "all" as const, category: "all" as const }) { return buildLitterCareICalendar({ litterName: "Portée Étoile", tasks, filters, generatedAt }); }

test("sérialise un calendrier vide avec CRLF", () => {
  const value = calendar([]);
  expect(value).toContain("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n");
  expect(value).toMatch(/END:VCALENDAR\r\n$/);
  expect(value.replaceAll("\r\n", "")).not.toContain("\n");
});

test("projette les événements ponctuels, DST et fuseaux flottants sans donnée sensible", () => {
  const winter = calendar([task({ scheduledLocalTime: "09:30", plannedFor: "2026-01-15" })]);
  const summer = calendar([task({ scheduledLocalTime: "09:30", plannedFor: "2026-07-15" })]);
  const floating = calendar([task({ scheduledLocalTime: "09:30", scheduleTimezoneName: "Invalid/Zone" })]);
  const allDay = calendar([task()]);
  expect(winter).toContain("DTSTART:20260115T083000Z");
  expect(summer).toContain("DTSTART:20260715T073000Z");
  expect(floating).toContain("DTSTART:20260115T093000\r\n");
  expect(floating).not.toContain("DTSTART:20260115T093000Z");
  expect(allDay).toContain("DTSTART;VALUE=DATE:20260115");
  expect(allDay).toContain("SEQUENCE:3");
  expect(allDay).toContain("CATEGORIES:veterinary");
  expect(allDay).not.toContain("Note privée"); expect(allDay).not.toContain("Ne pas exporter"); expect(allDay).not.toContain(taskId); expect(allDay).not.toContain(litterId);
  expect(allDay).not.toContain("VALARM");
  expect(allDay).not.toContain("X-SAAS-ELEVAGE-REMINDER");
});

test("projette chaque fenêtre une seule fois avec une borne de fin exclusive", () => {
  const oneDay = calendar([task({ itemKind: "window", plannedFor: null, retainedStartsOn: "2026-01-15", retainedEndsOn: "2026-01-15" })]);
  const multiDay = calendar([task({ itemKind: "window", plannedFor: null, retainedStartsOn: "2026-01-15", retainedEndsOn: "2026-01-17" })]);
  const timed = calendar([task({ itemKind: "window", plannedFor: null, retainedStartsOn: "2026-07-15", retainedStartsLocalTime: "08:00", retainedEndsOn: "2026-07-17", retainedEndsLocalTime: "18:00" })]);
  const partial = calendar([task({ itemKind: "window", plannedFor: null, retainedStartsOn: "2026-01-15", retainedStartsLocalTime: "08:00", retainedEndsOn: "2026-01-17" })]);
  expect(oneDay.match(/BEGIN:VEVENT/g)).toHaveLength(1); expect(oneDay).toContain("DTEND;VALUE=DATE:20260116");
  expect(multiDay).toContain("DTEND;VALUE=DATE:20260118");
  expect(timed).toContain("DTSTART:20260715T060000Z"); expect(timed).toContain("DTEND:20260717T160000Z");
  expect(partial).toContain("DTSTART;VALUE=DATE:20260115"); expect(partial).toContain("DESCRIPTION:Heure de début retenue : 08:00.");
});

test("filtre, échappe, replie en UTF-8 et ne mute pas les tâches", () => {
  const longTitle = `Titre, ; \\ ligne\n${"é".repeat(90)}`;
  const included = task({ itemKind: "recurring_task", category: "other", title: longTitle });
  const excluded = task({ id: "33333333-3333-4333-8333-333333333333", status: "done", title: "Terminé" });
  const cancelled = task({ id: "44444444-4444-4444-8444-444444444444", status: "cancelled", title: "Annulé" });
  const notApplicable = task({ id: "55555555-5555-4555-8555-555555555555", status: "not_applicable", title: "Sans objet" });
  const input = [included, excluded, cancelled, notApplicable]; const before = JSON.stringify(input);
  const value = calendar(input, { kind: "recurring_task", category: "other" });
  expect(value).toContain("Titre\\, \\; \\\\ ligne\\n"); expect(value).not.toContain("Terminé"); expect(value).not.toContain("Annulé"); expect(value).not.toContain("Sans objet"); expect(JSON.stringify(input)).toBe(before);
  expect(value.match(/BEGIN:VEVENT/g)).toHaveLength(1);
  for (const line of value.split("\r\n")) expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(75);
  expect(calendar([included])).toContain("UID:"); expect(calendar([included])).toBe(calendar([included]));
});
