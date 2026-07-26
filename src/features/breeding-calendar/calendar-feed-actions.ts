"use server";

import { headers } from "next/headers";

import {
  createOrRotateOrganizationCalendarFeed,
  revokeOrganizationCalendarFeed,
  updateOrganizationCalendarFeedSources,
  type CreateOrRotateCalendarFeedResult,
  type RevokeCalendarFeedResult,
  type UpdateCalendarFeedSourcesResult,
} from "@/features/breeding-calendar/calendar-feed-service";
import type { CalendarFeedSources } from "@/features/breeding-calendar/calendar-feed-token";

async function resolveRequestOrigin() {
  const headerStore = await headers();
  const host =
    headerStore.get("x-forwarded-host") ?? headerStore.get("host") ?? "127.0.0.1:3000";
  const proto = headerStore.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

export async function createOrRotateCalendarFeedAction(input: {
  sources: CalendarFeedSources;
}): Promise<CreateOrRotateCalendarFeedResult> {
  return createOrRotateOrganizationCalendarFeed({
    sources: input.sources,
    origin: await resolveRequestOrigin(),
  });
}

export async function updateCalendarFeedSourcesAction(input: {
  feedId: string;
  expectedRevisionNo: number;
  sources: CalendarFeedSources;
}): Promise<UpdateCalendarFeedSourcesResult> {
  return updateOrganizationCalendarFeedSources(input);
}

export async function revokeCalendarFeedAction(input: {
  feedId: string;
  expectedRevisionNo: number;
}): Promise<RevokeCalendarFeedResult> {
  return revokeOrganizationCalendarFeed(input);
}
