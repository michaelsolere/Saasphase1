import type { Database } from "@/types/database.types";

type ApplicationOverviewRow =
  Database["public"]["Views"]["application_overview"]["Row"];

export type ApplicationOverview = Pick<
  ApplicationOverviewRow,
  | "id"
  | "contact_display_name"
  | "contact_email"
  | "contact_phone"
  | "desired_sex_preference"
  | "project_description"
  | "status"
  | "public_form_name"
  | "public_form_slug"
  | "submitted_at"
  | "created_at"
>;

export type ApplicationFilter = "to_review" | "all";
