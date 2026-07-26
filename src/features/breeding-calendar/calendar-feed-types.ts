export type OrganizationCalendarFeedMetadata = {
  id: string;
  organizationId: string;
  tokenHint: string;
  includeLitterCare: boolean;
  includeReproductiveCycle: boolean;
  includeAdopterAppointment: boolean;
  revisionNo: number;
  createdAt: string;
  updatedAt: string;
  revokedAt: string | null;
};

export type CalendarFeedActionErrorCode =
  | "unauthenticated"
  | "forbidden"
  | "invalid_input"
  | "no_sources_selected"
  | "stale_revision"
  | "feed_not_found"
  | "feed_revoked"
  | "organization_unavailable"
  | "conflict"
  | "database_error";
