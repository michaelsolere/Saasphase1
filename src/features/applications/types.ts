import type { Database } from "@/types/database.types";

type ApplicationOverviewRow =
  Database["public"]["Views"]["application_overview"]["Row"];

export type ApplicationOverview = Pick<
  ApplicationOverviewRow,
  | "id"
  | "contact_id"
  | "contact_display_name"
  | "contact_email"
  | "contact_phone"
  | "desired_sex_preference"
  | "project_description"
  | "status"
  | "public_form_name"
  | "public_form_slug"
  | "has_started_adopter_journey"
  | "submitted_at"
  | "created_at"
> & {
  decision_note_preview?: string | null;
  pre_reservation_progress_label?: string | null;
};

export type ApplicationDetail = Pick<
  ApplicationOverviewRow,
  | "id"
  | "organization_id"
  | "contact_id"
  | "contact_display_name"
  | "contact_email"
  | "contact_phone"
  | "desired_sex_preference"
  | "project_description"
  | "status"
  | "public_form_name"
  | "public_form_slug"
  | "has_started_adopter_journey"
  | "species"
  | "breed"
  | "submitted_at"
  | "created_at"
>;

export type ApplicationFilter =
  | "attention"
  | "to_validate"
  | "validated"
  | "unsuccessful"
  | "all";
