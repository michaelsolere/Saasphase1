import type { LitterCareTaskSummary } from "@/features/litter-journal/litter-care-tasks-core";

export const BREEDING_CALENDAR_SOURCE_TYPES = ["litter_care"] as const;
export type BreedingCalendarSourceType = (typeof BREEDING_CALENDAR_SOURCE_TYPES)[number];
export type BreedingCalendarEvent = { identitySource: "litter-care"; sourceType: BreedingCalendarSourceType; category: string; title: string; contextLabel: string; startsOn: string; startsLocalTime: string | null; endsOn: string | null; endsLocalTime: string | null; timezoneName: string | null; isAllDay: boolean; revision: number; lastModifiedAt: string; sourceRecordId: string; litterId: string; itemKind: LitterCareTaskSummary["itemKind"] };
export type OrganizationBreedingCalendar = { organizationId: string; events: BreedingCalendarEvent[]; litterNames: Record<string, string> };
