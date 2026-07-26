"use server";

import {
  createOrRotateOrganizationCalendarFeed,
  revokeOrganizationCalendarFeed,
  updateOrganizationCalendarFeedSources,
  type CreateOrRotateCalendarFeedResult,
  type RevokeCalendarFeedResult,
  type UpdateCalendarFeedSourcesResult,
} from "@/features/breeding-calendar/calendar-feed-service";
import type { CalendarFeedSources } from "@/features/breeding-calendar/calendar-feed-token";

export async function createOrRotateCalendarFeedAction(input: {
  sources: CalendarFeedSources;
}): Promise<CreateOrRotateCalendarFeedResult> {
  return createOrRotateOrganizationCalendarFeed({
    sources: input.sources,
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
