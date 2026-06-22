import type { Database } from "@/types/database.types";

type ContactOverviewRow =
  Database["public"]["Views"]["contact_overview"]["Row"];

export type ContactOverview = Pick<
  ContactOverviewRow,
  | "id"
  | "display_name"
  | "email"
  | "phone"
  | "active_roles"
  | "created_at"
>;
